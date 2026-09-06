"use strict";
// LEAGUE_SCORE_PRODUCTION_VALIDATION_V1 (2026-09-06). Tests de garde
// pour le protocole CHAMPION_SELECTION (Phase 1A) + CONTRACT_FREEZE
// (Phase 1B) - avant toute ouverture du holdout SEALED (2025). Verifie
// que le protocole reste base sur une metrique ABSOLUE (jamais "le
// challenger doit battre le champion"), que les seuils sont bien ceux
// deja pre-enregistres (lib/promotion.js) ou derives d'OOS_DEV, et
// qu'aucun script de ce protocole ne touche jamais oos_final/sealed_unread.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { MIN_N_OOS, MAX_SECONDARY_DEGRADATION, MAX_LOW_SCORE_RELATIVE_DEGRADATION } = require("../lib/promotion.js");

const root = path.join(__dirname, "..");
const seriea_dir = path.join(root, "data", "league-factory", "seriea", "score-production-validation-v1");

test("Phase 1A (Serie A) : champion selectionne par NLL ABSOLU le plus bas parmi les survivants, jamais un test 'challenger doit battre le champion'", () => {
  const selectionPath = path.join(seriea_dir, "champion-selection.json");
  assert.ok(fs.existsSync(selectionPath), "champion-selection.json doit exister (lancer scripts/run-score-champion-selection-preoss.js --league-key=seriea)");
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));

  assert.equal(selection.protocol, "LEAGUE_SCORE_PRODUCTION_VALIDATION_V1");
  assert.equal(selection.phase, "1A_CHAMPION_SELECTION");
  assert.equal(selection.consistency_check_nll_m0_matches_existing_oos_dev_report, true, "le NLL M0 recalcule doit correspondre exactement au rapport OOS_DEV deja publie - sinon incoherence entre les deux scripts");
  assert.ok(["B0", "M0", "M2"].includes(selection.champion_selected), "le champion doit etre l'un des 3 candidats definis, jamais un 4eme modele invente");

  const survivors = Object.entries(selection.candidates).filter(([name]) => !selection.vetoed[name]);
  const nlls = survivors.map(([, c]) => c.nll);
  const championNll = selection.candidates[selection.champion_selected].nll;
  assert.equal(championNll, Math.min(...nlls), "le champion doit avoir le NLL le plus bas parmi les survivants non-vetoes - c'est la SEULE regle de selection, jamais un seuil de gain minimal");
});

test("Phase 1A : B0 (baseline independant) est un candidat a part entiere, jamais exclu de la comparaison ni traite comme reference fixe uniquement", () => {
  const selection = JSON.parse(fs.readFileSync(path.join(seriea_dir, "champion-selection.json"), "utf8"));
  assert.ok(selection.candidates.B0, "B0 doit apparaitre dans les candidats compares, pas seulement M0/M2");
  assert.ok(typeof selection.candidates.B0.nll === "number");
});

test("Phase 1B : le contrat de validation production est gele AVANT toute ouverture du holdout, avec les 8 gates demandes", () => {
  const contractPath = path.join(seriea_dir, "production-validation-contract.json");
  assert.ok(fs.existsSync(contractPath), "production-validation-contract.json doit exister (lancer scripts/freeze-score-production-validation-contract.js --league-key=seriea)");
  const { contract, hash } = JSON.parse(fs.readFileSync(contractPath, "utf8"));

  assert.equal(contract.frozen_before_holdout_access, true);
  assert.equal(contract.champion_frozen, true);
  assert.ok(hash && hash.length === 64, "le contrat doit etre hashe (SHA-256)");

  const requiredGates = ["POINT_IN_TIME_INTEGRITY", "DATA_COVERAGE", "REPRODUCIBILITY", "EXACT_SCORE_NLL", "CALIBRATION", "MARKET_MARGINALS", "TEMPORAL_STABILITY", "NO_CATASTROPHIC_SECONDARY_DEGRADATION"];
  for (const gate of requiredGates) assert.ok(contract.gates[gate], "gate manquant: " + gate);

  assert.ok(!/challenger.*doit.*battre|doit.*battre.*baseline|doit.*battre.*champion/i.test(JSON.stringify(contract.decision_rule)), "le contrat ne doit JAMAIS exiger qu'un challenger batte un baseline - c'est exactement le biais corrige");
});

test("Phase 1B : les seuils numeriques sont soit deja pre-enregistres dans lib/promotion.js, soit derives d'OOS_DEV - jamais un nombre invente pour cette occasion", () => {
  const { contract } = JSON.parse(fs.readFileSync(path.join(seriea_dir, "production-validation-contract.json"), "utf8"));
  assert.equal(contract.gates.DATA_COVERAGE.threshold, MIN_N_OOS, "DATA_COVERAGE doit reutiliser lib/promotion.js#MIN_N_OOS tel quel");
  assert.equal(contract.gates.MARKET_MARGINALS.max_relative_degradation, MAX_SECONDARY_DEGRADATION, "MARKET_MARGINALS doit reutiliser lib/promotion.js#MAX_SECONDARY_DEGRADATION tel quel");
  assert.equal(contract.gates.NO_CATASTROPHIC_SECONDARY_DEGRADATION.max_relative_degradation, MAX_LOW_SCORE_RELATIVE_DEGRADATION, "doit reutiliser lib/promotion.js#MAX_LOW_SCORE_RELATIVE_DEGRADATION tel quel");
  // EXACT_SCORE_NLL et CALIBRATION doivent etre derives d'OOS_DEV (presence des valeurs observees), jamais des constantes nues.
  assert.ok(typeof contract.gates.EXACT_SCORE_NLL.oos_dev_observed_mean_nll === "number");
  assert.ok(Array.isArray(contract.gates.EXACT_SCORE_NLL.oos_dev_bootstrap_ci) && contract.gates.EXACT_SCORE_NLL.oos_dev_bootstrap_ci.length === 2);
  assert.ok(typeof contract.gates.CALIBRATION.oos_dev_ece === "number" && contract.gates.CALIBRATION.oos_dev_ece >= 0);
  assert.equal(contract.gates.CALIBRATION.threshold_ece, contract.gates.CALIBRATION.oos_dev_ece * 2, "le seuil de calibration doit etre exactement 2x l'ECE deja mesure sur OOS_DEV, jamais un autre multiplicateur choisi apres coup");
});

test("Phase 1A/1B : les scripts n'accedent jamais a oos_final (2024, deja consommee) ni sealed_unread (2025) - uniquement warmup/train/oos_dev", () => {
  const selectionScript = fs.readFileSync(path.join(root, "scripts", "run-score-champion-selection-preoss.js"), "utf8");
  const freezeScript = fs.readFileSync(path.join(root, "scripts", "freeze-score-production-validation-contract.js"), "utf8");
  for (const src of [selectionScript, freezeScript]) {
    assert.ok(!/sp\.oos_final/.test(src), "aucun script Phase 1A/1B ne doit lire sp.oos_final (2024, deja consommee)");
    assert.ok(!/sp\.sealed_unread/.test(src), "aucun script Phase 1A/1B ne doit lire sp.sealed_unread (2025, SEALED)");
  }
});

test("Phase 1B : le champion gele porte un git SHA et des hashes de dataset TRAIN/OOS_DEV - tracabilite complete avant holdout", () => {
  const { contract } = JSON.parse(fs.readFileSync(path.join(seriea_dir, "production-validation-contract.json"), "utf8"));
  assert.match(contract.champion.code_sha_at_freeze, /^[0-9a-f]{40}$/);
  assert.ok(contract.champion.dataset_hashes_train_oos_dev.warmup_2021);
  assert.ok(contract.champion.dataset_hashes_train_oos_dev.train_2022);
  assert.ok(contract.champion.dataset_hashes_train_oos_dev.oos_dev_2023);
});
