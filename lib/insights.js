(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkInsights=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// Metriques deterministes pour les blocs "Matchup", "Buteur a surveiller",
// "Ce qu'il faut savoir", "Marches a surveiller" et "Absences & impact" -
// meme principe que lib/decision.js : tout est calcule a partir de
// donnees deja reelles et deja exposees au navigateur (match_stats_home/
// away, form_home/away, key_absences, markets_compared...), sans nouvel
// appel API ni changement pipeline. Utilise depuis lib/match-view-model.js
// (Node ET navigateur, meme fichier).
//
// Volontairement absent de ce fichier : tout ce qui demanderait une
// donnee qu'on n'a pas reellement (mouvement de cote dans le temps -
// aucun historique stocke ; "pressing", "transitions", "bloc defensif" -
// aucune metrique tactique de ce type dans l'API ; puissance des
// adversaires recents - demanderait un appel API supplementaire par
// adversaire, pas fait ici).

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function round1(value) {
  return finite(value) === null ? null : Math.round(finite(value) * 10) / 10;
}

// Matchup reduit a des categories reellement mesurables avec les donnees
// deja recuperees (match_stats_home/away) : attaque, defense, possession,
// relance (passes_pct - precision de passes, vraie donnee deja recuperee
// et jusqu'ici inexploitee), discipline, coups de pied arretes. Chaque
// categorie compare une vraie valeur des deux equipes ; "avantage" est
// simplement qui a la meilleure valeur reelle, jamais une appreciation
// subjective. Categories volontairement absentes (pressing, transitions,
// hauteur du bloc defensif, defense sur coup de pied arrete specifique) :
// aucune donnee positionnelle/tactique de ce type dans l'API - les
// ajouter fabriquerait un signal qu'on ne mesure pas. Score global =
// moyenne ponderee normalisee sur 10, memes poids documentes pour les
// deux equipes.
// L'unite est declaree ICI et pas dans l'affichage, parce que c'est ici
// qu'on sait ce qui a reellement ete mesure : "attaque" bascule sur les
// tirs quand les xG manquent, et l'affichage ne peut pas le deviner.
// Sans unite, "Defense 1,9 vs 1,1" met en avant le plus petit nombre sans
// dire pourquoi - le lecteur ne peut pas savoir qu'encaisser moins est un
// avantage.
var MATCHUP_CATEGORIES = [
  { key: "attaque", label: "Attaque", higherIsBetter: true, weight: 0.25, unit: "xG par match" },
  { key: "defense", label: "Défense", higherIsBetter: false, weight: 0.25, unit: "xG encaissés" },
  { key: "possession", label: "Possession", higherIsBetter: true, weight: 0.13, unit: "% de possession" },
  { key: "relance", label: "Relance", higherIsBetter: true, weight: 0.12, unit: "% de passes réussies" },
  { key: "discipline", label: "Discipline", higherIsBetter: false, weight: 0.1, unit: "fautes par match" },
  { key: "cpa", label: "Coups de pied arrêtés", higherIsBetter: true, weight: 0.15, unit: "corners par match" }
];
function computeMatchup(statsHome, statsAway) {
  var hs = statsHome || {};
  var as = statsAway || {};
  var raw = {
    attaque: [finite(hs.xg) === null ? finite(hs.shots_total) : finite(hs.xg), finite(as.xg) === null ? finite(as.shots_total) : finite(as.xg)],
    defense: [finite(hs.xga), finite(as.xga)],
    possession: [finite(hs.possession), finite(as.possession)],
    relance: [finite(hs.passes_pct), finite(as.passes_pct)],
    discipline: [finite(hs.fouls), finite(as.fouls)],
    cpa: [finite(hs.corners), finite(as.corners)]
  };
  var categories = [];
  var weightSum = 0, scoreHome = 0, scoreAway = 0;
  MATCHUP_CATEGORIES.forEach(function(cat){
    var pair = raw[cat.key], h = pair[0], a = pair[1];
    if (h === null || a === null) return;
    var advantage = h === a ? "égalité" : (cat.higherIsBetter ? h > a : h < a) ? "home" : "away";
    var unit = cat.unit;
    if (cat.key === "attaque" && finite(hs.xg) === null) unit = "tirs par match";
    categories.push({
      key: cat.key, label: cat.label, home: h, away: a, advantage: advantage,
      unit: unit, lowerIsBetter: !cat.higherIsBetter
    });
    var max = Math.max(h, a, 0.01);
    var hNorm = cat.higherIsBetter ? h / max : 1 - h / max;
    var aNorm = cat.higherIsBetter ? a / max : 1 - a / max;
    scoreHome += hNorm * cat.weight;
    scoreAway += aNorm * cat.weight;
    weightSum += cat.weight;
  });
  if (!categories.length) return null;
  return {
    categories: categories,
    globalHome: round1((scoreHome / weightSum) * 10),
    globalAway: round1((scoreAway / weightSum) * 10)
  };
}

// Probabilite de marquer d'un joueur (Poisson, P(buts>=1) = 1-e^-lambda),
// lambda = vrai buts/90 * part reelle des minutes attendues. Jamais une
// estimation inventee - deux vraies donnees deja calculees ailleurs
// (goals90 dans playerAnalytics, minutes attendues via startProbability/
// minutesRecent). Retourne null si goals90 est absent (jamais 0% par
// defaut, qui laisserait croire a un vrai calcul sur une donnee absente).
function computeScoringProbability(goals90, expectedMinutes) {
  var g = finite(goals90);
  var m = finite(expectedMinutes);
  if (g === null || g < 0) return null;
  var minutes = m === null ? 90 : Math.max(0, Math.min(120, m));
  var lambda = g * (minutes / 90);
  var probability = 1 - Math.exp(-lambda);
  return { lambda: Math.round(lambda * 100) / 100, probability: Math.round(probability * 1000) / 10 };
}

// Part reelle de la production offensive de l'equipe attribuable a un
// joueur (buts+passes decisives+passes cles, echantillon recent deja
// recupere) - une approximation honnete de l'impact d'une absence,
// jamais un modele causal "l'equipe perd X% sans lui" qu'on ne peut pas
// mesurer avec les donnees disponibles.
function computeOutputShare(playerTotals, teamTotals) {
  var pt = playerTotals || {}, tt = teamTotals || {};
  var playerSum = (finite(pt.goals) || 0) + (finite(pt.assists) || 0) + (finite(pt.keyPasses) || 0);
  var teamSum = (finite(tt.goals) || 0) + (finite(tt.assists) || 0) + (finite(tt.keyPasses) || 0);
  if (teamSum <= 0) return null;
  return Math.round((playerSum / teamSum) * 1000) / 10;
}

// Tendance de forme : compare la moyenne des notes les plus recentes a
// celle des precedentes, sur la meme serie deja recuperee (player.ratings
// / une equipe). Pas de tendance publiee sous 4 notes (signal trop
// bruite sur un split 2-2).
function computeFormTrend(ratingsOldestFirst) {
  var ratings = (ratingsOldestFirst || []).map(finite).filter(function(v){ return v !== null; });
  if (ratings.length < 4) return null;
  var mid = Math.floor(ratings.length / 2);
  var older = ratings.slice(0, mid), recent = ratings.slice(mid);
  var avg = function(arr){ return arr.reduce(function(a,b){return a+b;},0) / arr.length; };
  var olderAvg = avg(older), recentAvg = avg(recent);
  var delta = recentAvg - olderAvg;
  return {
    recentAvg: round1(recentAvg),
    trend: delta >= 0.3 ? "up" : delta <= -0.3 ? "down" : "flat"
  };
}

// "Ce qu'il faut savoir" : classe des signaux DEJA REELS et deja calcules
// ailleurs (matchups a cibler, absences cles, ecart modele/marche) en 4
// categories lisibles - aucun nouveau signal invente ici, uniquement une
// mise en forme/classification de donnees existantes. Limite a 4, jamais
// plus, pour ne pas paraitre exhaustif sur un echantillon de bruit.
function classifyKeyInsights(opts) {
  opts = opts || {};
  var matchups = opts.matchups, keyAbsenceAlerts = opts.keyAbsenceAlerts, marketsCompared = opts.marketsCompared, homeName = opts.homeName, awayName = opts.awayName;
  var out = [];
  var homeMatchup = (matchups || []).filter(function(m){ return m.title && m.title.indexOf(homeName) === 0; })[0];
  if (homeMatchup) out.push({ type: "positive_home", title: homeName + " en position de force", text: homeMatchup.text });
  var awayMatchup = (matchups || []).filter(function(m){ return m.title && m.title.indexOf(awayName) === 0; })[0];
  if (awayMatchup) out.push({ type: "positive_away", title: awayName + " dangereux", text: awayMatchup.text });
  if (keyAbsenceAlerts && keyAbsenceAlerts.length) {
    out.push({ type: "watch", title: "Point de vigilance", text: keyAbsenceAlerts[0] });
  }
  var primary = marketsCompared && marketsCompared[0];
  if (primary && Number.isFinite(Number(primary.edge)) && Math.abs(Number(primary.edge)) >= 8) {
    var dir = Number(primary.edge) > 0 ? "notre modèle est nettement au-dessus du marché" : "le marché est nettement au-dessus de notre modèle";
    out.push({ type: "contradiction", title: "Signal contradictoire", text: "Sur " + primary.market + ", " + dir + " (écart de " + Math.abs(Math.round(primary.edge)) + " points) - à interpréter avec prudence." });
  }
  return out.slice(0, 4);
}

// Marches a surveiller : classe raw.markets_compared (deja reel) par
// ecart absolu modele/marche, jamais recalcule. "Confiance" reutilise la
// qualite de donnee deja calculee par le pipeline (data_quality_score),
// jamais une nouvelle note inventee.
function topMarketsToWatch(marketsCompared, dataQualityScore) {
  var list = (marketsCompared || []).filter(function(m){ return m && m.market && Number.isFinite(Number(m.edge)); });
  if (!list.length) return [];
  var confidence = Number.isFinite(Number(dataQualityScore)) ? Math.round(Number(dataQualityScore) / 10) : null;
  return list.slice()
    .sort(function(a,b){ return Math.abs(Number(b.edge)) - Math.abs(Number(a.edge)); })
    .slice(0, 3)
    .map(function(m){
      return {
        market: m.market,
        interest: Math.abs(Number(m.edge)) >= 8 ? "Intéressant" : Math.abs(Number(m.edge)) >= 4 ? "Léger intérêt" : "Neutre",
        confidence: confidence,
        edge: round1(m.edge)
      };
    });
}

// Repli honnete a "stats a ne pas surinterpreter" : plutot que la force
// des adversaires recents (donnee qu'on n'a pas sans appel API
// supplementaire par adversaire), signale les victoires/matchs a marge
// etroite dans la meme serie recente deja recuperee (raw.form_home/away)
// - un vrai signal de fragilite d'une serie, pas invente.
function formMarginNote(last10) {
  var rows = (last10 || []).slice(0, 5);
  if (!rows.length) return null;
  var wins = rows.filter(function(r){ return r.result === "W"; });
  if (!wins.length) return null;
  var narrow = wins.filter(function(r){
    var parts = String(r.score || "").split("-").map(Number);
    return parts.length === 2 && parts.every(Number.isFinite) && Math.abs(parts[0] - parts[1]) <= 1;
  });
  if (!narrow.length) return null;
  return { wins: wins.length, narrowWins: narrow.length, sample: rows.length };
}

return {
  computeMatchup: computeMatchup,
  computeScoringProbability: computeScoringProbability,
  computeOutputShare: computeOutputShare,
  computeFormTrend: computeFormTrend,
  classifyKeyInsights: classifyKeyInsights,
  topMarketsToWatch: topMarketsToWatch,
  formMarginNote: formMarginNote
};
});
