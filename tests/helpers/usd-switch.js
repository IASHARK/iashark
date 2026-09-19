"use strict";
// Bascule USD de /en/ (config/markets.json#_usdSwitch, decision du proprietaire
// du 19/09/2026) appliquee a une COPIE de la configuration. Utilise par
// tests/usd-switch.test.js (build complet en memoire) et par les specs E2E
// (tests/e2e/helpers/usd-switch.js) : l'etat bascule est prouve avant d'etre
// publie, sans jamais modifier config/markets.json ni les pages generees.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CONFIG_FILE = path.join(ROOT, "config", "markets.json");

function readMarkets() { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }

// Applique exactement les chemins de _usdSwitch ("_dirs.en.market",
// "us.checkoutOpen"...). Chemin inconnu = erreur (jamais de champ cree en
// silence : la bascule documentee doit rester celle qui est testee).
function applyUsdSwitch(cfg) {
  const out = JSON.parse(JSON.stringify(cfg || readMarkets()));
  const sw = out._usdSwitch;
  if (!sw || typeof sw !== "object" || !Object.keys(sw).length) throw new Error("config/markets.json#_usdSwitch absent");
  for (const p of Object.keys(sw)) {
    const keys = p.split(".");
    let o = out;
    for (const k of keys.slice(0, -1)) {
      if (!o[k] || typeof o[k] !== "object") throw new Error("_usdSwitch : chemin inconnu " + p);
      o = o[k];
    }
    const last = keys[keys.length - 1];
    if (!Object.prototype.hasOwnProperty.call(o, last)) throw new Error("_usdSwitch : champ inconnu " + p);
    o[last] = JSON.parse(JSON.stringify(sw[p]));
  }
  return out;
}

// /en/ deja bascule dans la configuration reelle ?
function isUsdSwitched(cfg) { return (cfg || readMarkets())._dirs.en.market === "us"; }

module.exports = { ROOT, CONFIG_FILE, readMarkets, applyUsdSwitch, isUsdSwitched };
