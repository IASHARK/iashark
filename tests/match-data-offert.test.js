"use strict";
// MATCH OFFERT (decision de Clement du 04/10/2026, controle de l'avocat du diable point 6) :
// plus rien de payant dans les fichiers publics ; la fonction match-data sert l'analyse du match
// offert aux seuls COMPTES CONNECTES (compte gratuit compris), relue dans match_premium_data, sauf
// le panneau Marches (marches_panneau, v3_marches, marches_flux : Pro seulement).
// Test d'EXECUTION : la vraie fonction (supabase/functions/match-data/index.ts, types retires par
// node:module#stripTypeScriptTypes), avec un faux client Supabase et de faux fichiers publics.
// Aucun appel reseau.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const NODE_MODULE = require("node:module");
const PREMIUM = require("../lib/premium-fields.js");

const ROOT = path.join(__dirname, "..");

// Fichiers publics : le match offert (1) et un match payant (2), sans aucun champ payant.
const PUBLIC_LISTE = { generated_at: "2026-10-04T05:00:00Z", detail_fields: [], matchs: [
  { id: 1, home: { n: "A" }, away: { n: "B" }, date: "2026-10-04 20:45", is_free: true, has_signal: true },
  { id: 2, home: { n: "C" }, away: { n: "D" }, date: "2026-10-04 21:00", is_free: false, has_signal: true },
] };
// Lignes match_premium_data (ce que le calcul a persiste).
const LIGNES = {
  1: { fixture_id: 1, pari_rec: "Victoire Domicile", cote_rec: 1.62, model_probability: 58, market_id: "home-win", marche: "1X2",
    kelly: 0.02, edge: 3, verdict_shark: "v", facteur_x: "f", dropping_odds: null, player_markets: null, markets_compared: null,
    raw_response: {}, premium_fields: { conf: 5.8, chance_iashark: 58, sim_resume: { base: 10000 }, sim_15min: { tr: [0.1] }, premier_but: { dom: 50 },
      stats_iashark: { arbitre: { nom: "X", n: 12 } }, jumeaux: { resultat: { n: 250 } }, lecture_match: "texte",
      marches_panneau: { nb: 40 }, v3_marches: [{ cle: "PREMIER_BUT:dom" }], marches_flux: { x: 1 }, mise: 2 } },
  2: { fixture_id: 2, pari_rec: "Over 2.5", cote_rec: 1.55, model_probability: 61, market_id: "over-25", marche: "TOTAL_BUTS",
    raw_response: {}, premium_fields: { conf: 6.1, sim_resume: { base: 10000 }, marches_panneau: { nb: 30 } } },
};

async function chargerFonction() {
  if (typeof NODE_MODULE.stripTypeScriptTypes !== "function") return null;
  let code = fs.readFileSync(path.join(ROOT, "supabase/functions/match-data/index.ts"), "utf8");
  code = NODE_MODULE.stripTypeScriptTypes(code, { mode: "strip" });
  code = code.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, "const createClient = globalThis.__mdCreateClient;");
  assert.ok(code.includes("globalThis.__mdCreateClient"), "import du client remplace");
  let handler = null;
  globalThis.Deno = { env: { get: () => "x" }, serve: (h) => { handler = h; } };
  const lus = [];
  globalThis.__mdCreateClient = () => ({
    auth: { getUser: async (jwt) => ({ data: { user: jwt === "gratuit" || jwt === "pro" ? { id: jwt } : null } }) },
    from: (table) => {
      const q = { _eq: null, _in: null };
      q.select = () => q;
      q.eq = (_c, v) => { q._eq = v; return q; };
      q.maybeSingle = async () => ({ data: table === "users" ? { plan: q._eq === "pro" ? "pro" : "free", role: null } : null, error: null });
      q.in = async (_c, ids) => { lus.push(ids.map(String)); return { data: ids.map((id) => LIGNES[String(id)]).filter(Boolean), error: null }; };
      return q;
    },
  });
  const fetchAvant = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (/data-home\.json$/.test(url)) return { ok: true, json: async () => JSON.parse(JSON.stringify(PUBLIC_LISTE)) };
    const m = /\/match\/(\d+)\.json$/.exec(url);
    if (m) return { ok: true, json: async () => JSON.parse(JSON.stringify(PUBLIC_LISTE.matchs.find((x) => String(x.id) === m[1]))) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  return { handler, lus, restaurer: () => { globalThis.fetch = fetchAvant; } };
}

async function appeler(f, jwt, corps) {
  const req = new Request("https://x.supabase.co/functions/v1/match-data", {
    method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, jwt ? { Authorization: "Bearer " + jwt } : {}),
    body: JSON.stringify(corps || { id: "1" }),
  });
  const r = await f.handler(req);
  return JSON.parse(await r.text());
}

test("match-data : match offert sans compte = rien de payant ; compte gratuit = tout sauf le panneau Marches ; Pro = tout", async (t) => {
  const f = await chargerFonction();
  if (!f) { t.skip("node:module#stripTypeScriptTypes indisponible (Node < 22.13)"); return; }
  try {
    // Visiteur sans compte : aucun champ payant, meme sur le match offert ; aucune lecture de la table.
    const anonyme = await appeler(f, null);
    assert.equal(anonyme.isPro, false);
    for (const m of anonyme.matchs) assert.deepEqual(PREMIUM.premiumLeaks(m), [], "anonyme, match " + m.id);
    assert.deepEqual(f.lus, [], "sans compte : match_premium_data jamais lu");

    // Compte gratuit connecte : le match offert complet (10 000 fois, film, qui ouvre le score, jumeaux,
    // arbitre, lecture...) SAUF marches_panneau, v3_marches, marches_flux ; jamais la mise ; le match payant : rien.
    const gratuit = await appeler(f, "gratuit");
    assert.equal(gratuit.isPro, false);
    const offert = gratuit.matchs.find((m) => m.id === 1);
    const paye = gratuit.matchs.find((m) => m.id === 2);
    assert.deepEqual([offert.pari_rec, offert.cote_rec, offert.model_probability, offert.chance_iashark], ["Victoire Domicile", 1.62, 58, 58]);
    for (const k of ["sim_resume", "sim_15min", "premier_but", "stats_iashark", "jumeaux", "lecture_match", "conf"]) assert.ok(offert[k] != null, "compte gratuit : " + k);
    for (const k of ["marches_panneau", "v3_marches", "marches_flux", "mise", "kelly", "vbet"]) assert.equal(offert[k], undefined, "Pro seulement : " + k);
    assert.deepEqual(PREMIUM.premiumLeaks(paye), [], "match payant : rien pour un compte gratuit");
    assert.deepEqual(f.lus, [["1"]], "seule la ligne du match offert est lue");

    // Pro : tout, panneau Marches compris, sur les deux matchs.
    const pro = await appeler(f, "pro");
    assert.equal(pro.isPro, true);
    const offertPro = pro.matchs.find((m) => m.id === 1);
    assert.deepEqual([offertPro.marches_panneau, offertPro.v3_marches.length], [{ nb: 40 }, 1]);
    assert.equal(pro.matchs.find((m) => m.id === 2).pari_rec, "Over 2.5");
  } finally {
    f.restaurer();
  }
});

test("liste « Pro seulement » : la meme dans lib/premium-fields.js et dans la fonction match-data", () => {
  const fn = fs.readFileSync(path.join(ROOT, "supabase/functions/match-data/index.ts"), "utf8");
  const bloc = /const CHAMPS_PRO_SEULEMENT = \[([^\]]*)\];/.exec(fn);
  assert.deepEqual([...bloc[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]), PREMIUM.PRO_ONLY_FIELDS);
  assert.deepEqual(PREMIUM.PRO_ONLY_FIELDS, ["marches_panneau", "v3_marches", "marches_flux"]);
});
