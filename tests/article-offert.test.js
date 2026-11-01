"use strict";
// Bloc « Match offert aujourd'hui » des articles : version, marche, lien et langue selon l'adresse de la page.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const AO = require("../lib/article-offert.js");
const M = { id: 1550185, home: { n: "Sassuolo" }, away: { n: "Fiorentina" } };

test("version et marche d'apres l'adresse ; /blog/ est la version francaise", () => {
  assert.equal(AO.version("/blog/ballon-dor-2026.html"), "fr");
  assert.equal(AO.version("/en/blog/guides/x.html"), "en");
  assert.equal(AO.version("/mx/articulos/x.html"), "mx");
  assert.deepEqual(["fr", "en", "gb", "za", "es", "mx"].map(AO.marche), ["fr", "us", "gb", "za", "fr", "mx"]);
});
test("le bloc mene au match offert de la meme version, dans sa langue, sans aucun chiffre ni promesse", () => {
  for (const [v, mot] of [["fr", "Match offert"], ["en", "Free match"], ["gb", "Free match"], ["za", "Free match"], ["es", "Partido gratis"], ["mx", "momio"]]) {
    const h = AO.html(v, M);
    assert.match(h, new RegExp(mot), v);
    assert.match(h, new RegExp('href="/' + v + "/match\\.html\\?id=1550185\""), v);
    assert.match(h, /Sassuolo – Fiorentina/, v);
    assert.doesNotMatch(h, /garanti|gagnant|\d+ ?%/i, v);
  }
});
test("bottom-navigation ne charge le bloc que sur les articles", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "bottom-navigation.js"), "utf8");
  assert.match(src, /blog\|articles\|articulos/);
  assert.match(src, /\/lib\/article-offert\.js/);
});
