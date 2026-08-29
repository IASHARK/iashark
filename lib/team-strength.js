"use strict";
// Dynamic Team Strength Engine (MASTER V2.1 §10.D) — etat latent d'attaque/
// defense par equipe qui evolue dans le temps, au lieu de reduire une equipe
// a ses 5 derniers matchs (ancien calcCriteres()/calcLambdas() dans le
// pipeline). Fonctions pures, testables sans acces API live : consomment une
// forme normalisee du match, produite par normalizeFixturesForTeam() a
// partir de la reponse brute api-football de /fixtures?team=...&last=20
// (deja utilisee par getLast10() dans update-data.yml - meme source de
// donnees, pas une nouvelle dependance).
//
// Statut honnete : le taux de decroissance temporelle (halfLifeDays) et le
// poids d'ajustement adversaire (opponentAdjustmentStrength) sont des
// defauts documentes et raisonnables, PAS des valeurs apprises par backtest
// (MASTER §10.D.1 : "jamais choisis uniquement a l'intuition" — l'objectif a
// terme). Un vrai apprentissage de ces parametres necessite un walk-forward
// sur un historique de matchs bien plus large que ce qui est disponible
// localement aujourd'hui (historique.json ne contient que 300 PREDICTIONS
// resolues, pas des scores de saisons entieres). Tant que ce backtest n'a
// pas ete execute, ce module est EXPERIMENTAL au sens du registre de
// marches (voir lib/market-registry.js) : utilisable en parallele de
// l'ancien calcul (challenger), pas encore validateur out-of-sample.

// Convertit la reponse brute api-football (/fixtures?team=X&...) en une
// forme normalisee, un objet par match, du point de vue de `teamId`.
function normalizeFixturesForTeam(rawFixtures, teamId) {
  return (rawFixtures || [])
    .filter((fx) => fx && fx.fixture && fx.teams && fx.goals && fx.goals.home != null && fx.goals.away != null)
    .map((fx) => {
      const isHome = fx.teams.home && fx.teams.home.id === teamId;
      const isAway = fx.teams.away && fx.teams.away.id === teamId;
      if (!isHome && !isAway) return null;
      const opponent = isHome ? fx.teams.away : fx.teams.home;
      const goalsFor = isHome ? fx.goals.home : fx.goals.away;
      const goalsAgainst = isHome ? fx.goals.away : fx.goals.home;
      return {
        fixtureId: fx.fixture.id,
        date: fx.fixture.date,
        opponentId: opponent ? opponent.id : null,
        opponentName: opponent ? opponent.name : null,
        isHome,
        goalsFor,
        goalsAgainst,
      };
    })
    .filter(Boolean);
}

// Poids de decroissance temporelle exponentielle. halfLifeDays = nombre de
// jours au bout desquels un match compte pour moitie de son poids initial.
// Un match d'aujourd'hui (daysAgo=0) a un poids de 1. Contrairement a une
// fenetre brutale ("5 derniers matchs"), un match tres ancien ne disparait
// jamais completement, il devient juste marginal.
function timeDecayWeight(daysAgo, halfLifeDays) {
  const hl = halfLifeDays > 0 ? halfLifeDays : 60;
  const d = Math.max(0, daysAgo || 0);
  return Math.pow(0.5, d / hl);
}

// Ajustement qualite adversaire (§10.D.2) : un but marque contre une equipe
// forte compte plus qu'un but marque contre une equipe faible. leagueAvgGoals
// est la moyenne de buts marques par match dans la ligue (repere neutre).
// opponentStrength est la force offensive/defensive relative de l'adversaire
// (1.0 = moyenne de ligue, >1 = adversaire plus fort que la moyenne).
function opponentAdjustedGoals(goals, opponentStrength) {
  const s = opponentStrength > 0 ? opponentStrength : 1;
  return goals / s;
}

// Calcule l'etat latent d'attaque/defense d'une equipe a partir de son
// historique normalise (normalizeFixturesForTeam) et, optionnellement, d'une
// table de force adverse pre-calculee (opponentStrengths: {teamId: {attack,
// defence}}) pour l'ajustement qualite adversaire. Sans cette table, retombe
// sur un calcul non-ajuste (toujours valide, juste moins precis).
//
// referenceDate : date a partir de laquelle calculer daysAgo (par defaut,
// maintenant) - permet de rejouer le calcul a une date passee pour un
// backtest sans fuite de donnees futures (§10.B anti-leakage).
function computeDynamicTeamStrength(matches, opts) {
  opts = opts || {};
  const halfLifeDays = opts.halfLifeDays || 60;
  const leagueAvgGoals = opts.leagueAvgGoals || 1.35;
  const opponentStrengths = opts.opponentStrengths || {};
  const referenceDate = opts.referenceDate ? new Date(opts.referenceDate) : new Date();

  if (!matches || !matches.length) {
    return { attack: 1, defence: 1, uncertainty: 1, nMatches: 0, effectiveSampleSize: 0 };
  }

  let attackNum = 0, defenceNum = 0, weightSum = 0;
  for (const m of matches) {
    const matchDate = new Date(m.date);
    const daysAgo = (referenceDate.getTime() - matchDate.getTime()) / 86400000;
    if (daysAgo < 0) continue; // anti-leakage : jamais un match posterieur a la date de reference
    const w = timeDecayWeight(daysAgo, halfLifeDays);
    const oppStrength = opponentStrengths[m.opponentId];
    const oppAttack = oppStrength && oppStrength.attack ? oppStrength.attack : 1;
    const oppDefence = oppStrength && oppStrength.defence ? oppStrength.defence : 1;
    // Attaque : buts marques, ajustes par la solidite defensive de l'adversaire.
    const adjGoalsFor = opponentAdjustedGoals(m.goalsFor, oppDefence);
    // Defense : buts encaisses, ajustes par la force offensive de l'adversaire
    // (encaisser contre une bonne attaque doit peser moins negativement).
    const adjGoalsAgainst = opponentAdjustedGoals(m.goalsAgainst, oppAttack);
    attackNum += w * adjGoalsFor;
    defenceNum += w * adjGoalsAgainst;
    weightSum += w;
  }

  if (weightSum === 0) {
    return { attack: 1, defence: 1, uncertainty: 1, nMatches: matches.length, effectiveSampleSize: 0 };
  }

  const attack = attackNum / weightSum / leagueAvgGoals;
  const defence = defenceNum / weightSum / leagueAvgGoals;
  // Taille d'echantillon effective (Kish) : penalise un historique concentre
  // sur peu de matchs recents (poids tres inegaux) vs un historique regulier.
  let weightSqSum = 0;
  for (const m of matches) {
    const matchDate = new Date(m.date);
    const daysAgo = (referenceDate.getTime() - matchDate.getTime()) / 86400000;
    if (daysAgo < 0) continue;
    const w = timeDecayWeight(daysAgo, halfLifeDays);
    weightSqSum += w * w;
  }
  const effectiveSampleSize = weightSqSum > 0 ? (weightSum * weightSum) / weightSqSum : 0;
  // Incertitude : decroit avec la taille d'echantillon effective, jamais a 0.
  const uncertainty = Math.max(0.05, 1 / Math.sqrt(1 + effectiveSampleSize));

  return {
    attack: Math.round(attack * 1000) / 1000,
    defence: Math.round(defence * 1000) / 1000,
    uncertainty: Math.round(uncertainty * 1000) / 1000,
    nMatches: matches.length,
    effectiveSampleSize: Math.round(effectiveSampleSize * 100) / 100,
  };
}

// Home advantage dynamique (§10.D.3) : difference de buts moyenne
// domicile/exterieur observee sur un ensemble de matchs (idealement d'une
// meme competition/saison). Shrink vers une valeur par defaut quand
// l'echantillon est trop faible pour etre fiable seul.
function computeDynamicHomeAdvantage(matches, opts) {
  opts = opts || {};
  const defaultAdvantage = opts.defaultAdvantage != null ? opts.defaultAdvantage : 0.25;
  const minSampleForOwnEstimate = opts.minSampleForOwnEstimate || 30;

  const homeMatches = (matches || []).filter((m) => m.isHome);
  if (homeMatches.length < minSampleForOwnEstimate) {
    return { homeAdvantage: defaultAdvantage, source: "default_shrunk", nHomeMatches: homeMatches.length };
  }
  const avgMargin = homeMatches.reduce((s, m) => s + (m.goalsFor - m.goalsAgainst), 0) / homeMatches.length;
  // Shrink partiel vers le defaut meme avec un echantillon suffisant, pour
  // eviter qu'un petit biais d'echantillon domine une estimation sensible.
  const shrinkWeight = Math.min(1, homeMatches.length / (minSampleForOwnEstimate * 3));
  const blended = avgMargin * shrinkWeight + defaultAdvantage * (1 - shrinkWeight);
  return {
    homeAdvantage: Math.round(blended * 1000) / 1000,
    source: "own_estimate_shrunk",
    nHomeMatches: homeMatches.length,
  };
}

module.exports = {
  normalizeFixturesForTeam,
  timeDecayWeight,
  opponentAdjustedGoals,
  computeDynamicTeamStrength,
  computeDynamicHomeAdvantage,
};
