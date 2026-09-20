#!/usr/bin/env node
"use strict";
// RESULTATS DU JOUR EN COURS — le liseré vert/rouge sur l'onglet « Aujourd'hui »
// (demande du proprietaire, 20/09/2026 : « mettre vert ce qui est bon ou pas
// pour les matchs d'aujourd'hui, juste un trait vert sur la bordure de gauche »).
//
// POURQUOI UN SCRIPT A PART. .github/workflows/update-data.yml n'ecrit
// results/<date>.json que pour les journees DEJA PASSEES (boucle d=1..60) et ne
// tourne qu'une fois par jour a 6 h UTC : il ne peut pas colorer un match qui
// se termine a 17 h. Ce script fait la seule chose qui manque — relire les
// statuts du jour et reconstruire results/<aujourd'hui>.json — sans rien
// recalculer du modele.
//
// COUT API-FOOTBALL : 1 appel `fixtures?date=<jour>` (tous les matchs de la
// journee d'un coup) + 1 appel `fixtures/statistics` UNIQUEMENT par pari sur
// les tirs encore non regle. Aucun appel de cotes, aucun recalcul.
//
// CE QUI EST PUBLIE : exactement ce que lib/match-results.js autorise, c'est a
// dire le verdict et de quoi dessiner la ligne (equipes, competition, heure).
// Jamais le pari, jamais la cote, jamais le score. Un match non termine reste
// `pending` : aucune couleur. Aucune donnee inventee (docs/SPEC_RESULTATS_HIER.md).
//
// SOURCE DU PARI : match_premium_data.pari_rec, le pari PUBLIE et gele
// (lib/pick-freeze.js) — celui que les abonnes ont vu — jamais un recalcul.
//
// USAGE
//   node scripts/resultats-du-jour.js                  # aujourd'hui (heure de Paris)
//   node scripts/resultats-du-jour.js --jour=2026-09-20
//   node scripts/resultats-du-jour.js --picks=<fichier.json>   # paris deja lus
//   node scripts/resultats-du-jour.js --dry-run        # n'ecrit rien
// Cles : APISPORTS_KEY (obligatoire) ; SUPABASE_URL + SUPABASE_SERVICE_KEY
// (sinon --picks). Le script lit .env du depot en dernier recours.

const fs = require("fs");
const path = require("path");
const MATCH_RESULTS = require("../lib/match-results.js");

const RACINE = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(RACINE, "results");
const API = "https://v3.football.api-sports.io";

function arg(nom, defaut) {
  const p = process.argv.find(function (a) { return a.indexOf("--" + nom + "=") === 0; });
  if (p) return p.slice(nom.length + 3);
  return process.argv.indexOf("--" + nom) !== -1 ? true : defaut;
}

// Cle lue de l'environnement, sinon du .env du depot (jamais versionne).
function cle(nom) {
  if (process.env[nom]) return process.env[nom];
  for (const f of [path.join(RACINE, ".env"), path.join(RACINE, "..", "iashark", ".env")]) {
    try {
      const m = new RegExp("^" + nom + "\\s*=\\s*(.+)$", "m").exec(fs.readFileSync(f, "utf8"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch (e) { /* fichier absent : on continue */ }
  }
  return null;
}

async function getJson(url, headers) {
  const r = await fetch(url, { headers: headers || {} });
  if (!r.ok) throw new Error(url.split("?")[0] + " -> HTTP " + r.status);
  return r.json();
}

// Matchs du jour tels que le SITE les publie : data-home.json est la liste que
// le visiteur voit. On n'invente aucun match qui n'y serait pas.
function matchsDuSite(jour) {
  const j = JSON.parse(fs.readFileSync(path.join(RACINE, "data-home.json"), "utf8"));
  return (j.matchs || []).filter(function (m) { return String(m.date || "").slice(0, 10) === jour; });
}

// Paris PUBLIES (geles) des matchs demandes.
async function parisPublies(ids, fichier) {
  if (fichier && typeof fichier === "string") {
    const brut = JSON.parse(fs.readFileSync(path.resolve(fichier), "utf8"));
    return Array.isArray(brut) ? brut : (brut.rows || []);
  }
  const url = cle("SUPABASE_URL"), key = cle("SUPABASE_SERVICE_ROLE_KEY") || cle("SUPABASE_SERVICE_KEY");
  if (!url || !key) throw new Error("ni --picks ni SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY : impossible de lire les paris publies");
  const base = url.replace(/\/$/, "") + "/rest/v1/match_premium_data";
  const q = "?select=fixture_id,pari_rec,cote_rec,market_id&pari_rec=not.is.null&fixture_id=in.(" + ids.join(",") + ")&limit=5000";
  const rows = await getJson(base + q, { apikey: key, Authorization: "Bearer " + key });
  return (Array.isArray(rows) ? rows : []).map(function (r) {
    return { fixture_id: r.fixture_id, prediction: r.pari_rec, cote: r.cote_rec, market: r.market_id };
  });
}

// Statistiques de tirs : demandees UNIQUEMENT pour un pari sur les tirs dont le
// match est termine. Une statistique absente n'est pas ajoutee au contexte (un
// 0 par defaut reglerait « plus de 23,5 tirs » comme perdu a tort).
async function contexteTirs(fix, headers) {
  const ctx = {};
  const rep = await getJson(API + "/fixtures/statistics?fixture=" + (fix.fixture && fix.fixture.id), headers);
  const blocs = (rep && rep.response) || [];
  const total = function (type) {
    let trouves = 0;
    const somme = blocs.reduce(function (s, b) {
      const row = (b.statistics || []).find(function (x) { return x.type === type; });
      const v = row ? parseFloat(row.value) : NaN;
      if (Number.isFinite(v)) trouves++;
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    return trouves === 2 ? somme : null;
  };
  const ts = total("Total Shots"), tsot = total("Shots on Goal");
  if (ts != null) ctx.totalShots = ts;
  if (tsot != null) ctx.totalShotsOnTarget = tsot;
  return ctx;
}

async function main() {
  const jour = String(arg("jour", MATCH_RESULTS.parisDay(Date.now())));
  const dryRun = arg("dry-run", false) === true;
  const aps = cle("APISPORTS_KEY");
  if (!aps) throw new Error("APISPORTS_KEY manquante");
  const headers = { "x-apisports-key": aps };

  const matchs = matchsDuSite(jour);
  const avecSignal = matchs.filter(function (m) { return m.no_signal !== true; });
  if (!avecSignal.length) { console.log("[jour] " + jour + " : aucun match avec marche retenu, rien a ecrire."); return; }

  const picks = await parisPublies(avecSignal.map(function (m) { return m.id; }), arg("picks", null));
  const parId = {};
  picks.forEach(function (p) { if (p && p.fixture_id != null) parId[String(p.fixture_id)] = p; });

  // Une ligne « archive » par match du site : le pari gele, complete par les
  // faits deja publics de data-home.json (equipes, competition, coup d'envoi).
  const archiveRows = avecSignal.map(function (m) {
    const p = parId[String(m.id)] || {};
    return {
      fixture_id: m.id, type: "single", date: jour,
      prediction: p.prediction || null, cote: p.cote != null ? p.cote : null, market: p.market || null,
      home: (m.home && m.home.n) || null, away: (m.away && m.away.n) || null,
      league: m.league || null, league_key: m.league_key || null,
    };
  });

  // 1 SEUL appel : tous les matchs de la journee, statuts et scores compris.
  const rep = await getJson(API + "/fixtures?date=" + jour + "&timezone=Europe/Paris", headers);
  const fixtures = (rep && rep.response) || [];
  let appels = 1;
  const fixturesById = MATCH_RESULTS.indexerFixtures(fixtures);

  // Contextes de tirs, un appel par pari « tirs » sur un match termine.
  const contexts = {};
  for (const r of archiveRows) {
    if (!/tirs( cadres)? du match/i.test(r.prediction || "")) continue;
    const fix = fixturesById[String(r.fixture_id)];
    if (!fix || ["FT", "AET", "PEN"].indexOf(MATCH_RESULTS.fixtureStatus(fix)) === -1) continue;
    contexts[String(r.fixture_id)] = await contexteTirs(fix, headers);
    appels++;
  }

  let registre = null;
  try { registre = JSON.parse(fs.readFileSync(path.join(RACINE, "data/match-pages-registry.json"), "utf8")); } catch (e) {}

  const out = MATCH_RESULTS.buildDayFile({
    day: jour, predictions: [], archiveRows: archiveRows, results: [],
    fixturesById: fixturesById, contexts: contexts, registry: registre,
    generatedAt: new Date().toISOString(),
    noSignal: matchs.filter(function (m) { return m.no_signal === true; }).map(function (m) { return m.id; }),
  });

  const t = out.file.totals;
  console.log("[jour] " + jour + " · " + appels + " appel(s) API · " + out.file.matches.length + " match(s) suivi(s)");
  console.log("[verdicts] " + t.won + " passe(s), " + t.lost + " manque(s), " + (t.pending || 0) + " en attente, " + (t.void || 0) + " annule(s)");
  MATCH_RESULTS.formatUnsettledLog(out.report).forEach(function (l) { console.log(l); });
  if (dryRun) { console.log("[dry-run] rien ecrit."); return; }
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, jour + ".json"), JSON.stringify(out.file, null, 2));
  console.log("[ecrit] results/" + jour + ".json");
}

main().catch(function (e) { console.error("[erreur] " + (e && e.message)); process.exit(1); });
