"use strict";
// UNE SEULE SOURCE (controle du trader de cotes du 04/10/2026) : le script des videos quotidiennes
// (scripts/videos/build-daily-videos.mjs, lance par daily-videos.yml puis envoye sur Telegram) ne
// calcule plus son propre « Safe » (3 paris « les plus surs ») ni son « Combine @10 ». Tickets x5 /
// x10 et Selection en or : calcules une fois (lib/tickets-du-jour.js), servis par niveau d'acces
// (x10 et Selection en or : Pro), donc jamais dans une video publique.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/videos/build-daily-videos.mjs");

test("videos du jour : plus aucun « Safe » ni « Combine » calcule a part ; une video par match seulement", () => {
  const code = fs.readFileSync(SCRIPT, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(code, /buildSafe|buildCombo|DailySafe|DailyCombo|COMBO_TARGET|>= 62/);
  assert.doesNotMatch(code, /\bSAFE\b|COMBIN/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-videos-"));
  try {
    const data = { matchs: [
      { id: 11, sport: "football", league: "Ligue 1", date: "2026-10-06 21:00", home: { n: "PSG", id: 85 }, away: { n: "Lyon", id: 80 } },
      { id: 12, sport: "football", league: "Premier League", date: "2026-10-06 18:00", home: { n: "Arsenal", id: 42 }, away: { n: "Chelsea", id: 49 } },
      { id: 13, sport: "football", league: "Serie A", date: "2026-10-06 20:45", home: { n: "Inter", id: 505 }, away: { n: "Milan", id: 489 } },
    ] };
    const rows = [11, 12, 13].map((id, i) => ({ fixture_id: id, pari_rec: "Over 2.5", market_id: "over-25", model_probability: 75 + i,
      markets_compared: [{ id: "over-25", probability: 75 + i, consensus: 74 + i }], premium_fields: { lambda_h: 1.6, lambda_a: 1.1, mc_scores: [{ score: "2-1" }] } }));
    fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify(data));
    fs.writeFileSync(path.join(dir, "rows.json"), JSON.stringify(rows));
    execFileSync(process.execPath, [SCRIPT, "--out", path.join(dir, "out"), "--date", "2026-10-06", "--premium-file", path.join(dir, "rows.json"), "--data", path.join(dir, "data.json"), "--combine"], { stdio: "pipe" });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "out", "manifest.json"), "utf8"));
    assert.equal(manifest.videos.length, 3, "une video par match");
    assert.ok(manifest.videos.every((v) => /^(simule|pulse)-\d+$/.test(v.slug)), manifest.videos.map((v) => v.slug).join(","));
    assert.ok(!manifest.videos.some((v) => /safe|combine/i.test(v.slug + v.composition)), "jamais de Safe ni de Combine, meme avec --combine");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
