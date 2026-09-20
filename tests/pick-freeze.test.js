"use strict";
// GEL DE L'ANALYSE A SA PREMIERE PUBLICATION (decision du proprietaire du
// 19/09/2026) : lib/pick-freeze.js et son branchement dans le pipeline reel
// (.github/workflows/update-data.yml).
//
// Un abonne Pro qui a vu vendredi le pari retenu d'un match du dimanche doit
// voir EXACTEMENT le meme pari, la meme probabilite, la meme cote et la meme
// analyse samedi, meme si les cotes, les donnees ou la regle de selection ont
// change entre-temps. Seuls les faits publics (forme, classement, blessures,
// compositions, cotes brutes) continuent de vivre.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const F = require("../lib/pick-freeze.js");
const PREMIUM = require("../lib/premium-fields.js");
const { buildMatchViewModel } = require("../lib/match-view-model.js");

const H = 3600000;
const RUN = Date.parse("2026-09-19T10:15:00Z"); // run de samedi
const KICKOFF = "2026-09-20T19:00:00+00:00"; // dimanche 21:00 a Paris
const clone = (v) => JSON.parse(JSON.stringify(v));

function apiFixture(id, iso, status) {
  return { fixture: { id: id, date: iso, timestamp: Math.floor(Date.parse(iso) / 1000), status: { short: status || "NS" } } };
}

// Match complet tel que le pipeline le construit (matchObj), avant retrait des
// champs premium. `v` distingue deux calculs differents du meme match.
function computed(v, extra) {
  const a = v === "vendredi";
  return Object.assign({
    id: 1001, sport: "football", league: "Ligue 1", league_id: 61, league_key: "ligue1",
    home: { n: "Lyon", id: 80 }, away: { n: "Nantes", id: 83 },
    date: "2026-09-20 21:00", status: "NS",
    model_output_available: true, data_quality_score: a ? 85 : 70, data_quality_label: a ? "Élevée" : "Moyenne",
    market_source: a ? "Pinnacle (sharp)" : "Cotes moyennes multi-bookmakers",
    // --- premium : analyse ---
    pari_rec: a ? "Over 2.5" : "Victoire Domicile", cote_rec: a ? "1.85" : "1.62",
    model_probability: a ? 57.4 : 64.1, market_id: a ? "over-25" : "home-win", marche: a ? "TOTAL_BUTS" : "RESULTAT",
    markets_compared: a
      ? [{ id: "over-25", market: "Over 2.5", probability: 57.4, consensus: 52.1, edge: 5.3 }, { id: "home-win", market: "Victoire Domicile", probability: 55, consensus: 56.2, edge: -1.2 }, { id: "btts-yes", market: "BTTS Oui", probability: 54, consensus: 53, edge: 1 }]
      : [{ id: "home-win", market: "Victoire Domicile", probability: 64.1, consensus: 60.2, edge: 3.9 }, { id: "over-25", market: "Over 2.5", probability: 50.2, consensus: 51, edge: -0.8 }],
    conf: a ? 5.7 : 6.4, p1: a ? 48 : 52, pn: a ? 27 : 25, p2: a ? 25 : 23, po15: 0, po25: a ? 61 : 55, btts: a ? 58 : 51,
    lambda_h: a ? 1.7 : 1.5, lambda_a: a ? 1.2 : 0.9,
    market_aware_p1: 50, market_aware_pN: 26, market_aware_p2: 24,
    market_consensus_p1: a ? 49 : 58, market_consensus_pN: 27, market_consensus_p2: a ? 24 : 15,
    mc_scores: a ? [{ score: "2-1", pct: 11 }, { score: "2-2", pct: 7 }] : [{ score: "1-0", pct: 13 }, { score: "2-0", pct: 10 }],
    scores: [a ? "2-1" : "1-0"], simulation_count: 10000,
    paris_safe: { bet: a ? "Over 2.5" : "Victoire Domicile", cote: a ? 1.85 : 1.62, proba: a ? "57%" : "64%" },
    paris_risque: { bet: "", cote: "", proba: "" }, vbet: "OUI", val: true, hot: a, risque: a ? "MODERE" : "FAIBLE", mise: "2-3% bankroll",
    pick_downgrade: "", odds_available: true,
    reliability: { label: a ? "Élevée" : "Moyenne", model_agreement: "Fort", data_quality: a ? "Élevée" : "Moyenne", sample_size: 5, sample_size_label: "Limitée", historical_calibration: "NOT_AVAILABLE_YET" },
    model_agreement: a ? "Fort" : "Moyen", crit_home: { att: 60, def: 55 }, crit_away: { att: 50, def: 48 }, elo_signal: a ? "Lyon favori" : "Lyon net favori",
    analyse_card: a ? "Lyon marque 2,1 buts par match a domicile." : "Nantes n'a pas gagne a l'exterieur.",
    analyse_card_i18n: { en: a ? "Lyon score 2.1 goals per home game." : "Nantes have not won away." },
    conseil_public: a ? "Les deux defenses concedent." : "Lyon domine.", contexte: a ? "Lyon 4e." : "Lyon 3e.",
    scenario: { phase1: a ? "Debut ouvert." : "Debut ferme.", phase2: "", phase3: "" }, scenario_15min: null,
    decision_factors: [a ? "Over 2.5 : 7 des 10 derniers matchs de Lyon" : "Lyon invaincu a domicile"],
    risk_principal: a ? null : "Nantes sans son gardien titulaire",
    top_scorers: [{ player_id: a ? 11 : 12, name: a ? "A. Lacazette" : "R. Cherki", analyse: "En forme." }],
    // --- public : faits ---
    c1: a ? "1.95" : "1.62", cn: "3.60", c2: a ? "3.90" : "5.20", co25: a ? "1.85" : "1.95", cu25: a ? "1.95" : "1.85", cbtts: "1.80", cbtts_non: "1.95",
    form_home: [{ result: a ? "W" : "L", score: "2-1", opponent: "Nice", home: true, d: "2026-09-13" }],
    classement: { home: { rank: a ? 4 : 3 }, away: { rank: 12 } },
    injuries: a ? [] : [{ name: "A. Lafont", team: 83, reason: "Blessure", status: "out" }],
    lineups: null, pinnacle_snapshot: { c1: a ? 1.95 : 1.62, cn: 3.6, c2: 3.9, date: a ? "2026-09-18" : "2026-09-19" },
    no_signal: false, no_signal_label: "", pipeline_sha: a ? "sha-vendredi" : "sha-samedi",
  }, extra || {});
}

// Ligne premium construite par le pipeline pour ce match (premiumRows.push).
function premiumRowOf(m, extra) {
  return Object.assign({
    fixture_id: m.id, kelly: m.pari_rec === "Over 2.5" ? "0.031" : "0.044", edge: m.pari_rec === "Over 2.5" ? "+5.3%" : "+3.9%",
    pari_rec: m.pari_rec, cote_rec: m.cote_rec === "" ? null : Number(m.cote_rec), market_id: m.market_id, marche: m.marche,
    model_probability: m.model_probability, markets_compared: m.markets_compared,
    verdict_shark: m.pari_rec === "Over 2.5" ? "Match ouvert attendu." : "Lyon au-dessus.",
    facteur_x: m.pari_rec === "Over 2.5" ? "7 des 10 derniers matchs de Lyon > 2,5 buts." : "Nantes 0 victoire a l'exterieur.",
    dropping_odds: m.pari_rec === "Over 2.5" ? null : [{ team: "Lyon", pct: 17 }],
    player_markets: m.pari_rec === "Over 2.5" ? null : [{ player_id: 9 }],
    raw_response: { verdict_shark: "brut", explanation_status: "OK", narrative_i18n: { facteur_x_i18n: { en: m.pari_rec === "Over 2.5" ? "7 of Lyon's last 10 > 2.5 goals." : "Nantes 0 away wins." } } },
    pipeline_sha: m.pipeline_sha,
  }, extra || {});
}

// Ligne match_premium_data relue au run suivant : ce que writePremiumData a
// ecrit (premium_fields = premiumPayload du match), plus updated_at.
function storedRow(match, row, updatedAt) {
  return clone(Object.assign({}, row, { premium_fields: PREMIUM.premiumPayload(match), updated_at: updatedAt }));
}

// Ce que la fonction match-data sert a un abonne Pro (copie litterale de sa
// fusion : match public assaini + colonnes + premium_fields + narrative_i18n).
function proView(match, row) {
  const pub = PREMIUM.stripPremium(Object.assign({}, match, { is_free: false }));
  const etendus = row.premium_fields || (row.raw_response && row.raw_response.premium_fields) || null;
  const enrichi = Object.assign({}, pub);
  if (etendus) PREMIUM.PREMIUM_FIELDS.forEach(function (f) { if (f in etendus) enrichi[f] = etendus[f]; });
  if (enrichi.conf == null && row.model_probability != null) enrichi.conf = Math.round(Number(row.model_probability)) / 10;
  const raw = row.raw_response || {};
  const ni = raw.narrative_i18n || {};
  return Object.assign(enrichi, {
    kelly: row.kelly ?? null, edge: row.edge ?? null, verdict_shark: row.verdict_shark ?? null, facteur_x: row.facteur_x ?? null,
    facteur_x_i18n: ni.facteur_x_i18n ?? null, verdict_shark_i18n: ni.verdict_shark_i18n ?? null,
    dropping_odds: row.dropping_odds ?? null, player_markets: row.player_markets ?? null,
    pari_rec: row.pari_rec ?? pub.pari_rec ?? null, cote_rec: row.cote_rec ?? pub.cote_rec ?? null,
    model_probability: row.model_probability ?? pub.model_probability ?? null, markets_compared: row.markets_compared ?? pub.markets_compared ?? null,
    market_id: row.market_id ?? pub.market_id ?? null, marche: row.marche ?? pub.marche ?? null,
  });
}

// Scenario complet : publication vendredi (premiere publication), relue samedi.
function publishedFriday() {
  const fri = computed("vendredi");
  const first = F.freezeAnalysis(fri, null, { nowMs: RUN - 24 * H, fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(fri) });
  assert.equal(first.status, "FIRST_PUBLICATION");
  return { match: first.match, row: storedRow(first.match, first.premiumRow, "2026-09-18T10:20:00+00:00") };
}

// ---------------------------------------------------------------------------
// Classement des champs : chaque champ premium est soit fige, soit vivant.
// ---------------------------------------------------------------------------

test("chaque champ premium est classe : fige (analyse du pari) ou vivant (flux), jamais les deux, jamais oublie", () => {
  const figes = F.PICK_COLUMNS.concat(F.PREMIUM_ONLY_COLUMNS, F.FROZEN_PAYLOAD_FIELDS, PREMIUM.PREMIUM_NARRATIVE_I18N_FIELDS);
  PREMIUM.PREMIUM_FIELDS.forEach(function (k) {
    const f = figes.indexOf(k) !== -1, v = F.LIVE_PREMIUM_FIELDS.indexOf(k) !== -1;
    assert.ok(f !== v, k + " doit etre soit fige soit vivant (lib/pick-freeze.js) : " + (f ? "les deux" : "aucun"));
  });
  assert.deepEqual(F.LIVE_PREMIUM_FIELDS.slice().sort(), ["dropping_odds", "player_markets", "top_scorers"]);
  // Le pari et tout ce qui le decrit sur la page match sont figes.
  ["pari_rec", "cote_rec", "model_probability", "market_id", "marche", "markets_compared", "conf", "reliability", "model_agreement",
    "risque", "pick_downgrade", "odds_available", "paris_safe", "analyse_card", "conseil_public", "contexte", "scenario",
    "decision_factors", "risk_principal", "analyse_card_i18n", "mc_scores", "p1", "pn", "p2", "lambda_h", "lambda_a", "is_canonical_pick"]
    .forEach(function (k) { assert.ok(F.FROZEN_MATCH_FIELDS.indexOf(k) !== -1, k + " fige sur le match"); });
  ["kelly", "edge", "verdict_shark", "facteur_x"].forEach(function (k) { assert.ok(F.PREMIUM_ONLY_COLUMNS.indexOf(k) !== -1); });
  // Amorces publiques de l'analyse : jamais des champs premium.
  F.FROZEN_PUBLIC_FIELDS.forEach(function (k) { assert.equal(PREMIUM.PREMIUM_FIELDS.indexOf(k), -1, k); });
  // La lecture Supabase ramene tout ce qu'il faut pour figer.
  F.PICK_COLUMNS.concat(F.PREMIUM_ONLY_COLUMNS, ["premium_fields", "raw_response", "updated_at", "pipeline_sha"])
    .forEach(function (k) { assert.ok(F.PREMIUM_ROW_SELECT.split(",").indexOf(k) !== -1, k); });
});

test("pari retenu = pari_rec non vide hors « aucun signal » (un pari publie sans cote compte)", () => {
  assert.equal(F.hasRetainedMarket({ pari_rec: "Over 2.5", cote_rec: 1.85 }), true);
  assert.equal(F.hasRetainedMarket({ pari_rec: "DC 1X", cote_rec: null }), true, "repli NO_ODDS publie : fige aussi");
  assert.equal(F.hasRetainedMarket({ pari_rec: "", cote_rec: null }), false);
  assert.equal(F.hasRetainedMarket({ pari_rec: "Over 2.5", no_signal: true }), false);
  assert.equal(F.hasRetainedMarket(null), false);
});

// ---------------------------------------------------------------------------
// FROZEN : l'analyse deja publiee est reprise a l'identique.
// ---------------------------------------------------------------------------

test("analyse deja publiee : samedi l'abonne voit EXACTEMENT le pari, la probabilite, la cote et l'analyse de vendredi", () => {
  const fri = publishedFriday();
  const sat = computed("samedi");
  const satRow = premiumRowOf(sat);
  const avant = clone({ sat, satRow, prev: fri.row });
  const res = F.freezeAnalysis(sat, fri.row, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: satRow });
  assert.deepEqual({ sat, satRow, prev: fri.row }, avant, "entrees jamais modifiees");
  assert.equal(res.status, "FROZEN");
  const m = res.match;
  // Pari, cote, probabilite et tout ce que l'analyse en dit : ceux de vendredi.
  F.FROZEN_MATCH_FIELDS.forEach(function (k) {
    if (k === "is_canonical_pick" || k === "scenario_15min") return;
    assert.deepEqual(m[k], fri.match[k], k);
  });
  assert.equal(m.cote_rec, "1.85");
  assert.equal(m.pick_frozen_at, fri.match.pick_frozen_at, "horodatage de premiere publication conserve");
  assert.equal(m.pick_frozen_at, new Date(RUN - 24 * H).toISOString());
  assert.equal(m.no_signal, false);
  // Amorces publiques de l'analyse publiee.
  assert.equal(m.data_quality_score, 85);
  assert.equal(m.market_source, "Pinnacle (sharp)");
  // Faits publics et flux vivants : ceux de samedi.
  assert.deepEqual(m.injuries, sat.injuries);
  assert.deepEqual(m.classement, sat.classement);
  assert.equal(m.c1, "1.62");
  assert.deepEqual(m.form_home, sat.form_home);
  assert.deepEqual(m.top_scorers, sat.top_scorers, "buteurs probables : suivent les absences");
  assert.equal(m.pipeline_sha, "sha-samedi");
  // Ligne premium : colonnes, textes et traductions de vendredi ; flux de samedi.
  const r = res.premiumRow;
  ["pari_rec", "model_probability", "markets_compared", "market_id", "marche", "kelly", "edge", "verdict_shark", "facteur_x"]
    .forEach(function (k) { assert.deepEqual(r[k], fri.row[k], k); });
  assert.equal(r.cote_rec, 1.85);
  assert.deepEqual(r.raw_response.narrative_i18n, fri.row.raw_response.narrative_i18n);
  assert.equal(r.raw_response.premium_fields, undefined, "premium_fields recalcule depuis le match fige");
  assert.equal(r.raw_response.pick_freeze.frozen_at, fri.match.pick_frozen_at);
  assert.deepEqual(r.dropping_odds, satRow.dropping_odds);
  assert.deepEqual(r.player_markets, satRow.player_markets);
  assert.equal(r.pipeline_sha, "sha-vendredi", "SHA qui a produit l'analyse");
});

test("page match d'un abonne Pro : pari, cote, probabilite, ecart, comparatif, fiabilite, risque et textes identiques a vendredi", () => {
  const fri = publishedFriday();
  const sat = computed("samedi");
  const res = F.freezeAnalysis(sat, fri.row, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(sat) });
  const satRow = storedRow(res.match, res.premiumRow, "2026-09-19T10:20:00+00:00");
  const vmFri = buildMatchViewModel(proView(fri.match, fri.row));
  const vmSat = buildMatchViewModel(proView(res.match, satRow));
  assert.ok(vmFri.model.recommendation, "vendredi : pari affiche");
  ["recommendation", "recommendedFamily", "recommendedOdds", "recommendedImplied", "recommendedEdge", "reliabilityInfo",
    "probabilities", "expectedGoals", "scores", "iasharkScore", "value", "marketsCompared", "quality", "simulationCount"]
    .forEach(function (k) { assert.deepEqual(vmSat.model[k], vmFri.model[k], "model." + k); });
  // model.sources se deduit des faits publics (liste des blessures) : il suit
  // les donnees du jour, comme la liste des blessures elle-meme.
  assert.ok(vmSat.model.sources.indexOf("Blessures et suspensions") !== -1);
  const recFri = vmFri.model.marketTable.find(function (r) { return r.recommended; });
  const recSat = vmSat.model.marketTable.find(function (r) { return r.recommended; });
  assert.deepEqual(recSat, recFri, "ligne du pari conseille dans « Probabilites et cotes »");
  ["reading", "decisiveFactor", "decisiveFactorI18n", "reasons", "risk", "riskCode", "scenario"]
    .forEach(function (k) { assert.deepEqual(vmSat.editorial[k], vmFri.editorial[k], "editorial." + k); });
  // Le recalcul de samedi aurait change le pari : c'est bien le gel qui le garde.
  const vmRecalcul = buildMatchViewModel(proView(sat, storedRow(sat, premiumRowOf(sat), "x")));
  assert.notEqual(vmRecalcul.model.recommendation.market, vmFri.model.recommendation.market);
});

test("gel stable run apres run : meme pari, meme horodatage, jusqu'au coup d'envoi", () => {
  const fri = publishedFriday();
  let prev = fri.row, publie = fri.match;
  ["2026-09-19T10:15:00Z", "2026-09-20T10:15:00Z"].forEach(function (iso, i) {
    const fresh = computed("samedi", { cote_rec: i ? "1.55" : "1.62", model_probability: i ? 66 : 64.1 });
    const res = F.freezeAnalysis(fresh, prev, { nowMs: Date.parse(iso), fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(fresh) });
    assert.equal(res.status, "FROZEN");
    F.PICK_COLUMNS.forEach(function (k) { assert.deepEqual(res.match[k], publie[k], iso + " " + k); });
    assert.equal(res.match.pick_frozen_at, fri.match.pick_frozen_at);
    prev = storedRow(res.match, res.premiumRow, iso);
  });
});

test("ligne ecrite avant le gel (sans metadonnees) : figee, horodatage = derniere ecriture, amorces du data.json precedent", () => {
  const fri = computed("vendredi");
  const row = storedRow(fri, premiumRowOf(fri), "2026-09-18T10:20:00+00:00");
  delete row.premium_fields.conf; // ligne anterieure au 15/09 : conf derivee comme match-data
  const prevPublic = PREMIUM.stripPremium(Object.assign({}, fri));
  const res = F.freezeAnalysis(computed("samedi"), row, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), previousPublic: prevPublic, premiumRow: premiumRowOf(computed("samedi")) });
  assert.equal(res.status, "FROZEN");
  assert.equal(res.match.pari_rec, "Over 2.5");
  assert.equal(res.match.pick_frozen_at, "2026-09-18T10:20:00.000Z");
  assert.equal(res.match.conf, 5.7, "Math.round(model_probability)/10, formule de match-data");
  assert.equal(res.match.data_quality_score, 85);
  assert.equal(res.match.data_quality_label, "Élevée");
  assert.equal(res.premiumRow.raw_response.pick_freeze.kickoff, "2026-09-20 21:00");
  assert.deepEqual(res.premiumRow.raw_response.pick_freeze.public, { model_output_available: true, data_quality_score: 85, data_quality_label: "Élevée", market_source: "Pinnacle (sharp)" });
});

test("migration 0020 absente : premium_fields relu dans raw_response.premium_fields", () => {
  const fri = computed("vendredi");
  const row = storedRow(fri, premiumRowOf(fri), "2026-09-18T10:20:00+00:00");
  row.raw_response.premium_fields = row.premium_fields;
  delete row.premium_fields;
  const res = F.freezeAnalysis(computed("samedi"), row, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(computed("samedi")) });
  assert.equal(res.status, "FROZEN");
  assert.deepEqual(res.match.mc_scores, fri.mc_scores);
  assert.equal(res.match.analyse_card, fri.analyse_card);
  assert.equal(res.premiumRow.raw_response.premium_fields, undefined);
});

test("un champ absent de la publication precedente reste absent (jamais complete par le calcul du jour)", () => {
  const fri = computed("vendredi");
  const row = storedRow(fri, premiumRowOf(fri), "2026-09-18T10:20:00+00:00");
  delete row.premium_fields.risk_principal;
  delete row.premium_fields.is_canonical_pick;
  const res = F.freezeAnalysis(computed("samedi", { is_canonical_pick: true }), row, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF) });
  assert.equal(res.status, "FROZEN");
  assert.equal("risk_principal" in res.match, false);
  assert.equal("is_canonical_pick" in res.match, false);
  assert.equal(res.premiumRow, null, "sans ligne premium fraiche, rien a ecrire");
});

test("pari publie sans cote (repli NO_ODDS) : reste tel quel, sans cote, meme si des cotes arrivent", () => {
  const fri = computed("vendredi", { pari_rec: "DC 1X", cote_rec: "", market_id: "dc-1x", pick_downgrade: "NO_ODDS", odds_available: false, model_probability: 78 });
  const row = storedRow(fri, premiumRowOf(fri), "2026-09-18T10:20:00+00:00");
  assert.equal(row.cote_rec, null);
  const res = F.freezeAnalysis(computed("samedi"), row, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(computed("samedi")) });
  assert.equal(res.status, "FROZEN");
  assert.equal(res.match.pari_rec, "DC 1X");
  assert.equal(res.match.cote_rec, "", "chaine vide comme le pipeline, jamais \"null\"");
  assert.equal(res.match.odds_available, false);
  assert.equal(res.match.pick_downgrade, "NO_ODDS");
  assert.equal(res.premiumRow.cote_rec, null);
});

// ---------------------------------------------------------------------------
// Premiere publication, etat inconnu, garde coup d'envoi.
// ---------------------------------------------------------------------------

test("premiere publication : calcul du jour publie, horodate, metadonnees pour les runs suivants", () => {
  const sat = computed("samedi");
  const row = premiumRowOf(sat);
  const res = F.freezeAnalysis(sat, null, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: row });
  assert.equal(res.status, "FIRST_PUBLICATION");
  assert.equal(res.reason, "NO_PREVIOUS");
  assert.equal(res.match.pari_rec, "Victoire Domicile");
  assert.equal(res.match.pick_frozen_at, new Date(RUN).toISOString());
  assert.deepEqual(res.premiumRow.raw_response.pick_freeze, {
    frozen_at: new Date(RUN).toISOString(), kickoff: "2026-09-20 21:00",
    public: { model_output_available: true, data_quality_score: 70, data_quality_label: "Moyenne", market_source: "Cotes moyennes multi-bookmakers" },
  });
  assert.equal(res.premiumRow.raw_response.explanation_status, "OK", "reponse brute du jour conservee");
  assert.equal(res.premiumRow.pari_rec, "Victoire Domicile");
  assert.equal(row.raw_response.pick_freeze, undefined, "ligne d'entree intacte");
});

test("publication precedente sans pari (aucun signal, donnees insuffisantes, match ferme) : premiere publication du jour", () => {
  const sat = computed("samedi");
  [{ fixture_id: 1001, pari_rec: "", cote_rec: null, raw_response: { explanation_status: "OK" } },
    { fixture_id: 1001, pari_rec: "", cote_rec: null, raw_response: { explanation_status: "SKIPPED_KICKOFF_PASSED" } },
    { fixture_id: 1001, pari_rec: null }].forEach(function (prev) {
    const res = F.freezeAnalysis(sat, prev, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(sat) });
    assert.equal(res.status, "FIRST_PUBLICATION");
    assert.equal(res.reason, "PREVIOUS_WITHOUT_PICK");
    assert.equal(res.match.pari_rec, "Victoire Domicile");
  });
});

test("aucun pari aujourd'hui non plus : rien a figer, aucun horodatage", () => {
  const sat = computed("samedi", { pari_rec: "", cote_rec: "", no_signal: true, pick_frozen_at: "2026-09-18T10:00:00.000Z" });
  const res = F.freezeAnalysis(sat, null, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: premiumRowOf(sat) });
  assert.equal(res.status, "NOT_FREEZABLE");
  assert.equal("pick_frozen_at" in res.match, false);
  assert.equal(res.premiumRow.raw_response.pick_freeze, undefined);
});

test("lecture Supabase en echec (precedent undefined) : calcul normal, sans horodatage", () => {
  const sat = computed("samedi");
  const row = premiumRowOf(sat);
  const res = F.freezeAnalysis(sat, undefined, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF), premiumRow: row });
  assert.equal(res.status, "PREVIOUS_UNKNOWN");
  assert.equal(res.reason, "READ_FAILED");
  assert.deepEqual(res.match, sat);
  assert.deepEqual(res.premiumRow, row);
  assert.equal(res.match.pick_frozen_at, undefined);
});

test("ligne d'un autre match : jamais figee sur celui-ci", () => {
  const fri = publishedFriday();
  const res = F.freezeAnalysis(computed("samedi", { id: 2002 }), fri.row, { nowMs: RUN, fixture: apiFixture(2002, KICKOFF) });
  assert.equal(res.status, "PREVIOUS_UNKNOWN");
  assert.equal(res.reason, "FIXTURE_MISMATCH");
  assert.equal(res.match.pari_rec, "Victoire Domicile");
});

test("match commence/joue avec analyse publiee : restauree figee (FROZEN_CLOSED), jamais effacee (20/09/2026)", () => {
  const fri = publishedFriday();
  const ferme = computed("samedi", { pari_rec: "", cote_rec: "", no_signal: true, no_signal_reason: "KICKOFF_PASSED" });
  const cas = [
    [apiFixture(1001, KICKOFF, "1H"), "FIXTURE_NOT_UPCOMING"],
    [apiFixture(1001, KICKOFF, "FT"), "FIXTURE_NOT_UPCOMING"],
    [apiFixture(1001, new Date(RUN - 5 * 60000).toISOString()), "KICKOFF_PASSED"],
    [apiFixture(1001, new Date(RUN + 10 * 60000).toISOString()), "KICKOFF_IMMINENT"],
  ];
  cas.forEach(function (c) {
    const res = F.freezeAnalysis(ferme, fri.row, { nowMs: RUN, fixture: c[0], premiumRow: premiumRowOf(ferme) });
    assert.equal(res.status, "FROZEN_CLOSED", c[1]);
    assert.equal(res.reason, c[1]);
    assert.equal(res.match.pari_rec, "Over 2.5", "l'analyse publiee vendredi reste servie");
    assert.equal(res.match.no_signal, false);
    assert.equal(res.match.pick_closed, true, "marque ferme : plus jamais offert ni candidat");
    assert.equal(res.match.is_free, false);
    assert.equal(res.premiumRow.pari_rec, "Over 2.5", "la ligne premium videe est restauree, jamais ecrasee");
  });
});

test("garde fermee sans restauration : reporte, annule, fixture inconnue, ou aucun pari publie avant", () => {
  const fri = publishedFriday();
  const ferme = computed("samedi", { pari_rec: "", cote_rec: "", no_signal: true, no_signal_reason: "KICKOFF_PASSED" });
  // Reporte / annule / fixture inconnue : les bookmakers annulent ces paris.
  const cas = [
    [apiFixture(1001, KICKOFF, "PST"), "FIXTURE_NOT_UPCOMING"],
    [apiFixture(1001, KICKOFF, "CANC"), "FIXTURE_NOT_UPCOMING"],
    [undefined, "FIXTURE_NOT_UPCOMING"],
  ];
  cas.forEach(function (c) {
    const res = F.freezeAnalysis(ferme, fri.row, { nowMs: RUN, fixture: c[0] });
    assert.equal(res.status, "KICKOFF_CLOSED");
    assert.equal(res.reason, c[1]);
    assert.equal(res.match, ferme, "match ferme rendu tel quel");
    assert.equal(res.match.pari_rec, "");
  });
  // Match commence mais aucune publication precedente avec pari : rien a restaurer.
  [null, { fixture_id: 1001, pari_rec: "", cote_rec: null }].forEach(function (prev) {
    const res = F.freezeAnalysis(ferme, prev, { nowMs: RUN, fixture: apiFixture(1001, KICKOFF, "1H") });
    assert.equal(res.status, "KICKOFF_CLOSED");
    assert.equal(res.match.pari_rec, "");
  });
});

test("coup d'envoi deplace : moins de 24 h, reste fige ; plus de 24 h (reprogramme), nouvelle premiere publication", () => {
  const fri = publishedFriday();
  const opts = function (iso) { return { nowMs: RUN, fixture: apiFixture(1001, iso), premiumRow: premiumRowOf(computed("samedi")) }; };
  // Horaire TV decale de 3 h.
  const tv = F.freezeAnalysis(computed("samedi", { date: "2026-09-20 18:00" }), fri.row, opts("2026-09-20T16:00:00+00:00"));
  assert.equal(tv.status, "FROZEN");
  assert.equal(tv.match.pari_rec, "Over 2.5");
  assert.equal(tv.match.date, "2026-09-20 18:00", "le nouvel horaire est affiche");
  // Reporte au mercredi.
  const report = F.freezeAnalysis(computed("samedi", { date: "2026-09-23 21:00" }), fri.row, opts("2026-09-23T19:00:00+00:00"));
  assert.equal(report.status, "FIRST_PUBLICATION");
  assert.equal(report.reason, "KICKOFF_MOVED");
  assert.equal(report.match.pari_rec, "Victoire Domicile");
  assert.equal(report.match.pick_frozen_at, new Date(RUN).toISOString());
  assert.equal(report.premiumRow.raw_response.pick_freeze.kickoff, "2026-09-23 21:00");
  // Ligne sans metadonnees : reference = date du data.json precedent.
  const legacy = storedRow(computed("vendredi"), premiumRowOf(computed("vendredi")), "2026-09-18T10:20:00+00:00");
  const r2 = F.freezeAnalysis(computed("samedi", { date: "2026-09-27 21:00" }), legacy, Object.assign(opts("2026-09-27T19:00:00+00:00"), { previousPublic: { id: 1001, date: "2026-09-20 21:00" } }));
  assert.equal(r2.reason, "KICKOFF_MOVED");
  assert.equal(F.kickoffShiftHours("2026-09-20 21:00", "2026-09-21 21:00"), 24);
  assert.equal(F.kickoffShiftHours(null, "2026-09-21 21:00"), null);
});

// ---------------------------------------------------------------------------
// Match offert du jour.
// ---------------------------------------------------------------------------

test("match offert : la designation d'un jour faite par un run precedent est gardee tant qu'elle peut etre servie", () => {
  const today = "2026-09-19";
  const iso = function (d, h) { return d + "T" + h + ":00+00:00"; };
  const fx = {
    1: apiFixture(1, iso("2026-09-19", "18:00")), // aujourd'hui 20:00 Paris
    2: apiFixture(2, iso("2026-09-20", "13:00")), // demain
    3: apiFixture(3, iso("2026-09-19", "19:00")),
  };
  const cur = [
    { id: 1, date: "2026-09-19 20:00", pari_rec: "Over 2.5", no_signal: false },
    { id: 2, date: "2026-09-20 15:00", pari_rec: "BTTS Oui", no_signal: false },
    { id: 3, date: "2026-09-19 21:00", pari_rec: "DC 1X", no_signal: false },
  ];
  const prev = [
    { id: 1, date: "2026-09-19 20:00", is_free: true },
    { id: 2, date: "2026-09-20 15:00", is_free: true },
    { id: 3, date: "2026-09-19 21:00", is_free: false },
    { id: 9, date: "2026-09-18 20:00", is_free: true }, // veille : ignoree
  ];
  const kept = F.keptFreeDesignations(prev, cur, { today: today, nowMs: RUN, fixturesById: fx });
  assert.deepEqual(Object.keys(kept).sort(), ["2026-09-19", "2026-09-20"]);
  assert.equal(kept["2026-09-19"], cur[0], "l'objet du run (pari fige) est rendu");
  assert.equal(kept["2026-09-20"].id, 2);
  // Ne peut plus etre servi : commence, reporte/annule, imminent, sans pari,
  // deplace a un autre jour, absent du run.
  const nonServi = function (mutFx, mutCur) {
    const f = clone(fx), c = clone(cur);
    if (mutFx) mutFx(f);
    if (mutCur) mutCur(c);
    return F.keptFreeDesignations(prev, c, { today: today, nowMs: RUN, fixturesById: f })["2026-09-19"];
  };
  assert.equal(nonServi(function (f) { f[1].fixture.status.short = "1H"; }), undefined, "commence");
  assert.equal(nonServi(function (f) { f[1].fixture.status.short = "PST"; }), undefined, "reporte");
  assert.equal(nonServi(function (f) { f[1].fixture.status.short = "CANC"; }), undefined, "annule");
  assert.equal(nonServi(function (f) { f[1] = apiFixture(1, new Date(RUN + 10 * 60000).toISOString()); }), undefined, "imminent");
  assert.equal(nonServi(null, function (c) { c[0].pari_rec = ""; c[0].no_signal = true; }), undefined, "sans pari");
  assert.equal(nonServi(null, function (c) { c[0].date = "2026-09-21 20:00"; }), undefined, "deplace a un autre jour");
  assert.equal(nonServi(null, function (c) { c.splice(0, 1); }), undefined, "absent du run");
  assert.equal(nonServi(function (f) { delete f[1]; }), undefined, "fixture inconnue");
  // Encore servable a 30 min du coup d'envoi (marge de la garde, 15 min) :
  // annonce le matin, elle ne bascule pas au run de midi.
  const f30 = clone(fx);
  f30[1] = apiFixture(1, new Date(RUN + 30 * 60000).toISOString());
  assert.equal(F.keptFreeDesignations(prev, cur, { today: today, nowMs: RUN, fixturesById: f30 })["2026-09-19"].id, 1);
  assert.deepEqual(F.keptFreeDesignations([], cur, { today: today, nowMs: RUN, fixturesById: fx }), {});
});

// ---------------------------------------------------------------------------
// Selection canonique et suivi des resultats.
// ---------------------------------------------------------------------------

test("selection canonique : les candidats d'un match fige sont retires (la SAFE_PICK ne remplace jamais un pari fige)", () => {
  const c = [{ fixture_id: 1 }, { fixture_id: 2 }, { fixture: { fixture_id: 1 } }, { fixture: { fixture_id: 3 } }, {}];
  assert.deepEqual(F.withoutFrozenCandidates(c, { 1: true }), [{ fixture_id: 2 }, { fixture: { fixture_id: 3 } }, {}]);
  assert.deepEqual(F.withoutFrozenCandidates(c, {}), c);
  assert.deepEqual(F.withoutFrozenCandidates(null, { 1: true }), []);
});

test("historique : une prediction en attente suit le pari publie (fige), jamais un pari recalcule", () => {
  const publie = { id: 1001, pari_rec: "Over 2.5", cote_rec: "1.85", model_probability: 57.4, conf: 5.7, market_id: "over-25", reliability: { label: "Élevée" }, no_signal: false };
  const p = { fixture_id: 1001, type: "single", result: "scheduled", prediction: "Victoire Domicile", cote: 1.62, model_probability: 64.1, conf: 6.4, conf_bucket: "6-7", market: "home-win", date: "2026-09-18" };
  assert.equal(F.alignPendingPrediction(p, publie), true);
  assert.deepEqual(p, { fixture_id: 1001, type: "single", result: "scheduled", prediction: "Over 2.5", cote: 1.85, model_probability: 57.4, conf: 5.7, conf_bucket: "<6", market: "over-25", reliability: { label: "Élevée" }, date: "2026-09-18" });
  assert.equal(F.alignPendingPrediction(p, publie), false, "deja aligne : rien a faire");
  const masquee = { fixture_id: 1001, type: "single", result: "scheduled", redacted: true, date: "2026-09-18" };
  assert.equal(F.alignPendingPrediction(masquee, publie), true);
  assert.equal(masquee.redacted, undefined);
  assert.equal(masquee.prediction, "Over 2.5");
  const sansCote = { fixture_id: 1001, type: "single", result: "pending", prediction: "DC 1X", cote: null };
  assert.equal(F.alignPendingPrediction(sansCote, Object.assign({}, publie, { pari_rec: "DC 1X", cote_rec: "" })), true);
  assert.equal(sansCote.cote, null);
  // Jamais : prediction reglee, autre match, combine, match sans pari.
  const regle = { fixture_id: 1001, type: "single", result: "win", prediction: "BTTS Oui" };
  assert.equal(F.alignPendingPrediction(regle, publie), false);
  assert.equal(regle.prediction, "BTTS Oui");
  assert.equal(F.alignPendingPrediction({ fixture_id: 7, type: "single", result: "scheduled", prediction: "X" }, publie), false);
  assert.equal(F.alignPendingPrediction({ fixture_id: 1001, type: "combi", result: "scheduled", prediction: "X" }, publie), false);
  assert.equal(F.alignPendingPrediction({ fixture_id: 1001, type: "single", result: "scheduled", prediction: "X" }, { id: 1001, pari_rec: "", no_signal: true }), false);
});

// ---------------------------------------------------------------------------
// Branchement dans le pipeline reel (.github/workflows/update-data.yml).
// ---------------------------------------------------------------------------
const WF = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
const at = function (s) { const i = WF.indexOf(s); assert.ok(i !== -1, "introuvable dans le pipeline : " + s); return i; };

test("pipeline : publications precedentes relues dans match_premium_data avant tout calcul, lecture seule, jamais bloquante", () => {
  assert.match(WF, /var PICK_FREEZE=require\('\.\/lib\/pick-freeze\.js'\);/);
  const debut = at("async function lirePublicationsPrecedentes(ids){");
  const fin = WF.indexOf("async function main(){", debut);
  const fn = WF.slice(debut, fin);
  assert.match(fn, /\/rest\/v1\/match_premium_data\?select='/);
  assert.match(fn, /var colonnes=PICK_FREEZE\.PREMIUM_ROW_SELECT;/);
  assert.match(fn, /rawHttpGetJson\(/);
  assert.doesNotMatch(fn, /upsertJSON|signalerEchecPersistance|method:'(POST|PATCH|DELETE)'/, "lecture seule ; un echec ne fait jamais echouer le job");
  assert.match(fn, /::warning title=Gel des paris::/, "echec de lecture : avertissement visible");
  assert.match(fn, /peuvent changer a ce run/);
  const main = at("async function main(){");
  const lecture = at("var PUBLICATIONS_PRECEDENTES=await lirePublicationsPrecedentes(Object.keys(FIXTURE_BY_ID));");
  assert.ok(lecture > main && lecture > at("var FIXTURE_BY_ID={};") && lecture > at("var prevByFixture={};"));
  assert.ok(lecture < at("for(var fi=0;fi<fixtures.length;fi++){"), "avant la boucle de calcul");
  assert.ok(lecture < WF.indexOf("await writePremiumData(premiumRows);"), "avant toute ecriture");
});

test("pipeline : gel applique apres la garde coup d'envoi et les traductions, AVANT selection canonique, match offert, fichiers publics, persistance et historique", () => {
  const gel = at("gel=PICK_FREEZE.freezeAnalysis(m,precedent,{");
  assert.ok(gel > at("var KICKOFF_CHECK_MS=Date.now();"), "apres le second passage de la garde coup d'envoi");
  assert.ok(gel > at("RUN_OUTPUT_CANDIDATES=filterOpenCandidates(RUN_OUTPUT_CANDIDATES,FIXTURE_BY_ID,KICKOFF_CHECK_MS"));
  assert.ok(gel > at("await translateNarratives("), "apres les traductions (les textes figes gardent les leurs)");
  assert.ok(gel > at("if(API_ERRORS.count>0){"), "apres le FILET");
  [
    "var runOutput = runOutputForSnapshot(",
    "(function designerMatchGratuit(){",
    "ecrireButeursDuJour(allMatchsData,",
    "var matchsPublics=allMatchsData.map(",
    "var charge=PREMIUM_FIELDS_LIB.premiumPayload(",
    "fs.writeFileSync('data.json',JSON.stringify(dataJsonPayload",
    "await writePremiumData(premiumRows);",
    "await writeSnapshots(snapshotRows);",
    "await updateHistorique(allMatchsData);",
    "generateMatchPages(matchsPublics);",
  ].forEach(function (s) { assert.ok(gel < at(s), "gel avant : " + s); });
  const bloc = WF.slice(at("// ===== GEL DE L'ANALYSE A SA PREMIERE PUBLICATION"), at("var RUN_OUTPUT_SNAPSHOT_TIME"));
  // Meme instant que la garde coup d'envoi, precedent inconnu = undefined.
  assert.match(bloc, /nowMs:KICKOFF_CHECK_MS, fixture:FIXTURE_BY_ID\[cleGel\], previousPublic:prevByFixture\[cleGel\]\|\|null/);
  assert.match(bloc, /PUBLICATIONS_PRECEDENTES\.lues\[cleGel\]\?\(PUBLICATIONS_PRECEDENTES\.lignes\[cleGel\]\|\|null\):undefined/);
  // Le match ET sa ligne premium sont remplaces : colonnes, premium_fields et
  // historique partent du meme objet fige.
  assert.match(bloc, /allMatchsData\[iGel\]=gel\.match;/);
  assert.match(bloc, /premiumRows\[ir\]=gel\.premiumRow;/);
  assert.match(bloc, /RUN_OUTPUT_CANDIDATES=PICK_FREEZE\.withoutFrozenCandidates\(RUN_OUTPUT_CANDIDATES,GEL_FIGES\);/);
  assert.match(bloc, /snapshotRows=snapshotRows\.filter\(function\(r\)\{ return !GEL_FIGES\[String\(r&&r\.fixture_id\)\]; \}\);/);
});

test("pipeline : le match offert garde la designation du run precedent (data.json publie) avant tout nouveau choix", () => {
  const debut = at("(function designerMatchGratuit(){");
  const bloc = WF.slice(debut, WF.indexOf("})();", debut));
  const gardes = bloc.indexOf("try{ gardes=PICK_FREEZE.keptFreeDesignations(Object.keys(prevByFixture).map(function(k){ return prevByFixture[k]; }),allMatchsData,{today:TODAY,nowMs:OFFRE_MS,fixturesById:FIXTURE_BY_ID}); }");
  assert.ok(gardes !== -1, "designations precedentes relues");
  assert.ok(gardes < bloc.indexOf("var jours=[];"));
  const garde = bloc.indexOf("if(gardes[j]){ elus[j]=gardes[j]; return; }");
  assert.ok(garde !== -1 && garde < bloc.indexOf("var duJour=allMatchsData.filter("), "designation gardee avant le choix par la valeur");
  assert.match(bloc, /Object\.keys\(gardes\)\.forEach\(function\(j\)\{ if\(j>=TODAY && jours\.indexOf\(j\)===-1\) jours\.push\(j\); \}\);/);
});

test("pipeline : aucune etape du gel ne peut faire echouer le run (lecture, gel, match offert, historique sous try/catch)", () => {
  const lecture = WF.slice(at("async function lirePublicationsPrecedentes(ids){"), at("async function main(){"));
  assert.match(lecture, /try\{\s*var colonnes=PICK_FREEZE\.PREMIUM_ROW_SELECT;[\s\S]*\}catch\(e\)\{\s*\/\/[^\n]*\n\s*out=\{lues:\{\},lignes:\{\},echecs:uniques\.length\};/);
  assert.match(WF, /try\{\s*gel=PICK_FREEZE\.freezeAnalysis\(m,precedent,\{[\s\S]{0,400}\}\);\s*\}catch\(e\)\{/);
  assert.match(WF, /var gardes=\{\};\s*try\{ gardes=PICK_FREEZE\.keptFreeDesignations\(/);
  assert.match(WF, /try\{ if\(alreadyExists&&m\.pari_rec&&PICK_FREEZE\.alignPendingPrediction\(alreadyExists,m\)\) realignees\+\+; \}\s*catch\(e\)\{/);
});

test("pipeline : l'historique (et donc predictions_archive) suit le pari publie avant l'archivage", () => {
  const debut = at("async function updateHistorique(matchsData){");
  const fn = WF.slice(debut, WF.indexOf("var TRANSFER_CACHE_DAYS", debut));
  const aligne = fn.indexOf("if(alreadyExists&&m.pari_rec&&PICK_FREEZE.alignPendingPrediction(alreadyExists,m)) realignees++;");
  assert.ok(aligne !== -1);
  assert.ok(aligne < fn.indexOf("await writePredictionsArchive(histo.predictions);"));
  assert.ok(aligne < fn.indexOf("fs.writeFileSync(histoPath,"));
});
