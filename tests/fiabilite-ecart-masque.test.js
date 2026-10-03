"use strict";
// Avocat du diable (30/09/2026, point 3 bloquant) : quand l'ecart est masque (chiffre
// qui n'est pas « modèle + cotes », au-dessus de la cote), la page affichait quand meme
// « Fiabilité élevée » : les vraies sorties du moteur v3 donnent « Élevée » en MLS, en
// Ligue des nations et en amicaux. Or dans cette zone le modele seul annonce 7,4 points
// de trop (549 paris jamais vus : 77,0 % annonces, 69,6 % passes). Desormais : au plus
// « Fiabilité moyenne ». Meme plafond pour le match offert « modèle seul » du moteur v3.
// « Moyenne », « Faible » et « en test » ne changent pas ; aucune probabilite ne bouge.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmLib = require("node:vm");
const { buildMatchViewModel } = require("../lib/match-view-model.js");
// Une seule source (01/10/2026) : chaque match porte la chance posee par le pipeline.
const CHANCE = require("../lib/chance-iashark.js");
const avecChance = (raw) => { CHANCE.poserChance(raw); return raw; };

const VERIFIE = "vérifié sur le passé";
// Cas de l'avocat : MLS 70 % (modele seul), cote sans marge 60 %, cote 1,62, « Élevée ».
const mls = {
  id: 900001, league: "Major League Soccer", home: { id: 10, n: "Austin" }, away: { id: 11, n: "Dallas" }, date: "2026-10-03 23:30", status: "NS",
  pari_rec: "Victoire Domicile", market_id: "home-win", model_probability: 70, cote_rec: "1.62", model_output_available: true, data_quality_score: 80,
  markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 70, consensus: 60, edge: 10 }],
  v3_pari: { market_id: "home-win", probabilite: 70, etiquette: VERIFIE, fiabilite_marche: VERIFIE },
  moteur_v3: { source: "v3", origine_probabilite: "modèle seul", couverture: "vérifiée", fiabilite_niveau: VERIFIE },
  reliability: { label: "Élevée", model_agreement: "Fort", data_quality: "Élevée", sample_size: 20 }, p1: 70, pn: 18, p2: 12,
};
avecChance(mls);
const avec = (raw, champs) => avecChance(Object.assign({}, raw, champs));
const origine = (raw, o) => avec(raw, { moteur_v3: Object.assign({}, raw.moteur_v3, { origine_probabilite: o }) });
const niveau = (raw) => { const vm = buildMatchViewModel(raw); return [vm.model.reliabilityInfo && vm.model.reliabilityInfo.level, vm.model.reliabilityInfo && vm.model.reliabilityInfo.reason]; };

test("preuve de l'avocat rejouee : MLS 70 % (modele seul) face a 60 % : « Élevée » devient « moyenne »", () => {
  const vm = buildMatchViewModel(mls);
  assert.equal(vm.model.positiveGapHidden, true);
  assert.equal(vm.model.reliabilityInfo.level, "medium");
  assert.equal(vm.model.reliabilityInfo.reason, "model_only");
  assert.equal(vm.teaser.reliability.level, "medium", "meme plafond sur l'amorce");
  // Aucune probabilite n'est touchee : le modele reste 70 % ; le chiffre affiche est la chance
  // IASHARK (le plus bas entre le modele et la cote sans marge, une seule source, 01/10/2026).
  assert.equal(vm.model.recommendation.modelProbability, 70);
  assert.equal(vm.model.recommendation.probability, 60);
  assert.equal(vm.model.recommendedImplied, 60);
});

test("ancien moteur ou origine inconnue au-dessus de la cote : « moyenne », raison « écart non affiché »", () => {
  for (const raw of [avec(mls, { moteur_v3: undefined, v3_pari: undefined }), avec(mls, { moteur_v3: { source: "ancien moteur (repli)" } }), origine(mls, "inconnue")]) {
    assert.deepEqual(niveau(raw), ["medium", "gap_hidden"]);
  }
});

test("rien ne change ailleurs : Europe « modèle + cotes », ecart defavorable, niveaux deja bas", () => {
  assert.deepEqual(niveau(origine(mls, "modèle + cotes")), ["high", "solid"], "Europe : l'ecart est affiche, la fiabilite aussi");
  const sous = avec(mls, { model_probability: 55, v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 55 }), markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 55, consensus: 60, edge: -5 }] });
  assert.deepEqual(niveau(sous), ["high", "solid"], "modele seul SOUS la cote : ecart affiche, rien de masque");
  assert.equal(niveau(avec(mls, { reliability: Object.assign({}, mls.reliability, { label: "Moyenne" }) }))[0], "medium");
  assert.equal(niveau(avec(mls, { reliability: Object.assign({}, mls.reliability, { label: "Faible" }) }))[0], "low");
  assert.equal(buildMatchViewModel(avec(mls, { reliability: undefined })).model.reliabilityInfo, null, "jamais une fiabilite inventee");
});

test("match offert « modèle seul » du moteur v3 : au plus « moyenne », meme sous la cote", () => {
  const sous = avec(mls, { is_free: true, model_probability: 55, v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 55 }), markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 55, consensus: 60, edge: -5 }] });
  assert.deepEqual(niveau(sous), ["medium", "model_only"]);
  assert.deepEqual(niveau(origine(sous, "modèle + cotes")), ["high", "solid"], "match offert europeen : inchange");
});

// Page match executee pour de vrai (meme faux navigateur que tests/frequence-calibree.test.js).
function pageMatch() {
  const src = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  const code = src.slice(0, i) + "window.__MP={signalCard,viewModel};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { IasharkMatchViewModel: require("../lib/match-view-model.js"), location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: win.IasharkMatchViewModel, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el },
    console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {} };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  return win.__MP;
}
const texte = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").replace(/\s+/g, " ");

test("page match : l'avis du MLS affiche « Fiabilité moyenne », jamais « Fiabilité élevée »", () => {
  const MP = pageMatch();
  const avis = texte(MP.signalCard(MP.viewModel(mls)));
  assert.match(avis, /Fiabilité moyenne/);
  assert.match(avis, /Fiabilité moyenne : estimation du modèle seul, sans la cote\./);
  assert.doesNotMatch(avis, /Fiabilité élevée/);
  const europe = texte(MP.signalCard(MP.viewModel(origine(mls, "modèle + cotes"))));
  assert.match(europe, /Fiabilité élevée/);
});

test("les deux raisons existent dans les 7 langues, avec le texte francais du repli", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const mp = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "i18n", "dict", l + ".json"), "utf8")).match_page;
    for (const k of ["sig_rel_reason_model_only", "sig_rel_reason_gap_hidden"]) assert.ok(typeof mp[k] === "string" && mp[k].trim(), l + " " + k);
    if (l === "fr") {
      assert.ok(js.includes("model_only:'" + mp.sig_rel_reason_model_only + "'"));
      assert.ok(js.includes("gap_hidden:'" + mp.sig_rel_reason_gap_hidden + "'"));
    }
  }
});

// Avocat du diable (01/10/2026) : un pari « modèle seul » SANS cote sans marge (rien ne
// confronte le chiffre a la cote) gardait « Fiabilité élevée ». Au plus « moyenne ».
test("modele seul sans cote sans marge : au plus « Fiabilité moyenne » ; Europe « modèle + cotes » inchangee", () => {
  const sansCote = avec(mls, { markets_compared: [], cote_rec: "" });
  assert.deepEqual(niveau(sansCote), ["medium", "model_only"]);
  assert.deepEqual(niveau(avec(sansCote, { moteur_v3: undefined, v3_pari: undefined })), ["medium", "gap_hidden"], "ancien moteur sans cote : idem");
  assert.deepEqual(niveau(origine(sansCote, "modèle + cotes")), ["high", "solid"], "Europe : la cote est dans le chiffre");
  assert.deepEqual(niveau(avec(mls, { model_probability: 55, v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 55 }), markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 55, consensus: 60, edge: -5 }] })), ["high", "solid"], "temoin : cote sans marge connue, modele dessous");
});
