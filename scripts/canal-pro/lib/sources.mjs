// Sources de donnees du Canal Pro (appels reseau). Chaque fonction renvoie
// null quand la donnee manque : jamais de valeur inventee.
//   - Sortie du moteur v3 (contrat 1.1) : les chances (MOTEUR_V3_SORTIE = fichier
//     ou dossier sortie/, sinon la table privee moteur_v3_sorties, deposee chaque
//     matin par le workflow « Update IASHARK Daily »). Lue AVANT les cotes : sans
//     sortie valable, aucun credit de cotes n'est depense.
//   - The Odds API (ODDS_API_KEY) : cotes de Pinnacle et des 5 agrees suivis
//     (preparation, dernier controle, releves), vraies cotes double chance.
//   - API-Football (APISPORTS_KEY) : compositions, resultats, buteurs du match,
//     statistiques (buts attendus, tirs, arrets), ville du stade.
//   - OpenWeather (OPENWEATHER_KEY) : prevision meteo a l'heure du match.
//   - data.json du site (depot) : match du duel et choix du modele.
//   - Table odds_snapshots (LECTURE SEULE, 03/10/2026) : flux de cotes API-Football releve chaque matin
//     par le pipeline (~70 marches, bet365, Pinnacle…), pour les marches de config/marches-valides.json.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as C from "../../../supabase/functions/_shared/canal-pro.mjs";
import * as M from "../../../supabase/functions/_shared/canal-pro-menu.mjs";
import * as FLUX from "../../../supabase/functions/_shared/marches-flux.mjs";

const require = createRequire(import.meta.url);
// MODE ECONOMIE (03/10/2026) : compteurs lus dans les en-tetes des API, plafonds de config/quotas.json.
const QUOTAS = require("../../../lib/quotas.js");

// Les championnats du menu (REGLE-VIP.md, bornes par les ligues validees de la config), avec leur cle The Odds API et leur code football-data (moteur v3).
export const LIGUES_MENU = [
  ["soccer_spain_la_liga", "SP1"], ["soccer_germany_bundesliga", "D1"], ["soccer_italy_serie_a", "I1"],
  ["soccer_france_ligue_one", "F1"], ["soccer_netherlands_eredivisie", "N1"], ["soccer_portugal_primeira_liga", "P1"],
].filter(([, code]) => M.MENU.ligues[code]).map(([sport, code]) => ({ sport, code, nom: M.MENU.ligues[code] }));
// ^ seulement les ligues VALIDEES de la fusion (config/leagues.json, canal-pro-menu.mjs#liguesValidees).
// RELEVES (preparation, dernier controle, guetteur, compositions, dernier releve avant le match) :
// Pinnacle (reference et cloture) et les 5 agrees suivis. Une liste de 10 bookmakers au plus
// coute le prix d'une seule zone : 1 credit par couple ligue-marche.
// Espagne (02/10/2026) : + les flux des operateurs DGOJ suivis (canal-pro.mjs#BOOKMAKERS_AGREES.ES) ; 10 au plus.
export const BOOKMAKERS_RELEVES = ["pinnacle", ...C.clesOddsApi()].slice(0, 10).join(",");
// Vraie cote double chance : endpoint par match (1 credit par match), seulement pour les matchs ou le
// moteur v3 propose une double chance dans une fourchette du menu. Plafond par preparation.
export const DC_MAX_EVENEMENTS = 20;

/**
 * Matchs du site (data.json du depot, mis a jour par le pipeline) : la voie « cotes du marche » y lit les
 * matchs de ses competitions (identifiant API-Football = match relie aux resultats). Illisible : aucun.
 */
export function lireMatchsSite(fichier) {
  try { const j = JSON.parse(fs.readFileSync(fichier, "utf8")); return Array.isArray(j) ? j : Array.isArray(j?.matchs) ? j.matchs : []; }
  catch { return []; }
}

const normNom = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\b(fc|afc|cf|sc|ac|as|ssc|us|rc|sv|vfb|vfl|tsg|fsv|1\.|club|de|calcio)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
export function memeEquipe(a, b) {
  const x = normNom(a), y = normNom(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const mx = x.split(" ").filter((m) => m.length >= 4), my = new Set(y.split(" ").filter((m) => m.length >= 4));
  if (mx.some((m) => my.has(m))) return true;
  // Noms football-data abreges (moteur v3) : « M'gladbach » / « Borussia Monchengladbach ».
  return [...mx, ...my].some((m) => m.length >= 6 && x.includes(m) && y.includes(m));
}

export function creerSources(env, { log = console.log, db = null, fetchFn = (...a) => fetch(...a), maintenant = () => new Date() } = {}) {
  const cache = new Map();
  // Etat des quotas : celui publie par le pipeline (debut de journee The Odds API), complete par les
  // en-tetes lus pendant ce tour. Jamais ecrit ici (le robot ne publie pas de fichier).
  const config = QUOTAS.lireConfig(env.QUOTAS_CONFIG || undefined);
  const etat = QUOTAS.lireEtat(env.QUOTAS_ETAT || undefined);
  const economie = { odds_payants: 0, odds_gratuits: 0, odds_refuses: 0, odds_evites_sans_match: 0, api_football: 0 };
  /** Appel The Odds API payant permis ? Les appels essentiels passent toujours. */
  const oddsPermis = (essentiel) => {
    const ok = QUOTAS.autorise("odds_api", etat, config, { essentiel, maintenant: maintenant() });
    if (!ok) economie.odds_refuses++;
    return ok;
  };
  // Un echec n'est pas garde en memoire : le prochain essai rappelle vraiment l'API.
  const memo = async (cle, f) => { if (!cache.has(cle)) cache.set(cle, f().catch((e) => { cache.delete(cle); throw e; })); return cache.get(cle); };
  const bookmakersReleves = env.ODDS_BOOKMAKERS || BOOKMAKERS_RELEVES;

  /** Appel The Odds API. Panne, cle refusee ou credits epuises : ERREUR (jamais avalee). */
  async function oddsApi(chemin, params) {
    if (!env.ODDS_API_KEY) throw new Error("ODDS_API_KEY manquante");
    const q = new URLSearchParams({ apiKey: env.ODDS_API_KEY, oddsFormat: "decimal", dateFormat: "iso", ...params });
    let r;
    try { r = await fetchFn(`https://api.the-odds-api.com/v4/${chemin}?${q}`); }
    catch (e) { throw new Error(`The Odds API injoignable : ${e.message}`); }
    QUOTAS.noterOddsApi(etat, QUOTAS.entetesOddsApi(r.headers), maintenant());
    if (/\/events$/.test(chemin)) economie.odds_gratuits++; else economie.odds_payants++;
    const reste = r.headers.get("x-requests-remaining");
    if (reste && Number(reste) < 500) log(`The Odds API : plus que ${reste} credits`);
    if (!r.ok) { const e = new Error(`The Odds API ${chemin.split("/")[1]} : ${r.status} ${(await r.text()).slice(0, 150)}`); e.status = r.status; throw e; }
    return r.json();
  }
  /**
   * Appel API-Football. ATTENTION : en panne, cle refusee ou credits du jour epuises, API-Football
   * repond souvent 200 avec le motif dans « errors » (et response: []). C'est une ERREUR, jamais
   * « aucun match ».
   */
  async function apiFootball(chemin, params) {
    if (!env.APISPORTS_KEY) throw new Error("APISPORTS_KEY manquante");
    let r;
    try { r = await fetchFn(`https://v3.football.api-sports.io/${chemin}?${new URLSearchParams(params)}`, { headers: { "x-apisports-key": env.APISPORTS_KEY } }); }
    catch (e) { throw new Error(`API-Football injoignable : ${e.message}`); }
    economie.api_football++;
    QUOTAS.noterApiFootball(etat, QUOTAS.entetesApiFootball(r.headers), maintenant());
    if (!r.ok) { const e = new Error(`API-Football ${chemin} : ${r.status}`); e.status = r.status; throw e; }
    const j = await r.json().catch(() => null);
    const errs = j?.errors;
    const nErr = !errs ? 0 : Array.isArray(errs) ? errs.length : typeof errs === "object" ? Object.keys(errs).length : String(errs).length;
    if (nErr) throw new Error(`API-Football ${chemin} : ${JSON.stringify(errs).slice(0, 150)}`);
    if (!j || !Array.isArray(j.response)) throw new Error(`API-Football ${chemin} : réponse illisible`);
    return j.response;
  }
  const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");
  /**
   * MODE ECONOMIE (config/quotas.json#odds_api.evenements_avant_cotes) : /events est GRATUIT. On ne paie
   * les cotes d'une competition que si The Odds API y montre au moins un match dans la fenetre.
   */
  async function aDesMatchs(sport, debut, fin) {
    if (config.odds_api && config.odds_api.evenements_avant_cotes === false) return true;
    const evs = await oddsApi(`sports/${sport}/events`, { commenceTimeFrom: iso(debut), commenceTimeTo: iso(fin) });
    if (Array.isArray(evs) && evs.length) return true;
    economie.odds_evites_sans_match++;
    return false;
  }

  /**
   * Sortie du moteur v3 : MOTEUR_V3_SORTIE (fichier, ou dossier sortie/ : le fichier le plus recent),
   * sinon la derniere ligne de la table privee moteur_v3_sorties. Verifiee (contrat 1.1, 26 h au plus,
   * interrupteur d'urgence) : sinon ERREUR « Moteur v3 : … » (programme reporte, aucun credit de cotes).
   */
  async function sortieV3(maintenant) {
    let sortie = null;
    if (env.MOTEUR_V3_SORTIE) {
      let fichier = env.MOTEUR_V3_SORTIE;
      if (fs.existsSync(fichier) && fs.statSync(fichier).isDirectory()) {
        const f = fs.readdirSync(fichier).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
        if (!f) throw new Error(`Moteur v3 : aucun fichier de sortie dans ${env.MOTEUR_V3_SORTIE}`);
        fichier = path.join(fichier, f);
      }
      try { sortie = JSON.parse(fs.readFileSync(fichier, "utf8")); }
      catch (e) { throw new Error(`Moteur v3 : sortie illisible (${e.message.slice(0, 120)})`); }
    } else if (db) {
      let lignes;
      try { lignes = await db.select("moteur_v3_sorties", {}, { ordre: "genere_le.desc", limite: 1 }); }
      catch (e) { throw new Error(`Moteur v3 : table moteur_v3_sorties illisible (${e.status || e.message})`); }
      if (!lignes.length) throw new Error("Moteur v3 : aucune sortie déposée dans la base");
      sortie = lignes[0].sortie;
    } else throw new Error("Moteur v3 : MOTEUR_V3_SORTIE non renseigné");
    const v = M.verifierSortie(sortie, maintenant);
    if (!v.ok) throw new Error(`Moteur v3 : ${v.raison}`);
    return sortie;
  }
  /** Vraie cote double chance d'un match (endpoint par match) fusionnee dans ses cotes. 404/422 : pas de double chance. */
  async function ajouterDoubleChance(c, noms) {
    let ev;
    try { ev = await oddsApi(`sports/${c.sport_key}/events/${c.event_id}/odds`, { bookmakers: bookmakersReleves, markets: "double_chance" }); }
    catch (e) { if ([404, 422].includes(e.status)) { log(`double chance indisponible (${e.status}) pour ${noms.home_team} - ${noms.away_team}`); return; } throw e; }
    for (const [bk, r] of Object.entries(C.booksDepuisOddsApi({ ...ev, home_team: noms.home_team, away_team: noms.away_team }))) if (r.dc) (c.books[bk] ||= { nom: r.nom }).dc = r.dc;
  }

  /**
   * Dernier releve du flux de cotes API-Football de chaque match (table odds_snapshots, lecture seule) :
   * { fixture: { raw, captured_at } }. Pas de base ou liste blanche vide : {} (aucun appel).
   * Table illisible : {} et une ligne de journal (les autres voies continuent).
   */
  async function fluxDesMatchs(fixtures) {
    const ids = [...new Set(fixtures.map(Number).filter((x) => x > 0))];
    const out = {};
    if (!db || !ids.length || !M.CONFIG_FLUX.marches.size) return out;
    try {
      for (let i = 0; i < ids.length; i += 40) {
        const lignes = await db.select("odds_snapshots", { fixture_id: ["in", ids.slice(i, i + 40)] }, { ordre: "captured_at.desc", colonnes: "fixture_id,captured_at,raw_odds" });
        for (const l of lignes) if (!out[l.fixture_id] && l.raw_odds) out[l.fixture_id] = { raw: l.raw_odds, captured_at: l.captured_at };
      }
    } catch (e) { log(`flux de cotes API-Football illisible (${e.status || e.message}) : marches du flux non evalues`); return {}; }
    return out;
  }

  return {
    sortieV3,
    fluxDesMatchs,
    /** MODE ECONOMIE : situation des quotas vue par ce tour (en-tetes lus) et compteurs du tour. */
    quotas() { return { situation: QUOTAS.situation(etat, config, maintenant()), etat, config, tour: { ...economie } }; },
    /**
     * Le menu du jour (canal-pro-menu.mjs#construireMenu) : { candidats, nonEvalues, evenements, ecartes }.
     * 1. sortie du moteur v3 (erreur « Moteur v3 : … » : rien d'autre n'est appele) ;
     * 2. The Odds API : 1 appel par championnat qui a un match (h2h : Pinnacle + 5 agrees suivis), puis la
     *    vraie cote double chance des matchs ou elle peut servir ;
     * 3. la regle. Un match du v3 sans cotes des agrees est « non evalue » (jamais « ne passe pas nos
     *    criteres ») ; si AUCUN match n'a pu etre evalue, la journee est traitee comme une panne.
     */
    async candidats(jour, maintenant) {
      const sortie = await sortieV3(maintenant);
      const { debut, fin } = C.fenetreProgramme(jour);
      const fw = C.nomJour(jour) === "vendredi" ? M.fenetreWeekend(jour) : null;
      const matchsJour = M.matchsMenu(sortie, debut, fin);
      const matchsWeekend = fw ? M.matchsMenu(sortie, fw.debut, fw.fin) : [];
      // Voie « cotes du marche » (02/10/2026) : matchs du site des competitions de la liste a part.
      const site = Object.keys(M.MENU.ligues_cotes_marche).length ? lireMatchsSite(env.DATA_JSON || "data.json") : [];
      const marcheJour = M.matchsCotesMarche(site, debut, fin);
      const marcheWeekend = fw ? M.matchsCotesMarche(site, fw.debut, fw.fin) : [];
      const tous = [...new Map([...matchsJour, ...matchsWeekend].map((m) => [m.match_id, m])).values()];
      const tousMarche = [...new Map([...marcheJour, ...marcheWeekend].map((m) => [m.match_id, m])).values()];
      if (!tous.length && !tousMarche.length) return { candidats: [], nonEvalues: [], evenements: 0, ecartes: [] };
      const releve_at = new Date(maintenant).toISOString();
      const cotesParMatch = {}, noms = {};
      for (const l of LIGUES_MENU) {
        const ms = tous.filter((m) => m.ligue_code === l.code);
        if (!ms.length) continue;
        let evs = [];
        // Seul un championnat inconnu de l'API (404) est saute ; toute autre erreur arrete la preparation.
        try {
          if (!(await aDesMatchs(l.sport, debut, fw ? fw.fin : fin))) continue;
          evs = await oddsApi(`sports/${l.sport}/odds`, { bookmakers: bookmakersReleves, markets: "h2h", commenceTimeFrom: iso(debut), commenceTimeTo: iso(fw ? fw.fin : fin) });
        }
        catch (e) { if (e.status === 404) { log(e.message); continue; } throw e; }
        for (const m of ms) {
          const ev = evs.filter((e) => Math.abs(Date.parse(e.commence_time) - m._ko) <= 3 * 3600e3 && memeEquipe(e.home_team, m.domicile) && memeEquipe(e.away_team, m.exterieur));
          if (ev.length !== 1) continue; // introuvable ou ambigu : jamais devine
          cotesParMatch[m.match_id] = { event_id: ev[0].id, sport_key: l.sport, books: C.booksDepuisOddsApi(ev[0]), releve_at };
          noms[m.match_id] = { home_team: ev[0].home_team, away_team: ev[0].away_team };
        }
      }
      // Voie « cotes du marche » : 1 appel par competition qui a un match (h2h, et totals si les buts 2,5 y sont autorises).
      for (const [cle, l] of Object.entries(M.MENU.ligues_cotes_marche)) {
        const ms = tousMarche.filter((m) => m.ligue_cle === cle);
        if (!ms.length || !l.sport) continue; // competition sans cle The Odds API : matchs « non evalues »
        let evs = [];
        try {
          if (!(await aDesMatchs(l.sport, debut, fw ? fw.fin : fin))) continue;
          evs = await oddsApi(`sports/${l.sport}/odds`, { bookmakers: bookmakersReleves, markets: l.marches.includes("O25") ? "h2h,totals" : "h2h", commenceTimeFrom: iso(debut), commenceTimeTo: iso(fw ? fw.fin : fin) });
        }
        catch (e) { if ([404, 422].includes(e.status)) { log(e.message); continue; } throw e; }
        for (const m of ms) {
          const ev = evs.filter((e) => Math.abs(Date.parse(e.commence_time) - m._ko) <= 3 * 3600e3 && memeEquipe(e.home_team, m.domicile) && memeEquipe(e.away_team, m.exterieur));
          if (ev.length !== 1) continue; // introuvable ou ambigu : jamais devine
          cotesParMatch[m.match_id] = { event_id: ev[0].id, sport_key: l.sport, books: C.booksDepuisOddsApi(ev[0]), releve_at };
          noms[m.match_id] = { home_team: ev[0].home_team, away_team: ev[0].away_team };
        }
      }
      let n = 0;
      for (const m of tous) {
        const c = cotesParMatch[m.match_id];
        const utile = (m.marches || []).some((x) => String(x.cle).startsWith("DC:") && x.eligible_vip && Number(x.cote_disponible) >= 1.2 && Number(x.cote_disponible) <= 2.0);
        if (!c || !utile || n >= DC_MAX_EVENEMENTS) continue;
        n++;
        await ajouterDoubleChance(c, noms[m.match_id]);
      }
      for (const m of tousMarche) {
        const c = cotesParMatch[m.match_id];
        if (!c || n >= DC_MAX_EVENEMENTS || !M.MENU.ligues_cotes_marche[m.ligue_cle]?.marches.includes("1X")) continue;
        const { moy } = M.chancesCotesMarche(c.books);
        if (!["1X", "X2", "12"].some((k) => moy[k] >= 1.2 && moy[k] <= 2.0)) continue; // double chance hors des fourchettes : pas d'appel
        n++;
        await ajouterDoubleChance(c, noms[m.match_id]);
      }
      // Marches du flux API-Football (liste blanche config/marches-valides.json) : lecture seule de odds_snapshots.
      const fluxParFixture = await fluxDesMatchs(M.matchsFlux(tous, tousMarche).map((m) => m.fixture));
      return M.construireMenu({ jour, matchsJour, matchsWeekend, cotesParMatch, marcheJour, marcheWeekend, fluxParFixture, maintenant });
    },
    /**
     * Etat actuel de chaque pari (dernier controle, releves) : simple -> etatMarche ; pari a plusieurs
     * selections -> { jambes: [etatMarche | null] } ; buteur : rien (pas de cote buteur). Panne : ERREUR.
     */
    async etatsParis(paris, _d, { essentiel = true } = {}) {
      // MODE ECONOMIE : un releve NON essentiel (suivi des cotes pour les alertes) est refuse au-dela du
      // plafond du jour ou de 95 % du mois : ERREUR explicite, jamais un « rien n'a bouge ».
      if (!oddsPermis(essentiel)) { const e = new Error("mode économie : plafond de crédits The Odds API atteint, relevé non essentiel reporté"); e.plafond = true; throw e; }
      const legs = [];
      for (const p of paris) {
        if (p.famille === "buteur") continue;
        (C.estCombine(p) ? p.selections || [] : [p]).forEach((j, k) => legs.push({ pid: p.id, k, event_id: j.event_id, sport_key: j.sport_key, marche: j.marche, ligne: j.ligne ?? null,
          fixture: j.fixture_id ?? p.fixture_id ?? null, flux: j.flux?.code || p.composantes?.flux?.code || (FLUX.lireCode(j.marche) ? j.marche : null) }));
      }
      const books = {}, noms = {};
      const parSport = new Map();
      for (const l of legs) if (l.event_id && l.sport_key) parSport.set(l.sport_key, new Set([...(parSport.get(l.sport_key) || []), l.event_id]));
      // Buts 2,5 (voie « cotes du marche ») : le marche « totals » est releve aussi pour ce championnat.
      const avecButs = new Set(legs.filter((l) => ["O25", "U25"].includes(l.marche)).map((l) => l.sport_key));
      for (const [sport, ids] of parSport) {
        const evs = await oddsApi(`sports/${sport}/odds`, { bookmakers: bookmakersReleves, markets: avecButs.has(sport) ? "h2h,totals" : "h2h", eventIds: [...ids].join(",") });
        for (const ev of evs) { books[ev.id] = C.booksDepuisOddsApi(ev); noms[ev.id] = { home_team: ev.home_team, away_team: ev.away_team }; }
      }
      for (const id of new Set(legs.filter((l) => ["1X", "X2", "12"].includes(l.marche) && books[l.event_id]).map((l) => l.event_id))) {
        const l = legs.find((x) => x.event_id === id);
        await ajouterDoubleChance({ event_id: id, sport_key: l.sport_key, books: books[id] }, noms[id]);
      }
      // Selections du flux : leur cote bet365 du dernier releve du flux (odds_snapshots).
      const fluxLegs = legs.filter((l) => l.flux && l.fixture);
      const flux = fluxLegs.length ? await fluxDesMatchs(fluxLegs.map((l) => l.fixture)) : {};
      const out = {};
      for (const p of paris) {
        if (p.famille === "buteur") continue;
        const mes = legs.filter((l) => l.pid === p.id);
        const etats = mes.map((l) => {
          const e = books[l.event_id] ? C.etatMarche(books[l.event_id], l.marche, l.ligne == null ? null : Number(l.ligne)) : null;
          if (!l.flux) return e;
          const f = flux[l.fixture];
          const s = f ? FLUX.etatSelection(f.raw, l.flux, { config: M.CONFIG_FLUX }) : null;
          return { ...(e || { cotes: {} }), flux: s ? { ...s, releve_at: new Date(f.captured_at).toISOString() } : null };
        });
        if (C.estCombine(p)) out[p.id] = { jambes: etats };
        else if (etats[0]) out[p.id] = etats[0];
      }
      return out;
    },
    /** Composition officielle + celle du match precedent de chaque equipe, ou null si pas encore publiee. */
    async composition(fixtureId) {
      const [fx] = await apiFootball("fixtures", { id: fixtureId });
      if (!fx) return null;
      if (["PST", "CANC", "ABD", "SUSP"].includes(fx.fixture.status.short)) return { statut_match: fx.fixture.status.short, equipes: [] };
      const lineups = await apiFootball("fixtures/lineups", { fixture: fixtureId });
      if (lineups.length < 2 || lineups.some((l) => (l.startXI || []).length < 11)) return null;
      const equipes = [];
      for (const l of lineups) {
        const prec = (await apiFootball("fixtures", { team: l.team.id, last: 1 }))[0];
        let precedent = null;
        if (prec && prec.fixture.id !== fixtureId) {
          const pl = (await apiFootball("fixtures/lineups", { fixture: prec.fixture.id, team: l.team.id }))[0];
          if (pl) precedent = { titulaires: pl.startXI.map((x) => x.player.id), formation: pl.formation };
        }
        equipes.push({ nom: l.team.name, titulaires: l.startXI.map((x) => x.player.id), remplacants: (l.substitutes || []).map((x) => x.player.id), formation: l.formation, precedent });
      }
      return { statut_match: fx.fixture.status.short, equipes };
    },
    /** Joueurs du match (API-Football /fixtures/players) : { marqueurs: [ids], joueurs: [ids qui ont joue] }, ou null. */
    async buteursDuMatch(fixtureId) {
      const eq = await apiFootball("fixtures/players", { fixture: fixtureId });
      if (!eq.length) return null;
      const marqueurs = [], joueurs = [];
      for (const e of eq) for (const x of e.players || []) {
        const st = x.statistics?.[0] || {};
        if (Number(st.games?.minutes) > 0) joueurs.push(x.player.id);
        if (Number(st.goals?.total) >= 1) marqueurs.push(x.player.id);
      }
      return { marqueurs, joueurs };
    },
    /** Resultat a 90 minutes + faits du match (buts attendus, tirs, arrets). */
    async resultat(fixtureId) {
      const [fx] = await apiFootball("fixtures", { id: fixtureId });
      if (!fx) return null;
      const statut = fx.fixture.status.short;
      const ft = fx.score?.fulltime || {};
      let faits = null;
      if (["FT", "AET", "PEN"].includes(statut)) {
        const st = await apiFootball("fixtures/statistics", { fixture: fixtureId }).catch(() => []);
        const lire = (t) => {
          const s = Object.fromEntries((t?.statistics || []).map((x) => [x.type, x.value]));
          const n = (v) => (v == null || v === "" ? null : Number(String(v).replace("%", "")));
          return { xg: n(s.expected_goals), tirs: n(s["Total Shots"]), arrets: n(s["Goalkeeper Saves"]), corners: n(s["Corner Kicks"]), jaunes: n(s["Yellow Cards"]), rouges: n(s["Red Cards"]) };
        };
        const dom = st.find((x) => x.team?.id === fx.teams.home.id), ext = st.find((x) => x.team?.id === fx.teams.away.id);
        if (dom || ext) faits = { dom: lire(dom), ext: lire(ext) };
      }
      // Faits pour les marches du flux (marches-flux.mjs#reglerFlux) : score a la pause, corners, cartons (jaunes + rouges).
      const ht = fx.score?.halftime || {};
      const paire = (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? [a, b] : null);
      // API-Football ecrit null pour 0 dans ses statistiques : 0 quand les statistiques des DEUX equipes existent.
      const deux = !!(faits?.dom && faits?.ext);
      const stat = (k) => (deux ? paire(faits.dom[k] ?? 0, faits.ext[k] ?? 0) : null);
      const cartons = deux ? paire((faits.dom.jaunes ?? 0) + (faits.dom.rouges ?? 0), (faits.ext.jaunes ?? 0) + (faits.ext.rouges ?? 0)) : null;
      return { statut, bd: ft.home ?? fx.goals?.home ?? null, be: ft.away ?? fx.goals?.away ?? null, faits,
        ht: paire(ht.home, ht.away), corners: stat("corners"), cartons };
    },
    /** Prevision a l'heure du match, a la ville du stade. */
    async meteo(fixtureId, coupEnvoi) {
      if (!env.OPENWEATHER_KEY) return null;
      const [fx] = await apiFootball("fixtures", { id: fixtureId });
      const ville = fx?.fixture?.venue?.city;
      if (!ville) return null;
      const geo = await (await fetch(`https://api.openweathermap.org/geo/1.0/direct?${new URLSearchParams({ q: ville.split(",")[0], limit: "1", appid: env.OPENWEATHER_KEY })}`)).json();
      if (!geo?.[0]) return null;
      const f = await (await fetch(`https://api.openweathermap.org/data/2.5/forecast?${new URLSearchParams({ lat: geo[0].lat, lon: geo[0].lon, units: "metric", appid: env.OPENWEATHER_KEY })}`)).json();
      const t = Date.parse(coupEnvoi) / 1000;
      const prevision = (f.list || []).sort((a, b) => Math.abs(a.dt - t) - Math.abs(b.dt - t))[0];
      return prevision && Math.abs(prevision.dt - t) <= 2 * 3600 ? { ville: ville.split(",")[0], prevision } : null;
    },
    /**
     * Competitions preferees (information seulement, 03/10/2026) : matchs du jour (de maintenant a 23 h 59,
     * heure de Paris) des competitions de la liste, lus dans data.json du pipeline ; pages publiees (page_dirs)
     * lues dans data-home.json. { cle, genre: 'jour', matchs }. Aucun appel reseau.
     */
    async infosJour(jour, maintenant) {
      const site = lireMatchsSite(env.DATA_JSON || "data.json");
      const pages = new Map(lireMatchsSite(env.DATA_HOME_JSON || "data-home.json").filter((m) => Array.isArray(m?.page_dirs)).map((m) => [String(m.id), m.page_dirs]));
      const avec = site.map((m) => (pages.has(String(m?.id)) && !m.page_dirs ? { ...m, page_dirs: pages.get(String(m.id)) } : m));
      return { cle: `jour-${jour}`, genre: "jour", matchs: C.matchsDesCompetitions(avec, maintenant, C.parisVersDate(jour, "23:59")) };
    },
    /**
     * Resultats d'hier (de hier 0 h a aujourd'hui 6 h, heure de Paris : les matchs de la nuit compris) des
     * competitions de la liste, lus dans le registre des pages match du pipeline (score final connu seulement).
     */
    async resultatsHier(jour) {
      let registre = null;
      try { registre = JSON.parse(fs.readFileSync(env.REGISTRE_PAGES || "data/match-pages-registry.json", "utf8")); } catch { registre = null; }
      return { cle: `hier-${jour}`, genre: "hier", matchs: C.resultatsDesCompetitions(registre, C.parisVersDate(C.jourSuivant(jour, -1), "00:00"), C.parisVersDate(jour, "06:00")) };
    },
    /** Match du duel : une grosse affiche du jour (au moins 2 h apres), avec des chiffres du modele publiables. */
    async matchDuel(jour, maintenant) {
      const P = require("../../../lib/telegram-posts.js");
      const lire = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
      const full = lire(env.DATA_JSON || "data.json");
      const liste = (full?.matchs || full || []).filter((m) => m && m.status === "NS" && String(m.date || "").slice(0, 10) === jour && P.chiffresFiables(m));
      const min = C.paris(new Date(new Date(maintenant).getTime() + 2 * 3600e3)).hm.replace(":", "h");
      const s = P.sondage({ matchs: liste.map((m) => ({ ...m, is_free: false })) }, jour, min);
      if (!s) return null;
      const m = liste.find((x) => String(x.id) === String(s.matchId));
      return { fixture_id: Number(m.id) || null, dom: P.equipe(m.home), ext: P.equipe(m.away), competition: m.league || "",
        coup_envoi: C.parisVersDate(jour, String(m.date).slice(11, 16)).toISOString(), p1: m.p1, pn: m.pn, p2: m.p2 };
    },
  };
}
