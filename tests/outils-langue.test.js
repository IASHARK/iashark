"use strict";
// Les noms d'outils etaient en anglais : "Value Scanner", "Fair Odds",
// "Stake Planner", "Bankroll Lab", "Combo Auditor". Signale par
// l'utilisateur : "on sait pas vraiment ce que c'est".
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const lire = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const html = lire("pro.html"), js = lire("tools-page.js");

test("aucun nom d'outil n'est reste en anglais", () => {
  for (const anglais of ["Value Scanner", "Fair Odds", "Stake Planner", "Bankroll Lab", "Combo Auditor"]) {
    assert.ok(!html.includes(anglais), `"${anglais}" est encore affiche sur la page`);
    assert.ok(!js.includes(anglais), `"${anglais}" est encore affiche dans un panneau`);
  }
  for (const francais of ["Détecteur d’écarts", "Cote juste", "Calculateur de mise",
                          "Simulateur de capital", "Analyse de combiné", "Journal des décisions"]) {
    assert.ok(html.includes(francais), `nom francais manquant dans la navigation : ${francais}`);
    assert.ok(js.includes(francais), `nom francais manquant dans le panneau : ${francais}`);
  }
});

test("les libelles courts de la navigation sont en francais", () => {
  for (const anglais of [">SCAN<", ">CALCULATE<", ">SIZE<", ">SIMULATE<", ">COMBINE<", ">TRACK<"]) {
    assert.ok(!html.includes(anglais), `libelle anglais restant : ${anglais}`);
  }
  for (const francais of [">DÉTECTER<", ">ÉVALUER<", ">DIMENSIONNER<", ">SIMULER<", ">COMBINER<", ">MESURER<"]) {
    assert.ok(html.includes(francais), `libelle francais manquant : ${francais}`);
  }
});

test("chaque outil est accompagne d'une phrase qui dit a quoi il sert", () => {
  // Une phrase courte dans la navigation, une phrase complete dans le panneau.
  const courtes = [...html.matchAll(/text-\[12px\] leading-snug text-soft">([^<]+)</g)].map((m) => m[1]);
  assert.equal(courtes.length, 6, "il faut une phrase par outil dans la navigation");
  for (const p of courtes) assert.ok(p.length >= 25, `phrase trop courte pour etre utile : "${p}"`);

  const longues = [...js.matchAll(/enTete\('[^']+', '([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(longues.length, 6, "il faut une description par panneau");
  for (const p of longues) assert.ok(p.length >= 40, `description trop courte : "${p}"`);
});

test("les marches affiches par les outils sont traduits", () => {
  assert.match(js, /function marcheLisible/);
  assert.match(html, /lib\/market-labels\.js/);
  // Les exemples de demonstration ne portent plus de seuil a virgule.
  const demos = [...js.matchAll(/market: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(demos.length >= 3);
  for (const d of demos) assert.ok(!/\d[.,]\d/.test(d), `exemple avec un seuil a virgule : "${d}"`);
});

test("les titres de la page outils sont accentues", () => {
  for (const sansAccent of ["probabilites", "detecter, evaluer", "du modele en decisions"]) {
    assert.ok(!html.includes(sansAccent), `texte non accentue visible : "${sansAccent}"`);
  }
});
