"use strict";
// EXP-002 (SPEC LAB PRO v1.0, M2) - shrinkage Bayes early-season pour le
// walk-forward M0 vs M2. Reutilise la MEME formule de poids que la
// production (lib/markets/early-season.js#blendEarlySeasonRate, auditee
// et confirmee par tests/lab-bayes-prior-weight-contract.test.js) :
//   prior_weight(n) = max(0, 8 - 0.5*n)
//
// MAIS sans le plancher ligue PERMANENT (equivalentMatches=6, constant,
// jamais nul) que blendEarlySeasonRate ajoute toujours en production.
// Ce plancher permanent rendrait structurellement impossible l'invariant
// explicitement exige par la SPEC EXP-002 : quand n>=16 des deux cotes,
// M2 doit devenir NUMERIQUEMENT IDENTIQUE a M0 (abs(P_M2-P_M0)<=1e-12).
// blendEarlySeasonRate() rejette d'ailleurs explicitement
// equivalentMatches<=0 (RangeError), confirmant que ce plancher est
// structurellement obligatoire dans cette fonction-la - ce module en est
// donc une variante DEDIEE a cette experience, jamais une reutilisation
// litterale, et le fait clairement.
//
// Source du prior (item 2 EXP-002) :
//   - equipe DEJA en Premier League la saison precedente (dans le
//     dataset collecte, GATE B1) : prior = taux REEL de la saison
//     precedente, meme cote (domicile/exterieur) que le taux courant
//     auquel il est mixe.
//   - equipe PROMUE (aucun historique PL precedent dans le dataset -
//     jamais de donnees Championship, jamais de force inventee, jamais
//     de fuzzy-match inter-division) : prior = moyenne de ligue
//     (constante), fallback explicitement prevu par la SPEC.

function priorWeight(n) {
  return Math.max(0, 8 - 0.5 * n);
}

// current: {events, matches} - agregats de la saison COURANTE
// uniquement, cote venue-specifique (domicile ou exterieur selon le
// taux concerne), strictement avant le cutoff.
// priorRate: taux du prior (nombre) - saison precedente reelle si
// l'equipe y a joue, sinon moyenne de ligue. Jamais de second plancher.
// n: nombre de matchs TOTAL saison courante deja joues par l'equipe
// (toutes venues confondues) - determine le poids, PAS current.matches.
function blendWithDecayingPrior(current, priorRate, n) {
  const w = priorWeight(n);
  const blendedEvents = current.events + priorRate * w;
  const blendedMatches = current.matches + w;
  return {
    rate: blendedMatches > 0 ? blendedEvents / blendedMatches : priorRate,
    // blendedEvents/blendedMatches : memes semantique que bm/md attendus
    // par lib/engine.js#calcLambdas (buts, matchs) - permet de les
    // passer DIRECTEMENT en lieu et place des comptes bruts, sans que
    // calcLambdas ait besoin d'etre modifie ("meme moteur que M0").
    blended_events: blendedEvents,
    blended_matches: blendedMatches,
    prior_weight: w,
  };
}

module.exports = { priorWeight, blendWithDecayingPrior };
