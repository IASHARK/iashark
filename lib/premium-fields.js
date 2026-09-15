"use strict";
// LISTE UNIQUE DES CHAMPS PREMIUM D'UN MATCH (audit fuite de donnees, 14/09/2026).
//
// Regle proprietaire : rien de ce qui constitue le produit payant n'est lisible
// par un visiteur non Pro, nulle part, sauf l'analyse offerte du jour
// (is_free === true). "Produit payant" = tout ce que NOTRE modele ou NOTRE
// analyse calcule pour ce match : pari recommande, probabilites (1X2, buts,
// BTTS, scores, xG du modele), valeur/Kelly, fiabilite detaillee, textes
// d'analyse, buteurs probables.
//
// Restent publics :
//   - PUBLIC_TEASER : has_signal, no_signal, no_signal_label,
//     data_quality_score/label, model_output_available, analysis_tier - de
//     quoi dire "une analyse existe" sans la donner ;
//   - PUBLIC_FACT : equipes, date, stade, meteo, classement, forme, H2H,
//     blessures, compositions, historique joueurs, statistiques d'equipe,
//     cotes brutes des bookmakers (donnee de marche, pas notre produit).
//
// Utilisee par : le pipeline (.github/workflows/update-data.yml, CHAMPS_PREMIUM
// et premium_fields), lib/public-data-split.js, scripts/split-public-data.js,
// scripts/seo-pages.js et les tests.
//
// conf (note sur 10 = probabilite du modele pour le pari recommande / 10) est
// PREMIUM depuis le 15/09/2026 (decision proprietaire) : ce n'est pas une
// amorce, c'est un chiffre du produit payant. Cle cherchee en profondeur :
// aucun champ public d'un match ne s'appelle "conf" (verifie sur data.json,
// data-home.json et match/*.json le 15/09/2026). supabase/functions/match-data/index.ts
// (Deno) en garde une copie litterale : tests/premium-fields-sync.test.js
// verifie que les deux listes sont identiques.

// Champs qui ont leur propre colonne dans match_premium_data
// (migrations 0002, 0013, 0018).
const PREMIUM_COLUMN_FIELDS = [
  "pari_rec", "cote_rec", "model_probability", "markets_compared", "market_id", "marche",
  "kelly", "edge", "verdict_shark", "facteur_x", "dropping_odds", "player_markets",
];

// Traductions des textes premium : raw_response.narrative_i18n (lib/narrative-i18n.js).
const PREMIUM_NARRATIVE_I18N_FIELDS = ["facteur_x_i18n", "verdict_shark_i18n"];

// Champs premium sans colonne dediee : persistes ensemble dans
// match_premium_data.premium_fields (migration 0020), rendus aux abonnes par
// la fonction match-data.
const PREMIUM_PAYLOAD_FIELDS = [
  // Probabilites et sorties chiffrees du modele. conf = model_probability / 10
  // (note sur 10 affichee aux abonnes et sur le match offert).
  "conf", "p1", "pn", "p2", "po15", "po25", "btts", "lambda_h", "lambda_a",
  "market_aware_p1", "market_aware_pN", "market_aware_p2",
  // Probabilites implicites dedupliquees (methode de Shin) : colonne "marche"
  // du comparatif modele/marche, calculee par notre moteur.
  "market_consensus_p1", "market_consensus_pN", "market_consensus_p2",
  "mc_scores", "scores", "simulation_count",
  // Decision : copie du pari, valeur, risque, mise.
  "paris_safe", "paris_risque", "vbet", "val", "hot", "risque", "mise",
  "pick_downgrade", "odds_available", "is_canonical_pick",
  // Fiabilite detaillee et notes internes du moteur.
  "reliability", "model_agreement", "crit_home", "crit_away", "elo_signal",
  // Analyse redigee et ses traductions (lib/narrative-i18n.js les appelle
  // "publiques" parce qu'elles vont dans matchObj et non dans raw_response :
  // elles sont reservees comme le reste de l'analyse).
  "analyse_card", "analyse_card_i18n", "conseil_public", "conseil_public_i18n",
  "contexte", "contexte_i18n", "scenario", "scenario_i18n", "scenario_15min",
  "decision_factors", "risk_principal",
  // Buteurs probables : selection et scores du modele, texte d'analyse.
  "top_scorers",
];

const PREMIUM_FIELDS = PREMIUM_COLUMN_FIELDS.concat(PREMIUM_NARRATIVE_I18N_FIELDS, PREMIUM_PAYLOAD_FIELDS);

// Controle recursif : cles premium qui ne doivent apparaitre A AUCUNE
// profondeur d'un match non offert. Les noms trop generiques pour etre
// cherches en profondeur (fatigue.val, par exemple) ne sont verifies qu'au
// premier niveau.
const TOP_LEVEL_ONLY = ["val", "hot", "scores", "risque", "mise", "scenario", "edge", "marche", "btts", "p1", "p2", "pn"];
// conf_bucket : tranche de conf (historique) ; model_probability_pct :
// probabilite de la SAFE_PICK (run_output). Jamais dans un match public.
const NESTED_MODEL_KEYS = ["conf_bucket", "model_probability_pct", "goal_threat_score", "score_components", "opponent_defense_multiplier", "baseline_conversion", "analyse_i18n"];
const DEEP_PREMIUM_KEYS = PREMIUM_FIELDS.filter(function (k) { return TOP_LEVEL_ONLY.indexOf(k) === -1; }).concat(NESTED_MODEL_KEYS);

function isFree(m) { return !!m && m.is_free === true; }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// Copie publique d'un match : champs premium retires, sauf match offert.
// has_signal dit "une analyse existe" sans la nommer (conserve s'il existe deja).
function stripPremium(m) {
  if (!m || typeof m !== "object" || isFree(m)) return m;
  const copie = {};
  Object.keys(m).forEach(function (k) { if (PREMIUM_FIELDS.indexOf(k) === -1) copie[k] = m[k]; });
  if (!own(copie, "has_signal")) copie.has_signal = !!(m.pari_rec && !m.no_signal);
  return copie;
}

// Champs premium de premier niveau presents sur un match non offert.
function premiumLeaks(m) {
  if (!m || typeof m !== "object" || isFree(m)) return [];
  return PREMIUM_FIELDS.filter(function (k) { return own(m, k); });
}

function isMatchLike(o) { return !!o && typeof o === "object" && !Array.isArray(o) && o.id != null && !!o.home && !!o.away; }

// Parcourt n'importe quelle valeur (fichier public entier, match isole) et
// renvoie les chemins des champs premium trouves dans des matchs non offerts,
// au premier niveau comme en profondeur.
function deepPremiumLeaks(value, basePath) {
  const out = [];
  function scanNested(v, p) {
    if (Array.isArray(v)) { v.forEach(function (x, i) { scanNested(x, p + "[" + i + "]"); }); return; }
    if (!v || typeof v !== "object") return;
    Object.keys(v).forEach(function (k) {
      if (DEEP_PREMIUM_KEYS.indexOf(k) !== -1) out.push(p + "." + k);
      scanNested(v[k], p + "." + k);
    });
  }
  function visit(v, p) {
    if (Array.isArray(v)) { v.forEach(function (x, i) { visit(x, p + "[" + i + "]"); }); return; }
    if (!v || typeof v !== "object") return;
    if (isMatchLike(v)) {
      if (isFree(v)) return;
      const mp = p + "#" + v.id;
      premiumLeaks(v).forEach(function (k) { out.push(mp + "." + k); });
      Object.keys(v).forEach(function (k) { if (PREMIUM_FIELDS.indexOf(k) === -1) scanNested(v[k], mp + "." + k); });
      return;
    }
    Object.keys(v).forEach(function (k) { visit(v[k], p ? p + "." + k : k); });
  }
  visit(value, basePath || "");
  return out;
}

// Contenu de match_premium_data.premium_fields pour un match complet.
function premiumPayload(m) {
  const out = {};
  if (!m || typeof m !== "object") return out;
  PREMIUM_PAYLOAD_FIELDS.forEach(function (k) { if (own(m, k) && m[k] !== undefined) out[k] = m[k]; });
  return out;
}

// ---------------------------------------------------------------------------
// historique.json (fichier commite dans le depot) : une prediction encore en
// attente (scheduled/pending) porte le pari d'un match a venir. Le pari, la
// cote et la probabilite sont retires du fichier, sauf match offert ; la
// version complete vit dans predictions_archive (service role) et y est
// relue avant le reglement (rehydratePredictions).
const PENDING_REDACTED_FIELDS = ["prediction", "cote", "model_probability", "conf", "conf_bucket", "market", "reliability"];

function isPending(p) { return !!p && (p.result === "scheduled" || p.result === "pending"); }

function redactPendingPredictions(predictions, freeFixtureIds) {
  const libres = (freeFixtureIds || []).map(String);
  return (Array.isArray(predictions) ? predictions : []).map(function (p) {
    if (!isPending(p) || libres.indexOf(String(p.fixture_id)) !== -1) return p;
    if (p.fixture_id == null) return p; // sans identifiant, impossible a relire depuis l'archive : laisse tel quel
    const copie = {};
    Object.keys(p).forEach(function (k) { if (PENDING_REDACTED_FIELDS.indexOf(k) === -1) copie[k] = p[k]; });
    copie.redacted = true;
    return copie;
  });
}

// Complete EN PLACE les predictions masquees depuis les lignes de
// predictions_archive ({fixture_id, prediction, cote, ...}). Renvoie le
// nombre de predictions completees ; celles sans ligne d'archive restent
// masquees (jamais de pari invente).
function rehydratePredictions(predictions, archiveRows) {
  const parId = {};
  (archiveRows || []).forEach(function (r) { if (r && r.fixture_id != null) parId[String(r.fixture_id)] = r; });
  let n = 0;
  (predictions || []).forEach(function (p) {
    if (!p || !p.redacted) return;
    const r = parId[String(p.fixture_id)];
    if (!r || !r.prediction) return;
    PENDING_REDACTED_FIELDS.forEach(function (k) { if (r[k] !== undefined && r[k] !== null) p[k] = r[k]; });
    delete p.redacted;
    n++;
  });
  return n;
}

module.exports = {
  PREMIUM_FIELDS: PREMIUM_FIELDS,
  PREMIUM_COLUMN_FIELDS: PREMIUM_COLUMN_FIELDS,
  PREMIUM_NARRATIVE_I18N_FIELDS: PREMIUM_NARRATIVE_I18N_FIELDS,
  PREMIUM_PAYLOAD_FIELDS: PREMIUM_PAYLOAD_FIELDS,
  DEEP_PREMIUM_KEYS: DEEP_PREMIUM_KEYS,
  PENDING_REDACTED_FIELDS: PENDING_REDACTED_FIELDS,
  isFree: isFree,
  stripPremium: stripPremium,
  premiumLeaks: premiumLeaks,
  deepPremiumLeaks: deepPremiumLeaks,
  premiumPayload: premiumPayload,
  redactPendingPredictions: redactPendingPredictions,
  rehydratePredictions: rehydratePredictions,
};
