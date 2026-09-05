"use strict";
// PLAYER LAB - PILOT (2026-09-05), items 8-10. Reconstruit chaque but
// REGLEMENTAIRE depuis /fixtures/events, avec detection penalty/own-goal
// et reconciliation obligatoire contre le score reglementaire (AET/PEN
// shootout EXCLUS - jamais un but de tirs au but compte comme un but).

// Detail strings observes reellement chez API-Football pour un but :
// "Normal Goal", "Penalty", "Own Goal", parfois "Missed Penalty" (type
// "Var" ou "Goal" selon les cas) - on classe par mot-cle plutot que par
// egalite stricte pour rester robuste aux variantes.
function isPenaltyGoal(detail) {
  return /penalty/i.test(detail || "") && !/missed/i.test(detail || "");
}
function isOwnGoal(detail) {
  return /own goal/i.test(detail || "");
}
function isMissedPenalty(detail) {
  return /missed penalty/i.test(detail || "");
}

// eventsRaw = raw_payload de /fixtures/events (cache.js). Ne retient
// que type="Goal" - jamais un evenement de tirs au but (shootout), qui
// n'existe de toute facon pas sous ce type dans ce endpoint.
function extractGoalEvents(fixtureMeta, eventsRaw) {
  const events = (eventsRaw && eventsRaw.response) || [];
  const goalEvents = [];
  const missedPenalties = [];
  for (const e of events) {
    if (e.type === "Goal") {
      if (isMissedPenalty(e.detail)) { missedPenalties.push({ fixture_id: fixtureMeta.fixture_id, team_id: e.team ? e.team.id : null, player_id: e.player ? e.player.id : null, minute: e.time ? e.time.elapsed : null, detail: e.detail }); continue; }
      goalEvents.push({
        fixture_id: fixtureMeta.fixture_id,
        team_id: e.team ? e.team.id : null,
        player_id: e.player ? e.player.id : null,
        player_name: e.player ? e.player.name : null,
        minute: e.time ? e.time.elapsed : null,
        extra_minute: e.time ? e.time.extra : null,
        assist_player_id: e.assist ? e.assist.id : null,
        detail: e.detail,
        penalty_flag: isPenaltyGoal(e.detail),
        own_goal_flag: isOwnGoal(e.detail),
      });
    }
  }
  return { goalEvents, missedPenalties };
}

// Conservation de masse (item 8) : la somme des buts attribues doit
// egaler le score reglementaire (90 minutes, data/gate-b1
// goals_home_90/goals_away_90 - jamais goals_final qui inclut l'AET).
//
// CORRECTION (verifiee contre une fixture reelle du pilot, 1208028
// Brentford-Crystal Palace) : pour un evenement "Own Goal",
// `e.team` renvoye par l'API est DEJA l'equipe CREDITEE (beneficiaire)
// du but, PAS l'equipe du joueur malheureux qui l'a marque contre son
// camp. Exemple reel : E. Pinnock (Brentford, id joueur) marque contre
// son camp, l'evenement porte team=Crystal Palace (l'equipe creditee) -
// aucune inversion a faire ici, g.team_id est deja le bon cote. Une
// premiere version de ce code re-inversait ce champ et cassait la
// reconciliation sur les 32/380 fixtures avec un CSC (detecte par le
// test de conservation de masse lui-meme - exactement l'objectif de
// l'item 8).
function reconcileRegulatoryGoals(fixtureMeta, goalEvents) {
  let homeAttributed = 0, awayAttributed = 0;
  for (const g of goalEvents) {
    if (g.team_id === fixtureMeta.home_team_id) homeAttributed++;
    else if (g.team_id === fixtureMeta.away_team_id) awayAttributed++;
  }
  const homeRegulatory = fixtureMeta.goals_home_90;
  const awayRegulatory = fixtureMeta.goals_away_90;
  const match = homeAttributed === homeRegulatory && awayAttributed === awayRegulatory;
  return {
    fixture_id: fixtureMeta.fixture_id,
    home_attributed: homeAttributed,
    away_attributed: awayAttributed,
    home_regulatory: homeRegulatory,
    away_regulatory: awayRegulatory,
    match,
    discrepancy_reason: match ? null : "GOAL_COUNT_MISMATCH",
  };
}

module.exports = { extractGoalEvents, reconcileRegulatoryGoals, isPenaltyGoal, isOwnGoal, isMissedPenalty };
