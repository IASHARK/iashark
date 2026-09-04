"use strict";
// EXP-000 (SPEC LAB PRO v1.0 §41) - test d'equivalence algebrique pur,
// AUCUNE donnee externe requise. Compare :
//   CHAMPION_OLD = 0.35*Poisson(lh,la) + 0.65*DC(lh,la,rho=-0.13)
//   CANDIDATE    = DC(lh,la,rho=-0.0845)   [rho_effectif = 0.65*-0.13]
// maxGoals=10 fige (identique a l'ancien moteur) pendant cette experience -
// la troncature adaptative est hors perimetre (GATE A4).
// Ne modifie AUCUN fichier de production. Sortie : PASS/FAIL + rapport.

const { poissonProb } = require("../../lib/models.js");
const {
  buildPoissonMatrix,
  buildDixonColesMatrix,
  blendMatrices,
  deriveMarketsFromMatrix,
} = require("../../lib/markets/score-matrix.js");
const fs = require("fs");

const MAX_GOALS = 10; // fige, identique a l'ancien moteur - ne pas toucher ici (GATE A4 separe)

// Version parametree de dixonColesCorr, LOCALE a cette experience
// uniquement (ne modifie pas lib/models.js, dont le rho reste -0.13 en
// dur tant que A3 n'a pas remplace le blend en production). Formule
// identique caractere pres a lib/models.js#dixonColesCorr, rho en parametre.
function dixonColesCorrParam(h, a, lambdaH, lambdaA, rho) {
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function buildDixonColesMatrixParam(lambdaH, lambdaA, maxGoals, rho) {
  const mat = [];
  for (let h = 0; h <= maxGoals; h++) {
    mat[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * dixonColesCorrParam(h, a, lambdaH, lambdaA, rho);
      mat[h][a] = Math.max(0, p);
    }
  }
  return mat;
}

function renormalize(matrix) {
  const maxH = matrix.length - 1, maxA = matrix[0].length - 1;
  let total = 0;
  for (let h = 0; h <= maxH; h++) for (let a = 0; a <= maxA; a++) total += matrix[h][a];
  if (total > 0) for (let h = 0; h <= maxH; h++) for (let a = 0; a <= maxA; a++) matrix[h][a] /= total;
  return matrix;
}

function championOldMarkets(lambdaH, lambdaA) {
  const poissonMatrix = buildPoissonMatrix(lambdaH, lambdaA, MAX_GOALS);
  const dixonMatrix = buildDixonColesMatrix(lambdaH, lambdaA, MAX_GOALS); // rho=-0.13 en dur, production actuelle
  const blended = blendMatrices([{ matrix: poissonMatrix, weight: 0.35 }, { matrix: dixonMatrix, weight: 0.65 }]);
  return { matrix: blended, markets: deriveMarketsFromMatrix(blended) };
}

function candidateMarkets(lambdaH, lambdaA) {
  const RHO_EFFECTIVE = -0.0845; // = 0.65 * -0.13
  const matrix = renormalize(buildDixonColesMatrixParam(lambdaH, lambdaA, MAX_GOALS, RHO_EFFECTIVE));
  return { matrix, markets: deriveMarketsFromMatrix(matrix) };
}

// --- Jeu de test : 5 categories demandees ---
function buildTestPairs() {
  const pairs = [];
  // 1. 46 paires lambda reelles deja disponibles (data.json production du jour)
  try {
    const data = JSON.parse(fs.readFileSync(__dirname + "/../../data.json", "utf8"));
    for (const m of data.matchs) {
      if (m.lambda_h != null && m.lambda_a != null) pairs.push({ lh: m.lambda_h, la: m.lambda_a, cat: "reel_production" });
    }
  } catch (e) { console.log("data.json indisponible:", e.message); }

  // 2. grille deterministe couvrant tout le domaine autorise (bornes calcLambdas: 0.80-1.05 min, 3.0-3.4 max)
  const gridVals = [0.80, 0.90, 1.05, 1.35, 1.50, 2.00, 2.50, 3.00, 3.40];
  for (const h of gridVals) for (const a of gridVals) pairs.push({ lh: h, la: a, cat: "grille" });

  // 3. cas limites proches des bornes
  pairs.push({ lh: 0.80, la: 0.80, cat: "limite_min" });
  pairs.push({ lh: 3.40, la: 3.00, cat: "limite_max" });
  pairs.push({ lh: 0.8001, la: 0.8001, cat: "limite_min_epsilon" });
  pairs.push({ lh: 3.3999, la: 2.9999, cat: "limite_max_epsilon" });

  // 4. faible lambda / fort lambda
  pairs.push({ lh: 0.80, la: 3.00, cat: "faible_vs_fort" });
  pairs.push({ lh: 3.40, la: 0.80, cat: "fort_vs_faible" });

  // 5. asymetrie forte domicile/exterieur
  pairs.push({ lh: 3.40, la: 0.85, cat: "asymetrie_forte_dom" });
  pairs.push({ lh: 0.85, la: 3.00, cat: "asymetrie_forte_ext" });

  return pairs;
}

function run() {
  const pairs = buildTestPairs();
  const marketFields = ["p1", "pN", "p2"];
  const ouFields = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  let maxAbsError = 0;
  let maxAbsErrorDetail = null;
  let maxMatrixCellError = 0;
  let maxSumError = 0;
  const perCategory = {};

  for (const { lh, la, cat } of pairs) {
    const old = championOldMarkets(lh, la);
    const cand = candidateMarkets(lh, la);

    // cellule par cellule
    for (let h = 0; h <= MAX_GOALS; h++) {
      for (let a = 0; a <= MAX_GOALS; a++) {
        const d = Math.abs(old.matrix[h][a] - cand.matrix[h][a]);
        if (d > maxMatrixCellError) maxMatrixCellError = d;
        if (d > maxAbsError) { maxAbsError = d; maxAbsErrorDetail = { lh, la, cat, field: `matrix[${h}][${a}]`, old: old.matrix[h][a], cand: cand.matrix[h][a] }; }
      }
    }
    // somme matrice
    let sumOld = 0, sumCand = 0;
    for (let h = 0; h <= MAX_GOALS; h++) for (let a = 0; a <= MAX_GOALS; a++) { sumOld += old.matrix[h][a]; sumCand += cand.matrix[h][a]; }
    maxSumError = Math.max(maxSumError, Math.abs(sumOld - 1), Math.abs(sumCand - 1));

    // 1X2
    for (const f of marketFields) {
      const d = Math.abs(old.markets[f] - cand.markets[f]);
      if (d > maxAbsError) { maxAbsError = d; maxAbsErrorDetail = { lh, la, cat, field: f, old: old.markets[f], cand: cand.markets[f] }; }
    }
    // O/U
    for (const line of ouFields) {
      const d = Math.abs(old.markets.overUnder[line].over - cand.markets.overUnder[line].over);
      if (d > maxAbsError) { maxAbsError = d; maxAbsErrorDetail = { lh, la, cat, field: `OU${line}`, old: old.markets.overUnder[line].over, cand: cand.markets.overUnder[line].over }; }
    }
    // BTTS
    {
      const d = Math.abs(old.markets.btts.yes - cand.markets.btts.yes);
      if (d > maxAbsError) { maxAbsError = d; maxAbsErrorDetail = { lh, la, cat, field: "BTTS", old: old.markets.btts.yes, cand: cand.markets.btts.yes }; }
    }
    // DNB
    {
      const d = Math.abs(old.markets.drawNoBet.home - cand.markets.drawNoBet.home);
      if (d > maxAbsError) { maxAbsError = d; maxAbsErrorDetail = { lh, la, cat, field: "DNB", old: old.markets.drawNoBet.home, cand: cand.markets.drawNoBet.home }; }
    }
    // DC (double chance)
    {
      const d = Math.abs(old.markets.doubleChance.oneX - cand.markets.doubleChance.oneX);
      if (d > maxAbsError) { maxAbsError = d; maxAbsErrorDetail = { lh, la, cat, field: "DC1X", old: old.markets.doubleChance.oneX, cand: cand.markets.doubleChance.oneX }; }
    }

    perCategory[cat] = (perCategory[cat] || 0) + 1;
  }

  const TOLERANCE = 1e-12;
  const pass = maxAbsError <= TOLERANCE;

  const report = {
    experiment_id: "EXP-000",
    hypothesis: "0.35*Poisson + 0.65*DC(rho=-0.13) est algebriquement equivalent a DC(rho=-0.0845), memes lambdas, memes maxGoals=10",
    n_cases_tested: pairs.length,
    per_category: perCategory,
    max_abs_error_overall: maxAbsError,
    max_abs_error_detail: maxAbsErrorDetail,
    max_matrix_cell_error: maxMatrixCellError,
    max_matrix_sum_error: maxSumError,
    tolerance: TOLERANCE,
    status: pass ? "PASS" : "FAIL",
  };

  console.log(JSON.stringify(report, null, 1));
  fs.writeFileSync(__dirname + "/exp000_report.json", JSON.stringify(report, null, 1));
  process.exit(pass ? 0 : 1);
}

run();
