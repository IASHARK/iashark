"use strict";
// REPLI COTES SELECTIONS (03/10/2026) : lib/cotes-selections-repli.js + lib/odds-api-econome.js#cotes1N2Region.
const test = require("node:test");
const assert = require("node:assert");
const R = require("../lib/cotes-selections-repli.js");
const ECO = require("../lib/odds-api-econome.js");
const QUOTAS = require("../lib/quotas.js");
const LIGUES = require("../config/leagues.json");

const MAINTENANT = "2026-10-03T08:00:00Z";
const KO = Date.parse("2026-10-03T18:45:00Z");
const VIDE = { c1: "--", cn: "--", c2: "--", dc1x: "--", co25: "--", raw_offers: [], market_consensus: {} };

function bk(key, home, away, p1, pn, p2, maj) {
  return { key, title: key, last_update: maj || "2026-10-03T07:55:00Z",
    markets: [{ key: "h2h", outcomes: [{ name: home, price: p1 }, { name: "Draw", price: pn }, { name: away, price: p2 }] }] };
}
function evenement(id, home, away, quand, books) { return { id, sport_key: "soccer_uefa_nations_league", commence_time: quand, home_team: home, away_team: away, bookmakers: books }; }
const EVS = [
  evenement("e1", "North Macedonia", "Czechia", "2026-10-03T18:45:00Z", [
    bk("pinnacle", "North Macedonia", "Czechia", 4.1, 3.4, 1.95), bk("unibet_eu", "North Macedonia", "Czechia", 4.0, 3.3, 1.9), bk("betclic", "North Macedonia", "Czechia", 4.2, 3.35, 1.92)]),
  evenement("e2", "Ireland", "Portugal", "2026-10-03T18:45:00Z", [
    bk("pinnacle", "Ireland", "Portugal", 5.5, 4.0, 1.6), bk("unibet_eu", "Ireland", "Portugal", 5.2, 3.9, 1.62)]),
];

test("noms : variantes d'une meme selection rapprochees, selections differentes jamais confondues", () => {
  assert.ok(R.memeEquipe("FYR Macedonia", "North Macedonia"));
  assert.ok(R.memeEquipe("Czech Republic", "Czechia"));
  assert.ok(R.memeEquipe("Bosnia & Herzegovina", "Bosnia and Herzegovina"));
  assert.ok(R.memeEquipe("Türkiye", "Turkey"));
  assert.ok(R.memeEquipe("Republic of Ireland", "Ireland"));
  assert.ok(!R.memeEquipe("Ireland", "Northern Ireland"));
  assert.ok(!R.memeEquipe("Georgia", "Germany"));
  assert.ok(!R.memeEquipe("", ""));
});

test("rapprochement : equipes ET date (3 h), ordre inverse tolere, ambiguite = aucun", () => {
  assert.strictEqual(R.rapprocherEvenement(EVS, "FYR Macedonia", "Czech Republic", KO).id, "e1");
  assert.strictEqual(R.rapprocherEvenement(EVS, "Czech Republic", "FYR Macedonia", KO).id, "e1");
  assert.strictEqual(R.rapprocherEvenement(EVS, "FYR Macedonia", "Czech Republic", KO + 4 * 3600e3), null);
  assert.strictEqual(R.rapprocherEvenement(EVS, "Northern Ireland", "Portugal", KO), null);
  assert.strictEqual(R.rapprocherEvenement(EVS.concat([Object.assign({}, EVS[0], { id: "e1bis" })]), "FYR Macedonia", "Czech Republic", KO), null);
});

test("cotes rattachees par NOM : domicile API-Football = c1 meme si The Odds API inverse l'ordre", () => {
  const brut = R.versFormatApiFootball(EVS[0], "Czech Republic", "FYR Macedonia", MAINTENANT);
  const v = brut.bookmakers[0].bets[0].values;
  assert.strictEqual(v.find((x) => x.value === "Home").odd, "1.95");
  assert.strictEqual(v.find((x) => x.value === "Away").odd, "4.1");
});

test("zero donnee du futur : match commence ou cote posterieure au releve rejetes", () => {
  assert.strictEqual(R.versFormatApiFootball(EVS[0], "FYR Macedonia", "Czech Republic", "2026-10-03T19:00:00Z"), null);
  const futur = evenement("e3", "North Macedonia", "Czechia", "2026-10-03T18:45:00Z", [
    bk("pinnacle", "North Macedonia", "Czechia", 4.1, 3.4, 1.95, "2026-10-03T09:00:00Z"), bk("betclic", "North Macedonia", "Czechia", 4.2, 3.35, 1.92)]);
  const brut = R.versFormatApiFootball(futur, "FYR Macedonia", "Czech Republic", MAINTENANT);
  assert.deepStrictEqual(brut.bookmakers.map((b) => b.id), ["oddsapi:betclic"]);
  assert.strictEqual(brut.captured_at, MAINTENANT);
});

function faux(evs, compteur, utilises) {
  return async (url) => {
    const u = new URL(url);
    if (/\/odds$/.test(u.pathname)) compteur.payants.push(u.searchParams);
    else compteur.gratuits++;
    return { ok: true, status: 200, headers: { "x-requests-used": String(utilises || 60), "x-requests-remaining": String(20000 - (utilises || 60)), "x-requests-last": /\/odds$/.test(u.pathname) ? "1" : "0" }, json: async () => evs };
  };
}
function client(etat, compteur, utilises) {
  return ECO.creerClientOddsApi({ cle: "test", etat, maintenant: MAINTENANT, fetchBrut: faux(EVS, compteur, utilises) });
}
const base = { leagueKey: "nations_league", configLigues: LIGUES, sport: "soccer_uefa_nations_league", coupEnvoiMs: KO, maintenant: MAINTENANT };

test("aucun appel si les cotes 1N2 existent deja ou si la competition n'est pas une selection retenue", async () => {
  const c = { gratuits: 0, payants: [] };
  const cl = client(QUOTAS.etatVide(), c);
  const deja = Object.assign({}, VIDE, { c1: "2.10", cn: "3.30", c2: "3.60" });
  assert.strictEqual(await R.completer(Object.assign({}, base, { odds: deja, home: "FYR Macedonia", away: "Czech Republic", client: cl })), null);
  assert.strictEqual(await R.completer(Object.assign({}, base, { leagueKey: "friendlies", odds: VIDE, home: "FYR Macedonia", away: "Czech Republic", client: cl })), null);
  assert.strictEqual(c.gratuits + c.payants.length, 0);
});

test("repli : 1 seul appel payant (eu, h2h) par competition, cotes = mediane via parseOdds, horodatees", async () => {
  const c = { gratuits: 0, payants: [] };
  const cl = client(QUOTAS.etatVide(), c);
  const a = await R.completer(Object.assign({}, base, { odds: VIDE, home: "FYR Macedonia", away: "Czech Republic", client: cl }));
  const b = await R.completer(Object.assign({}, base, { odds: VIDE, home: "Republic of Ireland", away: "Portugal", client: cl }));
  assert.strictEqual(c.payants.length, 1);
  assert.strictEqual(c.payants[0].get("regions"), "eu");
  assert.strictEqual(c.payants[0].get("markets"), "h2h");
  assert.deepStrictEqual([a.odds.c1, a.odds.cn, a.odds.c2], ["4.10", "3.35", "1.92"]);
  assert.strictEqual(a.odds.source_1n2, "the-odds-api");
  assert.strictEqual(a.odds.releve_le_1n2, new Date(MAINTENANT).toISOString());
  assert.strictEqual(a.odds.dc1x, "--"); // double chance jamais deduite du 1N2
  assert.ok(a.odds.raw_offers.every((o) => o.captured_at === a.odds.releve_le_1n2));
  assert.deepStrictEqual([b.odds.c1, b.odds.c2], ["5.35", "1.61"]);
});

test("quota The Odds API respecte : plafond du jour atteint = aucun appel payant, aucune cote", async () => {
  const c = { gratuits: 0, payants: [] };
  const etat = QUOTAS.etatVide();
  etat.odds_api = { mois: "2026-10", jour: "2026-10-03", debut_jour: 0, utilises_mois: 600, restants_mois: 19400, utilises_jour: 600 };
  const cl = client(etat, c, 600);
  const r = await R.completer(Object.assign({}, base, { odds: VIDE, home: "FYR Macedonia", away: "Czech Republic", client: cl }));
  assert.strictEqual(c.payants.length, 0);
  assert.strictEqual(r.odds, null);
  assert.strictEqual(cl.rapport.refuses_plafond, 1);
});
