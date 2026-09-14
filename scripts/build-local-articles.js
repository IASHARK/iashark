#!/usr/bin/env node
"use strict";
// Articles locaux "evergreen" par version (gb, za, mx, fr, es).
//
// Source unique : content/local-articles/<dir>.json (manifeste de la version)
// + content/local-articles/<dir>/<slug>.htm (corps de chaque article, sans
// en-tete ni pied de page). Ce script genere, a partir du manifeste :
//   <dir>/<folder>/<slug>.html   page article (gabarit des guides : article.css)
//   <dir>/<folder>/index.html    hub de la version (noindex tant que < 3 articles)
//   bloc <!--LOCAL_ARTICLES-->   dans le hub blog existant de la version
//                                (blog.html pour fr, mx/blog/, es/blog/)
//   sitemap-articles.xml         URLs indexables uniquement
//
// Regles tenues ici (et verrouillees par tests/local-articles.test.js) :
// - aucun hreflang : aucun article n'a d'equivalent reel dans une autre version ;
// - canonical .html auto-referent ; JSON-LD Article + BreadcrumbList ;
// - aucun prix ecrit (les prix vivent dans config/markets.json) ;
// - mention jeu responsable propre au pays, fournie par le manifeste.
//
// Usage : node scripts/build-local-articles.js [--check]
//   --check : n'ecrit rien, sort en erreur si un fichier genere est perime.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "content", "local-articles");
const SITE = "https://iashark.com";
const SITEMAP_FILE = "sitemap-articles.xml";
const MIN_INDEXABLE = 3;
const WORDS_PER_MINUTE = 200;
const MARK_OPEN = "<!--LOCAL_ARTICLES-->";
const MARK_CLOSE = "<!--/LOCAL_ARTICLES-->";

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function ld(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>";
}

function loadManifests() {
  if (!fs.existsSync(SRC)) return [];
  return fs.readdirSync(SRC).filter(function (f) { return /^[a-z]{2}\.json$/.test(f); }).sort().map(function (f) {
    var m = JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
    if (m.dir + ".json" !== f) throw new Error(f + " : dir '" + m.dir + "' ne correspond pas au nom du fichier");
    m.articles.forEach(function (a) {
      // .htm (et non .html) : un fragment n'est pas une page publique ; les
      // tests qui parcourent toutes les pages .html du depot l'ignorent ainsi.
      a.bodyHtml = fs.readFileSync(path.join(SRC, m.dir, a.slug + ".htm"), "utf8").trim();
    });
    return m;
  });
}

// Texte lisible du corps (sans balises), pour le compte de mots.
function bodyText(html) {
  return html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ");
}
function wordCount(html) {
  return bodyText(html).split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length;
}
function readingMinutes(html) {
  return Math.max(1, Math.round(wordCount(html) / WORDS_PER_MINUTE));
}

function toc(html) {
  var out = [], re = /<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g, m;
  while ((m = re.exec(html))) out.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() });
  return out;
}

function formatDate(iso, intlLocale) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString(intlLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function hubPath(m) { return "/" + m.dir + "/" + m.folder + "/"; }
function articlePath(m, a) { return hubPath(m) + a.slug + ".html"; }
function indexable(m) { return m.articles.length >= MIN_INDEXABLE; }

function head(m, o) {
  var L = m.labels;
  return [
    "<!DOCTYPE html>",
    '<html lang="' + m.htmlLang + '">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>" + esc(o.title) + "</title>",
    '<meta name="description" content="' + esc(o.description) + '">',
    '<meta name="robots" content="' + (o.noindex ? "noindex, follow" : "index, follow, max-image-preview:large") + '">',
    '<link rel="canonical" href="' + SITE + o.path + '">',
    '<meta property="og:title" content="' + esc(o.ogTitle || o.title) + '">',
    '<meta property="og:description" content="' + esc(o.description) + '">',
    '<meta property="og:type" content="' + (o.article ? "article" : "website") + '">',
    '<meta property="og:url" content="' + SITE + o.path + '">',
    '<meta property="og:image" content="' + SITE + '/icon-512.png">',
    '<meta property="og:locale" content="' + m.ogLocale + '">',
    '<meta property="og:site_name" content="IASHARK">',
    o.article ? '<meta property="article:published_time" content="' + o.article.datePublished + '">' : null,
    o.article ? '<meta property="article:modified_time" content="' + o.article.dateModified + '">' : null,
    '<meta name="twitter:card" content="summary">',
    '<link rel="icon" href="/favicon.ico">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">',
    '<link rel="stylesheet" href="/assets/article.css">',
    '<link rel="stylesheet" href="/assets/bottom-navigation.css">',
    o.jsonld.map(ld).join("\n"),
    "<style>.art-list{list-style:none;padding:0;margin:0}.art-list li{border-bottom:1px solid var(--line);padding:18px 0}.art-list h3{margin:0 0 6px}.art-list p{margin:0 0 6px}.art-list .when{color:var(--muted);font-size:13px}.sources{font-size:13px;color:var(--soft)}.sources li{margin:4px 0;word-break:break-word}</style>",
    "</head>"
  ].filter(function (x) { return x != null; }).join("\n");
}

function footer(m) {
  return '<footer class="art-foot">\n' + m.footerHtml + "\n</footer>";
}

var SCRIPTS = '<script src="/site-header.js"></script>\n<script src="/site-prefs.js"></script>\n<script src="/bottom-navigation.js"></script>';

function breadcrumb(m, last) {
  var items = [
    { "@type": "ListItem", position: 1, name: m.labels.home, item: SITE + "/" + m.dir + "/" },
    { "@type": "ListItem", position: 2, name: m.labels.hub, item: SITE + hubPath(m) }
  ];
  if (last) items.push({ "@type": "ListItem", position: 3, name: last.name, item: SITE + last.path });
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
}

function renderArticle(m, a) {
  var L = m.labels, p = articlePath(m, a), minutes = readingMinutes(a.bodyHtml);
  var article = {
    "@context": "https://schema.org", "@type": "Article",
    headline: a.h1Text || a.title, description: a.description,
    image: SITE + "/icon-512.png",
    datePublished: a.datePublished, dateModified: a.dateModified,
    author: { "@type": "Organization", name: "IASHARK", url: SITE + "/" },
    publisher: { "@type": "Organization", name: "IASHARK", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/icon-512.png", width: 512, height: 512 } },
    mainEntityOfPage: { "@type": "WebPage", "@id": SITE + p },
    inLanguage: m.htmlLang, timeRequired: "PT" + minutes + "M", wordCount: wordCount(a.bodyHtml)
  };
  var t = toc(a.bodyHtml);
  var related = (a.related || []).map(function (r) {
    return '<li style="margin:6px 0"><a href="' + esc(r.href) + '">' + esc(r.label) + "</a></li>";
  }).join("");
  var sources = (a.sources || []).map(function (s) {
    return '<li><a href="' + esc(s.url) + '" rel="noopener nofollow">' + esc(s.label) + "</a></li>";
  }).join("");
  return [
    head(m, { title: a.title + " | IASHARK", ogTitle: a.title, description: a.description, path: p, article: a, jsonld: [article, breadcrumb(m, { name: a.crumb, path: p })] }),
    "<body>",
    "",
    '<div class="wrap">',
    "",
    '<header class="art-hero">',
    '  <nav class="crumb" aria-label="' + esc(L.breadcrumbAria) + '"><a href="/' + m.dir + '/">' + esc(L.home) + '</a> › <a href="' + hubPath(m) + '">' + esc(L.hub) + "</a> › " + esc(a.crumb) + "</nav>",
    '  <span class="tag">' + esc(a.tag) + "</span>",
    "  <h1>" + a.h1 + "</h1>",
    '  <p class="chapo">' + a.chapo + "</p>",
    '  <div class="meta">',
    '    <span>' + esc(L.published) + ' <time datetime="' + a.datePublished + '">' + esc(formatDate(a.datePublished, m.intlLocale)) + "</time></span>",
    "    <span>·</span>",
    "    <span>" + minutes + " " + esc(L.minRead) + "</span>",
    "  </div>",
    "</header>",
    "",
    '<nav class="toc" aria-label="' + esc(L.toc) + '">',
    "  <h2>" + esc(L.toc) + "</h2>",
    "  <ol>",
    t.map(function (h) { return '    <li><a href="#' + h.id + '">' + h.text + "</a></li>"; }).join("\n"),
    "  </ol>",
    "</nav>",
    "",
    '<main class="body">',
    "",
    a.bodyHtml,
    "",
    '<div class="box warn">',
    '  <div class="box-t">' + esc(L.rgTitle) + "</div>",
    "  <p>" + m.responsibleHtml + "</p>",
    "</div>",
    "",
    '<div class="cta">',
    "  <h2>" + esc(m.cta.title) + "</h2>",
    "  <p>" + esc(m.cta.text) + "</p>",
    '  <a class="btn" href="' + esc(m.cta.href) + '">' + esc(m.cta.label) + "</a>",
    "</div>",
    "",
    "</main>",
    "",
    sources ? '<section class="sources" aria-labelledby="sources-title" style="margin:32px 0"><h2 id="sources-title" style="font-size:16px;margin:0 0 8px">' + esc(L.sources) + '</h2><p style="margin:0 0 6px">' + esc(L.sourcesNote) + '</p><ul style="padding-left:18px;margin:0">' + sources + "</ul></section>" : "",
    related ? '<nav aria-labelledby="related-title" style="margin:32px 0"><h2 id="related-title" style="font-size:18px;margin:0 0 8px">' + esc(L.related) + '</h2><ul style="list-style:none;padding:0;margin:0">' + related + "</ul></nav>" : "",
    footer(m),
    "",
    "</div>",
    "",
    SCRIPTS,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function sortedArticles(m) {
  return m.articles.slice().sort(function (x, y) {
    return x.datePublished < y.datePublished ? 1 : x.datePublished > y.datePublished ? -1 : m.articles.indexOf(x) - m.articles.indexOf(y);
  });
}

function renderHub(m) {
  var L = m.labels, p = hubPath(m), noindex = !indexable(m), list = sortedArticles(m);
  var collection = {
    "@context": "https://schema.org", "@type": "CollectionPage", "@id": SITE + p + "#webpage", url: SITE + p,
    name: L.hubTitle, description: L.hubDescription, inLanguage: m.htmlLang,
    mainEntity: { "@type": "ItemList", itemListElement: list.map(function (a, i) { return { "@type": "ListItem", position: i + 1, url: SITE + articlePath(m, a), name: a.title }; }) }
  };
  var items = list.map(function (a) {
    return '  <li><h3><a href="' + articlePath(m, a) + '">' + esc(a.title) + "</a></h3><p>" + esc(a.description) + '</p><p class="when"><time datetime="' + a.datePublished + '">' + esc(formatDate(a.datePublished, m.intlLocale)) + "</time> · " + readingMinutes(a.bodyHtml) + " " + esc(L.minRead) + "</p></li>";
  }).join("\n");
  var bc = breadcrumb(m, null);
  return [
    head(m, { title: L.hubTitle + " | IASHARK", ogTitle: L.hubTitle, description: L.hubDescription, path: p, noindex: noindex, jsonld: [collection, bc] }),
    "<body>",
    "",
    '<div class="wrap">',
    "",
    '<header class="art-hero">',
    '  <nav class="crumb" aria-label="' + esc(L.breadcrumbAria) + '"><a href="/' + m.dir + '/">' + esc(L.home) + "</a> › " + esc(L.hub) + "</nav>",
    '  <span class="tag">' + esc(L.hubTag) + "</span>",
    "  <h1>" + esc(L.hubH1) + "</h1>",
    '  <p class="chapo">' + esc(L.hubIntro) + "</p>",
    "</header>",
    "",
    '<main class="body">',
    "<h2>" + esc(L.hubListTitle) + "</h2>",
    '<ul class="art-list">',
    items,
    "</ul>",
    "",
    '<div class="box warn">',
    '  <div class="box-t">' + esc(L.rgTitle) + "</div>",
    "  <p>" + m.responsibleHtml + "</p>",
    "</div>",
    "</main>",
    "",
    footer(m),
    "",
    "</div>",
    "",
    SCRIPTS,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

// Bloc insere dans le hub blog existant de la version (liens vers les articles
// uniquement : jamais de prix ni de lien d'abonnement sur un hub blog).
function renderBlogBlock(m) {
  var b = m.blogHub, L = m.labels;
  var items = sortedArticles(m).map(function (a) {
    return '<li style="margin:10px 0"><a href="' + articlePath(m, a) + '" style="color:#22d3ee;font-weight:600">' + esc(a.title) + '</a><br><span style="font-size:13.5px;opacity:.8">' + esc(a.description) + "</span></li>";
  }).join("");
  return MARK_OPEN + '<section aria-labelledby="local-articles-title" class="border-t border-hairline" style="margin:0 0 40px;padding-top:40px"><h2 id="local-articles-title" class="titre" style="font-size:30px;line-height:1.1;margin:0 0 6px">' + esc(b.title) + '</h2><p style="margin:0 0 10px;opacity:.8">' + esc(b.intro) + '</p><ul style="list-style:none;padding:0;margin:0">' + items + '</ul><p style="margin:12px 0 0"><a href="' + hubPath(m) + '" style="color:#22d3ee">' + esc(L.hubAll) + "</a></p></section>" + MARK_CLOSE;
}

function injectBlogBlock(html, m) {
  var block = renderBlogBlock(m);
  var i = html.indexOf(MARK_OPEN), j = html.indexOf(MARK_CLOSE);
  if (i !== -1 && j !== -1) return html.slice(0, i) + block + html.slice(j + MARK_CLOSE.length);
  var anchor = m.blogHub.insertBefore;
  var k = html.lastIndexOf(anchor);
  if (k === -1) throw new Error(m.blogHub.file + " : ancre '" + anchor + "' introuvable");
  return html.slice(0, k) + block + "\n" + html.slice(k);
}

function renderSitemap(manifests) {
  var urls = [];
  manifests.forEach(function (m) {
    if (!indexable(m)) return;
    var latest = m.articles.map(function (a) { return a.dateModified; }).sort().pop();
    urls.push("<url><loc>" + SITE + hubPath(m) + "</loc><lastmod>" + latest + "</lastmod></url>");
    m.articles.forEach(function (a) {
      urls.push("<url><loc>" + SITE + articlePath(m, a) + "</loc><lastmod>" + a.dateModified + "</lastmod></url>");
    });
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join("\n") + "\n</urlset>\n";
}

// { "gb/articles/x.html": "<!DOCTYPE html>...", ... }
function buildOutputs(manifests) {
  manifests = manifests || loadManifests();
  var out = {};
  manifests.forEach(function (m) {
    m.articles.forEach(function (a) { out[articlePath(m, a).slice(1)] = renderArticle(m, a); });
    out[hubPath(m).slice(1) + "index.html"] = renderHub(m);
    if (m.blogHub) {
      var current = fs.readFileSync(path.join(ROOT, m.blogHub.file), "utf8");
      out[m.blogHub.file] = injectBlogBlock(current, m);
    }
  });
  out[SITEMAP_FILE] = renderSitemap(manifests);
  return out;
}

module.exports = {
  loadManifests: loadManifests, buildOutputs: buildOutputs, wordCount: wordCount, readingMinutes: readingMinutes,
  bodyText: bodyText, hubPath: hubPath, articlePath: articlePath, indexable: indexable,
  MIN_INDEXABLE: MIN_INDEXABLE, SITEMAP_FILE: SITEMAP_FILE, MARK_OPEN: MARK_OPEN, MARK_CLOSE: MARK_CLOSE, SRC: SRC
};

if (require.main === module) {
  var check = process.argv.includes("--check");
  var outputs = buildOutputs();
  var stale = [];
  Object.keys(outputs).forEach(function (rel) {
    var abs = path.join(ROOT, rel);
    var cur = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    if (cur === outputs[rel]) return;
    stale.push(rel);
    if (!check) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, outputs[rel]); }
  });
  loadManifests().forEach(function (m) {
    m.articles.forEach(function (a) {
      var n = wordCount(a.bodyHtml);
      if (n < 900 || n > 1500) console.warn("  ! " + articlePath(m, a) + " : " + n + " mots (cible 900-1500)");
    });
  });
  if (check) {
    if (stale.length) { console.error("Fichiers perimes :\n  " + stale.join("\n  ")); process.exit(1); }
    console.log("Articles locaux a jour (" + Object.keys(outputs).length + " fichiers).");
  } else {
    console.log((stale.length ? "Ecrit :\n  " + stale.join("\n  ") : "Rien a ecrire.") + "\n" + Object.keys(outputs).length + " fichiers generes au total.");
    // Index sitemap.xml : reference sitemap-articles.xml (et tous les
    // sitemap-*.xml non vides presents), meme fonction que le pipeline.
    require("./i18n-sitemaps.js").writeSitemapIndex(ROOT, new Date().toISOString().slice(0, 10));
  }
}
