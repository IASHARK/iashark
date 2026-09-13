#!/usr/bin/env node
"use strict";
// IASHARK — generateur i18n + GEO (MASTER V2.1 SS19 ; decision proprietaire
// 2026-09-13 : site entierement traduit facon "Shopify Markets", visiteurs
// routes par pays). Site statique sans bundler ni dependance npm tierce : ce
// script fait de la substitution de chaines pure sur les pages sources FR de
// la racine (seule source de verite editoriale) pour produire TOUTES les pages
// publiques de scripts/i18n-manifest.js dans chaque repertoire declare dans
// config/markets.json#_dirs :
//   - langues        : /fr/ /en/ /es/ /de/ /it/ /pt/ (marche EUR par defaut)
//   - marches pays   : /gb/ (dictionnaire en, en-GB), /za/ (en, en-ZA),
//                      /mx/ (es-mx, es-MX)
// Il recopie aussi les pages legales par repertoire (legal/<dir>/<fichier>.html,
// ecrites a part ; ignorees proprement tant qu'elles n'existent pas),
// synchronise le bloc de donnees de lib/market-config.js depuis
// config/markets.json, supprime les pages retirees (historique.html) des
// repertoires generes, et regenere entierement _redirects.
//
// Regles de substitution heritees (i18n-manifest.js) : une regle dont la chaine
// "find" apparait un nombre de fois DIFFERENT de celui attendu fait echouer le
// build (jamais de page a moitie traduite en silence). Une regle dont la chaine
// n'apparait PLUS DU TOUT est signalee "obsolete" et ignoree : les pages sources
// migrent vers la traduction au runtime (data-i18n / I18N.t), ce qui retire
// legitimement ces chaines de la source.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }

const MARKETS = readJson("config/markets.json");
const DIRS = MARKETS._dirs;
const DIR_CODES = Object.keys(DIRS);
const X_DEFAULT_DIR = MARKETS._xDefaultDir || "fr";
const LEGAL_FILES = MARKETS._legalFiles || {};
const LEGAL_FILE_LIST = Object.keys(LEGAL_FILES).map(function (k) { return LEGAL_FILES[k]; });
const DICT_LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = {};
DICT_LOCALES.forEach(function (l) { DICTS[l] = readJson("i18n/dict/" + l + ".json"); });
const PAGES = require("./i18n-manifest.js");
const PAGE_FILES = PAGES.map(function (p) { return p.file; });
// Pages retirees du site public : jamais generees, supprimees des repertoires
// generes, redirigees vers l'accueil du repertoire (_redirects).
const RETIRED_FILES = ["historique.html"];
// Shells modulaires rendus par des scripts partages : aucune substitution
// inline heritee ne doit s'y appliquer.
const MODULAR_SHELLS = ["match.html", "pro.html", "compte.html"];
// Routage de la racine "/" (voir writeRedirects).
const COUNTRY_ROUTES = [["gb", "gb"], ["za", "za"], ["mx", "mx"], ["us,ca,au,ie,nz", "en"]];
const LANGUAGE_ROUTES = ["en", "es", "de", "it", "pt"];

// Echappe une valeur pour un litteral JS entre guillemets simples (textes
// traduits injectes dans du JS par les regles du manifeste).
var jsStr = require("./js-escape.js").jsStr;

function get(obj, keyPath) {
  return keyPath.split(".").reduce(function (o, k) { return o != null ? o[k] : null; }, obj);
}

function escText(s) {
  return String(s).replace(/&(?![a-zA-Z]+;|#\d+;)/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function slugOf(file) { return file === "index.html" ? "" : file; }
function dirUrl(dir, file) { return SITE_URL + "/" + dir + "/" + slugOf(file); }
function legalExists(dir, file) { return fs.existsSync(path.join(ROOT, "legal", dir, file)); }

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ---------------------------------------------------------------------------
// Prix (config/markets.json) formates comme au runtime (lib/market-config.js).
function formatPrice(dir, planKey) {
  var conf = DIRS[dir];
  var market = MARKETS[conf.market];
  var p = market && market.prices && market.prices[planKey];
  if (!p || typeof p.amount !== "number") return null;
  var digits = Math.round(p.amount) === p.amount ? 0 : 2;
  return new Intl.NumberFormat(conf.intlLocale, {
    style: "currency", currency: market.currency,
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(p.amount);
}

// ---------------------------------------------------------------------------
// Liens internes : chaque lien vers une page publique reste dans le repertoire.
function blogPath(dir, bare) {
  var blogDir = DIRS[dir].blogDir;
  if (!blogDir) return null; // fr : blog FR racine inchange
  var rest = bare.indexOf("blog/") === 0 ? bare.slice(5) : "";
  var base = "/" + blogDir + "/blog/";
  if (rest) {
    var target = path.join(ROOT, blogDir, "blog", rest);
    var ok = /\/$/.test(rest)
      ? fs.existsSync(path.join(target, "index.html"))
      : (fs.existsSync(target) && fs.statSync(target).isFile());
    if (ok) return base + rest;
    // Slug d'article traduit/absent : repli sur l'accueil du blog de la langue.
  }
  if (fs.existsSync(path.join(ROOT, blogDir, "blog", "index.html"))) return base;
  return null; // blog de la langue pas (encore) genere : on garde le blog FR racine
}

function mapPath(p, dir) {
  if (p === "/" || p === "/index.html") return "/" + dir + "/";
  var bare = p.replace(/^\/+/, "");
  if (RETIRED_FILES.indexOf(bare) !== -1) return "/" + dir + "/";
  if (PAGE_FILES.indexOf(bare) !== -1) return "/" + dir + "/" + bare;
  if (LEGAL_FILE_LIST.indexOf(bare) !== -1) return legalExists(dir, bare) ? "/" + dir + "/" + bare : null;
  if (bare === "blog.html" || bare === "blog" || bare.indexOf("blog/") === 0) return blogPath(dir, bare);
  return null;
}

function rewriteInternalLinks(html, dir) {
  // 1. Attributs racine-relatifs, y compris dans des chaines JS (href=\"/x\").
  html = html.replace(/((?:href|src|action)\s*=\s*\\?(["']))(\/(?![\/\\])[^"'\\\s<>?#]*)(?=([\s\S]?))/g,
    function (m, pre, quote, p, next) {
      // href="/'+x+'" : concatenation JS, pas un chemin complet -> intouche.
      if ((next === '"' || next === "'") && next !== quote && !/\.html$/.test(p)) return m;
      var np = mapPath(p, dir);
      return np ? pre + np : m;
    });
  // 2. URLs absolues du domaine (landing.html, JSON-LD...).
  html = html.replace(/(["'=(\s])https:\/\/iashark\.com(\/[^"'\\\s<>?#)]*)?(?=([\s\S]?))/g,
    function (m, pre, p, next) {
      if ((pre === '"' || pre === "'") && (next === '"' || next === "'") && next !== pre) return m;
      var np = mapPath(p || "/", dir);
      return np ? pre + SITE_URL + np : m;
    });
  // 3. Litteraux JS exacts vers une page publique ('/abonnement.html', '/match.html?id=').
  html = html.replace(/(["'])\/([a-z0-9-]+\.html)((?:[?#][^"'\\\s<>]*)?)\1/g, function (m, q, file, rest) {
    var np = mapPath("/" + file, dir);
    return np ? q + np + rest + q : m;
  });
  // 4. Redirections JS vers l'accueil : location.href='/'.
  html = html.replace(/((?:location(?:\.href)?\s*=|location\.(?:replace|assign)\()\s*)(["'])\/\2/g, function (m, pre, q) {
    return pre + q + "/" + dir + "/" + q;
  });
  // 5. Cartes de match construites en JS vers les pages statiques FR
  //    /match/{id}.html -> page match traduite du repertoire (hors fr).
  if (dir !== X_DEFAULT_DIR) {
    // href="/match/'+m.id+'.html" (attribut dans une chaine JS)
    html = html.replace(/(href=\\?["'])\/match\/'\s*\+\s*([^'+]+?)\s*\+\s*'\.html/g, function (m, pre, expr) {
      return pre + "/" + dir + "/match.html?id='+" + expr + "+'";
    });
    // '/match/'+m.id+'.html' (litteral JS : setAttribute('href', ...), ternaires...)
    html = html.replace(/(["'])\/match\/\1\s*\+\s*([^"'+]+?)\s*\+\s*\1\.html\1/g, function (m, q, expr) {
      return q + "/" + dir + "/match.html?id=" + q + "+" + expr;
    });
  }
  return html;
}

// ---------------------------------------------------------------------------
// <head> : titre/description traduits, canonical, hreflang, og:url, <html lang>.
function fillPlaceholders(s, dir) {
  return String(s).replace(/\{(free|pro|edge|annual_edge)_price\}/g, function (all, key) {
    var v = formatPrice(dir, key);
    if (v == null) throw new Error("Placeholder " + all + " : pas de prix " + key + " pour le marche " + DIRS[dir].market);
    return v;
  });
}

function metaFor(page, dir) {
  var locale = DIRS[dir].locale;
  var key = page.file.replace(/\.html$/, "");
  var geo = DICTS[locale] && DICTS[locale].geo;
  var fromDict = geo && geo.meta && geo.meta[key];
  var m = (fromDict && fromDict.title) ? fromDict
    : (page.metas && (page.metas[locale] || page.metas[locale.split("-")[0]]));
  if (!m || !m.title) {
    throw new Error("Pas de titre pour " + page.file + " (" + dir + ") : ajouter geo.meta." + key +
      " dans i18n/parts/geo.<locale>.json puis lancer node scripts/merge-i18n-parts.js");
  }
  return { title: fillPlaceholders(m.title, dir), description: m.description ? fillPlaceholders(m.description, dir) : null };
}

function buildHead(html, dir, file, meta, altDirs) {
  var conf = DIRS[dir];
  var canonicalUrl = dirUrl(dir, file);
  html = html.replace(/[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>\r?\n?/g, "");
  if (meta) {
    var title = escText(meta.title);
    html = html.replace(/<title\b([^>]*)>[^<]*<\/title>/, function (m, attrs) { return "<title" + attrs + ">" + title + "</title>"; });
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, function (m, a, b) { return a + title + b; });
    if (meta.description) {
      var desc = escText(meta.description);
      html = html.replace(/(<meta name="description" content=")[^"]*(")/, function (m, a, b) { return a + desc + b; });
      html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, function (m, a, b) { return a + desc + b; });
    }
  }
  var links = altDirs.map(function (d) {
    return '<link rel="alternate" hreflang="' + DIRS[d].hreflang + '" href="' + dirUrl(d, file) + '">';
  });
  if (altDirs.indexOf(X_DEFAULT_DIR) !== -1) {
    links.push('<link rel="alternate" hreflang="x-default" href="' + dirUrl(X_DEFAULT_DIR, file) + '">');
  }
  var block = '<link rel="canonical" href="' + canonicalUrl + '">' + (links.length ? "\n" + links.join("\n") : "");
  var canonicalRe = /<link rel="canonical" href="[^"]*"\s*\/?>/;
  if (canonicalRe.test(html)) {
    html = html.replace(canonicalRe, function () { return block; });
  } else if (/<\/title>/.test(html)) {
    html = html.replace(/<\/title>/, function () { return "</title>\n" + block; });
  } else {
    html = html.replace(/<\/head>/i, function () { return block + "\n</head>"; });
  }
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, function (m, a, b) { return a + canonicalUrl + b; });
  if (/<html\b[^>]*\slang="[^"]*"/i.test(html)) {
    html = html.replace(/(<html\b[^>]*\s)lang="[^"]*"/i, function (m, a) { return a + 'lang="' + conf.htmlLang + '"'; });
  } else {
    html = html.replace(/<html\b/i, function () { return '<html lang="' + conf.htmlLang + '"'; });
  }
  return html;
}

// Meta marche + scripts runtime (i18n.js pour I18N.href, market-config.js).
function injectRuntime(html, dir, opts) {
  opts = opts || {};
  var metaTag = '<meta name="iashark-market" content="' + DIRS[dir].market + '">';
  if (/<meta name="iashark-market"[^>]*>/.test(html)) {
    html = html.replace(/<meta name="iashark-market"[^>]*>/, function () { return metaTag; });
  } else if (/<meta charset[^>]*>/i.test(html)) {
    html = html.replace(/<meta charset[^>]*>/i, function (m) { return m + "\n" + metaTag; });
  } else {
    html = html.replace(/<head\b[^>]*>/i, function (m) { return m + "\n" + metaTag; });
  }
  var head = [];
  if (opts.bottomNav && !/\/assets\/bottom-navigation\.css/.test(html)) head.push('<link rel="stylesheet" href="/assets/bottom-navigation.css">');
  if (!/<script[^>]*\ssrc="\/i18n\/i18n\.js"/.test(html)) head.push('<script src="/i18n/i18n.js"></script>');
  if (!/<script[^>]*\ssrc="\/lib\/market-config\.js"/.test(html)) head.push('<script src="/lib/market-config.js"></script>');
  if (head.length) html = html.replace(/<\/head>/i, function () { return head.join("\n") + "\n</head>"; });
  if (opts.bottomNav && !/<script[^>]*\ssrc="\/bottom-navigation\.js"/.test(html)) {
    html = html.replace(/<\/body>/i, function () { return '<script src="/bottom-navigation.js"></script>\n</body>'; });
  }
  return html;
}

// ---------------------------------------------------------------------------
// Substitutions heritees du manifeste.
function buildValue(r, locale) {
  if (typeof r.build !== "function") return get(DICTS[locale], r.key);
  var isRegional = locale.indexOf("-") !== -1;
  var v;
  try {
    v = r.build(DICTS[locale], locale, jsStr);
  } catch (e) {
    if (!isRegional) throw e;
    v = undefined;
  }
  var broken = v == null || (typeof v === "string" && /undefined/.test(v) && !/undefined/.test(r.find));
  if (broken && isRegional) {
    // es-mx : tables de textes du manifeste indexees par langue de base.
    v = r.build(DICTS[locale], locale.split("-")[0], jsStr);
  }
  return v;
}

function applyReplacements(html, locale, rules, report, file) {
  (rules || []).forEach(function (r) {
    var count = html.split(r.find).length - 1;
    var expected = r.count || 1;
    if (count === 0) {
      report.stale[file + " :: " + JSON.stringify(r.find.slice(0, 90))] = true;
      return;
    }
    if (count !== expected) {
      throw new Error("Replacement mismatch (" + locale + ", " + file + "): expected " + expected +
        " occurrence(s) of\n  " + JSON.stringify(r.find.slice(0, 200)) + "\n  found " + count);
    }
    var value = buildValue(r, locale);
    if (value == null) throw new Error("Missing dict value for rule [" + (r.key || r.find.slice(0, 40)) + "] locale " + locale + " (" + file + ")");
    html = html.split(r.find).join(value);
  });
  return html;
}

// ---------------------------------------------------------------------------
// lib/market-config.js : bloc de donnees recopie depuis config/markets.json.
function marketRuntimeData() {
  var markets = {};
  Object.keys(MARKETS).filter(function (k) { return k.charAt(0) !== "_"; }).forEach(function (k) {
    var m = MARKETS[k];
    markets[k] = {
      currency: m.currency, locale: m.locale, htmlLang: m.htmlLang, intlLocale: m.intlLocale,
      status: m.status, minAge: m.minAge, checkoutMarket: m.checkoutMarket || null,
      prices: m.prices || {}, helpline: m.helpline || null
    };
  });
  var dirs = {};
  DIR_CODES.forEach(function (d) {
    var c = DIRS[d];
    dirs[d] = { market: c.market, locale: c.locale, htmlLang: c.htmlLang, intlLocale: c.intlLocale, blogDir: c.blogDir || "", label: c.label };
  });
  return {
    defaultMarket: MARKETS._defaultMarket || "fr", defaultDir: X_DEFAULT_DIR,
    planKeys: MARKETS._planKeys || [], legalFiles: LEGAL_FILES, dirs: dirs, markets: markets
  };
}

function syncMarketConfig() {
  var file = path.join(ROOT, "lib/market-config.js");
  var src = fs.readFileSync(file, "utf8");
  var re = /\/\*IASHARK_MARKETS_DATA_START\*\/[\s\S]*?\/\*IASHARK_MARKETS_DATA_END\*\//;
  if (!re.test(src)) throw new Error("lib/market-config.js : marqueurs IASHARK_MARKETS_DATA_START/END introuvables");
  var block = "/*IASHARK_MARKETS_DATA_START*/\n  var DATA = " +
    JSON.stringify(marketRuntimeData(), null, 2).replace(/\n/g, "\n  ") +
    ";\n  /*IASHARK_MARKETS_DATA_END*/";
  writeIfChanged(file, src.replace(re, function () { return block; }));
}

// ---------------------------------------------------------------------------
// _redirects (Netlify) : entierement regenere.
function rule(from, to, status, cond) {
  function pad(s, n) { return s.length >= n ? s + "  " : s + new Array(n - s.length + 1).join(" "); }
  return pad(from, 34) + pad(to, 30) + status + (cond ? "  " + cond : "");
}

function redirectsContent() {
  var out = [
    "# GENERE par scripts/build-locales.js depuis config/markets.json et",
    "# scripts/i18n-manifest.js - ne pas editer a la main (ecrase a chaque build).",
    "#",
    "# Netlify evalue les regles de haut en bas et applique la premiere qui",
    "# correspond (chemin + condition). Le suffixe ! (force) est indispensable :",
    "# sans lui une regle ne s'applique jamais quand un fichier existe au meme",
    "# chemin (\"shadowing\" : la racine a un index.html et les anciennes pages",
    "# racine restent les sources du generateur).",
    "",
    "# --- Racine \"/\" : pays d'abord (Country = code ISO 3166-1 alpha-2 en",
    "# minuscules, geolocalisation Netlify), puis langue du navigateur",
    "# (Accept-Language), puis /fr/ par defaut. 302 : aiguillage revisable (le",
    "# selecteur langue/pays reste disponible), jamais une URL permanente."
  ];
  COUNTRY_ROUTES.forEach(function (r) { out.push(rule("/", "/" + r[1] + "/", "302!", "Country=" + r[0])); });
  LANGUAGE_ROUTES.forEach(function (l) { out.push(rule("/", "/" + l + "/", "302!", "Language=" + l)); });
  out.push(rule("/", "/" + X_DEFAULT_DIR + "/", "302!"));

  out.push("", "# --- Anciennes URLs racine -> version generee du repertoire par defaut (301).");
  out.push(rule("/index.html", "/" + X_DEFAULT_DIR + "/", "301!"));
  PAGES.forEach(function (p) {
    if (p.file === "index.html" || p.file === "404.html") return;
    out.push(rule("/" + p.file, "/" + X_DEFAULT_DIR + "/" + p.file, "301!"));
    // Netlify sert aussi /page sans .html : meme redirection (audit QA 14/09/2026).
    out.push(rule("/" + p.file.replace(/\.html$/, ""), "/" + X_DEFAULT_DIR + "/" + p.file, "301!"));
  });
  LEGAL_FILE_LIST.forEach(function (f) {
    if (legalExists(X_DEFAULT_DIR, f)) {
      out.push(rule("/" + f, "/" + X_DEFAULT_DIR + "/" + f, "301!"));
      out.push(rule("/" + f.replace(/\.html$/, ""), "/" + X_DEFAULT_DIR + "/" + f, "301!"));
    }
  });

  out.push("", "# --- Historique retire du site public : accueil du repertoire.");
  out.push(rule("/historique.html", "/" + X_DEFAULT_DIR + "/", "301!"));
  out.push(rule("/historique", "/" + X_DEFAULT_DIR + "/", "301!"));
  DIR_CODES.forEach(function (d) {
    out.push(rule("/" + d + "/historique.html", "/" + d + "/", "301!"));
    out.push(rule("/" + d + "/historique", "/" + d + "/", "301!"));
  });

  out.push("", "# --- Sources des pages legales (legal/<dir>/) : jamais servies telles quelles.");
  out.push(rule("/legal/*", "/:splat", "301!"));

  out.push("", "# --- 404 traduite par repertoire. Non forcee : ne s'applique que si aucun",
    "# fichier n'existe au chemin demande. Toujours en dernier.");
  DIR_CODES.forEach(function (d) { out.push(rule("/" + d + "/*", "/" + d + "/404.html", "404")); });
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Traduction statique : ecrit directement dans le HTML genere la valeur du
// dictionnaire pour [data-i18n], [data-i18n-html] et [data-i18n-attr], avec la
// meme semantique que le runtime (textContent / innerHTML / attributs). Evite
// l'affichage du francais avant le chargement du JS et fournit aux moteurs de
// recherche le texte dans la langue du repertoire. Les blocs <script>/<style>
// ne sont jamais touches. Cle absente du dictionnaire = texte source conserve.
var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
function escText(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(v) { return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function attrValue(tag, name) {
  var m = tag.match(new RegExp("\\s" + name + "=\"([^\"]*)\""));
  return m ? m[1] : null;
}
function setAttr(tag, name, value) {
  var re = new RegExp("(\\s" + name + "=)\"[^\"]*\"");
  if (re.test(tag)) return tag.replace(re, function (_, p) { return p + "\"" + escAttr(value) + "\""; });
  return tag.replace(/\s*(\/?)>$/, function (_, slash) { return " " + name + "=\"" + escAttr(value) + "\"" + (slash ? " /" : "") + ">"; });
}
function bakeI18n(html, dict) {
  var stash = [];
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, function (m) { stash.push(m); return "\u0000STASH" + (stash.length - 1) + "\u0000"; });
  var out = "", pos = 0, tagRe = /<([a-zA-Z][\w-]*)\b[^<>]*>/g, m;
  while ((m = tagRe.exec(html))) {
    var tag = m[0], name = m[1].toLowerCase();
    var textKey = attrValue(tag, "data-i18n"), htmlKey = attrValue(tag, "data-i18n-html"), attrSpec = attrValue(tag, "data-i18n-attr");
    if (textKey == null && htmlKey == null && attrSpec == null) continue;
    var newTag = tag;
    if (attrSpec) {
      attrSpec.split(",").forEach(function (pair) {
        var parts = pair.split(":");
        if (parts.length !== 2) return;
        var v = get(dict, parts[1].trim());
        if (typeof v === "string") newTag = setAttr(newTag, parts[0].trim(), v);
      });
    }
    var key = htmlKey != null ? htmlKey : textKey;
    var value = key != null ? get(dict, key) : null;
    out += html.slice(pos, m.index) + newTag;
    pos = m.index + tag.length;
    if (typeof value !== "string" || VOID_TAGS[name] || /\/>$/.test(tag)) continue;
    var depth = 1, scan = new RegExp("<(\\/?)" + name + "\\b[^<>]*>", "gi"), c, closeStart = -1, closeEnd = -1;
    scan.lastIndex = pos;
    while ((c = scan.exec(html))) {
      if (c[1]) { depth--; if (depth === 0) { closeStart = c.index; closeEnd = c.index + c[0].length; break; } }
      else if (!/\/>$/.test(c[0])) depth++;
    }
    if (closeStart === -1) continue;
    out += (htmlKey != null ? value : escText(value)) + html.slice(closeStart, closeEnd);
    pos = closeEnd;
    tagRe.lastIndex = closeEnd;
  }
  out += html.slice(pos);
  return out.replace(/\u0000STASH(\d+)\u0000/g, function (_, i) { return stash[+i]; });
}

function build() {
  syncMarketConfig();
  var report = { stale: {}, pages: 0, legal: 0, missingLegal: [], removed: [] };

  PAGES.forEach(function (page) {
    var src = fs.readFileSync(path.join(ROOT, page.file), "utf8");
    var rules = MODULAR_SHELLS.indexOf(page.file) !== -1 ? [] : page.replacements;
    var altDirs = DIR_CODES.filter(function (d) { return !(page.file === "landing.html" && DIRS[d].customLanding); });
    altDirs.forEach(function (dir) {
      var html = applyReplacements(src, DIRS[dir].locale, rules, report, page.file);
      if (DIRS[dir].locale !== "fr") html = bakeI18n(html, DICTS[DIRS[dir].locale]);
      html = rewriteInternalLinks(html, dir);
      html = buildHead(html, dir, page.file, metaFor(page, dir), altDirs);
      html = injectRuntime(html, dir);
      writeIfChanged(path.join(ROOT, dir, page.file), html);
      report.pages++;
    });
  });

  LEGAL_FILE_LIST.forEach(function (file) {
    var altDirs = DIR_CODES.filter(function (d) { return legalExists(d, file); });
    DIR_CODES.forEach(function (d) { if (altDirs.indexOf(d) === -1) report.missingLegal.push(d + "/" + file); });
    altDirs.forEach(function (dir) {
      var html = fs.readFileSync(path.join(ROOT, "legal", dir, file), "utf8");
      html = rewriteInternalLinks(html, dir);
      html = buildHead(html, dir, file, null, altDirs);
      html = injectRuntime(html, dir, { bottomNav: true });
      writeIfChanged(path.join(ROOT, dir, file), html);
      report.legal++;
    });
  });

  DIR_CODES.forEach(function (dir) {
    RETIRED_FILES.forEach(function (file) {
      var p = path.join(ROOT, dir, file);
      if (fs.existsSync(p)) { fs.unlinkSync(p); report.removed.push(dir + "/" + file); }
    });
    if (DIRS[dir].customLanding && !fs.existsSync(path.join(ROOT, dir, "landing.html"))) {
      console.warn("ATTENTION : " + dir + "/landing.html (landing pays maintenue a la main) est absente.");
    }
  });

  writeIfChanged(path.join(ROOT, "_redirects"), redirectsContent());

  var stale = Object.keys(report.stale);
  console.log("i18n/GEO build : " + PAGES.length + " page(s) x " + DIR_CODES.length + " repertoire(s) = " +
    report.pages + " fichier(s) ; " + report.legal + " page(s) legale(s) recopiee(s).");
  if (report.missingLegal.length) console.log("Pages legales absentes (ignorees) : " + report.missingLegal.length + " (" + report.missingLegal.join(", ") + ")");
  if (report.removed.length) console.log("Pages retirees supprimees : " + report.removed.join(", "));
  if (stale.length) console.log("Regles de substitution obsoletes ignorees (chaine absente de la source) : " + stale.length);
  return report;
}

module.exports = {
  DIRS: DIRS, DIR_CODES: DIR_CODES, PAGE_FILES: PAGE_FILES, LEGAL_FILE_LIST: LEGAL_FILE_LIST,
  mapPath: mapPath, rewriteInternalLinks: rewriteInternalLinks, bakeI18n: bakeI18n, formatPrice: formatPrice,
  marketRuntimeData: marketRuntimeData, redirectsContent: redirectsContent, build: build
};

if (require.main === module) build();
