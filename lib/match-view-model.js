(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./display-data') : root.IasharkDisplayData,
    typeof require === 'function' ? require('./insights') : root.IasharkInsights,
    typeof require === 'function' ? require('./market-labels') : root.IasharkMarketLabels
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IasharkMatchViewModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (display, insights, marketLabels) {
  'use strict';

  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const round1 = value => finite(value) === null ? null : Math.round(finite(value) * 10) / 10;
  // Valeur absente (null, undefined, '') : null, jamais 0 (Number(null) === 0).
  const round1Present = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ? null : round1(value);
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
    // Nombre de matchs de chaque equipe derriere ces buts (compteur du
    // pipeline, events_<cote>.games) : jamais devine, null s'il manque.
    const games = {
      home: finite(raw.events_home && raw.events_home.games),
      away: finite(raw.events_away && raw.events_away.games)
    };
    return { slots, totalGoals: total, peak: pic, games };
  }

  // Donnees reelles qui n'apparaissent NULLE PART ailleurs dans la page, et
  // qui alimentent la FAQ. La consigne est explicite : la FAQ ne doit pas
  // reposer les questions dont la reponse est deja affichee.
  //
  // Cartons, buts attendus de saison, precision de passe et tranches
  // d'encaissement sont releves par le pipeline mais n'etaient utilises par
  // aucune carte.
  function exclusiveFacts(raw) {
    const eh = raw.events_home || {}, ea = raw.events_away || {};
    const sh = raw.match_stats_home || {}, sa = raw.match_stats_away || {};
    const paire = (a, b) => (finite(a) !== null && finite(b) !== null ? { home: finite(a), away: finite(b) } : null);
    // Part des buts ENCAISSES sur les deux dernieres tranches.
    const finDeMatch = (ev) => {
      const s2 = ev && ev.slots_against;
      if (!Array.isArray(s2) || s2.length < 6) return null;
      const total = s2.reduce((t, x) => t + (finite(x && x.n) || 0), 0);
      if (total < 6) return null;
      const fin = s2.slice(-2).reduce((t, x) => t + (finite(x && x.n) || 0), 0);
      return Math.round((fin / total) * 100);
    };
    return {
      cartons: paire(eh.yellow_per_game, ea.yellow_per_game),
      rouges: paire(eh.red_cards, ea.red_cards),
      xg: paire(sh.xg, sa.xg),
      xga: paire(sh.xga, sa.xga),
      passes: paire(sh.passes_pct, sa.passes_pct),
      encaisseFin: paire(finDeMatch(eh), finDeMatch(ea))
    };
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
        // key/vars : memes faits sous forme structuree, pour que l'affichage
        // puisse rediger la phrase dans la langue de la page (title/text
        // restent le texte francais historique).
        out.push({ title: `${homeName} au volume de tirs`, text: `${homeName} tente ${round1(homeFor)} tirs en moyenne, ${awayName} en concède ${round1(awayAllowed)} — écart réel de ${round1(Math.abs(homeFor - awayAllowed))} tirs.`,
          key: 'shots_volume', vars: { home: homeName, away: awayName, homeFor: round1(homeFor), awayAllowed: round1(awayAllowed), gap: round1(Math.abs(homeFor - awayAllowed)) } });
      }
    }
    if (finite(as.shots_on) !== null && finite(hs.shots_on) !== null) {
      const awayOnFor = finite(as.shots_on), homeOnAllowed = finite(hs.shots_on);
      if (awayOnFor && homeOnAllowed && Math.abs(awayOnFor - homeOnAllowed) / Math.max(awayOnFor, homeOnAllowed) >= MATCHUP_THRESHOLD) {
        out.push({ title: `${awayName} à la précision`, text: `${awayName} cadre ${round1(awayOnFor)} tirs en moyenne à l'extérieur, ${homeName} en concède ${round1(homeOnAllowed)} à domicile.`,
          key: 'shots_accuracy', vars: { home: homeName, away: awayName, awayOnFor: round1(awayOnFor), homeOnAllowed: round1(homeOnAllowed) } });
      }
    }
    if (finite(hs.possession) !== null && finite(as.possession) !== null && Math.abs(finite(hs.possession) - finite(as.possession)) >= 15) {
      const leader = finite(hs.possession) > finite(as.possession) ? homeName : awayName;
      out.push({ title: 'Contrôle du ballon', text: `Écart de possession réel et net (${round1(hs.possession)}% vs ${round1(as.possession)}%) en faveur de ${leader}.`,
        key: 'possession', vars: { homePct: round1(hs.possession), awayPct: round1(as.possession), leader } });
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

  // Temps de jeu minimal (une mi-temps sur la saison en cours) sous lequel la
  // carte buteur signale un echantillon fragile.
  const THREAT_MIN_MINUTES = 45;

  // Buteur le plus probable AVANT les compositions (18/09/2026) : calcul
  // unique dans lib/insights.js#scorerModel (methode, reglage et verification
  // hors echantillon decrits la-bas). Il remplace le classement du 02/09/2026,
  // qui ne regardait pas si le joueur etait titulaire (un remplacant a 1 but
  // en 87 minutes passait devant tous les titulaires, un attaquant titulaire
  // sans but tombait a 0 %). Seuls les titulaires probables sont mis en avant ;
  // l'estimation de titularisation sert a ce tri et n'est jamais publiee
  // (decision du 04/09/2026) : la carte montre le nombre REEL de
  // titularisations sur les derniers matchs de l'equipe (startsLast).
  // Les chiffres affiches a cote (buts/90, tirs cadres/90, matchs joues)
  // restent ceux de la saison en cours (playerAnalytics), comme le reste de
  // la page ; a defaut (aucune minute cette saison), ceux du calcul.
  function prelineupScorers(raw, home, away, injuries, playerData, modelAvailable) {
    const model = insights && insights.scorerModel;
    if (!model) return [];
    const histories = raw.player_history || {};
    const squads = raw.current_squads || {};
    // Buts attendus de chaque equipe selon le moteur (integre la defense
    // adverse), seulement quand sa sortie est fiable ; sinon le calcul se
    // rabat sur la moyenne recente de l'equipe.
    const lambdaOf = value => modelAvailable && finite(value) !== null && finite(value) > 0 ? finite(value) : null;
    const side = (key, teamValue, lambda) => ({
      rows: Array.isArray(histories[key]) ? histories[key] : [],
      teamId: teamValue.id,
      lambda,
      absentNames: injuries.filter(item => Number(item.team) === Number(teamValue.id)).map(item => item.name),
      currentIds: (Array.isArray(squads[key]) ? squads[key] : []).map(p => Number(p && (p.player_id != null ? p.player_id : p.id))).filter(Number.isFinite)
    });
    let ranked;
    try {
      ranked = model.rankMatch({ home: side('home', home, lambdaOf(raw.lambda_h)), away: side('away', away, lambdaOf(raw.lambda_a)) });
    } catch (error) {
      return [];
    }
    const seasonStats = new Map(playerData.home.players.concat(playerData.away.players).map(p => [p.id, p]));
    return ranked.shown.map(c => {
      const s = seasonStats.get(c.id) || null;
      const teamValue = Number(c.teamId) === Number(home.id) ? home : away;
      return {
        ...(s || { goals90: null, shotsOn90: null, assists90: null, rating5: null, number: null }),
        id: c.id, teamId: teamValue.id, team: teamValue.name,
        name: (s && s.name) || text(c.name) || `Joueur ${c.id}`,
        photo: (s && s.photo) || text(c.photo),
        position: (s && s.position) || text(c.rawPosition),
        minutes: s ? s.minutes : Math.round(c.minutes),
        appearances: s ? s.appearances : c.appearances,
        starts: s ? s.starts : c.starts,
        scoringProbability: c.displayProbability,
        startsLast: c.startsLast,
        teamMatchesLast: c.teamMatchesLast,
        expectedMinutes: Math.round(c.expectedMinutes),
        expectedGoals90: Math.round(c.rate90 * 100) / 100,
        thinSample: !s || (finite(s.minutes) || 0) < THREAT_MIN_MINUTES
      };
    });
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

  // Probabilite de marche sans marge a partir des DEUX cotes d'un meme
  // marche (plus/moins, oui/non) : (1/o) / (1/o + 1/u). Calcul standard, sur
  // de vraies cotes ; une seule cote connue -> null, jamais devine.
  function demargined(odds, opposite) {
    const o = finite(odds), u = finite(opposite);
    if (o === null || u === null || o <= 1 || u <= 1) return null;
    return round1((1 / o) / (1 / o + 1 / u) * 100);
  }
  const sameFamily = (a, b) => a && b && a.family !== 'other' && a.family === b.family && a.side === b.side && a.direction === b.direction && (a.line === b.line || (a.line == null && b.line == null));

  // Tableau "modele / marche / ecart" : 1N2 (consensus de marche sans marge
  // publie par le pipeline), plus de 2,5 buts et les deux equipes marquent
  // (probabilite modele + cotes des deux cotes), puis les marches compares
  // par le pipeline (markets_compared, deja calcules). Le marche recommande
  // est signale par sa FAMILLE (lib/market-labels.js#marketFamily), pas par
  // son texte : "Exterieur moins de 1.5 but" et "away-team-under-15" sont le
  // meme pari. Aucune ligne sans probabilite modele.
  // Reference du pari retenu (19/09/2026) : probabilite juste du bookmaker,
  // marge retiree, portee par sa ligne de markets_compared (le pipeline l'y
  // place en tete) ; a defaut 1 / cote, comme avant.
  function recommendedReference(raw) {
    const row = (Array.isArray(raw.markets_compared) ? raw.markets_compared : []).find(m => m && raw.market_id && m.id === raw.market_id);
    const fair = row ? round1Present(row.consensus) : null;
    if (fair !== null && fair > 0 && fair < 100) return fair;
    const odds = finite(raw.cote_rec);
    return odds !== null && odds > 1 ? round1(100 / odds) : null;
  }
  function marketTable(raw, marketsCompared, recommendation) {
    const fam = marketLabels && marketLabels.marketFamily ? marketLabels.marketFamily : () => ({ family: 'other' });
    // Donnee ABSENTE (null, undefined, '') = non disponible, jamais 0 :
    // finite(null) vaut 0 (Number(null) === 0), d'ou le faux « Marche 0 % » et
    // une fausse value quand le consensus de marche manque (16/09/2026).
    const absent = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    const prob = v => absent(v) ? null : round1(v);
    const cote = v => absent(v) ? null : finite(v);
    const rows = [];
    const add = (row) => {
      if (row.model === null) return;
      row.edge = row.edge != null ? row.edge : (row.market !== null ? round1(row.model - row.market) : null);
      row.family = fam(row.id || row.label);
      const i = rows.findIndex(r => sameFamily(r.family, row.family));
      if (i === -1) rows.push(row);
      else rows[i] = { ...rows[i], ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined)) };
    };
    add({ id: 'home-win', label: 'Victoire domicile', group: 'result', model: prob(raw.p1), market: prob(raw.market_consensus_p1), odds: cote(raw.c1) });
    add({ id: 'draw', label: 'Match nul', group: 'result', model: prob(raw.pn), market: prob(raw.market_consensus_pN), odds: cote(raw.cn) });
    add({ id: 'away-win', label: 'Victoire exterieur', group: 'result', model: prob(raw.p2), market: prob(raw.market_consensus_p2), odds: cote(raw.c2) });
    add({ id: 'over-25', label: 'Over 2.5', group: 'goals', model: prob(raw.po25), market: demargined(raw.co25, raw.cu25), odds: cote(raw.co25) });
    add({ id: 'btts-yes', label: 'BTTS Oui', group: 'goals', model: prob(raw.btts), market: demargined(raw.cbtts, raw.cbtts_non), odds: cote(raw.cbtts) });
    (marketsCompared || []).forEach(m => {
      const f = fam(m.id || m.market);
      const group = ['result', 'dc', 'dnb', 'handicap'].includes(f.family) ? 'result' : ['shots', 'shots_on', 'corners', 'cards'].includes(f.family) ? 'stats' : ['total', 'team_goals', 'btts', 'fh', 'win_goals', 'clean_sheet', 'win_to_nil'].includes(f.family) ? 'goals' : 'other';
      add({ id: m.id, label: m.market, group, model: absent(m.probability) ? null : m.probability, market: absent(m.consensus) ? null : m.consensus, edge: absent(m.edge) || absent(m.consensus) ? null : m.edge, odds: null });
    });
    if (recommendation) {
      const rf = fam(recommendation.market);
      const odds = finite(raw.cote_rec);
      const implied = recommendedReference(raw);
      const i = rows.findIndex(r => sameFamily(r.family, rf) || r.label === recommendation.market);
      const group = ['result', 'dc', 'dnb', 'handicap'].includes(rf.family) ? 'result' : ['shots', 'shots_on', 'corners', 'cards'].includes(rf.family) ? 'stats' : rf.family === 'other' ? 'other' : 'goals';
      if (i !== -1) {
        rows[i].recommended = true;
        if (odds !== null) rows[i].odds = odds;
        // Memes chiffres que la carte du pari retenu.
        if (recommendation.probability !== null) {
          rows[i].model = recommendation.probability;
          if (implied !== null) rows[i].market = implied;
          rows[i].edge = rows[i].market !== null && rows[i].market !== undefined ? round1(rows[i].model - rows[i].market) : null;
        }
      } else if (recommendation.probability !== null) {
        rows.push({ id: null, label: recommendation.market, group, model: recommendation.probability, market: implied, edge: implied !== null ? round1(recommendation.probability - implied) : null, odds, family: rf, recommended: true });
      }
    }
    return rows;
  }

  // Forme : dernieres issues reelles (du plus recent au plus ancien).
  function formRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, 5).filter(r => r && ['W', 'D', 'L'].includes(r.result)).map(r => ({
      result: r.result, score: text(r.score), opponent: text(r.opponent), home: r.home === true, date: text(r.d)
    }));
  }

  // Cotes de marche publiques disponibles pour ce match : sert uniquement au
  // teaser des murs d'acces ("14 cotes comparees au modele"). Des cotes de
  // bookmaker, jamais une probabilite du modele ni le pari retenu.
  const PUBLIC_ODDS_FIELDS = ['c1', 'cn', 'c2', 'dc1x', 'dc2x', 'dc12', 'co15', 'co25', 'cu25', 'co35', 'cbtts', 'cbtts_non', 'ah_dom', 'ah_ext'];

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
    // raw.pari_rec n'est plus renseigne par le moteur deterministe (voir
    // lib/decision.js#pickMarketDeterministic), remplace par
    // market_id/marche. marketIdToEngineLabel() reconstruit un libelle au
    // format que marcheFr()/marketLabelFr() (match-page.js) savent deja
    // parser, pour ne pas les toucher. Sans ce repli, un match dont le
    // pipeline a bien choisi un marche affichait "Analyse en cours" comme
    // s'il n'y avait aucune analyse.
    const marketLabel = text(raw.pari_rec) || (raw.market_id && marketLabels ? marketLabels.marketIdToEngineLabel(raw.market_id) : null);
    const recommendation = modelAvailable && text(marketLabel) ? {
      market: marketLabel, probability: round1(raw.model_probability), confidence: raw.conf == null || raw.conf === '' ? null : round1(raw.conf), /* conf premium : absent = aucune note, jamais 0/10 */ reliability: text(raw.reliability && raw.reliability.label)
    } : null;
    const marketsCompared = (Array.isArray(raw.markets_compared) ? raw.markets_compared : []).slice(0, 8).map(item => ({
      id: text(item && item.id),
      market: text(item && (item.market || item.label)),
      probability: round1Present(item && item.probability),
      consensus: round1Present(item && item.consensus),
      edge: round1Present(item && item.edge)
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
    // Signal IASHARK : famille du pari, raisons et risques (lib/insights.js),
    // uniquement quand un pari est reellement recommande.
    const absenceNames = side => injuries.filter(x => x.team === (side === 'home' ? home.id : away.id)).map(x => x.name);
    const recFamily = recommendation && marketLabels && marketLabels.marketFamily ? marketLabels.marketFamily(recommendation.market) : null;
    const recOdds = finite(raw.cote_rec);
    const recImplied = recommendation ? recommendedReference(raw) : (recOdds !== null && recOdds > 1 ? round1(100 / recOdds) : null);
    const recEdge = recommendation && recommendation.probability !== null && recImplied !== null ? round1(recommendation.probability - recImplied) : null;
    const form = { home: formRows(raw.form_home), away: formRows(raw.form_away) };
    const signalReasons = recommendation && insights && insights.signalReasons ? insights.signalReasons({
      family: recFamily, homeName: home.name, awayName: away.name, expectedGoals: xg,
      eventsHome: raw.events_home, eventsAway: raw.events_away, statsHome: raw.match_stats_home, statsAway: raw.match_stats_away,
      h2h: (headToHead(raw.h2h) || []).map(r => ({ home: r.home, away: r.away, score: r.score })),
      form: { home: form.home.map(r => r.result), away: form.away.map(r => r.result) },
      absences: { home: absenceNames('home'), away: absenceNames('away') }
    }) : [];
    const signalRisks = recommendation && insights && insights.signalRisks ? insights.signalRisks({
      family: recFamily, edge: recEdge, odds: recOdds, reliability: raw.reliability, homeName: home.name, awayName: away.name,
      absences: { home: absenceNames('home'), away: absenceNames('away') }
    }) : [];
    return {
      id: raw.id,
      form,
      // Teaser des murs d'acces : AUCUNE donnee du modele. Le nombre de cotes
      // de bookmaker disponibles et le niveau de fiabilite publie.
      teaser: {
        oddsCount: PUBLIC_ODDS_FIELDS.filter(k => finite(raw[k]) !== null).length,
        reliability: insights && insights.reliabilityInfo ? insights.reliabilityInfo(raw.reliability) : null
      },
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
        recommendedFamily: recFamily,
        recommendedImplied: recImplied,
        recommendedEdge: recEdge,
        reliabilityInfo: modelAvailable && insights && insights.reliabilityInfo ? insights.reliabilityInfo(raw.reliability) : null,
        marketTable: modelAvailable ? marketTable(raw, marketsCompared, recommendation) : [],
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
        // Traductions validees par le pipeline (<champ>_i18n) du texte
        // francais REELLEMENT retenu ci-dessus - jamais celles d'un autre
        // champ. A lire via localizedNarrative() (es-mx -> es, sinon rien).
        readingI18n: text(raw.verdict_shark) ? i18nMap(raw.verdict_shark_i18n) : text(raw.analyse_card) ? i18nMap(raw.analyse_card_i18n) : text(raw.contexte) ? i18nMap(raw.contexte_i18n) : null,
        decisiveFactorI18n: text(raw.facteur_x) ? i18nMap(raw.facteur_x_i18n) : text(raw.conseil_public) ? i18nMap(raw.conseil_public_i18n) : null,
        reasons:Array.isArray(raw.decision_factors) ? raw.decision_factors.filter(text) : (Array.isArray(raw.key_absences) ? raw.key_absences.filter(text) : []),
        signalReasons,
        signalRisks,
        risk: text(raw.risk_principal) || text(raw.risque),
        // riskCode : le CODE deterministe reel (FAIBLE/MODERE/ELEVE, cf
        // lib/decision.js#computeRiskLabel), distinct de `risk` ci-dessus qui
        // est un TEXTE descriptif (ex: "joueur cle absent") - jamais la meme
        // valeur, deux champs pipeline differents (raw.risque vs
        // raw.risk_principal). Utilise pour le badge risque du Signal IASHARK.
        riskCode: ['FAIBLE', 'MODERE', 'ELEVE'].includes(raw.risque) ? raw.risque : null,
        scenario: text(raw.scenario) || (raw.scenario && typeof raw.scenario === 'object' ? [raw.scenario.phase1, raw.scenario.phase2, raw.scenario.phase3].filter(text).join(' ') || null : null),
        scenarioI18n: text(raw.scenario) ? null : scenarioI18n(raw.scenario_i18n),
        scenario15: Array.isArray(raw.scenario_15min) ? raw.scenario_15min : [],
        goalTiming: goalTiming(raw),
        exclusiveFacts: exclusiveFacts(raw)
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
        scoringThreat: prelineupScorers(raw, home, away, injuries, playerData, modelAvailable),
        analytics: playerData,
        lineupMode: rawLineups && ((rawLineups.home && rawLineups.home.startXI && rawLineups.home.startXI.length) || (rawLineups.away && rawLineups.away.startXI && rawLineups.away.startXI.length)) ? 'OFFICIAL' : (playerData.available ? 'PROJECTED' : 'HIDDEN'),
        injuriesFetchOk: raw.injuries_fetch_ok === true
      }
    };
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
  // Textes rediges par le pipeline : le francais d'origine, plus ses
  // traductions validees (<champ>_i18n = {en, es, "es-mx", de, it, pt}, voir
  // lib/narrative-i18n.js). Page FR -> texte francais. Autre langue -> sa
  // traduction ; es-mx retombe sur es ; sinon null (le bloc est masque).
  // Jamais de francais sur une page non francaise, jamais de texte invente.
  function i18nMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }
  function scenarioI18n(value) {
    const map = i18nMap(value);
    if (!map) return null;
    const out = {};
    Object.keys(map).forEach(locale => {
      const s = map[locale];
      const joined = typeof s === 'string' ? text(s) : (i18nMap(s) ? [s.phase1, s.phase2, s.phase3].filter(text).join(' ') || null : null);
      if (joined) out[locale] = joined;
    });
    return Object.keys(out).length ? out : null;
  }
  function localizedNarrative(frText, i18n, locale) {
    const fr = text(frText);
    if (!fr) return null;
    if (!locale || locale === 'fr') return fr;
    const map = i18nMap(i18n);
    if (!map) return null;
    const own = text(map[locale]);
    if (own) return own;
    return locale === 'es-mx' ? text(map.es) : null;
  }
  return { buildMatchViewModel, localizedNarrative };
});
