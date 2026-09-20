#!/usr/bin/env node
"use strict";
// Construit dist/ : UNIQUEMENT les fichiers reellement publics du site.
//
// Avant ce script, Netlify publiait la racine du depot : documents internes,
// migrations SQL, code des fonctions Supabase, scripts, tests et donnees brutes
// d'API etaient accessibles par URL (audit QA du 14/09/2026). Netlify publie
// desormais dist/ (netlify.toml).
//
// Principe : on part d'une liste courte de sources publiques (repertoires de
// langue/pays generes, pages match, blog, assets, i18n, fichiers Netlify et
// donnees publiques), puis on AJOUTE automatiquement chaque fichier local
// reference par une page ou un script publie (src/href, et chemins litteraux
// '/xxx.js' ou '/xxx.json' dans le JS). Rien d'autre n'est copie.
//
// Usage : node scripts/build-public.js [--out dist] [--check]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
// --out relatif a la racine du depot, ou absolu (tests : repertoire temporaire).
const OUT = path.resolve(ROOT, args.includes("--out") ? args[args.indexOf("--out") + 1] : "dist");
const CHECK_ONLY = args.includes("--check");

// Repertoires publics copies en entier.
// "results" : resultats passes publies (onglet « Hier », docs/SPEC_RESULTATS_HIER.md).
// results/<YYYY-MM-DD>.json + results/index.json, ecrits par le pipeline quotidien.
// Ils ne contiennent que des matchs dont l'API a donne un statut final : aucun pari
// de match a venir n'y figure (lib/match-results.js, tests/match-results.test.js).
const PUBLIC_DIRS = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx", "match", "results", "blog", "assets", "i18n/dict"];
// Fichiers racine publics.
const PUBLIC_ROOT_FILES = [
  "index.html", "404.html", "admin.html", "blog.html",
  "robots.txt", "_redirects", "_headers",
  "favicon.ico", "favicon-32x32.png", "favicon-512.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  // data.json (~13 Mo) n'est plus publie (16/09/2026, quota Netlify depasse le
  // 15/09) : aucune page, aucun script, aucune fonction ne le lit en ligne
  // (tests/netlify-usage.test.js). Il reste dans le depot pour le pipeline.
  // actus.json et transferts.json restent : lus par blog/index.html.
  "data-home.json", "actus.json", "transferts.json",
  "i18n/i18n.js",
];
const ASSET_EXT = /\.(js|json|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|txt|xml|webmanifest)$/i;

function exists(rel) {
  try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch (e) { return false; }
}
function walk(dirRel, out) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return;
  for (const name of fs.readdirSync(abs)) {
    if (name.startsWith(".")) continue;
    const rel = path.posix.join(dirRel, name);
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else out.add(rel);
  }
}

const files = new Set();
PUBLIC_DIRS.forEach(function (d) { walk(d, files); });
PUBLIC_ROOT_FILES.forEach(function (f) { if (exists(f)) files.add(f); });
fs.readdirSync(ROOT).filter(function (f) { return /^sitemap.*\.xml$/.test(f); }).forEach(function (f) { files.add(f); });

// Decouverte des references locales (pages et scripts publies).
function refsOf(rel, content) {
  const refs = [];
  const baseDir = path.posix.dirname(rel);
  const push = function (p) {
    if (!p || /^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(p) || p.startsWith("//")) return;
    p = p.split("#")[0].split("?")[0];
    if (!p) return;
    const r = p.startsWith("/") ? p.slice(1) : path.posix.normalize(path.posix.join(baseDir, p));
    if (ASSET_EXT.test(r)) refs.push(r);
  };
  if (/\.html$/.test(rel)) {
    const re = /(?:src|href)\s*=\s*"([^"]+)"/gi;
    let m;
    while ((m = re.exec(content))) push(m[1]);
  }
  if (/\.(js|html)$/.test(rel)) {
    const re2 = /['"`](\/?[A-Za-z0-9_\-./]+\.(?:js|json|css))['"`]/g;
    let m2;
    while ((m2 = re2.exec(content))) {
      const p = m2[1];
      // Chemins relatifs nus ('data.json') : resolus depuis la racine du site.
      push(p.startsWith("/") || p.startsWith(".") ? p : "/" + p);
    }
  }
  return refs;
}

const queue = Array.from(files);
const missing = new Map();
while (queue.length) {
  const rel = queue.shift();
  if (!/\.(html|js)$/.test(rel)) continue;
  let content;
  try { content = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { continue; }
  for (const r of refsOf(rel, content)) {
    if (files.has(r)) continue;
    if (exists(r)) { files.add(r); queue.push(r); }
    else if (!missing.has(r)) missing.set(r, rel);
  }
}

// Garde-fous : jamais de fichiers internes dans dist/, meme references.
const FORBIDDEN = /^(supabase|scripts|tests|docs|raw_api|config|data|remotion-score-template|prototypes|iashark-v2-concept|tools|legal|node_modules)\/|\.md$|^\.|(^|\/)\.env|\.sql$|\.py$/;
const forbidden = Array.from(files).filter(function (f) { return FORBIDDEN.test(f); });
if (forbidden.length) {
  console.error("REFUS : fichiers internes references par des pages publiques :\n  " + forbidden.join("\n  "));
  process.exit(1);
}

// Jamais publies, meme references par une page : historique des paris (depot
// uniquement, audit fuite du 14/09/2026) et data.json (16/09/2026, bande passante).
const NEVER_PUBLISH = /^(historique|data)\.json$/;
Array.from(files).forEach(function (f) { if (NEVER_PUBLISH.test(f)) files.delete(f); });

if (CHECK_ONLY) {
  console.log(files.size + " fichier(s) publics.");
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const rel of files) {
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (/\.html$/.test(rel)) {
      // Notes internes (revue juridique, brouillons, decisions bloquees) :
      // utiles dans le depot, jamais publiees dans le HTML servi.
      const html = fs.readFileSync(path.join(ROOT, rel), "utf8")
        .replace(/<!--\s*(LEGAL REVIEW|DRAFT|BLOCKED_DECISION|TODO|NOTE INTERNE)[\s\S]*?-->\s*/g, "");
      fs.writeFileSync(dest, html);
    } else {
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }
  }
  console.log("dist/ : " + files.size + " fichier(s) publics copies.");
  optimizeDist(OUT, files);
}

// ---------------------------------------------------------------------------
// PERFORMANCE (audit du 15/09/2026). Appliquee a la COPIE publiee (dist/),
// jamais aux sources : couvre aussi les pages ecrites par le pipeline.
//   1. logo du site en WebP (assets/iashark-logo.webp, 660 px) avec repli PNG,
//      dimensions posees ;
//   2. <link rel="preload" as="fetch" crossorigin> du dictionnaire i18n de la
//      page. crossorigin (anonymous) = meme mode que fetch() dans i18n/i18n.js
//      (cors, credentials same-origin) : le preload est reutilise, jamais
//      telecharge deux fois ;
//   3. preconnect vers cdn.jsdelivr.net (supabase-js) et, sur les pages match,
//      media.api-sports.io (logos de l'en-tete, element LCP) ;
//   4. empreinte ?v=<sha256 du contenu, 10 car.> sur chaque reference locale a
//      un JS, un CSS ou une image (HTML, JS, CSS), puis regles Cache-Control
//      immutables des JS/CSS hors /assets/ ajoutees a dist/_headers ;
//   5. garde-fou : supabase-js toujours epingle a une version exacte.
function optimizeDist(outDir, published) {
  const crypto = require("crypto");
  const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
  const DIR_LOCALE = {};
  Object.keys(MARKETS._dirs).forEach(function (d) { DIR_LOCALE[d] = MARKETS._dirs[d].locale; });
  const SUPPORTED = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  const VERSIONED = /\.(js|css|png|jpe?g|svg|webp|gif|ico|woff2?)$/i;
  const EXT = "js|css|png|jpe?g|svg|webp|gif|ico|woff2?";
  const rel = Array.from(published).sort();
  const abs = function (r) { return path.join(outDir, r); };
  const readText = function (r) { return fs.readFileSync(abs(r), "utf8"); };
  const pub = new Set(rel);
  const sha = function (buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10); };

  const unpinned = [];
  rel.filter(function (r) { return /\.(html|js)$/.test(r); }).forEach(function (r) {
    if (/@supabase\/supabase-js@(?!\d+\.\d+\.\d+\/)/.test(readText(r))) unpinned.push(r);
  });
  if (unpinned.length) {
    console.error("REFUS : supabase-js non epingle a une version exacte :\n  " + unpinned.slice(0, 20).join("\n  "));
    process.exit(1);
  }

  // Scripts qui chargent le dictionnaire (I18N.init / I18N.loadDict).
  const dictLoaders = new Set(rel.filter(function (r) { return /\.js$/.test(r) && /I18N\.init\(|\.loadDict\(/.test(readText(r)); }));
  function pageLocale(r, html) {
    const m = r.match(/^([a-z]{2})\//);
    if (m && DIR_LOCALE[m[1]]) return DIR_LOCALE[m[1]];
    const forced = html.match(/<meta name="iashark-force-locale" content="([^"]+)"/);
    if (forced && SUPPORTED.indexOf(forced[1]) !== -1) return forced[1];
    const lang = html.match(/<html\b[^>]*\slang="([^"]+)"/i);
    if (!lang) return null; // locale memorisee du visiteur (localStorage) : inconnue au build
    const l = lang[1].toLowerCase();
    if (SUPPORTED.indexOf(l) !== -1) return l;
    return SUPPORTED.indexOf(l.split("-")[0]) !== -1 ? l.split("-")[0] : null;
  }
  const scriptSrcs = function (html) { return Array.from(html.matchAll(/<script\b[^>]*\ssrc="\/([^"?#]+)"/g)).map(function (x) { return x[1]; }); };
  function headHints(r, html) {
    const head = html.split(/<\/head>/i)[0];
    const hints = [];
    const srcs = scriptSrcs(html);
    const loadsI18n = srcs.indexOf("i18n/i18n.js") !== -1 || srcs.indexOf("site-header.js") !== -1;
    const initsDict = /I18N\.init\(/.test(html) || srcs.some(function (s) { return dictLoaders.has(s); });
    const locale = loadsI18n && initsDict ? pageLocale(r, html) : null;
    if (locale && pub.has("i18n/dict/" + locale + ".json") && !/rel="preload"[^>]*\/i18n\/dict\//.test(head)) {
      hints.push('<link rel="preload" href="/i18n/dict/' + locale + '.json" as="fetch" crossorigin>');
    }
    // Feuille chargee par @import dans une feuille de la page (match-page.css ->
    // tailwind.css) : decouverte seulement apres le telechargement de la
    // premiere, elle retardait le premier affichage. Preload des le <head>.
    Array.from(head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(\/[^"?#]+\.css)"/g)).forEach(function (l) {
      const css = l[1].slice(1);
      if (!pub.has(css)) return;
      Array.from(fs.readFileSync(path.join(ROOT, css), "utf8").matchAll(/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/g)).forEach(function (imp) {
        const target = resolve(css, imp[1]);
        if (target && pub.has(target) && !new RegExp('href="/' + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"').test(head)) {
          hints.push('<link rel="preload" href="/' + target + '" as="style">');
        }
      });
    });
    if (/<script\b[^>]*src="https:\/\/cdn\.jsdelivr\.net\//.test(html) && !/rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net"/.test(head)) {
      hints.push('<link rel="preconnect" href="https://cdn.jsdelivr.net">');
    }
    // Pages match (logos de l'en-tete) et pages championnat / club / derby dont
    // l'image principale (fetchpriority="high") est un logo api-sports : LCP.
    const apiSportsHero = /<img\b[^>]*\ssrc="https:\/\/media\.api-sports\.io\/[^"]*"[^>]*\sfetchpriority="high"/.test(html);
    if ((/id="matchRoot"/.test(html) || apiSportsHero) && !/rel="preconnect" href="https:\/\/media\.api-sports\.io"/.test(head)) {
      hints.push('<link rel="preconnect" href="https://media.api-sports.io">');
    }
    if (!hints.length) return html;
    const anchor = /<meta name="viewport"[^>]*>/i.test(head) ? /<meta name="viewport"[^>]*>/i : /<meta charset[^>]*>/i;
    if (!anchor.test(head)) return html;
    return html.replace(anchor, function (m) { return m + hints.join(""); });
  }
  // Logo : <picture> WebP + PNG, hors blocs <script> (chaines JS intactes).
  const hasWebpLogo = pub.has("assets/iashark-logo.webp");
  function webpLogo(html) {
    if (!hasWebpLogo) return html;
    const stash = [];
    html = html.replace(/<script\b[\s\S]*?<\/script>/gi, function (m) { stash.push(m); return " S" + (stash.length - 1) + " "; });
    html = html.replace(/<img\b([^>]*?)\ssrc="\/assets\/iashark-logo\.png"([^>]*)>/g, function (m, a, b) {
      let attrs = a + ' src="/assets/iashark-logo.png"' + b;
      if (!/\swidth="/.test(attrs)) attrs = attrs.replace(/\s*\/?$/, "") + ' width="1648" height="440"';
      return '<picture style="display:contents"><source srcset="/assets/iashark-logo.webp" type="image/webp"><img' + attrs + "></picture>";
    });
    return html.replace(/ S(\d+) /g, function (_, i) { return stash[+i]; });
  }

  // Empreintes : JS/CSS reecrits d'abord (leurs propres references), puis hash
  // du contenu reecrit ; ordre de dependance, memoise.
  const memo = new Map();
  const unversioned = new Map(); // cible -> fichier qui la reference sans empreinte
  const resolve = function (from, p) {
    if (/^(https?:|data:|mailto:|tel:|#|javascript:)/i.test(p) || p.startsWith("//")) return null;
    return p.startsWith("/") ? p.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(from), p));
  };
  function withVersion(from, p, stack) {
    const target = resolve(from, p);
    if (!target || !VERSIONED.test(target) || !pub.has(target)) return null;
    const v = versionOf(target, stack);
    if (!v) { if (!unversioned.has(target)) unversioned.set(target, from); return null; }
    return p + "?v=" + v;
  }
  function rewrite(r, text, stack) {
    const isHtml = /\.html$/.test(r), isCss = /\.css$/.test(r);
    if (!isCss) {
      // Chemins absolus entre guillemets : attributs src/href du HTML et
      // litteraux JS ('/lib/x.js', "/assets/y.png").
      text = text.replace(new RegExp("([\"'`])(\\/(?!\\/)[A-Za-z0-9_\\-./]+\\.(?:" + EXT + "))\\1", "g"), function (m, q, p) {
        const nv = withVersion(r, p, stack);
        return nv ? q + nv + q : m;
      });
    }
    if (isHtml) {
      // Attributs relatifs (href="article.css") et srcset.
      text = text.replace(new RegExp("(\\s(?:src|href)=\")(?![/#]|[a-z][a-z0-9+.-]*:)([^\"?#\\s]+\\.(?:" + EXT + "))\"", "gi"), function (m, pre, p) {
        const nv = withVersion(r, p, stack);
        return nv ? pre + nv + '"' : m;
      });
      text = text.replace(/(\ssrcset=")([^"]+)"/gi, function (m, pre, val) {
        return pre + val.split(",").map(function (part) {
          const bits = part.trim().split(/\s+/);
          if (!bits[0] || /\?/.test(bits[0])) return part;
          const nv = withVersion(r, bits[0], stack);
          return (part.match(/^\s*/)[0]) + [nv || bits[0]].concat(bits.slice(1)).join(" ");
        }).join(",") + '"';
      });
    }
    if (isCss) {
      text = text.replace(/url\(\s*(['"]?)([^'")?#\s]+)\1\s*\)/g, function (m, q, p) {
        const nv = withVersion(r, p, stack);
        return nv ? "url(" + q + nv + q + ")" : m;
      });
    }
    return text;
  }
  function versionOf(r, stack) {
    if (memo.has(r)) return memo.get(r);
    if (!/\.(js|css)$/.test(r)) { const h = sha(fs.readFileSync(abs(r))); memo.set(r, h); return h; }
    stack = stack || new Set();
    if (stack.has(r)) return null; // dependance circulaire : reference laissee sans empreinte
    stack.add(r);
    const out = rewrite(r, readText(r), stack);
    stack.delete(r);
    fs.writeFileSync(abs(r), out);
    const h = sha(out);
    memo.set(r, h);
    return h;
  }
  rel.filter(function (r) { return /\.(js|css)$/.test(r); }).forEach(function (r) { versionOf(r); });
  let pages = 0, preloads = 0;
  rel.filter(function (r) { return /\.html$/.test(r); }).forEach(function (r) {
    let html = readText(r);
    html = headHints(r, webpLogo(html));
    if (/rel="preload" href="\/i18n\/dict\//.test(html)) preloads++;
    fs.writeFileSync(abs(r), rewrite(r, html));
    pages++;
  });

  // Cache long des JS/CSS hors /assets/ (couverts par la regle /assets/*) :
  // uniquement si aucune reference publiee ne les vise sans empreinte.
  const immutable = rel.filter(function (r) { return /\.(js|css)$/.test(r) && !/^assets\//.test(r) && !unversioned.has(r); });
  if (pub.has("_headers")) {
    const block = ["", "# --- GENERE par scripts/build-public.js : JS/CSS publies hors /assets/, toutes",
      "# leurs references portent ?v=<empreinte du contenu> -> cache long sans risque."];
    immutable.forEach(function (r) { block.push("/" + r, "  Cache-Control: public, max-age=31536000, immutable"); });
    fs.appendFileSync(abs("_headers"), block.join("\n") + "\n");
  }
  console.log("Perf : " + pages + " page(s), " + preloads + " preload(s) de dictionnaire, " + memo.size + " empreinte(s), " +
    immutable.length + " JS/CSS immutables hors /assets/.");
  if (unversioned.size) {
    console.log("References sans empreinte (cache par defaut conserve) : " + unversioned.size);
    Array.from(unversioned.entries()).slice(0, 10).forEach(function (e) { console.log("  " + e[0] + "  <-  " + e[1]); });
  }
}
// Les references manquantes sont signalees (souvent des chemins construits ou
// des exemples dans du code) sans bloquer le build.
const miss = Array.from(missing.entries()).filter(function (e) { return !/^(fr|en|es|de|it|pt|gb|za|mx)\/$/.test(e[0]); });
if (miss.length) {
  console.log("References locales introuvables (ignorees) : " + miss.length);
  miss.slice(0, 15).forEach(function (e) { console.log("  " + e[0] + "  <-  " + e[1]); });
}
