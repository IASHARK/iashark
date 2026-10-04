"use strict";
// Branchement du moteur IASHARK v3 (lib/moteur-v3.js), interrupteur MOTEUR_V3.
//  - ETEINT (defaut) : la sortie du site est identique a aujourd'hui.
//  - ALLUME : pari, probabilites, fiabilite, « eligible VIP », cote minimum a
//    jouer et voyant de composition viennent d'une sortie conforme au contrat
//    (tests/fixtures/moteur-v3/exemple_sortie.json, CONTRAT_SORTIE.md v1.1),
//    sous les regles du site : garde coup d'envoi, gel du pari, champs premium,
//    historique.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const V3 = require("../lib/moteur-v3.js");
const PREMIUM = require("../lib/premium-fields.js");
const PICK_FREEZE = require("../lib/pick-freeze.js");
const { kickoffGate, closeMatchForPick, KICKOFF_MARGIN_MINUTES } = require("../lib/kickoff-guard.js");
const { resolveMarketWin } = require("../lib/resolvers.js");

const root = path.join(__dirname, "..");
const EXEMPLE_CHEMIN = path.join(__dirname, "fixtures", "moteur-v3", "exemple_sortie.json");
const EXEMPLE = JSON.parse(fs.readFileSync(EXEMPLE_CHEMIN, "utf8"));
const CONFIG = JSON.parse(fs.readFileSync(path.join(root, "config", "moteur-v3.json"), "utf8"));
const NOW = Date.parse("2026-09-27T08:00:00Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

function branchement(env, sortie, nowMs) {
  const contenu = JSON.stringify(sortie || EXEMPLE);
  return V3.creerBranchement({
    env: Object.assign({ MOTEUR_V3: "1", MOTEUR_V3_SORTIE: "sortie/2026-09-27.json" }, env || {}),
    config: CONFIG, nowMs: nowMs == null ? NOW : nowMs, lireFichier: () => contenu,
    // La sortie d'exemple du contrat est un match de Ligue des nations : depuis le
    // 30/09/2026, une selection nationale n'a jamais de pari sur le site
    // (tests/selections-nationales.test.js). Ces anciens tests verifient le reste du
    // branchement sur ces donnees, d'ou cette option (jamais passee par le pipeline).
    selectionsNationalesEligibles: true,
  });
}

// ---------------------------------------------------------------------------
// Petit pipeline : MEME ORDRE que .github/workflows/update-data.yml pour ce qui
// touche au pari (echelle de repli -> [v3] -> garde -> matchObj/ligne premium
// -> [v3] -> garde -> 2e passage garde -> gel -> [v3] -> copie publique).
// Les etapes [v3] ne tournent que si b.actif, comme dans le pipeline.
const FIXTURES = {
  austria: { fixture: { id: 1528898, date: "2026-09-27T16:00:00+00:00", status: { short: "NS" } }, league: { id: 5 }, teams: { home: { id: 775, name: "Austria" }, away: { id: 1111, name: "Kosovo" } } },
  pumas: { fixture: { id: 1550981, date: "2026-09-27T18:00:00+00:00", status: { short: "NS" } }, league: { id: 262 }, teams: { home: { id: 2, name: "U.N.A.M. - Pumas" }, away: { id: 3, name: "Atletico San Luis" } } },
  germany: { fixture: { id: 1528899, date: "2026-09-27T18:45:00+00:00", status: { short: "NS" } }, league: { id: 5 }, teams: { home: { id: 25, name: "Germany" }, away: { id: 26, name: "Greece" } } },
  absent: { fixture: { id: 1528900, date: "2026-09-27T18:45:00+00:00", status: { short: "NS" } }, league: { id: 5 }, teams: { home: { id: 27, name: "Norway" }, away: { id: 28, name: "Portugal" } } },
};
function candidats() {
  return [
    { id: "home-win", market: "Victoire Domicile", cote: "1.57", prob: 61.2, marketProb: 62 },
    { id: "draw", market: "Match nul", cote: "4.00", prob: 22.1, marketProb: 23 },
    { id: "away-win", market: "Victoire Exterieur", cote: "6.20", prob: 16.7, marketProb: 15 },
    { id: "over-25", market: "Over 2.5", cote: "1.95", prob: 51.4, marketProb: 50.2 },
    { id: "over-15", market: "Over 1.5", cote: "1.30", prob: 74.4, marketProb: 75.1 },
    { id: "btts-yes", market: "BTTS Oui", cote: "2.05", prob: 44.2, marketProb: 46 },
    { id: "fh-under-15", market: "Premiere mi-temps moins de 1.5 but", cote: "1.47", prob: 65.5, marketProb: 64.1 },
  ];
}
const ANCIEN_PARI = { id: "fh-under-15", market: "Premiere mi-temps moins de 1.5 but", cote: "1.47", prob: 65.5, marketProb: 64.1, fairProb: 64.1, why: "Premiere periode fermee" };
function categorizeMarket(n) { n = (n || "").toLowerCase(); if (n.includes("over") || n.includes("under")) return "TOTAL_BUTS"; if (n.includes("btts")) return "BTTS"; if (n.includes("dc ") || n.includes("handicap") || n.includes("dnb")) return "DOUBLE_CHANCE"; return "RESULTAT"; }

function simulerRun(b, fx, opts) {
  opts = opts || {};
  const nowMs = opts.nowMs == null ? NOW : opts.nowMs;
  const f = fx.fixture;
  const gate = kickoffGate(fx, nowMs, { marginMinutes: KICKOFF_MARGIN_MINUTES });
  const cands = candidats();
  let pickedMarket = opts.ancienPari === undefined ? clone(ANCIEN_PARI) : opts.ancienPari;
  let pickDowngrade = null;
  if (b && b.actif) {
    const c = b.choisirPourFixture({ fixtureId: f.id, leagueId: fx.league.id, kickoff: f.date, home: fx.teams.home.name, away: fx.teams.away.name, homeId: fx.teams.home.id, awayId: fx.teams.away.id, candidats: cands, ancien: pickedMarket });
    if (c.remplace) { pickedMarket = c.pickedMarket; pickDowngrade = c.downgrade; }
  }
  if (!gate.open) { pickedMarket = null; pickDowngrade = null; }
  const noSignal = !pickedMarket;
  const comparatif = cands.map((m) => ({ id: m.id, market: m.market, probability: m.prob, consensus: m.marketProb, edge: Math.round((m.prob - m.marketProb) * 10) / 10 }))
    .sort((a, b2) => (pickedMarket && b2.id === pickedMarket.id ? 1 : 0) - (pickedMarket && a.id === pickedMarket.id ? 1 : 0));
  const matchObj = {
    id: f.id, sport: "football", league_id: fx.league.id, home: { n: fx.teams.home.name, id: fx.teams.home.id }, away: { n: fx.teams.away.name, id: fx.teams.away.id },
    league: "Ligue", date: "2026-09-27 18:00", status: f.status.short,
    model_probability: pickedMarket ? Math.round(pickedMarket.prob * 10) / 10 : null,
    reliability: { label: "Moyenne" }, conf: pickedMarket ? Math.round(pickedMarket.prob / 10 * 10) / 10 : 5,
    data_quality_score: 72, data_quality_label: "Bonne", model_agreement: "Fort", model_output_available: true,
    lambda_h: 1.31, lambda_a: 0.88, p1: 61.2, pn: 22.1, p2: 16.7, po15: 0, po25: 51.4, btts: 44.2,
    c1: "1.57", cn: "4.00", c2: "6.20",
    marche: pickedMarket ? categorizeMarket(pickedMarket.market) : "RESULTAT", market_id: pickedMarket ? pickedMarket.id : null,
    risque: "MODERE", pari_rec: pickedMarket ? pickedMarket.market : "", markets_compared: comparatif,
    cote_rec: pickedMarket && pickedMarket.cote != null && pickedMarket.cote !== "" ? String(pickedMarket.cote) : "",
    odds_available: !!(pickedMarket && pickedMarket.cote != null && pickedMarket.cote !== ""),
    pick_downgrade: pickDowngrade || "", no_signal: noSignal, no_signal_label: noSignal ? "Aucun signal clair sur ce match" : "",
    decision_factors: [pickedMarket && pickedMarket.why].filter(Boolean),
    mc_scores: [{ n: 591, pct: 12, score: "1-1" }, { n: 483, pct: 10, score: "1-0" }], simulation_count: 5000,
    paris_safe: { bet: pickedMarket ? pickedMarket.market : "", cote: pickedMarket ? parseFloat(pickedMarket.cote) : null, proba: pickedMarket ? Math.round(pickedMarket.prob) + "%" : "" },
    injuries: [], lineups: null, top_scorers: [],
  };
  const premiumRows = [{
    fixture_id: f.id, kelly: "0", edge: "", pari_rec: pickedMarket ? pickedMarket.market : "",
    cote_rec: pickedMarket && pickedMarket.cote != null && pickedMarket.cote !== "" ? Number(pickedMarket.cote) : null,
    market_id: pickedMarket ? pickedMarket.id : null, marche: pickedMarket ? categorizeMarket(pickedMarket.market) : null,
    model_probability: pickedMarket ? Math.round(pickedMarket.prob * 10) / 10 : null, markets_compared: comparatif || null,
    verdict_shark: "", facteur_x: "", dropping_odds: null, player_markets: null, raw_response: { explanation_status: "FAILED" }, pipeline_sha: null,
  }];
  if (b && b.actif) b.completerMatch(matchObj, premiumRows[premiumRows.length - 1], f.id);
  if (!gate.open) closeMatchForPick(matchObj, premiumRows[0], PREMIUM.PREMIUM_FIELDS, gate.reason);
  const allMatchsData = [matchObj];
  // Second passage de la garde (juste avant le gel).
  allMatchsData.forEach((m) => { const g = kickoffGate(fx, nowMs, { marginMinutes: KICKOFF_MARGIN_MINUTES }); if (!g.open) closeMatchForPick(m, premiumRows[0], PREMIUM.PREMIUM_FIELDS, g.reason); });
  const gel = PICK_FREEZE.freezeAnalysis(allMatchsData[0], opts.precedent === undefined ? null : opts.precedent, { nowMs: nowMs, fixture: fx, premiumRow: premiumRows[0], previousPublic: opts.previousPublic || null });
  allMatchsData[0] = gel.match; premiumRows[0] = gel.premiumRow;
  let ids = {};
  if (b && b.actif) ids = b.apresGel(allMatchsData, premiumRows, { closeMatchForPick: closeMatchForPick, premiumFields: PREMIUM.PREMIUM_FIELDS });
  const m = allMatchsData[0];
  const row = premiumRows[0];
  if (row) row.premium_fields = PREMIUM.premiumPayload(m);
  return { match: m, row: row, gel: gel.status, publique: PREMIUM.stripPremium(m), ids: ids };
}

// Ligne match_premium_data telle que relue au run suivant (publication precedente).
function lignePubliee(run) {
  return Object.assign({}, run.row, { premium_fields: PREMIUM.premiumPayload(run.match), updated_at: "2026-09-26T06:10:00+00:00" });
}

// ===========================================================================
// 1. INTERRUPTEUR ETEINT : SORTIE IDENTIQUE
// ===========================================================================

test("eteint par defaut : sans MOTEUR_V3=1, rien n'est lu et tout est inactif", () => {
  let lu = false;
  const lire = () => { lu = true; return JSON.stringify(EXEMPLE); };
  for (const env of [{}, { MOTEUR_V3: "0" }, { MOTEUR_V3: "" }, { MOTEUR_V3: "true" }, { MOTEUR_V3_SORTIE: "x.json" }]) {
    const b = V3.creerBranchement({ env: env, config: CONFIG, lireFichier: lire, nowMs: NOW });
    assert.equal(b.actif, false, JSON.stringify(env));
    assert.deepEqual(b.choisirPourFixture({ fixtureId: 1 }), { remplace: false });
    assert.deepEqual(b.apresGel([{ id: 1 }], [], {}), {});
  }
  assert.equal(lu, false, "la sortie du moteur n'est jamais lue quand l'interrupteur est eteint");
});

test("eteint : chaque cas (normal, gel ancien pari, coup d'envoi passe, repli) donne EXACTEMENT la sortie d'aujourd'hui", () => {
  const eteint = V3.creerBranchement({ env: {}, config: CONFIG });
  const cas = [
    { fx: FIXTURES.austria, opts: {} },
    { fx: FIXTURES.pumas, opts: {} },
    { fx: FIXTURES.germany, opts: { ancienPari: null } },
    { fx: FIXTURES.austria, opts: { nowMs: Date.parse("2026-09-27T16:05:00Z") } },
  ];
  // Gel : publication precedente de l'ancien moteur.
  const premier = simulerRun(null, FIXTURES.austria);
  cas.push({ fx: FIXTURES.austria, opts: { precedent: lignePubliee(premier), previousPublic: premier.publique } });
  for (const c of cas) {
    const aujourdhui = simulerRun(null, c.fx, c.opts);
    const avecBranchementEteint = simulerRun(eteint, c.fx, c.opts);
    // pick_frozen_at depend de l'horloge : identique ici car nowMs est fixe.
    assert.deepEqual(avecBranchementEteint, aujourdhui);
    for (const k of V3.CHAMPS_PREMIUM_V3.concat([V3.CHAMP_PUBLIC_V3])) {
      assert.ok(!(k in aujourdhui.match) && !(k in aujourdhui.publique), k + " absent quand l'interrupteur est eteint");
    }
  }
});

test("eteint : les nouveaux noms de champs premium ne changent rien aux fichiers publics ni au gel (vrais matchs de data.json)", () => {
  const LEGACY = PREMIUM.PREMIUM_FIELDS.filter((k) => V3.CHAMPS_PREMIUM_V3.indexOf(k) === -1);
  const LEGACY_PAYLOAD = PREMIUM.PREMIUM_PAYLOAD_FIELDS.filter((k) => V3.CHAMPS_PREMIUM_V3.indexOf(k) === -1);
  let matchs = [];
  try { matchs = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8")).matchs || []; } catch (e) { matchs = []; }
  if (!matchs.length) matchs = [simulerRun(null, FIXTURES.austria).match];
  for (const m of matchs) {
    const pub = PREMIUM.stripPremium(m);
    // Match offert : public, sauf les champs Pro seulement et, depuis l'audit I8 du
    // 02/10/2026, l'ancienne mise conseillee (mise, kelly, vbet), jamais publiee.
    // 04/10/2026 : + panneau Marches et ses sources (marches_panneau, v3_marches, marches_flux), Pro seulement.
    // + « Qui ouvre le score ? » et premier buteur (premier_but, v3_premiers_buteurs), Pro seulement.
    const RETIRES_OFFERT = ["sim_15min", "stats_iashark", "lecture_match", "marches_panneau", "v3_marches", "marches_flux", "premier_but", "v3_premiers_buteurs", "mise", "kelly", "vbet"];
    const legacy = (m && m.is_free === true) ? (function () { const o = {}; Object.keys(m).forEach((k) => { if (RETIRES_OFFERT.indexOf(k) === -1) o[k] = m[k]; }); return o; })() : (function () { const o = {}; Object.keys(m).forEach((k) => { if (LEGACY.indexOf(k) === -1) o[k] = m[k]; }); if (!("has_signal" in o)) o.has_signal = !!(m.pari_rec && !m.no_signal); return o; })();
    assert.deepEqual(pub, legacy, "stripPremium identique pour " + m.id);
    const payload = PREMIUM.premiumPayload(m);
    const legacyPayload = {}; LEGACY_PAYLOAD.forEach((k) => { if (Object.prototype.hasOwnProperty.call(m, k) && m[k] !== undefined) legacyPayload[k] = m[k]; });
    assert.deepEqual(payload, legacyPayload, "premium_fields identique pour " + m.id);
    assert.deepEqual(PREMIUM.deepPremiumLeaks(pub), [], "aucune nouvelle fuite detectee a tort pour " + m.id);
  }
  // Champs figes/vivants : l'ancien classement est inchange, v3_suivi est vivant.
  assert.deepEqual(PICK_FREEZE.FROZEN_PAYLOAD_FIELDS.filter((k) => V3.CHAMPS_PREMIUM_V3.indexOf(k) === -1), LEGACY_PAYLOAD.filter((k) => ["dropping_odds", "player_markets", "top_scorers", "v3_premiers_buteurs"].indexOf(k) === -1));
  assert.ok(PICK_FREEZE.LIVE_PREMIUM_FIELDS.includes("v3_suivi"));
  assert.equal(PICK_FREEZE.PREMIUM_ROW_SELECT.includes("v3_"), false, "aucune nouvelle colonne relue dans match_premium_data");
});

test("pipeline : chaque appel au moteur v3 est dans un bloc MOTEUR_V3 garde par if(MOTEUR_V3.actif)", () => {
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "update-data.yml"), "utf8");
  assert.equal((wf.match(/var MOTEUR_V3=require\('\.\/lib\/moteur-v3\.js'\)\.creerBranchement\(\{env:process\.env\}\);/g) || []).length, 1);
  const debuts = wf.split("// MOTEUR_V3:DEBUT").length - 1, fins = wf.split("// MOTEUR_V3:FIN").length - 1;
  // 7e bloc (01/10/2026) : chances IASHARK des marches pour le Canal Pro (une seule source).
  // 8e bloc (03/10/2026) : chances du v3 pour le pronostic de chaque match (lib/pronostic.js).
  assert.equal(debuts, 8); assert.equal(fins, 8);
  // Hors blocs, le script du pipeline ne mentionne jamais le moteur v3.
  const script = wf.slice(wf.indexOf("cat > pipeline.js << 'JSEOF'"), wf.indexOf("          JSEOF"));
  const horsBlocs = script.replace(/[ \t]*\/\/ MOTEUR_V3:DEBUT[\s\S]*?\/\/ MOTEUR_V3:FIN\n/g, "");
  assert.doesNotMatch(horsBlocs, /MOTEUR_V3|moteur-v3/);
  // Dans les blocs : seuls creerBranchement, le journal et des appels sous if(MOTEUR_V3.actif).
  const blocs = script.match(/\/\/ MOTEUR_V3:DEBUT[\s\S]*?\/\/ MOTEUR_V3:FIN/g);
  blocs.slice(1).forEach((bloc) => {
    const code = bloc.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").trim();
    assert.match(code, /^if\(MOTEUR_V3\.actif\)/, "bloc non garde : " + code.slice(0, 80));
  });
  // Ordre : pari v3 AVANT la garde coup d'envoi du match ; champs AVANT la garde ;
  // apresGel APRES le gel et AVANT la SAFE_PICK canonique et les fichiers publics.
  const iChoix = script.indexOf("MOTEUR_V3.choisirPourFixture(");
  assert.ok(iChoix > script.indexOf("var fairSelection=pickMarketFair(") && iChoix < script.indexOf("if(!kickoffGateFix.open){ pickedMarket=null; pickDowngrade=null; }"));
  assert.ok(iChoix < script.indexOf("var an=await genAnalyse("), "le texte d'analyse commente le pari v3");
  const iCompl = script.indexOf("MOTEUR_V3.completerMatch(");
  assert.ok(iCompl > script.indexOf("premiumRows.push({") && iCompl < script.indexOf("if(!kickoffGateFix.open) closeMatchForPick("));
  const iApres = script.indexOf("MOTEUR_V3.apresGel(");
  assert.ok(iApres > script.indexOf("gel=PICK_FREEZE.freezeAnalysis(") && iApres < script.indexOf("var runOutput = runOutputForSnapshot(") && iApres < script.indexOf("var matchsPublics="));
  // Variables d'environnement : lues depuis les variables du depot (vides = eteint).
  assert.match(wf, /MOTEUR_V3:\s+\$\{\{ vars\.MOTEUR_V3 \}\}/);
});

// ===========================================================================
// 2. CONTRAT : EXEMPLE CONFORME, CORRESPONDANCES
// ===========================================================================

test("l'exemple respecte le contrat 1.1 ; le controle refuse les sorties fautives", () => {
  assert.deepEqual(V3.validerSortie(EXEMPLE, CONFIG), []);
  const faux = clone(EXEMPLE);
  faux.matchs[0].couverture = "données limitées";
  faux.matchs[0].eligible_vip = true;
  faux.matchs[0].marches[0].eligible_vip = true;
  faux.matchs[1].compositions.voyant = "vert";
  faux.matchs[1].marches[0].probabilite = 1.4;
  faux.contrat_version = "2.0";
  const err = V3.validerSortie(faux, CONFIG);
  assert.ok(err.some((e) => /contrat_version/.test(e)));
  assert.equal(err.filter((e) => /données limitées/.test(e)).length, 4, "VIP interdit en données limitées (le match et ses 3 marches 1N2)");
  assert.ok(err.some((e) => /voyant inconnu/.test(e)));
  assert.ok(err.some((e) => /probabilite hors 0-1/.test(e)));
});

test("sortie absente, illisible, non conforme ou perimee : AUCUN pari publie et une alerte (C1), l'ancien moteur seulement sur demande", () => {
  const sansSortie = V3.creerBranchement({ env: { MOTEUR_V3: "1" }, config: CONFIG });
  assert.equal(sansSortie.actif, true); assert.ok(sansSortie.echec); assert.match(sansSortie.alerte, /Aucun nouveau pari/);
  const illisible = V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: "x" }, config: CONFIG, lireFichier: () => "{pas du json" });
  assert.ok(illisible.echec); assert.match(illisible.raison, /illisible/);
  const perimee = branchement({}, EXEMPLE, Date.parse("2026-09-29T08:00:00Z"));
  assert.ok(perimee.echec); assert.match(perimee.raison, /trop ancienne/);
  const nonConforme = clone(EXEMPLE); delete nonConforme.interrupteur_urgence;
  assert.ok(branchement({}, nonConforme).echec);
  // Tout le run : aucun pari (ni ancien moteur, ni SAFE_PICK canonique), alerte en clair.
  for (const fx of [FIXTURES.austria, FIXTURES.absent]) {
    const r = simulerRun(perimee, fx);
    assert.equal(r.match.pari_rec, ""); assert.equal(r.match.no_signal, true);
    assert.equal(r.match.moteur_v3.source, "aucun pari (moteur v3 indisponible)");
    for (const k of V3.CHAMPS_PREMIUM_V3) assert.equal(r.match[k], undefined, k);
    assert.equal(r.ids[String(fx.fixture.id)], true, "exclu de la SAFE_PICK canonique de l'ancien moteur");
  }
  assert.match(perimee.resume(), /INDISPONIBLE/);
  assert.doesNotMatch(perimee.resume() + perimee.alerte, /Victoire|Over|home-win/);
  // Un pari deja publie (gel) reste affiche jusqu'au coup d'envoi.
  const premier = simulerRun(branchement(), FIXTURES.austria, { nowMs: Date.parse("2026-09-26T06:00:00Z") });
  const fige = simulerRun(branchement({}, EXEMPLE, Date.parse("2026-09-29T08:00:00Z")), FIXTURES.austria, { precedent: lignePubliee(premier), previousPublic: premier.publique });
  assert.equal(fige.gel, "FROZEN"); assert.equal(fige.match.pari_rec, "Victoire Domicile");
  // MOTEUR_V3_REPLI=ancien demande explicitement : l'ancien moteur, avec l'alerte.
  const ancien = branchement({ MOTEUR_V3_REPLI: "ancien" }, nonConforme);
  assert.equal(ancien.actif, false); assert.match(ancien.alerte, /ancien moteur/);
  // Dossier sortie/ : le fichier du jour le plus recent est pris.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moteur-v3-"));
  try {
    const vieux = clone(EXEMPLE); vieux.moteur_version = "vieux";
    fs.writeFileSync(path.join(dir, "2026-09-26.json"), JSON.stringify(vieux));
    fs.writeFileSync(path.join(dir, "2026-09-27.json"), JSON.stringify(EXEMPLE));
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    const b = V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: dir }, config: CONFIG, nowMs: NOW });
    assert.equal(b.actif, true); assert.equal(b.sortie.moteur_version, "3.0.0+exemple");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("cles du contrat -> marches du site : chaque pari traduit est reglable par l'historique", () => {
  const attendus = {
    "1N2:1": "home-win", "1N2:N": "draw", "1N2:2": "away-win", "DC:1N": "dc-1x", "DC:N2": "dc-x2", "DC:12": "dc-12",
    "TOTAL:plus2.5": "over-25", "TOTAL:moins3.5": "under-35", "TOTAL:plus1.5": "over-15", "BTTS:oui": "btts-yes", "BTTS:non": "btts-no",
    "EQUIPE_DOM:plus1.5": "home-team-over-15", "EQUIPE_EXT:moins1.5": "away-team-under-15", "MT_TOTAL:plus0.5": "fh-over-05", "RB:1": "dnb-home", "RB:2": "dnb-away",
  };
  // Score 2-1 (mi-temps 1-0) : resultat attendu de chaque pari.
  const gagne = { "1N2:1": true, "1N2:N": false, "1N2:2": false, "DC:1N": true, "DC:N2": false, "DC:12": true, "TOTAL:plus2.5": true, "TOTAL:moins3.5": true,
    "TOTAL:plus1.5": true, "BTTS:oui": true, "BTTS:non": false, "EQUIPE_DOM:plus1.5": true, "EQUIPE_EXT:moins1.5": true, "MT_TOTAL:plus0.5": true, "RB:1": true, "RB:2": false };
  for (const cle of Object.keys(attendus)) {
    const s = V3.cleVersSite(cle);
    assert.equal(s && s.id, attendus[cle], cle);
    assert.equal(resolveMarketWin(s.market, 2, 1, { halftimeHome: 1, halftimeAway: 0 }), gagne[cle], cle + " -> " + s.market);
  }
  for (const cle of ["SCORE:2-1", "MT_FIN:N/1", "HANDICAP_DOM:-1.5:gagne", "CORNERS:plus9.5", "CARTONS:plus4.5", "PREMIER_BUT:avant30", "BUTEUR:Mbappe", "TOTAL:plus", ""]) {
    assert.equal(V3.cleVersSite(cle), null, cle + " : pas encore de reglement cote site");
  }
});

test("retrouver le match du site : noms football-data, table d'alias, date a un jour pres, ligue", () => {
  const idx = V3.indexerSortie(EXEMPLE);
  assert.equal(V3.trouverMatch(idx, { home: "Austria", away: "Kosovo", kickoff: "2026-09-27T16:00:00Z", leagueId: 5 }, CONFIG).match.match_id, "UNL-2026-09-27-Austria-Kosovo");
  assert.equal(V3.trouverMatch(idx, { home: "U.N.A.M. - Pumas", away: "Atletico San Luis", kickoff: "2026-09-27T18:00:00Z", leagueId: 262 }, CONFIG).match.ligue_code, "MEX");
  // Un match de nuit a Paris : date locale de la veille, tolere.
  assert.ok(V3.trouverMatch(idx, { home: "Austria", away: "Kosovo", kickoff: "2026-09-27T22:30:00Z" }, CONFIG).match);
  assert.equal(V3.trouverMatch(idx, { home: "Austria", away: "Kosovo", kickoff: "2026-09-30T16:00:00Z" }, CONFIG).raison, "MOTEUR_V3_MATCH_INTROUVABLE");
  assert.equal(V3.trouverMatch(idx, { home: "Kosovo", away: "Austria", kickoff: "2026-09-27T16:00:00Z" }, CONFIG).match, null, "domicile/exterieur jamais inverses");
  // Ligue connue et differente : refuse.
  assert.equal(V3.trouverMatch(idx, { home: "Austria", away: "Kosovo", kickoff: "2026-09-27T16:00:00Z", leagueId: 39 }, CONFIG).match, null);
  assert.equal(V3.normaliserEquipe("Atlético  Madrid C.F."), "atletico madrid");
});

// ===========================================================================
// 3. INTERRUPTEUR ALLUME : CHAMPS REMPLIS DEPUIS L'EXEMPLE
// ===========================================================================

test("allume : pari publie par le moteur, probabilites, fiabilite, VIP, cote minimum et voyant compo", () => {
  const b = branchement();
  assert.equal(b.actif, true);
  const r = simulerRun(b, FIXTURES.austria);
  const m = r.match;
  assert.equal(r.gel, "FIRST_PUBLICATION");
  // Le pari : celui publie par le moteur (1N2:1), traduit pour le site.
  assert.equal(m.pari_rec, "Victoire Domicile");
  assert.equal(m.market_id, "home-win");
  assert.equal(m.marche, "RESULTAT");
  assert.equal(m.model_probability, 66.1);
  assert.equal(m.conf, 6.6);
  assert.equal(m.cote_rec, "1.57", "cote du site (bookmakers API-Football), comme partout sur la page");
  assert.equal(m.no_signal, false);
  assert.equal(r.row.pari_rec, "Victoire Domicile");
  assert.equal(r.row.model_probability, 66.1);
  // Probabilites publiees : celles du moteur v3.
  assert.equal(m.p1, 66.12); assert.equal(m.pn, 21.05); assert.equal(m.p2, 12.83);
  assert.equal(m.po15, 74.31); assert.equal(m.po25, 48.79); assert.equal(m.btts, 40.12);
  assert.equal(m.lambda_h, 1.92); assert.equal(m.lambda_a, 0.71);
  // Comparatif : probabilites v3, reference marche du site, pari en tete ; les
  // lignes que le moteur ne chiffre pas (mi-temps) sont retirees.
  assert.equal(m.markets_compared[0].id, "home-win");
  assert.equal(m.markets_compared[0].probability, 66.1);
  assert.equal(m.markets_compared[0].consensus, 62);
  assert.equal(m.markets_compared[0].edge, 4.1);
  assert.ok(!m.markets_compared.some((l) => l.id === "fh-under-15"));
  assert.deepEqual(r.row.markets_compared, m.markets_compared);
  // Scores probables coherents avec le pari (victoire domicile).
  assert.deepEqual(m.mc_scores.map((s) => s.score), ["1-0", "2-0", "2-1"]);
  assert.equal(m.simulation_count, null);
  // Fiabilite et eligible VIP ; le score 0-100 du moteur reste interne (H-016).
  const { plus_sur: plusSur, ...fiab } = m.v3_fiabilite;
  assert.deepEqual(fiab, { niveau: "vérifié sur le passé", methode: "sélections (Elo international)", couverture: "vérifiée" });
  // Selection « la plus sure » du moteur (choix du match des videos), sans cote ni valeur.
  assert.deepEqual(Object.keys(plusSur).sort(), ["cle", "probabilite"]);
  assert.ok(plusSur.probabilite > 0 && plusSur.probabilite <= 100);
  // C4 (avocat du diable, 29/09) : jamais ecrits vers le site.
  for (const k of ["cote_minimum_a_jouer", "eligible_vip", "avantage", "valeur"]) {
    assert.equal(k in m.v3_pari, false, "v3_pari." + k);
    for (const x of m.v3_marches) assert.equal(k in x, false, "v3_marches." + k);
    assert.doesNotMatch(JSON.stringify(r.row.premium_fields), new RegExp('"' + k + '"'), "premium_fields." + k);
  }
  assert.equal(m.v3_pari.formule, "publication");
  assert.equal(m.v3_pari.cle, "1N2:1");
  assert.equal(m.v3_pari.fiabilite_marche, "vérifié sur le passé");
  assert.equal(m.v3_pari.publie_le, "2026-09-26T06:00:00+00:00");
  assert.equal(m.v3_marches.length, 12);
  assert.equal(m.v3_marches.find((x) => x.cle === "CORNERS:plus9.5").market_id, null);
  assert.deepEqual(m.decision_factors.length, 3);
  // Voyant de composition et suivi de cote (vivant).
  assert.equal(m.v3_suivi.voyant, "à surveiller");
  assert.equal(m.v3_suivi.alerte_cote, "cote au-dessus du minimum");
  assert.equal(m.v3_suivi.cote_observee, 1.55);
  assert.equal(m.v3_suivi.probabilite_information, 64.8);
  // Champ public : couverture honnete et voyant, rien du produit payant.
  assert.deepEqual(m.moteur_v3, { version_contrat: "1.1", version_moteur: "3.0.0+exemple", source: "v3", origine_probabilite: "modèle seul", couverture: "vérifiée", fiabilite_niveau: "vérifié sur le passé", compo: { voyant: "à surveiller", mis_a_jour_le: "2026-09-27T05:40:00+00:00" } });
  // Fichiers publics : v3_* retires hors match offert, aucune fuite.
  for (const k of V3.CHAMPS_PREMIUM_V3) assert.equal(r.publique[k], undefined, k);
  assert.deepEqual(r.publique.moteur_v3, m.moteur_v3);
  assert.deepEqual(PREMIUM.deepPremiumLeaks(r.publique), []);
  // premium_fields (Supabase, servi aux Pro par match-data) porte les v3_*.
  for (const k of V3.CHAMPS_PREMIUM_V3) assert.ok(r.row.premium_fields[k], k + " dans premium_fields");
  assert.equal(r.ids["1528898"], true, "match exclu de la SAFE_PICK canonique de l'ancien moteur");
});

test("allume : sans pari publie, la selection « plus_sur » du moteur ; « sure » et « valeur » refusees (C4)", () => {
  const r = simulerRun(branchement(), FIXTURES.pumas);
  assert.equal(r.match.pari_rec, "Over 1.5");
  assert.equal(r.match.market_id, "over-15");
  assert.equal(r.match.model_probability, 78);
  assert.equal(r.match.v3_pari.formule, "plus_sur");
  assert.equal("cote_minimum_a_jouer" in r.match.v3_pari, false);
  assert.equal(r.match.v3_suivi.voyant, "en attente");
  assert.equal(r.match.moteur_v3.couverture, "vérifiée");
  // « sure » et « valeur » ne sont plus des formules acceptees : « plus_sur » reste.
  assert.deepEqual(V3.FORMULES_ACCEPTEES, ["plus_sur"]);
  for (const f of ["valeur", "sure"]) {
    const b2 = branchement({ MOTEUR_V3_FORMULE: f });
    assert.equal(b2.formule, "plus_sur", f);
    assert.equal(simulerRun(b2, FIXTURES.pumas).match.v3_pari.formule, "plus_sur", f);
  }
});

test("allume : pari du moteur sur un marche que le site ne sait pas encore regler -> aucun pari affiche", () => {
  const b = branchement();
  const r = simulerRun(b, FIXTURES.germany);
  assert.equal(r.match.pari_rec, "");
  assert.equal(r.match.no_signal, true);
  assert.equal(r.match.v3_pari, undefined);
  assert.equal(r.match.moteur_v3.raison, "MOTEUR_V3_MARCHE_NON_PRIS_EN_CHARGE");
  assert.match(b.resume(), /MOTEUR_V3_MARCHE_NON_PRIS_EN_CHARGE=1/);
});

test("allume : match absent de la sortie -> aucun pari (defaut, C1) ou ancien moteur (MOTEUR_V3_REPLI=ancien)", () => {
  const ancien = simulerRun(branchement({ MOTEUR_V3_REPLI: "ancien" }), FIXTURES.absent);
  assert.equal(ancien.match.pari_rec, ANCIEN_PARI.market);
  assert.equal(ancien.match.moteur_v3.source, "ancien moteur (repli)");
  assert.equal(ancien.match.v3_pari, undefined);
  assert.deepEqual(ancien.ids, {}, "reste candidat a la SAFE_PICK canonique comme aujourd'hui");
  for (const env of [{}, { MOTEUR_V3_REPLI: "aucun" }, { MOTEUR_V3_REPLI: "n'importe quoi" }]) {
    const aucun = simulerRun(branchement(env), FIXTURES.absent);
    assert.equal(aucun.match.pari_rec, "", JSON.stringify(env));
    assert.equal(aucun.match.no_signal, true);
    assert.equal(aucun.match.moteur_v3.source, "aucun pari (match absent du moteur)");
    assert.equal(aucun.ids["1528900"], true, "jamais de SAFE_PICK canonique de l'ancien moteur non plus");
  }
});

// ===========================================================================
// 4. REGLES DU SITE AU-DESSUS DU MOTEUR : GARDE, GEL, URGENCE, HISTORIQUE, JOURNAUX
// ===========================================================================

test("garde coup d'envoi : match commence -> aucun pari, aucun champ v3 premium, meme allume", () => {
  const r = simulerRun(branchement(), FIXTURES.austria, { nowMs: Date.parse("2026-09-27T15:50:00Z") });
  assert.equal(r.match.pari_rec, "");
  assert.equal(r.match.no_signal_reason, "KICKOFF_IMMINENT");
  for (const k of V3.CHAMPS_PREMIUM_V3) assert.equal(r.match[k], undefined, k);
});

test("gel : un pari publie par l'ancien moteur AVANT le branchement reste affiche jusqu'au coup d'envoi, sans champ v3 qui le contredise", () => {
  const avant = simulerRun(null, FIXTURES.austria, { nowMs: Date.parse("2026-09-26T06:00:00Z") });
  assert.equal(avant.match.pari_rec, ANCIEN_PARI.market);
  const apres = simulerRun(branchement(), FIXTURES.austria, { precedent: lignePubliee(avant), previousPublic: avant.publique });
  assert.equal(apres.gel, "FROZEN");
  assert.equal(apres.match.pari_rec, ANCIEN_PARI.market);
  assert.equal(apres.match.model_probability, 65.5);
  assert.equal(apres.match.p1, 61.2, "probabilites de la publication figee");
  assert.equal(apres.match.v3_pari, undefined);
  assert.equal(apres.match.v3_suivi, undefined, "pas d'alerte de cote sur un autre pari");
  assert.equal(apres.match.moteur_v3.source, "ancien moteur (pari fige avant le branchement)");
  assert.equal(apres.row.pari_rec, ANCIEN_PARI.market);
});

test("gel : un pari publie par le moteur v3 reste fige ; le voyant compo et l'alerte de cote restent vivants", () => {
  const premier = simulerRun(branchement(), FIXTURES.austria, { nowMs: Date.parse("2026-09-26T06:00:00Z") });
  const sortie2 = clone(EXEMPLE);
  sortie2.genere_le = "2026-09-27T07:00:00+00:00";
  const m1 = sortie2.matchs[0];
  m1.compositions.voyant = "compo confirmée";
  m1.marches.find((x) => x.cle === "1N2:1").probabilite = 0.60; // nouvelles donnees du jour
  m1.publication.mises_a_jour.push({ heure: "2026-09-27T06:50:00+00:00", type: "cote", voyant: "compo confirmée", probabilite_information: 0.60, cote_observee: 1.49, alerte: "cote passée sous le minimum" });
  const r = simulerRun(branchement({}, sortie2), FIXTURES.austria, { precedent: lignePubliee(premier), previousPublic: premier.publique });
  assert.equal(r.gel, "FROZEN");
  assert.equal(r.match.pari_rec, "Victoire Domicile");
  assert.equal(r.match.model_probability, 66.1, "probabilite publiee, pas celle du jour");
  assert.equal(r.match.p1, 66.12);
  assert.equal(r.match.v3_pari.cle, "1N2:1");
  assert.equal(r.match.v3_suivi.voyant, "compo confirmée");
  assert.equal(r.match.v3_suivi.alerte_cote, "cote passée sous le minimum");
  assert.equal(r.match.v3_suivi.probabilite_information, 60);
  assert.equal(r.match.moteur_v3.compo.voyant, "compo confirmée");
});

test("interrupteur d'urgence du moteur : plus aucun pari affiche, meme un pari deja fige", () => {
  const premier = simulerRun(branchement(), FIXTURES.austria, { nowMs: Date.parse("2026-09-26T06:00:00Z") });
  const urgence = clone(EXEMPLE); urgence.interrupteur_urgence = true;
  const b = branchement({}, urgence);
  const r = simulerRun(b, FIXTURES.austria, { precedent: lignePubliee(premier), previousPublic: premier.publique });
  assert.equal(r.match.pari_rec, "");
  assert.equal(r.match.no_signal, true);
  assert.equal(r.match.no_signal_reason, "MOTEUR_V3_URGENCE");
  assert.equal(r.row.pari_rec, "");
  for (const k of V3.CHAMPS_PREMIUM_V3) assert.equal(r.match[k], undefined, k);
  assert.match(b.resume(), /URGENCE/);
});

test("historique : la prediction en attente suit le pari v3 publie et se regle normalement", () => {
  const r = simulerRun(branchement(), FIXTURES.austria);
  const prediction = { fixture_id: 1528898, result: "scheduled", type: "single", prediction: "Premiere mi-temps moins de 1.5 but", cote: 1.47, model_probability: 65.5 };
  assert.equal(PICK_FREEZE.alignPendingPrediction(prediction, r.match), true);
  assert.equal(prediction.prediction, "Victoire Domicile");
  assert.equal(prediction.market, "home-win");
  assert.equal(prediction.cote, 1.57);
  assert.equal(resolveMarketWin(prediction.prediction, 2, 0), true);
  assert.equal(resolveMarketWin(prediction.prediction, 1, 1), false);
});

test("journaux publics : le resume ne donne que des compteurs, jamais le pari, la cote ou la probabilite", () => {
  const b = branchement();
  simulerRun(b, FIXTURES.austria); simulerRun(b, FIXTURES.pumas); simulerRun(b, FIXTURES.germany); simulerRun(b, FIXTURES.absent);
  const txt = b.resume();
  assert.match(txt, /V3_PARI=2/);
  assert.match(txt, /MOTEUR_V3_MATCH_INTROUVABLE=1/);
  assert.doesNotMatch(txt, /Victoire|Over|1[.,]5[27]|66|78|home-win|over-15/);
});

// ===========================================================================
// 5. CONTRAT 1.1 COMPLET (28/09) : IDENTIFIANTS API-FOOTBALL, FIABILITE AFFICHEE, COMPARAISON
// ===========================================================================

// Champs obligatoires recopies du schema du moteur (iashark-moteur,
// contrat/sortie.schema.json, commit 6af5701). Si le moteur change son schema,
// ce test doit etre mis a jour avec lui (nouvelle version de contrat).
const SCHEMA_REQUIS = {
  sortie: ["contrat_version", "moteur_version", "genere_le", "reglages", "interrupteur_urgence", "matchs"],
  match: ["match_id", "ligue_code", "ligue", "competition_type", "date", "heure_source", "domicile", "exterieur", "api_football_fixture_id", "ids_api_football", "coup_envoi_utc", "couverture", "fiabilite", "eligible_vip", "buts_attendus", "probabilite_source", "marches", "buteurs", "compositions", "selections", "publication", "empreinte"],
  marche: ["cle", "famille", "libelle_fr", "probabilite", "cote_juste", "cote_disponible", "source_cote", "valeur", "etiquette", "fiabilite_marche", "eligible_vip", "avantage"],
  choix: ["cle", "libelle_fr", "probabilite", "cote_juste", "cote_disponible", "valeur", "etiquette", "eligible_vip", "formule", "raisons"],
  publication: ["match_id", "cle", "libelle_fr", "probabilite_publiee", "cote_juste", "cote_minimum_a_jouer", "eligible_vip", "publie_le", "moteur_version", "empreinte", "mises_a_jour"],
  compositions: ["probable", "absents", "officielle", "voyant", "mis_a_jour_le"],
};
test("l'exemple porte tous les champs obligatoires du schema du moteur (contrat 1.1)", () => {
  const manque = (o, liste, ou) => liste.filter((k) => !Object.prototype.hasOwnProperty.call(o, k)).map((k) => ou + "." + k);
  let err = manque(EXEMPLE, SCHEMA_REQUIS.sortie, "sortie");
  assert.equal(EXEMPLE.contrat_version, "1.1");
  EXEMPLE.matchs.forEach((m, i) => {
    err = err.concat(manque(m, SCHEMA_REQUIS.match, "matchs[" + i + "]"), manque(m.compositions, SCHEMA_REQUIS.compositions, "compositions"));
    m.marches.forEach((mk) => { err = err.concat(manque(mk, SCHEMA_REQUIS.marche, mk.cle)); });
    Object.values(m.selections).filter(Boolean).forEach((c) => { err = err.concat(manque(c, SCHEMA_REQUIS.choix, "choix " + c.cle)); assert.equal(c.raisons.length, 3); });
    if (m.publication) err = err.concat(manque(m.publication, SCHEMA_REQUIS.publication, "publication"));
    assert.match(m.empreinte, /^[0-9a-f]{64}$/);
  });
  assert.deepEqual(err, []);
  // Un fichier 1.0 est refuse (le site n'importe que le contrat 1.1).
  const ancien = clone(EXEMPLE); ancien.contrat_version = "1.0";
  assert.ok(V3.validerSortie(ancien, CONFIG).some((e) => /contrat_version/.test(e)));
  const sansLien = clone(EXEMPLE); delete sansLien.matchs[0].ids_api_football;
  assert.ok(V3.validerSortie(sansLien, CONFIG).some((e) => /ids_api_football manquant/.test(e)));
});

test("fraicheur : un fichier de plus de 26 heures n'est plus importe (contrat 1.1 section 8)", () => {
  assert.equal(branchement({}, EXEMPLE, Date.parse("2026-09-28T07:00:00Z")).actif, true, "25 h");
  const vieux = branchement({}, EXEMPLE, Date.parse("2026-09-28T09:00:00Z"));
  assert.ok(vieux.echec, "27 h : refuse, aucun pari publie (C1)"); assert.match(vieux.raison, /trop ancienne/);
});

test("lien par identifiant API-Football : aucun nom a traduire, equipes verifiees", () => {
  const idx = V3.indexerSortie(EXEMPLE);
  const r = V3.trouverMatch(idx, { fixtureId: 1528898, home: "Österreich", away: "Kosova", homeId: 775, awayId: 1111, kickoff: "2026-09-27T16:00:00Z" }, CONFIG);
  assert.equal(r.match.match_id, "UNL-2026-09-27-Austria-Kosovo"); assert.equal(r.par, "fixture");
  assert.equal(V3.trouverMatch(idx, { fixtureId: 1528898, home: "Austria", away: "Kosovo", homeId: 1111, awayId: 775 }, CONFIG).raison, "MOTEUR_V3_EQUIPES_DIFFERENTES");
  // Un match relie par le moteur a un autre numero n'est jamais pris par son nom.
  assert.equal(V3.trouverMatch(idx, { fixtureId: 999, home: "Austria", away: "Kosovo", kickoff: "2026-09-27T16:00:00Z" }, CONFIG).match, null);
  // Sans lien cote moteur (ids_api_football null) : repli sur les noms.
  assert.equal(V3.trouverMatch(idx, { fixtureId: 1550981, home: "U.N.A.M. - Pumas", away: "Atletico San Luis", kickoff: "2026-09-27T18:00:00Z", leagueId: 262 }, CONFIG).par, "noms");
});

test("version rapide : la fiabilite du moteur passe dans l'affichage actuel (Elevee / Moyenne / Faible)", () => {
  const { reliabilityInfo } = require("../lib/insights.js");
  const a = simulerRun(branchement(), FIXTURES.austria).match;
  assert.equal(a.reliability.label, "Élevée", "verifie sur le passe, confiance normale (le score 58 n'entre pas)");
  assert.equal(a.reliability.source, "moteur_v3");
  assert.equal(a.reliability.score, undefined, "score 0-100 interne au moteur (H-016)");
  assert.equal(a.reliability.historical_calibration, "VERIFIED_ON_PAST");
  assert.equal(reliabilityInfo(a.reliability).level, "high");
  const p = simulerRun(branchement(), FIXTURES.pumas).match;
  assert.equal(p.reliability.label, "Élevée", "verifie sur le passe, confiance normale");
  assert.equal(p.reliability.historical_calibration, "VERIFIED_ON_PAST");
  assert.equal(reliabilityInfo(p.reliability).level, "high");
  // Donnees limitees : « Faible », meme avec un score haut ; verifie mais confiance faible : « Moyenne ».
  assert.equal(V3.reliabilityV3({ couverture: "données limitées", fiabilite: { score: 95, niveau: "non vérifié sur le passé / données limitées" }, selections: { plus_sur: { confiance: "normale" } } }, null).label, "Faible");
  assert.equal(V3.reliabilityV3({ couverture: "vérifiée", fiabilite: { score: 90, niveau: "vérifié sur le passé" }, selections: { plus_sur: { confiance: "faible" } } }, null).label, "Moyenne");
  // Champ premium : retire du fichier public comme avant.
  assert.equal(PREMIUM.stripPremium(a).reliability, undefined);
});

test("essai local : tableau ancien / nouveau par match (paris, probabilites, fiabilite, raison)", () => {
  const b = branchement();
  simulerRun(b, FIXTURES.austria); simulerRun(b, FIXTURES.germany); simulerRun(b, FIXTURES.absent);
  const t = b.comparaison();
  assert.equal(t.length, 3);
  const a = t.find((x) => x.fixture_id === 1528898);
  assert.equal(a.ancien.pari, ANCIEN_PARI.market);
  assert.equal(a.nouveau.pari, "Victoire Domicile");
  assert.equal(a.probabilites_ancien.p1, 61.2);
  assert.equal(a.probabilites_nouveau.p1, 66.12);
  assert.equal(a.fiabilite_nouveau, "Élevée");
  assert.equal(a.lien, "fixture");
  assert.equal(t.find((x) => x.fixture_id === 1528899).raison, "MOTEUR_V3_MARCHE_NON_PRIS_EN_CHARGE");
  assert.equal(t.find((x) => x.fixture_id === 1528900).raison, "MOTEUR_V3_MATCH_INTROUVABLE");
  assert.deepEqual(V3.creerBranchement({ env: {} }).comparaison(), []);
});

// ===========================================================================
// 6. VRAIE SORTIE DU MOTEUR (contrat/exemple_sortie.json du moteur, produite par le
//    moteur le 28/09/2026) ET GARDE-FOU DU SITE (avocat du diable, 28/09/2026)
// ===========================================================================
// Copie de contrat/exemple_sortie.json du moteur (iashark-moteur etape-0, commit 1aee60b = code bb2a929).
const VRAIE_CHEMIN = path.join(__dirname, "fixtures", "moteur-v3", "vraie_sortie_bb2a929.json");
const VRAIE = JSON.parse(fs.readFileSync(VRAIE_CHEMIN, "utf8"));
const NOW_VRAIE = Date.parse(VRAIE.genere_le) + 3600000;
function fixtureDe(m, statut) {
  const ids = m.ids_api_football;
  return { fixture: { id: ids.fixture, date: String(m.coup_envoi_utc).replace(" ", "T"), status: { short: statut || "NS" } }, league: { id: ids.ligue }, teams: { home: { id: ids.domicile, name: m.domicile }, away: { id: ids.exterieur, name: m.exterieur } } };
}

test("vraie sortie du moteur : conforme au contrat, lue par l'adaptateur", () => {
  assert.deepEqual(V3.validerSortie(VRAIE, CONFIG), []);
  const b = branchement({}, VRAIE, NOW_VRAIE);
  assert.equal(b.actif, true);
  assert.equal(b.sortie.moteur_version, VRAIE.moteur_version);
});

test("garde-fou : aucun pari affiche hors marche « vérifié », hors eligible_vip ou en confiance faible, meme si le moteur le publie", () => {
  const b = branchement({}, VRAIE, NOW_VRAIE);
  const resultats = VRAIE.matchs.map((m) => ({ m: m, r: simulerRun(b, fixtureDe(m), { nowMs: NOW_VRAIE }) }));
  for (const { m, r } of resultats) {
    const ps = m.selections.plus_sur;
    const publiable = !!(m.publication && ps && ps.cle === m.publication.cle && ps.confiance === "normale" && ps.eligible_vip === true && m.eligible_vip === true && m.couverture === "vérifiée");
    const mk = m.marches.find((x) => m.publication && x.cle === m.publication.cle);
    if (r.match.pari_rec) {
      assert.ok(publiable, m.match_id + " : pari affiche alors qu'il n'est pas publiable");
      assert.equal(mk.etiquette, "vérifié sur le passé"); assert.equal(mk.fiabilite_marche, "vérifié sur le passé"); assert.equal(mk.eligible_vip, true);
      assert.equal("eligible_vip" in r.match.v3_pari, false, "C4 : jamais ecrit vers le site");
    }
  }
  // Colombie : le moteur corrige (bb2a929) ne publie plus rien ; on rejoue le defaut
  // du moteur 9425d40 (double chance non verifiee publiee) : le site refuse quand meme.
  const colM = VRAIE.matchs.find((m) => m.ligue_code === "COL");
  assert.equal(colM.publication, null);
  const defaut = clone(VRAIE);
  const cm = defaut.matchs.find((m) => m.ligue_code === "COL");
  const dc = cm.marches.find((x) => x.cle === "DC:N2");
  cm.publication = { match_id: cm.match_id, cle: "DC:N2", libelle_fr: dc.libelle_fr, probabilite_publiee: dc.probabilite, cote_juste: dc.cote_juste, cote_minimum_a_jouer: dc.cote_juste, eligible_vip: false, publie_le: VRAIE.genere_le, moteur_version: "3.0.0+9425d40", empreinte: "f".repeat(64), mises_a_jour: [] };
  cm.selections.plus_sur = { cle: "DC:N2", libelle_fr: dc.libelle_fr, probabilite: dc.probabilite, cote_juste: dc.cote_juste, cote_disponible: null, valeur: null, etiquette: dc.etiquette, eligible_vip: false, formule: "plus_sur", raisons: ["a", "b", "c"], confiance: "normale" };
  const col = simulerRun(branchement({}, defaut, NOW_VRAIE), fixtureDe(cm), { nowMs: NOW_VRAIE });
  assert.equal(col.match.pari_rec, "", "le site ne l'affiche pas");
  assert.equal(col.match.moteur_v3.raison, "MOTEUR_V3_MARCHE_NON_VERIFIE");
  assert.equal(col.match.reliability.label, "Faible", "donnees limitees : fiabilite du moteur v3, jamais celle de l'ancien");
  const faible = resultats.find((x) => x.m.selections.plus_sur && x.m.selections.plus_sur.confiance === "faible");
  assert.equal(faible.r.match.pari_rec, "", "confiance faible : jamais publie");
  const mls = resultats.find((x) => x.m.ligue_code === "USA");
  assert.equal(mls.r.match.pari_rec, "Exterieur plus de 0.5 but", "marche verifie, eligible, confiance normale : affiche");
  assert.equal(mls.r.match.market_id, "away-team-over-05");
  assert.equal(mls.r.match.reliability.label, "Élevée");
  assert.equal(resolveMarketWin(mls.r.match.pari_rec, 1, 1), true);
  assert.equal(resolveMarketWin(mls.r.match.pari_rec, 1, 0), false);
});

test("garde-fou : chaque condition refuse seule", () => {
  const base = clone(VRAIE.matchs.find((m) => m.ligue_code === "USA"));
  const essai = (modif) => { const m = clone(base); modif(m); return V3.choisirPari(m, [], {}).raison; };
  assert.equal(essai(() => {}), null);
  assert.equal(essai((m) => { m.marches.find((x) => x.cle === m.publication.cle).etiquette = "logique installée, pas encore vérifié"; }), "MOTEUR_V3_MARCHE_NON_VERIFIE");
  assert.equal(essai((m) => { m.marches.find((x) => x.cle === m.publication.cle).fiabilite_marche = "non vérifié sur le passé / données limitées"; }), "MOTEUR_V3_MARCHE_NON_VERIFIE");
  assert.equal(essai((m) => { m.marches.find((x) => x.cle === m.publication.cle).eligible_vip = false; }), "MOTEUR_V3_NON_ELIGIBLE");
  assert.equal(essai((m) => { m.eligible_vip = false; }), "MOTEUR_V3_NON_ELIGIBLE");
  assert.equal(essai((m) => { m.publication.eligible_vip = false; }), "MOTEUR_V3_NON_ELIGIBLE");
  assert.equal(essai((m) => { m.couverture = "données limitées"; }), "MOTEUR_V3_NON_ELIGIBLE");
  assert.equal(essai((m) => { m.selections.plus_sur.confiance = "faible"; }), "MOTEUR_V3_CONFIANCE_FAIBLE");
  assert.equal(essai((m) => { delete m.selections.plus_sur.confiance; }), "MOTEUR_V3_CONFIANCE_FAIBLE");
  assert.equal(essai((m) => { m.selections.plus_sur = null; }), "MOTEUR_V3_CONFIANCE_FAIBLE", "publication sans selection de meme marche : confiance inconnue");
});


// ===========================================================================
// 7. CONDITIONS DE L'AVOCAT DU DIABLE (29/09/2026) : C1 A C4 DANS LE PIPELINE
// ===========================================================================
const WF = fs.readFileSync(path.join(root, ".github", "workflows", "update-data.yml"), "utf8");

test("C1 : repli « aucun » par defaut dans le pipeline, alerte visible si le moteur v3 est indisponible", () => {
  assert.match(WF, /MOTEUR_V3_REPLI:\s+\$\{\{ vars\.MOTEUR_V3_REPLI \|\| 'aucun' \}\}/);
  assert.match(WF, /if\(MOTEUR_V3\.alerte\)\{ console\.log\('::error title=Moteur v3 indisponible::'/);
  const etape = WF.split("\n      - name: ").find((b) => /^Alerte moteur v3\n/.test(b));
  assert.ok(etape, "etape « Alerte moteur v3 »");
  assert.match(etape, /if: \$\{\{ always\(\) && vars\.MOTEUR_V3 == '1' \}\}/);
  assert.match(etape, /steps\.moteur_v3_produire\.outcome/);
  assert.match(etape, /exit 1/);
  assert.ok(WF.indexOf("- name: Alerte moteur v3") > WF.indexOf("- name: Commit and push"), "apres la publication");
  assert.match(WF, /- name: Moteur v3 - produire la sortie du jour\n        id: moteur_v3_produire\n/);
});

test("C2 : chaque pari archive porte son moteur (v3 / ancien) et sa version, jusque dans predictions_archive", () => {
  const debut = WF.indexOf("histo.predictions.unshift({");
  const bloc = WF.slice(WF.indexOf("var alreadyExists=histo.predictions.find("), WF.indexOf("});", debut));
  assert.match(bloc, /var moteurPari=\(m\.v3_pari&&m\.moteur_v3&&m\.moteur_v3\.source==='v3'\)\?'v3':'ancien';/);
  assert.match(bloc, /var moteurVersion=moteurPari==='v3'\?\(m\.moteur_v3\.version_moteur\|\|null\):MODEL_VERSION;/);
  assert.match(bloc, /moteur:moteurPari,\s*moteur_version:moteurVersion,/);
  // Realignement : moteur mis a jour, jamais apres le coup d'envoi (historique-public).
  assert.match(bloc, /alignPendingPrediction\(alreadyExists,m,\{moteur:moteurPari,moteur_version:moteurVersion,kickoffMs:koMs,nowMs:Date\.now\(\)\}\)/);
  assert.match(bloc, /published_at:/); assert.match(bloc, /kickoff_at:koMs!=null\?new Date\(koMs\)\.toISOString\(\):null/);
  const archive = WF.slice(WF.indexOf("async function writePredictionsArchive("), WF.indexOf("// GEL DU PARI (19/09/2026, lib/pick-freeze.js) : relit"));
  assert.match(archive, /moteur:p\.moteur\|\|null,moteur_version:p\.moteur_version\|\|null,/);
  assert.match(archive, /0034_predictions_archive_moteur\.sql/);
  const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "0034_predictions_archive_moteur.sql"), "utf8");
  assert.match(migration, /add column if not exists moteur text/);
  assert.match(migration, /add column if not exists moteur_version text/);
  // Le pari v3 publie garde v3_pari et moteur_v3.source = "v3" ; un pari fige de l'ancien moteur les perd.
  const r = simulerRun(branchement(), FIXTURES.austria);
  assert.ok(r.match.v3_pari && r.match.moteur_v3.source === "v3");
  assert.equal(r.match.moteur_v3.version_moteur, "3.0.0+exemple");
});

test("C3 : moteur v3 allume, le match offert est un pari v3, le plus probable, jamais choisi sur la « valeur »", () => {
  const debut = WF.indexOf("(function designerMatchGratuit(){");
  const bloc = WF.slice(debut, WF.indexOf("})();", debut));
  const v3 = bloc.slice(bloc.indexOf("// MOTEUR_V3:DEBUT"), bloc.indexOf("// MOTEUR_V3:FIN"));
  assert.ok(v3.length > 50, "bloc MOTEUR_V3 dans designerMatchGratuit");
  // 03/10/2026 : ou une selection nationale verifiee (cotes du marche, lib/pronostic.js).
  assert.match(v3, /analysable=function\(m\)\{ return analysableTous\(m\) && \(!!\(m\.v3_pari&&m\.moteur_v3&&m\.moteur_v3\.source==='v3'\) \|\| selectionNationaleCotes\(m\)\); \};/);
  assert.match(v3, /meilleur=function\(liste\)/);
  // 03/10/2026 : la plus fiable = la plus haute chance affichee du pronostic (chance IASHARK).
  assert.match(v3, /var pb=chanceSelection\(b\), pm=chanceSelection\(m\);/);
  assert.doesNotMatch(v3.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), /valeurDe|cote_rec|PROBA_MIN/, "aucun critere de valeur");
  // Regle de Clement du 04/10/2026, 20 h : une designation deja publiee n'est plus jamais retiree par ces filtres.
  assert.doesNotMatch(v3, /delete gardes\[j\]/);
  // Le bloc est pose apres la relecture des designations et avant le choix du jour.
  assert.ok(bloc.indexOf("// MOTEUR_V3:DEBUT") > bloc.indexOf("gardes=PICK_FREEZE.keptFreeDesignations(") && bloc.indexOf("// MOTEUR_V3:DEBUT") < bloc.indexOf("var jours=[];"));
});

test("buts attendus du moteur obligatoires : sans eux la sortie est refusee (aucun melange avec l'ancien moteur)", () => {
  for (const casse of [(m) => { delete m.buts_attendus; }, (m) => { m.buts_attendus = { domicile: 0, exterieur: 1.1 }; }, (m) => { m.buts_attendus.exterieur = "x"; }]) {
    const s = clone(EXEMPLE); casse(s.matchs[0]);
    assert.ok(V3.validerSortie(s, CONFIG).some((e) => /buts_attendus/.test(e)));
    assert.ok(branchement({}, s).echec, "sortie refusee : aucun pari, alerte");
  }
  assert.deepEqual(V3.validerSortie(VRAIE, CONFIG), []);
});

test("C2 : le fichier public du jour dit quel moteur a publie chaque pari (bilan v3 a part)", () => {
  const MR = require("../lib/match-results.js");
  const preds = [
    { fixture_id: 1, match: "A vs B", home: "A", away: "B", prediction: "Victoire Domicile", cote: 1.6, market: "home-win", date: "2026-10-03", result: "win", score: "2-0", type: "single", moteur: "v3", moteur_version: "3.0.0" },
    { fixture_id: 2, match: "C vs D", home: "C", away: "D", prediction: "Over 2.5", cote: 1.9, market: "over-25", date: "2026-10-03", result: "loss", score: "1-0", type: "single", moteur: "ancien" },
    { fixture_id: 3, match: "E vs F", home: "E", away: "F", prediction: "Over 1.5", cote: 1.3, market: "over-15", date: "2026-10-03", result: "win", score: "2-1", type: "single" },
  ];
  const { file } = MR.buildDayFile({ day: "2026-10-03", predictions: preds, generatedAt: "2026-10-04T06:00:00Z" });
  const parId = Object.fromEntries(file.matches.map((m) => [String(m.id), m]));
  assert.equal(parId["1"].moteur, "v3");
  assert.equal(parId["2"].moteur, "ancien");
  assert.equal(parId["3"].moteur, "ancien", "publie avant la V3 : ancien modele");
  assert.equal(parId["3"].libelle_moteur, "ancien modèle");
  assert.equal(parId["1"].libelle_moteur, "moteur v3");
  assert.equal(MR.fusionnerPari(preds[0], null).moteur, "v3");
});

test("videos : la selection « la plus sure » du moteur est connue meme quand le site ne publie pas de pari", () => {
  const b = branchement({}, VRAIE, NOW_VRAIE);
  const faible = VRAIE.matchs.find((m) => m.selections.plus_sur && m.selections.plus_sur.confiance === "faible");
  const r = simulerRun(b, fixtureDe(faible), { nowMs: NOW_VRAIE });
  assert.equal(r.match.pari_rec, "", "pas de pari sur le site (confiance faible)");
  assert.deepEqual(r.match.v3_fiabilite.plus_sur, { cle: faible.selections.plus_sur.cle, probabilite: Math.round(faible.selections.plus_sur.probabilite * 1000) / 10 });
  const col = VRAIE.matchs.find((m) => m.ligue_code === "COL");
  assert.equal(simulerRun(b, fixtureDe(col), { nowMs: NOW_VRAIE }).match.v3_fiabilite.plus_sur, undefined, "pas de selection : rien d'invente");
});

// ===========================================================================
// 8. AVOCAT DU DIABLE, 2E REVUE (29/09/2026) : TEXTE, LIAISON, PANNES, ESSAI A BLANC
// ===========================================================================
test("A : le texte d'analyse d'un pari v3 recoit les chiffres du v3, sans fourchette 1,40-2,00", () => {
  const b = branchement();
  simulerRun(b, FIXTURES.austria);
  const d = { fixtureId: 1528898, poisson_lambdaH: 1.31, poisson_lambdaA: 0.88, final_p1: 61.2, final_pN: 22.1, final_p2: 16.7, poisson_p1: 61.2, dixon_p1: 60, mc_p1: 62,
    mc_scores: [{ score: "1-1", pct: 12 }], simulation_count: 5000,
    all_markets: [{ id: "home-win", market: "Victoire Domicile", prob: 61.2, estimate: 62, cote: "1.57" }, { id: "fh-under-15", market: "Premiere mi-temps moins de 1.5 but", prob: 65.5, estimate: 64, cote: "1.47" }] };
  const t = b.donneesTexte(d);
  assert.equal(t.moteur_texte, "v3");
  assert.equal(t.final_p1, 66.1); assert.equal(t.poisson_p1, 66.1); assert.equal(t.dixon_p1, 66.1); assert.equal(t.mc_p1, 66.1);
  assert.equal(t.poisson_lambdaH, 1.9); assert.equal(t.poisson_lambdaA, 0.7); // une decimale, comme la page (une seule source, 01/10/2026)
  assert.deepEqual(t.mc_scores.map((s) => s.score), ["1-0", "2-0", "2-1"]);
  assert.equal(t.simulation_count, null);
  assert.deepEqual(t.all_markets.map((m) => [m.id, m.prob, m.estimate]), [["home-win", 66.1, null]], "jamais un marche de l'ancien moteur");
  assert.equal(d.final_p1, 61.2, "l'objet d'origine n'est pas modifie");
  // Match absent du v3, moteur eteint : inchange.
  simulerRun(b, FIXTURES.absent);
  assert.equal(b.donneesTexte({ fixtureId: 1528900, final_p1: 50 }).final_p1, 50);
  assert.equal(V3.creerBranchement({ env: {} }).donneesTexte(d), d);
  // Prompt : la phrase 1,40-2,00 n'est donnee qu'aux paris de l'ancien moteur.
  const prompt = WF.slice(WF.indexOf("async function genAnalyse(d)"), WF.indexOf("var jsonTpl ="));
  assert.match(prompt, /if\(MOTEUR_V3\.actif\) d=MOTEUR_V3\.donneesTexte\(d\);/);
  // Contre-controle (30/09/2026) : « la plus probable », plus jamais « la plus sure ».
  assert.match(prompt, /\(d\.moteur_texte==='v3'\s*\?'C\\'est la selection « la plus probable » du moteur IASHARK v3[^']*aucune fourchette de cotes/);
  assert.doesNotMatch(prompt, /plus s[uû]re?\b/);
  const v3Branche = prompt.slice(prompt.indexOf("?'C\\'est la selection « la plus probable »"), prompt.indexOf(":'C\\'est le marche le plus probable parmi"));
  assert.doesNotMatch(v3Branche, /1\.40|2\.00/);
  assert.match(WF, /skip_kickoff_closed:!kickoffGateFix\.open,fixtureId:f\.id,/);
});

// Contre-controle ronde 4 (30/09/2026). Preuve de l'avocat : la consigne de l'IA disait
// « Probabilites du moteur IASHARK v3 (...jamais influencees par une cote) » et « Proba
// modele seul », alors que pour les championnats europeens la probabilite v3 melange le
// modele et la cote d'avant-match (contrat §8). On rejoue le VRAI genAnalyse.
test("consigne de l'IA : la source de la probabilite v3 (modele seul / modele + cotes) est dite, jamais « jamais influencees par une cote »", async () => {
  const debut = WF.indexOf("cat > pipeline.js << 'JSEOF'\n");
  const script = WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => l.startsWith("          ") ? l.slice(10) : l).join("\n");
  const fnSrc = script.slice(script.indexOf("async function genAnalyse(d) {"), script.indexOf("// TRADUCTION DES TEXTES EDITORIAUX"));
  const fabrique = new Function("MOTEUR_V3", "ANT_KEY", "postJSONWithRetry", "MOTS_INTERDITS", fnSrc + "\nreturn genAnalyse;");
  const MOTS = require("../lib/analyse-mots-interdits.js");
  async function consigne(b, fx) {
    let prompt = null;
    const gen = fabrique(b, "cle-factice", async (hote, chemin, corps) => { prompt = corps.messages[0].content; return { content: [{ type: "text", text: JSON.stringify({ contexte: "Texte." }) }] }; }, MOTS);
    await gen({ fixtureId: fx.fixture.id, home: fx.teams.home.name, away: fx.teams.away.name, league: "L", date: "2026-09-27 20:00", stade: "S", final_p1: 40, final_pN: 30, final_p2: 30, picked_market: { market: "Victoire Domicile", cote: "1.57", prob: 40 },
      all_markets: [{ id: "home-win", market: "Victoire Domicile", prob: 40, cote: "1.57" }], mc_scores: [] });
    return prompt;
  }
  // Match dont la probabilite v3 melange le modele et la cote d'avant-match.
  const b = branchement();
  simulerRun(b, FIXTURES.pumas);
  simulerRun(b, FIXTURES.austria);
  assert.equal(b.donneesTexte({ fixtureId: FIXTURES.pumas.fixture.id }).v3_avec_cotes, true);
  assert.equal(b.donneesTexte({ fixtureId: FIXTURES.austria.fixture.id }).v3_avec_cotes, false);
  const avec = await consigne(b, FIXTURES.pumas);
  assert.match(avec, /Probabilites du moteur IASHARK v3 \(les seules affichees sur la page ; elles melangent le modele et les cotes d'avant-match : n'ecris jamais qu'elles sont independantes des cotes\)/);
  assert.doesNotMatch(avec, /jamais influencee?s? par une cote/);
  assert.doesNotMatch(avec, /Proba modele seul/);
  const seul = await consigne(b, FIXTURES.austria);
  assert.match(seul, /modele seul pour ce match, sans cote/);
  assert.doesNotMatch(seul, /jamais influencee?s? par une cote/);
  // Ancien moteur (MOTEUR_V3 eteint) : sa probabilite n'utilise pas les cotes, la phrase reste vraie.
  const ancien = await consigne(V3.creerBranchement({ env: {} }), FIXTURES.pumas);
  assert.match(ancien, /jamais influencee par une cote/);
});

test("texte d'un match sans pari v3 : aucune raison inventee (contre-controle, 30/09/2026)", () => {
  // Match absent de la sortie du v3 : consigne neutre.
  const b = branchement();
  simulerRun(b, FIXTURES.absent);
  const absent = b.donneesTexte({ fixtureId: 1528900, no_signal: true });
  assert.equal(absent.sans_pari_v3, true);
  assert.equal(absent.moteur_texte, undefined, "aucun chiffre du v3 pour un match qu'il ne couvre pas");
  // Match couvert par le v3 mais sans selection publiable (confiance faible) : consigne neutre aussi.
  const bv = branchement({}, VRAIE, NOW_VRAIE);
  const faible = VRAIE.matchs.find((m) => m.selections.plus_sur && m.selections.plus_sur.confiance === "faible");
  const r = simulerRun(bv, fixtureDe(faible), { nowMs: NOW_VRAIE });
  assert.equal(r.match.pari_rec, "");
  const couvert = bv.donneesTexte({ fixtureId: fixtureDe(faible).fixture.id, no_signal: true });
  assert.equal(couvert.sans_pari_v3, true);
  assert.equal(couvert.moteur_texte, "v3");
  // Pari v3 publie : pas de consigne « sans pari ».
  const bp = branchement();
  simulerRun(bp, FIXTURES.austria);
  assert.equal(bp.donneesTexte({ fixtureId: 1528898 }).sans_pari_v3, undefined);
  // Moteur eteint : rien ne change (ancienne consigne).
  const d = { fixtureId: 1528900, no_signal: true };
  assert.equal(V3.creerBranchement({ env: {} }).donneesTexte(d), d);
  // Prompt : la consigne neutre est choisie par sans_pari_v3 et ne donne aucune raison statistique.
  const prompt = WF.slice(WF.indexOf("async function genAnalyse(d)"), WF.indexOf("var jsonTpl ="));
  const i = prompt.indexOf("?(d.sans_pari_v3");
  assert.ok(i > 0, "consigne neutre branchee sur sans_pari_v3");
  const neutre = prompt.slice(i, prompt.indexOf(":'Aucun marche retenu", i));
  assert.match(neutre, /ne remplit pas les conditions de publication du moteur IASHARK v3/);
  assert.match(neutre, /n\\'invente AUCUNE autre raison/);
  assert.doesNotMatch(neutre.replace(/\(ni historique insuffisant, ni donnees manquantes, ni match trop incertain\)/g, ""), /historique insuffisant|donnees .*indisponibles/);
});

test("texte d'un jour de PANNE du v3 : aucune raison inventee, pas meme les conditions du moteur (2e contre-controle, 30/09/2026)", () => {
  // Cas rejoue par l'avocat du diable : moteur allume, sortie absente -> avant, ancienne
  // consigne « historique insuffisant ou donnees indisponibles » sur chaque match.
  const introuvable = () => { const e = new Error("ENOENT: sortie absente"); e.code = "ENOENT"; throw e; };
  const pannes = [
    V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: "sortie_essai" }, config: CONFIG, lireFichier: introuvable, nowMs: NOW }),
    V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: "x.json" }, config: CONFIG, lireFichier: () => "{pas du json", nowMs: NOW }),
    V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: path.join(os.tmpdir(), "iashark-sortie-absente-" + process.pid) }, config: CONFIG, nowMs: NOW }),
  ];
  for (const b of pannes) {
    assert.equal(b.actif, true); assert.equal(b.repli, "aucun");
    const choix = b.choisirPourFixture({ fixtureId: 1528898, home: "Austria", away: "Kosovo" });
    assert.equal(choix.pickedMarket, null, "aucun pari ce jour-la");
    const d = { fixtureId: 1528898, no_signal: true, final_p1: 50 };
    const t = b.donneesTexte(d);
    assert.equal(t.sans_pari_v3, true, "consigne neutre, jamais l'ancienne raison");
    assert.equal(t.v3_indisponible, true);
    assert.equal(t.final_p1, 50);
    assert.equal(d.sans_pari_v3, undefined, "l'objet d'origine n'est pas modifie");
  }
  // Repli « ancien » demande explicitement : l'ancien moteur publie, son texte ne change pas.
  const ancien = V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: "x", MOTEUR_V3_REPLI: "ancien" }, config: CONFIG, lireFichier: introuvable, nowMs: NOW });
  const d = { fixtureId: 1, no_signal: true };
  assert.equal(ancien.donneesTexte(d), d);
  // Prompt : la consigne choisie pour un jour de panne n'avance aucune raison.
  const prompt = WF.slice(WF.indexOf("async function genAnalyse(d)"), WF.indexOf("var jsonTpl ="));
  const i = prompt.indexOf("?(d.v3_indisponible");
  assert.ok(i > prompt.indexOf("?(d.sans_pari_v3"), "la panne est un cas de sans_pari_v3");
  const panne = prompt.slice(i, prompt.indexOf(":'Aucun pari n\\'est publie sur ce match aujourd\\'hui : il ne remplit", i));
  assert.match(panne, /Aucun pari n\\'est publie sur ce match aujourd\\'hui\./);
  assert.match(panne, /n\\'invente AUCUNE raison/);
  assert.doesNotMatch(panne, /conditions de publication/);
  assert.doesNotMatch(panne.replace(/\(ni historique insuffisant, ni donnees manquantes, ni match trop incertain\)/g, ""), /historique insuffisant|donnees .*indisponibles|pas pu calculer/);
});

test("D : alerte rouge si le v3 est lu mais ne relie aucun match du site", () => {
  const b = branchement();
  simulerRun(b, FIXTURES.absent);
  assert.match(b.alerteLiaison(), /AUCUN des 1 match\(s\) du site n'a ete relie/);
  const ok = branchement(); simulerRun(ok, FIXTURES.austria); simulerRun(ok, FIXTURES.absent);
  assert.equal(ok.alerteLiaison(), null);
  assert.equal(branchement().alerteLiaison(), null, "aucun match traite : rien a dire");
  assert.match(WF, /var alerteLiaisonV3=MOTEUR_V3\.alerteLiaison\(\);/);
  assert.match(WF, /iashark-moteur-v3-alerte\.txt', alerteLiaisonV3/);
});

test("D : l'echec « v3 » et l'echec « ecriture Supabase » ont des messages distincts", () => {
  assert.match(WF, /Panne du moteur v3 : aucun nouveau pari publie aujourd'hui \(ce n'est pas un probleme de base de donnees\)/);
  assert.match(WF, /Echec d'ecriture Supabase \(base de donnees\) : ce n'est PAS une panne du moteur v3/);
});

test("D : essai a blanc du v3 sur GitHub, a lancer a la main, sans rien ecrire", () => {
  const e = fs.readFileSync(path.join(root, ".github", "workflows", "moteur-v3-essai-a-blanc.yml"), "utf8");
  assert.match(e, /^on:\n  workflow_dispatch: \{\}\n/m);
  assert.doesNotMatch(e, /schedule:|workflow_run:|push:/);
  assert.match(e, /permissions:\n  contents: read/);
  assert.match(e, /persist-credentials: false/);
  assert.doesNotMatch(e, /git (push|commit)|SUPABASE_SERVICE_ROLE_KEY|TELEGRAM|upload-artifact/);
  assert.match(e, /python -m moteur\.produire --jours 3 --essai/);
  assert.match(e, /V3\.chargerSortie\(process\.env\.MOTEUR_V3_DIR \+ "\/sortie_essai"/);
});

test("moteur hors du depot public : recupere du depot prive si le secret existe, sinon ancien comportement", () => {
  const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(gi, /^\.moteur-v3-prive\/$/m, "le moteur prive n'est jamais commite");
  const e = fs.readFileSync(path.join(root, ".github", "workflows", "moteur-v3-essai-a-blanc.yml"), "utf8");
  for (const [nom, wf] of [["update-data.yml", WF], ["moteur-v3-essai-a-blanc.yml", e]]) {
    // Le secret n'est jamais teste dans un « if » (interdit par GitHub) : une etape le lit
    // et choisit le dossier ; sans secret, c'est moteur-v3/ comme avant.
    assert.match(wf, /JETON_MOTEUR_PRIVE: \$\{\{ secrets\.MOTEUR_V3_DEPOT_PRIVE \}\}/, nom);
    assert.match(wf, /if \[ -n "\$JETON_MOTEUR_PRIVE" \]; then[\s\S]*?MOTEUR_V3_DIR=\.moteur-v3-prive[\s\S]*?else[\s\S]*?MOTEUR_V3_DIR=moteur-v3"/, nom);
    assert.match(wf, /repository: IASHARK\/iashark-moteur/, nom);
    assert.match(wf, /token: \$\{\{ secrets\.MOTEUR_V3_DEPOT_PRIVE \}\}\n\s+path: \.moteur-v3-prive\n\s+persist-credentials: false/, nom);
    // Repli sans la variable MOTEUR_V3_REF : toujours un commit precis du moteur prive (40 caracteres), jamais une
    // branche (04/10/2026 : le calcul du matin passe au commit des 30 championnats, H-021 du moteur).
    assert.match(wf, /ref: \$\{\{ vars\.MOTEUR_V3_REF \|\| '[0-9a-f]{40}' \}\}/, nom);
    assert.doesNotMatch(wf, /echo[^\n]*\$JETON_MOTEUR_PRIVE/, nom + " : le jeton n'est jamais affiche");
  }
  // Le calcul du matin lance le moteur dans le dossier choisi et lit sa sortie la.
  assert.match(WF, /working-directory: \$\{\{ env\.MOTEUR_V3_DIR \|\| 'moteur-v3' \}\}/);
  assert.match(WF, /MOTEUR_V3_SORTIE:\s+\$\{\{ vars\.MOTEUR_V3_SORTIE \|\| format\('\{0\}\/sortie_essai', env\.MOTEUR_V3_DIR \|\| 'moteur-v3'\) \}\}/);
  // Seuls les resultats sont publies : le commit n'ajoute que des sorties nommees.
  const commit = WF.slice(WF.indexOf("- name: Commit and push"));
  const adds = commit.match(/git add [^\n]+/g) || [];
  assert.ok(adds.length >= 1);
  for (const a of adds) {
    assert.doesNotMatch(a, /moteur|-A\b|--all|\s\.(\s|$)/, "jamais le moteur ni tout le dossier : " + a);
  }
  assert.doesNotMatch(commit.split("OUTPUTS=")[1].split("\n")[0], /moteur/);
  // Depot prive illisible : le calcul du matin continue (aucun pari v3 + alerte), jamais arrete.
  const etapesPrives = WF.slice(WF.indexOf("- name: Moteur v3 - recuperer le moteur prive"), WF.indexOf("- name: Moteur v3 - produire la sortie du jour"));
  assert.equal((etapesPrives.match(/continue-on-error:/g) || []).length, 4);
});

// 2e contre-controle de l'avocat du diable (30/09/2026) : le depot prive n'a PAS de
// dossier branchement/. Le raccord (code du site, sans poids ni regle du moteur) vit
// hors de moteur-v3/ et les workflows le copient dans le dossier du moteur du jour :
// retirer moteur-v3/ du depot public ne casse plus le v3.
function blocRun(wf, nomEtape) {
  const i = wf.indexOf("- name: " + nomEtape);
  assert.ok(i >= 0, nomEtape);
  const j = wf.indexOf("run: |\n", i);
  assert.ok(j > i && j < wf.indexOf("\n      - name: ", i + 10), "run de l'etape " + nomEtape);
  const out = [];
  for (const l of wf.slice(j + 7).split("\n")) {
    if (l.startsWith("          ")) out.push(l.slice(10));
    else if (l.trim() === "") out.push("");
    else break;
  }
  return out.join("\n");
}

test("raccord branchement/ hors de moteur-v3/ : le v3 tourne avec le depot prive, meme apres le retrait de moteur-v3/", () => {
  const { execFileSync, execSync } = require("node:child_process");
  const raccord = path.join(root, "raccord-moteur-v3", "branchement");
  assert.ok(fs.existsSync(path.join(raccord, "reconstruire_etats.py")));
  assert.ok(fs.existsSync(path.join(raccord, "__init__.py")));
  let suivis = null;
  try { suivis = execSync("git ls-files moteur-v3/branchement", { cwd: root, encoding: "utf8" }).trim(); } catch (e) { suivis = null; }
  if (suivis !== null) assert.equal(suivis, "", "plus aucun raccord dans moteur-v3/ (il partirait avec le retrait)");
  const E = fs.readFileSync(path.join(root, ".github", "workflows", "moteur-v3-essai-a-blanc.yml"), "utf8");
  for (const [nom, wf] of [["update-data.yml", WF], ["moteur-v3-essai-a-blanc.yml", E]]) {
    assert.doesNotMatch(wf, /cp -R moteur-v3\/branchement/, nom + " : jamais copie depuis moteur-v3/");
    assert.match(wf, /cp -R raccord-moteur-v3\/branchement "\$MOTEUR_V3_DIR\/branchement"/, nom);
    assert.ok(wf.indexOf("raccord-moteur-v3/branchement") < wf.indexOf("python -m branchement.reconstruire_etats"), nom + " : copie avant le lancement");
  }
  // Calcul du matin : le raccord tourne dans les DEUX modes (prive ou moteur-v3/).
  const etape = WF.slice(WF.indexOf("- name: Moteur v3 - raccord du site"));
  assert.match(etape, /^- name: Moteur v3 - raccord du site \(reconstruction des etats\)\n        if: \$\{\{ vars\.MOTEUR_V3 == '1' \}\}\n        continue-on-error: true\n/);
  // On REJOUE les deux blocs shell dans un dossier sans moteur-v3/ (retrait fait) avec un
  // faux depot prive sans branchement/ (comme IASHARK/iashark-moteur a 1aee60b).
  for (const [nom, script] of [["update-data.yml", blocRun(WF, "Moteur v3 - raccord du site")], ["moteur-v3-essai-a-blanc.yml", blocRun(E, "Raccord du site")]]) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-raccord-"));
    try {
      fs.cpSync(raccord, path.join(tmp, "raccord-moteur-v3", "branchement"), { recursive: true });
      fs.mkdirSync(path.join(tmp, ".moteur-v3-prive", "moteur"), { recursive: true });
      fs.writeFileSync(path.join(tmp, ".moteur-v3-prive", "requirements.lock"), "numpy==2\n");
      const sortie = execFileSync("bash", ["-c", script], { cwd: tmp, encoding: "utf8", env: { PATH: process.env.PATH, MOTEUR_V3_DIR: ".moteur-v3-prive" } });
      assert.doesNotMatch(sortie, /::error/, nom + " : " + sortie);
      assert.equal(fs.readFileSync(path.join(tmp, ".moteur-v3-prive", "branchement", "reconstruire_etats.py"), "utf8"), fs.readFileSync(path.join(raccord, "reconstruire_etats.py"), "utf8"), nom);
      assert.equal(fs.existsSync(path.join(tmp, "moteur-v3")), false, nom + " : rien n'est recree dans moteur-v3/");
      // Un branchement/ deja present dans le depot prive est garde tel quel.
      fs.writeFileSync(path.join(tmp, ".moteur-v3-prive", "branchement", "reconstruire_etats.py"), "# version du depot prive\n");
      execFileSync("bash", ["-c", script], { cwd: tmp, encoding: "utf8", env: { PATH: process.env.PATH, MOTEUR_V3_DIR: ".moteur-v3-prive" } });
      assert.equal(fs.readFileSync(path.join(tmp, ".moteur-v3-prive", "branchement", "reconstruire_etats.py"), "utf8"), "# version du depot prive\n", nom);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // Depot prive illisible (dossier absent) : alerte claire, jamais de copie au hasard.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-raccord-"));
  try {
    fs.cpSync(raccord, path.join(tmp, "raccord-moteur-v3", "branchement"), { recursive: true });
    const sortie = execFileSync("bash", ["-c", blocRun(WF, "Moteur v3 - raccord du site")], { cwd: tmp, encoding: "utf8", env: { PATH: process.env.PATH, MOTEUR_V3_DIR: ".moteur-v3-prive" } });
    assert.match(sortie, /::error title=Moteur v3::moteur illisible/);
    assert.match(sortie, /::error title=Moteur v3::raccord branchement\/ absent/);
    assert.equal(fs.existsSync(path.join(tmp, ".moteur-v3-prive")), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // La copie faite dans moteur-v3/ (mode sans secret) n'est jamais commitee.
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^moteur-v3\/branchement\/$/m);
  // La decision est ecrite pour Clement, avec l'essai a blanc APRES le retrait.
  const doc = fs.readFileSync(path.join(root, "docs", "MOTEUR-V3-DEPOT-PRIVE.md"), "utf8");
  assert.match(doc, /MOTEUR_V3_DEPOT_PRIVE/);
  assert.match(doc, /garde `raccord-moteur-v3\/`/);
  assert.match(doc, /Relance l'essai à blanc \*\*après\*\* ce retrait/);
});

// 3e contre-controle (30/09/2026) : moteur-v3/ retire du depot SANS le secret. Avant,
// « Moteur v3 - Python » avait continue-on-error = (prive == 'oui'), donc faux en mode
// public : setup-python echouait (requirements.lock absent) et TOUT le calcul du matin
// s'arretait (site pas mis a jour). On rejoue ce cas etape par etape.
test("moteur-v3/ retire sans le secret : le calcul du matin continue, aucun pari v3, alerte rouge", () => {
  const { execFileSync, spawnSync } = require("node:child_process");
  const debut = WF.indexOf("- name: Moteur v3 - source du moteur");
  const fin = WF.indexOf("- name: Run pipeline");
  assert.ok(debut > 0 && fin > debut);
  const etapes = WF.slice(debut, fin).split("\n      - name: ").slice(1);
  assert.ok(etapes.length >= 5);
  for (const e of etapes) assert.match(e, /\n        continue-on-error: true\n/, "ne peut pas arreter le calcul du matin : " + e.split("\n")[0]);
  assert.doesNotMatch(WF.slice(debut, fin), /continue-on-error: \$\{\{/, "jamais selon le mode prive / public");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-sans-moteur-"));
  try {
    // Depot sans moteur-v3/ (retrait fait) et sans le secret.
    fs.cpSync(path.join(root, "raccord-moteur-v3", "branchement"), path.join(tmp, "raccord-moteur-v3", "branchement"), { recursive: true });
    const sortieGh = path.join(tmp, "gh-output"), envGh = path.join(tmp, "gh-env");
    const source = blocRun(WF, "Moteur v3 - source du moteur (depot prive ou copie du depot)");
    const env = { PATH: process.env.PATH, GITHUB_OUTPUT: sortieGh, GITHUB_ENV: envGh, JETON_MOTEUR_PRIVE: "" };
    const s1 = execFileSync("bash", ["-c", source], { cwd: tmp, encoding: "utf8", env: env });
    assert.match(fs.readFileSync(sortieGh, "utf8"), /^prive=non$/m);
    assert.match(fs.readFileSync(envGh, "utf8"), /^MOTEUR_V3_DIR=moteur-v3$/m);
    assert.match(s1, /::error title=Moteur v3::secret MOTEUR_V3_DEPOT_PRIVE absent et moteur-v3\/ retire du depot : aucun nouveau pari aujourd'hui/);
    const s2 = execFileSync("bash", ["-c", blocRun(WF, "Moteur v3 - raccord du site")], { cwd: tmp, encoding: "utf8", env: { PATH: process.env.PATH, MOTEUR_V3_DIR: "moteur-v3" } });
    assert.match(s2, /::error title=Moteur v3::moteur illisible dans moteur-v3/);
    assert.equal(fs.existsSync(path.join(tmp, "moteur-v3")), false, "rien n'est recree");
    // L'essai a blanc, lui, s'arrete tout de suite en rouge avec la vraie raison.
    const essai = fs.readFileSync(path.join(root, ".github", "workflows", "moteur-v3-essai-a-blanc.yml"), "utf8");
    const rEssai = spawnSync("bash", ["-c", blocRun(essai, "Source du moteur (depot prive ou copie du depot)")], { cwd: tmp, encoding: "utf8", env: env });
    assert.equal(rEssai.status, 1);
    assert.match(rEssai.stdout, /::error title=Essai a blanc du moteur v3::secret MOTEUR_V3_DEPOT_PRIVE absent et moteur-v3\/ retire du depot/);
    // Le pipeline lit une sortie absente : aucun pari, repli « aucun », alerte.
    const b = V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: path.join(tmp, "moteur-v3", "sortie_essai") }, config: CONFIG, nowMs: NOW });
    assert.equal(b.actif, true);
    assert.equal(b.repli, "aucun");
    assert.ok(b.alerte);
    assert.equal(b.choisirPourFixture({ fixtureId: 42, home: "Lens", away: "Lille" }).pickedMarket, null, "jamais un pari sans le moteur");
    // L'etape finale met le run au rouge (e-mail de GitHub au proprietaire).
    // (derniere etape du job : blocRun ne s'applique pas, on lit son run a la main)
    const iA = WF.indexOf("- name: Alerte moteur v3\n");
    const lignesA = [];
    for (const l of WF.slice(WF.indexOf("run: |\n", iA) + 7).split("\n")) {
      if (l.startsWith("          ")) lignesA.push(l.slice(10)); else if (l.trim() === "") lignesA.push(""); else break;
    }
    assert.match(lignesA.join("\n"), /exit 1/);
    const alerte = spawnSync("bash", ["-c", lignesA.join("\n")], { cwd: tmp, encoding: "utf8", env: { PATH: process.env.PATH, ETAPE_PYTHON: "failure", RUNNER_TEMP: tmp, GITHUB_STEP_SUMMARY: path.join(tmp, "resume") } });
    assert.equal(alerte.status, 1);
    assert.match(alerte.stdout, /::error title=Moteur v3 indisponible::/);
    // Avec moteur-v3/ present et sans secret : aucune alerte de la source (ancien comportement).
    fs.mkdirSync(path.join(tmp, "moteur-v3"));
    fs.writeFileSync(path.join(tmp, "moteur-v3", "requirements.lock"), "numpy==2\n");
    assert.doesNotMatch(execFileSync("bash", ["-c", source], { cwd: tmp, encoding: "utf8", env: env }), /::error/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// Preuve par EXECUTION (2e contre-controle, 30/09/2026) : on rejoue le VRAI genAnalyse
// du calcul du matin (extrait du workflow), avec un faux appel a l'IA qui renvoie la
// consigne recue. Cas de l'avocat du diable : moteur allume, sortie absente.
test("genAnalyse rejoue : jour de panne = consigne neutre, texte relu avant publication", async () => {
  const debut = WF.indexOf("cat > pipeline.js << 'JSEOF'\n");
  const script = WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => l.startsWith("          ") ? l.slice(10) : l).join("\n");
  const fnSrc = script.slice(script.indexOf("async function genAnalyse(d) {"), script.indexOf("// TRADUCTION DES TEXTES EDITORIAUX"));
  const fabrique = new Function("MOTEUR_V3", "ANT_KEY", "postJSONWithRetry", "MOTS_INTERDITS", fnSrc + "\nreturn genAnalyse;");
  const MOTS = require("../lib/analyse-mots-interdits.js");
  async function rejouer(env, reponse) {
    const b = V3.creerBranchement({ env: env, config: CONFIG, nowMs: NOW });
    if (b.actif) b.choisirPourFixture({ fixtureId: 42, home: "Lens", away: "Lille" });
    let prompt = null;
    const gen = fabrique(b, "cle-factice", async (hote, chemin, corps) => { prompt = corps.messages[0].content; return { content: [{ type: "text", text: JSON.stringify(reponse) }] }; }, MOTS);
    const an = await gen({ fixtureId: 42, home: "Lens", away: "Lille", league: "Ligue 1", date: "2026-10-03 21:00", stade: "Bollaert", no_signal: true, picked_market: null, mc_scores: [], all_markets: [] });
    return { an: an, decision: prompt.slice(prompt.indexOf("=== DECISION DEJA PRISE"), prompt.indexOf("=== TON ROLE")) };
  }
  const absent = path.join(os.tmpdir(), "iashark-sortie-absente-" + process.pid);
  const panne = await rejouer({ MOTEUR_V3: "1", MOTEUR_V3_SORTIE: absent }, { verdict_shark: "Match ouvert. Victoire sûre de Lens.", conseil: "Pari safe.", contexte: "Lens est 3e." });
  assert.match(panne.decision, /Aucun pari n'est publie sur ce match aujourd'hui\. N'invente ni marche ni cote/);
  assert.doesNotMatch(panne.decision, /historique insuffisant ou donnees|pas pu calculer|conditions de publication/);
  assert.deepEqual(panne.an, { verdict_shark: "Match ouvert.", conseil: "", contexte: "Lens est 3e." });
  // 3e contre-controle (30/09/2026) : le cas exact rejoue par l'avocat du diable.
  const promesse = await rejouer({ MOTEUR_V3: "1", MOTEUR_V3_SORTIE: absent }, { verdict_shark: "Nantes va certainement gagner. Victoire assurée.", conseil: "Aucun risque ce soir. Nantes reste sur 3 victoires.", contexte: "Sans aucun doute, Nantes l'emporte." });
  assert.deepEqual(promesse.an, { verdict_shark: "", conseil: "Nantes reste sur 3 victoires.", contexte: "" });
  // Moteur eteint : l'ancienne consigne de l'ancien moteur, inchangee.
  const eteint = await rejouer({}, { contexte: "Lens est 3e." });
  assert.match(eteint.decision, /historique insuffisant ou donnees de la saison en cours indisponibles/);
});

// Ronde 5 (30/09/2026). Point encore ouvert de l'avocat du diable : la consigne de l'IA
// donnait, en v3, l'ancienne « Probabilite but : X % » par tranche de 15 min (chiffre de
// l'ancien calcul, et la simulation par tranche est reservee aux Pro). On rejoue le VRAI
// genAnalyse avec des tranches : moteur allume, ce chiffre n'est plus envoye.
test("genAnalyse rejoue : moteur allume, plus de « Probabilite but » par tranche dans la consigne", async () => {
  const debut = WF.indexOf("cat > pipeline.js << 'JSEOF'\n");
  const script = WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => l.startsWith("          ") ? l.slice(10) : l).join("\n");
  const fnSrc = script.slice(script.indexOf("async function genAnalyse(d) {"), script.indexOf("// TRADUCTION DES TEXTES EDITORIAUX"));
  const fabrique = new Function("MOTEUR_V3", "ANT_KEY", "postJSONWithRetry", "MOTS_INTERDITS", fnSrc + "\nreturn genAnalyse;");
  const MOTS = require("../lib/analyse-mots-interdits.js");
  const TRANCHES = [
    { t: "0-15min", prob: 23, pct_home_mark: 11, pct_away_mark: 12, pct_home_conc: 13, pct_away_conc: 14 },
    { t: "75-90min", prob: 31, pct_home_mark: 21, pct_away_mark: 22, pct_home_conc: 23, pct_away_conc: 24 },
  ];
  async function consigne(b, fx) {
    let prompt = null;
    const gen = fabrique(b, "cle-factice", async (hote, chemin, corps) => { prompt = corps.messages[0].content; return { content: [{ type: "text", text: JSON.stringify({ contexte: "Texte." }) }] }; }, MOTS);
    await gen({ fixtureId: fx.fixture.id, home: fx.teams.home.name, away: fx.teams.away.name, league: "L", date: "2026-09-27 20:00", stade: "S", final_p1: 40, final_pN: 30, final_p2: 30, picked_market: { market: "Victoire Domicile", cote: "1.57", prob: 40 },
      all_markets: [{ id: "home-win", market: "Victoire Domicile", prob: 40, cote: "1.57" }], mc_scores: [], slotSummary: TRANCHES });
    return prompt;
  }
  const b = branchement();
  simulerRun(b, FIXTURES.austria);
  const v3 = await consigne(b, FIXTURES.austria);
  // Les donnees reelles par tranche restent (buts marques / encaisses), pas la probabilite.
  assert.match(v3, /=== BUTS PAR TRANCHE \(donnees reelles\) ===/);
  assert.match(v3, /marque 11% de ses buts ici, encaisse 14% des buts/);
  assert.doesNotMatch(v3, /Probabilite but/);
  assert.doesNotMatch(v3, /"prob":/);
  assert.match(v3, /\{"t":"0-15min","txt":"/);
  // Jour de panne (moteur allume, sortie absente) : pareil.
  const absent = path.join(os.tmpdir(), "iashark-sortie-absente-r5-" + process.pid);
  const panne = await consigne(V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: absent }, config: CONFIG, nowMs: NOW }), FIXTURES.austria);
  assert.doesNotMatch(panne, /Probabilite but|"prob":/);
  // Moteur eteint : l'ancienne consigne, inchangee.
  const eteint = await consigne(V3.creerBranchement({ env: {} }), FIXTURES.austria);
  assert.match(eteint, /encaisse 13% - Probabilite but: 23%/);
  assert.match(eteint, /\{"t":"0-15min","prob":23,"txt":"/);
});

// ===========================================================================
// ORIGINE DU CHIFFRE (condition 1 du mathematicien et de l'avocat du diable, 30/09/2026)
// ===========================================================================
// Hors d'Europe, le moteur calcule seul, sans la cote. L'origine est publiee dans le
// champ public moteur_v3 : la page (lib/match-view-model.js) et le canal
// (lib/telegram-posts.js) la lisent pour ne jamais annoncer « Sur 100 matchs… » ni
// « +X points » quand l'estimation du modele seul depasse la cote sans marge.
test("origine du chiffre publiee : « modèle seul » hors d'Europe, « modèle + cotes » avec la cote d'avant-match", () => {
  // Chaines du contrat §8 (moteur-v3/CONTRAT_SORTIE.md) et de l'ancien exemple.
  assert.equal(V3.origineProbabilite({ probabilite_source: "calcul IASHARK (modèle et cotes d'avant-match)" }), "modèle + cotes");
  assert.equal(V3.origineProbabilite({ probabilite_source: "mélange mesuré 3 cerveaux + cote avant-match sans marge" }), "modèle + cotes");
  assert.equal(V3.origineProbabilite({ probabilite_source: "calcul IASHARK (modèle seul)" }), "modèle seul");
  assert.equal(V3.origineProbabilite({ probabilite_source: "modèle seul (sélections, Elo international)" }), "modèle seul");
  // Source absente, vide ou ambigue : prudence, « modèle seul ».
  for (const src of [undefined, null, "", 12, "calcul IASHARK (modèle seul, sans la cote)"]) {
    assert.equal(V3.origineProbabilite({ probabilite_source: src }), "modèle seul", String(src));
  }
  assert.equal(V3.origineProbabilite(null), "modèle seul");
  // Pari MLS de la vraie sortie du moteur (preuve de l'avocat : pari MLS a 80 %,
  // cote sans marge a 72 %) : l'origine « modèle seul » part avec le match.
  const b = branchement({}, VRAIE, NOW_VRAIE);
  const mlsM = VRAIE.matchs.find((m) => m.ligue_code === "USA");
  const mls = simulerRun(b, fixtureDe(mlsM), { nowMs: NOW_VRAIE });
  assert.ok(mls.match.pari_rec, "pari MLS publie");
  assert.equal(mls.match.moteur_v3.source, "v3");
  assert.equal(mls.match.moteur_v3.origine_probabilite, "modèle seul");
  assert.deepEqual(mls.publique.moteur_v3, mls.match.moteur_v3, "champ public : aussi dans les fichiers publics");
  // Meme match, calcule avec la cote d'avant-match : « modèle + cotes ».
  const europe = clone(VRAIE);
  europe.matchs.find((m) => m.ligue_code === "USA").probabilite_source = "calcul IASHARK (modèle et cotes d'avant-match)";
  const avec = simulerRun(branchement({}, europe, NOW_VRAIE), fixtureDe(mlsM), { nowMs: NOW_VRAIE });
  assert.equal(avec.match.moteur_v3.origine_probabilite, "modèle + cotes");
  // Match sans pari v3 (repli, absent du moteur) : pas d'origine, jamais de chiffre v3.
  const absent = simulerRun(branchement(), FIXTURES.absent);
  assert.equal("origine_probabilite" in absent.match.moteur_v3, false);
  // La consigne du texte suit la meme regle.
  const b2 = branchement();
  simulerRun(b2, FIXTURES.pumas);
  simulerRun(b2, FIXTURES.austria);
  assert.equal(b2.donneesTexte({ fixtureId: FIXTURES.pumas.fixture.id }).v3_avec_cotes, true);
  assert.equal(b2.donneesTexte({ fixtureId: FIXTURES.austria.fixture.id }).v3_avec_cotes, false);
});
