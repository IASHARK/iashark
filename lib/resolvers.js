"use strict";
// Resolution des marches (gagne/perdu/void), extraite de update-data.yml
// pour etre reellement testable. Voir tests/resolvers.test.js.
//
// Retourne true (gagne), false (perdu), 'void' (push handicap - mise
// remboursee) ou null (marche non reconnu / non resolvable - le pari reste
// en attente plutot que d'etre faussement compte).

function resolveMarketWin(predRaw, gh, ga, context) {
  if (gh == null || ga == null || isNaN(gh) || isNaN(ga)) return null;
  const pred = (predRaw || "").toLowerCase();
  const isHome = pred.includes("domicile") || pred.includes("home");
  const isAway = pred.includes("exterieur") || pred.includes("extérieur") || pred.includes("away");
  context = context || {};

  if (pred.includes("premiere mi-temps") || pred.includes("première mi-temps")) {
    const hh = Number(context.halftimeHome), ha = Number(context.halftimeAway);
    if (!Number.isFinite(hh) || !Number.isFinite(ha)) return null;
    const total = hh + ha;
    const lineMatch = pred.match(/(plus|moins) de (\d+(?:[.,]\d+)?) but/);
    if (!lineMatch) return null;
    const line = Number(lineMatch[2].replace(",", "."));
    return lineMatch[1] === "plus" ? total > line : total < line;
  }

  if (pred.includes("gagne les deux mi-temps")) {
    const hh = Number(context.halftimeHome), ha = Number(context.halftimeAway);
    if (!Number.isFinite(hh) || !Number.isFinite(ha)) return null;
    const secondHome = gh - hh, secondAway = ga - ha;
    if (isHome) return hh > ha && secondHome > secondAway;
    if (isAway) return ha > hh && secondAway > secondHome;
    return null;
  }

  const shotLine = pred.match(/tirs( cadres)? du match (over|under)\s*(\d+(?:[.,]\d+)?)/);
  if (shotLine) {
    const count = Number(shotLine[1] ? context.totalShotsOnTarget : context.totalShots);
    if (!Number.isFinite(count)) return null;
    const line = Number(shotLine[3].replace(",", "."));
    return shotLine[2] === "over" ? count > line : count < line;
  }

  if (pred.includes("dc 12")) return gh !== ga;

  if (pred.includes("gagne sans encaisser")) {
    if (isHome) return gh > ga && ga === 0;
    if (isAway) return ga > gh && gh === 0;
    return null;
  }

  // Clean sheet : cage inviolee, peu importe le resultat final (distinct de
  // "gagne sans encaisser" ci-dessus qui exige en plus la victoire).
  if (pred.includes("clean sheet")) {
    if (isHome) return ga === 0;
    if (isAway) return gh === 0;
    return null;
  }

  const frenchTotal = pred.match(/(plus|moins) de (\d+(?:[.,]\d+)?) but/);
  if (frenchTotal) {
    const line = parseFloat(frenchTotal[2].replace(",", "."));
    const compare = (value) => frenchTotal[1] === "plus" ? value > line : value < line;
    const hasWinCondition = pred.includes("gagne");
    if (hasWinCondition && isHome) return gh > ga && compare(gh + ga);
    if (hasWinCondition && isAway) return ga > gh && compare(gh + ga);
    if (isHome) return compare(gh);
    if (isAway) return compare(ga);
  }

  if (pred.includes("handicap")) {
    const hMatch = pred.match(/handicap\s*([+-]?\d+(?:[.,]\d+)?)/);
    if (!hMatch) return null;
    const line = parseFloat(hMatch[1].replace(",", "."));
    // Ligne quart (.25/.75) : le vrai settlement Asian Handicap split la
    // mise sur deux lignes voisines (ex: -0.25 = moitie DNB + moitie -0.5)
    // et peut aboutir a un demi-gain/demi-perte, jamais un WIN/LOSS complet.
    // resolveMarketWin ne retourne aujourd'hui que true/false/'void' (pas de
    // fraction) - plutot que de mal resoudre silencieusement (ex: renvoyer
    // "perdu" complet alors que c'est un demi-perdant), on refuse
    // explicitement tant que le demi-gain/demi-perte n'est pas implemente.
    // Voir MASTER V2.1 §8.2 : "Le resolver doit etre termine avant
    // activation UI." IASHARK_MARKET_REGISTRY.md classe ces lignes
    // NOT_SUPPORTED pour cette raison.
    const doubledLine = line * 2;
    const isQuarterLine = Math.abs(doubledLine - Math.round(doubledLine)) > 1e-9;
    if (isQuarterLine) return null;
    const isDom = pred.includes("domicile") || pred.includes("dom");
    const isExt = pred.includes("exterieur") || pred.includes("ext");
    if (!isDom && !isExt) return null;
    const adjH = isDom ? gh + line : gh;
    const adjA = isExt ? ga + line : ga;
    if (adjH === adjA) return "void";
    return isDom ? adjH > adjA : adjA > adjH;
  }
  // Draw No Bet (MASTER V2.1 §8.1) : mise remboursee sur match nul, sinon
  // gagne/perd normalement. Meme convention 'void' que Handicap pour le push.
  if (pred.includes("dnb") || pred.includes("draw no bet")) {
    if (gh === ga) return "void";
    if (pred.includes("domicile") || pred.includes("dom") || pred.includes("home")) return gh > ga;
    if (pred.includes("exterieur") || pred.includes("ext") || pred.includes("away")) return ga > gh;
    return null;
  }
  // Ligne O/U generique (0.5 a 6.5+, pas seulement 1.5/2.5/3.5 codes en dur -
  // MASTER V2.1 §8.1). Equivalent mathematique exact de l'ancien code pour
  // les lignes deja geres (total de buts toujours entier, donc
  // total>2.5 <=> total>2, et total<2.5 <=> total<3).
  const overMatch = pred.match(/over\s*(\d+(?:[.,]\d+)?)/);
  if (overMatch) return gh + ga > parseFloat(overMatch[1].replace(",", "."));
  const underMatch = pred.match(/under\s*(\d+(?:[.,]\d+)?)/);
  if (underMatch) return gh + ga < parseFloat(underMatch[1].replace(",", "."));
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
