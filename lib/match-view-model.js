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

  // Valeur ABSENTE (null, undefined, '', booleen) : null, jamais 0. Number(null) vaut 0 :
  // une equipe sans statistiques (coupes d'Europe, debut de saison : match_stats_* a null)
  // sortait « Possession 0 % », « Tirs 0 », « xG 0,00 » dans le comparatif et les faits
  // (controle de couverture des 48 competitions, 02/10/2026). Meme regle que lib/insights.js#finite.
  const finite = value => value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '') ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  // UNE SEULE SOURCE DE CHIFFRES (01/10/2026). Arrondi a une decimale des buts attendus,
  // le meme dans « L'histoire du match » et « Ce que dit le modèle » : moitie vers le haut
  // sur l'ecriture decimale (1,45 -> 1,5). Copie exacte de lib/chance-iashark.js#arrondi1
  // (la page ne charge pas ce module ; tests/coherence-site-telegram.test.js verifie
  // que les deux donnent le meme resultat).
  const arrondi1 = value => { const v = finite(value); return v === null || value === null || value === '' ? null : Math.round(Number((v * 10).toPrecision(12))) / 10; };
  // Chance du pari retenu : chance_iashark, posee UNE FOIS par le pipeline (le plus bas
  // entre le modele et la cote sans marge ; lib/chance-iashark.js). Jamais recalculee ici ;
  // absente -> aucune chance affichee (jamais la probabilite brute du modele a la place).
  const chanceDuPari = raw => { const c = raw && raw.chance_iashark != null && raw.chance_iashark !== '' ? finite(raw.chance_iashark) : null; return c !== null && c > 0 && c < 100 ? c : null; };
  const round1 = value => finite(value) === null ? null : Math.round(finite(value) * 10) / 10;
  // Valeur absente (null, undefined, '') : null, jamais 0 (Number(null) === 0).
  const round1Present = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ? null : round1(value);
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  // Nom court d'une equipe (30/09/2026) : UN seul nom par equipe dans le corps de la page
  // (avis, cotes, FAQ, blocs de stats), sur ordinateur comme sur telephone.
  //  - une LISTE de noms courts connus (« PSG », « QPR », « NYRB »...). Plus de regle
  //    d'initiales (4e relecture du 30/09) : elle ecrivait « WHU » (West Ham United),
  //    « GAE » (Go Ahead Eagles), « YFM », « DYJ »... sur les pages des autres championnats ;
  //  - suffixe de club en FIN de nom retire (« Vancouver Whitecaps FC » -> « Vancouver
  //    Whitecaps »), jamais au debut ni au milieu (« 1. FC Heidenheim » reste entier) ;
  //  - sinon le nom tel quel.
  const NOMS_COURTS = {
    'Paris Saint Germain': 'PSG', 'Paris Saint-Germain': 'PSG',
    'Queens Park Rangers': 'QPR',
    'New York Red Bulls': 'NYRB',
    'New York City FC': 'NYCFC',
    'Los Angeles Galaxy': 'LA Galaxy',
    'Sporting Kansas City': 'Sporting KC',
    'Tottenham Hotspur': 'Tottenham',
    'Wolverhampton Wanderers': 'Wolverhampton',
    'Brighton & Hove Albion': 'Brighton', 'Brighton and Hove Albion': 'Brighton',
    'West Bromwich Albion': 'West Bromwich',
    'Stade Brestois 29': 'Brest',
    'U.N.A.M. - Pumas': 'Pumas UNAM',
    // 5e relecture du 30/09 (test hors Europe) : le nom complet chevauchait l'autre colonne du Comparatif.
    'Club Deportivo Los Chankas': 'Los Chankas'
  };
  const SUFFIXES_CLUB = /^(FC|CF|SC|AFC|AC|SV|FK|SK|CD|CA|BK|IF)$/;
  function nomCourt(nom) {
    const s = text(nom);
    if (!s) return s;
    if (Object.prototype.hasOwnProperty.call(NOMS_COURTS, s)) return NOMS_COURTS[s];
    const mots = s.split(/\s+/);
    if (s.length > 14 && mots.length >= 3 && SUFFIXES_CLUB.test(mots[mots.length - 1])) return mots.slice(0, -1).join(' ');
    return s;
  }
  // Nom officiel quand la source l'ecrit autrement (relecture du 30/09/2026 : l'API ecrit
  // « Paris Saint Germain », le club s'ecrit « Paris Saint-Germain »). En-tete et titre seulement :
  // le corps de la page n'utilise que le nom court (short), un seul nom par equipe.
  const NOMS_OFFICIELS = { 'Paris Saint Germain': 'Paris Saint-Germain', 'Saint Etienne': 'Saint-Étienne' };
  function nomOfficiel(nom) {
    const s = text(nom);
    return s && Object.prototype.hasOwnProperty.call(NOMS_OFFICIELS, s) ? NOMS_OFFICIELS[s] : s;
  }
  // api : le nom tel que l'ecrivent les sources (face-a-face, textes du pipeline), pour le reconnaitre.
  const team = value => {
    const api = text(value && value.n) || 'Équipe';
    const name = nomOfficiel(api) || api;
    return { id: value && value.id != null ? value.id : null, name, api, short: nomCourt(name) || name, logo: value && value.id ? `https://media.api-sports.io/football/teams/${value.id}.png` : null };
  };

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

  // Simulation par tranches de 15 minutes (champ premium sim_15min, pipeline
  // lib/simulation-15min.js, 28/09/2026). REMPLACE l'ancienne « frequence
  // observee » (buts des 20 derniers matchs par tranche, events_*.slots) :
  // mesuree sur 6 127 matchs jamais vus, elle se trompait de 6 points en
  // moyenne (quand elle annoncait 5-10 %, il y avait un but dans 26 % des cas).
  // La simulation part des buts attendus du modele (lambda_h/lambda_a), tient
  // compte du score du moment, des cartons rouges et du temps additionnel, et
  // se trompe de 0,7 point. Aucun profil « cette equipe marque tard » : mesure,
  // c'est du hasard (iashark-simulation/RAPPORT-SIMULATION.md).
  // Chiffres du modele : null si le champ est absent (visiteur non Pro).
  const TRANCHES_15 = ['1-15', '16-30', '31-45+', '46-60', '61-75', '76-90+'];
  function goalSimulation(raw, modelAvailable) {
    const s = raw && raw.sim_15min;
    if (!modelAvailable || !s || !Array.isArray(s.tr) || s.tr.length !== 6) return null;
    const probs = s.tr.map(finite);
    if (probs.some(p => p === null || p < 0 || p > 1)) return null;
    const slots = probs.map((p, i) => ({ label: TRANCHES_15[i], probability: Math.round(p * 1000) / 10 }));
    const pr = s.premier || {};
    const first = [pr.h, pr.a, pr.n].every(v => finite(v) !== null)
      ? { home: Math.round(pr.h * 1000) / 10, away: Math.round(pr.a * 1000) / 10, none: Math.round(pr.n * 1000) / 10 }
      : null;
    // Pas de « tranche la plus chaude » ni de score a la pause (validation du
    // mathematicien, 28/09/2026) : toujours 76e-fin et presque toujours 0-0.
    return { slots, firstGoal: first, version: text(s.v) };
  }

  // STATS IASHARK (lib/stats-book.js, 30/09/2026) : profils descriptifs calcules sur le
  // Book (matchs passes des deux equipes, de l'arbitre et de la ligue). Deux sources :
  //  - raw.stats_iashark_gratuit (public, match/<id>.json) : « marque en premier » de
  //    chaque equipe et « au moins un but apres la 75e » de la ligue ;
  //  - raw.stats_iashark (Pro seulement, rendu par match-data) : tout le detail.
  // Rien n'est invente : un chiffre sans nombre de matchs, sans marge, hors bornes, sous le
  // seuil, sans periode ou sans championnat est ecarte ; un profil termine le jour du match
  // ou apres est ecarte (anti-fuite, meme regle que lib/stats-book.js#jourUtc/profilUtilisable).
  // Tout vide : null (la page n'affiche aucune section).
  const SEUILS_BOOK = { equipe: 15, sous_groupe: 30, arbitre: 30, ligue: 30 };
  function jourUtcBook(d) {
    if (typeof d !== 'string') return null;
    const s = d.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      const x = new Date(s);
      return isNaN(x) ? null : x.toISOString().slice(0, 10);
    }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    const x = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] != null ? +m[4] : 0) - 2, m[5] != null ? +m[5] : 0));
    return isNaN(x) ? null : x.toISOString().slice(0, 10);
  }
  const jourIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  // [valeur, bas, haut] -> { p, lo, hi } ; max : 1 pour une part, Infinity pour une moyenne.
  function intervalle(x, max) {
    if (!Array.isArray(x) || x.length !== 3) return null;
    const v = x.map(finite);
    if (v.some(y => y === null || y < 0 || y > max) || !(v[1] <= v[0] && v[0] <= v[2])) return null;
    return { p: v[0], lo: v[1], hi: v[2] };
  }
  // Championnat d'un profil d'equipe : { id, name } ou { nat: true } (matchs officiels de
  // selection). Sans championnat : null (le chiffre pourrait melanger des divisions).
  function competitionBook(o) {
    if (!o) return null;
    if (o.championnat === 'selections') return { nat: true };
    const id = finite(o.championnat), name = text(o.championnat_nom);
    return id !== null && id > 0 && name ? { id, name } : null;
  }
  const serie6 = (x, max) => Array.isArray(x) && x.length === 6 ? x.map(y => intervalle(y, max)) : null;
  const complete = a => Array.isArray(a) && a.every(Boolean);
  // FRAICHEUR (30/09/2026) : jamais une date perimee sur la page. L'export compte les matchs
  // jusqu'a la veille (periode_fin = hier) ; si les chiffres ont plus de 14 jours de retard sur
  // le jour de reference (aujourd'hui, ou le jour du match s'il est deja passe), aucune carte.
  // Sans date de fin : aucune carte non plus (on ne peut pas dire jusqu'a quand).
  // 30/09/2026 : 7 -> 14 jours, en attendant l'export automatique (export manuel sur le Mac).
  const FRAICHEUR_BOOK_J = 14;
  function bookAssezFrais(fin, jourMatch, maintenant) {
    if (!fin || !jourMatch) return false;
    const t = maintenant == null ? Date.now() : new Date(maintenant).getTime();
    if (!Number.isFinite(t)) return false;
    const auj = new Date(t).toISOString().slice(0, 10);
    const ref = jourMatch < auj ? jourMatch : auj;
    return (Date.parse(ref + 'T00:00:00Z') - Date.parse(fin + 'T00:00:00Z')) / 864e5 <= FRAICHEUR_BOOK_J;
  }
  // Rubriques du detail Pro que CE match a vraiment (stats_iashark_gratuit.detail_pro, noms
  // seulement, aucun chiffre) : la ligne « Reserve aux abonnes Pro » ne promet rien d'autre.
  const RUBRIQUES_PRO = ['premier', 'quarts', 'pause', 'lieu', 'arbitre', 'ligue'];
  function bookStats(raw, maintenant) {
    raw = raw || {};
    const gratuit = raw.stats_iashark_gratuit && typeof raw.stats_iashark_gratuit === 'object' ? raw.stats_iashark_gratuit : null;
    const pro = raw.stats_iashark && typeof raw.stats_iashark === 'object' ? raw.stats_iashark : null;
    if (!gratuit && !pro) return null;
    const jour = jourUtcBook(raw.date);
    const src = pro || gratuit;
    if (!bookAssezFrais(jourIso(src.periode_fin), jour, maintenant)) return null;
    const seuils = Object.assign({}, SEUILS_BOOK);
    if (src.seuils) for (const k of Object.keys(SEUILS_BOOK)) if (finite(src.seuils[k]) !== null) seuils[k] = Math.max(SEUILS_BOOK[k], finite(src.seuils[k]));
    const periode = o => {
      const debut = jourIso(o && o.debut), fin = jourIso(o && o.fin);
      return debut && fin && debut <= fin && jour && jour > fin ? { debut, fin } : null;
    };
    const nOk = (n, seuil) => finite(n) !== null && finite(n) >= seuil && Math.round(n) === finite(n);
    // Profil d'equipe (tout / domicile / exterieur).
    function profil(p) {
      const per = periode(p);
      if (!p || !per || !nOk(p.n, seuils.equipe)) return null;
      const r = { n: finite(p.n), debut: per.debut, fin: per.fin };
      const bp = intervalle(p.bp, Infinity), bc = intervalle(p.bc, Infinity);
      if (bp) r.scored = bp;
      if (bc) r.conceded = bc;
      const t = p.tranches;
      const pour = t && serie6(t.pour, Infinity), contre = t && serie6(t.contre, Infinity);
      if (t && nOk(t.n, seuils.equipe) && complete(pour) && complete(contre)) r.slots = { n: finite(t.n), for: pour, against: contre };
      const pb = p.premier_but;
      if (pb && nOk(pb.n, seuils.equipe)) {
        const f = { n: finite(pb.n), scores: intervalle(pb.marque, 1), concedes: intervalle(pb.encaisse, 1), none: intervalle(pb.zero_zero, 1) };
        if (f.scores) r.firstGoal = f;
      }
      const a = p.apres_75;
      if (a && nOk(a.n, seuils.equipe) && intervalle(a.match_avec_but, 1)) r.late = { n: finite(a.n), anyGoal: intervalle(a.match_avec_but, 1) };
      const c = p.cartons;
      if (c && nOk(c.n, seuils.equipe) && intervalle(c.pour, Infinity)) r.cards = { n: finite(c.n), own: intervalle(c.pour, Infinity), opp: intervalle(c.adverse, Infinity) };
      const k = p.corners;
      if (k && nOk(k.n, seuils.equipe) && intervalle(k.pour, Infinity) && intervalle(k.contre, Infinity)) r.corners = { n: finite(k.n), for: intervalle(k.pour, Infinity), against: intervalle(k.contre, Infinity) };
      const ht = {};
      for (const cas of ['mene', 'egalite', 'menee']) {
        const g = p.pause && p.pause[cas];
        if (!g || !nOk(g.n, seuils.sous_groupe)) continue;
        const v = intervalle(g.v, 1), nul = intervalle(g.nul, 1), d = intervalle(g.d, 1);
        if (v && nul && d && Math.abs(v.p + nul.p + d.p - 1) < 0.02) ht[{ mene: 'leading', egalite: 'level', menee: 'trailing' }[cas]] = { n: finite(g.n), win: v, draw: nul, loss: d };
      }
      if (Object.keys(ht).length) r.halfTime = ht;
      return r;
    }
    function equipe(e, lieu) {
      const comp = competitionBook(e);
      if (!e || !comp) return null;
      const tout = profil(e.tout), ici = profil(e[lieu]);
      return tout || ici ? { all: tout, venue: ici, comp } : null;
    }
    function ligue(l) {
      const per = periode(l);
      if (!l || !per || !nOk(l.n, seuils.ligue)) return null;
      const r = { n: finite(l.n), debut: per.debut, fin: per.fin, goals: intervalle(l.buts, Infinity), over25: intervalle(l.plus_2_5, 1), btts: intervalle(l.btts, 1),
        home: intervalle(l.dom, 1), draw: intervalle(l.nul, 1), away: intervalle(l.ext, 1) };
      if (!(r.home && r.draw && r.away && Math.abs(r.home.p + r.draw.p + r.away.p - 1) < 0.02)) r.home = r.draw = r.away = null;
      const t = l.tranches;
      if (t && nOk(t.n, seuils.ligue)) {
        const buts = serie6(t.buts, Infinity);
        if (complete(buts)) r.slots = { n: finite(t.n), goals: buts };
        r.late = intervalle(l.apres_75, 1) ? { n: finite(t.n), p: intervalle(l.apres_75, 1) } : null;
      }
      const moy = (o, cle) => o && nOk(o.n, seuils.ligue) && intervalle(o[cle], Infinity) ? { n: finite(o.n), m: intervalle(o[cle], Infinity) } : null;
      r.cards = moy(l.cartons, 'm'); r.penalties = moy(l.penaltys, 'm'); r.corners = moy(l.corners, 'm');
      return r;
    }
    function arbitre(a) {
      const per = periode(a);
      if (!a || !per || !nOk(a.n, seuils.arbitre) || !text(a.nom)) return null;
      const r = { name: text(a.nom), n: finite(a.n), debut: per.debut, fin: per.fin };
      for (const [cle, nom] of [['cartons', 'cards'], ['rouges', 'reds'], ['penaltys', 'penalties']]) {
        const x = a[cle];
        const m = x && intervalle(x.m, Infinity), att = x ? finite(x.attendu) : null;
        const ecart = x && Array.isArray(x.ecart) && x.ecart.length === 3 && x.ecart.every(v => finite(v) !== null) && x.ecart[1] <= x.ecart[0] && x.ecart[0] <= x.ecart[2]
          ? { p: finite(x.ecart[0]), lo: finite(x.ecart[1]), hi: finite(x.ecart[2]) } : null;
        if (m && att !== null && att >= 0 && ecart) r[nom] = { m, expected: att, gap: ecart, clear: ecart.lo > 0 || ecart.hi < 0 };
      }
      return r.cards || r.reds || r.penalties ? r : null;
    }
    // periodEnd : date du DERNIER match compte (« matchs joues jusqu'au »), jamais la date du calcul.
    const out = { pro: !!pro, version: text(src.version), computedAt: text(src.calcule_le), periodEnd: jourIso(src.periode_fin) };
    if (pro) {
      out.teams = { home: equipe(pro.dom, 'dom'), away: equipe(pro.ext, 'ext') };
      out.league = ligue(pro.ligue);
      out.referee = arbitre(pro.arbitre);
      if (!out.teams.home && !out.teams.away) out.teams = null;
      const premier = e => e && e.all && e.all.firstGoal ? Object.assign({ debut: e.all.debut, fin: e.all.fin, comp: e.comp }, e.all.firstGoal) : null;
      out.firstGoal = { home: premier(out.teams && out.teams.home), away: premier(out.teams && out.teams.away) };
      out.leagueLate = out.league && out.league.late ? { n: out.league.late.n, p: out.league.late.p, debut: out.league.debut, fin: out.league.fin } : null;
    } else {
      const libre = (o, cle, seuil) => {
        const per = periode(o);
        const v = o && intervalle(o[cle], 1);
        if (!per || !v || !nOk(o.n, seuil)) return null;
        const r = { n: finite(o.n), debut: per.debut, fin: per.fin };
        if (cle === 'marque') {
          r.comp = competitionBook(o);
          if (!r.comp) return null;
          r.scores = v;
        } else r.p = v;
        return r;
      };
      out.firstGoal = { home: libre(gratuit.premier_but_dom, 'marque', seuils.equipe), away: libre(gratuit.premier_but_ext, 'marque', seuils.equipe) };
      out.leagueLate = libre(gratuit.ligue_apres_75, 'taux', seuils.ligue);
      out.teams = null; out.league = null; out.referee = null;
      // null : liste inconnue (ancien fichier) ; [] : rien de plus pour un Pro sur ce match.
      out.lockedParts = Array.isArray(gratuit.detail_pro) ? RUBRIQUES_PRO.filter(k => gratuit.detail_pro.includes(k)) : null;
    }
    if (!out.firstGoal.home && !out.firstGoal.away) out.firstGoal = null;
    return out.firstGoal || out.leagueLate || out.teams || out.league || out.referee ? out : null;
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
  // 30/09/2026 : seulement les 10 dernieres annees avant le match (toutes
  // competitions) ; une confrontation plus ancienne n'est ni affichee ni citee.
  const H2H_ANNEES = 10;
  function h2hDateMin(dateMatch) {
    const jour = jourUtcBook(dateMatch) || new Date().toISOString().slice(0, 10);
    return (Number(jour.slice(0, 4)) - H2H_ANNEES) + jour.slice(4);
  }
  function headToHead(items, dateMatch) {
    const min = h2hDateMin(dateMatch);
    const rows = (Array.isArray(items) ? items : []).map(item => ({
      date: text(item && item.d), home: text(item && item.home), away: text(item && item.away),
      score: text(item && item.s), winner: text(item && item.w)
    })).filter(row => row.date && row.home && row.away && row.score && row.date.slice(0, 10) >= min);
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
  // BUTEURS : UN SEUL CALCUL, celui du moteur v3 (decision de Clement, 01/10/2026).
  // La liste et la chance de marquer viennent de v3_buteurs (lib/moteur-v3.js#buteursV3 :
  // titulaires probables, p_marque du moteur, chance arrondie VERS LE BAS a 5 points,
  // plafonnee a 45 %, rien sous 10 %), la meme que le Canal Pro et l'accueil Pro. Le calcul
  // buteur du site (lib/insights.js#scorerModel) ne donne plus aucun chiffre affiche : il
  // sert seulement aux faits (titularisations sur les derniers matchs de l'equipe). Sans
  // v3_buteurs (match hors moteur v3), aucune chance de marquer n'est affichee.
  function prelineupScorers(raw, home, away, injuries, playerData, modelAvailable) {
    const v3 = Array.isArray(raw.v3_buteurs) ? raw.v3_buteurs.filter(b => b && finite(b.chance) !== null && finite(b.chance) > 0 && (b.cote === 'home' || b.cote === 'away')) : [];
    if (!modelAvailable || !v3.length) return [];
    const model = insights && insights.scorerModel;
    const histories = raw.player_history || {};
    const squads = raw.current_squads || {};
    const faits = new Map();
    if (model) {
      const side = (key, teamValue) => ({
        rows: Array.isArray(histories[key]) ? histories[key] : [],
        teamId: teamValue.id,
        lambda: null,
        absentNames: injuries.filter(item => Number(item.team) === Number(teamValue.id)).map(item => item.name),
        currentIds: (Array.isArray(squads[key]) ? squads[key] : []).map(p => Number(p && (p.player_id != null ? p.player_id : p.id))).filter(Number.isFinite)
      });
      try {
        const ranked = model.rankMatch({ home: side('home', home), away: side('away', away) });
        (ranked && ranked.all || []).forEach(c => { if (c && c.id != null) faits.set(Number(c.id), c); });
      } catch (error) { /* faits absents : la carte dit seulement « Titulaire probable » */ }
    }
    const seasonStats = new Map(playerData.home.players.concat(playerData.away.players).map(p => [p.id, p]));
    return v3.map(b => {
      const id = finite(b.joueur_id);
      const s = id !== null ? seasonStats.get(id) || null : null;
      const c = id !== null ? faits.get(id) || null : null;
      const teamValue = b.cote === 'home' ? home : away;
      return {
        ...(s || { goals90: null, shotsOn90: null, assists90: null, rating5: null, number: null }),
        id, teamId: teamValue.id, team: teamValue.name,
        name: (s && s.name) || text(b.joueur) || (id !== null ? `Joueur ${id}` : 'Joueur'),
        photo: (s && s.photo) || (c && text(c.photo)) || null,
        position: (s && s.position) || text(b.poste) || null,
        minutes: s ? s.minutes : null,
        appearances: s ? s.appearances : null,
        starts: s ? s.starts : null,
        scoringProbability: finite(b.chance),
        startsLast: c ? finite(c.startsLast) : null,
        teamMatchesLast: c ? finite(c.teamMatchesLast) : null,
        expectedMinutes: c && finite(c.expectedMinutes) !== null ? Math.round(c.expectedMinutes) : null,
        expectedGoals90: null,
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
          ratings: ratings.map(round1), minutes, minutesRecent, appearances, starts, absent,
          // Page match plus (30/09) : forme du buteur, buts REELS sur les memes matchs (jamais recalcules depuis la moyenne /90).
          goalsRecent: sum(recent, 'goals')
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
  // Une seule cote (lib/cote-anj.js, 01/10/2026) : quand la cote du pari vient d'un bookmaker
  // agree ANJ (cote_source « anj »), sa cote sans marge vient de la meme source.
  function sansMargeAnj(raw) {
    if (!raw || raw.cote_source !== 'anj' || !raw.sans_marge_anj || !raw.market_id) return null;
    const v = round1Present(raw.sans_marge_anj[raw.market_id]);
    return v !== null && v > 0 && v < 100 ? v : null;
  }
  function recommendedReference(raw) {
    const anj = sansMargeAnj(raw);
    if (anj !== null) return anj;
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
    // Cote aberrante (1,00 et moins, « -- ») : non disponible, jamais affichee.
    const cote = v => absent(v) || !(finite(v) > 1) ? null : finite(v);
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
    // Marche du moteur v3 pas encore verifie sur le passe : la page garde
    // l'etiquette « Fiabilité faible » sur sa ligne (condition du mathematicien).
    const nonVerifies = marchesNonVerifies(raw);
    if (nonVerifies.size) rows.forEach(r => { const id = r.id || (r.recommended ? raw.market_id : null); if (id && nonVerifies.has(String(id))) r.unverified = true; });
    // Selection nationale : 1N2 et double chance seulement (ni plus/moins de buts, ni « les deux marquent »).
    if (estSelectionNationale(raw)) return rows.filter(r => r.family && (r.family.family === 'result' || r.family.family === 'dc'));
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

  // « Sur 100 matchs comme celui-ci… environ X fois » (contre-controle ronde 4,
  // 30/09/2026) : une frequence n'est annoncee que si la probabilite affichee vient
  // d'un pari du moteur v3 CALIBRE : pari du moteur v3 (moteur_v3.source = "v3"),
  // meme marche que le pari affiche, marche « vérifié sur le passé » (etiquette ET
  // fiabilite_marche) et meme probabilite. L'ancien moteur est trop sur de lui
  // (CURRENT_ENGINE_CALIBRATION_REPORT.md : 6,1 a 9,5 points d'ecart au 1N2) :
  // avec lui, pas de phrase. Meme regle que le canal Telegram
  // (lib/telegram-posts.js#pariV3Calibre).
  const VERIFIE_SUR_LE_PASSE = 'vérifié sur le passé';
  function frequenceCalibree(raw) {
    if (estSelectionNationale(raw)) return false;
    const v = raw && raw.v3_pari;
    if (!v || typeof v !== 'object' || raw.market_id == null || v.market_id == null) return false;
    if (String(v.market_id) !== String(raw.market_id)) return false;
    if (!raw.moteur_v3 || raw.moteur_v3.source !== 'v3') return false;
    if (v.etiquette !== VERIFIE_SUR_LE_PASSE || v.fiabilite_marche !== VERIFIE_SUR_LE_PASSE) return false;
    const pv = round1Present(v.probabilite), pm = round1Present(raw.model_probability);
    if (pv === null || pm === null || Math.abs(pv - pm) > 0.5) return false;
    if (origineProbabilite(raw) === ORIGINE_AVEC_COTES) return true;
    // Modele seul : seulement s'il ne depasse pas la cote sans marge, qui doit etre connue.
    const fair = coteSansMarge(raw);
    return fair !== null && pm <= fair;
  }

  // ORIGINE DU CHIFFRE (condition 1 du mathematicien et de l'avocat du diable,
  // 30/09/2026). Hors d'Europe (et coupes, selections, ligues sans cote), le moteur
  // v3 calcule seul, sans la cote (lib/moteur-v3.js#origineProbabilite, champ public
  // moteur_v3.origine_probabilite). Sur 549 paris jamais vus ou ce modele seul
  // depassait la cote sans marge : 77,0 % annonces, 69,6 % passes. Seul un chiffre
  // « modèle + cotes » peut donc dire « Le modèle voit plus de chances que le
  // bookmaker : +X points ». Ancien moteur, origine absente ou inconnue : « modèle
  // seul » (prudence). Meme regle que le canal (lib/telegram-posts.js#pariV3Calibre).
  const ORIGINE_AVEC_COTES = 'modèle + cotes';
  const ORIGINE_MODELE_SEUL = 'modèle seul';
  function origineProbabilite(raw) {
    const mv = raw && raw.moteur_v3;
    return mv && mv.source === 'v3' && mv.origine_probabilite === ORIGINE_AVEC_COTES ? ORIGINE_AVEC_COTES : ORIGINE_MODELE_SEUL;
  }
  // Chiffre VRAIMENT calcule par le moteur v3 sans la cote (source v3 ET origine
  // publiee « modèle seul »). L'ancien moteur, lui, tire 80 % de son chiffre de la
  // cote sans marge (lib/decision.js, modelWeight 0,2) : « Estimation du modèle
  // seul, sans la cote » y serait faux (avocat du diable, 30/09/2026). Origine
  // absente ou inconnue : on ne dit pas non plus d'ou vient le chiffre.
  function modeleSeulV3(raw) {
    const mv = raw && raw.moteur_v3;
    return !!(mv && mv.source === 'v3' && mv.origine_probabilite === ORIGINE_MODELE_SEUL);
  }
  // SELECTIONS NATIONALES (decision de Clement du 30/09/2026) : Ligue des nations,
  // amicaux, qualifications. Seulement le 1N2 et la double chance, jamais « Sur 100
  // matchs », pas de niveau de fiabilite (« Fiabilité : en test » vient du champ
  // league_reliability). Meme liste que lib/selections-nationales.js (verifie par
  // tests/selections-nationales-page.test.js), recopiee ici pour ne pas ajouter de
  // script aux pages.
  const SELECTIONS_IDS = [1, 4, 5, 6, 7, 9, 10, 29, 30, 31, 32, 33, 34, 37, 666, 960];
  const SELECTIONS_NOMS = /nations\s+league|ligue\s+des\s+nations|friendl|amicaux?\s+internationa|world\s+cup|coupe\s+du\s+monde|qualification|qualifiers?|euro\s+championship|championnat\s+d['’]europe|copa\s+am[ée]rica|africa\s+cup|coupe\s+d['’]afrique|asian\s+cup|gold\s+cup/i;
  const SELECTIONS_MARCHES = ['home-win', 'draw', 'away-win', 'dc-1x', 'dc-x2', 'dc-12'];
  function estSelectionNationale(raw) {
    if (!raw || typeof raw !== 'object') return false;
    if (raw.league_id != null && raw.league_id !== '' && SELECTIONS_IDS.indexOf(Number(raw.league_id)) !== -1) return true;
    const nom = typeof raw.league === 'string' ? raw.league : '';
    return !!nom && SELECTIONS_NOMS.test(nom) && !/champions|europa|conference|libertadores|sudamericana|club/i.test(nom);
  }
  // FIABILITE AFFICHEE (avocat du diable, 30/09/2026, point 3) : quand l'ecart est
  // masque (chiffre qui n'est pas « modèle + cotes », au-dessus de la cote), la page
  // affiche au plus « Fiabilité moyenne ». Les vraies sorties du moteur v3 donnaient
  // « Élevée » en MLS, en Ligue des nations et en amicaux, la ou le modele seul annonce
  // 7,4 points de trop (549 paris jamais vus : 77,0 % annonces, 69,6 % passes). Meme
  // plafond pour le match offert « modèle seul » du moteur v3 (is_free). « Moyenne »,
  // « Faible » et « en test » ne changent jamais ; aucune probabilite n'est touchee.
  function fiabiliteAffichee(raw, recEdge) {
    if (estSelectionNationale(raw)) return null;
    const info = insights && insights.reliabilityInfo ? insights.reliabilityInfo(raw && raw.reliability) : null;
    if (!info || info.level !== 'high' || origineProbabilite(raw) === ORIGINE_AVEC_COTES) return info;
    const ecartMasque = typeof recEdge === 'number' && recEdge > 0;
    const offertModeleSeul = !!raw && raw.is_free === true && modeleSeulV3(raw);
    // Modele seul SANS cote sans marge (avocat du diable, 01/10/2026) : rien ne confronte le
    // chiffre a la cote, donc au plus « Fiabilité moyenne » aussi.
    const pari = !!raw && raw.market_id != null && raw.market_id !== '' && !!String(raw.pari_rec || raw.market_id || '').trim();
    const sansCoteSansMarge = pari && coteSansMarge(raw) === null;
    if (!ecartMasque && !offertModeleSeul && !sansCoteSansMarge) return info;
    return Object.assign({}, info, { level: 'medium', reason: modeleSeulV3(raw) ? 'model_only' : 'gap_hidden', capped: true });
  }
  // Cote sans marge du pari affiche : consensus de marche de sa ligne du comparatif
  // (marge du bookmaker retiree), sinon null (1/cote garde la marge).
  function coteSansMarge(raw) {
    const anj = sansMargeAnj(raw);
    if (anj !== null) return anj;
    const row = (Array.isArray(raw && raw.markets_compared) ? raw.markets_compared : []).find(m => m && raw.market_id && m.id === raw.market_id);
    const fair = row ? round1Present(row.consensus) : null;
    return fair !== null && fair > 0 && fair < 100 ? fair : null;
  }
  // Marches du moteur v3 pas encore verifies sur le passe (coupes hors 1N2, ligues a
  // donnees limitees : Colombie, Perou, Chili, Afrique du Sud) : ids du site.
  function marchesNonVerifies(raw) {
    const out = new Set();
    if (!raw || !raw.moteur_v3 || raw.moteur_v3.source !== 'v3' || !Array.isArray(raw.v3_marches)) return out;
    raw.v3_marches.forEach(m => { if (m && m.market_id && m.etiquette !== VERIFIE_SUR_LE_PASSE) out.add(String(m.market_id)); });
    return out;
  }

  // « LE SCORE AUDACIEUX » (decision de Clement, 30/09/2026, Pro) : parmi les scores exacts
  // chiffres par le moteur v3 (v3_marches, cles SCORE:a-b, a et b de 0 a 4 : contrat 1.1), le
  // plus probable des scores a 4 buts ou plus, avec SA probabilite du moteur (jamais recalculee).
  // Seulement un match publie par le moteur v3 ; sinon null et la page n'affiche rien.
  function scoreAudacieux(raw) {
    if (!raw || !raw.moteur_v3 || raw.moteur_v3.source !== 'v3' || !Array.isArray(raw.v3_marches)) return null;
    let best = null;
    raw.v3_marches.forEach(m => {
      const k = m && typeof m.cle === 'string' ? m.cle.match(/^SCORE:(\d+)-(\d+)$/) : null;
      const p = m ? finite(m.probabilite) : null;
      if (!k || p === null || p <= 0 || p >= 100 || Number(k[1]) + Number(k[2]) < 4) return;
      if (!best || p > best.probability) best = { score: k[1] + '-' + k[2], probability: p, buts: Number(k[1]) + Number(k[2]) };
    });
    return best;
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
    // raw.pari_rec n'est plus renseigne par le moteur deterministe (voir
    // lib/decision.js#pickMarketDeterministic), remplace par
    // market_id/marche. marketIdToEngineLabel() reconstruit un libelle au
    // format que marcheFr()/marketLabelFr() (match-page.js) savent deja
    // parser, pour ne pas les toucher. Sans ce repli, un match dont le
    // pipeline a bien choisi un marche affichait "Analyse en cours" comme
    // s'il n'y avait aucune analyse.
    const marketLabel = text(raw.pari_rec) || (raw.market_id && marketLabels ? marketLabels.marketIdToEngineLabel(raw.market_id) : null);
    // SELECTIONS NATIONALES (verdict du mathematicien, 30/09/2026) : aucun marche retenu
    // affiche, meme publie par l'ancien moteur en retour arriere (MOTEUR_V3 = 0) ou fige avant.
    // probability = chance_iashark (une seule source, 01/10/2026) : le chiffre affiche partout
    // (avis, tableau, FAQ, Telegram, espace Pro). modelProbability = la probabilite du modele,
    // jamais affichee comme chance du pari ; elle sert aux garde-fous (fiabilite, frequence).
    const recommendation = modelAvailable && text(marketLabel) && !estSelectionNationale(raw) ? {
      market: marketLabel, probability: chanceDuPari(raw), modelProbability: round1Present(raw.model_probability), confidence: raw.conf == null || raw.conf === '' ? null : round1(raw.conf), /* conf premium : absent = aucune note, jamais 0/10 */ reliability: text(raw.reliability && raw.reliability.label)
    } : null;
    const marketsCompared = (Array.isArray(raw.markets_compared) ? raw.markets_compared : []).slice(0, 8).map(item => ({
      id: text(item && item.id),
      market: text(item && (item.market || item.label)),
      probability: round1Present(item && item.probability),
      consensus: round1Present(item && item.consensus),
      edge: round1Present(item && item.edge)
    })).filter(item => item.market && item.probability !== null && (!estSelectionNationale(raw) || SELECTIONS_MARCHES.indexOf(String(item.id)) !== -1));
    const rawProjections = Array.isArray(raw.player_markets) ? raw.player_markets : (Array.isArray(raw.player_engine && raw.player_engine.projections) ? raw.player_engine.projections : []);
    const rawLineups = raw.lineups && typeof raw.lineups === 'object' ? raw.lineups : null;
    const playerData = playerAnalytics(raw, home, away, injuries);
    const matchupsList = matchups(raw, home.short, away.short);
    const matchupScores = insights ? insights.computeMatchup(raw.match_stats_home, raw.match_stats_away) : null;
    const keyInsights = insights ? insights.classifyKeyInsights({ matchups: matchupsList, keyAbsenceAlerts: raw.key_absences, marketsCompared, homeName: home.short, awayName: away.short }) : [];
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
    // Ecart du MODELE face a la cote (jamais affiche) : les garde-fous de fiabilite restent
    // ceux d'avant (un modele seul au-dessus de la cote plafonne la fiabilite a « moyenne »),
    // meme si la chance affichee, elle, ne depasse jamais la cote sans marge.
    const recEdgeModele = recommendation && recommendation.modelProbability !== null && recImplied !== null ? round1(recommendation.modelProbability - recImplied) : null;
    // Competition « en test » (non validee par le mathematicien,
    // config/leagues.json#fiabilite, champ public league_reliability pose par le
    // pipeline via lib/league-scope.js) : « Fiabilité : en test », aucune
    // frequence « Sur 100 matchs » et aucun ecart face a la cote, dans aucun sens.
    const leagueInTest = raw.league_reliability === 'en_test' || estSelectionNationale(raw); // selections nationales : toujours « en test » (30/09/2026)
    // Chiffre du modele seul : aucun ecart favorable dit, meme dans les risques.
    const gapHidden = leagueInTest || origineProbabilite(raw) !== ORIGINE_AVEC_COTES;
    const form = { home: formRows(raw.form_home), away: formRows(raw.form_away) };
    const nomCourtDe = x => x === home.api || x === home.name ? home.short : x === away.api || x === away.name ? away.short : x;
    const signalReasons = recommendation && insights && insights.signalReasons ? insights.signalReasons({
      // Buts attendus deja arrondis une fois (arrondi1) : « Pourquoi ce pari » cite les memes que les autres blocs.
      family: recFamily, homeName: home.short, awayName: away.short, expectedGoals: xg ? { home: arrondi1(xg.home), away: arrondi1(xg.away) } : null,
      eventsHome: raw.events_home, eventsAway: raw.events_away, statsHome: raw.match_stats_home, statsAway: raw.match_stats_away,
      // Noms du face-a-face (ecrits par l'API) ramenes au nom court, pour les reconnaitre.
      h2h: (headToHead(raw.h2h, raw.date) || []).map(r => ({ home: nomCourtDe(r.home), away: nomCourtDe(r.away), score: r.score })),
      form: { home: form.home.map(r => r.result), away: form.away.map(r => r.result) },
      absences: { home: absenceNames('home'), away: absenceNames('away') }
    }) : [];
    const signalRisks = recommendation && insights && insights.signalRisks ? insights.signalRisks({
      // Une seule source (01/10/2026) : la chance affichee ne depasse jamais la cote sans marge ;
      // seul un ecart DEFAVORABLE visible (au moins 1 point une fois arrondi, comme l'avis) est un risque.
      family: recFamily, edge: leagueInTest || recEdge === null || Math.round(recEdge) > -1 ? null : recEdge, odds: recOdds, reliability: raw.reliability, homeName: home.short, awayName: away.short,
      absences: { home: absenceNames('home'), away: absenceNames('away') }
    }) : [];
    const vm = {
      id: raw.id,
      form,
      // Teaser des murs d'acces : AUCUNE donnee du modele. Le nombre de cotes
      // de bookmaker disponibles et le niveau de fiabilite publie.
      teaser: {
        // Cote absente, « -- » ou aberrante (1,00 et moins) : pas comptee.
        oddsCount: PUBLIC_ODDS_FIELDS.filter(k => finite(raw[k]) !== null && finite(raw[k]) > 1).length,
        reliability: fiabiliteAffichee(raw, recEdgeModele)
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
        expectedGoals: xg ? { home: arrondi1(xg.home), away: arrondi1(xg.away) } : null,
        scores: modelAvailable && Array.isArray(raw.mc_scores) ? raw.mc_scores.filter(s => text(s.score) && finite(s.pct) !== null).slice(0, 3).map(s => ({ score: s.score, probability: finite(s.pct) })) : [],
        boldScore: modelAvailable ? scoreAudacieux(raw) : null,
        recommendation,
        recommendedFamily: recFamily,
        recommendedImplied: recImplied,
        recommendedEdge: leagueInTest ? null : recEdge,
        // Phrase « Sur 100 matchs comme celui-ci » : seulement avec un pari v3 calibre.
        frequencyCalibrated: !!recommendation && !leagueInTest && frequenceCalibree(raw),
        // « Fiabilité : en test » (match-page.js) : aucun ecart affiche, meme defavorable.
        leagueInTest,
        // Origine du chiffre ; « Le modèle voit plus de chances… +X points » et
        // « Écart favorable » seulement pour « modèle + cotes » (match-page.js#ecart).
        probabilitySource: modelAvailable ? origineProbabilite(raw) : null,
        positiveGapHidden: gapHidden,
        // « Estimation du modèle seul, sans la cote » seulement dans ce cas ;
        // sinon « Écart non affiché. » (match-page.js#ecart).
        modelOnlyV3: gapHidden && modeleSeulV3(raw),
        // Au plus « Fiabilité moyenne » quand l'ecart est masque (fiabiliteAffichee).
        reliabilityInfo: modelAvailable ? fiabiliteAffichee(raw, recEdgeModele) : null,
        marketTable: modelAvailable ? marketTable(raw, marketsCompared, recommendation) : [],
        recommendedOdds: finite(raw.cote_rec),
        // Une seule cote (lib/cote-anj.js) : le bookmaker agree ANJ de la cote, ou « cote
        // indicative » (moyenne du marche, jamais un nom de bookmaker) quand il n'y en a pas.
        recommendedBookmaker: raw.cote_source === 'anj' && typeof raw.cote_bookmaker === 'string' && raw.cote_bookmaker ? raw.cote_bookmaker : null,
        recommendedOddsIndicative: raw.cote_source === 'indicative',
        quality: finite(raw.data_quality_score),
        simulationCount: modelAvailable ? finite(raw.simulation_count) : null,
        sources: display ? display.sourceLabels(raw) : [],
        agreement: round1(raw.model_agreement),
        agreementLabel: text(raw.model_agreement),
        marketsCompared,
        iasharkScore: modelAvailable ? computeIasharkScore(raw, raw.reliability) : null,
        value: modelAvailable ? computeValue(marketsCompared, recommendation && recommendation.market) : null,
        monteCarloDistribution: modelAvailable ? monteCarloDistribution(raw.mc_scores, raw.simulation_count) : null,
        goalSimulation: goalSimulation(raw, modelAvailable)
      },
      editorial: {
        reading: text(raw.verdict_shark) || text(raw.analyse_card) || text(raw.contexte),
        decisiveFactor: text(raw.facteur_x) || text(raw.conseil_public),
        // « Notre lecture du match » (Pro, francais seulement : texte de l'IA, relu sans chiffre).
        matchReading: text(raw.lecture_match),
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
        exclusiveFacts: exclusiveFacts(raw)
      },
      conditions: { venue: text(raw.stade && raw.stade.nom), weather: display ? display.weatherForDisplay(raw.stade) : null },
      referee: raw.arbitre && text(raw.arbitre.nom) ? {
        name: text(raw.arbitre.nom),
        cardsPerMatch: finite(raw.arbitre.cartons ?? raw.arbitre.cartons_match),
        penaltiesPerMatch: finite(raw.arbitre.penaltys ?? raw.arbitre.penalties_match),
        matches: finite(raw.arbitre.matchs ?? raw.arbitre.games)
      } : null,
      // Stats IASHARK (Book) : null sans donnees ; detail Pro seulement si le serveur l'a envoye.
      bookStats: bookStats(raw),
      comparison: comparison(raw),
      h2h: headToHead(raw.h2h, raw.date),
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
    vm.plus = matchPlus(raw, vm, modelAvailable);
    return vm;
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
  // ---------------------------------------------------------------------------
  // PAGE MATCH PLUS (30/09/2026, page francaise d'abord ; les autres langues gardent
  // l'ancienne page tant que ces textes ne sont pas traduits). Chiffres SEULEMENT tires
  // du moteur (buts attendus lambda_h / lambda_a, simulation par quart d'heure sim_15min),
  // des stats IASHARK (Book, bookStats ci-dessus) et des donnees du match (joueurs).
  // Aucune cote, aucune mise, aucun « avantage » ici. Une donnee absente : la partie
  // correspondante vaut null et la page cache le bloc.
  //  - tranches : buts attendus par quart d'heure. La simulation publie, pour chaque
  //    tranche, la chance qu'au moins un but y tombe (p). -ln(1 - p) en donne l'intensite ;
  //    les six intensites sont recalees pour que leur somme soit EXACTEMENT les buts
  //    attendus du moteur (lambda_h + lambda_a), partagees entre les equipes au prorata
  //    de lambda_h et lambda_a.
  //  - siAlors : « Si... alors... » par la loi de Poisson sur les buts attendus RESTANTS
  //    apres la minute donnee (tranches ci-dessus), les deux equipes independantes.
  //  - buteurs : les 2 premiers du calcul buteur (titulaires probables seulement), chance
  //    arrondie VERS LE BAS a 5 points et plafonnee a 45 %.
  //  - chiffreFou / piege : une vraie stat du Book, avec son nombre de matchs et sa periode.
  // ---------------------------------------------------------------------------
  const MATCH_PLUS = {
    tranches: ['1-15', '16-30', '31-45+', '46-60', '61-75', '76-90+'],
    seuilChiffreFou: 0.12,
    seuilPartFin: 0.30,
    pasButeur: 5,
    plafondButeur: 45,
    butsMax: 12
  };
  const plusDec1 = v => arrondi1(v).toFixed(1).replace('.', ',');
  const plusPct = p => `${Math.round(p * 100)}\u00a0%`;
  const plusButs = v => `${plusDec1(v)}\u00a0${arrondi1(v) >= 2 ? 'buts attendus' : 'but attendu'}`;
  const plusPeriode = (d, f) => { const a = String(d || '').slice(0, 4), b = String(f || '').slice(0, 4); return a && b ? (a === b ? a : `${a}-${b}`) : ''; };
  const plusComp = c => c && c.nat ? 'matchs officiels de sélection' : c && c.name ? `matchs de ${c.name}` : 'matchs';
  const plusFois = p => p >= 0.95 ? 'plus de 9 fois sur 10' : p < 0.05 ? 'moins d’une fois sur 10' : `${Math.round(p * 10)} fois sur 10`;
  function plusPmf(mu) {
    const out = [];
    let p = Math.exp(-mu);
    for (let k = 0; k <= MATCH_PLUS.butsMax; k++) { out.push(p); p = p * mu / (k + 1); }
    return out;
  }
  // Chance que l'equipe A finisse devant, partant du score (a0, b0), buts attendus restants muA / muB.
  function plusVictoire(a0, b0, muA, muB) {
    const pa = plusPmf(muA), pb = plusPmf(muB);
    let s = 0;
    for (let x = 0; x < pa.length; x++) for (let y = 0; y < pb.length; y++) if (a0 + x > b0 + y) s += pa[x] * pb[y];
    return s;
  }
  // Verdict du mathematicien (ORANGE, 30/09/2026) : les 6 mots de tranche (« Début fermé »,
  // « Tranche calme »... « Fin de match chaude ») sortaient identiques sur tous les matchs :
  // retires. Restent les barres et les buts attendus de chaque tranche.
  function plusTranches(raw, modelAvailable) {
    const lh = finite(raw.lambda_h), la = finite(raw.lambda_a), s = raw.sim_15min;
    if (!modelAvailable || !(lh > 0) || !(la > 0) || !s || !Array.isArray(s.tr) || s.tr.length !== 6) return null;
    const mu = s.tr.map(p => { const x = finite(p); return x === null || x <= 0 || x >= 1 ? null : -Math.log(1 - x); });
    if (mu.some(x => x === null)) return null;
    const somme = mu.reduce((a, b) => a + b, 0), total = lh + la, k = total / somme, moyenne = total / 6;
    return mu.map((m, i) => {
      const t = m * k, r = t / moyenne;
      return { label: MATCH_PLUS.tranches[i], buts: t, home: t * lh / total, away: t * la / total, rapport: r };
    });
  }
  // Equipe « devant » : plus de buts attendus (egalite : domicile).
  function plusCamps(raw, home, away) {
    const lh = finite(raw.lambda_h), la = finite(raw.lambda_a);
    if (!(lh > 0) || !(la > 0)) return null;
    const devant = lh >= la ? 'home' : 'away', autre = devant === 'home' ? 'away' : 'home';
    const nom = { home: home.short, away: away.short };
    return { devant, autre, nomDevant: nom[devant], nomAutre: nom[autre], lh, la };
  }
  function plusHistoire(camps) {
    if (!camps) return null;
    const { lh, la } = camps, total = lh + la, ecart = Math.abs(lh - la);
    const xd = camps.devant === 'home' ? lh : la, xa = camps.devant === 'home' ? la : lh;
    const ton = total >= 3 ? 'un match ouvert' : total <= 2.2 ? 'un match fermé' : 'un match au rythme moyen';
    const debut = ecart >= 0.5 ? `${camps.nomDevant} part devant face à ${camps.nomAutre}`
      : ecart >= 0.2 ? `${camps.nomDevant} légèrement devant face à ${camps.nomAutre}`
      : `${camps.nomDevant} et ${camps.nomAutre} au coude-à-coude`;
    // Total = somme des deux chiffres affiches (1,5 + 1,5 = 3,0), jamais un autre arrondi.
    return `${debut} : ${plusButs(xd)} contre ${plusDec1(xa)}, ${ton} (${plusDec1(arrondi1(xd) + arrondi1(xa))}\u00a0buts attendus au total).`;
  }
  function plusSiAlors(tranches, camps) {
    if (!tranches || !camps) return null;
    const cumul = (cote, de, a) => tranches.slice(de, a).reduce((s, t) => s + t[cote], 0);
    const D = camps.devant, A = camps.autre, nd = camps.nomDevant, na = camps.nomAutre;
    const out = [];
    // 1. L'equipe devant marque avant la 30e (au moins un but sur 1-15 et 16-30).
    {
      const pd = plusPmf(cumul(D, 0, 2)), pa = plusPmf(cumul(A, 0, 2)), rd = cumul(D, 2, 6), ra = cumul(A, 2, 6);
      let num = 0;
      for (let h = 1; h < pd.length; h++) for (let a = 0; a < pa.length; a++) num += pd[h] * pa[a] * plusVictoire(h, a, rd, ra);
      const p = num / (1 - pd[0]);
      out.push({ cle: 'marque_avant_30', p, texte: `Si ${nd} marque avant la 30e minute, la victoire suit ${plusFois(p)}.` });
    }
    const d2 = cumul(D, 3, 6), a2 = cumul(A, 3, 6);
    // 2. 0-0 a la pause.
    {
      const pv = plusVictoire(0, 0, d2, a2), p0 = Math.exp(-(d2 + a2));
      out.push({ cle: 'nul_pause', p: pv, p00: p0, texte: `Si c’est 0-0 à la pause, ${nd} gagne ${plusFois(pv)} et le match finit 0-0 ${plusFois(p0)}.` });
    }
    // 3. L'autre equipe mene a la pause.
    {
      const pd = plusPmf(cumul(D, 0, 3)), pa = plusPmf(cumul(A, 0, 3));
      let num = 0, den = 0;
      for (let h = 0; h < pd.length; h++) for (let a = h + 1; a < pa.length; a++) { const w = pd[h] * pa[a]; den += w; num += w * plusVictoire(h, a, d2, a2); }
      if (den > 0) { const p = num / den; out.push({ cle: 'autre_mene_pause', p, texte: `Si ${na} mène à la pause, ${nd} gagne alors ${plusFois(p)}.` }); }
    }
    // 4. Toujours 0-0 a l'heure de jeu.
    {
      const p = Math.exp(-(cumul(D, 4, 6) + cumul(A, 4, 6)));
      out.push({ cle: 'nul_60', p, texte: `S’il n’y a toujours pas de but à l’heure de jeu, le match finit 0-0 ${plusFois(p)}.` });
    }
    return out;
  }
  // La chance est deja celle du moteur v3, arrondie une fois par le pipeline (v3_buteurs) : lue telle quelle.
  function plusButeurs(list, home, away) {
    const out = (list || []).filter(p => finite(p.scoringProbability) !== null && finite(p.scoringProbability) > 0).slice(0, 2).map(p => {
      const chance = finite(p.scoringProbability);
      const s = finite(p.startsLast), t = finite(p.teamMatchesLast), g = finite(p.goalsRecent), m = finite(p.appearances);
      return {
        id: finite(p.id), name: String(p.name || '').replace(/\s+/g, ' ').trim(), team: Number(p.teamId) === Number(home.id) ? home.short : Number(p.teamId) === Number(away.id) ? away.short : p.team, teamId: p.teamId, photo: p.photo || null, position: p.position || null,
        chance, chanceTexte: `${chance}\u00a0%`,
        titulaire: s !== null && t > 0 ? `Titulaire probable : ${s}\u00a0titularisation${s > 1 ? 's' : ''} sur les ${t}\u00a0derniers matchs de l’équipe` : 'Titulaire probable',
        forme: g !== null && m > 0 ? (g > 0 ? `${g}\u00a0but${g > 1 ? 's' : ''} sur ses ${m}\u00a0derniers matchs joués` : `Aucun but sur ses ${m}\u00a0derniers matchs joués`) : null
      };
    });
    return out.length ? out : null;
  }
  // Stats du Book candidates (chiffre fou et piege). Chaque candidate : id, phrase, grand
  // (le nombre), detail (nombre de matchs et periode), surprise (ecart a l'ordinaire).
  function plusCandidates(b, home, away, ligueNom) {
    if (!b) return [];
    const c = [], nom = { home: home.short, away: away.short };
    const fg = b.firstGoal || {};
    for (const cote of ['home', 'away']) {
      const f = fg[cote];
      if (f && f.scores && f.n) {
        const p = f.scores.p;
        c.push({ id: 'premier_but_' + cote, type: 'premier_but', cote, p, surprise: Math.abs(p - 0.5), grand: plusPct(p),
          phrase: p >= 0.5 ? `${nom[cote]} a ouvert le score dans ${plusPct(p)} de ses matchs` : `${nom[cote]} n’a ouvert le score que dans ${plusPct(p)} de ses matchs`,
          menace: `${nom[cote]} a ouvert le score dans ${plusPct(p)} de ses matchs`,
          detail: `sur ${f.n}\u00a0${plusComp(f.comp)}, ${plusPeriode(f.debut, f.fin)}` });
      }
    }
    const L = b.leagueLate;
    if (L && L.p && L.n) {
      c.push({ id: 'ligue_apres_75', type: 'ligue_apres_75', p: L.p.p, surprise: Math.abs(L.p.p - 0.5), grand: plusPct(L.p.p),
        phrase: `${plusPct(L.p.p)} des matchs de ${ligueNom} ont eu au moins un but après la 75e minute`,
        detail: `sur ${L.n}\u00a0matchs, ${plusPeriode(L.debut, L.fin)}` });
    }
    const T = b.teams || {};
    for (const cote of ['home', 'away']) {
      const e = T[cote], a = e && e.all;
      if (!a) continue;
      const per = plusPeriode(a.debut, a.fin);
      // Plus de « X marque / encaisse Y % de ses buts dans le dernier quart d'heure » (piege
      // et chiffre fou) : le test placebo du mathematicien (30/09/2026) montre que c'est du hasard.
      const ht = a.halfTime || {};
      if (ht.leading) {
        const p = ht.leading.win.p;
        c.push({ id: 'mene_pause_' + cote, type: 'mene_pause', cote, p, surprise: p >= 0.85 ? 0.12 + (p - 0.85) : 0, grand: plusPct(p),
          phrase: p > 0.75 ? `Quand ${nom[cote]} mène à la pause, la victoire suit dans ${plusPct(p)} des cas` : `Quand ${nom[cote]} mène à la pause, la victoire ne suit que dans ${plusPct(p)} des cas`,
          detail: `sur ${ht.leading.n}\u00a0matchs où ${nom[cote]} menait à la pause (${plusComp(e.comp)}, ${per})` });
      }
      if (ht.trailing) {
        const p = ht.trailing.win.p + ht.trailing.draw.p;
        c.push({ id: 'mene_contre_' + cote, type: 'retour', cote, p, surprise: 0, grand: plusPct(p),
          phrase: `Derrière à la pause, ${nom[cote]} arrache au moins le nul dans ${plusPct(p)} des cas`,
          detail: `sur ${ht.trailing.n}\u00a0matchs où ${nom[cote]} était derrière à la pause (${plusComp(e.comp)}, ${per})` });
      }
    }
    return c;
  }
  function plusChiffreFou(cands) {
    const ok = cands.filter(x => x.surprise >= MATCH_PLUS.seuilChiffreFou).sort((a, b) => b.surprise - a.surprise);
    return ok.length ? ok[0] : null;
  }
  // Piege : ce qui peut renverser l'histoire du match, vu du cote de l'equipe « derriere »
  // (ou d'une faiblesse de l'equipe « devant »), dans cet ordre. Jamais le chiffre fou.
  function plusPiege(cands, camps, exclu) {
    if (!camps) return null;
    const D = camps.devant, A = camps.autre;
    const regles = [
      x => x.type === 'mene_pause' && x.cote === D && x.p <= 0.75,
      x => x.type === 'retour' && x.cote === A && x.p >= 0.35,
      x => x.type === 'premier_but' && x.cote === A && x.p >= 0.40,
      x => x.type === 'ligue_apres_75' && x.p >= 0.45
    ];
    for (const r of regles) { const x = cands.find(y => r(y) && (!exclu || y.id !== exclu.id)); if (x) return x.menace ? Object.assign({}, x, { phrase: x.menace }) : x; }
    return null;
  }
  function matchPlus(raw, vm, modelAvailable) {
    const home = vm.identity.home, away = vm.identity.away;
    const camps = modelAvailable ? plusCamps(raw, home, away) : null;
    const tranches = plusTranches(raw, modelAvailable);
    const histoire = plusHistoire(camps);
    // « au moins un but apres la 75e » : stat de la competition DU MATCH (lib/stats-book.js,
    // fichier de match.league_id). Avant, le nom venait du profil d'equipe (« des matchs de
    // Ligue 1 » sur un match de coupe), jusque sur l'image a partager (verdict du 30/09/2026).
    const ligueNom = vm.identity.league.name;
    const cands = plusCandidates(vm.bookStats, home, away, ligueNom);
    const chiffreFou = plusChiffreFou(cands);
    const piege = plusPiege(cands, camps, chiffreFou);
    // Carte a partager : RIEN du pari (ni marche, ni cote, ni probabilite de pari).
    // « Fiabilité : en test » (competition non validee, selections) : l'image le dit aussi
    // (avocat du diable, 01/10/2026), comme la page.
    const enTest = raw.league_reliability === 'en_test' || estSelectionNationale(raw);
    const partage = histoire ? Object.assign({
      ligue: vm.identity.league.name, domicile: home.short, exterieur: away.short, histoire,
      chiffre: chiffreFou ? { grand: chiffreFou.grand, phrase: chiffreFou.phrase, detail: chiffreFou.detail } : null
    }, enTest ? { enTest: true } : {}) : null;
    // « Si... alors... » : masque pour une competition « en test » et pour les selections
    // nationales (verdict du mathematicien, 30/09/2026).
    const sansSiAlors = raw.league_reliability === 'en_test' || estSelectionNationale(raw);
    return { camps, histoire, tranches, siAlors: sansSiAlors ? null : plusSiAlors(tranches, camps), buteurs: plusButeurs(vm.players.scoringThreat, home, away), chiffreFou, piege, partage };
  }
  return { buildMatchViewModel, arrondi1, chanceDuPari, scoreAudacieux, localizedNarrative, frequenceCalibree, origineProbabilite, fiabiliteAffichee, estSelectionNationale, SELECTIONS_IDS, bookStats, jourUtcBook, nomCourt, nomOfficiel, FRAICHEUR_BOOK_J, matchPlus, MATCH_PLUS };
});
