"use strict";
// Bandeau des vrais resultats (lib/bandeau-preuves.js, 26/10/2026) : aucune selection, aucun pari publie apres le
// coup d'envoi, combines et Selection en or seulement quand tous leurs matchs sont regles par l'archive.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const B = require("../lib/bandeau-preuves.js");

const MAINTENANT = Date.parse("2026-10-26T10:00:00Z");
function pari(id, heure, result, extra) {
  const k = new Date(Date.parse("2026-10-25T00:00:00Z") + heure * 3600000).toISOString();
  return Object.assign({ fixture_id: id, home: "Dom" + id, away: "Ext" + id, prediction: "Over 2.5", market: "over-25", cote: "1.5", result, score: "2-1",
    published_at: new Date(Date.parse(k) - 6 * 3600000).toISOString(), kickoff_at: k }, extra || {});
}

test("paris simples : les 40 derniers par coup d'envoi, gagnes et perdus melanges, compte exact, jamais trie par resultat", () => {
  const simples = [];
  for (let i = 1; i <= 60; i++) simples.push(pari(i, i * 0.3, i % 3 === 0 ? "loss" : "win"));
  const b = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT });
  assert.equal(b.simples.n, 40);
  const ids = b.simples.items.map((x) => x.f);
  assert.deepEqual(ids, Array.from({ length: 40 }, (_, i) => 60 - i), "les plus recents d'abord, sans trou");
  assert.equal(b.simples.gagnes + b.simples.perdus, 40);
  assert.equal(b.simples.perdus, ids.filter((i) => i % 3 === 0).length, "les perdus comptes, pas retires");
  // Ordre independant du resultat : un perdu recent reste devant un gagne plus ancien.
  assert.equal(b.simples.items[0].f, 60);
  assert.equal(b.simples.items[0].r, "loss");
});

test("paris simples : publie apres le coup d'envoi, sans date, annule ou en attente = jamais montre", () => {
  const simples = [
    pari(1, 1, "win"),
    pari(2, 2, "win", { published_at: "2026-10-25T03:00:00Z" }), // publie apres le coup d'envoi (02:00)
    pari(3, 3, "win", { published_at: null }),
    pari(4, 4, "void"),
    pari(5, 5, "scheduled"),
    pari(6, 6, "loss", { kickoff_at: null }),
  ];
  const b = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT });
  assert.deepEqual(b.simples.items.map((x) => x.f), [1]);
});

test("combines : montres seulement si tous les matchs sont regles avec le meme marche ; un perdu = combine perdu", () => {
  const jambes = [pari(11, 10, "win"), pari(12, 11, "win"), pari(13, 12, "loss"), pari(14, 13, "win", { market: "btts-yes" }), pari(15, 14, "scheduled")];
  const jambe = (id, market) => ({ fixture_id: id, market_id: market || "over-25", coup_envoi: "2026-10-25 12:00", coup_envoi_ms: Date.parse("2026-10-25T11:00:00Z") });
  const tickets = [
    { jour: "2026-10-25", type: "x5", meta: { cote_totale: 4.03 }, contenu: { jambes: [jambe(11), jambe(12)] } },            // gagne
    { jour: "2026-10-25", type: "x10", meta: { cote_totale: 8.52 }, contenu: { jambes: [jambe(11), jambe(13)] } },           // perdu
    { jour: "2026-10-24", type: "x5", meta: { cote_totale: 3.9 }, contenu: { jambes: [jambe(11), jambe(14)] } },             // autre marche : cache
    { jour: "2026-10-24", type: "x10", meta: { cote_totale: 9 }, contenu: { jambes: [jambe(11), jambe(15)] } },              // non regle : cache
    { jour: "2026-10-25", type: "or", contenu: { paris: [jambe(11), jambe(12), jambe(13)] } },                              // 2 gagnes, 1 perdu
    { jour: "2026-10-10", type: "x5", meta: { cote_totale: 4 }, contenu: { jambes: [Object.assign(jambe(11), { coup_envoi_ms: Date.parse("2026-10-10T11:00:00Z") })] } }, // trop ancien
  ];
  const b = B.construireBandeau({ simples: [], tickets, jambes, matchs: [], maintenant: MAINTENANT });
  assert.deepEqual(b.combines.map((c) => c.t + ":" + c.r), ["x5:win", "x10:loss"]);
  assert.equal(b.combines[0].c, 4.03);
  assert.deepEqual(b.or.map((o) => [o.g, o.p]), [[2, 1]]);
});

test("logos : identifiants lus dans les matchs du run et gardes d'un passage a l'autre ; inconnus = aucun logo", () => {
  const simples = [pari(21, 1, "win"), pari(22, 2, "loss")];
  const premier = B.construireBandeau({ simples: [], tickets: [], jambes: [], matchs: [{ id: 21, home: { id: 85 }, away: { id: 80 }, date: "2026-10-25 01:00" }], maintenant: MAINTENANT });
  const second = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], precedent: premier, maintenant: MAINTENANT });
  const it = Object.fromEntries(second.simples.items.map((x) => [x.f, x]));
  assert.deepEqual([it[21].hi, it[21].ai], [85, 80]);
  assert.deepEqual([it[22].hi, it[22].ai], [null, null]);
});

test("affichage : vert et rouge seulement pour le resultat, compte identique a la liste, aucune mise ni promesse", () => {
  const simples = [pari(31, 3, "win"), pari(32, 2, "loss"), pari(33, 1, "win")];
  const d = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT });
  const h = B.html(d);
  assert.match(h.tete, /3 derniers paris/);
  assert.match(h.tete, /bp-w">2 gagnés/);
  assert.match(h.tete, /bp-l">1 perdus/);
  assert.equal((h.rail.match(/bp-it bp-win/g) || []).length, 2);
  assert.equal((h.rail.match(/bp-it bp-loss/g) || []).length, 1);
  assert.doesNotMatch(h.rail + h.tete, /mise|gain|garanti|€|esp[ée]rance/i);
  assert.equal(B.html({ simples: { n: 0, items: [] } }), null, "sans pari regle : rien (bandeau replie)");
});

test("fichier publie preuves/bandeau.json : conforme aux regles (ordre, compte, publie avant le match)", () => {
  const f = path.join(__dirname, "..", "preuves", "bandeau.json");
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const it = d.simples.items;
  assert.ok(it.length > 0 && it.length <= B.N_SIMPLES);
  for (let i = 1; i < it.length; i++) assert.ok(it[i - 1].k >= it[i].k, "ordre des coups d'envoi");
  assert.equal(d.simples.gagnes, it.filter((x) => x.r === "win").length);
  assert.equal(d.simples.perdus, it.filter((x) => x.r === "loss").length);
  assert.ok(it.every((x) => x.r === "win" || x.r === "loss"));
});

test("pages : le bandeau est sur l'accueil et la page match de chaque version, charge en differe", () => {
  const ROOT = path.join(__dirname, "..");
  for (const p of ["index.html", "match.html", "fr/index.html", "fr/match.html", "en/index.html", "en/match.html", "gb/match.html"]) {
    const html = fs.readFileSync(path.join(ROOT, p), "utf8");
    assert.match(html, /id="bandeauPreuves"[^>]*min-height:68px/, p + " : place reservee (pas de saut de page)");
    assert.match(html, /<script src="\/lib\/bandeau-preuves\.js" defer><\/script>/, p + " : script differe");
  }
});
