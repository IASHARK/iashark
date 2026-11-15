// Panneau Lolly Bet a l'arrivee (lib/lolly-panneau.js, 15/11/2026).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "lib/lolly-panneau.js"), "utf8");
const prefs = fs.readFileSync(path.join(ROOT, "site-prefs.js"), "utf8");
const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/0076_lolly_panneau.sql"), "utf8");

test("charge par site-prefs.js, jamais sur les pages de compte, de paiement, Pro ni Lolly", () => {
  assert.match(prefs, /\/lib\/lolly-panneau\.js/);
  const re = new RegExp(prefs.match(/if\(\/(\\\/\(connexion[^\n]*?)\/\.test\(location\.pathname\)\)/)[1]);
  for (const p of ["/fr/connexion.html", "/fr/inscription.html", "/en/compte.html", "/fr/abonnement.html", "/es/pro.html", "/fr/lolly.html", "/fr/checkout-succes.html"]) {
    assert.ok(re.test(p), p);
  }
  for (const p of ["/fr/index.html", "/fr/match.html", "/en/combines.html", "/fr/blog.html"]) {
    assert.ok(!re.test(p), p);
  }
});

test("lien partenaire existant, 18+, quatre langues, aucune promesse ni emoticone", () => {
  assert.match(src, /var LIEN = "\/go\/lolly\/site"/);
  assert.match(src, /18\+/);
  for (const l of ["fr", "en", "es", "pt"]) assert.match(src, new RegExp("\\n    " + l + ": \\{"));
  assert.match(src, /Les marchés que les autres n’ont pas/);
  assert.match(src, /Découvrir Lolly Bet/);
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  const textes = src.slice(src.indexOf("var TEXTES"), src.indexOf("function langue"));
  assert.doesNotMatch(textes.toLowerCase(), /garanti|streaming|sécuris|risques|gagne/);
});

test("une fois par jour, mesure vu / clic / ferme acceptee par la base", () => {
  assert.match(src, /localStorage\.getItem\(CLE\) === jour\(\)/);
  for (const e of ["lolly_panneau_vu", "lolly_panneau_clic", "lolly_panneau_ferme"]) {
    assert.match(src, new RegExp('"' + e + '"'));
    assert.match(migration, new RegExp("'" + e + "'"));
  }
});
