"use strict";
// REPLI DES MATCHS DE COUPE SANS PARI : CALCUL A BLANC (demande de Clement du 28/10/2026, puis controles du meme jour).
//
// Demande : « il y a des matchs de coupe sans signal, tu es oblige de donner un pari ; base-toi sur les 10 derniers
// matchs du club et regarde la division et la coupe ». Controles du 28/10 : mathematicien ROUGE (sur 30 matchs de coupe a
// cotes reelles, ni la forme ni le marche seul ne tiennent la chance annoncee), trader et ingenieur donnees ORANGE.
// D'ou : RIEN N'EST PUBLIE tant que config/verdicts-maths.json#repli_coupes ne dit pas « GO » pour la variante. Le calcul
// tourne quand meme chaque jour et ARCHIVE ses decisions dans une table PRIVEE (migration 0059, repli_coupes_blanc) pour
// mesurer, sans jamais rien montrer : ni data.json, ni data-home.json, ni les pages, ni Telegram, ni les tickets, ni
// predictions_archive. Les matchs du calcul ne sont JAMAIS modifies par le calcul a blanc.
//
// QUELS MATCHS : apres lib/pronostic.js#publierPronostics, chaque match OUVERT, NON FIGE, d'une coupe nationale de
// config/leagues.json#fiabilite.repli_forme.competitions resté sans pari (no_signal vrai, raison
// AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE ou AUCUN_MARCHE_AVEC_COTE_REELLE).
//
// DEUX VARIANTES, chacune au plus un pari par match :
//   A « forme » : buts attendus (Poisson) tires des 10 derniers matchs OFFICIELS de chaque club joues AVANT le coup
//     d'envoi et dans les fenetre_jours (365) derniers jours (amicaux exclus, score a 90 minutes), corriges par l'ecart de
//     division (beta) et l'avantage du club qui recoit. Division = celle du DERNIER match de championnat (table NIVEAUX :
//     Espagne, Allemagne, Angleterre, Italie, France). Moins de min_matchs_championnat matchs de championnat dans la
//     fenetre, ou forme trop courte : REPLI_FORME_DONNEES_PERIMEES ; appel API refuse : REPLI_FORME_API_ERREUR (compte a
//     part). Chance = le plus bas entre la forme et la cote sans marge du meme marche, moins la prudence (2 divisions
//     d'ecart ou plus), puis corrections_chance.
//   B « marche » : chance = MEDIANE, sur les bookmakers du releve, de la chance sans marge (methode puissance) ; marches
//     1N2 (jamais le nul), double chance, plus/moins de 1,5, 2,5 et 3,5 buts ; puis corrections_chance.
// Pour les deux : seulement une COTE REELLE (agreee ANJ d'abord, sinon le bookmaker de reference du releve deja charge,
// lib/flux-paris.js) entre fourchette_pari.cote_min (1,40) et repli_forme.cote_max (2,00) ; jamais une cote inventee
// (decision C4 du 29/09) ; la chance AFFICHEE FINALE (apres prudence et corrections) doit etre >= chance_min (50 %) ;
// la plus grande l'emporte. L'heure du releve de la cote (captured_at du flux, jamais une cote de cloture) est gardee.

const CHANCE = require("./chance-iashark.js");
const COTE_ANJ = require("./cote-anj.js");
const MP = require("./marches-paris.js");
const FP = require("./flux-paris.js");
const { computeRiskLabel } = require("./decision.js");

const VOIE = "repli_forme";
const FIABILITE = "en test";
const SOURCE = "forme des 10 derniers matchs et division, le plus bas avec la cote sans marge";
const VARIANTES = Object.freeze(["forme", "marche"]);
const RAISONS_SANS_PARI = ["AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE", "AUCUN_MARCHE_AVEC_COTE_REELLE"];
const REGLE_VERSION = "repli-coupes-2026-10-28";
// Cache des matchs des clubs (ingenieur donnees, 28/10) : quelques heures, jamais une journee entiere.
const CACHE_MS = 3 * 3600000;

// Variante A : ceux de lib/pronostic.js#MARCHES_CONNUS (jamais le nul, jamais « au moins une equipe ne marque pas »), la
// ligne de 4,5 buts et les buts d'une equipe ; ceux que la mesure ecarte : repli_forme.marches_exclus.
const MARCHES_REPLI = Object.freeze(["home-win", "away-win", "dc-1x", "dc-x2", "dc-12",
  "over-15", "under-15", "over-25", "under-25", "over-35", "under-35", "over-45", "under-45", "btts-yes",
  "home-team-over-05", "home-team-over-15", "home-team-over-25", "home-team-under-05", "home-team-under-15", "home-team-under-25",
  "away-team-over-05", "away-team-over-15", "away-team-over-25", "away-team-under-05", "away-team-under-15", "away-team-under-25"]);
// Variante B (demande du coordinateur du 28/10) : 1N2, double chance, plus/moins de 1,5 / 2,5 / 3,5 buts.
const MARCHES_MARCHE = Object.freeze(["home-win", "away-win", "dc-1x", "dc-x2", "dc-12", "over-15", "under-15", "over-25", "under-25", "over-35", "under-35"]);

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
const PAYS_COUPE = Object.freeze({ 143: "ES", 81: "DE", 45: "EN", 48: "EN", 137: "IT", 66: "FR" });

const AMICAL = /friendl|amical/i;
const FINIS = ["FT", "AET", "PEN"];
const ANNULES = ["PST", "CANC", "ABD", "AWD", "WO"];
const JOUR_MS = 86400000;

function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function cote(v) { const x = nombre(v); return x !== null && x > 1 ? Math.round(x * 100) / 100 : null; }
function arr(x) { return x == null ? null : Math.round(x * 100) / 100; }
function mediane(l) { const s = l.slice().sort(function (a, b) { return a - b; }); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

// ------------------------------------------------------------------------------------------------ parametres et feu
// config/leagues.json#fiabilite.repli_forme (seul endroit ou ils sont ecrits). Absents ou illisibles : rien.
function lireParametres(cfg) {
  const r = cfg && cfg.fiabilite && cfg.fiabilite.repli_forme;
  if (!estObjet(r)) return null;
  const f = cfg.fiabilite.fourchette_pari || {};
  const p = {
    competitions: Array.isArray(r.competitions) ? r.competitions.map(String) : [],
    cote_min: nombre(f.cote_min), cote_max: Math.min(nombre(r.cote_max) || Infinity, nombre(f.cote_max) || Infinity),
    chance_min: nombre(r.chance_min) || 0, n_matchs: nombre(r.n_matchs) || 10, min_matchs: nombre(r.min_matchs) || 5,
    fenetre_jours: nombre(r.fenetre_jours) || 365, min_matchs_championnat: nombre(r.min_matchs_championnat) || 5,
    buts_moyens: nombre(r.buts_moyens), beta: nombre(r.beta), avantage_domicile: nombre(r.avantage_domicile), lissage: nombre(r.lissage),
    marches_exclus: Array.isArray(r.marches_exclus) ? r.marches_exclus.map(String) : [],
    prudence_ecart: estObjet(r.prudence) ? Math.max(0, nombre(r.prudence.ecart_2_divisions_ou_plus) || 0) : 0,
    prudence_autres: estObjet(r.prudence) ? Math.max(0, nombre(r.prudence.autres) || 0) : 0,
  };
  if (!(p.cote_min >= 1.4) || !(p.cote_max >= p.cote_min) || !(p.buts_moyens > 0) || p.beta === null || !(p.avantage_domicile > 0) || p.lissage === null) return null;
  return Object.freeze(p);
}
// Feu du mathematicien (config/verdicts-maths.json#repli_coupes) : SEULE la valeur « GO » autorise la publication d'une
// variante ; absent, illisible, « NO-GO » ou autre : NO-GO (calcul a blanc seulement).
function verdict(verdicts) {
  const v = verdicts && estObjet(verdicts.repli_coupes) ? verdicts.repli_coupes : {};
  const out = {};
  VARIANTES.forEach(function (k) { out[k] = v[k] === "GO" ? "GO" : "NO-GO"; });
  return out;
}

// ------------------------------------------------------------------------------------------------ forme et division
// Un match API-Football (fixtures) -> { id, t, dom, ext, ligue, ligue_nom, bd, be (buts du temps reglementaire) } ou null.
function lireMatch(f) {
  if (!f || !f.fixture || !f.teams || !f.league) return null;
  const st = f.fixture.status && f.fixture.status.short;
  if (FINIS.indexOf(st) === -1) return null;
  const ft = f.score && f.score.fulltime;
  let h = ft ? nombre(ft.home) : null, a = ft ? nombre(ft.away) : null;
  if ((h === null || a === null) && st === "FT" && f.goals) { h = nombre(f.goals.home); a = nombre(f.goals.away); }
  if (h === null || a === null) return null;
  const t = Date.parse(f.fixture.date);
  if (!Number.isFinite(t)) return null;
  return { id: f.fixture.id, t: t, date: f.fixture.date, dom: f.teams.home.id, ext: f.teams.away.id, dom_nom: f.teams.home.name, ext_nom: f.teams.away.name,
    ligue: Number(f.league.id), ligue_nom: String(f.league.name || ""), bd: h, be: a };
}
// Matchs officiels d'un club joues STRICTEMENT avant avantIso et dans les fenetreJours jours precedents, du plus recent au
// plus ancien (zero fuite du futur, jamais une forme perimee).
function matchsAvant(fixtures, teamId, avantIso, fenetreJours) {
  const limite = Date.parse(avantIso);
  if (!Number.isFinite(limite)) return [];
  const debut = limite - (Number(fenetreJours) > 0 ? Number(fenetreJours) : 365) * JOUR_MS;
  const vus = new Set();
  return (Array.isArray(fixtures) ? fixtures : []).map(lireMatch).filter(function (x) {
    if (!x || x.t >= limite || x.t < debut || vus.has(x.id)) return false;
    if (x.dom !== teamId && x.ext !== teamId) return false;
    if (AMICAL.test(x.ligue_nom)) return false;
    vus.add(x.id);
    return true;
  }).sort(function (a, b) { return b.t - a.t; });
}
// Division : celle du DERNIER match de championnat (table NIVEAUX) de la fenetre, et le nombre de matchs de championnat.
function divisionDuClub(fixtures, teamId, avantIso, fenetreJours) {
  const ms = matchsAvant(fixtures, teamId, avantIso, fenetreJours).filter(function (x) { return !!NIVEAUX[x.ligue]; });
  if (!ms.length) return { ligue: null, ligue_nom: null, pays: null, niveau: null, n_championnat: 0, dernier: null };
  const d = NIVEAUX[ms[0].ligue];
  return { ligue: ms[0].ligue, ligue_nom: ms[0].ligue_nom, pays: d.pays, niveau: d.niveau, n_championnat: ms.length, dernier: ms[0].date };
}
// Forme : les n derniers matchs officiels de la fenetre -> { n, bm, be (moyennes), sommes, freq (%), matchs }.
function formeClub(fixtures, teamId, avantIso, n, fenetreJours) {
  const ms = matchsAvant(fixtures, teamId, avantIso, fenetreJours).slice(0, n || 10);
  if (!ms.length) return { n: 0, bm: null, be: null, sommes: { bm: 0, be: 0 }, freq: null, matchs: [] };
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
// Donnees de forme des deux clubs -> { ok, raison, fD, fE, dvD, dvE }.
function baseForme(domFx, extFx, idD, idE, avantIso, p) {
  const fD = formeClub(domFx, idD, avantIso, p.n_matchs, p.fenetre_jours), fE = formeClub(extFx, idE, avantIso, p.n_matchs, p.fenetre_jours);
  const dvD = divisionDuClub(domFx, idD, avantIso, p.fenetre_jours), dvE = divisionDuClub(extFx, idE, avantIso, p.fenetre_jours);
  const ok = fD.n >= p.min_matchs && fE.n >= p.min_matchs && dvD.n_championnat >= p.min_matchs_championnat && dvE.n_championnat >= p.min_matchs_championnat;
  return { ok: ok, raison: ok ? null : "REPLI_FORME_DONNEES_PERIMEES", fD: fD, fE: fE, dvD: dvD, dvE: dvE };
}

// ------------------------------------------------------------------------------------------------ modele
function butsAttendus(fDom, fExt, nDom, nExt, p) {
  if (!fDom || !fExt || !(fDom.n > 0) || !(fExt.n > 0) || !p) return null;
  const L = p.buts_moyens, k = p.lissage;
  const lisse = function (somme, n) { return (somme + k * L) / (n + k) / L; };
  const attD = lisse(fDom.sommes.bm, fDom.n), defD = lisse(fDom.sommes.be, fDom.n);
  const attE = lisse(fExt.sommes.bm, fExt.n), defE = lisse(fExt.sommes.be, fExt.n);
  // Ecart de niveaux : positif quand le club qui recoit joue plus bas (niveau plus grand).
  const g = (Number(nDom) || 0) - (Number(nExt) || 0);
  const h = Math.sqrt(p.avantage_domicile);
  return { dom: L * attD * defE * h * Math.exp(-p.beta * g), ext: L * attE * defD / h * Math.exp(p.beta * g), ecart_niveaux: g };
}
function poisson(l, max) { const o = [Math.exp(-l)]; for (let i = 1; i <= max; i++) o.push(o[i - 1] * l / i); return o; }
const MAX_BUTS = 10;
// Probabilites (%) de chaque marche du catalogue (score final) a partir des buts attendus.
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
// Cotes reelles : agreee ANJ d'abord (livres du match), sinon le bookmaker de reference du releve deja charge
// (lib/flux-paris.js#selectionsDuMatch : marge retiree, controle Pinnacle). -> { id: { cote, anj, bookmaker, sans_marge } }.
function cotesReelles(m, raw, livres, ids) {
  const liste = ids || MARCHES_REPLI;
  const out = {};
  if (estObjet(raw)) {
    FP.selectionsDuMatch(raw, { match: m }).selections.forEach(function (s) {
      const id = MP.idDuFlux({ 50: 5, 72: 6 }[s.bet_id] || s.bet_id, s.value);
      if (!id || out[id] || liste.indexOf(id) === -1) return;
      const k = cote(s.cote), q = nombre(s.chance);
      if (k === null || q === null || !(q > 0 && q < 1)) return;
      out[id] = { cote: k, anj: false, bookmaker: null, sans_marge: q * 100 };
    });
  }
  if (livres) {
    const qAnj = COTE_ANJ.sansMargeAnj(livres) || {};
    liste.forEach(function (id) {
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
// Variante B : MEDIANE, sur tous les bookmakers du releve, de la chance sans marge (methode puissance) de chaque issue des
// marches de MARCHES_MARCHE. -> { id: { chance (%), n (bookmakers) } }.
function chancesMediane(raw) {
  const flux = estObjet(raw) ? FP.lireFlux(raw) : {};
  const par = {};
  const ajoute = function (id, p) { if (p > 0 && p < 1) (par[id] = par[id] || []).push(p * 100); };
  Object.keys(flux).forEach(function (bk) {
    const r = flux[bk][1];
    const v = r ? ["Home", "Draw", "Away"].map(function (n) { return r.values.find(function (x) { return x.value === n; }); }) : null;
    const q = v && v.every(Boolean) ? FP.puissance(v.map(function (x) { return x.odd; })) : null;
    if (q) { ajoute("home-win", q.p[0]); ajoute("away-win", q.p[2]); ajoute("dc-1x", q.p[0] + q.p[1]); ajoute("dc-x2", q.p[1] + q.p[2]); ajoute("dc-12", q.p[0] + q.p[2]); }
    const b = flux[bk][5];
    [1.5, 2.5, 3.5].forEach(function (l) {
      const o = b && b.values.find(function (x) { return x.value === "Over " + l; }), u = b && b.values.find(function (x) { return x.value === "Under " + l; });
      const qo = o && u ? FP.puissance([o.odd, u.odd]) : null;
      if (qo) { const s = String(l).replace(".", ""); ajoute("over-" + s, qo.p[0]); ajoute("under-" + s, qo.p[1]); }
    });
  });
  const out = {};
  Object.keys(par).forEach(function (id) { out[id] = { chance: mediane(par[id]), n: par[id].length }; });
  return out;
}

// ------------------------------------------------------------------------------------------------ choix
function dansBornes(k, p) { const x = Math.round(k * 100); return x >= Math.round(p.cote_min * 100) && x <= Math.round(p.cote_max * 100); }
function corriger(opts, chance, m, id, k, sourceChance) {
  return opts.chanceCorrigee ? opts.chanceCorrigee(chance, opts.regles, { market_id: id, ligue: m.league_key, famille: MP.CATALOGUE[id].famille, option: "principale", cote: k, source_chance: sourceChance }) : { chance: chance };
}
// Le meilleur candidat dont la chance AFFICHEE FINALE atteint chance_min (controle du trader du 28/10).
function meilleur(cands, p) {
  cands.sort(function (a, b) { return (b.chance_affichee - a.chance_affichee) || ((b.anj ? 1 : 0) - (a.anj ? 1 : 0)) || ((b.p_forme || 0) - (a.p_forme || 0)) || (a.rang - b.rang); });
  if (!cands.length) return { pari: null, raison: "AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE" };
  const b = cands.filter(function (c) { return c.chance_affichee >= p.chance_min; })[0];
  return b ? { pari: b, raison: null } : { pari: null, raison: "REPLI_CHANCE_TROP_BASSE" };
}
// Variante A. d = { dom, ext (matchs des clubs), erreur_api, odds (releve), livres }.
function choisirForme(m, d, opts) {
  const p = opts.params;
  if (d && d.erreur_api) return { pari: null, raison: "REPLI_FORME_API_ERREUR", base: null };
  const bf = baseForme(d && d.dom, d && d.ext, m.home && m.home.id, m.away && m.away.id, opts.avantIso, p);
  const base = { dom: { n: bf.fD.n, buts_marques: arr(bf.fD.bm), buts_encaisses: arr(bf.fD.be), division: bf.dvD.ligue_nom, niveau: bf.dvD.niveau, matchs_championnat: bf.dvD.n_championnat },
    ext: { n: bf.fE.n, buts_marques: arr(bf.fE.bm), buts_encaisses: arr(bf.fE.be), division: bf.dvE.ligue_nom, niveau: bf.dvE.niveau, matchs_championnat: bf.dvE.n_championnat } };
  if (!bf.ok) return { pari: null, raison: bf.raison, base: base };
  const l = butsAttendus(bf.fD, bf.fE, bf.dvD.niveau, bf.dvE.niveau, p);
  const pr = probabilites(l);
  if (!pr) return { pari: null, raison: "REPLI_FORME_DONNEES_PERIMEES", base: base };
  base.buts_attendus = { dom: arr(l.dom), ext: arr(l.ext) };
  const cotes = cotesReelles(m, d && d.odds, d && d.livres, MARCHES_REPLI);
  if (!Object.keys(cotes).length) return { pari: null, raison: "AUCUN_MARCHE_AVEC_COTE_REELLE", base: base };
  const prudence = Math.abs(l.ecart_niveaux) >= 2 ? p.prudence_ecart : p.prudence_autres;
  base.prudence = prudence;
  const cands = [];
  MARCHES_REPLI.forEach(function (id, rang) {
    const k = cotes[id], pf = pr[id];
    if (!k || pf == null || p.marches_exclus.indexOf(id) !== -1 || !dansBornes(k.cote, p)) return;
    const c = CHANCE.chanceIashark(pf, k.sans_marge);
    if (!c) return;
    const chance = Math.max(1, c.chance - prudence);
    // « marche » seulement quand le chiffre affiche est exactement la cote sans marge (lib/match-view-model.js#comparaisonPari).
    const sourceChance = prudence === 0 && Math.round(k.sans_marge) <= Math.round(pf) ? "marche" : "modele";
    const corr = corriger(opts, chance, m, id, k.cote, sourceChance);
    if (!corr) return;
    cands.push({ market_id: id, rang: rang, cote: k.cote, anj: k.anj, bookmaker: k.bookmaker, sans_marge: Math.round(k.sans_marge * 10) / 10, p_forme: Math.round(pf * 10) / 10,
      chance_calculee: c.chance, chance: chance, chance_affichee: corr.chance, source_chance: sourceChance });
  });
  const r = meilleur(cands, p);
  return { pari: r.pari, raison: r.raison, base: base };
}
// Variante B.
function choisirMarche(m, d, opts) {
  const p = opts.params;
  const ch = chancesMediane(d && d.odds);
  const cotes = cotesReelles(m, d && d.odds, d && d.livres, MARCHES_MARCHE);
  if (!Object.keys(cotes).length) return { pari: null, raison: "AUCUN_MARCHE_AVEC_COTE_REELLE", base: null };
  const cands = [];
  MARCHES_MARCHE.forEach(function (id, rang) {
    const k = cotes[id], q = ch[id];
    if (!k || !q || !(q.chance > 0 && q.chance < 100) || !dansBornes(k.cote, p)) return;
    const chance = Math.max(1, Math.min(99, Math.round(q.chance)));
    const corr = corriger(opts, chance, m, id, k.cote, "marche");
    if (!corr) return;
    cands.push({ market_id: id, rang: rang, cote: k.cote, anj: k.anj, bookmaker: k.bookmaker, sans_marge: Math.round(q.chance * 10) / 10, bookmakers: q.n,
      chance_calculee: chance, chance: chance, chance_affichee: corr.chance, source_chance: "marche" });
  });
  const r = meilleur(cands, p);
  return { pari: r.pari, raison: r.raison, base: { bookmakers: Object.keys(ch).length ? Math.max.apply(null, Object.keys(ch).map(function (k) { return ch[k].n; })) : 0 } };
}

// ------------------------------------------------------------------------------------------------ calcul a blanc
function estFerme(m) { return /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String((m && m.no_signal_reason) || "")); }
function aUnPari(m) { return !!(m && String(m.pari_rec || "").trim() && m.no_signal !== true); }
// Matchs concernes (le pipeline va chercher leurs donnees, puis appelle calculerBlanc).
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
// Heure du releve de la cote : celle de l'appel des agrees pour une cote agreee, sinon captured_at du releve deja charge
// (odds_snapshots, ou « update » d'API-Football). Jamais une heure inventee : inconnue -> null (la ligne est refusee).
function heureReleve(b, d, cle, opts) {
  if (b.anj) {
    const hc = estObjet(opts.relevesAnj) ? opts.relevesAnj[cle] : null, he = estObjet(opts.relevesAnjEvenement) ? opts.relevesAnjEvenement[cle] : null;
    return COTE_ANJ.heureDuMarche(b.market_id, hc, he) || opts.releveAnjA || null;
  }
  return (d && d.odds_releve_a) || null;
}
// LE CALCUL A BLANC : decisions des deux variantes pour chaque match concerne, SANS toucher aux matchs.
// opts : { configLigues, figes, donnees: { fixture: { dom, ext, erreur_api, odds, odds_releve_a } }, koIso, cotesAnjPar,
//          relevesAnj, relevesAnjEvenement, releveAnjA, pronostic (chanceCorrigee), pipelineSha }.
// -> { lignes (a archiver : un pari par variante), raisons: { variante: { raison: n } }, candidats }.
function calculerBlanc(matchs, opts) {
  opts = opts || {};
  const PR = opts.pronostic || require("./pronostic.js");
  const p = opts.params || lireParametres(opts.configLigues);
  const out = { lignes: [], raisons: { forme: {}, marche: {} }, candidats: 0, decisions: {} };
  if (!p) return out;
  const regles = (opts.configLigues && opts.configLigues.fiabilite && opts.configLigues.fiabilite.corrections_chance) || [];
  const donnees = estObjet(opts.donnees) ? opts.donnees : {};
  const livresPar = estObjet(opts.cotesAnjPar) ? opts.cotesAnjPar : {};
  matchsARepli(matchs, Object.assign({}, opts, { params: p })).forEach(function (m) {
    out.candidats++;
    const cle = String(m.id);
    const ko = estObjet(opts.koIso) ? opts.koIso[cle] : null;
    const d0 = donnees[cle];
    const d = d0 ? Object.assign({}, d0, { livres: livresPar[cle] || d0.livres || null }) : null;
    const o = { params: p, regles: regles, chanceCorrigee: PR.chanceCorrigee, avantIso: ko };
    const res = {
      forme: !d || !ko ? { pari: null, raison: "REPLI_DONNEES_ABSENTES" } : choisirForme(m, d, o),
      marche: !d || !ko ? { pari: null, raison: "REPLI_DONNEES_ABSENTES" } : choisirMarche(m, d, o),
    };
    out.decisions[cle] = res;
    VARIANTES.forEach(function (v) {
      const r = res[v];
      if (!r.pari) { out.raisons[v][r.raison] = (out.raisons[v][r.raison] || 0) + 1; return; }
      const b = r.pari, def = MP.CATALOGUE[b.market_id];
      const releve = heureReleve(b, d, cle, opts);
      if (!releve) { out.raisons[v].REPLI_HEURE_DU_RELEVE_INCONNUE = (out.raisons[v].REPLI_HEURE_DU_RELEVE_INCONNUE || 0) + 1; return; }
      out.lignes.push({
        fixture_id: Number(m.id), league_key: String(m.league_key || ""), home: (m.home && m.home.n) || "", away: (m.away && m.away.n) || "",
        coup_envoi: ko, variante: v, market_id: b.market_id, marche: def.marche, pari: PR.libelleFr(b.market_id, m) || def.marche,
        cote: b.cote, cote_source: b.anj ? "anj" : "marche", bookmaker: b.anj ? b.bookmaker : null, cote_releve_a: releve,
        chance: b.chance_affichee, chance_calculee: b.chance_calculee, regle_version: REGLE_VERSION, pipeline_sha: opts.pipelineSha || null,
        details: { sans_marge: b.sans_marge, p_forme: b.p_forme != null ? b.p_forme : null, source_chance: b.source_chance, base: r.base || null },
      });
    });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ reglement
// Resultat d'une ligne archivee a partir du match API-Football (score a 90 minutes). -> { resultat, score_90 } ou null.
function reglerLigne(ligne, f) {
  if (!ligne || !f || !f.fixture) return null;
  const st = f.fixture.status && f.fixture.status.short;
  if (ANNULES.indexOf(st) !== -1) return { resultat: "annule", score_90: null };
  if (FINIS.indexOf(st) === -1) return null;
  const ft = f.score && f.score.fulltime;
  const h = ft ? nombre(ft.home) : null, a = ft ? nombre(ft.away) : null;
  const def = MP.CATALOGUE[String(ligne.market_id || "")];
  if (h === null || a === null || !def) return null;
  return { resultat: def.test({ h1: h, a1: a, h2: 0, a2: 0 }) ? "gagne" : "perdu", score_90: h + "-" + a };
}

// ------------------------------------------------------------------------------------------------ stockage prive (PostgREST)
const TABLE = "repli_coupes_blanc";
function client(ctx) {
  const url = ctx && ctx.supabase && ctx.supabase.url ? String(ctx.supabase.url).replace(/\/$/, "") : null;
  const cle = ctx && ctx.supabase && ctx.supabase.cle ? String(ctx.supabase.cle) : null;
  const f = (ctx && ctx.fetch) || (typeof fetch === "function" ? fetch : null);
  if (!url || !cle || !f) return null;
  const entetes = function (extra) { return Object.assign({ apikey: cle, Authorization: "Bearer " + cle, "Content-Type": "application/json" }, extra || {}); };
  return {
    // Une decision par match et par variante, jamais ecrasee (« ignore-duplicates ») ; heure de decision posee par la base.
    // Ligne par ligne : un refus de la base (coup d'envoi passe entre-temps) n'emporte pas les autres.
    inserer: async function (lignes) {
      let n = 0, refus = 0;
      for (const l of lignes || []) {
        const r = await f(url + "/rest/v1/" + TABLE + "?on_conflict=fixture_id,variante", { method: "POST", headers: entetes({ Prefer: "resolution=ignore-duplicates,return=representation" }), body: JSON.stringify([l]) });
        if (!r.ok) { refus++; continue; }
        const rows = await r.json().catch(function () { return []; });
        if (Array.isArray(rows) && rows.length) n++;
      }
      return { nouvelles: n, refus: refus };
    },
    aRegler: async function (avantIso) {
      const r = await f(url + "/rest/v1/" + TABLE + "?select=fixture_id,variante,market_id&resultat=is.null&coup_envoi=lt." + encodeURIComponent(avantIso) + "&limit=200", { headers: entetes() });
      if (!r.ok) throw new Error(TABLE + " lecture " + r.status);
      const rows = await r.json();
      return Array.isArray(rows) ? rows : [];
    },
    regler: async function (fixtureId, variante, champs) {
      const r = await f(url + "/rest/v1/" + TABLE + "?fixture_id=eq." + Number(fixtureId) + "&variante=eq." + encodeURIComponent(variante), { method: "PATCH", headers: entetes({ Prefer: "return=minimal" }), body: JSON.stringify(champs) });
      if (!r.ok) throw new Error(TABLE + " reglement " + r.status);
    },
  };
}
// Archive les lignes du calcul a blanc. -> { nouvelles, refus } (ou null sans base).
async function archiver(lignes, ctx) {
  const c = client(ctx);
  if (!c) return null;
  return c.inserer(lignes || []);
}
// Regle les lignes dont le coup d'envoi est passe depuis plus de 3 h. ctx.matchsParIds(ids) -> matchs API-Football.
async function reglerArchive(ctx) {
  const c = client(ctx);
  if (!c || typeof ctx.matchsParIds !== "function") return null;
  const nowMs = ctx.nowMs || Date.now();
  const lignes = await c.aRegler(new Date(nowMs - 3 * 3600000).toISOString());
  const ids = Array.from(new Set(lignes.map(function (l) { return Number(l.fixture_id); })));
  const par = {};
  for (let i = 0; i < ids.length; i += 20) {
    (await ctx.matchsParIds(ids.slice(i, i + 20)) || []).forEach(function (f) { if (f && f.fixture) par[String(f.fixture.id)] = f; });
  }
  let n = 0;
  for (const l of lignes) {
    const r = reglerLigne(l, par[String(l.fixture_id)]);
    if (!r) continue;
    await c.regler(l.fixture_id, l.variante, Object.assign({}, r, { regle_a: new Date(nowMs).toISOString() }));
    n++;
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ publication (verrou)
// Publie le pari d'une variante « GO » (config/verdicts-maths.json#repli_coupes) avec les memes champs que
// lib/pronostic.js#publierPronostics. NO-GO pour les deux variantes (cas du 28/10/2026) : RIEN n'est touche.
// opts : ceux de calculerBlanc + { verdicts, premiumRows via l'argument, texteMarche, nowIso, decisions (de calculerBlanc) }.
// -> { publies, variante, bloque }.
function publierRepli(matchs, premiumRows, opts) {
  opts = opts || {};
  const feu = verdict(opts.verdicts || require("../config/verdicts-maths.json"));
  const variante = VARIANTES.find(function (v) { return feu[v] === "GO"; });
  if (!variante) return { publies: 0, variante: null, bloque: "NO-GO" };
  const PR = opts.pronostic || require("./pronostic.js");
  const decisions = estObjet(opts.decisions) ? opts.decisions : calculerBlanc(matchs, opts).decisions;
  const livresPar = estObjet(opts.cotesAnjPar) ? opts.cotesAnjPar : {};
  const texteMarche = estObjet(opts.texteMarche) ? opts.texteMarche : null;
  const nowIso = opts.nowIso || new Date().toISOString();
  let publies = 0;
  (matchs || []).forEach(function (m) {
    const cle = m && m.id != null ? String(m.id) : null;
    const r = cle && decisions[cle] ? decisions[cle][variante] : null;
    if (!r || !r.pari || aUnPari(m) || estFerme(m) || (opts.figes && opts.figes[cle])) return;
    const b = r.pari, def = MP.CATALOGUE[b.market_id];
    const row = (premiumRows || []).find(function (x) { return x && String(x.fixture_id) === cle; }) || null;
    m.pari_rec = def.marche; m.market_id = b.market_id; m.marche = def.categorie; m.cote_rec = b.cote.toFixed(2);
    if (b.anj) {
      m.cote_bookmaker = b.bookmaker; m.cote_source = "anj";
      const hc = estObjet(opts.relevesAnj) ? opts.relevesAnj[cle] : null, he = estObjet(opts.relevesAnjEvenement) ? opts.relevesAnjEvenement[cle] : null;
      m.cote_releve_a = COTE_ANJ.heureDuMarche(b.market_id, hc, he) || opts.releveAnjA || nowIso;
      const sm = livresPar[cle] ? COTE_ANJ.sansMargeAnj(livresPar[cle]) : null;
      if (sm) m.sans_marge_anj = sm; else delete m.sans_marge_anj;
    } else { m.cote_bookmaker = null; m.cote_source = "indicative"; delete m.cote_releve_a; delete m.sans_marge_anj; }
    m.odds_available = true; m.pick_downgrade = ""; m.risque = computeRiskLabel(b.cote);
    m.model_probability = b.chance; m.conf = Math.round(b.chance) / 10; m.chance_iashark = b.chance; m.chance_iashark_source = SOURCE;
    m.model_output_available = true; m.no_signal = false; m.no_signal_label = "";
    ["no_signal_reason", "has_signal", "chance_correction", "is_canonical_pick", "v3_pari", "selection_iashark", "option_cote"].forEach(function (k) { delete m[k]; });
    m.selection_voie = VOIE + "_" + variante;
    m.paris_safe = { bet: m.pari_rec, cote: b.cote, proba: Math.round(b.chance) + "%" };
    const texte = texteMarche && Object.prototype.hasOwnProperty.call(texteMarche, cle) ? String(texteMarche[cle] || "") : "";
    if (texte !== b.market_id) PR.retirerTextesDuPari(m, row);
    m.pronostic = { market_id: b.market_id, marche: def.marche, libelle_fr: PR.libelleFr(b.market_id, m), chance: b.chance, cote: b.cote, voie: VOIE, moteur: variante,
      fiabilite: FIABILITE, selection: false, source: SOURCE, publie: true, cote_source: b.anj ? "anj" : "marche", bookmaker: b.anj ? b.bookmaker : null,
      hors_fourchette: false, source_chance: b.source_chance, sans_marge: CHANCE.arrondi1(b.sans_marge) };
    m.pronostic_dispo = true;
    if (!m.pick_frozen_at) m.pick_frozen_at = nowIso;
    if (row) {
      row.pari_rec = m.pari_rec; row.market_id = m.market_id; row.marche = m.marche; row.cote_rec = b.cote; row.model_probability = b.chance; row.kelly = "0"; row.edge = "";
      const raw = estObjet(row.raw_response) ? row.raw_response : {};
      if (!estObjet(raw.pick_freeze)) row.raw_response = Object.assign({}, raw, { pick_freeze: { frozen_at: m.pick_frozen_at, kickoff: m.date || null,
        public: { model_output_available: true, data_quality_score: m.data_quality_score, data_quality_label: m.data_quality_label, market_source: m.market_source } } });
    }
    publies++;
  });
  return { publies: publies, variante: variante, bloque: null };
}

module.exports = { VOIE, FIABILITE, SOURCE, VARIANTES, REGLE_VERSION, CACHE_MS, TABLE, MARCHES_REPLI, MARCHES_MARCHE, NIVEAUX, PAYS_COUPE, RAISONS_SANS_PARI,
  lireParametres, verdict, lireMatch, matchsAvant, divisionDuClub, formeClub, baseForme, butsAttendus, probabilites, cotesReelles, chancesMediane,
  choisirForme, choisirMarche, matchsARepli, calculerBlanc, reglerLigne, archiver, reglerArchive, publierRepli };
