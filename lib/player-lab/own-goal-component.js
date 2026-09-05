"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 10. own_goal_mass : part
// de la masse de but d'une equipe attribuable a un CSC adverse - JAMAIS
// attribuee a un attaquant. Estimee depuis TRAIN comme un taux LIGUE
// (own_goals_total / total_goals_total) - un CSC est un evenement rare
// et largement independant de l'identite de l'equipe qui en beneficie ;
// un taux ligue est le choix le plus stable aux volumes disponibles
// (33 CSC / 1115 buts observes sur le pilot 2024-25, echelle comparable
// attendue sur TRAIN).
function fitOwnGoalRate(goalEvents) {
  const totalGoals = goalEvents.length;
  const ownGoals = goalEvents.filter((g) => g.own_goal_flag).length;
  return { own_goal_mass: totalGoals > 0 ? ownGoals / totalGoals : 0, n_total_goals: totalGoals, n_own_goals: ownGoals };
}

module.exports = { fitOwnGoalRate };
