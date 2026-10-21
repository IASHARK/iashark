"use strict";
// VITESSE DE LA PAGE MATCH (etape 3 du plan du 21/10/2026) : le pari est demande a match-data des la premiere ligne
// de la page (script APPEL_TOT), sans attendre supabase-js ; match-page.js reprend cette reponse.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const VERSIONS = ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"];
const lire = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
function scriptDe(html) {
  const m = html.match(/<script>\/\* APPEL_TOT[\s\S]*?<\/script>/);
  return m ? m[0].replace(/^<script>/, "").replace(/<\/script>$/, "") : null;
}
function executer(code, { search, stockage, reponse }) {
  const appels = [];
  const G = {
    location: { search }, URLSearchParams, JSON, Date,
    localStorage: { getItem: (k) => (stockage && Object.prototype.hasOwnProperty.call(stockage, k) ? stockage[k] : null) },
    fetch: (url, opts) => { appels.push({ url, opts }); return Promise.resolve(reponse); },
  };
  G.window = G;
  vm.runInNewContext(code, G);
  return { G, appels };
}

test("chaque version de match.html : preconnexions et APPEL_TOT dans l'en-tete, avant toute feuille de style", () => {
  VERSIONS.forEach((v) => {
    const html = lire(v + "match.html");
    assert.equal((html.match(/APPEL_TOT/g) || []).length, 1, v);
    const i = html.indexOf("APPEL_TOT"), css = html.indexOf('rel="stylesheet"');
    assert.ok(i > 0 && css > i, v + " : avant les feuilles de style");
    assert.match(html, /<link rel="preconnect" href="https:\/\/ksvjraqitxouwiabecai\.supabase\.co" crossorigin>/, v);
  });
});

test("la cle du script est la cle publique anon d'app-client.js, jamais une autre", () => {
  const code = scriptDe(lire("match.html"));
  const cle = code.match(/k="([^"]+)"/)[1];
  assert.ok(lire("app-client.js").includes(cle));
  assert.match(Buffer.from(cle.split(".")[1], "base64").toString("utf8"), /"role":"anon"/);
});

test("sans compte : appel anonyme tout de suite ; avec un jeton valide : le jeton ; jeton presque expire : anonyme", async () => {
  const code = scriptDe(lire("fr/match.html"));
  const ok = { ok: true, json: () => Promise.resolve({ matchs: [{ id: 1635630, appel_sans_compte: true }] }) };
  const a = executer(code, { search: "?id=1635630", stockage: {}, reponse: ok });
  assert.equal(a.appels.length, 1);
  assert.equal(a.appels[0].url, "https://ksvjraqitxouwiabecai.supabase.co/functions/v1/match-data");
  assert.equal(a.appels[0].opts.method, "POST");
  assert.equal(a.appels[0].opts.body, JSON.stringify({ id: "1635630" }));
  assert.equal(a.appels[0].opts.headers.Authorization, "Bearer " + a.appels[0].opts.headers.apikey);
  assert.deepEqual([a.G.__IASHARK_APPEL.id, a.G.__IASHARK_APPEL.session], ["1635630", false]);
  assert.equal(JSON.stringify(await a.G.__IASHARK_APPEL.p), JSON.stringify({ data: { matchs: [{ id: 1635630, appel_sans_compte: true }] }, error: null }));

  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b = executer(code, { search: "?id=7", stockage: { "sb-ksvjraqitxouwiabecai-auth-token": JSON.stringify({ access_token: "jeton", expires_at: exp }) }, reponse: ok });
  assert.equal(b.appels[0].opts.headers.Authorization, "Bearer jeton");
  assert.equal(b.G.__IASHARK_APPEL.session, true);

  const c = executer(code, { search: "?id=7", stockage: { "sb-ksvjraqitxouwiabecai-auth-token": JSON.stringify({ access_token: "vieux", expires_at: Math.floor(Date.now() / 1000) + 30 }) }, reponse: ok });
  assert.equal(c.G.__IASHARK_APPEL.session, false, "jeton qui expire dans la minute : appel anonyme, supabase-js le renouvelle");
});

test("rien sans identifiant valide ; une reponse en erreur donne null (match-page.js refait l'appel habituel)", async () => {
  const code = scriptDe(lire("match.html"));
  assert.equal(executer(code, { search: "", stockage: {}, reponse: null }).appels.length, 0);
  assert.equal(executer(code, { search: "?id=null", stockage: {}, reponse: null }).appels.length, 0);
  const d = executer(code, { search: "?id=12", stockage: {}, reponse: { ok: false, status: 401 } });
  assert.equal(await d.G.__IASHARK_APPEL.p, null);
});

test("match-page.js reprend la reponse de la page pour CE match et la meme session, sinon l'appel habituel", () => {
  const js = lire("match-page.js");
  assert.match(js, /const appelPage=window\.__IASHARK_APPEL&&String\(window\.__IASHARK_APPEL\.id\)===String\(id\)\?window\.__IASHARK_APPEL:null;/);
  assert.match(js, /const appelPour=\(avecSession\)=>appelPage&&appelPage\.session===!!avecSession\?appelPage\.p:appelTot;/);
  assert.equal((js.match(/appelPour\(/g) || []).length, 2, "compte (ou match termine) et visiteur sans compte");
});
