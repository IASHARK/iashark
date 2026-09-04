"use strict";
// GATE C10 - test de PLOMBERIE de l'orchestration complete (gating ->
// integrite lockbox -> walk-forward -> fit -> metriques -> bootstrap ->
// promotion). Donnees 100% synthetiques : verifie que le CABLAGE
// fonctionne de bout en bout, jamais un resultat EXP-001. Le vrai
// scripts/fit_rho.py est appele au moins une fois (pas seulement un
// fitter injecte) pour prouver que l'integration reelle fonctionne aussi,
// pas seulement le chemin mocke.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadManifest } = require("../lib/lab/experiment-manifest.js");
const { runExperiment } = require("../lib/lab/run-experiment.js");
const { sealLockbox } = require("../lib/data/dataset-version.js");

const HOME_ID = 10, AWAY_POOL_START = 100, LEAGUE_ID = 39;

function buildSyntheticFixtures(nTeams, matchesPerTeam, startDate, season) {
  const fixtures = [];
  let fid = 1;
  const start = new Date(startDate).getTime();
  const dayMs = 86400000;
  for (let t = 0; t < nTeams; t++) {
    const teamId = HOME_ID + t;
    for (let m = 0; m < matchesPerTeam; m++) {
      const oppId = AWAY_POOL_START + ((t + m + 1) % nTeams);
      const kickoff = new Date(start + (t * matchesPerTeam + m) * dayMs).toISOString();
      fixtures.push({
        fixture_id: fid++,
        league_id: LEAGUE_ID,
        season,
        kickoff_timestamp: kickoff,
        home_team_id: teamId,
        away_team_id: oppId,
        status: "FINISHED",
        goals_home_90: (m + t) % 3,
        goals_away_90: (m + t + 1) % 3,
      });
    }
  }
  return fixtures.sort((a, b) => new Date(a.kickoff_timestamp) - new Date(b.kickoff_timestamp));
}

function fullySatisfiedManifest(overrides = {}) {
  const manifest = loadManifest();
  return {
    ...manifest,
    status: "RUNNING",
    gating_to_running: {
      ...manifest.gating_to_running,
      conditions: manifest.gating_to_running.conditions.map((c) => ({ ...c, satisfied: true })),
    },
    methodology: { ...manifest.methodology, bootstrap: { ...manifest.methodology.bootstrap, n_resamples: 500 } },
    ...overrides,
  };
}

// Construit un manifest explicitement BLOCKED (toutes conditions a false),
// independamment de l'etat REEL du manifest commite - depuis que GATE B1
// a reellement collecte les donnees Premier League (2026-09-04), le
// manifest commite est passe a REGISTERED/gate satisfait, ce test ne peut
// donc plus supposer qu'il est bloque par defaut.
function blockedManifest() {
  const manifest = loadManifest();
  return {
    ...manifest,
    status: "BLOCKED_DATA",
    gating_to_running: {
      ...manifest.gating_to_running,
      conditions: manifest.gating_to_running.conditions.map((c) => ({ ...c, satisfied: false })),
    },
  };
}

test("runExperiment: manifest avec gating explicitement bloque -> refuse de lancer, jamais de calcul effectue", () => {
  const manifest = blockedManifest();
  const result = runExperiment({ manifest, allFixtures: [] });
  assert.equal(result.launched, false);
  assert.equal(result.reason, "GATING_BLOCKED");
  assert.equal(result.blocking_ids.length, 4);
});

test("runExperiment: lockbox scelle qui NE correspond PAS aux fixtures fournies -> LOCKBOX_INTEGRITY_FAILED, aucun calcul", () => {
  const warmup = buildSyntheticFixtures(6, 8, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticFixtures(6, 10, "2026-03-01T12:00:00Z", 2023);
  const allFixtures = [...warmup, ...oos];
  // Lockbox scelle sur un jeu de fixture_ids DIFFERENT (juste [1,2,3]) - doit etre detecte.
  const wrongLockbox = sealLockbox([1, 2, 3], LEAGUE_ID, "2022-2023");
  const manifest = fullySatisfiedManifest();
  const result = runExperiment({
    manifest, allFixtures, sealedLockbox: wrongLockbox,
    trainSeasons: [2022], oosSeasons: [2023], leagueId: LEAGUE_ID,
    candidateRhoFitter: () => ({ rho_hat: -0.05, convergence: true }),
  });
  assert.equal(result.launched, false);
  assert.equal(result.reason, "LOCKBOX_INTEGRITY_FAILED");
  assert.equal(result.detail.intact, false);
});

test("runExperiment: lockbox scelle qui CORRESPOND aux fixtures fournies -> passe l'etape d'integrite, calcul effectue", () => {
  const warmup = buildSyntheticFixtures(6, 8, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticFixtures(6, 10, "2026-03-01T12:00:00Z", 2023);
  const allFixtures = [...warmup, ...oos];
  const correctLockbox = sealLockbox(allFixtures.map((f) => f.fixture_id), LEAGUE_ID, "2022-2023");
  const manifest = fullySatisfiedManifest();
  const result = runExperiment({
    manifest, allFixtures, sealedLockbox: correctLockbox,
    trainSeasons: [2022], oosSeasons: [2023], leagueId: LEAGUE_ID, leagueAvgH: 1.35, leagueAvgA: 1.10,
    candidateRhoFitter: () => ({ rho_hat: -0.05, convergence: true }),
  });
  assert.equal(result.launched, true);
  assert.ok(result.n_predictions > 0);
});

test("runExperiment: pipeline complet de bout en bout (walk-forward -> VRAI fit_rho.py -> metriques -> bootstrap -> promotion), sur donnees 100% synthetiques - PLOMBERIE UNIQUEMENT, jamais un resultat EXP-001", () => {
  // Volontairement petit (peu de cutoffs) : ce test verifie le CABLAGE de
  // bout en bout avec le VRAI scripts/fit_rho.py, qui est appele UNE FOIS
  // PAR CUTOFF (spawn Python separe a chaque fois) - contrairement a
  // tests/lab-synthetic-identifiability.test.js qui agrege tout en UN seul
  // appel. L'identifiabilite du fitter lui-meme est deja prouvee ailleurs ;
  // ici on ne prouve que le branchement walk-forward -> fitter reel.
  const warmup = buildSyntheticFixtures(6, 8, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticFixtures(6, 4, "2026-04-01T12:00:00Z", 2023);
  const allFixtures = [...warmup, ...oos];
  const manifest = fullySatisfiedManifest();

  const result = runExperiment({
    manifest, allFixtures,
    trainSeasons: [2022], oosSeasons: [2023], leagueId: LEAGUE_ID, leagueAvgH: 1.35, leagueAvgA: 1.10,
    // Pas de candidateRhoFitter injecte ici : utilise le VRAI scripts/fit_rho.py
    // (lib/lab/run-experiment.js#pythonRhoFitter par defaut) - preuve que
    // l'integration reelle fonctionne, pas seulement le chemin mocke.
  });

  assert.equal(result.launched, true, `le pipeline devrait se lancer une fois le gating satisfait : ${JSON.stringify(result)}`);
  assert.ok(result.n_predictions > 0);
  assert.ok(typeof result.nll_m0 === "number" && Number.isFinite(result.nll_m0));
  assert.ok(typeof result.nll_m1 === "number" && Number.isFinite(result.nll_m1));
  assert.equal(result.bootstrap.valid, true);
  assert.ok(["PROMOTE", "SHADOW_MORE_DATA", "REJECT"].includes(result.promotion.status));
  assert.ok(result.low_score_diagnostics["0-0"], "les diagnostics bas-score doivent etre presents");
  assert.ok(result.secondary_metrics.ou25 && result.secondary_metrics.btts && result.secondary_metrics.x12, "les metriques secondaires doivent etre presentes");
});

test("runExperiment: ne modifie jamais le manifest fourni (pas de mutation - meme objet compare avant/apres)", () => {
  const warmup = buildSyntheticFixtures(6, 8, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticFixtures(6, 10, "2026-03-01T12:00:00Z", 2023);
  const allFixtures = [...warmup, ...oos];
  const manifest = fullySatisfiedManifest();
  const manifestSnapshot = JSON.parse(JSON.stringify(manifest));
  runExperiment({
    manifest, allFixtures, trainSeasons: [2022], oosSeasons: [2023], leagueId: LEAGUE_ID,
    candidateRhoFitter: () => ({ rho_hat: -0.05, convergence: true }),
  });
  assert.deepEqual(manifest, manifestSnapshot, "runExperiment ne doit jamais muter le manifest en entree");
});
