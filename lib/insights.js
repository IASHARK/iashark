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
// Justifications du marche recommande.
//
// Repond a une demande explicite : "il faut justifier et essayer de
// justifier dans une phrase simple". Chaque fait est calcule a partir de
// donnees deja relevees par le pipeline - moyennes de buts marques et
// encaisses, tirs, tirs cadres, repartition des buts par tranche - et
// formule en une phrase. Aucun texte generique, aucune affirmation qui ne
// s'appuie pas sur un nombre affiche dans la phrase elle-meme.
//
// Retourne au plus deux faits : au-dela, ce n'est plus une justification,
// c'est une liste.
function buildMarketJustifications(opts) {
  opts = opts || {};
  var marche = String(opts.market || '').toLowerCase();
  var dom = opts.homeName || 'Domicile', ext = opts.awayName || 'Extérieur';
  var sh = opts.statsHome || {}, sa = opts.statsAway || {};
  var eh = opts.eventsHome || {}, ea = opts.eventsAway || {};
  var faits = [];

  var num = function (v) { var x = Number(v); return isFinite(x) ? x : null; };
  // Virgule decimale : ces phrases sont lues telles quelles par un
  // francophone, "1.6 but par match" fait note de bas de page anglaise.
  var d1 = function (v) { return String(round1(v)).replace('.', ','); };
  // Part des buts marques avant la 45e, a partir des tranches reelles.
  var partPremiereMiTemps = function (ev) {
    var slots = ev && ev.slots;
    if (!Array.isArray(slots) || slots.length < 6) return null;
    var total = slots.reduce(function (s, x) { return s + (num(x && x.n) || 0); }, 0);
    if (total < 6) return null;
    var avant = slots.slice(0, 3).reduce(function (s, x) { return s + (num(x && x.n) || 0); }, 0);
    return Math.round((avant / total) * 100);
  };

  var butsMarques = [num(eh.goals_avg), num(ea.goals_avg)];
  var butsEncaisses = [num(eh.conceded_avg), num(ea.conceded_avg)];

  // --- Marches de buts (over/under, buts d'une equipe) ---
  if (/over|under|plus de|moins de/.test(marche) && !/tir/.test(marche) && !/mi-temps/.test(marche)) {
    if (butsMarques[0] !== null && butsMarques[1] !== null) {
      var total = butsMarques[0] + butsMarques[1];
      faits.push({
        titre: 'Volume de buts',
        texte: dom + ' marque ' + d1(butsMarques[0]) + ' but par match et ' + ext + ' ' + d1(butsMarques[1])
          + ', soit ' + d1(total) + ' but' + (total >= 2 ? 's' : '') + ' par rencontre en moyenne.'
      });
    }
    if (butsEncaisses[0] !== null && butsEncaisses[1] !== null) {
      var lache = butsEncaisses[0] >= butsEncaisses[1] ? dom : ext;
      var plusHaut = Math.max(butsEncaisses[0], butsEncaisses[1]);
      faits.push({
        titre: 'Défenses',
        texte: 'Les deux défenses encaissent ' + d1(butsEncaisses[0]) + ' et ' + d1(butsEncaisses[1])
          + ' but par match ; ' + lache + ' est la plus perméable avec ' + d1(plusHaut) + '.'
      });
    }
  }

  // --- Premiere mi-temps ---
  if (/mi-temps/.test(marche)) {
    var pDom = partPremiereMiTemps(eh), pExt = partPremiereMiTemps(ea);
    if (pDom !== null && pExt !== null) {
      faits.push({
        titre: 'Rythme d’entrée de match',
        texte: dom + ' inscrit ' + pDom + ' % de ses buts avant la pause, ' + ext + ' ' + pExt + ' %.'
      });
    }
    if (butsMarques[0] !== null && butsMarques[1] !== null) {
      var cumul = butsMarques[0] + butsMarques[1];
      faits.push({
        titre: 'Volume de buts',
        texte: 'Sur l’ensemble du match, les deux équipes totalisent ' + d1(cumul) + ' but' + (cumul >= 2 ? 's' : '') + ' par rencontre en moyenne.'
      });
    }
  }

  // --- Tirs ---
  if (/tir/.test(marche)) {
    var cadre = /cadr/.test(marche);
    var champ = cadre ? 'shots_on' : 'shots_total';
    var th = num(sh[champ]), ta = num(sa[champ]);
    if (th !== null && ta !== null) {
      var nom = (th >= 2 ? (cadre ? 'tirs cadrés' : 'tirs') : (cadre ? 'tir cadré' : 'tir'));
      faits.push({
        titre: cadre ? 'Tirs cadrés' : 'Volume de tirs',
        texte: dom + ' produit ' + d1(th) + ' ' + nom + ' par match et ' + ext + ' ' + d1(ta)
          + ', soit ' + d1(th + ta) + ' au total.'
      });
    }
    var ph = num(sh.possession), pa = num(sa.possession);
    if (ph !== null && pa !== null && Math.abs(ph - pa) >= 6) {
      var dominant = ph > pa ? dom : ext;
      faits.push({
        titre: 'Maîtrise du ballon',
        texte: dominant + ' tient ' + Math.round(Math.max(ph, pa)) + ' % du ballon en moyenne, ce qui pèse sur le volume de tirs.'
      });
    }
  }

  // --- Double chance et resultat ---
  if (/^dc |double chance|domicile|exterieur/.test(marche) && !/but|tir/.test(marche)) {
    if (butsMarques[0] !== null && butsEncaisses[1] !== null) {
      faits.push({
        titre: 'Attaque contre défense',
        texte: dom + ' marque ' + d1(butsMarques[0]) + ' but par match quand ' + ext + ' en encaisse ' + d1(butsEncaisses[1]) + '.'
      });
    }
    var xgh = num(sh.xg), xga = num(sa.xg);
    if (xgh !== null && xga !== null && Math.abs(xgh - xga) >= 0.25) {
      var meilleur = xgh > xga ? dom : ext;
      faits.push({
        titre: 'Occasions créées',
        texte: meilleur + ' se procure les meilleures occasions : ' + d1(Math.max(xgh, xga))
          + ' buts attendus par match contre ' + d1(Math.min(xgh, xga)) + '.'
      });
    }
  }

  // --- BTTS ---
  if (/btts|deux [eé]quipes marquent/.test(marche)) {
    if (butsMarques[0] !== null && butsMarques[1] !== null) {
      faits.push({
        titre: 'Les deux marquent',
        texte: dom + ' marque ' + d1(butsMarques[0]) + ' but par match et ' + ext + ' ' + d1(butsMarques[1]) + '.'
      });
    }
    if (butsEncaisses[0] !== null && butsEncaisses[1] !== null) {
      faits.push({
        titre: 'Les deux encaissent',
        texte: dom + ' encaisse ' + d1(butsEncaisses[0]) + ' but par match et ' + ext + ' ' + d1(butsEncaisses[1]) + '.'
      });
    }
  }

  // --- Repli commun : ce qui est vrai quel que soit le marche ---
  if (faits.length < 2) {
    var sth = num(sh.shots_total), sta = num(sa.shots_total);
    if (sth !== null && sta !== null) {
      faits.push({
        titre: 'Volume de jeu',
        texte: 'Les deux équipes tirent ' + d1(sth + sta) + ' fois par match en cumulé (' + d1(sth) + ' et ' + d1(sta) + ').'
      });
    }
  }
  if (faits.length < 2 && butsMarques[0] !== null && butsMarques[1] !== null) {
    faits.push({
      titre: 'Buts marqués',
      texte: dom + ' marque ' + d1(butsMarques[0]) + ' but par match, ' + ext + ' ' + d1(butsMarques[1]) + '.'
    });
  }

  // Deux faits differents au maximum : on ne repete jamais le meme titre.
  var vus = {};
  return faits.filter(function (f) {
    if (vus[f.titre]) return false;
    vus[f.titre] = true;
    return true;
  }).slice(0, 2);
}

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
  buildMarketJustifications: buildMarketJustifications,
  topMarketsToWatch: topMarketsToWatch,
  formMarginNote: formMarginNote
};
});
