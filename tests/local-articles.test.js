"use strict";
// Articles locaux evergreen (gb, za, mx, fr, es) generes par
// scripts/build-local-articles.js depuis content/local-articles/.
// Verrouille : fichiers generes a jour, titles uniques, canonical .html
// auto-referent, aucun hreflang (aucun equivalent reel entre versions),
// JSON-LD Article + BreadcrumbList, 900-1500 mots, aucun lien interne casse
// ni sortie de version, pas de texte francais hors /fr/, jeu responsable du
// pays, aucun prix ni promesse ni operateur recommande, hub noindex tant
// qu'il a moins de 3 articles, sitemap-articles.xml = URLs indexables.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const B = require("../scripts/build-local-articles.js");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://iashark.com";
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIRS = MARKETS._dirs;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const manifests = B.loadManifests();

const pages = [];
manifests.forEach((m) => {
  m.articles.forEach((a) => pages.push({ m, a, rel: B.articlePath(m, a).slice(1) }));
  pages.push({ m, a: null, rel: B.hubPath(m).slice(1) + "index.html" });
});
const headOf = (html) => html.split(/<\/head>/i)[0];
function visibleText(html) {
  const body = html.split(/<body[^>]*>/i)[1] || "";
  return body.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ");
}
function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => JSON.parse(x[1]));
}

test("manifestes : versions gb, za, mx, fr, es, au moins 3 articles chacune, slugs uniques", () => {
  const dirs = manifests.map((m) => m.dir).sort();
  assert.deepEqual(dirs, ["es", "fr", "gb", "mx", "za"]);
  manifests.forEach((m) => {
    assert.ok(DIRS[m.dir], m.dir + " absent de config/markets.json#_dirs");
    assert.equal(m.htmlLang, DIRS[m.dir].htmlLang, m.dir + " htmlLang");
    assert.ok(m.articles.length >= B.MIN_INDEXABLE, m.dir + " : moins de 3 articles");
    const slugs = m.articles.map((a) => a.slug);
    assert.equal(new Set(slugs).size, slugs.length, m.dir + " : slug en double");
    m.articles.forEach((a) => {
      assert.match(a.slug, /^[a-z0-9-]+$/, a.slug);
      assert.match(a.datePublished, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(a.dateModified, /^\d{4}-\d{2}-\d{2}$/);
      (a.sources || []).forEach((s) => assert.match(s.url, /^https:\/\//, a.slug + " source"));
    });
  });
});

test("fichiers generes a jour (node scripts/build-local-articles.js)", () => {
  const outputs = B.buildOutputs();
  for (const [rel, content] of Object.entries(outputs)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + " non genere");
    assert.equal(read(rel), content, rel + " perime : relancer node scripts/build-local-articles.js");
  }
});

test("title uniques (entre articles, hubs et guides de blog existants)", () => {
  const mine = pages.map((p) => headOf(read(p.rel)).match(/<title>([^<]*)<\/title>/)[1]);
  assert.equal(new Set(mine).size, mine.length, "title en double parmi les articles locaux");
  const guides = [];
  ["blog/guides", "en/blog/guides", "es/blog/guides", "mx/blog/guides"].forEach((d) => {
    fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".html")).forEach((f) => {
      const t = headOf(read(d + "/" + f)).match(/<title>([^<]*)<\/title>/);
      if (t) guides.push(t[1]);
    });
  });
  mine.forEach((t) => assert.ok(!guides.includes(t), "title deja utilise par un guide : " + t));
});

test("canonical auto-referent (.html pour les articles), lang, robots, un seul h1, aucun hreflang", () => {
  pages.forEach(({ m, a, rel }) => {
    const html = read(rel), head = headOf(html);
    const expected = a ? SITE + B.articlePath(m, a) : SITE + B.hubPath(m);
    if (a) assert.match(expected, /\.html$/);
    assert.ok(head.includes('<link rel="canonical" href="' + expected + '">'), rel + " canonical");
    assert.equal((head.match(/rel="canonical"/g) || []).length, 1, rel + " canonical multiple");
    assert.ok(html.includes('<html lang="' + DIRS[m.dir].htmlLang + '">'), rel + " lang");
    assert.doesNotMatch(head, /hreflang=/, rel + " : hreflang sans equivalent reel");
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, rel + " h1");
    const noindex = /<meta name="robots" content="noindex/.test(head);
    assert.equal(noindex, a ? false : !B.indexable(m), rel + " robots");
    assert.match(html, /\/assets\/bottom-navigation\.css/, rel);
    assert.match(html, /\/bottom-navigation\.js/, rel);
  });
});

test("JSON-LD : Article + BreadcrumbList valides sur chaque article", () => {
  pages.filter((p) => p.a).forEach(({ m, a, rel }) => {
    const blocks = ldBlocks(read(rel));
    const art = blocks.find((b) => b["@type"] === "Article");
    const bc = blocks.find((b) => b["@type"] === "BreadcrumbList");
    assert.ok(art && bc, rel + " : Article ou BreadcrumbList manquant");
    assert.equal(art.mainEntityOfPage["@id"], SITE + B.articlePath(m, a));
    assert.equal(art.inLanguage, DIRS[m.dir].htmlLang);
    assert.equal(art.author["@type"], "Organization");
    assert.equal(art.datePublished, a.datePublished);
    assert.equal(bc.itemListElement.length, 3);
    assert.equal(bc.itemListElement[2].item, SITE + B.articlePath(m, a));
  });
  pages.filter((p) => !p.a).forEach(({ rel }) => {
    const types = ldBlocks(read(rel)).map((b) => b["@type"]);
    assert.ok(types.includes("CollectionPage") && types.includes("BreadcrumbList"), rel);
  });
});

test("longueur : 900 a 1500 mots par article", () => {
  manifests.forEach((m) => m.articles.forEach((a) => {
    const n = B.wordCount(a.bodyHtml);
    assert.ok(n >= 900 && n <= 1500, m.dir + "/" + a.slug + " : " + n + " mots");
  }));
});

test("liens internes : aucun lien casse, aucune ancre manquante, jamais hors de la version", () => {
  const LANG_DIR = /^\/(fr|en|es|de|it|pt|gb|za|mx)\//;
  pages.forEach(({ m, rel }) => {
    const html = read(rel);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
    for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|tel:)/.test(raw)) continue;
      if (raw.startsWith("#")) { assert.ok(ids.has(raw.slice(1)), rel + " : ancre manquante " + raw); continue; }
      assert.ok(raw.startsWith("/"), rel + " : lien relatif " + raw);
      const p = raw.split(/[?#]/)[0];
      const file = p.endsWith("/") ? p.slice(1) + "index.html" : p.slice(1);
      assert.ok(fs.existsSync(path.join(ROOT, file)), rel + " : lien casse " + raw);
      if (!/\.html$|\/$/.test(p)) continue; // ressources partagees (css, js, favicon)
      const blogDir = DIRS[m.dir].blogDir;
      const other = p.match(LANG_DIR);
      if (other && other[1] !== m.dir) {
        assert.ok(blogDir && p.indexOf("/" + blogDir + "/blog/") === 0, rel + " : lien vers une autre version " + raw);
      } else if (!other) {
        assert.ok(!blogDir && /^\/blog(\.html|\/)/.test(p), rel + " : lien racine hors blog FR " + raw);
      }
    }
  });
});

test("aucun texte francais dans une version non francaise", () => {
  const FR = /(?:^|[\s(«"'’])(avec|dans|pour|sont|être|très|leur|cette|aussi|parce|depuis|nous|vous|joueurs|équipe|saison|championnat|règlement|accueil|mineurs|lecture|cotes?)(?=[\s.,;:!?)»"']|$)/gi;
  pages.filter((p) => p.m.dir !== "fr").forEach(({ rel }) => {
    const found = [...visibleText(read(rel)).matchAll(FR)].map((x) => x[1]);
    assert.deepEqual(found, [], rel + " : texte francais " + found.join(", "));
  });
});

test("jeu responsable adapte au pays sur chaque page (18+ et ressource locale)", () => {
  const rules = {
    // Ligne nationale geree par GamCare (config/markets.json#gb.helpline, 19/09/2026).
    gb: [/GamCare/, /gamcare\.org\.uk/, /0808 8020 133/, /18\+|aged 18/],
    za: [/National Responsible Gambling Programme/, /0800 006 008/, /18\+/],
    mx: [/800 911 2000/, /mayores de 18/],
    fr: [/ANJ|Autorité nationale des jeux/, /09 74 75 13 13/, /mineurs/],
    es: [/gamblingtherapy\.org/, /mayores de 18/]
  };
  pages.forEach(({ m, rel }) => {
    const text = read(rel);
    (rules[m.dir] || []).forEach((re) => assert.match(text, re, rel + " : " + re));
    if (m.dir !== "fr") assert.doesNotMatch(text, /Joueurs Info Service|09 74 75 13 13|\bANJ\b/, rel + " : aide francaise hors /fr/");
  });
});

test("aucun prix, aucune promesse de gain, aucun operateur recommande", () => {
  const OPERATORS = /\b(bet365|winamax|betclic|unibet|caliente|codere|hollywoodbets|supabets|sportingbet|william hill|paddy power|sky bet|betfair|ladbrokes|coral|pinnacle|1xbet|bwin|pmu|parions ?sport|stake\.com|rushbet|wplay|te apuesto)\b/i;
  pages.forEach(({ m, rel }) => {
    const text = visibleText(read(rel));
    assert.doesNotMatch(text, /[£€$]\s?\d|\d\s?(€|£)|\bR\s?\d{2,}\b|MX\$|\bMXN\b|\bGBP\b|\bZAR\b|\bEUR\b/, rel + " : prix ecrit");
    assert.doesNotMatch(text, OPERATORS, rel + " : operateur nomme");
    assert.doesNotMatch(text.replace(/Betway Premiership/g, ""), /Betway/i, rel + " : Betway hors nom du championnat");
    assert.doesNotMatch(text.replace(/Liga BetPlay/g, ""), /BetPlay/i, rel + " : BetPlay hors nom du championnat");
    assert.doesNotMatch(text, /guaranteed (win|profit)|sure bet|risk[- ]free|gains? (assurés|garantis)|pari sûr|ganancias? (seguras|garantizadas)|apuesta segura|apuesta (ahora|ya)\b|pariez maintenant|bet now/i, rel + " : promesse ou incitation");
    if (m.dir === "mx") assert.doesNotMatch(text, /cuota/i, rel + " : 'cuota' au lieu de 'momio'");
  });
});

test("hubs : noindex tant que < 3 articles ; sitemap-articles.xml = URLs indexables existantes", () => {
  const xml = read(B.SITEMAP_FILE);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  assert.equal(new Set(locs).size, locs.length, "loc en double");
  const expected = [];
  manifests.forEach((m) => {
    if (!B.indexable(m)) return;
    expected.push(SITE + B.hubPath(m));
    m.articles.forEach((a) => expected.push(SITE + B.articlePath(m, a)));
  });
  assert.deepEqual(locs.slice().sort(), expected.sort());
  locs.forEach((loc) => {
    const rel = loc.slice(SITE.length + 1).replace(/\/$/, "/index.html");
    assert.doesNotMatch(headOf(read(rel)), /noindex/, loc + " noindex dans le sitemap");
  });
  // Simulation : une version a 2 articles garde un hub noindex, hors sitemap.
  const small = JSON.parse(JSON.stringify(manifests.find((m) => m.dir === "gb")));
  small.articles = small.articles.slice(0, 2);
  small.blogHub = null;
  const out = B.buildOutputs([small]);
  assert.match(out["gb/articles/index.html"], /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(out[B.SITEMAP_FILE], /<loc>/);
});

test("hubs blog existants : bloc LOCAL_ARTICLES liste tous les articles de la version", () => {
  manifests.filter((m) => m.blogHub).forEach((m) => {
    const html = read(m.blogHub.file);
    const i = html.indexOf(B.MARK_OPEN), j = html.indexOf(B.MARK_CLOSE);
    assert.ok(i > -1 && j > i, m.blogHub.file + " : bloc absent");
    const block = html.slice(i, j);
    m.articles.forEach((a) => assert.ok(block.includes('href="' + B.articlePath(m, a) + '"'), m.blogHub.file + " : " + a.slug));
    assert.doesNotMatch(block, /abonnement\.html|S'abonner|<img/, m.blogHub.file + " : le bloc blog ne pousse pas vers le paiement");
    assert.equal(html.split(B.MARK_OPEN).length, 2, m.blogHub.file + " : bloc insere deux fois");
  });
});

test("pages publiees par build-public (repertoires de version copies)", () => {
  const src = read("scripts/build-public.js");
  manifests.forEach((m) => assert.match(src, new RegExp('"' + m.dir + '"'), m.dir + " absent de PUBLIC_DIRS"));
});
