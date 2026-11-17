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
  assert.match(src, /1 mois d’IASHARK Pro offert/);
  assert.match(src, /Obtenir mon mois Pro offert/);
  assert.match(src, /On vérifie/);
  assert.match(src, /lolly\.html/);
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  const textes = src.slice(src.indexOf("var TEXTES"), src.indexOf("function langue"));
  assert.doesNotMatch(textes.toLowerCase(), /garanti|streaming|sécuris|risques|gagne/);
});

test("volet : jamais pour un compte Pro ni avec une demande Pro offert, e-mail masque", () => {
  assert.match(src, /ctx\.isPro \|\| ctx\.isAdmin/);
  assert.match(src, /from\("pro_offert_demandes"\)/);
  assert.match(src, /r\.data\.length\) return null/);
  assert.match(src, /\\u2022\\u2022\\u2022/);
});

test("une fois par jour, mesure vu / clic / ferme acceptee par la base", () => {
  assert.match(src, /localStorage\.getItem\(CLE\) === jour\(\)/);
  for (const e of ["lolly_panneau_vu", "lolly_panneau_clic", "lolly_panneau_ferme"]) {
    assert.match(src, new RegExp('"' + e + '"'));
    assert.match(migration, new RegExp("'" + e + "'"));
  }
});

// Version 2 (15/11 soir) : Clement ne voyait pas le panneau (cle du jour posee des
// l'affichage) ; design repris du composant 21st.dev « Newsletter Dialog ».
test("v2 : cle du jour posee seulement a la fermeture ou au clic, ?lolly=1 force l'ouverture", () => {
  const ouvrir = src.slice(src.indexOf("function ouvrir()"), src.indexOf("// 2) Volet"));
  assert.doesNotMatch(ouvrir, /localStorage\.setItem/);
  assert.match(src, /function marquer\(\) \{ try \{ localStorage\.setItem\(CLE, jour\(\)\)/);
  assert.match(ouvrir, /var fermer = function \(how\) \{\n\s+marquer\(\);/);
  assert.match(ouvrir, /a\.addEventListener\("click", function \(\) \{\n\s+marquer\(\);/);
  assert.match(src, /var FORCE = \/\[\?&\]lolly=1\(&\|\$\)\/\.test\(location\.search\)/);
  assert.match(ouvrir, /if \(!FORCE\) \{/);
  // 17/11/2026 : le panneau ne s'ouvre plus pour un visiteur sans compte.
  assert.match(ouvrir, /if \(!FORCE && !inscrit\(\)\) return false;/);
  assert.doesNotMatch(src + prefs, /__iasharkLollyArrivee/);
});

test("v2 : titre en Anton, trois avantages au plus dans chaque langue", () => {
  assert.match(src, /\.lp-titre\{[^}]*font-family:Anton/);
  assert.match(src, /family=Anton/);
  assert.match(src, /Newsletter Dialog/);
  const textes = src.slice(src.indexOf("var TEXTES"), src.indexOf("function langue"));
  const points = textes.match(/points: \[[^\]]*\]/g);
  assert.strictEqual(points.length, 4);
  for (const p of points) assert.ok(p.split('", "').length <= 3, p);
});
