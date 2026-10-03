"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { oddsSportKeyFor, usesApiFootballPinnacleFallback, pinnacleOddsFromApiFootball } = require("../lib/pinnacle-odds.js");

const root = path.join(__dirname, "..");
const LEAGUES = JSON.parse(fs.readFileSync(path.join(root, "config/leagues.json"), "utf8"));

// Verifie le 2026-09-13 contre le catalogue officiel The Odds API (section
// Soccer) : 'soccer_mexico_ligamx' existe, aucune cle sud-africaine.
test("mapping cotes : Liga MX -> soccer_mexico_ligamx, PSL sans sport key (jamais invente)", () => {
  assert.equal(oddsSportKeyFor(LEAGUES, "liga_mx"), "soccer_mexico_ligamx");
  assert.equal(oddsSportKeyFor(LEAGUES, "south_africa_premiership"), null);
  assert.equal(oddsSportKeyFor(LEAGUES, "premier"), "soccer_epl");
});

test("mapping cotes : ligue sans cle ou inconnue -> null, JAMAIS la Champions League", () => {
  assert.equal(oddsSportKeyFor(LEAGUES, "other"), null);
  assert.equal(oddsSportKeyFor(LEAGUES, undefined), null);
  assert.equal(oddsSportKeyFor(null, "liga_mx"), null);
  assert.equal(oddsSportKeyFor({ leagues: [{ key: "x" }] }, "x"), null);
});

// 2026-09-14 : ouverture LATAM. Catalogue public The Odds API : Argentine et
// Chili ont une cle, Colombie et Perou aucune. Pinnacle present sur
// api-football /odds?league=128|239|281|265&season=2026 pour les 4.
test("mapping cotes LATAM : Argentine/Chili avec cle verifiee, Colombie/Perou sans cle (jamais inventee)", () => {
  assert.equal(oddsSportKeyFor(LEAGUES, "argentina_liga_profesional"), "soccer_argentina_primera_division");
  assert.equal(oddsSportKeyFor(LEAGUES, "chile_primera"), "soccer_chile_campeonato");
  assert.equal(oddsSportKeyFor(LEAGUES, "colombia_primera_a"), null);
  assert.equal(oddsSportKeyFor(LEAGUES, "peru_primera"), null);
});

test("repli api-football Pinnacle : active uniquement pour Liga MX, PSL et les 4 ligues LATAM", () => {
  assert.equal(usesApiFootballPinnacleFallback(LEAGUES, "liga_mx"), true);
  assert.equal(usesApiFootballPinnacleFallback(LEAGUES, "south_africa_premiership"), true);
  const autres = LEAGUES.leagues.filter((l) => l.apiFootballPinnacleFallback === true).map((l) => l.key).sort();
  assert.deepEqual(autres, ["argentina_liga_profesional", "chile_primera", "colombia_primera_a", "liga_mx", "peru_primera", "south_africa_premiership"]);
  assert.equal(usesApiFootballPinnacleFallback(LEAGUES, "premier"), false);
});

test("getPinnacleOdds du pipeline : plus de repli vers soccer_uefa_champs_league", () => {
  const wf = fs.readFileSync(path.join(root, ".github/workflows/update-data.yml"), "utf8");
  assert.doesNotMatch(wf, /sportMap\[leagueKey\]\|\|'soccer_uefa_champs_league'/);
  assert.match(wf, /var sport=oddsSportKeyFor\(LEAGUES_CONFIG,leagueKey\);\s*if\(!sport\) return null;/);
  assert.match(wf, /pinnacleOddsFromApiFootball\(oddsRaw\)/);
});

// Forme reelle d'une reponse api-football /odds (element de response[]).
const bk = (id, name, bets) => ({ id, name, bets });
const oddsRaw = {
  fixture: { id: 1550964 },
  bookmakers: [
    bk(8, "Bet365", [{ name: "Match Winner", values: [{ value: "Home", odd: "2.10" }, { value: "Draw", odd: "3.30" }, { value: "Away", odd: "3.40" }] }]),
    bk(4, "Pinnacle", [
      { name: "Match Winner", values: [{ value: "Home", odd: "2.05" }, { value: "Draw", odd: "3.45" }, { value: "Away", odd: "3.60" }] },
      { name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.88" }, { value: "Under 2.5", odd: "1.98" }, { value: "Over 1.5", odd: "1.30" }] },
      { name: "Both Teams Score", values: [{ value: "Yes", odd: "1.80" }, { value: "No", odd: "1.95" }] },
    ]),
  ],
};

test("pinnacleOddsFromApiFootball : lit UNIQUEMENT Pinnacle, forme identique a getPinnacleOdds", () => {
  assert.deepEqual(pinnacleOddsFromApiFootball(oddsRaw), {
    c1: 2.05, cn: 3.45, c2: 3.6, over25: 1.88, under25: 1.98, bttsY: 1.8, bttsN: 1.95, source: "api-football",
  });
});

test("pinnacleOddsFromApiFootball : Pinnacle absent ou reponse vide -> null (jamais un autre bookmaker)", () => {
  assert.equal(pinnacleOddsFromApiFootball({ bookmakers: [oddsRaw.bookmakers[0]] }), null);
  assert.equal(pinnacleOddsFromApiFootball(null), null);
  assert.equal(pinnacleOddsFromApiFootball({}), null);
  assert.equal(pinnacleOddsFromApiFootball({ bookmakers: [bk(4, "Pinnacle", [])] }), null);
});
