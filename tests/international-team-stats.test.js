"use strict";
// Statistiques d'une selection nationale calculees sur ses derniers matchs
// reels, toutes competitions confondues (lib/international-team-stats.js).
// Ces tests verrouillent ce qui compte : on ne compte que des matchs joues, le
// domicile et l'exterieur ne sont pas melanges, la forme est dans le bon ordre,
// et un echantillon trop petit ne produit RIEN plutot qu'une moyenne creuse.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../lib/international-team-stats.js");

const TEAM = 27; // Portugal
let ts = 1_700_000_000;
function fx(opts) {
  const o = opts || {};
  ts += 86400;
  return {
    fixture: { id: o.id || ts, timestamp: o.ts || ts, status: { short: o.status || "FT" } },
    league: { name: o.league || "Friendlies" },
    teams: { home: { id: o.home != null ? o.home : TEAM }, away: { id: o.away != null ? o.away : 99 } },
    goals: { home: "gh" in o ? o.gh : 1, away: "ga" in o ? o.ga : 0 },
  };
}

test("echantillon trop petit : aucune statistique inventee", () => {
  const quatre = [fx({}), fx({}), fx({}), fx({})];
  assert.equal(S.statsFromRecentFixtures(quatre, TEAM), null);
  assert.equal(S.statsFromRecentFixtures(null, TEAM), null);
  assert.equal(S.statsFromRecentFixtures([], TEAM), null);
});

test("matchs non joues, sans score ou d'une autre equipe : ignores", () => {
  const list = [
    fx({ status: "NS" }), fx({ status: "PST" }), fx({ gh: null }),
    fx({ home: 1, away: 2 }), // deux autres selections
  ].concat([fx({}), fx({}), fx({}), fx({}), fx({})]);
  const s = S.statsFromRecentFixtures(list, TEAM);
  assert.equal(s.matches_used, 5, "seuls les 5 matchs joues de l'equipe comptent");
  assert.equal(s.fixtures.played.total, 5);
});

test("domicile et exterieur comptes separement, buts pour et contre du bon cote", () => {
  const list = [
    fx({ home: TEAM, away: 99, gh: 3, ga: 1 }), // domicile, gagne
    fx({ home: TEAM, away: 99, gh: 0, ga: 0 }), // domicile, nul
    fx({ home: 99, away: TEAM, gh: 2, ga: 1 }), // exterieur, perdu
    fx({ home: 99, away: TEAM, gh: 0, ga: 4 }), // exterieur, gagne
    fx({ home: 99, away: TEAM, gh: 1, ga: 1 }), // exterieur, nul
  ];
  const s = S.statsFromRecentFixtures(list, TEAM);
  assert.deepEqual(s.fixtures.played, { home: 2, away: 3, total: 5 });
  assert.deepEqual(s.fixtures.wins, { home: 1, away: 1, total: 2 });
  assert.deepEqual(s.fixtures.draws, { home: 1, away: 1, total: 2 });
  assert.deepEqual(s.fixtures.loses, { home: 0, away: 1, total: 1 });
  assert.deepEqual(s.goals.for.total, { home: 3, away: 6, total: 9 });
  assert.deepEqual(s.goals.against.total, { home: 1, away: 3, total: 4 });
  assert.equal(s.goals.for.average.total, "1.8");
});

test("forme : du plus ancien au plus recent, comme api-football", () => {
  // Cree dans l'ordre chronologique : W puis L puis D puis W puis W.
  const list = [
    fx({ gh: 2, ga: 0 }), fx({ gh: 0, ga: 1 }), fx({ gh: 1, ga: 1 }),
    fx({ gh: 3, ga: 2 }), fx({ gh: 1, ga: 0 }),
  ];
  const s = S.statsFromRecentFixtures(list, TEAM);
  assert.equal(s.form, "WLDWW");
  // calcCriteres lit les 5 derniers caracteres, le dernier etant le plus recent.
  assert.equal(s.form.slice(-1), "W", "le dernier caractere est le match le plus recent");
});

test("au plus 10 matchs, les plus recents, toutes competitions confondues", () => {
  const list = [];
  for (let i = 0; i < 14; i++) list.push(fx({ league: i % 2 ? "UEFA Nations League" : "Friendlies" }));
  const s = S.statsFromRecentFixtures(list, TEAM);
  assert.equal(s.matches_used, 10);
  assert.equal(s.fixtures.played.total, 10);
  assert.equal(Object.values(s.competitions).reduce((a, b) => a + b, 0), 10);
  assert.ok(Object.keys(s.competitions).length >= 2, "plusieurs competitions melangees");
  assert.match(S.resumeSource(s), /10 matchs \(/);
});

test("format identique a /teams/statistics : calcCriteres sait le lire", () => {
  const { calcCriteres } = require("../lib/engine.js");
  const list = [];
  for (let i = 0; i < 10; i++) list.push(fx({ gh: 2, ga: 1 }));
  const s = S.statsFromRecentFixtures(list, TEAM);
  const crit = calcCriteres(s, true, null);
  assert.ok(crit, "criteres calcules");
  assert.equal(crit.sample_size, 10);
  for (const k of ["att", "def", "fr", "fd", "mot"]) {
    assert.ok(crit[k] >= 0 && crit[k] <= 100, k + " hors bornes");
  }
});
