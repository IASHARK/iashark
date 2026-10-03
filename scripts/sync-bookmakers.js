#!/usr/bin/env node
"use strict";
// Recopie config/bookmakers-agrees.json (source unique, non publiee) dans le
// bloc de donnees de lib/pro-preferences.js (publie avec le site). A lancer
// apres chaque modification de la liste : node scripts/sync-bookmakers.js
// tests/pro-preferences.test.js echoue si les deux ne sont plus identiques.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "lib/pro-preferences.js");

function donneesPubliques() {
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, "config/bookmakers-agrees.json"), "utf8"));
  const pays = {};
  Object.keys(src.pays).forEach(function (k) {
    const p = src.pays[k];
    pays[k] = {
      regulateur: p.regulateur,
      paiementOuvert: p.paiementOuvert,
      pointDeVente: p.pointDeVente,
      // Seuls les bookmakers vraiment suivis (cotes relevees) sont publies.
      bookmakers: p.bookmakers.filter(function (b) { return b.suivi === true; }).map(function (b) { return { id: b.id, nom: b.nom }; })
    };
  });
  return { verifie_le: src.verifie_le, pays: pays };
}

if (require.main === module) {
  const lib = fs.readFileSync(LIB, "utf8");
  const re = /(\/\* @bookmakers-debut[^\n]*\n\s*var AGREES = )[^\n]*(;\n)/;
  if (!re.test(lib)) { console.error("bloc @bookmakers introuvable dans lib/pro-preferences.js"); process.exit(1); }
  fs.writeFileSync(LIB, lib.replace(re, function (m, a, b) { return a + JSON.stringify(donneesPubliques()) + b; }));
  console.log("lib/pro-preferences.js synchronise.");
}

module.exports = { donneesPubliques };
