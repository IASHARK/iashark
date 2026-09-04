"use strict";
// EXP-002 - tests du runner walk-forward M0 vs M2. Donnees 100%
// synthetiques, jamais un resultat EXP-002 reel.

const test = require("node:test");
const assert = require("node:assert/strict");
const { runWalkForwardM2, classifyBucket, isReturningTeam } = require("../lib/lab/walkforward-m2-runner.js");

const LEAGUE_ID = 39;
const HOME_ID = 10, AWAY_POOL_START = 100;

// Championnat synthetique : nTeams equipes, chacune joue matchesPerTeam
// matchs contre un pool d'adversaires distincts.
function buildSyntheticSeason(nTeams, matchesPerTeam, startDate, season) {
  const fixtures = [];
  let fid = season * 100000 + 1;
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
        home_team_name: "Team" + teamId,
        away_team_name: "Team" + oppId,
        status: "FINISHED",
        goals_home_90: (m + t) % 3,
        goals_away_90: (m + t + 1) % 3,
      });
    }
  }
  return fixtures.sort((a, b) => new Date(a.kickoff_timestamp) - new Date(b.kickoff_timestamp));
}

test("classifyBucket: bornes exactes EARLY[0,8] / TRANSITION[9,16] / LATE[17,+inf)", () => {
  assert.equal(classifyBucket(0), "EARLY");
  assert.equal(classifyBucket(8), "EARLY");
  assert.equal(classifyBucket(9), "TRANSITION");
  assert.equal(classifyBucket(16), "TRANSITION");
  assert.equal(classifyBucket(17), "LATE");
  assert.equal(classifyBucket(30), "LATE");
});

test("isReturningTeam: vrai si l'equipe a joue au moins un match la saison precedente, faux sinon", () => {
  const prevSeason = buildSyntheticSeason(6, 5, "2026-01-01T12:00:00Z", 2022);
  assert.equal(isReturningTeam(prevSeason, HOME_ID), true);
  assert.equal(isReturningTeam(prevSeason, 99999), false);
});

test("anti-leakage : un match FUTUR aberrant ne change aucune prediction anterieure", () => {
  const prevSeason = buildSyntheticSeason(8, 10, "2026-01-01T12:00:00Z", 2022);
  const currentSeason = buildSyntheticSeason(8, 20, "2026-08-01T12:00:00Z", 2023);
  const currentBySeasons = new Map([[2023, currentSeason]]);
  const prevBySeasons = new Map([[2023, prevSeason]]);

  const before = runWalkForwardM2({ currentSeasonFixturesBySeasons: currentBySeasons, previousSeasonFixturesBySeasons: prevBySeasons, oosSeasons: [2023], leagueId: LEAGUE_ID });
  assert.ok(before.predictions.length > 0);

  const lastDate = new Date(Math.max(...currentSeason.map((f) => new Date(f.kickoff_timestamp).getTime())));
  const futureMatch = {
    fixture_id: 999999999, league_id: LEAGUE_ID, season: 2023,
    kickoff_timestamp: new Date(lastDate.getTime() + 30 * 86400000).toISOString(),
    home_team_id: HOME_ID, away_team_id: AWAY_POOL_START, home_team_name: "TeamX", away_team_name: "TeamY",
    status: "FINISHED", goals_home_90: 20, goals_away_90: 0,
  };
  const currentBySeasonsAfter = new Map([[2023, [...currentSeason, futureMatch]]]);
  const after = runWalkForwardM2({ currentSeasonFixturesBySeasons: currentBySeasonsAfter, previousSeasonFixturesBySeasons: prevBySeasons, oosSeasons: [2023], leagueId: LEAGUE_ID });

  for (let i = 0; i < before.predictions.length; i++) {
    const b = before.predictions[i];
    const a = after.predictions.find((p) => p.fixture_id === b.fixture_id && p.cutoff === b.cutoff);
    assert.ok(a, `prediction fixture_id=${b.fixture_id} introuvable apres ajout du match futur`);
    assert.deepEqual(a, b, `prediction fixture_id=${b.fixture_id} a change apres ajout d'un match futur - FUITE DE DONNEES`);
  }
});

test("INVARIANT CRITIQUE - quand n_home>=16 ET n_away>=16, M2 est numeriquement identique a M0 (abs(P_M2-P_M0)<=1e-12)", () => {
  // 6 equipes, 25 matchs chacune -> largement de quoi atteindre n>=16 en fin de saison.
  const prevSeason = buildSyntheticSeason(6, 20, "2026-01-01T12:00:00Z", 2022);
  const currentSeason = buildSyntheticSeason(6, 25, "2026-08-01T12:00:00Z", 2023);
  const result = runWalkForwardM2({
    currentSeasonFixturesBySeasons: new Map([[2023, currentSeason]]),
    previousSeasonFixturesBySeasons: new Map([[2023, prevSeason]]),
    oosSeasons: [2023], leagueId: LEAGUE_ID,
  });

  const lateInvariantCases = result.predictions.filter((p) => p.n_home >= 16 && p.n_away >= 16);
  assert.ok(lateInvariantCases.length > 0, "le jeu synthetique doit produire au moins un cas n_home>=16 et n_away>=16 pour que ce test soit significatif");

  for (const p of lateInvariantCases) {
    assert.equal(p.prior_weight_home, 0, `prior_weight_home devrait etre 0 a n_home=${p.n_home}`);
    assert.equal(p.prior_weight_away, 0, `prior_weight_away devrait etre 0 a n_away=${p.n_away}`);
    assert.ok(Math.abs(p.lambdaH_m2 - p.lambdaH_m0) <= 1e-12, `lambdaH_m2=${p.lambdaH_m2} vs lambdaH_m0=${p.lambdaH_m0} (fixture ${p.fixture_id})`);
    assert.ok(Math.abs(p.lambdaA_m2 - p.lambdaA_m0) <= 1e-12, `lambdaA_m2=${p.lambdaA_m2} vs lambdaA_m0=${p.lambdaA_m0} (fixture ${p.fixture_id})`);
    // Verifie l'invariant au niveau des PROBABILITES de marche, pas seulement des lambdas.
    assert.ok(Math.abs(p.markets_m2.p1 - p.markets_m0.p1) <= 1e-12, `P_M2(p1)=${p.markets_m2.p1} vs P_M0(p1)=${p.markets_m0.p1}`);
    assert.ok(Math.abs(p.markets_m2.pN - p.markets_m0.pN) <= 1e-12);
    assert.ok(Math.abs(p.markets_m2.p2 - p.markets_m0.p2) <= 1e-12);
  }
});

test("un match tres precoce (n_home et n_away petits) produit un ecart REEL entre M2 et M0 (le shrinkage a un effet mesurable)", () => {
  const prevSeason = buildSyntheticSeason(6, 20, "2026-01-01T12:00:00Z", 2022);
  const currentSeason = buildSyntheticSeason(6, 25, "2026-08-01T12:00:00Z", 2023);
  const result = runWalkForwardM2({
    currentSeasonFixturesBySeasons: new Map([[2023, currentSeason]]),
    previousSeasonFixturesBySeasons: new Map([[2023, prevSeason]]),
    oosSeasons: [2023], leagueId: LEAGUE_ID,
  });
  const veryEarly = result.predictions.filter((p) => p.n_home === 0 || p.n_away === 0);
  assert.ok(veryEarly.length > 0, "le jeu synthetique doit produire des matchs a n=0 (tout premier match de chaque equipe)");
  const anyDiffer = veryEarly.some((p) => Math.abs(p.lambdaH_m2 - p.lambdaH_m0) > 1e-6 || Math.abs(p.lambdaA_m2 - p.lambdaA_m0) > 1e-6);
  assert.ok(anyDiffer, "au moins un match tres precoce doit montrer un ecart mesurable entre M0 et M2 (sinon le shrinkage n'a aucun effet)");
});

test("equipe promue (aucun historique saison precedente) utilise le repli moyenne de ligue, jamais une exception ni une valeur fabriquee", () => {
  const prevSeason = buildSyntheticSeason(6, 10, "2026-01-01T12:00:00Z", 2022); // equipes HOME_ID..HOME_ID+5
  // saison courante : ajoute une 7e equipe (PROMOTED_ID) absente de prevSeason
  const currentSeason = buildSyntheticSeason(6, 15, "2026-08-01T12:00:00Z", 2023);
  const PROMOTED_ID = 9999;
  currentSeason.push({
    fixture_id: 500001, league_id: LEAGUE_ID, season: 2023,
    kickoff_timestamp: "2026-08-02T12:00:00.000Z",
    home_team_id: PROMOTED_ID, away_team_id: HOME_ID, home_team_name: "Promoted FC", away_team_name: "TeamHOME",
    status: "FINISHED", goals_home_90: 1, goals_away_90: 1,
  });
  currentSeason.sort((a, b) => new Date(a.kickoff_timestamp) - new Date(b.kickoff_timestamp));

  const result = runWalkForwardM2({
    currentSeasonFixturesBySeasons: new Map([[2023, currentSeason]]),
    previousSeasonFixturesBySeasons: new Map([[2023, prevSeason]]),
    oosSeasons: [2023], leagueId: LEAGUE_ID,
  });
  const promotedMatch = result.predictions.find((p) => p.home_team_id === PROMOTED_ID);
  assert.ok(promotedMatch, "le match de l'equipe promue doit produire une prediction");
  assert.equal(promotedMatch.home_returning, false);
  assert.ok(Number.isFinite(promotedMatch.lambdaH_m2), "lambdaH_m2 doit etre un nombre fini, jamais NaN/Infinity/exception");
  assert.ok(Number.isFinite(promotedMatch.lambdaA_m2));
});
