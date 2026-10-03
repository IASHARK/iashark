#!/usr/bin/env node
"use strict";
// Recopie config/noms-equipes-fr.json (selections + clubs) dans lib/noms-equipes-fr.js
// (lu par l'accueil, home-list.js, sur les pages francaises). Usage : node scripts/sync-noms-equipes-fr.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "noms-equipes-fr.json"), "utf8"));
const t = {};
[cfg.selections, cfg.clubs].forEach((o) => Object.keys(o || {}).forEach((k) => { if (typeof o[k] === "string" && o[k].trim()) t[k] = o[k].trim(); }));
const f = path.join(ROOT, "lib", "noms-equipes-fr.js");
const src = fs.readFileSync(f, "utf8").replace(/(\/\* @noms-debut \*\/\n\s*var NOMS = ).*;(\n\s*\/\* @noms-fin \*\/)/, (m, a, b) => a + JSON.stringify(t) + ";" + b);
fs.writeFileSync(f, src);
console.log("lib/noms-equipes-fr.js : " + Object.keys(t).length + " noms");
