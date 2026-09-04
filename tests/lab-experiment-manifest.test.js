"use strict";
// GATE C4 - le manifest EXP-001 encode le gating obligatoire (les 4
// conditions doivent TOUTES etre satisfied:true avant toute transition
// vers RUNNING). GATE B1 a reellement collecte les fixtures Premier
// League le 2026-09-04 (voir data/gate-b1/, scripts/collect_gate_b1_premier_league.js,
// scripts/finalize_gate_b7_b8.js) - le manifest COMMITE reflete donc
// maintenant un gating satisfait, plus BLOCKED_DATA. La logique de
// blocage elle-meme reste testee explicitement via un manifest synthetique
// force a false, independamment de cet etat reel qui continuera d'evoluer.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadManifest, evaluateGate, attemptTransitionToRunning, DEFAULT_MANIFEST_PATH } = require("../lib/lab/experiment-manifest.js");

function blockedManifest() {
  const manifest = loadManifest();
  return {
    ...manifest,
    gating_to_running: {
      ...manifest.gating_to_running,
      conditions: manifest.gating_to_running.conditions.map((c) => ({ ...c, satisfied: false })),
    },
  };
}

test("le manifest EXP-001 commite (GATE B1 reellement execute le 2026-09-04) a un dataset_version et un lockbox scelle", () => {
  const manifest = loadManifest();
  assert.equal(manifest.experiment_id, "EXP-001");
  assert.equal(manifest.registration_status, "REGISTERED");
  assert.ok(manifest.dataset.dataset_version, "dataset_version doit etre calcule (GATE B7 execute)");
  assert.equal(manifest.dataset.lockbox_sealed, true, "le lockbox 2025-2026 doit etre scelle (GATE B8 execute)");
});

test("le manifest commite a ses 4 conditions de gating a true (collecte reelle GATE B1-B8 executee)", () => {
  const manifest = loadManifest();
  const ids = manifest.gating_to_running.conditions.map((c) => c.id);
  assert.deepEqual(ids.sort(), ["B6_FIDELITY_PASSED", "DATASET_EXISTS", "DATASET_VERSION_COMPUTED", "LOCKBOX_SEALED"].sort());
  for (const c of manifest.gating_to_running.conditions) {
    assert.equal(c.satisfied, true, `condition ${c.id} devrait etre satisfied sur le manifest commite (GATE B1-B8 reellement executes)`);
  }
});

test("evaluateGate: can_run=true sur le manifest commite (gating reellement satisfait)", () => {
  const manifest = loadManifest();
  const gate = evaluateGate(manifest);
  assert.equal(gate.can_run, true);
  assert.deepEqual(gate.blocking_ids, []);
});

test("evaluateGate: can_run=false et les 4 ids bloquants remontes sur un manifest EXPLICITEMENT bloque (synthetique)", () => {
  const manifest = blockedManifest();
  const gate = evaluateGate(manifest);
  assert.equal(gate.can_run, false);
  assert.equal(gate.blocking_ids.length, 4);
});

test("attemptTransitionToRunning: leve une exception explicite (code GATING_BLOCKED) sur un manifest EXPLICITEMENT bloque (synthetique), ne renvoie jamais RUNNING", () => {
  const manifest = blockedManifest();
  assert.throws(() => attemptTransitionToRunning(manifest), (err) => {
    assert.equal(err.code, "GATING_BLOCKED");
    assert.equal(err.blocking_ids.length, 4);
    return true;
  });
});

test("evaluateGate: can_run=true uniquement quand les 4 conditions sont TOUTES satisfied:true", () => {
  const manifest = loadManifest();
  const fullySatisfied = {
    ...manifest,
    gating_to_running: {
      ...manifest.gating_to_running,
      conditions: manifest.gating_to_running.conditions.map((c) => ({ ...c, satisfied: true })),
    },
  };
  const gate = evaluateGate(fullySatisfied);
  assert.equal(gate.can_run, true);
  assert.deepEqual(gate.blocking_ids, []);
});

test("evaluateGate: une SEULE condition non satisfaite parmi les 4 suffit a bloquer (pas de majorite, unanimite requise)", () => {
  const manifest = loadManifest();
  const almostAllSatisfied = {
    ...manifest,
    gating_to_running: {
      ...manifest.gating_to_running,
      conditions: manifest.gating_to_running.conditions.map((c, i) => ({ ...c, satisfied: i !== 0 })),
    },
  };
  const gate = evaluateGate(almostAllSatisfied);
  assert.equal(gate.can_run, false);
  assert.equal(gate.blocking_ids.length, 1);
});

test("attemptTransitionToRunning: succes uniquement quand toutes les conditions sont vraies, status devient RUNNING", () => {
  const manifest = loadManifest();
  const fullySatisfied = {
    ...manifest,
    gating_to_running: {
      ...manifest.gating_to_running,
      conditions: manifest.gating_to_running.conditions.map((c) => ({ ...c, satisfied: true })),
    },
  };
  const result = attemptTransitionToRunning(fullySatisfied);
  assert.equal(result.status, "RUNNING");
});

test("DEFAULT_MANIFEST_PATH pointe vers un fichier reellement present", () => {
  const fs = require("node:fs");
  assert.ok(fs.existsSync(DEFAULT_MANIFEST_PATH), `${DEFAULT_MANIFEST_PATH} devrait exister`);
});
