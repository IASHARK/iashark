"use strict";
// LIGUE DES NATIONS (demande de Clement du 10/11/2026) : le pari d'un match de selections se choisit parmi les marches
// demandes ; la liste /players/squads d'API-Football (perimee pour les selections, controle de l'ingenieur donnees du
// 10/11/2026) n'est plus lue pour une selection.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const P = require("../lib/pronostic.js");
const LIGUES = require("../config/leagues.json");
const WF = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
const SCRIPT_JOUR = fs.readFileSync(path.join(__dirname, "..", "scripts", "buteurs-jour-de-match.js"), "utf8");

test("pari d'un match de selections : seulement les marches de config/leagues.json#marches_selections_nationales", () => {
  assert.deepEqual(P.marchesSelections(LIGUES), ["home-win", "away-win", "dc-1x", "dc-x2", "dc-12", "over-25", "under-25", "under-35", "btts-yes"]);
  const ctx = { marchesSelections: P.marchesSelections(LIGUES) };
  const ldn = { league_id: 5, league: "UEFA Nations League", league_key: "nations_league" };
  const club = { league_id: 61, league: "Ligue 1", league_key: "ligue1" };
  assert.equal(P.marcheAutoriseDuMatch(ldn, "over-15", ctx), false);
  assert.equal(P.marcheAutoriseDuMatch(ldn, "over-35", ctx), false);
  assert.equal(P.marcheAutoriseDuMatch(ldn, "btts-no", ctx), false, "« les deux marquent : non » reste cache (verdict du 06/10)");
  assert.equal(P.marcheAutoriseDuMatch(ldn, "under-35", ctx), true);
  assert.equal(P.marcheAutoriseDuMatch(ldn, "fh-over-05", ctx), false);
  assert.equal(P.marcheAutoriseDuMatch(club, "over-15", ctx), true, "clubs : marches connus inchanges");
  assert.equal(P.marcheAutoriseDuMatch(ldn, "over-15", { marchesSelections: null }), true, "liste absente : marches connus");
  // Choix complet : « plus de 1,5 » (le plus probable, 1,45) n'est jamais pris pour une selection ; il l'est pour un club.
  const v = (a) => a.map(([value, odd]) => ({ value, odd: String(odd) }));
  const bets = [{ id: 1, name: "Match Winner", values: v([["Home", 2.5], ["Draw", 3.1], ["Away", 3.0]]) },
    { id: 5, name: "Goals Over/Under", values: v([["Over 1.5", 1.45], ["Under 1.5", 2.7], ["Over 3.5", 3.4], ["Under 3.5", 1.3], ["Over 2.5", 2.3], ["Under 2.5", 1.6]]) }];
  const raw = { bookmakers: [{ name: "Bet365", bets }] };
  const mk = (id, base) => Object.assign({ id, home: { n: "Turquie" }, away: { n: "Belgique" }, date: "2026-11-12 18:00", status: "NS", no_signal: true, pari_rec: "", league_reliability: "en_test" }, base);
  const m = mk(9001, ldn), c = mk(9002, club);
  P.publierPronostics([m, c], [], { configLigues: LIGUES, figes: {}, fluxPar: { 9001: { raw }, 9002: { raw } } });
  assert.equal(c.market_id, "over-15");
  assert.ok(P.marchesSelections(LIGUES).includes(m.market_id), "pari hors de la liste : " + m.market_id);
});

test("selections : la liste /players/squads d'API-Football n'est plus lue (calcul du matin et jour de match)", () => {
  assert.match(WF, /var SEL_SQUAD_OFF=isInternationalMatch\|\|SELECTIONS\.estSelectionNationale\(\{league_id:lg\.id,league:lg\.name\}\);/);
  assert.match(WF, /SEL_SQUAD_OFF\?\[\]:getCurrentSquad\(home\.id\),SEL_SQUAD_OFF\?\[\]:getCurrentSquad\(away\.id\)/);
  assert.doesNotMatch(SCRIPT_JOUR, /players\/squads\?team=/);
});
