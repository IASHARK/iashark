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

// 21/10/2026 (regle de Clement : ni mise, ni capital, ni esperance, ni ROI, ni profit / perte,
// nulle part). La cote juste garde cote juste, cote disponible et ecart en points ; le combine,
// sa probabilite combinee, sa cote juste et la cote proposee ; le journal, des paris notes,
// gagnes, perdus et un taux de reussite. Aucun montant.
test("outils Pro : ni esperance, ni mise, ni ROI, ni profit / perte, dans le code et les 7 langues", () => {
  const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /jrStake|expectedValue|bestSingleEv|worseThanSingle|euros(Signe)?\(|symboleDevise|\.roi\b|\.profit\b|D\.pnl/,
    "champ de mise ou calcul de montant encore present");
  assert.doesNotMatch(code, /[Ee]spérance|'Mise'|'MISE'|\bROI\b|Profit|P\/L/, "texte de repli interdit");
  assert.doesNotMatch(html, /espérance|ont réellement rapporté/i, "description de navigation interdite");

  const utilisees = new Set();
  for (const src of [js, html]) for (const m of src.matchAll(/tools_page\.([a-z0-9_]+)/g)) utilisees.add(m[1]);
  const INTERDITS = {
    fr: /esp[ée]rance|\bmises?\b|\bROI\b|profit|bankroll|capital|P\/L|rapport/i,
    en: /expected (value|return)|\bstakes?\b|\bROI\b|profit|bankroll|P\/L|returned/i,
    es: /esperanza|\bROI\b|ganancia|beneficio|bankroll|P\/L|rendido/i,
    "es-mx": /esperanza|\bROI\b|ganancia|beneficio|bankroll|P\/L|rendido/i,
    de: /Erwartungswert|Einsatz|\bROI\b|Gewinn\b|Bankroll|eingebracht/i,
    it: /valore atteso|puntata|\bROI\b|profitto|guadagno|bankroll|\breso\b/i,
    pt: /valor esperado|esperança|\bROI\b|lucro|\bganho\b|bankroll|renderam/i
  };
  for (const [langue, motif] of Object.entries(INTERDITS)) {
    const tp = JSON.parse(lire("i18n/dict/" + langue + ".json")).tools_page;
    for (const cle of utilisees) {
      assert.equal(typeof tp[cle], "string", langue + " : tools_page." + cle + " manquant");
      assert.doesNotMatch(tp[cle], motif, langue + " : tools_page." + cle);
    }
    for (const retiree of ["fair_kpi_ev", "combo_result_label", "journal_kpi_roi", "journal_kpi_profit", "journal_th_stake", "journal_th_pl", "journal_stake_label"]) {
      assert.equal(tp[retiree], undefined, langue + " : cle retiree encore presente : " + retiree);
    }
  }
});
