#!/usr/bin/env node
"use strict";
// MISE A JOUR LEGERE DES BUTEURS, JOURS DE MATCH (demande de Clement du 04/10/2026 ; workflow
// .github/workflows/buteurs-jour-de-match.yml, toutes les 30 min de 10:07 a 21:37 UTC).
//
// Regle de Clement (04/10/2026, 20 h) : « Chaque decision affichee ne doit plus jamais changer. Seule
// exception : les buteurs, si le joueur n'est pas dans la composition. » Exemple reel : Cristiano
// Ronaldo encore propose pour Portugal - Norvege apres avoir quitte le rassemblement.
//
// Pour les seuls matchs de data.json qui commencent dans la fenetre (2 h 15 par defaut,
// config/quotas.json#api_football.buteurs_jour_de_match) :
//  1. statut reel (un appel /fixtures?ids= pour 20 matchs au plus) : un match commence ou reporte
//     n'est pas touche (ses decisions sont figees) ;
//  2. composition officielle (/fixtures/lineups) ; tant qu'elle n'est pas complete : absences du
//     match (/injuries?fixture=, jamais de cache) et, pour une selection nationale, effectif
//     convoque des deux equipes (/players/squads) ;
//  3. buteurs probables, premier buteur et ancien calcul buteur deja servis (premium_fields de
//     match_premium_data) : chaque joueur ABSENT est retire (lib/buteurs-figes.js#retirerAbsents :
//     composition publiee sans lui, absence annoncee pour ce match, hors de l'effectif convoque ; sur
//     un doute, il reste). Aucun autre champ n'est ecrit ;
//  4. buteur du jour (table tickets_du_jour) : absent -> remplace par le plus probable du jour
//     (migration 0051), sinon marque « retire » (lib/tickets-du-jour.js#actualiserButeurDuJour).
// RIEN D'AUTRE : ni pari, ni cote, ni chance, ni selection, ni combine, ni Selection en or, ni match
// offert (tous figes). Aucun match dans la fenetre : aucun appel. Jamais bloquant (avertissements).
// Journal : compteurs seulement (jamais un joueur, un pari ou une cote : depot public).
require("./load-env.js");
const fs = require("fs");
const LEGER = require("../lib/buteurs-jour-de-match.js");
const BUTEURS = require("../lib/buteurs-figes.js");
const TICKETS = require("../lib/tickets-du-jour.js");
const SELECTIONS = require("../lib/selections-nationales.js");
const { jourParis } = require("../lib/run-output/jambes-du-jour.js");

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

// opts (essais) : { env, fetch, nowMs, dataPath, quotas, verdicts, journal, avertir }.
// -> rapport (compteurs seulement).
async function lancer(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const f = opts.fetch || (typeof fetch === "function" ? fetch : null);
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const journal = opts.journal || function (t) { console.log("[BUTEURS LEGER] " + t); };
  const avertir = opts.avertir || function (t) { console.log("::warning title=Buteurs jour de match::" + t); };
  const cfg = LEGER.reglages(opts.quotas || require("../config/quotas.json"));
  const rapport = { statut: null, appels: 0, matchs_proches: 0, compositions: 0, absences_lues: 0, effectifs: 0, illisibles: 0, listes_modifiees: 0, joueurs_retires: 0, buteur_du_jour: null };

  let data;
  try { data = JSON.parse(fs.readFileSync(opts.dataPath || "data.json", "utf8")); }
  catch (e) { avertir("data.json illisible : rien n'est verifie."); rapport.statut = "data_illisible"; return rapport; }
  const matchs = Array.isArray(data && data.matchs) ? data.matchs : [];
  const proches = LEGER.matchsProches(matchs, nowMs, cfg);
  rapport.matchs_proches = proches.length;
  if (!proches.length) {
    journal("aucun match dans les " + cfg.fenetre_minutes + " min : aucun appel.");
    rapport.statut = "aucun_match";
    return rapport;
  }
  const cle = env.APISPORTS_KEY, supaUrl = env.SUPABASE_URL ? String(env.SUPABASE_URL).replace(/\/$/, "") : null, supaCle = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle || !supaUrl || !supaCle || !f) {
    avertir("APISPORTS_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absente : buteurs non verifies.");
    rapport.statut = "cles_absentes";
    return rapport;
  }

  // API-Football : budget dur par lancement ; un refus (quota, plafond, erreur) n'est JAMAIS « aucune absence ».
  const api = async function (chemin) {
    if (rapport.appels >= cfg.max_appels_par_lancement) return null;
    rapport.appels++;
    try {
      const r = await f("https://v3.football.api-sports.io/" + chemin, { headers: { "x-apisports-key": cle } });
      if (!r || !r.ok) return null;
      const j = await r.json();
      const err = j && j.errors;
      if (err && (Array.isArray(err) ? err.length : Object.keys(err).length)) return null;
      return j && Array.isArray(j.response) ? j : null;
    } catch (e) { return null; }
  };
  const entetes = function (extra) { return Object.assign({ apikey: supaCle, Authorization: "Bearer " + supaCle, "Content-Type": "application/json" }, extra || {}); };
  const lirePremium = async function (ids) {
    if (!ids.length) return {};
    const r = await f(supaUrl + "/rest/v1/match_premium_data?select=fixture_id,premium_fields&fixture_id=in.(" + ids.join(",") + ")", { headers: entetes() });
    if (!r || !r.ok) throw new Error("match_premium_data " + (r && r.status));
    const rows = await r.json();
    const out = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) { if (row && row.fixture_id != null) out[String(row.fixture_id)] = row; });
    return out;
  };

  // 1. Statut reel des matchs proches (garde coup d'envoi) ; les autres : dernier calcul (data.json).
  const fixtureById = {};
  matchs.forEach(function (m) { if (m && m.id != null) fixtureById[String(m.id)] = LEGER.fixtureDepuisData(m); });
  const repFx = await api("fixtures?ids=" + proches.slice(0, 20).map(function (m) { return m.id; }).join("-"));
  if (repFx) repFx.response.forEach(function (it) { const id = it && it.fixture && it.fixture.id; if (id != null) fixtureById[String(id)] = it; });
  else rapport.illisibles++;

  // 2. Compositions et absences des matchs encore a venir.
  const releves = {};
  for (const m of proches) {
    const fx = fixtureById[String(m.id)];
    const st = String((fx && fx.fixture && fx.fixture.status && fx.fixture.status.short) || "").toUpperCase();
    if (["NS", "TBD"].indexOf(st) === -1) continue;
    const r = { lineups: null, injuries: [], effectif: null };
    const repL = await api("fixtures/lineups?fixture=" + m.id);
    if (repL) { r.lineups = LEGER.compositionDepuisApi(m, repL); if (r.lineups) rapport.compositions++; } else rapport.illisibles++;
    if (!LEGER.compositionComplete(r.lineups)) {
      const repI = await api("injuries?fixture=" + m.id);
      if (repI) { r.injuries = LEGER.absencesDepuisApi(repI); rapport.absences_lues += r.injuries.length; } else rapport.illisibles++;
      if (SELECTIONS.estSelectionNationale(m)) {
        r.effectif = {};
        for (const c of ["home", "away"]) {
          const team = m[c] && m[c].id;
          if (team == null) continue;
          const repS = await api("players/squads?team=" + team);
          if (repS) { r.effectif[c] = LEGER.effectifDepuisApi(repS); if (r.effectif[c].length) rapport.effectifs++; } else rapport.illisibles++;
        }
      }
    }
    releves[String(m.id)] = r;
  }

  // 3. Listes deja servies : chaque absent retire, rien d'autre.
  const jour = jourParis(nowMs);
  const duJour = matchs.filter(function (m) { return m && m.id != null && String(m.date || "").slice(0, 10) === jour; });
  const ids = Array.from(new Set(Object.keys(releves).concat(duJour.map(function (m) { return String(m.id); })))).filter(function (id) { return /^\d+$/.test(id); });
  let rows = {};
  try { rows = await lirePremium(ids); }
  catch (e) { avertir("match_premium_data illisible (" + String(e && e.message || e).slice(0, 60) + ") : buteurs non verifies."); rapport.statut = "indisponible"; return rapport; }
  const parId = {};
  matchs.forEach(function (m) { if (m && m.id != null) parId[String(m.id)] = m; });
  const sansColonne = [];
  for (const id of Object.keys(releves)) {
    const row = rows[id];
    if (!row) continue;
    if (!estObjet(row.premium_fields)) { sansColonne.push(id); continue; }
    const m = Object.assign({}, parId[id], releves[id]);
    const res = BUTEURS.retirerAbsents(row.premium_fields, m);
    if (!res.total) continue;
    try {
      const r = await f(supaUrl + "/rest/v1/match_premium_data?fixture_id=eq." + id, { method: "PATCH", headers: entetes({ Prefer: "return=minimal" }), body: JSON.stringify({ premium_fields: res.premium_fields }) });
      if (!r || !r.ok) throw new Error("PATCH " + (r && r.status));
      row.premium_fields = res.premium_fields;
      rapport.listes_modifiees += Object.keys(res.retires).length;
      rapport.joueurs_retires += res.total;
    } catch (e) { avertir("buteurs d'un match non mis a jour (" + String(e && e.message || e).slice(0, 60) + ")."); }
  }
  if (sansColonne.length) avertir(sansColonne.length + " match(s) sans colonne premium_fields : buteurs non verifies.");

  // 4. Buteur du jour : absent -> remplace (migration 0051) ou retire.
  const matchsDuJour = duJour.map(function (m) {
    const pf = rows[String(m.id)] && estObjet(rows[String(m.id)].premium_fields) ? rows[String(m.id)].premium_fields : {};
    return Object.assign({}, m, Array.isArray(pf.v3_buteurs) ? { v3_buteurs: pf.v3_buteurs } : {}, releves[String(m.id)] || {});
  });
  // Le buteur du jour est celui du jour de Paris (lib/tickets-du-jour.js) : candidats = matchs de ce jour.
  try {
    const rb = await TICKETS.actualiserButeurDuJour({ matchs: matchsDuJour, fixtureById: fixtureById, nowMs: nowMs, supabase: { url: supaUrl, cle: supaCle }, fetch: f, avertir: avertir, verdicts: opts.verdicts });
    rapport.buteur_du_jour = rb.statut;
  } catch (e) { avertir("buteur du jour non verifie (" + String(e && e.message || e).slice(0, 60) + ")."); rapport.buteur_du_jour = "erreur"; }

  rapport.statut = "fait";
  journal(rapport.matchs_proches + " match(s) dans les " + cfg.fenetre_minutes + " min, " + rapport.appels + " appel(s) API-Football ; compositions lues : " + rapport.compositions
    + ", absences lues : " + rapport.absences_lues + ", effectifs : " + rapport.effectifs + ", reponses illisibles : " + rapport.illisibles
    + " ; joueurs absents retires : " + rapport.joueurs_retires + " (" + rapport.listes_modifiees + " liste(s)) ; buteur du jour : " + rapport.buteur_du_jour + ".");
  return rapport;
}

module.exports = { lancer };

if (require.main === module) {
  lancer().catch(function (e) {
    // Jamais bloquant : un echec inattendu est un avertissement, le workflow reste vert.
    console.log("::warning title=Buteurs jour de match::echec inattendu (" + String(e && e.message || e).slice(0, 120) + ").");
  });
}
