"use strict";
// Cotes de reference "marche" (Pinnacle) pour la comparaison modele/marche.
//
// Deux sources, meme forme normalisee que getPinnacleOdds() dans
// .github/workflows/update-data.yml : { c1, cn, c2, over25, under25, bttsY, bttsN }.
//  1. The Odds API (sport key = config/leagues.json#oddsSportKey) - inchange,
//     reste dans le pipeline.
//  2. api-football /odds?fixture=X (deja telecharge par le pipeline pour
//     TOUTES les ligues via getOdds) : on y lit le bookmaker "Pinnacle"
//     quand il est present. Utilise uniquement pour les ligues marquees
//     apiFootballPinnacleFallback=true dans config/leagues.json.
//
// Verification reelle du 2026-09-13 : /odds?league=262&season=2026 (Liga MX)
// et /odds?league=288&season=2026 (Premier Soccer League) renvoient des
// fixtures avec le bookmaker "Pinnacle" (Match Winner, Goals Over/Under,
// Both Teams Score). The Odds API ne liste aucun sport key sud-africain.

const { extractRawOffers } = require("./odds.js");

const PINNACLE_NAME = "pinnacle";

// Sport key The Odds API d'une ligue, ou null. JAMAIS de repli vers une
// autre competition : l'ancien code retombait sur 'soccer_uefa_champs_league'
// et interrogeait la C1 pour une ligue sans cle.
function oddsSportKeyFor(leaguesConfig, leagueKey) {
  const leagues = leaguesConfig && Array.isArray(leaguesConfig.leagues) ? leaguesConfig.leagues : [];
  const league = leagues.find((l) => l && l.key === leagueKey);
  return league && typeof league.oddsSportKey === "string" && league.oddsSportKey ? league.oddsSportKey : null;
}

function usesApiFootballPinnacleFallback(leaguesConfig, leagueKey) {
  const leagues = leaguesConfig && Array.isArray(leaguesConfig.leagues) ? leaguesConfig.leagues : [];
  const league = leagues.find((l) => l && l.key === leagueKey);
  return !!(league && league.apiFootballPinnacleFallback === true);
}

// Extrait les cotes Pinnacle d'une reponse api-football /odds (un element de
// response[]). Retourne null si Pinnacle est absent ou n'a aucune des cotes
// utiles - jamais une cote d'un autre bookmaker ni une mediane.
function pinnacleOddsFromApiFootball(oddsRaw) {
  if (!oddsRaw || !Array.isArray(oddsRaw.bookmakers)) return null;
  const offers = extractRawOffers(oddsRaw).filter(
    (o) => String(o.bookmaker_name || "").trim().toLowerCase() === PINNACLE_NAME
  );
  if (!offers.length) return null;
  const pick = (market, selection) => {
    const o = offers.find((x) => x.market === market && x.selection === selection);
    return o ? o.odds : undefined;
  };
  const result = {};
  const set = (k, v) => { if (Number.isFinite(v)) result[k] = v; };
  set("c1", pick("1x2", "home"));
  set("cn", pick("1x2", "draw"));
  set("c2", pick("1x2", "away"));
  set("over25", pick("goals_ou", "over_2.5"));
  set("under25", pick("goals_ou", "under_2.5"));
  set("bttsY", pick("btts", "yes"));
  set("bttsN", pick("btts", "no"));
  if (!Object.keys(result).length) return null;
  result.source = "api-football";
  return result;
}

module.exports = { oddsSportKeyFor, usesApiFootballPinnacleFallback, pinnacleOddsFromApiFootball };
