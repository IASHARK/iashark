"use strict";
// Resolution des marches (gagne/perdu/void), extraite de update-data.yml
// pour etre reellement testable. Voir tests/resolvers.test.js.
//
// Retourne true (gagne), false (perdu), 'void' (push handicap - mise
// remboursee) ou null (marche non reconnu / non resolvable - le pari reste
// en attente plutot que d'etre faussement compte).

function resolveMarketWin(predRaw, gh, ga) {
  if (gh == null || ga == null || isNaN(gh) || isNaN(ga)) return null;
  const pred = (predRaw || "").toLowerCase();

  if (pred.includes("handicap")) {
    const hMatch = pred.match(/handicap\s*([+-]?\d+(?:[.,]\d+)?)/);
    if (!hMatch) return null;
    const line = parseFloat(hMatch[1].replace(",", "."));
    const isDom = pred.includes("domicile") || pred.includes("dom");
    const isExt = pred.includes("exterieur") || pred.includes("ext");
    if (!isDom && !isExt) return null;
    const adjH = isDom ? gh + line : gh;
    const adjA = isExt ? ga + line : ga;
    if (adjH === adjA) return "void";
    return isDom ? adjH > adjA : adjA > adjH;
  }
  if (pred.includes("over 2.5")) return gh + ga > 2;
  if (pred.includes("over 1.5")) return gh + ga > 1;
  if (pred.includes("over 3.5")) return gh + ga > 3;
  if (pred.includes("under 2.5")) return gh + ga < 3;
  if (pred.includes("btts non")) return gh === 0 || ga === 0;
  if (pred.includes("btts")) return gh > 0 && ga > 0;
  if (pred.includes("victoire") && (pred.includes("domicile") || pred.includes("dom"))) return gh > ga;
  if (pred.includes("victoire") && (pred.includes("exterieur") || pred.includes("ext"))) return ga > gh;
  if (pred.includes("1x") || pred.includes("x1") || pred.includes("dc 1x")) return gh >= ga;
  if (pred.includes("x2") || pred.includes("dc x2")) return ga >= gh;
  if (pred.includes("nul") || pred.includes("draw")) return gh === ga;
  return null;
}

// Statuts api-football qui signifient "ce match ne se terminera jamais
// normalement" -> la prediction associee doit devenir VOID, pas rester
// bloquee en 'scheduled' indefiniment.
const VOID_STATUSES = ["PST", "CANC", "ABD"];
const FINISHED_STATUSES = ["FT", "AET", "PEN"];

function classifyFixtureStatus(status) {
  if (VOID_STATUSES.includes(status)) return "VOID";
  if (FINISHED_STATUSES.includes(status)) return "FINISHED";
  return "PENDING";
}

module.exports = { resolveMarketWin, classifyFixtureStatus, VOID_STATUSES, FINISHED_STATUSES };
