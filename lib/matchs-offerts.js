"use strict";
// ARCHIVE DES MATCHS OFFERTS (mathematicien, 29/09/2026) : chaque match offert est
// archive avec la cote affichee au moment ou il est designe, puis sa cote de
// cloture (releve closing-odds.yml, match_snapshots 'closing', dans les 3 h avant
// le coup d'envoi). But : mesurer la CLV du « match offert v3 » sur plusieurs
// centaines de jours. Fichier public : preuves/matchs-offerts.json. Ajout seulement :
// une entree n'est jamais retiree, seule sa cote de cloture est completee, une fois.
//
// PARI MASQUE JUSQU'AU COUP D'ENVOI (decision de Clement du 04/10/2026, avocat du diable
// point 6) : le pari du match offert n'est plus public avant le match (il est servi aux
// comptes connectes par la fonction match-data). L'entree est donc ecrite a la designation
// (jour, match, heure de designation) avec le pari, le marche, la chance et la cote a null
// et masque : true ; une fois le coup d'envoi passe, ils sont devoiles depuis la ligne
// match_premium_data du match (le pari publie, fige jusqu'au coup d'envoi : celui que les
// comptes ont vu), avec l'heure du devoilement. Sans ligne lisible, l'entree reste masquee
// (jamais un pari invente, jamais une entree retiree).

// market_id du site -> cle de lib/odds.js#parseOdds (cotes de cloture).
const CLE_COTE = {
  "home-win": "c1", "draw": "cn", "away-win": "c2",
  "over-15": "co15", "over-25": "co25", "under-25": "cu25", "over-35": "co35",
  "dc-1x": "dc1x", "dc-x2": "dc2x", "dc-12": "dc12",
  "btts-yes": "btts_oui", "btts-no": "btts_non",
};

const { parisLocalToMs } = require("./kickoff-guard.js");

function num(v) { const x = Number(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(x) && x > 1 ? x : null; }

const EXPLICATION = "Chaque match offert, avec la cote affichee quand il a ete designe et sa cote de cloture (dernier releve dans les 3 heures avant le coup d'envoi). Sert a mesurer la valeur du match offert dans le temps. Depuis le 04/10/2026, le pari, la chance et la cote restent masques jusqu'au coup d'envoi (masque : true), puis sont devoiles tels qu'ils ont ete publies. Rien n'est retire.";
// Champs du pari, masques jusqu'au coup d'envoi.
const CHAMPS_PARI = ["pari", "market_id", "probabilite", "chance_iashark", "cote_affichee"];

function vide() {
  return { version: 1, explication: EXPLICATION, matchs: [] };
}

function commence(x, nowMs) {
  const ko = parisLocalToMs(x && x.coup_envoi);
  const t = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return ko !== null && t >= ko;
}
function masquer(x) {
  CHAMPS_PARI.forEach(function (k) { x[k] = null; });
  x.masque = true;
}

// elus : matchs designes offerts ce run ({ id, date, home, away, league, pari_rec,
// market_id, cote_rec, model_probability, moteur_v3 }). opts : { nowIso, versionAncien,
// nowMs }. Un match pas encore commence est archive avec son pari MASQUE. -> nombre d'ajouts.
function enregistrer(registre, elus, opts) {
  opts = opts || {};
  registre.explication = EXPLICATION;
  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : (Date.parse(String(opts.nowIso || "")) || Date.now());
  let n = 0;
  (elus || []).forEach(function (m) {
    if (!m || m.id == null || !m.pari_rec) return;
    const jour = String(m.date || "").slice(0, 10);
    const deja = registre.matchs.some(function (x) { return x.fixture_id === Number(m.id) && x.jour === jour; });
    if (deja) return;
    const v3 = !!(m.v3_pari && m.moteur_v3 && m.moteur_v3.source === "v3");
    registre.matchs.push({
      jour: jour,
      fixture_id: Number(m.id),
      match: ((m.home && m.home.n) || "") + " - " + ((m.away && m.away.n) || ""),
      ligue: m.league || null,
      coup_envoi: m.date || null,
      pari: m.pari_rec,
      market_id: m.market_id || null,
      probabilite: m.model_probability != null ? Number(m.model_probability) : null,
      // Chance IASHARK affichee (une seule source, 01/10/2026 : lib/chance-iashark.js).
      chance_iashark: m.chance_iashark != null && m.chance_iashark !== "" ? Number(m.chance_iashark) : null,
      cote_affichee: num(m.cote_rec),
      moteur: v3 ? "v3" : "ancien",
      moteur_version: v3 ? (m.moteur_v3.version_moteur || null) : (opts.versionAncien || null),
      designe_le: opts.nowIso || new Date().toISOString(),
      cote_cloture: null,
      cloture_relevee_le: null,
    });
    const x = registre.matchs[registre.matchs.length - 1];
    if (!commence(x, nowMs)) masquer(x);
    n++;
  });
  return n;
}

// Entrees en clair d'un match pas encore commence (ecrites avant le 04/10/2026) : masquees.
// Leur pari est devoile apres le coup d'envoi comme les autres. -> nombre d'entrees masquees.
function masquerAvantCoupEnvoi(registre, nowMs) {
  let n = 0;
  registre.matchs.forEach(function (x) {
    if (!x || x.masque === true || commence(x, nowMs)) return;
    if (!CHAMPS_PARI.some(function (k) { return x[k] != null; })) return;
    masquer(x);
    n++;
  });
  return n;
}

// Fixtures dont le pari masque peut etre devoile (coup d'envoi passe).
function aReveler(registre, nowMs) {
  return registre.matchs.filter(function (x) { return x && x.masque === true && commence(x, nowMs); }).map(function (x) { return x.fixture_id; });
}

// lignes : match_premium_data ({ fixture_id, pari_rec, market_id, cote_rec, model_probability,
// premium_fields: { chance_iashark } }). Seulement apres le coup d'envoi. -> nombre devoiles.
function reveler(registre, lignes, nowMs, nowIso) {
  const parId = {};
  (lignes || []).forEach(function (r) { if (r && r.fixture_id != null && r.pari_rec) parId[String(r.fixture_id)] = r; });
  let n = 0;
  registre.matchs.forEach(function (x) {
    if (!x || x.masque !== true || !commence(x, nowMs)) return;
    const r = parId[String(x.fixture_id)];
    if (!r) return;
    const pf = r.premium_fields && typeof r.premium_fields === "object" ? r.premium_fields : {};
    x.pari = r.pari_rec;
    x.market_id = r.market_id || null;
    x.probabilite = r.model_probability != null ? Number(r.model_probability) : null;
    x.chance_iashark = pf.chance_iashark != null && pf.chance_iashark !== "" ? Number(pf.chance_iashark) : x.probabilite;
    x.cote_affichee = num(r.cote_rec);
    delete x.masque;
    x.devoile_le = nowIso || new Date(Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()).toISOString();
    n++;
  });
  return n;
}

// Fixtures dont la cote de cloture reste a lire.
function aCompleter(registre) {
  return registre.matchs.filter(function (x) { return x.cloture_relevee_le == null; }).map(function (x) { return x.fixture_id; });
}

// snapshots : lignes match_snapshots 'closing' ({ fixture_id, captured_at, raw_inputs: { odds } }).
// Une cote de cloture absente pour ce marche reste null, mais le releve est note.
// termine(x) : vrai si le coup d'envoi est passe (sinon le releve peut encore changer).
// COTE DE CLOTURE = le DERNIER releve pris AVANT le coup d'envoi (ronde 5, 30/09/2026).
// Avant, la derniere ligne renvoyee par la base gagnait : sans tri, un releve plus ancien
// (ou pris apres le coup d'envoi, cote en direct) pouvait passer pour la cloture. Un
// releve sans heure lisible, ou un coup d'envoi illisible, ne prouve rien : ignore.
function heure(v) { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; }
function completerClotures(registre, snapshots, termine) {
  const parId = {};
  (snapshots || []).forEach(function (s) {
    if (!s || s.fixture_id == null || heure(s.captured_at) === null) return;
    const k = String(s.fixture_id);
    (parId[k] = parId[k] || []).push(s);
  });
  let n = 0;
  registre.matchs.forEach(function (x) {
    if (x.cloture_relevee_le != null) return;
    // Pari encore masque (pas devoile) : marche inconnu, la cloture attend le devoilement.
    if (x.masque === true) return;
    if (typeof termine === "function" && !termine(x)) return;
    const ko = parisLocalToMs(x.coup_envoi);
    if (ko === null) return;
    const s = (parId[String(x.fixture_id)] || [])
      .filter(function (r) { return heure(r.captured_at) < ko; })
      .sort(function (a, b) { return heure(b.captured_at) - heure(a.captured_at); })[0];
    if (!s) return;
    const odds = s.raw_inputs && s.raw_inputs.odds ? s.raw_inputs.odds : {};
    const cle = CLE_COTE[x.market_id];
    x.cote_cloture = cle ? num(odds[cle]) : null;
    x.cloture_relevee_le = s.captured_at || null;
    if (x.cloture_relevee_le == null) return;
    n++;
  });
  return n;
}

module.exports = { CLE_COTE: CLE_COTE, CHAMPS_PARI: CHAMPS_PARI, vide: vide, enregistrer: enregistrer, masquerAvantCoupEnvoi: masquerAvantCoupEnvoi,
  aReveler: aReveler, reveler: reveler, aCompleter: aCompleter, completerClotures: completerClotures };
