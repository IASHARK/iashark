"use strict";
// Controles des donnees publiques (lib/health/checks.js, section DONNEES
// PUBLIQUES) et textes/envois d'alerte (lib/health/alerts.js).
// Fixtures en memoire : frais, vieux, vide, fuite premium. AUCUN appel reseau.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const checks = require("../lib/health/checks.js");
const alerts = require("../lib/health/alerts.js");
const { deepPremiumLeaks } = require("../lib/premium-fields.js");
const LEAGUES = require("../config/leagues.json");

const NOW = new Date("2026-09-14T08:30:00Z"); // 10h30 a Paris
const COVERAGE = { leagues: [
  { key: "premier", seasonStart: "2026-08-21", seasonEnd: "2027-05-30" },
  { key: "ligue1", seasonStart: "2026-08-21", seasonEnd: "2027-05-29" },
  { key: "mls", seasonStart: "2026-02-21", seasonEnd: "2026-11-08" },
] };
const OFF_SEASON = { leagues: [{ key: "premier", seasonStart: "2027-08-21", seasonEnd: "2028-05-30" }] };

// Match PUBLIC tel que publie par le pipeline (aucun champ premium).
function pub(id, extra) {
  return Object.assign({
    id: id, home: { n: "Home " + id, id: id * 10 }, away: { n: "Away " + id, id: id * 10 + 1 },
    league: "Premier League", league_key: "premier", league_id: 39, date: "2026-09-14 21:00",
    conf: 6.5, model_output_available: true, has_signal: true, no_signal: false,
    c1: "1.85", cn: "3.60", c2: "4.10", is_free: false,
  }, extra || {});
}

const fixtures = {
  fresh: () => ({ generated_at: "2026-09-14T06:25:00Z", run_id: "DAILY_2026-09-14", matchs: [
    pub(1, { is_free: true, pari_rec: "1", analyse_card: "Texte offert" }), // offert : champs premium autorises
    pub(2, { league: "Ligue 1", league_key: "ligue1", league_id: 61 }),
    pub(3, { league: "Major League Soccer", league_key: "mls", league_id: 253, date: "2026-09-15 02:30" }),
  ] }),
  stale: () => ({ generated_at: "2026-09-12T06:20:00Z", matchs: [
    pub(1, { is_free: true, date: "2026-09-12 21:00" }),
    pub(2, { date: "2026-09-12 18:00" }),
  ] }),
  empty: () => ({ generated_at: "2026-09-14T06:25:00Z", matchs: [] }),
  leak: () => {
    const f = fixtures.fresh();
    f.matchs[1].pari_rec = "1X";
    f.matchs[1].odds_available = true; // champ premium : sa presence est une fuite
    f.matchs[2].top_scorers_home = [{ name: "X", goal_threat_score: 0.8 }];
    return f;
  },
};

function evaluate(home, extra) {
  return checks.evaluatePublicData(Object.assign({
    now: NOW, home: home, leaguesConfig: LEAGUES, coverage: COVERAGE, deepLeaksFn: deepPremiumLeaks,
  }, extra || {}));
}
const byId = (report, id) => report.results.find((r) => r.id === id);

// --- Fixtures completes -----------------------------------------------------------
test("fixture fraiche : aucun echec", () => {
  const r = evaluate(fixtures.fresh());
  assert.equal(r.summary.counts.fail, 0, JSON.stringify(r.results.filter((x) => x.status === "fail")));
  assert.equal(byId(r, "fraicheur-generation").status, "ok");
  assert.equal(byId(r, "contenu-nombre-matchs").status, "ok");
  assert.equal(byId(r, "contenu-match-offert-du-jour").status, "ok");
  assert.equal(byId(r, "contenu-ligues").status, "ok");
  assert.equal(byId(r, "contenu-cotes").status, "ok");
  assert.equal(byId(r, "fuite-data-home").status, "ok");
  assert.equal(r.data_generated_at, "2026-09-14T06:25:00Z");
});

test("fixture vieille : generated_at > 30 h et aucun match aujourd'hui/demain", () => {
  const r = evaluate(fixtures.stale());
  assert.equal(r.summary.status, "fail");
  assert.equal(byId(r, "fraicheur-generation").status, "fail");
  assert.match(byId(r, "fraicheur-generation").detail, /50\.2 h/);
  assert.equal(byId(r, "fraicheur-matchs").status, "fail");
  assert.equal(byId(r, "contenu-match-offert-du-jour").status, "warn");
  assert.ok(!r.results.some(checks.isGateFailure), "des donnees vieilles ne bloquent pas la publication");
});

test("fixture vide : echec un jour de match, avertissement hors saison", () => {
  const r = evaluate(fixtures.empty());
  assert.equal(byId(r, "contenu-nombre-matchs").status, "fail");
  assert.match(byId(r, "contenu-nombre-matchs").detail, /3 ligue\(s\) en saison/);
  assert.ok(r.results.some(checks.isGateFailure));
  assert.equal(byId(r, "fraicheur-matchs"), undefined);
  assert.equal(evaluate(fixtures.empty(), { coverage: OFF_SEASON }).results.find((x) => x.id === "contenu-nombre-matchs").status, "warn");
  // Rapport de couverture illisible : prudence, echec.
  assert.equal(byId(evaluate(fixtures.empty(), { coverage: null }), "contenu-nombre-matchs").status, "fail");
});

test("fixture fuite premium : alerte critique avec champs et match", () => {
  const r = evaluate(fixtures.leak());
  const leak = byId(r, "fuite-data-home");
  assert.equal(leak.status, "fail");
  assert.equal(leak.critical, true);
  assert.match(leak.detail, /FUITE PREMIUM : 2 match\(s\)/);
  assert.match(leak.detail, /pari_rec/);
  assert.match(leak.detail, /odds_available/);
  assert.match(leak.detail, /top_scorers_home\[\]\.goal_threat_score/);
  assert.ok(leak.leak_paths.length >= 3);
  assert.ok(checks.isGateFailure(leak));
  assert.ok(alerts.hasLeak(r));
});

test("repli data.json : fuite, safe_pick et date du run_output", () => {
  const data = { matchs: fixtures.fresh().matchs, run_output: { snapshot: "2026-09-14T06:25:00Z", safe_pick: { redacted: true } } };
  const r = evaluate(null, { homeError: "HTTP 404", data: data });
  assert.equal(byId(r, "source-publique").status, "warn");
  assert.match(byId(r, "source-publique").detail, /HTTP 404/);
  assert.equal(byId(r, "fraicheur-generation").status, "ok");
  assert.equal(byId(r, "fuite-data-json").status, "ok");
  assert.equal(byId(r, "fuite-safe-pick").status, "ok");
  const none = evaluate(null, { homeError: "HTTP 404", dataError: "délai dépassé" });
  assert.equal(none.summary.status, "fail");
  assert.equal(none.results.length, 1);
  assert.ok(checks.isGateFailure(none.results[0]));
});

test("fichiers match/<id>.json : fuite detectee, fichiers manquants signales", () => {
  const detail = Object.assign(pub(2), { h2h: [], top_scorers_home: [{ goal_threat_score: 1 }] });
  const r = evaluate(fixtures.fresh(), { details: { "match/1.json": pub(1, { is_free: true, verdict_shark: "ok" }), "match/2.json": detail }, detailsMissing: ["3 (HTTP 404)"] });
  const leak = byId(r, "fuite-match-detail");
  assert.equal(leak.status, "fail");
  assert.match(leak.detail, /1 match\(s\).*goal_threat_score.*ex\. match 2/);
  assert.equal(byId(r, "source-match-detail").status, "warn");
});

// --- Controles unitaires --------------------------------------------------------------
test("checkGeneratedAt : seuil, absent, illisible, futur", () => {
  assert.equal(checks.checkGeneratedAt("2026-09-13T03:00:00Z", NOW, 30).status, "ok"); // 29,5 h
  assert.equal(checks.checkGeneratedAt("2026-09-13T02:00:00Z", NOW, 30).status, "fail"); // 30,5 h
  assert.equal(checks.checkGeneratedAt(null, NOW).status, "fail");
  assert.equal(checks.checkGeneratedAt("hier", NOW).status, "fail");
  assert.equal(checks.checkGeneratedAt("2026-09-15T08:00:00Z", NOW).status, "warn");
  assert.equal(checks.checkGeneratedAt("2026-09-14T08:00:00Z", NOW, 2).status, "ok");
});

test("leaguesInSeason lit les dates reelles du rapport de couverture", () => {
  assert.deepEqual(checks.leaguesInSeason(COVERAGE, "2026-09-14"), ["premier", "ligue1", "mls"]);
  assert.deepEqual(checks.leaguesInSeason(COVERAGE, "2026-12-01"), ["premier", "ligue1"]);
  assert.equal(checks.leaguesInSeason(null, "2026-09-14"), null);
  assert.equal(checks.leaguesInSeason({ leagues: [{ key: "x" }] }, "2026-09-14"), null);
  const real = require("../league-coverage-report.json");
  assert.ok(Array.isArray(checks.leaguesInSeason(real, "2026-09-14")));
});

test("checkFreeMatchOfDay : exige is_free === true seulement s'il y a des analyses", () => {
  assert.equal(checks.checkFreeMatchOfDay([pub(1), pub(2)], NOW).status, "fail");
  assert.equal(checks.checkFreeMatchOfDay([pub(1, { is_free: "true" })], NOW).status, "fail");
  const noAnalysis = [pub(1, { model_output_available: false, has_signal: false })];
  assert.equal(checks.checkFreeMatchOfDay(noAnalysis, NOW).status, "skip");
  assert.equal(checks.checkFreeMatchOfDay([pub(1, { is_free: true, date: "2026-09-15 20:00" })], NOW).status, "ok");
  assert.equal(checks.checkFreeMatchOfDay([], NOW).status, "skip");
});

test("checkExpectedLeagues : cle, repli league_id, collecte partielle, hors config", () => {
  assert.equal(checks.matchLeagueKey({ league_id: 61 }, checks.configLeagues(LEAGUES)), "ligue1");
  const inSeason = ["premier", "ligue1", "mls"];
  assert.equal(checks.checkExpectedLeagues(fixtures.fresh().matchs, LEAGUES, inSeason).status, "ok");
  const partial = checks.checkExpectedLeagues([pub(1)], LEAGUES, inSeason);
  assert.equal(partial.status, "warn");
  assert.match(partial.detail, /1\/3 .*sans match : ligue1, mls/);
  const alien = checks.checkExpectedLeagues([pub(1, { league: "Ligue fantome", league_key: "fantome", league_id: 9999 })], LEAGUES, inSeason);
  assert.equal(alien.status, "fail");
  assert.match(alien.detail, /hors config : Ligue fantome/);
  assert.equal(checks.checkExpectedLeagues([pub(1), pub(2, { league_key: "x", league_id: 9999, league: "Autre" })], LEAGUES, ["premier"]).status, "warn");
  assert.equal(checks.checkExpectedLeagues([pub(1)], null, inSeason).status, "skip");
});

test("cotes : cotes brutes publiques uniquement, jamais odds_available", () => {
  assert.equal(checks.hasOdds(pub(1)), true);
  assert.equal(checks.hasOdds({ odds_available: true }), false);
  assert.equal(checks.hasOdds({ c1: "", cn: "3.2" }), true);
  assert.equal(checks.hasOdds({ c1: "1.00", cn: "-", c2: null }), false);
  const noOdds = (id) => pub(id, { c1: "", cn: "", c2: "", odds_available: true });
  assert.equal(checks.checkOdds([noOdds(1), noOdds(2)]).status, "fail");
  assert.equal(checks.checkOdds([pub(1), noOdds(2), noOdds(3)]).status, "warn");
});

test("checkDeepPremiumLeaks : module absent ou en erreur = echec critique", () => {
  const absent = checks.checkDeepPremiumLeaks("x", "data-home.json", { matchs: [] }, null);
  assert.equal(absent.status, "fail");
  assert.equal(absent.critical, true);
  const boom = checks.checkDeepPremiumLeaks("x", "data-home.json", { matchs: [] }, () => { throw new Error("boom"); });
  assert.match(boom.detail, /boom/);
  assert.equal(checks.checkDeepPremiumLeaks("x", "data-home.json", null, deepPremiumLeaks).status, "skip");
  assert.deepEqual(checks.summarizeDeepLeaks(["matchs[0]#12.pari_rec", "match/13.json#13.stade.goal_threat_score"]),
    { matchIds: ["12", "13"], fields: ["pari_rec", "stade.goal_threat_score"] });
});

test("les fichiers publics du depot ne fuient pas (si presents)", () => {
  const fs = require("node:fs");
  const root = path.join(__dirname, "..");
  ["data-home.json"].forEach((f) => {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) return;
    const r = checks.checkDeepPremiumLeaks("repo", f, JSON.parse(fs.readFileSync(p, "utf8")), deepPremiumLeaks);
    assert.equal(r.status, "ok", r.detail);
  });
});

// --- Alertes ----------------------------------------------------------------------------
test("resume francais, issue, e-mail : fuite en tete, solution incluse", () => {
  const r = evaluate(fixtures.leak());
  const text = alerts.formatReportText(r, { runUrl: "https://github.com/o/r/actions/runs/7" });
  assert.match(text, /IAShark – données publiques : PANNE CRITIQUE/);
  assert.match(text, /‼️ FUITE DE CHAMPS PREMIUM/);
  assert.match(text, /→ Que faire :/);
  assert.ok(text.indexOf("❌") < text.indexOf("✅"), "echecs avant les succes");
  assert.match(text, /actions\/runs\/7/);
  const issue = alerts.formatIssue(r, { now: NOW });
  assert.equal(issue.key, "donnees-publiques");
  assert.equal(issue.title, "🚨 FUITE PREMIUM – Données publiques IAShark – 2026-09-14");
  assert.match(issue.body, /Exemples de chemins/);
  assert.match(alerts.buildAlertMessage(r).subject, /^\[IAShark\] FUITE PREMIUM – /);
  const stale = alerts.buildAlertMessage(evaluate(fixtures.stale()));
  assert.match(stale.subject, /^\[IAShark\] Alerte données publiques – .*générées/);
});

test("withPipelineFailure ajoute un echec critique, sauf succes", () => {
  const ok = evaluate(fixtures.fresh());
  assert.equal(alerts.withPipelineFailure(ok, { conclusion: "success" }), ok);
  assert.equal(alerts.withPipelineFailure(ok, {}), ok);
  const bad = alerts.withPipelineFailure(ok, { conclusion: "failure", url: "https://github.com/o/r/actions/runs/9" });
  assert.equal(bad.summary.status, "fail");
  assert.equal(bad.results[0].id, "pipeline-quotidien");
  assert.match(bad.results[0].detail, /failure.*runs\/9/);
});

test("readChannels : chaque canal ignore si son secret manque", () => {
  const none = alerts.readChannels({});
  assert.equal(none.github, null);
  assert.equal(none.email, null);
  assert.deepEqual(none.emailMissing, ["RESEND_API_KEY", "ALERT_EMAIL"]);
  assert.equal(none.webhook, null);
  const partial = alerts.readChannels({ RESEND_API_KEY: "re_123456", ALERT_EMAIL: "  " });
  assert.equal(partial.email, null);
  assert.deepEqual(partial.emailMissing, ["ALERT_EMAIL"]);
  const all = alerts.readChannels({ GITHUB_TOKEN: "t", RESEND_API_KEY: "re_123456", ALERT_EMAIL: "a@x.fr, b@x.fr", ALERT_WEBHOOK_URL: "https://hooks.example/abc" });
  assert.deepEqual(all.email.to, ["a@x.fr", "b@x.fr"]);
  assert.equal(all.email.from, alerts.DEFAULT_FROM);
  assert.equal(all.webhook.url, "https://hooks.example/abc");
  assert.equal(alerts.readChannels({ ALERT_WEBHOOK_URL: "http://insecure" }).webhookInvalid, true);
});

test("shouldNotify : pas de spam pendant qu'une issue est deja signalee", () => {
  assert.equal(alerts.shouldNotify("alert", null), true);
  assert.equal(alerts.shouldNotify("alert", "created"), true);
  assert.equal(alerts.shouldNotify("alert", "updated+commented"), true);
  assert.equal(alerts.shouldNotify("alert", "updated"), false);
  assert.equal(alerts.shouldNotify("alert", "error"), true);
  assert.equal(alerts.shouldNotify("recovery", "closed"), true);
  assert.equal(alerts.shouldNotify("recovery", "none"), false);
  assert.equal(alerts.shouldNotify("recovery", null), false);
});

test("envois Resend et webhook : bon format, secrets jamais dans les erreurs", async () => {
  const calls = [];
  const okFetch = async (url, init) => { calls.push({ url: url, init: init }); return { status: 200, text: async () => "{}" }; };
  const msg = { subject: "[IAShark] test", text: "corps" };
  const report = evaluate(fixtures.leak());
  assert.deepEqual(await alerts.sendResendEmail({ apiKey: "re_SECRET_KEY", from: "A <a@iashark.com>", to: ["b@x.fr"] }, msg, okFetch), { ok: true, status: 200 });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_SECRET_KEY");
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: "A <a@iashark.com>", to: ["b@x.fr"], subject: "[IAShark] test", text: "corps" });
  await alerts.sendWebhook({ url: "https://hooks.example/SECRET_PATH" }, msg, report, okFetch);
  const payload = JSON.parse(calls[1].init.body);
  assert.match(payload.text, /^\[IAShark\] test/);
  assert.ok(payload.content.length <= 1900);
  assert.equal(payload.failures[0].critical, true);

  const echoFetch = async (url, init) => ({ status: 401, text: async () => "invalid key " + init.headers.Authorization + " for " + url });
  const e1 = await alerts.sendResendEmail({ apiKey: "re_SECRET_KEY", from: "a", to: ["b"] }, msg, echoFetch);
  assert.equal(e1.ok, false);
  assert.doesNotMatch(e1.error, /re_SECRET_KEY/);
  const e2 = await alerts.sendWebhook({ url: "https://hooks.example/SECRET_PATH" }, msg, report, async () => { throw new Error("connect https://hooks.example/SECRET_PATH refused"); });
  assert.equal(e2.ok, false);
  assert.doesNotMatch(e2.error, /SECRET_PATH/);
});
