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
// (goals90 dans playerAnalytics, minutes attendues via la moyenne de
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
  // `matchup`, `market`, `edge` : faits structures joints au texte francais
  // historique (title/text), pour que l'affichage redige la phrase dans la
  // langue de la page sans reparser le francais.
  if (homeMatchup) out.push({ type: "positive_home", title: homeName + " en position de force", text: homeMatchup.text, matchup: homeMatchup });
  var awayMatchup = (matchups || []).filter(function(m){ return m.title && m.title.indexOf(awayName) === 0; })[0];
  if (awayMatchup) out.push({ type: "positive_away", title: awayName + " dangereux", text: awayMatchup.text, matchup: awayMatchup });
  if (keyAbsenceAlerts && keyAbsenceAlerts.length) {
    out.push({ type: "watch", title: "Point de vigilance", text: keyAbsenceAlerts[0] });
  }
  var primary = marketsCompared && marketsCompared[0];
  if (primary && Number.isFinite(Number(primary.edge)) && Math.abs(Number(primary.edge)) >= 8) {
    var dir = Number(primary.edge) > 0 ? "notre modèle est nettement au-dessus du marché" : "le marché est nettement au-dessus de notre modèle";
    out.push({ type: "contradiction", title: "Signal contradictoire", text: "Sur " + primary.market + ", " + dir + " (écart de " + Math.abs(Math.round(primary.edge)) + " points) - à interpréter avec prudence.", market: primary.market, edge: Number(primary.edge) });
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

// ---------------------------------------------------------------------------
// SIGNAL IASHARK (14/09/2026) : fiabilite expliquee, raisons et risques du
// pari recommande. Tout est deduit de donnees DEJA reelles (reliability du
// pipeline, buts attendus du modele, moyennes de saison, vrais scores des
// face-a-face, vraies absences). Aucune phrase n'est redigee ici : on renvoie
// des faits structures { key, vars } que la page redige dans sa langue. Une
// raison dont la donnee manque n'est jamais remplacee par une valeur
// inventee : elle disparait.
// ---------------------------------------------------------------------------

// Niveau de fiabilite (libelle du pipeline "Élevée"/"Moyenne"/"Faible") et
// sa raison principale, en une ligne.
function reliabilityInfo(reliability) {
  var r = reliability || {};
  var label = String(r.label || "").toLowerCase();
  if (!label) return null;
  var level = /[ée]lev/.test(label) ? "high" : /moy/.test(label) ? "medium" : /faib/.test(label) ? "low" : null;
  if (!level) return null;
  var sample = finite(r.sample_size);
  var agreement = String(r.model_agreement || "").toLowerCase();
  var quality = String(r.data_quality || "").toLowerCase();
  var reason;
  if (sample !== null && sample < 5) reason = "thin_sample";
  else if (/faib/.test(agreement)) reason = "models_disagree";
  else if (/faib/.test(quality)) reason = "weak_data";
  else if (/fort/.test(agreement) && /[ée]lev/.test(quality)) reason = "solid";
  else reason = "mixed";
  return { level: level, reason: reason, sampleSize: sample };
}

// "4-3" -> [4, 3]
function scoreParts(score) {
  var p = String(score || "").split(/\s*[-–]\s*/).map(Number);
  return p.length === 2 && p.every(Number.isFinite) ? p : null;
}

// Rejoue le pari sur les vrais scores des face-a-face (du point de vue de
// l'equipe a domicile DU MATCH ACTUEL). Uniquement les familles decidees par
// le score final : un marche de tirs ou de 1re mi-temps n'est pas rejouable.
function h2hOutcome(fam, h2h, homeName, awayName) {
  if (!fam || !Array.isArray(h2h)) return null;
  var line = finite(fam.line);
  var won = function (hg, ag) {
    var tot = hg + ag;
    switch (fam.family) {
      case "total": return line === null ? null : fam.direction === "over" ? tot > line : tot < line;
      case "team_goals": {
        if (line === null || !fam.side) return null;
        var g = fam.side === "home" ? hg : ag;
        return fam.direction === "over" ? g > line : g < line;
      }
      case "btts": return fam.direction === "no" ? !(hg > 0 && ag > 0) : hg > 0 && ag > 0;
      case "result": return fam.side === "home" ? hg > ag : fam.side === "away" ? ag > hg : hg === ag;
      case "dc": return fam.side === "home" ? hg >= ag : fam.side === "away" ? ag >= hg : hg !== ag;
      case "clean_sheet": return fam.side === "home" ? ag === 0 : fam.side === "away" ? hg === 0 : null;
      case "win_to_nil": return fam.side === "home" ? hg > ag && ag === 0 : fam.side === "away" ? ag > hg && hg === 0 : null;
      case "win_goals": {
        if (line === null || !fam.side) return null;
        var gagne = fam.side === "home" ? hg > ag : ag > hg;
        return gagne && (fam.direction === "over" ? tot > line : tot < line);
      }
      default: return null;
    }
  };
  var wins = 0, sample = 0;
  h2h.slice(0, 5).forEach(function (row) {
    if (!row) return;
    var s = scoreParts(row.score != null ? row.score : row.s);
    if (!s) return;
    var h = row.home, a = row.away, hg, ag;
    if (h === homeName && a === awayName) { hg = s[0]; ag = s[1]; }
    else if (h === awayName && a === homeName) { hg = s[1]; ag = s[0]; }
    else return;
    var w = won(hg, ag);
    if (w === null) return;
    sample++;
    if (w) wins++;
  });
  return sample >= 3 ? { wins: wins, sample: sample } : null;
}

var GOAL_FAMILIES = { total: 1, team_goals: 1, btts: 1, win_goals: 1, fh: 1, clean_sheet: 1, win_to_nil: 1 };
var RESULT_FAMILIES = { result: 1, dc: 1, dnb: 1, handicap: 1 };
var COUNT_FAMILIES = { shots: "shots_total", shots_on: "shots_on", corners: "corners", cards: null };

// Deux a trois raisons courtes, dans l'ordre de pertinence pour la famille du
// pari. opts : { family (lib/market-labels.js#marketFamily), homeName,
// awayName, expectedGoals {home,away}, eventsHome, eventsAway (goals_avg,
// conceded_avg, yellow_per_game), statsHome, statsAway (match_stats),
// h2h [{home,away,score}], form {home:[result], away:[result]},
// absences {home:[names], away:[names]} }.
function signalReasons(opts) {
  var o = opts || {};
  var fam = o.family || { family: "other" };
  var home = o.homeName, away = o.awayName;
  var out = [];
  var push = function (item) { if (item && out.length < 3 && !out.some(function (x) { return x.key === item.key; })) out.push(item); };

  var xg = o.expectedGoals && finite(o.expectedGoals.home) !== null && finite(o.expectedGoals.away) !== null
    ? { key: "xg", vars: { home: home, away: away, homeXg: round1(o.expectedGoals.home), awayXg: round1(o.expectedGoals.away), totalXg: round1(finite(o.expectedGoals.home) + finite(o.expectedGoals.away)) } }
    : null;
  var eh = o.eventsHome || {}, ea = o.eventsAway || {};
  var avg = [finite(eh.goals_avg), finite(eh.conceded_avg), finite(ea.goals_avg), finite(ea.conceded_avg)];
  var goalsAvg = avg.every(function (v) { return v !== null; })
    ? { key: "goals_avg", vars: { home: home, away: away, homeFor: round1(avg[0]), homeAgainst: round1(avg[1]), awayFor: round1(avg[2]), awayAgainst: round1(avg[3]) } }
    : null;
  var h2 = h2hOutcome(fam, o.h2h, home, away);
  var h2hItem = h2 ? { key: "h2h_hits", vars: { wins: h2.wins, sample: h2.sample } } : null;
  var absents = function (side) {
    var list = o.absences && Array.isArray(o.absences[side]) ? o.absences[side] : [];
    return list.length >= 2 ? { key: "absences", vars: { team: side === "home" ? home : away, n: list.length, names: list.slice(0, 3).join(", ") } } : null;
  };
  var formItem = null;
  if (o.form && Array.isArray(o.form.home) && Array.isArray(o.form.away) && o.form.home.length >= 3 && o.form.away.length >= 3) {
    var wins = function (rows) { return rows.slice(0, 5).filter(function (r) { return r === "W"; }).length; };
    formItem = { key: "form_wins", vars: { home: home, away: away, homeWins: wins(o.form.home), awayWins: wins(o.form.away), homeN: Math.min(5, o.form.home.length), awayN: Math.min(5, o.form.away.length) } };
  }

  if (GOAL_FAMILIES[fam.family]) {
    push(xg);
    if (fam.family === "team_goals" && fam.direction === "under" && fam.side) push(absents(fam.side));
    push(h2hItem);
    push(goalsAvg);
  } else if (RESULT_FAMILIES[fam.family]) {
    push(formItem);
    push(xg);
    if (fam.side) push(absents(fam.side === "home" ? "away" : "home"));
    push(h2hItem);
  } else if (Object.prototype.hasOwnProperty.call(COUNT_FAMILIES, fam.family)) {
    var field = COUNT_FAMILIES[fam.family];
    var sh = o.statsHome || {}, sa = o.statsAway || {};
    var h = field ? finite(sh[field]) : finite(eh.yellow_per_game);
    var a = field ? finite(sa[field]) : finite(ea.yellow_per_game);
    if (h !== null && a !== null) push({ key: "count_" + fam.family, vars: { home: home, away: away, homeValue: round1(h), awayValue: round1(a), total: round1(h + a) } });
    push(xg);
    push(goalsAvg);
  } else {
    push(xg);
    push(formItem);
  }
  return out;
}

// Au plus deux points a surveiller, du plus important au moins important.
// opts : { family, edge (points), odds, reliability, homeName, awayName,
// absences {home:[names], away:[names]} }. La fiabilite "peu de donnees" est
// deja dite par le badge : elle n'est pas repetee ici.
function signalRisks(opts) {
  var o = opts || {};
  var fam = o.family || {};
  var out = [];
  var edge = finite(o.edge), odds = finite(o.odds);
  if (edge !== null && edge < 0) out.push({ key: "negative_edge", vars: { gap: round1(Math.abs(edge)) } });
  else if (edge !== null && edge < 2) out.push({ key: "small_edge", vars: { gap: round1(edge) } });
  var rel = o.reliability || {};
  if (/faib/i.test(String(rel.model_agreement || ""))) out.push({ key: "models_disagree", vars: {} });
  // Absences dans le camp soutenu par le pari (resultat, ou buts "plus de"
  // d'une equipe) : elles jouent contre lui.
  if (fam.side && (RESULT_FAMILIES[fam.family] || (fam.family === "team_goals" && fam.direction === "over") || fam.family === "win_goals")) {
    var list = o.absences && Array.isArray(o.absences[fam.side]) ? o.absences[fam.side] : [];
    if (list.length >= 2) out.push({ key: "backed_absences", vars: { team: fam.side === "home" ? o.homeName : o.awayName, n: list.length } });
  }
  if (odds !== null && odds < 1.4) out.push({ key: "low_odds", vars: { odds: odds } });
  return out.slice(0, 2);
}

return {
  reliabilityInfo: reliabilityInfo,
  h2hOutcome: h2hOutcome,
  signalReasons: signalReasons,
  signalRisks: signalRisks,
  computeMatchup: computeMatchup,
  computeScoringProbability: computeScoringProbability,
  computeOutputShare: computeOutputShare,
  computeFormTrend: computeFormTrend,
  classifyKeyInsights: classifyKeyInsights,
  topMarketsToWatch: topMarketsToWatch,
  formMarginNote: formMarginNote
};
});
