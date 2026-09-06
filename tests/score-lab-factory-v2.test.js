"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Tests deterministes de l'usine
// generique - champion-selection, coverage-gate corrige, holdout-seal
// (jamais un acces au holdout sans verification prealable), canonical
// champion loader (jamais de fallback silencieux vers lib/engine.js),
// et evaluation de holdout (logique pure, testee avec des donnees
// synthetiques - AUCUN holdout reel n'est jamais ouvert par ces tests).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { selectChampion } = require("../lib/score-lab-factory-v2/champion-selection.js");
const { evaluateCoverageGate, MIN_VALID_FIXTURE_COVERAGE_RATE, MIN_ABSOLUTE_FLOOR } = require("../lib/score-lab-factory-v2/coverage-gate.js");
const { getHoldoutSealStatus, assertHoldoutSealedBeforeAccess } = require("../lib/score-lab-factory-v2/holdout-seal.js");
const { loadCanonicalScoreChampion, UNAVAILABLE_REASONS } = require("../lib/score-lab-factory-v2/canonical-champion-loader.js");
const { evaluateHoldout } = require("../lib/score-lab-factory-v2/holdout-validation.js");
const { MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MAX_RHO_STD, MAX_SECONDARY_DEGRADATION } = require("../lib/promotion.js");

const THRESHOLDS = { MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MAX_RHO_STD, MAX_SECONDARY_DEGRADATION };

function candidate(nll, overrides) {
  return { nll, secondary: { ou25_logloss: 0.5, btts_logloss: 0.5, x12_logloss: 0.9 }, n_oos: 300, structural: { convergence_rate: 1, boundary_hit_rate: 0, rho_std: 0.01 }, ...overrides };
}

// ---------------------------------------------------------------
// champion-selection.js
// ---------------------------------------------------------------

test("selectChampion : le NLL absolu le plus bas gagne - jamais un seuil de gain minimal type challenger-promotion", () => {
  const candidates = { B0: candidate(3.0), M0: candidate(2.9), M2: candidate(2.95) };
  const result = selectChampion(candidates, THRESHOLDS);
  assert.equal(result.champion_selected, "M0");
});

test("selectChampion : B0 (baseline) PEUT gagner et devenir le champion", () => {
  const candidates = { B0: candidate(2.5), M0: candidate(2.9), M2: candidate(2.95) };
  const result = selectChampion(candidates, THRESHOLDS);
  assert.equal(result.champion_selected, "B0");
});

test("selectChampion : un candidat structurellement instable (rho_std trop haut) est vetoe, jamais choisi meme avec le meilleur NLL", () => {
  const candidates = {
    B0: candidate(3.0),
    M0: candidate(2.5, { structural: { convergence_rate: 1, boundary_hit_rate: 0, rho_std: 999 } }),
    M2: candidate(2.9),
  };
  const result = selectChampion(candidates, THRESHOLDS);
  assert.ok(result.vetoed.M0);
  assert.equal(result.champion_selected, "M2");
});

test("selectChampion : veto secondaire si le vainqueur primaire degrade un marche de plus de MAX_SECONDARY_DEGRADATION vs un autre candidat", () => {
  const candidates = {
    B0: candidate(3.0),
    M0: candidate(2.5, { secondary: { ou25_logloss: 1.0, btts_logloss: 0.5, x12_logloss: 0.9 } }), // ou25 tres degrade
    M2: candidate(2.6, { secondary: { ou25_logloss: 0.5, btts_logloss: 0.5, x12_logloss: 0.9 } }),
  };
  const result = selectChampion(candidates, THRESHOLDS);
  assert.equal(result.primary_winner_before_secondary_veto, "M0");
  assert.ok(result.secondary_veto);
  assert.equal(result.champion_selected, null, "aucun champion ne doit etre choisi automatiquement en cas de veto secondaire - selection manuelle requise");
});

// ---------------------------------------------------------------
// coverage-gate.js - corrige l'erreur MIN_N_OOS=500 universelle
// ---------------------------------------------------------------

test("evaluateCoverageGate : fonctionne pour des ligues de tailles differentes (306/380/462 matchs), jamais un seuil absolu universel inatteignable", () => {
  // Bundesliga-like (18 equipes, 306 matchs) : 280 valides = 91.5% -> PASS
  assert.equal(evaluateCoverageGate({ nValidPredictions: 280, totalFixturesInSeason: 306 }).pass, true);
  // Serie A-like (20 equipes, 380 matchs) : 377 valides = 99.2% -> PASS
  assert.equal(evaluateCoverageGate({ nValidPredictions: 377, totalFixturesInSeason: 380 }).pass, true);
  // J1-like (462 matchs) : 420 valides = 90.9% -> PASS
  assert.equal(evaluateCoverageGate({ nValidPredictions: 420, totalFixturesInSeason: 462 }).pass, true);
});

test("evaluateCoverageGate : jamais MIN_N_OOS=500 - un ancien seuil absolu qu'AUCUNE ligue a une seule saison ne peut jamais atteindre", () => {
  assert.notEqual(MIN_ABSOLUTE_FLOOR, 500);
  // Une saison complete et parfaitement couverte (100%) doit pouvoir PASSER,
  // meme avec un nombre de matchs bien en dessous de 500.
  assert.equal(evaluateCoverageGate({ nValidPredictions: 380, totalFixturesInSeason: 380 }).pass, true);
});

test("evaluateCoverageGate : rate insuffisant (<90%) echoue meme avec un grand nombre absolu de matchs", () => {
  const result = evaluateCoverageGate({ nValidPredictions: 300, totalFixturesInSeason: 462 }); // 65%
  assert.equal(result.pass, false);
  assert.equal(result.rate_ok, false);
});

test("evaluateCoverageGate : floor absolu echoue meme avec un rate parfait, sur un tout petit echantillon", () => {
  const result = evaluateCoverageGate({ nValidPredictions: 50, totalFixturesInSeason: 50 }); // 100% mais 50 < 200
  assert.equal(result.pass, false);
  assert.equal(result.floor_ok, false);
});

// ---------------------------------------------------------------
// holdout-seal.js
// ---------------------------------------------------------------

test("getHoldoutSealStatus : Serie A est detectee CONSUMED (fichier 2025 deja fetch lors du protocole V1) - sans aucun cas particulier code en dur", () => {
  const league = { key: "seriea", seasonSplit: { sealed_unread: 2025 } };
  const status = getHoldoutSealStatus(league);
  assert.equal(status.sealed, false);
  assert.equal(status.access_count, 1);
});

test("getHoldoutSealStatus : Ligue 1 (pas encore ouverte) est detectee SEALED", () => {
  const league = { key: "ligue1", seasonSplit: { sealed_unread: 2025 } };
  const status = getHoldoutSealStatus(league);
  assert.equal(status.sealed, true);
  assert.equal(status.access_count, 0);
});

test("assertHoldoutSealedBeforeAccess : leve une exception pour Serie A (deja consommee) - jamais un acces silencieux", () => {
  const league = { key: "seriea", seasonSplit: { sealed_unread: 2025 } };
  assert.throws(() => assertHoldoutSealedBeforeAccess(league), /HOLDOUT_ALREADY_CONSUMED|HOLDOUT DEJA CONSOMME/);
});

test("assertHoldoutSealedBeforeAccess : ne leve rien pour une ligue encore scellee", () => {
  const league = { key: "ligue1", seasonSplit: { sealed_unread: 2025 } };
  assert.doesNotThrow(() => assertHoldoutSealedBeforeAccess(league));
});

// ---------------------------------------------------------------
// canonical-champion-loader.js - AUCUN fallback silencieux
// ---------------------------------------------------------------

test("loadCanonicalScoreChampion : ligue sans artifact -> NO_CANONICAL_PREDICTION explicite, jamais un objet champion invente", () => {
  const result = loadCanonicalScoreChampion("__ligue_totalement_inexistante__");
  assert.equal(result.available, false);
  assert.equal(result.reason, UNAVAILABLE_REASONS.NO_ARTIFACT);
});

test("loadCanonicalScoreChampion : ligue avec un verdict INCONCLUSIVE/REJECTED -> indisponible explicitement, jamais un repli sur un ancien champion", () => {
  const tmpDir = path.join(__dirname, "..", "data", "league-factory", "__test_league_inconclusive__", "score-lab-factory-v2");
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "holdout-validation-report.json"), JSON.stringify({ verdict: "INCONCLUSIVE" }));
  try {
    const result = loadCanonicalScoreChampion("__test_league_inconclusive__");
    assert.equal(result.available, false);
    assert.equal(result.reason, UNAVAILABLE_REASONS.NOT_VALIDATED);
    assert.equal(result.verdict, "INCONCLUSIVE");
  } finally {
    fs.rmSync(path.join(__dirname, "..", "data", "league-factory", "__test_league_inconclusive__"), { recursive: true, force: true });
  }
});

test("loadCanonicalScoreChampion : ligue VALIDATED -> retourne le champion complet (rho/leagueAvg/structure), jamais une reference a lib/engine.js", () => {
  const tmpDir = path.join(__dirname, "..", "data", "league-factory", "__test_league_validated__", "score-lab-factory-v2");
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "holdout-validation-report.json"), JSON.stringify({ verdict: "VALIDATED", holdout_season: 2025 }));
  fs.writeFileSync(path.join(tmpDir, "production-validation-contract.json"), JSON.stringify({ contract: { champion: { model_id: "M2", rho: -0.05, league_avg_h: 1.4, league_avg_a: 1.2, structural_formula: "prior_equivalents(n)=max(0,8-0.5n)", code_sha_at_freeze: "abc123" } } }));
  try {
    const result = loadCanonicalScoreChampion("__test_league_validated__");
    assert.equal(result.available, true);
    assert.equal(result.champion.model_id, "M2");
    assert.equal(result.champion.rho, -0.05);
    assert.ok(!JSON.stringify(result).includes("lib/engine.js"), "le champion charge ne doit jamais referencer l'ancien moteur global");
  } finally {
    fs.rmSync(path.join(__dirname, "..", "data", "league-factory", "__test_league_validated__"), { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------
// holdout-validation.js - logique pure, DONNEES SYNTHETIQUES uniquement
// ---------------------------------------------------------------

function fakeContract(overrides) {
  return {
    champion: { model_id: "M0", rho: -0.05 },
    gates: {
      EXACT_SCORE_NLL: { threshold: 3.0 },
      CALIBRATION: { threshold_ece: 0.05 },
      MARKET_MARGINALS: { max_relative_degradation: 0.03, oos_dev_logloss: { ou25_logloss: 1.2, btts_logloss: 1.2, x12_logloss: 1.5 } },
      NO_CATASTROPHIC_SECONDARY_DEGRADATION: { max_relative_degradation: 0.1, oos_dev_low_score: {} },
    },
    ...overrides,
  };
}

function fakePrediction(h, a, cutoff, fixtureId) {
  return { fixture_id: fixtureId, cutoff, h, a, lambdaH: 1.4, lambdaA: 1.1, rho: -0.05, markets: { p1: 0.45, pN: 0.28, p2: 0.27, overUnder: { "2.5": { over: 0.55 } }, btts: { yes: 0.52 } } };
}

test("evaluateHoldout (synthetique) : POINT_IN_TIME_INTEGRITY echoue si une prediction ne vient pas du holdout - jamais ignore", () => {
  const contract = fakeContract();
  const predictions = [fakePrediction(1, 0, "2025-01-01", 999)];
  const holdoutFixtureIds = new Set([1, 2, 3]); // 999 n'y est pas
  const result = evaluateHoldout({ contract, predictions, totalFixturesInHoldoutSeason: 300, holdoutFixtureIds, exactScoreNLL: () => 1.0 });
  assert.equal(result.gates.POINT_IN_TIME_INTEGRITY.pass, false);
  assert.equal(result.verdict, "REJECTED");
});

test("evaluateHoldout (synthetique) : verdict VALIDATED uniquement si tous les gates passent - jamais un forcage", () => {
  const contract = fakeContract();
  // Issues variees (home/draw/away) - jamais un seul resultat repete
  // partout, sinon la regression de calibration degenere (separation
  // complete, non-convergence) - artefact du jeu de test, pas du module.
  const outcomes = [[2, 0], [1, 1], [0, 2], [1, 0], [0, 1]];
  const predictions = Array.from({ length: 250 }, (_, i) => {
    const [h, a] = outcomes[i % outcomes.length];
    return fakePrediction(h, a, "2025-0" + (1 + (i % 9)) + "-01", i);
  });
  const holdoutFixtureIds = new Set(predictions.map((p) => p.fixture_id));
  const result = evaluateHoldout({ contract, predictions, totalFixturesInHoldoutSeason: 260, holdoutFixtureIds, exactScoreNLL: () => 1.5 });
  assert.equal(result.gates.EXACT_SCORE_NLL.pass, true);
  assert.equal(result.gates.DATA_COVERAGE.pass, true);
  assert.equal(result.verdict, "VALIDATED");
  assert.equal(result.score_runnable, true);
});

test("evaluateHoldout (synthetique) : coverage insuffisante -> INCONCLUSIVE, jamais REJECTED (pas encore assez de donnees != modele mauvais)", () => {
  const contract = fakeContract();
  const predictions = Array.from({ length: 50 }, (_, i) => fakePrediction(1, 1, "2025-01-01", i));
  const holdoutFixtureIds = new Set(predictions.map((p) => p.fixture_id));
  const result = evaluateHoldout({ contract, predictions, totalFixturesInHoldoutSeason: 55, holdoutFixtureIds, exactScoreNLL: () => 1.5 });
  assert.equal(result.gates.DATA_COVERAGE.pass, false);
  assert.equal(result.verdict, "INCONCLUSIVE");
});

// ---------------------------------------------------------------
// Genericite du runner CLI - aucune ligue codee en dur
// ---------------------------------------------------------------

test("scripts CLI Score Lab Factory V2 : acceptent --league=<key> generiquement, aucune ligue codee en dur, aucun acces a oos_final/sealed_unread en Phase A/B", () => {
  const phaseAB = [
    fs.readFileSync(path.join(__dirname, "..", "scripts", "score-lab-v2-champion-selection.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "..", "scripts", "score-lab-v2-freeze-contract.js"), "utf8"),
  ];
  for (const src of phaseAB) {
    assert.match(src, /args\.league \|\| args\["league-key"\]/);
    assert.ok(!/seriea|ligue1|bundesliga|laliga/i.test(src.replace(/\/\/.*$/gm, "")), "aucune ligue ne doit etre codee en dur (hors commentaires)");
    assert.ok(!/sp\.oos_final/.test(src), "Phase A/B ne doit jamais lire oos_final");
    assert.ok(!/sp\.sealed_unread/.test(src), "Phase A/B ne doit jamais lire sealed_unread");
  }
});

test("scripts CLI Phase C (holdout) : refuse de s'executer sans --confirm=OPEN_HOLDOUT explicite", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "score-lab-v2-holdout-validation.js"), "utf8");
  assert.match(src, /confirm !== "OPEN_HOLDOUT"/);
  assert.match(src, /assertHoldoutSealedBeforeAccess/);
});

// ---------------------------------------------------------------
// Preuve d'execution reelle Phase A/B (Ligue 1) - deja lancee dans ce
// tour, jamais un holdout touche.
// ---------------------------------------------------------------

test("Ligue 1 : Phase A/B deja executees avec succes via le runner GENERIQUE (memes fichiers que Serie A, aucun script specifique a Ligue 1)", () => {
  const v2Dir = path.join(__dirname, "..", "data", "league-factory", "ligue1", "score-lab-factory-v2");
  assert.ok(fs.existsSync(path.join(v2Dir, "champion-selection.json")));
  assert.ok(fs.existsSync(path.join(v2Dir, "production-validation-contract.json")));
  const selection = JSON.parse(fs.readFileSync(path.join(v2Dir, "champion-selection.json"), "utf8"));
  assert.ok(["B0", "M0", "M2"].includes(selection.champion_selected));
  const { contract } = JSON.parse(fs.readFileSync(path.join(v2Dir, "production-validation-contract.json"), "utf8"));
  assert.equal(contract.gates.DATA_COVERAGE.rate_threshold, MIN_VALID_FIXTURE_COVERAGE_RATE);
  assert.notEqual(contract.gates.DATA_COVERAGE.threshold, 500);
});
