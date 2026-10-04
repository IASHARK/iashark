// Chaque classe ecrite dans les pages doit exister dans une feuille de style chargee par la page
// (controle UX du 04/10/2026, tour 2 : max-w-[600px] et grid-cols-3 avaient ete ajoutees a
// l'accueil sans que assets/tailwind.css soit reconstruit ; le bloc de paiement s'etalait sur
// 1 376 px et les chiffres « Ce que le moteur a deja traite » s'empilaient).
//
// Regle : une classe de la page est definie soit dans assets/tailwind.css (compile), soit dans le
// <style> de la page, soit dans une feuille /assets/*.css liee par la page. Seules exceptions :
// les crochets JavaScript connus (HOOKS), qui ne portent aucun style.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");

// Selecteurs de classe d'une feuille (echappements CSS decodes : « \[ », « \2c  », « \: »).
function classesDefinies(css) {
  const out = new Set();
  css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/([^{}]+)\{/g, (m, sel) => {
    sel.split(",").forEach((x) => {
      const r = x.match(/\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[A-Za-z0-9_-])+)/g);
      if (r) r.forEach((c) => out.add(c.slice(1).replace(/\\([0-9a-fA-F]{1,6}) ?/g, (z, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, "$1")));
    });
    return m;
  });
  return out;
}
function classesUtilisees(html) {
  const out = new Set();
  html.replace(/class="([^"]*)"/g, (m, c) => { c.split(/\s+/).filter(Boolean).forEach((x) => { if (!/[${}+'<>]/.test(x)) out.add(x); }); return m; });
  return out;
}
// Crochets JavaScript (aucun style attendu) : lus par home-list.js, lib/offre-pro.js, les pages.
const HOOKS = new Set(["league-badge-img", "op--vitrine", "feature-gate", "seo-foot-nav", "active"]);
const TAILWIND = classesDefinies(lire("assets/tailwind.css"));

const LANGUES = ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"];
const PAGES = ["index.html", "abonnement.html", "match.html", "compte.html", "inscription.html", "connexion.html", "mot-de-passe-oublie.html", "reinitialiser-mot-de-passe.html"];

for (const page of PAGES) {
  test("classes CSS definies : " + page + " et ses copies traduites", () => {
    for (const l of LANGUES) {
      const p = l + page;
      if (!fs.existsSync(path.join(RACINE, p))) continue;
      const html = lire(p);
      let autres = "";
      html.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (m, c) => { autres += c; return m; });
      html.replace(/<link[^>]+href="\/?(assets\/[^"?#]+\.css)/g, (m, f) => { if (!/tailwind/.test(f) && fs.existsSync(path.join(RACINE, f))) autres += lire(f); return m; });
      const definies = classesDefinies(autres);
      // « lucide », « lucide-eye »... : marqueurs des icones Lucide (aucun style attendu).
      const manquantes = [...classesUtilisees(html)].filter((c) => !TAILWIND.has(c) && !definies.has(c) && !HOOKS.has(c) && !/^lucide(-[a-z0-9-]+)?$/.test(c));
      assert.deepEqual(manquantes, [], p + " : classes sans style (Tailwind non compile ?) : " + manquantes.join(" "));
    }
  });
}

test("accueil : bloc de paiement limite a 600 px, chiffres sur 3 colonnes (regles du <style>)", () => {
  for (const l of LANGUES) {
    const html = lire(l + "index.html");
    assert.match(html, /\.kpi-3\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/, l + "index.html");
    assert.match(html, /\.acces-in\{max-width:600px\}/, l + "index.html");
    assert.match(html, /<section id="acces"[^>]*>[\s\S]{0,400}class="acces-in /, l + "index.html");
    assert.doesNotMatch(html, /max-w-\[600px\]|\bgrid-cols-3 divide/, l + "index.html");
  }
});
