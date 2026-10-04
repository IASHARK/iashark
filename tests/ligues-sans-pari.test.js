"use strict";
// CHAMPIONNATS SANS PARI (04/10/2026, etape 0 du plan moteur du 03/10) : Colombie
// (239), Perou (281) et Afrique du Sud (288) n'ont aucune cote collectable. Aucun
// pari publie pour eux (pari_rec vide, no_signal vrai avec une raison, has_signal
// faux), mais les matchs restent affiches avec leurs faits publics.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lib/ligues-sans-pari.js");
const { PREMIUM_FIELDS } = require("../lib/premium-fields.js");
const { kickoffGate, KICKOFF_MARGIN_MINUTES } = require("../lib/kickoff-guard.js");
const CONFIG = require("../config/leagues.json");

const WF = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
const at = (s, depuis) => { const i = WF.indexOf(s, depuis || 0); assert.ok(i !== -1, "introuvable : " + s); return i; };

test("config : exactement Colombie, Perou et Afrique du Sud sont sans pari, et restent affiches", () => {
  assert.deepEqual(L.idsSansPari(CONFIG).slice().sort((a, b) => a - b), [239, 281, 288]);
  const cles = CONFIG.leagues.filter((l) => l.sansPari === true).map((l) => l.key).sort();
  assert.deepEqual(cles, ["colombia_primera_a", "peru_primera", "south_africa_premiership"]);
  assert.equal(CONFIG.leagues.filter((l) => "sansPari" in l).length, 3, "aucun autre championnat touche");
  // Toujours dans la liste de lancement : leurs matchs sont toujours recuperes et affiches.
  for (const id of [239, 281, 288]) assert.ok(CONFIG.leagues.some((l) => l.apiFootballId === id), "toujours affiche : " + id);
});

test("idsSansPari / estSansPari / ligueDuMatch", () => {
  const ids = [239, 281, 288];
  assert.equal(L.estSansPari(239, ids), true);
  assert.equal(L.estSansPari("288", ids), true);
  assert.equal(L.estSansPari(61, ids), false);
  for (const v of [null, undefined, "", "abc"]) assert.equal(L.estSansPari(v, ids), false, String(v));
  assert.equal(L.estSansPari(239, []), false);
  assert.equal(L.estSansPari(239, null), false);
  assert.deepEqual(L.idsSansPari({}), []);
  assert.deepEqual(L.idsSansPari(null), []);
  assert.deepEqual(L.idsSansPari([{ apiFootballId: 1, sansPari: true }, { apiFootballId: 2, sansPari: "oui" }, { sansPari: true }]), [1]);
  assert.equal(L.ligueDuMatch({ id: 1, league_id: 281 }, {}), 281);
  assert.equal(L.ligueDuMatch({ id: 7 }, { 7: { league: { id: 239 } } }), 239, "repli sur la fixture api-football");
  assert.equal(L.ligueDuMatch({ id: 8 }, {}), null);
  assert.equal(L.ligueDuMatch(null, {}), null);
});

function matchAvecPari(extra) {
  return Object.assign({
    id: 900, league_id: 239, league: "Primera A Colombia", home: { n: "Millonarios", id: 1 }, away: { n: "Nacional", id: 2 },
    date: "2026-10-04 23:00", stade: "El Campin", forme5H: "WWDLW", rkH: 3, c1: "2.10", cn: "3.20", c2: "3.40",
    pari_rec: "Victoire Domicile", cote_rec: "2.10", model_probability: 52, market_id: "home-win", marche: "RESULTAT",
    markets_compared: [{ id: "home-win", probability: 52 }], p1: 52, pn: 26, p2: 22, lambda_h: 1.4, lambda_a: 0.9, conf: 5.2,
    kelly: "0.02", edge: "+3.0%", verdict_shark: "Texte.", analyse_card: "Texte.", contexte: "Texte.", top_scorers: [{ id: 1 }],
    no_signal: false, has_signal: true, is_free: true,
  }, extra || {});
}
function lignePremium(extra) {
  return Object.assign({ fixture_id: 900, pari_rec: "Victoire Domicile", cote_rec: 2.1, market_id: "home-win", marche: "RESULTAT", model_probability: 52, verdict_shark: "Texte.", premium_fields: { p1: 52 }, player_markets: [{ id: 1 }], raw_response: { explanation_status: "OK" } }, extra || {});
}

test("fermerSansPari : aucun pari, raison claire, faits publics gardes, lignes premium videes", () => {
  const m = matchAvecPari();
  const r1 = lignePremium(), r2 = lignePremium();
  assert.equal(L.fermerSansPari(m, [r1, r2], PREMIUM_FIELDS), m);
  assert.equal(m.pari_rec, "");
  assert.equal(m.no_signal, true);
  assert.equal(m.has_signal, false);
  assert.equal(m.is_free, false);
  assert.equal(m.no_signal_reason, "LEAGUE_WITHOUT_COLLECTABLE_ODDS");
  assert.equal(m.no_signal_label, "Aucun signal clair sur ce match", "phrase deja traduite par le site");
  for (const k of ["cote_rec", "model_probability", "market_id", "markets_compared", "p1", "lambda_h", "conf", "kelly", "edge", "verdict_shark", "analyse_card", "contexte", "top_scorers"]) {
    assert.ok(!(k in m), "retire : " + k);
  }
  // Faits publics gardes.
  assert.equal(m.forme5H, "WWDLW");
  assert.equal(m.rkH, 3);
  assert.equal(m.c1, "2.10");
  assert.equal(m.stade, "El Campin");
  assert.deepEqual(m.home, { n: "Millonarios", id: 1 });
  assert.equal(m.date, "2026-10-04 23:00");
  assert.equal(m.league_id, 239);
  for (const r of [r1, r2]) {
    assert.equal(r.pari_rec, "");
    assert.equal(r.cote_rec, null);
    assert.equal(r.market_id, null);
    assert.equal(r.model_probability, null);
    assert.equal(r.premium_fields, null);
    assert.equal(r.player_markets, null);
    assert.deepEqual(r.raw_response, { explanation_status: "SKIPPED_LEAGUE_WITHOUT_COLLECTABLE_ODDS" });
  }
  // Une seule ligne, ou aucune : le match est ferme quand meme.
  const r3 = lignePremium();
  assert.equal(L.fermerSansPari(matchAvecPari(), r3, PREMIUM_FIELDS).pari_rec, "");
  assert.equal(r3.pari_rec, "");
  assert.equal(L.fermerSansPari(matchAvecPari(), null, PREMIUM_FIELDS).no_signal_reason, "LEAGUE_WITHOUT_COLLECTABLE_ODDS");
  assert.equal(L.fermerSansPari(null, null, PREMIUM_FIELDS), null);
  // Copie publique (meme regle que matchsPublics dans le pipeline) : has_signal faux.
  assert.equal(!!(m.pari_rec && !m.no_signal), false);
  // Raison distincte de la garde coup d'envoi : l'accueil affiche le match en
  // « aucun signal » (home-list.js), pas en « match ferme ».
  assert.doesNotMatch(L.RAISON, /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/);
});

// --- Branchement dans le pipeline reel -------------------------------------

test("pipeline : chargement de la liste depuis config/leagues.json", () => {
  assert.match(WF, /var LIGUES_SANS_PARI=require\('\.\/lib\/ligues-sans-pari\.js'\);/);
  assert.match(WF, /var IDS_SANS_PARI=LIGUES_SANS_PARI\.idsSansPari\(LEAGUES_CONFIG\);/);
  assert.ok(at("var IDS_SANS_PARI=") > at("const LEAGUES_CONFIG = require('./config/leagues.json');"));
});

test("pipeline, par match : pari force a null apres toute l'echelle de repli, raison, aucun texte d'analyse, fiche d'information", () => {
  const garde = at("var sansPariLigue=LIGUES_SANS_PARI.estSansPari(lg.id,IDS_SANS_PARI);");
  assert.ok(garde > at("var kickoffGateFix=kickoffGate(fix,Date.now()"));
  // Pari : force a null APRES les replis (LOW_ODDS, NO_ODDS), AVANT no_signal et le match publie.
  const forceNull = at("if(sansPariLigue){ pickedMarket=null; pickDowngrade=null; }");
  assert.ok(forceNull > at("var pickedMarket=fairSelection?fairSelection.market:null;"));
  assert.ok(forceNull > at("pickedMarket=pickMarketDeterministic(allMarkets,{});"));
  assert.ok(forceNull > at("pickDowngrade='NO_ODDS';"));
  assert.ok(forceNull < at("var noSignal=!pickedMarket;"));
  assert.ok(forceNull < at("var matchObj={"));
  // Raison : la garde coup d'envoi reste prioritaire si le match a commence.
  const raison = at("if(sansPariLigue) noSignalReason=LIGUES_SANS_PARI.RAISON;");
  assert.ok(raison < at("if(!kickoffGateFix.open) noSignalReason=kickoffGateFix.reason;"));
  // Aucun texte d'analyse redige par l'IA.
  assert.match(WF, /skip_no_pick_league:sansPariLigue,/);
  const gen = WF.slice(at("async function genAnalyse(d)"), at("async function genTraductions("));
  assert.match(gen, /if\(d&&d\.skip_no_pick_league\) return null;/);
  // Match ferme au pari comme une fiche d'information, avant d'entrer dans la liste du run.
  const ferme = at("if(kickoffGateFix.open&&sansPariLigue) LIGUES_SANS_PARI.fermerSansPari(matchObj, premiumRows.length&&premiumRows[premiumRows.length-1].fixture_id===f.id?premiumRows[premiumRows.length-1]:null, PREMIUM_FIELDS_LIB.PREMIUM_FIELDS);");
  assert.ok(ferme > at("var matchObj={") && ferme > at("if(!kickoffGateFix.open) closeMatchForPick(matchObj,"));
  assert.ok(at("matchsData.push(matchObj);", ferme) - ferme < 400, "juste avant matchsData.push(matchObj)");
});

test("pipeline : genAnalyse reel, aucun appel a l'IA pour un championnat sans pari", async () => {
  const debut = at("cat > pipeline.js << 'JSEOF'\n");
  const script = WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => l.startsWith("          ") ? l.slice(10) : l).join("\n");
  const fnSrc = script.slice(script.indexOf("async function genAnalyse(d) {"), script.indexOf("// TRADUCTION DES TEXTES EDITORIAUX"));
  const appels = [];
  const genAnalyse = new Function("ANT_KEY", "postJSONWithRetry", "MOTS_INTERDITS", fnSrc + "\nreturn genAnalyse;")(
    "cle-factice", async () => { appels.push(1); return { content: [{ type: "text", text: "{\"verdict_shark\":\"Texte.\"}" }] }; }, require("../lib/analyse-mots-interdits.js"));
  assert.equal(await genAnalyse({ skip_no_pick_league: true, home: "Millonarios", away: "Nacional" }), null);
  assert.equal(appels.length, 0);
});

test("pipeline : apres le gel, jamais candidat de la selection canonique ; buteurs du jour exclus", () => {
  const filtre = at("RUN_OUTPUT_CANDIDATES=LIGUES_SANS_PARI.sansCandidatsSansPari(RUN_OUTPUT_CANDIDATES,FIXTURE_BY_ID,IDS_SANS_PARI);");
  assert.ok(filtre > at("gel=PICK_FREEZE.freezeAnalysis(m,precedent,{"), "apres le gel");
  assert.ok(filtre < at("var runOutput = runOutputForSnapshot("), "avant la selection canonique (SAFE_PICK, combines)");
  const call = at("ecrireButeursDuJour(allMatchsData,");
  assert.match(WF.slice(call, call + 300), /&&!LIGUES_SANS_PARI\.estSansPari\(LIGUES_SANS_PARI\.ligueDuMatch\(m,FIXTURE_BY_ID\),IDS_SANS_PARI\)/);
});

test("sansCandidatsSansPari : la selection canonique ne voit plus ces matchs", () => {
  const byId = { 1: { league: { id: 239 } }, 2: { league: { id: 61 } }, 3: { league: { id: 288 } } };
  const cands = [{ fixture_id: 1 }, { fixture_id: 2 }, { fixture: { fixture_id: 3 } }, { fixture_id: 4 }, { fixture_id: 5, league_id: 281 }, {}];
  assert.deepEqual(L.sansCandidatsSansPari(cands, byId, [239, 281, 288]), [{ fixture_id: 2 }, { fixture_id: 4 }, {}]);
  assert.deepEqual(L.sansCandidatsSansPari(null, byId, [239]), []);
  assert.deepEqual(L.sansCandidatsSansPari(cands, byId, []).length, cands.length);
});

// Un pari publie AVANT le drapeau n'est jamais retire par cette regle : le gel le
// garde jusqu'au coup d'envoi et il reste dans le bilan (CLAUDE.md). Sans pari
// publie avant, le match reste une fiche d'information.
test("gel : pari publie avant le drapeau garde, sinon fiche d'information", () => {
  const PICK_FREEZE = require("../lib/pick-freeze.js");
  const futur = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const fixture = { fixture: { id: 900, date: futur, timestamp: Date.parse(futur) / 1000, status: { short: "NS" } }, league: { id: 239 } };
  const date = futur.slice(0, 10) + " " + futur.slice(11, 16);
  const frais = () => L.fermerSansPari(matchAvecPari({ date: date }), lignePremium(), PREMIUM_FIELDS);
  assert.equal(kickoffGate(fixture, Date.now(), { marginMinutes: KICKOFF_MARGIN_MINUTES }).open, true);
  // Aucun pari publie avant : rien a figer, le match reste ferme au pari.
  const sansPrecedent = PICK_FREEZE.freezeAnalysis(frais(), null, { nowMs: Date.now(), fixture: fixture, premiumRow: lignePremium({ pari_rec: "" }) });
  assert.equal(sansPrecedent.match.pari_rec, "");
  assert.equal(sansPrecedent.match.no_signal_reason, "LEAGUE_WITHOUT_COLLECTABLE_ODDS");
  const precedentSansPari = PICK_FREEZE.freezeAnalysis(frais(), lignePremium({ pari_rec: "", no_signal: true }), { nowMs: Date.now(), fixture: fixture });
  assert.equal(precedentSansPari.match.pari_rec, "");
  // Pari publie avant le drapeau : garde tel quel (FROZEN).
  const ligneDuRun = lignePremium();
  const fige = L.fermerSansPari(matchAvecPari({ date: date }), ligneDuRun, PREMIUM_FIELDS);
  const publie = PICK_FREEZE.freezeAnalysis(fige, lignePremium({ updated_at: new Date(Date.now() - 3600 * 1000).toISOString() }), { nowMs: Date.now(), fixture: fixture, premiumRow: ligneDuRun });
  assert.equal(publie.status, "FROZEN");
  assert.equal(publie.match.pari_rec, "Victoire Domicile");
  assert.equal(publie.match.no_signal, false);
  // La ligne premium aussi : pas de statut SKIPPED_*, le pari reste dans le bilan.
  assert.equal(publie.premiumRow.pari_rec, "Victoire Domicile");
  assert.doesNotMatch(String(publie.premiumRow.raw_response && publie.premiumRow.raw_response.explanation_status), /^SKIPPED/);
});
