"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 7. Modele d'exposition :
// PRE_LINEUP estime P(start_i), P(entre|banc), distributions de
// minutes (titulaire/remplacant) - appris STRICTEMENT sur l'historique
// anterieur au cutoff (anti-leakage.js). POST_LINEUP : role connu
// (starter/bench issu de la lineup officielle, tag ORACLE_HISTORICAL),
// seules les minutes de sortie/entree restent probabilistes.
//
// Les 3621 observations bench-0-minute du pilot (2024-25, OOS_FINAL -
// JAMAIS utilisees pour AJUSTER ce modele, reservees a la validation
// OOS) prouvent que "convoque au banc mais jamais entre" est un
// evenement frequent, modelise explicitement ici (p_enter_if_bench),
// jamais suppose absent ou egal a 1.

const PRIOR_STRENGTH_MATCHES_EXPOSURE = 10;

function fitExposurePriors(trainRows, positionGroupFn) {
  const byGroup = new Map();
  for (const r of trainRows) {
    const g = positionGroupFn(r.position);
    if (!byGroup.has(g)) byGroup.set(g, { nMatches: 0, nStarts: 0, nBenchUsed: 0, nBench: 0, starterMinutesSum: 0, starterMinutesN: 0, subMinutesSum: 0, subMinutesN: 0 });
    const t = byGroup.get(g);
    t.nMatches++;
    if (r.lineup_role === "STARTER") {
      t.nStarts++;
      t.starterMinutesSum += r.minutes;
      t.starterMinutesN++;
    } else {
      t.nBench++;
      if (r.minutes > 0) { t.nBenchUsed++; t.subMinutesSum += r.minutes; t.subMinutesN++; }
    }
  }
  const priors = new Map();
  for (const [g, t] of byGroup) {
    priors.set(g, {
      start_rate: t.nMatches > 0 ? t.nStarts / t.nMatches : 0,
      bench_enter_rate: t.nBench > 0 ? t.nBenchUsed / t.nBench : 0,
      mean_minutes_if_starter: t.starterMinutesN > 0 ? t.starterMinutesSum / t.starterMinutesN : 90,
      mean_minutes_if_sub_used: t.subMinutesN > 0 ? t.subMinutesSum / t.subMinutesN : 25,
      n_matches: t.nMatches,
    });
  }
  return priors;
}

function avgShrunk(values, priorMean, priorStrengthN) {
  const sum = values.reduce((a, b) => a + b, 0) + priorMean * priorStrengthN;
  return sum / (values.length + priorStrengthN);
}

// playerRowsBeforeCutoff : historique du joueur STRICTEMENT anterieur
// (anti-leakage.js). Shrinkage add-k identique aux autres modules.
function posteriorExposure(playerRowsBeforeCutoff, groupPrior) {
  const n = playerRowsBeforeCutoff.length;
  const starts = playerRowsBeforeCutoff.filter((r) => r.lineup_role === "STARTER").length;
  const benchRows = playerRowsBeforeCutoff.filter((r) => r.lineup_role === "BENCH");
  const benchUsed = benchRows.filter((r) => r.minutes > 0).length;
  const k = PRIOR_STRENGTH_MATCHES_EXPOSURE;

  const startRate = (groupPrior.start_rate * k + starts) / (k + n);
  const benchEnterRate = benchRows.length > 0
    ? (groupPrior.bench_enter_rate * k + benchUsed) / (k + benchRows.length)
    : groupPrior.bench_enter_rate;

  const starterMinutes = playerRowsBeforeCutoff.filter((r) => r.lineup_role === "STARTER").map((r) => r.minutes);
  const subMinutesUsed = benchRows.filter((r) => r.minutes > 0).map((r) => r.minutes);

  return {
    p_start: startRate,
    p_enter_if_bench: benchEnterRate,
    mean_minutes_if_starter: starterMinutes.length > 0 ? avgShrunk(starterMinutes, groupPrior.mean_minutes_if_starter, k) : groupPrior.mean_minutes_if_starter,
    mean_minutes_if_sub_used: subMinutesUsed.length > 0 ? avgShrunk(subMinutesUsed, groupPrior.mean_minutes_if_sub_used, k) : groupPrior.mean_minutes_if_sub_used,
    n_prior_matches: n,
  };
}

// PRE_LINEUP : minutes attendues = P(start)*minutes_si_starter +
// (1-P(start))*P(entre|banc)*minutes_si_sub_utilise (+0 si jamais entre).
function expectedMinutesPreLineup(posteriorExp) {
  return posteriorExp.p_start * posteriorExp.mean_minutes_if_starter
    + (1 - posteriorExp.p_start) * posteriorExp.p_enter_if_bench * posteriorExp.mean_minutes_if_sub_used;
}

// POST_LINEUP_CONDITIONAL : role CONNU (starter/bench officiel du
// match cible, ORACLE_HISTORICAL) - minutes restent probabilistes,
// mais plus d'incertitude sur le role lui-meme.
function expectedMinutesPostLineup(posteriorExp, knownRole) {
  if (knownRole === "STARTER") return posteriorExp.mean_minutes_if_starter;
  return posteriorExp.p_enter_if_bench * posteriorExp.mean_minutes_if_sub_used;
}

module.exports = { fitExposurePriors, posteriorExposure, expectedMinutesPreLineup, expectedMinutesPostLineup, PRIOR_STRENGTH_MATCHES_EXPOSURE };
