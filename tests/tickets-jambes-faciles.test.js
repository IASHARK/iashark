"use strict";
// JAMBES DES COMBINES x5 / x10 « CORRIGES » (regle du 17/11/2026, lib/run-output/jambes-faciles.js), avec la VRAIE
// configuration (config/tickets.json#jambes_combines) : plus de victoire seche, plus de jambe a 1,70 ou plus, chance 60 %
// au moins ; le pari affiche s'il passe, sinon sa version plus facile (impliquee par lui, cote du flux du match).
const test = require("node:test");
const assert = require("node:assert/strict");

const T = require("../lib/tickets-du-jour.js");
const FACILES = require("../lib/run-output/jambes-faciles.js");
const MP = require("../lib/marches-paris.js");
const ML = require("../lib/market-labels.js");
const REGLES = require("../config/tickets.json");
const LIGUES = require("../config/leagues.json");
const V = require("../config/verdicts-maths.json");

const JOUR = "2026-11-18";
const NOW = Date.parse("2026-11-18T07:00:00Z");

// Flux API-Football d'un match (bookmaker de reference seul).
function flux(cotes) {
  const bets = {};
  const noms = { 1: "Match Winner", 5: "Goals Over/Under", 8: "Both Teams Score", 12: "Double Chance", 16: "Total - Home", 17: "Total - Away" };
  Object.keys(cotes).forEach(function (k) {
    const [bet, value] = k.split("|");
    (bets[bet] || (bets[bet] = [])).push({ value: value, odd: String(cotes[k]) });
  });
  return { bookmakers: [{ id: 8, name: "Bet365", bets: Object.keys(bets).map((b) => ({ id: Number(b), name: noms[b], values: bets[b] })) }] };
}
// Un flux de match complet, coherent (marge ~5 %), autour d'un favori a domicile.
function fluxType(dc1x, o15) {
  return flux({
    "1|Home": 1.7, "1|Draw": 3.8, "1|Away": 4.6,
    "12|Home/Draw": dc1x, "12|Home/Away": 1.3, "12|Draw/Away": 2.05,
    "5|Over 0.5": 1.04, "5|Under 0.5": 12, "5|Over 1.5": o15, "5|Under 1.5": 3.3, "5|Over 2.5": 1.85, "5|Under 2.5": 1.95, "5|Over 3.5": 3.2, "5|Under 3.5": 1.33,
    "8|Yes": 1.75, "8|No": 2.0,
    "16|Over 0.5": 1.18, "16|Under 0.5": 4.6, "17|Over 0.5": 1.4, "17|Under 0.5": 2.8,
  });
}

function construire() {
  const matchs = [], fixtureById = {}, fluxPar = {};
  const ajouter = (id, heure, pari, extra, raw) => {
    const m = Object.assign({ id: id, home: { n: "Dom" + id, id: id * 10 }, away: { n: "Ext" + id, id: id * 10 + 1 }, date: JOUR + " " + heure,
      league: "Ligue 1", league_key: "ligue1", league_id: 61, no_signal: false,
      pari_rec: pari[1], market_id: pari[0], cote_rec: pari[2], cote_source: "bet365", chance_iashark: pari[3],
      pronostic: { market_id: pari[0], libelle_fr: pari[1], chance: pari[3], cote: Number(pari[2]), voie: "scenario", moteur: "scenario", fiabilite: "en test", publie: true, hors_fourchette: false } }, extra || {});
    matchs.push(m);
    fixtureById[String(id)] = { fixture: { timestamp: Math.floor(Date.parse(JOUR + "T" + heure + ":00+01:00") / 1000), status: { short: "NS" } } };
    if (raw) fluxPar[String(id)] = { raw: raw };
    return m;
  };
  // Victoires seches (1N2) : jamais en jambe, remplacees par une version impliquee (double chance, l'equipe marque).
  for (let i = 0; i < 6; i++) ajouter(9400 + i, (17 + (i % 4)) + ":00", ["home-win", "Victoire Dom" + (9400 + i), (1.7 + i * 0.03).toFixed(2), 55], {}, fluxType((1.3 + i * 0.03).toFixed(2), (1.33 + i * 0.02).toFixed(2)));
  // Plus de 2,5 buts a 1,85 : trop cote, remplace par « plus de 1,5 but ».
  for (let i = 0; i < 6; i++) ajouter(9410 + i, "20:00", ["over-25", "Plus de 2,5 buts", "1.85", 54], {}, fluxType("1.22", (1.36 + i * 0.03).toFixed(2)));
  // Pari affiche deja sous 1,70, pas une victoire, chance 60 % ou plus : la jambe est le pari de la page, tel quel.
  ajouter(9420, "21:00", ["under-35", "Moins de 3,5 buts", "1.33", 72], {}, fluxType("1.22", "1.30"));
  // Jamais une jambe : victoire sans flux du match (aucune cote inventee) ; code « F… » ; repli hors fourchette.
  ajouter(9430, "21:00", ["home-win", "Victoire Dom9430", "1.55", 62]);
  ajouter(9431, "21:00", ["F45:Over 8.5", "Plus de 8,5 corners", "1.73", 54], {}, fluxType("1.22", "1.30"));
  ajouter(9432, "21:00", ["over-15", "Plus de 1,5 but", "1.40", 70], { pronostic: { market_id: "over-15", publie: true, hors_fourchette: true, fiabilite: "en test" } }, fluxType("1.22", "1.40"));
  return { matchs, fixtureById, fluxPar, opts: { jour: JOUR, nowMs: NOW, fixtureById, configLigues: LIGUES, categoriesNoGo: V.categories_no_go, competitions: V.competitions_jambes, fluxPar } };
}

function coteDuFlux(raw, id) {
  const def = MP.CATALOGUE[id];
  for (const b of raw.bookmakers[0].bets) for (const v of b.values) {
    const k = MP.idDuFlux(b.id, v.value);
    if (k === id) return Number(v.odd);
  }
  return def ? null : null;
}

test("configuration du 17/11/2026 : bornes des jambes, nombre de jambes, cotes totales inchangees", () => {
  assert.equal(REGLES.regle_version, "tickets-2026-11-17");
  assert.deepEqual(REGLES.jambes_combines, { cote_min: 1.15, cote_max: 1.69, chance_min: 60, exclure_familles: ["1N2"], versions_faciles: true });
  assert.deepEqual([REGLES.x5.jambes, REGLES.x5.cote_min, REGLES.x5.cote_max], [[3, 4, 5, 6], 4, 6]);
  assert.deepEqual([REGLES.x10.jambes, REGLES.x10.cote_min, REGLES.x10.cote_max], [[5, 6, 7, 8], 8.5, 12]);
  // 4 jambes au plus a 1,69 = 8,16 : le grand combine a besoin d'au moins 5 jambes.
  assert.ok(Math.pow(REGLES.jambes_combines.cote_max, REGLES.x10.jambes[0] - 1) < REGLES.x10.cote_min);
  // Les montantes ne changent pas.
  assert.deepEqual([REGLES.jambe.cote_min, REGLES.jambe.cote_max, REGLES.jambe.chance_min], [1.7, 2.3, 50]);
});

test("jambes x5 / x10 : jamais de victoire seche, jamais 1,70 ou plus, chance 60 % au moins, toujours impliquee par le pari de la page", () => {
  const w = construire();
  const c = T.calculerDuJour(w.matchs, w.opts);
  assert.ok(c.x5 && c.x10, "petit et grand combine construits : " + JSON.stringify(c.exclus_combines));
  const parId = {};
  w.matchs.forEach((m) => { parId[m.id] = m; });
  const jambes = c.x5.contenu.jambes.concat(c.x10.contenu.jambes);
  jambes.forEach(function (j) {
    const m = parId[j.fixture_id];
    assert.ok(m, "match connu");
    assert.notEqual(j.famille, "1N2", "jamais une victoire seche");
    assert.ok(Math.round(j.cote * 100) >= 115 && Math.round(j.cote * 100) <= 169, "cote " + j.cote);
    assert.ok(j.chance >= 60, "chance " + j.chance);
    assert.ok(MP.implique(m.market_id, j.market_id), m.market_id + " -> " + j.market_id + " : la jambe gagne chaque fois que le pari de la page gagne");
    if (j.market_id === m.market_id) {
      assert.equal(j.cote, Number(m.cote_rec), "pari de la page : meme cote");
      assert.equal(j.chance, m.chance_iashark, "pari de la page : meme chance");
    } else {
      assert.equal(j.cote, coteDuFlux(w.fluxPar[String(m.id)].raw, j.market_id), "version facile : la cote relevee dans le flux, jamais inventee");
    }
    assert.ok([9430, 9431, 9432].indexOf(j.fixture_id) === -1, "jamais : victoire sans flux, code F, repli");
  });
  assert.ok(REGLES.x5.jambes.includes(c.x5.contenu.jambes.length) && c.x5.meta.cote_totale >= 4 && c.x5.meta.cote_totale <= 6, String(c.x5.meta.cote_totale));
  assert.ok(REGLES.x10.jambes.includes(c.x10.contenu.jambes.length) && c.x10.meta.cote_totale >= 8.5 && c.x10.meta.cote_totale <= 12, String(c.x10.meta.cote_totale));
  [c.x5, c.x10].forEach((t) => { const ids = t.contenu.jambes.map((j) => j.fixture_id); assert.equal(new Set(ids).size, ids.length, "un match par jambe"); });
  assert.ok(jambes.some((j) => j.market_id === "dc-1x" || j.market_id === "home-team-over-05" || j.market_id === "dc-12"), "victoire -> version facile");
});

test("pari de la page qui passe la regle : la jambe est lui, jamais une version plus facile", () => {
  const w = construire();
  const cc = FACILES.candidatsCombines(w.matchs, { 9420: [{ market_id: "under-35", famille: "OU3.5", cote: 1.33, chance: 72, chance_affichee: 72, fiabilite: "en test" }] }, { regles: REGLES, fluxPar: w.fluxPar });
  assert.deepEqual(cc.candidatsPar["9420"].map((x) => x.market_id), ["under-35"]);
  // Victoire a 1,70 : versions faciles seulement, toutes impliquees, aucune victoire.
  const m = w.matchs.find((x) => x.id === 9400);
  const v = FACILES.versionsFaciles(m, "home-win", w.fluxPar["9400"].raw, { fiabilite: "en test" }, FACILES.regleCombines(REGLES));
  assert.ok(v.length > 0);
  v.forEach((x) => { assert.ok(MP.implique("home-win", x.market_id)); assert.notEqual(x.famille, "1N2"); assert.ok(x.cote >= 1.15 && x.cote <= 1.69); });
  assert.ok(v.every((x) => x.market_id !== "over-15"), "plus de 1,5 but n'est pas implique par une victoire (1-0)");
});

test("aucune cote inventee : sans flux du match, aucune version facile", () => {
  const w = construire();
  const c = T.calculerDuJour(w.matchs, Object.assign({}, w.opts, { fluxPar: null }));
  const jambes = (c.x5 ? c.x5.contenu.jambes : []).concat(c.x10 ? c.x10.contenu.jambes : []);
  jambes.forEach((j) => assert.equal(j.market_id, w.matchs.find((m) => m.id === j.fixture_id).market_id, "seul le pari de la page reste possible"));
  assert.equal(c.nb_versions_faciles, 0);
});

test("jamais retroactif : un combine deja publie n'est pas recalcule", () => {
  const w = construire();
  const deja = { x5: { jambes: [{ fixture_id: 9400, market_id: "home-win" }] } };
  const c = T.calculerDuJour(w.matchs, Object.assign({}, w.opts, { deja: deja }));
  assert.equal(c.x5, null, "x5 deja publie : rien de recalcule");
});

test("libelles des jambes faciles dans les 7 langues (page des combines)", () => {
  const attendus = { "dc-1x": /Lens/, "dc-12": /Lens/, "over-15": /1[.,]5/, "home-team-over-05": /Lens/, "away-team-over-05": /PSG/ };
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach(function (l) {
    const dict = require("../i18n/dict/" + l + ".json");
    Object.keys(attendus).forEach(function (id) {
      const t = ML.marketIdLabel(id, { home: "Lens", away: "PSG" }, { dict: dict, locale: l });
      assert.ok(typeof t === "string" && attendus[id].test(t) && !/[a-z]+-[a-z0-9]+-/.test(t), l + " " + id + " : " + t);
    });
  });
});
