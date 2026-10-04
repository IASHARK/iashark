"use strict";
// Cles The Odds API de config/leagues.json (29/09/2026) : la Ligue 1 portait
// « soccer_france_ligue_1 », qui n'existe pas (la vraie cle, verifiee par un appel
// a l'API /sports, est « soccer_france_ligue_one ») : la Ligue 1 ne recevait
// aucune cote par cette voie. Liste de reference ci-dessous : cles publiees par
// The Odds API. Les 9 premieres ont ete vues dans une vraie reponse de l'API
// (iashark-preuve) ; les autres sont a reverifier au prochain appel a /sports.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CLES_API = {
  // vues dans une reponse reelle de l'API
  soccer_epl: "Premier League", soccer_spain_la_liga: "LaLiga", soccer_italy_serie_a: "Serie A",
  soccer_germany_bundesliga: "Bundesliga", soccer_france_ligue_one: "Ligue 1",
  soccer_uefa_champs_league: "Ligue des champions", soccer_uefa_europa_league: "Ligue Europa",
  soccer_uefa_europa_conference_league: "Ligue Conference", soccer_netherlands_eredivisie: "Eredivisie",
  soccer_portugal_primeira_liga: "Primeira Liga",
  // publiees par l'API, pas encore revues dans une reponse locale
  soccer_usa_mls: "MLS", soccer_sweden_allsvenskan: "Allsvenskan", soccer_japan_j_league: "J League",
  soccer_mexico_ligamx: "Liga MX", soccer_argentina_primera_division: "Argentine", soccer_chile_campeonato: "Chili",
};

const cfg = require(path.join(__dirname, "..", "config", "leagues.json"));
const ligues = Array.isArray(cfg) ? cfg : (cfg.leagues || []);

test("chaque cle The Odds API de config/leagues.json existe dans la liste de l'API", () => {
  const avec = ligues.filter((l) => l && l.oddsSportKey);
  assert.ok(avec.length >= 10);
  for (const l of avec) assert.ok(Object.prototype.hasOwnProperty.call(CLES_API, l.oddsSportKey), l.key + " : cle inconnue " + l.oddsSportKey);
});

test("Ligue 1 : soccer_france_ligue_one (et plus jamais soccer_france_ligue_1)", () => {
  const l1 = ligues.find((l) => l && l.key === "ligue1");
  assert.equal(l1.oddsSportKey, "soccer_france_ligue_one");
  assert.ok(!JSON.stringify(cfg).includes("soccer_france_ligue_1"));
});
