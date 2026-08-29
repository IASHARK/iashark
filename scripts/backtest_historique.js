"use strict";
// Backtest reel contre historique.json (pas invente, pas simule) - mesure
// Brier score, log loss et une table de calibration/fiabilite sur les
// predictions deja resolues.
//
// Limite honnete (voir IASHARK_V2_EXECUTION_STATE.md) : c'est un
// echantillon reel mais limite (~291 paris uniques resolus), produit par
// l'ANCIEN pipeline (avant le moteur V2.1). Ce n'est PAS une validation du
// futur moteur multi-modeles - seulement une photographie honnete de l'etat
// de calibration actuel, a partir de laquelle mesurer un progres reel plus
// tard (walk-forward sur les nouvelles predictions collectees en direct via
// match_snapshots).
//
// Mappage prob : le champ `conf` de historique.json est un score de
// confiance 0-10 auto-rapporte par le LLM narratif (pas une probabilite
// calibree par un modele statistique). On le traite comme conf/10 parce
// que c'est litteralement l'interpretation que le pipeline lui-meme donne
// deja ailleurs (ex: `an.confiance>=7.0` pour armer un pari). Ce mappage est
// une hypothese assumee, pas une verite etablie - c'est justement ce que ce
// script mesure : si cette hypothese tient (le score annonce correspond au
// taux de reussite reel) ou pas.
//
// Usage: node scripts/backtest_historique.js [chemin vers historique.json]

const fs = require("fs");
const path = require("path");
const { brierScore, logLoss, calibrationTable, expectedCalibrationError } = require("../lib/calibration.js");

function main() {
  const histoPath = process.argv[2] || path.join(__dirname, "..", "historique.json");
  const histo = JSON.parse(fs.readFileSync(histoPath, "utf8"));
  const preds = histo.predictions || [];

  const resolved = preds.filter((p) => (p.result === "win" || p.result === "loss") && p.type === "single" && p.conf != null);

  const items = resolved.map((p) => ({
    prob: Math.min(1, Math.max(0, p.conf / 10)),
    outcome: p.result === "win" ? 1 : 0,
    bucket: p.conf_bucket || "?",
    fixture_id: p.fixture_id,
  }));

  const brier = brierScore(items);
  const ll = logLoss(items);
  const table = calibrationTable(items, (it) => it.bucket);
  const ece = expectedCalibrationError(table);

  const report = {
    generated_at: new Date().toISOString(),
    source: path.relative(process.cwd(), histoPath),
    n_total_predictions: preds.length,
    n_resolved_singles_used: items.length,
    n_excluded: preds.length - items.length,
    metrics: {
      brier_score: brier != null ? Math.round(brier * 10000) / 10000 : null,
      log_loss: ll != null ? Math.round(ll * 10000) / 10000 : null,
      expected_calibration_error: ece != null ? Math.round(ece * 10000) / 10000 : null,
    },
    calibration_table: table.map((g) => ({
      bucket: g.key,
      n: g.count,
      avg_predicted_prob_pct: Math.round(g.avgPredictedProb * 1000) / 10,
      actual_win_rate_pct: Math.round(g.actualRate * 1000) / 10,
      gap_pct: Math.round(g.gap * 1000) / 10,
    })),
    interpretation: table.some((g) => g.gap < -0.05)
      ? "SURCONFIANCE DETECTEE : au moins un bucket de confiance a un taux de reussite reel significativement inferieur a la probabilite annoncee. Le score de confiance actuel (conf/10) n'est PAS une probabilite calibree."
      : "Pas de surconfiance significative detectee sur cet echantillon (mais echantillon limite, a reconfirmer avec plus de donnees).",
    limitation: "Echantillon reel mais limite (ancien pipeline, avant moteur V2.1). Ne valide PAS un futur moteur - sert de photographie de reference (baseline) pour mesurer un progres reel plus tard.",
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) main();
module.exports = { main };
