"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 12. Audite les valeurs REELLES
// de position dans le pilot - ne cree AUCUN regroupement arbitraire.
// Les groupes de priors hierarchiques seront figes plus tard, une fois
// la distribution reelle connue.
function auditPositions(rows) {
  const freq = new Map();
  for (const row of rows) {
    const pos = row.position || "UNKNOWN";
    freq.set(pos, (freq.get(pos) || 0) + 1);
  }
  return [...freq.entries()].map(([position, count]) => ({ position, count })).sort((a, b) => b.count - a.count);
}

module.exports = { auditPositions };
