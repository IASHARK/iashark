"use strict";
// EMPREINTE QUOTIDIENNE DES PARIS PUBLIES (historique-public, 29/09/2026).
//
// Chaque jour, le pipeline publie dans preuves/empreintes-paris.json une
// empreinte SHA-256 des paris du jour, chainee a la precedente (comme le
// registre du test cache, iashark-preuve/registre). Modifier un pari scelle apres coup
// casse son empreinte : n'importe qui peut le verifier.
// LIMITE (N5, mathematicien, 23/10) : seuls les maillons suivis d'un maillon deja publie sont
// proteges par la chaine. Les derniers maillons peuvent etre retires ou reecrits, avec les suivants
// rechaines, sans que la chaine seule le montre : seules les versions deja publiees (historique Git)
// le montrent.
//
// Secret des paris payants : l'empreinte des paris d'un jour est calculee avec un
// SEL propre a ce jour (HMAC du secret du pipeline). Sans le sel, personne ne
// peut retrouver les paris en essayant toutes les combinaisons avant les matchs.
// Le sel est REVELE (sel_revele) une fois le dernier match des paris de ce jour
// commence depuis 3 heures ET tous les paris de ce jour regles (avant le 23/10/2026 :
// deux jours plus tard, meme si un match de ce jour n'etait pas encore joue). Le sel
// n'entre pas dans l'empreinte du maillon : le reveler ne change rien a la chaine.
// REGLEMENT, PAS L'HEURE (avocat du diable, 23/10) : un match decale garde l'heure
// d'origine dans kickoff_at ; avec le sel public, son pari encore en attente se
// retrouvait en essayant les quelques pronostics possibles. Le sel n'est donc revele,
// et la journee figee en clair (preuves/paris-scelles/), que si CHAQUE pari du jour est
// public au sens de lib/journal-corrections.js#pariPublic (regle).
//
// Un pari encore masque (pas relu depuis l'archive) n'est jamais empreint : il attend
// le run suivant, ou est declare non scelle.
//
// FORMAT 3 (integrite des empreintes, 23/10/2026). Constats de l'enquete du 23/10 :
// le 19/10, la version du moteur de 4 paris a ete reecrite avant leur coup d'envoi
// (lib/pick-freeze.js#alignPendingPrediction) et la journee a ete re-scellee le
// lendemain ; la cote revenait de predictions_archive en texte (« 1.2 ») au lieu
// d'un nombre ; le verificateur ne regardait que le dernier maillon de chaque jour.
// Desormais :
//  - cote et chance sont toujours ecrites comme des nombres dans l'empreinte, quelle
//    que soit la source (fichier, archive) ;
//  - chaque pari est scelle UNE fois, le jour de sa publication, avant son coup d'envoi.
//    Le maillon liste ses matchs (fixtures) : il se verifie seul. Des paris ajoutes plus
//    tard le meme jour forment un maillon « complement ». Jamais de re-scelle la veille ou
//    le lendemain. Un pari qui n'a pas pu etre scelle (coup d'envoi passe, sel du jour deja
//    revele, jour passe) est DECLARE dans un maillon « non_scelle » : il n'est pas prouve,
//    et la verification le dit (controles du 23/10 : avant, un seul pari deja commence
//    empechait de sceller tout le lot, sans alerte) ;
//  - un pari deja scelle qui change vraiment avant son coup d'envoi (exception au gel,
//    buteur absent de la composition) ajoute un maillon « correction » explicite
//    (motif, heure, empreinte salee de l'ancien pari et du nouveau), jamais un
//    remplacement ; le detail (ancien, nouveau) est dans preuves/corrections.json ;
//  - le verificateur controle CHAQUE maillon, sur l'etat des paris a l'heure du
//    maillon (corrections posterieures defaites, seulement si un maillon « correction »
//    les a scellees) ; un pari scelle retire, un pari ni scelle ni declare, une
//    correction sans maillon sont des ERREURS (avocat du diable, 23/10 : avant, ces cas
//    passaient en « non verifiable ») ;
//  - le sel n'est revele que si TOUS les paris scelles du jour sont dans les donnees.
// CONTRE-VERIFICATION DU MATHEMATICIEN ET DE L'AVOCAT DU DIABLE (23/10, tour 4) :
//  - faux maillon (F1, F2, C1, C2) : le verificateur RECALCULE le premier coup d'envoi de chaque
//    maillon a partir des paris couverts (kickoff_at fait partie de l'empreinte) au lieu de lire
//    le champ declare ; erreur si le maillon est a cette heure ou apres, si le champ declare ne
//    correspond pas, si un « scelle » ou « complement » n'est pas du jour (UTC) de sa journee, si
//    une correction est datee apres son maillon ou apres le coup d'envoi ;
//  - pari sans heure (K1) : jamais scelle comme « avant le coup d'envoi » ; declare « anteriorite
//    non prouvee » (avertissement public, alerte du pipeline) ;
//  - journee effacee (A2, A3) : un maillon au format 3 dont les paris manquent des donnees
//    publiques est une ERREUR, sel revele ou non ; sel d'un maillon au format 3 pas revele 7 jours
//    apres la fin de sa journee : ERREUR « sel en retard » (voir DELAI_SEL_MS) ;
//  - meme jour (D) : un pari declare non scelle a l'heure de son coup d'envoi ou apres est une
//    ERREUR (avant : avertissement si la declaration etait du meme jour), sauf note publique.
// CONTRE-VERIFICATION DU MATHEMATICIEN (23/10, tour 5) :
//  - pari hors chaine (N3) : un pari simple sans fixture_id, a la date illisible (pas AAAA-MM-JJ), ou
//    d'un jour sans aucun maillon avant le premier jour au format 3 (ou s'il n'y en a pas encore) est
//    une ERREUR (avant : ignore, ok=true, alors qu'il compte dans le bilan de historique.json) ;
//  - pari remasque apres la revelation du sel (N2) : sur un maillon au format 3 dont le sel est
//    revele, un pari masque est une ERREUR (le sel n'est revele que si tous les paris du jour sont
//    regles et publics). « Non verifiable » reste pour le sel connu par opts.secret seulement
//    (pipeline avant la revelation) et pour les maillons d'avant le format 3 (cas du 21/10).
// Les maillons d'avant (sans champ format) gardent leur calcul : ils ne sont pas
// reecrits. Leur cote a pu etre empreinte en nombre ou en texte selon la source :
// le verificateur essaie les deux (la valeur doit etre la meme).

const crypto = require("crypto");
const JOURNAL = require("./journal-corrections.js");

const GENESE = "0".repeat(64);
// Version 2 (30/09/2026, contre-controle de l'avocat du diable) : la probabilite
// annoncee du pari (model_probability) entre dans l'empreinte. Aucune chaine en
// version 1 n'a ete publiee (preuves/ n'existait pas encore).
// Version 3 (23/10/2026) : maillons au format 3 (voir plus haut).
const VERSION = 3;
const FORMAT = 3;
// Marge apres le coup d'envoi du dernier match d'un jour avant de reveler son sel.
const MARGE_REVELATION_MS = 3 * 3600000;
// SEL EN RETARD (A3, 23/10) : le sel d'un maillon (tout format depuis M2, tour 6) doit etre revele au plus tard 7 jours
// apres la fin de sa journee (jour + 8 jours a 0 h UTC), QUOI QU'IL ARRIVE. Regle choisie plutot que
// « 7 jours apres une journee entierement reglee » : le reglement est ecrit par le pipeline lui-meme ;
// laisser un seul pari « en attente » suffirait a ne jamais reveler le sel, donc a ne jamais laisser
// verifier la journee. Les paris sont publies au plus 3 jours avant leur match (donnees du 23/10) :
// 7 jours laissent la marge pour un match decale ; un pari encore en attente au-dela doit etre regle
// ou annule, et l'alerte le rappelle.
const DELAI_SEL_MS = 8 * 86400000;
const RAISON_SANS_HEURE = "anteriorite non prouvee : heure du coup d'envoi inconnue";
// Champs d'un pari empreint : tous publics une fois le match joue (historique.json).
// model_probability : la chance annoncee ne peut plus etre retouchee apres coup
// sans casser la chaine (un 55 % devenu 70 % se verrait).
const CHAMPS = ["fixture_id", "home", "away", "prediction", "cote", "model_probability", "market", "moteur", "moteur_version", "published_at", "kickoff_at"];

const EXPLICATION = "Empreinte SHA-256 des paris publies chaque jour, chainee a la precedente : chaque maillon porte l'empreinte du maillon d'avant. "
  + "La chaine seule ne protege pas contre une reecriture du fichier : n'importe quel maillon, ancien ou recent, peut etre retire ou reecrit (sel revele compris) et les suivants rechaines, sans aucun secret. "
  + "Seules les versions deja publiees (historique Git du depot, copies gardees par chacun) montrent un tel changement. "
  + "empreinte_paris = SHA-256(sel + saut de ligne + JSON canonique des paris, tries par fixture_id, champs " + CHAMPS.join(", ") + "). "
  + "Maillons au format 3 (champ format) : cote et chance en nombres ; chaque maillon liste ses matchs (fixtures) ; un pari est scelle le jour de sa publication, avant son coup d'envoi. "
  + "Un pari qui n'a pas pu etre scelle est declare dans un maillon « non_scelle » avec la raison : il n'est pas prouve. "
  + "Pour une journee au format 3 presente dans les donnees, la verification signale un pari scelle modifie ou retire, et un pari ni scelle ni declare. "
  + "Un pari simple sans numero de match (fixture_id), a la date illisible (format AAAA-MM-JJ attendu), ou d'un jour sans aucun maillon est une erreur (pari hors chaine). "
  + "Sur un maillon au format 3 dont le sel est revele, un pari encore masque est une erreur (le sel n'est revele qu'une fois tous les paris du jour regles et publics). "
  + "Un pari regle (gagne ou perdu) dont le pronostic est masque est une erreur, quel que soit le format. "
  + "Une correction n'est acceptee que si un maillon « correction » l'a scellee avant le coup d'envoi (detail dans preuves/corrections.json). "
  + "Maillons d'avant le format 3 : verifiables seulement si toute la journee est dans les donnees publiques, sinon « non verifiable » (notes de preuves/corrections.json) ; "
  + "certains ont ete scelles apres un coup d'envoi (signale par la verification). "
  + "Depuis le format 3, le sel d'un jour est revele 3 heures apres le coup d'envoi du dernier match scelle ce jour-la, et seulement une fois tous les paris de ce jour regles (avant, certains sels ont ete reveles plus tot). "
  + "Un pari declare non scelle a l'heure de son coup d'envoi ou apres est une erreur (ajoute apres coup), sauf note publique dans preuves/corrections.json. "
  + "Un pari sans heure de coup d'envoi n'est jamais scelle : il est declare « anteriorite non prouvee ». "
  + "Le verificateur recalcule le premier coup d'envoi de chaque maillon a partir des paris couverts (l'heure du coup d'envoi est dans l'empreinte) : un maillon a cette heure ou apres, ou scelle hors de son jour, est une erreur. "
  + "Un maillon au format 3 dont les paris manquent des donnees publiques (historique.json et preuves/paris-scelles/) est une erreur, sel revele ou non ; "
  + "un sel, tout format, pas revele 7 jours apres la fin de sa journee aussi (sel en retard). Tant que le sel n'est pas revele, le maillon est « non verifiable (sel pas encore revele) ». "
  + "Une journee qui a des paris dans historique.json (le bilan se calcule sur ce fichier) est verifiee sur historique.json seul ; une journee figee dans preuves/paris-scelles/ n'est relue que si elle n'a plus aucun pari dans historique.json. "
  + "Une journee figee retiree de historique.json alors que des journees figees plus anciennes y restent est une erreur (seules les plus anciennes sortent du fichier). "
  + "Limites : le resultat (gagne, perdu) n'entre pas dans l'empreinte, il se lit dans historique.json ; l'heure des maillons est declaree par le pipeline, sans horodatage externe ; l'heure du coup d'envoi vient du pipeline et n'est pas recoupee avec l'heure reelle du match. "
  + "Verification par tous : node scripts/verifier-empreintes.js (historique.json, preuves/paris-scelles/, preuves/corrections.json).";

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

// Numero de match present et lisible (nombre) ; jour AAAA-MM-JJ reel en tete de p.date, sinon null (N3).
function fixtureLisible(f) { return f !== null && f !== undefined && String(f).trim() !== "" && Number.isFinite(Number(f)); }
function jourLisible(d) {
  const x = /^(\d{4}-\d{2}-\d{2})/.exec(typeof d === "string" ? d : "");
  if (!x) return null;
  const t = Date.parse(x[1] + "T00:00:00.000Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === x[1] ? x[1] : null;
}

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
    non_scelles: m.non_scelles,
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
// Jour en heure universelle (comme TODAY du pipeline et p.date).
function jourUTC(iso) { const t = ms(iso); return t === null ? null : new Date(t).toISOString().slice(0, 10); }

// ---------------------------------------------------------------- lecture du registre
function estF3(m) { return !!m && m.format >= 3; }
function maillonsDuJour(registre, jour) { return (registre.chaine || []).filter(function (m) { return m.jour === jour; }); }
// Paris scelles au format 3 (maillons « scelle » et « complement ») : { fixture_id: n }.
function scellesFormat3(registre, jour) {
  const ids = {};
  maillonsDuJour(registre, jour).forEach(function (m) {
    if (estF3(m) && (m.type === "scelle" || m.type === "complement")) (m.fixtures || []).forEach(function (f) { ids[String(f)] = m.n; });
  });
  return ids;
}
// Paris declares non scelles (maillons « non_scelle ») : { fixture_id: raison }.
function declaresNonScelles(registre, jour) {
  const ids = {};
  maillonsDuJour(registre, jour).forEach(function (m) {
    if (estF3(m) && m.type === "non_scelle") (m.non_scelles || []).forEach(function (x) { if (x && x.fixture_id != null) ids[String(x.fixture_id)] = x.raison || "non scelle"; });
  });
  return ids;
}
// Declarations detaillees : { fixture_id: { raison, apres_coup, le } } (le = heure du maillon).
function declarationsDuJour(registre, jour) {
  const ids = {};
  maillonsDuJour(registre, jour).forEach(function (m) {
    if (estF3(m) && m.type === "non_scelle") (m.non_scelles || []).forEach(function (x) {
      if (x && x.fixture_id != null) ids[String(x.fixture_id)] = { raison: x.raison || "non scelle", apres_coup: x.apres_coup === true, le: m.genere_le, coup_envoi: Object.prototype.hasOwnProperty.call(x, "coup_envoi") ? x.coup_envoi : undefined, n: m.n };
    });
  });
  return ids;
}
// Pari declare non scelle A L'HEURE DE SON COUP D'ENVOI OU APRES (meme jour ou plus tard, D du
// 23/10), ou par un run posterieur a son jour sans heure connue : ajoute apres coup. Le drapeau
// ecrit dans le maillon compte, et le calcul aussi, avec l'heure ecrite dans la declaration ET
// celle des donnees (un kickoff_at retouche ou retire ensuite n'efface rien).
function declareApresCoup(d, p, jour) {
  if (!d) return false;
  if (d.apres_coup === true) return true;
  const le = ms(d.le);
  if (le === null) return false;
  const kos = [ms(p && p.kickoff_at), d.coup_envoi === undefined ? null : ms(d.coup_envoi)].filter(function (t) { return t !== null; });
  if (kos.some(function (ko) { return le >= ko; })) return true;
  return !kos.length && jourUTC(d.le) > jour;
}
// Matchs dont l'empreinte porte le sel du jour (scelle, complement, correction).
function fixturesSalees(registre, jour) {
  const ids = {};
  maillonsDuJour(registre, jour).forEach(function (m) {
    if (estF3(m) && m.type !== "non_scelle") (m.fixtures || []).forEach(function (f) { ids[String(f)] = true; });
  });
  return Object.keys(ids).map(Number);
}
function dernierAncien(registre, jour) {
  const a = maillonsDuJour(registre, jour).filter(function (m) { return !estF3(m); });
  return a.length ? a[a.length - 1] : null;
}
// Premier jour scelle au format 3 : a partir de lui, chaque pari d'une journee doit etre
// scelle ou declare non scelle.
function premierJourFormat3(registre) {
  const j = (registre.chaine || []).filter(estF3).map(function (m) { return m.jour; }).sort();
  return j.length ? j[0] : null;
}
function debutFormat3Ms(registre) {
  const m = (registre.chaine || []).find(estF3);
  return m ? ms(m.genere_le) : null;
}
// Journee scellee d'abord a l'ancien format (jour de la mise en service du format 3) : un
// pari publie avant le dernier maillon ancien est couvert par lui.
function couvertParAncien(p, ancien) {
  if (!ancien) return false;
  const pub = ms(p.published_at);
  return pub === null || pub <= ms(ancien.genere_le);
}
function parisSimplesDuJour(predictions, jour) {
  return (predictions || []).filter(function (p) { return estPariDuJour(p, jour); });
}
function estMasque(p) { return p.redacted === true || p.__masque === true || !p.prediction; }
// Pari regle et public (lib/journal-corrections.js#pariPublic), valeurs connues. Un pari sans
// resultat n'est jamais tenu pour regle.
function pariRegle(p, nowMs) {
  return !!p && typeof p.result === "string" && p.result !== "" && JOURNAL.pariPublic(p, nowMs) && !estMasque(p);
}
// CHAQUE pari simple du jour est regle -> { ok, en_attente: [fixture_id] }. Aucun pari : pas ok.
function journeeReglee(predictions, jour, nowMs) {
  const now = nowMs != null ? nowMs : Date.now();
  const du = parisSimplesDuJour(predictions, jour);
  const enAttente = du.filter(function (p) { return !pariRegle(p, now); }).map(function (p) { return Number(p.fixture_id); });
  return { ok: du.length > 0 && !enAttente.length, en_attente: enAttente };
}

// ---------------------------------------------------------------- corrections
// ETAT DES PARIS A UNE HEURE DONNEE : les corrections posterieures a `instant` sont
// defaites (champs `ancien` remis). corrections : [{ fixture_id, le | au_plus_tard,
// ancien, masque }] (preuves/corrections.json) ; les corrections portees par les lignes
// d'historique (p.corrections) sont lues aussi. Meme correction en double (journal masque,
// ligne dechiffree) : la version avec ses valeurs l'emporte. Une correction dont les valeurs
// sont encore masquees rend le pari non verifiable (__masque) : jamais devinee.
function heureCorrection(c) { return ms(c && (c.le || c.au_plus_tard)); }
function aDesValeurs(c) { return !!c && c.masque !== true && !!c.ancien && typeof c.ancien === "object"; }
function indexCorrections(predictions, corrections) {
  const parFixture = {};
  const vues = {};
  function ajouterC(fid, c) {
    const t = heureCorrection(c);
    if (fid == null || t === null) return;
    const cle = String(fid) + "|" + t;
    const deja = vues[cle];
    if (deja) { if (!aDesValeurs(deja.c) && aDesValeurs(c)) deja.c = c; return; }
    const x = { t: t, c: c, fid: Number(fid) };
    vues[cle] = x;
    (parFixture[String(fid)] = parFixture[String(fid)] || []).push(x);
  }
  (corrections || []).forEach(function (c) { if (c) ajouterC(c.fixture_id, c); });
  (predictions || []).forEach(function (p) {
    if (p && Array.isArray(p.corrections)) p.corrections.forEach(function (c) { ajouterC(p.fixture_id, c); });
  });
  return parFixture;
}
// -> { etat, appliquees: [{ fid, t, c, pari }] }
function etatDetail(predictions, index, t0) {
  const appliquees = [];
  const etat = (predictions || []).map(function (p) {
    const liste = p && p.fixture_id != null ? index[String(p.fixture_id)] : null;
    if (!liste || t0 === null) return p;
    const apres = liste.filter(function (x) { return x.t > t0; }).sort(function (a, b) { return b.t - a.t; });
    if (!apres.length) return p;
    const copie = Object.assign({}, p);
    apres.forEach(function (x) {
      appliquees.push({ fid: x.fid, t: x.t, c: x.c, pari: p });
      if (!aDesValeurs(x.c)) { copie.__masque = true; return; }
      Object.keys(x.c.ancien).forEach(function (k) { copie[k] = x.c.ancien[k]; });
    });
    return copie;
  });
  return { etat: etat, appliquees: appliquees };
}
function etatAu(predictions, corrections, instant) {
  return etatDetail(predictions, indexCorrections(predictions, corrections), ms(instant)).etat;
}
// Une correction posterieure a un scelle n'est admise que si un maillon « correction »
// l'a scellee (meme match, meme heure), ou si c'est l'une des 8 reecritures historiques de
// la version du moteur (paris 1635672, 1635716, 1635737, 1636449, le 21/10), datees par les
// commits et publiees dans preuves/corrections.json.
// EXCEPTION BORNEE (avocat du diable, 23/10) : avant, n'importe quelle entree « version_moteur »
// d'avant le format 3 defaisait n'importe quel champ (un pari perdant reecrit en gagnant
// passait). Desormais : liste fermee (match + heure), et les champs changes (champs, ancien,
// nouveau) sont exactement moteur et/ou moteur_version.
const CHAMPS_MOTEUR = ["moteur", "moteur_version"];
const REECRITURES_MOTEUR_CONNUES = [
  "1635672|2026-10-21T05:39:51.616Z", "1635672|2026-10-21T15:02:45.530Z",
  "1635716|2026-10-21T05:39:51.616Z", "1635716|2026-10-21T15:02:45.530Z",
  "1635737|2026-10-21T05:39:51.616Z", "1635737|2026-10-21T15:02:45.530Z",
  "1636449|2026-10-21T05:39:51.616Z", "1636449|2026-10-21T15:02:45.530Z",
];
function memesCles(liste, champs) {
  if (!Array.isArray(liste) || !liste.length) return false;
  const a = liste.slice().sort(), b = champs.slice().sort();
  return a.length === b.length && a.every(function (k, i) { return k === b[i]; });
}
function reecritureMoteurConnue(x) {
  const c = x && x.c;
  if (!c || c.type !== "version_moteur" || !c.source || x.t === null) return false;
  if (REECRITURES_MOTEUR_CONNUES.indexOf(x.fid + "|" + new Date(x.t).toISOString()) === -1) return false;
  const champs = Array.isArray(c.champs) ? c.champs : [];
  if (!champs.length || !champs.every(function (k) { return CHAMPS_MOTEUR.indexOf(k) !== -1; })) return false;
  const objet = function (o) { return !!o && typeof o === "object" && !Array.isArray(o); };
  return objet(c.ancien) && objet(c.nouveau) && memesCles(Object.keys(c.ancien), champs) && memesCles(Object.keys(c.nouveau), champs);
}
function correctionAdmise(registre, x, debutF3) {
  const backee = (registre.chaine || []).some(function (m) {
    return estF3(m) && m.type === "correction" && m.correction && Number(m.correction.fixture_id) === x.fid && ms(m.correction.le) === x.t;
  });
  if (backee) return true;
  return reecritureMoteurConnue(x) && (debutF3 === null || x.t < debutF3);
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
function declarer(registre, jour, liste, le) {
  return pousser(registre, {
    jour: jour, genere_le: le, nb_paris: 0, empreinte_paris: null, format: FORMAT, type: "non_scelle", fixtures: [],
    premier_coup_envoi: null, non_scelles: liste.slice().sort(function (a, b) { return a.fixture_id - b.fixture_id; }),
  });
}

// ---------------------------------------------------------------- scelle du jour
// Scelle les paris de `jour` pas encore scelles. opts : { aujourdhui } (jour du run en
// heure universelle, comme TODAY ; defaut : jour UTC de genereLe).
// -> { ajoute, raison, maillon, declaration, non_scelles, en_attente }
// Regles (format 3) :
//  - seulement le jour meme (jamais la veille ou le lendemain) ;
//  - chaque pari pas encore scelle dont le coup d'envoi est a venir est scelle (maillon
//    « scelle », puis « complement ») ; un pari deja scelle n'est jamais re-scelle ;
//  - un pari dont le coup d'envoi est passe, ou dont le sel du jour est deja revele, ne
//    peut plus l'etre : il est DECLARE dans un maillon « non_scelle » (avec la raison) ;
//  - un pari masque non relu (valeurs inconnues) attend le run suivant (en_attente) ;
//  - journee deja scellee a l'ancien format (jour de la mise en service) : les paris publies
//    apres son dernier maillon sont scelles au format 3, les autres restent couverts par lui.
function ajouter(registre, jour, predictions, secret, genereLe, opts) {
  opts = opts || {};
  const res = { ajoute: false, raison: "", maillon: null, declaration: null, non_scelles: [], en_attente: [] };
  if (!secret) { res.raison = "secret absent"; return res; }
  const le = genereLe || new Date().toISOString();
  const leMs = ms(le);
  const aujourdhui = opts.aujourdhui || jourUTC(le);
  if (jour !== aujourdhui) { res.raison = "jamais re-scelle hors de son jour (" + jour + ", nous sommes le " + aujourdhui + ")"; return res; }
  // Le jour UTC de l'heure du maillon doit etre le jour scelle (C2) : le verificateur refuse sinon.
  if (jourUTC(le) !== jour) { res.raison = "jamais re-scelle hors de son jour (" + jour + ", heure du maillon " + le + ")"; return res; }
  const duJour = parisSimplesDuJour(predictions, jour);
  if (!duJour.length) { res.raison = "aucun pari"; return res; }
  const scelles = scellesFormat3(registre, jour), declares = declaresNonScelles(registre, jour);
  const ancien = dernierAncien(registre, jour);
  const selRevele = maillonsDuJour(registre, jour).some(function (m) { return !!m.sel_revele; });
  const vus = {};
  const aSceller = [];
  duJour.forEach(function (p) {
    const k = String(p.fixture_id);
    if (vus[k] || scelles[k] || declares[k] || couvertParAncien(p, ancien)) return;
    vus[k] = true;
    const ko = ms(p.kickoff_at);
    const coupEnvoi = ko === null ? null : new Date(ko).toISOString();
    // K1 : sans heure de coup d'envoi, rien ne prouve que le scelle precede le match.
    if (ko === null) res.non_scelles.push({ fixture_id: Number(p.fixture_id), raison: RAISON_SANS_HEURE, anteriorite_non_prouvee: true, coup_envoi: null });
    // D : declare a l'heure de son coup d'envoi ou apres = ajoute apres coup (erreur sauf note publique).
    else if (leMs >= ko) res.non_scelles.push({ fixture_id: Number(p.fixture_id), raison: "coup d'envoi passe avant le scelle", apres_coup: true, coup_envoi: coupEnvoi });
    else if (selRevele) res.non_scelles.push({ fixture_id: Number(p.fixture_id), raison: "sel du jour deja revele", coup_envoi: coupEnvoi });
    else if (estMasque(p)) res.en_attente.push({ fixture_id: Number(p.fixture_id), raison: "pari masque non relu" });
    else aSceller.push(Number(p.fixture_id));
  });
  if (aSceller.length) {
    const lu = parisDuJour(predictions, jour, { fixtures: aSceller });
    res.maillon = pousser(registre, {
      jour: jour, genere_le: le, nb_paris: lu.paris.length, empreinte_paris: empreinteParis(lu.paris, sel(secret, jour)),
      format: FORMAT, type: maillonsDuJour(registre, jour).length ? "complement" : "scelle", fixtures: lu.fixtures,
      premier_coup_envoi: lu.premierCoupEnvoi !== null ? new Date(lu.premierCoupEnvoi).toISOString() : null,
    });
    res.ajoute = true;
  }
  if (res.non_scelles.length) res.declaration = declarer(registre, jour, res.non_scelles, le);
  if (res.maillon) res.raison = res.maillon.type === "complement" ? "complement" : "nouveau";
  else if (res.en_attente.length) res.raison = "pari masque non relu";
  else if (res.non_scelles.length) res.raison = "non scelle : " + res.non_scelles[0].raison;
  else res.raison = "inchange";
  return res;
}

// Paris des jours passes (depuis le premier jour au format 3) jamais scelles ni declares :
// declares dans un maillon « non_scelle » (ils ne pourront plus jamais etre scelles).
// Declare APRES son coup d'envoi (ou coup d'envoi inconnu) : apres_coup: true et raison
// explicite ; la verification en fait une ERREUR permanente (avocat du diable, 23/10 : avant,
// un pari gagnant ajoute apres coup a une journee passee devenait un simple avertissement
// des le run suivant), sauf note publique dans preuves/corrections.json.
// -> { declares, maillons }
const RAISON_APRES_COUP = "ajoute apres coup : declare apres son jour de publication et apres son coup d'envoi";
function declarerNonScelles(registre, predictions, genereLe, opts) {
  opts = opts || {};
  const le = genereLe || new Date().toISOString();
  const debut = premierJourFormat3(registre);
  const out = { declares: 0, maillons: [] };
  if (!debut) return out;
  const aujourdhui = opts.aujourdhui || jourUTC(le);
  const jours = {};
  (predictions || []).forEach(function (p) {
    const j = String((p && p.date) || "").slice(0, 10);
    if (p && p.fixture_id != null && (p.type || "single") === "single" && j >= debut && j < aujourdhui) jours[j] = true;
  });
  Object.keys(jours).sort().forEach(function (jour) {
    const scelles = scellesFormat3(registre, jour), declares = declaresNonScelles(registre, jour), ancien = dernierAncien(registre, jour);
    const vus = {}, liste = [];
    parisSimplesDuJour(predictions, jour).forEach(function (p) {
      const k = String(p.fixture_id);
      if (vus[k] || scelles[k] || declares[k] || couvertParAncien(p, ancien)) return;
      vus[k] = true;
      const ko = ms(p.kickoff_at), leMs = ms(le);
      const coupEnvoi = ko === null ? null : new Date(ko).toISOString();
      if (ko === null || leMs === null || leMs >= ko) liste.push({ fixture_id: Number(p.fixture_id), raison: RAISON_APRES_COUP, apres_coup: true, coup_envoi: coupEnvoi });
      else liste.push({ fixture_id: Number(p.fixture_id), raison: estMasque(p) ? "pari masque non relu le jour de sa publication" : "non scelle le jour de sa publication", coup_envoi: coupEnvoi });
    });
    if (liste.length) { out.maillons.push(declarer(registre, jour, liste, le)); out.declares += liste.length; }
  });
  return out;
}

// VRAIE CORRECTION d'un pari deja scelle, avant son coup d'envoi (exception au gel) :
// maillon « correction » explicite, jamais un remplacement. correction : { fixture_id,
// motif, le, ancien: { champs du pari avant } }. L'empreinte de l'ancien pari et celle
// du nouveau sont salees (rien n'est devinable avant le match). -> { ajoute, raison, maillon }
function corriger(registre, jour, predictions, secret, genereLe, correction) {
  if (!secret) return { ajoute: false, raison: "secret absent" };
  if (!correction || correction.fixture_id == null || !correction.motif || !correction.le || !correction.ancien) return { ajoute: false, raison: "correction incomplete (fixture_id, motif, le, ancien)" };
  const fid = Number(correction.fixture_id);
  if (!scellesFormat3(registre, jour)[String(fid)]) {
    // Pari couvert par un maillon de l'ancien format (journee de la mise en service) : sa
    // correction ne peut pas etre scellee ; le pipeline doit alerter (controle du 23/10).
    const p0 = (predictions || []).find(function (p) { return estPariDuJour(p, jour) && Number(p.fixture_id) === fid; });
    if (p0 && couvertParAncien(p0, dernierAncien(registre, jour))) return { ajoute: false, raison: "pari scelle a l'ancien format : correction impossible a sceller" };
    return { ajoute: false, raison: "pari pas encore scelle : le scelle du jour portera la valeur corrigee" };
  }
  if (maillonsDuJour(registre, jour).some(function (m) { return !!m.sel_revele; })) return { ajoute: false, raison: "sel du jour deja revele" };
  const lu = parisDuJour(predictions, jour, { fixtures: [fid] });
  if (lu.paris.length !== 1 || lu.incomplet) return { ajoute: false, raison: "pari corrige introuvable ou masque" };
  const le = genereLe || new Date().toISOString();
  if (lu.premierCoupEnvoi === null) return { ajoute: false, raison: "pari sans heure de coup d'envoi : correction impossible a sceller" };
  if (ms(le) >= lu.premierCoupEnvoi) return { ajoute: false, raison: "coup d'envoi passe : plus aucune correction" };
  const tc = ms(correction.le);
  if (tc === null || tc > ms(le) || tc >= lu.premierCoupEnvoi) return { ajoute: false, raison: "heure de la correction apres le maillon ou apres le coup d'envoi" };
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

// Revele le sel des jours dont TOUS les paris scelles ont commence depuis MARGE_REVELATION_MS
// ET dont CHAQUE pari est regle (journeeReglee : un match decale garde son ancienne heure).
// Ancien appel revelerSels(registre, secret, jourLimite) garde (jours <= jourLimite).
// Nouvel appel : revelerSels(registre, secret, { predictions, nowMs }). Un pari scelle absent
// des donnees, sans coup d'envoi, ou pas encore regle : on attend (jamais revele trop tot).
function revelerSels(registre, secret, limite) {
  let n = 0;
  if (!secret) return 0;
  const parJour = {};
  if (limite && typeof limite === "object") {
    const now = limite.nowMs != null ? limite.nowMs : Date.now();
    registre.chaine.forEach(function (m) {
      if (m.sel_revele || parJour[m.jour] !== undefined) return;
      const jour = m.jour;
      let ok = true, dernier = null;
      const f3 = fixturesSalees(registre, jour);
      if (f3.length) {
        const lu = parisDuJour(limite.predictions, jour, { format: 3, fixtures: f3 });
        const trouves = {};
        lu.paris.forEach(function (p) { trouves[String(p.fixture_id)] = true; });
        ok = ok && Object.keys(trouves).length === f3.length && !lu.sansCoupEnvoi;
        if (lu.dernierCoupEnvoi !== null) dernier = lu.dernierCoupEnvoi;
      }
      const ancien = dernierAncien(registre, jour);
      if (ancien) {
        const exclus = {};
        f3.forEach(function (f) { exclus[String(f)] = true; });
        Object.keys(declaresNonScelles(registre, jour)).forEach(function (f) { exclus[f] = true; });
        const autres = parisSimplesDuJour(limite.predictions, jour).filter(function (p) { return !exclus[String(p.fixture_id)]; });
        const lu = parisDuJour(autres, jour, { format: 3 });
        ok = ok && lu.paris.length >= ancien.nb_paris && !lu.sansCoupEnvoi;
        if (lu.dernierCoupEnvoi !== null) dernier = dernier === null ? lu.dernierCoupEnvoi : Math.max(dernier, lu.dernierCoupEnvoi);
      }
      if (!f3.length && !ancien) ok = false; // seulement des declarations : aucun sel en jeu
      ok = ok && journeeReglee(limite.predictions, jour, now).ok;
      parJour[jour] = !!(ok && dernier !== null && now >= dernier + MARGE_REVELATION_MS);
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

// ---------------------------------------------------------------- verification
// Rejoue la chaine ; si predictions est fourni, controle aussi CHAQUE maillon dont le
// sel est connu (revele, ou opts.secret pour le pipeline) sur l'etat des paris a
// l'heure du maillon (corrections posterieures defaites : opts.corrections).
// opts : { secret, corrections, journeesNonVerifiables: [jours documentes],
//   parisNonScellesExpliques: ["jour|fixture_id" avec note publique], nowMs }.
// -> { ok, erreurs, avertissements, verifies, non_verifiables }
// ERREURS :
//  - chaine rompue, maillon retouche, heures des maillons qui reculent ;
//  - maillon format 3 scelle apres un coup d'envoi ;
//  - paris qui ne correspondent plus a l'empreinte ;
//  - format 3 : pari scelle absent alors que sa journee est dans les donnees (retire) ;
//    pari d'une journee au format 3 ni scelle ni declare non scelle une fois son coup
//    d'envoi passe (ajoute apres coup) ;
//  - ancien format : nombre de paris de la journee different de celui de son DERNIER
//    maillon (sauf journee documentee dans opts.journeesNonVerifiables) ;
//  - correction posterieure a un scelle sans maillon « correction » (hors les 8 reecritures
//    historiques de la version du moteur), ou encore masquee alors que le pari est public ;
//  - pari declare non scelle par un run posterieur a son jour ET apres son coup d'envoi
//    (ajoute apres coup), sauf note publique (opts.parisNonScellesExpliques) ;
//  - pari hors chaine (N3) : pari simple sans fixture_id, a la date illisible, ou d'un jour sans
//    aucun maillon avant le premier jour au format 3 (ou s'il n'y en a pas) ;
//  - pari masque sur un maillon au format 3 dont le sel est revele dans le registre (N2).
// NON VERIFIABLES (jamais une alerte) : journee absente des donnees, pari encore masque (sel
// pas encore revele, ou maillon d'avant le format 3), ancien maillon partiel, journee documentee.
// AVERTISSEMENTS : paris declares non scelles, anciens maillons scelles apres un coup d'envoi.
function verifier(registre, predictions, opts) {
  opts = opts || {};
  const erreurs = [], avertissements = [], verifies = [], nonVerifiables = [];
  const chaine = registre.chaine || [];
  let prec = GENESE, precT = null;
  chaine.forEach(function (m, i) {
    if (m.n !== i + 1) erreurs.push("maillon " + (i + 1) + " : numero " + m.n);
    if (m.precedente !== prec) erreurs.push("maillon " + m.n + " : chaine rompue");
    if (empreinteMaillon(m) !== m.empreinte) erreurs.push("maillon " + m.n + " : empreinte fausse");
    const t = ms(m.genere_le);
    if (t !== null && precT !== null && t < precT) erreurs.push("maillon " + m.n + " : heure anterieure au maillon precedent");
    if (t !== null) precT = t;
    if (estF3(m) && m.premier_coup_envoi && ms(m.genere_le) >= ms(m.premier_coup_envoi)) erreurs.push("maillon " + m.n + " (" + m.jour + ") : scelle apres un coup d'envoi");
    prec = m.empreinte;
  });
  if (!predictions) return { ok: !erreurs.length, erreurs: erreurs, avertissements: avertissements, verifies: verifies, non_verifiables: nonVerifiables };

  const now = opts.nowMs != null ? opts.nowMs : Date.now();
  const documentees = {};
  (opts.journeesNonVerifiables || []).forEach(function (j) { documentees[j] = true; });
  // Paris ajoutes apres coup expliques par une note publique (preuves/corrections.json) : « jour|fixture_id ».
  const expliques = {};
  (opts.parisNonScellesExpliques || []).forEach(function (x) { expliques[String(x)] = true; });
  const index = indexCorrections(predictions, opts.corrections);
  const debutF3 = debutFormat3Ms(registre);
  const signalees = {};
  // Corrections appliquees pour verifier un maillon : admises et lisibles, sinon erreur.
  function controlerCorrections(m, appliquees, fixtures) {
    let masquee = false;
    appliquees.forEach(function (x) {
      if (fixtures && fixtures.indexOf(x.fid) === -1) return;
      if (x.pari && String(x.pari.date || "").slice(0, 10) !== m.jour) return;
      const cle = x.fid + "|" + x.t;
      if (!correctionAdmise(registre, x, debutF3)) {
        if (!signalees[cle]) erreurs.push("pari " + x.fid + " (" + m.jour + ") : correction du " + new Date(x.t).toISOString() + " sans maillon « correction » scelle avant le coup d'envoi");
        signalees[cle] = true;
      }
      if (!aDesValeurs(x.c)) {
        if (x.pari && !estMasque(x.pari)) {
          if (!signalees[cle + "|m"]) erreurs.push("pari " + x.fid + " (" + m.jour + ") : correction encore masquee alors que le pari est public");
          signalees[cle + "|m"] = true;
        } else masquee = true;
      }
    });
    return masquee;
  }
  // N2 (mathematicien, 23/10, tour 5) : maillon au format 3 dont le sel est REVELE dans le registre
  // (donc journee entierement reglee et publique) et pari encore masque = pari remasque apres coup :
  // ERREUR -> true. Sel connu seulement par opts.secret (pipeline avant la revelation) : false (non
  // verifiable). Les maillons d'avant le format 3 ne passent jamais ici (cas du 21/10).
  function masqueApresSel(m) {
    if (!estF3(m) || !m.sel_revele) return false;
    erreurs.push("maillon " + m.n + " (" + m.jour + ") : pari masque apres la revelation du sel (le sel n'est revele qu'une fois tous les paris du jour regles et publics)");
    return true;
  }

  chaine.forEach(function (m) {
    const nv = function (raison) { nonVerifiables.push({ n: m.n, jour: m.jour, raison: raison }); };
    // A2 : paris d'un maillon au format 3 (scelles ou declares) absents des donnees publiques :
    // ERREUR, sel revele ou non (avant : « journee absente des donnees », jamais une alerte).
    if (estF3(m)) {
      const attendus = m.type === "non_scelle"
        ? (m.non_scelles || []).filter(function (x) { return x && x.fixture_id != null; }).map(function (x) { return Number(x.fixture_id); })
        : (m.fixtures || []).map(Number);
      const presents = {};
      parisSimplesDuJour(predictions, m.jour).forEach(function (p) { presents[String(Number(p.fixture_id))] = true; });
      const manquants = attendus.filter(function (f) { return !presents[String(f)]; });
      if (manquants.length) { erreurs.push("maillon " + m.n + " (" + m.jour + ") : pari(s) " + (m.type === "non_scelle" ? "declare(s)" : "scelle(s)") + " absent(s) des donnees publiques (historique.json, preuves/paris-scelles/) : " + manquants.join(", ")); return; }
    }
    if (estF3(m) && m.type === "non_scelle") return;
    // A3 : sel en retard (voir DELAI_SEL_MS), qu'on ait le secret ou non. TOUT FORMAT (M2, mathematicien
    // 23/10, tour 6) : avant, seulement au format 3 ; un sel d'ancien format jamais revele (22/10) laissait
    // reecrire ses paris pour toujours, la journee restant « non verifiable (sel pas encore revele) ».
    const debutJour = ms(m.jour + "T00:00:00.000Z");
    if (!m.sel_revele && debutJour !== null && now >= debutJour + DELAI_SEL_MS) {
      erreurs.push("maillon " + m.n + " (" + m.jour + ") : sel en retard (pas revele 7 jours apres la fin de sa journee)");
    }
    const t0 = ms(m.genere_le);
    const d = etatDetail(predictions, index, t0);
    if (estF3(m)) {
      const fixtures = (m.fixtures || []).map(Number);
      // F1, F2, C1, C2 : premier coup d'envoi RECALCULE a partir des paris couverts (etat a l'heure
      // du maillon ; kickoff_at est dans l'empreinte), jamais lu dans le champ declare.
      const cou = parisDuJour(d.etat, m.jour, { fixtures: fixtures });
      const err0 = erreurs.length;
      if (cou.sansCoupEnvoi) erreurs.push("maillon " + m.n + " (" + m.jour + ") : pari scelle sans heure de coup d'envoi (anteriorite non prouvee)");
      const premier = cou.premierCoupEnvoi;
      const declare = m.premier_coup_envoi ? ms(m.premier_coup_envoi) : null;
      if (declare !== premier) erreurs.push("maillon " + m.n + " (" + m.jour + ") : premier coup d'envoi declare (" + (m.premier_coup_envoi || "aucun") + ") different de celui des paris couverts (" + (premier === null ? "aucun" : new Date(premier).toISOString()) + ")");
      if (premier !== null && t0 !== null && t0 >= premier && !(declare !== null && t0 >= declare)) erreurs.push("maillon " + m.n + " (" + m.jour + ") : scelle apres un coup d'envoi");
      if ((m.type === "scelle" || m.type === "complement") && jourUTC(m.genere_le) !== m.jour) erreurs.push("maillon " + m.n + " (" + m.jour + ") : scelle hors de son jour (heure du maillon " + m.genere_le + ")");
      if (m.type === "correction") {
        const tc = ms(m.correction && m.correction.le);
        if (tc === null || t0 === null || tc > t0 || (premier !== null && tc >= premier)) erreurs.push("maillon " + m.n + " (" + m.jour + ") : correction datee apres son maillon ou apres le coup d'envoi");
      }
      if (erreurs.length > err0) return;
    }
    const s = m.sel_revele || (opts.secret ? sel(opts.secret, m.jour) : null);
    if (!s) return nv("sel pas encore revele");
    const jourPresent = parisSimplesDuJour(predictions, m.jour).length > 0;
    if (estF3(m)) {
      const fixtures = (m.fixtures || []).map(Number);
      const masquee = controlerCorrections(m, d.appliquees, fixtures);
      if (!jourPresent) return nv("journee absente des donnees");
      const lu = parisDuJour(d.etat, m.jour, { fixtures: fixtures });
      if (lu.incomplet || masquee) return masqueApresSel(m) || nv("pari encore masque");
      if (empreinteParis(lu.paris, s) !== m.empreinte_paris) { erreurs.push("maillon " + m.n + " (" + m.jour + ") : les paris ne correspondent plus a l'empreinte publiee"); return; }
      if (m.type === "correction" && m.correction) {
        const tc = ms(m.correction.le);
        const da = etatDetail(predictions, index, tc === null ? null : tc - 1);
        if (controlerCorrections(m, da.appliquees, fixtures)) return masqueApresSel(m) || nv("correction encore masquee");
        const av = parisDuJour(da.etat, m.jour, { fixtures: fixtures });
        if (av.incomplet) return masqueApresSel(m) || nv("pari encore masque");
        if (empreinteParis(av.paris, s) !== m.correction.ancienne_empreinte) { erreurs.push("maillon " + m.n + " (" + m.jour + ") : l'ancien pari ne correspond plus a l'empreinte de la correction"); return; }
      }
      verifies.push(m.n);
      return;
    }
    // Ancien format : toute la journee, hors paris scelles ou declares au format 3.
    const exclus = {};
    fixturesSalees(registre, m.jour).forEach(function (f) { exclus[String(f)] = true; });
    Object.keys(declaresNonScelles(registre, m.jour)).forEach(function (f) { exclus[f] = true; });
    const etatJour = d.etat.filter(function (p) { return !(p && estPariDuJour(p, m.jour) && exclus[String(p.fixture_id)]); });
    const masquee = controlerCorrections(m, d.appliquees, null);
    const lu = parisDuJour(etatJour, m.jour, { format: 2 });
    if (!lu.paris.length) return nv("journee absente des donnees");
    const dernier = dernierAncien(registre, m.jour);
    if (lu.paris.length !== dernier.nb_paris) {
      if (documentees[m.jour]) return nv("journee documentee non verifiable (preuves/corrections.json)");
      erreurs.push("maillon " + m.n + " (" + m.jour + ") : " + lu.paris.length + " paris dans les donnees pour " + dernier.nb_paris + " scelles par le dernier maillon de la journee");
      return;
    }
    if (lu.paris.length !== m.nb_paris) return nv("maillon partiel (" + m.nb_paris + " paris scelles, journee completee ensuite)");
    if (lu.incomplet || masquee) return nv("pari encore masque");
    const ok = variantesAncienFormat(lu.paris).some(function (v) { return empreinteParis(v, s) === m.empreinte_paris; });
    if (!ok) { erreurs.push("maillon " + m.n + " (" + m.jour + ") : les paris ne correspondent plus a l'empreinte publiee"); return; }
    verifies.push(m.n);
    if (lu.premierCoupEnvoi !== null && ms(m.genere_le) >= lu.premierCoupEnvoi) avertissements.push("maillon " + m.n + " (" + m.jour + ", ancien format) : scelle apres le premier coup d'envoi de la journee");
  });

  // N3 « PARI HORS CHAINE » (mathematicien, 23/10, tour 5) : CHAQUE pari simple doit etre rattache a
  // la chaine. Avant, un pari sans fixture_id, a la date illisible ou d'un jour sans maillon avant le
  // premier jour au format 3 etait ignore (ok=true) alors qu'il compte dans le bilan publie.
  //  - sans fixture_id (ou illisible) : ERREUR ;
  //  - date qui ne commence pas par AAAA-MM-JJ (jour reel) : ERREUR ;
  //  - jour anterieur au premier jour au format 3 (ou aucun jour au format 3) sans aucun maillon :
  //    ERREUR, sauf jour pas encore atteint par la chaine (apres son dernier jour) pour un pari ni
  //    commence ni regle (pipeline avant le premier scelle au format 3) : non verifiable ;
  //  - a partir du premier jour au format 3 : chaque pari est scelle, ou declare non scelle (plus bas).
  const debut = premierJourFormat3(registre);
  const joursChaine = {};
  chaine.forEach(function (m) { if (m && m.jour) joursChaine[String(m.jour)] = true; });
  const dernierJourChaine = Object.keys(joursChaine).sort().pop() || null;
  const jours = {};
  const horsChaine = {};
  const erreurHorsChaine = function (cle, msg) { if (!horsChaine[cle]) { horsChaine[cle] = true; erreurs.push(msg); } };
  (predictions || []).forEach(function (p) {
    if (!p || (p.type || "single") !== "single") return;
    // M1 (mathematicien, 23/10, tour 6) : un pari REGLE (gagne ou perdu) dont le pronostic est masque est
    // une ERREUR, quel que soit le format. Le masquage ne touche jamais un pari regle
    // (lib/premium-fields.js#redactPendingPredictions) et le pipeline ne regle jamais un pari masque :
    // avant, sur une journee d'ancien format, un perdant remasque et passe gagnant restait « non verifiable ».
    if ((p.result === "win" || p.result === "loss") && (p.redacted === true || !p.prediction)) {
      erreurHorsChaine("m|" + String(p.fixture_id) + "|" + String(p.date), "pari " + String(p.fixture_id) + " (" + String(p.date).slice(0, 10) + ") : regle (" + p.result + ") mais pronostic masque");
    }
    const nom = (p.home || p.away) ? " (" + (p.home || "?") + " - " + (p.away || "?") + ")" : (p.match ? " (" + p.match + ")" : "");
    if (!fixtureLisible(p.fixture_id)) {
      erreurHorsChaine("f|" + nom + "|" + String(p.date), "pari hors chaine" + nom + " : sans numero de match (fixture_id), jamais scelle");
      return;
    }
    const k = String(Number(p.fixture_id));
    const j = jourLisible(p.date);
    if (!j) {
      erreurHorsChaine("d|" + k + "|" + String(p.date), "pari hors chaine " + k + nom + " : date illisible (" + JSON.stringify(p.date === undefined ? null : p.date) + ", AAAA-MM-JJ attendu), jamais scelle");
      return;
    }
    if (debut && j >= debut) { jours[j] = true; return; }
    if (joursChaine[j]) return; // journee d'avant le format 3 : controlee par ses maillons (plus haut)
    const ko = ms(p.kickoff_at);
    if ((dernierJourChaine === null || j > dernierJourChaine) && ko !== null && now < ko && p.result !== "win" && p.result !== "loss") {
      nonVerifiables.push({ n: null, jour: j, raison: "pari " + k + " pas encore scelle (coup d'envoi a venir)" });
      return;
    }
    erreurHorsChaine("j|" + k + "|" + j, "pari hors chaine " + k + " (" + j + ") : aucun maillon ce jour-la" + (debut ? ", avant le premier jour au format 3 (" + debut + ")" : "") + ", jamais scelle");
  });
  // Chaque pari d'une journee au format 3 est scelle, ou declare non scelle.
  if (debut) {
    Object.keys(jours).sort().forEach(function (jour) {
      const scelles = scellesFormat3(registre, jour), declares = declarationsDuJour(registre, jour), ancien = dernierAncien(registre, jour);
      const vus = {};
      parisSimplesDuJour(predictions, jour).forEach(function (p) {
        const k = String(p.fixture_id);
        if (vus[k] || scelles[k] || couvertParAncien(p, ancien)) return;
        vus[k] = true;
        const d = declares[k];
        if (d && declareApresCoup(d, p, jour)) {
          if (expliques[jour + "|" + k]) avertissements.push("pari " + k + " (" + jour + ") : ajoute apres coup, non scelle (note publique dans preuves/corrections.json), pas de preuve pour ce pari");
          else erreurs.push("pari " + k + " (" + jour + ") : declare non scelle a l'heure de son coup d'envoi ou apres (ajoute apres coup ?), sans note publique dans preuves/corrections.json");
          return;
        }
        if (d) { avertissements.push("pari " + k + " (" + jour + ") : non scelle (" + d.raison + "), pas de preuve pour ce pari"); return; }
        // Coup d'envoi a venir ET pas encore regle (mathematicien, 23/10, tour 6) : un pari deja gagne ou
        // perdu dont le coup d'envoi est ecrit dans le futur (2099) est une erreur, comme hors chaine.
        const ko = ms(p.kickoff_at);
        if (ko !== null && now < ko && p.result !== "win" && p.result !== "loss") { nonVerifiables.push({ n: null, jour: jour, raison: "pari " + k + " pas encore scelle (coup d'envoi a venir)" }); return; }
        erreurs.push("pari " + k + " (" + jour + ") : ni scelle ni declare non scelle (ajoute apres coup ?)");
      });
    });
  }
  return { ok: !erreurs.length, erreurs: erreurs, avertissements: avertissements, verifies: verifies, non_verifiables: nonVerifiables };
}

// JOURNEE A FIGER EN CLAIR dans preuves/paris-scelles/<jour>.json (pipeline) : tous ses
// maillons scelles ont leur sel revele et sont verifies, aucun pari masque, et CHAQUE pari de
// la journee est regle (journeeReglee : jamais un pari en attente ecrit en clair, meme si le
// sel du jour est deja public, cas du 21/10). -> { ok, raison }
// Journee au format 3 faite seulement de declarations (aucun sel) : figee aussi une fois reglee,
// sinon historique.json la garderait pour toujours (fenetreJourneesEntieres).
function journeeAFiger(registre, predictions, jour, verifies, nowMs) {
  const tous = maillonsDuJour(registre, jour);
  const ms3 = tous.filter(function (m) { return m.type !== "non_scelle"; });
  if (!ms3.length && !tous.some(estF3)) return { ok: false, raison: "aucun maillon scelle" };
  if (ms3.some(function (m) { return !m.sel_revele; })) return { ok: false, raison: "sel pas encore revele" };
  if (!ms3.every(function (m) { return (verifies || []).indexOf(m.n) !== -1; })) return { ok: false, raison: "maillon non verifie" };
  const du = parisSimplesDuJour(predictions, jour);
  if (!du.length) return { ok: false, raison: "aucun pari dans les donnees" };
  if (du.some(estMasque)) return { ok: false, raison: "pari masque" };
  const r = journeeReglee(predictions, jour, nowMs);
  if (!r.ok) return { ok: false, raison: "pari(s) pas encore regle(s) : " + r.en_attente.join(", ") };
  return { ok: true, raison: "" };
}

// La nouvelle chaine prolonge l'ancienne (ajout seulement) : memes maillons, dans le meme
// ordre ; seul un sel absent peut etre ajoute (sel_revele). -> liste d'ecarts.
function prolonge(ancien, nouveau) {
  const a = (ancien && ancien.chaine) || [], b = (nouveau && nouveau.chaine) || [];
  const ecarts = [];
  if (b.length < a.length) ecarts.push("la nouvelle chaine a " + b.length + " maillons, l'ancienne " + a.length);
  a.forEach(function (m, i) {
    const x = b[i];
    if (!x) return;
    const sansSel = function (o) { const c = Object.assign({}, o); delete c.sel_revele; return canon(c); };
    if (sansSel(m) !== sansSel(x)) ecarts.push("maillon " + (i + 1) + " modifie");
    if (m.sel_revele && x.sel_revele !== m.sel_revele) ecarts.push("maillon " + (i + 1) + " : sel revele modifie");
  });
  return ecarts;
}

// FENETRE DE historique.json EN JOURNEES ENTIERES (23/10/2026) : les `max` lignes les plus
// recentes, plus le reste des journees dont elles ont deja une ligne. Une journee n'est
// jamais coupee en deux par la limite (sinon sa verification publique tombait en echec).
// opts = { registre, figees: [jours deja dans preuves/paris-scelles/] } (A2, 23/10) : toute journee
// ayant un maillon au format 3 et pas encore figee est gardee entiere, quelle que soit la limite
// (sinon ses paris sortiraient des donnees publiques : erreur de la verification). Registre
// illisible (opts.registre null) ou mal forme (chaine qui n'est pas un tableau, avocat du diable
// 23/10 : l'exception sortait du try/catch du pipeline) : rien n'est coupe.
function fenetreJourneesEntieres(predictions, max, opts) {
  const liste = Array.isArray(predictions) ? predictions : [];
  if (liste.length <= max) return liste.slice();
  if (opts && (!opts.registre || !Array.isArray(opts.registre.chaine))) return liste.slice();
  const jourDe = function (p) { const j = /^(\d{4}-\d{2}-\d{2})/.exec(String((p && p.date) || "")); return j ? j[1] : null; };
  const jours = {};
  liste.slice(0, max).forEach(function (p) { const j = jourDe(p); if (j) jours[j] = true; });
  if (opts && opts.registre) {
    const figees = {};
    (Array.isArray(opts.figees) ? opts.figees : []).forEach(function (j) { figees[String(j).slice(0, 10)] = true; });
    // M2 (23/10, tour 6) : aussi toute journee dont un maillon n'a pas son sel revele (ancien format compris) :
    // sortie de la fenetre avant la revelation, son sel ne serait jamais revele (paris absents) et
    // l'alerte « sel en retard » serait fausse.
    opts.registre.chaine.forEach(function (m) { if ((estF3(m) || !m.sel_revele) && !figees[m.jour]) jours[m.jour] = true; });
  }
  return liste.filter(function (p, i) { return i < max || (jourDe(p) !== null && jours[jourDe(p)] === true); });
}

// DONNEES DE LA VERIFICATION, FUSION PAR JOURNEE (M3, mathematicien 23/10, tour 6) : historique.json
// (le bilan publie se calcule dessus) + journees figees de preuves/paris-scelles/. Un fichier fige
// n'est ajoute que si sa journee n'a AUCUN pari simple dans historique.json : une journee presente est
// verifiee sur historique.json seul. Avant, la fusion se faisait pari par pari : les perdants d'une
// journee figee retires de historique.json etaient combles par le fichier fige ; la verification ne
// changeait pas d'un caractere alors que le bilan, calcule sur historique.json seul, montait.
// La fenetre de historique.json ne retire que les journees figees les plus anciennes (journees entieres,
// les plus recentes d'abord) : une journee figee absente alors qu'une journee figee plus ancienne est
// encore presente = ERREUR (journee entiere retiree du bilan).
// Utilisee par scripts/verifier-empreintes.js et par le pipeline (update-data.yml), meme regle.
// figees : { "AAAA-MM-JJ": [paris du fichier fige] }. -> { paris, erreurs, presentes, absentes }
function fusionnerFigees(predictions, figees) {
  const paris = [];
  const joursHisto = {};
  (Array.isArray(predictions) ? predictions : []).forEach(function (p) {
    paris.push(p);
    if (p && (p.type || "single") === "single") joursHisto[String(p.date || "").slice(0, 10)] = true;
  });
  const presentes = [], absentes = [];
  Object.keys(figees || {}).filter(function (j) { return /^\d{4}-\d{2}-\d{2}$/.test(j); }).sort().forEach(function (jour) {
    if (joursHisto[jour]) { presentes.push(jour); return; }
    absentes.push(jour);
    (Array.isArray(figees[jour]) ? figees[jour] : []).forEach(function (p) { paris.push(p); });
  });
  const plusAncienne = presentes[0];
  const erreurs = absentes.filter(function (j) { return plusAncienne !== undefined && j > plusAncienne; }).map(function (j) {
    return "journee " + j + " figee (preuves/paris-scelles/) mais retiree de historique.json alors que des journees figees plus anciennes y restent (" + plusAncienne + ")";
  });
  return { paris: paris, erreurs: erreurs, presentes: presentes, absentes: absentes };
}

// preuves/paris-scelles/ EN AJOUT SEULEMENT (A2, 23/10) : chaque fichier du dernier commit doit
// etre encore la, a l'identique. avant/apres : { "AAAA-MM-JJ.json": texte }. -> liste d'ecarts.
function dossierAjoutSeulement(avant, apres) {
  const ecarts = [];
  Object.keys(avant || {}).sort().forEach(function (f) {
    if (!apres || !Object.prototype.hasOwnProperty.call(apres, f)) ecarts.push("preuves/paris-scelles/" + f + " supprime");
    else if (String(apres[f]) !== String(avant[f])) ecarts.push("preuves/paris-scelles/" + f + " modifie");
  });
  return ecarts;
}

module.exports = {
  GENESE: GENESE, VERSION: VERSION, FORMAT: FORMAT, CHAMPS: CHAMPS, EXPLICATION: EXPLICATION, MARGE_REVELATION_MS: MARGE_REVELATION_MS,
  canon: canon, sel: sel, nombre: nombre, parisDuJour: parisDuJour, empreinteParis: empreinteParis, empreinteMaillon: empreinteMaillon,
  etatAu: etatAu, jourDeParis: jourDeParis, jourUTC: jourUTC, fenetreJourneesEntieres: fenetreJourneesEntieres, vide: vide, ajouter: ajouter, corriger: corriger,
  declarerNonScelles: declarerNonScelles, revelerSels: revelerSels, verifier: verifier, prolonge: prolonge, premierJourFormat3: premierJourFormat3,
  journeeReglee: journeeReglee, journeeAFiger: journeeAFiger, RAISON_APRES_COUP: RAISON_APRES_COUP, REECRITURES_MOTEUR_CONNUES: REECRITURES_MOTEUR_CONNUES,
  RAISON_SANS_HEURE: RAISON_SANS_HEURE, DELAI_SEL_MS: DELAI_SEL_MS, dossierAjoutSeulement: dossierAjoutSeulement, fusionnerFigees: fusionnerFigees,
};
