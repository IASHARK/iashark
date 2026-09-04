#!/usr/bin/env node
"use strict";
// GATE B7 (DATASET_VERSION) + B8 (lockbox 2025-26) sur les donnees
// REELLES collectees par scripts/collect_gate_b1_premier_league.js.
// Met a jour scripts/experiments/exp001_manifest.json en consequence
// (les 4 conditions de gating), jamais a la main.

const fs = require("fs");
const path = require("path");
const { buildDatasetVersion, sealLockbox } = require("../lib/data/dataset-version.js");

const RAW_DIR = path.join(__dirname, "..", "raw_api", "api-football", "fixtures");
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const MANIFEST_PATH = path.join(__dirname, "..", "scripts", "experiments", "exp001_manifest.json");

function findSnapshots() {
  const out = [];
  for (const hashDir of fs.readdirSync(RAW_DIR)) {
    const dirPath = path.join(RAW_DIR, hashDir);
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith(".json")) continue;
      const snap = JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf8"));
      out.push(snap);
    }
  }
  return out;
}

function main() {
  const snapshots = findSnapshots();
  const seasonLabel = { 2022: "2022-2023", 2023: "2023-2024", 2024: "2024-2025", 2025: "2025-2026" };
  const fixtureCounts = {};
  const responseHashes = [];
  for (const snap of snapshots) {
    const season = snap.request_params.season;
    const label = seasonLabel[season];
    responseHashes.push(snap.response_hash);
    fixtureCounts[label] = (snap.body.response || []).length;
  }

  const manifest = {
    league_id: 39,
    seasons: Object.values(seasonLabel),
    response_hashes: responseHashes,
    fixture_counts: fixtureCounts,
    exclusions: {}, // 0 anomalie detectee par GATE B4 sur les 4 saisons (voir gate_b1_collection_report.json)
    schema_version: "v1",
  };

  const { dataset_version, canonical_manifest } = buildDatasetVersion(manifest);

  // Lockbox 2025-2026 : scelle sur les fixture_ids REELS collectes, jamais rouverte pour M0/M1.
  const fixtures2025 = JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, "premier-league-2025.json"), "utf8"));
  const fixtureIds2025 = fixtures2025.map((f) => f.fixture_id);
  const lockbox = sealLockbox(fixtureIds2025, 39, "2025-2026");

  const report = {
    dataset_version,
    canonical_manifest,
    n_raw_snapshots: snapshots.length,
    total_fixtures: Object.values(fixtureCounts).reduce((a, b) => a + b, 0),
    fixture_counts_by_season: fixtureCounts,
    exclusions: manifest.exclusions,
    schema_version: manifest.schema_version,
    lockbox: { league_id: lockbox.league_id, season: lockbox.season, status: lockbox.status, fixture_count: lockbox.fixture_count, fixture_ids_hash: lockbox.fixture_ids_hash, sealed_at: lockbox.sealed_at },
  };

  fs.writeFileSync(path.join(GATE_B1_DIR, "dataset_version_report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(GATE_B1_DIR, "lockbox_2025_2026.json"), JSON.stringify(lockbox, null, 2));

  // Met a jour le manifest EXP-001 : dataset_version, lockbox_sealed, et
  // les 4 conditions de gating passent a TRUE (B6 deja valide separement,
  // voir data/gate-b1/gate_b6_validation_report.json).
  const expManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const b6Report = JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, "gate_b6_validation_report.json"), "utf8"));

  expManifest.dataset.dataset_version = dataset_version;
  expManifest.dataset.lockbox_sealed = true;
  expManifest.status = "REGISTERED"; // sera passe a RUNNING explicitement par le lanceur, jamais ici
  for (const cond of expManifest.gating_to_running.conditions) {
    if (cond.id === "DATASET_EXISTS") cond.satisfied = true;
    if (cond.id === "B6_FIDELITY_PASSED") cond.satisfied = b6Report.b6_fidelity_passed === true;
    if (cond.id === "DATASET_VERSION_COMPUTED") cond.satisfied = !!dataset_version;
    if (cond.id === "LOCKBOX_SEALED") cond.satisfied = lockbox.status === "SEALED";
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(expManifest, null, 2) + "\n");

  console.log("DATASET_VERSION:", dataset_version);
  console.log("n_raw_snapshots:", report.n_raw_snapshots);
  console.log("total_fixtures:", report.total_fixtures);
  console.log("fixture_counts_by_season:", JSON.stringify(fixtureCounts));
  console.log("exclusions:", JSON.stringify(manifest.exclusions));
  console.log("schema_version:", manifest.schema_version);
  console.log("\nLOCKBOX 2025-2026:");
  console.log("  status:", lockbox.status);
  console.log("  fixture_count:", lockbox.fixture_count);
  console.log("  fixture_ids_hash:", lockbox.fixture_ids_hash);
  console.log("\nGating conditions apres mise a jour:");
  for (const cond of expManifest.gating_to_running.conditions) console.log(`  [${cond.satisfied ? "TRUE " : "FALSE"}] ${cond.id}`);
}

main();
