"use strict";
// FUITE DE DONNEES (audit du 14/09/2026, hotfix main). Controle des fichiers
// publics REELLEMENT commites, pas d'une copie de test : data.json (servi par
// Netlify), PRELOADED_MATCH des pages match, bloc SEO des accueils,
// historique.json (depot GitHub public), et dist/ s'il est construit.
//
// Regle : aucun champ de lib/premium-fields.js, a aucune profondeur, sur un
// match non offert. Avant ce test, data.json et match/<id>.html portaient pour
// 54 matchs payants p1/pn/p2, po25, btts, lambda, mc_scores et paris_safe (le
// pari recommande, sa cote et sa probabilite en clair).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PREMIUM = require("../lib/premium-fields.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const exists = (f) => fs.existsSync(path.join(root, f));
const DIRS = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx"];

function preloaded(html) {
  const mm = html.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/);
  return mm ? JSON.parse(mm[1]) : null;
}
function assertNoLeak(value, label) {
  const leaks = PREMIUM.deepPremiumLeaks(value);
  assert.deepEqual(leaks.slice(0, 10), [], label + " : " + leaks.length + " champ(s) premium sur un match non offert");
}
function listFiles(dirRel, re) {
  const abs = path.join(root, dirRel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => re.test(f)).map((f) => dirRel + "/" + f);
}
function accessMap() {
  const d = JSON.parse(read("data.json"));
  const free = new Set(), nonFree = new Set();
  for (const m of d.matchs || []) (m.is_free === true ? free : nonFree).add(String(m.id));
  return { free, nonFree };
}

test("data.json reel : aucune sortie du modele sur un match non offert (recursif), run_output public", () => {
  const d = JSON.parse(read("data.json"));
  assert.ok(Array.isArray(d.matchs));
  assertNoLeak(d.matchs, "data.json");
  const free = new Set(d.matchs.filter((m) => m.is_free === true).map((m) => String(m.id)));
  const ro = d.run_output || {};
  if (ro.safe_pick && ro.safe_pick.redacted !== true && ro.safe_pick.fixture) {
    assert.ok(free.has(String(ro.safe_pick.fixture.fixture_id)), "SAFE_PICK complete publiee pour un match payant");
  }
  assert.equal(ro.top5_scorers && ro.top5_scorers.players, undefined, "joueurs du top buteurs publies");
  for (const c of (ro.daily_combos && ro.daily_combos.combos) || []) assert.equal(c.legs, undefined, "jambes de combine publiees");
});

test("pages match : PRELOADED_MATCH sans champ premium, pari nomme seulement pour le match offert", () => {
  const { nonFree } = accessMap();
  const pages = listFiles("match", /^\d+\.html$/);
  for (const d of DIRS) pages.push(...listFiles(d + "/match", /^\d+\.html$/));
  for (const f of pages) {
    const html = read(f);
    const m = preloaded(html);
    if (m) assertNoLeak(m, f + " PRELOADED_MATCH");
    const id = (f.match(/(\d+)\.html$/) || [])[1];
    if (id && nonFree.has(id)) {
      const sansScript = html.replace(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/, "");
      assert.doesNotMatch(sansScript, /data-market-label="/, f + " : pari nomme dans le HTML d'un match payant");
    }
  }
});

test("accueils : le bloc SEO_MATCHES_SUMMARY ne nomme le pari que pour le match offert", () => {
  const { nonFree } = accessMap();
  const indexes = ["index.html"].concat(DIRS.map((d) => d + "/index.html")).filter(exists);
  for (const f of indexes) {
    const bloc = (read(f).match(/<!--SEO_MATCHES_SUMMARY-->([\s\S]*?)<!--\/SEO_MATCHES_SUMMARY-->/) || [])[1] || "";
    for (const li of bloc.match(/<li>[\s\S]*?<\/li>/g) || []) {
      const id = (li.match(/\/match\/(\d+)\.html/) || [])[1];
      if (id && nonFree.has(id)) assert.doesNotMatch(li, /data-market-label="/, f + " : pari du match payant " + id);
    }
  }
});

test("historique.json (depot public) : aucun pari en attente en clair hors match offert", () => {
  const { free } = accessMap();
  const h = JSON.parse(read("historique.json"));
  for (const p of h.predictions || []) {
    if ((p.result === "scheduled" || p.result === "pending") && p.fixture_id != null && !free.has(String(p.fixture_id))) {
      for (const k of PREMIUM.PENDING_REDACTED_FIELDS) assert.equal(p[k], undefined, "historique.json : " + k + " en clair pour " + p.fixture_id);
      assert.equal(p.redacted, true, "prediction en attente non marquee redacted : " + p.fixture_id);
    }
  }
});

test("l'analyse offerte reste complete", () => {
  const d = JSON.parse(read("data.json"));
  for (const m of d.matchs.filter((x) => x.is_free === true)) {
    assert.deepEqual(PREMIUM.stripPremium(m), m, "le match offert n'est jamais retire");
  }
  for (const m of d.matchs.filter((x) => x.is_free !== true && x.has_signal === true)) {
    assert.ok(m.home && m.away && m.date, "identite du match retiree pour " + m.id);
  }
});

test("dist/ (ce que Netlify publie) : aucun champ premium dans les JSON et PRELOADED_MATCH publies", { skip: !exists("dist") && "dist/ non construit" }, () => {
  const out = [];
  (function walk(dirRel) {
    for (const n of fs.readdirSync(path.join(root, dirRel))) {
      const rel = dirRel + "/" + n;
      if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(json|html)$/.test(n)) out.push(rel);
    }
  })("dist");
  for (const f of out) {
    if (/\/exemple-analyse\.html$/.test(f)) continue; // demo figee d'un match passe (IASHARK_DEMO)
    const txt = read(f);
    if (f.endsWith(".json")) {
      if (/"home"/.test(txt)) assertNoLeak(JSON.parse(txt), f);
    } else {
      const m = preloaded(txt);
      if (m) assertNoLeak(m, f + " PRELOADED_MATCH");
    }
  }
});
