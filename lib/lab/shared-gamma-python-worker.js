"use strict";
// EXP-005 item 9 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - fitter kappa
// M5 DEDIE, construit sur l'infrastructure GENERIQUE
// lib/lab/python-jsonl-worker.js (worker Python persistant, timeout par
// requete) - AUCUN import de lib/lab/nb2-python-worker.js ni
// lib/lab/nb2-python-fitter.js (M4). Script Python dedie :
// scripts/fit_m5_kappa_worker.py (formule shared-gamma+DC, rho FIXE,
// jamais le fitter/formule M4).

const path = require("node:path");
const { PersistentPythonJsonlWorker } = require("./python-jsonl-worker.js");

const DEFAULT_SCRIPT = path.join(__dirname, "..", "..", "scripts", "fit_m5_kappa_worker.py");
const DEFAULT_ETA_LOWER = Math.log(1e-2); // kappa >= 0.01 (garde-fou numerique, item 9)
const DEFAULT_ETA_UPPER = Math.log(1e6);  // kappa <= 1e6
const KAPPA_START_REGISTERED = 10;        // pre-enregistre (item 9) - jamais le kappa observe M4 comme start adaptatif

class SharedGammaKappaWorker extends PersistentPythonJsonlWorker {
  constructor(options = {}) {
    super({ script: options.script || DEFAULT_SCRIPT, timeoutMs: options.timeoutMs });
  }

  // rows: [{muHome, muAway, h, a}, ...] - meme forme d'entree que les
  // autres fitters de ce laboratoire (M2R/M4), pour rester coherent sans
  // pour autant importer leur code.
  async fit(rows) {
    if (!rows || !rows.length) return { kappa_hat: null, convergence: false, reason: "NO_TRAIN_DATA" };
    const msg = await this.sendRequest({
      matches: rows.map((r) => ({ mu_home: r.muHome, mu_away: r.muAway, goals_home_90: r.h, goals_away_90: r.a })),
      eta_lower_bound: DEFAULT_ETA_LOWER,
      eta_upper_bound: DEFAULT_ETA_UPPER,
      eta_start: Math.log(KAPPA_START_REGISTERED),
    });
    if (msg.error) return { kappa_hat: null, convergence: false, reason: msg.error };
    return {
      kappa_hat: msg.kappa_hat, log_kappa_hat: msg.log_kappa_hat,
      convergence: !!msg.convergence, on_boundary: !!msg.on_boundary,
      numerical_boundary_status: msg.numerical_boundary_status,
      iterations: msg.iterations, objective_nll: msg.objective_nll,
      training_N: msg.training_N, optimizer_message: msg.optimizer_message,
    };
  }

  asFitter() {
    return (rows) => this.fit(rows);
  }
}

module.exports = { SharedGammaKappaWorker, DEFAULT_SCRIPT, DEFAULT_ETA_LOWER, DEFAULT_ETA_UPPER, KAPPA_START_REGISTERED };
