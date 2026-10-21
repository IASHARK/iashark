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
  for (const francais of ["Détecteur d’écarts", "Cote juste", "Analyse de combiné", "Journal des décisions"]) {
    assert.ok(html.includes(francais), `nom francais manquant dans la navigation : ${francais}`);
    assert.ok(js.includes(francais), `nom francais manquant dans le panneau : ${francais}`);
  }
  // 21/10/2026 : calculateur de mise et simulateur de capital retires (ni mise, ni capital).
  for (const retire of ["Calculateur de mise", "Simulateur de capital", ">DIMENSIONNER<", ">SIMULER<"]) {
    assert.ok(!html.includes(retire) && !js.includes(retire), `outil retire encore present : ${retire}`);
  }
});

test("les libelles courts de la navigation sont en francais", () => {
  for (const anglais of [">SCAN<", ">CALCULATE<", ">SIZE<", ">SIMULATE<", ">COMBINE<", ">TRACK<"]) {
    assert.ok(!html.includes(anglais), `libelle anglais restant : ${anglais}`);
  }
  for (const francais of [">DÉTECTER<", ">ÉVALUER<", ">COMBINER<", ">MESURER<"]) {
    assert.ok(html.includes(francais), `libelle francais manquant : ${francais}`);
  }
});

test("chaque outil est accompagne d'une phrase qui dit a quoi il sert", () => {
  // Une phrase courte dans la navigation, une phrase complete dans le panneau.
  const courtes = [...html.matchAll(/text-\[12px\] leading-snug text-soft">([^<]+)</g)].map((m) => m[1]);
  assert.equal(courtes.length, 4, "il faut une phrase par outil dans la navigation");
  for (const p of courtes) assert.ok(p.length >= 25, `phrase trop courte pour etre utile : "${p}"`);

  const longues = [...js.matchAll(/enTete\('[^']+', '([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(longues.length, 4, "il faut une description par panneau");
  for (const p of longues) assert.ok(p.length >= 40, `description trop courte : "${p}"`);
});

test("les marches affiches par les outils sont traduits", () => {
  assert.match(js, /function marcheLisible/);
  assert.match(html, /lib\/market-labels\.js/);
  // Plus d'exemples de demonstration (21/10/2026 : un non-abonne voit la page de
  // vente) ; chaque ligne reelle s'affiche via marketIdLabel quand le moteur donne
  // son identifiant (lib/market-labels.js).
  assert.doesNotMatch(js, /market: '[^']+', marketId: '/, "plus de ligne de demonstration");
  assert.match(js, /if \(r\.marketId && labels && labels\.marketIdLabel\) return labels\.marketIdLabel\(r\.marketId\);/);
});

test("les titres de la page outils sont accentues", () => {
  for (const sansAccent of ["probabilites", "detecter, evaluer", "du modele en decisions"]) {
    assert.ok(!html.includes(sansAccent), `texte non accentue visible : "${sansAccent}"`);
  }
});
