"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveMarketWin, classifyFixtureStatus } = require("../lib/resolvers.js");

test("resolveMarketWin: marchés première mi-temps utilisent le score à la pause", () => {
  assert.equal(resolveMarketWin("Premiere mi-temps plus de 0.5 but", 2, 1, { halftimeHome: 1, halftimeAway: 0 }), true);
  assert.equal(resolveMarketWin("Premiere mi-temps moins de 1.5 but", 2, 2, { halftimeHome: 1, halftimeAway: 0 }), true);
  assert.equal(resolveMarketWin("Premiere mi-temps plus de 0.5 but", 2, 1), null);
});

test("resolveMarketWin: gagne les deux mi-temps vérifie séparément chaque période", () => {
  assert.equal(resolveMarketWin("Domicile gagne les deux mi-temps", 3, 0, { halftimeHome: 1, halftimeAway: 0 }), true);
  assert.equal(resolveMarketWin("Domicile gagne les deux mi-temps", 2, 1, { halftimeHome: 1, halftimeAway: 0 }), false);
});

test("resolveMarketWin: totaux tirs utilisent les statistiques finales", () => {
  assert.equal(resolveMarketWin("Tirs du match over 23.5", 1, 1, { totalShots: 27 }), true);
  assert.equal(resolveMarketWin("Tirs cadres du match under 8.5", 1, 1, { totalShotsOnTarget: 7 }), true);
  assert.equal(resolveMarketWin("Tirs du match over 23.5", 1, 1), null);
});

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
test("resolveMarketWin: DC 12 gagne seulement si le match ne finit pas nul", () => {
  assert.equal(resolveMarketWin("DC 12", 2, 1), true);
  assert.equal(resolveMarketWin("DC 12", 1, 2), true);
  assert.equal(resolveMarketWin("DC 12", 1, 1), false);
});

test("resolveMarketWin: totaux equipe utilisent uniquement les buts de l'equipe concernee", () => {
  assert.equal(resolveMarketWin("Domicile plus de 1.5 but", 2, 0), true);
  assert.equal(resolveMarketWin("Domicile plus de 1.5 but", 1, 4), false);
  assert.equal(resolveMarketWin("Exterieur moins de 1.5 but", 4, 1), true);
});

test("resolveMarketWin: victoire sans encaisser exige simultanement victoire et clean sheet", () => {
  assert.equal(resolveMarketWin("Domicile gagne sans encaisser", 2, 0), true);
  assert.equal(resolveMarketWin("Domicile gagne sans encaisser", 2, 1), false);
  assert.equal(resolveMarketWin("Exterieur gagne sans encaisser", 0, 1), true);
});

test("resolveMarketWin: combines resultat + total exigent les deux conditions", () => {
  assert.equal(resolveMarketWin("Domicile gagne + plus de 2.5 buts", 2, 1), true);
  assert.equal(resolveMarketWin("Domicile gagne + plus de 2.5 buts", 1, 2), false);
  assert.equal(resolveMarketWin("Domicile gagne + moins de 3.5 buts", 2, 0), true);
  assert.equal(resolveMarketWin("Domicile gagne + moins de 3.5 buts", 3, 1), false);
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
