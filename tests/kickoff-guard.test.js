"use strict";
// Garde coup d'envoi (lib/kickoff-guard.js) et son branchement dans le
// pipeline reel (.github/workflows/update-data.yml) : un match deja commence,
// imminent (<= run + 15 min) ou dont le statut API n'est pas NS/TBD ne recoit
// ni pari, ni analyse publiee, ni statut de match offert, ni candidature a la
// selection canonique. Il peut rester affiche comme fiche d'information.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  KICKOFF_MARGIN_MINUTES, UPCOMING_STATUSES, kickoffGate, closeMatchForPick, filterOpenCandidates,
} = require("../lib/kickoff-guard.js");
const PREMIUM = require("../lib/premium-fields.js");

const RUN = Date.parse("2026-09-14T06:00:00Z"); // heure du cron quotidien
const MIN = 60000;

function apiFixture(id, isoDate, status) {
  return { fixture: { id: id, date: isoDate, timestamp: Math.floor(Date.parse(isoDate) / 1000), status: { short: status } } };
}

test("constantes : marge de 15 minutes, statuts a venir NS/TBD", () => {
  assert.equal(KICKOFF_MARGIN_MINUTES, 15);
  assert.deepEqual(UPCOMING_STATUSES, ["NS", "TBD"]);
});

test("kickoff passe : match de nuit (MLS/Liga MX) deja commence au moment du run -> ferme", () => {
  // 02:30 UTC = 20:30 a Mexico la veille ; le run tourne a 06:00 UTC.
  const g = kickoffGate(apiFixture(1, "2026-09-14T02:30:00+00:00", "NS"), RUN);
  assert.equal(g.open, false);
  assert.equal(g.reason, "KICKOFF_PASSED");
  // Statut deja mis a jour par l'API (en cours ou termine) : ferme aussi.
  ["1H", "HT", "2H", "FT", "PST", "CANC", "ABD", "LIVE", ""].forEach(function (st) {
    const g2 = kickoffGate(apiFixture(1, "2026-09-14T20:00:00+00:00", st), RUN);
    assert.equal(g2.open, false, st);
    assert.equal(g2.reason, "FIXTURE_NOT_UPCOMING", st);
  });
});

test("kickoff imminent : coup d'envoi <= run + 15 min -> ferme (bornes incluses)", () => {
  assert.equal(kickoffGate(apiFixture(2, new Date(RUN).toISOString(), "NS"), RUN).reason, "KICKOFF_PASSED");
  const g10 = kickoffGate(apiFixture(2, new Date(RUN + 10 * MIN).toISOString(), "NS"), RUN);
  assert.deepEqual([g10.open, g10.reason], [false, "KICKOFF_IMMINENT"]);
  const g15 = kickoffGate(apiFixture(2, new Date(RUN + 15 * MIN).toISOString(), "TBD"), RUN);
  assert.deepEqual([g15.open, g15.reason], [false, "KICKOFF_IMMINENT"]);
});

test("kickoff futur : coup d'envoi > run + 15 min et statut NS/TBD -> ouvert", () => {
  const g16 = kickoffGate(apiFixture(3, new Date(RUN + 16 * MIN).toISOString(), "NS"), RUN);
  assert.deepEqual([g16.open, g16.reason], [true, null]);
  const gSoir = kickoffGate(apiFixture(3, "2026-09-14T21:00:00+02:00", "TBD"), RUN);
  assert.equal(gSoir.open, true);
  // Objet fixture direct (sans enveloppe api-football) et date sans timestamp.
  assert.equal(kickoffGate({ date: "2026-09-15T19:00:00+00:00", status: { short: "NS" } }, RUN).open, true);
});

test("coup d'envoi illisible ou fixture inconnue -> ferme, jamais suppose ouvert", () => {
  assert.equal(kickoffGate({ fixture: { status: { short: "NS" } } }, RUN).reason, "KICKOFF_UNKNOWN");
  assert.equal(kickoffGate(undefined, RUN).open, false);
  assert.equal(kickoffGate(null, RUN).open, false);
});

function fullMatch() {
  const m = {
    id: 99, home: { n: "A", id: 1 }, away: { n: "B", id: 2 }, date: "2026-09-14 04:30", league: "Liga MX",
    data_quality_score: 75, conf: 6.4, no_signal: false, is_free: true, h2h: [], classement: null,
  };
  PREMIUM.PREMIUM_FIELDS.forEach(function (k) { if (!(k in m)) m[k] = "x"; });
  m.pari_rec = "Victoire Domicile"; m.cote_rec = "1.80"; m.model_probability = 64;
  return m;
}

test("closeMatchForPick : plus aucun pari ni champ premium, fiche d'information conservee, ligne premium videe", () => {
  const m = fullMatch();
  const row = { fixture_id: 99, pari_rec: "Victoire Domicile", cote_rec: 1.8, model_probability: 64, kelly: "2.1", edge: "+4%", verdict_shark: "t", facteur_x: "t", markets_compared: [{}], player_markets: [{}], raw_response: { verdict_shark: "t", explanation_status: "OK" } };
  closeMatchForPick(m, row, PREMIUM.PREMIUM_FIELDS, "KICKOFF_PASSED");
  PREMIUM.PREMIUM_FIELDS.filter(function (k) { return k !== "pari_rec"; }).forEach(function (k) { assert.ok(!(k in m), k); });
  assert.equal(m.pari_rec, "");
  assert.equal(m.no_signal, true);
  assert.equal(m.has_signal, false);
  assert.equal(m.is_free, false);
  assert.equal(m.no_signal_reason, "KICKOFF_PASSED");
  assert.ok(!("conf" in m), "conf (note sur 10, premium) retiree avec le pari, jamais reposee");
  assert.deepEqual([m.home.n, m.away.n, m.date, m.league], ["A", "B", "2026-09-14 04:30", "Liga MX"]);
  assert.equal(row.pari_rec, ""); assert.equal(row.cote_rec, null); assert.equal(row.model_probability, null);
  assert.equal(row.kelly, "0"); assert.equal(row.edge, ""); assert.equal(row.verdict_shark, ""); assert.equal(row.facteur_x, "");
  assert.equal(row.markets_compared, null); assert.equal(row.player_markets, null);
  assert.deepEqual(row.raw_response, { explanation_status: "SKIPPED_KICKOFF_PASSED" });
  // Publie tel quel dans data.json : aucune fuite premium, meme non offert.
  assert.deepEqual(PREMIUM.deepPremiumLeaks({ matchs: [PREMIUM.stripPremium(m)] }), []);
  assert.deepEqual(PREMIUM.deepPremiumLeaks({ matchs: [m] }).filter(function (p) { return !/\.pari_rec$/.test(p); }), []);
});

test("filterOpenCandidates : la selection canonique ne voit que les fixtures encore ouvertes", () => {
  const byId = {
    "10": apiFixture(10, "2026-09-14T02:00:00+00:00", "FT"),
    "11": apiFixture(11, new Date(RUN + 5 * MIN).toISOString(), "NS"),
    "12": apiFixture(12, "2026-09-14T19:00:00+00:00", "NS"),
  };
  const cands = [{ fixture_id: 10 }, { fixture_id: 11 }, { fixture_id: 12 }, { fixture_id: 13 }, { fixture: { fixture_id: 12 } }];
  const kept = filterOpenCandidates(cands, byId, RUN);
  assert.deepEqual(kept.map(function (c) { return c.fixture_id != null ? c.fixture_id : c.fixture.fixture_id; }), [12, 12]);
});

// --- Branchement dans le pipeline reel -------------------------------------
const source = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");

test("pipeline : garde evaluee par fixture AVANT la selection du pari, pari force a null si fermee", () => {
  assert.match(source, /require\('\.\/lib\/kickoff-guard\.js'\)/);
  const gate = source.indexOf("var kickoffGateFix=kickoffGate(fix,Date.now()");
  const pick = source.indexOf("var pickedMarket=pickMarketDeterministic(allMarkets,{minOdds:1.50})");
  const forceNull = source.indexOf("if(!kickoffGateFix.open){ pickedMarket=null; pickDowngrade=null; }");
  const matchObj = source.indexOf("var matchObj={");
  assert.ok(gate > 0 && pick > gate && forceNull > pick && matchObj > forceNull, "ordre garde -> selection -> forcage null -> matchObj");
  assert.match(source, /if\(kickoffGateFix\.open\) RUN_OUTPUT_CANDIDATES\.push\.apply\(RUN_OUTPUT_CANDIDATES, buildScoreCandidatesFromLegacyMatch\(/);
  assert.match(source, /skip_kickoff_closed:!kickoffGateFix\.open/);
  assert.match(source, /if\(d&&d\.skip_kickoff_closed\) return null;/);
  assert.match(source, /if\(!kickoffGateFix\.open\) closeMatchForPick\(matchObj,/);
});

test("pipeline : second passage juste avant la selection canonique, le match offert, data.json et l'historique", () => {
  const recheck = source.indexOf("var KICKOFF_CHECK_MS=Date.now();");
  const filet = source.indexOf("if(API_ERRORS.count>0){");
  const filter = source.indexOf("RUN_OUTPUT_CANDIDATES=filterOpenCandidates(RUN_OUTPUT_CANDIDATES,FIXTURE_BY_ID,KICKOFF_CHECK_MS");
  const runOutput = source.indexOf("var runOutput = runOutputForSnapshot(");
  const gratuit = source.indexOf("(function designerMatchGratuit(){");
  const publics = source.indexOf("var matchsPublics=allMatchsData.map(");
  const histo = source.indexOf("await updateHistorique(allMatchsData);");
  assert.ok(filet > 0 && recheck > filet, "apres le FILET (qui peut restaurer une analyse precedente)");
  assert.ok(filter > recheck && runOutput > filter && gratuit > runOutput && publics > gratuit && histo > publics);
  assert.match(source.slice(recheck, filter), /closeMatchForPick\(m, premiumRows\.find\(/);
  // Le match offert exige un pari : un match ferme (pari_rec vide) ne peut pas l'etre.
  assert.match(source, /var analysable=function\(m\)\{ return m && m\.pari_rec && !m\.no_signal; \};/);
});
