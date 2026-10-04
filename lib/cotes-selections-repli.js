"use strict";
// REPLI COTES SELECTIONS (03/10/2026).
//
// Probleme : quand le quota du jour d'API-Football est presque epuise (mode plafond_jour,
// lib/quotas.js), /odds?fixture n'est plus appele et les matchs de Ligue des nations /
// eliminatoires du Mondial zone Europe restent sans cote 1N2 (c1/cn/c2 = "--") : pas de
// pronostic « cotes du marche », pas de selection nationale, pas de match offert.
//
// Repli : pour une competition de config/leagues.json#fiabilite.selections_cotes_marche
// seulement, et seulement si c1/cn/c2 manquent apres API-Football, on lit les cotes 1N2 de
// The Odds API (region eu, marche h2h = 1 credit, 1 appel par competition et par lancement,
// lib/odds-api-econome.js#cotes1N2Region, plafonds de lib/quotas.js).
//
// Aucun nouveau calcul : les cotes sont remises au FORMAT /odds d'API-Football puis passent par
// lib/odds.js#parseOdds (memes bornes 1,05-15, meme mediane multi-bookmakers = « cote
// indicative »), et la suite (marge retiree, lib/chance-iashark.js, lib/pronostic.js) est
// inchangee. Double chance : The Odds API ne la donne pas dans h2h -> reste "--" (jamais
// deduite des cotes 1N2).
//
// Zero donnee du futur (DATA_LEAKAGE_POLICY.md) : seuls les matchs qui n'ont PAS commence au
// moment du releve sont acceptes, seules les cotes dont last_update <= heure du releve sont
// gardees, et chaque cote porte captured_at (heure du releve). Rapprochement strict : memes
// deux equipes (noms ramenes a un nom canonique, lib/noms-equipes-fr.js + alias) ET coup
// d'envoi a 3 h pres ; plusieurs candidats = aucun (jamais de devinette).

const { parseOdds } = require("./odds.js");
const NOMS_FR = require("./noms-equipes-fr.js");

const ECART_COUP_ENVOI_MS = 3 * 3600e3;
const MIN_BOOKMAKERS = 2;
// Somme des 1/cote des medianes : en dessous de 1 = arbitrage impossible (donnee fausse) ;
// au-dela de 1,25 = marge aberrante. Dans les deux cas : aucune cote.
const MARGE_MIN = 1.0, MARGE_MAX = 1.25;

// Variantes de noms (API-Football / The Odds API) absentes de la table d'affichage.
const ALIAS = {
  "fyr macedonia": "north macedonia", "macedonia": "north macedonia", "republic of north macedonia": "north macedonia",
  "czech republic": "czechia", "czech rep": "czechia",
  "rep of ireland": "republic of ireland", "ireland republic": "republic of ireland",
  "bosnia and herzegovina": "bosnia herzegovina", "bosnia herzegovina": "bosnia herzegovina",
  "turkiye": "turkey", "holland": "netherlands", "usa": "united states",
  "korea republic": "south korea", "cote d ivoire": "ivory coast",
};

function plat(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Nom canonique d'une selection (comparaison seulement, jamais affiche). */
function cleEquipe(nom) {
  const brut = String(nom == null ? "" : nom).trim();
  if (!brut) return "";
  // 1) table d'affichage du site (deja maintenue : « FYR Macedonia » et « North Macedonia » -> meme nom)
  const fr = NOMS_FR.nom(brut);
  if (fr !== brut) return "fr:" + plat(fr);
  // 2) alias anglais puis nouvelle tentative sur la table
  let p = plat(brut);
  if (ALIAS[p]) p = ALIAS[p];
  const titre = Object.keys(NOMS_FR.NOMS).find((k) => plat(k) === p);
  if (titre) return "fr:" + plat(NOMS_FR.NOMS[titre]);
  return "en:" + p;
}

function memeEquipe(a, b) { const x = cleEquipe(a), y = cleEquipe(b); return !!x && x === y; }

/**
 * Evenement The Odds API du match (home, away = noms API-Football), ou null.
 * Ordre domicile/exterieur tolere (terrain neutre), mais les cotes sont toujours rattachees par NOM.
 */
function rapprocherEvenement(evenements, home, away, coupEnvoiMs) {
  if (!Array.isArray(evenements) || !Number.isFinite(coupEnvoiMs)) return null;
  const c = evenements.filter((ev) => {
    const t = Date.parse(ev && ev.commence_time);
    if (!Number.isFinite(t) || Math.abs(t - coupEnvoiMs) > ECART_COUP_ENVOI_MS) return false;
    return (memeEquipe(ev.home_team, home) && memeEquipe(ev.away_team, away))
      || (memeEquipe(ev.home_team, away) && memeEquipe(ev.away_team, home));
  });
  return c.length === 1 ? c[0] : null;
}

/**
 * Evenement The Odds API -> objet au format /odds d'API-Football (pari « Match Winner »), ou null.
 * Rejette : match deja commence au releve, cote posterieure au releve, issue introuvable.
 */
function versFormatApiFootball(ev, home, away, releveLe) {
  const tReleve = Date.parse(releveLe);
  if (!ev || !Number.isFinite(tReleve)) return null;
  if (!(Date.parse(ev.commence_time) > tReleve)) return null; // deja commence : jamais
  const bookmakers = [];
  (ev.bookmakers || []).forEach((bk) => {
    const maj = Date.parse(bk && bk.last_update);
    if (Number.isFinite(maj) && maj > tReleve) return; // cote « du futur » : ignoree
    const h2h = (bk.markets || []).find((m) => m && m.key === "h2h");
    if (!h2h) return;
    const v = {};
    (h2h.outcomes || []).forEach((o) => {
      if (!o) return;
      if (o.name === "Draw") v.Draw = o.price;
      else if (memeEquipe(o.name, home)) v.Home = o.price;
      else if (memeEquipe(o.name, away)) v.Away = o.price;
    });
    if (v.Home == null || v.Draw == null || v.Away == null) return;
    bookmakers.push({
      id: "oddsapi:" + bk.key, name: bk.title || bk.key, last_update: bk.last_update || null,
      bets: [{ name: "Match Winner", values: [
        { value: "Home", odd: String(v.Home) }, { value: "Draw", odd: String(v.Draw) }, { value: "Away", odd: String(v.Away) },
      ] }],
    });
  });
  return bookmakers.length ? { source: "the-odds-api", event_id: ev.id || null, commence_time: ev.commence_time, captured_at: releveLe, bookmakers } : null;
}

function aCotes1N2(odds) {
  const ok = (x) => x != null && x !== "--" && Number(x) > 1;
  return !!(odds && ok(odds.c1) && ok(odds.cn) && ok(odds.c2));
}

/** Le repli concerne-t-il ce match ? (competition de selections_cotes_marche ET cotes 1N2 absentes) */
function doitCompleter(odds, leagueKey, configLigues) {
  const liste = ((configLigues && configLigues.fiabilite && configLigues.fiabilite.selections_cotes_marche) || []).map(String);
  return liste.includes(String(leagueKey)) && !aCotes1N2(odds);
}

/**
 * Complete les cotes 1N2 d'un match. Renvoie { odds, resume } (odds = copie completee) ou null.
 * opts : { odds, leagueKey, configLigues, sport, home, away, coupEnvoiMs, client, maintenant }
 * client.cotes1N2Region(sport) (lib/odds-api-econome.js) : 1 appel par competition (memoise).
 */
async function completer(opts) {
  const o = opts || {};
  if (!doitCompleter(o.odds, o.leagueKey, o.configLigues)) return null; // deja des cotes : aucun appel
  if (!o.sport || !o.client || typeof o.client.cotes1N2Region !== "function") return null;
  const releveLe = new Date(o.maintenant || Date.now()).toISOString();
  const evs = await o.client.cotes1N2Region(o.sport);
  const ev = rapprocherEvenement(evs, o.home, o.away, o.coupEnvoiMs);
  if (!ev) return { odds: null, resume: "aucun match The Odds API rapproche (" + o.home + " - " + o.away + ")" };
  const brut = versFormatApiFootball(ev, o.home, o.away, releveLe);
  if (!brut || brut.bookmakers.length < MIN_BOOKMAKERS) return { odds: null, resume: "trop peu de bookmakers (" + (brut ? brut.bookmakers.length : 0) + ")" };
  const p = parseOdds(brut, { fixtureId: o.fixtureId != null ? o.fixtureId : null, capturedAt: releveLe });
  if (!aCotes1N2(p)) return { odds: null, resume: "cotes hors bornes" };
  const somme = 1 / Number(p.c1) + 1 / Number(p.cn) + 1 / Number(p.c2);
  if (!(somme >= MARGE_MIN && somme <= MARGE_MAX)) return { odds: null, resume: "marge aberrante (" + somme.toFixed(3) + ")" };
  // Fusion : seules les cotes 1N2 sont posees ; les autres marches d'API-Football restent tels quels.
  const base = Object.assign({}, o.odds || {});
  const cons = Object.assign({}, base.market_consensus || {}, { "1x2": p.market_consensus["1x2"] });
  const odds = Object.assign(base, {
    c1: p.c1, cn: p.cn, c2: p.c2,
    raw_offers: (Array.isArray(base.raw_offers) ? base.raw_offers : []).concat(p.raw_offers),
    market_consensus: cons,
    source_1n2: "the-odds-api", releve_le_1n2: releveLe, bookmakers_1n2: brut.bookmakers.length,
  });
  return { odds, resume: brut.bookmakers.length + " bookmakers, " + p.c1 + " / " + p.cn + " / " + p.c2 + " (releve " + releveLe + ")" };
}

module.exports = { cleEquipe, memeEquipe, rapprocherEvenement, versFormatApiFootball, aCotes1N2, doitCompleter, completer, ECART_COUP_ENVOI_MS };
