"use strict";
// Performance du site publie (audit du 15/09/2026, Moto G4 simule : LCP 10 s,
// CLS 0,68 sur les pages match). Verifie le site CONSTRUIT par
// scripts/build-public.js (repertoire temporaire) et les sources publiques.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { ROOT, buildSite } = require("./helpers/built-site.js");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let site;
before(() => { site = buildSite(); });
after(() => { if (site) site.cleanup(); });
const read = (rel) => fs.readFileSync(path.join(site.dir, rel), "utf8");
// Premiere page match ACTIVE : une page conservee (match sorti du run,
// scripts/match-lifecycle.js, class="match-archived") n'a pas la coquille match-shell.
const firstFile = (dir) => fs.readdirSync(path.join(site.dir, dir)).filter((f) => f.endsWith(".html")).sort()
  .filter((f) => !/class="match-archived"/.test(fs.readFileSync(path.join(site.dir, dir, f), "utf8")))[0];

test("supabase-js : version exacte et defer sur toutes les pages sources qui le chargent", () => {
  const pages = ["match.html", "index.html", "abonnement.html", "compte.html", "connexion.html", "inscription.html",
    "mot-de-passe-oublie.html", "reinitialiser-mot-de-passe.html", "pro.html", "joueur.html", "checkout-succes.html",
    "admin.html", "gb/landing.html", "za/landing.html", "mx/landing.html"];
  for (const p of pages) {
    const tags = src(p).match(/<script\b[^>]*supabase-js[^>]*>/g) || [];
    assert.equal(tags.length, 1, p + " : une balise supabase-js");
    assert.match(tags[0], /supabase-js@\d+\.\d+\.\d+\/dist\/umd\/supabase\.min\.js" defer>/, p + " : version exacte + defer");
    // app-client.js cree le client a l'execution : il suit supabase-js en defer.
    if (/app-client\.js/.test(src(p))) assert.match(src(p), /<script src="\/app-client\.js" defer><\/script>/, p);
    // Aucun montage synchrone de l'en-tete de connexion avant supabase-js.
    assert.doesNotMatch(src(p), /<script>IasharkAuthHeader\.mount\(/, p + " : montage a DOMContentLoaded");
  }
  assert.match(src("site-header.js"), /supabase-js@\d+\.\d+\.\d+\/dist/);
  for (const p of ["connexion.html", "inscription.html", "mot-de-passe-oublie.html", "reinitialiser-mot-de-passe.html"]) {
    // Formulaire visible avant auth-pages.js : jamais d'envoi natif (GET avec le mot de passe dans l'URL).
    assert.match(src(p), /<form id="[a-z]+" onsubmit="event\.preventDefault\(\)"/, p);
  }
});

test("front public : aucun repli sur /data.json (~25 Mo)", () => {
  for (const f of ["match-page.js", "player-page.js", "tools-page.js", "index.html", "marches.html"]) {
    assert.doesNotMatch(src(f), /fetch\(\s*'\/data\.json'/, f);
  }
});

test("site construit : preload du dictionnaire de la version, meme mode que fetch()", () => {
  const cases = { "fr/index.html": "fr", "en/abonnement.html": "en", "gb/compte.html": "en", "mx/abonnement.html": "es-mx",
    ["en/match/" + firstFile("en/match")]: "en", ["match/" + firstFile("match")]: "fr" };
  for (const [page, locale] of Object.entries(cases)) {
    const html = read(page);
    const head = html.split("</head>")[0];
    const links = head.match(/<link rel="preload"[^>]*\/i18n\/dict\/[^>]*>/g) || [];
    assert.deepEqual(links, ['<link rel="preload" href="/i18n/dict/' + locale + '.json" as="fetch" crossorigin>'], page);
  }
  // i18n.js lit le dictionnaire par un fetch() simple (cors, credentials same-origin) :
  // un preload crossorigin="anonymous" est reutilise tel quel.
  assert.match(src("i18n/i18n.js"), /fetch\("\/i18n\/dict\/" \+ locale \+ "\.json"\)/);
  assert.doesNotMatch(read("admin.html"), /rel="preload"/, "page sans i18n : aucun preload inutile");
});

test("site construit : empreinte ?v= sur les JS/CSS/images locaux et cache long dans _headers", () => {
  const page = read("en/match/" + firstFile("en/match"));
  const locals = [...page.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="(\/[^"]+\.(?:js|css))(\?[^"]*)?"/g)];
  assert.ok(locals.length > 10);
  for (const m of locals) assert.match(m[2] || "", /^\?v=[0-9a-f]{10}$/, m[1] + " sans empreinte");
  assert.match(page, /<picture style="display:contents"><source srcset="\/assets\/iashark-logo\.webp\?v=[0-9a-f]{10}" type="image\/webp"><img src="\/assets\/iashark-logo\.png\?v=[0-9a-f]{10}" alt="IASHARK" width="1648" height="440"><\/picture>/);
  assert.match(read("site-header.js"), /loadScript\('\/i18n\/i18n\.js\?v=[0-9a-f]{10}'\)/, "references JS dynamiques versionnees");
  const headers = read("_headers");
  assert.match(headers, /\n\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable\n/);
  assert.match(headers, /\n\/app-client\.js\n  Cache-Control: public, max-age=31536000, immutable\n/);
  assert.match(headers, /\n\/i18n\/dict\/\*\n  X-Robots-Tag: noindex\n  Cache-Control: public, max-age=300, stale-while-revalidate=86400\n/);
  // Jamais de Cache-Control global (Netlify fusionnerait les valeurs) ni sur HTML/JSON de donnees.
  const globalBlock = headers.split(/\n(?=\S)/)[0];
  assert.doesNotMatch(globalBlock, /Cache-Control/);
  assert.doesNotMatch(headers, /\n\/(data-home|data)\.json\n(  [^\n]*\n)*  Cache-Control/);
  // La CSP autorise toujours supabase-js (jsdelivr) et les logos (api-sports).
  assert.match(globalBlock, /script-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.match(globalBlock, /img-src[^;]*https:\/\/media\.api-sports\.io/);
});

test("site construit : pages match sans decalage (resume statique garde, place reservee)", () => {
  const page = read("en/match/" + firstFile("en/match"));
  assert.match(page, /<main class="match-shell"><div[^>]*><h1\b/, "resume statique (h1) present");
  assert.match(page, /<link rel="preconnect" href="https:\/\/media\.api-sports\.io">/);
  // tailwind.css (importee par match-page.css) precharge des le <head>.
  assert.match(page, /<link rel="preload" href="\/assets\/tailwind\.css\?v=[0-9a-f]{10}" as="style">/);
  assert.match(src("assets/match-page.css"), /#matchRoot>\.loading-card\{min-height:830px/);
});
