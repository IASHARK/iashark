"use strict";
// UNE SEULE COTE PARTOUT (decision de Clement, 01/10/2026).
//
// La cote affichee pour un pari (page match, espace Pro, Canal Pro, canal gratuit Telegram,
// image a partager) est celle des bookmakers FRANCAIS agrees par l'ANJ que IASHARK suit
// (config/bookmakers-agrees.json, « suivi : true » : Betclic, NetBet, PMU, Unibet, Winamax),
// relevee sur The Odds API (cles *_fr). C'est la cote que les clients jouent vraiment.
//
// Regle de la cote affichee (la MEME que le Canal Pro, canal-pro.mjs#preparerProgramme) :
//   cotes reelles de la selection chez les agrees suivis (garde-fou « plus de 2 fois la
//   moyenne » de canal-pro.mjs#cotesExecutables), puis la MEILLEURE, avec le nom du bookmaker.
// Cote sans marge (sert a chance_iashark, lib/chance-iashark.js) : sur la MEME source,
//   mediane des agrees suivis pour chaque issue, puis marge retiree :
//   - 1N2 : methode de Shin (lib/models.js#shinProbabilities), comme lib/decision.js ;
//   - double chance : somme des deux issues 1N2 sans marge (lib/decision.js#fairMarketProbabilities) ;
//   - plus/moins et les deux marquent : proportionnelle (2 issues).
// Repli : aucune cote ANJ pour ce match (ligue non couverte, marche non propose, panne) ->
//   la cote du pipeline (moyenne API-Football), marquee « cote indicative », SANS nom de
//   bookmaker (jamais un operateur non agree mis en avant).
//
// Aucune probabilite du moteur n'est modifiee, et le choix du pari non plus (il reste fait
// avant, sur les cotes du pipeline) : ce module ne pose que la cote AFFICHEE et sa source.
//
// Cout The Odds API : 1 appel par championnat (h2h + totals = 2 credits, les 6 bookmakers
// relevés tiennent dans une seule « region »), plus 1 credit par match dont le pari est une
// double chance ou « les deux marquent » (endpoint par match), plafonne par run.

const AGREES = require("../config/bookmakers-agrees.json");
const { shinProbabilities } = require("./models.js");

const SOURCE_ANJ = "anj";
const SOURCE_INDICATIVE = "indicative";
const GARDE_FOU_COTE_MAX_SUR_MOYENNE = 2.0; // canal-pro.mjs#REGLES.garde_fou_cote_max_sur_moyenne
const MAX_EVENEMENTS_PAR_RUN = 40;

// Agrees ANJ SUIVIS (les seuls dont IASHARK releve vraiment les cotes), dans l'ordre du fichier.
const SUIVIS = ((AGREES.pays && AGREES.pays.fr && AGREES.pays.fr.bookmakers) || []).filter((b) => b && b.suivi === true);
const BOOKMAKERS_SUIVIS = SUIVIS.map((b) => b.id);
// La meme liste que le Canal Pro (scripts/canal-pro/lib/sources.mjs#BOOKMAKERS_RELEVES) :
// Pinnacle (reference) + les agrees suivis. 10 bookmakers au plus = le prix d'une seule region.
const BOOKMAKERS_RELEVES = ["pinnacle"].concat(BOOKMAKERS_SUIVIS.map((b) => b + "_fr")).join(",");

const ok = (x) => typeof x === "number" && isFinite(x);
const coteLue = (x) => { const v = Number(x); return v > 1 && v < 200 ? v : NaN; };
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function nomBookmaker(cle) {
  const b = SUIVIS.find((x) => x.id === cle);
  return b ? b.nom : null;
}
// Cle The Odds API (« winamax_fr ») -> cle agreee SUIVIE (« winamax »), sinon null.
// Les versions .com / _eu d'un meme operateur ne comptent jamais.
function cleSuivie(cleOddsApi) {
  const s = norm(cleOddsApi).replace(/\s+/g, "");
  if (!s.endsWith("_fr")) return null;
  const base = s.slice(0, -3).replace(/[^a-z0-9]/g, "");
  return BOOKMAKERS_SUIVIS.indexOf(base) !== -1 ? base : null;
}

// ---------------------------------------------------------------- lecture d'un evenement
// Evenement The Odds API -> { cleBookmaker: { '1x2':[d,n,e], dc:{'1X','X2','12'}, ou:{ '2.5':[o,u], ... }, btts:[oui,non] } }
// (meme lecture que canal-pro.mjs#booksDepuisOddsApi pour 1N2 et double chance ; une cote hors
// de ]1 ; 200[ retire tout le marche du bookmaker).
function booksDepuisEvenement(ev) {
  const books = {};
  if (!ev) return books;
  const nd = (x) => norm(x).replace(/[^a-z0-9]+/g, " ").trim();
  const dom = nd(ev.home_team), ext = nd(ev.away_team);
  const issueDc = (nom) => {
    const n = nd(nom);
    if (["1x", "x2", "12"].indexOf(n.replace(/ /g, "")) !== -1) return n.replace(/ /g, "").toUpperCase();
    const d = dom && n.includes(dom), e = ext && n.includes(ext), x = /\bdraw\b|\bnul\b|\bx\b/.test(n);
    if (d && x && !e) return "1X";
    if (e && x && !d) return "X2";
    if (d && e && !x) return "12";
    return null;
  };
  (ev.bookmakers || []).forEach((b) => {
    const rec = {};
    (b.markets || []).forEach((m) => {
      const o = m.outcomes || [];
      const prix = (f) => { const x = o.find(f); return coteLue(x && x.price); };
      if (m.key === "h2h") {
        const v = [prix((x) => x.name === ev.home_team), prix((x) => x.name === "Draw"), prix((x) => x.name === ev.away_team)];
        if (v.every(ok)) rec["1x2"] = v;
      } else if (m.key === "double_chance") {
        const dcs = {};
        o.forEach((x) => { const k = issueDc(x.name), c = coteLue(x.price); if (k && ok(c)) dcs[k] = c; });
        if (Object.keys(dcs).length) rec.dc = dcs;
      } else if (m.key === "totals") {
        const lignes = {};
        o.forEach((x) => { if (ok(Number(x.point))) lignes[String(Number(x.point))] = true; });
        Object.keys(lignes).forEach((l) => {
          const v = [prix((x) => x.name === "Over" && Number(x.point) === Number(l)), prix((x) => x.name === "Under" && Number(x.point) === Number(l))];
          if (v.every(ok)) (rec.ou = rec.ou || {})[l] = v;
        });
      } else if (m.key === "btts") {
        const v = [prix((x) => x.name === "Yes"), prix((x) => x.name === "No")];
        if (v.every(ok)) rec.btts = v;
      }
    });
    if (Object.keys(rec).length) books[b.key] = rec;
  });
  return books;
}

// Marche du site (market_id du pari) -> ce qu'il faut lire chez le bookmaker, ou null (non couvert).
const DC_SITE = { "dc-1x": "1X", "dc-x2": "X2", "dc-12": "12" };
function lectureMarche(marketId) {
  const id = String(marketId || "");
  if (id === "home-win") return { marche: "1x2", i: 0 };
  if (id === "draw") return { marche: "1x2", i: 1 };
  if (id === "away-win") return { marche: "1x2", i: 2 };
  if (DC_SITE[id]) return { marche: "dc", issue: DC_SITE[id] };
  if (id === "btts-yes") return { marche: "btts", i: 0 };
  if (id === "btts-no") return { marche: "btts", i: 1 };
  const ou = /^(over|under)-(\d)(\d)$/.exec(id); // over-25 -> 2.5
  if (ou) return { marche: "ou", ligne: String(Number(ou[2] + "." + ou[3])), i: ou[1] === "over" ? 0 : 1 };
  return null;
}
// Marche qui demande l'appel par match (pas dans /odds : double chance, les deux marquent).
function marcheParEvenement(marketId) {
  const l = lectureMarche(marketId);
  return l && l.marche === "dc" ? "double_chance" : l && l.marche === "btts" ? "btts" : null;
}

function coteDe(rec, l) {
  if (!rec || !l) return NaN;
  if (l.marche === "1x2") return rec["1x2"] ? rec["1x2"][l.i] : NaN;
  if (l.marche === "dc") return rec.dc ? rec.dc[l.issue] : NaN;
  if (l.marche === "btts") return rec.btts ? rec.btts[l.i] : NaN;
  if (l.marche === "ou") return rec.ou && rec.ou[l.ligne] ? rec.ou[l.ligne][l.i] : NaN;
  return NaN;
}

// Cotes REELLES de la selection chez les agrees SUIVIS { cle: cote }, garde-fou compris
// (le meme que canal-pro.mjs#cotesExecutables, applique sur tous les bookmakers relevés).
function cotesAgreesSuivies(books, marketId) {
  const l = lectureMarche(marketId);
  if (!l) return {};
  let tout = {};
  Object.keys(books || {}).forEach((bk) => { const o = coteDe(books[bk], l); if (ok(o)) tout[bk] = o; });
  const n = Object.keys(tout).length;
  if (n >= 3) {
    const moy = Object.values(tout).reduce((a, b) => a + b, 0) / n;
    tout = Object.fromEntries(Object.entries(tout).filter(([, o]) => o <= GARDE_FOU_COTE_MAX_SUR_MOYENNE * moy));
  }
  const out = {};
  Object.entries(tout).forEach(([bk, o]) => { const c = cleSuivie(bk); if (c && (!out[c] || o > out[c])) out[c] = o; });
  return out;
}
// Meilleure cote (canal-pro.mjs#meilleure : la premiere rencontree l'emporte a egalite).
function meilleure(cotes) {
  let best = null;
  Object.entries(cotes || {}).forEach(([bk, c]) => { if (ok(c) && (!best || c > best.cote)) best = { bookmaker: bk, cote: c }; });
  return best;
}

const mediane = (v) => { const w = v.filter(ok).sort((a, b) => a - b); if (!w.length) return NaN; const k = Math.floor(w.length / 2); return w.length % 2 ? w[k] : (w[k - 1] + w[k]) / 2; };
const arrondi1 = (x) => Math.round(Number((x * 10).toPrecision(12))) / 10;
// Ligne complete des agrees suivis (mediane par issue), ou null.
function ligneMediane(books, lire) {
  const lignes = [];
  Object.keys(books || {}).forEach((bk) => { if (cleSuivie(bk)) { const v = lire(books[bk]); if (Array.isArray(v) && v.every(ok)) lignes.push(v); } });
  if (!lignes.length) return null;
  return lignes[0].map((_, i) => mediane(lignes.map((v) => v[i])));
}
const proportionnelle = (v) => { const inv = v.map((x) => 1 / x), s = inv.reduce((a, b) => a + b, 0); return inv.map((x) => x / s); };

// Cotes sans marge (en %, une decimale) des marches couverts, pour les agrees suivis :
// { 'home-win', 'draw', 'away-win', 'dc-1x', 'dc-x2', 'dc-12', 'over-25', 'under-25', ..., 'btts-yes', 'btts-no' }.
function sansMargeAnj(books) {
  const out = {};
  const l12 = ligneMediane(books, (r) => r["1x2"]);
  const p = l12 ? shinProbabilities(l12) : null;
  if (p && p.length === 3 && p.every((x) => ok(x) && x > 0)) {
    const s = p[0] + p[1] + p[2];
    const f = p.map((x) => (x / s) * 100);
    out["home-win"] = arrondi1(f[0]); out.draw = arrondi1(f[1]); out["away-win"] = arrondi1(f[2]);
    out["dc-1x"] = arrondi1(f[0] + f[1]); out["dc-x2"] = arrondi1(f[1] + f[2]); out["dc-12"] = arrondi1(f[0] + f[2]);
  }
  const lb = ligneMediane(books, (r) => r.btts);
  if (lb) { const f = proportionnelle(lb); out["btts-yes"] = arrondi1(f[0] * 100); out["btts-no"] = arrondi1(f[1] * 100); }
  const lignes = {};
  Object.keys(books || {}).forEach((bk) => { if (cleSuivie(bk) && books[bk].ou) Object.keys(books[bk].ou).forEach((x) => { lignes[x] = true; }); });
  Object.keys(lignes).forEach((x) => {
    const lo = ligneMediane(books, (r) => r.ou && r.ou[x]);
    if (!lo) return;
    const f = proportionnelle(lo), suffixe = String(x).replace(".", "");
    out["over-" + suffixe] = arrondi1(f[0] * 100); out["under-" + suffixe] = arrondi1(f[1] * 100);
  });
  return out;
}

// La cote ANJ d'un pari : { cote, bookmaker (cle), bookmaker_nom, sans_marge (% ou null) } ou null.
function coteDuPari(books, marketId) {
  const best = meilleure(cotesAgreesSuivies(books, marketId));
  if (!best) return null;
  const sm = sansMargeAnj(books)[String(marketId)];
  return { cote: best.cote, bookmaker: best.bookmaker, bookmaker_nom: nomBookmaker(best.bookmaker), sans_marge: ok(sm) && sm > 0 && sm < 100 ? sm : null };
}

// ---------------------------------------------------------------- champs du match
const CHAMPS = ["cote_bookmaker", "cote_source", "cote_releve_a", "sans_marge_anj"];

// Pose la cote ANJ sur un match (et sa ligne premium) : cote_rec (LE champ cote, lu partout),
// cote_bookmaker (nom affiche), cote_source « anj », cote_releve_a, sans_marge_anj.
function poserCoteAnj(m, premiumRow, books, releveA) {
  const c = coteDuPari(books, m.market_id);
  if (!c) return false;
  m.cote_rec = String(c.cote);
  m.cote_bookmaker = c.bookmaker_nom;
  m.cote_source = SOURCE_ANJ;
  m.cote_releve_a = releveA || null;
  m.sans_marge_anj = sansMargeAnj(books);
  if (premiumRow && typeof premiumRow === "object") premiumRow.cote_rec = Number(c.cote);
  return true;
}
// Repli : la cote du pipeline (moyenne API-Football), marquee indicative, sans bookmaker.
function marquerIndicative(m) {
  m.cote_bookmaker = null;
  m.cote_source = SOURCE_INDICATIVE;
  delete m.cote_releve_a;
  delete m.sans_marge_anj;
}

// ---------------------------------------------------------------- correspondance des matchs
const normNom = (s) => norm(s).replace(/\b(fc|afc|cf|sc|ac|as|ssc|us|rc|sv|vfb|vfl|tsg|fsv|1\.|club|de|calcio)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
// scripts/canal-pro/lib/sources.mjs#memeEquipe (copie : ce fichier est en CommonJS).
function memeEquipe(a, b) {
  const x = normNom(a), y = normNom(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const mx = x.split(" ").filter((w) => w.length >= 4), my = new Set(y.split(" ").filter((w) => w.length >= 4));
  if (mx.some((w) => my.has(w))) return true;
  return mx.concat(Array.from(my)).some((w) => w.length >= 6 && x.includes(w) && y.includes(w));
}
// L'evenement d'un match (coup d'envoi a 3 h pres, memes equipes), seulement s'il est UNIQUE.
function trouverEvenement(evs, domicile, exterieur, koMs) {
  const c = (evs || []).filter((e) => e && Math.abs(Date.parse(e.commence_time) - koMs) <= 3 * 3600e3 && memeEquipe(e.home_team, domicile) && memeEquipe(e.away_team, exterieur));
  return c.length === 1 ? c[0] : null;
}

// ---------------------------------------------------------------- orchestration (pipeline)
/**
 * Pose la cote ANJ sur chaque match qui a un pari. matchs : [{ m, premiumRow, sport, koMs }]
 * (sport = config/leagues.json#oddsSportKey, null = ligue non couverte). opts : { cle, fetchJson,
 * maintenant, log, maxEvenements }. Jamais d'exception : une panne laisse la cote indicative.
 * -> { anj, indicatives, credits, erreurs: [] }
 */
async function poserCotesAnj(matchs, opts) {
  opts = opts || {};
  const log = opts.log || function () {};
  const rapport = { anj: 0, indicatives: 0, appels: 0, erreurs: [] };
  const liste = (matchs || []).filter((x) => x && x.m);
  liste.forEach((x) => marquerIndicative(x.m));
  const fetchJson = opts.fetchJson;
  if (!opts.cle || typeof fetchJson !== "function") {
    rapport.indicatives = liste.length;
    if (liste.length) rapport.erreurs.push(opts.cle ? "aucun client HTTP" : "ODDS_API_KEY absente");
    return rapport;
  }
  const maintenant = opts.maintenant ? new Date(opts.maintenant) : new Date();
  const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  const appel = async (chemin, params) => {
    const q = new URLSearchParams(Object.assign({ apiKey: opts.cle, oddsFormat: "decimal", dateFormat: "iso", bookmakers: BOOKMAKERS_RELEVES }, params));
    rapport.appels++;
    return fetchJson("https://api.the-odds-api.com/v4/" + chemin + "?" + q.toString());
  };
  const parSport = {};
  liste.forEach((x) => { if (x.sport && ok(x.koMs) && lectureMarche(x.m.market_id)) (parSport[x.sport] = parSport[x.sport] || []).push(x); });
  const books = new Map();
  for (const sport of Object.keys(parSport)) {
    const xs = parSport[sport];
    const debut = Math.min.apply(null, xs.map((x) => x.koMs)) - 3 * 3600e3, fin = Math.max.apply(null, xs.map((x) => x.koMs)) + 3 * 3600e3;
    let evs;
    try { evs = await appel("sports/" + sport + "/odds", { markets: "h2h,totals", commenceTimeFrom: iso(Math.max(debut, maintenant.getTime())), commenceTimeTo: iso(fin) }); }
    catch (e) { rapport.erreurs.push(sport + " : " + String(e && e.message || e).slice(0, 120)); continue; }
    if (!Array.isArray(evs)) { rapport.erreurs.push(sport + " : réponse inattendue " + String(evs && (evs.error_code || evs.message) || "").slice(0, 80)); continue; }
    xs.forEach((x) => {
      const ev = trouverEvenement(evs, x.m.home && x.m.home.n, x.m.away && x.m.away.n, x.koMs);
      if (ev) books.set(x, { ev: ev, books: booksDepuisEvenement(ev), sport: sport });
    });
  }
  let nEv = 0;
  const maxEv = opts.maxEvenements != null ? opts.maxEvenements : MAX_EVENEMENTS_PAR_RUN;
  for (const [x, b] of books) {
    const mk = marcheParEvenement(x.m.market_id);
    if (!mk || nEv >= maxEv) continue;
    nEv++;
    try {
      const ev = await appel("sports/" + b.sport + "/events/" + b.ev.id + "/odds", { markets: mk });
      const plus = booksDepuisEvenement(Object.assign({}, ev, { home_team: b.ev.home_team, away_team: b.ev.away_team }));
      Object.keys(plus).forEach((bk) => { b.books[bk] = Object.assign({}, b.books[bk] || {}, plus[bk]); });
    } catch (e) { rapport.erreurs.push(b.ev.id + " : " + String(e && e.message || e).slice(0, 120)); }
  }
  const releveA = maintenant.toISOString();
  liste.forEach((x) => {
    const b = books.get(x);
    if (b && poserCoteAnj(x.m, x.premiumRow, b.books, releveA)) rapport.anj++;
    else rapport.indicatives++;
  });
  log("  [COTE ANJ] " + rapport.anj + " pari(s) avec la cote d'un bookmaker agréé ANJ, " + rapport.indicatives + " en cote indicative (" + rapport.appels + " appel(s) The Odds API)" + (rapport.erreurs.length ? " ; " + rapport.erreurs.length + " erreur(s)" : "") + ".");
  return rapport;
}

// Lecture (pages, messages) : { cote, bookmaker, indicative } du pari, jamais recalculee.
function coteAffichee(m) {
  const c = m ? Number(String(m.cote_rec == null ? "" : m.cote_rec).replace(",", ".")) : NaN;
  if (!(c > 1)) return null;
  const anj = m.cote_source === SOURCE_ANJ && typeof m.cote_bookmaker === "string" && m.cote_bookmaker;
  return { cote: c, bookmaker: anj ? m.cote_bookmaker : null, indicative: !anj };
}

module.exports = {
  SOURCE_ANJ, SOURCE_INDICATIVE, CHAMPS, BOOKMAKERS_SUIVIS, BOOKMAKERS_RELEVES, MAX_EVENEMENTS_PAR_RUN,
  nomBookmaker, cleSuivie, booksDepuisEvenement, lectureMarche, marcheParEvenement, cotesAgreesSuivies, meilleure,
  sansMargeAnj, coteDuPari, poserCoteAnj, marquerIndicative, memeEquipe, trouverEvenement, poserCotesAnj, coteAffichee,
};
