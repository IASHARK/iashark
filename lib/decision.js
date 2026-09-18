"use strict";
// Decisions deterministes qui appartenaient auparavant au LLM (choix du
// marche, "confiance", niveau de risque) - MASTER V2.1 §1.3/§7.8/§10.AJ :
// "Claude/Anthropic ne peut jamais creer/modifier: probabilite [...]
// resultat de marche [...] score de modele". Extrait pour etre reellement
// testable (voir tests/decision.test.js) et pour que le pipeline appelle
// ces fonctions AVANT le LLM, qui ne recoit plus que le resultat pour le
// commenter en texte.

// Choisit deterministement le marche a mettre en avant : celui de
// probabilite modele la plus elevee parmi les marches jouables (deja
// filtres a cote>=1.50 en amont). Remplace l'ancienne selection libre par
// le LLM (an.pari_rec).
// Au-dela de ce seuil, notre probabilite et la cote du bookmaker ne peuvent
// pas decrire le meme evenement. Si nous estimons un marche a 100 % et qu'il
// est propose a 1.60, ce n'est pas un ecart a exploiter : c'est que l'une des
// deux parties ne parle pas de la meme chose. Le cas reel qui a impose ce
// garde-fou : les lignes basses de "tirs du match" (voir
// lib/odds.js#MIN_LIGNE_TIRS_MATCH), ecartees a la source depuis, mais le
// filet reste - aucune famille de marches ne doit pouvoir refaire passer une
// quasi-certitude pour une recommandation.
const PROBABILITE_MAX_RECOMMANDABLE = 97;

function pickMarketDeterministic(allMarkets, options) {
  if (!allMarkets || !allMarkets.length) return null;
  const minOdds = options && Number.isFinite(options.minOdds) ? options.minOdds : null;
  const candidates = allMarkets.filter((market) => {
    const probability = Number(market.prob);
    if (!Number.isFinite(probability) || probability < 0) return false;
    if (probability >= PROBABILITE_MAX_RECOMMANDABLE) return false;
    if (minOdds == null) return true;
    const odds = Number(market.cote);
    return Number.isFinite(odds) && odds >= minOdds;
  });
  if (!candidates.length) return null;
  return candidates.slice().sort((left, right) => {
    const probabilityDelta = Number(right.prob) - Number(left.prob);
    if (probabilityDelta !== 0) return probabilityDelta;
    const reliabilityDelta = Number(right.reliability || 0) - Number(left.reliability || 0);
    if (reliabilityDelta !== 0) return reliabilityDelta;
    return String(left.id || left.market || "").localeCompare(String(right.id || right.market || ""));
  })[0];
}

// Niveau de risque deterministe a partir de la cote du marche choisi. Reprend
// la regle qui etait jusqu'ici seulement suggeree au LLM dans le prompt
// ("FAIBLE si cote<1.75 | MODERE 1.75-2.20 | ELEVE sinon"), maintenant
// appliquee en code, pas laissee a l'appreciation du LLM.
function computeRiskLabel(cote) {
  const c = parseFloat(cote);
  if (!c || isNaN(c)) return "MODERE";
  if (c < 1.75) return "FAIBLE";
  if (c <= 2.2) return "MODERE";
  return "ELEVE";
}

// Model Agreement (§10.AB) : mesure la divergence entre les probabilites
// des differents modeles (Poisson/Dixon-Coles/Monte-Carlo) pour la MEME
// issue. Un fort accord ne signifie PAS "plus de chances de gagner" - juste
// que les modeles convergent (§11.2, avertissement explicite a respecter
// dans l'UI qui consomme ce champ).
function computeModelAgreement(probs) {
  const valid = (probs || []).filter((p) => p != null && !isNaN(p));
  if (valid.length < 2) return { label: "Faible", stdDev: null, n: valid.length };
  const mean = valid.reduce((s, p) => s + p, 0) / valid.length;
  const variance = valid.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  let label;
  if (stdDev <= 4) label = "Fort";
  else if (stdDev <= 10) label = "Moyen";
  else label = "Faible";
  return { label, stdDev: Math.round(stdDev * 100) / 100, n: valid.length };
}

// Data Quality Score V1 simplifie (§11.1/§10.AA proposent jusqu'a 12
// composants ; cette version couvre ce que le pipeline actuel calcule deja
// reellement, honnetement documentee comme V1, pas la version complete du
// MASTER). 0-100, base sur la presence reelle des sources de donnees pour
// CE match, jamais sur une auto-evaluation du LLM.
function computeDataQualityScore(flags) {
  const weights = {
    hasTeamStatsHome: 15,
    hasTeamStatsAway: 15,
    hasOdds: 20,
    hasInjuries: 10,
    hasH2H: 10,
    hasElo: 15,
    hasLineups: 15,
  };
  let score = 0, maxScore = 0;
  for (const key of Object.keys(weights)) {
    maxScore += weights[key];
    if (flags && flags[key]) score += weights[key];
  }
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  let label;
  if (pct >= 70) label = "Élevée";
  else if (pct >= 40) label = "Moyenne";
  else label = "Faible";
  return { score: pct, label };
}

// Fiabilite (§11.2 et retour utilisateur explicite : "la confiance doit
// rester separee et provenir de choses mesurables"). Ce n'est PAS une
// probabilite - jamais une copie de model_probability sous un autre nom.
// Composite a partir de trois signaux reellement mesurables aujourd'hui :
//   - model_agreement : accord entre Poisson/Dixon-Coles/Monte-Carlo
//   - data_quality     : couverture des sources de donnees pour ce match
//   - sample_size      : nombre de matchs joues par les deux equipes cette
//                        saison (null si inconnu - jamais une valeur par
//                        defaut deguisee en donnee reelle)
// Un quatrieme signal demande explicitement - "calibration historique du
// modele concerne" - N'EST PAS INCLUS ICI : aucune prediction generee par
// le pipeline deterministe (post-fix LLM) n'a encore ete resolue, donc il
// n'existe aucune calibration historique reelle a mesurer pour CE moteur.
// L'ajouter maintenant reviendrait a fabriquer un chiffre. Voir
// CALIBRATION_REPORT.md - des que match_snapshots aura accumule assez de
// predictions resolues, calibrationHistorique doit devenir un vrai
// quatrieme composant ici, pas avant.
function computeReliability(modelAgreement, dataQuality, sampleSize) {
  let sampleLabel;
  if (sampleSize == null) sampleLabel = "Inconnue";
  else if (sampleSize >= 15) sampleLabel = "Suffisante";
  else if (sampleSize >= 5) sampleLabel = "Limitée";
  else sampleLabel = "Insuffisante";

  const scores = { Fort: 2, Élevée: 2, Suffisante: 2, Moyen: 1, Moyenne: 1, Limitée: 1, Faible: 0, Insuffisante: 0, Inconnue: 0 };
  const total = (scores[modelAgreement.label] || 0) + (scores[dataQuality.label] || 0) + (scores[sampleLabel] || 0);
  let label;
  if (total >= 5) label = "Élevée";
  else if (total >= 3) label = "Moyenne";
  else label = "Faible";

  return {
    label,
    model_agreement: modelAgreement.label,
    data_quality: dataQuality.label,
    sample_size: sampleSize,
    sample_size_label: sampleLabel,
    historical_calibration: "NOT_AVAILABLE_YET",
  };
}

// Le score exact "le plus probable" affiche a l'utilisateur doit rester
// coherent avec le marche recommande - montrer "1-0" a cote d'un pick
// "Over 2.5" est mathematiquement possible (deux mesures differentes de la
// meme distribution reelle) mais illisible/contradictoire visuellement.
// Filtre les scores simules (Monte-Carlo) pour ne garder que ceux qui
// satisfont reellement la condition du marche choisi.
function scoreMatchesMarket(home, away, marketId) {
  const total = home + away;
  switch (marketId) {
    case "home-win": return home > away;
    case "draw": return home === away;
    case "away-win": return away > home;
    case "dc-1x": return home >= away;
    case "dc-x2": return away >= home;
    case "dc-12": return home !== away;
    case "over-25": return total > 2.5;
    case "under-25": return total < 2.5;
    case "over-35": return total > 3.5;
    case "under-35": return total < 3.5;
    case "btts-yes": return home > 0 && away > 0;
    case "btts-no": return home === 0 || away === 0;
    case "home-team-over-15": return home > 1.5;
    case "home-team-under-15": return home < 1.5;
    case "away-team-over-15": return away > 1.5;
    case "away-team-under-15": return away < 1.5;
    case "home-win-to-nil": return home > away && away === 0;
    case "away-win-to-nil": return away > home && home === 0;
    case "home-clean-sheet": return away === 0;
    case "away-clean-sheet": return home === 0;
    case "home-win-over-15": return home > away && total > 1.5;
    case "home-win-over-25": return home > away && total > 2.5;
    case "home-win-over-35": return home > away && total > 3.5;
    case "home-win-under-25": return home > away && total < 2.5;
    case "home-win-under-35": return home > away && total < 3.5;
    case "away-win-over-15": return away > home && total > 1.5;
    case "away-win-over-25": return away > home && total > 2.5;
    case "away-win-over-35": return away > home && total > 3.5;
    case "away-win-under-25": return away > home && total < 2.5;
    case "away-win-under-35": return away > home && total < 3.5;
    // 1re mi-temps / tirs / etc. : pas evaluables depuis le seul score
    // final -> null (ni vrai ni faux), jamais un filtrage errone.
    default: return null;
  }
}

// Reordonne/filtre les scores Monte-Carlo simules pour que le "score le
// plus probable" affiche soit toujours compatible avec le marche
// recommande. Repli honnete sur le classement brut (non filtre) si le
// marche n'est pas identifiable/evaluable depuis un score seul, ou si
// aucun score simule ne le satisfait - jamais un score invente.
function scoresConsistentWithMarket(topScoresFull, marketId, limit) {
  limit = limit || 3;
  if (!Array.isArray(topScoresFull) || !topScoresFull.length) return [];
  if (!marketId) return topScoresFull.slice(0, limit);
  const parsed = topScoresFull.map((s) => {
    const m = /^(\d+)-(\d+)$/.exec((s && s.score) || "");
    return m ? Object.assign({}, s, { home: Number(m[1]), away: Number(m[2]) }) : null;
  });
  const matches = parsed.filter((p) => p && scoreMatchesMarket(p.home, p.away, marketId) === true);
  if (!matches.length) return topScoresFull.slice(0, limit);
  return matches.slice(0, limit).map((p) => ({ score: p.score, n: p.n, pct: p.pct }));
}

// ---------------------------------------------------------------------------
// CHOIX DU PARI : UNE MEME REGLE POUR TOUTES LES FAMILLES (19/09/2026,
// decision du proprietaire, remplace pickMarketDeterministic dans le pipeline).
//
// Constat : le choix « plus haute probabilite du modele, cote >= 1,50 »
// n'etait pas neutre. Chaque famille a son propre calcul (1X2/O2.5/BTTS
// calibres, les autres bruts, les tirs a part), et celle dont le calcul
// exagere gagnait l'argmax : sur 7 439 matchs de 12 championnats (2023-24 et
// 2024-25, vraies cotes), la regle actuelle ne gagnait que 49,6 % de ses paris
// (double chance X2 35 % des choix, under 23 %), exactement les familles que
// le modele surestime.
//
// Regle : la reference commune est la probabilite du bookmaker, marge retiree
// livre par livre ; le modele n'y entre que pour 20 % (au-dela, le taux de
// reussite baisse : le bookmaker voit plus juste que le modele sur ces
// marches). On retient la plus haute estimation parmi les cotes de 1,40 a
// 2,00. Meme banc d'essai : 60,0 % de paris gagnes (56,9 % sur 2025-26),
// familles equilibrees. Voir MODEL_CHANGELOG.md (19/09/2026).
const SELECTION = Object.freeze({ minOdds: 1.40, maxOdds: 2.00, modelWeight: 0.2 });

function oddsOf(market) {
  const o = parseFloat(String(market && market.cote != null ? market.cote : "").replace(",", "."));
  return Number.isFinite(o) && o > 1 ? o : null;
}
// Paires plus/moins d'une MEME ligne dont les deux issues se completent.
// Les combines (« domicile gagne + plus de 2,5 buts ») ne sont PAS une paire
// avec leur « moins de » : ils restent a part (marge estimee ci-dessous).
const PAIR_RE = /^(|home-team-|away-team-|fh-|total-[a-z-]+-)(over|under)-([0-9_]+)$/;

// Probabilite « juste » du bookmaker (0-100) pour chaque marche cote : marge
// retiree par normalisation sur son livre complet (1X2, paires plus/moins,
// BTTS). Double chance = somme des issues 1X2 justes. Marche cote d'un seul
// cote (clean sheet, combines, gagne sans encaisser...) : on retire la marge
// la plus forte mesuree sur les livres complets du meme match (prudent : ces
// marches ont rarement moins de marge que les principaux) ; sans aucun livre
// complet, pas de probabilite juste (null). opts.shin = { p1, pN, p2 } (0-100,
// cotes de reference sans marge) quand le pipeline les a.
function fairMarketProbabilities(markets, opts) {
  const list = Array.isArray(markets) ? markets.filter((m) => m && m.id && oddsOf(m)) : [];
  const byId = new Map(list.map((m) => [m.id, m]));
  const fair = new Map();
  const overrounds = [];
  const book = (ids) => {
    const odds = ids.map((id) => oddsOf(byId.get(id)));
    if (odds.some((o) => o === null)) return false;
    const inv = odds.map((o) => 1 / o), sum = inv.reduce((a, b) => a + b, 0);
    overrounds.push(sum - 1);
    ids.forEach((id, i) => fair.set(id, (inv[i] / sum) * 100));
    return true;
  };
  const shin = opts && opts.shin;
  const shinOk = shin && [shin.p1, shin.pN, shin.p2].every((v) => Number.isFinite(Number(v)) && Number(v) > 0);
  book(["home-win", "draw", "away-win"]);
  if (shinOk) {
    const s = Number(shin.p1) + Number(shin.pN) + Number(shin.p2);
    [["home-win", shin.p1], ["draw", shin.pN], ["away-win", shin.p2]].forEach(([id, v]) => { if (byId.has(id)) fair.set(id, (Number(v) / s) * 100); });
  }
  const f1 = fair.get("home-win"), fN = fair.get("draw"), f2 = fair.get("away-win");
  if ([f1, fN, f2].every((v) => v != null)) {
    [["dc-1x", f1 + fN], ["dc-x2", f2 + fN], ["dc-12", f1 + f2]].forEach(([id, v]) => { if (byId.has(id)) fair.set(id, v); });
  }
  book(["btts-yes", "btts-no"]);
  list.forEach((m) => {
    const p = PAIR_RE.exec(m.id);
    if (!p || p[2] !== "over" || fair.has(m.id)) return;
    book([m.id, p[1] + "under-" + p[3]]);
  });
  if (overrounds.length) {
    const margin = Math.max(0, ...overrounds);
    list.forEach((m) => { if (!fair.has(m.id)) fair.set(m.id, (100 / oddsOf(m)) / (1 + margin)); });
  }
  return fair;
}

// Retient le pari : plus haute estimation (1 - w) x juste + w x modele parmi
// les cotes [minOdds, maxOdds] ; a defaut au-dessus de maxOdds ; a defaut sous
// minOdds (LOW_ODDS). Rend { market, downgrade } ou null (aucune probabilite
// juste calculable : le pipeline garde alors ses replis). market.prob =
// estimation publiee ; modelProb / fairProb conservees pour la transparence.
function pickMarketFair(markets, opts) {
  const o = Object.assign({}, SELECTION, opts || {});
  const w = o.modelWeight;
  const fair = fairMarketProbabilities(markets, o);
  const scored = (Array.isArray(markets) ? markets : []).map((m) => {
    const odds = oddsOf(m), f = m ? fair.get(m.id) : null, model = Number(m && m.prob);
    if (odds === null || f == null || !Number.isFinite(model) || model < 0) return null;
    if (model >= PROBABILITE_MAX_RECOMMANDABLE) return null;
    const estimate = (1 - w) * f + w * model;
    if (!(estimate < PROBABILITE_MAX_RECOMMANDABLE)) return null;
    return Object.assign({}, m, { prob: estimate, modelProb: model, fairProb: f, odds });
  }).filter(Boolean);
  const best = (xs) => xs.length ? xs.slice().sort((a, b) => (b.prob - a.prob) || (a.odds - b.odds) || String(a.id).localeCompare(String(b.id)))[0] : null;
  let pick = best(scored.filter((x) => x.odds >= o.minOdds && x.odds <= o.maxOdds));
  let downgrade = null;
  if (!pick) pick = best(scored.filter((x) => x.odds >= o.minOdds));
  if (!pick) { pick = best(scored); if (pick) downgrade = "LOW_ODDS"; }
  if (!pick) return null;
  delete pick.odds;
  return { market: pick, downgrade };
}

module.exports = { PROBABILITE_MAX_RECOMMANDABLE, SELECTION, pickMarketDeterministic, fairMarketProbabilities, pickMarketFair, computeRiskLabel, computeModelAgreement, computeDataQualityScore, computeReliability, scoreMatchesMarket, scoresConsistentWithMarket };
