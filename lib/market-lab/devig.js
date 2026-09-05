"use strict";
// MARKET LAB - PHASE 2 (2026-09-05), item 5-6. Devig AU NIVEAU BOOKMAKER
// UNIQUEMENT - ne deviggue jamais une selection isolee, reconstruit
// d'abord l'ensemble COMPLET d'un marche chez UN bookmaker (meme
// snapshot). Methode principale = SHIN, reutilise TEL QUEL
// lib/models.js#shinProbabilities (deterministe, convergent, borne,
// deja audite en production) - jamais reimplemente ici. La methode
// proportionnelle (q_i/somme(q)) est persistee en diagnostic
// UNIQUEMENT, jamais comme source principale (DEVIG_PRIMARY=SHIN).
//
// Double Chance et DNB sont volontairement EXCLUS du devig en Phase 2 :
// DC n'est pas un partitionnement mutuellement exclusif/exhaustif (ses
// trois selections se chevauchent sur le nul, Shin ne s'applique pas
// tel quel) et DNB n'a aucune cote bookmaker plein-temps directe dans
// la source actuelle (voir lib/market-lab/odds-ingest.js) - rien a
// deviguer faute de donnee.

const { shinProbabilities } = require("../models.js");
const { TOTAL_GOALS_LINES, TEAM_TOTAL_LINES } = require("./market-catalogue.js");

const DEVIG_PRIMARY = "SHIN";

function buildMarketFamilies() {
  const families = new Map();
  families.set("FT_1X2", { requiredSelections: ["HOME", "DRAW", "AWAY"], members: ["FT_1X2_HOME", "FT_1X2_DRAW", "FT_1X2_AWAY"] });
  families.set("FT_BTTS", { requiredSelections: ["YES", "NO"], members: ["FT_BTTS_YES", "FT_BTTS_NO"] });
  for (const line of TOTAL_GOALS_LINES) {
    const key = `FT_TOTAL_${line.toFixed(1)}`;
    families.set(key, { requiredSelections: ["OVER", "UNDER"], members: [`${key}_OVER`, `${key}_UNDER`] });
  }
  for (const side of ["HOME", "AWAY"]) {
    for (const line of TEAM_TOTAL_LINES) {
      const key = `FT_TEAM_TOTAL_${side}_${line.toFixed(1)}`;
      families.set(key, { requiredSelections: ["OVER", "UNDER"], members: [`${key}_OVER`, `${key}_UNDER`] });
    }
  }
  return families;
}

const MARKET_FAMILIES = buildMarketFamilies();

function familyOf(canonicalMarketId) {
  for (const [key, family] of MARKET_FAMILIES) {
    if (family.members.includes(canonicalMarketId)) return key;
  }
  return null;
}

// offersBySelection = { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 } - UN SEUL
// bookmaker, UN SEUL snapshot (regroupement fait par l'appelant, jamais
// ici : ce module ne sait pas fusionner des bookmakers, il refuse de le
// faire par construction en exigeant un objet deja resolu a un seul
// prix par selection).
function devigBookmakerMarket(familyKey, offersBySelection) {
  const family = MARKET_FAMILIES.get(familyKey);
  if (!family) throw new Error(`devigBookmakerMarket: famille de marche inconnue "${familyKey}"`);

  const missing = family.requiredSelections.filter((s) => !(s in offersBySelection));
  if (missing.length) {
    return { family: familyKey, complete: false, reason: "INCOMPLETE_MARKET", missing_selections: missing };
  }

  const prices = family.requiredSelections.map((s) => offersBySelection[s]);
  if (prices.some((p) => !(typeof p === "number" && Number.isFinite(p) && p > 1))) {
    return { family: familyKey, complete: false, reason: "INCOMPLETE_MARKET", missing_selections: [] };
  }

  const rawImplied = {};
  family.requiredSelections.forEach((s, i) => { rawImplied[s] = 1 / prices[i]; });
  const sumRaw = Object.values(rawImplied).reduce((a, b) => a + b, 0);
  const overround = sumRaw - 1;

  const proportional = {};
  family.requiredSelections.forEach((s) => { proportional[s] = rawImplied[s] / sumRaw; });

  const shinRaw = shinProbabilities(prices);
  let shin = null;
  let shinStatus = "FAILURE";
  if (shinRaw) {
    shin = {};
    family.requiredSelections.forEach((s, i) => { shin[s] = shinRaw[i]; });
    shinStatus = "OK";
  }

  return {
    family: familyKey,
    complete: true,
    devig_primary: DEVIG_PRIMARY,
    raw_implied: rawImplied,
    overround,
    proportional_diagnostic: proportional,
    shin,
    shin_status: shinStatus,
    reason: shinStatus === "OK" ? null : "DEVIG_SHIN_FAILURE",
  };
}

// Deroule un resultat de devig (par famille) en lignes par
// canonical_market_id, pretes pour la construction du consensus (item
// 8) - une ligne par selection, jamais un objet fusionne entre
// bookmakers (le bookmaker_id reste porte par l'appelant).
function flattenDevigResult(familyKey, devigResult) {
  const family = MARKET_FAMILIES.get(familyKey);
  if (!family || !devigResult.complete) return [];
  return family.requiredSelections.map((selection, i) => ({
    canonical_market_id: family.members[i],
    selection,
    shin_probability: devigResult.shin ? devigResult.shin[selection] : null,
    proportional_probability: devigResult.proportional_diagnostic[selection],
    overround: devigResult.overround,
  }));
}

module.exports = { devigBookmakerMarket, flattenDevigResult, familyOf, MARKET_FAMILIES, DEVIG_PRIMARY };
