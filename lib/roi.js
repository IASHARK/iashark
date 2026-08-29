"use strict";
// Calcul winrate/ROI, extrait de update-data.yml (updateHistorique) pour
// etre reellement testable. Voir tests/roi.test.js.
//
// Regle absolue verifiee par les tests : une cote manquante/invalide est
// EXCLUE du calcul de ROI (jamais remplacee par une valeur par defaut comme
// l'ancien 1.75 fictif) mais reste comptee dans le winrate, qui n'a pas
// besoin de la cote.

function computeStats(singles) {
  const total = singles.length;
  const wins = singles.filter((p) => p.result === "win");
  const winrate = total > 0 ? (wins.length / total) * 100 : 0;

  let roiTotal = 0, roiCount = 0;
  for (const p of singles) {
    const c = parseFloat(p.cote);
    if (!c || c <= 1) continue;
    roiCount++;
    roiTotal += p.result === "win" ? c - 1 : -1;
  }
  const roi = roiCount > 0 ? (roiTotal / roiCount) * 100 : 0;

  return {
    winrate: Math.round(winrate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    total,
    wins: wins.length,
    losses: total - wins.length,
    roiCount,
  };
}

function computeBreakdown(singles, field) {
  const groups = {};
  for (const p of singles) {
    const k = p[field] || "inconnu";
    if (!groups[k]) groups[k] = { wins: 0, losses: 0, roi: 0, roiCount: 0 };
    if (p.result === "win") groups[k].wins++; else groups[k].losses++;
    const c = parseFloat(p.cote);
    if (!c || c <= 1) continue;
    groups[k].roiCount++;
    groups[k].roi += p.result === "win" ? c - 1 : -1;
  }
  return Object.keys(groups)
    .sort()
    .map((k) => {
      const g = groups[k];
      const tot = g.wins + g.losses;
      return {
        key: k,
        wins: g.wins,
        losses: g.losses,
        total: tot,
        winrate: tot > 0 ? Math.round((g.wins / tot) * 1000) / 10 : 0,
        roi: g.roiCount > 0 ? Math.round((g.roi / g.roiCount) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

module.exports = { computeStats, computeBreakdown };
