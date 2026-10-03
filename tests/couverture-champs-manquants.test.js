"use strict";
// COUVERTURE DES 48 COMPETITIONS (controle du 02/10/2026) : quand une donnee MANQUE
// pour une competition (statistiques d'equipe a null en coupe d'Europe, classement
// absent en MLS, cote « -- », pas d'arbitre, pas de composition...), la page match la
// MASQUE ou dit « — » : jamais un 0 invente, jamais « 0e », « undefined » ou « NaN ».
// Cas reels releves dans les fichiers du pipeline (data.json des « Daily update » du
// 25/08 au 29/09/2026) : Europa League, Ligue des champions, MLS, Liga MX, Argentine.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildMatchViewModel } = require("../lib/match-view-model.js");
const display = require("../lib/display-data.js");

const root = path.join(__dirname, "..");
const PAGE = fs.readFileSync(path.join(root, "match-page.js"), "utf8");

const STATS_NULLES = { possession: null, shots_total: null, shots_on: null, shots_off: null, shots_blocked: null, corners: null, fouls: null, offsides: null, saves: null, passes_pct: null, xg: null, xga: null };
const STATS_OK = { possession: 53, shots_total: 13.8, shots_on: 5.9, shots_off: 5.2, shots_blocked: 4.5, corners: 5.3, fouls: 9.8, offsides: 2.7, saves: 4.5, passes_pct: 83, xg: 1.68, xga: 2.09 };
const base = (o = {}) => ({ id: 7, date: "2026-09-24 18:45", league: "UEFA Europa League", league_id: 3, league_key: "el",
  home: { id: 1, n: "Levski Sofia" }, away: { id: 2, n: "Red Bull Salzburg" }, ...o });

// Rien de ce qui sort du view model ne doit contenir NaN, undefined ou Infinity.
function sansValeurCassee(vm) {
  const s = JSON.stringify(vm, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? "__NUM_CASSE__" : v === undefined ? null : v));
  assert.doesNotMatch(s, /__NUM_CASSE__|undefined|NaN/);
}

test("stats d'equipe a null (Europa League) : aucune ligne a 0 dans le comparatif, ni tirs, ni xG, ni passes", () => {
  const vm = buildMatchViewModel(base({ match_stats_home: STATS_NULLES, match_stats_away: STATS_OK,
    events_home: { goals_avg: "1.50", conceded_avg: "1.00", games: 2 }, events_away: { goals_avg: "1.50", conceded_avg: "1.50", games: 2 } }));
  // Comparatif : seules les lignes connues des DEUX cotes restent (buts) ; moins de 3 -> bloc masque.
  assert.equal(vm.comparison, null, "comparatif masque : plus de « Possession 0 % » ni « Tirs 0 »");
  assert.equal(vm.shotStats, null, "profil de tirs masque");
  const f = vm.editorial.exclusiveFacts;
  assert.equal(f.xg, null, "jamais « 0,00 buts attendus »");
  assert.equal(f.xga, null);
  assert.equal(f.passes, null, "jamais « 0 % de passes reussies »");
  assert.equal(vm.matchups.find(m => m.key === "possession"), undefined, "jamais « possession 0 % vs 53 % »");
  sansValeurCassee(vm);
});

test("stats d'equipe partielles : seules les lignes fournies des deux cotes sont gardees", () => {
  const home = { ...STATS_OK, corners: null, offsides: "" };
  const vm = buildMatchViewModel(base({ match_stats_home: home, match_stats_away: STATS_OK,
    events_home: { goals_avg: "1.50", conceded_avg: "1.00", games: 6 }, events_away: { goals_avg: "1.20", conceded_avg: "1.50", games: 6 } }));
  const labels = vm.comparison.rows.map(r => r.label);
  assert.ok(!labels.includes("Corners"), "corners absent -> ligne retiree");
  assert.ok(!labels.includes("Hors-jeu"), "hors-jeu vide -> ligne retiree");
  vm.comparison.rows.forEach(r => { assert.notEqual(r.home, null); assert.notEqual(r.away, null); });
  assert.equal(vm.comparison.sampleSize, 6);
});

test("buts moyens absents : ni dans le comparatif ni dans le resume des donnees (pas de 0)", () => {
  const vm = buildMatchViewModel(base({ events_home: { goals_avg: null, conceded_avg: "", games: 0 }, events_away: { goals_avg: "1.2", conceded_avg: "0.8", games: 5 } }));
  assert.equal(vm.dataOverview.goalsHome, null);
  assert.equal(vm.dataOverview.goalsAway, 1.2);
});

test("forme vide : aucune ligne, jamais « 0 V · 0 N · 0 D »", () => {
  const vm = buildMatchViewModel(base({ form_home: [], form_away: null }));
  assert.deepEqual(vm.form, { home: [], away: [] });
  // La page ne rend la forme que si une equipe a au moins un match.
  const fold = PAGE.slice(PAGE.indexOf("function formeFold(vm)"), PAGE.indexOf("function classementFold(vm)"));
  assert.match(fold, /if\(!corps\)return '';/);
});

test("classement absent ou equipe hors du tableau : pas de rang dans le view model", () => {
  assert.equal(buildMatchViewModel(base({ classement: null })).identity.standings, null);
  const vm = buildMatchViewModel(base({ classement: { league_name: "Major League Soccer", standings: [], home: null, away: { rank: 5, pts: 44 } } }));
  assert.deepEqual(vm.identity.standings, { home: null, away: { rank: 5, pts: 44 } });
});

// teamMeta (en-tete) et classementFold, extraits de match-page.js et executes avec des doublures.
function extraire(nom) {
  const debut = PAGE.indexOf("function " + nom + "(");
  assert.ok(debut !== -1, nom + " introuvable dans match-page.js");
  const fin = PAGE.indexOf("\nfunction ", debut + 10);
  return PAGE.slice(debut, fin);
}
const n = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const esc = s => String(s);
const t = (k, fb) => fb;
const tf = (k, fb, vars) => String(fb).replace(/\{(\w+)\}/g, (m, x) => vars && vars[x] !== undefined ? vars[x] : m);
const rangOrdinal = v => v + "e";

test("en-tete : rang absent, nul ou 0 -> ni « 0e », ni « undefined », ni « undefined pts »", () => {
  const teamMeta = new Function("n", "esc", "t", "rangOrdinal", "formStrip", extraire("teamMeta") + "\nreturn teamMeta;")(n, esc, t, rangOrdinal, () => "");
  assert.equal(teamMeta(null, []), "");
  assert.equal(teamMeta({}, []), "");
  assert.equal(teamMeta({ rank: 0, pts: 0 }, []), "");
  assert.equal(teamMeta({ rank: null, pts: 12 }, []), "");
  assert.equal(teamMeta({ rank: 3 }, []), "<small>3e</small>", "points inconnus : rang seul");
  assert.equal(teamMeta({ rank: 3, pts: 45 }, []), "<small>3e · 45 pts</small>");
});

test("tableau du classement : rang 0 ou absent affiche « — », jamais « 0e » dans le resume", () => {
  const fold = o => o;
  const classementFold = new Function("n", "esc", "t", "tf", "rangOrdinal", "fold", "logoEquipe", "nomEq", "nomLigue", extraire("classementFold") + "\nreturn classementFold;")(
    n, esc, t, tf, rangOrdinal, fold, () => "", tm => tm.name, () => "MLS");
  const vm = { identity: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } },
    _raw: { classement: { league_name: "MLS", standings: [], home: { rank: 0, pts: 10, played: 5 }, away: { rank: null, pts: null } } } };
  const r = classementFold(vm);
  assert.equal(r.summary, "", "aucun rang connu : resume vide");
  assert.doesNotMatch(r.body, />0</, "jamais de rang 0 dans le tableau");
  assert.doesNotMatch(r.body, /undefined|NaN/);
  assert.equal(classementFold({ identity: vm.identity, _raw: { classement: null } }), "");
});

test("face-a-face absent ou vide : section masquee (jamais 0-0-0)", () => {
  assert.equal(buildMatchViewModel(base({ h2h: [] })).h2h, null);
  assert.equal(buildMatchViewModel(base({ h2h: null })).h2h, null);
  assert.equal(buildMatchViewModel(base({})).h2h, null);
  const fold = PAGE.slice(PAGE.indexOf("function h2hFold(vm)"), PAGE.indexOf("function comparatifFold(vm)"));
  assert.match(fold, /if\(!h\.length\)return '';/);
});

test("compositions absentes ou onze vide : pas de liste, pas de mode « officiel »", () => {
  for (const lineups of [null, {}, { home: { startXI: [] }, away: { startXI: [] } }]) {
    const vm = buildMatchViewModel(base({ lineups }));
    assert.notEqual(vm.players.lineupMode, "OFFICIAL");
    assert.equal(vm.players.formations.home, null);
  }
  const fold = PAGE.slice(PAGE.indexOf("function compoFold(vm)"), PAGE.indexOf("function statsBlocs(vm)"));
  assert.match(fold, /if\(!cols\)return '';/, "onze vide des deux cotes : bloc masque");
});

test("buts attendus du modele absents : jamais remplaces par l'xG des equipes, jamais 0,00", () => {
  const vm = buildMatchViewModel(base({ model_output_available: true, data_quality_score: 70, match_stats_home: STATS_OK, match_stats_away: STATS_OK, lambda_h: null, lambda_a: "" }));
  assert.equal(vm.model.expectedGoals, null);
  assert.equal(display.expectedGoalsForDisplay({ lambda_h: null, lambda_a: null }), null);
});

test("probabilites et simulation par quart d'heure incompletes : blocs masques (pas de 0 %)", () => {
  const vm = buildMatchViewModel(base({ model_output_available: true, data_quality_score: 70, p1: 40, pn: null, p2: 30,
    lambda_h: 1.4, lambda_a: 1.1, sim_15min: { tr: [0.2, 0.2, null, 0.2, 0.2, 0.3], premier: { h: 0.4, a: null, n: 0.2 } } }));
  assert.equal(vm.model.probabilities, null, "un nul manquant -> pas de « 0 % »");
  assert.equal(vm.model.goalSimulation, null, "une tranche manquante -> pas de « 0 % » sur la tranche");
});

test("cotes « -- », vides ou aberrantes (1,00) : ni comptees ni affichees", () => {
  const vm = buildMatchViewModel(base({ c1: "--", cn: "", c2: null, co25: "1.00", cu25: "1.90", cbtts: "1.80", cbtts_non: "1.95", dc1x: "1.01",
    model_output_available: true, data_quality_score: 70, p1: 40, pn: 30, p2: 30, po25: 55, btts: 50 }));
  assert.equal(vm.teaser.oddsCount, 4, "seules cu25, cbtts, cbtts_non et dc1x (1,01) sont des cotes");
  const ligne = id => vm.model.marketTable.find(r => r.id === id);
  assert.equal(ligne("home-win").odds, null, "« -- » -> non disponible");
  assert.equal(ligne("draw").odds, null, "vide -> non disponible, jamais 0");
  assert.equal(ligne("away-win").odds, null);
  assert.equal(ligne("over-25").odds, null, "1,00 -> aberrante, non affichee");
  assert.equal(ligne("over-25").market, null, "pas de chance sans marge tiree d'une cote aberrante");
  sansValeurCassee(vm);
});

test("arbitre absent ou sans nom : aucune rubrique (jamais « undefined »)", () => {
  assert.equal(buildMatchViewModel(base({ arbitre: null })).referee, null);
  assert.equal(buildMatchViewModel(base({ arbitre: {} })).referee, null);
  assert.equal(buildMatchViewModel(base({ arbitre: { nom: "  " } })).referee, null);
  const r = buildMatchViewModel(base({ arbitre: { nom: "C. Turpin", cartons: null } })).referee;
  assert.equal(r.cardsPerMatch, null, "cartons absents -> null, jamais 0");
});

test("meteo absente, sans source ou sans valeur : rien d'affiche", () => {
  assert.equal(display.weatherForDisplay(null), null);
  assert.equal(display.weatherForDisplay({ nom: "X", temp: "21C", desc: "ciel dégagé" }), null, "sans source : masquee");
  assert.equal(display.weatherForDisplay({ nom: "X", temp: "", desc: "", meteo: "", weather_source: "openweathermap", weather_forecast_at: "2026-10-01T00:00:00Z" }), null);
  const w = display.weatherForDisplay({ temp: "21C", desc: "", weather_source: "openweathermap", weather_forecast_at: "2026-10-01T00:00:00Z" });
  assert.equal(w.temperature, "21C");
});

test("blessures non relevees : rien d'invente (ni absence, ni « source blessures »)", () => {
  const vm = buildMatchViewModel(base({ injuries: [], injuries_fetch_ok: false }));
  assert.equal(vm.players.injuriesFetchOk, false);
  assert.deepEqual(vm.players.absences, { home: [], away: [] });
  assert.ok(!vm.model.sources.includes("Blessures et suspensions"));
});

test("buteurs : sans liste du moteur v3, aucune chance de marquer affichee", () => {
  const vm = buildMatchViewModel(base({ model_output_available: true, data_quality_score: 70 }));
  assert.deepEqual(vm.players.scoringThreat, []);
});

test("donnees de qualite absentes : null, jamais « qualite 0 »", () => {
  assert.equal(buildMatchViewModel(base({ data_quality_score: null })).model.quality, null);
});

// Les fichiers match/*.json presents dans le depot, avec chaque famille de champs retiree
// tour a tour : jamais NaN/undefined, jamais un 0 tire d'une valeur absente.
test("fichiers match/*.json reels, champs retires un a un : aucune valeur cassee", () => {
  const dir = path.join(root, "match");
  const fichiers = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f)) : [];
  const RETIRER = [["form_home", "form_away"], ["classement"], ["h2h"], ["lineups"], ["match_stats_home", "match_stats_away"], ["events_home", "events_away"],
    ["c1", "cn", "c2", "co25", "cu25", "cbtts", "cbtts_non"], ["arbitre"], ["stade"], ["injuries", "injuries_fetch_ok"], ["hot_scorer_home", "hot_scorer_away", "player_history", "current_squads"]];
  let vus = 0;
  for (const f of fichiers.slice(0, 40)) {
    let raw; try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { continue; }
    vus++;
    sansValeurCassee(buildMatchViewModel(raw));
    for (const champs of RETIRER) {
      const copie = { ...raw };
      champs.forEach(c => { delete copie[c]; });
      const vm = buildMatchViewModel(copie);
      sansValeurCassee(vm);
      if (champs.includes("match_stats_home")) { assert.equal(vm.comparison === null || vm.comparison.rows.every(r => !["Tirs", "Possession", "Corners"].includes(r.label)), true, f); assert.equal(vm.shotStats, null, f); }
      if (champs.includes("h2h")) assert.equal(vm.h2h, null, f);
      if (champs.includes("lineups")) assert.notEqual(vm.players.lineupMode, "OFFICIAL", f);
      if (champs.includes("arbitre")) assert.equal(vm.referee, null, f);
      if (champs.includes("stade")) assert.equal(vm.conditions.weather, null, f);
      if (champs.includes("classement")) assert.equal(vm.identity.standings, null, f);
      if (champs.includes("c1")) assert.ok(vm.teaser.oddsCount <= 7, f);
    }
    // Toutes les stats d'equipe a null (cas reel des coupes d'Europe).
    const nulles = buildMatchViewModel({ ...raw, match_stats_home: STATS_NULLES, match_stats_away: STATS_NULLES });
    assert.equal(nulles.shotStats, null, f);
    assert.equal(nulles.editorial.exclusiveFacts.xg, null, f);
    if (nulles.comparison) nulles.comparison.rows.forEach(r => assert.ok(["Buts marqués", "Buts concédés"].includes(r.label), f + " " + r.label));
  }
  assert.ok(vus > 0 || !fichiers.length);
});
