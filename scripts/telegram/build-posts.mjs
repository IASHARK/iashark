#!/usr/bin/env node
// Prepare les messages du canal Telegram a partir des fichiers du pipeline.
//   node scripts/telegram/build-posts.mjs --slot <apres-maj|sondage|actu|guide|tout> --out <dossier>
// Ecrit <dossier>/posts.json (+ match-gratuit.png pour le match gratuit).
// Ne publie rien : l'envoi est fait par send-posts.mjs.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const require = createRequire(import.meta.url);
const P = require("../../lib/telegram-posts.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const SLOT = arg("--slot", "tout");
const OUT = path.resolve(arg("--out", "telegram-out"));
fs.mkdirSync(OUT, {recursive: true});
const lire = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return null; } };

// Dates en heure de Paris (le site raisonne en heure de Paris).
const paris = (d) => new Intl.DateTimeFormat("sv-SE", {timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"}).format(d);
const now = new Date();
const TODAY = paris(now).slice(0, 10);
const NOW_HM = paris(now).slice(11, 16);
const hier = new Date(Date.parse(TODAY + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);

const home = lire("data-home.json");
const frais = home && home.generated_at && paris(new Date(home.generated_at)).slice(0, 10) === TODAY;
const posts = [];
const note = (m) => console.log(m);
const veut = (s) => SLOT === "tout" || SLOT === s || (SLOT === "apres-maj" && (s === "resultats" || s === "match"));

if (veut("resultats")) {
  const p = P.resultats(lire(`results/${hier}.json`));
  p ? posts.push(p) : note(`resultats : pas de bilan pour ${hier}, pas de message`);
}
if (veut("match")) {
  if (!frais) note("match : donnees du jour pas encore pretes, pas de message");
  else {
    const full = lire("data.json");
    let p = P.matchGratuit(home, full, `${TODAY} ${NOW_HM}`);
    // Sans designation du jour (is_free), le pari, sa cote et la chance du match restent dans
    // la base protegee (match_premium_data, 03/09/2026) : on les y lit pour ce seul match.
    if (p && !p.carte.pari) {
      const prot = await chiffresProteges(p.matchId);
      const base = ((full && (full.matchs || full)) || []).find((x) => x && String(x.id) === String(p.matchId))
        || (home.matchs || []).find((x) => x && String(x.id) === String(p.matchId));
      if (prot && base) p = P.matchGratuit(home, {matchs: [{...base, ...prot}]}, `${TODAY} ${NOW_HM}`) || p;
    }
    if (!p) note(`match : pas de match gratuit a venir ce jour (${TODAY}), pas de message`);
    else { p.image = await carte(p.carte); posts.push(p); }
  }
}
if (veut("sondage")) {
  if (!frais) note("sondage : donnees du jour pas encore pretes, pas de message");
  else {
    // Seulement un match qui commence au moins 1 h apres l'envoi.
    const min = new Date(Date.parse(`${TODAY}T${NOW_HM}:00Z`) + 3600000).toISOString().slice(11, 16);
    const p = P.sondage(home, TODAY, SLOT === "tout" ? "00:00" : min);
    p ? posts.push(p) : note("sondage : pas d'affiche ce soir, pas de message");
  }
}
if (veut("soir")) {
  if (!frais) note("soir : donnees du jour pas encore pretes, pas de message");
  else {
    const p = P.soir(home, TODAY, SLOT === "tout" ? "00:00" : NOW_HM);
    p ? posts.push(p) : note("soir : pas de match ce soir, pas de message");
  }
}
if (veut("actu")) {
  const p = P.actu(lire("actus.json"), now.getTime());
  p ? posts.push(p) : note("actu : pas assez de titres fiables des dernieres 24 h, pas de message");
}
if (veut("guide")) {
  const guides = [];
  for (const dir of ["blog/guides", "fr/articles"]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".html") && f !== "index.html").sort()) {
      const h = fs.readFileSync(path.join(ROOT, dir, f), "utf8");
      const title = (h.match(/<title>([^<]+)<\/title>/) || [])[1];
      const url = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
      const description = (h.match(/<meta name="description" content="([^"]+)"/) || [])[1];
      const dec = (s) => s && s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s*[|—-]\s*IASHARK\s*$/i, "").trim();
      if (title && url && url.startsWith("https://iashark.com/")) guides.push({title: dec(title), url, description: dec(description)});
    }
  }
  const p = P.guide(guides, TODAY);
  p ? posts.push(p) : note("guide : aucun guide trouve");
}

fs.writeFileSync(path.join(OUT, "posts.json"), JSON.stringify({date: TODAY, slot: SLOT, posts}, null, 2));
console.log(`${posts.length} message(s) prets : ${posts.map((p) => p.slot).join(", ") || "aucun"}`);

async function chiffresProteges(id) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || id == null) { note("match : base protegee non configuree, message sans chiffres"); return null; }
  try {
    const r = await fetch(`${url}/rest/v1/match_premium_data?fixture_id=eq.${encodeURIComponent(id)}&select=pari_rec,cote_rec,model_probability,market_id,markets_compared,premium_fields`,
      {headers: {apikey: key, Authorization: `Bearer ${key}`}});
    if (!r.ok) { note(`match : base protegee ${r.status}, message sans chiffres`); return null; }
    const [row] = await r.json();
    if (!row) return null;
    const pf = row.premium_fields || {};
    const out = {pari_rec: row.pari_rec, cote_rec: row.cote_rec, model_probability: row.model_probability, market_id: row.market_id,
      markets_compared: row.markets_compared, chance_iashark: pf.chance_iashark, cote_source: pf.cote_source, cote_bookmaker: pf.cote_bookmaker, sans_marge_anj: pf.sans_marge_anj};
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null && v !== undefined));
  } catch (err) { note(`match : base protegee injoignable (${err.message}), message sans chiffres`); return null; }
}

async function carte(c) {
  const {chromium} = await import("@playwright/test");
  const e = P.esc;
  const html = fs.readFileSync(path.join(ROOT, "scripts/telegram/card.tpl"), "utf8")
    .replace("{{EQUIPES}}", e(c.equipes)).replace("{{LONG}}", c.equipes.length > 22 ? " long" : "")
    .replace("{{LOGOS}}", c.logoDom && c.logoExt ? "" : "display:none").replace("{{LOGO_DOM}}", e(c.logoDom || "")).replace("{{LOGO_EXT}}", e(c.logoExt || ""))
    .replace("{{QUAND}}", e(c.quand));
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const page = await b.newPage({viewport: {width: 1080, height: 740}});
  await page.setContent(html, {waitUntil: "networkidle"});
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, "match-gratuit.png");
  await page.screenshot({path: file});
  await b.close();
  return file;
}
