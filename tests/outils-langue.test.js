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
  // Espace Pro (V3 du 3/10/2026) : le tableau de bord d'abord, puis 2 outils.
  // « Journal des decisions » est devenu le bloc « Mes paris » du tableau de
  // bord ; « Cote juste », « Simulateur de capital » et « Calculateur de mise »
  // sont retires (30/09/2026 : plus aucune mise ni esperance sur le site).
  for (const francais of ["Tableau de bord", "Mon combiné", "Détecteur d’écarts"]) {
    assert.ok(html.includes(francais), `nom francais manquant dans la navigation : ${francais}`);
  }
  for (const francais of ["Détecteur d’écarts", "Analyse de combiné"]) {
    assert.ok(js.includes(francais), `nom francais manquant dans le panneau : ${francais}`);
  }
  for (const retire of ["Simulateur de capital", "Journal des décisions", "Calculateur de mise", "Cote juste", "espérance"]) {
    assert.ok(!html.includes(retire), `outil retire encore dans la navigation : ${retire}`);
  }
  for (const retire of ["Calculateur de mise", "Simulateur de capital", "Espérance", "espérance"]) {
    assert.ok(!js.includes(retire), `outil retire encore dans les panneaux : ${retire}`);
  }
});

test("les libelles courts de la navigation sont en francais", () => {
  for (const anglais of [">SCAN<", ">CALCULATE<", ">SIZE<", ">SIMULATE<", ">COMBINE<", ">TRACK<"]) {
    assert.ok(!html.includes(anglais), `libelle anglais restant : ${anglais}`);
  }
  for (const francais of [">DÉTECTER<", ">COMBINER<"]) {
    assert.ok(!html.includes(">DIMENSIONNER<"), "calculateur de mise retire");
    assert.ok(html.includes(francais), `libelle francais manquant : ${francais}`);
  }
});

test("chaque outil est accompagne d'une phrase qui dit a quoi il sert", () => {
  // Une phrase courte dans la navigation, une phrase complete dans le panneau.
  const courtes = [...html.matchAll(/text-\[12px\] leading-snug text-soft">([^<]+)</g)].map((m) => m[1]);
  // Lancement du 3/10 : tableau de bord cache (0040/0041 pas appliquees) : les 2 outils.
  assert.equal(courtes.length, 2, "il faut une phrase par onglet dans la navigation (2 outils)");
  for (const p of courtes) assert.ok(p.length >= 25, `phrase trop courte pour etre utile : "${p}"`);

  const longues = [...js.matchAll(/enTete\('[^']+', '([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(longues.length, 2, "il faut une description par panneau d'outil");
  for (const p of longues) assert.ok(p.length >= 40, `description trop courte : "${p}"`);
});

test("les marches affiches par les outils sont traduits", () => {
  assert.match(js, /function marcheLisible/);
  assert.match(html, /lib\/market-labels\.js/);
  // Les exemples de demonstration suivent le format des libelles traduits
  // (lib/market-labels.js, 14/09/2026) : ligne a la francaise ("1,5"), jamais
  // le point decimal du moteur.
  const demos = [...js.matchAll(/market: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(demos.length >= 3);
  for (const d of demos) assert.ok(!/\d\.\d/.test(d), `exemple avec un point decimal : "${d}"`);
  // Chaque exemple porte son identifiant moteur et s'affiche via marketIdLabel.
  assert.ok((js.match(/marketId: '/g) || []).length >= demos.length, "marketId manquant sur un exemple");
  assert.match(js, /if \(r\.marketId && labels && labels\.marketIdLabel\) return labels\.marketIdLabel\(r\.marketId\);/);
});

test("les titres de la page outils sont accentues", () => {
  for (const sansAccent of ["probabilites", "detecter, evaluer", "du modele en decisions"]) {
    assert.ok(!html.includes(sansAccent), `texte non accentue visible : "${sansAccent}"`);
  }
});

// Avocat du diable (30/09/2026, ronde 7) : le mathematicien a pose la condition
// « jamais avantage ». En anglais le detecteur s'appelait « Edge Detector » et
// triait « by edge » ; en espagnol, allemand, italien et portugais il s'appelait
// « detecteur d'avantages ». C'est un detecteur d'ECARTS dans toutes les langues.
const LANGUES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const dict = (l) => JSON.parse(lire("i18n/dict/" + l + ".json"));
const MOTS_INTERDITS = /\bedges?\b|avantage|advantage|ventaj|vorteil|vantagg|vantagem|valeur|\bvalue\b/i;

test("detecteur d'ecarts : jamais « edge » ni « avantage », dans aucune langue", () => {
  for (const l of LANGUES) {
    const tp = dict(l).tools_page;
    for (const k of Object.keys(tp).filter((x) => /^scan_/.test(x))) {
      assert.doesNotMatch(tp[k], MOTS_INTERDITS, `${l} tools_page.${k} : « ${tp[k]} »`);
    }
  }
  const en = dict("en").tools_page;
  assert.equal(en.scan_title, "Gap Detector");
  assert.match(en.scan_pro_title, /by gap\./);
  // Pages generees (scripts/build-locales.js) : le nom est ecrit en dur dans le HTML.
  for (const dir of ["en", "gb", "za", "es", "mx"]) {
    const page = lire(dir + "/pro.html");
    assert.ok(!/Edge Detector|Detector de ventajas/.test(page), dir + "/pro.html : ancien nom");
    const attendu = /^(en|gb|za)$/.test(dir) ? "Gap Detector" : "Detector de diferencias";
    assert.equal(page.split(">" + attendu + "<").length - 1, 2, dir + "/pro.html : « " + attendu + " » attendu 2 fois");
  }
});

test("detecteur vide : la phrase ne donne plus de raison fausse pour l'ancien moteur", () => {
  // L'ancien moteur tire 80 % de son chiffre de la cote sans marge (lib/decision.js) et
  // ses ecarts favorables sont masques : « n'est montre que si son estimation tient
  // compte des cotes » etait donc faux pour lui.
  for (const l of LANGUES) {
    const v = dict(l).tools_page.scan_empty_threshold_text;
    assert.ok(typeof v === "string" && v.trim(), l);
    assert.doesNotMatch(v, /tient compte|takes the odds|tiene en cuenta|toma en cuenta|berücksichtigt|tiene conto|tiver em conta|aligné|aligned/i, l + " : « " + v + " »");
    assert.doesNotMatch(v, MOTS_INTERDITS, l);
  }
  assert.equal(dict("fr").tools_page.scan_empty_threshold_text, "Aujourd’hui, aucun écart affiché n’atteint ce seuil. Les écarts en faveur du modèle ne sont pas tous affichés.");
  assert.ok(js.includes("t('tools_page.scan_empty_threshold_text', 'Aujourd’hui, aucun écart affiché n’atteint ce seuil. Les écarts en faveur du modèle ne sont pas tous affichés.')"));
});
