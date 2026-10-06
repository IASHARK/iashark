"use strict";
// CHOIX NEUTRE DU PARI SUR TOUS LES MARCHES DES BOOKMAKERS (decision de Clement du 06/10/2026, soir : « le moteur v3
// doit etre neutre et choisir le meilleur marche de tous, sauf les cartons et corners, [...] sans en favoriser un » ;
// fourchette du pari 1,40-2,20) et VERDICT ORANGE du mathematicien du 06/10 (399 matchs jamais vus) : marches caches,
// correction « petits scores » -3 points, jamais la methode puissance sans issue contraire, controle Pinnacle limite,
// catalogue de coherence elargi.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FP = require("../lib/flux-paris.js");
const MP = require("../lib/marches-paris.js");
const P = require("../lib/pronostic.js");
const T = require("../lib/tickets-du-jour.js");
const LIGUES = require("../config/leagues.json");
const ROOT = path.join(__dirname, "..");
const WF = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");

const v = (a) => a.map(([value, odd]) => ({ value, odd: String(odd) }));
const TOUT = new Set(["events", "statistics_fixtures", "statistics_players"]);
const M = { id: 501, home: { n: "Lens" }, away: { n: "Nice" }, date: "2026-10-07 20:00", status: "NS", league_key: "ligue1", league_id: 61, league: "Ligue 1", league_reliability: "validee", no_signal: true, pari_rec: "",
  current_squads: { home: [{ player_id: 11, name: "D. Sanchez" }], away: [{ player_id: 21, name: "J. Estrada" }] } };
function raw(bets, pin) { return { bookmakers: [{ name: "Bet365", bets }].concat(pin ? [{ name: "Pinnacle", bets: pin }] : []) }; }
const B1 = { id: 1, name: "Match Winner", values: v([["Home", 1.8], ["Draw", 3.6], ["Away", 4.5]]) };
function codes(bets, pin) { return FP.selectionsDuMatch(raw(bets, pin), { match: M, couverture: TOUT }).selections.map((s) => s.code); }

test("fourchette du pari : 1,40-2,20 dans config/leagues.json, sans marge pour les cotes non agreees (neutralite)", () => {
  assert.deepEqual(LIGUES.fiabilite.fourchette_pari, { cote_min: 1.4, cote_max: 2.2, marge_sans_agree: 0 });
});

test("marge retiree sur le marche complet : paires plus/moins, handicaps par demi-ligne, europeen a 3 issues, double chance tiree du 1N2", () => {
  const bets = [B1,
    { id: 5, name: "Goals Over/Under", values: v([["Over 2.5", 1.9], ["Under 2.5", 1.9], ["Over 2", 1.5], ["Under 2", 2.5], ["Over 2.25", 1.7], ["Under 2.25", 2.1]]) },
    { id: 4, name: "Asian Handicap", values: v([["Home -0.5", 1.8], ["Away -0.5", 2.0], ["Home -0.25", 1.6], ["Away -0.25", 2.3], ["Home +0", 1.3], ["Away +0", 3.3]]) },
    { id: 50, name: "Goal Line", values: v([["Over 2.75", 2.1], ["Under 2.75", 1.7], ["Over 3", 2.6], ["Under 3", 1.45]]) },
    { id: 9, name: "Handicap Result", values: v([["Home -1", 3.4], ["Draw -1", 3.6], ["Away -1", 2.0]]) },
    { id: 12, name: "Double Chance", values: v([["Home/Draw", 1.25], ["Home/Away", 1.3], ["Draw/Away", 2.0]]) },
  ];
  const s = FP.selectionsDuMatch(raw(bets), { match: M, couverture: TOUT }).selections;
  const par = {}; s.forEach((x) => { par[x.code] = x; });
  assert.ok(Math.abs(par["F5:Over 2.5"].chance - 0.5) < 1e-9, "paire 2,5 : 50/50");
  ["F5:Over 2", "F5:Over 2.25", "F4:Home -0.25", "F4:Home +0", "F50:Over 2.75", "F50:Under 3"].forEach((c) => assert.equal(par[c], undefined, c + " : ligne entiere ou en quart (remboursement) : exclue"));
  assert.ok(Math.abs(par["F4:Home -0.5"].chance + par["F4:Away -0.5"].chance - 1) < 1e-9);
  const eu = ["F9:Home -1", "F9:Draw -1", "F9:Away -1"].map((c) => par[c].chance);
  assert.ok(Math.abs(eu.reduce((a, b) => a + b, 0) - 1) < 1e-9, "handicap europeen : 3 issues ensemble");
  const q = FP.puissance([1.8, 3.6, 4.5]);
  assert.ok(Math.abs(par["F12:Home/Draw"].chance - (q.p[0] + q.p[1])) < 1e-12, "double chance = somme de deux issues du 1N2 sans marge");
  assert.equal(FP.puissance([7, 9, 6.5, 9]), null, "liste incomplete (somme des 1/cote < 1) : jamais normalisee");
});

test("verdict du 06/10 : marches caches (joueurs, paires non contraires, tirs/hors-jeu/fautes, non mesures), « les deux marquent : non », corners et cartons", () => {
  [92, 93, 94, 212, 213, 215, 218, 219, 226, 231, 232, 233, 240, 241, 257, 266, 267, 269, 275, 32, 36, 39, 48, 99, 100, 222,
    87, 211, 276, 176, 340, 164, 167, 168, 281, 2, 97, 228, 229, 245, 59, 61, 224, 225, 298, 10, 31, 38, 42, 46, 62].forEach((id) => assert.ok(FP.raisonExclusion(id, "x"), "bet " + id));
  ["Corners Over Under", "Cards Over/Under", "Yellow Over/Under", "RCARD", "First Card Received (3 way)", "Corners. Odd/Even", "Red Card In The Match (1st Half)", "Multicorners"].forEach((n) =>
    assert.match(FP.raisonExclusion(999, n), /corners et cartons/, n));
  [7, 25, 54, 349].forEach((id) => assert.equal(FP.raisonExclusion(id, "x"), null, "publiable : " + id));
  [185, 124, 129, 40, 41].forEach((id) => assert.ok(FP.raisonExclusion(id, "x"), "2e tour du mathematicien, cache : " + id));
  assert.deepEqual(FP.VALEURS_EXCLUES[349], ["2 or 3 goals"], "349 : seule l'issue « 2 ou 3 buts » est cachee");
  const c = codes([B1, { id: 8, name: "Both Teams Score", values: v([["Yes", 1.9], ["No", 1.9]]) },
    { id: 231, name: "Home Anytime Goal Scorer", values: v([["Diego Sanchez", 1.5]]) }, { id: 39, name: "To Win Either Half", values: v([["Home", 1.5], ["Away", 2.5]]) }]);
  assert.ok(c.includes("F8:Yes") && !c.includes("F8:No"));
  assert.ok(!c.some((x) => /^F(231|39):/.test(x)), "jamais la methode puissance sans issue contraire");
  assert.equal(FP.estCode("F8:No"), false); assert.equal(FP.estCode("F87:Over 8.5"), false);
});

test("controle Pinnacle : seulement sur les marches 1, 4, 5, 6, 13, 16, 17, 19", () => {
  assert.deepEqual(FP.CONTROLE_BETS, [1, 4, 5, 6, 13, 16, 17, 19]);
  const ref = [B1, { id: 5, name: "Goals Over/Under", values: v([["Over 2.5", 1.5], ["Under 2.5", 2.6]]) }, { id: 21, name: "Odd/Even", values: v([["Odd", 1.5], ["Even", 2.6]]) }];
  const pin = [{ id: 5, name: "Goals Over/Under", values: v([["Over 2.5", 2.4], ["Under 2.5", 1.6]]) }, { id: 21, name: "Odd/Even", values: v([["Odd", 2.4], ["Even", 1.6]]) }];
  const c = codes(ref, pin);
  assert.ok(!c.includes("F5:Over 2.5"), "ecart > 8 points avec Pinnacle sur les buts : ecarte");
  assert.ok(c.includes("F21:Odd"), "pair/impair : aucun controle invente");
});

test("correction « petits scores » : -3 points, toutes competitions et toutes cotes, AVANT le choix", () => {
  const r = LIGUES.fiabilite.corrections_chance.find((x) => x.famille === "petits scores");
  assert.deepEqual([r.ligue, r.option, r.points], ["*", "*", -3]);
  ["under-25", "fh-under-15", "sh-under-05", "home-team-under-15", "away-team-under-05", "F50:Under 2.5", "F72:Under 1.5", "F34:No", "F35:No", "F27:Yes", "F28:Yes", "F49:u/no 2.5", "F349:Under 2 goals"]
    .forEach((id) => assert.ok(FP.petitScore(id), id));
  ["over-25", "F27:No", "F34:Yes", "F49:u/yes 2.5", "F349:2 or 3 goals", "btts-yes"].forEach((id) => assert.ok(!FP.petitScore(id), id));
  // Avant le choix : « moins de 2,5 » (51 % sans marge) perd 3 points et passe derriere « plus de 0,5 but en 1re mi-temps » (50 %).
  const bets = [{ id: 1, name: "Match Winner", values: v([["Home", 2.6], ["Draw", 3.3], ["Away", 2.9]]) }, { id: 5, name: "Goals Over/Under", values: v([["Over 2.5", 2.08], ["Under 2.5", 1.85]]) }, { id: 6, name: "Goals Over/Under First Half", values: v([["Over 0.5", 1.9], ["Under 0.5", 2.0]]) }];
  const m = Object.assign({}, M, { id: 510 });
  const ev = P.evaluerCandidatsNeutres(m, Object.assign({}, P.contexteParis({ configLigues: LIGUES, fluxPar: { 510: { raw: raw(bets) } } }), { livres: null, chancesV3: null, couverture: () => TOUT }));
  const u = ev.find((c) => c.market_id === "under-25"), o = ev.find((c) => c.market_id === "fh-over-05");
  assert.equal(u.chance_affichee, u.chance - 3);
  assert.equal(o.chance_affichee, o.chance);
  assert.ok(u.chance > o.chance && u.chance_affichee < o.chance_affichee);
  P.publierPronostics([m], [], { configLigues: LIGUES, figes: {}, fluxPar: { 510: { raw: raw(bets) } } });
  assert.equal(m.market_id, "fh-over-05");
  // La chance affichee d'un pari « moins de » publie garde la correction (alignerChancesAffichees).
  const m2 = Object.assign({}, M, { id: 511, pari_rec: "Under 2.5", market_id: "under-25", no_signal: false, chance_iashark: 60, cote_rec: "1.6" });
  P.alignerChancesAffichees([m2], [], { configLigues: LIGUES });
  assert.equal(m2.chance_iashark, 57);
});

test("choix neutre : le plus probable dans 1,40-2,20, toutes familles, aucun bonus ; meme methode pour tous", () => {
  const bets = [B1,
    { id: 5, name: "Goals Over/Under", values: v([["Over 1.5", 1.3], ["Under 1.5", 3.6], ["Over 2.5", 1.95], ["Under 2.5", 1.85]]) },
    { id: 4, name: "Asian Handicap", values: v([["Home +0.5", 1.42], ["Away +0.5", 2.85]]) },
    { id: 45, name: "Corners Over Under", values: v([["Over 8.5", 1.4], ["Under 8.5", 3.0]]) },
    { id: 7, name: "HT/FT Double", values: v([["Home/Home", 2.9], ["Draw/Home", 4.5], ["Draw/Draw", 5.5], ["Away/Away", 7], ["Home/Draw", 15], ["Home/Away", 34], ["Draw/Away", 9], ["Away/Home", 21], ["Away/Draw", 15]]) },
  ];
  const m = Object.assign({}, M, { id: 502 });
  const r = P.publierPronostics([m], [], { configLigues: LIGUES, figes: {}, fluxPar: { 502: { raw: raw(bets) } } });
  assert.equal(r.publies, 1);
  assert.equal(m.market_id, "F4:Home +0.5", "le plus probable dans la fourchette (handicap a 1,42), jamais les corners a 1,40");
  assert.deepEqual([m.cote_rec, m.cote_source, m.cote_bookmaker, m.marche], ["1.42", "indicative", null, "AUTRE_MARCHE"]);
  assert.equal(m.pari_rec, "Lens (+0,5)");
  assert.equal(P.motifExceptionGel({ pari_rec: m.pari_rec, market_id: m.market_id, cote_rec: 1.42 }), null);
  const m2 = Object.assign({}, M, { id: 503 });
  P.publierPronostics([m2], [], { configLigues: LIGUES, figes: {}, fluxPar: { 503: { raw: raw(bets.slice().reverse()) } } });
  assert.equal(m2.market_id, m.market_id, "l'ordre des marches ne change rien");
  // Rien dans 1,40-2,20 : le plus proche, jamais sous 1,20.
  const serre = [{ id: 1, name: "Match Winner", values: v([["Home", 1.25], ["Draw", 6], ["Away", 12]]) }, { id: 8, name: "Both Teams Score", values: v([["Yes", 2.6], ["No", 1.45]]) }];
  const m3 = Object.assign({}, M, { id: 505 });
  P.publierPronostics([m3], [], { configLigues: LIGUES, figes: {}, fluxPar: { 505: { raw: raw(serre) } } });
  assert.ok(m3.market_id && Number(m3.cote_rec) >= 1.2 && m3.market_id !== "btts-no");
});

test("chance du moteur v3 juste = le plus bas entre le v3 et la cote sans marge", () => {
  const bets = [B1, { id: 5, name: "Goals Over/Under", values: v([["Over 2.5", 1.95], ["Under 2.5", 1.85]]) }];
  const m = Object.assign({}, M, { id: 504, moteur_v3: { source: "v3" }, v3_fiabilite: { couverture: "vérifiée" },
    v3_marches: [{ cle: "TOTAL:moins2.5", probabilite: 47, panneau: true, justesse: "juste" }] });
  const ev = P.evaluerCandidatsNeutres(m, Object.assign({}, P.contexteParis({ configLigues: LIGUES, fluxPar: { 504: { raw: raw(bets) } } }), { livres: null, chancesV3: null, couverture: () => TOUT }));
  const u = ev.find((c) => c.market_id === "under-25");
  assert.deepEqual([u.p_modele, u.chance, u.chance_affichee, u.voie], [47, 47, 44, "v3"]);
  const o = ev.find((c) => c.market_id === "over-25");
  assert.equal(o.p_modele, 53, "complement de la ligne a deux issues");
});

test("reglement : score, mi-temps, evenements (ordre, minutes 00:00-09:59, contre son camp)", () => {
  const fixture = { teams: { home: { id: 1, winner: true }, away: { id: 2, winner: false } }, fixture: { status: { short: "FT" } },
    score: { fulltime: { home: 2, away: 1 }, halftime: { home: 0, away: 1 } } };
  const events = [
    { type: "Goal", detail: "Normal Goal", time: { elapsed: 10 }, team: { id: 2 }, player: { id: 21 } },
    { type: "Goal", detail: "Own Goal", time: { elapsed: 58 }, team: { id: 2 }, player: { id: 23 } },
    { type: "Goal", detail: "Missed Penalty", time: { elapsed: 70 }, team: { id: 1 }, player: { id: 12 } },
    { type: "Goal", detail: "Penalty", time: { elapsed: 90, extra: 4 }, team: { id: 1 }, player: { id: 11 } },
  ];
  const F = FP.faitsDuMatch({ fixture, events });
  assert.deepEqual(F.buts.map((b) => [b.cote, b.type]), [["away", "normal"], ["home", "csc"], ["home", "penalty"]], "contre son camp : la lecture qui retrouve le score final");
  const R = (code) => FP.regler(code, F);
  assert.equal(R("F1:Home"), true); assert.equal(R("F13:Away"), true); assert.equal(R("F3:Home"), true);
  assert.equal(R("F7:Away/Home"), true); assert.equal(R("F25:Home/Over 2.5"), true);
  assert.equal(R("F14:Away"), true); assert.equal(R("F15:Home"), true); assert.equal(FP.estCode("F124:Yes"), false, "revient et gagne : cache (2e tour)");
  assert.equal(R("F54:Away"), true, "but a la 10e (09:xx) : dans 00:00-09:59");
  const F11 = FP.faitsDuMatch({ fixture, events: [Object.assign({}, events[0], { time: { elapsed: 11 } })].concat(events.slice(1)) });
  assert.equal(FP.regler("F54:Draw", F11), true, "but a la 11e (10:xx) : hors des 10 premieres minutes");
  assert.equal(R("F139:Away"), true); assert.equal(R("F137:Draw"), true);
  assert.equal(R("F149:Yes"), true, "90+4 compte dans 76-90"); assert.equal(R("F146:No"), true);
  assert.equal(FP.petitScore("F146:No"), true); assert.equal(FP.petitScore("F107:Under 0.5"), true); assert.equal(FP.petitScore("F136:Draw"), true); assert.equal(FP.petitScore("F146:Yes"), false);
  assert.equal(R("F4:Home -0.5"), true); assert.equal(R("F9:Draw -1"), true); assert.equal(R("F19:Away +0.5"), true, "1re mi-temps 0-1");
  assert.equal(R("F92:Diego Sanchez#11"), null, "marche cache : jamais regle (jamais publie)");
  const sansEv = FP.faitsDuMatch({ fixture });
  ["F14:Home", "F144:Yes", "F54:Home"].forEach((c) => assert.equal(FP.regler(c, sansEv), null, c));
  assert.equal(FP.faitsDuMatch({ fixture, events: events.slice(0, 1) }).buts, null, "evenements incomplets : en attente");
  const c = FP.catalogue();
  c.publiables.forEach((x) => { assert.equal(typeof FP.SPECS[x.bet_id].regle, "function"); assert.equal(typeof FP.SPECS[x.bet_id].lib, "function"); });
  assert.ok(c.exclus.every((x) => x.raison));
});

test("coherence : handicaps et nouveaux marches dans le catalogue de coherence (verdict du 06/10, point 5)", () => {
  const pois = (l, k) => { let p = Math.exp(-l); for (let x = 1; x <= k; x++) p *= l / x; return p; };
  const g = []; for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) g.push({ cle: "SCORE:" + h + "-" + a, probabilite: pois(1.7, h) * pois(1.1, a) * 100 });
  const m = { v3_marches: g };
  assert.ok(MP.coherent(m, "F4:Home -0.5", "dc-1x", MP.NIVEAU.JAMBE, 0.8).ok, "Lens -0,5 -> Lens ou nul");
  assert.ok(MP.coherent(m, "F9:Home -1", "home-team-over-15", MP.NIVEAU.JAMBE, 0.8).ok);
  assert.ok(!MP.coherent(m, "F9:Away -1", "home-win", MP.NIVEAU.JAMBE, 0.8).ok);
  assert.ok(MP.coherent(m, "F19:Home -0.5", "fh-home-win", MP.NIVEAU.JAMBE, 0.8).ok, "handicap de 1re mi-temps");
  assert.ok(MP.coherent(m, "F18:Home -1", "fh-home-win", MP.NIVEAU.JAMBE, 0.8).ok, "europeen de 1re mi-temps");
  assert.equal(MP.definition("F4:Home -1.5").ft, true); assert.equal(MP.definition("F7:Home/Home").ft, false);
  assert.ok(!MP.coherent(m, "F144:Yes", "over-15", MP.NIVEAU.JAMBE, 0.8).ok, "evenements : seulement le meme marche");
  // Combines : un pari affiche sur un handicap europeen n'empeche plus une jambe coherente sur le meme match.
  const NOW = Date.parse("2026-10-07T04:00:00Z");
  const mt = { id: 601, home: { n: "A" }, away: { n: "B" }, date: "2026-10-07 20:00", league_key: "ligue1", league_id: 61, league: "Ligue 1", v3_marches: g,
    pari_rec: "A (−1)", market_id: "F9:Home -1", no_signal: false, cote_rec: "1.90", chance_iashark: 50, pronostic: { market_id: "F9:Home -1", publie: true, fiabilite: "vérifiée" } };
  const cp = { 601: [{ market_id: "dc-1x", famille: "DC", cote: 1.3, cote_anj: false, bookmaker: null, chance: 75, chance_affichee: 75, fiabilite: "vérifiée", p_modele: 80, q: 75 },
    { market_id: "dc-x2", famille: "DC", cote: 1.3, cote_anj: false, bookmaker: null, chance: 75, chance_affichee: 75, fiabilite: "vérifiée", p_modele: 80, q: 75 }] };
  const c = T.calculerDuJour([mt], { jour: "2026-10-07", nowMs: NOW, fixtureById: { 601: { fixture: { timestamp: Date.parse("2026-10-07T18:00:00Z") / 1000, status: { short: "NS" } } } }, configLigues: LIGUES, candidatsPar: cp });
  assert.equal(c.nb_jambes, 1, "« A ou nul » va avec « A gagne par 2 buts ou plus » ; « nul ou B » non");
});

test("pipeline : reglement des autres marches par les faits d'API-Football ; releve gardé en memoire", () => {
  assert.match(WF, /const FLUX_PARIS_REG = require\('\.\/lib\/flux-paris\.js'\);/);
  assert.match(WF, /if\(FLUX_PARIS_REG\.estCode\(found\.market\)\)\{/);
  assert.match(WF, /fixtures\/events\?fixture='\+fidF/);
  assert.match(WF, /isWin=rF==='rembourse'\?'void':rF;/);
  assert.match(WF, /if\(FLUX_PARIS_REG\.estCode\(found\.market\)\)return;/);
  assert.doesNotMatch(WF, /writeFileSync\([^)]*FLUX_PARIS/);
});

test("Selection en or : jamais presentee comme « valeur » ni « meilleur pari » sur le site", () => {
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach((l) => {
    const a = JSON.stringify(require("../i18n/dict/" + l + ".json").aujourdhui || {});
    assert.doesNotMatch(a, /valeur|value|meilleur pari|best bet|mejor apuesta|beste wette|miglior scommessa|melhor aposta/i, l);
  });
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "lib/aujourdhui.js"), "utf8").replace(/\/\/.*$/gm, ""), /valeur|meilleur pari/i);
});
