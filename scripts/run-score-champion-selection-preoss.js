#!/usr/bin/env node
"use strict";
// LEAGUE_SCORE_PRODUCTION_VALIDATION_V1 - Phase 1A (2026-09-06).
// CHAMPION_SELECTION : compare B0/M0/M2 sur TRAIN(warmup+train)/OOS_DEV
// UNIQUEMENT, par metrique ABSOLUE (EXACT_SCORE_NLL le plus bas gagne),
// jamais par un test de type "le candidat doit battre le champion avec
// un CI favorable" (lib/promotion.js#evaluatePromotion, reutilise
// ailleurs, N'EST PAS applique ici - c'est exactement le biais
// CHALLENGER_PROMOTION que ce nouveau protocole corrige). Le champion
// PEUT etre B0. AUCUN acces a OOS_FINAL (2024, deja consommee par les
// anciennes experiences) ni a SEALED (2025) - uniquement warmup/train/
// oos_dev, deja ouverts depuis la Phase Factory precedente.
//
// B0 vs M0 : calcule ICI pour la premiere fois sur OOS_DEV (jamais fait
// avant - seul OOS_FINAL/2024 avait ce calcul, sur des donnees deja
// consommees). Reutilise lib/lab/walkforward-runner.js#runWalkForward
// A L'IDENTIQUE du script run-score-oos-final.js (memes lambdas
// point-in-time, seul rho differe entre les deux "roles" champion/
// candidat de ce runner generique).
// M2 vs M0 : reutilise TEL QUEL le rapport OOS_DEV DEJA CALCULE et DEJA
// HASHE par scripts/run-score-oos-dev.js (data/league-factory/<key>/
// score-oos-dev-report.json) - OOS_DEV n'a jamais ete "final", le
// reutiliser ici pour une DECISION DE SELECTION (pas une nouvelle
// promotion de challenger) ne viole aucune regle de non-retropedalage.
//
// Usage : node scripts/run-score-champion-selection-preoss.js --league-key=seriea

const fs = require("fs");
const path = require("path");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");
const { MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MAX_RHO_STD, MAX_SECONDARY_DEGRADATION } = require("../lib/promotion.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }
function relativeDegradation(reference, candidate) { if (reference === 0) return candidate === 0 ? 0 : Infinity; return (candidate - reference) / reference; }

function computeB0vsM0OnOosDev(leagueKey) {
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const { manifest: preossManifest } = { manifest: JSON.parse(fs.readFileSync(path.join(factoryDir, "score-lab-preoss.json"), "utf8")) };
  const { manifest: oosManifest } = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-manifest.json"), "utf8"));

  const rhoFinal = oosManifest.rho.final_value;
  const leagueAvgH = oosManifest.league_averages.leagueAvgH;
  const leagueAvgA = oosManifest.league_averages.leagueAvgA;

  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const allFixtures = [...warmup, ...train, ...oosDev];

  const constantRhoFitter = () => ({ rho_hat: rhoFinal, convergence: true, on_boundary: false });
  const wf = runWalkForward({
    allFixtures, trainSeasons: [sp.warmup, sp.train], oosSeasons: [sp.oos_dev],
    championRho: 0, candidateRhoFitter: constantRhoFitter,
    leagueAvgH, leagueAvgA, leagueId: league.apiFootballId,
  });

  const predictions = wf.predictions;
  const nllItemsB0 = predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: 0 }));
  const nllItemsM0 = predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFinal }));
  const nllB0 = exactScoreNLL(nllItemsB0);
  const nllM0 = exactScoreNLL(nllItemsM0);

  function marketsFor(p, key) { return p[key]; } // markets_m0 = championRho(0)=B0, markets_m1 = candidateRhoFitter(rhoFinal)=M0
  const ou25 = { b0: [], m0: [] }, btts = { b0: [], m0: [] }, x12 = { b0: [], m0: [] };
  for (const p of predictions) {
    const total = p.goals_home_90 + p.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0;
    const bttsOutcome = p.goals_home_90 > 0 && p.goals_away_90 > 0 ? 1 : 0;
    const x12Outcome = p.goals_home_90 > p.goals_away_90 ? "p1" : (p.goals_home_90 === p.goals_away_90 ? "pN" : "p2");
    const m0mkt = marketsFor(p, "markets_m0"), m1mkt = marketsFor(p, "markets_m1");
    ou25.b0.push({ prob: m0mkt.overUnder["2.5"].over, outcome: over25 });
    ou25.m0.push({ prob: m1mkt.overUnder["2.5"].over, outcome: over25 });
    btts.b0.push({ prob: m0mkt.btts.yes, outcome: bttsOutcome });
    btts.m0.push({ prob: m1mkt.btts.yes, outcome: bttsOutcome });
    x12.b0.push({ probs: m0mkt, outcome: x12Outcome });
    x12.m0.push({ probs: m1mkt, outcome: x12Outcome });
  }
  function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }
  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
  const ou25LoglossB0 = mean(ou25.b0.map((r) => logloss(r.prob, r.outcome)));
  const ou25LoglossM0 = mean(ou25.m0.map((r) => logloss(r.prob, r.outcome)));
  const bttsLoglossB0 = mean(btts.b0.map((r) => logloss(r.prob, r.outcome)));
  const bttsLoglossM0 = mean(btts.m0.map((r) => logloss(r.prob, r.outcome)));
  function x12Logloss(rows) { return mean(rows.map((r) => { const p = r.outcome === "p1" ? r.probs.p1 : r.outcome === "pN" ? r.probs.pN : r.probs.p2; return logloss(p, 1); })); }
  const x12LoglossB0 = x12Logloss(x12.b0);
  const x12LoglossM0 = x12Logloss(x12.m0);

  return {
    league_key: leagueKey, oos_dev_season: sp.oos_dev,
    n_oos: predictions.length,
    b0: { nll: nllB0, secondary: { ou25_logloss: ou25LoglossB0, btts_logloss: bttsLoglossB0, x12_logloss: x12LoglossB0 } },
    m0: { nll: nllM0, secondary: { ou25_logloss: ou25LoglossM0, btts_logloss: bttsLoglossM0, x12_logloss: x12LoglossM0 }, rho: rhoFinal },
    rho_fit_health_source: { convergence_rate: preossManifest.convergence_rate, boundary_hit_rate: preossManifest.boundary_hit_rate, rho_std: preossManifest.rho_across_train_cutoffs.std, source: "data/league-factory/" + leagueKey + "/score-lab-preoss.json (deja calcule, jamais retunee ici)" },
  };
}

function loadM2FromExistingOosDevReport(leagueKey) {
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const report = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-dev-report.json"), "utf8"));
  return {
    league_key: leagueKey, oos_dev_season: report.oos_dev_season,
    n_oos: report.coverage.m0_valid_predictions,
    nll: report.primary.nll_m2,
    secondary: { ou25_logloss: report.secondary.ou25.logloss_m2, btts_logloss: report.secondary.btts.logloss_m2, x12_logloss: report.secondary.x12.logloss_m2 },
    source: "data/league-factory/" + leagueKey + "/score-oos-dev-report.json (deja calcule et hashe - manifest_hash=" + report.manifest_hash + " - reutilise tel quel, jamais recalcule)",
    m0_from_same_report: { nll: report.primary.nll_m0, secondary: { ou25_logloss: report.secondary.ou25.logloss_m0, btts_logloss: report.secondary.btts.logloss_m0, x12_logloss: report.secondary.x12.logloss_m0 } },
  };
}

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/run-score-champion-selection-preoss.js --league-key=<key>"); process.exit(1); }

  const b0m0 = computeB0vsM0OnOosDev(leagueKey);
  const m2 = loadM2FromExistingOosDevReport(leagueKey);

  // Consistance : le NLL_M0 recalcule ici (B0 vs M0 frais) doit etre
  // IDENTIQUE (aux arrondis pres) a celui deja publie dans le rapport
  // OOS_DEV M0-vs-M2 existant - meme donnee, meme rho gele, memes
  // fixtures - sinon quelque chose ne correspond pas entre les deux
  // scripts et il ne faut PAS continuer.
  const nllM0Consistent = Math.abs(b0m0.m0.nll - m2.m0_from_same_report.nll) < 1e-6;

  const candidates = {
    B0: { model_id: "SCORE_B0_" + leagueKey.toUpperCase(), nll: b0m0.b0.nll, secondary: b0m0.b0.secondary, n_oos: b0m0.n_oos, structural: { convergence_rate: 1, boundary_hit_rate: 0, rho_std: 0, note: "rho=0 fixe, jamais fitte - aucune instabilite possible" } },
    M0: { model_id: "SCORE_M0_" + leagueKey.toUpperCase(), nll: b0m0.m0.nll, secondary: b0m0.m0.secondary, n_oos: b0m0.n_oos, structural: b0m0.rho_fit_health_source },
    M2: { model_id: "SCORE_M2_" + leagueKey.toUpperCase(), nll: m2.nll, secondary: m2.secondary, n_oos: m2.n_oos, structural: b0m0.rho_fit_health_source, note: "partage le rho de M0 (meme fit) - ajoute la structure early-season Bayes par-dessus" },
  };

  // Vetos structurels ABSOLUS (reutilises tels quels de lib/promotion.js -
  // jamais un seuil invente pour cette occasion) : un candidat qui echoue
  // est retire de la course AVANT le classement par NLL, jamais choisi
  // meme s'il a le meilleur NLL brut.
  const vetoed = {};
  for (const [name, c] of Object.entries(candidates)) {
    const reasons = [];
    if (c.structural.convergence_rate < MIN_CONVERGENCE_RATE) reasons.push("FITTER_NON_CONVERGENT (convergence_rate=" + c.structural.convergence_rate + "<" + MIN_CONVERGENCE_RATE + ")");
    if (c.structural.boundary_hit_rate > MAX_BOUNDARY_HIT_RATE) reasons.push("RHO_ON_BOUNDARY (boundary_hit_rate=" + c.structural.boundary_hit_rate + ">" + MAX_BOUNDARY_HIT_RATE + ")");
    if (c.structural.rho_std > MAX_RHO_STD) reasons.push("RHO_UNSTABLE (rho_std=" + c.structural.rho_std + ">" + MAX_RHO_STD + ")");
    if (reasons.length) vetoed[name] = reasons;
  }

  const survivors = Object.entries(candidates).filter(([name]) => !vetoed[name]);
  survivors.sort((a, b) => a[1].nll - b[1].nll); // NLL le plus bas = meilleur, ABSOLU, jamais relatif a un "challenger doit battre"
  const primaryWinnerName = survivors.length ? survivors[0][0] : null;
  const primaryWinner = survivors.length ? survivors[0][1] : null;

  // Veto secondaire : le vainqueur primaire ne doit pas degrader un
  // marche secondaire de plus de MAX_SECONDARY_DEGRADATION (3%, seuil
  // deja pre-enregistre dans lib/promotion.js, jamais invente ici) par
  // rapport au 2e meilleur candidat sur CE marche precis.
  let secondaryVeto = null;
  if (primaryWinner) {
    for (const [name, c] of survivors) {
      if (name === primaryWinnerName) continue;
      for (const marketKey of Object.keys(primaryWinner.secondary)) {
        const deg = relativeDegradation(c.secondary[marketKey], primaryWinner.secondary[marketKey]);
        if (deg > MAX_SECONDARY_DEGRADATION) { secondaryVeto = { market: marketKey, degradation_vs: name, relative_degradation: deg }; break; }
      }
      if (secondaryVeto) break;
    }
  }

  const championSelected = secondaryVeto ? null : primaryWinnerName;
  const reason = secondaryVeto
    ? "VETO_SECONDAIRE : " + primaryWinnerName + " gagne le NLL primaire mais degrade " + secondaryVeto.market + " de " + (secondaryVeto.relative_degradation * 100).toFixed(2) + "% vs " + secondaryVeto.degradation_vs + " (> seuil " + (MAX_SECONDARY_DEGRADATION * 100) + "%) - selection manuelle requise"
    : (championSelected ? championSelected + " a le meilleur EXACT_SCORE_NLL absolu (" + candidates[championSelected].nll.toFixed(6) + ") parmi les candidats non-vetoes structurellement, sans degradation secondaire disqualifiante vs les autres." : "AUCUN CANDIDAT SURVIVANT - tous vetoes structurellement");

  const result = {
    protocol: "LEAGUE_SCORE_PRODUCTION_VALIDATION_V1",
    phase: "1A_CHAMPION_SELECTION",
    league_key: leagueKey,
    generated_at: new Date().toISOString(),
    train_seasons: loadLeagueConfig(leagueKey).seasonSplit ? [loadLeagueConfig(leagueKey).seasonSplit.warmup, loadLeagueConfig(leagueKey).seasonSplit.train] : null,
    oos_dev_season: b0m0.oos_dev_season,
    consistency_check_nll_m0_matches_existing_oos_dev_report: nllM0Consistent,
    candidates,
    vetoed,
    primary_winner_before_secondary_veto: primaryWinnerName,
    secondary_veto: secondaryVeto,
    champion_selected: championSelected,
    champion_selection_reason: reason,
  };

  const outDir = path.join(__dirname, "..", "data", "league-factory", leagueKey, "score-production-validation-v1");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "champion-selection.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log("\nEcrit: " + outPath);
  if (!nllM0Consistent) { console.error("\nINCOHERENCE DETECTEE entre le calcul frais et le rapport OOS_DEV existant - STOP, ne pas continuer."); process.exit(2); }
}

main();
