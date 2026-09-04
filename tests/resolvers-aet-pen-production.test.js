"use strict";
// BLOCKER_IMPLEMENTATION (corrige le 2026-09-04) : le pipeline production
// (.github/workflows/update-data.yml, resolution des paris "hier") lisait
// fix.goals.{home,away} pour regler 1X2/O-U/BTTS - ce champ API-Football
// est le score FINAL, qui inclut la prolongation (AET) pour un match qui
// y est alle. Corrige via lib/resolvers.js#extractRegulationScore, qui
// lit score.fulltime.* (90 min reglementaires) en priorite, avec repli
// sur goals.* UNIQUEMENT pour un statut FT simple (ou les deux coincident
// par definition). Meme logique que lib/data/fixtures-normalizer.js
// (deja corrige cote laboratoire, GATE B3) - desormais coherente aussi
// cote pipeline production.

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractRegulationScore, resolveMarketWin } = require("../lib/resolvers.js");

// Fixture synthetique au format API-Football reel : 90 min = 1-1, but
// encaisse en prolongation -> AET = 2-1. Statut short = 'AET'.
function buildAetFixture(fulltimeHome, fulltimeAway, finalHome, finalAway, status) {
  return {
    fixture: { id: 999001, status: { short: status || "AET" } },
    teams: { home: { id: 1, name: "Home FC" }, away: { id: 2, name: "Away FC" } },
    goals: { home: finalHome, away: finalAway }, // score FINAL (ET inclus)
    score: {
      halftime: { home: 0, away: 0 },
      fulltime: { home: fulltimeHome, away: fulltimeAway }, // score REGLEMENTAIRE (90 min)
      extratime: { home: finalHome - fulltimeHome, away: finalAway - fulltimeAway },
      penalty: { home: null, away: null },
    },
  };
}

test("extractRegulationScore: match AET 90min=1-1 / final=2-1 -> extrait 1-1 (reglementaire), jamais 2-1 (final)", () => {
  const fix = buildAetFixture(1, 1, 2, 1, "AET");
  const { gh, ga } = extractRegulationScore(fix);
  assert.equal(gh, 1, "gh doit etre le score reglementaire (1), pas le score final (2)");
  assert.equal(ga, 1);
});

test("SCENARIO UTILISATEUR - 90min=1-1, AET=2-1 : 1X2=Nul, O2.5=Perdu, BTTS=Gagne (PAS Domicile/Over/BTTS-sur-le-mauvais-score)", () => {
  const fix = buildAetFixture(1, 1, 2, 1, "AET");
  const { gh, ga } = extractRegulationScore(fix);

  assert.equal(resolveMarketWin("Nul", gh, ga), true, "1X2 doit resoudre Nul (1-1 reglementaire), pas Domicile (2-1 final)");
  assert.equal(resolveMarketWin("Victoire Domicile", gh, ga), false, "Domicile ne doit PAS gagner - le nul reglementaire n'est pas une victoire domicile");
  assert.equal(resolveMarketWin("Over 2.5", gh, ga), false, "O2.5 doit Perdre (total=2 reglementaire), pas Gagner (total=3 sur le score final)");
  assert.equal(resolveMarketWin("BTTS Oui", gh, ga), true, "BTTS doit Gagner (1-1, les deux equipes ont marque avant prolongation)");

  // Preuve directe que l'ancien bug (lire fix.goals au lieu de score.fulltime)
  // aurait produit les MAUVAISES resolutions listees par l'utilisateur.
  const buggyGh = fix.goals.home, buggyGa = fix.goals.away; // 2-1
  assert.equal(resolveMarketWin("Victoire Domicile", buggyGh, buggyGa), true, "preuve du bug : sur le score final (2-1), Domicile gagnait a tort");
  assert.equal(resolveMarketWin("Over 2.5", buggyGh, buggyGa), true, "preuve du bug : sur le score final (2-1, total=3), O2.5 gagnait a tort");
});

test("cas ou BTTS diverge aussi entre reglementaire et final : 90min=1-0 (BTTS Non), AET=1-1 (BTTS Oui sur le mauvais score)", () => {
  const fix = buildAetFixture(1, 0, 1, 1, "AET"); // l'exterieur egalise en prolongation
  const { gh, ga } = extractRegulationScore(fix);
  assert.equal(gh, 1); assert.equal(ga, 0);
  assert.equal(resolveMarketWin("BTTS Non", gh, ga), true, "reglementaire (1-0) : BTTS Non doit gagner, l'exterieur n'a pas marque en 90 min");
  assert.equal(resolveMarketWin("BTTS Oui", gh, ga), false);

  const buggyGh = fix.goals.home, buggyGa = fix.goals.away; // 1-1 (avec le but de prolongation)
  assert.equal(resolveMarketWin("BTTS Oui", buggyGh, buggyGa), true, "preuve du bug : sur le score final (1-1, but de prolongation inclus), BTTS Oui gagnait a tort");
});

test("match PEN (tirs au but) : score reglementaire = fin des prolongations, jamais les buts de la seance de tirs au but", () => {
  // 90 min = 1-1, prolongation = 1-1 (pas de but supplementaire), puis
  // tirs au but 5-4 - score.fulltime reste 1-1 (les buts de tab ne sont
  // JAMAIS dans goals.* ni score.fulltime.* chez API-Football, mais un
  // pipeline naif pourrait etre tente de les compter si mal cable).
  const fix = buildAetFixture(1, 1, 1, 1, "PEN");
  fix.score.penalty = { home: 5, away: 4 };
  const { gh, ga } = extractRegulationScore(fix);
  assert.equal(gh, 1); assert.equal(ga, 1);
  assert.equal(resolveMarketWin("Nul", gh, ga), true, "1X2 reglementaire doit rester Nul, jamais influence par le score des tirs au but (5-4)");
});

test("match FT simple (pas de prolongation) : fulltime et goals coincident, extraction identique dans les deux cas", () => {
  const fix = {
    fixture: { id: 999002, status: { short: "FT" } },
    teams: { home: { id: 1, name: "Home FC" }, away: { id: 2, name: "Away FC" } },
    goals: { home: 2, away: 0 },
    score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 0 }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
  };
  const { gh, ga } = extractRegulationScore(fix);
  assert.equal(gh, 2); assert.equal(ga, 0);
});

test("repli explicite : statut FT mais score.fulltime absent -> repli sur goals.* (les deux coincident par definition sur un FT simple, jamais une fabrication)", () => {
  const fix = {
    fixture: { id: 999003, status: { short: "FT" } },
    goals: { home: 3, away: 1 },
    score: { halftime: { home: 1, away: 0 } }, // pas de fulltime dans cette reponse
  };
  const { gh, ga } = extractRegulationScore(fix);
  assert.equal(gh, 3); assert.equal(ga, 1);
});

test("statut AET/PEN SANS score.fulltime disponible -> gh/ga null (jamais un repli silencieux sur le score final, qui inclurait la prolongation)", () => {
  const fix = {
    fixture: { id: 999004, status: { short: "AET" } },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 1, away: 0 } }, // fulltime manquant
  };
  const { gh, ga } = extractRegulationScore(fix);
  assert.equal(gh, null, "sans score.fulltime sur un match AET, gh doit rester null - jamais un repli sur le score final qui fausserait le settlement");
  assert.equal(ga, null);
});
