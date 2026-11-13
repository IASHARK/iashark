#!/usr/bin/env node
"use strict";
// ESSAI A BLANC DU MOTEUR « SCENARIO » (13/11/2026) : memes fonctions que le calcul du matin, RIEN n'est publie.
// Pour les matchs a venir qui ont un releve de cotes de moins de 24 h (table odds_snapshots) : complete la base des matchs
// joues (scenario_matchs), calcule les scenarios, choisit le pari par la regle du site, puis affiche SEULEMENT des
// comptes (jamais un pari, jamais une cle : le journal de ce depot est public).
// Variables : APISPORTS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ; moteur prive dans .moteur-scenario-prive/.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SCN = require("../lib/scenario.js"), SD = require("../lib/scenario-donnees.js"), FP = require("../lib/flux-paris.js"), PR = require("../lib/pronostic.js");

(async () => {
  const { APISPORTS_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!APISPORTS_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.log("::error title=Essai scenario::variables absentes (cle API-Sports ou base)."); process.exit(1); }
  const moteur = SCN.charger();
  if (!moteur) { console.log("::error title=Essai scenario::moteur prive introuvable (.moteur-scenario-prive/scenario)."); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config/marches-pari.json"), "utf8")), regle = PR.regleFlux(cfg);
  if (!regle || !regle.scenario) { console.log("::error title=Essai scenario::config/marches-pari.json n'est pas sur la regle scenario."); process.exit(1); }
  const db = SD.base(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), mag = SD.magasinBase(db), api = SD.client({ cle: APISPORTS_KEY });
  const depuis = new Date(Date.now() - 24 * 3600e3).toISOString();
  const ids = [...new Set((await db.lire("odds_snapshots", "captured_at=gte." + encodeURIComponent(depuis) + "&order=id", "fixture_id")).map((x) => Number(x.fixture_id)))];
  const max = Number(process.env.SCENARIO_ESSAI_MAX || 400);
  const fixtures = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 20) { const r = await api.get("/fixtures?ids=" + ids.slice(i, i + 20).join("-")); if (r) fixtures.push.apply(fixtures, r); }
  const aVenir = fixtures.filter((f) => f && f.fixture && f.fixture.status && f.fixture.status.short === "NS" && Date.parse(f.fixture.date) > Date.now());
  const raws = {};
  for (let i = 0; i < aVenir.length; i += 25) {
    const l = aVenir.slice(i, i + 25).map((f) => f.fixture.id).join(",");
    (await db.lire("odds_snapshots", "fixture_id=in.(" + l + ")&captured_at=gte." + encodeURIComponent(depuis) + "&order=captured_at.asc", "fixture_id,raw_odds")).forEach((x) => { if (x.raw_odds && Array.isArray(x.raw_odds.bookmakers)) raws[String(x.fixture_id)] = x.raw_odds; });
  }
  const cibles = aVenir.filter((f) => raws[String(f.fixture.id)]);
  const eq = []; cibles.forEach((f) => eq.push(f.teams.home.id, f.teams.away.id));
  const lu = await SCN.collecterEtLire({ api: api, magasin: mag, equipes: eq, arbitres: cibles.map((f) => SD.nomArbitre(f.fixture.referee)).filter(Boolean), finMs: Date.now() + Number(process.env.SCENARIO_ESSAI_MINUTES || 25) * 60000 });
  const ligues = JSON.parse(fs.readFileSync(path.join(ROOT, "config/scenario-ligues.json"), "utf8")).ligues;
  const par = SCN.calculer(moteur, lu.lignes, ligues, cibles.map((f) => ({ id: f.fixture.id, t: Date.parse(f.fixture.date), h: f.teams.home.id, a: f.teams.away.id, lg: f.league.id, ref: SD.nomArbitre(f.fixture.referee), absents: null, raw: raws[String(f.fixture.id)], nomDom: f.teams.home.name, nomExt: f.teams.away.name })), { FP: FP, regle: regle });
  const fluxPar = {}; cibles.forEach((f) => { fluxPar[String(f.fixture.id)] = { raw: raws[String(f.fixture.id)] }; });
  const ctx = { fluxPar: fluxPar, regleFlux: regle, scenarioPar: par, famillesFermees: [], fourchette: PR.fourchettePari(JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8"))), ligues: {}, cles: null, couverture: () => null };
  const fam = {}; let paris = 0, avec = 0, sommeNote = 0, sommeCote = 0;
  cibles.forEach((f) => {
    const id = String(f.fixture.id);
    if (par[id] && Object.keys(par[id].issues || {}).length) avec++;
    const b = PR.choisirPariFourchette({ id: f.fixture.id, home: { n: f.teams.home.name, id: f.teams.home.id }, away: { n: f.teams.away.name, id: f.teams.away.id }, league_key: String(f.league.id) }, ctx, {});
    if (!b) return;
    paris++; sommeNote += b.scenario.note; sommeCote += b.cote; fam[b.scenario.famille] = (fam[b.scenario.famille] || 0) + 1;
  });
  console.log("ESSAI A BLANC DU MOTEUR SCENARIO (" + moteur.version + ") : rien n'est publie.");
  console.log("  releves de cotes recents : " + ids.length + " match(s) ; a venir avec cotes : " + cibles.length + " ; avec un scenario : " + avec + " ; avec un pari : " + paris + ".");
  console.log("  paris par famille : " + (Object.keys(fam).sort().map((k) => k + " " + fam[k]).join(", ") || "aucun") + ".");
  console.log("  base : " + lu.lignes.length + " match(s) lus, " + lu.rapport.matchs_nouveaux + " nouveau(x) ; API-Sports : " + api.appels() + " appel(s), reste " + api.restant() + (lu.rapport.arrete_quota ? " ; ARRET QUOTA" : "") + (lu.rapport.arrete_budget ? " ; budget de temps atteint" : "") + ".");
})().catch((e) => { console.log("::error title=Essai scenario::" + String((e && e.message) || e).replace(/(apikey|key|token)=[^&\s]+/gi, "$1=***").slice(0, 200)); process.exit(1); });
