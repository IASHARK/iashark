"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Selection de champion GENERIQUE,
// par ligue, PAR METRIQUE ABSOLUE (EXACT_SCORE_NLL le plus bas parmi les
// candidats non-vetoes) - jamais "le challenger doit battre le baseline
// avec un CI favorable" (le biais CHALLENGER_PROMOTION identifie et
// corrige lors du premier passage Serie A, scripts/run-score-
// champion-selection-preoss.js, maintenant generalise ici). Le champion
// PEUT etre B0. Fonctions PURES : ne font aucun I/O, aucun appel reseau,
// aucune formule Score reimplementee - consomment uniquement des
// metriques deja calculees par lib/lab/* (inchange).

// Vetos structurels : proprietes du FIT lui-meme (convergence, bornes,
// stabilite de rho), jamais une comparaison relative a un autre candidat.
function structuralVeto(candidate, thresholds) {
  const reasons = [];
  if (candidate.structural.convergence_rate < thresholds.MIN_CONVERGENCE_RATE) {
    reasons.push(`FITTER_NON_CONVERGENT (convergence_rate=${candidate.structural.convergence_rate}<${thresholds.MIN_CONVERGENCE_RATE})`);
  }
  if (candidate.structural.boundary_hit_rate > thresholds.MAX_BOUNDARY_HIT_RATE) {
    reasons.push(`RHO_ON_BOUNDARY (boundary_hit_rate=${candidate.structural.boundary_hit_rate}>${thresholds.MAX_BOUNDARY_HIT_RATE})`);
  }
  if (candidate.structural.rho_std > thresholds.MAX_RHO_STD) {
    reasons.push(`RHO_UNSTABLE (rho_std=${candidate.structural.rho_std}>${thresholds.MAX_RHO_STD})`);
  }
  return reasons;
}

function relativeDegradation(reference, candidateValue) {
  if (reference === 0) return candidateValue === 0 ? 0 : Infinity;
  return (candidateValue - reference) / reference;
}

// candidates: { B0: {nll, secondary:{...}, structural:{...}, n_oos}, M0: {...}, M2: {...}, [autres challengers reels] }
// thresholds: { MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MAX_RHO_STD, MAX_SECONDARY_DEGRADATION } -
//   memes constantes que lib/promotion.js, jamais reinventees (l'appelant les fournit).
function selectChampion(candidates, thresholds) {
  const vetoed = {};
  for (const [name, c] of Object.entries(candidates)) {
    const reasons = structuralVeto(c, thresholds);
    if (reasons.length) vetoed[name] = reasons;
  }

  const survivors = Object.entries(candidates).filter(([name]) => !vetoed[name]);
  survivors.sort((a, b) => a[1].nll - b[1].nll);
  const primaryWinnerName = survivors.length ? survivors[0][0] : null;
  const primaryWinner = survivors.length ? survivors[0][1] : null;

  let secondaryVeto = null;
  if (primaryWinner) {
    for (const [name, c] of survivors) {
      if (name === primaryWinnerName) continue;
      for (const marketKey of Object.keys(primaryWinner.secondary || {})) {
        const deg = relativeDegradation(c.secondary[marketKey], primaryWinner.secondary[marketKey]);
        if (deg > thresholds.MAX_SECONDARY_DEGRADATION) { secondaryVeto = { market: marketKey, degradation_vs: name, relative_degradation: deg }; break; }
      }
      if (secondaryVeto) break;
    }
  }

  const championSelected = secondaryVeto ? null : primaryWinnerName;
  const reason = secondaryVeto
    ? `VETO_SECONDAIRE : ${primaryWinnerName} gagne le NLL primaire mais degrade ${secondaryVeto.market} de ${(secondaryVeto.relative_degradation * 100).toFixed(2)}% vs ${secondaryVeto.degradation_vs} (> seuil ${(thresholds.MAX_SECONDARY_DEGRADATION * 100)}%) - selection manuelle requise`
    : championSelected
      ? `${championSelected} a le meilleur EXACT_SCORE_NLL absolu (${candidates[championSelected].nll.toFixed(6)}) parmi les candidats non-vetoes structurellement, sans degradation secondaire disqualifiante vs les autres.`
      : "AUCUN CANDIDAT SURVIVANT - tous vetoes structurellement";

  return {
    vetoed,
    primary_winner_before_secondary_veto: primaryWinnerName,
    secondary_veto: secondaryVeto,
    champion_selected: championSelected,
    champion_selection_reason: reason,
  };
}

module.exports = { selectChampion, structuralVeto, relativeDegradation };
