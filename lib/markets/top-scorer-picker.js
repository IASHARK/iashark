"use strict";
// Selection deterministe des meilleurs candidats buteurs d'un match, a
// partir du VRAI volume/qualite de tirs (pas juste les buts recents, trop
// bruites sur un petit echantillon) - meme principe que les xG en analyse
// foot moderne : le volume et la precision des tirs predisent mieux les
// buts futurs qu'une serie de resultats passes.
//
// Jamais decide par le LLM (MASTER V2.1 - le choix reste du code
// deterministe ; Claude ne fait que rediger le texte qui explique ce choix
// deja calcule, cf genAnalyse dans update-data.yml). Extrait du pipeline
// pour etre reellement testable, meme principe que lib/odds.js et
// lib/markets/score-matrix.js.

const MIN_APPEARANCES = 3; // en dessous, le taux par-90 est trop bruite pour etre exploite
const SHRINKAGE_K = 6; // force du lissage bayesien : equivaut a 6 tirs cadres de "poids" donnes a la moyenne du pool compare

function aggregatePlayer(rows, teamId) {
  const byPlayer = {};
  (rows || []).forEach((r) => {
    if (Number(r.team_id) !== Number(teamId)) return;
    const id = r.player_id;
    if (!Number.isFinite(id)) return;
    (byPlayer[id] || (byPlayer[id] = [])).push(r);
  });
  return Object.keys(byPlayer)
    .map((id) => {
      const rows2 = byPlayer[id];
      const minutes = rows2.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
      const shotsTotal = rows2.reduce((s, r) => s + (Number(r.shots_total) || 0), 0);
      const shotsOn = rows2.reduce((s, r) => s + (Number(r.shots_on) || 0), 0);
      const goals = rows2.reduce((s, r) => s + (Number(r.goals) || 0), 0);
      const appearances = rows2.filter((r) => Number(r.minutes) > 0).length;
      const per90 = (v) => (minutes > 0 ? Math.round(((v * 90) / minutes) * 100) / 100 : null);
      const info = rows2[0];
      return {
        player_id: Number(id), team_id: teamId, name: info.name, photo: info.photo, position: info.position,
        appearances, minutes, goals, shotsOn, shotsTotal,
        shotsTotal90: per90(shotsTotal), shotsOn90: per90(shotsOn), goals90: per90(goals),
      };
    })
    .filter((p) => p.appearances >= MIN_APPEARANCES && (p.position || "") !== "G");
}

// critHome/critAway : { att, def } deja calcules ailleurs dans le pipeline
// (calcCriteres) - reutilise le meme multiplicateur adversaire que
// computePlayerMarketsForFixture, pas une formule redefinie differemment.
function pickTopScorerCandidates(playerHistoryHome, playerHistoryAway, homeTeamId, awayTeamId, critHome, critAway, limit) {
  limit = limit || 2;
  const pool = aggregatePlayer(playerHistoryHome, homeTeamId).concat(aggregatePlayer(playerHistoryAway, awayTeamId));
  if (!pool.length) return [];

  // Taux de conversion moyen REEL observe sur ce pool precis (pas une
  // constante inventee) - sert d'ancrage pour lisser les petits
  // echantillons individuels (shrinkage empirique standard : un joueur a 1
  // but sur 2 tirs cadres n'est pas traite comme "50% de conversion" mais
  // ramene vers cette moyenne reelle tant que son propre echantillon est
  // petit).
  const poolShotsOn = pool.reduce((s, p) => s + p.shotsOn, 0);
  const poolGoals = pool.reduce((s, p) => s + p.goals, 0);
  const baselineConversion = poolShotsOn > 0 ? poolGoals / poolShotsOn : 0.15;
  const maxShotsOn90 = Math.max(...pool.map((p) => p.shotsOn90 || 0), 0.01);
  const maxShotsTotal90 = Math.max(...pool.map((p) => p.shotsTotal90 || 0), 0.01);

  pool.forEach((p) => {
    const smoothedConversion = (p.goals + SHRINKAGE_K * baselineConversion) / (p.shotsOn + SHRINKAGE_K);
    const reliability = Math.min(1, p.minutes / (p.appearances * 90)) * Math.min(1, p.appearances / 5);
    const isHomePlayer = Number(p.team_id) === Number(homeTeamId);
    const opponentCrit = isHomePlayer ? critAway : critHome;
    const opponentDefenseMultiplier = opponentCrit ? Math.max(0.7, Math.min(1.3, 1 + (50 - opponentCrit.def) / 100)) : 1;
    const normShotsOn = (p.shotsOn90 || 0) / maxShotsOn90;
    const normShotsTotal = (p.shotsTotal90 || 0) / maxShotsTotal90;
    const normConversion = baselineConversion > 0 ? Math.min(2, smoothedConversion / baselineConversion) / 2 : 0;
    p.smoothedConversion = Math.round(smoothedConversion * 1000) / 1000;
    p.reliability = Math.round(reliability * 100) / 100;
    p.opponentDefenseMultiplier = Math.round(opponentDefenseMultiplier * 100) / 100;
    p.baselineConversion = Math.round(baselineConversion * 1000) / 1000;
    p.goalThreatScore = Math.round(100 * (0.5 * normShotsOn + 0.25 * normShotsTotal + 0.25 * normConversion) * reliability * opponentDefenseMultiplier);
  });

  return pool.sort((a, b) => b.goalThreatScore - a.goalThreatScore).slice(0, limit);
}

module.exports = { pickTopScorerCandidates, MIN_APPEARANCES, SHRINKAGE_K };
