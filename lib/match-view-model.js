(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./display-data') : root.IasharkDisplayData,
    typeof require === 'function' ? require('./insights') : root.IasharkInsights
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IasharkMatchViewModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (display, insights) {
  'use strict';

  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const round1 = value => finite(value) === null ? null : Math.round(finite(value) * 10) / 10;
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const team = value => ({ id: value && value.id != null ? value.id : null, name: text(value && value.n) || 'Équipe', logo: value && value.id ? `https://media.api-sports.io/football/teams/${value.id}.png` : null });

  function uniqueInjuries(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(item => {
      const key = `${item.team}|${item.name}|${item.reason}|${item.status}`;
      if (!item || !text(item.name) || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(item => ({ name: item.name, team: item.team, reason: text(item.reason), status: text(item.status) }));
  }

  // Profil de tirs (on/off/blocked) + precision offensive (xG par tir cadre)
  // : uniquement des champs API-Football reels (match_stats_home/away), pas
  // de coordonnees de tir (non fournies par l'API) - donc pas de vraies
  // "zones dangereuses" spatiales, un indicateur de qualite d'occasion a la
  // place.
  function shotStats(raw) {
    const hs = raw.match_stats_home || {}, as = raw.match_stats_away || {};
    const side = s => ({
      total: finite(s.shots_total), on: finite(s.shots_on), off: finite(s.shots_off), blocked: finite(s.shots_blocked),
      xg: finite(s.xg)
    });
    const home = side(hs), away = side(as);
    if (home.total === null || away.total === null || home.on === null || away.on === null) return null;
    const quality = s => (s.xg !== null && s.on) ? Math.round((s.xg / s.on) * 100) / 100 : null;
    return { home, away, precision: { home: quality(home), away: quality(away) } };
  }

  // Repartition des buts par tranche de 15 minutes.
  //
  // Remplace scenario_15min, un texte redige par le LLM qui n'existait que
  // sur 1 des 46 matchs publies - la section affichait donc "Scenario du
  // match indisponible" partout ailleurs. Ici, rien n'est redige : on compte
  // les buts reellement marques par les deux equipes sur chaque tranche
  // (raw.events_*.slots, releves par le pipeline) et on en donne la part.
  //
  // C'est une frequence observee sur les matchs passes de ces deux equipes,
  // pas une prevision pour la rencontre a venir. Le libelle de la section le
  // dit, et le nombre de buts sur lequel elle repose est affiche.
  function goalTiming(raw) {
    const lire = (side) => {
      const slots = raw['events_' + side] && raw['events_' + side].slots;
      return Array.isArray(slots) ? slots : null;
    };
    const home = lire('home'), away = lire('away');
    if (!home || !away || home.length !== away.length || !home.length) return null;

    const total = home.concat(away).reduce((s, x) => s + (finite(x && x.n) || 0), 0);
    // Sous une dizaine de buts, une part par tranche ne veut rien dire.
    if (total < 10) return null;

    const slots = home.map((h, i) => {
      const a = away[i] || {};
      const butsHome = finite(h && h.n) || 0, butsAway = finite(a.n) || 0;
      return {
        label: text(h && h.t) || '',
        home: butsHome,
        away: butsAway,
        share: Math.round(((butsHome + butsAway) / total) * 1000) / 10
      };
    });
    const pic = slots.reduce((a, b) => (b.share > a.share ? b : a), slots[0]);
    return { slots, totalGoals: total, peak: pic };
  }

  // Comparatif des deux equipes.
  //
  // Il etait conditionne a hasReliableCriteria(crit_home, crit_away) - or il
  // n'affiche AUCUNE valeur issue de crit_*. Il lisait match_stats_* et
  // events_*, presents sur 42 des 46 matchs, mais restait masque des que
  // crit_* manquait. Et crit_* est null tant qu'une equipe n'a pas trois

  // Comparatif des deux equipes.
  //
  // Il etait conditionne a hasReliableCriteria(crit_home, crit_away) - or il
  // n'affiche AUCUNE valeur issue de crit_*. Il lisait match_stats_* et
  // events_*, presents sur 42 des 46 matchs, mais restait masque des que
  // crit_* manquait. Et crit_* est null tant qu'une equipe n'a pas trois
  // matchs joues : en debut de saison, cela vidait le comparatif de toute la
  // Premier League, de la Bundesliga, de la Ligue 1 et de la Serie A - les
  // quatre championnats les plus consultes. D'ou le constat de
  // l'utilisateur : "le comparatif ne fonctionne sur aucun match".
  //
  // La condition porte desormais sur les donnees reellement affichees, et le
  // nombre de matchs sur lequel elles reposent accompagne le tableau.
  function comparison(raw) {
    const hs = raw.match_stats_home || {}, as = raw.match_stats_away || {};
    const candidates = [
      ['Buts marqués', raw.events_home && raw.events_home.goals_avg, raw.events_away && raw.events_away.goals_avg],
      ['Buts concédés', raw.events_home && raw.events_home.conceded_avg, raw.events_away && raw.events_away.conceded_avg],
      ['Tirs', hs.shots_total, as.shots_total], ['Tirs cadrés', hs.shots_on, as.shots_on], ['Possession', hs.possession, as.possession],
      ['Corners', hs.corners, as.corners], ['Fautes', hs.fouls, as.fouls], ['Hors-jeu', hs.offsides, as.offsides], ['Arrêts', hs.saves, as.saves]
    ];
    const rows = candidates.map(([label, h, a]) => ({ label, home: finite(h), away: finite(a) })).filter(row => row.home !== null && row.away !== null);
    if (rows.length < 3) return null;
    // Nombre de matchs derriere ces moyennes, quand il est connu. Il n'est
    // jamais devine : il vient du compteur d'evenements du pipeline.
    const jouesHome = finite(raw.events_home && raw.events_home.games);
    const jouesAway = finite(raw.events_away && raw.events_away.games);
    const echantillon = jouesHome !== null && jouesAway !== null ? Math.min(jouesHome, jouesAway) : null;
    return { rows, sampleSize: echantillon };
  }

  // Face-a-face : 5 dernieres confrontations reelles (raw.h2h, deja formate
  // par le pipeline - champ w deja calcule relatif a l'equipe domicile DU
  // MATCH ACTUEL, jamais recalcule ici). Vide -> section absente, jamais un
  // "aucune confrontation" invente si le tableau est simplement manquant.
  function headToHead(items) {
    const rows = (Array.isArray(items) ? items : []).map(item => ({
      date: text(item && item.d), home: text(item && item.home), away: text(item && item.away),
      score: text(item && item.s), winner: text(item && item.w)
    })).filter(row => row.date && row.home && row.away && row.score);
    return rows.length ? rows : null;
  }

  function projection(item) {
    const marketLabels = { ANYTIME_GOALSCORER: 'Buteur', PLAYER_SHOTS: 'Tirs', PLAYER_SHOTS_ON_TARGET: 'Tirs cadrés' };
    const statusLabels = { confirmed_starter: 'Titulaire confirmé', confirmed_bench: 'Remplaçant confirmé', expected_starter: 'Titulaire probable', expected_bench: 'Remplaçant probable' };
    const qualityLabels = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' };
    const rawProbability = finite(item && item.output && item.output.probability);
    return { player: text(item && item.player_name) || 'Joueur', playerId: item && item.player_id != null ? item.player_id : null, market: marketLabels[item && item.market] || text(item && item.market) || 'Marché joueur', status: statusLabels[item && item.lineup_status] || text(item && item.lineup_status) || 'À confirmer', minutes: finite(item && item.expected_minutes), probability: rawProbability === null ? null : round1(rawProbability * 100), quality: qualityLabels[item && item.data_quality] || text(item && item.data_quality) || '—', sampleSize: finite(item && item.sample_size) };
  }

  // Score IASHARK (0-100) : composite documenté, JAMAIS une valeur arbitraire
  // isolée - construit uniquement à partir de signaux déjà réels et déjà
  // calculés ailleurs dans le pipeline (rien de nouveau n'est inventé ici,
  // seule la pondération l'est, et elle est documentée explicitement).
  // Poids : 50% probabilité modèle (model_probability, PURE_IASHARK), 20%
  // qualité des données (data_quality_score), 20% accord des modèles
  // (model_agreement: Fort/Moyen/Faible), 10% taille d'échantillon
  // (reliability.sample_size, plafonnée à 20 matchs = échantillon jugé
  // suffisant ailleurs dans le pipeline, cf MIN_SAMPLE_FOR_VALIDATION).
  // Non backtesté (aucun score composite ne l'est dans ce produit à ce jour)
  // - n'importe quel composant manquant est retiré du calcul et son poids
  // redistribué, jamais remplacé par une valeur inventée.
  const IASHARK_SCORE_WEIGHTS = { probability: 0.5, quality: 0.2, agreement: 0.2, sample: 0.1 };
  const AGREEMENT_SCORE = { Fort: 100, Moyen: 60, Faible: 25 };
  function computeIasharkScore(raw, reliability) {
    const sampleSize = finite(reliability && reliability.sample_size);
    const components = [
      { key: 'probability', value: finite(raw.model_probability) },
      { key: 'quality', value: finite(raw.data_quality_score) },
      { key: 'agreement', value: AGREEMENT_SCORE[raw.model_agreement] ?? null },
      { key: 'sample', value: sampleSize === null ? null : Math.min(100, (sampleSize / 20) * 100) }
    ].filter(c => c.value !== null);
    if (!components.length) return null;
    const totalWeight = components.reduce((s, c) => s + IASHARK_SCORE_WEIGHTS[c.key], 0);
    const weighted = components.reduce((s, c) => s + c.value * IASHARK_SCORE_WEIGHTS[c.key], 0);
    return Math.round(weighted / totalWeight);
  }

  // Value/EV : UNIQUEMENT l'entree de markets_compared dont le nom
  // correspond au VRAI marche retenu (raw.pari_rec) - jamais index [0].
  // markets_compared est trie par probabilite modele decroissante cote
  // pipeline, pas par "marche recommande en premier" : sur des donnees
  // reelles, [0] est frequemment un marche DIFFERENT de celui recommande,
  // ce qui affichait la Value d'un autre pari sans que rien ne le signale.
  // Si le marche retenu n'a pas d'entree correspondante, la Value reste
  // indisponible plutot que d'afficher un edge qui n'est pas le sien.
  function computeValue(marketsCompared, recommendedMarket) {
    if (!recommendedMarket) return null;
    const match = (marketsCompared || []).find(m => m.market === recommendedMarket);
    return match && match.edge !== null ? match.edge : null;
  }

  // Momentum IASHARK : projection pré-match, PAS un tracking live. Construite
  // uniquement à partir de events_home/events_away (source API-Football réelle,
  // déjà vérifiée par hasReliableEventPatterns - 6 tranches de 15 minutes,
  // 5 matchs minimum). Pour chaque tranche, combine la tendance offensive
  // réelle de l'équipe (slots) et la faiblesse défensive réelle de
  // l'adversaire sur cette même tranche (slots_against) - jamais une seule
  // face du signal. Normalisé autour de la référence "buts uniformément
  // répartis sur 6 tranches" (100/6 ≈ 16.7%) pour obtenir une échelle
  // -100/+100 lisible, pas une valeur de confort arbitraire.
  const MOMENTUM_BASELINE = 100 / 6;
  // events_home/away.slots[i].n est un COMPTAGE BRUT de buts sur cette
  // tranche (pas un pourcentage - verifie sur donnees reelles live) : il
  // faut d'abord le convertir en % du total de buts de CETTE serie (6
  // tranches), exactement comme le fait deja le texte reel du scenario
  // genere par le pipeline ("marque 9% de ses buts a domicile sur cette
  // tranche"), avant toute normalisation.
  function slotPercents(slots) {
    if (!Array.isArray(slots) || slots.length !== 6) return null;
    const counts = slots.map(s => finite(s && s.n));
    if (counts.some(c => c === null)) return null;
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    return counts.map(c => (c / total) * 100);
  }
  function momentumSeries(eventsHome, eventsAway) {
    const hFor = slotPercents(eventsHome && eventsHome.slots);
    const aFor = slotPercents(eventsAway && eventsAway.slots);
    const hAgainst = slotPercents(eventsHome && eventsHome.slots_against);
    const aAgainst = slotPercents(eventsAway && eventsAway.slots_against);
    if (!hFor || !aFor || !hAgainst || !aAgainst) return null;
    const labels = ['0-15\'', '15-30\'', '30-45\'', '45-60\'', '60-75\'', '75-90\''];
    return labels.map((label, i) => ({
      label,
      home: Math.round((((hFor[i] + aAgainst[i]) / 2 - MOMENTUM_BASELINE) / MOMENTUM_BASELINE) * 100),
      away: Math.round((((aFor[i] + hAgainst[i]) / 2 - MOMENTUM_BASELINE) / MOMENTUM_BASELINE) * 100)
    }));
  }

  // Distribution Monte-Carlo : visualise les VRAIS scores exacts sortis des
  // vraies simulations du pipeline (mc_scores, simulation_count) - jamais une
  // nouvelle simulation recalculée côté client, jamais une distribution
  // inventée. N/D si le pipeline n'a publié aucun score.
  function monteCarloDistribution(rawScores, simulationCount) {
    if (!Array.isArray(rawScores) || !rawScores.length) return null;
    const bars = rawScores.filter(s => text(s.score) && finite(s.pct) !== null).map(s => ({ score: s.score, pct: finite(s.pct) }));
    if (!bars.length) return null;
    return { bars, simulationCount: finite(simulationCount) };
  }

  // Terrain tactique : utilise le champ "grid" reel de /fixtures/lineups
  // ("ligne:colonne", ex "3:2") - jamais une position devinee. Un onze sans
  // grid (donnees API incompletes) retombe sur un regroupement par poste
  // (comportement precedent), toujours honnete, jamais un point invente sur
  // le terrain.
  function formationRows(startXI) {
    if (!Array.isArray(startXI) || !startXI.length) return null;
    const withGrid = startXI.filter(p => text(p.grid) && /^\d+:\d+$/.test(p.grid));
    if (withGrid.length !== startXI.length) return null;
    const byRow = {};
    withGrid.forEach(p => {
      const [row, col] = p.grid.split(':').map(Number);
      (byRow[row] || (byRow[row] = [])).push({ ...p, col });
    });
    return Object.keys(byRow).map(Number).sort((a, b) => a - b).map(row => byRow[row].sort((a, b) => a.col - b.col));
  }

  // Matchups a cibler : genere UNIQUEMENT a partir d'un ecart numerique reel
  // et mesurable (tirs pour/contre, cf comparison() ci-dessus) - jamais une
  // affirmation tactique (couloir, pressing...) sans donnee correspondante
  // dans le pipeline. Seuil de 20% d'ecart relatif avant de considerer le
  // matchup "a cibler", pour eviter de publier un ecart de bruit statistique.
  // Domicile et exterieur utilisent chacun un angle statistique DIFFERENT
  // (volume total de tirs pour l'un, precision/tirs cadres pour l'autre) -
  // sinon les deux entrees ne font que reformuler le meme ecart brut
  // (hs.shots_total vs as.shots_total) sous deux angles, ce qui donnait deux
  // lignes quasi identiques plutot que deux insights reellement distincts.
  const MATCHUP_THRESHOLD = 0.2;
  function matchups(raw, homeName, awayName) {
    const hs = raw.match_stats_home || {}, as = raw.match_stats_away || {};
    const out = [];
    if (finite(hs.shots_total) !== null && finite(as.shots_total) !== null) {
      const homeFor = finite(hs.shots_total), awayAllowed = finite(as.shots_total);
      if (homeFor && awayAllowed && Math.abs(homeFor - awayAllowed) / Math.max(homeFor, awayAllowed) >= MATCHUP_THRESHOLD) {
        out.push({ title: `${homeName} au volume de tirs`, text: `${homeName} tente ${round1(homeFor)} tirs en moyenne, ${awayName} en concède ${round1(awayAllowed)} — écart réel de ${round1(Math.abs(homeFor - awayAllowed))} tirs.` });
      }
    }
    if (finite(as.shots_on) !== null && finite(hs.shots_on) !== null) {
      const awayOnFor = finite(as.shots_on), homeOnAllowed = finite(hs.shots_on);
      if (awayOnFor && homeOnAllowed && Math.abs(awayOnFor - homeOnAllowed) / Math.max(awayOnFor, homeOnAllowed) >= MATCHUP_THRESHOLD) {
        out.push({ title: `${awayName} à la précision`, text: `${awayName} cadre ${round1(awayOnFor)} tirs en moyenne à l'extérieur, ${homeName} en concède ${round1(homeOnAllowed)} à domicile.` });
      }
    }
    if (finite(hs.possession) !== null && finite(as.possession) !== null && Math.abs(finite(hs.possession) - finite(as.possession)) >= 15) {
      const leader = finite(hs.possession) > finite(as.possession) ? homeName : awayName;
      out.push({ title: 'Contrôle du ballon', text: `Écart de possession réel et net (${round1(hs.possession)}% vs ${round1(as.possession)}%) en faveur de ${leader}.` });
    }
    return out;
  }

  // Player Impact Score : classe les marches joueur REELS deja calcules par
  // le Player Engine (jamais une nouvelle probabilite inventee) par
  // probabilite x confiance qualite/echantillon, pour ne retenir que les
  // projections les plus solides du match - pas un choix arbitraire de nom
  // connu. Vide/N-D tant que player_markets est vide (Player Engine non
  // encore alimente en donnees premium reelles pour ce match).
  const QUALITY_CONFIDENCE = { high: 1, medium: 0.7, low: 0.4 };
  function playerImpactRanking(rawProjections) {
    if (!Array.isArray(rawProjections) || !rawProjections.length) return [];
    const byPlayer = {};
    rawProjections.forEach(item => {
      const p = projection(item);
      if (p.probability === null) return;
      const confidence = QUALITY_CONFIDENCE[item && item.data_quality] ?? 0.4;
      const impactScore = p.probability * confidence;
      const key = p.playerId != null ? p.playerId : p.player;
      if (!byPlayer[key] || byPlayer[key].impactScore < impactScore) byPlayer[key] = { ...p, impactScore: Math.round(impactScore * 10) / 10 };
    });
    return Object.values(byPlayer).sort((a, b) => b.impactScore - a.impactScore);
  }

  // Buteurs potentiels : classement REEL par signal de menace offensive
  // (buts/90 en poids principal, tirs cadres/90 en soutien - volume/qualite
  // de tir, pas seulement des buts bruts recents qui sont tres bruites sur
  // un petit echantillon, meme logique que lib/markets/top-scorer-picker.js)
  // - distinct de l'Impact (qui melange passes cles/rating/disponibilite,
  // pertinent pour un defenseur ou un milieu, pas pour "qui va marquer").
  // Minimum 3 apparitions (meme seuil que playerImpactRanking) et jamais un
  // joueur absent/blesse. Aucune donnee nouvelle - reclasse simplement les
  // memes joueurs deja calcules par playerAnalytics ci-dessous.
  // Attenuation selon le temps de jeu. Un ratio "par 90 minutes" mesure sur
  // 20 minutes est un artefact : on rapproche chaque ratio de zero d'autant
  // plus fort que l'echantillon est petit (m/(m+K)). K vaut deux matchs
  // complets, ce qui reste exploitable des les premieres journees d'une
  // saison sans ecraser tout le monde.
  const THREAT_SHRINK = 180;
  // Un joueur doit avoir au moins l'equivalent d'une mi-temps pour etre
  // propose : en dessous, aucune statistique n'a de sens. Volontairement bas
  // car la fenetre est desormais la SAISON EN COURS, qui ne compte parfois
  // que 2 journees.
  const THREAT_MIN_MINUTES = 45;
  // Part moyenne des tirs cadres qui finissent au fond, utilisee comme repli
  // quand l'echantillon du match ne permet pas de la calculer reellement.
  const FALLBACK_CONVERSION = 0.30;

  // Taux de conversion reel, calcule sur les joueurs des deux equipes de CE
  // match plutot que suppose : buts marques / tirs cadres. Si l'echantillon
  // est trop maigre (debut de saison), on retombe sur la valeur de repli.
  function shotConversionRate(allPlayers) {
    let goals = 0, shotsOn = 0;
    for (const p of allPlayers) {
      const m = finite(p.minutes) || 0;
      if (m <= 0) continue;
      goals += (finite(p.goals90) || 0) * m / 90;
      shotsOn += (finite(p.shotsOn90) || 0) * m / 90;
    }
    if (shotsOn < 20) return FALLBACK_CONVERSION;
    const rate = goals / shotsOn;
    return rate > 0.05 && rate < 0.6 ? rate : FALLBACK_CONVERSION;
  }

  // Classement "menace de but" : qui est le plus susceptible de marquer.
  //
  // Deux corrections demandees par l'utilisateur (02/09/2026) :
  //
  // 1. Les statistiques sont bornees a la saison en cours (voir
  //    playerAnalytics). La fenetre suit donc le championnat : 2 journees
  //    jouees -> 2 journees de stats.
  //
  // 2. "Des fois tu peux trouver un mec qui n'a pas marque mais qui fait
  //    beaucoup de tirs cadres, au bout d'un moment ca va rentrer." C'est
  //    exact et c'est meme le comportement statistiquement correct : sur
  //    quelques matchs, les buts sont dominés par le hasard alors que le
  //    volume de tirs cadres est un signal stable. Le classement ne trie
  //    donc plus principalement sur les buts : il estime des buts attendus
  //    a partir des tirs cadres (tirs cadres x taux de conversion reel), et
  //    n'accorde qu'un poids minoritaire aux buts deja marques.
  //    Un attaquant a 4 tirs cadres/90 sans but passe ainsi devant un
  //    joueur a 1 but sur son unique tir.
  const THREAT_W_EXPECTED = 0.65;
  const THREAT_W_ACTUAL = 0.35;

  function scoringThreatRanking(allPlayers) {
    const conversion = shotConversionRate(allPlayers);
    const eligible = allPlayers.filter(p =>
      !p.absent && p.appearances >= 1 && ((p.goals90 || 0) > 0 || (p.shotsOn90 || 0) > 0));
    const scoreOf = p => {
      const m = finite(p.minutes) || 0;
      const weight = m / (m + THREAT_SHRINK);
      const expected = (finite(p.shotsOn90) || 0) * conversion;
      const actual = finite(p.goals90) || 0;
      const blended = THREAT_W_EXPECTED * expected + THREAT_W_ACTUAL * actual;
      return Math.round(blended * weight * 1000) / 1000;
    };
    for (const floor of [THREAT_MIN_MINUTES, 0]) {
      const pool = eligible.filter(p => (finite(p.minutes) || 0) >= floor);
      if (pool.length) {
        return pool
          .map(p => ({ ...p, threatScore: scoreOf(p), expectedGoals90: Math.round((finite(p.shotsOn90) || 0) * conversion * 100) / 100, thinSample: (finite(p.minutes) || 0) < THREAT_MIN_MINUTES }))
          .sort((a, b) => b.threatScore - a.threatScore || (finite(b.minutes) || 0) - (finite(a.minutes) || 0))
          .slice(0, 4);
      }
    }
    return [];
  }

  function playerAnalytics(raw, home, away, injuries) {
    const histories = raw.player_history || {};
    const squads = raw.current_squads || {};
    const side = (key, teamValue) => {
      const squad = Array.isArray(squads[key]) ? squads[key] : [];
      const currentIds = new Set(squad.map(p => Number(p.player_id || p.id)).filter(Number.isFinite));
      const teamRows = (Array.isArray(histories[key]) ? histories[key] : []).filter(row =>
        Number(row.team_id) === Number(teamValue.id) && (!currentIds.size || currentIds.has(Number(row.player_id)))
      );
      // SAISON EN COURS UNIQUEMENT. Le pipeline etiquette deja chaque match
      // d'un joueur avec is_current_season - ce champ etait ignore ici, si
      // bien que les statistiques melangeaient la saison qui vient de
      // commencer avec la precedente. En debut de saison, ou un championnat
      // n'a joue que 2 ou 3 journees, la quasi-totalite des minutes venait
      // donc de l'an dernier : on mettait en avant des joueurs qui n'ont pas
      // encore joue cette saison (probleme rapporte le 02/09/2026).
      // La fenetre suit ainsi le championnat de lui-meme : 2 journees jouees
      // -> 2 journees de stats, 5 journees -> 5. Aucun calendrier a tenir a
      // jour, aucun nombre de journees a coder en dur.
      // Repli defensif : si aucune ligne ne porte le drapeau (donnee plus
      // ancienne, autre source), on garde tout plutot que de tout jeter.
      const currentSeasonRows = teamRows.filter(row => row.is_current_season === true);
      const rows = currentSeasonRows.length ? currentSeasonRows : teamRows;
      const seasonScoped = currentSeasonRows.length > 0;
      const fixtureIds = [...new Set(rows.map(row => row.fixture_id))];
      const grouped = {};
      rows.forEach(row => {
        const id = Number(row.player_id);
        if (!Number.isFinite(id)) return;
        (grouped[id] || (grouped[id] = [])).push(row);
      });
      const sum = (list, field) => list.reduce((total, row) => total + (finite(row[field]) || 0), 0);
      const per90 = (value, minutes) => minutes > 0 ? round1(value * 90 / minutes) : null;
      const players = Object.keys(grouped).map(id => {
        const recent = grouped[id].slice(0, 10), last5 = recent.slice(0, 5);
        const minutes = sum(recent, 'minutes'), minutesRecent = sum(last5, 'minutes');
        const ratings = last5.map(r => finite(r.rating)).filter(v => v !== null);
        const avgRating = ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
        const appearances = recent.filter(r => finite(r.minutes) > 0).length;
        const starts = recent.filter(r => r.starter === true).length;
        const info = { ...(recent[0] || {}), ...(squad.find(p => Number(p.player_id || p.id) === Number(id)) || {}) };
        const absent = injuries.some(item => Number(item.team) === Number(teamValue.id) && text(item.name) && text(info.name) && item.name.toLowerCase() === info.name.toLowerCase());
        const shots90 = per90(sum(recent, 'shots_total'), minutes);
        const shotsOn90 = per90(sum(recent, 'shots_on'), minutes);
        const keyPasses90 = per90(sum(recent, 'key_passes'), minutes);
        const goals90 = per90(sum(recent, 'goals'), minutes);
        const assists90 = per90(sum(recent, 'assists'), minutes);
        const dribbles90 = per90(sum(recent, 'dribbles'), minutes);
        const components = [
          { value: Math.min(100, appearances / Math.min(10, fixtureIds.length || 10) * 100), weight: .25 },
          { value: avgRating === null ? null : Math.max(0, Math.min(100, (avgRating - 5) / 3 * 100)), weight: .20 },
          { value: goals90 === null || assists90 === null ? null : Math.min(100, (goals90 * 1.5 + assists90) / 1.2 * 100), weight: .20 },
          { value: keyPasses90 === null ? null : Math.min(100, keyPasses90 / 3 * 100), weight: .15 },
          { value: shots90 === null ? null : Math.min(100, shots90 / 4 * 100), weight: .10 },
          { value: absent ? 0 : 100, weight: .10 }
        ].filter(c => c.value !== null);
        const weight = components.reduce((a, c) => a + c.weight, 0);
        const impact = appearances >= 3 && weight ? Math.round(components.reduce((a, c) => a + c.value * c.weight, 0) / weight) : null;
        return {
          id: Number(id), teamId: teamValue.id, team: teamValue.name, name: text(info.name) || `Joueur ${id}`,
          photo: text(info.photo), position: text(info.position), number: finite(info.number), impact,
          shots90, shotsOn90, keyPasses90, goals90, assists90, dribbles90, rating5: avgRating,
          ratings: ratings.map(round1), minutes, minutesRecent, appearances, starts, absent
        };
      }).filter(player => player.appearances > 0);
      return { players: players.sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1)), fixtureCount: fixtureIds.length, squadCovered: squad.length > 0, seasonScoped };
    };
    const homeData = side('home', home), awayData = side('away', away);
    const all = homeData.players.concat(awayData.players);
    const threats = metric => all.filter(p => p[metric] !== null).sort((a, b) => b[metric] - a[metric]).slice(0, 3);
    // Les onze joueurs les plus utilises recemment. Ce n'est PAS une
    // composition probable : nous n'avons ni la feuille de match, ni les
    // annonces d'avant-rencontre, ni la rotation prevue par l'entraineur.
    // C'est un classement d'usage passe, et rien de plus.
    const projected = data => data.fixtureCount >= 5 && data.squadCovered
      ? data.players.filter(p => !p.absent).slice().sort((a, b) => b.minutesRecent - a.minutesRecent).slice(0, 11)
      : data.players.slice().sort((a, b) => b.minutesRecent - a.minutesRecent).slice(0, 11);
    return {
      keyPlayers: all.filter(p => p.impact !== null).sort((a, b) => b.impact - a.impact).slice(0, 3),
      scoringThreat: scoringThreatRanking(all),
      home: homeData, away: awayData,
      projected: { home: projected(homeData), away: projected(awayData) },
      threats: { volume: threats('shots90'), creation: threats('keyPasses90'), finishing: threats('goals90') },
      available: all.length > 0
    };
  }

  // Totaux d'equipe reconstruits a partir des vraies moyennes/90 et
  // minutes recentes DEJA calculees par joueur (playerAnalytics) - jamais
  // une nouvelle collecte de donnees, juste une somme de ce qu'on a deja
  // pour estimer la part reelle d'un joueur absent dans la production de
  // son equipe (cf lib/insights.js#computeOutputShare).
  function teamOutputTotals(players) {
    const approx = (per90, minutes) => per90 !== null && minutes ? per90 * minutes / 90 : 0;
    return (players || []).reduce((acc, p) => ({
      goals: acc.goals + approx(p.goals90, p.minutesRecent),
      assists: acc.assists + approx(p.assists90, p.minutesRecent),
      keyPasses: acc.keyPasses + approx(p.keyPasses90, p.minutesRecent)
    }), { goals: 0, assists: 0, keyPasses: 0 });
  }
  // Points reels (W=3/D=1/L=0) tires des vrais resultats recents
  // (raw.form_home/away, deja du plus recent au plus ancien - on inverse
  // pour donner l'ordre chronologique attendu par computeFormTrend) -
  // jamais une note de forme fabriquee, uniquement les vrais resultats.
  function pointsFromResults(rows) {
    const value = { W: 3, D: 1, L: 0 };
    return (Array.isArray(rows) ? rows : []).slice().reverse().map(r => value[r.result]).filter(v => v !== undefined);
  }

  function buildMatchViewModel(raw) {
    raw = raw || {};
    const home = team(raw.home), away = team(raw.away);
    const modelAvailable = !!(display && display.hasReliableModelOutput(raw));
    const xg = modelAvailable && display ? display.expectedGoalsForDisplay(raw) : null;
    const dateParts = text(raw.date) ? raw.date.split(' ') : [];
    const injuries = uniqueInjuries(raw.injuries);
    const watch = [raw.hot_scorer_home, raw.hot_scorer_away, raw.hot_assist_home, raw.hot_assist_away]
      .filter(Boolean).filter((item, index, arr) => item.name && arr.findIndex(x => x.name === item.name) === index)
      .map(item => ({ name: item.name, photo: text(item.photo), value: finite(item.count) }));
    const recommendation = modelAvailable && text(raw.pari_rec) ? {
      market: raw.pari_rec, probability: round1(raw.model_probability), confidence: round1(raw.conf), reliability: text(raw.reliability && raw.reliability.label)
    } : null;
    const marketsCompared = (Array.isArray(raw.markets_compared) ? raw.markets_compared : []).slice(0, 4).map(item => ({
      id: text(item && item.id),
      market: text(item && (item.market || item.label)),
      probability: round1(item && item.probability),
      consensus: round1(item && item.consensus),
      edge: round1(item && item.edge)
    })).filter(item => item.market && item.probability !== null);
    const rawProjections = Array.isArray(raw.player_markets) ? raw.player_markets : (Array.isArray(raw.player_engine && raw.player_engine.projections) ? raw.player_engine.projections : []);
    const rawLineups = raw.lineups && typeof raw.lineups === 'object' ? raw.lineups : null;
    const playerData = playerAnalytics(raw, home, away, injuries);
    const matchupsList = matchups(raw, home.name, away.name);
    const matchupScores = insights ? insights.computeMatchup(raw.match_stats_home, raw.match_stats_away) : null;
    const keyInsights = insights ? insights.classifyKeyInsights({ matchups: matchupsList, keyAbsenceAlerts: raw.key_absences, marketsCompared, homeName: home.name, awayName: away.name }) : [];
    const marketsWatch = insights ? insights.topMarketsToWatch(marketsCompared, raw.data_quality_score) : [];
    const formNote = insights ? { home: insights.formMarginNote(raw.form_home), away: insights.formMarginNote(raw.form_away) } : { home: null, away: null };
    const formTrend = insights ? { home: insights.computeFormTrend(pointsFromResults(raw.form_home)), away: insights.computeFormTrend(pointsFromResults(raw.form_away)) } : { home: null, away: null };
    const teamTotals = { home: teamOutputTotals(playerData.home.players), away: teamOutputTotals(playerData.away.players) };
    return {
      id: raw.id,
      identity: {
        league: { name: text(raw.league) || 'Compétition', logo: raw.league_id ? `https://media.api-sports.io/football/leagues/${raw.league_id}.png` : null },
        date: dateParts[0] || null, time: dateParts[1] || null, home, away,
        standings: raw.classement ? { home: raw.classement.home || null, away: raw.classement.away || null } : null
      },
      model: {
        available: modelAvailable,
        unavailableReason: modelAvailable ? null : 'Les données disponibles ne permettent pas encore une analyse chiffrée fiable.',
        probabilities: modelAvailable && [raw.p1, raw.pn, raw.p2].every(v => finite(v) !== null) ? { home: round1(raw.p1), draw: round1(raw.pn), away: round1(raw.p2) } : null,
        expectedGoals: xg ? { home: finite(xg.home), away: finite(xg.away) } : null,
        scores: modelAvailable && Array.isArray(raw.mc_scores) ? raw.mc_scores.filter(s => text(s.score) && finite(s.pct) !== null).slice(0, 3).map(s => ({ score: s.score, probability: finite(s.pct) })) : [],
        recommendation,
        recommendedOdds: finite(raw.cote_rec),
        quality: finite(raw.data_quality_score),
        simulationCount: modelAvailable ? finite(raw.simulation_count) : null,
        sources: display ? display.sourceLabels(raw) : [],
        agreement: round1(raw.model_agreement),
        agreementLabel: text(raw.model_agreement),
        marketsCompared,
        iasharkScore: modelAvailable ? computeIasharkScore(raw, raw.reliability) : null,
        value: modelAvailable ? computeValue(marketsCompared, recommendation && recommendation.market) : null,
        monteCarloDistribution: modelAvailable ? monteCarloDistribution(raw.mc_scores, raw.simulation_count) : null
      },
      editorial: {
        reading: text(raw.verdict_shark) || text(raw.analyse_card) || text(raw.contexte),
        decisiveFactor: text(raw.facteur_x) || text(raw.conseil_public),
        reasons: Array.isArray(raw.decision_factors) ? raw.decision_factors.filter(text) : (Array.isArray(raw.key_absences) ? raw.key_absences.filter(text) : []),
        risk: text(raw.risk_principal) || text(raw.risque),
        // riskCode : le CODE deterministe reel (FAIBLE/MODERE/ELEVE, cf
        // lib/decision.js#computeRiskLabel), distinct de `risk` ci-dessus qui
        // est un TEXTE descriptif (ex: "joueur cle absent") - jamais la meme
        // valeur, deux champs pipeline differents (raw.risque vs
        // raw.risk_principal). Utilise pour le badge risque du Signal IASHARK.
        riskCode: ['FAIBLE', 'MODERE', 'ELEVE'].includes(raw.risque) ? raw.risque : null,
        scenario: text(raw.scenario) || (raw.scenario && typeof raw.scenario === 'object' ? [raw.scenario.phase1, raw.scenario.phase2, raw.scenario.phase3].filter(text).join(' ') || null : null),
        scenario15: Array.isArray(raw.scenario_15min) ? raw.scenario_15min : [],
        goalTiming: goalTiming(raw)
      },
      conditions: { venue: text(raw.stade && raw.stade.nom), weather: display ? display.weatherForDisplay(raw.stade) : null },
      referee: raw.arbitre && text(raw.arbitre.nom) ? {
        name: text(raw.arbitre.nom),
        cardsPerMatch: finite(raw.arbitre.cartons ?? raw.arbitre.cartons_match),
        penaltiesPerMatch: finite(raw.arbitre.penaltys ?? raw.arbitre.penalties_match),
        matches: finite(raw.arbitre.matchs ?? raw.arbitre.games)
      } : null,
      comparison: comparison(raw),
      h2h: headToHead(raw.h2h),
      dataOverview: {
        home: raw.match_stats_home || {}, away: raw.match_stats_away || {},
        goalsHome: finite(raw.events_home && raw.events_home.goals_avg), goalsAway: finite(raw.events_away && raw.events_away.goals_avg)
      },
      decisionRadar: {
        home: { form: text(raw.forme_h), attack: finite(raw.crit_home && raw.crit_home.att), defence: finite(raw.crit_home && raw.crit_home.def), momentum: finite(raw.crit_home && raw.crit_home.forme) },
        away: { form: text(raw.forme_a), attack: finite(raw.crit_away && raw.crit_away.att), defence: finite(raw.crit_away && raw.crit_away.def), momentum: finite(raw.crit_away && raw.crit_away.forme) }
      },
      shotStats: shotStats(raw),
      patterns: display && display.hasReliableEventPatterns(raw.events_home, raw.events_away) ? { home: raw.events_home, away: raw.events_away } : null,
      momentum: display && display.hasReliableEventPatterns(raw.events_home, raw.events_away) ? momentumSeries(raw.events_home, raw.events_away) : null,
      matchups: matchupsList,
      matchupScores,
      keyInsights,
      marketsWatch,
      formNote,
      formTrend,
      players: {
        lineups: rawLineups,
        formations: rawLineups ? {
          home: formationRows(rawLineups.home && rawLineups.home.startXI),
          away: formationRows(rawLineups.away && rawLineups.away.startXI)
        } : { home: null, away: null },
        absences: {
          home: absencesWithImpact(injuries.filter(x => x.team === home.id), playerData.home.players, teamTotals.home),
          away: absencesWithImpact(injuries.filter(x => x.team === away.id), playerData.away.players, teamTotals.away)
        },
        watch,
        projections: rawProjections.map(projection),
        impactRanking: playerData.keyPlayers.length ? playerData.keyPlayers : playerImpactRanking(rawProjections).slice(0, 3),
        scoringThreat: withScoringProbability(playerData.scoringThreat),
        analytics: playerData,
        lineupMode: rawLineups && ((rawLineups.home && rawLineups.home.startXI && rawLineups.home.startXI.length) || (rawLineups.away && rawLineups.away.startXI && rawLineups.away.startXI.length)) ? 'OFFICIAL' : (playerData.available ? 'PROJECTED' : 'HIDDEN'),
        injuriesFetchOk: raw.injuries_fetch_ok === true
      }
    };
  }
  // Ajoute la probabilite de marquer (Poisson reel, cf lib/insights.js) a
  // chaque candidat buteur deja retenu - jamais une nouvelle selection.
  function withScoringProbability(list) {
    return (list || []).map(p => {
      // Minutes attendues = minutes reellement jouees en moyenne par match
      // dispute. C'est une mesure, pas une prevision.
      //
      // Avant, ce calcul passait par une "probabilite d'etre titulaire"
      // (retiree le 04/09/2026) : une frequence de titularisations passees
      // multipliee par 90. Elle etait presentee comme une prevision pour le
      // prochain match alors qu'elle n'en savait rien - ni composition, ni
      // rotation, ni blessure de derniere minute. La moyenne de minutes
      // reelles dit la meme chose sans rien pretendre.
      const expectedMinutes = p.minutesRecent && p.appearances
        ? Math.round(p.minutesRecent / p.appearances)
        : null;
      const sp = insights ? insights.computeScoringProbability(p.goals90, expectedMinutes) : null;
      return sp ? { ...p, scoringProbability: sp.probability } : p;
    });
  }
  // Associe chaque absence a ses vraies stats recentes si le joueur est
  // retrouve dans l'effectif analyse (meme correspondance par nom que le
  // flag `absent` de playerAnalytics) pour estimer sa part reelle de
  // production - jamais un chiffre invente si le joueur n'est pas
  // retrouve (ex. jamais titularise recemment, aucune donnee a exploiter).
  function absencesWithImpact(items, teamPlayers, teamTotals) {
    return items.map(item => {
      const found = (teamPlayers || []).find(p => text(p.name) && item.name && p.name.toLowerCase() === item.name.toLowerCase());
      const share = found && insights ? insights.computeOutputShare({ goals: found.goals90 * (found.minutesRecent || 0) / 90, assists: found.assists90 * (found.minutesRecent || 0) / 90, keyPasses: found.keyPasses90 * (found.minutesRecent || 0) / 90 }, teamTotals) : null;
      return { ...item, outputShare: share };
    });
  }
  return { buildMatchViewModel };
});
