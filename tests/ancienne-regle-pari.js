"use strict";
// ANCIENNE REGLE DU PARI (avant la decision de Clement du 11/11/2026) : fourchette 1,40-2,20, marches connus du 21/10,
// cote agreee d'abord. Elle reste dans le code (retour arriere par config/marches-pari.json#choix_du_pari.regle) ; les
// tests ecrits pour elle la remettent EN MEMOIRE avec ce module (aucun fichier modifie). La regle du 11/11 (Bet365,
// 1,70-3,50, tous les marches) a ses propres tests : tests/paris-tous-marches-bet365.test.js.
const LIGUES = require("../config/leagues.json");
const MARCHES = require("../config/marches-pari.json");

LIGUES.fiabilite.fourchette_pari = { cote_min: 1.40, cote_max: 2.20, marge_sans_agree: 0 };
MARCHES.choix_du_pari = Object.assign({}, MARCHES.choix_du_pari, { regle: "ancienne_regle_21_10" });

module.exports = { fourchette: LIGUES.fiabilite.fourchette_pari };
