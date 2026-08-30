"use strict";
// Backtest reel contre historique.json (pas invente, pas simule) - mesure
// Brier score, log loss et une table de calibration/fiabilite sur les
// predictions deja resolues, ET compare deux estimateurs de probabilite
// LLM-independants (voir section "Comparaison" plus bas).
//
// Limite honnete (voir IASHARK_V2_EXECUTION_STATE.md) : c'est un
// echantillon reel mais limite (~291 paris uniques resolus), produit par
// l'ANCIEN pipeline (avant le moteur V2.1). Ce n'est PAS une validation du
// futur moteur multi-modeles - seulement une photographie honnete de l'etat
// de calibration actuel, a partir de laquelle mesurer un progres reel plus
// tard (walk-forward sur les nouvelles predictions collectees en direct via
// match_snapshots).
//
// === Ce que ce script NE PEUT PAS faire, et pourquoi ===
// On ne peut PAS reconstituer ce que le pipeline deterministe (post-fix LLM,
// lib/decision.js) aurait produit sur ces 291 memes matchs historiques.
// Deux raisons concretes, pas une limite de principe :
//   1. historique.json ne stocke JAMAIS la probabilite modele brute par
//      prediction (p1/pn/p2/anchored) - seulement `conf` (confiance LLM,
//      0-10) et `cote` (cote bookmaker). Le nombre qu'aurait produit
//      calcFinalProbs()/pickMarketDeterministic() pour CES matchs precis
//      n'a jamais ete persiste.
//   2. Le recalculer retroactivement demanderait de refetcher les memes
//      team stats/odds historiques via api-football (APISPORTS_KEY), non
//      disponible dans cette session.
// La seule comparaison honnete possible avec les donnees disponibles
// aujourd'hui est OLD_PIPELINE (confiance LLM) vs MARKET_IMPLIED_PROXY
// (1/cote, LLM-independant et derive du marche reel) - PAS OLD vs
// DETERMINISTIC_PIPELINE. Une vraie comparaison OLD vs DETERMINISTIC
// necessite d'attendre que le pipeline corrige genere et resolve de
// nouvelles predictions (collecte forward via match_snapshots, deja en
// place) - impossible a accelerer depuis cette session.
//
// Usage: node scripts/backtest_historique.js [chemin vers historique.json]

const fs = require("fs");
const path = require("path");
const { brierScore, logLoss, calibrationTable, expectedCalibrationError } = require("../lib/calibration.js");

function probabilityBand(prob) {
  const pct = Math.round(prob * 100);
  const lo = Math.floor(pct / 10) * 10;
  return lo + "-" + (lo + 10) + "%";
}

function analyze(items, label) {
  const brier = brierScore(items);
  const ll = logLoss(items);
  const table = calibrationTable(items, (it) => it.bucket);
  const ece = expectedCalibrationError(table);
  const bandTable = calibrationTable(items, (it) => probabilityBand(it.prob));
  const marketTable = calibrationTable(items.filter((it) => it.market), (it) => it.market);
  return {
    label,
    n: items.length,
    metrics: {
      brier_score: brier != null ? Math.round(brier * 10000) / 10000 : null,
      log_loss: ll != null ? Math.round(ll * 10000) / 10000 : null,
      expected_calibration_error: ece != null ? Math.round(ece * 10000) / 10000 : null,
    },
    calibration_table: table.map((g) => ({
      bucket: g.key, n: g.count,
      avg_predicted_prob_pct: Math.round(g.avgPredictedProb * 1000) / 10,
      actual_win_rate_pct: Math.round(g.actualRate * 1000) / 10,
      gap_pct: Math.round(g.gap * 1000) / 10,
    })),
    by_probability_band: bandTable.map((g) => ({
      band: g.key, n: g.count,
      avg_predicted_prob_pct: Math.round(g.avgPredictedProb * 1000) / 10,
      actual_win_rate_pct: Math.round(g.actualRate * 1000) / 10,
      gap_pct: Math.round(g.gap * 1000) / 10,
    })),
    by_market: marketTable
      .filter((g) => g.count >= 10)
      .map((g) => ({
        market: g.key, n: g.count,
        avg_predicted_prob_pct: Math.round(g.avgPredictedProb * 1000) / 10,
        actual_win_rate_pct: Math.round(g.actualRate * 1000) / 10,
        gap_pct: Math.round(g.gap * 1000) / 10,
      })),
  };
}

function main() {
  const histoPath = process.argv[2] || path.join(__dirname, "..", "historique.json");
  const histo = JSON.parse(fs.readFileSync(histoPath, "utf8"));
  const preds = histo.predictions || [];

  const resolvedBase = preds.filter((p) => (p.result === "win" || p.result === "loss") && p.type === "single");

  // OLD_PIPELINE : conf/10 (confiance auto-rapportee par le LLM narratif).
  const oldItems = resolvedBase
    .filter((p) => p.conf != null)
    .map((p) => ({
      prob: Math.min(1, Math.max(0, p.conf / 10)),
      outcome: p.result === "win" ? 1 : 0,
      bucket: p.conf_bucket || "?",
      market: p.market || null,
      fixture_id: p.fixture_id,
    }));

  // MARKET_IMPLIED_PROXY : 1/cote (probabilite implicite du marche, marge
  // bookmaker incluse - PAS retiree via Shin ici, volontairement simple et
  // reproductible). LLM-independant, derive uniquement de la cote reelle
  // stockee par prediction. Bucket par tranche de cote (pas conf_bucket,
  // qui n'a pas de sens pour cet estimateur).
  const marketItems = resolvedBase
    .filter((p) => p.cote != null && parseFloat(p.cote) > 1)
    .map((p) => {
      const cote = parseFloat(p.cote);
      const prob = 1 / cote;
      let bucket;
      if (cote < 1.5) bucket = "cote<1.5";
      else if (cote < 1.75) bucket = "cote 1.5-1.75";
      else if (cote < 2.2) bucket = "cote 1.75-2.2";
      else bucket = "cote>=2.2";
      return { prob, outcome: p.result === "win" ? 1 : 0, bucket, market: p.market || null, fixture_id: p.fixture_id };
    });

  const oldAnalysis = analyze(oldItems, "OLD_PIPELINE_LLM_CONFIDENCE");
  const marketAnalysis = analyze(marketItems, "MARKET_IMPLIED_PROBABILITY_PROXY");

  const report = {
    generated_at: new Date().toISOString(),
    source: path.relative(process.cwd(), histoPath),
    n_total_predictions: preds.length,
    n_resolved_singles: resolvedBase.length,
    comparison: {
      OLD_PIPELINE_LLM_CONFIDENCE: oldAnalysis,
      MARKET_IMPLIED_PROBABILITY_PROXY: marketAnalysis,
      brier_delta: (oldAnalysis.metrics.brier_score != null && marketAnalysis.metrics.brier_score != null)
        ? Math.round((marketAnalysis.metrics.brier_score - oldAnalysis.metrics.brier_score) * 10000) / 10000
        : null,
      brier_delta_interpretation: (oldAnalysis.metrics.brier_score != null && marketAnalysis.metrics.brier_score != null)
        ? (marketAnalysis.metrics.brier_score < oldAnalysis.metrics.brier_score
            ? "Le proxy marche (1/cote) a un Brier score PLUS BAS (meilleur) que la confiance LLM sur cet echantillon."
            : "Le proxy marche (1/cote) a un Brier score PLUS HAUT (moins bon) ou egal a la confiance LLM sur cet echantillon.")
        : null,
    },
    IMPORTANT_LIMITATION: "Ceci compare OLD_PIPELINE (confiance LLM) a MARKET_IMPLIED_PROBABILITY_PROXY (1/cote), PAS au pipeline deterministe reel (lib/decision.js + calcFinalProbs). historique.json ne stocke aucune probabilite modele brute par prediction (seulement conf et cote), et cette session n'a pas acces a APISPORTS_KEY pour refetcher les donnees historiques et recalculer ce qu'aurait produit le nouveau moteur. Une vraie comparaison OLD vs DETERMINISTIC_PIPELINE necessite d'attendre l'accumulation de nouvelles predictions generees et resolues par le pipeline corrige (voir match_snapshots, deja en place pour cette collecte forward).",
    interpretation: oldAnalysis.calibration_table.some((g) => g.gap_pct < -5)
      ? "SURCONFIANCE DETECTEE dans OLD_PIPELINE : au moins un bucket de confiance LLM a un taux de reussite reel significativement inferieur a la probabilite annoncee."
      : "Pas de surconfiance significative detectee dans OLD_PIPELINE sur cet echantillon.",
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();
module.exports = { main, analyze, probabilityBand };
