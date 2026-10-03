"use strict";
// Interrupteurs d'ouverture (audit V3 du 02/10/2026, point I4) : un seul fichier
// (assets/ouverture.js), charge AVANT les scripts qui le lisent.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("assets/ouverture.js pose les trois interrupteurs du lancement", () => {
  const ctx = { window: {} };
  vm.runInNewContext(read("assets/ouverture.js"), ctx);
  assert.deepEqual({ ...ctx.window.IASHARK_OUVERTURE }, { canalPro: true, reglagesPro: true, tableauPro: false });
});

test("aucun autre fichier ne definit window.IASHARK_OUVERTURE", () => {
  for (const f of ["account-page.js", "pro-onboarding.js", "tools-page.js", "compte.html", "pro.html", "accueil-pro.html"]) {
    assert.doesNotMatch(read(f), /IASHARK_OUVERTURE\s*=/, f);
  }
});

test("chaque page qui lit l'interrupteur charge ouverture.js avant ses scripts", () => {
  const pages = { "compte.html": "account-page.js", "pro.html": "tools-page.js", "accueil-pro.html": "pro-onboarding.js" };
  for (const [page, script] of Object.entries(pages)) {
    const html = read(page);
    const iO = html.indexOf('src="/assets/ouverture.js"');
    const iS = html.indexOf('src="/' + script);
    assert.ok(iO !== -1, page + " doit charger /assets/ouverture.js");
    assert.ok(iS !== -1, page + " doit charger " + script);
    assert.ok(iO < iS, page + " : ouverture.js doit venir avant " + script);
    assert.doesNotMatch(html.slice(html.lastIndexOf("<script", iO), iO + 40), /defer|async/, page + " : ouverture.js ne doit pas etre differe");
  }
});
