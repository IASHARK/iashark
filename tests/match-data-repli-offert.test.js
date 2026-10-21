"use strict";
// REPLI DU MATCH OFFERT (21/10/2026). Depuis le 05/10/2026 le pipeline ne designe plus aucun
// match offert (aucun is_free) : le site (lib/free-match.js) en choisit un par repli et l'affiche
// « offert », mais match-data ne le reconnaissait pas, et un compte gratuit cree pour ce match ne
// recevait rien. match-data#idOffertRepli applique la meme regle (heure de Paris) : ce test
// verifie qu'ils choisissent le meme match, et qu'une designation du pipeline garde l'autorite.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const NODE_MODULE = require("node:module");
const FREE = require("../lib/free-match.js");

async function chargerRepli() {
  if (typeof NODE_MODULE.stripTypeScriptTypes !== "function") return null;
  let code = fs.readFileSync(path.join(__dirname, "..", "supabase/functions/match-data/index.ts"), "utf8");
  code = NODE_MODULE.stripTypeScriptTypes(code, { mode: "strip" });
  code = code.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, "const createClient = () => ({});");
  globalThis.Deno = { env: { get: () => "x" }, serve: () => {} };
  const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  return mod.idOffertRepli;
}

// Horloge fixe : mercredi 21/10/2026, 00 h 40, heure de Paris (22 h 40 UTC la veille).
const MAINTENANT = new Date("2026-10-20T22:40:00Z");
const HORLOGE_PARIS = { day: "2026-10-21", now: "2026-10-21 00:40" };
const m = (id, date, extra) => Object.assign({ id, date, has_signal: true, is_free: false, data_quality_score: 50 }, extra || {});

const CAS = {
  "le meilleur du jour avec pari": [m(1, "2026-10-21 21:00", { data_quality_score: 90 }), m(2, "2026-10-21 18:45", { data_quality_score: 70 }), m(3, "2026-10-22 21:00", { data_quality_score: 99 })],
  "sans pari du jour : a venir avec pari": [m(1, "2026-10-21 21:00", { has_signal: false, no_signal: true }), m(2, "2026-10-22 21:00", { data_quality_score: 60 })],
  // Regle du 04/10 (« le meme match de 00 h a 23 h 59 ») : le match du jour reste offert une fois commence.
  "match du jour deja commence garde": [m(1, "2026-10-21 00:10", { data_quality_score: 99 }), m(2, "2026-10-21 21:00", { data_quality_score: 40 })],
  "le soir, apres son coup d'envoi : toujours le meme": [m(1, "2026-10-21 21:00", { data_quality_score: 90 }), m(2, "2026-10-21 23:30", { data_quality_score: 60 })],
  "rien d'analyse : a venir quand meme": [m(1, "2026-10-21 21:00", { has_signal: false, no_signal: true, data_quality_score: 30 }), m(2, "2026-10-21 20:00", { has_signal: false, no_signal: true, data_quality_score: 80 })],
};

test("match-data#idOffertRepli choisit le meme match que le site (lib/free-match.js)", async (t) => {
  const repli = await chargerRepli();
  if (!repli) { t.skip("node:module#stripTypeScriptTypes indisponible"); return; }
  for (const [nom, liste] of Object.entries(CAS)) {
    const site = FREE.pickFreeMatchId(liste, HORLOGE_PARIS);
    assert.ok(site != null, nom + " : le site choisit un match");
    assert.equal(repli(liste, MAINTENANT), String(site), nom);
  }
});

test("match-data#idOffertRepli : le soir, apres le coup d'envoi, toujours le meme match que le site", async (t) => {
  const repli = await chargerRepli();
  if (!repli) { t.skip("node:module#stripTypeScriptTypes indisponible"); return; }
  const soir = new Date("2026-10-21T20:30:00Z"); // 22 h 30 a Paris
  const liste = [m(1, "2026-10-21 21:00", { data_quality_score: 90 }), m(2, "2026-10-21 23:30", { data_quality_score: 60 }), m(3, "2026-10-22 21:00", { data_quality_score: 99 })];
  assert.equal(FREE.pickFreeMatchId(liste, { day: "2026-10-21", now: "2026-10-21 22:30" }), 1);
  assert.equal(repli(liste, soir), "1");
});

test("match-data#idOffertRepli : une designation du pipeline (jour ou a venir) garde l'autorite", async (t) => {
  const repli = await chargerRepli();
  if (!repli) { t.skip("node:module#stripTypeScriptTypes indisponible"); return; }
  assert.equal(repli([m(1, "2026-10-21 21:00", { data_quality_score: 99 }), m(2, "2026-10-21 18:45", { is_free: true })], MAINTENANT), null);
  assert.equal(repli([m(1, "2026-10-21 21:00"), m(2, "2026-10-22 18:45", { is_free: true })], MAINTENANT), null);
  // Une designation d'un jour passe ne compte plus : repli.
  assert.equal(repli([m(1, "2026-10-21 21:00"), m(2, "2026-10-20 18:45", { is_free: true })], MAINTENANT), "1");
});
