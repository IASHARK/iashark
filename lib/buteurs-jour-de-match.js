"use strict";
// MISE A JOUR LEGERE DES BUTEURS, JOURS DE MATCH (demande de Clement du 04/10/2026, suite de la regle de
// 20 h). Exemple reel : Cristiano Ronaldo etait encore propose comme buteur pour Portugal - Norvege
// alors qu'il avait quitte le rassemblement. Causes : le calcul quotidien (update-data.yml) ne tourne
// que la nuit (00:37-05:17 UTC), donc ni les compositions officielles (environ 1 h avant le match) ni les
// absences annoncees dans la journee n'arrivaient ; et les absences d'API-Football (/injuries, cache de
// 20 h) ne listent pas les departs de rassemblement.
//
// Ce module est la partie PURE de scripts/buteurs-jour-de-match.js (workflow
// .github/workflows/buteurs-jour-de-match.yml, toutes les 30 min en journee) :
//  - matchsProches : les matchs de data.json qui commencent dans la fenetre (2 h 15 par defaut,
//    config/quotas.json#api_football.buteurs_jour_de_match), statut a venir, au plus N matchs ;
//  - lecture des reponses d'API-Football : composition officielle (/fixtures/lineups), absences du
//    match (/injuries?fixture=, sans cache), effectif convoque d'une selection (/players/squads) ;
//  - le reste (retirer un absent des listes, remplacer le buteur du jour) est fait par
//    lib/buteurs-figes.js#retirerAbsents et lib/tickets-du-jour.js#actualiserButeurDuJour.
// RIEN D'AUTRE n'est touche : ni pari, ni cote, ni chance, ni selection, ni combine, ni match offert.

const { parisLocalToMs } = require("./kickoff-guard.js");

const STATUTS_A_VENIR = ["", "NS", "TBD"];
const DEFAUTS = Object.freeze({ fenetre_minutes: 135, max_matchs_par_lancement: 15, max_appels_par_lancement: 60 });

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function numero(v) { return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; }

// Reglages (config/quotas.json#api_football.buteurs_jour_de_match), bornes sures sinon.
function reglages(quotas) {
  const r = quotas && quotas.api_football && estObjet(quotas.api_football.buteurs_jour_de_match) ? quotas.api_football.buteurs_jour_de_match : {};
  const borne = function (v, d, min, max) { const x = numero(v); return x === null ? d : Math.max(min, Math.min(max, x)); };
  return {
    fenetre_minutes: borne(r.fenetre_minutes, DEFAUTS.fenetre_minutes, 15, 360),
    max_matchs_par_lancement: borne(r.max_matchs_par_lancement, DEFAUTS.max_matchs_par_lancement, 1, 60),
    max_appels_par_lancement: borne(r.max_appels_par_lancement, DEFAUTS.max_appels_par_lancement, 1, 300),
  };
}

// Coup d'envoi (ms) d'un match de data.json (date publique « AAAA-MM-JJ HH:MM », heure de Paris).
function coupEnvoiMs(m) { return parisLocalToMs(m && m.date); }

// Matchs a venir qui commencent dans la fenetre, du plus proche au plus lointain, au plus N.
function matchsProches(matchs, nowMs, cfg) {
  cfg = cfg || reglages(null);
  const fin = nowMs + cfg.fenetre_minutes * 60000;
  return (Array.isArray(matchs) ? matchs : []).filter(function (m) {
    if (!m || m.id == null) return false;
    if (STATUTS_A_VENIR.indexOf(String(m.status || "").toUpperCase()) === -1) return false;
    const ko = coupEnvoiMs(m);
    return ko !== null && ko > nowMs && ko <= fin;
  }).sort(function (a, b) { return coupEnvoiMs(a) - coupEnvoiMs(b) || Number(a.id) - Number(b.id); })
    .slice(0, cfg.max_matchs_par_lancement);
}

// Equipe (« home » / « away ») d'un bloc de reponse API-Football (team.id), ou null.
function coteDe(m, team) {
  const t = numero(team && team.id);
  if (t === null) return null;
  if (t === numero(m && m.home && m.home.id)) return "home";
  if (t === numero(m && m.away && m.away.id)) return "away";
  return null;
}
function joueurs(liste) {
  return (Array.isArray(liste) ? liste : []).map(function (p) {
    const j = p && p.player ? p.player : p;
    return j ? { id: numero(j.id), name: typeof j.name === "string" ? j.name : "" } : null;
  }).filter(function (j) { return j && (j.id !== null || j.name); });
}

// /fixtures/lineups -> { home: { startXI }, away: { startXI } } (meme forme que le pipeline) ou null.
function compositionDepuisApi(m, rep) {
  const items = rep && Array.isArray(rep.response) ? rep.response : [];
  const out = {};
  items.forEach(function (it) {
    const c = coteDe(m, it && it.team);
    if (c) out[c] = { formation: (it && it.formation) || null, startXI: joueurs(it && it.startXI), substitutes: joueurs(it && it.substitutes) };
  });
  return out.home || out.away ? out : null;
}

// /injuries?fixture= -> [{ name, player_id, team, type, reason }] (type : « Missing Fixture » / « Questionable »).
function absencesDepuisApi(rep) {
  const items = rep && Array.isArray(rep.response) ? rep.response : [];
  return items.map(function (it) {
    const p = it && it.player ? it.player : {};
    return { name: typeof p.name === "string" ? p.name : "", player_id: numero(p.id), team: numero(it && it.team && it.team.id), type: p.type || null, reason: p.reason || null };
  }).filter(function (a) { return a.name || a.player_id !== null; });
}

// /players/squads?team= -> [{ id, name }] (effectif convoque), [] si illisible.
function effectifDepuisApi(rep) {
  const items = rep && Array.isArray(rep.response) ? rep.response : [];
  return items.length && items[0] ? joueurs(items[0].players) : [];
}

// Composition complete des deux equipes (11 titulaires lus de chaque cote).
function compositionComplete(lineups) {
  return !!lineups && ["home", "away"].every(function (c) { return lineups[c] && Array.isArray(lineups[c].startXI) && lineups[c].startXI.length >= 11; });
}

// Fixture pseudo-API-Football pour la garde coup d'envoi d'un match qui n'a pas ete relu a ce lancement
// (candidat au remplacement du buteur du jour) : statut et heure du dernier calcul (data.json).
function fixtureDepuisData(m) {
  const ko = coupEnvoiMs(m);
  return { fixture: { id: numero(m && m.id), status: { short: String((m && m.status) || "NS").toUpperCase() }, timestamp: ko !== null ? Math.floor(ko / 1000) : null } };
}

module.exports = { reglages, matchsProches, coupEnvoiMs, compositionDepuisApi, absencesDepuisApi, effectifDepuisApi, compositionComplete, fixtureDepuisData, DEFAUTS };
