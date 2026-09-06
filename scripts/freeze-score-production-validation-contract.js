#!/usr/bin/env node
"use strict";
// LEAGUE_SCORE_PRODUCTION_VALIDATION_V1 - Phase 1B (2026-09-06).
// Gele le CONTRAT DE VALIDATION PRODUCTION (gates + seuils numeriques)
// AVANT toute lecture de la saison SEALED (2025). Chaque seuil est soit
// (a) un seuil DEJA pre-enregistre dans lib/promotion.js pour un usage
// analogue (jamais un nombre invente pour cette occasion), soit (b)
// derive de la variabilite d'echantillonnage DEJA OBSERVEE sur OOS_DEV
// (bootstrap par blocs, meme mecanisme que le reste du Score Lab) - dans
// les deux cas, entierement calculable AVANT d'ouvrir 2025, jamais apres.
//
// N'accede a AUCUNE fixture 2024 (OOS_FINAL, deja consommee) ni 2025
// (SEALED). Uniquement warmup+train+oos_dev, deja ouverts.
//
// Usage : node scripts/freeze-score-production-validation-contract.js --league-key=seriea

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { calibrationInterceptSlope, reliabilityBins, expectedCalibrationError, isoWeekKey } = require("../lib/player-lab/oos-eval-metrics.js");
const { MIN_N_OOS, MAX_SECONDARY_DEGRADATION, MAX_LOW_SCORE_RELATIVE_DEGRADATION } = require("../lib/promotion.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }
function sha256File(p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function cutoffDayKey(kickoffTimestamp) { return new Date(kickoffTimestamp * 1000).toISOString().slice(0, 10); }

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/freeze-score-production-validation-contract.js --league-key=<key>"); process.exit(1); }

  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const pvDir = path.join(factoryDir, "score-production-validation-v1");
  const selection = JSON.parse(fs.readFileSync(path.join(pvDir, "champion-selection.json"), "utf8"));
  if (!selection.champion_selected) { console.error("Aucun champion selectionne en Phase 1A - STOP, contrat non gelable."); process.exit(1); }

  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const { manifest: oosManifest } = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-manifest.json"), "utf8"));
  const rhoFinal = oosManifest.rho.final_value;
  const leagueAvgH = oosManifest.league_averages.leagueAvgH;
  const leagueAvgA = oosManifest.league_averages.leagueAvgA;
  // selection.champion_selected est la cle courte ("B0"/"M0"/"M2" - voir
  // Phase 1A), PAS le model_id complet ("SCORE_M2_SERIEA" etc.) - bug
  // corrige ici (la 1ere version comparait aux deux formes differentes,
  // ce qui faisait TOUJOURS tomber dans la branche else/M0 par erreur).
  const championIsM2 = selection.champion_selected === "M2";
  const championIsM0 = selection.champion_selected === "M0";
  const championIsB0 = selection.champion_selected === "B0";
  if (!championIsM2 && !championIsM0 && !championIsB0) { console.error("champion_selected inattendu: " + selection.champion_selected); process.exit(1); }

  // Recalcule les predictions OOS_DEV du CHAMPION GELE (et uniquement lui)
  // pour deriver les seuils - reutilise runWalkForward/runWalkForwardM2R
  // EXACTEMENT comme en Phase 1A, jamais une nouvelle formule.
  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const allFixtures = [...warmup, ...train, ...oosDev];

  let championPredictions, championMarketsField;
  if (championIsM2) {
    const { runWalkForwardM2R } = require("../lib/lab/walkforward-m2r-runner.js");
    const previousSeasonFixturesBySeasons = new Map([[sp.oos_dev, train]]);
    const wf = runWalkForwardM2R({ allFixtures, trainSeasons: [sp.warmup, sp.train], oosSeasons: [sp.oos_dev], leagueId: league.apiFootballId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons, championRho: rhoFinal });
    championPredictions = wf.predictions.filter((p) => p.m0_valid).map((p) => ({ lambdaH: p.lambdaH_m2, lambdaA: p.lambdaA_m2, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFinal, markets: p.markets_m2, kickoff_ts: p.kickoff_timestamp || p.cutoff_ts || null, cutoff: p.cutoff }));
  } else {
    const constantRhoFitter = () => ({ rho_hat: championIsB0 ? 0 : rhoFinal, convergence: true, on_boundary: false });
    const wf = runWalkForward({ allFixtures, trainSeasons: [sp.warmup, sp.train], oosSeasons: [sp.oos_dev], championRho: championIsB0 ? 0 : rhoFinal, candidateRhoFitter: constantRhoFitter, leagueAvgH, leagueAvgA, leagueId: league.apiFootballId });
    const rhoUsed = championIsB0 ? 0 : rhoFinal;
    championPredictions = wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoUsed, markets: championIsB0 ? p.markets_m0 : p.markets_m1, kickoff_ts: p.kickoff_timestamp || null, cutoff: p.cutoff }));
  }

  // --- EXACT_SCORE_NLL : bootstrap par blocs (jour de cutoff) de la
  // moyenne des NLL du CHAMPION lui-meme (pas un delta vs un autre
  // modele - reutilise pairedBlockBootstrap en lui passant directement
  // les NLL comme "deltas", ce qui est mathematiquement valide : la
  // fonction ne fait que rechantillonner-et-moyenner par bloc, quelle
  // que soit la nature du nombre). ci_upper = seuil de production.
  const perMatchNll = championPredictions.map((p) => exactScoreNLL([{ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }]));
  const blocksByDay = new Map();
  championPredictions.forEach((p, i) => {
    const key = p.cutoff || "day" + i;
    if (!blocksByDay.has(key)) blocksByDay.set(key, []);
    blocksByDay.get(key).push(perMatchNll[i]);
  });
  const nllBootstrap = pairedBlockBootstrap([...blocksByDay.values()], { seed: "SCORE-PRODUCTION-VALIDATION-V1-" + leagueKey.toUpperCase() + "-NLL", nResamples: 10000 });

  // --- CALIBRATION : ECE du champion sur OOS_DEV (marche 1X2, la plus
  // exigeante). Seuil holdout = 2x cette valeur (tolerance derivee de la
  // propre performance du champion, jamais un nombre invente).
  // Calibration correcte : empile les 3 issues binaires (p1/pN/p2) par
  // match, chacune avec un y qui varie reellement 0/1 (jamais "1 partout" -
  // sinon la regression logistique de calibration n'a aucune variance a
  // expliquer et produit des coefficients degenereres/incoherents).
  function outcomeRows() {
    const rows = [];
    for (const p of championPredictions) {
      const probs = p.markets;
      const isHome = p.h > p.a, isDraw = p.h === p.a, isAway = p.h < p.a;
      rows.push({ p: probs.p1, y: isHome ? 1 : 0 });
      rows.push({ p: probs.pN, y: isDraw ? 1 : 0 });
      rows.push({ p: probs.p2, y: isAway ? 1 : 0 });
    }
    return rows;
  }
  const x12Rows = outcomeRows();
  const x12Cal = calibrationInterceptSlope(x12Rows);
  const x12Bins = reliabilityBins(x12Rows, 10);
  const x12Ece = expectedCalibrationError(x12Bins, x12Rows.length);

  // --- MARKET_MARGINALS (1X2/BTTS/O-U2.5) : logloss du champion sur
  // OOS_DEV, seuil holdout = +MAX_SECONDARY_DEGRADATION (3%, deja
  // pre-enregistre lib/promotion.js) relatif a cette valeur.
  function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }
  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
  const ou25Logloss = mean(championPredictions.map((p) => logloss(p.markets.overUnder["2.5"].over, (p.h + p.a) > 2.5 ? 1 : 0)));
  const bttsLogloss = mean(championPredictions.map((p) => logloss(p.markets.btts.yes, (p.h > 0 && p.a > 0) ? 1 : 0)));
  const x12Logloss = mean(x12Rows.map((r) => logloss(r.p, r.y)));

  // --- NO_CATASTROPHIC_SECONDARY_DEGRADATION (scores bas) : reutilise
  // MAX_LOW_SCORE_RELATIVE_DEGRADATION (10%, deja pre-enregistre).
  const lowScoreKeys = ["0-0", "1-0", "0-1", "1-1"];
  const lowScoreOosDev = {};
  for (const key of lowScoreKeys) {
    const [hh, aa] = key.split("-").map(Number);
    const rows = championPredictions.filter((p) => p.h === hh && p.a === aa);
    if (rows.length) lowScoreOosDev[key] = { count_observed: rows.length, nll_contribution: mean(rows.map((p) => exactScoreNLL([{ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }]))) };
  }

  const gitSha = execSync("git rev-parse HEAD", { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
  const datasetHashes = {
    warmup_2021: sha256File(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${sp.warmup}.json`)),
    train_2022: sha256File(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${sp.train}.json`)),
    oos_dev_2023: sha256File(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${sp.oos_dev}.json`)),
  };

  const contract = {
    protocol: "LEAGUE_SCORE_PRODUCTION_VALIDATION_V1",
    phase: "1B_CONTRACT_FREEZE",
    league_key: leagueKey,
    frozen_at: new Date().toISOString(),
    frozen_before_holdout_access: true,
    champion: {
      model_id: selection.champion_selected,
      selection_reason: selection.champion_selection_reason,
      rho: championIsB0 ? 0 : rhoFinal,
      league_avg_h: leagueAvgH,
      league_avg_a: leagueAvgA,
      structural_formula: championIsM2 ? "prior_equivalents(n)=max(0,8-0.5n) (lib/lab/bayes-early-season.js, transferee de PL sans retuning, testee ici honnetement)" : "N/A (pas de couche early-season Bayes pour ce champion)",
      code_sha_at_freeze: gitSha,
      dataset_hashes_train_oos_dev: datasetHashes,
      n_oos_dev_used_for_thresholds: championPredictions.length,
    },
    champion_frozen: true,
    gates: {
      POINT_IN_TIME_INTEGRITY: {
        description: "Chaque prediction du holdout doit avoir un cutoff strictement anterieur a son coup d'envoi ; aucune fixture 2025 (ni 2024) ne doit jamais apparaitre dans la reconstruction d'etat d'equipe utilisee pour une prediction d'une AUTRE fixture 2025 anterieure ; rho/leagueAvg restent EXACTEMENT ceux geles ci-dessus, jamais refittes.",
        pass_condition: "0 violation detectee (assertion programmatique dans le script Phase 3)",
      },
      DATA_COVERAGE: {
        description: "Nombre de predictions valides sur le holdout 2025.",
        threshold: MIN_N_OOS,
        source: "lib/promotion.js#MIN_N_OOS (deja pre-enregistre, reutilise tel quel)",
        pass_condition: "n_oos_holdout >= " + MIN_N_OOS,
      },
      REPRODUCIBILITY: {
        description: "Le script Phase 3 execute deux fois (meme process) - hash SHA-256 du rapport complet doit etre identique.",
        pass_condition: "hash_run1 === hash_run2",
      },
      EXACT_SCORE_NLL: {
        description: "NLL du champion gele sur le holdout, comparee a l'enveloppe de variabilite DEJA OBSERVEE sur OOS_DEV (bootstrap par blocs, 10000 reechantillonnages, seed pre-enregistre).",
        oos_dev_observed_mean_nll: nllBootstrap.observed_mean_delta,
        oos_dev_bootstrap_ci: [nllBootstrap.ci_lower, nllBootstrap.ci_upper],
        threshold: nllBootstrap.ci_upper,
        source: "Bootstrap par blocs (lib/lab/bootstrap.js#pairedBlockBootstrap, reutilise tel quel - deltas=NLL du champion lui-meme) sur OOS_DEV(2023), jamais un nombre invente ni copie d'une autre ligue.",
        pass_condition: "nll_holdout <= " + nllBootstrap.ci_upper,
      },
      CALIBRATION: {
        description: "Calibration 1X2 (intercept/slope logistique, lib/player-lab/oos-eval-metrics.js#calibrationInterceptSlope, reutilise tel quel) + Expected Calibration Error (ECE).",
        oos_dev_slope: x12Cal.slope, oos_dev_intercept: x12Cal.intercept, oos_dev_converged: x12Cal.converged, oos_dev_ece: x12Ece,
        threshold_ece: x12Ece * 2,
        source: "Tolerance = 2x l'ECE DEJA MESURE du champion sur OOS_DEV (jamais un seuil absolu invente - aucune convention numerique pre-existante trouvee ailleurs dans ce codebase pour un seuil de calibration absolu, donc derive de la propre performance du champion).",
        pass_condition: "calibration_converged_holdout === true ET ece_holdout <= " + (x12Ece * 2).toFixed(6),
      },
      MARKET_MARGINALS: {
        description: "Logloss O/U2.5, BTTS, 1X2 sur le holdout vs OOS_DEV.",
        oos_dev_logloss: { ou25: ou25Logloss, btts: bttsLogloss, x12: x12Logloss },
        max_relative_degradation: MAX_SECONDARY_DEGRADATION,
        source: "lib/promotion.js#MAX_SECONDARY_DEGRADATION (3%, deja pre-enregistre, reutilise tel quel)",
        pass_condition: "pour chaque marche, logloss_holdout <= logloss_oos_dev * (1+" + MAX_SECONDARY_DEGRADATION + ")",
      },
      TEMPORAL_STABILITY: {
        description: "Le holdout 2025 est coupe en 2 moities par date de coup d'envoi ; CHAQUE moitie doit independamment satisfaire le meme seuil EXACT_SCORE_NLL ci-dessus.",
        source: "Reutilise le seuil EXACT_SCORE_NLL deja derive ci-dessus, applique separement a chaque moitie temporelle - jamais un nouveau nombre.",
        pass_condition: "nll_holdout_half1 <= " + nllBootstrap.ci_upper + " ET nll_holdout_half2 <= " + nllBootstrap.ci_upper,
      },
      NO_CATASTROPHIC_SECONDARY_DEGRADATION: {
        description: "Scores bas frequents (0-0,1-0,0-1,1-1) : contribution NLL par cellule, holdout vs OOS_DEV.",
        oos_dev_low_score: lowScoreOosDev,
        max_relative_degradation: MAX_LOW_SCORE_RELATIVE_DEGRADATION,
        source: "lib/promotion.js#MAX_LOW_SCORE_RELATIVE_DEGRADATION (10%, deja pre-enregistre, reutilise tel quel)",
        pass_condition: "pour chaque cellule avec >=5 observations sur le holdout, degradation relative <= " + MAX_LOW_SCORE_RELATIVE_DEGRADATION,
      },
    },
    decision_rule: {
      REJECT_if: "POINT_IN_TIME_INTEGRITY echoue OU REPRODUCIBILITY echoue OU EXACT_SCORE_NLL echoue (integrite structurelle ou performance primaire compromise - jamais reparable en attendant plus de donnees)",
      INCONCLUSIVE_if: "DATA_COVERAGE echoue (pas encore assez de matchs) OU au moins un des gates {CALIBRATION, MARKET_MARGINALS, TEMPORAL_STABILITY, NO_CATASTROPHIC_SECONDARY_DEGRADATION} echoue sans que REJECT ne soit deja declenche",
      VALIDATED_if: "TOUS les gates PASS",
      never: "Aucun seuil ci-dessus ne sera modifie apres lecture du holdout 2025. Aucun retuning. Aucune deuxieme tentative.",
    },
    pre_registration_rule: "Ce contrat est ecrit et hashe AVANT le premier fetch de " + leagueKey + " saison 2025. Un commit git dedie (PRE_HOLDOUT_CONTRACT_SHA) doit exister avant scripts/collect-league-fixtures.js --seasons=2025.",
  };

  const contractHash = crypto.createHash("sha256").update(JSON.stringify(contract)).digest("hex");
  const outPath = path.join(pvDir, "production-validation-contract.json");
  fs.writeFileSync(outPath, JSON.stringify({ contract, hash: contractHash }, null, 2));
  console.log(JSON.stringify({ contract, hash: contractHash }, null, 2));
  console.log("\nEcrit: " + outPath);
}

main();
