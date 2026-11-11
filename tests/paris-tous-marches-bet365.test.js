"use strict";
// REGLE DU PARI DU 11/11/2026 (decision de Clement, 21 h 40) : le pari affiche de chaque match est choisi parmi TOUS les
// marches cotes par Bet365 dans API-Sports, cote 1,70-3,50 (1,70 minimum strict, aucun repli), cote affichee = Bet365,
// meme methode de chance juste pour toutes les familles (marge retiree, controle Pinnacle, v3 la ou il calcule), marches
// d'un seul cote corriges (verdict ROUGE du 06/10 : joueurs annonces 70 %, 29 % reels). Exclu : seulement ce qu'on ne
// sait pas regler automatiquement apres le match.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FP = require("../lib/flux-paris.js");
const P = require("../lib/pronostic.js");
const ML = require("../lib/market-labels.js");
const ROOT = path.join(__dirname, "..");
const LIGUES = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8"));
const MARCHES = JSON.parse(fs.readFileSync(path.join(ROOT, "config/marches-pari.json"), "utf8"));
const REGLE = P.regleFlux(MARCHES);
const TOUT = new Set(["events", "statistics_fixtures", "statistics_players"]);

const v = (a) => a.map(([value, odd]) => ({ value, odd: String(odd) }));
const M = { id: 9001, home: { n: "Lens" }, away: { n: "Nice" }, home_team: "Lens", away_team: "Nice", date: "2026-11-12 20:45", status: "NS", league_key: "ligue1", league_id: 61,
  league: "Ligue 1", league_reliability: "validee", no_signal: true, pari_rec: "",
  current_squads: { home: [{ player_id: 11, name: "Florian Sotoca" }], away: [{ player_id: 21, name: "Terem Moffi" }] } };
const B1 = { id: 1, name: "Match Winner", values: v([["Home", 2.1], ["Draw", 3.4], ["Away", 3.5]]) };
function raw(b365, autres) { return { bookmakers: [{ name: "Bet365", bets: b365 }].concat(autres || []) }; }
function ctxAvec(r) {
  const ctx = P.contexteParis({ configLigues: LIGUES, marchesPari: MARCHES, fluxPar: { 9001: { raw: r } } });
  ctx.couverture = () => TOUT;
  return ctx;
}

test("config : regle du 11/11 active, fourchette 1,70-3,50, Bet365 seul, controle Pinnacle sur tous les marches", () => {
  assert.deepEqual(LIGUES.fiabilite.fourchette_pari, { cote_min: 1.7, cote_max: 3.5, marge_sans_agree: 0 });
  assert.equal(MARCHES.choix_du_pari.regle, "tous_marches_bet365");
  assert.ok(REGLE && REGLE.tousMarches && REGLE.referenceSeule && REGLE.controleTous);
  assert.equal(P.regleFlux({ choix_du_pari: { regle: "autre" } }), null, "toute autre valeur = ancienne regle (retour arriere)");
});

test("1,70 minimum strict : 1,69 refusee, 1,70 et 3,50 acceptees, 3,51 refusee ; rien dans la fourchette = pas de pari", () => {
  const f = P.fourchettePari(LIGUES);
  assert.ok(P.dansFourchette("1.70", f) && P.dansFourchette("3.50", f));
  assert.ok(!P.dansFourchette("1.69", f) && !P.dansFourchette("3.51", f));
  const r = raw([{ id: 1, name: "Match Winner", values: v([["Home", 1.25], ["Draw", 6], ["Away", 11]]) }]);
  assert.equal(P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r), {}), null, "jamais la cote la plus proche");
});

test("cote affichee = Bet365 ; jamais un autre bookmaker en repli quand Bet365 ne cote pas le marche", () => {
  const r = raw([B1], [{ name: "Betano", bets: [{ id: 5, name: "Goals Over/Under", values: v([["Over 2.5", 1.75], ["Under 2.5", 2.1]]) }] }]);
  const c = P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r), {});
  assert.ok(c, "un pari Bet365 dans la fourchette");
  assert.notEqual(c.market_id, "over-25", "la ligne 2,5 n'est cotee que par Betano : jamais candidate");
  const s = FP.selectionsDuMatch(r, { match: M, couverture: TOUT, regle: REGLE }).selections;
  assert.ok(s.every((x) => x.bookmaker === undefined || /bet365/i.test(String(x.bookmaker))), JSON.stringify(s.map((x) => x.bookmaker)));
  assert.equal(c.cote, 2.1);
});

test("tous les marches candidats s'ils sont reglables : corners, cartons, tirs, joueurs ; exclus seulement les non reglables", () => {
  [45, 55, 56, 57, 58, 80, 81, 82, 83, 87, 211, 176, 340, 164, 92, 231, 218, 257, 240, 241, 266, 267, 269, 10, 38, 224, 225, 298].forEach((id) =>
    assert.equal(FP.raisonExclusion(id, "x", REGLE), null, "candidat : " + id));
  [2, 47, 61, 93, 94, 97, 212, 213, 215, 228, 229, 281].forEach((id) => assert.ok(FP.raisonExclusion(id, "x", REGLE), "non reglable : " + id));
  assert.match(FP.raisonExclusion(250, "First Card Received (3 way)", REGLE), /cartons/);
});

test("pile ou face exclu (decision de Clement du 12/11) : pair / impair des buts, mi-temps, equipes et fautes jamais choisi", () => {
  [21, 22, 23, 60, 63, 343].forEach((id) => assert.equal(FP.raisonExclusion(id, "x", REGLE), FP.RAISON_PILE_OU_FACE, "bet " + id));
  ["Corners. Odd/Even", "Cards Odd/Even", "Odd/Even - Second Half"].forEach((n) => assert.equal(FP.raisonExclusion(999, n, REGLE), FP.RAISON_PILE_OU_FACE, n));
  assert.ok(FP.catalogue(REGLE).publiables.every((x) => !FP.EXCLUS_PILE_OU_FACE[x.bet_id]));
  const r = raw([B1, { id: 21, name: "Odd/Even", values: v([["Odd", 1.75], ["Even", 2.05]]) }]);
  const c = P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r), {});
  assert.ok(!c || !/^F21:/.test(c.market_id), "jamais pair / impair : " + (c && c.market_id));
});

test("reglement des cartons (jaune 1, rouge 2, 2e jaune non compte en plus, banc exclu) et des corners", () => {
  const ev = (eq, joueur, detail, min) => ({ type: "Card", detail, team: { id: eq }, player: { id: joueur }, time: { elapsed: min } });
  const src = { fixture: { teams: { home: { id: 1 }, away: { id: 2 } }, score: { fulltime: { home: 1, away: 0 }, halftime: { home: 0, away: 0 } }, fixture: { status: { short: "FT" } } },
    events: [ev(1, 10, "Yellow Card", 20), ev(1, 10, "Second Yellow card", 60), ev(2, 20, "Yellow Card", 30), ev(2, 21, "Red Card", 80), ev(2, null, "Yellow Card", 85), ev(1, 12, "Yellow Card", 93)],
    statistics: [{ team: { id: 1 }, statistics: [{ type: "Corner Kicks", value: 6 }] }, { team: { id: 2 }, statistics: [{ type: "Corner Kicks", value: 3 }] }] };
  const F = FP.faitsDuMatch(src);
  assert.deepEqual(F.cartons, [3, 3], "Lens : 2e jaune = 1 + 2 ; Nice : 1 + 2 ; carton sans joueur et apres la 90e non comptes");
  assert.equal(FP.regler("F80:Over 5.5", F), true);
  assert.equal(FP.regler("F82:Under 3.5", F), true);
  assert.equal(FP.regler("F45:Over 9.5", F), false);
  assert.equal(FP.regler("F57:Over 5.5", F), true);
  assert.equal(FP.regler("F55:Home", F), true);
});

test("marche d'un seul cote : chance = (1/cote)/(1+M), M >= 15 % ; buteurs ramenes aux buts attendus de l'equipe", () => {
  const bets = [B1, { id: 16, name: "Total - Home", values: v([["Over 1.5", 2.4], ["Under 1.5", 1.55]]) }, { id: 17, name: "Total - Away", values: v([["Over 1.5", 3], ["Under 1.5", 1.36]]) },
    { id: 231, name: "Home Anytime Goal Scorer", values: v([["Florian Sotoca", 1.8]]) }, { id: 99, name: "To Score A Penalty", values: v([["Home", 1.8]]) }];
  const s = FP.selectionsDuMatch(raw(bets), { match: M, couverture: TOUT, regle: REGLE }).selections;
  const pen = s.find((x) => x.code === "F99:Home");
  assert.ok(pen && pen.un_seul_cote, "marche « Home » sans issue contraire");
  assert.ok(pen.chance <= (1 / 1.8) / 1.15 + 1e-9, "marge d'au moins 15 % retiree : " + pen.chance);
  const but = s.find((x) => /^F231:Florian Sotoca/.test(x.code));
  assert.ok(but && but.un_seul_cote && but.chance <= (1 / 1.8) / 1.15 + 1e-9, "buteur : " + (but && but.chance));
  assert.ok(FP.margeUnSeulCote({}, "bet365", REGLE.unSeulCote) >= 0.15);
});

test("chaque pari candidat a un libelle dans les 7 langues (jamais le code brut sur la page)", () => {
  const codes = ["F45:Over 9.5", "F57:Under 4.5", "F80:Over 3.5", "F83:Over 1.5", "F56:Home -1.5", "F81:Away +0.5", "F55:Draw", "F176:Home", "F340:Away", "F87:Over 8.5", "F211:Under 26.5",
    "F164:Over 3.5", "F10:2:1", "F31:1:0", "F38:2", "F40:more 3", "F42:1", "F349:2 or 3 goals", "F32:Home", "F36:Away", "F39:Away", "F48:Home", "F99:Home", "F100:Away", "F222:Away",
    "F59:Yes", "F224:Yes", "F225:No", "F298:2/Penalties", "F92:Terem Moffi#21", "F257:Terem Moffi#21", "F240:Florian Sotoca - 2#11", "F267:Brice Samba - 4#30", "F343:Odd", "F172:Home/Draw"];
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach((l) => {
    const dict = require("../i18n/dict/" + l + ".json");
    codes.forEach((c) => {
      const t = ML.marketIdLabel(c, { home: "Lens", away: "Nice" }, { locale: l, dict });
      assert.ok(t && !/^F\d+:/.test(t) && !/\{\w+\}/.test(t), l + " " + c + " -> " + t);
    });
  });
});

test("donnees du jour : le calcul relit les cotes /odds du run si le releve odds_snapshots a plus de 12 h (Ligue des nations)", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /\[MARCHES\] .* sans releve recent : cotes \/odds de ce calcul \(Bet365\)/);
  assert.match(wf, /FLUX_PARIS\[k\]=Object\.assign\(\{selections:\[\],toutes:\[\]\},FLUX_PARIS\[k\]\|\|\{\},\{raw:\{bookmakers:od\.raw\.bookmakers\}\}\)/);
});

test("selections (PR #313, point 2) : la liste /players/squads d'API-Football n'est plus lue (calcul du matin et jour de match)", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  const jour = fs.readFileSync(path.join(ROOT, "scripts/buteurs-jour-de-match.js"), "utf8");
  assert.match(wf, /var SEL_SQUAD_OFF=isInternationalMatch\|\|SELECTIONS\.estSelectionNationale\(\{league_id:lg\.id,league:lg\.name\}\);/);
  assert.match(wf, /SEL_SQUAD_OFF\?\[\]:getCurrentSquad\(home\.id\),SEL_SQUAD_OFF\?\[\]:getCurrentSquad\(away\.id\)/);
  assert.doesNotMatch(jour, /players\/squads\?team=/);
});

test("textes publics : la fourchette citee est celle du choix (1,70-3,50), dans chaque langue", () => {
  const fr = fs.readFileSync(path.join(ROOT, "fr/index.html"), "utf8"), en = fs.readFileSync(path.join(ROOT, "en/index.html"), "utf8");
  assert.ok(fr.includes("entre 1,70 et 3,50") && fr.includes("fourchette 1,70-3,50"));
  assert.ok(en.includes("between 1.70 and 3.50") && en.includes("1.70-3.50 odds range"));
  ["fr", "en", "es", "de", "it", "pt", "gb", "mx", "za"].forEach((d) => assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "i18n/seo/" + d + ".json"), "utf8"), /1[.,]40-2[.,]20/, d));
});
