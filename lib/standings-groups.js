"use strict";
// GROUPES D'UN CLASSEMENT API-FOOTBALL (audit SEO du 19/09/2026).
//
// api-football renvoie league.standings = un tableau de GROUPES (chaque groupe
// = un tableau de lignes, champ `group` = nom du groupe). Selon la competition :
//   - un seul groupe (Premier League, Liga MX « Liga MX: Apertura », phase de
//     ligue UEFA) ;
//   - des groupes PARALLELES (MLS : Eastern Conference + Western Conference ;
//     Argentine : Clausura - Group A + Clausura - Group B) ;
//   - des PHASES successives (Colombie : Apertura puis Clausura ; Perou : Tabla
//     Anual, Apertura, Clausura ; Argentine : Apertura A/B puis Clausura A/B).
//
// Bug corrige : le pipeline ne gardait que standings[0], affiche sous le nom de
// la competition. MLS : la seule Western Conference, titree « Major League
// Soccer » (et aucune ligne pour un club de l'Est) ; Argentine et Colombie :
// le tableau de l'Apertura TERMINEE presente comme classement actuel.
//
// Regle, entierement tiree des donnees (jamais un nom de groupe devine) :
//   1. deux groupes qui partagent au moins une equipe appartiennent a deux
//      phases differentes ; des groupes sans equipe commune, consecutifs dans
//      l'ordre api-football, forment une meme phase (groupes paralleles) ;
//   2. la phase affichee est la DERNIERE phase dont au moins une equipe a joue
//      (api-football liste les phases dans l'ordre chronologique) ;
//   3. un groupe garde toujours son nom api-football ; plusieurs groupes ne
//      sont jamais fusionnes en un seul classement.
//
// Module pur, sans acces disque : pipeline (.github/workflows/update-data.yml),
// scripts/league-hub-data.js et tests/standings-groups.test.js.

function num(v) { var n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN); return isFinite(n) ? n : null; }
function str(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }

// Identifiant d'equipe d'une ligne, forme api-football brute (r.team.id) ou
// normalisee (team_id / teamId).
function teamIdOf(r) {
  if (!r || typeof r !== "object") return null;
  if (r.team && r.team.id != null) return num(r.team.id);
  if (r.team_id != null) return num(r.team_id);
  if (r.teamId != null) return num(r.teamId);
  return null;
}
function playedOf(r) {
  if (!r || typeof r !== "object") return null;
  if (r.all && r.all.played != null) return num(r.all.played);
  return num(r.played);
}

// Groupes non vides : { name, rows } (rows = lignes telles quelles).
// Accepte le tableau api-football (tableau de tableaux) ou une liste deja
// normalisee [{ name, rows }].
function normalizeGroups(standings) {
  if (!Array.isArray(standings)) return [];
  return standings.map(function (g) {
    if (Array.isArray(g)) return g.length ? { name: str(g[0] && g[0].group), rows: g } : null;
    if (g && Array.isArray(g.rows)) return g.rows.length ? { name: str(g.name), rows: g.rows } : null;
    return null;
  }).filter(Boolean);
}

function teamSet(group) {
  var s = {};
  group.rows.forEach(function (r) { var id = teamIdOf(r); if (id != null) s[id] = true; });
  return s;
}
function shareTeams(a, b) {
  return Object.keys(a).some(function (k) { return b[k]; });
}

// Phases successives, chacune = liste de groupes paralleles.
function phases(groups) {
  var out = [];
  var cur = null, curTeams = null;
  groups.forEach(function (g) {
    var t = teamSet(g);
    if (cur && !shareTeams(curTeams, t)) {
      cur.push(g);
      Object.keys(t).forEach(function (k) { curTeams[k] = true; });
      return;
    }
    cur = [g];
    curTeams = Object.assign({}, t);
    out.push(cur);
  });
  return out;
}

// Groupes de la phase en cours : derniere phase dont une equipe a joue, sinon
// la derniere phase listee.
function currentPhaseGroups(standings) {
  var ph = phases(normalizeGroups(standings));
  if (!ph.length) return [];
  for (var i = ph.length - 1; i >= 0; i--) {
    var started = ph[i].some(function (g) { return g.rows.some(function (r) { return (playedOf(r) || 0) > 0; }); });
    if (started) return ph[i];
  }
  return ph[ph.length - 1];
}

// Groupe de la phase en cours qui contient l'equipe (null si absente).
function groupOfTeam(standings, teamId) {
  var id = num(teamId);
  if (id == null) return null;
  var groups = currentPhaseGroups(standings);
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].rows.some(function (r) { return teamIdOf(r) === id; })) return groups[i];
  }
  return null;
}

// Nom de groupe a afficher : null quand la phase ne compte qu'un groupe qui
// porte le nom de la competition (classement unique, rien a preciser) ; sinon
// le nom api-football, prefixe « <competition>: » retire (« Primera Division:
// Clausura » -> « Clausura », « Liga MX: Apertura » -> « Apertura »).
function groupLabel(name, leagueName, groupCount) {
  var n = str(name);
  if (!n) return null;
  var lg = str(leagueName);
  if ((groupCount || 1) <= 1 && lg && n.toLowerCase() === lg.toLowerCase()) return null;
  var i = n.indexOf(": ");
  return i !== -1 ? n.slice(i + 2).trim() || n : n;
}

module.exports = {
  teamIdOf: teamIdOf, normalizeGroups: normalizeGroups, phases: phases,
  currentPhaseGroups: currentPhaseGroups, groupOfTeam: groupOfTeam, groupLabel: groupLabel
};
