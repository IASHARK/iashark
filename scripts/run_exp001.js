#!/usr/bin/env node
"use strict";
// GATE C10 (SPEC LAB PRO v1.0) - point d'entree UNIQUE pour EXP-001
// (npm run lab:exp001). Ordre strict, aucune etape manuelle entre deux
// cutoffs :
//   1. charge le manifest (scripts/experiments/exp001_manifest.json)
//   2. valide le gating (les 4 conditions DATASET_EXISTS/B6_FIDELITY_PASSED/
//      DATASET_VERSION_COMPUTED/LOCKBOX_SEALED) - si une seule manque,
//      ARRET IMMEDIAT, jamais de contournement synthetique
//   3. (seulement si gating OK) charge le dataset reel + verifie
//      l'integrite du lockbox EN LECTURE SEULE (jamais d'ouverture/ecriture)
//   4. walk-forward -> fit_rho.py -> metriques -> bootstrap -> promotion
//      (lib/lab/run-experiment.js#runExperiment, deja teste sur donnees
//      synthetiques par tests/lab-run-experiment.test.js)
//   5. ecrit scripts/experiments/exp001_report.json
//
// Aujourd'hui (2026-09-04), l'etape 2 bloque systematiquement : aucune
// fixture Premier League reelle n'a encore ete collectee (B1 reste
// BLOCKED_ACCESS, quota API-Sports). C'est le comportement ATTENDU et
// verifie par tests/lab-run-experiment.test.js - cette commande ne
// lancera reellement EXP-001 que lorsque les 4 conditions passeront a
// satisfied:true dans le manifest.

const fs = require("node:fs");
const path = require("node:path");
const { loadManifest, evaluateGate } = require("../lib/lab/experiment-manifest.js");
const { runExperiment } = require("../lib/lab/run-experiment.js");

function main() {
  const manifest = loadManifest();
  const gate = evaluateGate(manifest);

  if (!gate.can_run) {
    console.log(`EXP-001 : status=${manifest.status} - lancement refuse.`);
    console.log("Conditions manquantes (gating_to_running) :");
    for (const c of manifest.gating_to_running.conditions) {
      if (!c.satisfied) console.log(`  - [${c.id}] ${c.description}`);
    }
    console.log("\nAucune donnee synthetique ne sera substituee pour contourner ce blocage (regle du protocole SPEC LAB PRO v1.0).");
    process.exit(1);
  }

  // A partir d'ici, le gating a valide DATASET_EXISTS + B6_FIDELITY_PASSED
  // + DATASET_VERSION_COMPUTED + LOCKBOX_SEALED : un dataset reel et une
  // lockbox scellee doivent donc exister. Le chargement concret depuis
  // lib/data/cache.js (emplacement exact des fixtures collectees par B1)
  // sera implemente au moment ou B1 sera reellement execute - ecrire ce
  // chargement maintenant, contre des donnees qui n'existent pas encore,
  // reviendrait a deviner une interface jamais verifiee.
  let loadRealDataset;
  try {
    loadRealDataset = require("../lib/lab/load-real-dataset.js");
  } catch (e) {
    console.error("EXP-001 : gating satisfait mais lib/lab/load-real-dataset.js n'existe pas encore.");
    console.error("A implementer au moment de B1 (chargement reel des fixtures Premier League depuis lib/data/cache.js) - jamais avant, pour ne pas deviner une interface contre des donnees inexistantes.");
    process.exit(1);
  }

  const dataset = loadRealDataset(manifest);
  const result = runExperiment({
    manifest,
    allFixtures: dataset.allFixtures,
    sealedLockbox: dataset.sealedLockbox,
    leagueAvgH: dataset.leagueAvgH,
    leagueAvgA: dataset.leagueAvgA,
    leagueId: dataset.leagueId,
    trainSeasons: dataset.trainSeasons,
    oosSeasons: dataset.oosSeasons,
  });

  const reportPath = path.join(__dirname, "experiments", "exp001_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

  if (!result.launched) {
    console.error(`EXP-001 : n'a pas pu se lancer (${result.reason}).`);
    process.exit(1);
  }

  console.log(`EXP-001 termine. Rapport ecrit : ${reportPath}`);
  console.log(`N predictions OOS : ${result.n_predictions} sur ${result.n_cutoffs} cutoffs`);
  console.log(`NLL M0=${result.nll_m0} / M1=${result.nll_m1}`);
  console.log(`Bootstrap IC95%: [${result.bootstrap.ci_lower}, ${result.bootstrap.ci_upper}]`);
  console.log(`Decision de promotion : ${result.promotion.status} (${result.promotion.reason_codes.join(", ") || "aucune reserve"})`);
}

main();
