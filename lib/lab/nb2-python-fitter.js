"use strict";
// EXP-004 item 7 (SPEC LAB PRO v1.0, M4 NB2) - adapte scripts/fit_kappa.py
// (le VRAI fitter, jamais reimplemente) a la forme candidateKappaFitter(
// trainRows) attendue par le walk-forward M4. MEME discipline que
// lib/lab/run-experiment.js#pythonRhoFitter.

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_FIT_SCRIPT = path.join(__dirname, "..", "..", "scripts", "fit_kappa.py");
const DEFAULT_ETA_LOWER = Math.log(1e-4);
const DEFAULT_ETA_UPPER = Math.log(1e7);
const DEFAULT_TIMEOUT_MS = 30000; // marge mesuree : un fit one-shot isole (cold-start scipy inclus) observe jusqu'a ~13s sous forte charge systeme (diagnostic 2026-09-05) - 30s laisse une marge raisonnable sans etre une attente "enorme" arbitraire

// trainRows: [{muHome, muAway, h, a}, ...]
// timeoutMs : AUCUN sous-processus scientifique ne doit pouvoir rester
// bloque indefiniment (diagnostic 2026-09-05, scripts/diagnose_fit_kappa_hang.js -
// spawner repetement fit_kappa.py degrade progressivement jusqu'au
// blocage complet). Depassement => FIT_PROCESS_TIMEOUT explicite, jamais
// une attente silencieuse. Ce fitter one-shot reste utilise pour les
// tests unitaires/identifiabilite synthetique (payloads petits,
// occasionnels) - le lancement REEL EXP-004 utilise le worker persistant
// (lib/lab/nb2-python-worker.js) pour eviter le cout de re-import
// repete qui causait la degradation.
function pythonKappaFitter(fitScript, timeoutMs) {
  return function (trainRows) {
    if (!trainRows || !trainRows.length) return { kappa_hat: null, convergence: false, reason: "NO_TRAIN_DATA" };
    const input = JSON.stringify({
      matches: trainRows.map((r) => ({ mu_home: r.muHome, mu_away: r.muAway, goals_home_90: r.h, goals_away_90: r.a })),
      eta_lower_bound: DEFAULT_ETA_LOWER,
      eta_upper_bound: DEFAULT_ETA_UPPER,
    });
    const result = spawnSync("python3", [fitScript || DEFAULT_FIT_SCRIPT], {
      input, encoding: "utf8", timeout: timeoutMs || DEFAULT_TIMEOUT_MS, killSignal: "SIGKILL",
    });
    if (result.error && result.error.code === "ETIMEDOUT") return { kappa_hat: null, convergence: false, reason: "FIT_PROCESS_TIMEOUT" };
    if (result.status !== 0) return { kappa_hat: null, convergence: false, reason: "FIT_SCRIPT_ERROR", stderr: result.stderr };
    const parsed = JSON.parse(result.stdout);
    if (parsed.error) return { kappa_hat: null, convergence: false, reason: parsed.error };
    return {
      kappa_hat: parsed.kappa_hat,
      log_kappa_hat: parsed.log_kappa_hat,
      convergence: !!parsed.convergence,
      on_boundary: !!parsed.on_boundary,
      numerical_boundary_status: parsed.numerical_boundary_status,
      iterations: parsed.iterations,
      objective_nll: parsed.objective_nll,
      training_N: parsed.training_N,
      optimizer_message: parsed.optimizer_message,
    };
  };
}

module.exports = { pythonKappaFitter, DEFAULT_FIT_SCRIPT, DEFAULT_ETA_LOWER, DEFAULT_ETA_UPPER };
