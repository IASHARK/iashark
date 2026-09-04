#!/usr/bin/env node
"use strict";
// EXP-003 M3 DATA GATE, item 1 - enumeration PURE (aucun appel reseau) des
// elo_reference_date necessaires. Regle pre-enregistree :
// elo_reference_date = jour calendaire UTC PRECEDENT le kickoff.
// Perimetre : TRAIN (2022-23, fixtures utilisees comme exemples
// d'entrainement pour beta_elo) + OOS (2023-24, 2024-25). 2025-26 jamais
// touchee (lockbox scellee).

const fs = require("fs");
const path = require("path");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }

// jour calendaire UTC precedent le kickoff, format YYYY-MM-DD.
function dayBeforeUtc(kickoffIso) {
  const d = new Date(kickoffIso);
  const dayStartUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const before = new Date(dayStartUtc - 24 * 3600 * 1000);
  return before.toISOString().slice(0, 10);
}

function main() {
  const seasons = { "2022-2023_TRAIN": loadSeason(2022), "2023-2024_OOS": loadSeason(2023), "2024-2025_OOS": loadSeason(2024) };

  const perFixture = [];
  for (const [label, fixtures] of Object.entries(seasons)) {
    for (const f of fixtures) {
      perFixture.push({ fixture_id: f.fixture_id, role: label, kickoff: f.kickoff_timestamp, elo_reference_date: dayBeforeUtc(f.kickoff_timestamp) });
    }
  }

  const uniqueDates = Array.from(new Set(perFixture.map((r) => r.elo_reference_date))).sort();

  const report = {
    rule: "elo_reference_date = UTC calendar day before kickoff (kickoff jour J -> reference J-1)",
    scope: "TRAIN(2022-23) + OOS(2023-24, 2024-25) UNIQUEMENT - 2025-26 jamais touchee (lockbox)",
    fixtures_concerned: perFixture.length,
    fixtures_by_role: Object.fromEntries(Object.entries(seasons).map(([k, v]) => [k, v.length])),
    unique_reference_dates: uniqueDates.length,
    min_date: uniqueDates[0],
    max_date: uniqueDates[uniqueDates.length - 1],
    dates: uniqueDates,
  };

  fs.writeFileSync(path.join(GATE_B1_DIR, "clubelo_dates_needed_report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(GATE_B1_DIR, "clubelo_dates_needed_per_fixture.json"), JSON.stringify(perFixture, null, 1));

  console.log("fixtures_concerned:", report.fixtures_concerned);
  console.log("fixtures_by_role:", JSON.stringify(report.fixtures_by_role));
  console.log("unique_reference_dates:", report.unique_reference_dates);
  console.log("min_date:", report.min_date, "max_date:", report.max_date);
}

main();
