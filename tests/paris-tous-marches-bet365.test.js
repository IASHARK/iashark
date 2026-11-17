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
// Depuis le 13/11/2026 la config du depot est sur la regle « scenario » (tests/scenario.test.js). La regle du 11/11 reste
// dans le code (retour arriere possible en remettant choix_du_pari.regle) : ces tests la verifient en la forcant ici.
const MARCHES = JSON.parse(fs.readFileSync(path.join(ROOT, "config/marches-pari.json"), "utf8"));
MARCHES.choix_du_pari = Object.assign({}, MARCHES.choix_du_pari, { regle: "tous_marches_bet365" });
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

test("tous les marches candidats s'ils sont reglables : corners, tirs, hors-jeu, score ; exclus seulement les non reglables", () => {
  [45, 55, 56, 57, 58, 87, 211, 176, 340, 164, 10, 38, 224, 225, 298].forEach((id) =>
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

test("joueurs et buteurs exclus (condition ORANGE du mathematicien du 12/11 : 35 % annonces, 18 % reels), par numero et par nom", () => {
  [92, 218, 231, 257, 240, 241, 269, 266, 267].forEach((id) => assert.equal(FP.raisonExclusion(id, "x", REGLE), FP.RAISON_JOUEURS, "bet " + id));
  ["Player Assists", "First Goal Scorer", "Goalkeeper Saves", "Player to be Booked", "Anytime Goalscorer"].forEach((n) => assert.ok(FP.raisonExclusion(999, n, REGLE), n));
  assert.ok(FP.catalogue(REGLE).publiables.every((x) => !FP.EXCLUS_JOUEURS[x.bet_id]));
  const r = raw([{ id: 1, name: "Match Winner", values: v([["Home", 1.3], ["Draw", 5], ["Away", 9]]) }, { id: 92, name: "Anytime Goal Scorer", values: v([["Florian Sotoca", 1.75]]) },
    { id: 240, name: "Home Player Shots", values: v([["Florian Sotoca - 1", 1.8]]) }]);
  assert.equal(P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r), {}), null, "seuls des marches joueurs dans la fourchette : pas de pari");
});

test("cartons (80 a 83) exclus tant que le comptage n'est pas valide, famille Mi-temps exclue (avocat du diable du 12/11)", () => {
  [80, 81, 82, 83].forEach((id) => assert.equal(FP.raisonExclusion(id, "x", REGLE), FP.RAISON_CARTONS_ATTENTE, "bet " + id));
  const mt = Object.keys(FP.SPECS).filter((id) => /^Mi-temps/.test(FP.SPECS[id].fam));
  assert.ok(mt.length >= 10 && mt.includes("6") && mt.includes("20") && mt.includes("7"), mt.join(","));
  mt.forEach((id) => assert.equal(FP.raisonExclusion(Number(id), "x", REGLE), FP.RAISON_MI_TEMPS, "bet " + id));
  const pub = FP.catalogue(REGLE).publiables;
  assert.ok(pub.every((x) => !FP.EXCLUS_CARTONS_ATTENTE[x.bet_id] && (!FP.SPECS[x.bet_id] || !/^Mi-temps/.test(FP.SPECS[x.bet_id].fam))));
  const r = raw([{ id: 1, name: "Match Winner", values: v([["Home", 1.3], ["Draw", 5], ["Away", 9]]) },
    { id: 6, name: "Goals Over/Under First Half", values: v([["Over 0.5", 1.75], ["Under 0.5", 2.05]]) },
    { id: 80, name: "Cards Over/Under", values: v([["Over 3.5", 1.8], ["Under 3.5", 1.95]]) }]);
  assert.equal(P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r), {}), null, "seuls mi-temps et cartons dans la fourchette : pas de pari");
});

test("mi-temps rangee ailleurs (avocat du diable, REJETE du 12/11 a midi) : handicap, score exact, les deux marquent et buts d'UNE mi-temps jamais choisis", () => {
  // Le calcul de 11 h avait publie « Dijon -0,5 (handicap) (1re mi-temps) » : le marche 19 est range dans
  // « Handicap asiatique », l'exclusion ne regardait que l'etiquette « Mi-temps ».
  const ids = [18, 19, 31, 34, 35, 42, 46, 48, 62, 78, 104, 105, 106, 107, 108, 111, 112, 113, 114, 115, 116, 117, 181, 185];
  ids.forEach((id) => assert.equal(FP.raisonExclusion(id, "x", REGLE), FP.RAISON_MI_TEMPS_AUTRES, "bet " + id));
  // La raison dit la verite : exclus par coherence, pas pour un defaut mesure (mathematicien : 54,8 % annonces, 51,1 % reels, dans le hasard).
  assert.match(FP.RAISON_MI_TEMPS_AUTRES, /cohérence/);
  assert.doesNotMatch(FP.RAISON_MI_TEMPS_AUTRES, /41,5/);
  assert.deepEqual(Object.keys(FP.EXCLUS_MI_TEMPS_AUTRES).map(Number).sort((a, b) => a - b), ids);
  // Par le nom Bet365 aussi, pour un numero qu'on ne connait pas encore.
  ["Asian Handicap First Half", "Both Teams To Score - Second Half", "To Win Both Halves", "Correct Score - First Half"].forEach((n) =>
    assert.equal(FP.raisonExclusion(999, n, REGLE), FP.RAISON_MI_TEMPS_AUTRES, n));
  // Les memes marches sur le match entier restent candidats.
  [[4, "Asian Handicap"], [5, "Goals Over/Under"], [8, "Both Teams Score"], [45, "Corners Over Under"]].forEach(([id, n]) => assert.equal(FP.raisonExclusion(id, n, REGLE), null, n));
  // Plus aucun marche d'une seule mi-temps dans la liste des publiables ; aucun libelle publiable ne parle de mi-temps.
  const pub = FP.catalogue(REGLE).publiables;
  assert.ok(pub.every((x) => !FP.estMiTemps(x.bet_id, "")));
  for (const x of pub) {
    let t = "";
    for (const val of ["Home", "Away", "Draw", "Over 0.5", "Yes", "1:0", "0", "Home/Draw", "Home -0.5"]) { try { t += " " + FP.SPECS[x.bet_id].lib(val, "DOM", "EXT"); } catch (e) {} }
    assert.doesNotMatch(t, /mi-temps/i, "bet " + x.bet_id + " : " + t.slice(0, 80));
  }
  // Tranches de minutes (conseil du mathematicien) : famille « Minutes » hors du choix, aucun pari ne changeait.
  const minutes = Object.keys(FP.SPECS).filter((id) => FP.SPECS[id].fam === "Minutes").map(Number);
  assert.ok(minutes.length >= 10 && minutes.includes(54) && minutes.includes(149), minutes.join(","));
  minutes.forEach((id) => assert.equal(FP.raisonExclusion(id, "x", REGLE), FP.RAISON_MINUTES, "bet " + id));
  assert.ok(pub.every((x) => FP.SPECS[x.bet_id].fam !== "Minutes"));
  // Seul le handicap de 1re mi-temps est dans la fourchette : aucun pari ne sort.
  const r = raw([{ id: 1, name: "Match Winner", values: v([["Home", 1.3], ["Draw", 5], ["Away", 9]]) },
    { id: 19, name: "Asian Handicap First Half", values: v([["Home -0.5", 1.75], ["Away +0.5", 2.05]]) }]);
  assert.equal(P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r), {}), null, "seul un handicap de 1re mi-temps dans la fourchette : pas de pari");
});

test("cartons jamais regles sans evenements ; statistique absente ou vide jamais comptee 0 (en attente)", () => {
  const base = { fixture: { teams: { home: { id: 1 }, away: { id: 2 } }, score: { fulltime: { home: 0, away: 0 }, halftime: { home: 0, away: 0 } }, fixture: { status: { short: "FT" } } } };
  [undefined, []].forEach((events) => {
    const F = FP.faitsDuMatch(Object.assign({}, base, { events }));
    assert.equal(F.cartons, null, "evenements " + JSON.stringify(events));
    assert.equal(FP.regler("F80:Under 3.5", F), null, "« moins de » jamais gagne sans donnee");
  });
  const st = (val) => Object.assign({}, base, { statistics: [{ team: { id: 1 }, statistics: [{ type: "Corner Kicks", value: val }, { type: "Total Shots", value: 7 }] },
    { team: { id: 2 }, statistics: [{ type: "Corner Kicks", value: val }, { type: "Total Shots", value: 5 }] }] });
  [null, ""].forEach((val) => {
    const F = FP.faitsDuMatch(st(val));
    assert.equal(FP.regler("F45:Under 9.5", F), null, "corners " + JSON.stringify(val));
    assert.equal(FP.regler("F55:Home", F), null);
  });
  assert.equal(FP.regler("F45:Under 9.5", FP.faitsDuMatch(base)), null, "statistiques absentes");
  assert.equal(FP.regler("F45:Under 9.5", FP.faitsDuMatch(st(2))), true);
  // Aucun carton saisi (seulement un but) : en attente, jamais 0 carton.
  const but = { type: "Goal", detail: "Normal Goal", team: { id: 1 }, player: { id: 9 }, time: { elapsed: 30 } };
  assert.equal(FP.faitsDuMatch(Object.assign({}, base, { events: [but] })).cartons, null);
  // Match arrete (ABD) : rien n'est regle sur les statistiques ni les cartons.
  const abd = Object.assign({}, st(2), { fixture: Object.assign({}, base.fixture, { fixture: { status: { short: "ABD" } } }),
    events: [{ type: "Card", detail: "Yellow Card", team: { id: 1 }, player: { id: 9 }, time: { elapsed: 30 } }] });
  assert.equal(FP.regler("F45:Under 9.5", FP.faitsDuMatch(abd)), null, "ABD corners");
  assert.equal(FP.faitsDuMatch(abd).cartons, null, "ABD cartons");
  // Carton de l'entraineur ou d'un joueur du banc : non compte.
  const coach = Object.assign({}, base, { events: [{ type: "Card", detail: "Yellow Card", team: { id: 1 }, player: { id: 500 }, time: { elapsed: 50 }, comments: "Coach" },
    { type: "Card", detail: "Yellow Card", team: { id: 2 }, player: { id: 20 }, time: { elapsed: 60 } }] });
  assert.deepEqual(FP.faitsDuMatch(coach).cartons, [0, 1]);
});

test("statistiques d'equipe reglees sur 90 minutes : match prolonge (AET, PEN) jamais regle automatiquement sur les chiffres d'API-Football", () => {
  const src = (statut) => ({ fixture: { teams: { home: { id: 1 }, away: { id: 2 } }, score: { fulltime: { home: 1, away: 1 }, halftime: { home: 0, away: 0 } }, fixture: { status: { short: statut } } },
    statistics: [{ team: { id: 1 }, statistics: [{ type: "Corner Kicks", value: 8 }, { type: "Total Shots", value: 15 }] }, { team: { id: 2 }, statistics: [{ type: "Corner Kicks", value: 4 }, { type: "Total Shots", value: 9 }] }] });
  assert.equal(FP.regler("F45:Over 9.5", FP.faitsDuMatch(src("FT"))), true);
  ["AET", "PEN"].forEach((st) => {
    const F = FP.faitsDuMatch(src(st));
    assert.equal(FP.regler("F45:Over 9.5", F), null, st + " corners");
    assert.equal(FP.regler("F55:Home", F), null, st + " corners 1N2");
  });
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
  assert.ok(!s.some((x) => /^F231:/.test(x.code)), "buteurs : jamais candidats (condition du mathematicien du 12/11)");
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
  // Texte du 13/11/2026 (regle scenario) : « la plus belle cote entre 1,70 et 3,50 parmi les paris juges probables ».
  assert.ok(fr.includes("entre 1,70 et 3,50") && fr.includes("parmi les paris jugés probables"));
  assert.ok(en.includes("between 1.70 and 3.50") && en.includes("among the bets we rate as likely"));
  ["fr", "en", "es", "de", "it", "pt", "gb", "mx", "za"].forEach((d) => assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "i18n/seo/" + d + ".json"), "utf8"), /1[.,]40-2[.,]20/, d));
});

// REGLE DU 16/11/2026 (Clement : « pour un match donne, le combine reprend le pari affiche sur sa page »). Du 13 au 17/11,
// 2 jambes sur 43 seulement etaient le pari de la page (jambes de l'ancienne selection, regle du 11/11).
test("combines : chaque jambe est le pari affiche de la page (meme pari, meme cote, meme chance), avec la vraie configuration", () => {
  const T = require("../lib/tickets-du-jour.js");
  const REEL = require("../config/tickets.json");
  const V = require("../config/verdicts-maths.json");
  // Depuis le 17/11/2026, les jambes des combines suivent jambes_combines (tests/tickets-jambes-faciles.test.js) ; la
  // regle du 16/11 (jambe = pari affiche 1,70-2,30) est remise ici EN PARAMETRE pour garder sa mecanique sous controle.
  assert.equal(REEL.regle_version, "tickets-2026-11-17");
  const REGLES = Object.assign({}, REEL, { x5: Object.assign({}, REEL.x5, { jambes: [2, 3] }), x10: Object.assign({}, REEL.x10, { jambes: [3, 4] }), paliers_cote_jambe: [1.85, 2.3] });
  delete REGLES.jambes_combines;
  assert.deepEqual([REGLES.jambe.cote_min, REGLES.jambe.cote_max, REGLES.jambe.chance_min], [1.7, 2.3, 50]);
  assert.deepEqual([REGLES.x5.jambes, REGLES.x10.jambes, REGLES.paliers_cote_jambe], [[2, 3], [3, 4], [1.85, 2.3]]);
  assert.ok(REGLES.jambe.cote_min >= LIGUES.fiabilite.fourchette_pari.cote_min, "une jambe n'est jamais sous le minimum du pari affiche");
  const PARIS = [["under-35", "Moins de 3,5 buts", "1.73", 54], ["away-team-under-15", "Exterieur moins de 1,5 but", "1.73", 54], ["btts-yes", "Les deux equipes marquent", "1.80", 53],
    ["over-25", "Plus de 2,5 buts", "1.75", 55], ["under-25", "Moins de 2,5 buts", "1.83", 56], ["away-team-over-05", "Exterieur plus de 0,5 but", "2.00", 53]];
  const matchs = [], fixtureById = {};
  const ajouter = (id, heure, pari, extra) => {
    const m = Object.assign({ id: id, home: { n: "Dom" + id, id: id * 10 }, away: { n: "Ext" + id, id: id * 10 + 1 }, date: "2026-11-18 " + heure,
      league: "UEFA Nations League", league_key: "nations_league", league_id: 5, league_reliability: "en_test", no_signal: false,
      pari_rec: pari[1], market_id: pari[0], cote_rec: pari[2], cote_source: "bet365", chance_iashark: pari[3],
      pronostic: { market_id: pari[0], libelle_fr: pari[1], chance: pari[3], cote: Number(pari[2]), voie: "scenario", moteur: "scenario", fiabilite: "en test", selection: false, publie: true, hors_fourchette: false },
      // Cotes 1N2 et buts du match : l'ancienne selection y aurait pris « victoire » a 1,45 (jamais une jambe desormais).
      c1: "1.45", cn: "4.20", c2: "6.50", co25: "1.60", cu25: "2.30", cdc1x: "1.12", cdc2x: "2.50", cdc12: "1.25" }, extra || {});
    matchs.push(m);
    fixtureById[String(id)] = { fixture: { timestamp: Math.floor(Date.parse("2026-11-18T" + heure + ":00+01:00") / 1000), status: { short: "NS" } } };
    return m;
  };
  PARIS.forEach((p, i) => ajouter(9200 + i, (18 + (i % 4)) + ":00", p));
  // Jamais des jambes : pari d'un autre marche de bookmaker (F...), pari hors fourchette, cote au-dela de 2,30, chance sous 50 %.
  ajouter(9300, "20:00", ["F45:Over 8.5", "Plus de 8,5 corners", "1.73", 54]);
  ajouter(9301, "20:00", ["over-15", "Plus de 1,5 but", "1.48", 62], { pronostic: { market_id: "over-15", publie: true, hors_fourchette: true, fiabilite: "en test" } });
  ajouter(9302, "20:00", ["home-win", "Victoire Dom9302", "2.60", 51], { pronostic: { market_id: "home-win", publie: true, hors_fourchette: false, fiabilite: "en test" } });
  ajouter(9303, "20:00", ["dc-x2", "Ext9303 ou nul", "1.90", 48], { pronostic: { market_id: "dc-x2", publie: true, hors_fourchette: false, fiabilite: "en test" } });
  const opts = { jour: "2026-11-18", nowMs: Date.parse("2026-11-18T07:00:00Z"), fixtureById, configLigues: LIGUES, categoriesNoGo: V.categories_no_go, competitions: V.competitions_jambes, regles: REGLES };
  const c = T.calculerDuJour(matchs, opts);
  assert.equal(c.nb_jambes, PARIS.length, JSON.stringify(c.exclus));
  const parId = {};
  matchs.forEach((m) => { parId[m.id] = m; });
  const memeQueLaPage = (j) => {
    const m = parId[j.fixture_id];
    assert.ok(m, "match connu");
    assert.equal(j.market_id, m.market_id, "meme pari que la page");
    assert.equal(j.pari, m.pari_rec, "meme libelle que la page");
    assert.equal(j.cote, Number(m.cote_rec), "meme cote que la page");
    assert.equal(j.chance, m.chance_iashark, "meme chance que la page");
    assert.ok(j.fixture_id < 9300, "jamais un match dont le pari ne peut pas etre une jambe");
  };
  assert.ok(c.x5 && c.x10 && c.or, "petit combine, grand combine et montantes construits : " + JSON.stringify(c.exclus));
  assert.ok([2, 3].includes(c.x5.contenu.jambes.length) && c.x5.meta.cote_totale >= 4 && c.x5.meta.cote_totale <= 6, String(c.x5.meta.cote_totale));
  assert.ok([3, 4].includes(c.x10.contenu.jambes.length) && c.x10.meta.cote_totale >= 8.5 && c.x10.meta.cote_totale <= 12, String(c.x10.meta.cote_totale));
  c.x5.contenu.jambes.concat(c.x10.contenu.jambes, c.or.contenu.paris).forEach(memeQueLaPage);
  // Le pari de la page change de sens : la jambe suit (une seule source), jamais l'ancienne selection.
  const autre = matchs.map((m) => (m.id === 9200 ? Object.assign({}, m, { market_id: "over-35", pari_rec: "Plus de 3,5 buts", cote_rec: "2.10", chance_iashark: 50,
    pronostic: Object.assign({}, m.pronostic, { market_id: "over-35", libelle_fr: "Plus de 3,5 buts" }) }) : m));
  const c2 = T.calculerDuJour(autre, opts);
  const toutes = (c2.x5 ? c2.x5.contenu.jambes : []).concat(c2.x10 ? c2.x10.contenu.jambes : [], c2.or ? c2.or.contenu.paris : []);
  toutes.filter((j) => j.fixture_id === 9200).forEach((j) => assert.equal(j.market_id, "over-35"));
  assert.ok(toutes.every((j) => j.market_id !== "home-win"), "jamais l'ancienne selection (victoire a 1,45)");
  // Le code ne lit plus l'ancienne selection.
  const src = require("node:fs").readFileSync(require.resolve("../lib/tickets-du-jour.js"), "utf8");
  assert.equal(/pariAncienneRegleParMatch\(/.test(src), false);
});

test("match offert : une selection nationale verifiee par les cotes reste une Selection IASHARK sans le v3", () => {
  const nl = Object.assign({}, M, { league: "UEFA Nations League", league_key: "nations_league", league_id: 5, home: { n: "France" }, away: { n: "Italie" },
    home_team: "France", away_team: "Italie" });
  const r = () => raw([{ id: 1, name: "Match Winner", values: v([["Home", 1.8], ["Draw", 3.6], ["Away", 4.6]]) }]);
  const c = P.choisirPariFourchette(nl, ctxAvec(r()), {});
  assert.ok(c, "un pari dans la fourchette");
  assert.equal(c.selection_possible, true, c.market_id);
  const club = P.choisirPariFourchette(Object.assign({}, M), ctxAvec(r()), {});
  assert.equal(club.selection_possible, false, "club sans v3 : inchange");
});
