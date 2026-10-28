"use strict";
// REPLI « FORME » DES MATCHS DE COUPE (demande de Clement du 28/10/2026 : « demain il y a des matchs de coupe sans
// signal, tu es oblige de donner un pari ; base-toi sur les 10 derniers matchs du club, peu importe, et regarde la
// division et la coupe »).
//
// QUAND : apres lib/pronostic.js#publierPronostics, pour chaque match OUVERT, NON FIGE, d'une coupe nationale de
// config/leagues.json#fiabilite.repli_forme.competitions, qui est reste SANS PARI (no_signal vrai, raison
// AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE ou AUCUN_MARCHE_AVEC_COTE_REELLE). Un pari deja publie (gel, GEL_FIGES) ne
// change jamais ; un match qui a deja son pari n'est jamais touche.
//
// CHANCES (module pur, aucun appel reseau ; le pipeline lui passe les matchs des deux clubs et les cotes) :
//   1. FORME : les 10 derniers matchs OFFICIELS de chaque club joues AVANT le coup d'envoi (amicaux exclus, score du
//      temps reglementaire), toutes competitions : buts marques et encaisses par match, frequences plus de 1,5 / 2,5,
//      les deux marquent, le club marque. Moins de repli_forme.min_matchs matchs : pas de pari (jamais un chiffre
//      invente).
//   2. DIVISION : celle du championnat ou le club a joue le plus de matchs parmi ses derniers matchs (table NIVEAUX
//      ci-dessous : Espagne, Allemagne, Angleterre, Italie, France). Aucun championnat connu : un niveau sous la
//      plus basse division connue du pays de la coupe.
//   3. BUTS ATTENDUS (Poisson) : buts moyens par equipe (buts_moyens) x attaque du club x defense de l'adversaire
//      (chacune ramenee a la moyenne et lissee vers elle, lissage), x exp(-beta x ecart de niveaux) pour le club de
//      la division la plus basse (exp(+beta) pour l'autre), x l'avantage du terrain du club qui recoit (en coupe,
//      souvent le petit club). beta et l'avantage du terrain sont AJUSTES sur les matchs de coupe de la saison
//      2025-2026 seulement (scripts/backtest-repli-coupes.js) et MESURES sur ceux de 2026-2027, jamais vus.
//   4. PROBABILITES de chaque marche candidat sur la grille des scores (0 a 10 buts par equipe).
//
// LE PARI : parmi les marches de MARCHES_REPLI (ceux que tout parieur connait, plus les buts d'une equipe, demande
// du 28/10 pour les gros ecarts comme Bayern - Magdebourg), seulement ceux qui ont une COTE REELLE (agreee ANJ
// d'abord, sinon celle du bookmaker de reference du flux API-Football, lib/flux-paris.js) dans la fourchette
// [fourchette_pari.cote_min ; repli_forme.cote_max] (decision du 21/10 : jamais sous 1,40 ; decision du 29/09, C4 :
// jamais une cote inventee). Chance = le plus bas entre la forme et la cote sans marge du meme marche (meme regle que
// le Canal Pro, lib/chance-iashark.js#chanceIashark), corrigee comme tout pari (corrections_chance), puis la plus
// grande. Moins de repli_forme.chance_min : pas de pari. Aucune cote reelle dans la fourchette : pas de pari (le
// match garde « Aucun signal clair »). Fiabilite affichee : « en test » ; jamais une « Sélection IASHARK », jamais
// une jambe de combine (lib/run-output/jambes-du-jour.js n'accepte que les paris « vérifiée »).

const CHANCE = require("./chance-iashark.js");
const COTE_ANJ = require("./cote-anj.js");
const MP = require("./marches-paris.js");
const FP = require("./flux-paris.js");
const { computeRiskLabel } = require("./decision.js");

const VOIE = "repli_forme";
const FIABILITE = "en test";
const SOURCE = "forme des 10 derniers matchs et division, le plus bas avec la cote sans marge";
const RAISONS_SANS_PARI = ["AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE", "AUCUN_MARCHE_AVEC_COTE_REELLE"];

// Marches candidats (ids du site, catalogue lib/marches-paris.js) : ceux de lib/pronostic.js#MARCHES_CONNUS (jamais
// le match nul, jamais « au moins une equipe ne marque pas » : verdict du mathematicien du 06/10), la ligne de 4,5 buts
// et les buts d'une equipe (demande du 28/10 pour les gros ecarts comme Bayern - Magdebourg). Jamais les handicaps
// (signe des lignes ambigu dans le flux), ni les mi-temps, ni les tirs. Ceux que la mesure ecarte :
// repli_forme.marches_exclus.
const MARCHES_REPLI = Object.freeze(["home-win", "away-win", "dc-1x", "dc-x2", "dc-12",
  "over-15", "under-15", "over-25", "under-25", "over-35", "under-35", "over-45", "under-45", "btts-yes",
  "home-team-over-05", "home-team-over-15", "home-team-over-25", "home-team-under-05", "home-team-under-15", "home-team-under-25",
  "away-team-over-05", "away-team-over-15", "away-team-over-25", "away-team-under-05", "away-team-under-15", "away-team-under-25"]);

// NIVEAUX : identifiant API-Football du championnat -> { pays, niveau } (1 = premiere division).
const NIVEAUX = {};
function niv(pays, niveau, ids) { ids.forEach(function (id) { NIVEAUX[id] = Object.freeze({ pays: pays, niveau: niveau }); }); }
function de(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
// Espagne : Liga, Segunda, Primera RFEF (groupes), Segunda RFEF, Tercera RFEF.
niv("ES", 1, [140]); niv("ES", 2, [141]); niv("ES", 3, [435, 436, 437, 438, 692]); niv("ES", 4, de(875, 879)); niv("ES", 5, de(439, 456));
// Allemagne : Bundesliga, 2. Bundesliga, 3. Liga, Regionalliga, Oberliga.
niv("DE", 1, [78]); niv("DE", 2, [79]); niv("DE", 3, [80]); niv("DE", 4, de(83, 87)); niv("DE", 5, de(744, 755).concat([938, 939]));
// Angleterre : Premier League, Championship, League One, League Two, National League, National League Nord/Sud,
// Non League Premier, Non League Division One.
niv("EN", 1, [39]); niv("EN", 2, [40]); niv("EN", 3, [41]); niv("EN", 4, [42]); niv("EN", 5, [43]); niv("EN", 6, [50, 51]);
niv("EN", 7, [58, 59, 60, 931]); niv("EN", 8, de(52, 57).concat([932, 933]));
// Italie : Serie A, Serie B, Serie C (3 groupes), Serie D (9 groupes).
niv("IT", 1, [135]); niv("IT", 2, [136]); niv("IT", 3, [138, 942, 943]); niv("IT", 4, de(426, 434));
// France : Ligue 1, Ligue 2, National (« Ligue 3 »), National 2, National 3.
niv("FR", 1, [61]); niv("FR", 2, [62]); niv("FR", 3, [63]); niv("FR", 4, de(67, 70)); niv("FR", 5, de(461, 472).concat([1029]));
Object.freeze(NIVEAUX);
// Pays de chaque coupe (identifiant API-Football) et niveau d'un club sans championnat connu (un sous le plus bas).
const PAYS_COUPE = Object.freeze({ 143: "ES", 81: "DE", 45: "EN", 48: "EN", 137: "IT", 66: "FR" });
const NIVEAU_INCONNU = Object.freeze({ ES: 6, DE: 6, EN: 9, IT: 5, FR: 6 });

const AMICAL = /friendl|amical/i;
const FINIS = ["FT", "AET", "PEN"];

function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function cote(v) { const x = nombre(v); return x !== null && x > 1 ? Math.round(x * 100) / 100 : null; }

// Parametres : config/leagues.json#fiabilite.repli_forme (seul endroit ou ils sont ecrits). Absents : pas de repli.
function lireParametres(cfg) {
  const r = cfg && cfg.fiabilite && cfg.fiabilite.repli_forme;
  if (!estObjet(r)) return null;
  const f = cfg.fiabilite.fourchette_pari || {};
  const p = {
    competitions: Array.isArray(r.competitions) ? r.competitions.map(String) : [],
    cote_min: nombre(f.cote_min), cote_max: Math.min(nombre(r.cote_max) || Infinity, nombre(f.cote_max) || Infinity),
    chance_min: nombre(r.chance_min) || 0, n_matchs: nombre(r.n_matchs) || 10, min_matchs: nombre(r.min_matchs) || 5,
    buts_moyens: nombre(r.buts_moyens), beta: nombre(r.beta), avantage_domicile: nombre(r.avantage_domicile), lissage: nombre(r.lissage),
    // Marches ecartes et prudence (points retires de la chance) : mesures sur la saison d'ajustement seulement.
    marches_exclus: Array.isArray(r.marches_exclus) ? r.marches_exclus.map(String) : [],
    prudence_ecart: estObjet(r.prudence) ? Math.max(0, nombre(r.prudence.ecart_2_divisions_ou_plus) || 0) : 0,
    prudence_autres: estObjet(r.prudence) ? Math.max(0, nombre(r.prudence.autres) || 0) : 0,
  };
  if (!(p.cote_min > 1) || !(p.cote_max >= p.cote_min) || !(p.buts_moyens > 0) || p.beta === null || !(p.avantage_domicile > 0) || p.lissage === null) return null;
  return Object.freeze(p);
}

// ------------------------------------------------------------------------------------------------ forme et division
// Un match API-Football (fixtures) -> { date, dom, ext, ligue, ligue_nom, bd, be (buts du temps reglementaire) } ou null.
function lireMatch(f) {
  if (!f || !f.fixture || !f.teams || !f.league) return null;
  const st = f.fixture.status && f.fixture.status.short;
  if (FINIS.indexOf(st) === -1) return null;
  const ft = f.score && f.score.fulltime;
  // Temps reglementaire : score.fulltime (sans prolongation) ; sinon goals pour un match fini en 90 minutes.
  let h = ft ? nombre(ft.home) : null, a = ft ? nombre(ft.away) : null;
  if ((h === null || a === null) && st === "FT" && f.goals) { h = nombre(f.goals.home); a = nombre(f.goals.away); }
  if (h === null || a === null) return null;
  const t = Date.parse(f.fixture.date);
  if (!Number.isFinite(t)) return null;
  return { id: f.fixture.id, t: t, date: f.fixture.date, dom: f.teams.home.id, ext: f.teams.away.id, dom_nom: f.teams.home.name, ext_nom: f.teams.away.name,
    ligue: Number(f.league.id), ligue_nom: String(f.league.name || ""), bd: h, be: a };
}
// Matchs officiels d'un club joues STRICTEMENT avant avantIso, du plus recent au plus ancien (zero fuite du futur).
function matchsAvant(fixtures, teamId, avantIso) {
  const limite = Date.parse(avantIso);
  if (!Number.isFinite(limite)) return [];
  const vus = new Set();
  return (Array.isArray(fixtures) ? fixtures : []).map(lireMatch).filter(function (x) {
    if (!x || x.t >= limite || vus.has(x.id)) return false;
    if (x.dom !== teamId && x.ext !== teamId) return false;
    if (AMICAL.test(x.ligue_nom)) return false;
    vus.add(x.id);
    return true;
  }).sort(function (a, b) { return b.t - a.t; });
}
// Division : championnat le plus joue parmi les 20 derniers matchs officiels (egalite : le plus recent).
function divisionDuClub(fixtures, teamId, avantIso, paysCoupe) {
  const ms = matchsAvant(fixtures, teamId, avantIso).slice(0, 20);
  const compte = {}, recent = {};
  ms.forEach(function (x, i) { if (NIVEAUX[x.ligue]) { compte[x.ligue] = (compte[x.ligue] || 0) + 1; if (recent[x.ligue] === undefined) recent[x.ligue] = i; } });
  const ids = Object.keys(compte).sort(function (a, b) { return (compte[b] - compte[a]) || (recent[a] - recent[b]); });
  if (ids.length) {
    const d = NIVEAUX[ids[0]];
    const nom = (ms.find(function (x) { return String(x.ligue) === ids[0]; }) || {}).ligue_nom || null;
    return { ligue: Number(ids[0]), ligue_nom: nom, pays: d.pays, niveau: d.niveau, connue: true };
  }
  const pays = paysCoupe || null;
  return { ligue: null, ligue_nom: null, pays: pays, niveau: pays && NIVEAU_INCONNU[pays] ? NIVEAU_INCONNU[pays] : null, connue: false };
}
// Forme : les n derniers matchs officiels -> { n, bm, be (moyennes), freq (%), matchs }.
function formeClub(fixtures, teamId, avantIso, n) {
  const ms = matchsAvant(fixtures, teamId, avantIso).slice(0, n || 10);
  if (!ms.length) return { n: 0, bm: null, be: null, freq: null, matchs: [] };
  let bm = 0, be = 0, p15 = 0, p25 = 0, deux = 0, marque = 0;
  const matchs = ms.map(function (x) {
    const dom = x.dom === teamId, pour = dom ? x.bd : x.be, contre = dom ? x.be : x.bd;
    bm += pour; be += contre;
    if (pour + contre > 1.5) p15++;
    if (pour + contre > 2.5) p25++;
    if (pour > 0 && contre > 0) deux++;
    if (pour > 0) marque++;
    return { d: x.date.slice(0, 10), adversaire: dom ? x.ext_nom : x.dom_nom, score: pour + "-" + contre, lieu: dom ? "DOM" : "EXT", ligue: x.ligue };
  });
  const k = ms.length, pc = function (v) { return Math.round(v / k * 1000) / 10; };
  return { n: k, bm: bm / k, be: be / k, sommes: { bm: bm, be: be }, freq: { plus15: pc(p15), plus25: pc(p25), deux_marquent: pc(deux), marque: pc(marque) }, matchs: matchs };
}

// ------------------------------------------------------------------------------------------------ modele
// Buts attendus des deux clubs. fDom/fExt : formeClub ; nDom/nExt : niveaux ; p : parametres.
function butsAttendus(fDom, fExt, nDom, nExt, p) {
  if (!fDom || !fExt || !(fDom.n > 0) || !(fExt.n > 0) || !p) return null;
  const L = p.buts_moyens, k = p.lissage;
  const lisse = function (somme, n) { return (somme + k * L) / (n + k) / L; };
  const attD = lisse(fDom.sommes.bm, fDom.n), defD = lisse(fDom.sommes.be, fDom.n);
  const attE = lisse(fExt.sommes.bm, fExt.n), defE = lisse(fExt.sommes.be, fExt.n);
  // Ecart de niveaux : positif quand le club qui recoit joue plus bas (niveau plus grand).
  const g = (Number(nDom) || 0) - (Number(nExt) || 0);
  const h = Math.sqrt(p.avantage_domicile);
  const lD = L * attD * defE * h * Math.exp(-p.beta * g);
  const lE = L * attE * defD / h * Math.exp(p.beta * g);
  return { dom: lD, ext: lE, ecart_niveaux: g };
}
function poisson(l, max) { const o = [Math.exp(-l)]; for (let i = 1; i <= max; i++) o.push(o[i - 1] * l / i); return o; }
// Probabilites (%) de chaque marche du catalogue (buts du temps reglementaire) a partir des buts attendus.
const MAX_BUTS = 10;
function probabilites(l) {
  if (!l || !(l.dom > 0) || !(l.ext > 0)) return null;
  const pd = poisson(l.dom, MAX_BUTS), pe = poisson(l.ext, MAX_BUTS);
  let tot = 0;
  const grille = [];
  for (let i = 0; i <= MAX_BUTS; i++) for (let j = 0; j <= MAX_BUTS; j++) { const q = pd[i] * pe[j]; grille.push([i, j, q]); tot += q; }
  const out = {};
  Object.keys(MP.CATALOGUE).forEach(function (id) {
    const d = MP.CATALOGUE[id];
    if (d.dim !== "buts" || !d.ft) return;
    let s = 0;
    grille.forEach(function (c) { if (d.test({ h1: c[0], a1: c[1], h2: 0, a2: 0 })) s += c[2]; });
    out[id] = s / tot * 100;
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ cotes
// Cotes reelles des marches candidats : agreee ANJ d'abord (livres du match), sinon le bookmaker de reference du flux
// API-Football (raw de /odds?fixture=, lib/flux-paris.js#selectionsDuMatch : marge retiree par la methode puissance,
// controle Pinnacle). -> { id du site: { cote, anj, bookmaker, sans_marge (%) } }. Jamais une cote inventee.
function cotesReelles(m, raw, livres) {
  const out = {};
  if (estObjet(raw)) {
    FP.selectionsDuMatch(raw, { match: m }).selections.forEach(function (s) {
      const id = MP.idDuFlux({ 50: 5, 72: 6 }[s.bet_id] || s.bet_id, s.value);
      if (!id || out[id] || MARCHES_REPLI.indexOf(id) === -1) return;
      const k = cote(s.cote), q = nombre(s.chance);
      if (k === null || q === null || !(q > 0 && q < 1)) return;
      out[id] = { cote: k, anj: false, bookmaker: null, sans_marge: q * 100 };
    });
  }
  if (livres) {
    const qAnj = COTE_ANJ.sansMargeAnj(livres) || {};
    MARCHES_REPLI.forEach(function (id) {
      const a = COTE_ANJ.coteDuPari(livres, id);
      const k = a ? cote(a.cote) : null;
      if (k === null) return;
      const sm = a.sans_marge != null ? nombre(a.sans_marge) : nombre(qAnj[id]);
      const q = sm !== null && sm > 0 && sm < 100 ? sm : (out[id] ? out[id].sans_marge : null);
      if (q === null) return; // jamais une chance sans cote sans marge
      out[id] = { cote: k, anj: true, bookmaker: a.bookmaker_nom || null, sans_marge: q };
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ choix
// Le pari de repli d'un match. d = { dom: [fixtures du club qui recoit], ext: [...], odds: raw, livres }.
// opts : { params, regles + chanceCorrigee (lib/pronostic.js), avantIso (coup d'envoi), ligueId (coupe) }.
// -> { pari, raison, base } : pari = { market_id, cote, anj, bookmaker, sans_marge, p_forme, chance, chance_affichee,
// source_chance } ou null avec la raison.
function choisir(m, d, opts) {
  const p = opts.params;
  const pays = PAYS_COUPE[Number(opts.ligueId != null ? opts.ligueId : m.league_id)] || null;
  const avant = opts.avantIso;
  const idD = m.home && m.home.id, idE = m.away && m.away.id;
  const fD = formeClub(d && d.dom, idD, avant, p.n_matchs), fE = formeClub(d && d.ext, idE, avant, p.n_matchs);
  const dvD = divisionDuClub(d && d.dom, idD, avant, pays), dvE = divisionDuClub(d && d.ext, idE, avant, pays);
  const base = { dom: { n: fD.n, buts_marques: fD.bm, buts_encaisses: fD.be, freq: fD.freq, division: dvD }, ext: { n: fE.n, buts_marques: fE.bm, buts_encaisses: fE.be, freq: fE.freq, division: dvE } };
  if (fD.n < p.min_matchs || fE.n < p.min_matchs) return { pari: null, raison: "REPLI_FORME_DONNEES_INSUFFISANTES", base: base };
  if (dvD.niveau === null || dvE.niveau === null) return { pari: null, raison: "REPLI_FORME_DIVISION_INCONNUE", base: base };
  const l = butsAttendus(fD, fE, dvD.niveau, dvE.niveau, p);
  const pr = probabilites(l);
  base.buts_attendus = l ? { dom: Math.round(l.dom * 100) / 100, ext: Math.round(l.ext * 100) / 100 } : null;
  base.formes = { dom: fD.matchs, ext: fE.matchs };
  if (!pr) return { pari: null, raison: "REPLI_FORME_DONNEES_INSUFFISANTES", base: base };
  const cotes = cotesReelles(m, d && d.odds, d && d.livres);
  if (!Object.keys(cotes).length) return { pari: null, raison: "AUCUN_MARCHE_AVEC_COTE_REELLE", base: base };
  const cands = [];
  // Prudence (points retires de la chance) : plus forte quand deux divisions ou plus separent les clubs.
  const prudence = Math.abs(l.ecart_niveaux) >= 2 ? p.prudence_ecart : p.prudence_autres;
  base.prudence = prudence;
  MARCHES_REPLI.forEach(function (id, rang) {
    const k = cotes[id], pf = pr[id];
    if (!k || pf == null || p.marches_exclus.indexOf(id) !== -1) return;
    const x = Math.round(k.cote * 100);
    if (x < Math.round(p.cote_min * 100) || x > Math.round(p.cote_max * 100)) return;
    const c = CHANCE.chanceIashark(pf, k.sans_marge);
    if (!c) return;
    const chance = Math.max(1, c.chance - prudence);
    // Origine du chiffre affiche (page match, lib/match-view-model.js#comparaisonPari) : « marche » seulement quand
    // c'est exactement la cote sans marge (forme plus haute, aucune prudence) ; sinon « modele » (forme ou prudence).
    const sourceChance = prudence === 0 && Math.round(k.sans_marge) <= Math.round(pf) ? "marche" : "modele";
    const corr = opts.chanceCorrigee ? opts.chanceCorrigee(chance, opts.regles, { market_id: id, ligue: m.league_key, famille: MP.CATALOGUE[id].famille, option: "principale", cote: k.cote, source_chance: sourceChance }) : { chance: chance };
    if (!corr) return;
    cands.push({ market_id: id, rang: rang, cote: k.cote, anj: k.anj, bookmaker: k.bookmaker, sans_marge: Math.round(k.sans_marge * 10) / 10, p_forme: Math.round(pf * 10) / 10, chance_calculee: c.chance, chance: chance, chance_affichee: corr.chance, source_chance: sourceChance });
  });
  cands.sort(function (a, b) { return (b.chance_affichee - a.chance_affichee) || ((b.anj ? 1 : 0) - (a.anj ? 1 : 0)) || (b.p_forme - a.p_forme) || (a.rang - b.rang); });
  base.candidats = cands.length;
  if (!cands.length) return { pari: null, raison: "AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE", base: base };
  // Seuil : la forme ET la cote sans marge donnent au moins chance_min (chance avant prudence et corrections).
  const b = cands.filter(function (c) { return c.chance_calculee >= p.chance_min; })[0];
  if (!b) return { pari: null, raison: "REPLI_FORME_CHANCE_TROP_BASSE", base: base };
  return { pari: b, raison: null, base: base };
}

// ------------------------------------------------------------------------------------------------ pipeline
function estFerme(m) { return /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String((m && m.no_signal_reason) || "")); }
function aUnPari(m) { return !!(m && String(m.pari_rec || "").trim() && m.no_signal !== true); }
// Coup d'envoi ISO d'un match (fixture API-Football, passe par le pipeline dans opts.koIso) ; inconnu : null (pas de
// repli : sans heure exacte, impossible de garantir que seuls les matchs joues AVANT comptent).
function coupEnvoi(m, opts) {
  const k = opts && estObjet(opts.koIso) ? opts.koIso[String(m.id)] : null;
  return k || null;
}
// Matchs a qui le repli s'adresse (le pipeline va chercher leurs donnees, puis appelle publierRepli).
function matchsARepli(matchs, opts) {
  opts = opts || {};
  const p = opts.params || lireParametres(opts.configLigues);
  if (!p) return [];
  return (matchs || []).filter(function (m) {
    if (!m || typeof m !== "object" || m.id == null || estFerme(m) || aUnPari(m)) return false;
    if (opts.figes && opts.figes[String(m.id)]) return false;
    if (m.status && m.status !== "NS" && m.status !== "TBD") return false;
    if (p.competitions.indexOf(String(m.league_key || "")) === -1) return false;
    if (!m.home || !m.away || m.home.id == null || m.away.id == null) return false;
    return m.no_signal === true && RAISONS_SANS_PARI.indexOf(String(m.no_signal_reason || "")) !== -1;
  });
}

// Pose le pari de repli (memes champs que lib/pronostic.js#publierPronostics, match ET ligne premium).
// opts : { configLigues, figes, donnees: { fixture: { dom, ext, odds } }, cotesAnjPar, texteMarche, koIso, nowIso,
//          pronostic (le module lib/pronostic.js : chanceCorrigee, retirerTextesDuPari, libelleFr, sansMargeUtilise) }.
// -> { candidats, publies, sans_pari: { raison: n } }.
function publierRepli(matchs, premiumRows, opts) {
  opts = opts || {};
  const PR = opts.pronostic || require("./pronostic.js");
  const p = opts.params || lireParametres(opts.configLigues);
  const rapport = { candidats: 0, publies: 0, sans_pari: {} };
  if (!p) return rapport;
  const regles = (opts.configLigues && opts.configLigues.fiabilite && opts.configLigues.fiabilite.corrections_chance) || [];
  const donnees = estObjet(opts.donnees) ? opts.donnees : {};
  const livresPar = estObjet(opts.cotesAnjPar) ? opts.cotesAnjPar : {};
  const texteMarche = estObjet(opts.texteMarche) ? opts.texteMarche : null;
  const nowIso = opts.nowIso || new Date().toISOString();
  matchsARepli(matchs, Object.assign({}, opts, { params: p })).forEach(function (m) {
    rapport.candidats++;
    const cle = String(m.id);
    const d = donnees[cle];
    const ko = coupEnvoi(m, opts);
    const sansPari = function (r) { rapport.sans_pari[r] = (rapport.sans_pari[r] || 0) + 1; };
    if (!d || !ko) { sansPari("REPLI_FORME_DONNEES_ABSENTES"); return; }
    const r = choisir(m, Object.assign({}, d, { livres: livresPar[cle] || d.livres || null }), { params: p, regles: regles, chanceCorrigee: PR.chanceCorrigee, avantIso: ko, ligueId: m.league_id });
    if (!r.pari) { sansPari(r.raison); return; }
    const b = r.pari;
    const def = MP.CATALOGUE[b.market_id];
    const row = (premiumRows || []).find(function (x) { return x && String(x.fixture_id) === cle; }) || null;
    m.pari_rec = def.marche;
    m.market_id = b.market_id;
    m.marche = def.categorie;
    m.cote_rec = b.cote.toFixed(2);
    if (b.anj) { m.cote_bookmaker = b.bookmaker; m.cote_source = "anj"; const sm = livresPar[cle] ? COTE_ANJ.sansMargeAnj(livresPar[cle]) : null; if (sm) m.sans_marge_anj = sm; else delete m.sans_marge_anj; }
    else { m.cote_bookmaker = null; m.cote_source = "indicative"; delete m.cote_releve_a; delete m.sans_marge_anj; }
    m.odds_available = true;
    m.pick_downgrade = "";
    m.risque = computeRiskLabel(b.cote);
    m.model_probability = b.chance;
    m.conf = Math.round(b.chance) / 10;
    m.chance_iashark = b.chance;
    m.chance_iashark_source = SOURCE;
    m.model_output_available = true;
    m.no_signal = false;
    m.no_signal_label = "";
    delete m.no_signal_reason;
    delete m.has_signal;
    delete m.chance_correction;
    delete m.is_canonical_pick;
    delete m.v3_pari;
    delete m.selection_iashark;
    delete m.option_cote;
    m.selection_voie = VOIE;
    m.paris_safe = { bet: m.pari_rec, cote: b.cote, proba: Math.round(b.chance) + "%" };
    // Textes ecrits pour un match SANS pari : les phrases « aucun pari » et les textes qui justifient un marche
    // sont retires (lib/pronostic.js#retirerTextesDuPari) ; aucun texte ne contredit le pari publie.
    const texte = texteMarche && Object.prototype.hasOwnProperty.call(texteMarche, cle) ? String(texteMarche[cle] || "") : "";
    if (texte !== b.market_id) PR.retirerTextesDuPari(m, row);
    m.pronostic = {
      market_id: b.market_id, marche: def.marche, libelle_fr: PR.libelleFr(b.market_id, m),
      chance: b.chance, cote: b.cote, voie: VOIE, moteur: "forme", fiabilite: FIABILITE, selection: false, source: SOURCE, publie: true,
      cote_source: b.anj ? "anj" : "marche", bookmaker: b.anj ? b.bookmaker : null, hors_fourchette: false,
      source_chance: b.source_chance, sans_marge: CHANCE.arrondi1(b.sans_marge),
      // Base du calcul (Pro) : forme, division et buts attendus des deux clubs.
      base_forme: {
        dom: { matchs: r.base.dom.n, buts_marques: arr(r.base.dom.buts_marques), buts_encaisses: arr(r.base.dom.buts_encaisses), frequences: r.base.dom.freq, division: r.base.dom.division.ligue_nom, niveau: r.base.dom.division.niveau },
        ext: { matchs: r.base.ext.n, buts_marques: arr(r.base.ext.buts_marques), buts_encaisses: arr(r.base.ext.buts_encaisses), frequences: r.base.ext.freq, division: r.base.ext.division.ligue_nom, niveau: r.base.ext.division.niveau },
        buts_attendus: r.base.buts_attendus, chance_forme: b.p_forme, chance_calculee: b.chance_calculee, prudence: r.base.prudence,
      },
    };
    m.pronostic_dispo = true;
    if (!m.pick_frozen_at) m.pick_frozen_at = nowIso;
    if (row) {
      row.pari_rec = m.pari_rec; row.market_id = m.market_id; row.marche = m.marche; row.cote_rec = b.cote; row.model_probability = b.chance;
      row.kelly = "0"; row.edge = "";
      const raw = estObjet(row.raw_response) ? row.raw_response : {};
      if (!estObjet(raw.pick_freeze)) {
        row.raw_response = Object.assign({}, raw, { pick_freeze: { frozen_at: m.pick_frozen_at, kickoff: m.date || null,
          public: { model_output_available: true, data_quality_score: m.data_quality_score, data_quality_label: m.data_quality_label, market_source: m.market_source } } });
      }
    }
    rapport.publies++;
  });
  return rapport;
}
function arr(x) { return x == null ? null : Math.round(x * 100) / 100; }

module.exports = { VOIE, FIABILITE, SOURCE, MARCHES_REPLI, NIVEAUX, PAYS_COUPE, NIVEAU_INCONNU, RAISONS_SANS_PARI,
  lireParametres, lireMatch, matchsAvant, divisionDuClub, formeClub, butsAttendus, probabilites, cotesReelles, choisir, matchsARepli, publierRepli };
