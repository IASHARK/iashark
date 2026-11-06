"use strict";
// Nul du jour et grille Loto Foot (lib/run-output/extras-du-jour.js, 06/11/2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const X = require("../lib/run-output/extras-du-jour.js");

const JOUR = "2026-11-06";
const NOW = Date.parse("2026-11-06T08:00:00Z");
function fx(id, iso) { return { fixture: { id: id, date: iso, status: { short: "NS" } } }; }
function match(id, ligue, p, c, heure) {
  return { id: id, league_key: ligue, league: ligue, home: { n: "Dom" + id }, away: { n: "Ext" + id }, date: JOUR + " " + (heure || "21:00"),
    p1: p[0], pn: p[1], p2: p[2], c1: c && c[0], cn: c && c[1], c2: c && c[2] };
}
function opts(ms, extra) {
  const byId = {};
  ms.forEach((m) => { byId[String(m.id)] = fx(m.id, "2026-11-06T20:00:00Z"); });
  return Object.assign({ jour: JOUR, nowMs: NOW, fixtureById: byId }, extra || {});
}

test("nul : garde le plus grand ecart positif sous 3 points (avocat du diable, 06/11/2026) entre le moteur et la cote sans marge", () => {
  const ms = [
    match(1, "premier", [40, 30, 30], [2.4, 3.4, 3.0]),
    match(2, "laliga", [38, 33, 29], [2.3, 3.5, 3.2]),
    match(3, "seriea", [45, 25, 30], [2.0, 3.6, 3.9]),
  ];
  // match 2 : ecart ~5 points, exclu (a 3 points ou plus, le nul tombait moins qu'annonce) ; match 1 : ~1,8 point.
  const n = X.nulDuJour(ms, opts(ms));
  assert.equal(n.fixture_id, 1);
  const m2 = X.nulDuJour(ms, Object.assign(opts(ms), { regle: { ecart_max_points: 99 } }));
  assert.equal(m2.fixture_id, 2);
  assert.equal(n.market_id, "draw");
  assert.equal(n.cote, 3.4);
  const inv = [1 / 2.4, 1 / 3.4, 1 / 3.0], q = inv[1] / (inv[0] + inv[1] + inv[2]);
  assert.equal(n.chance_marche, Math.round(q * 100));
  assert.equal(n.ecart_points, Math.round((0.30 - q) * 1000) / 10);
});

test("nul : aucun si le moteur ne depasse jamais la cote, si la cote sort de 2,80-4,00 ou hors des 7 championnats", () => {
  const sous = [match(1, "premier", [50, 20, 30], [2.0, 3.4, 3.8])];
  assert.equal(X.nulDuJour(sous, opts(sous)), null);
  const hors = [match(2, "premier", [30, 40, 30], [3.0, 2.5, 3.0]), match(3, "premier", [20, 40, 40], [3.0, 4.5, 2.0])];
  assert.equal(X.nulDuJour(hors, opts(hors)), null);
  const ligue = [match(4, "mls", [30, 40, 30], [2.9, 3.2, 2.9])];
  assert.equal(X.nulDuJour(ligue, opts(ligue)), null);
});

test("nul : match deja commence ou d'un autre jour ignore", () => {
  const ms = [match(1, "premier", [30, 40, 30], [2.9, 3.2, 2.9])];
  const o = opts(ms); o.fixtureById["1"] = fx(1, "2026-11-06T07:00:00Z");
  assert.equal(X.nulDuJour(ms, o), null);
  const autre = [Object.assign(match(2, "premier", [30, 40, 30], [2.9, 3.2, 2.9]), { date: "2026-11-07 21:00" })];
  assert.equal(X.nulDuJour(autre, opts(autre)), null);
});

test("loto : 7 matchs les plus lisibles, 2 doubles, chances = produits exacts", () => {
  const ms = [];
  const P = [[70, 20, 10], [65, 20, 15], [60, 25, 15], [40, 35, 25], [55, 25, 20], [50, 30, 20], [45, 28, 27], [35, 33, 32]];
  P.forEach((p, i) => ms.push(match(10 + i, "premier", p, null)));
  const g = X.grilleLoto(ms, opts(ms, { ligues: ["premier"] }));
  assert.equal(g.nb_matchs, 7);
  assert.equal(g.nb_doubles, 2);
  assert.ok(!g.matchs.some((m) => m.fixture_id === 17), "le moins lisible est ecarte");
  const doubles = g.matchs.filter((m) => m.double);
  assert.equal(doubles.length, 2);
  // Doubles la ou (1re + 2e) / 1re est le plus grand : 40/35 (match 13) et 45/28 (match 16).
  assert.deepEqual(doubles.map((m) => m.fixture_id).sort(), [13, 16]);
  assert.deepEqual(doubles.find((m) => m.fixture_id === 13).choix, ["1", "N"]);
  let prod = 1, simple = 1, att = 0;
  g.matchs.forEach((m) => {
    const p = { "1": m.p1 / 100, N: m.pn / 100, "2": m.p2 / 100 };
    const couv = m.choix.reduce((s, k) => s + p[k], 0);
    prod *= couv; att += couv; simple *= Math.max(p["1"], p.N, p["2"]);
  });
  assert.equal(g.chance_grille, Math.round(prod * 1000) / 10);
  assert.equal(g.chance_sans_doubles, Math.round(simple * 1000) / 10);
  assert.equal(g.bons_attendus, Math.round(att * 10) / 10);
});

test("loto : pas de grille sous 7 matchs ; probabilite absente = match ignore, jamais devinee", () => {
  const ms = [];
  for (let i = 0; i < 7; i++) ms.push(match(30 + i, "premier", i === 0 ? [null, 30, 30] : [50, 30, 20], null));
  assert.equal(X.grilleLoto(ms, opts(ms, { ligues: ["premier"] })), null);
});

// MATCHS A PENALTY (06/11/2026) : 3 matchs des championnats les plus a penalties, part reelle sur 12 mois, rien du jour meme.
test("penalty du jour : 3 matchs des championnats au-dessus de la moyenne, part reelle, jamais le jour meme", () => {
  const X = require("../lib/run-output/extras-du-jour.js");
  const hist = [];
  const ajouter = (l, n, avec) => { for (let i = 0; i < n; i++) hist.push({ f: hist.length + 1, d: "2026-06-01", l, p: i < avec ? 1 : 0 }); };
  ajouter("liga_mx", 200, 80); ajouter("primeira", 200, 60); ajouter("premier", 200, 30); ajouter("suede", 200, 30);
  hist.push({ f: 99999, d: "2026-11-06", l: "premier", p: 1 }); // le jour meme : ignore
  const st = X.statsPenalties(hist, "2026-11-06");
  assert.equal(st.n, 800); assert.equal(st.ligues.premier.avec, 30);
  const jour = "2026-11-06", ms = [];
  [["liga_mx", 1], ["liga_mx", 2], ["primeira", 3], ["primeira", 4], ["premier", 5], ["ligue1", 6]].forEach(([l, id]) => ms.push({ id, league_key: l, league: l, date: jour + "T20:00:00+01:00", home: "A" + id, away: "B" + id }));
  const fixtureById = {}; ms.forEach((m) => { fixtureById[String(m.id)] = { fixture: { id: m.id, date: m.date, status: { short: "NS" } } }; });
  const r = X.penaltyDuJour(ms, { jour, penalties: hist, nowMs: Date.parse("2026-11-06T08:00:00Z"), fixtureById });
  assert.ok(r);
  assert.deepEqual(r.matchs.map((m) => m.fixture_id), [1, 2, 3]);
  assert.deepEqual(r.matchs.map((m) => m.chance_championnat), [40, 40, 30]);
  assert.equal(r.chance_moyenne, 25);
  assert.equal(X.penaltyDuJour(ms, { jour, penalties: null, nowMs: Date.parse("2026-11-06T08:00:00Z"), fixtureById }), null, "sans registre : rien");
});
test("penalty : un penalty manque compte, les tirs au but non", () => {
  const D = require("../lib/penalties-donnees.js");
  assert.equal(D.avecPenalty([{ type: "Goal", detail: "Missed Penalty", time: { elapsed: 30 } }]), 1);
  assert.equal(D.avecPenalty([{ type: "Goal", detail: "Penalty", comments: "Penalty Shootout", time: { elapsed: 120 } }]), 0);
  assert.equal(D.avecPenalty([{ type: "Goal", detail: "Normal Goal", time: { elapsed: 10 } }]), 0);
});
