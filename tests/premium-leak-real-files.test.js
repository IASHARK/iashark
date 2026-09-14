"use strict";
// FUITE DE DONNEES (audit du 14/09/2026, hotfix main + branche). Controle des fichiers publics
// REELLEMENT generes, pas d'une copie de test : data.json, data-home.json,
// match/<id>.json, PRELOADED_MATCH et resume SEO des pages match (FR et
// localisees), pages championnat, blocs SEO des accueils, historique.json
// (depot GitHub public), et dist/ (ce que Netlify publie) s'il est construit.
//
// Regle : aucun champ de lib/premium-fields.js, a aucune profondeur, sur un
// match non offert. Avant ce test, data-home.json et match/<id>.json portaient
// pour chaque match p1/pn/p2, po25, btts, lambda, mc_scores et paris_safe (le
// pari recommande, sa cote et sa probabilite en clair).
//
// Pour regenerer en local : node scripts/split-public-data.js &&
// node scripts/seo-pages.js && node scripts/build-public.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PREMIUM = require("../lib/premium-fields.js");
const C = require("../scripts/seo-common.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const exists = (f) => fs.existsSync(path.join(root, f));

function preloaded(html) {
  const mm = html.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/);
  return mm ? JSON.parse(mm[1]) : null;
}
function fixedId(html) {
  const mm = html.match(/var FIXED_MATCH_ID=("[^"]*")/);
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
  const d = JSON.parse(read("data-home.json"));
  const free = new Set(), nonFree = new Set();
  for (const m of d.matchs || []) (m.is_free === true ? free : nonFree).add(String(m.id));
  return { free, nonFree };
}
function matchPages() {
  const pages = listFiles("match", /^\d+\.html$/);
  for (const d of C.DIR_CODES) pages.push(...listFiles(d + "/match", /^\d+\.html$/));
  return pages;
}

test("data.json reel : aucune sortie du modele sur un match non offert (recursif), run_output public", () => {
  const d = JSON.parse(read("data.json"));
  assert.ok(Array.isArray(d.matchs) && d.matchs.length > 0);
  assertNoLeak(d.matchs, "data.json");
  const free = new Set(d.matchs.filter((m) => m.is_free === true).map((m) => String(m.id)));
  const ro = d.run_output || {};
  if (ro.safe_pick && ro.safe_pick.redacted !== true) {
    assert.ok(ro.safe_pick.fixture && free.has(String(ro.safe_pick.fixture.fixture_id)), "SAFE_PICK complete publiee pour un match payant");
  }
  assert.equal(ro.top5_scorers && ro.top5_scorers.players, undefined, "joueurs du top buteurs publies");
  for (const c of (ro.daily_combos && ro.daily_combos.combos) || []) assert.equal(c.legs, undefined, "jambes de combine publiees");
});

test("data-home.json reel : aucune sortie du modele sur un match non offert (recursif)", () => {
  assertNoLeak(JSON.parse(read("data-home.json")), "data-home.json");
});

test("match/<id>.json reels : aucune sortie du modele sur un match non offert (recursif)", () => {
  const files = listFiles("match", /^\d+\.json$/);
  assert.ok(files.length > 0, "aucun match/<id>.json : lancer node scripts/split-public-data.js");
  for (const f of files) assertNoLeak(JSON.parse(read(f)), f);
});

test("pages match FR et localisees : PRELOADED_MATCH sans champ premium, pari nomme seulement pour le match offert", () => {
  const { free, nonFree } = accessMap();
  const pages = matchPages();
  assert.ok(pages.length > 0);
  for (const f of pages) {
    const html = read(f);
    const m = preloaded(html);
    if (m) assertNoLeak(m, f + " PRELOADED_MATCH");
    const id = fixedId(html) || (m && String(m.id));
    const sansScript = html.replace(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/, "");
    if (id && nonFree.has(String(id))) {
      assert.doesNotMatch(sansScript, /data-market-label="/, f + " : pari nomme dans le HTML d'un match payant");
    }
    if (id && !free.has(String(id)) && !nonFree.has(String(id))) continue; // page d'un match hors liste courante
  }
});

test("pages championnat : aucune donnee du modele", () => {
  for (const d of C.DIR_CODES) {
    for (const f of listFiles(d + "/leagues", /\.html$/)) {
      const html = read(f);
      assert.doesNotMatch(html, /data-market-label="|PRELOADED_MATCH|"pari_rec"|"p1"|"mc_scores"|"paris_safe"/, f);
    }
  }
});

test("accueils : le bloc SEO_MATCHES_SUMMARY ne nomme le pari que pour le match offert", () => {
  const { nonFree } = accessMap();
  const indexes = ["index.html"].concat(C.DIR_CODES.map((d) => d + "/index.html")).filter(exists);
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

test("l'analyse offerte reste complete, les amorces publiques restent presentes", () => {
  const d = JSON.parse(read("data-home.json"));
  for (const m of d.matchs.filter((x) => x.is_free === true && x.pari_rec)) {
    const detail = JSON.parse(read("match/" + m.id + ".json"));
    assert.equal(detail.pari_rec, m.pari_rec, "le match offert garde son pari");
    for (const k of ["p1", "pn", "p2"]) if (k in (JSON.parse(read("data.json")).matchs.find((x) => x.id === m.id) || {})) assert.ok(k in detail, k + " doit rester sur le match offert");
  }
  for (const m of JSON.parse(read("data.json")).matchs.filter((x) => x.is_free === true)) {
    assert.deepEqual(PREMIUM.stripPremium(m), m, "le match offert n'est jamais retire de data.json");
  }
  const avecSignal = d.matchs.filter((m) => m.is_free !== true && m.has_signal === true);
  for (const m of avecSignal) {
    assert.ok(m.conf != null, "conf (amorce) retire de la liste pour " + m.id);
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
  let controles = 0;
  for (const f of out) {
    if (/\/exemple-analyse\.html$/.test(f)) continue; // demo figee d'un match passe (IASHARK_DEMO)
    const txt = read(f);
    if (f.endsWith(".json")) {
      if (!/"home"/.test(txt)) continue;
      assertNoLeak(JSON.parse(txt), f);
      controles++;
    } else {
      const m = preloaded(txt);
      if (m) { assertNoLeak(m, f + " PRELOADED_MATCH"); controles++; }
    }
  }
  assert.ok(controles > 0, "aucun fichier de match controle dans dist/");
  if (exists("dist/historique.json")) {
    const h = JSON.parse(read("dist/historique.json"));
    for (const p of h.predictions || []) {
      if (p.result === "scheduled" || p.result === "pending") assert.equal(p.prediction, undefined, "pari en attente publie dans dist/historique.json");
    }
  }
});
