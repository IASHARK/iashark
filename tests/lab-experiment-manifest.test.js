"use strict";
// GATE C4 - le manifest EXP-001 tel que commite doit rester BLOCKED_DATA
// (aucune fixture reelle n'existe encore), et le gating doit refuser
// TOUTE transition vers RUNNING tant que les 4 conditions ne sont pas
// toutes satisfaites - c'est le garde-fou qui empeche un lancement
// premature ou une confusion synthetique/reel.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadManifest, evaluateGate, attemptTransitionToRunning, DEFAULT_MANIFEST_PATH } = require("../lib/lab/experiment-manifest.js");

test("le manifest EXP-001 commite est REGISTERED / BLOCKED_DATA, jamais RUNNING", () => {
  const manifest = loadManifest();
  assert.equal(manifest.experiment_id, "EXP-001");
  assert.equal(manifest.registration_status, "REGISTERED");
  assert.equal(manifest.status, "BLOCKED_DATA");
  assert.equal(manifest.dataset.dataset_version, null, "dataset_version doit rester null tant que le dataset reel n'existe pas");
  assert.equal(manifest.dataset.lockbox_sealed, false);
});

test("le manifest commite a ses 4 conditions de gating a false (aucune fixture reelle collectee)", () => {
  const manifest = loadManifest();
  const ids = manifest.gating_to_running.conditions.map((c) => c.id);
  assert.deepEqual(ids.sort(), ["B6_FIDELITY_PASSED", "DATASET_EXISTS", "DATASET_VERSION_COMPUTED", "LOCKBOX_SEALED"].sort());
  for (const c of manifest.gating_to_running.conditions) {
    assert.equal(c.satisfied, false, `condition ${c.id} ne devrait pas etre satisfied sur le manifest commite`);
  }
});

test("evaluateGate: can_run=false et les 4 ids bloquants remontes sur le manifest commite", () => {
  const manifest = loadManifest();
  const gate = evaluateGate(manifest);
  assert.equal(gate.can_run, false);
  assert.equal(gate.blocking_ids.length, 4);
});

test("attemptTransitionToRunning: leve une exception explicite (code GATING_BLOCKED) sur le manifest commite, ne renvoie jamais RUNNING", () => {
  const manifest = loadManifest();
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
