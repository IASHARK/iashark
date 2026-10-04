"use strict";
// BUTEURS FIGES (regle de Clement du 04/10/2026, 20 h) :
//
//   « Chaque decision affichee ne doit plus jamais changer, qu'elle soit pour aujourd'hui ou pour
//     demain. Seule exception : les buteurs, si le joueur n'est pas dans la composition. »
//
// Les buteurs d'une page match (v3_buteurs : buteurs probables du moteur v3 ; v3_premiers_buteurs :
// premier buteur ; top_scorers : ancien calcul) etaient recalcules a chaque calcul et suivaient les
// absences annoncees (lib/pick-freeze.js#LIVE_PREMIUM_FIELDS). Desormais, une liste deja servie
// (premium_fields de la ligne match_premium_data relue avant le calcul) reste EXACTEMENT celle-la
// (memes joueurs, memes chiffres, meme ordre). Un joueur n'est REMPLACE (ou retire) que s'il est
// ABSENT (absenceDe), avant le coup d'envoi (garde ouverte, lib/kickoff-guard.js) :
//   1. « absent_composition » : la composition OFFICIELLE de son equipe est publiee (m.lineups,
//      /fixtures/lineups d'API-Football, environ 1 h avant le coup d'envoi ; 11 titulaires lus) et
//      il n'y est pas titulaire (ni par son numero, ni par son nom : sur un doute, il reste) ;
//   2. « absent_annonce » : API-Football l'annonce absent pour CE match (m.injuries, type autre que
//      « Questionable » ; complement demande par Clement le 04/10/2026 : un joueur parti du
//      rassemblement ou blesse dans la journee ne reste pas propose) ;
//   3. « hors_effectif » : l'effectif convoque de son equipe est connu (m.effectif, releve leger des
//      jours de match pour les selections nationales, au moins 15 joueurs) et il n'y est pas.
// Remplacant : le plus probable du calcul du jour qui n'est pas deja dans la liste, titulaire si la
// composition de son equipe est publiee, de la meme equipe pour les buteurs par equipe
// (v3_buteurs) ; aucun : le joueur est retire (on n'affiche jamais un joueur absent de la
// composition officielle). Une liste jamais servie : le calcul du jour (premiere publication).
// Match ferme sans analyse (commence sans pari, reporte, annule) : rien n'est restaure ; match
// commence dont l'analyse publiee est restauree (pick_closed) : la liste publiee, sans remplacement.
// Interrupteur d'urgence du moteur v3 et premier buteur sans feu vert du mathematicien : jamais
// restaures (ce sont des arrets voulus, pas un recalcul).
// Le buteur du jour (table tickets_du_jour) suit la meme exception : lib/tickets-du-jour.js.
// Pur : aucune E/S ; les listes sont recopiees (jamais partagees avec la ligne precedente).

const { kickoffGate, KICKOFF_MARGIN_MINUTES } = require("./kickoff-guard.js");

let VERDICTS_MATHS = {};
try { VERDICTS_MATHS = require("../config/verdicts-maths.json"); } catch (_e) { VERDICTS_MATHS = {}; }

const TITULAIRES_MIN = 11;
const PARTICULES = ["van", "von", "der", "den", "dos", "das", "del", "della", "ben", "bin", "mac", "les", "san"];

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function clone(v) { return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; }
function normaliser(nom) {
  return String(nom == null ? "" : nom).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}
// Mots d'un nom qui identifient le joueur (jamais une initiale « K. » ni une particule).
function motsDuNom(nom) {
  return normaliser(nom).split(" ").filter(function (w) { return w.length >= 3 && PARTICULES.indexOf(w) === -1; });
}
function numero(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

// Titulaires de la composition OFFICIELLE d'un cote (« home » / « away »), ou null si elle n'est pas
// publiee (moins de 11 titulaires lus : jamais une composition partielle).
function titulaires(m, cote) {
  const l = m && estObjet(m.lineups) ? m.lineups[cote] : null;
  const xi = l && Array.isArray(l.startXI) ? l.startXI.filter(function (p) { return p && (numero(p.id) !== null || normaliser(p.name)); }) : [];
  return xi.length >= TITULAIRES_MIN ? xi : null;
}

// joueur : { id, nom } ; cote : « home » | « away » | autre (equipe inconnue : les deux compositions).
// -> true (titulaire), false (composition officielle publiee et il n'y est pas), null (on ne sait pas :
// composition pas encore publiee).
// Meme joueur, pour une liste d'ABSENTS (jamais retirer un joueur sur une ressemblance) : meme numero
// quand les deux en ont un ; sinon meme nom, ou meme nom de famille avec la meme initiale (« C. Ronaldo »).
function memeJoueur(a, b) {
  const ia = numero(a && a.id), ib = numero(b && b.id);
  if (ia !== null && ib !== null) return ia === ib;
  const na = normaliser(a && a.nom), nb = normaliser(b && b.nom);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(" "), tb = nb.split(" ");
  return ta.length > 1 && tb.length > 1 && ta[ta.length - 1] === tb[tb.length - 1] && ta[0][0] === tb[0][0];
}
// Equipe (« home » / « away ») d'un numero d'equipe API-Football, ou null.
function coteDeLEquipe(m, teamId) {
  const t = numero(teamId);
  if (t === null) return null;
  if (t === numero(m && m.home && m.home.id)) return "home";
  if (t === numero(m && m.away && m.away.id)) return "away";
  return null;
}
const EFFECTIF_MIN = 15;

function estTitulaire(m, joueur, cote) {
  const cotes = cote === "home" || cote === "away" ? [cote] : ["home", "away"];
  const listes = cotes.map(function (c) { return titulaires(m, c); });
  if (listes.some(function (l) { return l === null; })) return null;
  const id = numero(joueur && joueur.id);
  const nom = normaliser(joueur && joueur.nom);
  const mots = motsDuNom(joueur && joueur.nom);
  if (id === null && !nom) return null;
  const present = listes.some(function (xi) {
    return xi.some(function (p) {
      if (id !== null && numero(p.id) === id) return true;
      if (nom && normaliser(p.name) === nom) return true;
      // Meme joueur ecrit autrement (« K. Mbappé » / « Kylian Mbappé ») : un mot du nom en commun suffit.
      // Sur un doute, le joueur reste (jamais retire a tort).
      const motsP = motsDuNom(p.name);
      return mots.some(function (w) { return motsP.indexOf(w) !== -1; });
    });
  });
  return present;
}

// Le joueur est-il ABSENT de ce match ? -> « absent_composition » | « absent_annonce » | « hors_effectif »
// | null (present, ou on ne sait pas : il reste).
function absenceDe(m, joueur, cote) {
  if (!m || !joueur) return null;
  if (estTitulaire(m, joueur, cote) === false) return "absent_composition";
  const annonces = Array.isArray(m.injuries) ? m.injuries : [];
  const annonce = annonces.some(function (a) {
    if (!a || /questionable/i.test(String(a.type || ""))) return false;
    const c = coteDeLEquipe(m, a.team);
    if (c && (cote === "home" || cote === "away") && c !== cote) return false;
    return memeJoueur({ id: a.player_id, nom: a.name }, joueur);
  });
  if (annonce) return "absent_annonce";
  const effectif = estObjet(m.effectif) ? m.effectif : null;
  if (effectif && (cote === "home" || cote === "away")) {
    const liste = Array.isArray(effectif[cote]) ? effectif[cote] : [];
    if (liste.length >= EFFECTIF_MIN) {
      const id = numero(joueur.id), mots = motsDuNom(joueur.nom), nom = normaliser(joueur.nom);
      const dedans = liste.some(function (p) {
        if (!p) return false;
        if (id !== null && numero(p.id) === id) return true;
        if (nom && normaliser(p.name) === nom) return true;
        const motsP = motsDuNom(p.name);
        return mots.some(function (w) { return motsP.indexOf(w) !== -1; });
      });
      if (!dedans) return "hors_effectif";
    }
  }
  return null;
}

// Identite d'une entree de liste -> { id, nom, cote }.
function identV3(e) { return { id: e && e.joueur_id, nom: e && e.joueur, cote: e && e.cote }; }
function identTop(m) {
  const idDom = numero(m && m.home && m.home.id), idExt = numero(m && m.away && m.away.id);
  return function (e) {
    const t = numero(e && e.team_id);
    return { id: e && e.player_id, nom: e && e.name, cote: t !== null && t === idDom ? "home" : t !== null && t === idExt ? "away" : null };
  };
}
const CHAMPS = {
  v3_buteurs: { v3: true, memeCote: true },
  v3_premiers_buteurs: { v3: true, memeCote: false },
  top_scorers: { v3: false, memeCote: false },
};

// publiee : liste servie au calcul precedent ; fraiche : calcul du jour ; m : match du jour (compositions).
// opts : { ident(entree) -> {id, nom, cote}, memeCote, ouvert (garde coup d'envoi ouverte) }.
// -> { liste, remplaces, retires, fige } (fige : false = aucune liste servie, calcul du jour garde).
function figerListe(publiee, fraiche, m, opts) {
  opts = opts || {};
  if (!Array.isArray(publiee) || !publiee.length) return { liste: fraiche, remplaces: 0, retires: 0, fige: false };
  const ident = opts.ident || identV3;
  const cle = function (e) {
    const j = ident(e);
    return numero(j.id) !== null ? "id:" + numero(j.id) : "nom:" + normaliser(j.nom);
  };
  const deja = {};
  publiee.forEach(function (e) { if (e) deja[cle(e)] = true; });
  const reserve = (Array.isArray(fraiche) ? fraiche : []).filter(function (e) {
    if (!e || deja[cle(e)]) return false;
    const j = ident(e);
    return absenceDe(m, j, j.cote) === null;
  });
  const liste = [];
  let remplaces = 0, retires = 0;
  publiee.forEach(function (e) {
    if (!e) return;
    const j = ident(e);
    if (!opts.ouvert || absenceDe(m, j, j.cote) === null) { liste.push(clone(e)); return; }
    const i = reserve.findIndex(function (r) { return !opts.memeCote || ident(r).cote === j.cote; });
    if (i === -1) { retires++; return; }
    liste.push(clone(reserve[i]));
    reserve.splice(i, 1);
    remplaces++;
  });
  return { liste: liste, remplaces: remplaces, retires: retires, fige: true };
}

// premium_fields d'une ligne match_premium_data (colonne, sinon raw_response.premium_fields).
function payloadDe(row) {
  if (row && estObjet(row.premium_fields)) return row.premium_fields;
  const raw = row && estObjet(row.raw_response) ? row.raw_response : null;
  return raw && estObjet(raw.premium_fields) ? raw.premium_fields : {};
}

// Pipeline : pose sur chaque match les listes de buteurs deja servies (avec l'exception composition).
// lignesPrecedentes : { "<fixture>": ligne match_premium_data relue avant le calcul } (lirePublicationsPrecedentes).
// opts : { nowMs, fixtureById, champs (defaut : les trois), verdicts }.
// -> { figes, remplaces, retires } (compteurs seulement, jamais un joueur).
function figerButeurs(matchs, lignesPrecedentes, opts) {
  opts = opts || {};
  const champs = Array.isArray(opts.champs) ? opts.champs : Object.keys(CHAMPS);
  const verdicts = opts.verdicts || VERDICTS_MATHS;
  const premierGo = !!(verdicts && verdicts.match && verdicts.match.premier_buteur === "GO");
  const nowMs = numero(opts.nowMs) !== null ? numero(opts.nowMs) : Date.now();
  const rapport = { figes: 0, remplaces: 0, retires: 0 };
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || m.id == null) return;
    const row = estObjet(lignesPrecedentes) ? lignesPrecedentes[String(m.id)] : null;
    if (!row || (row.fixture_id != null && String(row.fixture_id) !== String(m.id))) return;
    // Match ferme sans analyse (commence sans pari, reporte, annule) : rien a servir.
    const ferme = /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String(m.no_signal_reason || ""));
    if (ferme && m.pick_closed !== true) return;
    const urgence = !!(m.moteur_v3 && m.moteur_v3.raison === "MOTEUR_V3_URGENCE");
    const fx = opts.fixtureById ? opts.fixtureById[String(m.id)] : null;
    const ouvert = !ferme && m.pick_closed !== true && !!fx && kickoffGate(fx, nowMs, { marginMinutes: KICKOFF_MARGIN_MINUTES }).open;
    const payload = payloadDe(row);
    champs.forEach(function (k) {
      const def = CHAMPS[k];
      if (!def || (def.v3 && urgence) || (k === "v3_premiers_buteurs" && !premierGo)) return;
      const r = figerListe(payload[k], m[k], m, { ident: def.v3 ? identV3 : identTop(m), memeCote: def.memeCote, ouvert: ouvert });
      if (!r.fige) return;
      if (r.liste.length) m[k] = r.liste; else delete m[k];
      rapport.figes++;
      rapport.remplaces += r.remplaces;
      rapport.retires += r.retires;
    });
  });
  return rapport;
}

// Mise a jour legere des jours de match (scripts/buteurs-jour-de-match.js) : retire des listes deja servies
// (premium_fields) chaque joueur absent, SANS rien recalculer ni remplacer (aucun calcul du jour sous la
// main) et sans toucher a aucun autre champ. -> { premium_fields (copie), retires: { champ: n }, total }.
function retirerAbsents(premiumFields, m) {
  const pf = estObjet(premiumFields) ? clone(premiumFields) : {};
  const retires = {};
  let total = 0;
  Object.keys(CHAMPS).forEach(function (k) {
    if (!Array.isArray(pf[k]) || !pf[k].length) return;
    const ident = CHAMPS[k].v3 ? identV3 : identTop(m);
    const garde = pf[k].filter(function (e) { if (!e) return false; const j = ident(e); return absenceDe(m, j, j.cote) === null; });
    const n = pf[k].length - garde.length;
    if (!n) return;
    pf[k] = garde;
    retires[k] = n;
    total += n;
  });
  return { premium_fields: pf, retires: retires, total: total };
}

module.exports = { estTitulaire, absenceDe, memeJoueur, titulaires, figerListe, figerButeurs, retirerAbsents, identV3, identTop, payloadDe, normaliser, CHAMPS, TITULAIRES_MIN, EFFECTIF_MIN };
