"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). Pont entre le pipeline de production
// (.github/workflows/update-data.yml) et le RUN OUTPUT ENGINE
// (lib/run-output/index.js). CONSOMMATEUR PUR : ne recalcule AUCUNE
// probabilite, ne fait AUCUN nouvel appel API - se contente de
// reformater ce que le pipeline a DEJA calcule (allMarkets, deja filtre
// aux entrees avec une VRAIE cote reelle) dans le schema attendu par
// runOutputForSnapshot.
//
// PORTEE VOLONTAIREMENT LIMITEE (decision explicite, 2026-09-06) :
// - SCORE : construit depuis allMarkets, UNIQUEMENT les marches deja
//   canoniques (1X2/DC/BTTS/Total buts/Team totals - voir
//   lib/run-output/market-status.js). Les marches legacy shots/
//   shots-on-target/premiere-mi-temps ne sont JAMAIS mappes ici -> ils
//   n'entrent jamais dans run_output, quelle que soit la ligue.
// - PLAYER : AUCUN candidat construit pour l'instant. Le Player Scorer
//   CANONIQUE (V1_AGGREGATED_SHARE) a besoin d'un historique par joueur
//   (buts/minutes/tirs par match passe) que ce pipeline live ne
//   recupere pas aujourd'hui (seules des stats d'equipe agregees sont
//   fetchees). Le moteur legacy de detection de buteurs
//   (lib/markets/player-engine.js / lib/markets/top-scorer-picker.js)
//   est le baseline B REJETE lors de la validation OOS du modele
//   canonique (voir data/league-factory/*/player-oos-final-report.json) :
//   l'utiliser ici publierait une "probabilite canonique" qui n'en est
//   pas une. TOP_5_SCORERS_OF_DAY reste donc honnêtement vide
//   (0 candidat, jamais invente) tant que le live-serving du Player
//   Scorer canonique n'est pas construit (tache separee, hors perimetre
//   de ce branchement).

const PREMIER_LEAGUE_API_FOOTBALL_ID = 39;

// LEGACY_TO_CANONICAL_SCORE_MARKET : seuls les marches ayant un
// equivalent DEJA modelise dans lib/market-lab/market-catalogue.js
// (memes IDs que isMarketSupportedForCombo). Toute entree d'allMarkets
// dont l'id n'apparait PAS ici est silencieusement exclue - c'est
// exactement le mecanisme qui garantit qu'aucun marche shots/
// shots-on-target/premiere-mi-temps n'entre jamais dans run_output.
const LEGACY_TO_CANONICAL_SCORE_MARKET = {
  "home-win": { market: "FT_1X2_HOME", selection: "HOME" },
  "draw": { market: "FT_1X2_DRAW", selection: "DRAW" },
  "away-win": { market: "FT_1X2_AWAY", selection: "AWAY" },
  "dc-1x": { market: "FT_DC_1X", selection: "1X" },
  "dc-x2": { market: "FT_DC_X2", selection: "X2" },
  "dc-12": { market: "FT_DC_12", selection: "12" },
  "over-25": { market: "FT_TOTAL_2.5_OVER", selection: "OVER" },
  "under-25": { market: "FT_TOTAL_2.5_UNDER", selection: "UNDER" },
  "over-35": { market: "FT_TOTAL_3.5_OVER", selection: "OVER" },
  "under-35": { market: "FT_TOTAL_3.5_UNDER", selection: "UNDER" },
  "btts-yes": { market: "FT_BTTS_YES", selection: "YES" },
  "btts-no": { market: "FT_BTTS_NO", selection: "NO" },
  "home-team-over-15": { market: "FT_TEAM_TOTAL_HOME_1.5_OVER", selection: "OVER" },
  "home-team-under-15": { market: "FT_TEAM_TOTAL_HOME_1.5_UNDER", selection: "UNDER" },
  "away-team-over-15": { market: "FT_TEAM_TOTAL_AWAY_1.5_OVER", selection: "OVER" },
  "away-team-under-15": { market: "FT_TEAM_TOTAL_AWAY_1.5_UNDER", selection: "UNDER" },
};

// league_key canonique pour un id API-Football donne : Premier League
// (validee hors factory, voir lib/run-output/canonical-registry.js) ou
// une ligue LEAGUE_EXPANSION_FACTORY_V1 (config/league-expansion.json).
// Retourne null pour toute ligue non couverte (ex: UEFA Champions
// League) - un league_key null ne matchera jamais aucune entree du
// registry canonique, donc n'est jamais eligible (comportement voulu :
// "UCL / ligues non validees : aucune sortie Score produit canonique").
function leagueKeyForApiFootballId(apiFootballId, leagueExpansionConfig) {
  if (apiFootballId === PREMIER_LEAGUE_API_FOOTBALL_ID) return "premier_league";
  const leagues = (leagueExpansionConfig && leagueExpansionConfig.leagues) || [];
  const entry = leagues.find((l) => l.apiFootballId === apiFootballId);
  return entry ? entry.key : null;
}

// allMarkets : tableau {id, market, prob (0-100), cote (string numerique
// ou '--'), marketProb (0-100 ou null)} - DEJA filtre par le pipeline
// aux entrees avec une cote reelle exploitable (voir noSignalReason=
// NO_REAL_ODDS quand ce tableau est vide). snapshotStability : valeur
// unique pour ce run (pas encore de timeline T168->CLOSE en production
// live - un seul snapshot par jour, voir item 6 laisse pour plus tard).
function buildScoreCandidatesFromLegacyMatch({ allMarkets, leagueId, leagueExpansionConfig, fixtureId, kickoff, homeTeam, awayTeam, scoreModelVersion, snapshotStability, dataQualityStatus }) {
  const leagueKey = leagueKeyForApiFootballId(leagueId, leagueExpansionConfig);
  if (!leagueKey) return [];
  const candidates = [];
  for (const m of allMarkets || []) {
    const mapping = LEGACY_TO_CANONICAL_SCORE_MARKET[m.id];
    if (!mapping) continue; // marche legacy non-canonique (shots, fh, etc.) - jamais mappe
    const decimalOdds = parseFloat(m.cote);
    if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) continue;
    const modelProbability = Number(m.prob) / 100;
    if (!Number.isFinite(modelProbability)) continue;
    candidates.push({
      source: "SCORE",
      league_key: leagueKey,
      fixture_id: fixtureId,
      kickoff: kickoff,
      home_team: homeTeam,
      away_team: awayTeam,
      market: mapping.market,
      selection: mapping.selection,
      score_model_version: scoreModelVersion,
      model_probability: modelProbability,
      decimal_odds: decimalOdds,
      market_consensus_probability: Number.isFinite(Number(m.marketProb)) ? Number(m.marketProb) / 100 : null,
      snapshot_stability: snapshotStability || "STABLE",
      data_quality_status: dataQualityStatus || "PASS",
    });
  }
  return candidates;
}

// buildPlayerCandidatesFromLegacyMatch : retourne TOUJOURS [] aujourd'hui.
// Existe comme point d'extension explicite et documente pour le futur
// live-serving du Player Scorer canonique (V1_AGGREGATED_SHARE) - jamais
// silencieux, jamais remplace par le moteur legacy rejete.
function buildPlayerCandidatesFromLegacyMatch() {
  return [];
}

// CANONICAL_MARKET_TO_LEGACY_LABEL : inverse de LEGACY_TO_CANONICAL_SCORE_MARKET,
// memes libelles FR que les candidat(...) legacy (coherence d'affichage) -
// utilise pour injecter une SAFE_PICK_OF_THE_DAY canonique directement sur
// la carte EXISTANTE d'un match (pari_rec), sans construire un nouvel
// affichage. Purement cosmetique : ne change jamais le marche/la selection
// eux-memes, uniquement leur libelle FR pour l'UI deja existante.
const CANONICAL_MARKET_TO_LEGACY_LABEL = {
  "FT_1X2_HOME": "Victoire Domicile",
  "FT_1X2_DRAW": "Match nul",
  "FT_1X2_AWAY": "Victoire Exterieur",
  "FT_DC_1X": "DC 1X",
  "FT_DC_X2": "DC X2",
  "FT_DC_12": "DC 12",
  "FT_TOTAL_2.5_OVER": "Over 2.5",
  "FT_TOTAL_2.5_UNDER": "Under 2.5",
  "FT_TOTAL_3.5_OVER": "Over 3.5",
  "FT_TOTAL_3.5_UNDER": "Under 3.5",
  "FT_BTTS_YES": "BTTS Oui",
  "FT_BTTS_NO": "BTTS Non",
  "FT_TEAM_TOTAL_HOME_1.5_OVER": "Domicile plus de 1.5 but",
  "FT_TEAM_TOTAL_HOME_1.5_UNDER": "Domicile moins de 1.5 but",
  "FT_TEAM_TOTAL_AWAY_1.5_OVER": "Exterieur plus de 1.5 but",
  "FT_TEAM_TOTAL_AWAY_1.5_UNDER": "Exterieur moins de 1.5 but",
};

function legacyLabelForCanonicalMarket(market) {
  return CANONICAL_MARKET_TO_LEGACY_LABEL[market] || market;
}

module.exports = {
  PREMIER_LEAGUE_API_FOOTBALL_ID,
  LEGACY_TO_CANONICAL_SCORE_MARKET,
  CANONICAL_MARKET_TO_LEGACY_LABEL,
  leagueKeyForApiFootballId,
  buildScoreCandidatesFromLegacyMatch,
  buildPlayerCandidatesFromLegacyMatch,
  legacyLabelForCanonicalMarket,
};
