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
// Textes SEO par repertoire (i18n/seo/<dir>.json) et aides partagees avec
// scripts/seo-pages.js (pages championnat et pages match localisees).
const SEO = require("./seo-common.js");
// Pages match retirees a J+30 : regles 301 tirees du registre versionne.
const MATCH_LIFECYCLE = require("./match-lifecycle.js");
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

// Elements [data-requires-page="<fichier>"] (lien Methodologie des pieds de
// page, de a-propos...) : retires du HTML genere quand la page cible n'existe
// pas dans le repertoire (legal/<dir>/<fichier> absent), plutot que de laisser
// un lien racine redirige vers une autre langue.
function stripUnavailablePageLinks(html, dir) {
  return html.replace(/[ \t]*<(a|p|span|li|div)\b[^>]*\sdata-requires-page="([^"]+)"[^>]*>[\s\S]*?<\/\1>(\r?\n)?/g, function (m, tag, file) {
    return legalExists(dir, file) ? m : "";
  });
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ---------------------------------------------------------------------------
// Prix (config/markets.json) formates EXACTEMENT comme au runtime : meme
// fonction pure, lue dans lib/market-config.js (MX$199, R 199, £14.99...).
function marketConfigLib() {
  if (!marketConfigLib.cache) {
    var file = path.join(ROOT, "lib/market-config.js");
    var sandbox = {};
    new Function("window", fs.readFileSync(file, "utf8"))(sandbox);
    marketConfigLib.cache = sandbox.IasharkMarketConfig;
  }
  return marketConfigLib.cache;
}
// planKey : "free", "pro" (= mensuel, retro-compatibilite), "pro.week",
// "pro.month", "pro.year" (ou pro_week...). Resolution par la meme fonction
// pure que le runtime (lib/market-config.js#priceFor).
function formatPrice(dir, planKey) {
  var conf = DIRS[dir];
  var market = MARKETS[conf.market];
  var amount = market ? marketConfigLib().priceFor(market.prices || {}, planKey) : null;
  if (amount == null) return null;
  return marketConfigLib().formatAmount(amount, market.currency, conf.intlLocale);
}
// Ressource d'aide d'un repertoire (surcharge _dirs.<dir>.helpline, sinon marche).
function helplineFor(dir) {
  var conf = DIRS[dir];
  var helplines = MARKETS._helplines || {};
  if (conf.helpline && Object.prototype.hasOwnProperty.call(helplines, conf.helpline)) return helplines[conf.helpline];
  var market = MARKETS[conf.market];
  return (market && market.helpline) || null;
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
  return String(s).replace(/\{(free|pro|pro_week|pro_month|pro_year)_price\}/g, function (all, key) {
    var v = formatPrice(dir, key);
    if (v == null) throw new Error("Placeholder " + all + " : pas de prix " + key + " pour le marche " + DIRS[dir].market);
    return v;
  });
}

function metaFor(page, dir) {
  var locale = DIRS[dir].locale;
  var key = page.file.replace(/\.html$/, "");
  // 1. i18n/seo/<dir>.json#meta : titre/description rediges pour le marche de
  //    recherche du repertoire (gb "Premier League", za "PSL", mx "Liga MX"...),
  //    distincts entre en/gb/za qui partagent le dictionnaire "en".
  var seoMeta = SEO.seoConf(dir).meta && SEO.seoConf(dir).meta[key];
  // 2. dictionnaire geo.meta (pages sans intention de recherche : compte...).
  var geo = DICTS[locale] && DICTS[locale].geo;
  var fromDict = geo && geo.meta && geo.meta[key];
  var m = (seoMeta && seoMeta.title) ? seoMeta
    : (fromDict && fromDict.title) ? fromDict
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
    // Texte d'element pour <title>, valeur d'attribut (guillemets echappes)
    // pour les balises meta : un " dans un titre cassait l'attribut.
    var title = escText(meta.title), titleAttr = escAttr(meta.title);
    html = html.replace(/<title\b([^>]*)>[^<]*<\/title>/, function (m, attrs) { return "<title" + attrs + ">" + title + "</title>"; });
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, function (m, a, b) { return a + titleAttr + b; });
    if (meta.description) {
      var desc = escAttr(meta.description);
      html = html.replace(/(<meta name="description" content=")[^"]*(")/, function (m, a, b) { return a + desc + b; });
      html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, function (m, a, b) { return a + desc + b; });
    }
  }
  var links = altDirs.map(function (d) {
    return '<link rel="alternate" hreflang="' + DIRS[d].hreflang + '" href="' + dirUrl(d, file) + '">';
  });
  // x-default : config/markets.json#_hreflangXDefault (en, puis fr).
  var xd = altDirs.length > 1 ? SEO.xDefaultDir(altDirs) : null;
  if (xd) links.push('<link rel="alternate" hreflang="x-default" href="' + dirUrl(xd, file) + '">');
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
  html = setHtmlLang(html, conf.htmlLang);
  return completeHead(html, dir, canonicalUrl);
}

function setHtmlLang(html, lang) {
  if (/<html\b[^>]*\slang="[^"]*"/i.test(html)) {
    return html.replace(/(<html\b[^>]*\s)lang="[^"]*"/i, function (m, a) { return a + 'lang="' + lang + '"'; });
  }
  return html.replace(/<html\b/i, function () { return '<html lang="' + lang + '"'; });
}

// Complete le <head> (audit SEO 14/09/2026) :
// - title/description/og/twitter sont le texte statique du repertoire : leurs
//   data-i18n/data-i18n-attr sont retires, sinon i18n.js les remplacait au
//   chargement par le texte generique du dictionnaire (en/gb/za identiques) ;
// - Open Graph minimal present partout (og:type, og:site_name, og:locale,
//   og:title, og:description, og:url, og:image) + twitter:card ;
// - preconnect vers Google Fonts quand la page charge une feuille de polices.
function completeHead(html, dir, canonicalUrl) {
  var idx = html.search(/<\/head>/i);
  if (idx === -1) return html;
  var head = html.slice(0, idx), rest = html.slice(idx);
  head = head.replace(/<(title|meta)\b[^>]*>/gi, function (tag) {
    if (!/^<title|name="description"|property="og:(title|description)"|name="twitter:(title|description)"/i.test(tag)) return tag;
    return tag.replace(/\sdata-i18n(-attr)?="[^"]*"/g, "");
  });
  var titleText = (head.match(/<title\b[^>]*>([^<]*)<\/title>/i) || [])[1];
  var descText = (head.match(/<meta name="description" content="([^"]*)"/i) || [])[1];
  var add = [];
  function has(re) { return re.test(head); }
  if (!has(/property="og:type"/)) add.push('<meta property="og:type" content="website">');
  if (!has(/property="og:site_name"/)) add.push('<meta property="og:site_name" content="IASHARK">');
  if (!has(/property="og:locale"/)) add.push('<meta property="og:locale" content="' + SEO.ogLocale(dir) + '">');
  if (!has(/property="og:title"/) && titleText) add.push('<meta property="og:title" content="' + escAttr(unescHtml(titleText)) + '">');
  if (!has(/property="og:description"/) && descText) add.push('<meta property="og:description" content="' + descText + '">');
  if (!has(/property="og:url"/)) add.push('<meta property="og:url" content="' + canonicalUrl + '">');
  if (!has(/property="og:image"/)) add.push('<meta property="og:image" content="' + SITE_URL + '/icon-512.png">');
  if (!has(/name="twitter:card"/)) add.push('<meta name="twitter:card" content="summary">');
  if (add.length) head = head.replace(/\s*$/, "\n") + add.join("\n") + "\n";
  if (/href="https:\/\/fonts\.googleapis\.com\/css/.test(head) && !/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/.test(head)) {
    head = head.replace(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css[^>]*>/, function (m) {
      return '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' + m;
    });
  }
  return head + rest;
}

// Accueil de chaque repertoire : JSON-LD Organization + WebSite + WebPage
// localise (la source racine portait une description francaise recopiee dans
// les 9 repertoires) et bloc SEO visible <!--SEO_INTRO--> (methode, liens vers
// les pages championnat et les guides), redige depuis i18n/seo/<dir>.json.
function homeJsonLd(dir, meta) {
  var s = SEO.seoConf(dir), canonical = dirUrl(dir, "index.html");
  var org = SITE_URL + "/#organization", site = SITE_URL + "/#website";
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": org, name: "IASHARK", url: SITE_URL + "/",
        logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png", width: 512, height: 512 },
        description: s.org_description },
      { "@type": "WebSite", "@id": site, name: "IASHARK", url: SITE_URL + "/", publisher: { "@id": org },
        inLanguage: DIR_CODES.map(function (d) { return DIRS[d].htmlLang; }) },
      { "@type": "WebPage", "@id": canonical + "#webpage", url: canonical, name: meta.title, description: meta.description,
        inLanguage: DIRS[dir].htmlLang, isPartOf: { "@id": site }, about: { "@id": org } }
    ]
  };
}
var SEO_LINK_STYLE = ' style="color:#20d5ef;text-decoration:underline;text-underline-offset:3px"';
function homeSeoBlock(dir) {
  var h = SEO.seoConf(dir).home;
  // Hubs ligue du perimetre de la version seulement (config/leagues.json#seoMatchDirs) :
  // un hub hors perimetre est noindex, il n'est pas mis en avant depuis l'accueil.
  var nav = SEO.versionNav(dir);
  var leagues = nav.leagues.map(function (x) {
    return '<li><a href="' + x.href + '"' + SEO_LINK_STYLE + ">" + escText(x.label) + "</a></li>";
  }).join("");
  var sections = nav.sections.map(function (x) {
    return '<li><a href="' + x.href + '"' + SEO_LINK_STYLE + ">" + escText(x.label) + "</a></li>";
  }).join("");
  var guides = ["prediction-ia-football-guide-2026.html", "plus-de-2-5-buts-probabilite-methode-poisson.html", "xg-expected-goals-guide-complet.html", "value-bet-guide-complet-2026.html"].map(function (g) {
    return '<li><a href="' + SEO.guidePath(dir, g) + '"' + SEO_LINK_STYLE + ">" + escText(SEO.guideLabel(dir, g)) + "</a></li>";
  }).join("");
  return '<section class="relative border-t border-hairline" aria-labelledby="seo-intro-title">' +
    '<div class="mx-auto w-full max-w-[1200px] px-5 sm:px-8 py-16 sm:py-20">' +
    '<div class="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-soft"><span aria-hidden="true" class="h-1 w-1 rounded-full bg-cyan"></span>' + escText(h.eyebrow) + "</div>" +
    '<h2 id="seo-intro-title" class="text-[clamp(28px,3.2vw,42px)] font-extrabold leading-[1.12] tracking-[-0.035em] text-ink">' + escText(h.title) + "</h2>" +
    '<div class="mt-6 max-w-3xl">' + h.paragraphs.map(function (p) { return '<p class="mt-4 text-[14px] leading-relaxed text-soft">' + escText(p) + "</p>"; }).join("") + "</div>" +
    '<h3 class="mt-8 text-[15.5px] font-bold text-ink">' + escText(h.leagues_title) + "</h3>" +
    '<ul class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px]" style="list-style:none;padding:0">' + leagues + "</ul>" +
    '<h3 class="mt-8 text-[15.5px] font-bold text-ink">' + escText(nav.labels.explore) + "</h3>" +
    '<ul class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px]" style="list-style:none;padding:0">' + sections + "</ul>" +
    '<h3 class="mt-8 text-[15.5px] font-bold text-ink">' + escText(h.guides_title) + "</h3>" +
    '<ul class="mt-3 grid gap-2 text-[14px]" style="list-style:none;padding:0">' + guides + "</ul>" +
    "</div></section>";
}
// Resume des matchs du jour (<!--SEO_MATCHES_SUMMARY-->, ecrit par le pipeline
// dans index.html racine avec des liens FR /match/<id>.html) : chaque lien vise
// la page de la version si elle existe, sinon la version la plus proche
// reellement generee dans le perimetre de la competition
// (scripts/match-lifecycle.js#versionMatchHref, meme fonction que
// injectHomeSeoSummary du pipeline) ; aucune page : nom sans lien.
function rewriteHomeMatchSummary(html, dir, root) {
  return html.replace(/<!--SEO_MATCHES_SUMMARY-->[\s\S]*?<!--\/SEO_MATCHES_SUMMARY-->/, function (block) {
    return block.replace(/<a href="(?:\/[a-z]{2})?\/match\/(\d{1,12})\.html"([^>]*)>([\s\S]*?)<\/a>/g, function (m, id, attrs, inner) {
      var href = MATCH_LIFECYCLE.homeSummaryHref(id, null, dir, root || ROOT);
      return href ? '<a href="' + href + '"' + attrs + ">" + inner + "</a>" : inner;
    });
  });
}

function injectHomeSeo(html, dir, meta) {
  html = html.replace(/<script type="application\/ld\+json">\s*\{"@context":"https:\/\/schema\.org","@(type":"(Organization|WebSite)"|graph")[\s\S]*?<\/script>\n?/g, "");
  html = html.replace(/<\/head>/i, function () { return SEO.ldScript(homeJsonLd(dir, meta)) + "\n</head>"; });
  return html.replace(/<!--SEO_INTRO-->[\s\S]*?<!--\/SEO_INTRO-->/, function () { return "<!--SEO_INTRO-->" + homeSeoBlock(dir) + "<!--/SEO_INTRO-->"; });
}

// Pages legales : fil d'Ariane JSON-LD (Accueil > titre h1 de la page).
function injectLegalBreadcrumb(html, dir, file) {
  if (/"@type":\s*"BreadcrumbList"/.test(html)) return html;
  var h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  var name = h1 ? unescHtml(h1.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
  if (!name) return html;
  var ld = SEO.breadcrumbLd([
    { name: SEO.seoConf(dir).breadcrumb.home, url: dirUrl(dir, "index.html") },
    { name: name, url: dirUrl(dir, file) }
  ]);
  return html.replace(/<\/head>/i, function () { return SEO.ldScript(ld) + "\n</head>"; });
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
    dirs[d] = { market: c.market, locale: c.locale, htmlLang: c.htmlLang, intlLocale: c.intlLocale, blogDir: c.blogDir || "", label: c.label, helpline: c.helpline || null };
  });
  return {
    defaultMarket: MARKETS._defaultMarket || "fr", defaultDir: X_DEFAULT_DIR,
    planKeys: MARKETS._planKeys || [], proIntervals: MARKETS._proIntervals || ["week", "month", "year"],
    proDefaultInterval: MARKETS._proDefaultInterval || "month", legalFiles: LEGAL_FILES, dirs: dirs, markets: markets,
    helplines: MARKETS._helplines || {}
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
  marketConfigLib.cache = null;
}

// supabase/functions/create-checkout-session/prices.generated.ts : table des
// prix Pro attendus (unite mineure) et des secrets Stripe par marche et duree,
// recopiee depuis config/markets.json. La fonction s'en sert pour refuser un
// Price Stripe dont devise / periodicite / montant ne correspondent pas au
// prix affiche (jamais de facturation d'un autre prix que celui montre).
function checkoutPriceTable() {
  var out = {};
  Object.keys(MARKETS).filter(function (k) { return k.charAt(0) !== "_"; }).forEach(function (k) {
    var m = MARKETS[k], lib = marketConfigLib(), row = { currency: m.currency, intervals: {} };
    (MARKETS._proIntervals || ["week", "month", "year"]).forEach(function (iv) {
      var amount = lib.proAmount(m.prices || {}, iv);
      var env = m.stripeEnvKeys && m.stripeEnvKeys[iv];
      if (amount == null || !env) return;
      row.intervals[iv] = { unitAmount: Math.round(amount * 100), envKey: env,
        legacyEnvKey: iv === "month" ? (m.stripeEnvKeyLegacyMonth || null) : null };
    });
    out[k] = row;
  });
  return out;
}
function syncCheckoutPriceTable() {
  var file = path.join(ROOT, "supabase/functions/create-checkout-session/prices.generated.ts");
  var body = "// GENERE par scripts/build-locales.js depuis config/markets.json - ne pas modifier a la main.\n" +
    "export type IntervalKey = \"week\" | \"month\" | \"year\";\n" +
    "export type PriceRow = { unitAmount: number; envKey: string; legacyEnvKey: string | null };\n" +
    "export const PRO_INTERVALS: IntervalKey[] = " + JSON.stringify(MARKETS._proIntervals || ["week", "month", "year"]) + ";\n" +
    "export const PRO_DEFAULT_INTERVAL: IntervalKey = " + JSON.stringify(MARKETS._proDefaultInterval || "month") + ";\n" +
    "export const PRO_PRICES: Record<string, { currency: string; intervals: Partial<Record<IntervalKey, PriceRow>> }> = " +
    JSON.stringify(checkoutPriceTable(), null, 2) + ";\n";
  writeIfChanged(file, body);
}

// lib/league-names.js : un nom d'affichage par competition, recopie depuis
// config/leagues.json (displayName) - seule source des noms de competitions.
function leagueNamesData() {
  var out = {};
  readJson("config/leagues.json").leagues.forEach(function (l) {
    out[l.key] = { name: l.displayName, id: l.apiFootballId };
  });
  return out;
}
function syncLeagueNames() {
  var file = path.join(ROOT, "lib/league-names.js");
  var src = fs.readFileSync(file, "utf8");
  var re = /\/\*IASHARK_LEAGUES_DATA_START\*\/[\s\S]*?\/\*IASHARK_LEAGUES_DATA_END\*\//;
  if (!re.test(src)) throw new Error("lib/league-names.js : marqueurs IASHARK_LEAGUES_DATA_START/END introuvables");
  var block = "/*IASHARK_LEAGUES_DATA_START*/\nvar LEAGUES = " + JSON.stringify(leagueNamesData(), null, 2) + ";\n/*IASHARK_LEAGUES_DATA_END*/";
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

  // Blog : /gb/blog/, /za/blog/ et /fr/blog/ repondaient 404 (audit 14/09/2026).
  // Cible = URL servie en 200 sans redirection : /<blogDir>/blog/ ou, pour fr
  // (blog FR racine), /blog.html - jamais /blog/, que Netlify redirige vers
  // /blog (blog.html et blog/index.html coexistent).
  out.push("", "# --- Blog : repertoires sans blog propre -> blog servi (gb, za -> /en/blog/ ;",
    "# fr -> blog FR racine). Cibles = URL finales en 200, jamais une redirection.");
  DIR_CODES.forEach(function (d) {
    var b = DIRS[d].blogDir;
    var hub = b ? "/" + b + "/blog/" : "/blog.html";
    if (!fs.existsSync(path.join(ROOT, d, "blog.html"))) out.push(rule("/" + d + "/blog.html", hub, "301!"));
    if (b === d) return; // blog propre : /<dir>/blog/ existe
    out.push(rule("/" + d + "/blog", hub, "301!"));
    out.push(rule("/" + d + "/blog/", hub, "301!"));
    out.push(rule("/" + d + "/blog/*", (b ? "/" + b + "/blog/" : "/blog/") + ":splat", "301!"));
  });

  // Pages match retirees a J+30 (scripts/match-lifecycle.js) : le bloc suit
  // data/match-pages-registry.json et survit donc a chaque regeneration.
  var retiredMatches = MATCH_LIFECYCLE.redirectsBlockLines(MATCH_LIFECYCLE.loadRegistry(ROOT));
  if (retiredMatches.length) out.push("");
  retiredMatches.forEach(function (l) { out.push(l); });

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
function hasAttr(tag, name) {
  return new RegExp("\\s" + name + "(?=[\\s=>/])").test(tag);
}
function setAttr(tag, name, value) {
  var re = new RegExp("(\\s" + name + "=)\"[^\"]*\"");
  if (re.test(tag)) return tag.replace(re, function (_, p) { return p + "\"" + escAttr(value) + "\""; });
  return tag.replace(/\s*(\/?)>$/, function (_, slash) { return " " + name + "=\"" + escAttr(value) + "\"" + (slash ? " /" : "") + ">"; });
}
// market (optionnel) : cle de marche du repertoire. Les elements marques
// [data-market-legal-operator] (mention "IASHARK n'est pas un operateur",
// a-propos.html) recoivent le texte propre au marche pays
// about_page.legal_not_operator_market.<gb|za|mx> quand il existe.
function bakeI18n(html, dict, market) {
  var stash = [];
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, function (m) { stash.push(m); return "\u0000STASH" + (stash.length - 1) + "\u0000"; });
  var out = "", pos = 0, tagRe = /<([a-zA-Z][\w-]*)\b[^<>]*>/g, m;
  while ((m = tagRe.exec(html))) {
    var tag = m[0], name = m[1].toLowerCase();
    var textKey = attrValue(tag, "data-i18n"), htmlKey = attrValue(tag, "data-i18n-html"), attrSpec = attrValue(tag, "data-i18n-attr");
    if (textKey == null && htmlKey == null && attrSpec == null) continue;
    // Attribut booleen nu dans la source (<li ... data-market-legal-operator>) :
    // attrValue() ne voit que attr="..." -> test de presence dedie (bug : les
    // a-propos /gb/ /za/ /mx/ gardaient le texte ANJ dans le HTML statique).
    if (market && hasAttr(tag, "data-market-legal-operator") &&
        typeof get(dict, "about_page.legal_not_operator_market." + market) === "string") {
      htmlKey = "about_page.legal_not_operator_market." + market;
    }
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

// ---------------------------------------------------------------------------
// Donnees marche ecrites dans le HTML genere (audit QA 14/09/2026 : les pages
// /gb/ /za/ /mx/ affichaient "19,95 €" et la ligne d'aide francaise jusqu'a
// l'execution de lib/market-config.js - flash visible, et contenu faux pour
// les moteurs de recherche). Le runtime reapplique les memes valeurs.
//   [data-market-price="<plan>"]          -> prix du marche (ou attribut
//                                            data-market-price-unavailable)
//   [data-market-price-line="<plan>"][data-market-price-tpl="<cle i18n>"]
//                                         -> gabarit du dictionnaire, {price}
//                                            (+ {pro_week_price}, {pro_month_price},
//                                            {pro_year_price} ; si l'un manque :
//                                            data-market-price-tpl-fallback)
//   [data-market-price-if="<plan>"]       -> hidden si ce prix n'existe pas
//   [data-market-helpline="|name|phone|url"] (+ href sur <a>)
//   [data-market-helpline-if="phone"]     -> hidden sans numero
//   [data-market-label][data-home][data-away] -> libelle de marche dans la
//                                            langue du repertoire
//   <time data-seo-date datetime="YYYY-MM-DD"> -> date longue localisee
function unescHtml(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function rewriteElements(html, attrs, fn) {
  var stash = [];
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, function (m) { stash.push(m); return " STASH" + (stash.length - 1) + " "; });
  var out = "", pos = 0, tagRe = /<([a-zA-Z][\w-]*)\b[^<>]*>/g, m;
  while ((m = tagRe.exec(html))) {
    var tag = m[0], name = m[1].toLowerCase();
    // Attribut avec valeur OU booleen nu (<time data-seo-date datetime=...> :
    // attrValue seul ne le voyait pas, la date restait en francais).
    if (!attrs.some(function (a) { return attrValue(tag, a) != null || hasAttr(tag, a); })) continue;
    var res = fn(tag, name);
    if (!res) continue;
    out += html.slice(pos, m.index) + res.tag;
    pos = m.index + tag.length;
    if (res.inner == null || VOID_TAGS[name] || /\/>$/.test(tag)) continue;
    var depth = 1, scan = new RegExp("<(\\/?)" + name + "\\b[^<>]*>", "gi"), c, closeStart = -1, closeEnd = -1;
    scan.lastIndex = pos;
    while ((c = scan.exec(html))) {
      if (c[1]) { depth--; if (depth === 0) { closeStart = c.index; closeEnd = c.index + c[0].length; break; } }
      else if (!/\/>$/.test(c[0])) depth++;
    }
    if (closeStart === -1) continue;
    out += res.inner + html.slice(closeStart, closeEnd);
    pos = closeEnd;
    tagRe.lastIndex = closeEnd;
  }
  out += html.slice(pos);
  return out.replace(/ STASH(\d+) /g, function (_, i) { return stash[+i]; });
}
function setHidden(tag, hidden) {
  var has = /\shidden(?=[\s>=\/])/.test(tag);
  if (hidden && !has) return tag.replace(/\s*(\/?)>$/, function (_, slash) { return " hidden" + (slash ? " /" : "") + ">"; });
  if (!hidden && has) return tag.replace(/\shidden(="[^"]*")?(?=[\s>\/])/, "");
  return tag;
}
// Gabarit de ligne de prix : {price} + prix Pro par duree. null si le gabarit
// manque ou si une duree citee n'est pas vendue dans ce marche (jamais de
// prix invente : la page tente alors data-market-price-tpl-fallback).
function fillPriceTemplate(tpl, dir, price) {
  if (typeof tpl !== "string") return null;
  var missing = false;
  var out = tpl.replace(/\{price\}/g, price).replace(/\{(pro_week|pro_month|pro_year)_price\}/g, function (all, key) {
    var v = formatPrice(dir, key);
    if (v == null) missing = true;
    return v == null ? all : v;
  });
  return missing ? null : out;
}
var marketLabelsLib = null;
function bakeMarket(html, dir) {
  var conf = DIRS[dir];
  var dict = DICTS[conf.locale];
  var help = helplineFor(dir);
  html = rewriteElements(html, ["data-market-price", "data-market-price-line", "data-market-price-if", "data-market-helpline", "data-market-helpline-if", "data-market-label", "data-seo-date"], function (tag, name) {
    var plan = attrValue(tag, "data-market-price");
    if (plan != null) {
      var price = formatPrice(dir, plan);
      if (price == null) return { tag: setAttr(tag, "data-market-price-unavailable", ""), inner: null };
      return { tag: tag.replace(/\sdata-market-price-unavailable(="[^"]*")?/, ""), inner: escText(price) };
    }
    var linePlan = attrValue(tag, "data-market-price-line");
    if (linePlan != null) {
      var linePrice = formatPrice(dir, linePlan);
      if (linePrice == null) return null;
      var filled = fillPriceTemplate(get(dict, attrValue(tag, "data-market-price-tpl") || ""), dir, linePrice);
      if (filled == null) filled = fillPriceTemplate(get(dict, attrValue(tag, "data-market-price-tpl-fallback") || ""), dir, linePrice);
      return filled == null ? null : { tag: tag, inner: escText(filled) };
    }
    var ifPlan = attrValue(tag, "data-market-price-if");
    if (ifPlan != null) return { tag: setHidden(tag, formatPrice(dir, ifPlan) == null), inner: null };
    var part = attrValue(tag, "data-market-helpline");
    if (part != null) {
      // Ressource absente, ou sans numero : masque ET vide (jamais le numero
      // francais du source laisse dans le HTML d'un autre repertoire).
      if (!help || (part === "phone" && !help.phone)) return { tag: setHidden(tag, true), inner: "" };
      var isLink = name === "a", t = setHidden(tag, false), inner;
      if (part === "name") inner = help.name;
      else if (part === "phone") { inner = help.phone; if (isLink && help.tel) t = setAttr(t, "href", "tel:" + help.tel); }
      else if (part === "url") { inner = help.display || help.url; if (isLink) t = setAttr(t, "href", help.url); }
      else inner = marketConfigLib().helplineText(help);
      return { tag: t, inner: escText(inner) };
    }
    var cond = attrValue(tag, "data-market-helpline-if");
    if (cond != null) return { tag: setHidden(tag, !(help && help[cond])), inner: null };
    var raw = attrValue(tag, "data-market-label");
    if (raw != null) {
      if (conf.locale === "fr") return null; // la source racine est deja en francais
      if (!marketLabelsLib) marketLabelsLib = require("../lib/market-labels.js");
      var home = attrValue(tag, "data-home"), away = attrValue(tag, "data-away");
      var label = marketLabelsLib.marketLabel(unescHtml(raw), { home: home ? unescHtml(home) : undefined, away: away ? unescHtml(away) : undefined }, { locale: conf.locale, dict: dict });
      return { tag: tag, inner: escText(label) };
    }
    if (attrValue(tag, "data-seo-date") != null || hasAttr(tag, "data-seo-date")) {
      var iso = attrValue(tag, "datetime");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
      var d = new Date(iso + "T12:00:00Z");
      return { tag: tag, inner: escText(new Intl.DateTimeFormat(conf.intlLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d)) };
    }
    return null;
  });
  return html;
}

// Landings pays (gb/za/mx) maintenues a la main : jamais regenerees, mais
// leur bloc canonical + hreflang est aligne sur celui des landings de langue
// (audit QA 14/09/2026 : aucun hreflang sur /gb|za|mx/landing, et les
// landings de langue n'annoncaient ni en-GB, ni en-ZA, ni es-MX).
function landingAltDirs() {
  return DIR_CODES.filter(function (d) {
    return DIRS[d].customLanding ? fs.existsSync(path.join(ROOT, d, "landing.html")) : true;
  });
}
function syncCustomLandingHeads(altDirs) {
  DIR_CODES.forEach(function (dir) {
    if (!DIRS[dir].customLanding) return;
    var file = path.join(ROOT, dir, "landing.html");
    if (!fs.existsSync(file)) return;
    var src = fs.readFileSync(file, "utf8");
    writeIfChanged(file, buildHead(src, dir, "landing.html", null, altDirs));
  });
}

function build() {
  syncMarketConfig();
  syncCheckoutPriceTable();
  syncLeagueNames();
  var report = { stale: {}, pages: 0, legal: 0, missingLegal: [], removed: [] };

  PAGES.forEach(function (page) {
    var src = fs.readFileSync(path.join(ROOT, page.file), "utf8");
    var rules = MODULAR_SHELLS.indexOf(page.file) !== -1 ? [] : page.replacements;
    var genDirs = DIR_CODES.filter(function (d) { return !(page.file === "landing.html" && DIRS[d].customLanding); });
    var altDirs = page.file === "landing.html" ? landingAltDirs() : genDirs;
    genDirs.forEach(function (dir) {
      var html = applyReplacements(src, DIRS[dir].locale, rules, report, page.file);
      var countryMarket = ["gb", "za", "mx"].indexOf(DIRS[dir].market) !== -1 ? DIRS[dir].market : null;
      if (DIRS[dir].locale !== "fr" || countryMarket) html = bakeI18n(html, DICTS[DIRS[dir].locale], countryMarket);
      html = bakeMarket(html, dir);
      html = stripUnavailablePageLinks(html, dir);
      html = rewriteInternalLinks(html, dir);
      var meta = metaFor(page, dir);
      html = buildHead(html, dir, page.file, meta, altDirs);
      if (page.file === "index.html") html = rewriteHomeMatchSummary(injectHomeSeo(html, dir, meta), dir);
      // Pied de page : hubs ligue du perimetre, clubs, articles, blog, marches,
      // methodologie de la version (scripts/seo-common.js#injectFooterNav).
      html = SEO.injectFooterNav(html, dir);
      html = injectRuntime(html, dir);
      writeIfChanged(path.join(ROOT, dir, page.file), html);
      report.pages++;
    });
    if (page.file === "landing.html") syncCustomLandingHeads(altDirs);
  });

  LEGAL_FILE_LIST.forEach(function (file) {
    var altDirs = DIR_CODES.filter(function (d) { return legalExists(d, file); });
    DIR_CODES.forEach(function (d) { if (altDirs.indexOf(d) === -1) report.missingLegal.push(d + "/" + file); });
    altDirs.forEach(function (dir) {
      var html = fs.readFileSync(path.join(ROOT, "legal", dir, file), "utf8");
      html = bakeMarket(html, dir);
      html = rewriteInternalLinks(html, dir);
      html = buildHead(html, dir, file, null, altDirs);
      html = injectLegalBreadcrumb(html, dir, file);
      html = SEO.injectFooterNav(html, dir);
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
  bakeMarket: bakeMarket, helplineFor: helplineFor, leagueNamesData: leagueNamesData,
  marketRuntimeData: marketRuntimeData, checkoutPriceTable: checkoutPriceTable, redirectsContent: redirectsContent, build: build,
  stripUnavailablePageLinks: stripUnavailablePageLinks,
  buildHead: buildHead, setHtmlLang: setHtmlLang, injectRuntime: injectRuntime, metaFor: metaFor,
  homeJsonLd: homeJsonLd, homeSeoBlock: homeSeoBlock, rewriteHomeMatchSummary: rewriteHomeMatchSummary
};

if (require.main === module) build();
