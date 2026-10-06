"use strict";
// PARIS SUR TOUS LES MARCHES (demande de Clement du 06/10/2026 : « Je veux plein de marches, il choisit le
// meilleur, c'est tout. » ; Selection en or different des combines ; jamais une selection qui contredit le pari
// affiche ni une autre selection du jour).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MP = require("../lib/marches-paris.js");
const P = require("../lib/pronostic.js");
const R = require("../lib/resolvers.js");
const ML = require("../lib/market-labels.js");
const J = require("../lib/run-output/jambes-du-jour.js");
const COMBOS = require("../lib/run-output/combos.js");
const T = require("../lib/tickets-du-jour.js");
const LIGUES = require("../config/leagues.json");
const REGLES = require("../config/tickets.json");
const ROOT = path.join(__dirname, "..");
const WF = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");

function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pois = (l, k) => { let p = Math.exp(-l); for (let x = 1; x <= k; x++) p *= l / x; return p; };
function grille(lh, la) {
  const g = [];
  for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) g.push({ cle: "SCORE:" + h + "-" + a, probabilite: Math.round(pois(lh, h) * pois(la, a) * 10000) / 100 });
  return g;
}

// ------------------------------------------------------------------ 1. catalogue : reglable, affichable, traduit
test("catalogue : chaque marche se regle (lib/resolvers.js) exactement comme son predicat, sur 3 000 issues", () => {
  const rnd = prng(61006);
  const ids = Object.keys(MP.CATALOGUE);
  assert.ok(ids.length >= 150, "plein de marches : " + ids.length);
  for (let t = 0; t < 3000; t++) {
    const o = { h1: Math.floor(rnd() * 4), a1: Math.floor(rnd() * 3), h2: Math.floor(rnd() * 4), a2: Math.floor(rnd() * 3) };
    const tirs = Math.floor(rnd() * 40), cadres = Math.floor(rnd() * 16);
    const ctx = { halftimeHome: o.h1, halftimeAway: o.a1, totalShots: tirs, totalShotsOnTarget: cadres };
    ids.forEach((id) => {
      const d = MP.CATALOGUE[id];
      const attendu = d.dim === "buts" ? d.test(o) : d.test({ n: d.dim === "tirs" ? tirs : cadres });
      assert.equal(R.resolveMarketWin(d.marche, o.h1 + o.h2, o.a1 + o.a2, ctx), attendu, id + " " + JSON.stringify(o));
    });
  }
  // Donnee absente : jamais un resultat devine (le pari reste en attente).
  ["Premiere mi-temps DC 1X", "Premiere mi-temps victoire domicile", "Deuxieme mi-temps plus de 0.5 but", "Tirs cadres du match over 8.5", "Tirs du match under 24.5"].forEach((l) =>
    assert.equal(R.resolveMarketWin(l, 2, 1, {}), null, l));
});

test("catalogue : libelles clairs dans les 7 langues (jamais l'identifiant brut), pari_rec reconnu par la page", () => {
  const dicts = ["fr", "en", "es", "es-mx", "de", "it", "pt"].map((l) => [l, require("../i18n/dict/" + l + ".json")]);
  Object.keys(MP.CATALOGUE).forEach((id) => {
    const d = MP.CATALOGUE[id];
    const fr = ML.marketIdLabelFr(id, { home: "Lens", away: "Nice" });
    assert.notEqual(fr, id, id);
    assert.doesNotMatch(fr, /\{|\}/, id);
    assert.equal(ML.marketLabelFr(d.marche, { home: "Lens", away: "Nice" }), fr, "pari_rec et market_id disent la meme chose : " + id);
    dicts.forEach(([l, dict]) => {
      const t = ML.marketIdLabel(id, { home: "Lens", away: "Nice" }, { locale: l, dict: dict });
      assert.notEqual(t, id, l + " " + id);
      assert.doesNotMatch(t, /\{|\}/, l + " " + id);
    });
    assert.ok(P.MARCHE[id] && P.MARCHE[id].marche === (P.MARCHE[id].marche || d.marche), id);
    assert.ok(P.libelleFr(id, { home: { n: "Lens" }, away: { n: "Nice" } }), id);
  });
  ["sh_over_one", "fh_result_win", "fh_result_draw", "fh_dc_home_or_draw", "fh_dc_draw_or_away", "fh_dc_no_draw"].forEach((k) =>
    dicts.forEach(([l, dict]) => assert.ok(dict.market_labels && typeof dict.market_labels[k] === "string", l + " " + k)));
  // Exclus du catalogue (jamais publies) : rembourse si nul, handicaps, corners, cartons, score exact.
  ["dnb-home", "home-ah-minus-1_5", "total-corners-over-9_5", "total-cards-over-4_5", "score-1-0"].forEach((id) => assert.equal(MP.definition(id), null, id));
  assert.equal(P.motifExceptionGel({ pari_rec: "Tirs cadres du match over 8.5", market_id: "total-shots-on-target-over-8_5", cote_rec: 1.5 }), null, "un pari fige sur un marche du catalogue reste fige");
});

// ------------------------------------------------------------------ 2. coherence
test("coherence : implication exacte, grille du v3, contraires refuses, prudence sans grille", () => {
  const m = { v3_marches: grille(1.6, 1.0) };
  const ok = (a, b, niv) => MP.coherent(m, a, b, niv || MP.NIVEAU.JAMBE, 0.8).ok;
  assert.ok(MP.implique("over-25", "over-15"));
  assert.ok(MP.implique("home-win", "dc-1x"));
  assert.ok(MP.implique("home-win", "home-team-over-05"));
  assert.ok(MP.implique("btts-yes", "over-15"));
  assert.ok(MP.implique("fh-over-15", "over-15"));
  assert.ok(MP.implique("under-15", "fh-under-15"));
  assert.ok(MP.implique("total-shots-on-target-over-8_5", "total-shots-on-target-over-7_5"));
  assert.ok(!MP.implique("over-15", "over-25"));
  assert.ok(!MP.implique("over-25", "total-shots-on-target-over-2_5"), "buts et tirs : dimensions differentes");
  // Exemples de Clement.
  assert.ok(!ok("over-25", "under-25"), "jamais « moins de 2,5 » si la page dit « plus de 2,5 »");
  assert.ok(ok("over-25", "over-15"), "« plus de 1,5 » avec « plus de 2,5 » : OK");
  assert.ok(!ok("home-win", "dc-x2"));
  assert.ok(!ok("over-25", "under-35"), "P(moins de 3,5 | plus de 2,5) trop basse pour une jambe");
  const g = MP.coherent(m, "home-win", "over-15", MP.NIVEAU.JAMBE, 0.8);
  assert.equal(g.methode, "grille"); assert.ok(g.p > 0.5 && g.p < 1);
  // Niveau « or » : aucune dependance negative.
  assert.ok(ok("over-15", "over-25", MP.NIVEAU.OR), "plus etroit dans le meme sens");
  assert.ok(!ok("under-25", "btts-yes", MP.NIVEAU.OR), "les deux marquent contre moins de 2,5 : dependance negative");
  // Sans grille : seulement le meme marche ou l'implication.
  assert.ok(!MP.coherent({}, "home-win", "over-15", MP.NIVEAU.JAMBE, 0.8).ok);
  assert.ok(MP.coherent({}, "home-win", "dc-1x", MP.NIVEAU.JAMBE, 0.8).ok);
  assert.ok(!MP.coherent(m, "home-win", "total-shots-on-target-over-5_5", MP.NIVEAU.JAMBE, 0.8).ok, "tirs contre buts : refuse");
  assert.ok(!MP.coherent(m, "home-win", "fh-home-win", MP.NIVEAU.JAMBE, 0.8).ok, "mi-temps sans implication : refuse");
});

// ------------------------------------------------------------------ 3. le pari de chaque match
// Match d'un championnat du moteur v3, couverture « verifiee », cotes du match et flux API-Football (bet365 + Pinnacle).
function matchV3(o) {
  return Object.assign({
    id: 77, home: { n: "Lens" }, away: { n: "Nice" }, date: "2026-10-07 20:00", status: "NS", league_key: "ligue1", league_id: 61, league: "Ligue 1", league_reliability: "validee",
    c1: 2.6, cn: 3.3, c2: 2.9, cdc1x: 1.45, cdc2x: 1.55, cdc12: 1.35, co25: 2.1, cu25: 1.75,
    no_signal: true, pari_rec: "", moteur_v3: { source: "v3" }, v3_fiabilite: { couverture: "vérifiée" },
    v3_marches: [{ cle: "MT_TOTAL:plus0.5", probabilite: 72, panneau: true, justesse: "juste" }, { cle: "EQUIPE_DOM:plus0.5", probabilite: 74, panneau: true, justesse: "recalibré" },
      { cle: "EQUIPE_EXT:plus0.5", probabilite: 71, panneau: false, justesse: "faux" }, { cle: "2MT_TOTAL:plus0.5", probabilite: 80, panneau: true, justesse: "non mesurable, juste ailleurs" }],
  }, o || {});
}
const FLUX_77 = { selections: [], toutes: [
  { code: "F6:Over 0.5", bet_id: 6, value: "Over 0.5", ligne: 0.5, cote: 1.42, chance: 0.69, controle_ok: true },
  { code: "F16:Over 0.5", bet_id: 16, value: "Over 0.5", ligne: 0.5, cote: 1.36, chance: 0.71, controle_ok: true },
  { code: "F17:Over 0.5", bet_id: 17, value: "Over 0.5", ligne: 0.5, cote: 1.44, chance: 0.68, controle_ok: true },
  { code: "F26:Over 0.5", bet_id: 26, value: "Over 0.5", ligne: 0.5, cote: 1.25, chance: 0.78, controle_ok: true },
] };

test("pari : nouvelles familles du v3 seulement si le moteur les dit justes ici ; chance = le plus bas entre le v3 et la cote sans marge", () => {
  const ctx = P.contexteParis({ configLigues: LIGUES, fluxPar: { 77: FLUX_77 } });
  const ev = P.evaluerCandidats(matchV3(), Object.assign({}, ctx, { livres: null, chancesV3: null }));
  const par = {}; ev.forEach((c) => { par[c.market_id] = c; });
  assert.ok(par["fh-over-05"], "1re mi-temps juste");
  assert.equal(par["fh-over-05"].chance, 69, "min(72 v3, 69 sans marge)");
  assert.equal(par["fh-over-05"].p_modele, 72);
  assert.equal(par["home-team-over-05"].chance, 71, "recalibre accepte");
  assert.equal(par["away-team-over-05"], undefined, "marche cache par le moteur (panneau = false)");
  assert.equal(par["sh-over-05"], undefined, "« non mesurable, juste ailleurs » : jamais un pari");
  assert.ok(ev.every((c) => c.cote_anj === false && !c.bookmaker), "cote d'API-Football, sans nom de bookmaker");
  // Hors du perimetre du v3, selection nationale, couverture limitee : aucune nouvelle famille.
  [{ league_key: "coupe_de_france" }, { v3_fiabilite: { couverture: "données limitées" } }, { league_key: "nations_league", league_id: 5, league: "UEFA Nations League" }].forEach((o) => {
    const e = P.evaluerCandidats(matchV3(o), Object.assign({}, ctx, { livres: null, chancesV3: null }));
    assert.ok(!e.some((c) => /^fh-|^home-team/.test(c.market_id)), JSON.stringify(o));
  });
  // Sans cote sans marge du meme marche : jamais le modele seul.
  const sansFlux = P.evaluerCandidats(matchV3(), Object.assign({}, P.contexteParis({ configLigues: LIGUES }), { livres: null, chancesV3: null }));
  assert.ok(!sansFlux.some((c) => c.market_id === "fh-over-05"));
});

test("pari : flux API-Football (liste blanche du mathematicien) ; tirs seulement avec les statistiques du match ; jamais sur une selection", async () => {
  const F = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/marches-flux.mjs")).href);
  const cfg = F.lireConfig(require("../config/marches-valides.json"));
  const v = (o, u) => [{ value: o[0], odd: String(o[1]) }, { value: u[0], odd: String(u[1]) }];
  const bets = [
    { id: 87, name: "Total ShotOnGoal", values: v(["Over 7.5", 1.43], ["Under 7.5", 2.65]).concat(v(["Over 9.5", 2.1], ["Under 9.5", 1.68])) },
    { id: 5, name: "Goals Over/Under", values: v(["Over 1.5", 1.3], ["Under 1.5", 3.4]) },
    { id: 1, name: "Match Winner", values: [{ value: "Home", odd: "2.6" }, { value: "Draw", odd: "3.3" }, { value: "Away", odd: "2.9" }] },
  ];
  const raw = { bookmakers: [{ name: "Bet365", bets }, { name: "Pinnacle", bets }] };
  const flux = { selections: F.selectionsDuMatch(raw, { config: cfg, ligue: "mls" }).selections, toutes: F.toutesLesCotes(raw, { config: cfg }) };
  assert.ok(flux.toutes.some((x) => x.bet_id === 1), "toutes les cotes, liste blanche ou non");
  assert.ok(!flux.toutes.some((x) => x.bet_id === 92 || x.bet_id === 25), "jamais buteur ni « meme match »");
  const m = { id: 5, home: { n: "A" }, away: { n: "B" }, date: "2026-10-07 02:00", league_key: "mls", league_id: 253, league: "MLS", league_reliability: "validee", no_signal: true, pari_rec: "" };
  const r = P.publierPronostics([m], [], { configLigues: LIGUES, figes: {}, fluxPar: { 5: flux } });
  assert.equal(r.publies, 1);
  assert.equal(m.market_id, "total-shots-on-target-over-7_5", "le plus probable dans 1,40-1,70 (cote 1,43)");
  assert.equal(m.pari_rec, "Tirs cadres du match over 7.5");
  assert.equal(m.marche, "TIRS");
  assert.deepEqual([m.cote_rec, m.cote_source, m.cote_bookmaker], ["1.43", "indicative", null]);
  assert.equal(m.pronostic.libelle_fr, "Plus de 7,5 tirs cadrés");
  assert.notEqual(R.resolveMarketWin(m.pari_rec, 1, 1, { totalShotsOnTarget: 9 }), null, "reglable");
  // « plus de 1,5 but » du flux en MLS : famille mesuree seulement dans 7 championnats europeens (NO-GO ailleurs).
  const c = P.marchesCandidats([m], { configLigues: LIGUES, fluxPar: { 5: flux } })["5"];
  assert.ok(!c.some((x) => x.market_id === "over-15"));
  // Competition sans statistiques de match (rapport de couverture) : jamais un pari sur les tirs.
  const m2 = Object.assign({}, m, { id: 6, pari_rec: "", no_signal: true });
  P.publierPronostics([m2], [], { configLigues: LIGUES, figes: {}, fluxPar: { 6: flux }, liguesStatistiques: [] });
  assert.ok(!/shots/.test(String(m2.market_id || "")));
  // Selection nationale : 1N2 et double chance seulement.
  const sel = Object.assign({}, m, { id: 7, league_key: "nations_league", league_id: 5, league: "UEFA Nations League" });
  assert.ok(!(P.marchesCandidats([sel], { configLigues: LIGUES, fluxPar: { 7: flux } })["7"] || []).some((x) => /shots/.test(x.market_id)));
});

test("candidats des combines : chaque match ouvert (fige compris), jamais un match ferme ; aucun chiffre dans un fichier public", () => {
  const ouvert = matchV3();
  const fige = matchV3({ id: 78, pari_rec: "Over 2.5", market_id: "over-25", no_signal: false });
  const ferme = matchV3({ id: 79, no_signal_reason: "KICKOFF_PASSED" });
  const c = P.marchesCandidats([ouvert, fige, ferme], { configLigues: LIGUES, fluxPar: { 77: FLUX_77, 78: FLUX_77, 79: FLUX_77 } });
  assert.ok(c["77"].length && c["78"].length);
  assert.equal(c["79"], undefined);
  // Pipeline : flux et candidats en memoire seulement, jamais ecrits ni journalises.
  assert.match(WF, /var FLUX_PARIS=\{\};/);
  assert.match(WF, /FLUX_PARIS\[String\(m\.id\)\]=\{selections:r\.selections,toutes:FLUX_MOD\.toutesLesCotes\(raw,\{config:CFG_FLUX\}\)\};/);
  assert.match(WF, /releveAnjA:RELEVE_ANJ_A,fluxPar:FLUX_PARIS\}\);/);
  assert.match(WF, /CANDIDATS_DU_JOUR=PRONOSTIC\.marchesCandidats\(allMatchsData,\{configLigues:LEAGUES_CONFIG,chancesV3Par:CHANCES_V3_PRONO,cotesAnjPar:LIVRES_ANJ,fluxPar:FLUX_PARIS\}\)/);
  assert.match(WF, /candidatsPar:CANDIDATS_DU_JOUR,/);
  assert.doesNotMatch(WF, /writeFileSync\([^)]*(FLUX_PARIS|CANDIDATS_DU_JOUR)/);
  assert.doesNotMatch(WF, /console\.log\([^)]*(FLUX_PARIS|CANDIDATS_DU_JOUR)/);
  // Les champs premium et publics ne changent pas : les candidats ne sont jamais poses sur le match.
  assert.equal("candidats" in ouvert, false);
});

// ------------------------------------------------------------------ 4. combines : une jambe par match, recherche exacte
function forceBrute(legs, R0) {
  const parMatch = new Map();
  legs.forEach((l) => { if (!parMatch.has(l.fixture_id)) parMatch.set(l.fixture_id, []); parMatch.get(l.fixture_id).push(l); });
  const ids = Array.from(parMatch.keys()).sort((a, b) => a - b);
  let best = null;
  const rec = (i, choix) => {
    if (i === ids.length) {
      if (R0.jambes.indexOf(choix.length) === -1) return;
      let P0 = 1n, Q = 1;
      choix.forEach((l) => { P0 *= BigInt(Math.round(l.cote * 100)); Q *= l.chance / 100; });
      const div = 100n ** BigInt(choix.length - 1);
      const arr = Number((2n * P0 + div) / (2n * div));
      if (arr < Math.round(R0.cote_min * 100) || arr > Math.round(R0.cote_max * 100)) return;
      const cand = { Q, k: choix.length, ecart: Math.abs(arr - R0.centre * 100), ids: choix.map((l) => l.fixture_id) };
      if (!best || Q > best.Q + 1e-15 || (Math.abs(Q - best.Q) <= 1e-15 && (cand.k < best.k || (cand.k === best.k && cand.ecart < best.ecart)))) best = cand;
      return;
    }
    rec(i + 1, choix);
    if (choix.length < Math.max.apply(null, R0.jambes)) parMatch.get(ids[i]).forEach((l) => rec(i + 1, choix.concat([l])));
  };
  rec(0, []);
  return best;
}
test("combines : plusieurs marches par match, une seule jambe par match ; meilleure chance = recherche exhaustive (150 tirages)", () => {
  const rnd = prng(61007);
  for (let t = 0; t < 150; t++) {
    const legs = [];
    const n = 7 + Math.floor(rnd() * 3);
    for (let f = 0; f < n; f++) {
      const k = 1 + Math.floor(rnd() * 3);
      for (let x = 0; x < k; x++) legs.push({ fixture_id: 100 + f, market_id: "m" + x, cote: Math.round((1.2 + rnd() * 0.25) * 100) / 100, chance: 62 + Math.floor(rnd() * 22), coup_envoi: "2026-10-07 20:00" });
    }
    // Recherche pure (le grand combine du calcul tient compte en plus des jambes du petit : voir plus bas).
    ["x5", "x10"].forEach((type) => {
      const best = COMBOS.meilleurCombine(legs, COMBOS.reglesTicket(REGLES, type));
      const b = forceBrute(legs, REGLES[type]);
      if (!b) { assert.equal(best, null, t + " " + type); return; }
      assert.ok(best, t + " " + type);
      const choisies = best.indices.map((i) => legs[i]);
      assert.equal(new Set(choisies.map((j) => j.fixture_id)).size, choisies.length, "une jambe par match");
      const q = choisies.reduce((p, j) => p * j.chance / 100, 1);
      assert.ok(Math.abs(q - b.Q) < 1e-12, "tirage " + t + " " + type + " : " + q + " contre " + b.Q);
    });
    const r = COMBOS.generateDailyCombos({ jambes: legs, snapshotTime: "2026-10-07T04:00:00.000Z" });
    const x5 = r.combos.find((x) => x.type === "x5");
    if (x5.status === "GENERATED") assert.equal(new Set(x5.jambes.map((j) => j.fixture_id)).size, x5.jambes.length);
  }
});

// ------------------------------------------------------------------ 5. Selection en or et coherence de la journee
const NOW = Date.parse("2026-10-07T04:00:00Z"); // 06:00 a Paris
function matchJour(id, o) {
  return Object.assign({
    id, home: { n: "Dom" + id }, away: { n: "Ext" + id }, date: "2026-10-07 20:00", league: "Ligue 1", league_key: "ligue1", league_id: 61,
    pari_rec: "Over 2.5", market_id: "over-25", no_signal: false, cote_rec: "1.62", cote_source: "indicative", cote_bookmaker: null, chance_iashark: 60,
    pronostic: { market_id: "over-25", publie: true, fiabilite: "vérifiée" }, v3_marches: grille(1.7, 1.2),
  }, o || {});
}
function fixtures(ms) { const o = {}; ms.forEach((m) => { o[String(m.id)] = { fixture: { timestamp: Date.parse("2026-10-07T18:00:00Z") / 1000, status: { short: "NS" } } }; }); return o; }
const cand = (id, cote, chance, extra) => Object.assign({ market_id: id, famille: (P.MARCHE[id] || {}).famille, cote, cote_anj: false, bookmaker: null, chance, chance_affichee: chance, fiabilite: "vérifiée", p_modele: null, q: chance }, extra || {});

test("Selection en or : ecart modele / cote sans marge (interne), cote 1,70-2,50, un pari par match, jamais contre le pari affiche", () => {
  assert.deepEqual([REGLES.selection_or.cote_min, REGLES.selection_or.cote_max, REGLES.selection_or.nb], [1.7, 2.5, 3]);
  const ms = [1, 2, 3, 4, 5].map((i) => matchJour(i));
  const cp = {
    1: [cand("btts-yes", 1.9, 51, { p_modele: 58, q: 51 }), cand("over-35", 2.4, 40, { p_modele: 49, q: 40 })],
    2: [cand("under-25", 2.2, 44, { p_modele: 60, q: 44 })], // contraire du pari affiche (plus de 2,5) : jamais
    3: [cand("btts-yes", 1.85, 52, { p_modele: 55, q: 52 })],
    4: [cand("home-team-over-15", 2.0, 48, { p_modele: 50, q: 48 })],
    5: [cand("over-35", 2.6, 38, { p_modele: 50, q: 38 }), cand("btts-yes", 1.75, 55)], // cote trop haute ; pas de modele
  };
  const c = T.calculerDuJour(ms, { jour: "2026-10-07", nowMs: NOW, fixtureById: fixtures(ms), configLigues: LIGUES, candidatsPar: cp });
  assert.ok(c.or);
  assert.deepEqual(c.or.contenu.paris.map((p) => [p.fixture_id, p.market_id]), [[1, "over-35"], [3, "btts-yes"], [4, "home-team-over-15"]]);
  c.or.contenu.paris.forEach((p) => {
    assert.deepEqual(Object.keys(p).sort(), ["chance", "chance_calculee", "cote", "coup_envoi", "coup_envoi_ms", "domicile", "exterieur", "famille", "fixture_id", "ligue", "ligue_id", "ligue_key", "market_id", "operateur", "pari", "rang"]);
  });
  assert.equal(c.exclus_or.incoherent_pari_affiche, 1);
  // Moins de 3 paris possibles : pas de Selection en or (jamais completee).
  const c2 = T.calculerDuJour(ms.slice(0, 2), { jour: "2026-10-07", nowMs: NOW, fixtureById: fixtures(ms), configLigues: LIGUES, candidatsPar: cp });
  assert.equal(c2.or, null);
});

test("journee coherente : une selection deja publiee engage les suivantes (Selection en or puis petit puis grand combine)", () => {
  const ms = []; const cp = {};
  for (let i = 1; i <= 9; i++) {
    ms.push(matchJour(i));
    cp[i] = [cand("over-15", 1.25 + (i % 4) * 0.05, 76), cand("under-35", 1.3, 72), cand("btts-yes", 1.9, 51, { p_modele: 60, q: 51 })];
  }
  // La Selection en or deja publiee ce matin sur le match 1 porte sur « moins de 2,5 buts » (cas d'un pari fige avant
  // un changement de regle) : aucune jambe du match 1 ne peut aller contre elle.
  const deja = { or: { paris: [{ fixture_id: 1, market_id: "under-25" }, { fixture_id: 2, market_id: "btts-yes" }, { fixture_id: 3, market_id: "btts-yes" }] } };
  const c = T.calculerDuJour(ms, { jour: "2026-10-07", nowMs: NOW, fixtureById: fixtures(ms), configLigues: LIGUES, candidatsPar: cp, deja });
  assert.equal(c.or, null, "deja publiee : jamais recalculee");
  const toutes = [].concat(c.x5 ? c.x5.contenu.jambes : [], c.x10 ? c.x10.contenu.jambes : []);
  assert.ok(toutes.length > 0);
  assert.ok(!toutes.some((j) => j.fixture_id === 1 && j.market_id === "over-15"), "« plus de 1,5 » ne va pas avec « moins de 2,5 » deja publie");
  // Aucune jambe « moins de 3,5 » sur un match dont la page dit « plus de 2,5 ».
  assert.ok(!toutes.some((j) => j.market_id === "under-35"));
  // Petit puis grand : jamais deux jambes contraires sur un meme match entre les deux combines.
  if (c.x5 && c.x10) {
    c.x10.contenu.jambes.forEach((j) => {
      const autre = c.x5.contenu.jambes.find((x) => x.fixture_id === j.fixture_id);
      if (autre) assert.ok(MP.coherent(ms.find((m) => m.id === j.fixture_id), autre.market_id, j.market_id, MP.NIVEAU.JAMBE, 0.8).ok);
    });
  }
  // Controle de coherence du gel (13) : une jambe qui contredit la page compte une alerte.
  assert.equal(T.incoherences("x5", { jambes: [{ fixture_id: 1, market_id: "under-15", cote: 1.3 }] }, { 1: ms[0] }), 1);
  assert.equal(T.incoherences("x5", { jambes: [{ fixture_id: 1, market_id: "over-15", cote: 1.3 }] }, { 1: ms[0] }), 0);
});

test("panneau Marches : un pari publie sur un nouveau marche porte exactement la chance de l'Avis (une seule source)", () => {
  const PN = require("../lib/marches-panneau.js");
  assert.equal(PN.cleV3DuMarche("fh-over-05"), "MT_TOTAL:plus0.5");
  assert.equal(PN.cleV3DuMarche("home-team-over-15"), "EQUIPE_DOM:plus1.5");
  const m = { id: 9, home: { n: "Lens" }, away: { n: "Nice" }, league_key: "mls", pari_rec: "Tirs cadres du match over 7.5", market_id: "total-shots-on-target-over-7_5", no_signal: false, chance_iashark: 66,
    marches_flux: { releve_at: "2026-10-07T04:00:00.000Z", liste: [{ marche: "Nombre de tirs cadrés", selection: "plus de 7,5 tirs cadrés dans le match", chance: 65, code: "F87:Over 7.5" }] } };
  const p = PN.construirePanneau(m, { verdicts: { marches_panneau: { statut: "GO" } } });
  const l = p.familles.find((f) => f.cle === "tirs").marches[0];
  assert.deepEqual([l.chance, l.pari_avis], [66, true]);
});

test("combines : aucun pourcentage de chance affiche ; noms « Petit combiné » / « Grand combiné » ; textes des nouvelles regles", () => {
  const fr = require("../i18n/dict/fr.json").aujourdhui;
  assert.match(fr.none_x5, /4 ou 5 matchs, cote totale entre 4 et 6/);
  assert.match(fr.none_x10, /7 ou 8 matchs, cote totale entre 8,50 et 12/);
  assert.equal(fr.gold_sub, "3 paris à cote plus haute, choisis par IASHARK");
  const src = fs.readFileSync(path.join(ROOT, "lib/aujourdhui.js"), "utf8");
  assert.match(src, /Petit combiné/); assert.match(src, /Grand combiné/);
  assert.match(src, /aucun pourcentage de chance sur les combines/);
  ["en", "es", "es-mx", "de", "it", "pt"].forEach((l) => {
    const a = require("../i18n/dict/" + l + ".json").aujourdhui;
    assert.doesNotMatch(a.none_x5 + a.none_x10, /4,50|4\.50|5,50|5\.50/, l);
    assert.doesNotMatch(a.gold_sub, /valeur|value|sûr|garanti/i, l);
  });
});
