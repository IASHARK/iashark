"use strict";
// GATE C1 (SPEC LAB PRO v1.0) - LE test qui compte le plus pour ce runner :
// ajouter un match futur EXTREMEMENT anormal (score aberrant) ne doit
// changer STRICTEMENT AUCUNE prediction anterieure. Si ce test echoue,
// le runner a une fuite de donnees et EXP-001 ne doit jamais tourner
// dessus, quelle que soit la qualite des autres tests.

const test = require("node:test");
const assert = require("node:assert/strict");
const { runWalkForward, buildCutoffs } = require("../lib/lab/walkforward-runner.js");

const HOME_ID = 10, AWAY_POOL_START = 100;
const LEAGUE_ID = 39, LEAGUE_AVG_H = 1.35, LEAGUE_AVG_A = 1.10;

// Genere un mini-championnat synthetique : chaque equipe HOME_ID..HOME_ID+N
// joue contre un pool d'adversaires distincts, resultats varies mais
// realistes (jamais de 0 partout, jamais de score aberrant) - suffisamment
// de matchs pour que calcCriteres accepte l'echantillon (>=3).
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
      const gh = (m + t) % 3;
      const ga = (m + t + 1) % 3;
      fixtures.push({
        fixture_id: fid++,
        league_id: LEAGUE_ID,
        season,
        kickoff_timestamp: kickoff,
        home_team_id: teamId,
        away_team_id: oppId,
        status: "FINISHED",
        goals_home_90: gh,
        goals_away_90: ga,
      });
    }
  }
  return fixtures.sort((a, b) => new Date(a.kickoff_timestamp) - new Date(b.kickoff_timestamp));
}

function fixedRhoFitter() {
  // Fitter deterministe et trivial pour ce test - ne teste PAS fit_rho.py
  // ici (deja couvert par tests/lab-node-python-fidelity.test.js et
  // tests/lab-synthetic-identifiability.test.js), teste uniquement
  // l'ETANCHEITE temporelle du runner lui-meme.
  return { rho_hat: -0.10, convergence: true, iterations: 1 };
}

test("walkforward-runner: ajouter un match FUTUR aberrant ne change AUCUNE prediction anterieure (preuve anti-leakage)", () => {
  const warmup = buildSyntheticFixtures(6, 8, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticFixtures(6, 10, "2026-03-01T12:00:00Z", 2023);
  const baseFixtures = [...warmup, ...oos];

  const optionsBase = {
    allFixtures: baseFixtures,
    trainSeasons: [2022],
    oosSeasons: [2023],
    championRho: -0.0845,
    candidateRhoFitter: fixedRhoFitter,
    leagueAvgH: LEAGUE_AVG_H, leagueAvgA: LEAGUE_AVG_A, leagueId: LEAGUE_ID,
  };

  const resultBefore = runWalkForward(optionsBase);
  assert.ok(resultBefore.predictions.length > 0, "le jeu synthetique doit produire au moins une prediction pour que ce test soit significatif");

  // Match FUTUR extremement anormal : tres loin dans le temps (apres
  // toutes les fixtures OOS existantes), score delirant (20-0), équipes
  // deja connues.
  const lastOosDate = new Date(Math.max(...oos.map((f) => new Date(f.kickoff_timestamp).getTime())));
  const futureAnomalousMatch = {
    fixture_id: 999999,
    league_id: LEAGUE_ID,
    season: 2023,
    kickoff_timestamp: new Date(lastOosDate.getTime() + 30 * 86400000).toISOString(), // 30 jours apres le dernier match OOS
    home_team_id: HOME_ID,
    away_team_id: AWAY_POOL_START,
    status: "FINISHED",
    goals_home_90: 20,
    goals_away_90: 0,
  };

  const optionsWithFuture = { ...optionsBase, allFixtures: [...baseFixtures, futureAnomalousMatch] };
  const resultAfter = runWalkForward(optionsWithFuture);

  // Les cutoffs anterieurs au match futur doivent etre EXACTEMENT les
  // memes (le futur match ne doit meme pas apparaitre comme un cutoff
  // supplementaire AVANT sa propre date).
  const cutoffsBefore = resultBefore.cutoffs;
  const cutoffsSharedAfter = resultAfter.cutoffs.filter((c) => cutoffsBefore.includes(c));
  assert.deepEqual(cutoffsSharedAfter, cutoffsBefore, "les cutoffs anterieurs au match futur ne doivent jamais changer");

  // Chaque prediction anterieure doit rester BYTE-IDENTIQUE (deepEqual
  // strict, pas une tolerance numerique - rien ne devrait meme legerement
  // bouger puisque rien de legitime n'a change pour ces cutoffs-la).
  assert.equal(resultAfter.predictions.length >= resultBefore.predictions.length, true);
  for (let i = 0; i < resultBefore.predictions.length; i++) {
    const before = resultBefore.predictions[i];
    const after = resultAfter.predictions.find((p) => p.fixture_id === before.fixture_id && p.cutoff === before.cutoff);
    assert.ok(after, `prediction pour fixture_id=${before.fixture_id} cutoff=${before.cutoff} introuvable apres ajout du match futur`);
    assert.deepEqual(after, before, `la prediction pour fixture_id=${before.fixture_id} a CHANGE apres l'ajout d'un match futur - FUITE DE DONNEES DETECTEE`);
  }

  // Le fit log (rho appris a chaque cutoff) doit lui aussi rester identique.
  assert.deepEqual(resultAfter.fitLog.slice(0, resultBefore.fitLog.length), resultBefore.fitLog, "le rho appris a chaque cutoff anterieur ne doit jamais changer suite a l'ajout d'un match futur");
});

test("walkforward-runner: le match aberrant N'APPARAIT dans aucun train tant que son propre cutoff n'est pas atteint", () => {
  const warmup = buildSyntheticFixtures(6, 8, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticFixtures(6, 10, "2026-03-01T12:00:00Z", 2023);
  const lastOosDate = new Date(Math.max(...oos.map((f) => new Date(f.kickoff_timestamp).getTime())));
  const futureMatch = {
    fixture_id: 999998, league_id: LEAGUE_ID, season: 2023,
    kickoff_timestamp: new Date(lastOosDate.getTime() + 30 * 86400000).toISOString(),
    home_team_id: HOME_ID, away_team_id: AWAY_POOL_START, status: "FINISHED",
    goals_home_90: 99, goals_away_90: 0, // valeur delirante, facile a detecter si elle fuit
  };
  const allFixtures = [...warmup, ...oos, futureMatch];
  const result = runWalkForward({
    allFixtures, trainSeasons: [2022], oosSeasons: [2023],
    championRho: -0.0845, candidateRhoFitter: fixedRhoFitter,
    leagueAvgH: LEAGUE_AVG_H, leagueAvgA: LEAGUE_AVG_A, leagueId: LEAGUE_ID,
  });
  // Aucune prediction (sur des cutoffs anterieurs au futureMatch) ne doit
  // presenter un lambda anormalement gonfle par le score 99-0 - verification
  // indirecte que le futur n'a pas fuite dans le calcul des lambdas.
  for (const p of result.predictions) {
    assert.ok(p.lambdaH < 5, `lambdaH=${p.lambdaH} anormalement eleve pour fixture_id=${p.fixture_id} - suspicion de fuite du score 99-0 futur`);
  }
});
