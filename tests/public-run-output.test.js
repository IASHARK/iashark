"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { publicSafePick, publicTopScorers, publicDailyCombos } = require("../lib/public-run-output.js");

const safePick = {
  generated_at: "2026-09-13T11:11:16.291Z", status: "SELECTED",
  fixture: { fixture_id: 1557402, home_team: "Leeds", away_team: "Newcastle" },
  market: "FT_TEAM_TOTAL_AWAY_1.5_UNDER", model_probability_pct: 69.83, decimal_odds: 1.53, evaluated_count: 880,
};

test("SAFE_PICK complete publiee seulement si elle porte sur le match offert", () => {
  assert.deepEqual(publicSafePick(safePick, [{ id: 1557402, is_free: true }]), safePick);
});

test("SAFE_PICK d'un match payant : ni marche, ni probabilite, ni cote, ni equipes", () => {
  const out = publicSafePick(safePick, [{ id: 1557402, is_free: false }, { id: 999, is_free: true }]);
  assert.equal(out.redacted, true);
  assert.equal(out.status, "SELECTED");
  for (const k of ["market", "model_probability_pct", "decimal_odds", "fixture", "selection"]) assert.equal(k in out, false, k);
});

test("top buteurs et combines : compteurs et statuts uniquement", () => {
  const top = publicTopScorers({ generated_at: "x", eligible_player_count: 3, count_returned: 1, players: [{ name: "A", market: "anytime" }] });
  assert.equal("players" in top, false);
  assert.equal(top.count_returned, 1);
  const combos = publicDailyCombos({ generated_at: "x", eligible_pool_size: 38, combos: [{ combo_id: "COMBO_1", status: "SELECTED", legs: [{ market: "OVER_2.5" }] }] });
  assert.deepEqual(combos.combos, [{ combo_id: "COMBO_1", status: "SELECTED" }]);
  assert.equal(JSON.stringify(combos).includes("OVER_2.5"), false);
});

test("le pipeline publie run_output via les versions publiques", () => {
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/update-data.yml"), "utf8");
  const block = wf.slice(wf.indexOf("var dataJsonPayload = {"), wf.indexOf("fs.writeFileSync('data.json',JSON.stringify(dataJsonPayload"));
  assert.match(block, /safe_pick: publicSafePick\(runOutput\.SAFE_PICK_OF_THE_DAY, matchsPublics\)/);
  assert.match(block, /top5_scorers: publicTopScorers\(runOutput\.TOP_5_SCORERS_OF_DAY\)/);
  assert.match(block, /daily_combos: publicDailyCombos\(runOutput\.DAILY_COMBOS\)/);
  assert.match(wf, /require\('\.\/lib\/public-run-output\.js'\)/);
});
