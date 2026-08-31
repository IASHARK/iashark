"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveMarketWin, classifyFixtureStatus } = require("../lib/resolvers.js");

// --- Over/Under ---
test("resolveMarketWin: Over 2.5 gagne sur 3 buts ou plus", () => {
  assert.equal(resolveMarketWin("Over 2.5", 2, 1), true);
  assert.equal(resolveMarketWin("Over 2.5", 1, 1), false);
});
test("resolveMarketWin: Under 2.5 gagne sur 2 buts ou moins", () => {
  assert.equal(resolveMarketWin("Under 2.5", 1, 1), true);
  assert.equal(resolveMarketWin("Under 2.5", 2, 1), false);
});
test("resolveMarketWin: Over/Under 1.5 et 3.5 aussi geres", () => {
  assert.equal(resolveMarketWin("Over 1.5", 1, 1), true);
  assert.equal(resolveMarketWin("Over 1.5", 1, 0), false);
  assert.equal(resolveMarketWin("Over 3.5", 2, 2), true);
  assert.equal(resolveMarketWin("Over 3.5", 2, 1), false);
});
test("resolveMarketWin: lignes O/U generiques 0.5 a 6.5 (MASTER V2.1 §8.1, pas seulement 1.5/2.5/3.5)", () => {
  assert.equal(resolveMarketWin("Over 0.5", 1, 0), true);
  assert.equal(resolveMarketWin("Over 0.5", 0, 0), false);
  assert.equal(resolveMarketWin("Over 4.5", 3, 2), true);
  assert.equal(resolveMarketWin("Over 4.5", 2, 2), false);
  assert.equal(resolveMarketWin("Over 5.5", 3, 3), true);
  assert.equal(resolveMarketWin("Over 6.5", 4, 3), true);
  assert.equal(resolveMarketWin("Over 6.5", 3, 3), false);
  assert.equal(resolveMarketWin("Under 1.5", 1, 0), true);
  assert.equal(resolveMarketWin("Under 1.5", 1, 1), false);
  assert.equal(resolveMarketWin("Under 3.5", 2, 1), true);
  assert.equal(resolveMarketWin("Under 3.5", 2, 2), false);
});

// --- BTTS ---
test("resolveMarketWin: BTTS Oui gagne si les deux equipes marquent", () => {
  assert.equal(resolveMarketWin("BTTS Oui", 1, 1), true);
  assert.equal(resolveMarketWin("BTTS Oui", 1, 0), false);
});
test("resolveMarketWin: BTTS Non gagne si une equipe reste a 0", () => {
  assert.equal(resolveMarketWin("BTTS Non", 2, 0), true);
  assert.equal(resolveMarketWin("BTTS Non", 0, 0), true);
  assert.equal(resolveMarketWin("BTTS Non", 1, 1), false);
});

// --- Double Chance ---
test("resolveMarketWin: DC 1X gagne sur victoire domicile ou nul", () => {
  assert.equal(resolveMarketWin("DC 1X", 2, 0), true);
  assert.equal(resolveMarketWin("DC 1X", 1, 1), true);
  assert.equal(resolveMarketWin("DC 1X", 0, 1), false);
});
test("resolveMarketWin: DC X2 gagne sur victoire exterieur ou nul", () => {
  assert.equal(resolveMarketWin("DC X2", 0, 1), true);
  assert.equal(resolveMarketWin("DC X2", 1, 1), true);
  assert.equal(resolveMarketWin("DC X2", 2, 0), false);
});

// --- Victoire seche (1X2 partiel) ---
test("resolveMarketWin: Victoire Domicile / Exterieur", () => {
  assert.equal(resolveMarketWin("Victoire Domicile", 2, 1), true);
  assert.equal(resolveMarketWin("Victoire Domicile", 1, 1), false);
  assert.equal(resolveMarketWin("Victoire Exterieur", 0, 1), true);
  assert.equal(resolveMarketWin("Victoire Exterieur", 1, 1), false);
});
test("resolveMarketWin: pas d'inversion domicile/exterieur (regression test explicite)", () => {
  // Un score domicile>exterieur ne doit JAMAIS faire gagner "Victoire Exterieur".
  assert.equal(resolveMarketWin("Victoire Exterieur", 3, 0), false);
  assert.equal(resolveMarketWin("Victoire Domicile", 0, 3), false);
});

// --- Handicap (avec push/VOID) ---
test("resolveMarketWin: Handicap +0.5 Exterieur - cas reel de historique.json", () => {
  assert.equal(resolveMarketWin("Handicap +0.5 Extérieur", 2, 0), false); // domicile gagne large
  assert.equal(resolveMarketWin("Handicap +0.5 Extérieur", 1, 1), true);  // nul -> +0.5 suffit
  assert.equal(resolveMarketWin("Handicap +0.5 Extérieur", 0, 1), true); // exterieur gagne
});
test("resolveMarketWin: Handicap entier peut produire un VOID (push)", () => {
  assert.equal(resolveMarketWin("Handicap -1 Domicile", 2, 0), true);   // adj home=1 > away 0
  assert.equal(resolveMarketWin("Handicap -1 Domicile", 1, 0), "void"); // adj home=0 = away 0 -> push
  assert.equal(resolveMarketWin("Handicap -1 Domicile", 0, 0), false);  // adj home=-1 < away 0
});
test("resolveMarketWin: Handicap 0 equivaut a Draw No Bet (push sur match nul)", () => {
  assert.equal(resolveMarketWin("Handicap 0 Domicile", 1, 1), "void");
  assert.equal(resolveMarketWin("Handicap 0 Domicile", 2, 1), true);
  assert.equal(resolveMarketWin("Handicap 0 Domicile", 1, 2), false);
});
test("resolveMarketWin: Handicap sans ligne numerique ou sans cote reconnue -> null", () => {
  assert.equal(resolveMarketWin("Handicap Domicile", 1, 0), null); // pas de ligne chiffree
  assert.equal(resolveMarketWin("Handicap +0.5", 1, 0), null);     // pas de cote dom/ext
});
test("resolveMarketWin: Handicap quart de ligne (.25/.75) -> null explicite, jamais un WIN/LOSS complet errone", () => {
  // Asian Handicap -0.25/-0.75 : le vrai settlement split la mise sur deux
  // lignes (demi-gain/demi-perte possible), pas gere par ce resolver -
  // refuser plutot que de mal compter un demi-perdant comme perte complete.
  assert.equal(resolveMarketWin("Handicap -0.25 Domicile", 1, 1), null);
  assert.equal(resolveMarketWin("Handicap +0.75 Exterieur", 1, 0), null);
  assert.equal(resolveMarketWin("Handicap -1.25 Domicile", 2, 1), null);
});
test("resolveMarketWin: Handicap demi-ligne (.5) fonctionne normalement (pas confondu avec un quart)", () => {
  assert.equal(resolveMarketWin("Handicap -0.5 Domicile", 1, 1), false);
  assert.equal(resolveMarketWin("Handicap -0.5 Domicile", 2, 1), true);
});

// --- Draw No Bet ---
test("resolveMarketWin: DNB Domicile - gagne, perd, void sur nul", () => {
  assert.equal(resolveMarketWin("DNB Domicile", 2, 0), true);
  assert.equal(resolveMarketWin("DNB Domicile", 0, 2), false);
  assert.equal(resolveMarketWin("DNB Domicile", 1, 1), "void");
});
test("resolveMarketWin: DNB Exterieur - gagne, perd, void sur nul", () => {
  assert.equal(resolveMarketWin("DNB Exterieur", 0, 2), true);
  assert.equal(resolveMarketWin("DNB Exterieur", 2, 0), false);
  assert.equal(resolveMarketWin("DNB Exterieur", 1, 1), "void");
});
test("resolveMarketWin: DNB sans cote reconnue -> null", () => {
  assert.equal(resolveMarketWin("DNB", 2, 0), null);
});

// --- Nul (branche existante, non testee jusqu'ici) ---
test("resolveMarketWin: Nul/Draw", () => {
  assert.equal(resolveMarketWin("Nul", 1, 1), true);
  assert.equal(resolveMarketWin("Nul", 1, 0), false);
  assert.equal(resolveMarketWin("Draw", 2, 2), true);
});

// --- Marche non reconnu / inputs invalides ---
test("resolveMarketWin: marche totalement inconnu -> null (jamais false par defaut)", () => {
  assert.equal(resolveMarketWin("Un marche qui n'existe pas", 1, 1), null);
  assert.equal(resolveMarketWin("", 1, 1), null);
  assert.equal(resolveMarketWin(undefined, 1, 1), null);
});
test("resolveMarketWin: scores manquants/invalides -> null, jamais un resultat invente", () => {
  assert.equal(resolveMarketWin("Over 2.5", null, 1), null);
  assert.equal(resolveMarketWin("Over 2.5", 1, undefined), null);
  assert.equal(resolveMarketWin("Over 2.5", NaN, 1), null);
});
test("resolveMarketWin: score 0-0 gere sans crash sur tous les marches", () => {
  assert.equal(resolveMarketWin("Over 2.5", 0, 0), false);
  assert.equal(resolveMarketWin("BTTS Oui", 0, 0), false);
  assert.equal(resolveMarketWin("BTTS Non", 0, 0), true);
  assert.equal(resolveMarketWin("DC 1X", 0, 0), true);
});
test("resolveMarketWin: score tres eleve (cas limite) sans crash", () => {
  assert.equal(resolveMarketWin("Over 2.5", 10, 8), true);
  assert.equal(resolveMarketWin("Handicap -5 Domicile", 10, 2), true);
});

// --- Clean Sheet / Gagne Sans Encaisser (Win To Nil) ---
test("resolveMarketWin: Clean Sheet Domicile - depend uniquement des buts adverses, peu importe si le domicile marque", () => {
  assert.equal(resolveMarketWin("Clean Sheet Domicile", 2, 0), true, "domicile marque 2, exterieur 0 -> clean sheet domicile vrai");
  assert.equal(resolveMarketWin("Clean Sheet Domicile", 0, 0), true, "0-0 est aussi un clean sheet domicile");
  assert.equal(resolveMarketWin("Clean Sheet Domicile", 1, 1), false);
});
test("resolveMarketWin: Clean Sheet Exterieur - symetrique", () => {
  assert.equal(resolveMarketWin("Clean Sheet Exterieur", 0, 3), true);
  assert.equal(resolveMarketWin("Clean Sheet Exterieur", 1, 0), false);
});
test("resolveMarketWin: Gagne Sans Encaisser Domicile - GAGNE ET ne concede rien, distinct du clean sheet seul", () => {
  assert.equal(resolveMarketWin("Gagne Sans Encaisser Domicile", 2, 0), true);
  assert.equal(resolveMarketWin("Gagne Sans Encaisser Domicile", 0, 0), false, "0-0 est un clean sheet mais PAS un win to nil - le domicile n'a pas gagne");
});
test("resolveMarketWin: Gagne Sans Encaisser Exterieur - symetrique", () => {
  assert.equal(resolveMarketWin("Gagne Sans Encaisser Exterieur", 0, 2), true);
  assert.equal(resolveMarketWin("Gagne Sans Encaisser Exterieur", 1, 1), false);
});

// --- Total par equipe ---
test("resolveMarketWin: Total Domicile Over/Under - porte sur les buts d'UNE SEULE equipe, jamais le total du match", () => {
  assert.equal(resolveMarketWin("Total Domicile Over 1.5", 2, 3), true, "domicile seul a 2 buts > 1.5, peu importe le total du match (5)");
  assert.equal(resolveMarketWin("Total Domicile Under 1.5", 2, 0), false);
  assert.equal(resolveMarketWin("Total Exterieur Over 1.5", 0, 2), true);
  assert.equal(resolveMarketWin("Total Exterieur Under 1.5", 3, 2), false);
});

// --- Marches combines (resultat + condition) ---
test("resolveMarketWin: Victoire Domicile & Over 2.5 - les DEUX conditions doivent etre vraies", () => {
  assert.equal(resolveMarketWin("Victoire Domicile & Over 2.5", 3, 1), true, "domicile gagne (3>1) ET total=4>2.5");
  assert.equal(resolveMarketWin("Victoire Domicile & Over 2.5", 1, 0), false, "domicile gagne mais total=1, pas over 2.5 -> perdu");
  assert.equal(resolveMarketWin("Victoire Domicile & Over 2.5", 1, 3), false, "over 2.5 vrai (total=4) mais domicile NE gagne PAS -> perdu, pas juste ignore");
});
test("resolveMarketWin: Nul & Under 2.5", () => {
  assert.equal(resolveMarketWin("Nul & Under 2.5", 1, 1), true, "nul et total=2 < 2.5");
  assert.equal(resolveMarketWin("Nul & Under 2.5", 2, 2), false, "nul mais total=4, pas under 2.5");
});
test("resolveMarketWin: Victoire Exterieur & BTTS / Non BTTS", () => {
  assert.equal(resolveMarketWin("Victoire Exterieur & BTTS", 1, 2), true, "exterieur gagne et les deux marquent");
  assert.equal(resolveMarketWin("Victoire Exterieur & BTTS", 0, 2), false, "exterieur gagne mais domicile n'a pas marque -> pas BTTS");
  assert.equal(resolveMarketWin("Victoire Domicile & Non BTTS", 2, 0), true, "domicile gagne, exterieur n'a pas marque -> non BTTS vrai");
});
test("resolveMarketWin: marche combine avec un separateur '&' mais un contenu non reconnu -> null, jamais un resultat invente", () => {
  assert.equal(resolveMarketWin("Truc & Bidule", 1, 0), null);
});

// --- Statut fixture -> VOID/FINISHED/PENDING ---
test("classifyFixtureStatus: statuts d'annulation -> VOID", () => {
  assert.equal(classifyFixtureStatus("PST"), "VOID");
  assert.equal(classifyFixtureStatus("CANC"), "VOID");
  assert.equal(classifyFixtureStatus("ABD"), "VOID");
});
test("classifyFixtureStatus: statuts termines -> FINISHED", () => {
  assert.equal(classifyFixtureStatus("FT"), "FINISHED");
  assert.equal(classifyFixtureStatus("AET"), "FINISHED");
  assert.equal(classifyFixtureStatus("PEN"), "FINISHED");
});
test("classifyFixtureStatus: en cours / a venir -> PENDING", () => {
  assert.equal(classifyFixtureStatus("NS"), "PENDING");
  assert.equal(classifyFixtureStatus("1H"), "PENDING");
  assert.equal(classifyFixtureStatus("LIVE"), "PENDING");
  assert.equal(classifyFixtureStatus(""), "PENDING");
});
