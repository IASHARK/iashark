#!/usr/bin/env node
"use strict";
// Diagnostic du hang observe sur le run reel EXP-004 : un sous-processus
// fit_kappa.py bloque a ~0.8s de CPU apres 29+ minutes (S=sleeping, pas
// R=running -> bloque sur une E/S, pas un calcul lent). Ce script
// instrumente CHAQUE etape (spawn/stdin/stdout/stderr/exit) avec spawn()
// async (spawnSync ne donne aucune granularite intermediaire), sur une
// VRAIE payload de training extraite du pipeline M4 reel (pas synthetique).
//
// Usage: node scripts/diagnose_fit_kappa_hang.js <mode>
//   mode=single   : UN seul fit instrumente en detail (item 1)
//   mode=loop     : boucle controlee 1/5/20/100 (item 2), timeout par fit (item 3)
//   mode=endurance: 300 fits consecutifs (item 8)

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const FIT_SCRIPT = path.join(__dirname, "fit_kappa.py");
const DEFAULT_TIMEOUT_MS = 15000; // large par rapport au p99 mesure (~1-2s), sera resserre apres mesure

function buildRealPayload() {
  const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
  const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
  function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
  const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  const m2 = runWalkForwardM2C({
    allFixtures: [...f2021, ...f2022, ...f2023, ...f2024],
    oosSeasons: [2022, 2023, 2024],
    leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2022, f2021], [2023, f2022], [2024, f2023]]),
  });
  // Prend TOUTES les predictions (jusqu'a la toute derniere OOS 2024-25) comme "training payload" la plus grosse possible - le pire cas realiste (dernier cutoff du run reel).
  const matches = m2.predictions
    .filter((p) => p.goals_home_90 != null && p.goals_away_90 != null)
    .map((p) => ({ mu_home: p.lambdaH_m2, mu_away: p.lambdaA_m2, goals_home_90: p.goals_home_90, goals_away_90: p.goals_away_90 }));
  return matches;
}

function instrumentedFitOnce(payload, label, timeoutMs) {
  return new Promise((resolve) => {
    const t = {};
    t.spawn_call_at = Date.now();
    const child = spawn("python3", [FIT_SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    t.spawn_return_at = Date.now();

    let stdout = "", stderr = "";
    let stdoutBytes = 0, stderrBytes = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      t.timeout_at = Date.now();
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("spawn", () => { t.process_spawned_at = Date.now(); });
    child.stdout.on("data", (chunk) => { stdout += chunk; stdoutBytes += chunk.length; if (t.first_stdout_at == null) t.first_stdout_at = Date.now(); });
    child.stderr.on("data", (chunk) => { stderr += chunk; stderrBytes += chunk.length; if (t.first_stderr_at == null) t.first_stderr_at = Date.now(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      t.error_at = Date.now();
      resolve({ label, ok: false, error: err.message, timings: t, timedOut });
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      t.exit_at = Date.now();
      resolve({
        label, ok: !timedOut && code === 0, exit_code: code, signal, timedOut,
        stdout_bytes: stdoutBytes, stderr_bytes: stderrBytes,
        stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000),
        timings: t,
        elapsed_ms: t.exit_at - t.spawn_call_at,
      });
    });

    const input = JSON.stringify({ matches: payload, eta_lower_bound: Math.log(1e-4), eta_upper_bound: Math.log(1e7) });
    t.stdin_write_start_at = Date.now();
    child.stdin.write(input, () => { t.stdin_write_flushed_at = Date.now(); });
    child.stdin.end(() => { t.stdin_closed_at = Date.now(); });
  });
}

async function modeSingle() {
  const payload = buildRealPayload();
  console.log(`payload: ${payload.length} matches (le plus gros cas reel du pipeline M4)`);
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  console.log(`payload_hash=${payloadHash}`);
  const res = await instrumentedFitOnce(payload, "single", DEFAULT_TIMEOUT_MS);
  console.log(JSON.stringify(res, null, 2));
}

async function modeLoop() {
  const payload = buildRealPayload();
  console.log(`payload: ${payload.length} matches, timeout=${DEFAULT_TIMEOUT_MS}ms par fit`);
  for (const n of [1, 5, 20, 100]) {
    console.log(`\n=== boucle de ${n} appels ===`);
    for (let i = 0; i < n; i++) {
      const res = await instrumentedFitOnce(payload, `iter-${i}`, DEFAULT_TIMEOUT_MS);
      console.log(`iteration=${i} pid=? elapsed_ms=${res.elapsed_ms ?? "TIMEOUT"} exit_code=${res.exit_code} signal=${res.signal} stdout_bytes=${res.stdout_bytes} stderr_bytes=${res.stderr_bytes} timedOut=${res.timedOut}`);
      if (res.timedOut || !res.ok) {
        console.log(`PREMIERE ITERATION DEFAILLANTE: n=${n} i=${i}`);
        console.log(JSON.stringify(res, null, 2));
        return;
      }
    }
  }
  console.log("\nBoucle controlee terminee SANS blocage (1/5/20/100 tous OK)");
}

async function modeEndurance() {
  const payload = buildRealPayload();
  console.log(`endurance: 300 fits consecutifs, payload=${payload.length} matches, timeout=${DEFAULT_TIMEOUT_MS}ms`);
  const kappas = [];
  const startMem = process.memoryUsage().rss;
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const res = await instrumentedFitOnce(payload, `endurance-${i}`, DEFAULT_TIMEOUT_MS);
    if (res.timedOut || !res.ok) {
      console.log(`ECHEC a l'iteration ${i}: ${JSON.stringify(res)}`);
      process.exit(1);
    }
    const parsed = JSON.parse(res.stdout);
    kappas.push(parsed.kappa_hat);
    if (i % 25 === 0) console.log(`i=${i} elapsed_ms=${res.elapsed_ms} kappa_hat=${parsed.kappa_hat} rss_mb=${(process.memoryUsage().rss / 1e6).toFixed(1)}`);
  }
  const totalMs = Date.now() - t0;
  const endMem = process.memoryUsage().rss;
  const allSame = kappas.every((k) => k === kappas[0]);
  console.log(`\n300/300 termines. total_ms=${totalMs} determinisme(tous kappa_hat identiques)=${allSame} kappa_hat=${kappas[0]}`);
  console.log(`RSS start_mb=${(startMem / 1e6).toFixed(1)} end_mb=${(endMem / 1e6).toFixed(1)} delta_mb=${((endMem - startMem) / 1e6).toFixed(1)}`);
}

const mode = process.argv[2] || "single";
if (mode === "single") modeSingle();
else if (mode === "loop") modeLoop();
else if (mode === "endurance") modeEndurance();
else { console.error("mode inconnu:", mode); process.exit(1); }
