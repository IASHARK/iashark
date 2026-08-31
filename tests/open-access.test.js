"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("la page match n’insère plus de mur PRO", () => {
  const source = read("match.html");
  assert.doesNotMatch(source, /var proWall=/);
  assert.doesNotMatch(source, /\+proWall/);
});

test("la page Outils est ouverte sans flou ni contrôle d’abonnement", () => {
  const source = read("pro.html");
  assert.doesNotMatch(source, /class="pro-wall locked"/);
  assert.match(source, /function checkProAccess\(\)\{\s*unlockProWall\(\);/);
});

test("toutes les pages SEO de match utilisent la nouvelle structure sans mur PRO", () => {
  const files = fs.readdirSync(path.join(root, "match")).filter((file) => file.endsWith(".html"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = read(path.join("match", file));
    assert.match(source, /id="matchRoot"/);
    assert.match(source, /match-page\.js/);
    assert.match(source, /match-view-model\.js/);
    assert.match(source, /<script type="application\/ld\+json">/);
    assert.doesNotMatch(source, /var proWall=/);
  }
});
