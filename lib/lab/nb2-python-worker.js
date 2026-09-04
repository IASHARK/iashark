"use strict";
// EXP-004 (audit 2026-09-05, diagnostic hang subprocess) - worker Python
// PERSISTANT pour le fit de kappa : demarre scripts/fit_kappa_worker.py
// UNE SEULE FOIS (import scipy paye une seule fois), puis envoie une
// ligne JSON par cutoff sur stdin / recoit une ligne JSON par cutoff sur
// stdout (flush explicite cote Python). Remplace lib/lab/nb2-python-fitter.js
// (spawnSync par cutoff) pour le lancement REEL EXP-004 - cause du hang
// diagnostique (scripts/diagnose_fit_kappa_hang.js) : spawner un nouveau
// process Python (import scipy/numpy a froid) ~229 fois en sequence
// degrade progressivement jusqu'au blocage complet. UN seul process ici,
// jamais respawn.
//
// Timeout PAR REQUETE obligatoire (SPEC) : aucun fit ne doit pouvoir
// rester bloque indefiniment - depassement => FIT_PROCESS_TIMEOUT, le
// worker est tue et redemarre, le cutoff concerne est marque non
// convergent (jamais une continuation silencieuse).

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");

const DEFAULT_WORKER_SCRIPT = path.join(__dirname, "..", "..", "scripts", "fit_kappa_worker.py");
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_START_TIMEOUT_MS = 20000;

class Nb2KappaWorker {
  constructor(options = {}) {
    this.script = options.script || DEFAULT_WORKER_SCRIPT;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.child = null;
    this.rl = null;
    this.pending = new Map(); // request_id -> { resolve, timer }
    this.reqCounter = 0;
    this.startedPromise = null;
    this.crashed = false;
    this.crashDetail = null;
  }

  start() {
    if (this.startedPromise) return this.startedPromise;
    this.startedPromise = new Promise((resolve, reject) => {
      const env = Object.assign({}, process.env, {
        PYTHONUNBUFFERED: "1", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1",
      });
      this.child = spawn("python3", [this.script], { stdio: ["pipe", "pipe", "pipe"], env });
      this.rl = readline.createInterface({ input: this.child.stdout });

      let readyReceived = false;
      const startTimer = setTimeout(() => {
        if (!readyReceived) {
          this.child.kill("SIGKILL");
          reject(new Error("WORKER_START_TIMEOUT: fit_kappa_worker.py n'a pas signale 'ready' a temps"));
        }
      }, DEFAULT_START_TIMEOUT_MS);

      this.rl.on("line", (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch (e) { return; }
        if (!readyReceived && msg.ready) {
          readyReceived = true;
          clearTimeout(startTimer);
          resolve();
          return;
        }
        const pending = this.pending.get(msg.request_id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.request_id);
          pending.resolve(msg);
        }
      });

      this.child.on("exit", (code, signal) => {
        this.crashed = true;
        this.crashDetail = { code, signal };
        clearTimeout(startTimer);
        // Toute requete encore en attente doit echouer explicitement, jamais rester pendante silencieusement.
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.resolve({ error: "WORKER_CRASHED", code, signal });
        }
        this.pending.clear();
      });

      this.child.on("error", (err) => {
        clearTimeout(startTimer);
        reject(err);
      });

      this.child.stderr.on("data", () => { /* capture non bloquante, non utilisee pour la decision - evite tout risque de pipe stderr plein */ });
    });
    return this.startedPromise;
  }

  // rows: [{muHome, muAway, h, a}, ...] - MEME forme d'entree que
  // lib/lab/nb2-python-fitter.js#pythonKappaFitter, pour rester un
  // remplacement direct.
  async fit(rows) {
    if (!rows || !rows.length) return { kappa_hat: null, convergence: false, reason: "NO_TRAIN_DATA" };
    if (this.crashed) return { kappa_hat: null, convergence: false, reason: "WORKER_CRASHED", detail: this.crashDetail };
    await this.start();

    const requestId = `r${++this.reqCounter}`;
    const payload = {
      request_id: requestId,
      matches: rows.map((r) => ({ mu_home: r.muHome, mu_away: r.muAway, goals_home_90: r.h, goals_away_90: r.a })),
      eta_lower_bound: Math.log(1e-4),
      eta_upper_bound: Math.log(1e7),
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        // Un timeout signifie que le worker lui-meme est bloque (pas juste cette requete, car le protocole JSONL est sequentiel) - le tuer immediatement, jamais le laisser tourner indefiniment.
        if (this.child) this.child.kill("SIGKILL");
        this.crashed = true;
        this.crashDetail = { reason: "FIT_PROCESS_TIMEOUT", request_id: requestId, timeout_ms: this.timeoutMs };
        resolve({ kappa_hat: null, convergence: false, reason: "FIT_PROCESS_TIMEOUT", request_id: requestId });
      }, this.timeoutMs);

      this.pending.set(requestId, {
        resolve: (msg) => {
          if (msg.error) { resolve({ kappa_hat: null, convergence: false, reason: msg.error }); return; }
          resolve({
            kappa_hat: msg.kappa_hat, log_kappa_hat: msg.log_kappa_hat,
            convergence: !!msg.convergence, on_boundary: !!msg.on_boundary,
            numerical_boundary_status: msg.numerical_boundary_status,
            iterations: msg.iterations, objective_nll: msg.objective_nll,
            training_N: msg.training_N, optimizer_message: msg.optimizer_message,
          });
        },
        timer,
      });

      this.child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  async shutdown() {
    if (!this.child || this.crashed) return;
    try { this.child.stdin.write("SHUTDOWN\n"); } catch (e) { /* deja ferme */ }
    await new Promise((resolve) => {
      const t = setTimeout(() => { try { this.child.kill("SIGKILL"); } catch (e) {} resolve(); }, 3000);
      this.child.once("exit", () => { clearTimeout(t); resolve(); });
    });
  }

  // Fitter compatible candidateKappaFitter(trainRows) -> Promise<result>,
  // utilisable directement par lib/lab/walkforward-m4-runner.js (await).
  asFitter() {
    return (rows) => this.fit(rows);
  }
}

module.exports = { Nb2KappaWorker, DEFAULT_WORKER_SCRIPT, DEFAULT_TIMEOUT_MS };
