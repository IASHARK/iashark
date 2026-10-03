"use strict";
// Perimetre des competitions (lib/league-scope.js, 30/09/2026) : fiabilite
// « validee / en test », VIP limite aux competitions validees, extension
// passee apres le socle avec plafond et limite de temps, tours amateurs exclus.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const S = require("../lib/league-scope.js");
const CFG = require(path.join(__dirname, "..", "config", "leagues.json"));
// 03/10/2026 : 16 competitions « en test » retirees du site (config/leagues.json#competitions_retirees).
// Les tests du MECANISME (tours exclus, noms, groupes) gardent leurs exemples via CFG_TOUT.
const CFG_TOUT = Object.assign({}, CFG, { leagues: CFG.leagues.concat(CFG.competitions_retirees || []) });
const RETIREES = (CFG.competitions_retirees || []).map((l) => l.apiFootballId);

const NOUVELLES = [40, 41, 42, 62, 79, 141, 136, 144, 203, 179, 197, 71, 218, 207, 119, 103, 106, 180, 307, 5, 32, 81, 137, 143, 45, 66, 89, 80, 345];

test("fiabilite : les 29 nouvelles competitions et les 4 ligues sans famille validee sont « en test »", () => {
  NOUVELLES.filter((id) => !RETIREES.includes(id)).forEach((id) => assert.equal(S.reliabilityFor(CFG, id), "en_test", String(id)));
  // Retirees du site : hors config, aucun libelle.
  RETIREES.concat([288, 239, 281, 265]).forEach((id) => assert.equal(S.reliabilityFor(CFG, id), null, String(id)));
  ["premier", "ligue1", "ldc", "mls", "liga_mx"].forEach((k) => assert.equal(S.reliabilityFor(CFG, k), "validee", k));
  assert.equal(S.reliabilityFor(CFG, 39), "validee");
  assert.equal(S.reliabilityFor(CFG, "39"), "validee");
  // Coupe du monde : collectee a part, hors config -> aucun libelle (inchange).
  assert.equal(S.reliabilityFor(CFG, 1), null);
  assert.equal(S.reliabilityFor(CFG, null), null);
});

test("VIP : seulement les competitions validees de la configuration", () => {
  const vip = S.vipLeagues(CFG).map((l) => l.apiFootballId);
  assert.equal(vip.length, CFG.fiabilite.ligues_validees.length);
  NOUVELLES.forEach((id) => { assert.ok(!vip.includes(id), String(id)); assert.equal(S.isVipEligible(CFG, id), false); });
  assert.equal(S.isVipEligible(CFG, 61), true);
  assert.equal(S.isVipEligible(CFG, 1), false, "hors config : jamais VIP par defaut");
  const keys = CFG.leagues.map((l) => l.key);
  CFG.fiabilite.ligues_validees.forEach((k) => assert.ok(keys.includes(k), "cle validee inconnue : " + k));
});

test("groupe : socle = les 19 d'avant + Ligue des nations ; ligne sans champ = extension", () => {
  assert.equal(S.groupFor(CFG, 39), "socle");
  assert.equal(S.groupFor(CFG_TOUT, 265), "socle");
  assert.equal(S.groupFor(CFG, 5), "socle", "Ligue des nations : deja collectee chaque jour");
  assert.equal(S.groupFor(CFG, 40), "extension");
  assert.equal(S.groupFor(CFG, 1), "socle", "Coupe du monde, hors config");
  assert.equal(CFG.leagues.filter((l) => l.groupe === "socle").length, 16, "20 avant le retrait de South Africa, Colombie, Perou, Chili");
  const cfg = { leagues: [{ key: "x", apiFootballId: 999, displayName: "X" }] };
  assert.equal(S.groupFor(cfg, 999), "extension");
  assert.equal(S.reliabilityFor(cfg, 999), "en_test", "sans liste validee : en test");
});

function fx(id, league, ts, round) {
  return { fixture: { id: id, timestamp: ts, date: new Date(ts * 1000).toISOString() }, league: { id: league, round: round || "Regular Season - 1" }, teams: { home: { id: 1 }, away: { id: 2 } } };
}

test("planFixtures : socle intact et en premier, extension triee par coup d'envoi, plafond, tours exclus", () => {
  const cfg = JSON.parse(JSON.stringify(CFG_TOUT));
  cfg.budgetExtension.maxMatchsParRun = 2;
  const list = [fx(1, 40, 3000), fx(2, 39, 5000), fx(3, 45, 1000, "Extra Preliminary Round"), fx(4, 41, 2000), fx(5, 61, 1000), fx(6, 42, 2500), fx(7, 45, 1500, "3rd Round")];
  const p = S.planFixtures(cfg, list);
  assert.deepEqual(p.fixtures.map((f) => f.fixture.id), [2, 5, 7, 4]);
  assert.equal(p.socle, 2);
  assert.equal(p.extension, 2);
  assert.equal(p.roundsExcluded, 1);
  assert.equal(p.extensionOverCap, 2);
});

test("planFixtures : a plafond atteint, un match deja publie garde sa place", () => {
  const cfg = JSON.parse(JSON.stringify(CFG));
  cfg.budgetExtension.maxMatchsParRun = 1;
  const p = S.planFixtures(cfg, [fx(10, 40, 1000), fx(11, 41, 9000)], { dejaPublies: [11] });
  assert.deepEqual(p.fixtures.map((f) => f.fixture.id), [11]);
});

test("planFixtures : sans extension ni plafond atteint, liste strictement identique (socle)", () => {
  const list = [fx(2, 39, 5000), fx(5, 61, 1000), fx(9, 1, 100)];
  assert.deepEqual(S.planFixtures(CFG, list).fixtures, list);
});

test("tours exclus : FA Cup (tours preliminaires et de qualification), Coupe de France (7e et 8e tours)", () => {
  assert.equal(S.roundExcluded(CFG_TOUT, fx(1, 45, 1, "Preliminary Round Replays")), true);
  assert.equal(S.roundExcluded(CFG_TOUT, fx(1, 45, 1, "4th Round Qualifying")), true);
  assert.equal(S.roundExcluded(CFG_TOUT, fx(1, 45, 1, "3rd Round")), false);
  assert.equal(S.roundExcluded(CFG_TOUT, fx(1, 66, 1, "8th Round")), true);
  assert.equal(S.roundExcluded(CFG_TOUT, fx(1, 66, 1, "Round of 64")), false);
  assert.equal(S.roundExcluded(CFG_TOUT, fx(1, 39, 1, "Preliminary")), false, "sans excludeRounds : jamais exclu");
});

test("limite de temps de l'extension", () => {
  const m = CFG.budgetExtension.minutesMaxDepuisDebut;
  assert.equal(S.extensionTimeUp(CFG, 0, m * 60000), false);
  assert.equal(S.extensionTimeUp(CFG, 0, m * 60000 + 1), true);
  assert.equal(S.extensionTimeUp(CFG, NaN, 1), false);
});

test("nom dans les 7 langues", () => {
  assert.equal(S.nameFor(CFG, 5, "fr"), "Ligue des nations");
  assert.equal(S.nameFor(CFG, 5, "es-mx"), "UEFA Nations League", "priorite au francais : nom anglais ailleurs");
  assert.equal(S.nameFor(CFG_TOUT, 143, "fr"), "Coupe du Roi");
  assert.equal(S.nameFor(CFG, 39, "de"), "Premier League", "sans names : displayName");
  assert.equal(S.nameFor(CFG, 1, "fr"), null);
});
