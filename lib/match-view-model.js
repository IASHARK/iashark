(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./display-data') : root.IasharkDisplayData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IasharkMatchViewModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (display) {
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

  function comparison(raw) {
    if (!display || !display.hasReliableCriteria(raw.crit_home, raw.crit_away)) return null;
    const hs = raw.match_stats_home || {}, as = raw.match_stats_away || {};
    const candidates = [
      ['Buts marqués', raw.events_home && raw.events_home.goals_avg, raw.events_away && raw.events_away.goals_avg],
      ['Buts concédés', raw.events_home && raw.events_home.conceded_avg, raw.events_away && raw.events_away.conceded_avg],
      ['Tirs', hs.shots_total, as.shots_total], ['Tirs cadrés', hs.shots_on, as.shots_on], ['Possession', hs.possession, as.possession],
      ['Corners', hs.corners, as.corners], ['Fautes', hs.fouls, as.fouls], ['Hors-jeu', hs.offsides, as.offsides], ['Arrêts', hs.saves, as.saves]
    ];
    const rows = candidates.map(([label, h, a]) => ({ label, home: finite(h), away: finite(a) })).filter(row => row.home !== null && row.away !== null);
    return rows.length ? { rows } : null;
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

  // Value/EV : UNIQUEMENT si le pipeline a réellement comparé le marché
  // retenu à une cote réelle du même marché exact (markets_compared[0],
  // déjà déterministe côté pipeline - lib/decision.js). Jamais recalculé ni
  // approximé ici : si l'edge n'existe pas dans les données, la Value reste
  // indisponible plutôt que d'être devinée.
  function computeValue(marketsCompared) {
    const primary = marketsCompared && marketsCompared[0];
    return primary && primary.edge !== null ? primary.edge : null;
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
  function scoringThreatRanking(allPlayers) {
    return allPlayers
      .filter(p => p.appearances >= 3 && !p.absent && ((p.goals90 || 0) > 0 || (p.shotsOn90 || 0) > 0))
      .map(p => ({ ...p, threatScore: Math.round(((p.goals90 || 0) * 1.5 + (p.shotsOn90 || 0) * 0.6) * 100) / 100 }))
      .sort((a, b) => b.threatScore - a.threatScore)
      .slice(0, 4);
  }

  function playerAnalytics(raw, home, away, injuries) {
    const histories = raw.player_history || {};
    const squads = raw.current_squads || {};
    const side = (key, teamValue) => {
      const squad = Array.isArray(squads[key]) ? squads[key] : [];
      const currentIds = new Set(squad.map(p => Number(p.player_id || p.id)).filter(Number.isFinite));
      const rows = (Array.isArray(histories[key]) ? histories[key] : []).filter(row =>
        Number(row.team_id) === Number(teamValue.id) && (!currentIds.size || currentIds.has(Number(row.player_id)))
      );
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
        const startProbability = fixtureIds.length >= 5 ? Math.round(((starts + 1) / (fixtureIds.length + 2)) * 100) : null;
        return {
          id: Number(id), teamId: teamValue.id, team: teamValue.name, name: text(info.name) || `Joueur ${id}`,
          photo: text(info.photo), position: text(info.position), number: finite(info.number), impact,
          shots90, shotsOn90, keyPasses90, goals90, assists90, dribbles90, rating5: avgRating,
          ratings: ratings.map(round1), minutesRecent, appearances, starts, startProbability, absent
        };
      }).filter(player => player.appearances > 0);
      return { players: players.sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1)), fixtureCount: fixtureIds.length, squadCovered: squad.length > 0 };
    };
    const homeData = side('home', home), awayData = side('away', away);
    const all = homeData.players.concat(awayData.players);
    const threats = metric => all.filter(p => p[metric] !== null).sort((a, b) => b[metric] - a[metric]).slice(0, 3);
    const projected = data => data.fixtureCount >= 5 && data.squadCovered
      ? data.players.filter(p => !p.absent).slice().sort((a, b) => (b.startProbability ?? -1) - (a.startProbability ?? -1) || b.minutesRecent - a.minutesRecent).slice(0, 11)
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
        value: modelAvailable ? computeValue(marketsCompared) : null,
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
        scenario15: Array.isArray(raw.scenario_15min) ? raw.scenario_15min : []
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
      matchups: matchups(raw, home.name, away.name),
      players: {
        lineups: rawLineups,
        formations: rawLineups ? {
          home: formationRows(rawLineups.home && rawLineups.home.startXI),
          away: formationRows(rawLineups.away && rawLineups.away.startXI)
        } : { home: null, away: null },
        absences: { home: injuries.filter(x => x.team === home.id), away: injuries.filter(x => x.team === away.id) },
        watch,
        projections: rawProjections.map(projection),
        impactRanking: playerData.keyPlayers.length ? playerData.keyPlayers : playerImpactRanking(rawProjections).slice(0, 3),
        scoringThreat: playerData.scoringThreat,
        analytics: playerData,
        lineupMode: rawLineups && ((rawLineups.home && rawLineups.home.startXI && rawLineups.home.startXI.length) || (rawLineups.away && rawLineups.away.startXI && rawLineups.away.startXI.length)) ? 'OFFICIAL' : (playerData.available ? 'PROJECTED' : 'HIDDEN'),
        injuriesFetchOk: raw.injuries_fetch_ok === true
      }
    };
  }
  return { buildMatchViewModel };
});
