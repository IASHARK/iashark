"use strict";
// UN PRONOSTIC SUR CHAQUE MATCH (plan de Clement, 03/10/2026) : lib/pronostic.js, son
// branchement dans le pipeline, la protection Pro (anti-fuite) et l'affichage de la liste.
//  - un pronostic sur chaque match qui a un modele ou des cotes (sauf match ferme) ;
//  - selection IASHARK (pari_rec, regle inchangee) = un pronostic marque selection ;
//    aucun pronostic sans pari_rec n'est marque selection (sous-ensemble) ;
//  - voies : v3 (1N2 / DC verifies, chances du Canal Pro), cotes du marche (marches
//    autorises seulement), sinon 1N2 du modele « en test » ;
//  - champ premium : jamais dans un fichier public hors match offert.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("../lib/pronostic.js");
const PREMIUM = require("../lib/premium-fields.js");
const HL = require("../home-list.js");
const CFG = require("../config/leagues.json");

const root = path.join(__dirname, "..");
const LIGUES = P.liguesCotesMarche(CFG);
const VER = "vérifié sur le passé";

const match = (extra) => Object.assign({ id: 1, home: { n: "Lens" }, away: { n: "Nice" }, date: "2026-10-03 20:00", league_key: "other", league_reliability: "en_test", no_signal: true, pari_rec: "" }, extra || {});

test("methode puissance : identique a celle du Canal Pro (canal-pro-menu.mjs)", async () => {
  const M = await import("../supabase/functions/_shared/canal-pro-menu.mjs");
  for (const c of [[2.09, 2.96, 4.05], [1.5, 4.2, 6.5], [1.9, 1.9], [3.1, 3.3, 2.4]]) {
    const a = P.sansMargePuissance(c), b = M.sansMargePuissance(c);
    a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12));
  }
  assert.equal(P.sansMargePuissance([1.5, "x"]), null);
});

test("la selection (pari_rec, regle inchangee) est le pronostic, avec SA chance et SA cote", () => {
  const m = match({ pari_rec: "DC 1X", market_id: "dc-1x", no_signal: false, chance_iashark: 74, chance_iashark_source: "le plus bas entre le modèle et la cote sans marge", cote_rec: "1.45", league_reliability: "validee", league_key: "ligue1", p1: 60, pn: 22, p2: 18 });
  const p = P.choisirPronostic(m, { ligues: LIGUES });
  assert.equal(p.selection, true);
  assert.equal(p.market_id, "dc-1x");
  assert.equal(p.chance, 74);
  assert.equal(p.cote, 1.45);
  assert.equal(p.libelle_fr, "Lens ou match nul");
  assert.equal(p.fiabilite, "vérifiée");
});

test("voie moteur v3 : 1N2 / double chance VERIFIES seulement, chance du Canal Pro", () => {
  const m = match({ league_key: "ligue1", league_reliability: "validee", v3_fiabilite: { couverture: "vérifiée" },
    v3_marches: [
      { cle: "1N2:1", market_id: "home-win", probabilite: 55, fiabilite_marche: VER, etiquette: VER },
      { cle: "DC:1N", market_id: "dc-1x", probabilite: 80, fiabilite_marche: VER, etiquette: VER },
      { cle: "DC:12", market_id: "dc-12", probabilite: 88, fiabilite_marche: "données limitées", etiquette: "données limitées" },
      { cle: "TOTAL:plus1.5", market_id: "over-15", probabilite: 90, fiabilite_marche: VER, etiquette: VER },
    ], cdc1x: "1.22", c1: "1.80", p1: 55, pn: 25, p2: 20 });
  const p = P.choisirPronostic(m, { ligues: LIGUES, chancesV3: { "1N2:1": 54, "DC:1N": 78, "DC:12": 86 } });
  assert.deepEqual([p.market_id, p.chance, p.cote, p.voie, p.fiabilite, p.selection], ["dc-1x", 78, 1.22, "v3", "vérifiée", false]);
  // Sans les chances du v3 (moteur eteint) : pas de voie v3.
  assert.equal(P.choisirPronostic(m, { ligues: LIGUES }).voie, "modele");
});

test("voie cotes du marche : seulement les marches autorises de la competition", () => {
  // Championship : DC et OU2.5 seulement (pas de 1N2).
  const m = match({ league_key: "championship", c1: "1.30", cn: "5.50", c2: "9.00", co25: "1.70", cu25: "2.20", cdc1x: "1.05", cdc2x: "3.40", dc12: "1.15" });
  const p = P.choisirPronostic(m, { ligues: LIGUES });
  assert.equal(p.voie, "cotes_marche");
  assert.equal(p.fiabilite, "vérifiée");
  assert.ok(["dc-1x", "dc-x2", "dc-12", "over-25", "under-25"].includes(p.market_id));
  // dc-1x (1,05) et dc-12 (1,15) sont sous la cote minimale de 1,20 : la suivante.
  assert.equal(p.market_id, "over-25");
  assert.ok(p.cote >= 1.2);
  assert.equal(p.selection, false);
  // Ligue des nations (selections_cotes_marche) : 1N2 et DC.
  const ldn = P.choisirPronostic(match({ league_key: "nations_league", league_id: 5, league: "UEFA Nations League", c1: "2.09", cn: "2.96", c2: "4.05", co25: "1.40", cu25: "2.90" }), { ligues: LIGUES });
  assert.equal(ldn.voie, "cotes_marche");
  assert.ok(!["over-25", "under-25"].includes(ldn.market_id));
});

test("hors des competitions verifiees : 1N2 le plus probable du modele, « en test »", () => {
  const p = P.choisirPronostic(match({ league_key: "copa_del_rey", p1: 48.6, pn: 27, p2: 24.4 }), { ligues: LIGUES });
  assert.deepEqual([p.market_id, p.chance, p.voie, p.fiabilite, p.libelle_fr], ["home-win", 49, "modele", "en test", "Victoire Lens"]);
  // Amicaux internationaux : jamais la voie cotes du marche.
  const ami = P.choisirPronostic(match({ league_key: "other", league_id: 10, league: "Friendlies", c1: "1.5", cn: "4", c2: "6", p1: 60, pn: 25, p2: 15 }), { ligues: LIGUES });
  assert.equal(ami.voie, "modele");
  assert.equal(ami.fiabilite, "en test");
});

test("match ferme ou sans aucun chiffre : pas de pronostic", () => {
  assert.equal(P.choisirPronostic(match({ no_signal_reason: "KICKOFF_PASSED", p1: 50, pn: 25, p2: 25 }), { ligues: LIGUES }), null);
  assert.equal(P.choisirPronostic(match({}), { ligues: LIGUES }), null);
});

test("poserPronostics : selection ⊂ pronostics, amorce publique, compteurs seulement", () => {
  const ms = [
    match({ id: 1, league_key: "ligue1", league_reliability: "validee", pari_rec: "Over 2.5", market_id: "over-25", no_signal: false, chance_iashark: 63, cote_rec: "1.70", p1: 40, pn: 30, p2: 30 }),
    match({ id: 2, p1: 40, pn: 30, p2: 30 }),
    match({ id: 3, league_key: "premier", c1: "2.10", cn: "3.40", c2: "3.50" }),
    match({ id: 4, no_signal_reason: "KICKOFF_PASSED", p1: 40, pn: 30, p2: 30, pronostic: { vieux: true }, pronostic_dispo: true }),
  ];
  const r = P.poserPronostics(ms, { configLigues: CFG });
  assert.deepEqual(r, { avec: 3, sans: 1, selections: 1, voies: { selection: 1, v3: 0, cotes_marche: 1, modele: 1 } });
  ms.filter((m) => m.pari_rec && !m.no_signal).forEach((m) => { assert.equal(m.pronostic.selection, true); assert.equal(m.pronostic.market_id, m.market_id); });
  ms.filter((m) => !(m.pari_rec && !m.no_signal)).forEach((m) => assert.ok(!m.pronostic || m.pronostic.selection === false));
  assert.equal(ms[3].pronostic, undefined, "match ferme : ancien pronostic retire");
  assert.equal(ms[3].pronostic_dispo, undefined);
  assert.doesNotMatch(JSON.stringify(r), /Over|over-25|63|1\.70/);
});

test("anti-fuite : pronostic est premium (data.json, Edge, page match), pronostic_dispo est public", () => {
  assert.ok(PREMIUM.PREMIUM_PAYLOAD_FIELDS.includes("pronostic"));
  assert.ok(!PREMIUM.PREMIUM_FIELDS.includes("pronostic_dispo"));
  const m = match({ p1: 40, pn: 30, p2: 30 });
  P.poserPronostics([m], { configLigues: CFG });
  const pub = PREMIUM.stripPremium(m);
  assert.equal(pub.pronostic, undefined);
  assert.equal(pub.pronostic_dispo, true);
  assert.deepEqual(PREMIUM.deepPremiumLeaks([pub]), []);
  assert.ok(PREMIUM.deepPremiumLeaks([{ id: 9, home: { n: "A" }, away: { n: "B" }, autre: { pronostic: {} } }]).length, "cle cherchee en profondeur");
  const offert = Object.assign({}, m, { is_free: true });
  assert.ok(PREMIUM.stripPremium(offert).pronostic, "match offert : pronostic visible");
  assert.deepEqual(Object.keys(PREMIUM.premiumPayload(m)), ["p1", "pn", "p2", "pronostic"].filter((k) => k in PREMIUM.premiumPayload(m)));
  const edge = fs.readFileSync(path.join(root, "supabase/functions/match-data/index.ts"), "utf8");
  assert.match(edge, /"pronostic",\n/);
  assert.match(fs.readFileSync(path.join(root, "match-page.js"), "utf8"), /const CHAMPS_PREMIUM=\[[^\]]*"pronostic"/);
});

test("pipeline : pronostics poses apres la chance IASHARK, avant le match offert et les fichiers publics", () => {
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "update-data.yml"), "utf8");
  const script = wf.slice(wf.indexOf("cat > pipeline.js << 'JSEOF'"), wf.indexOf("          JSEOF"));
  const i = script.indexOf("PRONOSTIC.poserPronostics(allMatchsData,");
  assert.ok(i > script.indexOf("CHANCE_IASHARK.poserChance(m)"));
  assert.ok(i < script.indexOf("(function designerMatchGratuit(){"));
  assert.ok(i < script.indexOf("var matchsPublics="));
  assert.ok(i < script.indexOf("PREMIUM_FIELDS_LIB.premiumPayload("));
  // Le match offert est une selection (pronostic.selection) : jamais un match sans selection.
  assert.match(script, /var analysable=function\(m\)\{ return m && .*estSelectionDuJour\(m\) && competitionOffrable\(m\)/);
  // Journal : compteurs seulement.
  assert.match(script, /console\.log\('  \[PRONOSTIC\] '\+rapportProno\.avec\+/);
});

test("liste : pronostic verrouille hors Pro (aucun champ premium lu), visible pour un Pro", () => {
  const H = Object.assign(HL.defaultHelpers(), { heure: () => "20:00", matchTimestamp: () => Date.now() + 3 * 3600e3, matchDay: () => "2026-10-03", marketIdLabel: () => "Lens ou nul", lien: (p) => "/" + p, hasReliableModelOutput: () => true, leagueName: () => "L" });
  const ctx = (x) => Object.assign({ isPro: false, freeMatchId: null, nowTs: Date.now(), favorites: { has: () => false }, collapsed: {}, lockedHref: "match" }, x || {});
  const reads = [];
  const cible = match({ id: 77, has_signal: false, no_signal: true, pronostic_dispo: true, pronostic: { market_id: "dc-1x", chance: 78, fiabilite: "vérifiée", selection: false } });
  const m = new Proxy(cible, { get(t, k) { if (typeof k === "string" && PREMIUM.PREMIUM_FIELDS.includes(k)) reads.push(k); return t[k]; } });
  const html = HL.renderMatchRow(m, ctx(), H, 0);
  // hasSignal (deja en place) regarde pari_rec / market_id, absents des fichiers publics ;
  // le pronostic lui-meme n'est jamais lu hors Pro.
  assert.deepEqual(reads.filter((k) => k !== "pari_rec" && k !== "market_id"), []);
  assert.match(html, /is-locked/);
  assert.match(html, /Débloquer avec Pro/);
  assert.doesNotMatch(html, /78|Lens ou nul|Pas de signal clair/);
  const pro = HL.renderMatchRow(cible, ctx({ isPro: true }), H, 0);
  assert.match(pro, /is-prono/);
  assert.match(pro, /<b>78<\/b><small>%<\/small>/);
  assert.match(pro, /Lens ou nul/);
  assert.doesNotMatch(pro, /Sélection IASHARK/, "un pronostic seul n'est pas une selection");
  // Selection : pastille « ✓ Sélection IASHARK » (amorce publique has_signal).
  const sel = HL.renderMatchRow(match({ id: 78, has_signal: true, no_signal: false, selection_iashark: true }), ctx(), H, 0);
  assert.match(sel, /hl-tag-sel">✓ Sélection IASHARK</);
  // Pari affiche mais pas « Sélection IASHARK » (cote sous 1,20) : pas de pastille.
  const sous = HL.renderMatchRow(match({ id: 79, has_signal: true, no_signal: false }), ctx(), H, 0);
  assert.doesNotMatch(sous, /Sélection IASHARK/);
});

// Donnees reelles du jour (data.json public) : chaque match a venir qui a des cotes ou un
// modele recoit un pronostic, et la copie publique n'en laisse rien fuiter.
test("donnees reelles (data.json) : un pronostic sur chaque match ouvert, aucune fuite publique", { skip: !fs.existsSync(path.join(root, "data.json")) }, () => {
  const d = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
  const ms = (d.matchs || []).map((m) => JSON.parse(JSON.stringify(m)));
  P.poserPronostics(ms, { configLigues: CFG });
  // Selection d'un match payant (has_signal sans pari_rec) : son detail n'est pas dans le
  // fichier public ; dans le pipeline, le match complet porte pari_rec et son pronostic.
  const ouverts = ms.filter((m) => !(m.has_signal && !m.pari_rec) && !/^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String(m.no_signal_reason || "")) && (m.p1 != null || (Number(m.c1) > 1 && Number(m.cn) > 1 && Number(m.c2) > 1)));
  ouverts.forEach((m) => assert.ok(m.pronostic, "sans pronostic : " + m.id));
  ms.filter((m) => m.pronostic && m.pronostic.selection).forEach((m) => assert.ok(m.pari_rec && !m.no_signal));
  const publics = ms.map((m) => PREMIUM.stripPremium(m));
  assert.deepEqual(PREMIUM.deepPremiumLeaks(publics), []);
});

test("cote minimale 1,20 (decision de Clement) : jamais « Pays-Bas ou nul a 1,02 »", () => {
  // Pays-Bas - Serbie : 1X a 1,02 (95 %), 12 a 1,20, 1 a 1,32.
  const m = match({ league_key: "nations_league", league_id: 5, league: "UEFA Nations League", c1: "1.32", cn: "5.20", c2: "9.50", cdc1x: "1.02", cdc2x: "3.40", dc12: "1.20" });
  const p = P.choisirPronostic(m, { ligues: LIGUES });
  assert.ok(p.cote >= 1.2, "cote " + p.cote);
  assert.notEqual(p.market_id, "dc-1x");
  // Aucune issue a 1,20 ou plus : le 1N2 le plus probable.
  const q = P.choisirPronostic(match({ league_key: "championship", c1: "1.30", cn: "5.5", c2: "9", co25: "1.15", cu25: "4.5", cdc1x: "1.05", cdc2x: "3.4", dc12: "1.1" }), { ligues: LIGUES });
  assert.ok(q, "un pronostic quand meme");
  // Aucune cote connue a 1,20 ou plus (pas de cotes) : le 1N2 le plus probable.
  const r = P.choisirPronostic(match({ league_key: "copa_del_rey", p1: 70, pn: 18, p2: 12 }), { ligues: LIGUES });
  assert.equal(r.market_id, "home-win");
});

test("selections nationales verifiees (VERIF-SELECTIONS.md) : selection du site par la regle du robot, amicaux exclus", () => {
  assert.deepEqual(P.clesSelectionsCotes(CFG), ["nations_league", "wcq_europe"]);
  const ldn = match({ id: 10, league_key: "nations_league", league_id: 5, league: "UEFA Nations League", c1: "1.75", cn: "3.70", c2: "4.80", cdc1x: "1.20", cdc2x: "2.05", dc12: "1.30", co25: "1.9", cu25: "1.9" });
  const ami = match({ id: 11, league_key: "other", league_id: 10, league: "Friendlies", c1: "1.75", cn: "3.70", c2: "4.80", p1: 52, pn: 27, p2: 21 });
  const hors = match({ id: 12, league_key: "nations_league", league_id: 5, league: "UEFA Nations League", c1: "1.15", cn: "7", c2: "15", cdc1x: "1.02", cdc2x: "4.5", dc12: "1.08" });
  const fige = match({ id: 13, league_key: "nations_league", league_id: 5, league: "UEFA Nations League", pari_rec: "DC X2", market_id: "dc-x2", no_signal: false, chance_iashark: 70, cote_rec: "1.45", c1: "1.75", cn: "3.70", c2: "4.80" });
  const rows = [{ fixture_id: 10 }, { fixture_id: 13 }];
  assert.equal(P.poserSelectionsNationales([ldn, ami, hors, fige], rows, { configLigues: CFG }), 1);
  assert.equal(ldn.market_id, "home-win", "1N2 / DC dans la fourchette 1,40-2,00, le plus probable");
  assert.equal(ldn.pari_rec, "Victoire Domicile");
  assert.equal(ldn.cote_rec, "1.75");
  assert.equal(ldn.no_signal, false);
  assert.ok(ldn.chance_iashark > 50 && ldn.chance_iashark < 60);
  assert.deepEqual(rows[0], { fixture_id: 10, pari_rec: "Victoire Domicile", market_id: "home-win", marche: "Victoire Domicile", cote_rec: "1.75", model_probability: ldn.model_probability });
  assert.ok(!ami.pari_rec, "amical : jamais");
  assert.ok(!hors.pari_rec, "aucun marche dans la fourchette : pas de selection");
  assert.equal(fige.market_id, "dc-x2", "selection deja posee (gel) : intouchee");
  P.poserPronostics([ldn, ami, hors], { configLigues: CFG });
  assert.deepEqual([ldn.pronostic.selection, ldn.pronostic.moteur, ldn.pronostic.fiabilite, ldn.pronostic.market_id], [true, "cotes_marche", "vérifiée", "home-win"]);
  assert.equal(hors.pronostic.selection, false);
  assert.equal(ami.pronostic.voie, "modele");
});

test("fourchette et plafond des selections nationales = ceux des selections simples du robot", async () => {
  const M = await import("../supabase/functions/_shared/canal-pro-menu.mjs");
  assert.equal(P.FOURCHETTE_SELECTION.cote_min, M.MENU.simple.cote_min);
  assert.equal(P.FOURCHETTE_SELECTION.cote_max, M.MENU.simple.cote_max);
  assert.equal(P.FOURCHETTE_SELECTION.max_par_jour, M.MENU.simple.max);
});

test("selections nationales : au plus 3 par jour, les plus hautes chances ; le gel compte", () => {
  const ldn = (id, c1, date) => match({ id: id, date: date || "2026-10-03 20:45", league_key: "nations_league", league_id: 5, league: "UEFA Nations League", c1: c1, cn: "3.60", c2: "5.50" });
  const ms = [ldn(1, "1.95"), ldn(2, "1.50"), ldn(3, "1.80"), ldn(4, "1.45"), ldn(5, "1.62"), ldn(6, "1.50", "2026-10-04 20:45")];
  assert.equal(P.poserSelectionsNationales(ms, [], { configLigues: CFG }), 4);
  assert.deepEqual(ms.filter((m) => m.pari_rec).map((m) => m.id).sort(), [2, 4, 5, 6], "le 03 : les 3 plus probables (cotes 1,45 / 1,50 / 1,62) ; le 04 : son match");
  // Une selection deja figee ce jour compte dans les 3.
  const gel = ldn(7, "1.70"); Object.assign(gel, { pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, chance_iashark: 55, cote_rec: "1.70" });
  const ms2 = [gel, ldn(1, "1.95"), ldn(2, "1.50"), ldn(3, "1.80"), ldn(4, "1.45")];
  assert.equal(P.poserSelectionsNationales(ms2, [], { configLigues: CFG }), 2);
});

test("cote sous 1,20 : jamais « Sélection IASHARK » (ni pastille, ni match offert), le pronostic reste", () => {
  const m = match({ league_key: "ligue1", league_reliability: "validee", pari_rec: "DC 1X", market_id: "dc-1x", no_signal: false, chance_iashark: 88, cote_rec: "1.15" });
  P.poserPronostics([m], { configLigues: CFG });
  assert.equal(m.pronostic.market_id, "dc-1x");
  assert.equal(m.pronostic.selection, false);
  assert.equal(m.selection_iashark, undefined);
  const ok = match({ id: 2, league_key: "ligue1", league_reliability: "validee", pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, chance_iashark: 60, cote_rec: "1.55" });
  P.poserPronostics([ok], { configLigues: CFG });
  assert.equal(ok.selection_iashark, true);
  // Repli « Victoire Pays-Bas 1,17 » : un pronostic, jamais une selection.
  const nl = match({ id: 3, league_key: "nations_league", league_id: 5, league: "UEFA Nations League", c1: "1.17", cn: "6.50", c2: "15", cdc1x: "1.02", cdc2x: "4.6", dc12: "1.10" });
  P.poserSelectionsNationales([nl], [], { configLigues: CFG });
  P.poserPronostics([nl], { configLigues: CFG });
  assert.deepEqual([nl.pronostic.market_id, nl.pronostic.cote, nl.pronostic.selection, nl.pari_rec], ["home-win", 1.17, false, ""]);
});

test("avis de la page match : competition verifiee par les cotes du marche -> plus « Fiabilité : en test »", () => {
  const m = match({ league_key: "league_two", league_reliability: "en_test", c1: "2.10", cn: "3.30", c2: "3.40" });
  P.poserPronostics([m], { configLigues: CFG });
  assert.equal(m.fiabilite_cotes_marche, true);
  assert.ok(!PREMIUM.PREMIUM_FIELDS.includes("fiabilite_cotes_marche") && !PREMIUM.PREMIUM_FIELDS.includes("selection_iashark"), "amorces publiques");
  const hors = match({ league_key: "copa_del_rey", p1: 50, pn: 25, p2: 25 });
  P.poserPronostics([hors], { configLigues: CFG });
  assert.equal(hors.fiabilite_cotes_marche, undefined);
  const js = fs.readFileSync(path.join(root, "match-page.js"), "utf8");
  assert.match(js, /function relBadgeVm\(vm,info\)\{return vm&&vm\.model&&vm\.model\.leagueInTest===true\?\(verifieMarche\(vm\)\?marcheBadge\(\):testBadge\(\)\):relBadge\(info\);\}/);
  assert.match(js, /leagueInTest===true&&!verifieMarche\(vm\)\?`<span class="hero-test">/);
});

test("competition en test : le pari reste un pronostic, jamais une « Sélection IASHARK » (avocat-du-diable 03/10)", () => {
  const m = match({ league_key: "league_two", league_reliability: "en_test", pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, chance_iashark: 62, cote_rec: "1.60", p1: 62, pn: 22, p2: 16 });
  const p = P.choisirPronostic(m, { ligues: LIGUES });
  assert.ok(p, "le pronostic est affiche");
  assert.equal(p.selection, false);
  assert.equal(p.fiabilite, "en test");
});

test("noms en francais dans le libelle (selections nationales)", () => {
  const m = match({ home: { n: "Netherlands" }, away: { n: "Serbia" }, league_key: "ligue1", league_reliability: "validee", pari_rec: "DC X2", market_id: "dc-x2", no_signal: false, chance_iashark: 60, cote_rec: "1.50", p1: 40, pn: 30, p2: 30 });
  assert.equal(P.choisirPronostic(m, { ligues: LIGUES }).libelle_fr, "Match nul ou Serbie");
});
