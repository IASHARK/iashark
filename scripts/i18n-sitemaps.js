#!/usr/bin/env node
"use strict";
// Sitemaps internationaux (MASTER SS19 - "sitemap international"). Un fichier
// par repertoire public : langues (fr en es de it pt) + marches pays (gb za mx,
// config/markets.json#_dirs). hreflang complet via xhtml:link sur chaque <url>.
//
// Contenu de chaque sitemap-<dir>-i18n.xml :
// 1. Les pages generees par scripts/build-locales.js (I18N_PAGES, meme source
//    que le build, via i18n-manifest.js), sauf celles marquees noSitemap:true
//    (pages noindex). hreflang : fr, en, es, de, it, pt, en-GB, en-ZA, es-MX +
//    x-default vers /fr/.
// 2. Les pages legales (config/markets.json#_legalFiles) presentes dans
//    legal/<dir>/ - exactement la regle du build, qui les recopie en
//    /<dir>/<fichier>.html. hreflang : les repertoires qui ont la page.
// 3. Les blogs : le blog FR racine (/blog.html, /blog/, /blog/guides/*.html)
//    dans le sitemap fr, /<langue>/blog/ dans le sitemap du repertoire qui le
//    possede (blogDir === repertoire : en, es, de, it, pt, mx). gb et za
//    renvoient vers /en/blog/ : aucune URL blog en double dans leurs sitemaps.
//    Une page blog n'y entre QUE si elle n'est pas noindex et si son canonical
//    est sa propre URL (/blog/guides/ et /<langue>/blog/guides/ ont pour
//    canonical l'accueil du blog : exclus). hreflang = ceux declares dans le
//    <head> de la page, limites aux cibles qui existent dans le depot.
//
// Module partage entre le pipeline (.github/workflows/update-data.yml, qui
// l'appelle apres chaque run reel avec I18N_LOCALES = i18n/locales.json) et
// cette CLI. La signature de generateLocalizedSitemaps est inchangee.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";
const LASTMOD = require("./seo-lastmod.js");
// x-default : config/markets.json#_hreflangXDefault (seo-common.js#xDefaultDir).
const SEO_COMMON = require("./seo-common.js");
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIRS = MARKETS._dirs;
const LEGAL_FILES = MARKETS._legalFiles || {};
const LEGAL_FILE_LIST = Object.keys(LEGAL_FILES).map(function (k) { return LEGAL_FILES[k]; });

// Repertoires couverts : langues de locales.json d'abord, puis les marches pays.
function sitemapDirs(locales) {
  var dirs = ((locales && locales.supported) || []).filter(function (d) { return DIRS.hasOwnProperty(d); });
  Object.keys(DIRS).forEach(function (d) { if (dirs.indexOf(d) === -1) dirs.push(d); });
  return dirs;
}

function pageDirs(page, dirs) {
  return dirs.filter(function (d) { return !(page.file === "landing.html" && DIRS[d].customLanding); });
}

function readFile(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { return null; }
}
function isFile(rel) {
  try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch (e) { return false; }
}
function legalExists(dir, file) { return isFile(path.join("legal", dir, file)); }

// Balises <link>/<meta> du <head>, attributs dans n'importe quel ordre.
function headTags(html, tagName) {
  var head = html.split(/<\/head>/i)[0] || "";
  var out = [];
  var re = new RegExp("<" + tagName + "\\b[^>]*>", "gi"), m;
  while ((m = re.exec(head))) {
    var attrs = {}, a, attrRe = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;
    while ((a = attrRe.exec(m[0]))) attrs[a[1].toLowerCase()] = a[2];
    out.push(attrs);
  }
  return out;
}

// canonical, hreflang declares et noindex d'une page HTML.
function pageSeo(html) {
  var canonical = null, alternates = [];
  headTags(html, "link").forEach(function (l) {
    var rel = (l.rel || "").toLowerCase();
    if (rel === "canonical" && canonical == null) canonical = l.href || null;
    if (rel === "alternate" && l.hreflang && l.href) alternates.push({ hreflang: l.hreflang, href: l.href });
  });
  var noindex = headTags(html, "meta").some(function (mt) {
    return (mt.name || "").toLowerCase() === "robots" && /noindex/i.test(mt.content || "");
  });
  return { canonical: canonical, alternates: alternates, noindex: noindex };
}

// URL du site -> fichier du depot qui la sert (null si hors site).
function urlToFile(url) {
  if (url.indexOf(SITE_URL + "/") !== 0) return null;
  var p = url.slice(SITE_URL.length + 1).split(/[?#]/)[0];
  if (p === "" || /\/$/.test(p)) p += "index.html";
  return p;
}

// Base du blog porte par le sitemap d'un repertoire : "" pour le blog FR racine
// (repertoire x-default sans blogDir), le code du repertoire s'il possede son
// propre blog (blogDir === dir), sinon null (gb, za -> /en/blog/).
function blogBaseFor(dir) {
  var b = DIRS[dir] && DIRS[dir].blogDir;
  if (!b) return dir === (MARKETS._xDefaultDir || "fr") ? "" : null;
  return b === dir ? b : null;
}

function blogFiles(base) {
  var prefix = base ? base + "/" : "";
  var files = base ? [] : ["blog.html"];
  files.push(prefix + "blog/index.html");
  // Articles d'actualite a la racine du blog (/blog/<slug>.html,
  // /<langue>/blog/<slug>.html) : memes regles que les guides (non noindex,
  // canonical auto-referent, hreflang lus dans le <head>).
  var blogDir = path.join(ROOT, prefix + "blog");
  if (fs.existsSync(blogDir)) {
    fs.readdirSync(blogDir).filter(function (f) { return /\.html$/.test(f) && f !== "index.html"; }).sort().forEach(function (f) {
      files.push(prefix + "blog/" + f);
    });
  }
  var guidesDir = path.join(ROOT, prefix + "blog/guides");
  if (fs.existsSync(guidesDir)) {
    fs.readdirSync(guidesDir).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
      files.push(prefix + "blog/guides/" + f);
    });
  }
  return files.filter(isFile);
}

// Entrees blog indexables d'un repertoire.
function blogEntries(dir) {
  var base = blogBaseFor(dir);
  if (base == null) return [];
  var entries = [];
  blogFiles(base).forEach(function (rel) {
    var seo = pageSeo(readFile(rel) || "");
    var loc = SITE_URL + "/" + rel.replace(/(^|\/)index\.html$/, "$1");
    if (seo.noindex || seo.canonical !== loc) return;
    var alternates = seo.alternates.filter(function (a) {
      var f = urlToFile(a.href);
      return !!f && isFile(f);
    });
    var hub = rel.indexOf("/guides/") === -1 && rel.indexOf("guides/") !== 0;
    entries.push({ loc: loc, alternates: alternates, priority: hub ? "0.7" : "0.6", changefreq: "weekly",
      file: rel, modified: articleModified(readFile(rel) || ""), image: pageImage(readFile(rel) || "") });
  });
  return entries;
}

// Entrees legales d'un repertoire (legal/<dir>/<fichier> present, non noindex).
function legalEntries(dir, dirs, xDefault) {
  var entries = [];
  LEGAL_FILE_LIST.forEach(function (file) {
    if (!legalExists(dir, file)) return;
    if (pageSeo(readFile(path.join("legal", dir, file)) || "").noindex) return;
    var alt = dirs.filter(function (d) { return legalExists(d, file); });
    var alternates = alt.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + "/" + d + "/" + file }; });
    var xd = alt.length > 1 ? SEO_COMMON.xDefaultDir(alt) : null;
    if (xd) alternates.push({ hreflang: "x-default", href: SITE_URL + "/" + xd + "/" + file });
    entries.push({ loc: SITE_URL + "/" + dir + "/" + file, alternates: alternates, priority: "0.3", changefreq: "monthly", file: dir + "/" + file });
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Pages de resultats (scripts/results-pages.js, lot R3) : /<dir>/resultats/ et
// /<dir>/resultats/<AAAA-MM-JJ>.html dans les 9 repertoires. Sitemap dedie
// (sitemap-resultats.xml) : les sitemaps par repertoire ci-dessus listent les
// pages du manifeste i18n, les pages legales et le blog - ils ne bougent pas.
// Comme pour le blog, une page n'entre ici que si elle existe sur le disque,
// n'est pas noindex (une journee sans marche regle n'a pas de page du tout) et
// a un canonical auto-referent ; les hreflang sont ceux declares dans son
// <head>, limites aux versions reellement ecrites.
const RESULTS_FOLDER = "resultats";
const RESULTS_SITEMAP = "sitemap-resultats.xml";

function isFileIn(root, rel) {
  try { return fs.statSync(path.join(root, rel)).isFile(); } catch (e) { return false; }
}
function readFileIn(root, rel) {
  try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch (e) { return null; }
}
// Entrees resultats d'un repertoire, dans l'ordre des URL (index d'abord, puis
// les journees de la plus recente a la plus ancienne).
function resultsEntries(dir, root) {
  root = root || ROOT;
  var folder = path.join(root, dir, RESULTS_FOLDER);
  var entries = [];
  if (!isFileIn(root, path.join(dir, RESULTS_FOLDER, "index.html"))) return entries;
  var files = ["index.html"].concat(fs.readdirSync(folder)
    .filter(function (f) { return /^\d{4}-\d{2}-\d{2}\.html$/.test(f); }).sort().reverse());
  files.forEach(function (f) {
    var rel = dir + "/" + RESULTS_FOLDER + "/" + f;
    var html = readFileIn(root, rel);
    if (!html) return;
    var seo = pageSeo(html);
    var loc = SITE_URL + "/" + rel.replace(/(^|\/)index\.html$/, "$1");
    if (seo.noindex || seo.canonical !== loc) return;
    var alternates = seo.alternates.filter(function (a) {
      var target = urlToFile(a.href);
      return !!target && isFileIn(root, target);
    });
    entries.push({ loc: loc, alternates: alternates, priority: f === "index.html" ? "0.6" : "0.5", changefreq: "daily", file: rel });
  });
  return entries;
}
// sitemap-resultats.xml. Renvoie le nom du fichier ecrit, ou null s'il n'y a
// aucune page indexable (aucun sitemap vide publie).
function generateResultsSitemap(today, outDir, srcRoot) {
  outDir = outDir || ROOT;
  srcRoot = srcRoot || ROOT;
  var entries = [];
  Object.keys(DIRS).forEach(function (dir) { entries = entries.concat(resultsEntries(dir, srcRoot)); });
  var file = path.join(outDir, RESULTS_SITEMAP);
  if (!entries.length) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return null;
  }
  var tracker = LASTMOD.tracker(outDir, "resultats", today);
  entries.forEach(function (e) { e.lastmod = tracker.lastmod(e.loc, readFileIn(srcRoot, e.file) || e.loc); });
  tracker.save();
  fs.writeFileSync(file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
      entries.map(function (e) { return urlXml(e, today); }).join("\n") + "\n</urlset>\n");
  return RESULTS_SITEMAP;
}

// Date de modification declaree par un article (JSON-LD dateModified, sinon
// article:modified_time / article:published_time) : premiere valeur du
// registre lastmod pour les guides.
function articleModified(html) {
  var m = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/) ||
    html.match(/property="article:modified_time" content="(\d{4}-\d{2}-\d{2})/) ||
    html.match(/property="article:published_time" content="(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
// Image principale d'une page du site (og:image hebergee sur iashark.com,
// hors icone generique) pour l'extension image des sitemaps.
function pageImage(html) {
  var m = html.split(/<\/head>/i)[0].match(/<meta property="og:image" content="([^"]+)"/);
  if (!m || m[1].indexOf(SITE_URL + "/assets/") !== 0) return null;
  return m[1];
}

// Google ignore <changefreq> et <priority> (Search Central, "Build and submit
// a sitemap") : conserves pour les autres moteurs. <lastmod> vient du registre
// scripts/seo-lastmod.js (date du dernier changement reel du fichier servi).
function urlXml(entry, today) {
  var links = entry.alternates.map(function (a) {
    return '<xhtml:link rel="alternate" hreflang="' + a.hreflang + '" href="' + a.href + '"/>';
  }).join("");
  var image = entry.image ? "<image:image><image:loc>" + entry.image + "</image:loc></image:image>" : "";
  return "<url><loc>" + entry.loc + "</loc><lastmod>" + (entry.lastmod || today) + "</lastmod><changefreq>" + entry.changefreq +
    "</changefreq><priority>" + entry.priority + "</priority>" + links + image + "</url>";
}

// Index sitemap.xml : chaque sitemap-*.xml present et non vide dans outDir
// (fr = pages match FR du pipeline, <dir>-i18n, matches-i18n, leagues), avec
// pour lastmod le plus recent <lastmod> qu'il contient.
function writeSitemapIndex(outDir, today) {
  outDir = outDir || ROOT;
  var rank = function (f) { return f === "sitemap-fr.xml" ? 0 : (/-i18n\.xml$/.test(f) && f !== "sitemap-matches-i18n.xml") ? 1 : 2; };
  var files = fs.readdirSync(outDir).filter(function (f) { return /^sitemap-[a-z0-9-]+\.xml$/.test(f); })
    .filter(function (f) { return /<url>/.test(fs.readFileSync(path.join(outDir, f), "utf8")); })
    .sort(function (a, b) { return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0); });
  var entries = files.map(function (f) {
    var dates = (fs.readFileSync(path.join(outDir, f), "utf8").match(/<lastmod>\d{4}-\d{2}-\d{2}/g) || []).map(function (s) { return s.slice(9); }).sort();
    return "<sitemap><loc>" + SITE_URL + "/" + f + "</loc><lastmod>" + (dates.pop() || today) + "</lastmod></sitemap>";
  });
  fs.writeFileSync(path.join(outDir, "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join("\n") + "\n</sitemapindex>\n");
  return files;
}

function generateLocalizedSitemaps(locales, pages, today, outDir) {
  outDir = outDir || ROOT;
  var dirs = sitemapDirs(locales);
  var xDefault = (locales && locales.default) || MARKETS._xDefaultDir || "fr";
  var sitemapPages = pages.filter(function (p) { return !p.noSitemap; });
  var files = [];
  dirs.forEach(function (dir) {
    var entries = [];
    sitemapPages.forEach(function (page) {
      var alt = pageDirs(page, dirs);
      if (alt.indexOf(dir) === -1) return;
      var slug = page.file === "index.html" ? "" : page.file;
      var alternates = alt.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + "/" + d + "/" + slug }; });
      var xd = alt.length > 1 ? SEO_COMMON.xDefaultDir(alt) : null;
      if (xd) alternates.push({ hreflang: "x-default", href: SITE_URL + "/" + xd + "/" + slug });
      entries.push({ loc: SITE_URL + "/" + dir + "/" + slug, alternates: alternates, priority: slug === "" ? "0.8" : "0.5", changefreq: "weekly", file: dir + "/" + page.file });
    });
    entries = entries.concat(legalEntries(dir, dirs, xDefault), blogEntries(dir));
    var tracker = LASTMOD.tracker(outDir, "i18n-" + dir, today);
    entries.forEach(function (e) {
      e.lastmod = tracker.lastmod(e.loc, (e.file && readFile(e.file)) || e.loc, e.modified || null);
    });
    tracker.save();
    var fname = "sitemap-" + dir + "-i18n.xml";
    fs.writeFileSync(
      path.join(outDir, fname),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
        entries.map(function (e) { return urlXml(e, today); }).join("\n") + "\n</urlset>"
    );
    files.push(fname);
  });
  return files;
}

module.exports = {
  generateLocalizedSitemaps: generateLocalizedSitemaps,
  generateResultsSitemap: generateResultsSitemap,
  resultsEntries: resultsEntries,
  RESULTS_SITEMAP: RESULTS_SITEMAP,
  writeSitemapIndex: writeSitemapIndex,
  articleModified: articleModified,
  sitemapDirs: sitemapDirs,
  blogEntries: blogEntries,
  legalEntries: legalEntries,
  pageSeo: pageSeo,
  urlToFile: urlToFile,
  LEGAL_FILE_LIST: LEGAL_FILE_LIST
};

if (require.main === module) {
  var I18N_LOCALES = require(path.join(ROOT, "i18n/locales.json"));
  var I18N_PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
  var TODAY = new Date().toISOString().split("T")[0];
  var files = generateLocalizedSitemaps(I18N_LOCALES, I18N_PAGES, TODAY, ROOT);
  // Pages de resultats deja ecrites par scripts/results-pages.js (rien a faire
  // si elles n'existent pas encore : aucun sitemap vide).
  var resultsFile = generateResultsSitemap(TODAY, ROOT, ROOT);
  if (resultsFile) files.push(resultsFile);

  // sitemap-fr.xml (ecrit par le pipeline) ne contient plus que les pages match
  // statiques (.github/workflows/update-data.yml#generateSitemaps). Une copie
  // plus ancienne peut encore lister le blog (/blog/ qui redirige vers /blog,
  // /blog.html deja dans sitemap-fr-i18n.xml) : on retire ces entrees perimees
  // sans toucher aux pages match - meme contenu que le prochain run du pipeline.
  var frPath = path.join(ROOT, "sitemap-fr.xml");
  if (fs.existsSync(frPath)) {
    var frXml = fs.readFileSync(frPath, "utf8");
    var pruned = frXml.replace(/<url><loc>([^<]+)<\/loc>[\s\S]*?<\/url>\n?/g, function (m, loc) {
      return /^https:\/\/iashark\.com\/match\/\d+\.html$/.test(loc) ? m : "";
    });
    if (pruned !== frXml) {
      fs.writeFileSync(frPath, pruned);
      console.log("sitemap-fr.xml : entrees hors pages match retirees (deja declarees dans les sitemaps i18n).");
    }
  }

  // Regenere l'index sitemap.xml : sitemap-fr.xml (pages match FR du pipeline),
  // les sitemaps i18n ci-dessus et ceux de scripts/seo-pages.js s'ils existent.
  var indexed = writeSitemapIndex(ROOT, TODAY);
  console.log("Sitemaps generes : " + files.join(", ") + " ; sitemap.xml (index) mis a jour avec " + indexed.length + " entree(s).");
}
