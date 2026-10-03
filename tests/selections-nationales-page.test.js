"use strict";
// Matchs de selections nationales sur la page match (decision de Clement du
// 30/09/2026) : « Fiabilité : en test », seulement le 1N2 et la double chance (ni
// plus/moins de buts, ni « les deux marquent »), jamais « Sur 100 matchs », aucun
// niveau de fiabilite « vérifié ». Les probabilites ne changent pas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmLib = require("node:vm");
const VM = require("../lib/match-view-model.js");
const SEL = require("../lib/selections-nationales.js");
const VERIFIE = "vérifié sur le passé";

const nations = {
  id: 1528898, league: "UEFA Nations League", league_id: 5, home: { id: 775, n: "Austria" }, away: { id: 1111, n: "Kosovo" }, date: "2026-10-10 20:45", status: "NS",
  pari_rec: "Over 1.5", market_id: "over-15", model_probability: 74, cote_rec: "1.30", model_output_available: true, data_quality_score: 80,
  p1: 61, pn: 22, p2: 17, po25: 51, btts: 44, reliability: { label: "Élevée", model_agreement: "Fort", data_quality: "Élevée", sample_size: 20 },
  markets_compared: [
    { id: "home-win", market: "Victoire Domicile", probability: 61, consensus: 62, edge: -1 },
    { id: "dc-1x", market: "DC 1X", probability: 83, consensus: 84, edge: -1 },
    { id: "over-15", market: "Over 1.5", probability: 74, consensus: 75, edge: -1 },
    { id: "over-25", market: "Over 2.5", probability: 51, consensus: 50, edge: 1 },
    { id: "btts-yes", market: "BTTS Oui", probability: 44, consensus: 46, edge: -2 },
  ],
  v3_pari: { market_id: "over-15", probabilite: 74, etiquette: VERIFIE, fiabilite_marche: VERIFIE },
  moteur_v3: { source: "v3", origine_probabilite: "modèle seul", fiabilite_niveau: VERIFIE },
};

test("selection nationale : 1N2 et double chance seulement, « en test », jamais « Sur 100 matchs »", () => {
  const vm = VM.buildMatchViewModel(nations);
  assert.ok(vm.model.marketTable.length > 0 && vm.model.marketTable.every((r) => ["result", "dc"].includes(r.family.family)), JSON.stringify(vm.model.marketTable.map((r) => r.id || r.label)));
  assert.ok(vm.model.marketsCompared.every((c) => SEL.marcheAutorise(c.id)));
  assert.equal(vm.model.leagueInTest, true);
  assert.equal(vm.model.frequencyCalibrated, false);
  assert.equal(vm.model.reliabilityInfo, null, "aucun niveau « élevée » ni « vérifié »");
  assert.deepEqual(vm.model.probabilities, { home: 61, draw: 22, away: 17 }, "probabilites inchangees");
  // Un club (Ligue 1) garde tous ses marches.
  const club = VM.buildMatchViewModel(Object.assign({}, nations, { league: "Ligue 1", league_id: 61 }));
  assert.ok(club.model.marketTable.some((r) => r.family.family === "total"));
  assert.equal(club.model.leagueInTest, false);
});

test("page match : l'avis affiche « Fiabilité : en test », sans « Sur 100 » ni plus/moins de buts", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  const code = src.slice(0, i) + "window.__MP={signalCard,marketsCard,viewModel};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { IasharkMatchViewModel: VM, location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: VM, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el }, console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {} };
  vmLib.createContext(ctx); vmLib.runInContext(code, ctx);
  const MP = win.__MP, vm = MP.viewModel(nations);
  const txt = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const avis = txt(MP.signalCard(vm)), marches = txt(MP.marketsCard(vm));
  assert.match(avis, /Fiabilité : en test/);
  // Verdict du mathematicien (30/09/2026) : aucun pari du moteur v3 sur une selection, meme publie
  // avant. 03/10/2026 : texte neutre, les selections Pro (voie « cotes du marche ») partent sur Telegram.
  assert.match(avis, /Les sélections Pro du jour sont envoyées aux abonnés, en privé sur Telegram\./);
  assert.doesNotMatch(avis, /Pas de pari sur les matchs de sélections/);
  assert.doesNotMatch(avis, /Plus de 1,5|Over 1\.5|Aucun marché ne franchit/);
  assert.doesNotMatch(avis + marches, /Sur 100 matchs|Fiabilité élevée|vérifié sur le passé/);
  assert.doesNotMatch(marches, /Plus de \d|Moins de \d|Les deux équipes marquent/i);
  assert.match(marches, /Victoire|ou nul/, "le 1N2 et la double chance restent");
});

test("meme liste de competitions que lib/selections-nationales.js", () => {
  assert.deepEqual(VM.SELECTIONS_IDS, SEL.IDS);
  for (const m of [{ league_id: 10 }, { league: "UEFA Nations League" }, { league_id: 32 }]) assert.equal(VM.estSelectionNationale(m), true);
  assert.equal(VM.estSelectionNationale({ league: "UEFA Champions League", league_id: 2 }), false);
});
