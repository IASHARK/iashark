"use strict";
// Housekeeping (2026-09-05) - le registre central experiment_registry.json
// resout la collision de nommage informelle "EXP-005" entre deux familles
// independantes (GATE-A production, SCORE-LAB M0->M5). Ce test garantit
// que la nomenclature CANONIQUE (pas les identifiants informels, qui
// peuvent legitimement collisionner entre familles distinctes) reste
// unique et que chaque artefact reference existe reellement sur disque -
// aucun contenu historique modifie, uniquement un test de coherence du
// registre lui-meme.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const REGISTRY_PATH = path.join(__dirname, "..", "scripts", "experiments", "experiment_registry.json");
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));

test("le registre existe et contient au moins les experiences SCORE-LAB et GATE-A attendues", () => {
  assert.ok(Array.isArray(registry.experiments));
  assert.ok(registry.experiments.length >= 10);
  assert.ok(registry.families["GATE-A"]);
  assert.ok(registry.families["SCORE-LAB"]);
});

test("canonical IDs uniques : aucun experiment.canonical_id n'est duplique", () => {
  const ids = registry.experiments.map((e) => e.canonical_id);
  const seen = new Set();
  const duplicates = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  assert.deepEqual(duplicates, [], `canonical_id duplique(s) detecte(s): ${JSON.stringify(duplicates)}`);
});

test("canonical artifact paths uniques : aucun chemin d'artefact n'est reference par DEUX experiences canoniques differentes", () => {
  const pathToOwners = new Map();
  for (const exp of registry.experiments) {
    for (const artifact of exp.artifacts) {
      if (!pathToOwners.has(artifact.path)) pathToOwners.set(artifact.path, []);
      pathToOwners.get(artifact.path).push(exp.canonical_id);
    }
  }
  const collisions = [];
  for (const [p, owners] of pathToOwners) {
    if (owners.length > 1) collisions.push({ path: p, owners });
  }
  assert.deepEqual(collisions, [], `chemin(s) d'artefact reference(s) par plusieurs experiences canoniques distinctes: ${JSON.stringify(collisions)}`);
});

test("chaque chemin d'artefact reference dans le registre existe reellement sur disque", () => {
  const repoRoot = path.join(__dirname, "..");
  const missing = [];
  for (const exp of registry.experiments) {
    for (const artifact of exp.artifacts) {
      if (!fs.existsSync(path.join(repoRoot, artifact.path))) missing.push(artifact.path);
    }
  }
  assert.deepEqual(missing, [], `artefact(s) reference(s) manquant(s) sur disque: ${JSON.stringify(missing)}`);
});

test("chaque hash sha256 declare dans le registre (quand present) correspond au contenu REEL du fichier sur disque - preuve que le registre n'a pas derive du contenu qu'il decrit", () => {
  const repoRoot = path.join(__dirname, "..");
  const crypto = require("crypto");
  const mismatches = [];
  for (const exp of registry.experiments) {
    for (const artifact of exp.artifacts) {
      if (!artifact.sha256) continue;
      const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, artifact.path))).digest("hex");
      if (actual !== artifact.sha256) mismatches.push({ path: artifact.path, expected: artifact.sha256, actual });
    }
  }
  assert.deepEqual(mismatches, [], `hash(s) desynchronise(s) du registre: ${JSON.stringify(mismatches)}`);
});

test("la collision connue EXP-005 est explicitement documentee (known_collisions non vide) et les deux resolutions canoniques distinctes existent", () => {
  assert.ok(Array.isArray(registry.known_collisions) && registry.known_collisions.length >= 1);
  const scoreLabExp005 = registry.experiments.find((e) => e.canonical_id === "SCORE-LAB-EXP-005");
  const gateAExp005 = registry.experiments.find((e) => e.canonical_id === "GATE-A4-EXP-005");
  assert.ok(scoreLabExp005, "SCORE-LAB-EXP-005 doit exister dans le registre");
  assert.ok(gateAExp005, "GATE-A4-EXP-005 doit exister dans le registre");
  assert.notEqual(scoreLabExp005.artifacts[0].path, gateAExp005.artifacts[0].path, "les deux EXP-005 historiques doivent maintenant pointer vers des chemins distincts");
});

test("le GATE-A4-EXP-005 restaure est BYTE-IDENTIQUE au contenu du commit d'origine (613e3976) - aucune alteration lors de la disambiguation", () => {
  const { execSync } = require("child_process");
  const repoRoot = path.join(__dirname, "..");
  const original = execSync("git show 613e3976:scripts/experiments/exp005_report.json", { cwd: repoRoot, encoding: "utf8" });
  const restored = fs.readFileSync(path.join(repoRoot, "scripts", "experiments", "gate_a4_adaptive_matrix_exp005_report.json"), "utf8");
  assert.equal(restored, original, "le contenu restaure doit etre EXACTEMENT identique a l'original historique, aucune alteration");
});
