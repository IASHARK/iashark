"use strict";
// UNE SEULE COTE (decision de Clement, 01/10/2026) : lib/cote-anj.js.
// La cote du pari est la meilleure chez les bookmakers agrees ANJ suivis (The Odds API, cles *_fr),
// avec le nom du bookmaker ; sans cote ANJ, la cote du pipeline marquee « indicative », sans nom.
// Releve FICTIF (forme reelle d'une reponse The Odds API region fr, 01/10/2026 ; chiffres inventes).
const test = require("node:test");
const assert = require("node:assert/strict");
const COTE = require("../lib/cote-anj.js");
const CHANCE = require("../lib/chance-iashark.js");
const { shinProbabilities } = require("../lib/models.js");

const KO = "2026-10-10T15:15:00Z";
const bk = (key, title, h2h, totals) => ({ key, title, markets: [{ key: "h2h", outcomes: [{ name: "Le Havre", price: h2h[2] }, { name: "Lille", price: h2h[0] }, { name: "Draw", price: h2h[1] }] }]
  .concat(totals ? [{ key: "totals", outcomes: [{ name: "Over", price: totals[0], point: 2.5 }, { name: "Under", price: totals[1], point: 2.5 }] }] : []) });
const EV = { id: "ev1", sport_key: "soccer_france_ligue_one", commence_time: KO, home_team: "Lille", away_team: "Le Havre", bookmakers: [
  bk("pinnacle", "Pinnacle", [1.47, 4.6, 6.9], [1.72, 2.15]),
  bk("winamax_fr", "Winamax (FR)", [1.42, 4.4, 6.0]),
  bk("unibet_fr", "Unibet (FR)", [1.41, 4.3, 6.0]),
  bk("betclic_fr", "Betclic (FR)", [1.42, 4.35, 6.1]),
  bk("pmu_fr", "PMU (FR)", [1.4, 4.2, 6.4], [1.64, 1.94]),
  bk("netbet_fr", "NetBet", [1.36, 4.2, 6.2], [1.58, 1.91]),
  bk("winamax", "Winamax (hors France)", [1.9, 4.0, 5.0]),
] };

test("1. la liste relevee est celle du Canal Pro : Pinnacle + les 5 agrees ANJ suivis", async () => {
  const C = await import("../supabase/functions/_shared/canal-pro.mjs");
  const S = await import("../scripts/canal-pro/lib/sources.mjs");
  assert.deepEqual(COTE.BOOKMAKERS_SUIVIS.slice().sort(), C.bookmakersSuivis("FR").slice().sort());
  // Le robot releve aussi les flux des operateurs DGOJ (Espagne, 02/10/2026) ; la page match reste francaise.
  assert.deepEqual(COTE.BOOKMAKERS_RELEVES.split(",").sort(), S.BOOKMAKERS_RELEVES.split(",").filter((b) => b === "pinnacle" || b.endsWith("_fr")).sort());
  assert.ok(COTE.BOOKMAKERS_RELEVES.split(",").length <= 10, "10 bookmakers au plus = le prix d'une seule region");
  // Une version hors France d'un operateur n'est jamais agreee.
  assert.equal(COTE.cleSuivie("winamax"), null);
  assert.equal(COTE.cleSuivie("winamax_fr"), "winamax");
  assert.equal(COTE.cleSuivie("pinnacle"), null);
});

test("2. meme cote et meme bookmaker que le Canal Pro pour le meme releve", async () => {
  const C = await import("../supabase/functions/_shared/canal-pro.mjs");
  const booksCanal = C.booksDepuisOddsApi(EV);
  for (const [site, canal] of [["home-win", "1"], ["draw", "N"], ["away-win", "2"], ["over-25", "O25"], ["under-25", "U25"]]) {
    const brutes = C.cotesExecutables(booksCanal, canal, null);
    const agrees = Object.fromEntries(Object.entries(C.cotesAgreees(brutes, "FR")).filter(([b]) => C.bookmakersSuivis("FR").includes(b)));
    const attendu = C.meilleure(agrees);
    const c = COTE.coteDuPari(COTE.booksDepuisEvenement(EV), site);
    assert.equal(c.cote, attendu.cote, site);
    assert.equal(c.bookmaker, attendu.bookmaker, site);
    assert.equal(c.bookmaker_nom, C.nomBookmaker(attendu.bookmaker, "FR"));
  }
  // Pinnacle (1,47) et le Winamax hors France (1,90) ne sont jamais la cote affichee.
  assert.deepEqual(COTE.coteDuPari(COTE.booksDepuisEvenement(EV), "home-win"), { cote: 1.42, bookmaker: "winamax", bookmaker_nom: "Winamax", sans_marge: COTE.sansMargeAnj(COTE.booksDepuisEvenement(EV))["home-win"] });
});

test("3. cote sans marge : 1N2 par Shin sur la mediane des agrees, double chance = somme, plus/moins proportionnel", () => {
  const books = COTE.booksDepuisEvenement(EV);
  const sm = COTE.sansMargeAnj(books);
  const med = [1.41, 4.3, 6.1]; // medianes des 5 agrees (Pinnacle et hors France exclus)
  const p = shinProbabilities(med).map((x) => x * 100);
  assert.equal(sm["home-win"], Math.round(p[0] * 10) / 10);
  assert.equal(sm["dc-1x"], Math.round((p[0] + p[1]) * 10) / 10);
  const inv = [1 / 1.61, 1 / 1.925]; // mediane over (1,64 ; 1,58) et under (1,94 ; 1,91) : PMU + NetBet
  assert.equal(sm["over-25"], Math.round(inv[0] / (inv[0] + inv[1]) * 1000) / 10);
  assert.ok(Math.abs(sm["home-win"] + sm.draw + sm["away-win"] - 100) < 0.2);
});

test("4. pose sur le match : un seul champ cote (cote_rec) + le bookmaker ; la chance suit la meme source", () => {
  const m = { id: 1, market_id: "home-win", pari_rec: "Victoire Domicile", cote_rec: "1.45", model_probability: 70, markets_compared: [{ id: "home-win", consensus: 66.6 }] };
  const row = { fixture_id: 1, cote_rec: 1.45 };
  assert.equal(COTE.poserCoteAnj(m, row, COTE.booksDepuisEvenement(EV), "2026-10-09T06:00:00.000Z"), true);
  assert.equal(m.cote_rec, "1.42");
  assert.equal(row.cote_rec, 1.42, "ligne premium : la meme cote");
  assert.equal(m.cote_bookmaker, "Winamax");
  assert.equal(m.cote_source, "anj");
  // chance = le plus bas entre le modele et la cote sans marge ANJ (plus celle d'API-Football).
  CHANCE.poserChance(m);
  assert.equal(m.chance_iashark, Math.round(Math.min(70, m.sans_marge_anj["home-win"])));
  assert.equal(m.model_probability, 70, "aucune probabilite du moteur modifiee");
  assert.deepEqual(COTE.coteAffichee(m), { cote: 1.42, bookmaker: "Winamax", indicative: false });
});

test("5. repli : pas de cote ANJ -> cote du pipeline, « indicative », jamais un nom de bookmaker", () => {
  // Marche que les agrees ne proposent pas sur The Odds API (tirs) : indicatif.
  const m = { id: 2, market_id: "total-shots-over-24_5", cote_rec: "1.80", pari_rec: "Tirs", model_probability: 60 };
  assert.equal(COTE.poserCoteAnj(m, null, COTE.booksDepuisEvenement(EV), null), false);
  COTE.marquerIndicative(m);
  assert.equal(m.cote_rec, "1.80");
  assert.deepEqual(COTE.coteAffichee(m), { cote: 1.8, bookmaker: null, indicative: true });
  // Plus/moins 2,5 chez un seul agree ? oui (PMU, NetBet) ; les deux marquent sans appel par match : non.
  assert.equal(COTE.coteDuPari(COTE.booksDepuisEvenement(EV), "btts-yes"), null);
});

test("6. releve du pipeline : 1 appel par championnat (+1 par double chance), panne = indicatif, cle jamais ecrite", async () => {
  const urls = [];
  const cle = "CLE-SECRETE-123456";
  const fetchJson = async (url) => {
    urls.push(url);
    if (url.includes("/events/")) return { id: "ev1", home_team: "Lille", away_team: "Le Havre", bookmakers: [{ key: "betclic_fr", title: "Betclic (FR)", markets: [{ key: "double_chance", outcomes: [{ name: "Lille/Draw", price: 1.12 }, { name: "Lille/Le Havre", price: 1.2 }, { name: "Draw/Le Havre", price: 2.5 }] }] }] };
    if (url.includes("soccer_france_ligue_one")) return [EV];
    throw new Error("HTTP 500");
  };
  const ko = Date.parse(KO);
  const m1 = { id: 1, market_id: "home-win", cote_rec: "1.45", home: { n: "Lille OSC" }, away: { n: "Le Havre" } };
  const m2 = { id: 2, market_id: "dc-1x", cote_rec: "1.10", home: { n: "Lille" }, away: { n: "Le Havre AC" } };
  const m3 = { id: 3, market_id: "home-win", cote_rec: "1.90", home: { n: "Hertha" }, away: { n: "Kiel" } };
  const m4 = { id: 4, market_id: "home-win", cote_rec: "2.10", home: { n: "Club A" }, away: { n: "Club B" } };
  const logs = [];
  const r = await COTE.poserCotesAnj([
    { m: m1, sport: "soccer_france_ligue_one", koMs: ko }, { m: m2, sport: "soccer_france_ligue_one", koMs: ko },
    { m: m3, sport: "soccer_germany_bundesliga2", koMs: ko }, { m: m4, sport: null, koMs: ko },
  ], { cle, fetchJson, maintenant: "2026-10-09T06:00:00Z", log: (x) => logs.push(x) });
  assert.equal(r.anj, 2);
  assert.equal(r.indicatives, 2);
  assert.equal(r.appels, 3, "Ligue 1 + Bundesliga 2 + 1 double chance");
  assert.equal(urls.filter((u) => u.includes("/odds?") && !u.includes("/events/")).length, 2, "1 appel par championnat");
  assert.ok(urls.every((u) => u.includes("bookmakers=" + encodeURIComponent(COTE.BOOKMAKERS_RELEVES)) && !u.includes("regions=")));
  assert.ok(urls.some((u) => u.includes("markets=h2h%2Ctotals")));
  assert.ok(urls.some((u) => u.includes("/events/ev1/odds") && u.includes("markets=double_chance")));
  assert.deepEqual([m1.cote_rec, m1.cote_bookmaker, m2.cote_rec, m2.cote_bookmaker], ["1.42", "Winamax", "1.12", "Betclic"]);
  assert.deepEqual([m3.cote_source, m3.cote_bookmaker, m3.cote_rec, m4.cote_source], ["indicative", null, "1.90", "indicative"]);
  assert.ok(!JSON.stringify(r).includes(cle) && !logs.join(" ").includes(cle), "la cle n'apparait jamais");
  // Sans cle : tout reste indicatif, aucun appel.
  const m5 = { id: 5, market_id: "home-win", cote_rec: "1.50", home: { n: "Lille" }, away: { n: "Le Havre" } };
  const r2 = await COTE.poserCotesAnj([{ m: m5, sport: "soccer_france_ligue_one", koMs: ko }], { cle: null, fetchJson });
  assert.equal(r2.appels, 0);
  assert.equal(m5.cote_source, "indicative");
});

test("7. correspondance des matchs : memes equipes, coup d'envoi a 3 h pres, jamais devinee", () => {
  const evs = [EV, Object.assign({}, EV, { id: "ev2", commence_time: "2026-10-17T15:15:00Z" })];
  assert.equal(COTE.trouverEvenement(evs, "Lille", "Le Havre", Date.parse(KO)).id, "ev1");
  assert.equal(COTE.trouverEvenement(evs, "Lille", "Le Havre", Date.parse("2026-10-12T15:15:00Z")), null);
  assert.equal(COTE.trouverEvenement(evs, "Lens", "Le Havre", Date.parse(KO)), null);
  assert.equal(COTE.trouverEvenement([EV, Object.assign({}, EV, { id: "doublon" })], "Lille", "Le Havre", Date.parse(KO)), null, "ambigu : rien");
});
