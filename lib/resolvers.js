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

  // Marches combines ("Victoire Domicile & Over 2.5", "Nul & BTTS"...) -
  // testes EN PREMIER, avant les branches generiques over/under et victoire
  // plus bas, qui matcheraient sinon seulement la moitie de la condition
  // (ex: "Victoire Domicile & Over 2.5" tomberait dans la branche over/under
  // generique et ignorerait completement le resultat du match - un bug reel
  // si teste apres). Les deux moities du "&" doivent etre vraies ensemble.
  if (pred.includes("&")) {
    const parts = pred.split("&").map((p) => p.trim());
    const resultPart = parts[0], condPart = parts[1] || "";
    let resultWin;
    if (resultPart.includes("domicile") || resultPart.includes("dom")) resultWin = gh > ga;
    else if (resultPart.includes("exterieur") || resultPart.includes("ext")) resultWin = ga > gh;
    else if (resultPart.includes("nul") || resultPart.includes("draw")) resultWin = gh === ga;
    else return null;
    let condWin;
    const cOver = condPart.match(/over\s*(\d+(?:[.,]\d+)?)/);
    const cUnder = condPart.match(/under\s*(\d+(?:[.,]\d+)?)/);
    if (cOver) condWin = gh + ga > parseFloat(cOver[1].replace(",", "."));
    else if (cUnder) condWin = gh + ga < parseFloat(cUnder[1].replace(",", "."));
    else if (condPart.includes("non btts") || condPart.includes("btts non")) condWin = gh === 0 || ga === 0;
    else if (condPart.includes("btts")) condWin = gh > 0 && ga > 0;
    else return null;
    return resultWin && condWin;
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
  // Clean sheet : l'equipe designee termine le match sans encaisser -
  // depend UNIQUEMENT des buts de l'adversaire (peu importe que l'equipe
  // designee ait elle-meme marque ou non - contrairement a Win To Nil
  // ci-dessous). Teste avant "victoire" plus bas pour ne jamais tomber
  // dans la branche generique par erreur de sous-chaine.
  if (pred.includes("clean sheet")) {
    if (pred.includes("domicile") || pred.includes("dom")) return ga === 0;
    if (pred.includes("exterieur") || pred.includes("ext")) return gh === 0;
    return null;
  }
  // Win To Nil / "Gagne sans encaisser" : l'equipe designee GAGNE ET ne
  // concede aucun but - condition double, distincte du clean sheet seul
  // (une equipe peut faire clean sheet sur un 0-0, qui n'est pas un Win To
  // Nil car elle n'a pas gagne).
  if (pred.includes("gagne sans encaisser") || pred.includes("win to nil")) {
    if (pred.includes("domicile") || pred.includes("dom")) return gh > ga && ga === 0;
    if (pred.includes("exterieur") || pred.includes("ext")) return ga > gh && gh === 0;
    return null;
  }
  // Total par equipe ("Total Domicile Over/Under X" / "Total Exterieur
  // Over/Under X") - meme logique que l'O/U generique plus bas, mais sur
  // les buts d'UNE SEULE equipe plutot que le total du match. Teste avant
  // l'O/U generique (qui matcherait aussi "over X"/"under X") pour bien
  // isoler le bon cote du score.
  if (pred.includes("total") && (pred.includes("domicile") || pred.includes("dom") || pred.includes("exterieur") || pred.includes("ext"))) {
    const isDomTotal = pred.includes("domicile") || pred.includes("dom");
    const side = isDomTotal ? gh : ga;
    const tOver = pred.match(/over\s*(\d+(?:[.,]\d+)?)/);
    if (tOver) return side > parseFloat(tOver[1].replace(",", "."));
    const tUnder = pred.match(/under\s*(\d+(?:[.,]\d+)?)/);
    if (tUnder) return side < parseFloat(tUnder[1].replace(",", "."));
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
