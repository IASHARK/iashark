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

// Decision produit revisee le 02/09/2026 : les outils qui exploitent le
// modele (scanner de value, combine, variance) deviennent reserves aux
// abonnes, un visiteur gratuit devant les VOIR sans pouvoir s'en servir.
// Le calculateur de mise, lui, reste ouvert a tous - c'est ce que ce test
// continue de garantir, avec le fait qu'aucun outil n'est cache purement
// et simplement (le visiteur doit comprendre ce qu'on lui propose).
test("la page Outils garde le calculateur ouvert et montre les outils Pro sans les cacher", () => {
  const source = read("pro.html");
  assert.doesNotMatch(source, /class="pro-wall locked"/, "l'ancien mur opaque ne revient pas");
  assert.match(source, /id="stakeResult"/, "le calculateur de mise reste present");
  assert.match(source, /tools-page\.js/);
  assert.match(source, /Le calculateur de mise est accessible à tous/);
  // Les outils Pro sont dans le HTML servi, titres et explications compris :
  // un visiteur gratuit voit ce qu'il achete, il ne peut simplement pas s'en servir.
  for (const id of ["toolScan", "toolCombo", "toolVariance"]) {
    assert.match(source, new RegExp('id="' + id + '"'), id + " doit exister dans la page");
  }
  assert.match(source, /Scanner de value du jour/);
  assert.match(source, /class="pro-veil"/, "le verrou est un voile explicite avec un appel a l'abonnement");
  assert.match(source, /abonnement\.html/, "le voile renvoie vers la page d'abonnement");
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
