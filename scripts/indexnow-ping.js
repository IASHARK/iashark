#!/usr/bin/env node
"use strict";
// IndexNow (23/10/2026, chantier GEO/SEO) : signale chaque jour a Bing (et aux
// autres moteurs du protocole IndexNow : Yandex, Seznam, Naver...) les pages
// du site modifiees ce jour-la. Bing alimente aussi Copilot et une partie des
// recherches de ChatGPT : une page signalee y est relue plus vite.
//
// Principe :
//   1. lit sitemap.xml puis chaque sitemap qu'il liste (fichiers du depot,
//      ceux que Netlify publie) ;
//   2. garde les adresses https://iashark.com/... dont <lastmod> est la date
//      demandee (jour UTC par defaut, --date AAAA-MM-JJ sinon) ;
//   3. verifie que chacune repond 200 EN LIGNE (requete HEAD, aucune
//      redirection suivie) : jamais une adresse absente ou redirigee ;
//   4. envoie la liste a https://api.indexnow.org/indexnow (lots de 10 000
//      adresses au plus, limite du protocole).
//
// La cle IndexNow n'est pas un secret : le protocole exige qu'elle soit
// publiee a la racine du site (<cle>.txt, contenu = la cle), ce qui prouve
// que l'envoi vient du proprietaire du domaine. Fichier publie par
// scripts/build-public.js (PUBLIC_ROOT_FILES).
//
// Usage : node scripts/indexnow-ping.js [--date AAAA-MM-JJ] [--dry-run]
//   --dry-run : affiche les adresses retenues, n'envoie rien a IndexNow.
// Lance par .github/workflows/indexnow.yml (une fois par jour, apres le
// pipeline du matin). Ne modifie aucun fichier.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HOST = "iashark.com";
const SITE = "https://" + HOST;
const KEY = "6942b659d16a7efdcdd4336da549f112";
const KEY_FILE = KEY + ".txt";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_PER_REQUEST = 10000;
const CHECK_CONCURRENCY = 6;

function locs(xml, tag) {
  // <url> ou <sitemap> : adresse + date de modification eventuelle.
  const out = [];
  const re = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">", "g");
  let m;
  while ((m = re.exec(xml))) {
    const loc = (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1];
    const lastmod = (m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/) || [])[1] || null;
    if (loc) out.push({ loc: loc, lastmod: lastmod });
  }
  return out;
}

// Fichier local d'une adresse de sitemap (https://iashark.com/sitemap-fr.xml
// -> sitemap-fr.xml). null hors du site ou hors de la racine.
function localSitemap(loc, root) {
  if (loc.indexOf(SITE + "/") !== 0) return null;
  const rel = loc.slice(SITE.length + 1);
  if (!/^sitemap[\w-]*\.xml$/.test(rel)) return null;
  const p = path.join(root, rel);
  return fs.existsSync(p) ? p : null;
}

// Adresses dont lastmod commence par `day` (AAAA-MM-JJ, ou date-heure ISO).
function urlsModifiedOn(day, root) {
  root = root || ROOT;
  const index = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  const seen = new Set();
  const urls = [];
  const files = /<sitemapindex\b/.test(index)
    ? locs(index, "sitemap").map(function (s) { return localSitemap(s.loc, root); }).filter(Boolean)
    : [path.join(root, "sitemap.xml")];
  files.forEach(function (f) {
    locs(fs.readFileSync(f, "utf8"), "url").forEach(function (u) {
      if (!u.lastmod || u.lastmod.slice(0, 10) !== day) return;
      if (u.loc.indexOf(SITE + "/") !== 0 || seen.has(u.loc)) return;
      seen.add(u.loc);
      urls.push(u.loc);
    });
  });
  return urls;
}

async function isLive(url) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "manual" });
    return r.status === 200;
  } catch (e) {
    return false;
  }
}

async function filterLive(urls) {
  const ok = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const u = urls[i++];
      if (await isLive(u)) ok.push(u);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, urls.length) }, worker));
  return urls.filter(function (u) { return ok.indexOf(u) !== -1; });
}

function payload(urlList) {
  return { host: HOST, key: KEY, keyLocation: SITE + "/" + KEY_FILE, urlList: urlList };
}

async function main(argv) {
  const args = argv.slice(2);
  const dateArg = args.indexOf("--date") !== -1 ? args[args.indexOf("--date") + 1] : null;
  const day = dateArg || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("--date attend AAAA-MM-JJ (recu : " + day + ")");
  const dry = args.indexOf("--dry-run") !== -1;
  const keyOnDisk = fs.existsSync(path.join(ROOT, KEY_FILE)) ? fs.readFileSync(path.join(ROOT, KEY_FILE), "utf8").trim() : null;
  if (keyOnDisk !== KEY) throw new Error("fichier de cle " + KEY_FILE + " absent ou different de la cle du script");

  const candidates = urlsModifiedOn(day);
  console.log("IndexNow : " + candidates.length + " adresse(s) des sitemaps modifiee(s) le " + day + ".");
  if (!candidates.length) return 0;
  if (dry) { candidates.forEach(function (u) { console.log("  " + u); }); return 0; }

  // La cle doit etre en ligne, sinon IndexNow refuse l'envoi (403).
  if (!(await isLive(SITE + "/" + KEY_FILE))) throw new Error("cle IndexNow introuvable en ligne (" + SITE + "/" + KEY_FILE + ") : site pas encore publie ?");
  const live = await filterLive(candidates);
  console.log("IndexNow : " + live.length + " adresse(s) en ligne (200), " + (candidates.length - live.length) + " ecartee(s).");
  for (let i = 0; i < live.length; i += MAX_PER_REQUEST) {
    const batch = live.slice(i, i + MAX_PER_REQUEST);
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload(batch)),
    });
    // 200 : recu ; 202 : recu, cle en cours de verification.
    if (r.status !== 200 && r.status !== 202) throw new Error("IndexNow a repondu " + r.status + " : " + (await r.text()).slice(0, 300));
    console.log("IndexNow : lot de " + batch.length + " adresse(s) envoye (" + r.status + ").");
  }
  return live.length;
}

if (require.main === module) {
  main(process.argv).catch(function (e) { console.error("IndexNow : " + e.message); process.exit(1); });
}

module.exports = { KEY: KEY, KEY_FILE: KEY_FILE, HOST: HOST, ENDPOINT: ENDPOINT, urlsModifiedOn: urlsModifiedOn, payload: payload, locs: locs };
