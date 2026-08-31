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

  function comparison(raw) {
    if (!display || !display.hasReliableCriteria(raw.crit_home, raw.crit_away)) return null;
    const hs = raw.match_stats_home || {}, as = raw.match_stats_away || {};
    const candidates = [
      ['Buts marqués', raw.events_home && raw.events_home.goals_avg, raw.events_away && raw.events_away.goals_avg],
      ['Buts concédés', raw.events_home && raw.events_home.conceded_avg, raw.events_away && raw.events_away.conceded_avg],
      ['Tirs', hs.shots_total, as.shots_total], ['Tirs cadrés', hs.shots_on, as.shots_on], ['Possession', hs.possession, as.possession]
    ];
    const rows = candidates.map(([label, h, a]) => ({ label, home: finite(h), away: finite(a) })).filter(row => row.home !== null && row.away !== null);
    return rows.length ? { rows } : null;
  }

  function projection(item) {
    const marketLabels = { ANYTIME_GOALSCORER: 'Buteur', PLAYER_SHOTS: 'Tirs', PLAYER_SHOTS_ON_TARGET: 'Tirs cadrés' };
    const statusLabels = { confirmed_starter: 'Titulaire confirmé', confirmed_bench: 'Remplaçant confirmé' };
    const qualityLabels = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' };
    const rawProbability = finite(item && item.output && item.output.probability);
    return { player: text(item && item.player_name) || 'Joueur', market: marketLabels[item && item.market] || text(item && item.market) || 'Marché joueur', status: statusLabels[item && item.lineup_status] || text(item && item.lineup_status) || 'À confirmer', minutes: finite(item && item.expected_minutes), probability: rawProbability === null ? null : round1(rawProbability * 100), quality: qualityLabels[item && item.data_quality] || text(item && item.data_quality) || '—' };
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
    return {
      id: raw.id,
      identity: {
        league: { name: text(raw.league) || 'Compétition', logo: raw.league_id ? `https://media.api-sports.io/football/leagues/${raw.league_id}.png` : null },
        date: dateParts[0] || null, time: dateParts[1] || null, home, away
      },
      model: {
        available: modelAvailable,
        unavailableReason: modelAvailable ? null : 'Les données disponibles ne permettent pas encore une analyse chiffrée fiable.',
        probabilities: modelAvailable && [raw.p1, raw.pn, raw.p2].every(v => finite(v) !== null) ? { home: round1(raw.p1), draw: round1(raw.pn), away: round1(raw.p2) } : null,
        expectedGoals: xg ? { home: finite(xg.home), away: finite(xg.away) } : null,
        scores: modelAvailable && Array.isArray(raw.mc_scores) ? raw.mc_scores.filter(s => text(s.score) && finite(s.pct) !== null).slice(0, 3).map(s => ({ score: s.score, probability: finite(s.pct) })) : [],
        recommendation,
        quality: finite(raw.data_quality_score),
        simulationCount: modelAvailable ? finite(raw.simulation_count) : null,
        sources: display ? display.sourceLabels(raw) : [],
        agreement: round1(raw.model_agreement),
        agreementLabel: text(raw.model_agreement),
        marketsCompared: (Array.isArray(raw.markets_compared) ? raw.markets_compared : []).slice(0, 4).map(item => ({
          id: text(item && item.id),
          market: text(item && (item.market || item.label)),
          probability: round1(item && item.probability),
          consensus: round1(item && item.consensus),
          edge: round1(item && item.edge)
        })).filter(item => item.market && item.probability !== null)
      },
      editorial: {
        reading: text(raw.verdict_shark) || text(raw.analyse_card) || text(raw.contexte),
        decisiveFactor: text(raw.facteur_x) || text(raw.conseil_public),
        reasons: Array.isArray(raw.decision_factors) ? raw.decision_factors.filter(text) : (Array.isArray(raw.key_absences) ? raw.key_absences.filter(text) : []),
        risk: text(raw.risk_principal) || text(raw.risque),
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
      patterns: display && display.hasReliableEventPatterns(raw.events_home, raw.events_away) ? { home: raw.events_home, away: raw.events_away } : null,
      players: {
        lineups: raw.lineups && typeof raw.lineups === 'object' ? raw.lineups : null,
        absences: { home: injuries.filter(x => x.team === home.id), away: injuries.filter(x => x.team === away.id) },
        watch,
        projections: (Array.isArray(raw.player_markets) ? raw.player_markets : (Array.isArray(raw.player_engine && raw.player_engine.projections) ? raw.player_engine.projections : [])).map(projection)
      }
    };
  }
  return { buildMatchViewModel };
});
