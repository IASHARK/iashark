"use strict";
// GATE C4 (SPEC LAB PRO v1.0) - lecture et validation de gating du
// manifest EXP-001. Ce module ne decide RIEN par lui-meme sur les
// donnees reelles : il verifie mecaniquement que les 4 conditions du
// manifest (scripts/experiments/exp001_manifest.json#gating_to_running)
// sont toutes satisfied:true avant d'autoriser une transition
// BLOCKED_DATA -> RUNNING. Utilise par scripts/run_exp001.js (GATE C10)
// comme premiere porte, avant tout calcul.

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MANIFEST_PATH = path.join(__dirname, "..", "..", "scripts", "experiments", "exp001_manifest.json");

function loadManifest(manifestPath) {
  const p = manifestPath || DEFAULT_MANIFEST_PATH;
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

// Retourne {can_run, blocking_ids, blocking_descriptions} - ne mute jamais
// le manifest, purement une lecture/evaluation.
function evaluateGate(manifest) {
  const conditions = (manifest.gating_to_running && manifest.gating_to_running.conditions) || [];
  const unsatisfied = conditions.filter((c) => c.satisfied !== true);
  return {
    can_run: unsatisfied.length === 0 && conditions.length > 0,
    blocking_ids: unsatisfied.map((c) => c.id),
    blocking_descriptions: unsatisfied.map((c) => c.description),
  };
}

// Ne renvoie un manifest avec status:"RUNNING" QUE si evaluateGate dit
// can_run:true - sinon leve une exception explicite listant precisement
// ce qui bloque encore. Jamais de transition partielle/silencieuse.
function attemptTransitionToRunning(manifest) {
  const gate = evaluateGate(manifest);
  if (!gate.can_run) {
    const err = new Error(
      `EXP-001 ne peut pas passer a RUNNING : conditions non satisfaites [${gate.blocking_ids.join(", ")}]`
    );
    err.code = "GATING_BLOCKED";
    err.blocking_ids = gate.blocking_ids;
    err.blocking_descriptions = gate.blocking_descriptions;
    throw err;
  }
  return { ...manifest, status: "RUNNING", registration_status: manifest.registration_status };
}

module.exports = { loadManifest, evaluateGate, attemptTransitionToRunning, DEFAULT_MANIFEST_PATH };
