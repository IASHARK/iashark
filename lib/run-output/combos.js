"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06), item 2 : DAILY_COMBOS (jusqu'a 3,
// cote totale >= 10.00). Consomme des jambes deja scorees par les
// champions Score/Player VALIDATED (probabilite modele + cote - la cote
// est une DONNEE fournie, jamais recalculee ici). La qualite prime sur
// le nombre : un slot non rempli proprement devient
// NO_QUALIFYING_COMBINATION, jamais force.

const { isCandidateEligible } = require("./eligibility.js");
const { isMarketSupportedForCombo } = require("./market-status.js");
const { computeLegRobustnessStatus } = require("./robustness.js");
const { computeComboProbability } = require("./combo-math.js");
const { getBettingValidationStatus } = require("./market-lab-status.js");

const MIN_LEG_ODDS = 1.5;
const TARGET_TOTAL_ODDS = 10.0;
const ROBUSTNESS_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };

function legKey(c) { return `${c.fixture_id}|${c.market}|${c.selection}`; }

function formatLeg(c) {
  return {
    fixture_id: c.fixture_id,
    league: c.league_key,
    kickoff: c.kickoff,
    home_team: c.home_team,
    away_team: c.away_team,
    market: c.market,
    selection: c.selection,
    model_probability: Math.round(c.model_probability * 10000) / 10000,
    decimal_odds: c.decimal_odds,
    implied_probability: Math.round((1 / c.decimal_odds) * 10000) / 10000,
    market_consensus_probability: c.market_consensus_probability ?? null,
    snapshot_stability: c.snapshot_stability,
    data_quality_status: c.data_quality_status,
    lineup_status: c.lineup_status ?? null,
    robustness_status: computeLegRobustnessStatus(c),
    player_model_version: c.player_model_version ?? null,
    score_model_version: c.score_model_version ?? null,
  };
}

function buildEligiblePool(candidates, registry) {
  return (candidates || [])
    .filter((c) => isCandidateEligible(c, registry))
    .filter((c) => isMarketSupportedForCombo(c))
    .filter((c) => typeof c.decimal_odds === "number" && c.decimal_odds >= MIN_LEG_ODDS)
    .filter((c) => computeLegRobustnessStatus(c) !== "LOW"); // "privilegier les choix les plus robustes"
}

// Ordre deterministe : robustesse desc, probabilite modele desc,
// fixture_id/selection asc en depart d'egalite - jamais l'ordre
// d'insertion du tableau d'entree.
function sortPool(pool) {
  return [...pool].sort((a, b) => {
    const rb = ROBUSTNESS_RANK[computeLegRobustnessStatus(b)] - ROBUSTNESS_RANK[computeLegRobustnessStatus(a)];
    if (rb !== 0) return rb;
    if (b.model_probability !== a.model_probability) return b.model_probability - a.model_probability;
    if (a.fixture_id !== b.fixture_id) return a.fixture_id - b.fixture_id;
    return String(a.selection).localeCompare(String(b.selection));
  });
}

// Greedy : ajoute les meilleures jambes disponibles (1 max par fixture,
// jamais une jambe dont la cle est exclue) jusqu'a atteindre la cote
// cible - s'arrete DES que la cible est atteinte (jamais de jambe
// ajoutee "pour la forme" au-dela du necessaire).
function buildComboGreedy(sortedPool, excludeLegKeys) {
  const legs = [];
  const usedFixtures = new Set();
  let totalOdds = 1;
  for (const c of sortedPool) {
    if (excludeLegKeys.has(legKey(c))) continue;
    if (usedFixtures.has(c.fixture_id)) continue;
    legs.push(c);
    usedFixtures.add(c.fixture_id);
    totalOdds *= c.decimal_odds;
    if (totalOdds >= TARGET_TOTAL_ODDS) break;
  }
  if (totalOdds < TARGET_TOTAL_ODDS) return null; // NO_QUALIFYING_COMBINATION, jamais force
  return legs;
}

function legSetsIdentical(legsA, legsB) {
  if (legsA.length !== legsB.length) return false;
  const keysA = new Set(legsA.map(legKey));
  return legsB.every((l) => keysA.has(legKey(l)));
}

function sharedLegsCount(legsA, legsB) {
  if (!legsA || !legsB) return 0;
  const keysA = new Set(legsA.map(legKey));
  return legsB.filter((l) => keysA.has(legKey(l))).length;
}

function buildOneComboWithFallback(sortedPool, priorCombos) {
  // Essai 1 : exclusion totale des jambes deja utilisees (diversite max).
  const allUsedKeys = new Set(priorCombos.flatMap((c) => c.map(legKey)));
  let legs = buildComboGreedy(sortedPool, allUsedKeys);
  if (legs) return legs;
  // Essai 2 (repli documente) : reutilisation autorisee, mais rejet si
  // le resultat est un doublon quasi-identique d'un combo deja genere.
  legs = buildComboGreedy(sortedPool, new Set());
  if (legs && priorCombos.some((prior) => legSetsIdentical(prior, legs))) return null;
  return legs;
}

// candidates : jambes deja scorees (PLAYER anytime-scorer ou SCORE
// marches derives de la matrice DC), chacune porteuse de decimal_odds,
// model_probability, snapshot_stability, data_quality_status, etc.
function generateDailyCombos({ candidates, registry, snapshotTime }) {
  if (!snapshotTime) throw new Error("generateDailyCombos: snapshotTime requis (determinisme)");
  const pool = sortPool(buildEligiblePool(candidates, registry));
  const bettingValidationStatus = getBettingValidationStatus();

  const builtLegSets = [];
  const combos = [];
  for (let i = 0; i < 3; i++) {
    const legs = buildOneComboWithFallback(pool, builtLegSets);
    if (!legs) { combos.push({ combo_id: `COMBO_${i + 1}`, status: "NO_QUALIFYING_COMBINATION", generated_at: snapshotTime, betting_validation_status: bettingValidationStatus }); continue; }
    builtLegSets.push(legs);
    const formattedLegs = legs.map(formatLeg);
    const probability = computeComboProbability(legs);
    combos.push({
      combo_id: `COMBO_${i + 1}`,
      status: "GENERATED",
      generated_at: snapshotTime,
      number_of_legs: legs.length,
      fixtures_used: legs.map((l) => l.fixture_id),
      legs: formattedLegs,
      ...probability,
      betting_validation_status: bettingValidationStatus,
    });
  }

  // shared_legs_with_combo_N : indexe par combo_id -> leg set (jamais
  // par position dans `combos`, qui se desalignerait de `builtLegSets`
  // des qu'un slot est NO_QUALIFYING_COMBINATION).
  const legSetById = new Map();
  let cursor = 0;
  for (const c of combos) { if (c.status === "GENERATED") { legSetById.set(c.combo_id, builtLegSets[cursor]); cursor++; } }
  for (const c of combos) {
    for (let j = 0; j < combos.length; j++) {
      const other = combos[j];
      const key = `shared_legs_with_combo_${j + 1}`;
      if (other.combo_id === c.combo_id) { c[key] = null; continue; }
      c[key] = c.status === "GENERATED" && other.status === "GENERATED" ? sharedLegsCount(legSetById.get(c.combo_id), legSetById.get(other.combo_id)) : null;
    }
  }

  return { generated_at: snapshotTime, eligible_pool_size: pool.length, combos };
}

module.exports = { generateDailyCombos, MIN_LEG_ODDS, TARGET_TOTAL_ODDS, legKey, sharedLegsCount };
