"use strict";
// LISTE UNIQUE DES CHAMPS PREMIUM D'UN MATCH (audit fuite de donnees, 14/09/2026).
//
// Regle proprietaire : rien de ce qui constitue le produit payant n'est lisible
// par un visiteur non Pro, nulle part, sauf l'analyse offerte du jour
// (is_free === true) pour un COMPTE CONNECTE. Depuis le 04/10/2026 (decision de
// Clement, controle de l'avocat du diable point 6), le match offert n'est plus en
// clair dans les fichiers publics (data.json, data-home.json, match/<id>.json,
// historique.json, pages statiques) : un visiteur sans compte n'y voit qu'un
// apercu flou, et ses champs payants sont servis par la fonction match-data aux
// comptes connectes (compte gratuit compris), sauf PRO_ONLY_FIELDS.
// "Produit payant" = tout ce que NOTRE modele ou NOTRE
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
  "contexte", "contexte_i18n", "scenario", "scenario_i18n", "scenario_15min", "sim_15min",
  "decision_factors", "risk_principal",
  // Buteurs probables : selection et scores du modele, texte d'analyse.
  "top_scorers",
  // Moteur v3 (lib/moteur-v3.js, ecrits seulement si MOTEUR_V3=1) : fiabilite,
  // pari (sans cote minimum ni « eligible VIP », C4 du 29/09), tous les marches,
  // suivi compositions/cotes (vivant, lib/pick-freeze.js#LIVE_PREMIUM_FIELDS).
  "v3_fiabilite", "v3_pari", "v3_marches", "v3_suivi", "v3_buteurs",
  // Une seule source de chiffres (lib/chance-iashark.js, 01/10/2026) : la chance du pari
  // retenu, calculee UNE FOIS par le pipeline, lue par la page, l'espace Pro et Telegram.
  "chance_iashark", "chance_iashark_source",
  // Une seule cote (lib/cote-anj.js, 01/10/2026) : bookmaker agree ANJ de la cote du pari
  // (cote_rec), sa source (« anj » ou « indicative »), l'heure du releve, cotes sans marge ANJ.
  "cote_bookmaker", "cote_source", "cote_releve_a", "sans_marge_anj",
  // Stats IASHARK (lib/stats-book.js, 30/09/2026) : detail des profils equipe,
  // arbitre et ligue calcules sur le Book. Abonnes (et compte connecte sur le match offert) ; les
  // 2 chiffres gratuits vivent dans le champ public stats_iashark_gratuit.
  "stats_iashark",
  // « Notre lecture du match » (texte de l'IA sans chiffre, 30/09/2026) : Pro seulement.
  "lecture_match",
  // Un pronostic sur chaque match (lib/pronostic.js, 03/10/2026) : issue, chance, cote,
  // fiabilite, selection ou non. Contenu Pro ; sur le match offert, servi aux comptes connectes (match-data).
  // L'amorce publique est le booleen pronostic_dispo (aucun chiffre, aucun marche).
  "pronostic",
  "marches_flux",
  // Option « cote plus haute » (regle A, lib/pronostic.js#poserOptionCote, 04/10/2026) et
  // correction de la chance affichee (lib/pronostic.js#alignerChancesAffichees) : contenu Pro.
  "option_cote", "chance_correction",
  // Nouvelle page match (demande de Clement du 04/10/2026, plan UX) : panneau « Marches »
  // (lib/marches-panneau.js, Pro seulement, meme sur le match offert), « si ce match se jouait
  // 10 000 fois » (sim_resume : comptes exacts de la grille du v3, aucun tirage,
  // lib/sections-match.js) et « les jumeaux du match » (jumeaux, matchs d'archive).
  // « Qui ouvre le score » (premier_but) et le premier buteur du v3 (v3_premiers_buteurs).
  // Sur le match offert, tout cela est servi au compte gratuit connecte, sauf le panneau
  // Marches (PRO_ONLY_FIELDS). Produits seulement avec le feu vert du mathematicien
  // (config/verdicts-maths.json).
  "marches_panneau", "sim_resume", "jumeaux", "premier_but", "v3_premiers_buteurs",
];

// Champs INTERNES au calcul : jamais dans un fichier public (meme le match offert) ni dans
// premium_fields. pinnacle_snapshot porte des cotes Pinnacle, operateur non agree en France
// (garde-fou du 04/10/2026 : jamais bet365 ni Pinnacle affiches en France). Retires par le
// pipeline au moment d'ecrire les fichiers publics (update-data.yml, matchsPublics) ; les
// fonctions de ce module ne changent pas.
const INTERNAL_FIELDS = ["pinnacle_snapshot"];
// Copie sans les champs internes (le meme objet s'il n'en a pas).
function sansChampsInternes(m) {
  if (!m || typeof m !== "object" || !INTERNAL_FIELDS.some(function (k) { return own(m, k); })) return m;
  const copie = {};
  Object.keys(m).forEach(function (k) { if (INTERNAL_FIELDS.indexOf(k) === -1) copie[k] = m[k]; });
  return copie;
}

const PREMIUM_FIELDS = PREMIUM_COLUMN_FIELDS.concat(PREMIUM_NARRATIVE_I18N_FIELDS, PREMIUM_PAYLOAD_FIELDS);

// Controle recursif : cles premium qui ne doivent apparaitre A AUCUNE
// profondeur d'un match non offert. Les noms trop generiques pour etre
// cherches en profondeur (fatigue.val, par exemple) ne sont verifies qu'au
// premier niveau.
const TOP_LEVEL_ONLY = ["val", "hot", "scores", "risque", "mise", "scenario", "edge", "marche", "btts", "p1", "p2", "pn"];
// conf_bucket : tranche de conf (historique) ; model_probability_pct :
// probabilite de la SAFE_PICK (run_output). Jamais dans un match public.
// Tickets du jour (04/10/2026, regles-tickets.md §6) : jamais dans un fichier public, a
// aucune profondeur (servis seulement par la fonction tickets-du-jour, selon le niveau).
const NESTED_MODEL_KEYS = ["conf_bucket", "model_probability_pct", "goal_threat_score", "score_components", "opponent_defense_multiplier", "baseline_conversion", "analyse_i18n",
  "tickets_du_jour", "selection_or", "buteur_du_jour", "jambes"];
const DEEP_PREMIUM_KEYS = PREMIUM_FIELDS.filter(function (k) { return TOP_LEVEL_ONLY.indexOf(k) === -1; }).concat(NESTED_MODEL_KEYS);

function isFree(m) { return !!m && m.is_free === true; }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// Champs reserves aux Pro SANS EXCEPTION, meme sur le match offert. Decision de Clement du
// 04/10/2026 : sur le match offert, un compte gratuit connecte voit TOUT (« si ce match se jouait
// 10 000 fois », le film du match, qui ouvre le score, « Et si », les joueurs, l'arbitre, notre
// lecture...) SAUF le panneau « Marches » et ses sources (marches_panneau, v3_marches, marches_flux).
// Copie : supabase/functions/match-data/index.ts (CHAMPS_PRO_SEULEMENT, tests/premium-fields-sync.test.js).
// Historique : 29/09 simulation 15 min (S2), 30/09 stats_iashark et lecture_match, 04/10 matin
// premier_but, v3_premiers_buteurs, sim_resume et jumeaux : tous rendus au compte gratuit sur le
// match offert par la decision du 04/10/2026 (ils ne sont plus jamais dans un fichier public).
const PRO_ONLY_FIELDS = ["marches_panneau", "v3_marches", "marches_flux"];
// Anciens champs du calcul (mise conseillee, Kelly, « value bet ») : jamais
// publies, meme sur le match offert (decision de Clement du 30/09/2026 : ni
// mise ni valeur nulle part ; audit V3 du 02/10/2026, point I8).
const NEVER_PUBLIC_FIELDS = ["mise", "kelly", "vbet"];
const RETIRES_DU_MATCH_OFFERT = PRO_ONLY_FIELDS.concat(NEVER_PUBLIC_FIELDS);
// Copie d'un match offert sans les champs Pro seulement (le meme objet s'il n'en a pas) : ce que
// la fonction match-data sert a un compte gratuit connecte sur le match offert.
function sansChampsPro(m) {
  if (!m || typeof m !== "object" || !RETIRES_DU_MATCH_OFFERT.some(function (k) { return own(m, k); })) return m;
  const copie = {};
  Object.keys(m).forEach(function (k) { if (RETIRES_DU_MATCH_OFFERT.indexOf(k) === -1) copie[k] = m[k]; });
  return copie;
}
// REPLI SANS TABLE PROTEGEE (cle service role absente, update-data.yml#PEUT_PROTEGER) : les analyses
// restent dans le fichier public, lisible SANS compte (sinon un abonne ne verrait plus rien), mais
// jamais ces champs-la : le detail du match (simulation, film, qui ouvre le score, jumeaux, Stats
// IASHARK, lecture du match), le panneau Marches et les champs jamais publics.
const RETIRES_SANS_TABLE = ["sim_15min", "stats_iashark", "lecture_match", "premier_but", "v3_premiers_buteurs", "sim_resume", "jumeaux"]
  .concat(RETIRES_DU_MATCH_OFFERT);
function sansChampsReserves(m) {
  if (!m || typeof m !== "object" || !RETIRES_SANS_TABLE.some(function (k) { return own(m, k); })) return m;
  const copie = {};
  Object.keys(m).forEach(function (k) { if (RETIRES_SANS_TABLE.indexOf(k) === -1) copie[k] = m[k]; });
  return copie;
}

// Copie publique d'un match : champs premium retires, match offert COMPRIS (04/10/2026).
// has_signal dit "une analyse existe" sans la nommer (conserve s'il existe deja).
function stripPremium(m) {
  if (!m || typeof m !== "object") return m;
  const copie = {};
  Object.keys(m).forEach(function (k) { if (PREMIUM_FIELDS.indexOf(k) === -1) copie[k] = m[k]; });
  if (!own(copie, "has_signal")) copie.has_signal = !!(m.pari_rec && !m.no_signal);
  return copie;
}

// Champs premium de premier niveau presents sur un match d'un fichier public (match offert compris
// depuis le 04/10/2026).
function premiumLeaks(m) {
  if (!m || typeof m !== "object") return [];
  return PREMIUM_FIELDS.filter(function (k) { return own(m, k); });
}

function isMatchLike(o) { return !!o && typeof o === "object" && !Array.isArray(o) && o.id != null && !!o.home && !!o.away; }

// Parcourt n'importe quelle valeur (fichier public entier, match isole) et
// renvoie les chemins des champs premium trouves dans des matchs (offert compris
// depuis le 04/10/2026), au premier niveau comme en profondeur.
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
// cote et la probabilite sont retires du fichier, match offert COMPRIS depuis le
// 04/10/2026 (son pari n'est plus public avant le match) ; la version complete
// vit dans predictions_archive (service role) et y est relue avant le reglement
// (rehydratePredictions). Meme regle pour le pari d'un match REPORTE (annule,
// marque reporte : true) : le match peut encore se jouer plus tard.
const PENDING_REDACTED_FIELDS = ["prediction", "cote", "model_probability", "conf", "conf_bucket", "market", "reliability"];

function isPending(p) { return !!p && (p.result === "scheduled" || p.result === "pending"); }
function estReporte(p) { return !!p && p.result === "void" && p.reporte === true; }

// freeFixtureIds : ignore depuis le 04/10/2026 (le match offert n'est plus une exception), garde pour
// les anciens appels.
function redactPendingPredictions(predictions, freeFixtureIds) { // eslint-disable-line no-unused-vars
  return (Array.isArray(predictions) ? predictions : []).map(function (p) {
    if (!isPending(p) && !estReporte(p)) return p;
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
  PRO_ONLY_FIELDS: PRO_ONLY_FIELDS,
  NEVER_PUBLIC_FIELDS: NEVER_PUBLIC_FIELDS,
  INTERNAL_FIELDS: INTERNAL_FIELDS,
  sansChampsInternes: sansChampsInternes,
  sansChampsPro: sansChampsPro,
  RETIRES_SANS_TABLE: RETIRES_SANS_TABLE,
  sansChampsReserves: sansChampsReserves,
  stripPremium: stripPremium,
  premiumLeaks: premiumLeaks,
  deepPremiumLeaks: deepPremiumLeaks,
  premiumPayload: premiumPayload,
  redactPendingPredictions: redactPendingPredictions,
  rehydratePredictions: rehydratePredictions,
};
