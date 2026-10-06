"use strict";
// REGLE DE CLEMENT DU 04/10/2026, 20 h :
//   « Chaque decision affichee ne doit plus jamais changer, qu'elle soit pour aujourd'hui ou pour demain.
//     Seule exception : les buteurs, si le joueur n'est pas dans la composition. Le match gratuit reste le
//     meme de 00 h a 23 h 59 (heure de Paris), quoi qu'il arrive. »
// Un test par regle, en enchainant les VRAIES fonctions dans l'ordre du calcul quotidien
// (.github/workflows/update-data.yml) : gel, chance, pronostic, pari, chance affichee, option « cote plus
// haute », ligne premium ecrite puis relue au calcul suivant. Match offert : tests/match-offert-v3.test.js
// (bloc du pipeline execute) et ci-dessous ; buteurs : lib/buteurs-figes.js, lib/tickets-du-jour.js, mise a
// jour legere des jours de match (scripts/buteurs-jour-de-match.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const P = require("../lib/pronostic.js");
const PF = require("../lib/pick-freeze.js");
const PREMIUM = require("../lib/premium-fields.js");
const B = require("../lib/buteurs-figes.js");
const J = require("../lib/run-output/jambes-du-jour.js");
const T = require("../lib/tickets-du-jour.js");
const LEGER = require("../lib/buteurs-jour-de-match.js");
const SCRIPT_LEGER = require("../scripts/buteurs-jour-de-match.js");
// Bornes du 04/10 (1,40-1,70) passees dans la config : mecanique du gel inchangee (bornes du depot : 1,40-2,20, 06/10).
const CFG = Object.assign({}, require("../config/leagues.json"), { fiabilite: Object.assign({}, require("../config/leagues.json").fiabilite, { fourchette_pari: { cote_min: 1.4, cote_max: 1.7, marge_sans_agree: 0.02 } }) });
const WF = fs.readFileSync(path.join(ROOT, ".github", "workflows", "update-data.yml"), "utf8");
const SCRIPT = WF.slice(WF.indexOf("cat > pipeline.js << 'JSEOF'"), WF.indexOf("          JSEOF"));
const clone = (v) => JSON.parse(JSON.stringify(v));

// --------------------------------------------------------------------------- calcul complet d'un match
const KO = "2026-10-09 20:45";
const FX = { fixture: { id: 101, status: { short: "NS" }, timestamp: Date.parse("2026-10-09T18:45:00Z") / 1000 } };
function frais(o) {
  return Object.assign({ id: 101, league_key: "ligue1", league_id: 61, league: "Ligue 1", date: KO, status: "NS",
    home: { n: "Lyon", id: 80 }, away: { n: "Nantes", id: 83 }, c1: "1.60", cn: "4.00", c2: "5.50", co25: "3.80", cu25: "1.45",
    cdc1x: "1.42", cdc2x: "2.40", cdc12: "1.25", pari_rec: "", no_signal: true, model_output_available: true,
    data_quality_score: 60, data_quality_label: "Moyenne", market_source: "Cotes moyennes multi-bookmakers" }, o || {});
}
// Un calcul : memes etapes, meme ordre que le pipeline apres la garde coup d'envoi. -> { gel, m, ecrit }.
function calcul(fresh, precedent, nowIso, extra) {
  extra = extra || {};
  const row = { fixture_id: 101, raw_response: {} };
  const gel = PF.freezeAnalysis(fresh, precedent, { nowMs: Date.parse(nowIso), fixture: FX, premiumRow: row, exceptionGel: P.motifExceptionGel, previousPublic: extra.previousPublic || null });
  const figes = {};
  if (["FROZEN", "FROZEN_CLOSED", "POSTPONED_CLOSED"].includes(gel.status)) figes["101"] = true;
  const m = gel.match, rows = [gel.premiumRow];
  P.poserChancesAffichees([m], { figes });
  P.poserPronostics([m], { configLigues: CFG, figes });
  P.publierPronostics([m], rows, { configLigues: CFG, figes, nowIso });
  P.alignerChancesAffichees([m], rows, { configLigues: CFG, figes });
  P.poserOptionCote([m], { configLigues: CFG, figes });
  // Ce que writePremiumData ecrit et que le calcul suivant relit (lirePublicationsPrecedentes).
  const ecrit = clone(Object.assign({}, rows[0], { premium_fields: PREMIUM.premiumPayload(m), updated_at: nowIso }));
  return { gel, m, ecrit };
}
// Ce que voit l'utilisateur d'un pari : marche, cote, chance, option, pastille, pronostic.
const vu = (m) => clone({ pari: m.pari_rec, marche: m.market_id, cote: Number(m.cote_rec), chance: m.model_probability, chance_iashark: m.chance_iashark,
  option: m.option_cote || null, pastille: m.selection_iashark === true, pronostic: m.pronostic ? { market_id: m.pronostic.market_id, chance: m.pronostic.chance, selection: m.pronostic.selection } : null });

test("1. pari publie a J, puis calcul a J (midi) et a J+1 avec d'autres cotes : pari, cote, chance, option et pastille identiques", () => {
  const j = calcul(frais(), null, "2026-10-08T01:00:00Z");
  assert.equal(j.gel.status, "NOT_FREEZABLE", "premiere publication");
  assert.deepEqual([j.m.market_id, j.m.cote_rec, j.m.model_probability], ["dc-1x", "1.42", 84]);
  assert.equal(j.m.option_cote.market_id, "under-25", "une option « cote plus haute » est publiee");
  const avant = vu(j.m);
  // Midi : les cotes ont bouge (le 1X n'est plus dans la fourchette, la victoire est a 1,42, plus d'option possible).
  const midi = calcul(frais({ c1: "1.42", cn: "4.6", c2: "7.5", co25: "1.62", cu25: "2.30", cdc1x: "1.08" }), j.ecrit, "2026-10-08T12:00:00Z");
  assert.equal(midi.gel.status, "FROZEN");
  assert.deepEqual(vu(midi.m), avant, "J midi : rien n'a bouge");
  // J+1 : autres cotes encore, nouvelle regle possible ; relu depuis la ligne ecrite a midi.
  const lendemain = calcul(frais({ c1: "1.75", cn: "3.6", c2: "4.6", co25: "1.55", cu25: "2.40", cdc1x: "1.25" }), midi.ecrit, "2026-10-09T01:00:00Z");
  assert.equal(lendemain.gel.status, "FROZEN");
  assert.deepEqual(vu(lendemain.m), avant, "J+1 : rien n'a bouge");
  assert.deepEqual(clone(lendemain.m.option_cote), clone(j.m.option_cote), "option publiee recopiee telle quelle");
});

test("1 bis. pari fige sans option publiee : aucune option n'apparait ensuite (poserOptionCote ne touche jamais un fige)", () => {
  const m = { id: 5, pari_rec: "Victoire Domicile", market_id: "home-win", cote_rec: "1.55", no_signal: false, league_key: "ligue1", c1: "1.55", cn: "4", c2: "6", cdc1x: "1.45", cdc2x: "2.5", cdc12: "1.3" };
  P.poserOptionCote([m], { configLigues: CFG, figes: { 5: true } });
  assert.equal(m.option_cote, undefined);
  const avecOption = Object.assign({}, m, { option_cote: { market_id: "dc-1x", cote: 1.6, chance: 71 } });
  P.poserOptionCote([avecOption], { configLigues: CFG, figes: { 5: true } });
  assert.deepEqual(avecOption.option_cote, { market_id: "dc-1x", cote: 1.6, chance: 71 });
  // Non fige : recalcule comme avant.
  const libre = Object.assign({}, avecOption);
  P.poserOptionCote([libre], { configLigues: CFG, figes: {} });
  assert.notDeepEqual(libre.option_cote, { market_id: "dc-1x", cote: 1.6, chance: 71 });
});

test("1 ter. chance affichee d'un pari fige : jamais recalculee, meme si la cote sans marge relue a change (avant : 61 -> 55)", () => {
  const m = { id: 9, pari_rec: "Victoire Domicile", market_id: "home-win", cote_rec: "1.60", no_signal: false, model_probability: 61, chance_iashark: 61,
    cote_source: "anj", sans_marge_anj: { "home-win": 55 } };
  const ancien = Object.assign({}, m);
  require("../lib/chance-iashark.js").poserChance(ancien);
  assert.equal(ancien.chance_iashark, 55, "l'ancien calcul changeait la chance d'un pari fige");
  const r = P.poserChancesAffichees([m], { figes: { 9: true } });
  assert.deepEqual([m.chance_iashark, r.gardees], [61, 1]);
  // Publication ancienne sans chance : calculee une fois (puis restauree par le gel).
  const sans = Object.assign({}, m, { chance_iashark: undefined });
  P.poserChancesAffichees([sans], { figes: { 9: true } });
  assert.equal(sans.chance_iashark, 55);
  // Pipeline : plus aucun poserChance sur tous les matchs ; option et chance passent le gel.
  assert.match(SCRIPT, /PRONOSTIC\.poserChancesAffichees\(allMatchsData,\{figes:GEL_FIGES\}\);/);
  assert.doesNotMatch(SCRIPT, /allMatchsData\.forEach\(function\(m\)\{ CHANCE_IASHARK\.poserChance\(m\); \}\);/);
  assert.match(SCRIPT, /PRONOSTIC\.poserOptionCote\(allMatchsData,\{configLigues:LEAGUES_CONFIG,cotesAnjPar:LIVRES_ANJ,figes:GEL_FIGES\}\)/);
});

test("c. pari fige hors fourchette : pronostic, pastille « Sélection IASHARK » et place gardes (avant : pastille retiree)", () => {
  const m = { id: 7, league_key: "premier", pari_rec: "Victoire Domicile", market_id: "home-win", cote_rec: "1.85", no_signal: false, chance_iashark: 58,
    pronostic: { market_id: "home-win", chance: 58, selection: true, voie: "selection" } };
  P.poserPronostics([m], { configLigues: CFG, figes: { 7: true } });
  assert.deepEqual([m.pronostic.selection, m.selection_iashark, m.pronostic.chance], [true, true, 58]);
  // Le meme match non fige : la regle du jour (fourchette) s'applique, comme avant.
  const libre = Object.assign({}, m, { pronostic: Object.assign({}, m.pronostic) });
  P.poserPronostics([libre], { configLigues: CFG, figes: {} });
  assert.equal(libre.selection_iashark, undefined);
});

test("a. exception au gel UNIQUE : seulement pour un pari publie avant le 2026-10-04 18:00 UTC", () => {
  assert.equal(PF.FIN_EXCEPTION_GEL, "2026-10-04T18:00:00Z");
  const fx = { fixture: { id: 701, status: { short: "NS" }, timestamp: Date.parse("2026-10-06T19:00:00Z") / 1000 } };
  const tirs = (frozenAt, updatedAt) => ({ fixture_id: 701, pari_rec: "Corners du match over 9.5", cote_rec: 1.5, market_id: "total-corners-over-9_5", marche: "CORNERS", model_probability: 67.5,
    premium_fields: { p1: 40 }, raw_response: frozenAt ? { pick_freeze: { frozen_at: frozenAt, kickoff: "2026-10-06 21:00" } } : {}, updated_at: updatedAt || frozenAt });
  const sansCote = (frozenAt) => Object.assign(tirs(frozenAt), { pari_rec: "Victoire Domicile", market_id: "home-win", marche: "RESULTAT", cote_rec: null });
  const gel = (prev, extra) => PF.freezeAnalysis(frais({ id: 701, date: "2026-10-06 21:00" }), prev, Object.assign({ nowMs: Date.parse("2026-10-05T03:00:00Z"), fixture: fx, premiumRow: { fixture_id: 701 }, exceptionGel: P.motifExceptionGel }, extra || {}));
  // Avant 18:00 UTC : remplace (une seule fois), trace gardee.
  const avant = gel(tirs("2026-10-04T17:59:59Z"));
  assert.notEqual(avant.status, "FROZEN");
  assert.equal(avant.reason, "GEL_EXCEPTION");
  assert.equal(avant.remplacement.motif, "marche_non_verifie");
  assert.equal(gel(sansCote("2026-10-03T08:00:00Z")).reason, "GEL_EXCEPTION");
  // A 18:00 ou apres : plus jamais remplace, quel que soit le marche ou la cote.
  for (const t of ["2026-10-04T18:00:00Z", "2026-10-04T23:00:00Z", "2026-10-05T01:00:00Z"]) {
    assert.equal(gel(tirs(t)).status, "FROZEN", "tirs " + t);
    assert.equal(gel(tirs(t)).match.pari_rec, "Corners du match over 9.5");
    assert.equal(gel(sansCote(t)).status, "FROZEN", "sans cote " + t);
  }
  // Heure de publication : metadonnees du gel, sinon pick_frozen_at du data.json precedent, sinon updated_at
  // (toujours posterieure a la publication : sur un doute, le pari reste fige). Illisible : fige.
  assert.equal(gel(tirs(null, "2026-10-04T10:00:00Z")).reason, "GEL_EXCEPTION");
  assert.equal(gel(tirs(null, "2026-10-04T19:00:00Z")).status, "FROZEN");
  assert.equal(gel(tirs(null, "2026-10-04T19:00:00Z"), { previousPublic: { id: 701, pick_frozen_at: "2026-10-03T09:00:00Z" } }).reason, "GEL_EXCEPTION");
  assert.equal(gel(Object.assign(tirs(null), { updated_at: null })).status, "FROZEN");
  // Le pari qui remplace (publie apres 18:00) ne sera lui-meme plus jamais remplace.
  const relu = Object.assign({}, avant.premiumRow, { premium_fields: PREMIUM.premiumPayload(avant.match), updated_at: "2026-10-05T03:00:00Z" });
  assert.equal(gel(Object.assign(relu, { pari_rec: "Corners du match over 9.5", market_id: "total-corners-over-9_5", cote_rec: 1.5 })).status, "FROZEN");
});

test("pari publie puis match reprogramme (plus de 24 h) avant l'heure d'origine : meme pari (jamais un pari B)", () => {
  const j = calcul(frais(), null, "2026-10-07T01:00:00Z");
  const r = calcul(frais({ date: "2026-10-12 20:45", c1: "1.45" }), j.ecrit, "2026-10-08T01:00:00Z");
  assert.equal(r.gel.status, "FROZEN");
  assert.deepEqual(vu(r.m), vu(j.m));
});

// --------------------------------------------------------------------------- match offert
test("b. match offert : le meme de 00 h a 23 h 59 (Paris), designe le matin, garde a midi (hors fourchette), le soir (commence) et reporte", () => {
  const jour = "2026-10-08";
  const designe = [{ id: 1, date: jour + " 21:00", is_free: true, free_day: jour }, { id: 2, date: "2026-10-09 18:00", is_free: true, free_day: "2026-10-09" }];
  const etats = {
    "midi, pari hors fourchette": { id: 1, date: jour + " 21:00", pari_rec: "Victoire Domicile", cote_rec: "1.95" },
    "soir, commence": { id: 1, date: jour + " 21:00", pari_rec: "Victoire Domicile", cote_rec: "1.55", pick_closed: true, no_signal_reason: "KICKOFF_PASSED" },
    "reporte au 12, sans pari": { id: 1, date: "2026-10-12 21:00", pari_rec: "", no_signal: true, no_signal_reason: "KICKOFF_POSTPONED" },
    "sans cote": { id: 1, date: jour + " 21:00", pari_rec: "Victoire Domicile", cote_rec: "" },
  };
  for (const [nom, cur] of Object.entries(etats)) {
    const k = PF.keptFreeDesignations(designe, [cur, { id: 2, date: "2026-10-09 18:00" }, { id: 3, date: jour + " 20:00", pari_rec: "Over 1.5" }], { today: jour });
    assert.equal(k[jour].id, 1, nom);
    assert.equal(k["2026-10-09"].id, 2, nom + " : demain aussi garde");
  }
  // Pipeline : plus aucune regle qui retire une designation en cours de journee.
  const bloc = SCRIPT.slice(SCRIPT.indexOf("(function designerMatchGratuit(){"), SCRIPT.indexOf("\n            })();", SCRIPT.indexOf("(function designerMatchGratuit(){")));
  assert.doesNotMatch(bloc, /delete gardes\[j\]/);
  assert.match(bloc, /if\(joursDejaOfferts\[j\]\)\{ console\.log\('::warning title=Match offert::/);
  assert.match(bloc, /m\.free_day=jourOffert\[String\(m\.id\)\]/);
});

// --------------------------------------------------------------------------- buteurs
const onze = (debut, noms) => Array.from({ length: 11 }, (_, i) => ({ id: debut + i, name: (noms && noms[i]) || ("Titulaire" + String.fromCharCode(65 + i) + " Joueur" + i) }));
function matchButeurs(o) {
  return Object.assign({ id: 101, date: "2026-10-04 21:00", league_key: "ligue1", league: "Ligue 1", home: { n: "Lyon", id: 80 }, away: { n: "Nantes", id: 83 },
    pari_rec: "Victoire Domicile", no_signal: false }, o || {});
}
const PUBLIES = [
  { joueur_id: 11, joueur: "Alexandre Lacazette", cote: "home", p_marque: 0.41, chance: 40 },
  { joueur_id: 12, joueur: "Rayan Cherki", cote: "home", p_marque: 0.33, chance: 30 },
  { joueur_id: 21, joueur: "Moses Simon", cote: "away", p_marque: 0.22, chance: 20 },
];
const FRAIS = [
  { joueur_id: 13, joueur: "Georges Mikautadze", cote: "home", p_marque: 0.45, chance: 45 },
  { joueur_id: 12, joueur: "Rayan Cherki", cote: "home", p_marque: 0.30, chance: 30 },
  { joueur_id: 22, joueur: "Matthis Abline", cote: "away", p_marque: 0.25, chance: 25 },
];
const NOW_B = Date.parse("2026-10-04T16:00:00Z"); // 18:00 a Paris
const FX_B = { 101: { fixture: { id: 101, status: { short: "NS" }, timestamp: Date.parse("2026-10-04T19:00:00Z") / 1000 } } };
const VERDICTS_GO = { match: { premier_buteur: "GO" }, tickets: { chance_ticket: "GO", selection_or: "GO", buteur_du_jour: "GO" }, categories_no_go: [] };

test("2. buteurs de la page match : liste servie gardee (memes joueurs, memes chiffres) tant que la composition n'est pas publiee", () => {
  const m = matchButeurs({ v3_buteurs: clone(FRAIS) });
  const r = B.figerButeurs([m], { 101: { fixture_id: 101, premium_fields: { v3_buteurs: clone(PUBLIES) } } }, { nowMs: NOW_B, fixtureById: FX_B, champs: ["v3_buteurs"], verdicts: VERDICTS_GO });
  assert.deepEqual(m.v3_buteurs, PUBLIES, "jamais le calcul du jour a la place de la liste servie");
  assert.deepEqual([r.figes, r.remplaces, r.retires], [1, 0, 0]);
  // Jamais servie : le calcul du jour (premiere publication de la liste).
  const neuf = matchButeurs({ v3_buteurs: clone(FRAIS) });
  B.figerButeurs([neuf], { 101: { fixture_id: 101, premium_fields: {} } }, { nowMs: NOW_B, fixtureById: FX_B, verdicts: VERDICTS_GO });
  assert.deepEqual(neuf.v3_buteurs, FRAIS);
});

test("2. exception buteurs : remplace SEULEMENT si la composition officielle est publiee sans lui (ou absence annoncee), avant le coup d'envoi", () => {
  const lineups = { home: { startXI: onze(100, ["Rayan Cherki", "Georges Mikautadze"]) }, away: { startXI: onze(200, ["Moses Simon"]) } };
  const m = matchButeurs({ v3_buteurs: clone(FRAIS), lineups: lineups });
  const r = B.figerButeurs([m], { 101: { fixture_id: 101, premium_fields: { v3_buteurs: clone(PUBLIES) } } }, { nowMs: NOW_B, fixtureById: FX_B, champs: ["v3_buteurs"], verdicts: VERDICTS_GO });
  // Lacazette (absent) remplace par le plus probable du jour de la meme equipe ; Cherki et Simon (titulaires) inchanges.
  assert.deepEqual(m.v3_buteurs.map((b) => b.joueur), ["Georges Mikautadze", "Rayan Cherki", "Moses Simon"]);
  assert.deepEqual(m.v3_buteurs[1], PUBLIES[1], "un titulaire garde SES chiffres publies");
  assert.deepEqual([r.remplaces, r.retires], [1, 0]);
  // Match commence (analyse restauree figee) : plus aucun remplacement.
  const commence = matchButeurs({ v3_buteurs: clone(FRAIS), lineups: lineups, pick_closed: true, no_signal_reason: "KICKOFF_PASSED" });
  B.figerButeurs([commence], { 101: { fixture_id: 101, premium_fields: { v3_buteurs: clone(PUBLIES) } } }, { nowMs: NOW_B, fixtureById: FX_B, verdicts: VERDICTS_GO });
  assert.deepEqual(commence.v3_buteurs, PUBLIES);
  // Nom ecrit autrement (« A. Lacazette ») : jamais retire sur un doute.
  const variante = matchButeurs({ lineups: { home: { startXI: onze(100, ["A. Lacazette", "Rayan Cherki"]) }, away: lineups.away } });
  assert.equal(B.absenceDe(variante, { id: null, nom: "Alexandre Lacazette" }, "home"), null);
  // Absence annoncee pour ce match (pas « Questionable ») : absent, meme sans composition.
  const blesse = matchButeurs({ injuries: [{ name: "A. Lacazette", player_id: 11, team: 80, type: "Missing Fixture" }] });
  assert.equal(B.absenceDe(blesse, { id: 11, nom: "Alexandre Lacazette" }, "home"), "absent_annonce");
  const incertain = matchButeurs({ injuries: [{ name: "A. Lacazette", player_id: 11, team: 80, type: "Questionable" }] });
  assert.equal(B.absenceDe(incertain, { id: 11, nom: "Alexandre Lacazette" }, "home"), null);
  // Selection : hors de l'effectif convoque (au moins 15 joueurs lus).
  const effectif = matchButeurs({ effectif: { home: onze(300).concat(onze(400)), away: [] } });
  assert.equal(B.absenceDe(effectif, { id: 7, nom: "Cristiano Ronaldo" }, "home"), "hors_effectif");
  assert.equal(B.absenceDe(effectif, { id: 7, nom: "Cristiano Ronaldo" }, "away"), null, "effectif inconnu : il reste");
});

test("2. premier buteur et ancien calcul : memes regles ; interrupteur d'urgence et premier buteur sans feu vert jamais restaures", () => {
  const prev = { 101: { fixture_id: 101, premium_fields: { v3_premiers_buteurs: [{ joueur_id: 11, joueur: "Alexandre Lacazette", cote: "home", chance: 14 }],
    top_scorers: [{ player_id: 11, name: "A. Lacazette", team_id: 80 }, { player_id: 21, name: "M. Simon", team_id: 83 }] } } };
  const m = matchButeurs({ v3_premiers_buteurs: [{ joueur_id: 13, joueur: "Georges Mikautadze", cote: "home", chance: 16 }], top_scorers: [{ player_id: 13, name: "G. Mikautadze", team_id: 80 }] });
  B.figerButeurs([m], prev, { nowMs: NOW_B, fixtureById: FX_B, verdicts: VERDICTS_GO });
  assert.equal(m.v3_premiers_buteurs[0].joueur, "Alexandre Lacazette");
  assert.deepEqual(m.top_scorers.map((x) => x.name), ["A. Lacazette", "M. Simon"]);
  const nogo = matchButeurs({});
  B.figerButeurs([nogo], prev, { nowMs: NOW_B, fixtureById: FX_B, verdicts: { match: { premier_buteur: "NO-GO" } } });
  assert.equal(nogo.v3_premiers_buteurs, undefined);
  const urgence = matchButeurs({ moteur_v3: { source: "v3", raison: "MOTEUR_V3_URGENCE" } });
  B.figerButeurs([urgence], { 101: { fixture_id: 101, premium_fields: { v3_buteurs: clone(PUBLIES) } } }, { nowMs: NOW_B, fixtureById: FX_B, verdicts: VERDICTS_GO });
  assert.equal(urgence.v3_buteurs, undefined);
  // Pipeline : avant les tickets (v3_buteurs, top_scorers), apres les sections (premier buteur).
  const iFige = SCRIPT.indexOf("BUTEURS_FIGES.figerButeurs(allMatchsData,PUBLICATIONS_PRECEDENTES.lignes,{nowMs:Date.now(),fixtureById:FIXTURE_BY_ID,champs:['v3_buteurs','top_scorers']});");
  const iPremiers = SCRIPT.indexOf("BUTEURS_FIGES.figerButeurs(allMatchsData,PUBLICATIONS_PRECEDENTES.lignes,{nowMs:Date.now(),fixtureById:FIXTURE_BY_ID,champs:['v3_premiers_buteurs']});");
  assert.ok(iFige > 0 && iFige < SCRIPT.indexOf("TICKETS_DU_JOUR.publierTicketsDuJour("));
  assert.ok(iPremiers > SCRIPT.indexOf("SECTIONS_MATCH.poserSections(allMatchsData)") && iPremiers < SCRIPT.indexOf("SECTIONS_MATCH.poserContenusPro(allMatchsData)"));
});

// Faux PostgREST pour tickets_du_jour (comme tests/tickets-du-jour-gel.test.js).
function fauxTickets(ligne, opts) {
  opts = opts || {};
  const appels = [];
  const f = async function (url, init) {
    init = init || {};
    const corps = init.body ? JSON.parse(init.body) : null;
    appels.push({ url, method: init.method || "GET", body: corps });
    if ((init.method || "GET") === "GET") return { ok: true, status: 200, json: async () => (ligne ? [clone(ligne)] : []) };
    if (init.method === "PATCH" && /type=eq\.buteur/.test(url) && corps && corps.contenu) {
      // Migration 0051 appliquee : contenu garde ; absente : le gel de 0050 remet l'ancien.
      return { ok: true, status: 200, json: async () => [Object.assign({}, ligne, corps, opts.migrationAbsente ? { contenu: ligne.contenu } : {})] };
    }
    return { ok: true, status: 204, json: async () => null };
  };
  f.appels = appels;
  return f;
}
const BUTEUR_PUBLIE = { joueur: "Alexandre Lacazette", joueur_id: 11, cote: "home", fixture_id: 101, coup_envoi: "2026-10-04 21:00", coup_envoi_ms: Date.parse("2026-10-04T19:00:00Z"), chance: 40 };
function matchsDuJour(lineups) {
  return [matchButeurs({ v3_buteurs: clone(PUBLIES).concat([{ joueur_id: 13, joueur: "Georges Mikautadze", cote: "home", p_marque: 0.38 }]), lineups: lineups || null })];
}
const LINEUPS_SANS_LACAZETTE = { home: { startXI: onze(100, ["Rayan Cherki", "Georges Mikautadze"]) }, away: { startXI: onze(200, ["Moses Simon"]) } };

test("2. buteur du jour absent de la composition : remplace (trace de l'ancien gardee), jamais sinon", async () => {
  const ligne = { type: "buteur", meta: {}, contenu: BUTEUR_PUBLIE, etats: {} };
  const ctx = (f, lineups) => ({ matchs: matchsDuJour(lineups), fixtureById: FX_B, nowMs: NOW_B, supabase: { url: "https://essai.supabase.co", cle: "x" }, fetch: f, verdicts: VERDICTS_GO, avertir: () => {} });
  // Composition pas publiee : rien n'est ecrit.
  const f0 = fauxTickets(ligne);
  assert.equal((await T.actualiserButeurDuJour(ctx(f0))).statut, "present");
  assert.ok(!f0.appels.some((a) => a.method === "PATCH"));
  // Composition publiee sans lui : remplace par le plus probable du jour encore present (Mikautadze).
  const f1 = fauxTickets(ligne);
  assert.equal((await T.actualiserButeurDuJour(ctx(f1, LINEUPS_SANS_LACAZETTE))).statut, "remplace");
  const patch = f1.appels.find((a) => a.method === "PATCH");
  assert.equal(patch.body.contenu.joueur, "Georges Mikautadze");
  assert.deepEqual(patch.body.etats.remplacements.map((x) => [x.motif, x.ancien.joueur]), [["absent_composition", "Alexandre Lacazette"]]);
  assert.equal(patch.body.premier_coup_envoi, new Date(patch.body.contenu.coup_envoi_ms).toISOString());
  // Migration 0051 absente : avertissement, joueur marque retire, l'ancienne trace jamais perdue.
  const avert = [];
  const f2 = fauxTickets(Object.assign({}, ligne, { etats: { remplacements: [{ motif: "absent_annonce", ancien: { joueur: "Avant" } }] } }), { migrationAbsente: true });
  const r2 = await T.actualiserButeurDuJour(Object.assign(ctx(f2, LINEUPS_SANS_LACAZETTE), { avertir: (t) => avert.push(t) }));
  assert.equal(r2.statut, "retire");
  assert.match(avert.join(" "), /migration 0051 non appliquee/);
  const dernier = f2.appels.filter((a) => a.method === "PATCH").pop();
  assert.deepEqual(dernier.body, { etats: { remplacements: [{ motif: "absent_annonce", ancien: { joueur: "Avant" } }], joueur: "retire" } });
  // Calcul de la nuit (publierTicketsDuJour) : meme regle ; un buteur seulement sorti des titulaires probables reste.
  const f3 = fauxTickets(ligne);
  const r3 = await T.publierTicketsDuJour({ matchs: [matchButeurs({ v3_buteurs: [] })], fixtureById: FX_B, nowMs: NOW_B, configLigues: CFG, verdicts: VERDICTS_GO,
    supabase: { url: "https://essai.supabase.co", cle: "x" }, fetch: f3, avertir: () => {}, erreur: () => {} });
  assert.equal(r3.buteur, "deja_publie");
  assert.ok(!f3.appels.some((a) => a.method === "PATCH" && /tickets_du_jour\?/.test(a.url)), "aucun etat « retire » sans composition");
});

test("2. buteurDuJour : jamais un joueur exclu (deja remplace) ni absent de la composition", () => {
  const ms = matchsDuJour(LINEUPS_SANS_LACAZETTE);
  const b = J.buteurDuJour(ms, { nowMs: NOW_B, fixtureById: FX_B, categoriesNoGo: [] });
  assert.equal(b.joueur, "Georges Mikautadze", "Lacazette (0,41) absent de la composition : jamais choisi");
  const b2 = J.buteurDuJour(ms, { nowMs: NOW_B, fixtureById: FX_B, categoriesNoGo: [], exclure: [{ fixture_id: 101, joueur_id: 13 }] });
  assert.equal(b2.joueur, "Rayan Cherki");
});

test("migration 0051 : seul le remplacement du buteur absent est autorise, trace gardee, jamais appliquee par le calcul", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0051_tickets_buteur_remplacement.sql"), "utf8");
  assert.match(sql, /create or replace function public\.tickets_du_jour_gel\(\)/);
  assert.match(sql, /old\.type = 'buteur'/);
  assert.match(sql, /derniere ->> 'motif' in \('absent_composition', 'absent_annonce', 'hors_effectif'\)/);
  assert.match(sql, /derniere -> 'ancien' = old\.contenu/);
  assert.match(sql, /ko > now\(\)/);
  assert.match(sql, /\(nouveaux - \(jsonb_array_length\(nouveaux\) - 1\)\) = anciens/, "la trace existante est recopiee a l'identique");
  for (const k of ["jour", "type", "regle_version", "meta", "publie_a", "pipeline_sha"]) assert.match(sql, new RegExp("new\\." + k + " := old\\." + k + ";"), k);
  assert.match(sql, /new\.contenu := old\.contenu;/);
  assert.match(sql, /suppression refusee/);
  assert.match(sql, /NE PAS APPLIQUER sans l'accord de Clement/);
  assert.ok(fs.existsSync(path.join(ROOT, "supabase/tests/0051_tickets_buteur_remplacement.test.sql")));
  assert.equal(fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.startsWith("0051_")).length, 1);
  assert.deepEqual(T.MOTIFS_REMPLACEMENT, ["absent_composition", "absent_annonce", "hors_effectif"]);
});

// --------------------------------------------------------------------------- mise a jour legere des jours de match
function fauxMonde(opts) {
  opts = opts || {};
  const appels = [];
  const premium = clone(opts.premium || {});
  const f = async function (url, init) {
    init = init || {};
    const corps = init.body ? JSON.parse(init.body) : null;
    appels.push({ url, method: init.method || "GET", body: corps });
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (/api-sports\.io\/fixtures\?ids=/.test(url)) return ok({ errors: [], response: (opts.fixtures || []) });
    if (/fixtures\/lineups\?fixture=(\d+)/.test(url)) return ok(opts.refus ? { errors: { requests: "plafond" }, response: [] } : { errors: [], response: opts.lineups || [] });
    if (/injuries\?fixture=/.test(url)) return ok(opts.refus ? { errors: { requests: "plafond" }, response: [] } : { errors: [], response: opts.injuries || [] });
    if (/players\/squads\?team=(\d+)/.test(url)) { const t = /team=(\d+)/.exec(url)[1]; return ok({ errors: [], response: opts.squads && opts.squads[t] ? [{ team: { id: Number(t) }, players: opts.squads[t] }] : [] }); }
    if (/match_premium_data\?select=/.test(url)) return ok(Object.keys(premium).map((id) => ({ fixture_id: Number(id), premium_fields: premium[id] })));
    if (/match_premium_data\?fixture_id=eq\.(\d+)/.test(url) && init.method === "PATCH") { premium[/eq\.(\d+)/.exec(url)[1]] = corps.premium_fields; return { ok: true, status: 204, json: async () => null }; }
    if (/tickets_du_jour\?select=/.test(url)) return ok(opts.ticket ? [clone(opts.ticket)] : []);
    if (/tickets_du_jour\?jour=eq\./.test(url) && init.method === "PATCH") return ok([Object.assign({}, opts.ticket, corps)]);
    return { ok: false, status: 404, json: async () => ({}) };
  };
  f.appels = appels;
  f.premium = premium;
  return f;
}
function ecrireData(matchs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buteurs-leger-"));
  const p = path.join(dir, "data.json");
  fs.writeFileSync(p, JSON.stringify({ matchs: matchs }));
  return p;
}
const ENV = { APISPORTS_KEY: "cle-essai", SUPABASE_URL: "https://essai.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "cle-essai" };
const API_ONZE = (debut, noms) => onze(debut, noms).map((p) => ({ player: p }));

test("mise a jour legere : aucun match proche -> aucun appel", async () => {
  const f = fauxMonde();
  const p = ecrireData([{ id: 101, date: "2026-10-04 23:30", status: "NS" }]);
  const r = await SCRIPT_LEGER.lancer({ env: ENV, fetch: f, nowMs: NOW_B, dataPath: p, journal: () => {}, avertir: () => {} });
  assert.deepEqual([r.statut, r.appels, f.appels.length], ["aucun_match", 0, 0]);
  assert.equal(LEGER.reglages(require("../config/quotas.json")).fenetre_minutes, 135);
});

test("mise a jour legere : joueur absent retire des buteurs (rien d'autre ecrit), buteur du jour remplace ; refus de l'API -> rien retire", async () => {
  const data = [
    { id: 101, date: "2026-10-04 19:00", status: "NS", league_key: "ligue1", league: "Ligue 1", league_id: 61, home: { n: "Lyon", id: 80 }, away: { n: "Nantes", id: 83 } },
    { id: 102, date: "2026-10-04 21:00", status: "NS", league_key: "ligue1", league: "Ligue 1", league_id: 61, home: { n: "Lens", id: 116 }, away: { n: "Nice", id: 84 } },
  ];
  const pf101 = { v3_buteurs: clone(PUBLIES), v3_premiers_buteurs: [{ joueur_id: 11, joueur: "Alexandre Lacazette", cote: "home", chance: 14 }],
    top_scorers: [{ player_id: 11, name: "A. Lacazette", team_id: 80 }], pronostic: { market_id: "home-win", chance: 61 }, option_cote: { market_id: "dc-1x", cote: 1.5 } };
  const pf102 = { v3_buteurs: [{ joueur_id: 31, joueur: "Florian Sotoca", cote: "home", p_marque: 0.30 }] };
  const opts = {
    fixtures: [{ fixture: { id: 101, status: { short: "NS" }, timestamp: Date.parse("2026-10-04T17:00:00Z") / 1000 } }],
    lineups: [{ team: { id: 80 }, startXI: API_ONZE(100, ["Rayan Cherki"]) }, { team: { id: 83 }, startXI: API_ONZE(200, ["Moses Simon"]) }],
    premium: { 101: pf101, 102: pf102 },
    ticket: { type: "buteur", meta: {}, contenu: Object.assign({}, BUTEUR_PUBLIE, { coup_envoi: "2026-10-04 19:00", coup_envoi_ms: Date.parse("2026-10-04T17:00:00Z") }), etats: {} },
  };
  const f = fauxMonde(opts);
  const p = ecrireData(data);
  const r = await SCRIPT_LEGER.lancer({ env: ENV, fetch: f, nowMs: NOW_B, dataPath: p, journal: () => {}, avertir: () => {}, verdicts: VERDICTS_GO });
  assert.equal(r.statut, "fait");
  assert.equal(r.matchs_proches, 1, "seul le match de 19:00 est dans les 2 h 15");
  // Composition complete : ni absences ni effectif demandes (2 appels : statut + composition).
  assert.equal(r.appels, 2);
  const apres = f.premium["101"];
  assert.deepEqual(apres.v3_buteurs.map((b) => b.joueur), ["Rayan Cherki", "Moses Simon"]);
  assert.deepEqual(apres.v3_buteurs[0], PUBLIES[1], "chiffres publies inchanges");
  assert.equal(apres.v3_premiers_buteurs.length, 0);
  assert.equal(apres.top_scorers.length, 0);
  assert.deepEqual([apres.pronostic, apres.option_cote], [pf101.pronostic, pf101.option_cote], "aucun autre champ touche");
  assert.deepEqual(f.premium["102"], pf102, "match lointain jamais touche");
  assert.equal(r.joueurs_retires, 3);
  // Buteur du jour (Lacazette, absent) : remplace par le plus probable du jour encore present (Cherki, 0,33).
  assert.equal(r.buteur_du_jour, "remplace");
  const patchTicket = f.appels.find((a) => a.method === "PATCH" && /tickets_du_jour/.test(a.url));
  assert.equal(patchTicket.body.contenu.joueur, "Rayan Cherki");
  assert.equal(patchTicket.body.etats.remplacements[0].ancien.joueur, "Alexandre Lacazette");
  // Le journal ne cite jamais un joueur.
  const lignes = [];
  await SCRIPT_LEGER.lancer({ env: ENV, fetch: fauxMonde(opts), nowMs: NOW_B, dataPath: p, journal: (t) => lignes.push(t), avertir: (t) => lignes.push(t) });
  assert.doesNotMatch(lignes.join(" "), /Lacazette|Cherki|Simon|Sotoca/);
  // Refus de l'API (plafond) : jamais lu comme « aucune absence » ni « composition sans lui » : rien retire.
  const fr = fauxMonde(Object.assign({}, opts, { refus: true }));
  const rr = await SCRIPT_LEGER.lancer({ env: ENV, fetch: fr, nowMs: NOW_B, dataPath: p, journal: () => {}, avertir: () => {} });
  assert.equal(rr.joueurs_retires, 0);
  assert.deepEqual(fr.premium["101"], pf101);
  assert.ok(!fr.appels.some((a) => a.method === "PATCH"));
});

test("mise a jour legere : selection nationale, joueur parti du rassemblement (hors effectif convoque) retire avant la composition", async () => {
  const data = [{ id: 501, date: "2026-10-04 19:00", status: "NS", league_key: "wcq_europe", league: "World Cup - Qualification Europe", league_id: 32, home: { n: "Portugal", id: 27 }, away: { n: "Norway", id: 1090 } }];
  const squadPortugal = onze(600).concat(onze(700)).map((p) => ({ id: p.id, name: p.name }));
  const f = fauxMonde({
    fixtures: [{ fixture: { id: 501, status: { short: "NS" }, timestamp: Date.parse("2026-10-04T17:00:00Z") / 1000 } }],
    squads: { 27: squadPortugal },
    premium: { 501: { v3_buteurs: [{ joueur_id: 874, joueur: "Cristiano Ronaldo", cote: "home", p_marque: 0.4 }, { joueur_id: 600, joueur: squadPortugal[0].name, cote: "home", p_marque: 0.2 }] } },
  });
  const r = await SCRIPT_LEGER.lancer({ env: ENV, fetch: f, nowMs: NOW_B, dataPath: ecrireData(data), journal: () => {}, avertir: () => {} });
  assert.deepEqual(f.premium["501"].v3_buteurs.map((b) => b.joueur_id), [600]);
  assert.equal(r.effectifs, 1, "effectif de la Norvege illisible : pas d'effectif, personne retire de ce cote");
});

test("workflow de la mise a jour legere : 10:07-21:37 UTC toutes les 30 min, secrets existants, jamais de commit", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/buteurs-jour-de-match.yml"), "utf8");
  assert.match(wf, /cron: '7,37 10-21 \* \* \*'/);
  assert.match(wf, /APISPORTS_KEY: \$\{\{ secrets\.APISPORTS_KEY \}\}/);
  assert.match(wf, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(wf, /run: node scripts\/buteurs-jour-de-match\.js/);
  assert.match(wf, /permissions:\n  contents: read/);
  assert.doesNotMatch(wf, /git (commit|push)/);
});
