"use strict";
// MARKET LAB - PHASE 3A (2026-09-05), item 6. Trois horizons de
// decision SEPARES et PRE-ENREGISTRES MAINTENANT - jamais choisis apres
// coup selon le ROI. CLOSE reste diagnostic uniquement pour l'instant
// (utile au futur CLV, item 16), jamais un horizon de decision.
const EXECUTION_HORIZONS = {
  EARLY: { snapshotPhase: "T24", role: "DECISION" },
  STANDARD: { snapshotPhase: "T6", role: "DECISION" },
  LATE: { snapshotPhase: "T1", role: "DECISION" },
  CLOSE: { snapshotPhase: "CLOSE", role: "DIAGNOSTIC_ONLY" },
};

function decisionHorizons() {
  return Object.keys(EXECUTION_HORIZONS).filter((h) => EXECUTION_HORIZONS[h].role === "DECISION");
}

module.exports = { EXECUTION_HORIZONS, decisionHorizons };
