"use strict";
// MODE ECONOMIE (03/10/2026) : client The Odds API du pipeline (update-data.yml).
//
// Regles (config/quotas.json#odds_api) :
//   1. /events d'abord (GRATUIT) : on ne paie les cotes d'une competition que si elle a un
//      match dans la fenetre (pipeline_fenetre_heures) ;
//   2. UN seul appel payant par competition et par lancement (h2h + totals = 2 credits,
//      Pinnacle + les agrees suivis = 10 bookmakers au plus = 1 seule region), partage par
//      getPinnacleOdds (cote de reference) et lib/cote-anj.js (cote affichee) ;
//   3. les autres marches (double chance, les deux marquent) : endpoint par match, plafonne
//      (max_evenements_par_jour, max_evenements_selections_nationales) ;
//   4. au-dela du plafond du jour ou de minimum_pct du mois (lib/quotas.js) : plus aucun appel
//      payant non essentiel (les cotes restent facultatives : repli Pinnacle API-Football, puis
//      cote indicative). Jamais une cote inventee.
// fetchBrut(url) -> Promise<{ ok, status, headers, json() }> (fetch de Node), injectable pour les tests.

const QUOTAS = require("./quotas.js");

function creerClientOddsApi(opts) {
  opts = opts || {};
  const cfg = opts.config || QUOTAS.CONFIG_DEFAUT;
  const od = cfg.odds_api || {};
  const etat = opts.etat || QUOTAS.etatVide();
  const log = opts.log || function () {};
  const fetchBrut = opts.fetchBrut || ((url) => fetch(url));
  const maintenant = () => (opts.maintenant ? new Date(opts.maintenant) : new Date());
  const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  const marches = od.marches_releve_general || "h2h,totals";
  const fenetreMs = (od.pipeline_fenetre_heures || 48) * 3600e3;
  const rapport = { appels_gratuits: 0, appels_payants: 0, credits: 0, evites_sans_match: 0, refuses_plafond: 0, evenements: 0, evenements_refuses: 0 };
  const memoEvents = new Map(), memoCotes = new Map();
  let nEvenements = 0, nEvenementsNationaux = 0;

  async function appel(chemin, params, payant) {
    if (!opts.cle) throw new Error("ODDS_API_KEY absente");
    const q = new URLSearchParams(Object.assign({ apiKey: opts.cle, dateFormat: "iso" }, payant ? { oddsFormat: "decimal" } : {}, params || {}));
    const r = await fetchBrut("https://api.the-odds-api.com/v4/" + chemin + "?" + q.toString());
    const info = QUOTAS.entetesOddsApi(r && r.headers);
    if (info) QUOTAS.noterOddsApi(etat, info, maintenant());
    if (payant) { rapport.appels_payants++; rapport.credits += info && info.dernier != null ? info.dernier : 0; }
    else rapport.appels_gratuits++;
    if (!r || !r.ok) { const e = new Error("The Odds API " + chemin.split("/").slice(0, 3).join("/") + " : HTTP " + (r && r.status)); e.status = r && r.status; throw e; }
    return r.json();
  }
  const permis = (essentiel) => {
    const ok = QUOTAS.autorise("odds_api", etat, cfg, { essentiel: !!essentiel, maintenant: maintenant() });
    if (!ok) rapport.refuses_plafond++;
    return ok;
  };

  /** Matchs a venir d'une competition (GRATUIT). */
  async function evenements(sport) {
    if (!memoEvents.has(sport)) {
      const t = maintenant().getTime();
      memoEvents.set(sport, appel("sports/" + sport + "/events", { commenceTimeFrom: iso(t), commenceTimeTo: iso(t + fenetreMs) }, false)
        .then((x) => (Array.isArray(x) ? x : [])).catch((e) => { memoEvents.delete(sport); throw e; }));
    }
    return memoEvents.get(sport);
  }

  /**
   * Cotes h2h + totals d'une competition (Pinnacle + agrees suivis), 1 appel payant par lancement.
   * [] sans appel payant si /events ne montre aucun match dans la fenetre, ou si le plafond est atteint.
   */
  async function cotesCompetition(sport, o) {
    o = o || {};
    if (memoCotes.has(sport)) return memoCotes.get(sport);
    const p = (async () => {
      if (od.evenements_avant_cotes !== false) {
        const evs = await evenements(sport);
        if (!evs.length) { rapport.evites_sans_match++; return []; }
      }
      if (!permis(o.essentiel)) return [];
      const t = maintenant().getTime();
      const x = await appel("sports/" + sport + "/odds", { bookmakers: opts.bookmakers || "pinnacle", markets: marches, commenceTimeFrom: iso(t), commenceTimeTo: iso(t + fenetreMs) }, true);
      return Array.isArray(x) ? x : [];
    })().catch((e) => { memoCotes.delete(sport); throw e; });
    memoCotes.set(sport, p);
    return p;
  }

  /**
   * REPLI SELECTIONS (03/10/2026, lib/cotes-selections-repli.js) : cotes 1N2 de TOUS les bookmakers
   * de la region (defaut eu), marche h2h seul = 1 credit, 1 appel par competition et par lancement.
   * [] sans appel payant si /events ne montre aucun match dans la fenetre ou si lib/quotas.js refuse.
   */
  const memoRegion = new Map();
  async function cotes1N2Region(sport, o) {
    o = o || {};
    const region = o.region || "eu";
    const cle = sport + "|" + region;
    if (memoRegion.has(cle)) return memoRegion.get(cle);
    const p = (async () => {
      if (od.evenements_avant_cotes !== false) {
        const evs = await evenements(sport);
        if (!evs.length) { rapport.evites_sans_match++; return []; }
      }
      if (!permis(o.essentiel)) return [];
      const t = maintenant().getTime();
      const x = await appel("sports/" + sport + "/odds", { regions: region, markets: "h2h", commenceTimeFrom: iso(t), commenceTimeTo: iso(t + fenetreMs) }, true);
      return Array.isArray(x) ? x : [];
    })().catch((e) => { memoRegion.delete(cle); throw e; });
    memoRegion.set(cle, p);
    return p;
  }

  /** Autres marches d'un match (endpoint par match), plafonnes par lancement. null = non releve. */
  async function cotesEvenement(sport, eventId, marchesEv, o) {
    o = o || {};
    const max = od.max_evenements_par_jour != null ? od.max_evenements_par_jour : 15;
    const maxNat = od.max_evenements_selections_nationales != null ? od.max_evenements_selections_nationales : 4;
    if (nEvenements >= max || (o.selectionNationale && nEvenementsNationaux >= maxNat) || !permis(o.essentiel)) { rapport.evenements_refuses++; return null; }
    nEvenements++; if (o.selectionNationale) nEvenementsNationaux++;
    rapport.evenements++;
    return appel("sports/" + sport + "/events/" + eventId + "/odds", { bookmakers: opts.bookmakers || "pinnacle", markets: marchesEv }, true);
  }

  /**
   * fetchJson compatible lib/cote-anj.js#poserCotesAnj : les appels « sports/X/odds » sont servis
   * par cotesCompetition (meme reponse que getPinnacleOdds, aucun credit de plus), les appels par
   * match passent par cotesEvenement (plafond). Un refus de plafond = erreur (cote indicative).
   */
  function fetchJsonCoteAnj(estSelectionNationale) {
    return async function (url) {
      const u = new URL(url);
      const m = /^\/v4\/sports\/([^/]+)\/odds\/?$/.exec(u.pathname);
      if (m) return cotesCompetition(m[1]);
      const e = /^\/v4\/sports\/([^/]+)\/events\/([^/]+)\/odds\/?$/.exec(u.pathname);
      if (e) {
        const r = await cotesEvenement(e[1], e[2], u.searchParams.get("markets") || "", { selectionNationale: !!(estSelectionNationale && estSelectionNationale(e[1])) });
        if (r == null) throw new Error("plafond de credits (mode economie)");
        return r;
      }
      throw new Error("appel The Odds API non prevu : " + u.pathname);
    };
  }

  return { evenements, cotesCompetition, cotes1N2Region, cotesEvenement, fetchJsonCoteAnj, rapport, etat };
}

/** Cotes Pinnacle d'un evenement The Odds API -> { c1, cn, c2, over25, under25 } (meme forme que getPinnacleOdds). */
function pinnacleDepuisEvenement(ev) {
  const bk = ev && (ev.bookmakers || []).find((b) => b && b.key === "pinnacle");
  if (!bk) return null;
  const res = {};
  (bk.markets || []).forEach((mkt) => {
    if (mkt.key === "h2h") (mkt.outcomes || []).forEach((o) => { if (o.name === ev.home_team) res.c1 = o.price; else if (o.name === "Draw") res.cn = o.price; else res.c2 = o.price; });
    if (mkt.key === "totals") (mkt.outcomes || []).forEach((o) => { if (o.point === 2.5 && o.name === "Over") res.over25 = o.price; if (o.point === 2.5 && o.name === "Under") res.under25 = o.price; });
    if (mkt.key === "btts") (mkt.outcomes || []).forEach((o) => { if (o.name === "Yes") res.bttsY = o.price; if (o.name === "No") res.bttsN = o.price; });
  });
  return Object.keys(res).length ? res : null;
}

module.exports = { creerClientOddsApi, pinnacleDepuisEvenement };
