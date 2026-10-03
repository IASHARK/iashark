"use strict";
// DECOUPAGE DU FICHIER PUBLIC data.json (perf, 14/09/2026).
//
// data.json pesait ~25 Mo (14 Mo minifie), dont ~12,9 Mo pour le seul
// champ player_history (historique brut match par match de chaque joueur)
// et ~0,55 Mo pour current_squads. L'accueil, /marches et la page match le
// telechargeaient en entier a chaque vue, avec ?t=Date.now() qui cassait
// aussi le cache CDN Netlify (cache-status: fwd=stale a chaque requete).
//
// Decoupage :
//   - data-home.json      : liste legere (tous les matchs SANS les champs
//                           de detail ci-dessous) pour l'accueil, /marches,
//                           la vitrine, le choix du match offert, l'admin ;
//   - match/<id>.json     : le match public COMPLET, pour la page match et
//                           la fiche joueur (une seule rencontre chargee).
//
// SECURITE : ce module ne retire AUCUN champ premium et n'en ajoute aucun.
// Il recoit la copie deja assainie (matchsPublics dans le pipeline) et ne
// fait que la ranger dans des fichiers plus petits : les nouveaux fichiers
// portent exactement ce que data.json porte deja, jamais plus.
// tests/public-data-split.test.js verifie les fichiers reels sur disque.

// Champs lus uniquement par la page match / la fiche joueur
// (lib/match-view-model.js, lib/display-data.js, lib/insights.js).
// Verifie le 14/09/2026 : aucun n'est lu par index.html, marches.html,
// lib/free-match.js, lib/match-time.js, admin.html ni exemple-analyse.html.
// stade et reliability restent dans la liste (lus par les cartes d'accueil).
const DETAIL_ONLY_FIELDS = [
  "player_history", "current_squads", "lineups",
  "top_scorers", "top_scorers_home", "top_scorers_away",
  "hot_scorer_home", "hot_scorer_away", "hot_assist_home", "hot_assist_away",
  "classement", "injuries", "actu", "key_absences",
  "form_home", "form_away", "forme_h", "forme_a",
  "events_home", "events_away", "h2h",
  "match_stats_home", "match_stats_away",
  "tendances", "fatigue", "fatigue_home", "fatigue_away",
  "crit_home", "crit_away", "scores", "mc_scores",
  "scenario", "scenario_15min", "scenario_i18n",
  "analyse_card", "analyse_card_i18n", "contexte", "contexte_i18n",
  "conseil_public", "conseil_public_i18n", "decision_factors", "risk_principal",
  "paris_safe", "paris_risque", "pinnacle_snapshot", "arbitre",
];

// Champs premium : ne doivent JAMAIS figurer dans un fichier public, sauf
// sur le match offert (is_free === true). Liste UNIQUE dans lib/premium-fields.js
// (pipeline, fonction Edge par copie verifiee, pages SEO, tests). Certains champs
// de detail ci-dessus sont aussi premium : ils n existent alors que sur le match
// offert, le decoupage ne fait que les ranger.
const PREMIUM = require("./premium-fields.js");
const PREMIUM_FIELDS = PREMIUM.PREMIUM_FIELDS;

// CHAMPS PUBLICS DERIVES (16/09/2026) :
//   - prob_band : niveau GROSSIER de la probabilite du pari retenu, 3 valeurs
//     seulement ("high" >= 75 %, "good" >= 65 %, "moderate" < 65 %), absent sans
//     analyse. Jamais la valeur exacte, jamais le marche (qui restent premium).
//     Calcule cote serveur (pipeline, avant retrait des champs premium) ; une
//     copie deja assainie garde le niveau qu'elle porte. Porte par la copie
//     publique elle-meme : liste d'accueil, match/<id>.json ET PRELOADED_MATCH
//     des pages statiques (preloadedMatch) - la page match l'affiche au visiteur.
//   - derby : { key, name } de l'affiche derby (data/derby-index.json, fichier
//     interne genere par scripts/build-club-hubs.js), donnee sportive publique,
//     ajoute a la liste d'accueil uniquement.
// Aucun de ces deux champs n'est dans lib/premium-fields.js.
const PROB_BANDS = ["high", "good", "moderate"];
const DERBY_INDEX_FILE = "data/derby-index.json";

function hasPick(m) {
  return !!(m && (m.pari_rec || m.market_id || m.has_signal) && !m.no_signal);
}
function probBand(m) {
  if (!hasPick(m)) return null;
  let p = m.model_probability;
  if ((p == null || p === "") && m.conf != null && m.conf !== "") p = Number(m.conf) * 10;
  p = p == null || p === "" ? NaN : Number(p);
  if (!Number.isFinite(p)) return PROB_BANDS.indexOf(m.prob_band) !== -1 ? m.prob_band : null;
  return p >= 75 ? "high" : p >= 65 ? "good" : "moderate";
}
// Copie du match avec prob_band pose (ou retire s'il n'y a pas d'analyse).
function withProbBand(m) {
  if (!m || typeof m !== "object") return m;
  const band = probBand(m);
  const copie = Object.assign({}, m);
  if (band) copie.prob_band = band; else delete copie.prob_band;
  return copie;
}

function derbyKeyOf(m) {
  const a = Number(m && m.home && m.home.id), b = Number(m && m.away && m.away.id);
  if (!a || !b) return null;
  return [a, b].sort(function (x, y) { return x - y; }).join("-");
}
// { key, name } si la paire d'equipes figure dans l'index des derbies.
function derbyFor(m, index) {
  const pairs = index && index.pairs;
  const k = derbyKeyOf(m);
  const d = pairs && k && Object.prototype.hasOwnProperty.call(pairs, k) ? pairs[k] : null;
  if (!d || !d.key) return null;
  const pages = d.pages || {};
  const first = Object.keys(pages).map(function (dir) { return pages[dir]; }).filter(function (p) { return p && p.name; })[0];
  return { key: String(d.key), name: String((first && first.name) || d.key) };
}
function loadDerbyIndex(fs, baseDir) {
  const path = require("path");
  try { return JSON.parse(fs.readFileSync(path.join(baseDir || ".", DERBY_INDEX_FILE), "utf8")); } catch (e) { return null; }
}

const LIST_FILE = "data-home.json";
const DETAIL_DIR = "match";

function isSafeId(id) {
  return /^\d{1,12}$/.test(String(id));
}
function detailPath(id) {
  return DETAIL_DIR + "/" + id + ".json";
}

// Version legere d'un match : memes champs, moins le detail. detail_omitted
// dit au client qu'il doit charger match/<id>.json pour la page complete.
// derbyIndex (optionnel) : contenu de data/derby-index.json.
function toListMatch(m, derbyIndex) {
  if (!m || typeof m !== "object") return m;
  const copie = {};
  Object.keys(m).forEach(function (k) {
    if (DETAIL_ONLY_FIELDS.indexOf(k) === -1) copie[k] = m[k];
  });
  if (derbyIndex) {
    const derby = derbyFor(m, derbyIndex);
    if (derby) copie.derby = derby; else delete copie.derby;
  }
  copie.detail_omitted = true;
  return copie;
}

// PRELOADED_MATCH des pages statiques /match/<id>.html (pipeline,
// scripts/seo-pages.js) : version legere de la copie publique, champs premium
// retires (sauf match offert), niveau prob_band pose s'il est calculable ou deja
// porte - jamais la valeur exacte.
function preloadedMatch(m) {
  if (!m || typeof m !== "object") return m;
  return toListMatch(PREMIUM.stripPremium(m.is_free === true ? m : withProbBand(m)));
}

// meta : { generated_at, run_id } - identifiant de generation (jamais de
// donnee de pari : run_output n'est volontairement PAS recopie ici) ;
// meta.derbyIndex (optionnel) : data/derby-index.json pour le champ derby.
function buildPublicSplit(matchsPublics, meta) {
  const matchs = Array.isArray(matchsPublics) ? matchsPublics.filter(Boolean) : [];
  const info = meta || {};
  const list = {
    generated_at: info.generated_at || null,
    run_id: info.run_id || null,
    detail_fields: DETAIL_ONLY_FIELDS.slice(),
    matchs: matchs.map(function (m) { return toListMatch(m, info.derbyIndex || null); }),
  };
  const details = matchs
    .filter(function (m) { return m.id != null && isSafeId(m.id); })
    .map(function (m) { return { id: String(m.id), path: detailPath(m.id), match: m }; });
  return { list: list, details: details };
}

// Ecrit data-home.json et match/<id>.json (JSON minifie). Le nettoyage des
// match/<id>.json perimes est fait par generateMatchPages() dans le pipeline
// (meme repertoire, meme liste de fichiers a conserver).
function writePublicSplit(fs, matchsPublics, meta, baseDir) {
  const path = require("path");
  const root = baseDir || ".";
  const info = Object.assign({}, meta || {});
  if (info.derbyIndex === undefined) info.derbyIndex = loadDerbyIndex(fs, root);
  const split = buildPublicSplit(matchsPublics, info);
  const dir = path.join(root, DETAIL_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const listJson = JSON.stringify(split.list);
  fs.writeFileSync(path.join(root, LIST_FILE), listJson);
  let detailBytes = 0;
  split.details.forEach(function (d) {
    const json = JSON.stringify(d.match);
    detailBytes += Buffer.byteLength(json);
    fs.writeFileSync(path.join(root, d.path), json);
  });
  return { listBytes: Buffer.byteLength(listJson), detailCount: split.details.length, detailBytes: detailBytes };
}

// Controle de fuite : liste des champs premium presents sur un match non offert.
function premiumLeaks(m) {
  return PREMIUM.premiumLeaks(m);
}

module.exports = {
  DETAIL_ONLY_FIELDS: DETAIL_ONLY_FIELDS,
  PREMIUM_FIELDS: PREMIUM_FIELDS,
  LIST_FILE: LIST_FILE,
  DETAIL_DIR: DETAIL_DIR,
  isSafeId: isSafeId,
  detailPath: detailPath,
  toListMatch: toListMatch,
  preloadedMatch: preloadedMatch,
  buildPublicSplit: buildPublicSplit,
  writePublicSplit: writePublicSplit,
  premiumLeaks: premiumLeaks,
  PROB_BANDS: PROB_BANDS,
  probBand: probBand,
  withProbBand: withProbBand,
  derbyFor: derbyFor,
  derbyKeyOf: derbyKeyOf,
  loadDerbyIndex: loadDerbyIndex,
};
