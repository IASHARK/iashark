"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05). Tests sur les VRAIES 4 saisons
// collectees (data/player-lab/raw/, 3420 appels API reels - aucun
// nouvel appel ici, lecture de cache uniquement). Verifie que le
// pipeline complet produit des resultats plausibles et coherents sur
// donnees reelles - pas seulement sur des cas synthetiques construits
// a la main.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents } = require("../lib/player-lab/goal-events.js");
const { fitAllPriorsFromTrain } = require("../lib/player-lab/fit-all-priors.js");
const { splitFor } = require("../lib/player-lab/season-split.js");
const { resolvePositionGroup } = require("../lib/player-lab/position-policy.js");
const { buildDatasetManifest } = require("../lib/player-lab/dataset-version.js");

const SEASONS = [2021, 2022, 2023, 2024];

function loadAllRows() {
  let allRows = [], allGoalEvents = [];
  for (const season of SEASONS) {
    const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `premier-league-${season}.json`), "utf8"));
    for (const fx of fixtures) {
      if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) continue;
      const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw: readCached("lineups", fx.fixture_id).raw_payload, playersRaw: readCached("players", fx.fixture_id).raw_payload, sourceHashes: {} });
      allRows = allRows.concat(rows);
      const { goalEvents } = extractGoalEvents(fx, readCached("events", fx.fixture_id).raw_payload);
      allGoalEvents = allGoalEvents.concat(goalEvents.map((g) => ({ ...g, season })));
    }
  }
  return { allRows, allGoalEvents };
}

test("dataset manifest reel : 4 saisons, 1520 fixtures, 0 exclusion, hash deterministe (rejoue => meme hash)", () => {
  const manifest1 = buildDatasetManifest(SEASONS);
  const manifest2 = buildDatasetManifest(SEASONS);
  assert.equal(manifest1.n_fixtures, 1520);
  assert.equal(manifest1.exclusions.length, 0);
  assert.equal(manifest1.dataset_version, manifest2.dataset_version);
  assert.equal(manifest1.seasons.length, 4);
  assert.ok(!manifest1.seasons.includes(2025), "2025-26 doit rester SEALED_UNREAD, jamais dans le manifest");
});

test("priors TRAIN reels : ordre de propension par position sensiblement realiste (G < D < M < F)", () => {
  const { allRows, allGoalEvents } = loadAllRows();
  assert.ok(allRows.length > 50000, "les 4 saisons doivent etre collectees pour ce test");
  const priors = fitAllPriorsFromTrain(allRows, allGoalEvents);
  const g = priors.core_rate_priors.get("G").mean_rate_per_90;
  const d = priors.core_rate_priors.get("D").mean_rate_per_90;
  const m = priors.core_rate_priors.get("M").mean_rate_per_90;
  const f = priors.core_rate_priors.get("F").mean_rate_per_90;
  assert.ok(g <= d && d < m && m < f, `ordre attendu G<=D<M<F, obtenu G=${g} D=${d} M=${m} F=${f}`);
  assert.ok(f > 0.2 && f < 0.5, `taux reel des attaquants doit rester dans une plage plausible (obtenu ${f})`);

  assert.ok(priors.own_goal_rate.own_goal_mass > 0 && priors.own_goal_rate.own_goal_mass < 0.1, "part reelle des CSC doit rester une fraction credible du total des buts");
  assert.ok(priors.penalty_rate.penalty_mass_share > 0.03 && priors.penalty_rate.penalty_mass_share < 0.15, "part reelle des penalties doit rester une fraction credible du total des buts");
});

test("season split reel : chaque saison collectee tombe dans le bon panier, aucune ligne 2025 (SEALED_UNREAD)", () => {
  const { allRows } = loadAllRows();
  const bySplit = {};
  for (const r of allRows) {
    const split = splitFor(r.season);
    bySplit[split] = (bySplit[split] || 0) + 1;
  }
  assert.ok(bySplit.WARMUP > 14000 && bySplit.WARMUP < 16000);
  assert.ok(bySplit.TRAIN > 14000 && bySplit.TRAIN < 16000);
  assert.ok(bySplit.OOS_DEV > 14000 && bySplit.OOS_DEV < 16000);
  assert.ok(bySplit.OOS_FINAL > 14000 && bySplit.OOS_FINAL < 16000);
  assert.equal(bySplit.SEALED_UNREAD, undefined, "aucune ligne 2025-26 ne doit jamais entrer dans ce dataset");
});

test("position policy reelle : UNKNOWN reste une fraction infime des 60k+ lignes reelles (pas un echec massif de mapping)", () => {
  const { allRows } = loadAllRows();
  const unknown = allRows.filter((r) => resolvePositionGroup(r.position) === "UNKNOWN").length;
  const pct = (100 * unknown) / allRows.length;
  assert.ok(pct < 1, `UNKNOWN doit rester marginal (obtenu ${pct.toFixed(3)}%)`);
});
