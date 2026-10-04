"use strict";
// LES JUMEAUX DU MATCH (lib/jumeaux.js ; verdicts-maths-tickets.md §3, GO avec condition).
// Archive fabriquee : on connait exactement les jumeaux attendus.
// Verification faite a la main le 04/10/2026 sur la vraie archive football-data (hors depot) :
// Bournemouth - Liverpool du 20/09/2026, 282 jumeaux du resultat (77 / 82 / 123 : 27 / 29 / 44 %)
// pour 281 (76 / 82 / 123) chez le mathematicien ; jumeaux des buts 1 049 / 671 / 637, identiques.
const test = require("node:test");
const assert = require("node:assert/strict");
const J = require("../lib/jumeaux.js");
const P = require("../lib/pronostic.js");
const CONFIG = require("../config/jumeaux.json");
const VERDICTS = require("../config/verdicts-maths.json");

// Ligne du reservoir directement (chances sans marge deja calculees).
function ligne(o) {
  return Object.assign({ date: "2024-01-01", code: "E0", ligue: "Premier League", domicile: "A", exterieur: "B", bd: 1, be: 0, p1: 0.45, p2: 0.30, po25: 0.55 }, o);
}
// Cotes du site qui donnent (environ) les chances voulues : on part des chances et on ajoute une marge.
function cotesPour(p1, pn, p2) { return [p1, pn, p2].map((p) => (1 / (p * 1.05)).toFixed(4)); }
function match(o) {
  const c = cotesPour(0.45, 0.25, 0.30);
  return Object.assign({ league_key: "premier", date: "2026-10-04 18:00", c1: c[0], cn: c[1], c2: c[2], co25: "1.75", cu25: "2.15" }, o);
}
function chancesDe(m) { const q = P.sansMargePuissance([Number(m.c1), Number(m.cn), Number(m.c2)]); return { H: q[0] * 100, A: q[2] * 100 }; }

test("jumeaux du resultat : exactement les matchs a +-2 points, meme niveau, comptes bruts et % entiers", () => {
  const m = match();
  const { H, A } = chancesDe(m);
  const lignes = [];
  // 150 victoires domicile, 60 nuls, 40 victoires exterieur dans la fenetre (top 5).
  for (let i = 0; i < 250; i++) {
    const issue = i < 150 ? [2, 0] : i < 210 ? [1, 1] : [0, 1];
    lignes.push(ligne({ date: "2023-0" + (1 + (i % 9)) + "-1" + (i % 10), code: ["E0", "SP1", "D1"][i % 3], domicile: "D" + i, exterieur: "E" + i,
      bd: issue[0], be: issue[1], p1: (H + ((i % 7) - 3) * 0.6) / 100, p2: (A + ((i % 5) - 2) * 0.9) / 100 }));
  }
  // Hors fenetre (2,1 points) ou d'un autre niveau : jamais comptes.
  lignes.push(ligne({ p1: (H + 2.1) / 100, p2: A / 100, domicile: "Loin" }));
  lignes.push(ligne({ code: "E1", p1: H / 100, p2: A / 100, domicile: "Championship" }));
  // Avant 2012 : hors reservoir. Apres la fin de la table : ignore.
  lignes.push(ligne({ date: "2011-05-01", p1: H / 100, p2: A / 100 }));
  lignes.push(ligne({ date: "2026-10-04", p1: H / 100, p2: A / 100 }));
  const t = J.construireTable(lignes, { fin: "2026-10-03" });
  const j = J.jumeauxDuMatch(t, m);
  assert.equal(j.v, "jumeaux-1");
  assert.equal(j.resultat.n, 250);
  assert.deepEqual([j.resultat.dom, j.resultat.nul, j.resultat.ext], [150, 60, 40]);
  assert.deepEqual(j.resultat.pct, { dom: 60, nul: 24, ext: 16 });
  assert.equal(j.resultat.niveau, "meme");
  assert.equal(j.resultat.depuis, 2012);
  assert.equal(j.resultat.exemples.length, 3);
  // Un fait, jamais une chance : aucun champ « chance », « probabilite » ni cote.
  assert.doesNotMatch(JSON.stringify(j), /chance|probabilit|cote/);
});

test("moins de 200 jumeaux : rien, sauf repli « tous championnats » ANNONCE ; jamais d'elargissement de la fenetre", () => {
  const m = match();
  const { H, A } = chancesDe(m);
  const peu = [];
  for (let i = 0; i < 150; i++) peu.push(ligne({ domicile: "T" + i, p1: H / 100, p2: A / 100, po25: null }));
  // 150 au meme niveau : rien (et des matchs a 2,5 points ne comblent jamais le manque).
  for (let i = 0; i < 100; i++) peu.push(ligne({ domicile: "L" + i, p1: (H + 2.5) / 100, p2: A / 100, po25: null }));
  assert.equal(J.jumeauxDuMatch(J.construireTable(peu, { fin: "2026-10-03" }), m), null);
  // + 80 d'un autre niveau : 230 « tous championnats », annonce.
  const plus = peu.concat(Array.from({ length: 80 }, (_, i) => ligne({ code: "N1", domicile: "N" + i, p1: H / 100, p2: A / 100, po25: null })));
  const j = J.jumeauxDuMatch(J.construireTable(plus, { fin: "2026-10-03" }), m);
  assert.equal(j.resultat.n, 230);
  assert.equal(j.resultat.niveau, "tous");
});

test("exemples : les plus proches, puis les plus recents ; seulement depuis debut_exemples", () => {
  const m = match();
  const { H, A } = chancesDe(m);
  const l = [];
  for (let i = 0; i < 200; i++) l.push(ligne({ date: "2020-01-01", domicile: "Loin" + i, p1: (H + 1.9) / 100, p2: (A - 1.9) / 100 }));
  l.push(ligne({ date: "2021-03-01", domicile: "Pile2021", p1: H / 100, p2: A / 100, bd: 2, be: 2 }));
  l.push(ligne({ date: "2024-03-01", domicile: "Pile2024", p1: H / 100, p2: A / 100 }));
  l.push(ligne({ date: "2015-03-01", domicile: "Pile2015", p1: H / 100, p2: A / 100 })); // avant debut_exemples
  l.push(ligne({ date: "2022-03-01", domicile: "Pres", p1: (H + 0.5) / 100, p2: A / 100 }));
  const j = J.jumeauxDuMatch(J.construireTable(l, { fin: "2026-10-03" }), m);
  assert.deepEqual(j.resultat.exemples.map((e) => e.domicile), ["Pile2024", "Pile2021", "Pres"]);
  assert.deepEqual(j.resultat.exemples[1], { date: "2021-03-01", ligue: "Premier League", domicile: "Pile2021", exterieur: "B", score: "2-2" });
  assert.equal(CONFIG.debut_exemples, "2019-07-01");
});

test("jumeaux des buts : +-2 points sur « plus de 2,5 », depuis 2019, jamais hors d'Europe", () => {
  const m = match();
  const qo = P.sansMargePuissance([1.75, 2.15])[0] * 100;
  const l = [];
  for (let i = 0; i < 300; i++) l.push(ligne({ date: "2022-01-01", domicile: "B" + i, p1: null, p2: null, po25: (qo + ((i % 9) - 4) * 0.45) / 100, bd: i < 180 ? 3 : 0, be: i < 120 ? 1 : 0 }));
  l.push(ligne({ date: "2018-01-01", p1: null, p2: null, po25: qo / 100 })); // avant 2019 : jamais
  const t = J.construireTable(l, { fin: "2026-10-03" });
  const j = J.jumeauxDuMatch(t, m);
  assert.equal(j.resultat, null);
  assert.deepEqual(j.buts, { n: 300, depuis: 2019, plus_2_5: 180, btts: 120, pct: { plus_2_5: 60, btts: 40 } });
  // Hors d'Europe (MLS) : jamais de jumeaux des buts.
  const lUsa = l.map((x) => Object.assign({}, x, { code: "USA" }));
  assert.equal(J.jumeauxDuMatch(J.construireTable(lUsa, { fin: "2026-10-03" }), match({ league_key: "mls" })), null);
});

test("conditions : jour du match apres la fin de la table, championnat du reservoir, mauvaise table -> rien", () => {
  const m = match();
  const { H, A } = chancesDe(m);
  const l = Array.from({ length: 220 }, (_, i) => ligne({ domicile: "X" + i, p1: H / 100, p2: A / 100 }));
  const t = J.construireTable(l, { fin: "2026-10-03" });
  assert.ok(J.jumeauxDuMatch(t, m));
  assert.equal(J.jumeauxDuMatch(t, match({ date: "2026-10-03 21:00" })), null, "table qui contient le jour du match : rien");
  assert.equal(J.jumeauxDuMatch(t, match({ league_key: "ldc" })), null, "coupe d'Europe : pas de reservoir");
  assert.equal(J.jumeauxDuMatch(Object.assign({}, t, { v: "autre" }), m), null);
  const sansCote = J.jumeauxDuMatch(t, match({ c1: null }));
  assert.equal(sansCote.resultat, null, "sans cote 1N2 du site : pas de jumeaux du resultat");
  assert.ok(sansCote.buts);
});

test("archive football-data : cote de cloture Pinnacle, sinon moyenne de cloture ; score final ; rien d'autre", () => {
  const base = { date_iso: "2024-02-03", league_code: "E0", league_name: "Premier League", HomeTeam: "A", AwayTeam: "B", FTHG: "2", FTAG: "1" };
  const avecPin = J.ligneDepuisFootballData(Object.assign({}, base, { PSCH: "2.00", PSCD: "3.60", PSCA: "4.00", AvgCH: "1.50", AvgCD: "4", AvgCA: "6", "PC>2.5": "1.90", "PC<2.5": "1.95" }));
  const q = P.sansMargePuissance([2, 3.6, 4]);
  assert.ok(Math.abs(avecPin.p1 - q[0]) < 1e-12 && Math.abs(avecPin.p2 - q[2]) < 1e-12);
  const sansPin = J.ligneDepuisFootballData(Object.assign({}, base, { AvgCH: "1.50", AvgCD: "4", AvgCA: "6" }));
  assert.ok(Math.abs(sansPin.p1 - P.sansMargePuissance([1.5, 4, 6])[0]) < 1e-12);
  assert.equal(sansPin.po25, null);
  assert.equal(J.ligneDepuisFootballData(Object.assign({}, base, { FTHG: "" })), null, "match sans score : hors reservoir");
  assert.equal(J.ligneDepuisFootballData(base), null, "aucune cote : hors reservoir");
});

test("pipeline : rien sans le feu vert du mathematicien ; feu du jour « en_attente »", () => {
  const m = match();
  const { H, A } = chancesDe(m);
  const t = J.construireTable(Array.from({ length: 220 }, (_, i) => ligne({ domicile: "X" + i, p1: H / 100, p2: A / 100 })), { fin: "2026-10-03" });
  assert.equal(VERDICTS.match.jumeaux, "en_attente");
  const a = [Object.assign({}, m, { jumeaux: { vieux: 1 } })];
  assert.equal(J.poserJumeaux(a, t), 0);
  assert.equal(a[0].jumeaux, undefined);
  const go = JSON.parse(JSON.stringify(VERDICTS)); go.match.jumeaux = "GO";
  const b = [Object.assign({}, m)];
  assert.equal(J.poserJumeaux(b, t, go), 1);
  assert.equal(b[0].jumeaux.resultat.n, 220);
  const ferme = [Object.assign({}, m, { no_signal_reason: "KICKOFF_PASSED", jumeaux: { gele: true } })];
  J.poserJumeaux(ferme, t, go);
  assert.deepEqual(ferme[0].jumeaux, { gele: true });
  // Table absente du depot : null (le calcul quotidien continue sans jumeaux).
  assert.equal(J.chargerTable(undefined, Object.assign({}, CONFIG, { table: "data/jumeaux/absente.json" })), null);
});
