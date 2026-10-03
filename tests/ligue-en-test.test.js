"use strict";
// « FIABILITE : EN TEST » (30/09/2026). Une competition que le mathematicien n'a
// pas validee (config/leagues.json#fiabilite) : le libelle « Fiabilité : en test »,
// aucune frequence « Sur 100 matchs », aucun ecart face a la cote (ni favorable, ni
// defavorable, ni « même chose »), absente du detecteur d'ecarts, jamais dans le VIP.
// Le pipeline pose le champ public league_reliability (lib/league-scope.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmLib = require("node:vm");
const ROOT = path.join(__dirname, "..");

function pageMatch() {
  const src = fs.readFileSync(path.join(ROOT, "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  assert.ok(i > 0);
  const code = src.slice(0, i) + "window.__MP={signalCard,marketsCard,viewModel,hero};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { IasharkMatchViewModel: require("../lib/match-view-model.js"), location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: win.IasharkMatchViewModel, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el },
    console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {} };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  return win.__MP;
}
const MP = pageMatch();
const texte = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").replace(/\s+/g, " ");
const VERIFIE = "vérifié sur le passé";

// Match Championship calcule « modèle + cotes » avec un pari v3 calibre : SANS la
// regle, il afficherait « Sur 100 matchs » et « +8 points ».
const base = {
  id: 4242, league: "Championship", league_key: "championship", league_id: 40, home: { id: 10, n: "Leeds" }, away: { id: 11, n: "Hull" }, date: "2026-10-03 21:00", status: "NS",
  pari_rec: "Victoire Domicile", market_id: "home-win", model_probability: 70, cote_rec: "1.50", model_output_available: true, data_quality_score: 80,
  markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 70, consensus: 62, edge: 8 }, { id: "over-25", market: "Over 2.5", probability: 50, consensus: 55, edge: -5 }, { id: "btts-yes", market: "BTTS Oui", probability: 52, consensus: 52, edge: 0 }],
  v3_pari: { market_id: "home-win", probabilite: 70, etiquette: VERIFIE, fiabilite_marche: VERIFIE },
  moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes", couverture: "vérifiée", fiabilite_niveau: VERIFIE },
  reliability: { label: "Élevée" }, p1: 70, pn: 18, p2: 12, c1: 1.5, cn: 4.2, c2: 6.5, analysis_tier: "FULL_ANALYSIS",
};
// Une seule source (01/10/2026) : la chance du pari posee par le pipeline (le plus bas des deux : 62 %).
require("../lib/chance-iashark.js").poserChance(base);
const enTest = Object.assign({}, base, { league_reliability: "en_test" });
const INTERDIT = /Sur 100 matchs|voit plus de chances|voit moins de chances|disent la même chose|\+\s*\d+\s*points?|−\s*\d+\s*points?|Écart favorable|Fiabilité élevée/;

test("temoin : la meme competition validee garde la phrase et l'ecart", () => {
  const vm = MP.viewModel(Object.assign({}, base, { league_reliability: "validee" }));
  assert.equal(vm.model.leagueInTest, false);
  assert.match(texte(MP.signalCard(vm)), /Sur 100 matchs/);
  // Chance du pari = le plus bas des deux (62 %) : « même chose » pour le pari ; l'ecart reste dit
  // sur les autres marches du tableau (« plus de 2,5 buts » : −5 points).
  assert.match(texte(MP.signalCard(vm)), /disent la même chose/);
  assert.match(texte(MP.marketsCard(vm)), /−5 points/);
});

test("competition en test : libelle « Fiabilité : en test », ni frequence ni ecart, dans aucun sens", () => {
  const vm = MP.viewModel(enTest);
  assert.equal(vm.model.leagueInTest, true);
  assert.equal(vm.model.frequencyCalibrated, false);
  assert.equal(vm.model.positiveGapHidden, true);
  assert.equal(vm.model.recommendedEdge, null);
  const avis = texte(MP.signalCard(vm)), marches = texte(MP.marketsCard(vm)), tete = texte(MP.hero(vm));
  assert.ok(vm.model.recommendation, "le pari (s'il existe) reste affiche");
  assert.match(avis, /Fiabilité : en test/);
  assert.match(tete, /Fiabilité : en test/);
  assert.doesNotMatch(avis, INTERDIT);
  assert.doesNotMatch(marches, INTERDIT);
  assert.match(avis + marches, /Fiabilité en test : écart non affiché\./);
  // Les deux chiffres restent visibles, sans comparaison (la chance du pari : 62 %).
  assert.match(avis, /Notre estimation 62\s?%/);
});

test("detecteur d'ecarts (Pro) : aucune ligne d'une competition en test", () => {
  const D = require("../lib/tools-domain.js");
  assert.ok(D.scanValue([base], { minEdge: -100 }).length > 0, "temoin : le match valide apparait");
  assert.equal(D.scanValue([enTest], { minEdge: -100 }).length, 0);
});

test("pipeline : champ league_reliability pose depuis la config, extension plafonnee et limitee dans le temps", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  assert.match(yml, /league_reliability:LEAGUE_SCOPE\.reliabilityFor\(LEAGUES_CONFIG, lg\.id\)/);
  assert.match(yml, /LEAGUE_SCOPE\.planFixtures\(LEAGUES_CONFIG, uniqueFixtures/);
  assert.match(yml, /LEAGUE_SCOPE\.extensionTimeUp\(LEAGUES_CONFIG, PIPELINE_START_MS, Date\.now\(\)\)/);
  // Le champ est public (pas un champ premium retire des fichiers publics).
  const PREMIUM = require("../lib/premium-fields.js");
  const liste = JSON.stringify(PREMIUM);
  assert.doesNotMatch(liste, /league_reliability/);
});

test("page championnat : phrase « en test » pour une competition non validee, rien pour une validee", () => {
  const P = require("../scripts/seo-pages.js");
  const now = new Date("2026-09-30T08:00:00Z");
  const t = P.renderLeagueHub("championship", "fr", [], { now }).html;
  const para = ((t.match(/<p class="intro hub-in-test">([^<]*)<\/p>/) || [])[1] || "").replace(/&#39;/g, "'");
  assert.match(para, /^Fiabilité : en test\./);
  assert.doesNotMatch(para, /\d/, "aucun chiffre");
  assert.doesNotMatch(t, /\+\d+ points?|Sur 100/, "aucun ecart ni frequence");
  const v = P.renderLeagueHub("premier", "fr", [], { now }).html;
  assert.doesNotMatch(v, /Fiabilité : en test/);
  // Priorite au francais : versions etrangeres des nouvelles competitions hors perimetre (noindex, hors plan du site).
  assert.equal(P.renderLeagueHub("championship", "gb", [], { now }).indexable, false);
  assert.match(P.renderLeagueHub("championship", "gb", [], { now }).html, /<meta name="robots" content="noindex,follow">/);
  // copa_del_rey : competition retiree du site le 03/10/2026, plus de page championnat.
});

test("collecte des cotes proches du coup d'envoi : le socle passe avant l'extension (plafond 50)", () => {
  const { orderForBudget } = require("../scripts/collect-near-kickoff-odds.js");
  const out = orderForBudget([{ fixture_id: 1, league_id: 40 }, { fixture_id: 2, league_id: 39 }, { fixture_id: 3, league_id: 41 }, { fixture_id: 4, league_id: 61 }]);
  assert.deepEqual(out.map((r) => r.fixture_id), [2, 4, 1, 3]);
});
