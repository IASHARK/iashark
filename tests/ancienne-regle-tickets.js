"use strict";
// ANCIENNES BORNES DES COMBINES (avant la regle du 16/11/2026) : jambes 1,40-2,20, petit combine 3 a 5 jambes, grand
// combine 5 a 7 jambes, paliers 1,44 / 1,49 / 1,59 / 2,20, montantes 1,55 et 1,85. Les tests ecrits pour ces bornes
// (mecanique de la recherche, gel, publication) les remettent EN MEMOIRE avec ce module (aucun fichier modifie), comme
// tests/ancienne-regle-pari.js. Les bornes du 16/11 ont leurs propres tests : tests/paris-tous-marches-bet365.test.js.
// Regle du 17/11/2026 (jambes des combines « corrigees », config/tickets.json#jambes_combines) : retiree ici aussi ; elle
// a ses propres tests (tests/tickets-jambes-faciles.test.js).
const REGLES = require("../config/tickets.json");

REGLES.x5 = Object.assign({}, REGLES.x5, { jambes: [3, 4, 5] });
REGLES.x10 = Object.assign({}, REGLES.x10, { jambes: [5, 6, 7] });
REGLES.jambe = Object.assign({}, REGLES.jambe, { cote_min: 1.4, cote_max: 2.2 });
REGLES.paliers_cote_jambe = [1.44, 1.49, 1.59, 2.2];
delete REGLES.jambes_combines;
REGLES.montantes = { styles: [{ nom: "sure", cote_min: 0 }, { nom: "solide", cote_min: 1.55 }, { nom: "audacieuse", cote_min: 1.85 }] };

module.exports = { regles: REGLES };
