#!/usr/bin/env node
"use strict";
// PETITES LIGUES BET365, CHEMIN LEGER : un lancement (workflow .github/workflows/petites-ligues.yml).
// Logique : lib/petites-ligues.js ; reglages : config/petites-ligues.json. PHASE 1 = essai a blanc : rien n'est affiche
// sur le site, seule l'archive data/petites-ligues/<jour>.json (jamais publiee par Netlify) est ecrite.
//
// Appels (jamais plus que max_appels_par_lancement, arret si le quota restant du jour passe sous arret_si_restant_sous) :
//   /fixtures?date (1 par jour lu : J..J+2, plus les jours dont un pari attend son reglement)
//   /odds?date&bookmaker=8 puis 4 (10 matchs par page, toutes les pages).
// Une reponse en erreur ou en limite de quota n'est JAMAIS lue comme « aucun match » (lib/api-fetch-policy.js) : le
// jour concerne est saute, rien n'est ecrit pour lui.
//
// Usage :
//   node scripts/petites-ligues.js                     (en ligne, si config actif = true ; sinon rien)
//   node scripts/petites-ligues.js --force             (en ligne meme si actif = false)
//   node scripts/petites-ligues.js --hors-ligne <dossier> --maintenant <ISO> [--sortie <dossier>] [--jours a,b,c]
//        (rejoue des reponses deja enregistrees : fixtures-<jour>.json, odds-<bk>-<jour>-p<n>.json ; zero appel)
//   --sans-ecriture : n'ecrit rien, imprime seulement le resume.

const fs = require("fs");
const path = require("path");
const PL = require("../lib/petites-ligues.js");
const { classifyApiResponse } = require("../lib/api-fetch-policy.js");

const RACINE = path.join(__dirname, "..");
const CFG = require("../config/petites-ligues.json");
const LIGUES = require("../config/leagues.json");
const MARCHES = require("../config/marches-pari.json");

function arg(nom) { const i = process.argv.indexOf(nom); return i !== -1 ? process.argv[i + 1] : null; }
const drapeau = (nom) => process.argv.indexOf(nom) !== -1;

function jourParis(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function lireArchive(dossier, jour) {
  try { return JSON.parse(fs.readFileSync(path.join(dossier, jour + ".json"), "utf8")); } catch (_e) { return null; }
}
function ecrireJson(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + "\n");
  fs.renameSync(tmp, f);
}

// --------------------------------------------------------------------------- sources
function sourceHorsLigne(dossier) {
  const lire = (f) => JSON.parse(fs.readFileSync(path.join(dossier, f), "utf8"));
  return {
    appels: 0,
    async fixtures(jour) { const f = "fixtures-" + jour + ".json"; return fs.existsSync(path.join(dossier, f)) ? { ok: true, response: lire(f).response || [] } : { ok: false, raison: "fichier absent" }; },
    async odds(jour, bk) {
      const pages = fs.readdirSync(dossier).filter((f) => f.startsWith("odds-" + bk + "-" + jour + "-p")).sort((a, b) => Number(a.split("-p").pop().slice(0, -5)) - Number(b.split("-p").pop().slice(0, -5)));
      if (!pages.length) return { ok: false, raison: "fichier absent" };
      return { ok: true, response: pages.flatMap((p) => lire(p).response || []), pages: pages.length };
    },
  };
}

function sourceEnLigne(cle, c) {
  const base = "https://v3.football.api-sports.io/";
  const s = {
    appels: 0, restant: null, arret: null,
    async get(q) {
      if (s.arret) return { ok: false, raison: s.arret };
      if (s.appels >= c.max_appels_par_lancement) { s.arret = "plafond de " + c.max_appels_par_lancement + " appels atteint"; return { ok: false, raison: s.arret }; }
      if (s.restant != null && s.restant < c.arret_si_restant_sous) { s.arret = "quota du jour restant " + s.restant + " < " + c.arret_si_restant_sous; return { ok: false, raison: s.arret }; }
      s.appels++;
      let j;
      try {
        const r = await fetch(base + q, { headers: { "x-apisports-key": cle } });
        const rest = Number(r.headers.get("x-ratelimit-requests-remaining"));
        if (Number.isFinite(rest)) s.restant = rest;
        j = await r.json();
      } catch (e) { j = { __ia_network_error: true }; }
      await new Promise((ok) => setTimeout(ok, 250));
      const st = classifyApiResponse(j);
      if (st !== "OK") { if (st === "RATE_LIMIT") s.arret = "limite de quota"; return { ok: false, raison: st }; }
      return { ok: true, json: j };
    },
    async fixtures(jour) { const r = await s.get("fixtures?date=" + jour + "&timezone=Europe%2FParis"); return r.ok ? { ok: true, response: r.json.response || [] } : r; },
    async odds(jour, bk) {
      const out = []; let p = 1, t = 1;
      while (p <= t) {
        const r = await s.get("odds?date=" + jour + "&bookmaker=" + bk + "&timezone=Europe%2FParis&page=" + p);
        if (!r.ok) return r; // une page manque : tout le jour est saute (jamais une liste partielle lue comme complete)
        out.push.apply(out, r.json.response || []);
        t = Math.min(Number((r.json.paging && r.json.paging.total) || 1), 60);
        p++;
      }
      return { ok: true, response: out, pages: t };
    },
  };
  return s;
}

// --------------------------------------------------------------------------- lancement
async function main() {
  const c = PL.lireConfig(CFG);
  const horsLigne = arg("--hors-ligne");
  const nowMs = arg("--maintenant") ? Date.parse(arg("--maintenant")) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error("--maintenant illisible");
  const sortie = path.resolve(arg("--sortie") || path.join(RACINE, "data", "petites-ligues"));
  const ecrire = !drapeau("--sans-ecriture");
  if (!horsLigne && !c.actif && !drapeau("--force")) { console.log("[petites-ligues] inactif (config/petites-ligues.json#actif = false) : aucun appel."); return; }
  let src;
  if (horsLigne) src = sourceHorsLigne(path.resolve(horsLigne));
  else {
    const cle = process.env.APISPORTS_KEY;
    if (!cle) { console.log("[petites-ligues] APISPORTS_KEY absente : aucun appel."); return; }
    src = sourceEnLigne(cle, c);
  }
  const jours = arg("--jours") ? arg("--jours").split(",") : Array.from({ length: c.jours }, (_, i) => jourParis(nowMs + i * 86400000));
  const archives = {};
  const charger = (j) => { if (!archives[j]) archives[j] = lireArchive(sortie, j) || { regle_version: c.regle_version, jour: j, matchs: {} }; };
  jours.forEach(charger);
  // Jours passes dont un pari attend son reglement (7 derniers jours au plus).
  for (let k = 1; k <= 7; k++) charger(jourParis(nowMs - k * 86400000));
  const attente = PL.joursEnAttente(archives, nowMs, CFG).filter((j) => jours.indexOf(j) === -1);

  const fixtures = [], items = [], journal = [];
  for (const j of attente) {
    const f = await src.fixtures(j);
    if (f.ok) fixtures.push.apply(fixtures, f.response); else journal.push(j + " programme (reglement) : " + f.raison);
  }
  for (const j of jours) {
    const f = await src.fixtures(j);
    if (!f.ok) { journal.push(j + " programme : " + f.raison + " -> jour saute"); continue; }
    const o8 = await src.odds(j, c.bookmaker_reference_id);
    if (!o8.ok) { journal.push(j + " cotes Bet365 : " + o8.raison + " -> jour saute"); fixtures.push.apply(fixtures, f.response); continue; }
    const o4 = await src.odds(j, c.bookmaker_controle_id);
    if (!o4.ok) journal.push(j + " cotes Pinnacle : " + o4.raison + " -> paris de ce jour sans controle Pinnacle");
    fixtures.push.apply(fixtures, f.response);
    items.push.apply(items, o8.response);
    if (o4.ok) items.push.apply(items, o4.response);
    journal.push(j + " : " + f.response.length + " matchs au programme, " + o8.pages + " page(s) Bet365, " + (o4.ok ? o4.pages : 0) + " page(s) Pinnacle");
  }
  const n = PL.lancer(archives, fixtures, items, nowMs, { config: CFG, configLigues: LIGUES, marchesPari: MARCHES });
  const r = PL.regler(archives, fixtures, nowMs, CFG);
  console.log("[petites-ligues] " + new Date(nowMs).toISOString() + " - appels API : " + src.appels + (src.restant != null ? " (quota restant " + src.restant + ")" : "") + (src.arret ? " - ARRET : " + src.arret : ""));
  journal.forEach((l) => console.log("  " + l));
  console.log("  matchs cotes Bet365 : " + n.cotes_bet365 + " ; exclus : " + JSON.stringify(n.exclus) + " ; controles : " + JSON.stringify(n.controles));
  console.log("  nouveaux paris : " + n.nouveaux_paris + " ; paris figes gardes : " + n.paris_figes_gardes + " (cloture suivie : " + n.clotures_suivies + ") ; sans pari : " + JSON.stringify(n.sans_pari));
  console.log("  doublons : cotes " + n.doublons_cotes + ", programme " + n.doublons_programme + " ; regles ce lancement : " + r.regles + ", en attente : " + r.en_attente);
  const res = PL.resumer(archives);
  console.log("  resume des jours charges : " + JSON.stringify(res));
  if (!ecrire) return;
  Object.keys(archives).forEach(function (j) {
    const a = archives[j];
    if (!Object.keys(a.matchs).length && !fs.existsSync(path.join(sortie, j + ".json"))) return;
    a.regle_version = a.regle_version || c.regle_version; a.jour = j; a.mis_a_jour = new Date(nowMs).toISOString();
    ecrireJson(path.join(sortie, j + ".json"), a);
  });
  console.log("  archive : " + sortie);
}

main().catch((e) => { console.error("[petites-ligues] erreur : " + (e && e.stack || e)); process.exitCode = 1; });
