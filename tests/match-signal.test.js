"use strict";
// Signal IASHARK (refonte du 14/09/2026) : fiabilite expliquee, raisons et
// risques tires des donnees reelles, tableau modele/marche, et libelles de
// paris dans la forme standard des bookmakers, dans chaque langue.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const insights = require("../lib/insights.js");
const labels = require("../lib/market-labels.js");
const { buildMatchViewModel } = require("../lib/match-view-model.js");
const dict = (l) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "i18n", "dict", l + ".json"), "utf8"));

test("reliabilityInfo : niveau du pipeline et raison principale en une ligne", () => {
  assert.deepEqual(insights.reliabilityInfo({ label: "Moyenne", model_agreement: "Fort", data_quality: "Élevée", sample_size: 3 }),
    { level: "medium", reason: "thin_sample", sampleSize: 3 });
  assert.equal(insights.reliabilityInfo({ label: "Élevée", model_agreement: "Fort", data_quality: "Élevée", sample_size: 20 }).reason, "solid");
  assert.equal(insights.reliabilityInfo({ label: "Faible", model_agreement: "Faible", sample_size: 12 }).reason, "models_disagree");
  assert.equal(insights.reliabilityInfo(null), null, "jamais une fiabilite inventee");
});

test("h2hOutcome : rejoue le pari sur les vrais scores, du point de vue du match actuel", () => {
  const h2h = [
    { home: "Newcastle", away: "Leeds", score: "4-3" },
    { home: "Leeds", away: "Newcastle", score: "0-0" },
    { home: "Leeds", away: "Newcastle", score: "2-2" },
    { home: "Newcastle", away: "Leeds", score: "0-0" },
    { home: "Leeds", away: "Newcastle", score: "0-1" }
  ];
  const fam = labels.marketFamily("Exterieur moins de 1.5 but");
  assert.deepEqual(insights.h2hOutcome(fam, h2h, "Leeds", "Newcastle"), { wins: 3, sample: 5 });
  // Un marche de tirs n'est pas rejouable sur un score : aucune statistique.
  assert.equal(insights.h2hOutcome(labels.marketFamily("total-shots-over-24_5"), h2h, "Leeds", "Newcastle"), null);
  // Moins de 3 confrontations : rien plutot qu'un pourcentage sur 2 matchs.
  assert.equal(insights.h2hOutcome(fam, h2h.slice(0, 2), "Leeds", "Newcastle"), null);
});

test("signalReasons / signalRisks : 3 raisons au plus, uniquement sur donnees presentes", () => {
  const reasons = insights.signalReasons({ family: labels.marketFamily("over-25"), homeName: "A", awayName: "B", expectedGoals: { home: 1.6, away: 1.2 } });
  assert.deepEqual(reasons.map((r) => r.key), ["xg"]);
  assert.deepEqual(insights.signalReasons({ family: labels.marketFamily("over-25"), homeName: "A", awayName: "B" }), []);
  const risks = insights.signalRisks({ family: labels.marketFamily("home-win"), edge: -2, odds: 1.3, homeName: "A", awayName: "B", absences: { home: ["x", "y"], away: [] }, reliability: { model_agreement: "Faible" } });
  assert.equal(risks.length, 2);
  assert.equal(risks[0].key, "negative_edge");
});

test("vue du match reel 1557402 : signal, tableau modele/marche et raisons coherents", () => {
  const root = path.join(__dirname, "..");
  const detail = path.join(root, "match", "1557402.json");
  if (!fs.existsSync(detail)) return; // fichier du jour purge : rien a verifier
  const raw = JSON.parse(fs.readFileSync(detail, "utf8"));
  if (!raw.pari_rec) return;
  const vm = buildMatchViewModel(raw);
  const r = vm.model.recommendation;
  assert.ok(r && r.probability > 0);
  const implied = Math.round((100 / raw.cote_rec) * 10) / 10;
  assert.equal(vm.model.recommendedImplied, implied);
  assert.equal(vm.model.recommendedEdge, Math.round((r.probability - implied) * 10) / 10);
  assert.equal(vm.model.marketTable.filter((x) => x.recommended).length, 1);
  assert.ok(vm.editorial.signalReasons.length <= 3);
  for (const row of vm.model.marketTable) assert.ok(row.model > 0 && row.model < 100, "probabilite modele reelle sur chaque ligne");
});

// Bug « Marche 0 % » (16/09/2026, match offert 1570385) : finite(null) vaut 0.
// Une probabilite de marche, une probabilite du modele ou une cote ABSENTE est
// non disponible (null), jamais 0, et ne produit aucun ecart.
test("marketTable : donnee absente = non disponible, jamais 0 % ni fausse value", () => {
  const raw = { id: 11, home: { id: 1, n: "Barcelona" }, away: { id: 2, n: "Racing" }, model_output_available: true, data_quality_score: 80,
    p1: 62.4, pn: 22.1, p2: 15.5, market_consensus_p1: null, market_consensus_pN: "", c1: "1.06", cn: "14.50", c2: null,
    po25: null, markets_compared: [{ id: "under-35", market: "Under 3.5", probability: 58, consensus: null, edge: null }] };
  const rows = buildMatchViewModel(raw).model.marketTable;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["home-win"].market, null, "consensus absent : null, pas 0");
  assert.equal(byId["home-win"].edge, null, "aucun ecart sans marche");
  assert.equal(byId["draw"].market, null);
  assert.equal(byId["away-win"].odds, null, "cote absente : null, pas 0");
  assert.equal(byId["home-win"].odds, 1.06);
  assert.equal(byId["over-25"], undefined, "probabilite du modele absente : pas de ligne a 0 %");
  assert.equal(byId["under-35"].market, null);
  assert.equal(byId["under-35"].edge, null);
  // Une vraie valeur 0 reste 0 (donnee presente).
  const zero = buildMatchViewModel(Object.assign({}, raw, { market_consensus_p2: 0 })).model.marketTable.find((r) => r.id === "away-win");
  assert.equal(zero.market, 0);
  // Affichage : match-page.js ne montre jamais un marche <= 0 comme une probabilite.
  const js = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  assert.match(js, /const marcheValide=v=>n\(v\)!==null&&n\(v\)>0\?n\(v\):null;/);
  assert.match(js, /proba_market_na','non disponible'/);
});

test("mur d'acces : le teaser ne contient aucune donnee du modele", () => {
  const vm = buildMatchViewModel({ id: 9, home: { id: 1, n: "A" }, away: { id: 2, n: "B" }, c1: "2.10", cn: "3.30", c2: "3.60", co25: "1.90", reliability: { label: "Moyenne", sample_size: 3 } });
  assert.deepEqual(Object.keys(vm.teaser).sort(), ["oddsCount", "reliability"]);
  assert.equal(vm.teaser.oddsCount, 4);
  assert.equal(vm.model.recommendation, null);
});

// 15 identifiants de marches REELLEMENT presents dans les donnees du pipeline
// (data.json / markets_compared, 14/09/2026), ecrits dans chaque langue.
const EQ = { home: "Leeds", away: "Newcastle" };
const REELS = {
  "under-35": ["Moins de 3,5 buts", "Under 3.5 goals", "Menos de 3.5 goles"],
  "over-25": ["Plus de 2,5 buts", "Over 2.5 goals", "Más de 2.5 goles"],
  "under-25": ["Moins de 2,5 buts", "Under 2.5 goals", "Menos de 2.5 goles"],
  "over-35": ["Plus de 3,5 buts", "Over 3.5 goals", "Más de 3.5 goles"],
  "fh-under-15": ["1re mi-temps : moins de 1,5 but", "First half under 1.5 goals", "1er tiempo: menos de 1.5 goles"],
  "btts-yes": ["Les deux équipes marquent : Oui", "Both teams to score – Yes", "Ambos marcan: Sí"],
  "dc-x2": ["Nul ou Newcastle (double chance)", "Draw or Newcastle (double chance)", "Empate o Newcastle (doble oportunidad)"],
  "dc-1x": ["Leeds ou nul (double chance)", "Leeds or draw (double chance)", "Leeds o empate (doble oportunidad)"],
  "home-win": ["Victoire Leeds", "Leeds to win", "Gana Leeds"],
  "home-team-over-15": ["Leeds : plus de 1,5 but", "Leeds over 1.5 goals", "Leeds: más de 1.5 goles"],
  "away-team-under-15": ["Newcastle : moins de 1,5 but", "Newcastle under 1.5 goals", "Newcastle: menos de 1.5 goles"],
  "home-team-under-15": ["Leeds : moins de 1,5 but", "Leeds under 1.5 goals", "Leeds: menos de 1.5 goles"],
  "total-shots-over-24_5": ["Plus de 24,5 tirs", "Over 24.5 shots", "Más de 24.5 tiros"],
  "total-shots-on-target-under-10_5": ["Moins de 10,5 tirs cadrés", "Under 10.5 shots on target", "Menos de 10.5 tiros a gol"],
  "total-shots-under-30_5": ["Moins de 30,5 tirs", "Under 30.5 shots", "Menos de 30.5 tiros"]
};
test("15 marches reels : forme standard en fr, en et es-MX (point decimal au Mexique)", () => {
  const en = dict("en"), mx = dict("es-mx");
  const nb = (s) => s.replace(/ :/g, " :");
  for (const [id, [fr, eng, esmx]] of Object.entries(REELS)) {
    assert.equal(labels.marketIdLabelFr(id, EQ), nb(fr), `fr ${id}`);
    assert.equal(labels.marketIdLabel(id, EQ, { locale: "en", dict: en }), eng, `en ${id}`);
    assert.equal(labels.marketIdLabel(id, EQ, { locale: "es-mx", dict: mx }), esmx, `es-mx ${id}`);
  }
  // Libelles moteur equivalents (pari_rec) : meme sortie que les identifiants.
  assert.equal(labels.marketLabel("Exterieur moins de 1.5 but", EQ, { locale: "en", dict: en }), "Newcastle under 1.5 goals");
  assert.equal(labels.marketLabel("BTTS Oui", EQ, { locale: "es-mx", dict: mx }), "Ambos marcan: Sí");
  assert.equal(labels.playerMarketLabelFor("ANYTIME_GOALSCORER", "A. Elanga"), "A. Elanga buteur");
});

test("toutes les langues du site ont la forme standard (separateur decimal de la langue)", () => {
  const attendu = { es: "Más de 2,5 goles", de: "Über 2,5 Tore", it: "Over 2,5 gol", pt: "Mais de 2,5 golos" };
  for (const [l, txt] of Object.entries(attendu)) {
    assert.equal(labels.marketIdLabel("over-25", EQ, { locale: l, dict: dict(l) }), txt, l);
  }
  assert.equal(labels.marketIdLabel("btts-yes", EQ, { locale: "es", dict: dict("es") }), "Ambos marcan: Sí");
});
