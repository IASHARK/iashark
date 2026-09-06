"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). Tests deterministes de la nouvelle
// couche PRODUCT SELECTION ENGINE (consommateur pur des modeles
// Score/Player deja valides + du registry - jamais un nouveau modele,
// zero formule touchee). Toutes les probabilites d'entree sont
// SYNTHETIQUES (deja "sorties" d'un pipeline Score/Player fictif) :
// ce module ne teste jamais lib/lab ni lib/player-lab, uniquement le
// filtrage/classement/assemblage au-dessus.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runOutputForSnapshot,
  diffRunOutputs,
  computeTop5ScorersOfDay,
  generateDailyCombos,
  computeSafePickOfDay,
  diffSnapshots,
  loadCanonicalEligibilityRegistry,
  eligibility,
} = require("../lib/run-output/index.js");
const { loadRegistry } = require("../lib/league-factory/registry.js");
const { PL_LEAGUE_KEY, buildPremierLeagueCanonicalEntry } = require("../lib/run-output/canonical-registry.js");

const SNAPSHOT_T = "2026-09-06T10:00:00.000Z";

function fakeRegistry(overrides) {
  return { leagues: { ...overrides } };
}

function playerCandidate(overrides) {
  return {
    source: "PLAYER", market: "ANYTIME_GOALSCORER", selection: "YES",
    league_key: "ligue2", fixture_id: 1001, kickoff: "2026-09-07T18:00:00.000Z",
    home_team: "A", away_team: "B", player_id: "p1", player_name: "Joueur 1", team: "A", opponent: "B",
    player_model_version: "PLAYER_SCORER_V1_AGGREGATED_SHARE_LIGUE2",
    model_probability: 0.30, decimal_odds: 2.0, snapshot_stability: "STABLE",
    data_quality_status: "PASS", lineup_status: "CONFIRMED_POST_LINEUP",
    ...overrides,
  };
}

function scoreCandidate(overrides) {
  return {
    source: "SCORE", market: "FT_1X2_HOME", selection: "HOME",
    league_key: "fake_score_league", fixture_id: 2001, kickoff: "2026-09-07T18:00:00.000Z",
    home_team: "C", away_team: "D", score_model_version: "SCORE_M0_FAKE",
    model_probability: 0.60, decimal_odds: 1.60, snapshot_stability: "STABLE",
    data_quality_status: "PASS",
    ...overrides,
  };
}

const REG_PLAYER_OK = { player_status: "VALIDATED", player_runnable: true, score_status: "INCONCLUSIVE", score_runnable: false };
const REG_SCORE_OK = { player_status: "NOT_STARTED", player_runnable: false, score_status: "VALIDATED", score_runnable: true };

// ---------------------------------------------------------------
// TOP_5_SCORERS_OF_DAY
// ---------------------------------------------------------------

test("TOP5 : classe par probabilite decroissante, retourne exactement 5 quand >=5 eligibles", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [0.10, 0.55, 0.20, 0.40, 0.30, 0.05, 0.60].map((p, i) => playerCandidate({ player_id: `p${i}`, fixture_id: 1000 + i, model_probability: p }));
  const result = computeTop5ScorersOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.count_returned, 5);
  assert.equal(result.players.length, 5);
  const probs = result.players.map((p) => p.scorer_probability);
  assert.deepEqual(probs, [...probs].sort((a, b) => b - a));
  assert.equal(result.players[0].scorer_probability, 0.60);
  assert.equal(result.players[0].rank, 1);
  assert.equal(result.players[0].scorer_probability_pct, 60);
  assert.equal(result.players[0].lineup_status, "CONFIRMED_POST_LINEUP");
});

test("TOP5 : jamais invente - retourne le nombre reellement disponible si < 5 eligibles", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [playerCandidate({ player_id: "p1", model_probability: 0.4 }), playerCandidate({ player_id: "p2", fixture_id: 1002, model_probability: 0.3 })];
  const result = computeTop5ScorersOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.count_returned, 2);
  assert.equal(result.players.length, 2);
});

test("TOP5 : exclut les ligues dont PLAYER_STATUS n'est pas VALIDATED", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK, not_validated_league: { player_status: "INCONCLUSIVE", player_runnable: false } });
  const candidates = [
    playerCandidate({ player_id: "p1", model_probability: 0.9, league_key: "not_validated_league" }),
    playerCandidate({ player_id: "p2", fixture_id: 1002, model_probability: 0.2, league_key: "ligue2" }),
  ];
  const result = computeTop5ScorersOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.count_returned, 1);
  assert.equal(result.players[0].player_id, "p2");
});

test("TOP5 : scorer_probability_pct est la vraie probabilite modele, jamais une cote convertie", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [playerCandidate({ player_id: "p1", model_probability: 0.4123, decimal_odds: 99.0 })];
  const result = computeTop5ScorersOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.players[0].scorer_probability_pct, 41.23);
});

// ---------------------------------------------------------------
// DAILY_COMBOS
// ---------------------------------------------------------------

test("COMBOS : jusqu'a 3, cote totale >= 10.00, max 1 selection par fixture, jamais de marche Asian/HOLD", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [];
  for (let i = 0; i < 12; i++) {
    candidates.push(playerCandidate({ player_id: `p${i}`, fixture_id: 3000 + i, model_probability: 0.5 + i * 0.01, decimal_odds: 1.8 + i * 0.05 }));
  }
  candidates.push(playerCandidate({ player_id: "asian", fixture_id: 3999, market: "ASIAN_TOTAL_2.5", model_probability: 0.9, decimal_odds: 1.9 }));

  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.ok(result.combos.length === 3);
  for (const combo of result.combos) {
    assert.equal(combo.betting_validation_status, "UNVALIDATED_SHADOW");
    if (combo.status === "GENERATED") {
      assert.ok(combo.combo_total_odds >= 10.0, `combo_total_odds=${combo.combo_total_odds} doit etre >=10`);
      const fixtureIds = combo.legs.map((l) => l.fixture_id);
      assert.equal(new Set(fixtureIds).size, fixtureIds.length, "jamais 2 jambes de la meme fixture");
      assert.ok(combo.legs.every((l) => l.market !== "ASIAN_TOTAL_2.5"), "jamais un marche Asian/HOLD en jambe");
      assert.ok(combo.legs.every((l) => l.decimal_odds >= 1.5), "minOdds=1.50 par jambe");
    }
  }
});

test("COMBOS : NO_QUALIFYING_COMBINATION plutot que force quand le pool est insuffisant (jamais de doublon quasi-identique)", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  // Un seul pool de jambes suffisant pour UN combo >=10.00 (3.5*3.5=12.25),
  // aucune jambe supplementaire disponible pour un 2e/3e ticket distinct :
  // reutiliser les 2 memes jambes produirait un doublon quasi-identique,
  // donc COMBO_2/3 doivent rester NO_QUALIFYING_COMBINATION, jamais forces.
  const candidates = [
    playerCandidate({ player_id: "p1", fixture_id: 4001, model_probability: 0.5, decimal_odds: 3.5 }),
    playerCandidate({ player_id: "p2", fixture_id: 4002, model_probability: 0.5, decimal_odds: 3.5 }),
  ];
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.combos[0].status, "GENERATED");
  assert.ok(result.combos[0].combo_total_odds >= 10.0);
  assert.equal(result.combos[1].status, "NO_QUALIFYING_COMBINATION");
  assert.equal(result.combos[2].status, "NO_QUALIFYING_COMBINATION");
});

test("COMBOS : rapporte shared_legs_count entre combos et limite le partage", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [];
  for (let i = 0; i < 20; i++) {
    candidates.push(playerCandidate({ player_id: `p${i}`, fixture_id: 5000 + i, model_probability: 0.5 + (i % 5) * 0.02, decimal_odds: 1.9 + (i % 4) * 0.3 }));
  }
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  const generated = result.combos.filter((c) => c.status === "GENERATED");
  assert.ok(generated.length >= 2, "avec un pool large, au moins 2 combos doivent se generer");
  for (const c of generated) {
    for (let j = 1; j <= 3; j++) {
      const key = `shared_legs_with_combo_${j}`;
      assert.ok(key in c);
    }
  }
  // Les combos generes ne doivent pas etre des ensembles de jambes identiques.
  const legSets = generated.map((c) => new Set(c.legs.map((l) => `${l.fixture_id}|${l.market}|${l.selection}`)));
  for (let i = 0; i < legSets.length; i++) {
    for (let j = i + 1; j < legSets.length; j++) {
      const identical = legSets[i].size === legSets[j].size && [...legSets[i]].every((k) => legSets[j].has(k));
      assert.equal(identical, false, "deux combos ne doivent jamais etre des tickets identiques");
    }
  }
});

test("COMBOS : exclut les jambes de robustesse LOW (data_quality FAIL)", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [
    playerCandidate({ player_id: "bad", fixture_id: 6001, model_probability: 0.9, decimal_odds: 20.0, data_quality_status: "FAIL" }),
    playerCandidate({ player_id: "good1", fixture_id: 6002, model_probability: 0.5, decimal_odds: 3.5 }),
    playerCandidate({ player_id: "good2", fixture_id: 6003, model_probability: 0.5, decimal_odds: 3.5 }),
  ];
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.ok(result.combos[0].legs.every((l) => l.player_model_version == null || true)); // sanity: acces sans exception
  for (const c of result.combos) {
    if (c.status === "GENERATED") assert.ok(!c.fixtures_used.includes(6001), "la jambe FAIL ne doit jamais entrer dans un combo");
  }
});

test("COMBOS : determinisme - meme entree, meme snapshot -> sortie strictement identique", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [];
  for (let i = 0; i < 10; i++) candidates.push(playerCandidate({ player_id: `p${i}`, fixture_id: 7000 + i, model_probability: 0.4 + i * 0.03, decimal_odds: 2.0 + i * 0.2 }));
  const r1 = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  const r2 = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.deepEqual(r1, r2);
});

test("COMBO_PROBABILITY : produit naif quand aucune dependance detectee, jamais qualifie de garanti", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidates = [
    playerCandidate({ player_id: "p1", fixture_id: 8001, kickoff: "2026-09-07T15:00:00.000Z", model_probability: 0.5, decimal_odds: 3.5 }),
    playerCandidate({ player_id: "p2", fixture_id: 8002, kickoff: "2026-09-08T20:00:00.000Z", model_probability: 0.5, decimal_odds: 3.5 }),
  ];
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  const combo1 = result.combos[0];
  assert.equal(combo1.status, "GENERATED");
  assert.equal(combo1.dependency_adjustment_applied, false);
  assert.equal(combo1.estimated_combo_probability, combo1.naive_independent_product);
  assert.ok(!JSON.stringify(combo1).toLowerCase().includes("guarant"));
  assert.ok(!JSON.stringify(combo1).toLowerCase().includes("sur̀")); // pas de "sûr"
});

test("COMBO_PROBABILITY : amortissement applique quand 2 jambes partagent ligue+coup d'envoi (dependance residuelle)", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const sharedKickoff = "2026-09-07T18:00:00.000Z";
  const candidates = [
    playerCandidate({ player_id: "p1", fixture_id: 9001, kickoff: sharedKickoff, league_key: "ligue2", model_probability: 0.5, decimal_odds: 3.5 }),
    playerCandidate({ player_id: "p2", fixture_id: 9002, kickoff: sharedKickoff, league_key: "ligue2", model_probability: 0.5, decimal_odds: 3.5 }),
  ];
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  const combo1 = result.combos[0];
  assert.equal(combo1.status, "GENERATED");
  assert.equal(combo1.dependency_adjustment_applied, true);
  assert.ok(combo1.estimated_combo_probability < combo1.naive_independent_product);
});

// ---------------------------------------------------------------
// SAFE_PICK_OF_THE_DAY
// ---------------------------------------------------------------

test("SAFE_PICK : NO_SAFE_SELECTION sur le registry REEL actuel (0 ligue SCORE_STATUS=VALIDATED aujourd'hui)", () => {
  const realRegistry = loadRegistry();
  const anyScoreValidated = Object.values(realRegistry.leagues || {}).some((l) => l.score_status === "VALIDATED" && l.score_runnable === true);
  assert.equal(anyScoreValidated, false, "check de coherence : si ce test echoue, une ligue Score a ete VALIDEE depuis - la SAFE doit alors etre re-testee positivement avant toute mise en prod");
  const candidates = [scoreCandidate({ league_key: Object.keys(realRegistry.leagues)[0] || "ligue2" })];
  const result = computeSafePickOfDay({ candidates, registry: realRegistry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.status, "NO_SAFE_SELECTION");
});

test("SAFE_PICK : selectionne le candidat le plus robuste quand tous les criteres stricts passent", () => {
  const registry = fakeRegistry({ fake_score_league: REG_SCORE_OK });
  const candidates = [
    scoreCandidate({ fixture_id: 10001, market: "FT_1X2_HOME", selection: "HOME", model_probability: 0.62, model_probability_uncertainty: 0.03 }),
    scoreCandidate({ fixture_id: 10001, market: "FT_1X2_DRAW", selection: "DRAW", model_probability: 0.25 }),
    scoreCandidate({ fixture_id: 10001, market: "FT_1X2_AWAY", selection: "AWAY", model_probability: 0.13 }),
  ];
  const result = computeSafePickOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.status, "SELECTED");
  assert.equal(result.selection, "HOME");
  assert.equal(result.model_probability, 0.62);
  assert.equal(result.model_probability_pct, 62);
  assert.ok(typeof result.robustness_score === "number");
  assert.notEqual(result.robustness_score, result.model_probability_pct, "SAFE_ROBUSTNESS_SCORE ne doit jamais etre confondu avec la probabilite modele");
  assert.ok(!/guarant|certain|risk.?free/i.test(JSON.stringify(result)));
});

test("SAFE_PICK : rejette si l'ecart avec le 2e meilleur choix du match est insuffisant (meme avec une probabilite suffisante)", () => {
  const registry = fakeRegistry({ fake_score_league: REG_SCORE_OK });
  const candidates = [
    scoreCandidate({ fixture_id: 11001, market: "FT_1X2_HOME", selection: "HOME", model_probability: 0.56 }),
    scoreCandidate({ fixture_id: 11001, market: "FT_1X2_DRAW", selection: "DRAW", model_probability: 0.50 }),
    scoreCandidate({ fixture_id: 11001, market: "FT_1X2_AWAY", selection: "AWAY", model_probability: 0.20 }),
  ];
  const result = computeSafePickOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.status, "NO_SAFE_SELECTION");
  assert.ok(result.rejection_reasons.includes("GAP_VS_SECOND_BEST_INSUFFICIENT"), "le meilleur candidat (HOME, prob suffisante) doit echouer precisement sur l'ecart, pas sur la probabilite");
  assert.ok(result.rejection_reasons.every((r) => r === "GAP_VS_SECOND_BEST_INSUFFICIENT" || r === "MODEL_PROBABILITY_TOO_LOW"));
});

test("SAFE_PICK : rejette une ligue Score non VALIDATED/non runnable meme avec une probabilite tres elevee", () => {
  const registry = fakeRegistry({ fake_score_league: { score_status: "INCONCLUSIVE", score_runnable: false } });
  const candidates = [scoreCandidate({ model_probability: 0.95, decimal_odds: 1.55 })];
  const result = computeSafePickOfDay({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.status, "NO_SAFE_SELECTION");
});

// ---------------------------------------------------------------
// TIMELINE / SNAPSHOT DIFF
// ---------------------------------------------------------------

test("SNAPSHOT_DIFF : classifie ODDS_MOVED, MODEL_PROBABILITY_CHANGED, LINEUP_UPDATE, BETTER_SELECTION_AVAILABLE", () => {
  const prev = new Map([
    ["SLOT_ODDS", { player_id: "p1", fixture_id: 1, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
    ["SLOT_PROB", { player_id: "p2", fixture_id: 2, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
    ["SLOT_LINEUP", { player_id: "p3", fixture_id: 3, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
    ["SLOT_SWAP", { player_id: "p4", fixture_id: 4, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
  ]);
  const curr = new Map([
    ["SLOT_ODDS", { player_id: "p1", fixture_id: 1, decimal_odds: 2.2, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
    ["SLOT_PROB", { player_id: "p2", fixture_id: 2, decimal_odds: 2.0, model_probability: 0.58, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
    ["SLOT_LINEUP", { player_id: "p3", fixture_id: 3, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "CONFIRMED_POST_LINEUP" }],
    ["SLOT_SWAP", { player_id: "p5", fixture_id: 5, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
  ]);
  const changes = diffSnapshots(prev, curr);
  const byId = Object.fromEntries(changes.map((c) => [c.slot_id, c.change_reason]));
  assert.equal(byId.SLOT_ODDS, "ODDS_MOVED");
  assert.equal(byId.SLOT_PROB, "MODEL_PROBABILITY_CHANGED");
  assert.equal(byId.SLOT_LINEUP, "LINEUP_UPDATE");
  assert.equal(byId.SLOT_SWAP, "BETTER_SELECTION_AVAILABLE");
});

test("SNAPSHOT_DIFF : disparition avec raison explicite MIN_ODDS_FILTER, aucun changement -> pas d'entree", () => {
  const prev = new Map([
    ["SLOT_DROP", { player_id: "p1", fixture_id: 1, decimal_odds: 1.3, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
    ["SLOT_SAME", { player_id: "p2", fixture_id: 2, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
  ]);
  const curr = new Map([
    ["SLOT_SAME", { player_id: "p2", fixture_id: 2, decimal_odds: 2.0, model_probability: 0.5, lineup_status: "PROVISIONAL_PRE_LINEUP" }],
  ]);
  const changes = diffSnapshots(prev, curr, new Map([["SLOT_DROP", "MIN_ODDS_FILTER"]]));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].slot_id, "SLOT_DROP");
  assert.equal(changes[0].change_reason, "MIN_ODDS_FILTER");
  assert.equal(changes[0].new_selection, null);
});

// ---------------------------------------------------------------
// RUN OUTPUT complet - determinisme bout-en-bout
// ---------------------------------------------------------------

test("RUN OUTPUT : meme entree + meme snapshot + meme version modele -> sortie strictement identique", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK, fake_score_league: REG_SCORE_OK });
  const candidates = [
    ...Array.from({ length: 8 }, (_, i) => playerCandidate({ player_id: `p${i}`, fixture_id: 12000 + i, model_probability: 0.3 + i * 0.05, decimal_odds: 1.8 + i * 0.2 })),
    scoreCandidate({ fixture_id: 13001, market: "FT_1X2_HOME", selection: "HOME", model_probability: 0.63, model_probability_uncertainty: 0.02 }),
    scoreCandidate({ fixture_id: 13001, market: "FT_1X2_DRAW", selection: "DRAW", model_probability: 0.24 }),
    scoreCandidate({ fixture_id: 13001, market: "FT_1X2_AWAY", selection: "AWAY", model_probability: 0.13 }),
  ];
  const r1 = runOutputForSnapshot({ candidates, registry, snapshotTime: SNAPSHOT_T, snapshotLabel: "T24", runId: "RUN_TEST_1" });
  const r2 = runOutputForSnapshot({ candidates, registry, snapshotTime: SNAPSHOT_T, snapshotLabel: "T24", runId: "RUN_TEST_1" });
  assert.deepEqual(r1, r2);
  assert.equal(r1.SAFE_PICK_OF_THE_DAY.status, "SELECTED");
  assert.equal(r1.TOP_5_SCORERS_OF_DAY.count_returned, 5);
});

test("RUN OUTPUT : rejette un snapshotLabel hors timeline T168->CLOSE", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  assert.throws(() => runOutputForSnapshot({ candidates: [], registry, snapshotTime: SNAPSHOT_T, snapshotLabel: "T999" }));
});

test("diffRunOutputs : bout-en-bout entre deux RUN OUTPUT complets", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK });
  const candidatesT168 = [playerCandidate({ player_id: "p1", model_probability: 0.5, decimal_odds: 2.0 })];
  const candidatesT72 = [playerCandidate({ player_id: "p1", model_probability: 0.55, decimal_odds: 2.0 })];
  const runT168 = runOutputForSnapshot({ candidates: candidatesT168, registry, snapshotTime: "2026-08-30T00:00:00.000Z", snapshotLabel: "T168" });
  const runT72 = runOutputForSnapshot({ candidates: candidatesT72, registry, snapshotTime: "2026-09-04T00:00:00.000Z", snapshotLabel: "T72" });
  const changes = diffRunOutputs(runT168, runT72);
  const top5Change = changes.find((c) => c.slot_id === "TOP5_RANK_1");
  assert.equal(top5Change.change_reason, "MODEL_PROBABILITY_CHANGED");
});

// ---------------------------------------------------------------
// CORRECTIF PASS FINAL, point 1 : Premier League visible via une
// source d'eligibilite CANONIQUE (factory + PL legacy fusionnes),
// jamais uniquement data/league-validation-registry.json.
// ---------------------------------------------------------------

test("BUG DOCUMENTE + CORRIGE : PL est invisible du registry factory brut, visible apres fusion canonique", () => {
  const rawFactoryRegistry = loadRegistry();
  assert.equal(rawFactoryRegistry.leagues[PL_LEAGUE_KEY], undefined, "PL ne doit jamais apparaitre dans le registry factory brut (validee avant la factory)");

  const plCandidate = scoreCandidate({ league_key: PL_LEAGUE_KEY, model_probability: 0.6 });
  assert.equal(eligibility.isCandidateEligible(plCandidate, rawFactoryRegistry), false, "sans fusion, une jambe PL est a tort jugee inegible");

  const canonical = loadCanonicalEligibilityRegistry(rawFactoryRegistry);
  assert.equal(eligibility.isCandidateEligible(plCandidate, canonical), true, "apres fusion canonique, une jambe Score PL doit etre eligible");
});

test("buildPremierLeagueCanonicalEntry : derive VALIDATED+runnable des DEUX fichiers legacy reels (EXP-002C + oos-final-2024-25-report.json)", () => {
  const entry = buildPremierLeagueCanonicalEntry();
  assert.equal(entry.score_status, "VALIDATED");
  assert.equal(entry.score_runnable, true);
  assert.equal(entry.player_status, "VALIDATED");
  assert.equal(entry.player_runnable, true);
  assert.equal(entry.live_eligible, true);
  assert.equal(entry.canonical_source, "LEGACY_PRE_FACTORY");
  assert.ok(entry.score_source_note.includes("SCORE-LAB-EXP-002C"));
  assert.ok(entry.player_source_note.includes("oos-final-2024-25-report.json"));
});

test("runOutputForSnapshot : une fixture PL valide est eligible a TOP5 (Player), jambe de combo (Score) et SAFE_PICK (Score), en ne passant QUE le registry factory brut", () => {
  const rawFactoryRegistry = loadRegistry(); // le vrai registry factory, SANS PL - jamais pre-fusionne par l'appelant
  const candidates = [
    // TOP5 cote Player : probabilite tres elevee pour garantir un rang top5.
    playerCandidate({ league_key: PL_LEAGUE_KEY, player_id: "pl_striker", fixture_id: 90001, model_probability: 0.72, decimal_odds: 1.7, player_model_version: "PLAYER_SCORER_V1_AGGREGATED_SHARE" }),
    // quelques concurrents non-PL pour un TOP5 realiste
    playerCandidate({ league_key: "ligue2", player_id: "p_other1", fixture_id: 90002, model_probability: 0.2, decimal_odds: 3.0 }),
    playerCandidate({ league_key: "ligue2", player_id: "p_other2", fixture_id: 90003, model_probability: 0.15, decimal_odds: 3.5 }),
    // jambe de combo cote Score PL + concurrents PLAYER pour completer 2 combos
    scoreCandidate({ league_key: PL_LEAGUE_KEY, fixture_id: 90010, market: "FT_1X2_HOME", selection: "HOME", model_probability: 0.6, decimal_odds: 4.0 }),
    playerCandidate({ league_key: "ligue2", player_id: "p_leg1", fixture_id: 90011, model_probability: 0.5, decimal_odds: 3.5 }),
    // SAFE_PICK cote Score PL : criteres stricts + freres de marche pour le calcul d'ecart
    scoreCandidate({ league_key: PL_LEAGUE_KEY, fixture_id: 90020, market: "FT_1X2_HOME", selection: "HOME", model_probability: 0.63, model_probability_uncertainty: 0.02, decimal_odds: 1.6 }),
    scoreCandidate({ league_key: PL_LEAGUE_KEY, fixture_id: 90020, market: "FT_1X2_DRAW", selection: "DRAW", model_probability: 0.24 }),
    scoreCandidate({ league_key: PL_LEAGUE_KEY, fixture_id: 90020, market: "FT_1X2_AWAY", selection: "AWAY", model_probability: 0.13 }),
  ];

  const result = runOutputForSnapshot({ candidates, registry: rawFactoryRegistry, snapshotTime: SNAPSHOT_T });

  const plInTop5 = result.TOP_5_SCORERS_OF_DAY.players.find((p) => p.league === PL_LEAGUE_KEY);
  assert.ok(plInTop5, "PL doit pouvoir apparaitre dans TOP_5_SCORERS_OF_DAY");
  assert.equal(plInTop5.rank, 1);

  const plLegInAnyCombo = result.DAILY_COMBOS.combos.some((c) => c.status === "GENERATED" && c.legs.some((l) => l.league === PL_LEAGUE_KEY));
  assert.ok(plLegInAnyCombo, "une jambe Score PL doit pouvoir entrer dans un combo genere");

  assert.equal(result.SAFE_PICK_OF_THE_DAY.status, "SELECTED");
  assert.equal(result.SAFE_PICK_OF_THE_DAY.league, PL_LEAGUE_KEY);
});

// ---------------------------------------------------------------
// CORRECTIF PASS FINAL, point 2 : les gates reelles ne sont JAMAIS
// contournees pour atteindre la cote >=10, meme si des jambes Score
// non-VALIDATED/non-runnable auraient trivialement suffi.
// ---------------------------------------------------------------

test("COMBOS : registry sans AUCUNE ligue Score eligible -> aucun combo GENERATED, jamais de detour par des jambes Score non-runnable", () => {
  const registry = fakeRegistry({ unvalidated_score_league: { score_status: "INCONCLUSIVE", score_runnable: false, player_status: "NOT_STARTED", player_runnable: false } });
  const candidates = [
    scoreCandidate({ league_key: "unvalidated_score_league", fixture_id: 20001, model_probability: 0.9, decimal_odds: 12.0 }),
    scoreCandidate({ league_key: "unvalidated_score_league", fixture_id: 20002, model_probability: 0.9, decimal_odds: 15.0 }),
    scoreCandidate({ league_key: "unvalidated_score_league", fixture_id: 20003, model_probability: 0.9, decimal_odds: 20.0 }),
  ];
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.eligible_pool_size, 0);
  assert.ok(result.combos.every((c) => c.status === "NO_QUALIFYING_COMBINATION"), "sans aucune jambe Score eligible, DAILY_COMBOS ne doit jamais forcer un combo");
});

test("COMBOS : une jambe Score tres rentable mais non-runnable n'est JAMAIS utilisee pour franchir le seuil de cote, meme si le pool eligible est insuffisant seul", () => {
  const registry = fakeRegistry({ ligue2: REG_PLAYER_OK, unvalidated_score_league: { score_status: "INCONCLUSIVE", score_runnable: false } });
  const candidates = [
    playerCandidate({ player_id: "p1", fixture_id: 21001, model_probability: 0.5, decimal_odds: 2.0 }),
    playerCandidate({ player_id: "p2", fixture_id: 21002, model_probability: 0.5, decimal_odds: 2.0 }), // produit = 4.0, insuffisant seul (<10)
    scoreCandidate({ league_key: "unvalidated_score_league", fixture_id: 21003, model_probability: 0.9, decimal_odds: 50.0 }), // aurait trivialement franchi 10 si autorise
  ];
  const result = generateDailyCombos({ candidates, registry, snapshotTime: SNAPSHOT_T });
  assert.equal(result.eligible_pool_size, 2, "la jambe Score non-runnable ne doit jamais entrer dans le pool eligible");
  for (const c of result.combos) {
    if (c.status === "GENERATED") assert.ok(!c.legs.some((l) => l.league === "unvalidated_score_league"), "jamais une jambe d'une ligue Score non-runnable dans un combo genere");
    else assert.equal(c.status, "NO_QUALIFYING_COMBINATION");
  }
  assert.equal(result.combos[0].status, "NO_QUALIFYING_COMBINATION", "sans la jambe interdite, le pool eligible (4.0) n'atteint pas 10.00 - jamais force");
});

test("EXAMPLE_SYNTHETIC_DATA : le script d'exemple marque explicitement ses donnees comme synthetiques", () => {
  // Verification statique du contrat plutot que de re-executer le
  // script (qui imprime sur stdout) - garantit que le flag ne peut pas
  // etre silencieusement retire sans faire echouer ce test.
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "generate-run-output-example.js"), "utf8");
  assert.ok(src.includes("EXAMPLE_SYNTHETIC_DATA: true"), "le generateur d'exemple doit toujours marquer EXAMPLE_SYNTHETIC_DATA=true dans sa sortie");
});
