"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 6. Utilise D'ABORD les
// positions REELLEMENT presentes dans le pilot (F/M/D/G - voir
// data/player-lab/pilot-report-2024.json#position_distribution).
// Politique EXPLICITE pour UNKNOWN (5/15188 lignes du pilot) : jamais
// bucket silencieusement dans un groupe existant - retombe sur un
// prior GLOBAL (toutes positions confondues), explicitement tague.

const POSITION_GROUPS = ["F", "M", "D", "G"];
const UNKNOWN_GROUP = "UNKNOWN";
const UNKNOWN_POLICY = "FALLBACK_TO_GLOBAL_PRIOR";

function resolvePositionGroup(position) {
  if (POSITION_GROUPS.includes(position)) return position;
  return UNKNOWN_GROUP;
}

module.exports = { POSITION_GROUPS, UNKNOWN_GROUP, UNKNOWN_POLICY, resolvePositionGroup };
