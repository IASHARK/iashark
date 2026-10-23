"use strict";
// EMPREINTE QUOTIDIENNE DES PARIS PUBLIES (historique-public, 29/09/2026).
//
// Chaque jour, le pipeline publie dans preuves/empreintes-paris.json une
// empreinte SHA-256 des paris du jour, chainee a la precedente (comme le
// registre du test cache, iashark-preuve/registre). Modifier un pari apres coup,
// ou retirer un maillon, casse la chaine : n'importe qui peut le verifier.
//
// Secret des paris payants : l'empreinte des paris d'un jour est calculee avec un
// SEL propre a ce jour (HMAC du secret du pipeline). Sans le sel, personne ne
// peut retrouver les paris en essayant toutes les combinaisons avant les matchs.
// Le sel est REVELE (sel_revele) une fois le dernier match des paris de ce jour
// commence depuis 3 heures (avant le 23/10/2026 : deux jours plus tard, meme si un
// match de ce jour n'etait pas encore joue). Le sel n'entre pas dans l'empreinte du
// maillon : le reveler ne change rien a la chaine.
//
// Un jour dont un pari est encore masque (pas relu depuis l'archive) n'est pas
// empreint : jamais une empreinte sur des paris incomplets.
//
// FORMAT 3 (integrite des empreintes, 23/10/2026). Constats de l'enquete du 23/10 :
// le 19/10, la version du moteur de 4 paris a ete reecrite avant leur coup d'envoi
// (lib/pick-freeze.js#alignPendingPrediction) et la journee a ete re-scellee le
// lendemain ; la cote revenait de predictions_archive en texte (« 1.2 ») au lieu
// d'un nombre ; le verificateur ne regardait que le dernier maillon de chaque jour.
// Desormais :
//  - cote et chance sont toujours ecrites comme des nombres dans l'empreinte, quelle
//    que soit la source (fichier, archive) ;
//  - chaque pari est scelle UNE fois, le jour de sa publication, avant le coup
//    d'envoi de tous les paris du maillon. Le maillon liste ses matchs (fixtures) :
//    il se verifie seul. Des paris ajoutes plus tard le meme jour (avant leur coup
//    d'envoi) forment un maillon « complement » qui ne touche pas aux paris deja
//    scelles. Jamais de re-scelle la veille ou le lendemain ;
//  - un pari deja scelle qui change vraiment avant son coup d'envoi (exception au gel,
//    buteur absent de la composition) ajoute un maillon « correction » explicite
//    (motif, heure, empreinte salee de l'ancien pari et du nouveau), jamais un
//    remplacement ; le detail (ancien, nouveau) est dans preuves/corrections.json ;
//  - le verificateur controle CHAQUE maillon, sur l'etat des paris a l'heure du
//    maillon (corrections posterieures defaites, preuves/corrections.json).
// Les maillons d'avant (sans champ format) gardent leur calcul : ils ne sont pas
// reecrits. Leur cote a pu etre empreinte en nombre ou en texte selon la source :
// le verificateur essaie les deux (la valeur doit etre la meme).

const crypto = require("crypto");

const GENESE = "0".repeat(64);
// Version 2 (30/09/2026, contre-controle de l'avocat du diable) : la probabilite
// annoncee du pari (model_probability) entre dans l'empreinte. Aucune chaine en
// version 1 n'a ete publiee (preuves/ n'existait pas encore).
// Version 3 (23/10/2026) : maillons au format 3 (voir plus haut).
const VERSION = 3;
const FORMAT = 3;
// Marge apres le coup d'envoi du dernier match d'un jour avant de reveler son sel.
const MARGE_REVELATION_MS = 3 * 3600000;
// Champs d'un pari empreint : tous publics une fois le match joue (historique.json).
// model_probability : la chance annoncee ne peut plus etre retouchee apres coup
// sans casser la chaine (un 55 % devenu 70 % se verrait).
const CHAMPS = ["fixture_id", "home", "away", "prediction", "cote", "model_probability", "market", "moteur", "moteur_version", "published_at", "kickoff_at"];

const EXPLICATION = "Empreinte SHA-256 des paris publies chaque jour, chainee a la precedente. Un pari modifie apres coup ou un maillon retire casse la chaine. "
  + "empreinte_paris = SHA-256(sel + saut de ligne + JSON canonique des paris, tries par fixture_id, champs " + CHAMPS.join(", ") + "). "
  + "Depuis le format 3 (23/10/2026) : cote et chance en nombres, chaque maillon liste ses matchs (fixtures) et se verifie seul, "
  + "un pari est scelle une seule fois avant son coup d'envoi, une vraie correction ajoute un maillon « correction » (detail dans preuves/corrections.json). "
  + "Le sel d'un jour est revele 3 heures apres le coup d'envoi du dernier match de ses paris.";

function sha(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

// JSON canonique : cles triees, sans espaces. Meme entree -> meme texte.
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

function sel(secret, jour) {
  return crypto.createHmac("sha256", String(secret)).update("iashark-empreinte-paris|" + jour).digest("hex");
}

// Nombre ou null (« 1.2 » -> 1.2, « 1,2 » -> 1.2, « » -> null).
function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
// Heure ISO normalisee (« 2026-10-21T19:00:00+00:00 » -> « 2026-10-21T19:00:00.000Z »).
function heure(v) {
  if (v === null || v === undefined || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
}
function ms(v) { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; }

function estPariDuJour(p, jour) {
  return !!p && p.fixture_id != null && (p.type || "single") === "single" && String(p.date || "").slice(0, 10) === jour;
}

// -> { paris, incomplet, fixtures, premierCoupEnvoi, dernierCoupEnvoi } : paris simples
// publies ce jour (date = jour de publication).
// opts.format : 3 (defaut) normalise cote/chance en nombres et heures en ISO ; 2 = valeurs
// telles quelles (maillons d'avant le 23/10/2026). opts.fixtures : seulement ces matchs.
function parisDuJour(predictions, jour, opts) {
  opts = opts || {};
  const format = opts.format === 2 ? 2 : FORMAT;
  const filtre = Array.isArray(opts.fixtures) ? opts.fixtures.map(Number) : null;
  const du = (predictions || []).filter(function (p) {
    return estPariDuJour(p, jour) && (!filtre || filtre.indexOf(Number(p.fixture_id)) !== -1);
  });
  const incomplet = du.some(function (p) { return p.redacted === true || p.__masque === true || !p.prediction; });
  const paris = du.map(function (p) {
    const o = {};
    CHAMPS.forEach(function (k) { o[k] = p[k] === undefined ? null : p[k]; });
    o.fixture_id = Number(o.fixture_id);
    if (format >= 3) {
      o.cote = nombre(o.cote);
      o.model_probability = nombre(o.model_probability);
      o.published_at = heure(o.published_at);
      o.kickoff_at = heure(o.kickoff_at);
    }
    return o;
  }).sort(function (a, b) { return a.fixture_id - b.fixture_id; });
  const kos = paris.map(function (p) { return ms(p.kickoff_at); }).filter(function (t) { return t !== null; });
  return {
    paris: paris,
    incomplet: incomplet,
    fixtures: paris.map(function (p) { return p.fixture_id; }),
    premierCoupEnvoi: kos.length ? Math.min.apply(null, kos) : null,
    dernierCoupEnvoi: kos.length ? Math.max.apply(null, kos) : null,
    sansCoupEnvoi: paris.length - kos.length,
  };
}

function empreinteParis(paris, selDuJour) { return sha(selDuJour + "\n" + canon(paris)); }

// Les champs absents (maillons d'avant le format 3) ne changent rien au calcul.
function empreinteMaillon(m) {
  return sha(m.precedente + "\n" + canon({
    n: m.n, jour: m.jour, genere_le: m.genere_le, nb_paris: m.nb_paris, empreinte_paris: m.empreinte_paris,
    format: m.format, type: m.type, fixtures: m.fixtures, premier_coup_envoi: m.premier_coup_envoi, correction: m.correction,
  }));
}

function vide() {
  return { version: VERSION, explication: EXPLICATION, chaine: [] };
}

// Jour de Paris d'une heure ISO.
function jourDeParis(iso) {
  const t = ms(iso);
  if (t === null) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
  const g = function (type) { return parts.find(function (x) { return x.type === type; }).value; };
  return g("year") + "-" + g("month") + "-" + g("day");
}

// ETAT DES PARIS A UNE HEURE DONNEE : les corrections posterieures a `instant` sont
// defaites (champs `ancien` remis). corrections : [{ fixture_id, le | au_plus_tard,
// ancien, masque }] (preuves/corrections.json) ; les corrections portees par les lignes
// d'historique (p.corrections) sont lues aussi. Une correction dont les valeurs sont
// encore masquees rend le pari non verifiable (__masque) : jamais devine.
function heureCorrection(c) { return ms(c && (c.le || c.au_plus_tard)); }
function etatAu(predictions, corrections, instant) {
  const t0 = ms(instant);
  const parFixture = {};
  const vues = {};
  function ajouterC(fid, c) {
    const t = heureCorrection(c);
    if (fid == null || t === null) return;
    const cle = String(fid) + "|" + t;
    if (vues[cle]) return;
    vues[cle] = true;
    (parFixture[String(fid)] = parFixture[String(fid)] || []).push({ t: t, c: c });
  }
  (corrections || []).forEach(function (c) { if (c) ajouterC(c.fixture_id, c); });
  (predictions || []).forEach(function (p) {
    if (p && Array.isArray(p.corrections)) p.corrections.forEach(function (c) { ajouterC(p.fixture_id, c); });
  });
  return (predictions || []).map(function (p) {
    const liste = p && p.fixture_id != null ? parFixture[String(p.fixture_id)] : null;
    if (!liste || t0 === null) return p;
    const apres = liste.filter(function (x) { return x.t > t0; }).sort(function (a, b) { return b.t - a.t; });
    if (!apres.length) return p;
    const copie = Object.assign({}, p);
    apres.forEach(function (x) {
      if (x.c.masque === true || !x.c.ancien) { copie.__masque = true; return; }
      Object.keys(x.c.ancien).forEach(function (k) { copie[k] = x.c.ancien[k]; });
    });
    return copie;
  });
}

function maillonsDuJour(registre, jour) { return (registre.chaine || []).filter(function (m) { return m.jour === jour; }); }
function scellesFormat3(registre, jour) {
  const ids = {};
  maillonsDuJour(registre, jour).forEach(function (m) { if (m.format >= 3) (m.fixtures || []).forEach(function (f) { ids[String(f)] = true; }); });
  return ids;
}

function pousser(registre, champs) {
  const chaine = registre.chaine;
  const m = Object.assign({ n: chaine.length + 1 }, champs);
  m.precedente = chaine.length ? chaine[chaine.length - 1].empreinte : GENESE;
  m.empreinte = empreinteMaillon(m);
  chaine.push(m);
  registre.version = VERSION;
  registre.explication = EXPLICATION;
  return m;
}

// Scelle les paris de `jour` pas encore scelles. -> { ajoute, raison, maillon }
// opts : { aujourdhui } (jour de Paris du run ; defaut : jour de Paris de genereLe).
// Regles (format 3) :
//  - seulement le jour meme (jamais la veille ou le lendemain) ;
//  - jamais un pari masque, jamais apres le coup d'envoi d'un des paris du maillon ;
//  - un pari deja scelle n'est jamais re-scelle : seuls les paris nouveaux du jour
//    forment un maillon « complement » ;
//  - un jour deja scelle a l'ancien format n'est plus complete (on ne sait pas
//    quels paris il couvrait).
function ajouter(registre, jour, predictions, secret, genereLe, opts) {
  opts = opts || {};
  if (!secret) return { ajoute: false, raison: "secret absent" };
  const le = genereLe || new Date().toISOString();
  const aujourdhui = opts.aujourdhui || jourDeParis(le);
  if (jour !== aujourdhui) return { ajoute: false, raison: "jamais re-scelle hors de son jour (" + jour + ", nous sommes le " + aujourdhui + ")" };
  const tous = parisDuJour(predictions, jour);
  if (!tous.paris.length) return { ajoute: false, raison: "aucun pari" };
  if (tous.incomplet) return { ajoute: false, raison: "pari masque non relu" };
  const duJour = maillonsDuJour(registre, jour);
  if (duJour.some(function (m) { return !(m.format >= 3); })) return { ajoute: false, raison: "jour deja scelle (ancien format)" };
  const deja = scellesFormat3(registre, jour);
  const nouveaux = tous.fixtures.filter(function (f) { return !deja[String(f)]; });
  if (!nouveaux.length) return { ajoute: false, raison: "inchange" };
  const lu = parisDuJour(predictions, jour, { fixtures: nouveaux });
  if (lu.premierCoupEnvoi !== null && ms(le) >= lu.premierCoupEnvoi) {
    return { ajoute: false, raison: "un match de ces paris a deja commence (" + new Date(lu.premierCoupEnvoi).toISOString() + ") : jamais scelle apres le coup d'envoi" };
  }
  const m = pousser(registre, {
    jour: jour, genere_le: le, nb_paris: lu.paris.length, empreinte_paris: empreinteParis(lu.paris, sel(secret, jour)),
    format: FORMAT, type: duJour.length ? "complement" : "scelle", fixtures: lu.fixtures,
    premier_coup_envoi: lu.premierCoupEnvoi !== null ? new Date(lu.premierCoupEnvoi).toISOString() : null,
  });
  return { ajoute: true, raison: m.type === "complement" ? "complement" : "nouveau", maillon: m };
}

// VRAIE CORRECTION d'un pari deja scelle, avant son coup d'envoi (exception au gel) :
// maillon « correction » explicite, jamais un remplacement. correction : { fixture_id,
// motif, le, ancien: { champs du pari avant } }. L'empreinte de l'ancien pari et celle
// du nouveau sont salees (rien n'est devinable avant le match). -> { ajoute, raison, maillon }
function corriger(registre, jour, predictions, secret, genereLe, correction) {
  if (!secret) return { ajoute: false, raison: "secret absent" };
  if (!correction || correction.fixture_id == null || !correction.motif || !correction.le || !correction.ancien) return { ajoute: false, raison: "correction incomplete (fixture_id, motif, le, ancien)" };
  const fid = Number(correction.fixture_id);
  if (!scellesFormat3(registre, jour)[String(fid)]) return { ajoute: false, raison: "pari pas encore scelle : le scelle du jour portera la valeur corrigee" };
  const lu = parisDuJour(predictions, jour, { fixtures: [fid] });
  if (lu.paris.length !== 1 || lu.incomplet) return { ajoute: false, raison: "pari corrige introuvable ou masque" };
  const le = genereLe || new Date().toISOString();
  if (lu.premierCoupEnvoi !== null && ms(le) >= lu.premierCoupEnvoi) return { ajoute: false, raison: "coup d'envoi passe : plus aucune correction" };
  const avant = parisDuJour([Object.assign({}, predictions.find(function (p) { return estPariDuJour(p, jour) && Number(p.fixture_id) === fid; }), correction.ancien)], jour);
  const s = sel(secret, jour);
  const m = pousser(registre, {
    jour: jour, genere_le: le, nb_paris: 1, empreinte_paris: empreinteParis(lu.paris, s),
    format: FORMAT, type: "correction", fixtures: [fid],
    premier_coup_envoi: lu.premierCoupEnvoi !== null ? new Date(lu.premierCoupEnvoi).toISOString() : null,
    correction: { fixture_id: fid, motif: String(correction.motif), le: correction.le, ancienne_empreinte: empreinteParis(avant.paris, s) },
  });
  return { ajoute: true, raison: "correction", maillon: m };
}

// Revele le sel des jours dont tous les paris ont commence depuis MARGE_REVELATION_MS.
// Ancien appel revelerSels(registre, secret, jourLimite) garde (jours <= jourLimite).
// Nouvel appel : revelerSels(registre, secret, { predictions, nowMs }).
function revelerSels(registre, secret, limite) {
  let n = 0;
  if (!secret) return 0;
  const parJour = {};
  if (limite && typeof limite === "object") {
    const now = limite.nowMs != null ? limite.nowMs : Date.now();
    registre.chaine.forEach(function (m) {
      if (m.sel_revele || parJour[m.jour] !== undefined) return;
      const lu = parisDuJour(limite.predictions, m.jour, { format: 3 });
      // Jour sorti des donnees, ou pari sans coup d'envoi : on attend (jamais revele trop tot).
      parJour[m.jour] = !!(lu.paris.length && !lu.sansCoupEnvoi && lu.dernierCoupEnvoi !== null && now >= lu.dernierCoupEnvoi + MARGE_REVELATION_MS);
    });
  }
  registre.chaine.forEach(function (m) {
    const ok = limite && typeof limite === "object" ? parJour[m.jour] === true : m.jour <= limite;
    if (!m.sel_revele && ok) { m.sel_revele = sel(secret, m.jour); n++; }
  });
  return n;
}

// Variantes de la cote pour les maillons d'avant le format 3 : telle quelle, nombre, texte.
// La valeur doit etre la meme ; seul son type a pu dependre de la source (fichier ou archive).
function variantesAncienFormat(paris) {
  const enNombre = paris.map(function (p) { return Object.assign({}, p, { cote: nombre(p.cote) }); });
  const enTexte = paris.map(function (p) { const c = nombre(p.cote); return Object.assign({}, p, { cote: c === null ? null : String(c) }); });
  return [paris, enNombre, enTexte];
}

// Rejoue la chaine ; si predictions est fourni, controle aussi CHAQUE maillon dont le
// sel est connu (revele, ou opts.secret pour le pipeline) sur l'etat des paris a
// l'heure du maillon (corrections posterieures defaites : opts.corrections).
// -> { ok, erreurs, avertissements, verifies, non_verifiables }
//  - erreurs : chaine rompue, paris qui ne correspondent plus, maillon format 3 scelle
//    apres un coup d'envoi ;
//  - non_verifiables : journee absente ou incomplete dans les donnees fournies (paris
//    masques, coupee par la limite de historique.json), jamais une alerte ;
//  - avertissements : maillons d'avant le format 3 scelles apres un coup d'envoi.
function verifier(registre, predictions, opts) {
  opts = opts || {};
  const erreurs = [], avertissements = [], verifies = [], nonVerifiables = [];
  let prec = GENESE;
  (registre.chaine || []).forEach(function (m, i) {
    if (m.n !== i + 1) erreurs.push("maillon " + (i + 1) + " : numero " + m.n);
    if (m.precedente !== prec) erreurs.push("maillon " + m.n + " : chaine rompue");
    if (empreinteMaillon(m) !== m.empreinte) erreurs.push("maillon " + m.n + " : empreinte fausse");
    if (m.format >= 3 && m.premier_coup_envoi && ms(m.genere_le) >= ms(m.premier_coup_envoi)) erreurs.push("maillon " + m.n + " (" + m.jour + ") : scelle apres un coup d'envoi");
    prec = m.empreinte;
  });
  if (predictions) {
    (registre.chaine || []).forEach(function (m) {
      const s = m.sel_revele || (opts.secret ? sel(opts.secret, m.jour) : null);
      if (!s) return;
      const etat = etatAu(predictions, opts.corrections, m.genere_le);
      const nv = function (raison) { nonVerifiables.push({ n: m.n, jour: m.jour, raison: raison }); };
      if (m.format >= 3) {
        const lu = parisDuJour(etat, m.jour, { fixtures: m.fixtures });
        if (lu.paris.length !== (m.fixtures || []).length) return nv("paris absents des donnees (" + lu.paris.length + "/" + (m.fixtures || []).length + ")");
        if (lu.incomplet) return nv("pari encore masque");
        if (empreinteParis(lu.paris, s) !== m.empreinte_paris) { erreurs.push("maillon " + m.n + " (" + m.jour + ") : les paris ne correspondent plus a l'empreinte publiee"); return; }
        verifies.push(m.n);
        return;
      }
      const lu = parisDuJour(etat, m.jour, { format: 2 });
      if (!lu.paris.length) return nv("journee absente des donnees");
      if (lu.incomplet) return nv("pari encore masque");
      if (lu.paris.length !== m.nb_paris) return nv("journee incomplete ou maillon partiel (" + lu.paris.length + " paris pour " + m.nb_paris + " scelles)");
      const ok = variantesAncienFormat(lu.paris).some(function (v) { return empreinteParis(v, s) === m.empreinte_paris; });
      if (!ok) { erreurs.push("maillon " + m.n + " (" + m.jour + ") : les paris ne correspondent plus a l'empreinte publiee"); return; }
      verifies.push(m.n);
      if (lu.premierCoupEnvoi !== null && ms(m.genere_le) >= lu.premierCoupEnvoi) avertissements.push("maillon " + m.n + " (" + m.jour + ", ancien format) : scelle apres le premier coup d'envoi de la journee");
    });
  }
  return { ok: !erreurs.length, erreurs: erreurs, avertissements: avertissements, verifies: verifies, non_verifiables: nonVerifiables };
}

// FENETRE DE historique.json EN JOURNEES ENTIERES (23/10/2026) : les `max` lignes les plus
// recentes, plus le reste des journees dont elles ont deja une ligne. Une journee n'est
// jamais coupee en deux par la limite (sinon sa verification publique tombait en echec).
function fenetreJourneesEntieres(predictions, max) {
  const liste = Array.isArray(predictions) ? predictions : [];
  if (liste.length <= max) return liste.slice();
  const jourDe = function (p) { const j = /^(\d{4}-\d{2}-\d{2})/.exec(String((p && p.date) || "")); return j ? j[1] : null; };
  const jours = {};
  liste.slice(0, max).forEach(function (p) { const j = jourDe(p); if (j) jours[j] = true; });
  return liste.filter(function (p, i) { return i < max || (jourDe(p) !== null && jours[jourDe(p)] === true); });
}

module.exports = {
  GENESE: GENESE, VERSION: VERSION, FORMAT: FORMAT, CHAMPS: CHAMPS, EXPLICATION: EXPLICATION, MARGE_REVELATION_MS: MARGE_REVELATION_MS,
  canon: canon, sel: sel, nombre: nombre, parisDuJour: parisDuJour, empreinteParis: empreinteParis, empreinteMaillon: empreinteMaillon,
  etatAu: etatAu, jourDeParis: jourDeParis, fenetreJourneesEntieres: fenetreJourneesEntieres, vide: vide, ajouter: ajouter, corriger: corriger, revelerSels: revelerSels, verifier: verifier,
};
