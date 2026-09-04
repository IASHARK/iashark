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

// Les composantes exposees doivent RECOMPOSER exactement le score affiche.
// Sans cette garantie, le detail montre sur la fiche joueur serait une
// jolie decomposition qui ne correspond pas au chiffre a cote.
test("les composantes du score le recomposent exactement", () => {
  const home = [
    ...repeat(4, () => fixture({ playerId: 1, teamId: 100, name: "Attaquant", minutes: 88, shotsTotal: 5, shotsOn: 3, goals: 0 })),
    ...repeat(4, () => fixture({ playerId: 3, teamId: 100, name: "Ailier", minutes: 75, shotsTotal: 3, shotsOn: 1, goals: 0 }))
  ];
  home[0].goals = 1; home[1].goals = 1;
  const away = repeat(4, () => fixture({ playerId: 2, teamId: 200, name: "Avant-centre", minutes: 90, shotsTotal: 4, shotsOn: 2, goals: 0 }));
  away[0].goals = 1;
  const picks = pickTopScorerCandidates(home, away, 100, 200, { att: 50, def: 40 }, { att: 50, def: 55 }, 2);
  assert.ok(picks.length, "aucun candidat");
  for (const p of picks) {
    const c = p.scoreComponents;
    assert.ok(c, "composantes absentes");
    assert.equal(c.weights.shotsOn + c.weights.shotsTotal + c.weights.conversion, 1,
      "les poids doivent totaliser 1");
    const base = c.weights.shotsOn * c.shotsOnNorm
      + c.weights.shotsTotal * c.shotsTotalNorm
      + c.weights.conversion * c.conversionNorm;
    const recompose = Math.round(100 * base * p.reliability * p.opponentDefenseMultiplier);
    // Les composantes sont arrondies au millieme pour l'export : on tolere
    // le point d'ecart que cet arrondi peut produire, pas davantage.
    assert.ok(Math.abs(recompose - p.goalThreatScore) <= 1,
      `le detail donne ${recompose} alors que le score affiche est ${p.goalThreatScore}`);
    for (const v of [c.shotsOnNorm, c.shotsTotalNorm, c.conversionNorm]) {
      assert.ok(v >= 0 && v <= 1, "une composante normalisee sort de [0,1] : " + v);
    }
    assert.ok(p.minutes > 0, "minutes absentes, l'echantillon ne peut pas etre affiche");
    assert.ok(Number.isFinite(p.baselineConversion), "conversion de reference absente");
  }
});


// Signale par l'utilisateur le 04/09/2026 : "il propose Sinayoko par exemple
// mais il n'est plus a Auxerre, il est au PFC". Un joueur transfere garde son
// historique sous son ancien club et ressortait comme buteur a surveiller
// pour une equipe qu'il avait quittee - 16 des 86 candidats publies.
test("un joueur qui n'est plus dans l'effectif n'est plus propose", () => {
  const rows = [
    ...repeat(6, () => fixture({ playerId: 1, teamId: 100, name: "Parti au mercato", minutes: 90, shotsTotal: 6, shotsOn: 4, goals: 2 })),
    ...repeat(6, () => fixture({ playerId: 2, teamId: 100, name: "Toujours la", minutes: 90, shotsTotal: 4, shotsOn: 2, goals: 1 }))
  ];
  const effectif = Array.from({ length: 14 }, (_, i) => ({ player_id: i + 2 })); // 2..15, sans le 1
  const avec = pickTopScorerCandidates(rows, [], 100, 200, { att: 50, def: 50 }, { att: 50, def: 50 }, 2, { home: effectif, away: [] });
  assert.ok(!avec.some((p) => p.player_id === 1), "le joueur transfere est encore propose");
  assert.ok(avec.some((p) => p.player_id === 2), "le joueur toujours au club a disparu");

  // Sans effectif fourni, comportement inchange : on n'exclut personne.
  const sans = pickTopScorerCandidates(rows, [], 100, 200, { att: 50, def: 50 }, { att: 50, def: 50 }, 2);
  assert.ok(sans.some((p) => p.player_id === 1));
});

// Un effectif tronque par une requete a moitie echouee ne doit pas vider la
// selection : on prefere ne rien filtrer plutot que filtrer sur du faux.
test("un effectif manifestement incomplet n'exclut personne", () => {
  const rows = repeat(6, () => fixture({ playerId: 1, teamId: 100, name: "Attaquant", minutes: 90, shotsTotal: 6, shotsOn: 4, goals: 2 }));
  const tronque = [{ player_id: 999 }, { player_id: 998 }]; // 2 joueurs : impossible
  const r = pickTopScorerCandidates(rows, [], 100, 200, { att: 50, def: 50 }, { att: 50, def: 50 }, 2, { home: tronque, away: [] });
  assert.ok(r.some((p) => p.player_id === 1),
    "un effectif de 2 joueurs a suffi a exclure un titulaire");
});
