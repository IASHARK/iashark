"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pickTopScorerCandidates } = require("../lib/markets/top-scorer-picker.js");

function fixture({ playerId, teamId, name, position = "F", minutes = 90, shotsTotal = 0, shotsOn = 0, goals = 0 }) {
  return { player_id: playerId, team_id: teamId, name, photo: null, position, minutes, shots_total: shotsTotal, shots_on: shotsOn, goals };
}
function repeat(n, factory) {
  return Array.from({ length: n }, () => factory());
}

test("pickTopScorerCandidates : le volume de tirs cadres/conversion sous-jacente l'emporte sur des buts recents peu etayes (scenario decrit par l'utilisateur)", () => {
  const home = [
    ...repeat(5, () => fixture({ playerId: 1, teamId: 100, name: "Buteur Chanceux", minutes: 80, shotsTotal: 2, shotsOn: 1, goals: 0 })),
    ...repeat(5, () => fixture({ playerId: 2, teamId: 100, name: "Sous-jacent Solide", minutes: 85, shotsTotal: 5, shotsOn: 3, goals: 0 })),
  ];
  // Le "buteur chanceux" marque sur 3 des 5 lignes (mais peu de tirs) - on ecrase les 3 premieres lignes avec un but chacune.
  home[0].goals = 1; home[1].goals = 1; home[2].goals = 1;
  const result = pickTopScorerCandidates(home, [], 100, 200, { att: 50, def: 50 }, { att: 50, def: 50 });
  assert.equal(result[0].name, "Sous-jacent Solide", "le volume/qualite de tirs doit l'emporter sur 3 buts avec tres peu de tirs");
  assert.equal(result[1].name, "Buteur Chanceux");
  assert.ok(result[0].goalThreatScore > result[1].goalThreatScore);
});

test("pickTopScorerCandidates : exclut les gardiens", () => {
  const home = repeat(5, () => fixture({ playerId: 9, teamId: 100, name: "Gardien", position: "G", shotsTotal: 0, shotsOn: 0 }));
  const result = pickTopScorerCandidates(home, [], 100, 200, null, null);
  assert.deepEqual(result, []);
});

test("pickTopScorerCandidates : exclut un joueur avec un echantillon trop petit (< 3 apparitions), jamais publie sur un signal trop bruite", () => {
  const home = repeat(2, () => fixture({ playerId: 3, teamId: 100, name: "Deux Matchs Seulement", shotsTotal: 5, shotsOn: 4, goals: 2 }));
  const result = pickTopScorerCandidates(home, [], 100, 200, null, null);
  assert.deepEqual(result, []);
});

test("pickTopScorerCandidates : aucune donnee -> tableau vide, jamais une exception ni un joueur invente", () => {
  assert.deepEqual(pickTopScorerCandidates([], [], 100, 200, null, null), []);
  assert.deepEqual(pickTopScorerCandidates(null, undefined, 100, 200, null, null), []);
});

test("pickTopScorerCandidates : un adversaire a la defense plus faible augmente le score (multiplicateur reel, pas invente)", () => {
  const home = repeat(5, () => fixture({ playerId: 5, teamId: 100, name: "Attaquant", shotsTotal: 4, shotsOn: 2, goals: 1 }));
  const weakDefense = pickTopScorerCandidates(home, [], 100, 200, { att: 50, def: 50 }, { att: 50, def: 20 })[0];
  const strongDefense = pickTopScorerCandidates(home, [], 100, 200, { att: 50, def: 50 }, { att: 50, def: 80 })[0];
  assert.ok(weakDefense.opponentDefenseMultiplier > 1, "defense adverse faible -> multiplicateur > 1");
  assert.ok(strongDefense.opponentDefenseMultiplier < 1, "defense adverse forte -> multiplicateur < 1");
  assert.ok(weakDefense.goalThreatScore > strongDefense.goalThreatScore);
});

test("pickTopScorerCandidates : le taux de conversion est lisse vers la moyenne reelle du groupe compare, pas le taux brut individuel", () => {
  // 1 but sur 2 tirs cadres (50% brut) sur un tout petit echantillon de tirs -
  // ne doit PAS ressortir a 50%, doit etre ramene vers la moyenne du pool.
  const home = [
    ...repeat(3, () => fixture({ playerId: 6, teamId: 100, name: "Petit Echantillon", shotsTotal: 2, shotsOn: 2, goals: 0 })),
  ];
  home[0].goals = 1; // 1 but sur 2 tirs cadres au total
  const result = pickTopScorerCandidates(home, [], 100, 200, null, null);
  assert.ok(result[0].smoothedConversion < 0.5, "le taux lisse doit rester loin du taux brut (50%) sur un si petit echantillon");
});

test("pickTopScorerCandidates : limit personnalise renvoie moins/plus de candidats", () => {
  const home = [
    ...repeat(3, () => fixture({ playerId: 7, teamId: 100, name: "Joueur A", shotsTotal: 3, shotsOn: 2, goals: 1 })),
    ...repeat(3, () => fixture({ playerId: 8, teamId: 100, name: "Joueur B", shotsTotal: 4, shotsOn: 3, goals: 1 })),
    ...repeat(3, () => fixture({ playerId: 10, teamId: 100, name: "Joueur C", shotsTotal: 1, shotsOn: 1, goals: 0 })),
  ];
  assert.equal(pickTopScorerCandidates(home, [], 100, 200, null, null, 1).length, 1);
  assert.equal(pickTopScorerCandidates(home, [], 100, 200, null, null, 3).length, 3);
});
