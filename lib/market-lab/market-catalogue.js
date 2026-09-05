"use strict";
// MARKET LAB - PHASE 1 (2026-09-05). Transforme la matrice de score DEJA
// CALCULEE par le champion SCORE_ENGINE=M2 (SCORE-LAB-EXP-002C, cloture
// CLOSED_PROMOTE, rho=-0.0845 fixe, code_sha=b8cb9ff3f3a8d03d529b8ebbdb7c4147faf2438f)
// en un catalogue de marches probabilistes coherents. Ce module ne
// recalcule JAMAIS de lambda ni de matrice : il est un CONSOMMATEUR
// READ-ONLY du Score Engine - la matrice lui est passee toute faite
// (source de verite : lib/lab/dc-matrix-with-rho.js#predictWithRho avec
// CHAMPION_RHO=-0.0845, jamais reimplemente ici).
//
// Portee V1 : 1X2, Double Chance, Draw No Bet (structure de reglement
// COMPLETE win/push/loss - jamais une simple probabilite binaire), BTTS,
// Total buts O/U, Team Totals O/U, Exact Score (diagnostics uniquement).
// Explicitement EXCLUS de V1 : marches joueurs, corners, tirs, cartons,
// mi-temps, combines, et toute cote bookmaker / edge / EV / Kelly /
// classement / BET-NO-BET (reserves aux phases suivantes du Market Lab).

const crypto = require("node:crypto");

const MODEL_VERSION = "M2";
const TOTAL_GOALS_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
const TEAM_TOTAL_LINES = [0.5, 1.5, 2.5, 3.5];

// Lignes Asiatiques : SCHEMA UNIQUEMENT (item 3). Aucune probabilite
// n'est calculee pour ces lignes tant que le reglement complet
// win/half-win/push/half-loss/loss n'est pas lui-meme construit et
// teste - improviser un reglement Asian non teste serait plus dangereux
// que de ne rien publier. Ne bloque jamais le reste du catalogue V1.
const MARKET_ASIAN_STATUS = "HOLD";
const ASIAN_TOTAL_LINES_SCHEMA = [2.0, 2.25, 2.75, 3.0];
const ASIAN_HANDICAP_LINES_SCHEMA = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0];

function hashMatrix(matrix) {
  return crypto.createHash("sha256").update(JSON.stringify(matrix)).digest("hex");
}

function binaryMarket(ctx, marketId, selection, winProbability, extra) {
  const market = {
    fixture_id: ctx.fixtureId,
    model_version: ctx.version,
    market_id: marketId,
    selection,
    probability: winProbability,
    settlement_structure: "BINARY",
    settlement: { win_probability: winProbability, loss_probability: 1 - winProbability },
    source_matrix_hash: ctx.hash,
  };
  return extra ? { ...market, ...extra } : market;
}

function threeWayMarket(ctx, marketId, selection, win, push, loss) {
  return {
    fixture_id: ctx.fixtureId,
    model_version: ctx.version,
    market_id: marketId,
    selection,
    probability: win,
    settlement_structure: "WIN_PUSH_LOSS",
    settlement: { win_probability: win, push_probability: push, loss_probability: loss },
    source_matrix_hash: ctx.hash,
  };
}

// matrix : tableau 2D carre deja normalise (somme ~1), lignes = buts
// domicile, colonnes = buts exterieur - MEME forme que la sortie de
// predictWithRho(lambdaH, lambdaA, CHAMPION_RHO).matrix. Aucun recalcul
// de lambda par marche : tous les marches ci-dessous derivent de CETTE
// meme matrice.
function buildMarketCatalogue({ matrix, fixtureId, modelVersion }) {
  if (!Array.isArray(matrix) || matrix.length === 0) throw new Error("buildMarketCatalogue: matrice vide ou invalide");
  const n = matrix.length;
  const ctx = { fixtureId: fixtureId ?? null, version: modelVersion || MODEL_VERSION, hash: hashMatrix(matrix) };

  let p1 = 0, pN = 0, p2 = 0;
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      const p = matrix[h][a];
      if (h > a) p1 += p;
      else if (h === a) pN += p;
      else p2 += p;
    }
  }

  const markets = [];

  markets.push(binaryMarket(ctx, "FT_1X2_HOME", "HOME", p1));
  markets.push(binaryMarket(ctx, "FT_1X2_DRAW", "DRAW", pN));
  markets.push(binaryMarket(ctx, "FT_1X2_AWAY", "AWAY", p2));

  markets.push(binaryMarket(ctx, "FT_DC_1X", "1X", p1 + pN));
  markets.push(binaryMarket(ctx, "FT_DC_X2", "X2", pN + p2));
  markets.push(binaryMarket(ctx, "FT_DC_12", "12", p1 + p2));

  markets.push(threeWayMarket(ctx, "FT_DNB_HOME", "HOME", p1, pN, p2));
  markets.push(threeWayMarket(ctx, "FT_DNB_AWAY", "AWAY", p2, pN, p1));

  let bttsYes = 0;
  for (let h = 1; h < n; h++) for (let a = 1; a < n; a++) bttsYes += matrix[h][a];
  markets.push(binaryMarket(ctx, "FT_BTTS_YES", "YES", bttsYes));
  markets.push(binaryMarket(ctx, "FT_BTTS_NO", "NO", 1 - bttsYes));

  for (const line of TOTAL_GOALS_LINES) {
    let over = 0;
    for (let h = 0; h < n; h++) for (let a = 0; a < n; a++) if (h + a > line) over += matrix[h][a];
    const id = `FT_TOTAL_${line.toFixed(1)}`;
    markets.push(binaryMarket(ctx, `${id}_OVER`, "OVER", over));
    markets.push(binaryMarket(ctx, `${id}_UNDER`, "UNDER", 1 - over));
  }

  const rowMarginal = new Array(n).fill(0);
  const colMarginal = new Array(n).fill(0);
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      rowMarginal[h] += matrix[h][a];
      colMarginal[a] += matrix[h][a];
    }
  }

  for (const line of TEAM_TOTAL_LINES) {
    let overHome = 0, overAway = 0;
    for (let g = 0; g < n; g++) {
      if (g > line) { overHome += rowMarginal[g]; overAway += colMarginal[g]; }
    }
    markets.push(binaryMarket(ctx, `FT_TEAM_TOTAL_HOME_${line.toFixed(1)}_OVER`, "OVER", overHome));
    markets.push(binaryMarket(ctx, `FT_TEAM_TOTAL_HOME_${line.toFixed(1)}_UNDER`, "UNDER", 1 - overHome));
    markets.push(binaryMarket(ctx, `FT_TEAM_TOTAL_AWAY_${line.toFixed(1)}_OVER`, "OVER", overAway));
    markets.push(binaryMarket(ctx, `FT_TEAM_TOTAL_AWAY_${line.toFixed(1)}_UNDER`, "UNDER", 1 - overAway));
  }

  // Exact Score : diagnostics uniquement (item 2) - cardinalite variable
  // selon la troncature adaptative de la matrice (jamais un catalogue
  // d'IDs a taille fixe entre fixtures, a la difference de tous les
  // marches ci-dessus).
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      markets.push(binaryMarket(ctx, `FT_EXACT_SCORE_${h}_${a}`, `${h}-${a}`, matrix[h][a], { diagnostic_only: true }));
    }
  }

  return { fixture_id: ctx.fixtureId, model_version: ctx.version, source_matrix_hash: ctx.hash, markets };
}

module.exports = {
  buildMarketCatalogue,
  hashMatrix,
  MODEL_VERSION,
  TOTAL_GOALS_LINES,
  TEAM_TOTAL_LINES,
  MARKET_ASIAN_STATUS,
  ASIAN_TOTAL_LINES_SCHEMA,
  ASIAN_HANDICAP_LINES_SCHEMA,
};
