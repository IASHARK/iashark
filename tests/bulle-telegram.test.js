"use strict";
// Bulle « Rejoins-nous sur Telegram » (bottom-navigation.js), 26/10/2026 : elle ne cache plus
// jamais un bouton ou un prix. L'ancienne garde ne regardait que deux sortes de boutons
// (.op-cta, .mu-shimmer) et laissait couvrir l'offre a 99 €, le choix de l'offre annuelle,
// « Les combinés du jour », les onglets des jours et la carte du match offert.
// Le comportement reel est verifie dans un navigateur (captures a 390 px) ; ce test garde la regle.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "bottom-navigation.js"), "utf8");
const bulle = src.slice(src.indexOf("Bulle « Rejoins-nous sur Telegram »"));

test("bulle Telegram : surveille tout ce qui se clique, pas seulement deux classes de boutons", () => {
  assert.doesNotMatch(bulle, /querySelectorAll\('\.op-cta,\.mu-shimmer'\)/, "ancienne garde limitee a deux boutons");
  const sel = (bulle.match(/var CLIQUABLE='([^']+)'/) || [])[1];
  assert.ok(sel, "liste des elements cliquables absente");
  for (const s of ["a[href]", "button", "summary", "input", "select", "label", "[role=tab]", "[role=radio]"]) {
    assert.ok(sel.includes(s), "element cliquable non surveille : " + s);
  }
});

test("bulle Telegram : surveille aussi chaque prix ecrit dans la page", () => {
  const m = bulle.match(/var PRIX=(\/.+\/g);/);
  assert.ok(m, "detection des prix absente");
  const re = new Function("return " + m[1])();
  for (const prix of ["4,99 €", "14,99 €", "99 €", "€4.99", "$4.99", "£4.99", "R 99", "MX$ 99"]) {
    re.lastIndex = 0;
    assert.ok(re.test(prix), "prix non reconnu : " + prix);
  }
  for (const texte of ["Plus de 2,5 buts", "20:30", "dans 4 h 35", "Ligue 1", "J1 League", "40 %"]) {
    re.lastIndex = 0;
    assert.ok(!re.test(texte), "faux prix : " + texte);
  }
});

test("bulle Telegram : entiere, puis en rond, puis effacee ; elle ne se deplace jamais", () => {
  assert.match(bulle, /ias-tg--mini/);
  assert.match(bulle, /ias-tg--cache\{opacity:0;visibility:hidden;pointer-events:none/);
  assert.match(bulle, /gene\(zone\(false\)\)\)etat=gene\(zone\(true\)\)\?'cachee':'rond'/);
  assert.doesNotMatch(bulle, /a\.style\.bottom\s*=/, "la bulle ne doit plus sauter au-dessus du bouton");
  // Toujours absente des pages ou l'on paie.
  assert.match(bulle, /pro\|abonnement\|checkout-\[a-z\]\+/);
});
