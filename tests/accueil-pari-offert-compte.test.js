"use strict";
// Accueil, carte « Le pari offert du jour » (panne du 26/10/2026) : connecte en Pro, Clement voyait « Le pari
// arrive… » sur PSG - Lyon. La carte appelait toujours match-data SANS compte, et depuis le 25/10 cette reponse n'a
// plus de pari. On execute ici le vrai code de la carte (extrait de index.html et des pages generees) :
//  - compte connecte avec le pari dans sa liste : pari, cote et chance affiches, aucun appel reseau ;
//  - compte connecte sans pari dans la liste : renvoi vers la page du match (jamais « ton compte gratuit ») ;
//  - sans compte : message du compte gratuit tout de suite, jamais « Le pari arrive… », aucun appel reseau.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const PAGES = ["index.html", "fr/index.html", "en/index.html", "gb/index.html", "es/index.html", "mx/index.html", "za/index.html"];

function charger(page, authCtx) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const debut = html.indexOf("var PARI_HERO=");
  const fin = html.indexOf("function renderMatchs(){");
  assert.ok(debut > 0 && fin > debut, page + " : code de la carte trouve");
  const appels = [];
  const ctx = {
    authCtx,
    esc: (s) => String(s),
    t: (_k, d) => d,
    tf: (_k, d, v) => d.replace(/\{(\w+)\}/g, (_m, n) => String(v[n])),
    translateMarket: (x) => (x === "Victoire Domicile" ? "Victoire PSG" : x),
    localeTag: () => "fr-FR",
    leagueHeader: () => "Ligue 1",
    dayLabel: () => "Aujourd'hui",
    heureLocale: () => "20:30",
    lienMatch: (m) => "/fr/match.html?id=" + m.id,
    fetch: (...a) => { appels.push(a); return new Promise(() => {}); },
    Number, String, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(debut, fin), ctx);
  return { ctx, appels };
}

const PSG = { id: 1552800, home: { n: "Paris Saint Germain", id: 85 }, away: { n: "Lyon", id: 80 } };

for (const page of PAGES) {
  test(page + " : compte connecte = pari, cote et chance de sa liste, sans appel reseau", () => {
    const { ctx, appels } = charger(page, { session: { access_token: "x" }, isPro: true });
    const el = { innerHTML: "", hidden: true };
    ctx.montrerPariHero(el, Object.assign({ pari_rec: "Victoire Domicile", cote_rec: 1.41, model_probability: 66 }, PSG));
    assert.match(el.innerHTML, /Victoire PSG/);
    assert.match(el.innerHTML, /1,41/);
    assert.match(el.innerHTML, /66 %/);
    assert.doesNotMatch(el.innerHTML, /arrive/);
    assert.equal(appels.length, 0);
  });

  test(page + " : connecte sans pari dans la liste = page du match ; sans compte = compte gratuit, jamais « arrive »", () => {
    const connecte = charger(page, { session: { access_token: "x" }, isPro: false });
    const el = { innerHTML: "", hidden: true };
    connecte.ctx.montrerPariHero(el, Object.assign({}, PSG));
    assert.match(el.innerHTML, /page du match/);
    assert.doesNotMatch(el.innerHTML, /compte gratuit|arrive/);
    const anonyme = charger(page, { session: null, isPro: false });
    const el2 = { innerHTML: "", hidden: true };
    anonyme.ctx.montrerPariHero(el2, Object.assign({ pari_rec: "Victoire Domicile", cote_rec: 1.41, model_probability: 66 }, PSG));
    assert.match(el2.innerHTML, /compte gratuit/);
    assert.doesNotMatch(el2.innerHTML, /arrive|Victoire PSG|1,41/);
    assert.equal(connecte.appels.length + anonyme.appels.length, 0);
  });
}
