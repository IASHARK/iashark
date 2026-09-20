"use strict";
// Tests du reglement publie (onglet « Hier », docs/SPEC_RESULTATS_HIER.md).
//
// Ce que ces tests protegent, dans l'ordre d'importance :
//   1. aucune donnee premium d'un match NON TERMINE ne sort dans le fichier
//      public ni dans une ligne match_results (regle non negociable §2) ;
//   2. aucun pari n'est regle a l'aveugle : fixture absente, statut non final,
//      marche non resolvable ou pari masque non relu -> pending, jamais loss
//      (regle non negociable §5) ;
//   3. les pertes sont publiees comme les gains (§1) et les totaux disent la
//      verite ;
//   4. la source de la cote n'est jamais devinee (§6).
const test = require("node:test");
const assert = require("node:assert/strict");
const MR = require("../lib/match-results.js");

// --- fabriques d'objets API (memes formes que v3.football.api-sports.io) ---
function fixture(opts) {
  const o = opts || {};
  return {
    fixture: {
      id: o.id != null ? o.id : 1000001,
      date: o.date || "2026-09-19T21:30:00+02:00",
      status: { short: o.status || "FT" },
    },
    teams: { home: { name: o.home || "Nacional" }, away: { name: o.away || "Famalicao" } },
    goals: { home: o.goalsHome != null ? o.goalsHome : (o.gh != null ? o.gh : null), away: o.goalsAway != null ? o.goalsAway : (o.ga != null ? o.ga : null) },
    score: {
      halftime: { home: o.htHome != null ? o.htHome : null, away: o.htAway != null ? o.htAway : null },
      fulltime: { home: o.gh != null ? o.gh : null, away: o.ga != null ? o.ga : null },
    },
    events: o.events || undefined,
  };
}
function prediction(opts) {
  const o = opts || {};
  return {
    match: (o.home || "Nacional") + " vs " + (o.away || "Famalicao"),
    home: o.home || "Nacional",
    away: o.away || "Famalicao",
    league: o.league || "Primeira Liga",
    league_key: o.league_key || "primeira",
    sport: "football",
    has_pinnacle: o.has_pinnacle === true,
    date: o.date || "2026-09-19",
    result: o.result || "scheduled",
    fixture_id: o.fixture_id != null ? o.fixture_id : 1000001,
    type: o.type || "single",
    score: o.score || null,
    prediction: o.prediction !== undefined ? o.prediction : "Over 1.5",
    cote: o.cote !== undefined ? o.cote : "1.32",
    market: o.market !== undefined ? o.market : "over15",
    redacted: o.redacted === true ? true : undefined,
  };
}

// ---------------------------------------------------------------------------
// 1. Reglement d'un pari
// ---------------------------------------------------------------------------
test("settleBet : pari gagne sur un match termine", () => {
  const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Over 1.5" })), fixture({ gh: 2, ga: 1 }));
  assert.equal(r.result, "win");
  assert.equal(r.score, "2-1");
  assert.equal(r.final, true);
  assert.equal(r.reason, null);
});

test("settleBet : pari perdu publie comme tel, jamais masque", () => {
  const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Exterieur clean sheet" })), fixture({ gh: 2, ga: 1 }));
  assert.equal(r.result, "loss");
  assert.equal(r.score, "2-1");
  assert.equal(r.final, true);
});

test("settleBet : push handicap -> void (mise remboursee)", () => {
  const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Handicap -1 domicile" })), fixture({ gh: 2, ga: 1 }));
  assert.equal(r.result, "void");
  assert.equal(r.score, "2-1");
});

test("settleBet : match reporte / annule / abandonne -> void sans score", () => {
  ["PST", "CANC", "ABD"].forEach(function (s) {
    const r = MR.settleBet(MR.fusionnerPari(prediction({})), fixture({ status: s, gh: null, ga: null }));
    assert.equal(r.result, "void", s);
    assert.equal(r.score, null, s);
    assert.equal(r.final, true, s);
  });
});

test("settleBet : statut non final -> pending, raison exacte, jamais loss", () => {
  ["NS", "1H", "HT", "2H", "LIVE", "SUSP", "INT"].forEach(function (s) {
    const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Under 2.5" })), fixture({ status: s, gh: 5, ga: 5 }));
    assert.equal(r.result, "pending", s);
    assert.equal(r.final, false, s);
    assert.equal(r.score, null, s);
    assert.equal(r.reason, MR.RAISON.STATUT_NON_FINAL + ": " + s, s);
  });
});

test("settleBet : fixture absente -> pending avec la raison 'fixture introuvable'", () => {
  const r = MR.settleBet(MR.fusionnerPari(prediction({})), null);
  assert.equal(r.result, "pending");
  assert.equal(r.final, false);
  assert.equal(r.reason, MR.RAISON.FIXTURE_ABSENTE);
});

test("settleBet : pari masque non relu -> pending, jamais regle a l'aveugle", () => {
  const pari = MR.fusionnerPari({ fixture_id: 1, home: "A", away: "B", date: "2026-09-18", result: "scheduled", redacted: true }, null);
  const r = MR.settleBet(pari, fixture({ gh: 3, ga: 0 }));
  assert.equal(r.result, "pending");
  assert.equal(r.reason, MR.RAISON.PARI_NON_RELU);
  // Le match EST termine : le score est connu, seul le pari manque.
  assert.equal(r.final, true);
  assert.equal(r.score, "3-0");
});

test("settleBet : marche 'tirs du match' sans statistiques -> pending, JAMAIS loss", () => {
  const pari = MR.fusionnerPari(prediction({ prediction: "Tirs du match over 23.5" }));
  const sansStats = MR.settleBet(pari, fixture({ gh: 1, ga: 1 }));
  assert.equal(sansStats.result, "pending");
  assert.notEqual(sansStats.result, "loss");
  assert.equal(sansStats.reason, MR.RAISON.MARCHE_NON_RESOLVABLE);
  // Avec la statistique reellement lue, le marche se regle normalement.
  const avecStats = MR.settleBet(pari, fixture({ gh: 1, ga: 1 }), { totalShots: 27 });
  assert.equal(avecStats.result, "win");
  const avecStatsPerdu = MR.settleBet(pari, fixture({ gh: 1, ga: 1 }), { totalShots: 12 });
  assert.equal(avecStatsPerdu.result, "loss");
});

test("settleBet : ligne quart de handicap non supportee -> pending, jamais un demi-perdant compte perdu", () => {
  const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Handicap -0.25 domicile" })), fixture({ gh: 1, ga: 1 }));
  assert.equal(r.result, "pending");
  assert.equal(r.reason, MR.RAISON.MARCHE_NON_RESOLVABLE);
});

test("settleBet : libelles reellement publies par le pipeline (historique.json)", () => {
  const cas = [
    ["Over 2.5", 2, 1, "win"], ["Under 2.5", 1, 1, "win"], ["Under 3.5", 2, 1, "win"], ["Under 3.5", 3, 1, "loss"],
    ["BTTS Oui", 1, 1, "win"], ["BTTS Non", 2, 0, "win"],
    ["DC 1X", 1, 1, "win"], ["DC X2", 0, 1, "win"], ["DC 12", 1, 1, "loss"],
    ["Victoire Domicile", 2, 0, "win"], ["Victoire Exterieur", 0, 2, "win"],
    ["Domicile moins de 1.5 but", 1, 3, "win"], ["Exterieur plus de 1.5 but", 0, 2, "win"],
    ["Exterieur clean sheet", 0, 1, "win"],
  ];
  cas.forEach(function (c) {
    const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: c[0] })), fixture({ gh: c[1], ga: c[2] }));
    assert.equal(r.result, c[3], c[0] + " " + c[1] + "-" + c[2]);
  });
});

test("settleBet : un libelle que lib/resolvers.js ne sait pas lire reste pending", () => {
  // « Plus de 1.5 buts » (total sans camp) n'est resolu par aucune regle de
  // lib/resolvers.js : il reste en attente au lieu d'etre compte au hasard.
  const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Plus de 1.5 buts" })), fixture({ gh: 2, ga: 1 }));
  assert.equal(r.result, "pending");
  assert.equal(r.reason, MR.RAISON.MARCHE_NON_RESOLVABLE);
});

test("settleBet : premiere mi-temps reglee sur le score a la pause de la fixture", () => {
  const pari = MR.fusionnerPari(prediction({ prediction: "Premiere mi-temps plus de 0.5 but" }));
  assert.equal(MR.settleBet(pari, fixture({ gh: 2, ga: 1, htHome: 1, htAway: 0 })).result, "win");
  assert.equal(MR.settleBet(pari, fixture({ gh: 2, ga: 1, htHome: 0, htAway: 0 })).result, "loss");
  // Score a la pause absent : jamais devine.
  assert.equal(MR.settleBet(pari, fixture({ gh: 2, ga: 1 })).result, "pending");
});

test("settleBet : prolongation reglee sur le score reglementaire (90 min)", () => {
  const fix = fixture({ status: "AET", gh: 1, ga: 1, goalsHome: 2, goalsAway: 1 });
  const r = MR.settleBet(MR.fusionnerPari(prediction({ prediction: "Under 2.5" })), fix);
  assert.equal(r.score, "1-1");
  assert.equal(r.result, "win");
});

// ---------------------------------------------------------------------------
// 2. Source des cotes
// ---------------------------------------------------------------------------
test("oddsSource : 'pinnacle' uniquement quand la donnee le dit, sinon 'moyenne'", () => {
  assert.equal(MR.oddsSource(MR.fusionnerPari(prediction({ has_pinnacle: true }))), "pinnacle");
  assert.equal(MR.oddsSource(MR.fusionnerPari(prediction({ has_pinnacle: false }))), "moyenne");
  assert.equal(MR.oddsSource({ cote: 1.9, market_source: "Pinnacle" }), "pinnacle");
  assert.equal(MR.oddsSource({ cote: 1.9, market_source: "cotes moyennes" }), "moyenne");
  // Pas de cote exploitable -> rien a qualifier.
  assert.equal(MR.oddsSource(MR.fusionnerPari(prediction({ cote: null, has_pinnacle: true }))), null);
  assert.equal(MR.oddsSource(MR.fusionnerPari(prediction({ cote: "1", has_pinnacle: true }))), null);
});

// ---------------------------------------------------------------------------
// 3. Buteur du jour
// ---------------------------------------------------------------------------
function but(playerId, name, detail) {
  return { type: "Goal", detail: detail || "Normal Goal", player: { id: playerId, name: name } };
}
test("resolveScorerPick : gagne des qu'un but est marque, perdu sinon", () => {
  const fix = fixture({ gh: 2, ga: 1 });
  const events = [but(521, "Joao Silva"), but(999, "Autre Joueur"), but(521, "Joao Silva")];
  const gagne = MR.resolveScorerPick({ match_id: 1000001, player_id: 521, player: "Joao Silva" }, fix, events);
  assert.equal(gagne.result, "win");
  assert.equal(gagne.goals, 2);
  const perdu = MR.resolveScorerPick({ match_id: 1000001, player_id: 4242, player: "Personne" }, fix, events);
  assert.equal(perdu.result, "loss");
  assert.equal(perdu.goals, 0);
});

test("resolveScorerPick : penalty manque et but contre son camp ne comptent pas", () => {
  const fix = fixture({ gh: 1, ga: 0 });
  const events = [but(521, "Joao Silva", "Missed Penalty"), but(521, "Joao Silva", "Own Goal")];
  const r = MR.resolveScorerPick({ match_id: 1000001, player_id: 521, player: "Joao Silva" }, fix, events);
  assert.equal(r.result, "loss");
  assert.equal(r.goals, 0);
  const penalty = MR.resolveScorerPick({ match_id: 1000001, player_id: 521, player: "Joao Silva" }, fix, [but(521, "Joao Silva", "Penalty")]);
  assert.equal(penalty.result, "win");
});

test("resolveScorerPick : match non termine ou evenements absents -> pending, jamais 'n'a pas marque'", () => {
  assert.equal(MR.resolveScorerPick({ match_id: 1, player_id: 521 }, fixture({ status: "1H" }), []).result, "pending");
  assert.equal(MR.resolveScorerPick({ match_id: 1, player_id: 521 }, fixture({ gh: 1, ga: 0 }), null).result, "pending");
  assert.equal(MR.resolveScorerPick({ match_id: 1, player_id: 521 }, null, []).result, "pending");
  // Match annule : rembourse, pas perdu.
  assert.equal(MR.resolveScorerPick({ match_id: 1, player_id: 521 }, fixture({ status: "PST" }), []).result, "void");
});

test("resolveScorerPick : joueur connu seulement par son nom et introuvable -> pending", () => {
  const fix = fixture({ gh: 1, ga: 0 });
  const events = [but(999, "K. Mbappe")];
  // Nom qui ne correspond a aucun buteur : impossible de distinguer
  // « n'a pas marque » de « nom ecrit autrement par l'API ».
  assert.equal(MR.resolveScorerPick({ match_id: 1, player: "Kylian Mbappe" }, fix, events).result, "pending");
  // Nom identique aux accents/casse pres : reconnu.
  assert.equal(MR.resolveScorerPick({ match_id: 1, player: "k. mbappé" }, fix, events).result, "win");
});

// ---------------------------------------------------------------------------
// 4. Fichier results/<jour>.json
// ---------------------------------------------------------------------------
test("buildDayFile : REFUSE de publier la moindre donnee de pari d'un match non termine", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [prediction({ fixture_id: 7, prediction: "Over 2.5", cote: "1.85", has_pinnacle: true })],
    fixtures: [fixture({ id: 7, status: "NS" })],
    generatedAt: "2026-09-20T06:00:00.000Z",
  });
  assert.equal(out.file.matches.length, 1);
  const m = out.file.matches[0];
  assert.equal(m.result, "pending");
  assert.equal(m.pick, null);
  assert.equal(m.cote, null);
  assert.equal(m.market_id, null);
  assert.equal(m.odds_source, null);
  assert.equal(m.score, null);
  // Faits publics conserves : equipes, competition, coup d'envoi.
  assert.equal(m.home, "Nacional");
  assert.equal(m.league_key, "primeira");
  // Aucune ligne match_results pour un match non termine.
  assert.equal(MR.matchResultRow(m, "2026-09-19"), null);
  // Et la raison exacte est journalisee.
  assert.equal(out.report.unsettled.length, 1);
  assert.equal(out.report.unsettled[0].reason, MR.RAISON.STATUT_NON_FINAL + ": NS");
});

test("buildDayFile : un match termine publie le pari, la cote, la source et le verdict", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [prediction({ fixture_id: 1575507, prediction: "Over 1.5", market: "over15", cote: "1.32", has_pinnacle: true })],
    fixtures: [fixture({ id: 1575507, gh: 2, ga: 1 })],
    generatedAt: "2026-09-20T06:12:00.000Z",
  });
  assert.deepEqual(out.file.totals, { settled: 1, won: 1, lost: 0, void: 0, pending: 0 });
  const m = out.file.matches[0];
  assert.equal(m.id, 1575507);
  assert.equal(m.score, "2-1");
  assert.equal(m.pick, "Over 1.5");
  assert.equal(m.market_id, "over15");
  assert.equal(m.cote, 1.32);
  assert.equal(m.odds_source, "pinnacle");
  assert.equal(m.result, "win");
  assert.equal(m.kickoff, "2026-09-19 21:30");
  // Contrat : exactement ces cles (href seulement si la page existe).
  assert.deepEqual(Object.keys(out.file), ["day", "generated_at", "totals", "matches", "scorers"]);
  assert.equal(out.file.day, "2026-09-19");
  assert.equal(out.file.generated_at, "2026-09-20T06:12:00.000Z");
  assert.equal(m.href, undefined);
});

test("buildDayFile : un match sans marche retenu (no_signal) n'entre jamais dans le fichier", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [
      prediction({ fixture_id: 1, prediction: "Over 1.5" }),
      prediction({ fixture_id: 2, result: "no_signal", prediction: "" }),
      prediction({ fixture_id: 3, type: "combi" }),
      prediction({ fixture_id: 4, date: "2026-09-18" }),
    ],
    fixtures: [fixture({ id: 1, gh: 2, ga: 0 }), fixture({ id: 2, gh: 0, ga: 0 }), fixture({ id: 3, gh: 0, ga: 0 }), fixture({ id: 4, gh: 0, ga: 0, date: "2026-09-18T21:00:00+02:00" })],
  });
  assert.deepEqual(out.file.matches.map(function (m) { return m.id; }), [1]);
  assert.equal(out.report.total, 1);
});

test("buildDayFile : une ligne est classee au jour du MATCH, pas au jour de publication", () => {
  // historique.json date la prediction au jour du run (update-data.yml :
  // `date:TODAY`), meme pour un match du lendemain. Les resultats « d'hier »
  // ne doivent pas contenir un match qui se joue ce soir.
  const pub19 = prediction({ fixture_id: 55, date: "2026-09-19", prediction: "Over 1.5" });
  const fix20 = fixture({ id: 55, gh: 2, ga: 0, date: "2026-09-20T15:00:00+02:00" });
  const le19 = MR.buildDayFile({ day: "2026-09-19", predictions: [pub19], fixtures: [fix20] });
  assert.deepEqual(le19.file.matches, []);
  const le20 = MR.buildDayFile({ day: "2026-09-20", predictions: [pub19], fixtures: [fix20] });
  assert.deepEqual(le20.file.matches.map(function (m) { return m.id; }), [55]);
  // Coup d'envoi inconnu : repli sur la date de publication, jamais devine.
  const sansFixture = MR.buildDayFile({ day: "2026-09-19", predictions: [pub19] });
  assert.deepEqual(sansFixture.file.matches.map(function (m) { return m.id; }), [55]);
  // Le registre des pages match sert aussi de source de coup d'envoi.
  const registre = { matches: { "55": { id: "55", dirs: [], status: "active", kickoff: "2026-09-20T13:00:00Z" } } };
  assert.deepEqual(MR.buildDayFile({ day: "2026-09-19", predictions: [pub19], registry: registre }).file.matches, []);
  assert.equal(MR.buildDayFile({ day: "2026-09-20", predictions: [pub19], registry: registre }).file.matches.length, 1);
});

test("buildDayFile : totaux — les pertes comptent, void et pending sont hors du bilan", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [
      prediction({ fixture_id: 1, prediction: "Over 1.5" }),
      prediction({ fixture_id: 2, prediction: "Over 1.5" }),
      prediction({ fixture_id: 3, prediction: "Over 1.5" }),
      prediction({ fixture_id: 4, prediction: "Handicap -1 domicile" }),
      prediction({ fixture_id: 5, prediction: "Tirs du match over 23.5" }),
      prediction({ fixture_id: 6, prediction: "Over 1.5" }),
    ],
    fixtures: [
      fixture({ id: 1, gh: 2, ga: 1 }),
      fixture({ id: 2, gh: 3, ga: 0 }),
      fixture({ id: 3, gh: 1, ga: 0 }),
      fixture({ id: 4, gh: 2, ga: 1 }),
      fixture({ id: 5, gh: 1, ga: 1 }),
      fixture({ id: 6, status: "NS" }),
    ],
  });
  assert.deepEqual(out.file.totals, { settled: 3, won: 2, lost: 1, void: 1, pending: 2 });
  // « 2 marches sur 3 realises » : won / (won + lost).
  assert.equal(out.file.totals.won + out.file.totals.lost, out.file.totals.settled);
});

test("buildDayFile : une ligne match_results deja reglee fait autorite (aucun nouvel appel API)", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [prediction({ fixture_id: 9, prediction: "Over 1.5", cote: "1.4" })],
    results: [{ fixture_id: 9, result: "win", score: "3-1", kickoff: "2026-09-19 18:00" }],
    fixtures: [],
  });
  const m = out.file.matches[0];
  assert.equal(m.result, "win");
  assert.equal(m.score, "3-1");
  assert.equal(m.kickoff, "2026-09-19 18:00");
  assert.equal(m.pick, "Over 1.5");
  assert.equal(out.report.unsettled.length, 0);
});

test("buildDayFile : la prediction deja reglee par le pipeline quotidien est reprise telle quelle", () => {
  const out = MR.buildDayFile({
    day: "2026-09-18",
    predictions: [prediction({ fixture_id: 1492371, date: "2026-09-18", prediction: "Exterieur clean sheet", cote: "2.5", market: "away-clean-sheet", result: "loss", score: "2-1" })],
    fixtures: [],
  });
  const m = out.file.matches[0];
  assert.equal(m.result, "loss");
  assert.equal(m.score, "2-1");
  assert.equal(m.pick, "Exterieur clean sheet");
  assert.deepEqual(out.file.totals, { settled: 1, won: 0, lost: 1, void: 0, pending: 0 });
});

test("buildDayFile : pari masque relu depuis predictions_archive", () => {
  const masquee = { fixture_id: 1549791, home: "Llaneros", away: "Atletico Nacional", league: "Primera A", league_key: "colombia_primera_a", date: "2026-09-19", result: "scheduled", type: "single", redacted: true };
  const sansArchive = MR.buildDayFile({ day: "2026-09-19", predictions: [masquee], fixtures: [fixture({ id: 1549791, gh: 1, ga: 2 })] });
  assert.equal(sansArchive.file.matches[0].result, "pending");
  assert.equal(sansArchive.file.matches[0].pick, null);
  assert.equal(sansArchive.report.unsettled[0].reason, MR.RAISON.PARI_NON_RELU);

  const avecArchive = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [masquee],
    archiveRows: [{ fixture_id: 1549791, prediction: "DC X2", cote: "1.55", market: "dc-x2", has_pinnacle: true, date: "2026-09-19", result: "scheduled", type: "single" }],
    fixtures: [fixture({ id: 1549791, gh: 1, ga: 2 })],
  });
  const m = avecArchive.file.matches[0];
  assert.equal(m.pick, "DC X2");
  assert.equal(m.cote, 1.55);
  assert.equal(m.odds_source, "pinnacle");
  assert.equal(m.result, "win");
  assert.equal(avecArchive.report.unsettled.length, 0);
});

test("buildDayFile : buteurs — seul un joueur nomme est publie, jamais un verdict devine", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [],
    scorers: [
      { match_id: 1575507, match: "Nacional - Famalicao", player: "Joao Silva", goals: 1, result: "win" },
      { match_id: 1570400, match: "A - B", player: "Autre", goals: 0, result: "loss" },
      { match_id: 1570401, match: "C - D", player: null, goals: null, result: "win" },
      { match_id: 1570402, match: "E - F", player: "Inconnu", goals: null, result: "n_importe_quoi" },
    ],
  });
  assert.equal(out.file.scorers.length, 3);
  assert.deepEqual(out.file.scorers[0], { match_id: 1575507, match: "Nacional - Famalicao", player: "Joao Silva", goals: 1, result: "win" });
  assert.equal(out.file.scorers[2].result, "pending");
});

test("buildDayFile : href seulement quand la page match existe vraiment", () => {
  const registry = { matches: { "1575507": { id: "1575507", dirs: ["fr", "en"], status: "active" }, "1575508": { id: "1575508", dirs: ["fr"], status: "redirected" } } };
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [
      prediction({ fixture_id: 1575507, prediction: "Over 1.5" }),
      prediction({ fixture_id: 1575508, prediction: "Over 1.5" }),
      prediction({ fixture_id: 1575509, prediction: "Over 1.5" }),
    ],
    fixtures: [fixture({ id: 1575507, gh: 2, ga: 0 }), fixture({ id: 1575508, gh: 2, ga: 0 }), fixture({ id: 1575509, gh: 2, ga: 0 })],
    registry: registry,
  });
  const parId = {};
  out.file.matches.forEach(function (m) { parId[m.id] = m; });
  assert.equal(parId[1575507].href, "/match/1575507.html");
  assert.equal(parId[1575508].href, undefined);
  assert.equal(parId[1575509].href, undefined);
});

// ---------------------------------------------------------------------------
// 5. Journal et alerte
// ---------------------------------------------------------------------------
test("formatUnsettledLog : une ligne par pari non regle, avec la cause, sans le pari", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [prediction({ fixture_id: 7, prediction: "Over 2.5" })],
    fixtures: [],
  });
  const lignes = MR.formatUnsettledLog(out.report);
  assert.equal(lignes.length, 1);
  assert.match(lignes[0], /fixture 7/);
  assert.match(lignes[0], /fixture introuvable/);
  // Journaux GitHub Actions publics : jamais le libelle du pari ni la cote.
  assert.equal(/Over 2\.5/.test(lignes[0]), false);
});

test("unsettledWarning : ::warning au-dela de 10 % non regles, et seulement apres 24 h", () => {
  const predictions = [];
  for (let i = 1; i <= 10; i++) predictions.push(prediction({ fixture_id: i, date: "2026-09-18", prediction: "Over 1.5" }));
  const fixtures = [];
  for (let i = 1; i <= 8; i++) fixtures.push(fixture({ id: i, gh: 2, ga: 1, date: "2026-09-18T21:00:00+02:00" }));
  const out = MR.buildDayFile({ day: "2026-09-18", predictions: predictions, fixtures: fixtures });
  assert.equal(out.report.unsettled.length, 2);
  // Moins de 24 h apres la journee : aucune alerte (des matchs peuvent encore courir).
  assert.equal(MR.unsettledWarning(out.report, { nowMs: Date.parse("2026-09-19T12:00:00Z") }), null);
  const w = MR.unsettledWarning(out.report, { nowMs: Date.parse("2026-09-20T06:00:00Z") });
  assert.match(w, /^::warning title=Resultats non regles::/);
  assert.match(w, /2\/10/);
  assert.match(w, /fixture introuvable x2/);
  // Journee entierement reglee : jamais d'alerte.
  const okOut = MR.buildDayFile({ day: "2026-09-18", predictions: predictions.slice(0, 8), fixtures: fixtures });
  assert.equal(MR.unsettledWarning(okOut.report, { nowMs: Date.parse("2026-09-20T06:00:00Z") }), null);
});

// ---------------------------------------------------------------------------
// 6. results/index.json et lignes match_results
// ---------------------------------------------------------------------------
test("buildIndexFile : jours du plus recent au plus ancien, avec leurs totaux", () => {
  const idx = MR.buildIndexFile([
    { day: "2026-09-17", totals: { settled: 2, won: 1, lost: 1, void: 0, pending: 0 } },
    { day: "2026-09-19", matches: [{ result: "win" }, { result: "loss" }, { result: "void" }] },
    { day: "2026-09-18", totals: { settled: 0, won: 0, lost: 0, void: 0, pending: 3 } },
  ], "2026-09-20T06:00:00.000Z");
  assert.deepEqual(idx.days.map(function (d) { return d.day; }), ["2026-09-19", "2026-09-18", "2026-09-17"]);
  assert.deepEqual(idx.days[0].totals, { settled: 2, won: 1, lost: 1, void: 1, pending: 0 });
  assert.equal(idx.generated_at, "2026-09-20T06:00:00.000Z");
});

test("matchResultRow : ligne complete pour un match termine, refusee pour un match en cours", () => {
  const out = MR.buildDayFile({
    day: "2026-09-19",
    predictions: [prediction({ fixture_id: 11, prediction: "Under 3.5", market: "under-35", cote: "1.54" }), prediction({ fixture_id: 12, prediction: "Over 1.5" })],
    fixtures: [fixture({ id: 11, gh: 1, ga: 1 }), fixture({ id: 12, status: "2H" })],
  });
  const parId = {};
  out.file.matches.forEach(function (m) { parId[m.id] = m; });
  const row = MR.matchResultRow(parId[11], "2026-09-19", "2026-09-19T23:10:00.000Z");
  assert.deepEqual(row, {
    fixture_id: 11, day: "2026-09-19", home: "Nacional", away: "Famalicao",
    league: "Primeira Liga", league_key: "primeira", kickoff: "2026-09-19 21:30",
    score: "1-1", pick: "Under 3.5", market_id: "under-35", cote: 1.54,
    odds_source: "moyenne", result: "win",
    scorer_player: null, scorer_goals: null, scorer_result: null,
    resolved_at: "2026-09-19T23:10:00.000Z",
  });
  assert.equal(MR.matchResultRow(parId[12], "2026-09-19"), null);
});

test("parisDay / ajouterJours : le site raisonne en heure de Paris, le cron en UTC", () => {
  // 2026-09-19 23:30 UTC = 2026-09-20 01:30 a Paris (CEST).
  assert.equal(MR.parisDay(Date.parse("2026-09-19T23:30:00Z")), "2026-09-20");
  assert.equal(MR.parisDay(Date.parse("2026-09-19T21:30:00Z")), "2026-09-19");
  assert.equal(MR.ajouterJours("2026-09-01", -1), "2026-08-31");
  assert.equal(MR.ajouterJours("2026-09-19", 1), "2026-09-20");
});
