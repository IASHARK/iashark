"use strict";
// Feuille de match de repli pour les selections (lib/fixture-sheet-fallback.js)
// et les 20 derniers matchs toutes competitions (derniersMatchsJoues). Cas
// reel : Slovaquie - Montenegro du 05/06/2026 (amical sans feuille joueurs
// api-football), Osmajic titulaire, buteur a la 44e et a la 66e, sorti a la 85e.
const test = require("node:test");
const assert = require("node:assert/strict");
const FB = require("../lib/fixture-sheet-fallback.js");
const INTL = require("../lib/international-team-stats.js");
const INS = require("../lib/insights.js");

const MNE = 1109, SVK = 773;
function joueur(id, name, pos) { return { player: { id: id, name: name, pos: pos } }; }
const lineups = [
  { team: { id: SVK }, startXI: [joueur(1, "P. Pekarik", "D")], substitutes: [joueur(2, "H. Pavek", "M")] },
  {
    team: { id: MNE },
    startXI: [joueur(66761, "M. Osmajic", "F"), joueur(10, "B. Sekulic", "M"), joueur(11, "M. Dubljanic", "G")],
    substitutes: [joueur(20, "A. Kostic", "F"), joueur(21, "O. Gasevic", "M"), joueur(22, "N. Remplacant", "D")],
  },
];
function ev(team, min, type, detail, player, assist) {
  return { team: { id: team }, time: { elapsed: min }, type: type, detail: detail,
    player: player ? { id: player } : {}, assist: assist ? { id: assist } : {} };
}
const events = [
  ev(SVK, 24, "subst", "Substitution 1", 1, 2),
  ev(MNE, 44, "Goal", "Normal Goal", 66761, 10),
  ev(MNE, 46, "subst", "Substitution 1", 10, 21),
  ev(MNE, 66, "Goal", "Normal Goal", 66761, null),
  ev(MNE, 70, "Goal", "Missed Penalty", 20, null),
  ev(MNE, 85, "subst", "Substitution 2", 66761, 20),
  ev(MNE, 88, "Goal", "Own Goal", 21, null),
];

function stats(block, id) {
  const p = block.players.find((x) => x.player.id === id);
  return p && p.statistics[0];
}

test("titulaire, minutes et buts reconstruits depuis la composition et les evenements", () => {
  const b = FB.feuilleDepuisCompoEtEvenements(lineups, events, MNE);
  assert.equal(b.source, "compo+evenements");
  const osm = stats(b, 66761);
  assert.equal(osm.games.substitute, false);
  assert.equal(osm.games.minutes, 85);
  assert.equal(osm.goals.total, 2);
  assert.equal(osm.games.position, "F");
  const sek = stats(b, 10);
  assert.equal(sek.games.minutes, 46);
  assert.equal(sek.goals.assists, 1);
});

test("remplacant : minutes depuis son entree ; penalty manque et but contre son camp ignores", () => {
  const b = FB.feuilleDepuisCompoEtEvenements(lineups, events, MNE);
  const kostic = stats(b, 20);
  assert.equal(kostic.games.substitute, true);
  assert.equal(kostic.games.minutes, 5);
  assert.equal(kostic.goals.total, 0);
  assert.equal(stats(b, 21).goals.total, 0);
});

test("remplacant non entre : aucune minute, aucun but invente", () => {
  const b = FB.feuilleDepuisCompoEtEvenements(lineups, events, MNE);
  const r = stats(b, 22);
  assert.equal(r.games.minutes, null);
  assert.equal(r.goals.total, null);
});

test("les tirs restent inconnus (null), jamais 0", () => {
  const b = FB.feuilleDepuisCompoEtEvenements(lineups, events, MNE);
  b.players.forEach((p) => {
    assert.equal(p.statistics[0].shots.on, null);
    assert.equal(p.statistics[0].shots.total, null);
  });
});

test("sans composition de l'equipe : pas de feuille", () => {
  assert.equal(FB.feuilleDepuisCompoEtEvenements([], events, MNE), null);
  assert.equal(FB.feuilleDepuisCompoEtEvenements(null, null, MNE), null);
  assert.equal(FB.feuilleDepuisCompoEtEvenements(lineups, events, 4242), null);
});

test("carton rouge : le joueur sort a la minute du carton", () => {
  const b = FB.feuilleDepuisCompoEtEvenements(lineups, [ev(MNE, 30, "Card", "Red Card", 10, null)], MNE);
  assert.equal(stats(b, 10).games.minutes, 30);
  assert.equal(stats(b, 10).cards.red, 1);
});

test("20 derniers matchs joues, toutes competitions, du plus recent au plus ancien", () => {
  const fx = [];
  for (let i = 0; i < 25; i++) {
    fx.push({
      fixture: { id: i, timestamp: 1_700_000_000 + i * 86400, status: { short: i === 24 ? "NS" : "FT" } },
      league: { name: i % 2 ? "Friendlies" : "UEFA Nations League" },
      teams: { home: { id: MNE }, away: { id: 99 } },
      goals: { home: i === 24 ? null : 1, away: i === 24 ? null : 0 },
    });
  }
  const r = INTL.derniersMatchsJoues(fx, MNE);
  assert.equal(r.length, 20);
  assert.equal(r[0].fixture.id, 23);
  assert.ok(r.some((f) => f.league.name === "Friendlies"));
  assert.deepEqual(INTL.derniersMatchsJoues(null, MNE), []);
});

test("un buteur d'amicaux devient visible pour le calcul du buteur", () => {
  const b = FB.feuilleDepuisCompoEtEvenements(lineups, events, MNE);
  const rows = b.players.map((e) => {
    const s = e.statistics[0];
    return { fixture_id: 1542178, player_id: e.player.id, team_id: MNE, name: e.player.name, position: s.games.position,
      minutes: s.games.minutes, starter: !s.games.substitute, shots_on: s.shots.on, goals: s.goals.total,
      date: "2026-06-05", is_current_season: false, team_goals: 2 };
  });
  const r = INS.scorerModel.rankMatch({ home: { rows: rows, teamId: MNE, lambda: 1.34 } });
  assert.equal(r.pick && r.pick.name, "M. Osmajic");
  assert.equal(r.pick.goals, 2);
});
