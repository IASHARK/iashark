#!/usr/bin/env node
"use strict";
// EXP-003 (item 1, audit 2026-09-05) - NOUVEAU dataset_version incluant
// 2021-22 (warm-up) en plus des 4 saisons GATE B1 deja existantes.
// Reutilise EXACTEMENT lib/data/dataset-version.js#buildDatasetVersion
// (meme mecanisme que GATE B7 pour EXP-001/002/002C), mais ECRIT UN
// FICHIER DEDIE - ne touche JAMAIS data/gate-b1/dataset_version_report.json
// ni lockbox_2025_2026.json (deja audites, immuables) ni aucun manifest
// d'experience existant.

const fs = require("fs");
const path = require("path");
const { buildDatasetVersion } = require("../lib/data/dataset-version.js");

const RAW_DIR = path.join(__dirname, "..", "raw_api", "api-football", "fixtures");
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");

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
  const seasonLabel = { 2021: "2021-2022", 2022: "2022-2023", 2023: "2023-2024", 2024: "2024-2025", 2025: "2025-2026" };
  const fixtureCounts = {};
  const responseHashes = [];
  for (const snap of snapshots) {
    const season = snap.request_params.season;
    const label = seasonLabel[season];
    if (!label) continue; // ignore toute autre league/saison eventuellement en cache
    if (snap.request_params.league !== 39) continue;
    responseHashes.push(snap.response_hash);
    fixtureCounts[label] = (snap.body.response || []).length;
  }

  const manifest = {
    league_id: 39,
    seasons: ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"],
    response_hashes: responseHashes,
    fixture_counts: fixtureCounts,
    exclusions: {},
    schema_version: "v1",
  };

  const { dataset_version, canonical_manifest } = buildDatasetVersion(manifest);

  const report = {
    purpose: "EXP-003 item 1 - dataset_version incluant 2021-22 warm-up. Le dataset_version GATE B1 original (403e31d057ba094993f29e3c8c88dec21119f8438acc2c7b10a21200dd6a2942, sans 2021-22) reste inchange et reference par EXP-001R/EXP-002C (deja clos).",
    previous_dataset_version_gate_b1: "403e31d057ba094993f29e3c8c88dec21119f8438acc2c7b10a21200dd6a2942",
    dataset_version,
    canonical_manifest,
    n_raw_snapshots: snapshots.filter((s) => s.request_params.league === 39 && seasonLabel[s.request_params.season]).length,
    total_fixtures: Object.values(fixtureCounts).reduce((a, b) => a + b, 0),
    fixture_counts_by_season: fixtureCounts,
    lockbox_2025_2026: "INCHANGEE - meme lockbox que GATE B1 (data/gate-b1/lockbox_2025_2026.json), jamais recalculee, jamais rouverte",
  };

  fs.writeFileSync(path.join(GATE_B1_DIR, "dataset_version_report_2021_warmup.json"), JSON.stringify(report, null, 2));

  console.log("NOUVEAU DATASET_VERSION (avec warm-up 2021-22):", dataset_version);
  console.log("fixture_counts_by_season:", JSON.stringify(fixtureCounts, null, 2));
  console.log("total_fixtures:", report.total_fixtures);
}

main();
