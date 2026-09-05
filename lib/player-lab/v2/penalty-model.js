"use strict";
// PLAYER SCORER V2 (2026-09-05), item 13. Tireur de penalty
// CONDITIONNEL aux joueurs presents (R) - scored ET missed comptent
// comme preuve d'identite du tireur designe (un echec ne retire pas le
// statut de tireur designe). Si aucun tireur connu n'est present dans
// R : repli documente vers une distribution UNIFORME sur R (jamais un
// bonus arbitraire, jamais un joueur hors R choisi).

// attempts = [{ team_id, player_id }] (scored+missed confondus), TRAIN uniquement.
function fitPenaltyTakerCounts(attempts) {
  const counts = new Map(); // team_id -> Map(player_id -> n)
  for (const a of attempts) {
    if (!counts.has(a.team_id)) counts.set(a.team_id, new Map());
    const teamCounts = counts.get(a.team_id);
    teamCounts.set(a.player_id, (teamCounts.get(a.player_id) || 0) + 1);
  }
  return counts;
}

// riskSetPlayerIds : joueurs presents au moment du penalty. Retourne
// une Map player_id -> probabilite, definie UNIQUEMENT sur riskSetPlayerIds.
function penaltyTakerDistribution(teamCounts, riskSetPlayerIds) {
  const available = riskSetPlayerIds.filter((id) => teamCounts && teamCounts.has(id));
  if (available.length === 0) {
    const p = 1 / riskSetPlayerIds.length;
    return new Map(riskSetPlayerIds.map((id) => [id, p]));
  }
  const total = available.reduce((s, id) => s + teamCounts.get(id), 0);
  const dist = new Map();
  for (const id of riskSetPlayerIds) dist.set(id, available.includes(id) ? teamCounts.get(id) / total : 0);
  return dist;
}

module.exports = { fitPenaltyTakerCounts, penaltyTakerDistribution };
