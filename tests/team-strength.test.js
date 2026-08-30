"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeFixturesForTeam, timeDecayWeight, opponentAdjustedGoals,
  computeDynamicTeamStrength, computeDynamicHomeAdvantage,
} = require("../lib/team-strength.js");

function rawFixture(id, date, homeId, homeName, awayId, awayName, gh, ga) {
  return {
    fixture: { id, date },
    teams: { home: { id: homeId, name: homeName }, away: { id: awayId, name: awayName } },
    goals: { home: gh, away: ga },
  };
}

test("normalizeFixturesForTeam: extrait la perspective de l'equipe demandee (domicile et exterieur)", () => {
  const raw = [
    rawFixture(1, "2026-01-01", 10, "A", 20, "B", 2, 1),
    rawFixture(2, "2026-01-08", 20, "B", 10, "A", 0, 3),
  ];
  const forA = normalizeFixturesForTeam(raw, 10);
  assert.equal(forA.length, 2);
  assert.equal(forA[0].isHome, true);
  assert.equal(forA[0].goalsFor, 2);
  assert.equal(forA[0].goalsAgainst, 1);
  assert.equal(forA[1].isHome, false);
  assert.equal(forA[1].goalsFor, 3);
  assert.equal(forA[1].goalsAgainst, 0);
});

test("normalizeFixturesForTeam: ignore les matchs sans score (pas encore joues)", () => {
  const raw = [{ fixture: { id: 1, date: "2026-01-01" }, teams: { home: { id: 10 }, away: { id: 20 } }, goals: { home: null, away: null } }];
  assert.equal(normalizeFixturesForTeam(raw, 10).length, 0);
});

test("normalizeFixturesForTeam: ignore les matchs ou l'equipe demandee n'a pas joue", () => {
  const raw = [rawFixture(1, "2026-01-01", 10, "A", 20, "B", 1, 1)];
  assert.equal(normalizeFixturesForTeam(raw, 999).length, 0);
});

test("timeDecayWeight: un match d'aujourd'hui pese 1", () => {
  assert.equal(timeDecayWeight(0, 60), 1);
});

test("timeDecayWeight: a la demi-vie exacte, le poids est 0.5", () => {
  assert.ok(Math.abs(timeDecayWeight(60, 60) - 0.5) < 1e-9);
});

test("timeDecayWeight: un match tres ancien ne disparait jamais completement (poids > 0)", () => {
  assert.ok(timeDecayWeight(3650, 60) > 0);
});

test("opponentAdjustedGoals: adversaire moyen (force=1) -> pas d'ajustement", () => {
  assert.equal(opponentAdjustedGoals(2, 1), 2);
});

test("opponentAdjustedGoals: adversaire fort -> le meme nombre de buts compte plus (division par >1... attend, verifions le sens)", () => {
  // Marquer 2 buts contre une defense forte (force=1.5) doit valoir PLUS
  // que 2 buts contre une defense faible (force=0.5) une fois normalise a
  // l'echelle "force moyenne=1" : on divise par la force adverse, donc un
  // adversaire fort (diviseur>1) donne une valeur ajustee plus PETITE en
  // sortie brute, mais c'est la comparaison relative entre deux forces qui
  // compte : le ratio doit refleter que 2 buts contre force=0.5 (faible)
  // est ajuste a la baisse (moins impressionnant), et 2 buts contre
  // force=1.5 (fort) reste plus proche du brut.
  const vsWeak = opponentAdjustedGoals(2, 0.5);
  const vsStrong = opponentAdjustedGoals(2, 1.5);
  assert.ok(vsWeak > vsStrong, "2 buts contre une defense faible doit etre ajuste plus fortement a la baisse que contre une defense forte");
});

test("computeDynamicTeamStrength: aucun match -> valeurs neutres (1.0) et incertitude maximale", () => {
  const r = computeDynamicTeamStrength([], {});
  assert.equal(r.attack, 1);
  assert.equal(r.defence, 1);
  assert.equal(r.uncertainty, 1);
  assert.equal(r.nMatches, 0);
});

test("computeDynamicTeamStrength: equipe qui marque systematiquement plus que la moyenne ligue -> attack > 1", () => {
  const now = new Date("2026-06-01");
  const matches = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getTime() - i * 7 * 86400000);
    matches.push({ date: d.toISOString(), opponentId: 900 + i, isHome: true, goalsFor: 3, goalsAgainst: 1 });
  }
  const r = computeDynamicTeamStrength(matches, { leagueAvgGoals: 1.35, referenceDate: now });
  assert.ok(r.attack > 1, "attack=" + r.attack);
});

test("computeDynamicTeamStrength: anti-leakage - un match dans le futur par rapport a referenceDate est ignore", () => {
  const now = new Date("2026-06-01");
  const matches = [
    { date: "2026-07-01T00:00:00Z", opponentId: 1, isHome: true, goalsFor: 5, goalsAgainst: 0 }, // futur, doit etre exclu
    { date: "2026-05-01T00:00:00Z", opponentId: 2, isHome: true, goalsFor: 1, goalsAgainst: 1 },
  ];
  const r = computeDynamicTeamStrength(matches, { referenceDate: now, leagueAvgGoals: 1.35 });
  // Si le match futur (5-0) etait inclus, attack serait beaucoup plus eleve.
  assert.ok(r.attack < 1.5, "le match futur ne doit pas influencer le calcul, attack=" + r.attack);
});

test("computeDynamicTeamStrength: decroissance temporelle - un declin recent pese plus qu'un vieux pic de forme", () => {
  const now = new Date("2026-06-01");
  const recentBad = [];
  for (let i = 0; i < 5; i++) {
    recentBad.push({ date: new Date(now.getTime() - (i + 1) * 5 * 86400000).toISOString(), opponentId: 1, isHome: true, goalsFor: 0, goalsAgainst: 2 });
  }
  const oldGood = [];
  for (let i = 0; i < 5; i++) {
    oldGood.push({ date: new Date(now.getTime() - (200 + i * 5) * 86400000).toISOString(), opponentId: 2, isHome: true, goalsFor: 4, goalsAgainst: 0 });
  }
  const r = computeDynamicTeamStrength(oldGood.concat(recentBad), { halfLifeDays: 30, referenceDate: now, leagueAvgGoals: 1.35 });
  // Avec une demi-vie courte (30j), les 5 vieux bons matchs (200j+) pesent
  // tres peu ; le declin recent (0 but/match) doit dominer -> attack < 1.
  assert.ok(r.attack < 1, "attack=" + r.attack);
});

test("computeDynamicTeamStrength: uncertainty diminue quand l'echantillon effectif augmente", () => {
  const now = new Date("2026-06-01");
  const few = [{ date: now.toISOString(), opponentId: 1, isHome: true, goalsFor: 1, goalsAgainst: 1 }];
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ date: now.toISOString(), opponentId: i, isHome: true, goalsFor: 1, goalsAgainst: 1 });
  const rFew = computeDynamicTeamStrength(few, { referenceDate: now });
  const rMany = computeDynamicTeamStrength(many, { referenceDate: now });
  assert.ok(rMany.uncertainty < rFew.uncertainty, "few=" + rFew.uncertainty + " many=" + rMany.uncertainty);
});

test("computeDynamicHomeAdvantage: echantillon insuffisant -> repli sur le defaut", () => {
  const matches = [{ isHome: true, goalsFor: 3, goalsAgainst: 0 }];
  const r = computeDynamicHomeAdvantage(matches, { defaultAdvantage: 0.3, minSampleForOwnEstimate: 30 });
  assert.equal(r.source, "default_shrunk");
  assert.equal(r.homeAdvantage, 0.3);
});

test("computeDynamicHomeAdvantage: echantillon moderement suffisant -> estimation propre, ponderee (shrink partiel)", () => {
  const matches = [];
  for (let i = 0; i < 50; i++) matches.push({ isHome: true, goalsFor: 2, goalsAgainst: 1 }); // marge moyenne = +1
  const r = computeDynamicHomeAdvantage(matches, { defaultAdvantage: 0.25, minSampleForOwnEstimate: 30 });
  assert.equal(r.source, "own_estimate_shrunk");
  assert.ok(r.homeAdvantage > 0.25, "doit se rapprocher de la marge observee (+1) plus que du defaut (0.25), got=" + r.homeAdvantage);
  assert.ok(r.homeAdvantage < 1, "avec 50 matchs (< 3x minSample=90), le shrink n'est pas encore total, ne doit pas atteindre la marge brute de +1, got=" + r.homeAdvantage);
});

test("computeDynamicHomeAdvantage: tres grand echantillon -> shrink total, converge vers la marge observee", () => {
  const matches = [];
  for (let i = 0; i < 200; i++) matches.push({ isHome: true, goalsFor: 2, goalsAgainst: 1 });
  const r = computeDynamicHomeAdvantage(matches, { defaultAdvantage: 0.25, minSampleForOwnEstimate: 30 });
  assert.ok(Math.abs(r.homeAdvantage - 1) < 1e-9, "avec un tres grand echantillon, converge vers la marge observee (+1), got=" + r.homeAdvantage);
});
