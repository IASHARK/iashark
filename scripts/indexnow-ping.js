#!/usr/bin/env node
"use strict";
// IndexNow (23/10/2026, chantier GEO/SEO) : signale chaque jour a Bing (et aux
// autres moteurs du protocole IndexNow : Yandex, Seznam, Naver...) les pages
// du site modifiees le jour meme et la veille. Bing alimente aussi Copilot et
// une partie des recherches de ChatGPT : une page signalee y est relue plus
// vite.
//
// Principe :
//   1. lit le plan du site EN LIGNE : https://iashark.com/sitemap.xml (index)
//      puis chaque sous-sitemap qu'il liste, soit une douzaine de requetes.
//      Le plan en ligne ne liste que des pages publiees : aucune adresse n'est
//      verifiee une par une ;
//   2. garde les adresses https://iashark.com/... dont <lastmod> est le jour
//      demande (jour UTC par defaut, --date AAAA-MM-JJ sinon) ou la veille :
//      un retard de GitHub sur le workflow ou une mise en ligne tardive ne
//      fait perdre aucune page. Celles du jour passent en premier ;
//   3. verifie que la cle est en ligne, puis envoie la liste a
//      https://api.indexnow.org/indexnow par lots de MAX_PER_REQUEST adresses,
//      MAX_PER_RUN au plus par execution.
//
// La cle IndexNow n'est pas un secret : le protocole exige qu'elle soit
// publiee a la racine du site (<cle>.txt, contenu = la cle), ce qui prouve
// que l'envoi vient du proprietaire du domaine. Fichier publie par
// scripts/build-public.js (PUBLIC_ROOT_FILES).
//
// Usage : node scripts/indexnow-ping.js [--date AAAA-MM-JJ] [--dry-run]
//   --dry-run : lit le plan du site en ligne et affiche les adresses retenues,
//   n'envoie rien a IndexNow.
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
// Le protocole accepte 10 000 adresses par envoi ; on reste bien en dessous.
const MAX_PER_REQUEST = 1000;
// Garde-fou par execution (un jour normal : quelques centaines d'adresses).
const MAX_PER_RUN = 2000;
// Garde-fou sur le nombre de sous-sitemaps lus (onze aujourd'hui).
const MAX_SITEMAPS = 50;
const FETCH_TIMEOUT_MS = 30000;

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

// Veille d'un jour AAAA-MM-JJ (calendrier UTC).
function previousDay(day) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Sous-sitemap acceptee : a la racine du site, nommee sitemap*.xml.
function isSiteSitemap(loc) {
  return loc.indexOf(SITE + "/") === 0 && /^sitemap[\w-]*\.xml$/.test(loc.slice(SITE.length + 1));
}

// Adresses du site dont <lastmod> (date ou date-heure ISO) tombe sur l'un des
// jours demandes, sans doublon ; celles de days[0] d'abord, puis days[1]...
function selectUrls(urlsetXmls, days) {
  const byDay = days.map(function () { return []; });
  const seen = new Set();
  urlsetXmls.forEach(function (xml) {
    locs(xml, "url").forEach(function (u) {
      const i = u.lastmod ? days.indexOf(u.lastmod.slice(0, 10)) : -1;
      if (i === -1 || u.loc.indexOf(SITE + "/") !== 0 || seen.has(u.loc)) return;
      seen.add(u.loc);
      byDay[i].push(u.loc);
    });
  });
  return [].concat.apply([], byDay);
}

async function fetchText(url, fetchImpl) {
  // Aucune redirection suivie : le plan du site doit repondre 200 tel quel.
  const r = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status !== 200) throw new Error("reponse " + r.status);
  return r.text();
}

// Lit le plan du site en ligne (index puis sous-sitemaps). Une sous-sitemap
// illisible est notee dans `failures` sans bloquer les autres ; un index
// illisible arrete tout.
async function urlsModifiedOnline(days, opts) {
  const f = (opts && opts.fetch) || fetch;
  let index;
  try {
    index = await fetchText(SITE + "/sitemap.xml", f);
  } catch (e) {
    throw new Error("plan du site illisible en ligne (" + SITE + "/sitemap.xml : " + e.message + ")");
  }
  const urlsets = [];
  const failures = [];
  let subs = [];
  if (/<sitemapindex\b/.test(index)) {
    subs = Array.from(new Set(locs(index, "sitemap").map(function (s) { return s.loc; }).filter(isSiteSitemap))).slice(0, MAX_SITEMAPS);
    for (const u of subs) {
      try {
        urlsets.push(await fetchText(u, f));
      } catch (e) {
        failures.push(u + " (" + e.message + ")");
      }
    }
  } else {
    urlsets.push(index);
  }
  return { urls: selectUrls(urlsets, days), sitemaps: subs.length, failures: failures };
}

function batches(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function payload(urlList) {
  return { host: HOST, key: KEY, keyLocation: SITE + "/" + KEY_FILE, urlList: urlList };
}

async function main(argv, deps) {
  const f = (deps && deps.fetch) || fetch;
  const log = (deps && deps.log) || console.log;
  const args = argv.slice(2);
  const dateArg = args.indexOf("--date") !== -1 ? args[args.indexOf("--date") + 1] : null;
  const day = dateArg || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(Date.parse(day + "T00:00:00Z"))) throw new Error("--date attend AAAA-MM-JJ (recu : " + day + ")");
  const dry = args.indexOf("--dry-run") !== -1;
  const keyOnDisk = fs.existsSync(path.join(ROOT, KEY_FILE)) ? fs.readFileSync(path.join(ROOT, KEY_FILE), "utf8").trim() : null;
  if (keyOnDisk !== KEY) throw new Error("fichier de cle " + KEY_FILE + " absent ou different de la cle du script");

  const days = [day, previousDay(day)];
  const found = await urlsModifiedOnline(days, { fetch: f });
  log("IndexNow : plan du site lu en ligne (" + found.sitemaps + " sous-sitemap(s), " + found.failures.length + " illisible(s)) : " +
    found.urls.length + " adresse(s) modifiee(s) le " + days[0] + " ou le " + days[1] + ".");
  found.failures.forEach(function (x) { log("  illisible : " + x); });
  if (found.sitemaps > 0 && found.failures.length === found.sitemaps) throw new Error("aucune sous-sitemap lisible en ligne");

  let urls = found.urls;
  if (urls.length > MAX_PER_RUN) {
    log("IndexNow : limite de " + MAX_PER_RUN + " adresses par execution, " + (urls.length - MAX_PER_RUN) + " laissee(s) de cote (celles du jour passent en premier).");
    urls = urls.slice(0, MAX_PER_RUN);
  }
  if (dry) urls.forEach(function (u) { log("  " + u); });

  let sent = 0;
  if (urls.length && !dry) {
    // La cle doit etre en ligne, sinon IndexNow refuse l'envoi (403).
    let keyOnline = null;
    try { keyOnline = (await fetchText(SITE + "/" + KEY_FILE, f)).trim(); } catch (e) { keyOnline = null; }
    if (keyOnline !== KEY) throw new Error("cle IndexNow introuvable en ligne (" + SITE + "/" + KEY_FILE + ") : site pas encore publie ?");
    for (const batch of batches(urls, MAX_PER_REQUEST)) {
      const r = await f(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload(batch)),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      // 200 : recu ; 202 : recu, cle en cours de verification.
      if (r.status !== 200 && r.status !== 202) throw new Error("IndexNow a repondu " + r.status + " : " + (await r.text()).slice(0, 300));
      sent += batch.length;
      log("IndexNow : lot de " + batch.length + " adresse(s) envoye (" + r.status + ").");
    }
  }
  // Sous-sitemap illisible : les autres adresses sont parties, mais le
  // workflow passe en rouge pour que le probleme se voie.
  if (found.failures.length) throw new Error(found.failures.length + " sous-sitemap(s) illisible(s) en ligne");
  return sent;
}

if (require.main === module) {
  main(process.argv).catch(function (e) { console.error("IndexNow : " + e.message); process.exit(1); });
}

module.exports = {
  KEY: KEY, KEY_FILE: KEY_FILE, HOST: HOST, ENDPOINT: ENDPOINT,
  MAX_PER_REQUEST: MAX_PER_REQUEST, MAX_PER_RUN: MAX_PER_RUN,
  locs: locs, previousDay: previousDay, selectUrls: selectUrls,
  urlsModifiedOnline: urlsModifiedOnline, batches: batches, payload: payload, main: main,
};
