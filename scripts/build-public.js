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
const OUT = path.join(ROOT, args.includes("--out") ? args[args.indexOf("--out") + 1] : "dist");
const CHECK_ONLY = args.includes("--check");

// Repertoires publics copies en entier.
const PUBLIC_DIRS = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx", "match", "blog", "assets", "i18n/dict"];
// Fichiers racine publics.
const PUBLIC_ROOT_FILES = [
  "index.html", "404.html", "admin.html", "blog.html",
  "robots.txt", "_redirects", "_headers",
  "favicon.ico", "favicon-32x32.png", "favicon-512.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "data.json", "actus.json", "transferts.json",
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
}
// Les references manquantes sont signalees (souvent des chemins construits ou
// des exemples dans du code) sans bloquer le build.
const miss = Array.from(missing.entries()).filter(function (e) { return !/^(fr|en|es|de|it|pt|gb|za|mx)\/$/.test(e[0]); });
if (miss.length) {
  console.log("References locales introuvables (ignorees) : " + miss.length);
  miss.slice(0, 15).forEach(function (e) { console.log("  " + e[0] + "  <-  " + e[1]); });
}
