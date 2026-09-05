"use strict";
// Infrastructure GENERIQUE reutilisable (walk-forward, timeout
// subprocess) - worker Python persistant, protocole JSONL. Factorisee le
// 2026-09-05 a partir du mecanisme deja valide et teste pour M4
// (lib/lab/nb2-python-worker.js, diagnostic scripts/diagnose_fit_kappa_hang.js) :
// spawner un NOUVEAU process Python par cutoff degrade progressivement
// (import scipy/numpy a froid repete) jusqu'au blocage complet. UN seul
// process persistant, demarre une fois, evite le probleme.
//
// AUCUNE hypothese statistique ici (ni NB2, ni shared-gamma) - ce
// module ne contient QUE la plomberie process/JSONL/timeout, parametree
// par le chemin du script Python. lib/lab/nb2-python-worker.js (M4) et
// tout worker M5 peuvent tous deux se construire sur cette base sans
// dependre l'un de l'autre.
//
// Contrat du script Python attendu :
//   - imprime {"ready": true} sur stdout des que pret a recevoir des requetes
//   - lit une ligne JSON par requete sur stdin : {"request_id": "...", ...}
//   - repond une ligne JSON par reponse sur stdout, flush immediat :
//     {"request_id": "...", ...} (ou {"request_id":..., "error": "..."})
//   - "SHUTDOWN" sur stdin termine proprement le process

const { spawn } = require("node:child_process");
const readline = require("node:readline");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_START_TIMEOUT_MS = 20000;

class PersistentPythonJsonlWorker {
  constructor(options = {}) {
    if (!options.script) throw new Error("PersistentPythonJsonlWorker: options.script est obligatoire");
    this.script = options.script;
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
          reject(new Error(`WORKER_START_TIMEOUT: ${this.script} n'a pas signale 'ready' a temps`));
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

      this.child.stderr.on("data", () => { /* capture non bloquante, non utilisee pour la decision */ });
    });
    return this.startedPromise;
  }

  // Envoie payloadWithoutRequestId + request_id genere, retourne la
  // reponse JSON brute du script (ou {error:...} en cas de crash/timeout).
  async sendRequest(payloadWithoutRequestId) {
    if (this.crashed) return { error: "WORKER_CRASHED", detail: this.crashDetail };
    await this.start();

    const requestId = `r${++this.reqCounter}`;
    const payload = Object.assign({ request_id: requestId }, payloadWithoutRequestId);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        if (this.child) this.child.kill("SIGKILL");
        this.crashed = true;
        this.crashDetail = { reason: "FIT_PROCESS_TIMEOUT", request_id: requestId, timeout_ms: this.timeoutMs };
        resolve({ error: "FIT_PROCESS_TIMEOUT", request_id: requestId });
      }, this.timeoutMs);

      this.pending.set(requestId, { resolve, timer });
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
}

module.exports = { PersistentPythonJsonlWorker, DEFAULT_TIMEOUT_MS };
