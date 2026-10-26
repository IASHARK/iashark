"use strict";
// match-data (26/10/2026) : vitesse et codes d'erreur justes.
//  - jeton anonyme (cle publique « anon » du site) : jamais envoye au service d'authentification
//    (il repondait 403 a chaque visiteur sans compte, un aller-retour de plus avant le pari) ;
//  - un vrai jeton de compte est toujours verifie ;
//  - match inconnu (fichier de detail absent) : 404 match_introuvable, plus un 502 ;
//  - panne de la liste publique : toujours 502.
// Test d'EXECUTION de la vraie fonction (types retires), faux client Supabase, aucun appel reseau.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const NODE_MODULE = require("node:module");

const ROOT = path.join(__dirname, "..");
const LISTE = { generated_at: "2026-10-26T05:00:00Z", detail_fields: [], matchs: [
  { id: 1, home: { n: "A" }, away: { n: "B" }, date: "2026-10-26 20:45", is_free: false, has_signal: true },
] };
// Cle anon reelle du site (publique) : role anon, sans sub.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
function jeton(charge) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return b({ alg: "HS256", typ: "JWT" }) + "." + b(charge) + ".sig";
}

async function charger(etat) {
  if (typeof NODE_MODULE.stripTypeScriptTypes !== "function") return null;
  let code = fs.readFileSync(path.join(ROOT, "supabase/functions/match-data/index.ts"), "utf8");
  code = NODE_MODULE.stripTypeScriptTypes(code, { mode: "strip" });
  code = code.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, "const createClient = globalThis.__mdCreateClient;");
  let handler = null;
  globalThis.Deno = { env: { get: () => "x" }, serve: (h) => { handler = h; } };
  globalThis.__mdCreateClient = () => ({
    auth: { getUser: async (jwt) => { etat.getUser.push(jwt); return { data: { user: null } }; } },
    from: () => {
      const q = {};
      q.select = () => q; q.eq = () => q;
      q.maybeSingle = async () => ({ data: null, error: null });
      q.in = async () => ({ data: [], error: null });
      return q;
    },
  });
  globalThis.fetch = async (url) => {
    if (/data-home\.json$/.test(url)) return etat.listeEnPanne ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(LISTE)) };
    const m = /\/match\/(\d+)\.json$/.exec(url);
    const x = m && LISTE.matchs.find((y) => String(y.id) === m[1]);
    return x ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(x)) } : { ok: false, status: 404, json: async () => ({}) };
  };
  await import("data:text/javascript;base64," + Buffer.from(code).toString("base64") + "#" + Math.random());
  return handler;
}

async function appel(h, jwt, corps) {
  const req = new Request("https://x.supabase.co/functions/v1/match-data", {
    method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, jwt ? { Authorization: "Bearer " + jwt } : {}),
    body: JSON.stringify(corps),
  });
  const r = await h(req);
  return { status: r.status, corps: JSON.parse(await r.text()) };
}

test("match-data : jeton anonyme jamais verifie, vrai jeton toujours verifie", async (t) => {
  const etat = { getUser: [] };
  const h = await charger(etat);
  if (!h) { t.skip("node:module#stripTypeScriptTypes indisponible"); return; }
  const r = await appel(h, ANON, { id: "1" });
  assert.equal(r.status, 200);
  assert.equal(r.corps.matchs.length, 1);
  assert.deepEqual(etat.getUser, [], "cle anon : aucun appel au service d'authentification");
  const compte = jeton({ role: "authenticated", sub: "u1" });
  await appel(h, compte, { id: "1" });
  assert.deepEqual(etat.getUser, [compte], "jeton de compte : verifie");
  // Jeton illisible ou « anon » avec un sub : verifie (jamais suppose anonyme a tort... ni connecte).
  const bizarre = jeton({ role: "anon", sub: "u2" });
  await appel(h, bizarre, { id: "1" });
  await appel(h, "pas.un-jeton", { id: "1" });
  assert.deepEqual(etat.getUser.slice(1), [bizarre, "pas.un-jeton"]);
});

test("match-data : match inconnu = 404 match_introuvable ; liste publique en panne = 502", async (t) => {
  const etat = { getUser: [] };
  const h = await charger(etat);
  if (!h) { t.skip("node:module#stripTypeScriptTypes indisponible"); return; }
  const inconnu = await appel(h, ANON, { id: "999" });
  assert.equal(inconnu.status, 404);
  assert.equal(inconnu.corps.error, "match_introuvable");
  etat.listeEnPanne = true;
  const panne = await appel(h, ANON, { id: "1" });
  assert.equal(panne.status, 502);
});
