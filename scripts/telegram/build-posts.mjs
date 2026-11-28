#!/usr/bin/env node
// Prepare les messages de la chaine Telegram a partir des fichiers du pipeline (plan du 03/11/2026).
//   node scripts/telegram/build-posts.mjs --slot <hier|offert|rattrapage|compos|debat|tout> --out <dossier> [--maintenant "AAAA-MM-JJ HH:MM"]
// Ecrit <dossier>/posts.json (+ match-gratuit.png pour le match offert). Ne publie rien : l'envoi est dans send-posts.mjs.
// Journal : statuts seulement, jamais un pari, une cote ou une chance (depot public).
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const require = createRequire(import.meta.url);
const P = require("../../lib/telegram-posts.js");
const QUOTAS = require("../../lib/quotas.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const SLOT = arg("--slot", "tout");
const OUT = path.resolve(arg("--out", "telegram-out"));
fs.mkdirSync(OUT, {recursive: true});
const lire = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return null; } };
const note = (m) => console.log(m);

// Dates en heure de Paris (le site raisonne en heure de Paris). --maintenant : essais a date fixe.
const paris = (d) => new Intl.DateTimeFormat("sv-SE", {timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"}).format(d);
const MAINTENANT = arg("--maintenant", paris(new Date()));
const TODAY = MAINTENANT.slice(0, 10);
const veille = (j) => new Date(Date.parse(j + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
const HIER = veille(TODAY);
const frais = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) && paris(new Date(t)).slice(0, 10) === TODAY; };

const veut = (s) => SLOT === s || (SLOT === "rattrapage" && (s === "hier" || s === "offert")) || (SLOT === "tout" && s !== "compos");
const posts = [];

// ---------- API-Football : quotas de config/quotas.json ; un refus n'est jamais une reponse ----------
const CFG = lire("config/quotas.json") || {};
const REGLAGES = Object.assign({fenetre_compos_minutes: 70, max_appels_par_lancement: 3, max_matchs_debat: 5}, CFG.api_football && CFG.api_football.telegram_canal);
let appels = 0;
async function api(chemin) {
  const cle = process.env.APISPORTS_KEY;
  if (!cle) { note("API-Football : cle absente, aucun appel"); return null; }
  if (appels >= REGLAGES.max_appels_par_lancement) { note("API-Football : budget de ce passage atteint"); return null; }
  if (!QUOTAS.autorise("api_football", QUOTAS.lireEtat(), CFG)) { note("API-Football : plafond du jour atteint, aucun appel"); return null; }
  appels++;
  try {
    const r = await fetch(`https://v3.football.api-sports.io/${chemin}`, {headers: {"x-apisports-key": cle}});
    if (!r.ok) return null;
    const j = await r.json();
    const err = j && j.errors;
    if (err && (Array.isArray(err) ? err.length : Object.keys(err).length)) return null;
    return j && Array.isArray(j.response) ? j : null;
  } catch { return null; }
}

// ---------- Base (lecture seule) ----------
async function base(chemin) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { note("base : non configuree"); return null; }
  try {
    const r = await fetch(`${String(url).replace(/\/$/, "")}/rest/v1/${chemin}`, {headers: {apikey: key, Authorization: `Bearer ${key}`}});
    if (!r.ok) { note(`base : reponse ${r.status}`); return null; }
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch { note("base : injoignable"); return null; }
}
// Le pari publie, sa cote et sa chance : seulement pour le gros match (prono d'appel).
async function lireProteges(id) {
  const [row] = (await base(`match_premium_data?fixture_id=eq.${encodeURIComponent(id)}&select=pari_rec,cote_rec,market_id,premium_fields`)) || [];
  if (!row) return null;
  const pf = row.premium_fields || {};
  const out = {pari_rec: row.pari_rec, cote_rec: row.cote_rec, market_id: row.market_id, chance_iashark: pf.chance_iashark};
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null && v !== undefined));
}
const lireTickets = (jour) => base(`tickets_du_jour?jour=eq.${jour}&type=in.(or,x5,x10)&select=type,contenu`);

// ---------- Les 4 rendez-vous ----------
const matchsDuJour = () => { const d = lire("data.json"); return (d && d.matchs) || []; };

if (veut("hier")) {
  const bandeau = lire("preuves/bandeau.json"), montantes = lire("preuves/montantes.json"), bilan = lire("preuves/bilan-hier.json"), registre = lire("preuves/matchs-offerts.json");
  // Le calcul du matin doit etre passe : sinon pas de message, le passage suivant reessaie.
  if (!bandeau || !frais(bandeau.genere_le)) note("hier : calcul du matin pas encore passe, pas de message");
  else {
    const src = {jour: HIER, bandeau, montantes, bilan, registre, archiveOffert: null, buteurs: null};
    const entree = ((registre && registre.matchs) || []).filter((x) => x && x.jour === HIER && x.fixture_id != null);
    if (entree.length === 1 && !(bilan && bilan.jour === HIER && bilan.offert)) {
      const id = entree[0].fixture_id;
      // Match rejoue (migration 0073) : seulement la ligne la plus recente du match (celle d'hier), jamais un repli sur
      // la ligne d'un pari annule plus ancien.
      const a = P.ligneArchive(((await base(`predictions_archive?fixture_id=eq.${encodeURIComponent(id)}&select=market,result,published_at,kickoff_at,type&order=kickoff_at.desc.nullslast&limit=1`)) || []).slice(0, 1));
      const simple = ((bandeau.simples && bandeau.simples.items) || []).find((x) => x && String(x.f) === String(id));
      src.archiveOffert = a || (simple ? {market: simple.m, result: simple.r} : null);
    }
    const [ligneButeur] = (await base(`tickets_du_jour?jour=eq.${HIER}&type=eq.buteur&select=contenu,etats`)) || [];
    if (ligneButeur && ligneButeur.contenu) {
      const c = ligneButeur.contenu, ids = [...new Set((Array.isArray(c.buteurs) ? c.buteurs : [c]).map((b) => b && b.fixture_id).filter((x) => x != null))];
      const rep = ids.length ? await api(`fixtures?ids=${ids.join("-")}`) : null;
      src.buteurs = P.buteursHier(ligneButeur, rep && rep.response);
    }
    const p = P.hier(src);
    p ? posts.push(p) : note(`hier : aucune donnee pour ${HIER}, pas de message`);
  }
}
if (veut("offert")) {
  const home = lire("data-home.json");
  if (!home || !frais(home.generated_at)) note("offert : donnees du jour pas encore pretes, pas de message");
  else {
    const p = P.offert(home, {matchs: matchsDuJour()}, MAINTENANT);
    if (!p) note(`offert : pas de match offert a venir ce jour (${TODAY}), pas de message`);
    else {
      // Sans image (navigateur absent, panne) : le message part quand meme, en texte.
      try { p.image = await carte(p.carte); }
      catch { note("offert : image non fabriquee, message en texte"); p.type = "text"; p.apercu = false; }
      posts.push(p);
    }
  }
}
let composEtat = null;
if (SLOT === "compos") {
  const matchs = matchsDuJour();
  const p = await P.composDuSoir({matchs, maintenant: MAINTENANT, fenetreMinutes: REGLAGES.fenetre_compos_minutes, api, lireProteges, lireTickets, note});
  if (p) posts.push(p);
  composEtat = p ? "pret" : P.composEtat(matchs, MAINTENANT);
}
if (veut("debat")) {
  // Apres minuit (passage en retard) : le soir d'avant.
  const jour = MAINTENANT.slice(11, 13) < "06" ? HIER : TODAY;
  const p = await P.debatDuSoir({matchs: matchsDuJour(), jour, maxMatchs: REGLAGES.max_matchs_debat, maintenant: MAINTENANT, api, note});
  if (p) posts.push(p);
}

fs.writeFileSync(path.join(OUT, "posts.json"), JSON.stringify({date: TODAY, slot: SLOT, compos_etat: composEtat, posts}, null, 2));
console.log(`${posts.length} message(s) prets : ${posts.map((p) => p.slot).join(", ") || "aucun"} (${appels} appel(s) API-Football)`);

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
