#!/usr/bin/env node
"use strict";
// TEST SUR LE PASSE DU REPLI « FORME » DES COUPES (lib/repli-forme.js, demande de Clement du 28/10/2026).
//
// Usage : node scripts/backtest-repli-coupes.js <dossier> [--ajuster]
//   <dossier> : donnees API-Football deja telechargees (jamais dans le depot) :
//     fx_<coupe>_<saison>.json : /fixtures?league=<coupe>&season=<saison> (coupes 143, 81, 48, 137, 66, 45) ;
//     teams/<club>_<saison>.json : matchs du club (toutes competitions) de la saison, forme compacte
//       { id, date, st, lg, lgn, h, a, hn, an, ft: { home, away }, g: { home, away } } ;
//     odds/<match>.json : /odds?fixture=<match> (response[0]) quand API-Football les garde encore (matchs recents).
//
// ZERO FUITE DU FUTUR (DATA_LEAKAGE_POLICY.md) : pour chaque match, seuls les matchs des clubs joues STRICTEMENT avant
// son coup d'envoi entrent dans le calcul (lib/repli-forme.js#matchsAvant) ; le score du match ne sert qu'a le regler.
// Parametres (beta, avantage du terrain, buts moyens, lissage) AJUSTES sur la saison 2025-2026 seulement (--ajuster),
// MESURES sur la saison 2026-2027 (jamais vue pendant l'ajustement). Reglement : temps reglementaire (score.fulltime).
const fs = require("fs");
const path = require("path");
const RF = require("../lib/repli-forme.js");
const MP = require("../lib/marches-paris.js");
const CFG = require("../config/leagues.json");

const DIR = process.argv[2];
if (!DIR) { console.error("usage : node scripts/backtest-repli-coupes.js <dossier> [--ajuster]"); process.exit(1); }
const AJUSTER = process.argv.indexOf("--ajuster") !== -1;
const COUPES = { 143: "Coupe du Roi", 81: "Coupe d'Allemagne", 48: "Coupe de la Ligue anglaise", 137: "Coupe d'Italie", 66: "Coupe de France", 45: "FA Cup" };
const lire = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (_e) { return null; } };

// Forme compacte -> objet API-Football (meme lecture que le pipeline).
function versApi(x) {
  return { fixture: { id: x.id, date: x.date, status: { short: x.st } }, league: { id: x.lg, name: x.lgn }, teams: { home: { id: x.h, name: x.hn }, away: { id: x.a, name: x.an } },
    goals: x.g || { home: null, away: null }, score: { fulltime: x.ft || { home: null, away: null } } };
}
const CACHE = {};
function matchsDuClub(id, saison) {
  const k = id + "_" + saison;
  if (!CACHE[k]) CACHE[k] = [saison, saison - 1].map((s) => lire("teams/" + id + "_" + s + ".json") || []).flat().map(versApi);
  return CACHE[k];
}

// Echantillon : matchs de coupe finis, score du temps reglementaire connu.
const echantillon = [];
Object.keys(COUPES).forEach((L) => [2025, 2026].forEach((S) => {
  const j = lire("fx_" + L + "_" + S + ".json");
  ((j && j.response) || []).forEach((f) => {
    if (["FT", "AET", "PEN"].indexOf(f.fixture.status.short) === -1) return;
    const ft = f.score && f.score.fulltime;
    if (!ft || ft.home == null || ft.away == null) return;
    echantillon.push({ f: f, coupe: Number(L), saison: S, h: ft.home, a: ft.away });
  });
}));

const BASE = RF.lireParametres(CFG);
function preparer(x, p) {
  const f = x.f, ko = f.fixture.date;
  const bf = RF.baseForme(matchsDuClub(f.teams.home.id, x.saison), matchsDuClub(f.teams.away.id, x.saison), f.teams.home.id, f.teams.away.id, ko, p);
  return { x: x, fD: bf.fD, fE: bf.fE, vD: bf.dvD, vE: bf.dvE, ok: bf.ok };
}
function logPoisson(k, l) { let s = -l + k * Math.log(l); for (let i = 2; i <= k; i++) s -= Math.log(i); return s; }
function vraisemblance(prep, p) {
  let s = 0;
  prep.forEach((q) => { const l = RF.butsAttendus(q.fD, q.fE, q.vD.niveau, q.vE.niveau, p); s += logPoisson(q.x.h, l.dom) + logPoisson(q.x.a, l.ext); });
  return s;
}

const params = Object.assign({}, BASE);
const prepTous = echantillon.map((x) => preparer(x, params));
const app = prepTous.filter((q) => q.ok && q.x.saison === 2025);
const test = prepTous.filter((q) => q.ok && q.x.saison === 2026);
console.log("Matchs de coupe finis : " + echantillon.length + " ; exploitables (>= " + params.min_matchs + " matchs officiels et >= " + params.min_matchs_championnat + " matchs de championnat par club sur " + params.fenetre_jours + " jours) : ajustement 2025-26 = " + app.length + ", test 2026-27 = " + test.length);

if (AJUSTER) {
  let best = null;
  for (let beta = 0; beta <= 0.8001; beta += 0.02) for (let H = 1.0; H <= 1.8001; H += 0.05) for (const L of [1.2, 1.3, 1.4, 1.5]) for (const k of [1, 2, 3, 5]) {
    const p = Object.assign({}, params, { beta: beta, avantage_domicile: H, buts_moyens: L, lissage: k });
    const v = vraisemblance(app, p);
    if (!best || v > best.v) best = { v: v, beta: Math.round(beta * 100) / 100, avantage_domicile: Math.round(H * 100) / 100, buts_moyens: L, lissage: k };
  }
  console.log("AJUSTEMENT (saison 2025-26 seulement) : " + JSON.stringify(best));
  Object.assign(params, { beta: best.beta, avantage_domicile: best.avantage_domicile, buts_moyens: best.buts_moyens, lissage: best.lissage });
}
console.log("Parametres utilises : beta " + params.beta + ", avantage du terrain " + params.avantage_domicile + ", buts moyens " + params.buts_moyens + ", lissage " + params.lissage);

const issue = (h, a) => ({ h1: h, a1: a, h2: 0, a2: 0 });
function mesurer(prep, titre) {
  const parMarche = {};
  const choix = [];
  let ll = 0;
  prep.forEach((q) => {
    const l = RF.butsAttendus(q.fD, q.fE, q.vD.niveau, q.vE.niveau, params);
    const pr = RF.probabilites(l);
    ll += logPoisson(q.x.h, l.dom) + logPoisson(q.x.a, l.ext);
    RF.MARCHES_REPLI.forEach((id) => {
      const g = MP.CATALOGUE[id].test(issue(q.x.h, q.x.a)) ? 1 : 0;
      const o = parMarche[id] || (parMarche[id] = { n: 0, p: 0, g: 0, brier: 0 });
      o.n++; o.p += pr[id] / 100; o.g += g; o.brier += Math.pow(pr[id] / 100 - g, 2);
    });
    // Choix SANS cote (aucune cote historique) : la plus grande chance parmi les marches dont la cote JUSTE
    // (100 / chance) tomberait dans la fourchette du repli (1,40 - cote_max).
    // Marches ecartes (marches_exclus) et prudence de la config appliques comme dans lib/repli-forme.js#choisir.
    const lo = 100 / params.cote_max, hi = 100 / params.cote_min;
    const ecart = q.vD.niveau - q.vE.niveau;
    const prudence = Math.abs(ecart) >= 2 ? params.prudence_ecart : params.prudence_autres;
    const c = RF.MARCHES_REPLI.filter((id) => params.marches_exclus.indexOf(id) === -1 && pr[id] >= lo && pr[id] <= hi).sort((a, b) => pr[b] - pr[a])[0];
    if (c) choix.push({ id: c, p: pr[c] - prudence, brute: pr[c], g: MP.CATALOGUE[c].test(issue(q.x.h, q.x.a)) ? 1 : 0, ecart: ecart, coupe: q.x.coupe });
  });
  console.log("\n=== " + titre + " : " + prep.length + " matchs (log-vraisemblance par match " + (ll / prep.length).toFixed(3) + ")");
  console.log("Calibration par marche (chance moyenne annoncee / taux reel / Brier) :");
  RF.MARCHES_REPLI.forEach((id) => { const o = parMarche[id]; if (o) console.log("  " + id.padEnd(20) + " " + (o.p / o.n * 100).toFixed(1) + " % / " + (o.g / o.n * 100).toFixed(1) + " %  (Brier " + (o.brier / o.n).toFixed(3) + ")"); });
  const res = (l) => l.length ? (l.reduce((s, c) => s + c.g, 0) + "/" + l.length + " = " + (l.reduce((s, c) => s + c.g, 0) / l.length * 100).toFixed(1) + " % reels pour " + (l.reduce((s, c) => s + c.p, 0) / l.length).toFixed(1) + " % annonces") : "aucun";
  console.log("Pari choisi sans cote (marche le plus probable dont la cote juste est dans la fourchette) : " + res(choix));
  const parFam = {};
  choix.forEach((c) => (parFam[c.id] = parFam[c.id] || []).push(c));
  Object.keys(parFam).sort((a, b) => parFam[b].length - parFam[a].length).forEach((id) => console.log("    " + id.padEnd(20) + res(parFam[id])));
  const gros = choix.filter((c) => Math.abs(c.ecart) >= 2), proches = choix.filter((c) => Math.abs(c.ecart) < 2);
  console.log("  ecart de 2 divisions ou plus : " + res(gros) + " ; moins de 2 : " + res(proches));
  Object.keys(COUPES).forEach((L) => { const l = choix.filter((c) => c.coupe === Number(L)); if (l.length) console.log("  " + COUPES[L] + " : " + res(l)); });
  // Tranches de chance.
  [[45, 55], [55, 60], [60, 65], [65, 72]].forEach((t) => { const l = choix.filter((c) => c.p >= t[0] && c.p < t[1]); console.log("  tranche " + t[0] + "-" + t[1] + " % : " + res(l)); });
  // Optimisme (points annonces au-dessus du reel, avant prudence) : par marche choisi et par ecart de division.
  const opt = (l) => l.length ? (l.reduce((s, c) => s + c.brute, 0) / l.length - l.reduce((s, c) => s + c.g, 0) / l.length * 100) : 0;
  console.log("  optimisme avant prudence : ecart >= 2 divisions " + opt(gros).toFixed(1) + " points (" + gros.length + "), moins de 2 : " + opt(proches).toFixed(1) + " points (" + proches.length + ")");
  return choix;
}
mesurer(app, "AJUSTEMENT, saison 2025-26");
mesurer(test, "TEST, saison 2026-27 (jamais vue)");

// Matchs recents dont API-Football garde encore les cotes : la regle EXACTE du pipeline (lib/repli-forme.js#choisir),
// comparee au choix par les seules cotes du marche (plus grande chance sans marge dans la meme fourchette).
const avecCotes = prepTous.filter((q) => lire("odds/" + q.x.f.fixture.id + ".json"));
const PR = require("../lib/pronostic.js");
const regles = CFG.fiabilite.corrections_chance || [];
const lignes = [], marche = [], normal = [], marcheSeul = [];
// Regle normale des coupes (lib/pronostic.js, paris_cotes_marche : 1N2, double chance, plus/moins de 2,5 ; chance = cote
// sans marge ; la plus probable dont la cote est dans fourchette_pari) : le repli ne sert QUE quand elle ne donne rien.
const FOURCHETTE = CFG.fiabilite.fourchette_pari;
const NORMAUX = ["home-win", "away-win", "dc-1x", "dc-x2", "dc-12", "over-25", "under-25"];
avecCotes.forEach((q) => {
  const f = q.x.f, raw = lire("odds/" + f.fixture.id + ".json");
  const m = { id: f.fixture.id, league_id: q.x.coupe, league_key: null, home: { id: f.teams.home.id, n: f.teams.home.name }, away: { id: f.teams.away.id, n: f.teams.away.name } };
  const cotesN = RF.cotesReelles(m, raw, null);
  const n = NORMAUX.filter((id) => cotesN[id] && cotesN[id].cote >= FOURCHETTE.cote_min && cotesN[id].cote <= FOURCHETTE.cote_max).sort((a, b) => cotesN[b].sans_marge - cotesN[a].sans_marge)[0];
  if (n) { normal.push({ match: f.teams.home.name + " - " + f.teams.away.name, pari: n, p: cotesN[n].sans_marge, g: MP.CATALOGUE[n].test(issue(q.x.h, q.x.a)) ? 1 : 0 }); }
  const dd = { dom: matchsDuClub(f.teams.home.id, q.x.saison), ext: matchsDuClub(f.teams.away.id, q.x.saison), odds: raw };
  const oo = { params: params, regles: regles, chanceCorrigee: PR.chanceCorrigee, avantIso: f.fixture.date };
  const r = RF.choisirForme(m, dd, oo);
  const rm = RF.choisirMarche(m, dd, oo);
  if (rm.pari) marcheSeul.push({ normal: !!n, p: rm.pari.chance_affichee, g: MP.CATALOGUE[rm.pari.market_id].test(issue(q.x.h, q.x.a)) ? 1 : 0 });
  if (n) r.normal = true;
  const g = r.pari ? (MP.CATALOGUE[r.pari.market_id].test(issue(q.x.h, q.x.a)) ? 1 : 0) : null;
  lignes.push({ normal: !!r.normal, match: f.teams.home.name + " - " + f.teams.away.name, score: q.x.h + "-" + q.x.a, pari: r.pari ? r.pari.market_id : "(" + r.raison + ")", cote: r.pari ? r.pari.cote : null, chance: r.pari ? r.pari.chance_affichee : null, forme: r.pari ? r.pari.p_forme : null, sm: r.pari ? r.pari.sans_marge : null, g: g });
  const cotes = RF.cotesReelles(m, raw, null);
  const c = Object.keys(cotes).filter((id) => cotes[id].cote >= params.cote_min && cotes[id].cote <= params.cote_max).sort((a, b) => cotes[b].sans_marge - cotes[a].sans_marge)[0];
  if (c) marche.push({ p: cotes[c].sans_marge, g: MP.CATALOGUE[c].test(issue(q.x.h, q.x.a)) ? 1 : 0 });
});
const avec = lignes.filter((l) => l.g !== null);
console.log("\n=== COTES REELLES (matchs des derniers jours, cotes encore gardees par API-Football) : " + avecCotes.length + " matchs, " + avec.length + " avec un pari de repli");
lignes.forEach((l) => console.log("  " + l.match.padEnd(42) + " " + l.score.padEnd(5) + " " + String(l.pari).padEnd(22) + (l.cote ? " @" + l.cote.toFixed(2) + " chance " + l.chance + " % (forme " + l.forme + " %, sans marge " + l.sm + " %) " + (l.g ? "GAGNE" : "PERDU") : "")));
const pc = (l, k) => l.filter((x) => x.g).length + "/" + l.length + " = " + (l.length ? (l.filter((x) => x.g).length / l.length * 100).toFixed(1) : "-") + " % reels pour " + (l.length ? (l.reduce((s, x) => s + x[k], 0) / l.length).toFixed(1) : "-") + " % annonces";
console.log("Regle normale des coupes (1N2, DC, 2,5 buts, cote " + FOURCHETTE.cote_min + "-" + FOURCHETTE.cote_max + ") : pari sur " + normal.length + " matchs : " + pc(normal, "p"));
const seuls = avec.filter((l) => !l.normal);
console.log("Repli forme sur les matchs SANS pari normal (son vrai role) : " + pc(seuls, "chance"));
console.log("Variante marche (mediane sans marge) sur les matchs SANS pari normal : " + pc(marcheSeul.filter((x) => !x.normal), "p") + " ; sur tous : " + pc(marcheSeul, "p"));
if (avec.length) console.log("Repli forme sur tous les matchs : " + avec.filter((l) => l.g).length + "/" + avec.length + " = " + (avec.filter((l) => l.g).length / avec.length * 100).toFixed(1) + " % reels pour " + (avec.reduce((s, l) => s + l.chance, 0) / avec.length).toFixed(1) + " % annonces");
if (marche.length) console.log("Reference, cotes du marche seules : " + marche.filter((l) => l.g).length + "/" + marche.length + " = " + (marche.filter((l) => l.g).length / marche.length * 100).toFixed(1) + " % reels pour " + (marche.reduce((s, l) => s + l.p, 0) / marche.length).toFixed(1) + " % annonces");
