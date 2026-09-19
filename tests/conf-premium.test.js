"use strict";
// DECISION PROPRIETAIRE DU 15/09/2026 : la "note sur 10" (conf = probabilite
// du modele pour le pari recommande / 10) est un chiffre PAYANT. Elle n'est
// lisible que sur le match offert du jour (is_free === true) et par un abonne
// Pro (fonction match-data, match_premium_data.premium_fields).
//
// Ce test echoue si conf apparait pour un match non offert dans les fichiers
// publics REELS : data.json, data-home.json, match/<id>.json, PRELOADED_MATCH
// des pages match (FR et <dir>/match), resumes SEO des accueils. Controle
// explicite, independant de la liste lib/premium-fields.js (si conf en
// sortait par erreur, ce test le verrait quand meme).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PREMIUM = require("../lib/premium-fields.js");
const C = require("../scripts/seo-common.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const exists = (f) => fs.existsSync(path.join(root, f));
const CONF_KEYS = ["conf", "conf_bucket", "model_probability_pct"];

function listFiles(dirRel, re) {
  const abs = path.join(root, dirRel);
  return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => re.test(f)).map((f) => dirRel + "/" + f) : [];
}
function isMatchLike(o) { return !!o && typeof o === "object" && !Array.isArray(o) && o.id != null && !!o.home && !!o.away; }
// Chemins des cles conf* a toute profondeur, dans tout match non offert.
function confLeaks(value, base) {
  const out = [];
  (function walk(v, p, inPaid) {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, p + "[" + i + "]", inPaid)); return; }
    if (!v || typeof v !== "object") return;
    let paid = inPaid;
    if (isMatchLike(v)) paid = v.is_free !== true;
    Object.keys(v).forEach((k) => {
      if (paid && CONF_KEYS.indexOf(k) !== -1) out.push(p + "." + k);
      walk(v[k], p + "." + k, paid);
    });
  })(value, base || "", false);
  return out;
}
function preloaded(html) {
  const mm = html.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/);
  return mm ? JSON.parse(mm[1]) : null;
}
function freeIds() {
  return new Set(JSON.parse(read("data-home.json")).matchs.filter((m) => m.is_free === true).map((m) => String(m.id)));
}

test("conf est premium : liste unique, copie de la fonction match-data, charge premium_fields", () => {
  assert.ok(PREMIUM.PREMIUM_FIELDS.includes("conf"));
  assert.ok(PREMIUM.PREMIUM_PAYLOAD_FIELDS.includes("conf"), "ecrit dans match_premium_data.premium_fields");
  assert.ok(PREMIUM.DEEP_PREMIUM_KEYS.includes("conf"), "cherche a toute profondeur");
  const fn = read("supabase/functions/match-data/index.ts");
  const bloc = fn.slice(fn.indexOf("const PREMIUM_FIELDS = ["), fn.indexOf("];", fn.indexOf("const PREMIUM_FIELDS = [")));
  assert.match(bloc, /"conf"/);
  const paye = { id: 1, home: { n: "A" }, away: { n: "B" }, conf: 6.9, has_signal: true };
  assert.equal(PREMIUM.stripPremium(paye).conf, undefined);
  assert.deepEqual(PREMIUM.premiumLeaks(paye), ["conf"]);
  assert.equal(PREMIUM.stripPremium(Object.assign({}, paye, { is_free: true })).conf, 6.9, "le match offert garde sa note");
  assert.deepEqual(PREMIUM.premiumPayload(paye), { conf: 6.9 });
  assert.deepEqual(confLeaks({ matchs: [paye, { id: 2, home: {}, away: {}, is_free: true, conf: 7 }] }), [".matchs[0].conf"]);
});

test("data.json, data-home.json, match/<id>.json reels : aucune note sur un match non offert", () => {
  const leaks = [];
  for (const f of ["data.json", "data-home.json"].concat(listFiles("match", /^\d+\.json$/))) {
    if (!exists(f)) continue;
    leaks.push(...confLeaks(JSON.parse(read(f)), f));
  }
  assert.deepEqual(leaks.slice(0, 10), [], leaks.length + " note(s) publiee(s)");
  const d = JSON.parse(read("data-home.json"));
  assert.ok(d.matchs.some((m) => m.is_free !== true), "aucun match non offert controle");
});

test("pages match FR et <dir>/match : PRELOADED_MATCH sans note hors match offert", () => {
  const pages = listFiles("match", /^\d+\.html$/);
  for (const d of C.DIR_CODES) pages.push(...listFiles(d + "/match", /^\d+\.html$/));
  let n = 0;
  for (const f of pages) {
    const html = read(f);
    const m = preloaded(html);
    if (!m) continue;
    n++;
    assert.deepEqual(confLeaks(m, f), [], f);
    if (m.is_free !== true) assert.doesNotMatch(html.match(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/)[0], /"conf"\s*:/, f);
  }
  assert.ok(n > 0, "aucune page match controlee");
});

test("resumes SEO des accueils : jamais de note sur 10 ni de pari, meme pour le match offert", () => {
  const indexes = ["index.html"].concat(C.DIR_CODES.map((d) => d + "/index.html")).filter(exists);
  for (const f of indexes) {
    const bloc = (read(f).match(/<!--SEO_MATCHES_SUMMARY-->([\s\S]*?)<!--\/SEO_MATCHES_SUMMARY-->/) || [])[1] || "";
    assert.doesNotMatch(bloc, /\/10\b|seo_confidence|seo_ai_pick|data-market-label="|NaN/, f + " : pari ou note dans le resume statique");
  }
});

test("pipeline et accueil : la note n'est rendue que si elle existe, jamais d'apres l'ecart", () => {
  const wf = read(".github/workflows/update-data.yml");
  // 19/09/2026 : le resume est rendu par scripts/home-summary.js (pipeline et build-locales).
  const pipe = wf.slice(wf.indexOf("function seoHomeSummaryHtml("), wf.indexOf("function injectHomeSeoSummary("));
  assert.match(pipe, /HOME_SUMMARY\.homeSummaryHtml\(/);
  const resume = read("scripts/home-summary.js");
  // 16/09/2026 : le resume statique ne nomme plus aucun pari, meme offert, ni aucune note.
  assert.equal((pipe.match(/m\.conf|m\.pari_rec/g) || []).length, 0, "ni conf ni pari lus dans le resume (pipeline)");
  assert.equal((resume.match(/\.conf\b|pari_rec|model_probability|market_id|prob_band/g) || []).length, 0, "ni conf ni pari lus dans le resume");
  const home = read("index.html");
  assert.doesNotMatch(home, /ovrConf|normEdge|parseEdge/, "couleur/palier/tri jamais d'apres l'ecart");
  assert.match(home, /function probConf\(m\)\{var c=normConf\(m&&m\.conf\);return c==null\?null:/);
  // Liste des matchs (home-list.js, 16/09/2026) : verrou AVANT toute lecture de
  // conf, note rendue seulement si elle existe, jamais d'apres l'ecart.
  const list = read("home-list.js");
  assert.doesNotMatch(list, /ovrConf|normEdge|parseEdge|m\.edge\b/, "liste : jamais d'apres l'ecart");
  assert.match(list, /if\(!ctx\.isPro&&!free\)return \{state:'locked',band:probBandOf\(m\)\};/);
  assert.ok(list.indexOf("state:'locked'") < list.indexOf("m.conf"), "verrou avant la lecture de conf");
  assert.match(list, /m\.conf!=null&&m\.conf!==''\)\?normConf\(m\.conf\):null/, "aucun chiffre sans note");
  const fm = read("lib/free-match.js");
  assert.doesNotMatch(fm, /\bm(?:&&m)?\.(?:conf|edge)\b/, "repli du match offert : critere public uniquement");
  const kg = read("lib/kickoff-guard.js");
  assert.doesNotMatch(kg, /match\.conf\s*=/, "un match ferme ne recoit plus de note");
});

test("surveillance : conf fait partie de la liste minimale des champs premium", () => {
  const checks = require("../lib/health/checks.js");
  assert.ok(checks.BASE_PREMIUM_FIELDS.includes("conf"));
  const spec = checks.loadPremiumFields(root);
  assert.ok(spec.fields.includes("conf") && spec.deepFields.includes("conf"));
});
