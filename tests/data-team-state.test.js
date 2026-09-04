"use strict";
// GATE B5+B6 (SPEC LAB PRO v1.0) - la piece la plus critique du data lab :
// buildTeamState doit (1) respecter l'anti-leakage strict, (2) produire
// des agregats numeriquement corrects, (3) etre directement consommable
// par calcCriteres/calcLambdas SANS AUCUNE ADAPTATION AU-DELA des
// fonctions toCalcCriteresStats/toCalcLambdasArgs fournies ici -
// verifie en appelant les VRAIES fonctions de production (lib/engine.js),
// pas une reimplementation parallele.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTeamState, toCalcCriteresStats, toCalcLambdasArgs } = require("../lib/data/team-state.js");
const { calcCriteres, calcLambdas } = require("../lib/engine.js");

function fx(id, kickoff, homeId, awayId, gh, ga, status) {
  return {
    fixture_id: id, kickoff_timestamp: kickoff, home_team_id: homeId, away_team_id: awayId,
    goals_home_90: gh, goals_away_90: ga, status: status || "FINISHED",
  };
}

test("buildTeamState: anti-leakage strict - un match AU cutoff exact (pas seulement apres) est EXCLU (< strict, jamais <=)", () => {
  const fixtures = [fx(1, "2026-01-15T15:00:00Z", 10, 20, 2, 1)];
  const state = buildTeamState(fixtures, 10, "2026-01-15T15:00:00Z"); // cutoff == kickoff exact
  assert.equal(state.playedTotal, 0, "un match au meme timestamp que le cutoff ne doit JAMAIS etre inclus (regle explicite B5)");
});

test("buildTeamState: anti-leakage - un match APRES le cutoff est exclu, un match AVANT est inclus", () => {
  const fixtures = [
    fx(1, "2026-01-10T15:00:00Z", 10, 20, 2, 1), // avant le cutoff -> inclus
    fx(2, "2026-01-20T15:00:00Z", 10, 20, 0, 3), // apres le cutoff -> exclu
  ];
  const state = buildTeamState(fixtures, 10, "2026-01-15T00:00:00Z");
  assert.equal(state.playedTotal, 1);
  assert.equal(state.goalsForTotal, 2, "seul le match avant le cutoff doit contribuer");
});

test("buildTeamState: split domicile/exterieur correct", () => {
  const fixtures = [
    fx(1, "2026-01-01T00:00:00Z", 10, 20, 3, 1), // equipe 10 a domicile, gagne
    fx(2, "2026-01-05T00:00:00Z", 30, 10, 1, 2), // equipe 10 a l'exterieur, gagne (2 buts marques)
    fx(3, "2026-01-08T00:00:00Z", 10, 40, 0, 0), // equipe 10 a domicile, nul
  ];
  const state = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  assert.equal(state.playedHome, 2);
  assert.equal(state.playedAway, 1);
  assert.equal(state.winsHome, 1);
  assert.equal(state.winsAway, 1);
  assert.equal(state.goalsForHome, 3 + 0);
  assert.equal(state.goalsForAway, 2);
  assert.equal(state.goalsAgainstHome, 1 + 0);
  assert.equal(state.goalsAgainstAway, 1);
  assert.equal(state.playedTotal, 3);
  assert.equal(state.goalsForTotal, 5);
  assert.equal(state.goalsAgainstTotal, 2);
});

test("buildTeamState: forme recente respecte la convention API-Football (plus recent en dernier caractere)", () => {
  const fixtures = [
    fx(1, "2026-01-01T00:00:00Z", 10, 20, 1, 0), // W (le plus ancien)
    fx(2, "2026-01-02T00:00:00Z", 10, 20, 0, 0), // D
    fx(3, "2026-01-03T00:00:00Z", 10, 20, 0, 1), // L (le plus recent)
  ];
  const state = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  assert.equal(state.form, "WDL", "le caractere le plus a droite doit etre le match le plus recent (L)");
});

test("buildTeamState: seuls les matchs FINISHED avec score complet sont comptes (jamais un match PENDING ou incomplet)", () => {
  const fixtures = [
    fx(1, "2026-01-01T00:00:00Z", 10, 20, 1, 0, "FINISHED"),
    fx(2, "2026-01-02T00:00:00Z", 10, 20, null, null, "PENDING"),
    fx(3, "2026-01-03T00:00:00Z", 10, 20, null, 1, "FINISHED"), // score partiellement absent
  ];
  const state = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  assert.equal(state.playedTotal, 1, "seul le match #1 (FINISHED + score complet) doit compter");
});

test("buildTeamState + toCalcCriteresStats -> calcCriteres (VRAIE fonction de production) ne plante pas et produit un resultat coherent", () => {
  const fixtures = [];
  for (let i = 0; i < 10; i++) {
    fixtures.push(fx(i, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, 10, 20 + i, i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 1));
  }
  const state = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  const stats = toCalcCriteresStats(state);
  const result = calcCriteres(stats, true, 5);
  assert.ok(result !== null, "calcCriteres ne doit pas rejeter un etat reconstruit valide (>=3 matchs)");
  assert.ok(Number.isFinite(result.att) && Number.isFinite(result.def) && Number.isFinite(result.fr));
  assert.equal(result.sample_size, 10);
});

test("buildTeamState + toCalcCriteresStats: moins de 3 matchs -> calcCriteres renvoie null (comportement de production preserve)", () => {
  const fixtures = [fx(1, "2026-01-01T00:00:00Z", 10, 20, 1, 0), fx(2, "2026-01-02T00:00:00Z", 10, 20, 1, 0)];
  const state = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  const stats = toCalcCriteresStats(state);
  const result = calcCriteres(stats, true, 5);
  assert.equal(result, null, "calcCriteres doit rejeter un echantillon < 3 matchs, meme reconstruit localement");
});

test("buildTeamState + toCalcLambdasArgs -> calcLambdas (VRAIE fonction de production) produit des lambdas dans les bornes attendues", () => {
  const homeFixtures = [];
  const awayFixtures = [];
  for (let i = 0; i < 15; i++) {
    homeFixtures.push(fx(100 + i, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, 10, 900 + i, 2, 1));
    awayFixtures.push(fx(200 + i, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, 800 + i, 20, 1, 1));
  }
  const homeState = buildTeamState(homeFixtures, 10, "2026-02-01T00:00:00Z");
  const awayState = buildTeamState(awayFixtures, 20, "2026-02-01T00:00:00Z");
  const args = toCalcLambdasArgs(homeState, awayState, 1.35, 1.10, 39);
  const result = calcLambdas(...args);
  assert.ok(result.lambdaH >= 1.05 && result.lambdaH <= 3.4, `lambdaH=${result.lambdaH} hors bornes ligue isTop`);
  assert.ok(result.lambdaA >= 0.90 && result.lambdaA <= 3.0, `lambdaA=${result.lambdaA} hors bornes ligue isTop`);
});

test("buildTeamState: deterministe (deux appels identiques -> meme resultat)", () => {
  const fixtures = [fx(1, "2026-01-01T00:00:00Z", 10, 20, 2, 1)];
  const s1 = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  const s2 = buildTeamState(fixtures, 10, "2026-02-01T00:00:00Z");
  assert.deepEqual(s1, s2);
});
