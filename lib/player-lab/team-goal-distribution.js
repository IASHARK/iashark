"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 4. p_T(n) = P(team scores
// n buts) DIRECTEMENT depuis la matrice M2 deja construite
// (predictWithRho/buildM2LiveSnapshot, rho=-0.0845 fixe) - AUCUN
// nouveau Poisson equipe, jamais reimplemente.

// matrix[h][a] = P(home=h, away=a). side="HOME" -> marginale ligne,
// side="AWAY" -> marginale colonne. Retourne un tableau dist[n] =
// P(equipe marque exactement n buts), n de 0 a matrix.length-1.
function teamGoalDistribution(matrix, side) {
  const n = matrix.length;
  const dist = new Array(n).fill(0);
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      const p = matrix[h][a];
      if (side === "HOME") dist[h] += p;
      else dist[a] += p;
    }
  }
  return dist;
}

module.exports = { teamGoalDistribution };
