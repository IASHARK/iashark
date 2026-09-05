"use strict";
// PLAYER SCORER V2 (2026-09-05), item 3. Reconstruit R_e = les joueurs
// de l'equipe REELLEMENT sur le terrain au moment exact d'un but - a
// partir du XI de depart + substitutions + cartons rouges
// (/fixtures/events). minutes_played (agrege post-match) N'EST JAMAIS
// utilise comme verite temporelle principale - seule la sequence
// d'evenements donne une trace instant-par-instant fiable.

// teamEvents = evenements /fixtures/events de CETTE equipe uniquement.
// Retourne une liste ordonnee de changements d'etat sur le terrain.
function buildFieldTimeline(teamEvents) {
  const changes = [];
  for (const e of teamEvents) {
    const minute = e.time.elapsed + (e.time.extra || 0);
    if (e.type === "subst") {
      changes.push({ minute, playerOut: e.player ? e.player.id : null, playerIn: e.assist ? e.assist.id : null });
    } else if (e.type === "Card" && /red/i.test(e.detail || "")) {
      changes.push({ minute, playerOut: e.player ? e.player.id : null, playerIn: null });
    }
  }
  changes.sort((a, b) => a.minute - b.minute);
  return changes;
}

// Applique tous les changements dont minute <= `minute` au XI de
// depart - retourne le Set des player_id sur le terrain a cet instant.
function playersOnFieldAt(startingXIPlayerIds, changes, minute) {
  const onField = new Set(startingXIPlayerIds);
  for (const c of changes) {
    if (c.minute > minute) break;
    if (c.playerOut) onField.delete(c.playerOut);
    if (c.playerIn) onField.add(c.playerIn);
  }
  return onField;
}

function buildRiskSetForGoal(startingXIPlayerIds, teamEvents, goalMinute) {
  const changes = buildFieldTimeline(teamEvents);
  return playersOnFieldAt(startingXIPlayerIds, changes, goalMinute);
}

// item 3, contrat de reconciliation : le VRAI buteur doit appartenir a
// R_e. Rapporte le taux global sur un ensemble de buts - jamais un
// simple oui/non par but, le taux global est ce qui est gate a >=99.5%.
function computeReconciliationRate(goalsWithRiskSets) {
  let matched = 0;
  for (const g of goalsWithRiskSets) {
    if (g.riskSet.has(g.scorerId)) matched++;
  }
  return { n_total: goalsWithRiskSets.length, n_matched: matched, rate_pct: goalsWithRiskSets.length ? (100 * matched) / goalsWithRiskSets.length : null };
}

module.exports = { buildFieldTimeline, playersOnFieldAt, buildRiskSetForGoal, computeReconciliationRate };
