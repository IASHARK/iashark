"use strict";
// CALCUL DU 04/10/2026 (decisions de Clement du 03/10, 23 h) : les 30 championnats, les coupes et
// les selections (dont la Ligue des nations) avec un pari publie ; Colombie, Perou et Afrique du
// Sud retires ; chance AFFICHEE juste (corrigee quand une categorie est trop optimiste) ; option
// « cote plus haute » (regle A) en champ Pro ; jamais bet365 ni Pinnacle dans un fichier public ;
// aucun message Telegram envoye par le calcul. Source des listes : PLAN-MOTEUR-2026-10-03.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "leagues.json"), "utf8"));
const P = require("../lib/pronostic.js");
const PREMIUM = require("../lib/premium-fields.js");
const WF = fs.readFileSync(path.join(ROOT, ".github", "workflows", "update-data.yml"), "utf8");
const SCRIPT = WF.slice(WF.indexOf("cat > pipeline.js << 'JSEOF'"), WF.indexOf("          JSEOF"));

// Les 30 championnats du plan (id API-Football).
const TRENTE = { ligue1: 61, premier: 39, laliga: 140, seriea: 135, bundesliga: 78, eredivisie: 88, primeira: 94,
  championship: 40, bundesliga2: 79, italy_serieb: 136, spain_segunda: 141, belgium_pro: 144, turkey_superlig: 203,
  scotland_premiership: 179, ligue2: 62, greece_superleague: 197, denmark_superliga: 119, switzerland_superleague: 207,
  austria_bundesliga: 218, ekstraklasa: 106, eliteserien: 103, suede: 113, mls: 253, argentina_liga_profesional: 128,
  liga_mx: 262, brazil_seriea: 71, jleague: 98, saudi_proleague: 307, k_league1: 292, chile_primera: 265 };
const COUPES = { fa_cup: 45, efl_cup: 48, coupe_de_france: 66, copa_del_rey: 143, coppa_italia: 137, dfb_pokal: 81 };
const TOURNOIS = { ldc: 2, el: 3, ecl: 848, libertadores: 13, sudamericana: 11, club_world_cup: 15, leagues_cup: 772,
  nations_league: 5, wcq_europe: 32, wcq_south_america: 34, euro: 4, euro_qualifiers: 960, copa_america: 9, africa_cup: 6, gold_cup: 22 };

const parCle = {};
CFG.leagues.forEach((l) => { parCle[l.key] = l; });

test("competitions : les 30 championnats, les 6 coupes et les tournois du plan, chacun avec un pari publie", () => {
  for (const liste of [TRENTE, COUPES, TOURNOIS]) {
    for (const [k, id] of Object.entries(liste)) {
      assert.ok(parCle[k], k + " absent de config/leagues.json");
      assert.equal(parCle[k].apiFootballId, id, k);
      assert.ok(Array.isArray(CFG.fiabilite.paris_cotes_marche[k]) && CFG.fiabilite.paris_cotes_marche[k].length, k + " sans pari");
    }
  }
  assert.equal(Object.keys(TRENTE).length, 30);
  // Une competition de la liste = une competition a paris (rien d'autre n'est analyse).
  CFG.leagues.forEach((l) => assert.ok(CFG.fiabilite.paris_cotes_marche[l.key], l.key));
  const ids = CFG.leagues.map((l) => l.apiFootballId);
  assert.equal(new Set(ids).size, ids.length, "id en double");
  // Selections : 1N2 et double chance seulement ; coupes d'Europe : 1N2 seulement (plan).
  ["nations_league", "wcq_europe", "euro_qualifiers", "wcq_south_america"].forEach((k) => assert.deepEqual(CFG.fiabilite.paris_cotes_marche[k], ["1N2", "DC"], k));
  ["ldc", "el", "ecl"].forEach((k) => assert.deepEqual(CFG.fiabilite.paris_cotes_marche[k], ["1N2"], k));
  // Familles verifiees le 02/10 gardees (Championship, Autriche, Pologne : pas de 1N2).
  Object.entries(CFG.fiabilite.ligues_validees_cotes_marche).forEach(([k, f]) => { if (parCle[k]) assert.deepEqual(CFG.fiabilite.paris_cotes_marche[k], f, k); });
});

test("retires : Colombie, Perou, Afrique du Sud (et League One/Two, Championship ecossais) hors calcul, pages en 301", () => {
  const retirees = CFG.competitions_retirees.map((l) => l.key);
  ["colombia_primera_a", "peru_primera", "south_africa_premiership", "league_one", "league_two", "scotland_championship"].forEach((k) => {
    assert.ok(!parCle[k], k + " encore analyse");
    assert.ok(retirees.includes(k), k + " absent de competitions_retirees (redirections 301)");
  });
  const red = fs.readFileSync(path.join(ROOT, "_redirects"), "utf8");
  ["primera-a-colombia", "liga-1-peru", "premier-soccer-league"].forEach((slug) => {
    ["fr", "en", "es", "gb", "mx", "za"].forEach((d) => assert.match(red, new RegExp("^/" + d + "/leagues/" + slug + "\\.html\\s+/" + d + "/\\s+301!", "m"), d + " " + slug));
  });
  const LC = require("../scripts/match-lifecycle.js");
  assert.equal(typeof LC.writeRedirects, "function");
  const C = require("../scripts/seo-common.js");
  assert.ok(C.isRetiredLeague("colombia_primera_a") && !C.isRetiredLeague("ligue1"));
});

test("bornes du moteur inchangees : seules les competitions de clubs du socle sont « top » (16 apres les 3 retraits)", () => {
  const { LEAGUE_IDS } = require("../lib/engine.js");
  assert.deepEqual(LEAGUE_IDS, [39, 140, 135, 78, 61, 2, 3, 848, 88, 94, 253, 113, 98, 262, 128, 265]);
});

test("lib/league-names.js recopie config/leagues.json (id, nom, noms traduits)", () => {
  const LN = require("../lib/league-names.js");
  CFG.leagues.forEach((l) => {
    assert.equal(LN.LEAGUES[l.key].id, l.apiFootballId, l.key);
    assert.equal(LN.displayName(l.key), l.displayName, l.key);
    if (l.names) Object.keys(l.names).forEach((loc) => assert.equal(LN.displayName(l.key, null, loc), l.names[loc], l.key + " " + loc));
  });
});

// --------------------------------------------------------------------------- chance corrigee
const REGLES = CFG.fiabilite.corrections_chance;

test("chance corrigee : seulement des baisses mesurees, la plus forte, jamais une hausse", () => {
  assert.deepEqual(P.chanceCorrigee(59, REGLES, { ligue: "nations_league", famille: "1N2", option: "principale", cote: 1.6 }).chance, 56);
  assert.equal(P.chanceCorrigee(70, REGLES, { ligue: "argentina_liga_profesional", famille: "DC", option: "principale", cote: 1.3 }).chance, 57);
  assert.equal(P.chanceCorrigee(70, REGLES, { ligue: "argentina_liga_profesional", famille: "1N2", option: "principale", cote: 1.3 }).chance, 70);
  // Pologne : double chance seulement dans la tranche 75-85 %.
  assert.equal(P.chanceCorrigee(80, REGLES, { ligue: "ekstraklasa", famille: "DC", option: "principale", cote: 1.2 }).chance, 75);
  assert.equal(P.chanceCorrigee(70, REGLES, { ligue: "ekstraklasa", famille: "DC", option: "principale", cote: 1.3 }).chance, 70);
  // Ligue 2 : cotes 1,20-1,50 seulement.
  assert.equal(P.chanceCorrigee(73, REGLES, { ligue: "ligue2", famille: "DC", option: "principale", cote: 1.35 }).chance, 71);
  assert.equal(P.chanceCorrigee(55, REGLES, { ligue: "ligue2", famille: "1N2", option: "principale", cote: 1.8 }).chance, 55);
  // Option « cote plus haute » (regle A) : -6 partout, la plus forte baisse si plusieurs regles.
  assert.equal(P.chanceCorrigee(72, REGLES, { ligue: "premier", famille: "DC", option: "cote", cote: 1.4 }).chance, 66);
  assert.equal(P.chanceCorrigee(72, REGLES, { ligue: "argentina_liga_profesional", famille: "DC", option: "cote", cote: 1.4 }).chance, 59);
  // Aucune regle ne monte une chance, meme mal ecrite.
  assert.equal(P.chanceCorrigee(60, [{ ligue: "*", famille: "*", option: "*", points: 5 }], { ligue: "x" }).chance, 60);
  assert.equal(P.chanceCorrigee(null, REGLES, {}), null);
  REGLES.forEach((r) => assert.ok(r.points < 0 && typeof r.source === "string" && r.source.length > 10, JSON.stringify(r)));
});

// --------------------------------------------------------------------------- publication
function match(extra) {
  return Object.assign({ id: 101, league_key: "nations_league", league_id: 5, league: "UEFA Nations League", date: "2026-10-09 20:45",
    home: { n: "France", id: 2 }, away: { n: "Belgium", id: 1 }, c1: "1.60", cn: "4.00", c2: "5.50", co25: "1.90", cu25: "1.90",
    cdc1x: "1.15", cdc2x: "2.40", cdc12: "1.25", pari_rec: "", no_signal: true, no_signal_reason: "MOTEUR_V3_MATCH_INTROUVABLE",
    data_quality_score: 60, data_quality_label: "Moyenne", market_source: "Cotes moyennes multi-bookmakers" }, extra || {});
}

// --------------------------------------------------------------------------- fourchette (04/10/2026)
// Exigence de Clement (04/10/2026, 2 h) : « des cotes entre 1,40 et 1,70 en sec ; toutes les cases
// remplies et justes ; c'est tout ».
const F = P.fourchettePari(CFG);
const dansF = (k) => P.dansFourchette(k, F);

test("fourchette : bornes 1,40-1,70 dans config/leagues.json (un seul endroit), bornes comprises", () => {
  assert.deepEqual(CFG.fiabilite.fourchette_pari, { cote_min: 1.4, cote_max: 1.7, marge_sans_agree: 0.02 });
  assert.deepEqual([F.cote_min, F.cote_max], [1.4, 1.7]);
  assert.ok(dansF("1.40") && dansF("1,70") && dansF(1.55));
  assert.ok(!dansF("1.39") && !dansF(1.71) && !dansF(null) && !dansF(""));
  // Les selections nationales et l'option suivent la meme fourchette.
  assert.deepEqual([P.FOURCHETTE_SELECTION.cote_min, P.FOURCHETTE_SELECTION.cote_max], [1.4, 1.7]);
  // Jamais les bornes ecrites en dur dans le code du calcul (commentaires exceptes).
  const code = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(code("lib/pronostic.js"), /\b1[.,](?:4|40|7|70)\b/);
  const bloc = SCRIPT.slice(SCRIPT.indexOf("(function designerMatchGratuit(){"), SCRIPT.indexOf("\n            })();", SCRIPT.indexOf("(function designerMatchGratuit(){")));
  assert.match(bloc, /var FOURCHETTE_OFFERT=PRONOSTIC\.fourchettePari\(LEAGUES_CONFIG\);/);
  // Config absente ou illisible : la fourchette du depot, jamais une fourchette inventee.
  assert.deepEqual(P.fourchettePari({ fiabilite: {} }), F);
  assert.deepEqual(P.fourchettePari({ fiabilite: { fourchette_pari: { cote_min: 1.5, cote_max: 1.6 } } }), { cote_min: 1.5, cote_max: 1.6, marge_sans_agree: 0 });
});

test("publierPronostics : le pari publie est un pari simple dans la fourchette (page du 29/09 : pari_rec, cote_rec, model_probability)", () => {
  const m = match();
  const row = { fixture_id: 101, pari_rec: "", cote_rec: null, model_probability: null, market_id: null, marche: null, raw_response: {} };
  P.poserPronostics([m], { configLigues: CFG });
  const r = P.publierPronostics([m], [row], { configLigues: CFG, figes: {}, nowIso: "2026-10-04T01:00:00.000Z" });
  assert.equal(r.publies, 1); assert.equal(r.nouveaux, 1);
  // France - Belgique : 1 a 1,60 (dans la fourchette) ; 1X a 1,15, 12 a 1,25, X2 a 2,40 (dehors).
  assert.equal(m.market_id, "home-win");
  assert.equal(m.pari_rec, P.MARCHE[m.market_id].marche);
  assert.equal(m.marche, "RESULTAT");
  assert.equal(m.cote_rec, "1.60"); assert.ok(dansF(m.cote_rec));
  assert.equal(m.cote_source, "indicative"); assert.equal(m.cote_bookmaker, null);
  assert.equal(m.no_signal, false); assert.equal(m.no_signal_reason, undefined);
  assert.equal(m.odds_available, true); assert.equal(m.risque, "FAIBLE");
  assert.equal(m.pick_frozen_at, "2026-10-04T01:00:00.000Z");
  assert.deepEqual([m.pronostic.market_id, m.pronostic.cote, m.pronostic.publie], ["home-win", 1.6, true]);
  assert.equal(row.pari_rec, m.pari_rec); assert.equal(row.market_id, m.market_id); assert.equal(row.cote_rec, 1.6); assert.equal(row.model_probability, m.model_probability);
  assert.equal(row.raw_response.pick_freeze.frozen_at, "2026-10-04T01:00:00.000Z");
  // Chance affichee de la Ligue des nations : corrigee de 3 points, partout le meme chiffre.
  const avant = m.model_probability;
  const a = P.alignerChancesAffichees([m], [row], { configLigues: CFG, figes: {} });
  assert.equal(a.corriges, 1);
  assert.equal(m.model_probability, Math.round(avant) - 3);
  assert.equal(m.chance_iashark, m.model_probability); assert.equal(row.model_probability, m.model_probability);
  assert.equal(m.conf, Math.round(m.model_probability) / 10);
  assert.equal(m.pronostic.chance, m.model_probability);
  assert.deepEqual(m.chance_correction.points, -3);
  // Une seule fois par run.
  P.alignerChancesAffichees([m], [row], { configLigues: CFG, figes: {} });
  assert.equal(m.model_probability, Math.round(avant) - 3);
});

test("publierPronostics : la plus grande chance CORRIGEE parmi les marches dans la fourchette (meme correction que la chance affichee)", () => {
  // Ligue 2 : 1X a 1,48 (65 % calcules, -2 entre 1,20 et 1,50 -> 63 %) contre X2 a 1,55 (64 %, sans correction).
  const m = match({ id: 50, league_key: "ligue2", league_id: 62, league: "Ligue 2", c1: "2.62", cn: "3.30", c2: "2.75", cdc1x: "1.48", cdc2x: "1.55", cdc12: "1.36", co25: "1.95", cu25: "1.85" });
  P.poserPronostics([m], { configLigues: CFG });
  P.publierPronostics([m], [], { configLigues: CFG, figes: {} });
  assert.equal(m.market_id, "dc-x2");
  assert.equal(m.cote_rec, "1.55");
  P.alignerChancesAffichees([m], [], { configLigues: CFG, figes: {} });
  assert.equal(m.model_probability, 64, "la chance affichee est celle qui a servi au classement");
});

test("publierPronostics : jamais un pari fige remplace, jamais un match ferme ; pas de pari seulement sans cote reelle (ou favori sous 1,20), l'analyse reste", () => {
  const fige = match({ id: 1, pari_rec: "DC 1X", market_id: "dc-1x", no_signal: false, chance_iashark: 85, cote_rec: "1.15" });
  P.poserPronostics([fige], { configLigues: CFG });
  const rf = P.publierPronostics([fige], [], { configLigues: CFG, figes: { 1: true } });
  assert.deepEqual([rf.publies, rf.figes, fige.market_id, fige.cote_rec], [0, 1, "dc-1x", "1.15"], "gel prioritaire");
  assert.equal(fige.pronostic.selection, false, "un pari fige hors fourchette n'est jamais une Selection IASHARK");
  const ferme = match({ id: 2, no_signal_reason: "KICKOFF_PASSED" }); P.poserPronostics([ferme], { configLigues: CFG });
  assert.equal(P.publierPronostics([ferme], [], { configLigues: CFG, figes: {} }).publies, 0);
  assert.equal(ferme.no_signal_reason, "KICKOFF_PASSED");
  // Raison : aucune cote reelle sur un marche candidat (ou competition hors liste) ; favori sous 1,20 et rien
  // d'autre a 50 % ou plus (jamais un « coup » a 15 % parce que le favori est trop bas).
  const cas = {
    sansCote: [match({ id: 3, c1: null, cn: null, c2: null, cdc1x: null, cdc2x: null, cdc12: null, co25: null, cu25: null, p1: 50, pn: 30, p2: 20 }), P.RAISON_SANS_COTE],
    petiteCote: [match({ id: 4, league_key: "ligue1", league_id: 61, c1: "1.05", cn: "12", c2: "30", cdc1x: "1.01", cdc2x: "8", cdc12: "1.02", co25: "1.10", cu25: "6.5" }), P.RAISON_HORS_FOURCHETTE],
    horsListe: [match({ id: 5, league_key: "colombia_primera_a", league_id: 239 }), P.RAISON_SANS_COTE],
  };
  Object.keys(cas).forEach((k) => {
    const m = Object.assign(cas[k][0], { p1: 50, pn: 30, p2: 20, lineups: { home: { formation: "4-3-3" } }, arbitre: { nom: "C. Turpin" }, analyse_card: "Texte ecrit sans pari." });
    P.poserPronostics([m], { configLigues: CFG });
    const r = P.publierPronostics([m], [], { configLigues: CFG, figes: {}, texteMarche: { [m.id]: "" } });
    assert.deepEqual([r.publies, r.sans_pari], [0, 1], k);
    assert.equal(m.pari_rec, "", k); assert.equal(m.market_id, null, k); assert.equal(m.cote_rec, "", k);
    assert.equal(m.no_signal, true, k);
    assert.equal(m.no_signal_reason, cas[k][1], k);
    assert.equal(m.no_signal_label, "Aucun signal clair sur ce match", k + " : libelle deja traduit par l'accueil");
    assert.equal(m.pronostic, undefined, k); assert.equal(m.selection_iashark, undefined, k);
    // L'analyse du match reste publiee.
    assert.deepEqual([m.p1, m.lineups.home.formation, m.arbitre.nom, m.analyse_card], [50, "4-3-3", "C. Turpin", "Texte ecrit sans pari."], k);
  });
  // Aucun marche dans la fourchette (exigence du 04/10, 4 h : un pari sur TOUS les matchs) : le pari simple
  // dont la cote est la plus proche, marque « hors fourchette », jamais une Selection IASHARK.
  const grosseCote = match({ id: 6, league_key: "ligue1", league_id: 61, c1: "2.90", cn: "3.10", c2: "2.60", cdc1x: "1.75", cdc2x: "1.80", cdc12: "1.30", co25: "1.85", cu25: "1.95" });
  P.poserPronostics([grosseCote], { configLigues: CFG });
  const rg = P.publierPronostics([grosseCote], [], { configLigues: CFG, figes: {} });
  assert.deepEqual([rg.publies, rg.hors_fourchette, rg.sans_pari], [1, 1, 0]);
  assert.deepEqual([grosseCote.market_id, grosseCote.cote_rec, grosseCote.pronostic.hors_fourchette, grosseCote.pronostic.selection], ["dc-1x", "1.75", true, false]);
});

function matchV3(extra) {
  return match(Object.assign({ id: 200, league_key: "premier", league_id: 39, league: "Premier League", league_reliability: "validee",
    home: { n: "Arsenal" }, away: { n: "Burnley" }, c1: "1.45", cn: "4.60", c2: "7.50", cdc1x: "1.10", cdc2x: "3.00", cdc12: "1.20", co25: "1.30", cu25: "3.40",
    pari_rec: "DC 1X", market_id: "dc-1x", marche: "DOUBLE_CHANCE", cote_rec: "1.18", cote_source: "anj", cote_bookmaker: "Winamax", sans_marge_anj: { "dc-1x": 85 },
    no_signal: false, no_signal_reason: undefined, model_probability: 86.2, chance_iashark: 84, chance_iashark_source: "le plus bas entre le modèle et la cote sans marge",
    moteur_v3: { source: "v3" }, v3_fiabilite: { couverture: "vérifiée" },
    v3_pari: { cle: "DC:1N", market_id: "dc-1x", raisons: ["Arsenal invaincu a domicile"] },
    v3_suivi: { cle: "DC:1N", voyant: "vert", alerte_cote: "baisse" },
    v3_marches: [
      { cle: "1N2:1", market_id: "home-win", probabilite: 67.5, fiabilite_marche: "vérifié sur le passé", etiquette: "vérifié sur le passé" },
      { cle: "1N2:N", market_id: "draw", probabilite: 19, fiabilite_marche: "vérifié sur le passé", etiquette: "vérifié sur le passé" },
      { cle: "1N2:2", market_id: "away-win", probabilite: 13.5, fiabilite_marche: "vérifié sur le passé", etiquette: "vérifié sur le passé" },
      { cle: "DC:1N", market_id: "dc-1x", probabilite: 86.5, fiabilite_marche: "vérifié sur le passé", etiquette: "vérifié sur le passé" },
    ],
    decision_factors: ["Arsenal invaincu a domicile"], key_absences: ["Burnley sans son buteur"],
    analyse_card: "Le 1X d'Arsenal se justifie par 12 matchs sans defaite.", conseil_public: "Double chance Arsenal.", contexte: "Arsenal 2e, Burnley 18e.",
  }, extra || {}));
}
const CHANCES_V3 = { 200: { marches: { "1N2:1": 66, "1N2:N": 19, "1N2:2": 13, "DC:1N": 84, "DC:N2": 32, "DC:12": 80 } } };

test("pari du moteur v3 hors fourchette : remplace par le marche verifie le plus probable dans la fourchette ; ni texte ni raison d'un autre marche", () => {
  const m = matchV3();
  const row = { fixture_id: 200, pari_rec: "DC 1X", market_id: "dc-1x", cote_rec: 1.18, model_probability: 86.2, verdict_shark: "Le 1X est le signal le plus fort.", facteur_x: "12 matchs sans defaite.", kelly: "0.02", edge: "+1.5%",
    raw_response: { analyse_card: "x", verdict_shark: "y", narrative_i18n: { verdict_shark_i18n: { en: "y" }, facteur_x_i18n: { en: "z" } } } };
  P.poserPronostics([m], { configLigues: CFG, chancesV3Par: CHANCES_V3 });
  const r = P.publierPronostics([m], [row], { configLigues: CFG, figes: {}, chancesV3Par: CHANCES_V3, texteMarche: { 200: "dc-1x" } });
  assert.deepEqual([r.publies, r.changes, r.textes_retires], [1, 1, 1]);
  // 1X a 1,18 (ANJ) et 12 a 1,20 : hors fourchette ; seule la victoire d'Arsenal (1,45) y est.
  assert.equal(m.market_id, "home-win"); assert.equal(m.pari_rec, "Victoire Domicile"); assert.equal(m.marche, "RESULTAT");
  assert.equal(m.cote_rec, "1.45");
  assert.deepEqual([m.cote_source, m.cote_bookmaker, m.sans_marge_anj], ["indicative", null, undefined], "la cote ANJ du 1X ne decrit jamais la victoire");
  assert.equal(m.chance_iashark, 66); assert.equal(m.model_probability, 66);
  // Selection IASHARK gardee (competition validee, marche verifie du v3), mais ce n'est plus le pari du moteur v3 lui-meme.
  assert.deepEqual([m.pronostic.selection, m.pronostic.moteur, m.selection_iashark], [true, "v3", true]);
  assert.equal(m.v3_pari, undefined);
  assert.deepEqual([m.v3_suivi.cle, m.v3_suivi.alerte_cote, m.v3_suivi.voyant], [null, null, "vert"]);
  // Textes et raisons ecrits pour le 1X : retires ; le contexte (vrai quel que soit le pari) reste.
  assert.deepEqual([m.analyse_card, m.conseil_public, m.contexte], ["", "", "Arsenal 2e, Burnley 18e."]);
  assert.deepEqual(m.decision_factors, ["Burnley sans son buteur"]);
  assert.deepEqual([row.verdict_shark, row.facteur_x, row.raw_response.analyse_card, row.raw_response.verdict_shark], ["", "", "", ""]);
  assert.deepEqual(row.raw_response.narrative_i18n, {});
  assert.deepEqual([row.market_id, row.cote_rec, row.model_probability, row.kelly, row.edge], ["home-win", 1.45, 66, "0", ""]);
});

test("pari du moteur v3 dans la fourchette : garde tel quel (cote ANJ, textes, raisons, v3_pari)", () => {
  const m = matchV3({ pari_rec: "Victoire Domicile", market_id: "home-win", marche: "RESULTAT", cote_rec: "1.52", chance_iashark: 66,
    v3_pari: { cle: "1N2:1", market_id: "home-win", raisons: ["Arsenal 9 victoires sur 10"] }, v3_suivi: { cle: "1N2:1", voyant: "vert" }, decision_factors: ["Arsenal 9 victoires sur 10"] });
  const r = P.publierPronostics([m], [], { configLigues: CFG, figes: {}, chancesV3Par: CHANCES_V3, texteMarche: { 200: "home-win" } });
  assert.deepEqual([r.publies, r.gardes, r.textes_retires], [1, 1, 0]);
  assert.deepEqual([m.market_id, m.cote_rec, m.cote_source, m.cote_bookmaker], ["home-win", "1.52", "anj", "Winamax"]);
  assert.deepEqual(m.v3_pari.raisons, ["Arsenal 9 victoires sur 10"]);
  assert.equal(m.v3_suivi.cle, "1N2:1");
  assert.equal(m.analyse_card, "Le 1X d'Arsenal se justifie par 12 matchs sans defaite.", "texte ecrit pour ce pari : garde");
  assert.deepEqual(m.decision_factors, ["Arsenal 9 victoires sur 10"]);
  // Cote ANJ hors fourchette (1,75) alors que la moyenne est dedans (1,65) : la cote agreee decide (point du trader) ;
  // rien d'autre dans la fourchette : le plus proche (la victoire a 1,75 chez l'agree), marque hors fourchette.
  const anj = matchV3({ pari_rec: "Victoire Domicile", market_id: "home-win", cote_rec: "1.75", c1: "1.65", co25: "1.30", cu25: "3.40", chance_iashark: 62,
    v3_pari: { cle: "1N2:1", market_id: "home-win" } });
  P.publierPronostics([anj], [], { configLigues: CFG, figes: {}, chancesV3Par: CHANCES_V3 });
  assert.deepEqual([anj.market_id, anj.cote_rec, anj.cote_source, anj.cote_bookmaker], ["home-win", "1.75", "anj", "Winamax"]);
  assert.deepEqual([anj.pronostic.hors_fourchette, anj.pronostic.selection, anj.selection_iashark], [true, false, undefined]);
});

test("textes ecrits pour un match sans pari : vides quand un pari est publie (jamais « aucun pari » a cote d'un pari)", () => {
  const m = match({ id: 300, contexte: "Aucun pari n'est retenu sur ce match aujourd'hui. La France reste sur 5 victoires.", analyse_card: "Aucun pari publie.",
    lecture_match: "La France devrait controler.", scenario: { phase1: "Debut ferme.", phase2: "Pas de pari sur ce match. La France pousse.", phase3: "Fin animee." },
    contexte_i18n: { en: "No bet." }, scenario_i18n: { en: { phase1: "x" } } });
  P.publierPronostics([m], [], { configLigues: CFG, figes: {}, texteMarche: { 300: "" } });
  assert.equal(m.market_id, "home-win");
  assert.equal(m.contexte, "La France reste sur 5 victoires.");
  assert.equal(m.contexte_i18n, undefined, "traduction d'une phrase retiree : masquee");
  assert.equal(m.analyse_card, "");
  assert.equal(m.lecture_match, "La France devrait controler.");
  assert.deepEqual(m.scenario, { phase1: "Debut ferme.", phase2: "La France pousse.", phase3: "Fin animee." });
  assert.equal(m.scenario_i18n, undefined);
});

test("selections nationales : meme fourchette 1,40-1,70 ; la selection suit le pari publie", () => {
  // 1,75 n'est plus dans la fourchette (elle etait 1,40-2,00) : aucune selection ; le pari est le plus proche (hors fourchette).
  const hors = match({ id: 401, c1: "1.75", cn: "3.70", c2: "4.80", cdc1x: "1.20", cdc2x: "2.05", cdc12: "1.30" });
  assert.equal(P.poserSelectionsNationales([hors], [], { configLigues: CFG }), 0);
  const dedans = match({ id: 402, c1: "1.65", cn: "3.70", c2: "4.80", cdc1x: "1.20", cdc2x: "2.05", cdc12: "1.30" });
  assert.equal(P.poserSelectionsNationales([dedans], [], { configLigues: CFG }), 1);
  P.poserPronostics([hors, dedans], { configLigues: CFG });
  P.publierPronostics([hors, dedans], [], { configLigues: CFG, figes: {} });
  assert.deepEqual([dedans.market_id, dedans.cote_rec, dedans.pronostic.selection, dedans.selection_iashark], ["home-win", "1.65", true, true]);
  assert.deepEqual([hors.market_id, hors.cote_rec, hors.pronostic.hors_fourchette, hors.pronostic.selection, hors.selection_iashark], ["home-win", "1.75", true, false, undefined]);
});

test("option « cote plus haute » : dans la fourchette elle aussi, 70 % ou plus, jamais le pari principal, chance corrigee", () => {
  // 1X a 1,43 (79 %) : le pari ; 12 a 1,45 (75 %) : l'option ; victoire a 1,80 : hors fourchette.
  // (Cote du marche d'API-Football : 1,42 au moins, marge_sans_agree.)
  const m = match({ id: 9, league_key: "ligue1", league_id: 61, c1: "1.80", cn: "3.70", c2: "4.40", cdc1x: "1.43", cdc2x: "2.20", cdc12: "1.45", co25: "1.90", cu25: "1.90" });
  P.poserPronostics([m], { configLigues: CFG });
  P.publierPronostics([m], [], { configLigues: CFG, figes: {} });
  P.alignerChancesAffichees([m], [], { configLigues: CFG, figes: {} });
  assert.equal(m.market_id, "dc-1x");
  assert.equal(P.poserOptionCote([m], { configLigues: CFG }), 1);
  const o = m.option_cote;
  assert.equal(o.market_id, "dc-12"); assert.ok(dansF(o.cote));
  assert.ok(o.chance_calculee >= P.OPTION_COTE.chance_min);
  assert.equal(o.chance, o.chance_calculee - 6);
  assert.equal(o.cote_minimum, Math.round((100 / o.chance) * 100) / 100);
  // Aucune autre issue a 70 % ou plus dans la fourchette : pas d'option.
  const serre = match({ id: 10, league_key: "ligue1", league_id: 61, c1: "2.60", cn: "3.20", c2: "2.80", cdc1x: "1.45", cdc2x: "1.50", cdc12: "1.35", co25: "2.00", cu25: "1.80" });
  P.poserPronostics([serre], { configLigues: CFG });
  P.publierPronostics([serre], [], { configLigues: CFG, figes: {} });
  P.poserOptionCote([serre], { configLigues: CFG });
  assert.equal(serre.option_cote, undefined);
});

test("publierPronostics : un championnat non verifie recoit son pari par les cotes du marche (fiabilite « en test »)", () => {
  const m = match({ id: 7, league_key: "k_league1", league_id: 292, league: "K League 1", c1: "2.10", cn: "3.30", c2: "3.40", cdc1x: "1.30", cdc2x: "1.70", cdc12: "1.35" });
  P.poserPronostics([m], { configLigues: CFG });
  assert.equal(m.pronostic.voie, "cotes_marche");
  assert.equal(m.pronostic.fiabilite, "en test");
  assert.equal(P.publierPronostics([m], [], { configLigues: CFG, figes: {} }).publies, 1);
  assert.ok(m.model_probability >= 50 && m.model_probability < 100);
});

// --------------------------------------------------------------------------- garde-fous
test("contenu Pro : option_cote et chance_correction premium ; cotes Pinnacle jamais publiques, meme le match offert", () => {
  ["option_cote", "chance_correction", "pronostic", "chance_iashark"].forEach((k) => assert.ok(PREMIUM.PREMIUM_FIELDS.includes(k), k));
  assert.ok(PREMIUM.INTERNAL_FIELDS.includes("pinnacle_snapshot"));
  const m = { id: 1, home: { n: "A" }, away: { n: "B" }, pinnacle_snapshot: { c1: 1.9 }, option_cote: { chance: 60 }, pari_rec: "x" };
  assert.ok(!("option_cote" in PREMIUM.stripPremium(m)));
  assert.ok(!("pinnacle_snapshot" in PREMIUM.sansChampsInternes(m)));
  const offert = Object.assign({}, m, { is_free: true });
  assert.ok(!("pinnacle_snapshot" in PREMIUM.sansChampsPro(PREMIUM.sansChampsInternes(offert))));
  assert.ok(!("pinnacle_snapshot" in PREMIUM.premiumPayload(m)), "jamais dans premium_fields");
  // Pipeline : retire les champs internes de CHAQUE match avant d'ecrire les fichiers publics.
  const iPub = SCRIPT.indexOf("var matchsPublics=allMatchsData.map(function(m){");
  const iInt = SCRIPT.indexOf("matchsPublics=matchsPublics.map(function(m){ return PREMIUM_FIELDS_LIB.sansChampsInternes(m); });", iPub);
  assert.ok(iPub > 0 && iInt > iPub, "champs internes retires de chaque match public");
  assert.ok(iInt < SCRIPT.indexOf("PUBLIC_SPLIT.writePublicSplit(fs,matchsPublics") && iInt < SCRIPT.indexOf("generateMatchPages(matchsPublics);"), "avant l'ecriture des fichiers publics");
  // Marches du flux : ni la cote ni le nom du bookmaker de reference (bet365).
  assert.doesNotMatch(SCRIPT, /cote:x\.cote,bookmaker:FLUX_MOD\.nomBookmakerFlux/);
  assert.match(SCRIPT, /source:'cote de reference du marche, marge retiree'/);
});

test("pipeline : un pari sur chaque match apres les pronostics, avant le match offert et l'ecriture des donnees", () => {
  const iProno = SCRIPT.indexOf("PRONOSTIC.poserPronostics(");
  const iPub = SCRIPT.indexOf("PRONOSTIC.publierPronostics(allMatchsData,premiumRows,{configLigues:LEAGUES_CONFIG,figes:GEL_FIGES,chancesV3Par:CHANCES_V3_PRONO,texteMarche:TEXTE_MARCHE,cotesAnjPar:LIVRES_ANJ,releveAnjA:RELEVE_ANJ_A})");
  const iAlign = SCRIPT.indexOf("PRONOSTIC.alignerChancesAffichees(allMatchsData,premiumRows,{configLigues:LEAGUES_CONFIG,figes:GEL_FIGES})");
  const iOpt = SCRIPT.indexOf("PRONOSTIC.poserOptionCote(allMatchsData,{configLigues:LEAGUES_CONFIG,cotesAnjPar:LIVRES_ANJ})");
  assert.ok(iProno > 0 && iPub > iProno && iAlign > iPub && iOpt > iAlign);
  assert.ok(iOpt < SCRIPT.indexOf("(function designerMatchGratuit(){"));
  assert.ok(iOpt < SCRIPT.indexOf("await writePremiumData(premiumRows);"));
  assert.ok(iOpt < SCRIPT.indexOf("await updateHistorique(allMatchsData);"));
  assert.ok(SCRIPT.indexOf("var GEL_FIGES={}") < iPub, "le gel est connu avant la publication");
  // Fourchette (04/10/2026) : apres le gel, la SAFE_PICK, la cote ANJ et les selections nationales (il decide le pari final).
  ["var rapportAnj=await COTE_ANJ.poserCotesAnj(", "PRONOSTIC.poserSelectionsNationales(", "matchCibleSafePick.pari_rec="].forEach((x) => assert.ok(SCRIPT.indexOf(x) > 0 && SCRIPT.indexOf(x) < iPub, x));
  // Marche des textes d'analyse : relevé a la construction de chaque match, en memoire seulement.
  assert.match(SCRIPT, /var TEXTE_MARCHE=\{\};/);
  assert.match(SCRIPT, /matchsData\.push\(matchObj\);\n\s*TEXTE_MARCHE\[String\(f\.id\)\]=pickedMarket\?String\(pickedMarket\.id\):'';/);
  assert.doesNotMatch(SCRIPT, /writeFileSync\([^)]*TEXTE_MARCHE/);
  // Arbitre : nom lu dans la fixture, aucune statistique inventee.
  assert.match(SCRIPT, /\{nom:f\.referee\.split\(','\)\[0\]\.trim\(\),cartons:null,penaltys:null,matchs:null\}/);
  // Gabarit des pages match du 29/09 : titre « A vs B ».
  assert.match(SCRIPT, /escHtml\(m\.home\.n\)\+' vs '\+escHtml\(m\.away\.n\)\+'<\/h1>'/);
  assert.doesNotMatch(SCRIPT, /SEO_PAGES\.matchH1\(/);
});

test("aucun message Telegram envoye par le calcul ; Canal Pro non alimente ; moteur prive jamais dans ce depot", () => {
  // Aucun jeton Telegram donne a une etape du calcul (lib/quotas.js#envoyerAlerte sans jeton n'envoie rien).
  assert.doesNotMatch(WF, /TELEGRAM_[A-Z_]+:\s*\$\{\{\s*secrets\./);
  assert.doesNotMatch(WF, /deposer-sortie-v3\.mjs/);
  const dossier = path.join(ROOT, ".github", "workflows");
  fs.readdirSync(dossier).forEach((f) => assert.ok(!/telegram-canal|canal-pro|telegram-bot/.test(f), f));
  const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  assert.match(gi, /^\/moteur-v3\/$/m); assert.match(gi, /^\.moteur-v3-prive\/$/m);
  assert.ok(!fs.existsSync(path.join(ROOT, "moteur-v3")), "aucun dossier moteur-v3/ dans le depot public");
  // Le raccord est du code du site (reconstruction des etats), sans poids ni regle du moteur.
  assert.ok(fs.existsSync(path.join(ROOT, "raccord-moteur-v3", "branchement", "reconstruire_etats.py")));
});

// --------------------------------------------------------------------------- un pari sur CHAQUE match (04/10/2026, 4 h)
// Exigences de Clement du 04/10/2026 : « il faut qu'il y ait un pari selectionne a TOUS les matchs, c'est simple »
// (4 h) ; « quand on choisit un marche, si la cote n'est pas chez un bookmaker agree, on met le bookmaker
// d'API-Sports et c'est tout » (4 h 15).
const COTE_ANJ = require("../lib/cote-anj.js");
const AGREES = ["Betclic", "NetBet", "PMU", "Unibet", "Winamax"];
// Livres The Odds API (meme forme que lib/cote-anj.js#booksDepuisEvenement) : Pinnacle + agrees suivis.
function livres(l1x2, ou25) {
  const out = {};
  Object.keys(l1x2).forEach((bk) => { out[bk] = { "1x2": l1x2[bk] }; if (ou25 && ou25[bk]) out[bk].ou = { "2.5": ou25[bk] }; });
  return out;
}
// Argentine (API-Football sans cote, quota) : seulement les cotes des agrees, relevees dans l'appel de la competition.
function matchArgentine(extra) {
  return match(Object.assign({ id: 700, league_key: "argentina_liga_profesional", league_id: 128, league: "Liga Profesional Argentina",
    home: { n: "Newells Old Boys" }, away: { n: "Lanus" }, c1: "--", cn: "--", c2: "--", cdc1x: "--", cdc2x: "--", cdc12: "--", co25: "--", cu25: "--" }, extra || {}));
}
const LIVRES_ARG = livres(
  { pinnacle: [2.95, 2.95, 2.80], winamax_fr: [2.75, 2.85, 2.65], betclic_fr: [2.70, 2.80, 2.70], unibet_fr: [2.80, 2.90, 2.60] },
  { pinnacle: [2.40, 1.62], winamax_fr: [2.30, 1.55], betclic_fr: [2.25, 1.52], unibet_fr: [2.35, 1.57] });

test("un pari sur chaque match : sans cote d'API-Football, la meilleure cote chez un agree (nom de l'agree, jamais Pinnacle)", () => {
  const m = matchArgentine();
  const row = { fixture_id: 700, raw_response: {} };
  const r = P.publierPronostics([m], [row], { configLigues: CFG, figes: {}, cotesAnjPar: { 700: LIVRES_ARG }, releveAnjA: "2026-10-04T05:20:00.000Z" });
  assert.deepEqual([r.publies, r.dans_fourchette, r.cote_agreee, r.cote_marche], [1, 1, 1, 0]);
  // Match tres serre : aucune issue 1N2 dans la fourchette ; moins de 2,5 buts (marche verifie par le mathematicien
  // en Argentine, chance 50-70 %) a 1,57 chez Unibet, la meilleure des agrees (Pinnacle 1,62 n'est jamais la cote).
  assert.deepEqual([m.market_id, m.pari_rec, m.marche, m.cote_rec], ["under-25", "Under 2.5", "TOTAL_BUTS", "1.57"]);
  assert.deepEqual([m.cote_source, m.cote_bookmaker, m.cote_releve_a], ["anj", "Unibet", "2026-10-04T05:20:00.000Z"]);
  assert.ok(m.sans_marge_anj && m.sans_marge_anj["under-25"] > 50, "chance sans marge de la meme source que la cote");
  assert.deepEqual([m.pronostic.cote_source, m.pronostic.bookmaker, m.pronostic.hors_fourchette], ["anj", "Unibet", false]);
  assert.equal(m.model_probability, Math.round(m.sans_marge_anj["under-25"]));
  assert.equal(row.cote_rec, 1.57);
});

test("un pari sur chaque match : cote d'API-Football (« cote du marche », aucun nom) quand l'agree ne cote pas le marche ; borne basse 1,42", () => {
  // Segunda, double chance : jamais dans l'appel de la competition (h2h + totals) -> cote du marche d'API-Football.
  const seg = match({ id: 710, league_key: "spain_segunda", league_id: 141, league: "Segunda Division", home: { n: "Real Sociedad II" }, away: { n: "Granada CF" },
    c1: "2.60", cn: "3.30", c2: "2.75", cdc1x: "1.47", cdc2x: "1.52", cdc12: "1.33", co25: "2.10", cu25: "1.70" });
  P.publierPronostics([seg], [], { configLigues: CFG, figes: {}, cotesAnjPar: { 710: livres({ winamax_fr: [2.55, 3.20, 2.70], betclic_fr: [2.50, 3.25, 2.75], pinnacle: [2.70, 3.40, 2.85] }) } });
  assert.deepEqual([seg.market_id, seg.cote_rec, seg.cote_source, seg.cote_bookmaker], ["dc-1x", "1.47", "indicative", null]);
  assert.equal(seg.pronostic.cote_source, "marche");
  // Segunda : ni plus/moins ni « les deux marquent » (non mesures par le mathematicien dans cette competition).
  assert.deepEqual(Object.keys(P.famillesDuMatch(seg, { ligues: P.liguesCotesMarche(CFG), paris: P.liguesParis(CFG), flux: P.famillesFlux(require("../config/marches-valides.json")) })).sort(), ["1N2", "DC"]);
  // Cote du marche a 1,41 : sous la marge (1,42), jamais « dans la fourchette » ; la meme a 1,40 chez un agree : dedans.
  const bas = match({ id: 711, c1: "1.41", cn: "4.50", c2: "7.00" });
  const rb = P.publierPronostics([bas], [], { configLigues: CFG, figes: {} });
  assert.deepEqual([bas.market_id, bas.cote_rec, bas.pronostic.hors_fourchette, rb.hors_fourchette], ["home-win", "1.41", true, 1]);
  const agree = match({ id: 712, c1: "1.41", cn: "4.50", c2: "7.00" });
  P.publierPronostics([agree], [], { configLigues: CFG, figes: {}, cotesAnjPar: { 712: livres({ winamax_fr: [1.40, 4.40, 6.80], pmu_fr: [1.38, 4.30, 6.50], pinnacle: [1.45, 4.70, 7.40] }) } });
  assert.deepEqual([agree.cote_rec, agree.cote_source, agree.cote_bookmaker, agree.pronostic.hors_fourchette], ["1.40", "anj", "Winamax", false]);
});

test("un pari sur chaque match : jamais une cote inventee, jamais Pinnacle ni bet365, toutes les cases du meme pari", () => {
  const matchs = [
    matchArgentine({ id: 720 }),
    match({ id: 721, c1: "1.55", cn: "4.10", c2: "6.00" }),
    match({ id: 722, league_key: "spain_segunda", league_id: 141, c1: "1.23", cn: "6.50", c2: "11.0", cdc1x: "1.04", cdc2x: "4.20", cdc12: "1.12" }),
    match({ id: 723, league_key: "ligue1", league_id: 61, c1: "2.40", cn: "3.20", c2: "3.10", cdc1x: "1.38", cdc2x: "1.55", cdc12: "1.36", co25: "1.95", cu25: "1.85", co15: "1.30", cu15: "3.40", btts_oui: "1.72", btts_non: "2.05" }),
    match({ id: 724, c1: null, cn: null, c2: null, cdc1x: null, cdc2x: null, cdc12: null, co25: null, cu25: null }),
  ];
  const rows = matchs.map((m) => ({ fixture_id: m.id, raw_response: {} }));
  const LIV = { 720: LIVRES_ARG };
  const r = P.publierPronostics(matchs, rows, { configLigues: CFG, figes: {}, cotesAnjPar: LIV });
  P.alignerChancesAffichees(matchs, rows, { configLigues: CFG, figes: {} });
  assert.deepEqual([r.publies, r.sans_pari, r.sans_cote], [4, 1, 1], "seul le match sans aucune cote reste sans pari");
  matchs.forEach((m, i) => {
    if (m.id === 724) { assert.equal(m.no_signal_reason, P.RAISON_SANS_COTE); return; }
    const reelles = [];
    P.MARCHE[m.market_id].cote.forEach((k) => { const v = Number(m[k]); if (v > 1) reelles.push(v); });
    const best = COTE_ANJ.coteDuPari(LIV[m.id] || {}, m.market_id);
    if (best) reelles.push(best.cote);
    assert.ok(reelles.includes(Number(m.cote_rec)), m.id + " : cote " + m.cote_rec + " absente des cotes reelles " + reelles);
    assert.ok(Number(m.cote_rec) >= P.COTE_MIN, m.id + " : jamais sous 1,20");
    assert.ok(m.cote_bookmaker === null || AGREES.includes(m.cote_bookmaker), m.id + " : " + m.cote_bookmaker);
    assert.doesNotMatch(JSON.stringify(m), /pinnacle|bet365/i, m.id);
    // Cases : meme pari, meme chance (corrigee) partout, Pro compris (paris_safe, point du trader).
    assert.equal(m.pari_rec, P.MARCHE[m.market_id].marche);
    assert.deepEqual([m.chance_iashark, m.conf, m.pronostic.chance, m.paris_safe.proba, m.paris_safe.cote, rows[i].model_probability, rows[i].cote_rec],
      [m.model_probability, Math.round(m.model_probability) / 10, m.model_probability, m.model_probability + "%", Number(m.cote_rec), m.model_probability, Number(m.cote_rec)], String(m.id));
  });
  // Ligue des nations : chance affichee corrigee de 3 points, paris_safe aussi.
  assert.equal(matchs[1].chance_correction.points, -3);
  assert.equal(matchs[1].paris_safe.proba, matchs[1].model_probability + "%");
  // Segunda, grand favori a 1,23 : rien dans la fourchette -> le plus proche (1,23), jamais une Selection IASHARK.
  assert.deepEqual([matchs[2].market_id, matchs[2].cote_rec, matchs[2].pronostic.hors_fourchette, matchs[2].pronostic.selection], ["home-win", "1.23", true, false]);
});

test("familles calibrees seulement : buts et « les deux marquent » dans les competitions mesurees, dans leur tranche de chance", () => {
  const flux = P.famillesFlux(require("../config/marches-valides.json"));
  ["argentina_liga_profesional", "nations_league", "premier", "ligue1"].forEach((k) => {
    assert.deepEqual(flux[k], { "OU1.5": [50, 70], "OU2.5": [50, 70], "OU3.5": [50, 70], BTTS: [50, 60] }, k);
  });
  ["spain_segunda", "bundesliga2", "ligue2"].forEach((k) => assert.equal(flux[k], undefined, k));
  // Jamais « rembourse si nul » ni « meme match » : aucun market_id de ce type dans les marches du pari.
  Object.keys(P.MARCHE).forEach((id) => assert.doesNotMatch(id, /dnb|win-over|win-under|both-halves|clean|to-nil/));
  // Plus de 1,5 but a 1,30 (74 %) : hors de la tranche validee (50-70 %), jamais candidat, meme en repli.
  const m = match({ id: 730, league_key: "ligue1", league_id: 61, c1: "1.15", cn: "7.0", c2: "15", cdc1x: "1.02", cdc2x: "4.5", cdc12: "1.08", co25: "1.55", cu25: "2.45", co15: "1.12", cu15: "6.00", btts_oui: "2.00", btts_non: "1.75" });
  P.publierPronostics([m], [], { configLigues: CFG, figes: {} });
  assert.equal(m.market_id, "over-25");
  assert.equal(m.cote_rec, "1.55");
});

test("selections nationales et option : la cote agreee d'abord, comme le pari publie", () => {
  const sel = match({ id: 740, c1: "1.80", cn: "3.60", c2: "4.60", cdc1x: "1.20", cdc2x: "2.00", cdc12: "1.30" });
  const L = { 740: livres({ betclic_fr: [1.68, 3.50, 4.40], unibet_fr: [1.70, 3.55, 4.30], pinnacle: [1.78, 3.70, 4.80] }) };
  assert.equal(P.poserSelectionsNationales([sel], [], { configLigues: CFG, cotesAnjPar: L }), 1);
  assert.deepEqual([sel.market_id, sel.cote_rec, sel.cote_source, sel.cote_bookmaker], ["home-win", "1.70", "anj", "Unibet"]);
  P.poserPronostics([sel], { configLigues: CFG });
  P.publierPronostics([sel], [], { configLigues: CFG, figes: {}, cotesAnjPar: L });
  assert.deepEqual([sel.cote_rec, sel.cote_bookmaker, sel.pronostic.selection, sel.selection_iashark], ["1.70", "Unibet", true, true]);
});

test("releverLivresAnj : livres des agrees pour chaque match ouvert, un appel par competition, aucun appel par match", async () => {
  const appels = [];
  const ev = (id, h, a, t) => ({ id, home_team: h, away_team: a, commence_time: t, bookmakers: [
    { key: "pinnacle", markets: [{ key: "h2h", outcomes: [{ name: h, price: 2.9 }, { name: "Draw", price: 2.9 }, { name: a, price: 2.8 }] }] },
    { key: "winamax_fr", markets: [{ key: "h2h", outcomes: [{ name: h, price: 2.75 }, { name: "Draw", price: 2.85 }, { name: a, price: 2.65 }] },
      { key: "totals", outcomes: [{ name: "Over", point: 2.5, price: 2.3 }, { name: "Under", point: 2.5, price: 1.55 }] }] }] });
  const fetchJson = async (url) => { appels.push(url); return [ev("e1", "Newell's Old Boys", "Lanus", "2026-10-04T01:00:00Z"), ev("e2", "Huracan", "Aldosivi", "2026-10-04T22:45:00Z")]; };
  const ms = [
    { m: { id: 1, home: { n: "Newells Old Boys" }, away: { n: "Lanus" } }, sport: "soccer_argentina_primera_division", koMs: Date.parse("2026-10-04T01:00:00Z") },
    { m: { id: 2, home: { n: "Huracan" }, away: { n: "Aldosivi" } }, sport: "soccer_argentina_primera_division", koMs: Date.parse("2026-10-04T22:45:00Z") },
    { m: { id: 3, home: { n: "Talleres Cordoba" }, away: { n: "Belgrano Cordoba" } }, sport: "soccer_argentina_primera_division", koMs: Date.parse("2026-10-05T01:00:00Z") },
    { m: { id: 4, home: { n: "X" }, away: { n: "Y" } }, sport: null, koMs: Date.parse("2026-10-05T01:00:00Z") },
  ];
  const r = await COTE_ANJ.releverLivresAnj(ms, { cle: "k", fetchJson, maintenant: "2026-10-03T23:00:00Z" });
  assert.equal(appels.length, 1, "un seul appel pour la competition");
  assert.match(appels[0], /\/sports\/soccer_argentina_primera_division\/odds\?/);
  assert.match(appels[0], /bookmakers=pinnacle%2Cbetclic_fr%2Cnetbet_fr%2Cpmu_fr%2Cunibet_fr%2Cwinamax_fr/);
  assert.match(appels[0], /markets=h2h%2Ctotals/);
  assert.deepEqual(Object.keys(r.livres).sort(), ["1", "2"], "match introuvable ou hors perimetre : aucun livre");
  assert.equal(COTE_ANJ.coteDuPari(r.livres["1"], "under-25").cote, 1.55);
  // Sans cle : aucun appel, aucune exception.
  const vide = await COTE_ANJ.releverLivresAnj(ms, { cle: null, fetchJson });
  assert.deepEqual([Object.keys(vide.livres).length, appels.length], [0, 1]);
});

test("pipeline : cotes des agrees relevees pour chaque match ouvert, en memoire seulement ; cotes et blessures prioritaires", () => {
  const iRel = SCRIPT.indexOf("var releveLivres=await COTE_ANJ.releverLivresAnj(aReleverAnj,");
  assert.ok(iRel > SCRIPT.indexOf("var rapportAnj=await COTE_ANJ.poserCotesAnj("), "apres le releve du pari present");
  assert.ok(iRel < SCRIPT.indexOf("PRONOSTIC.poserSelectionsNationales(allMatchsData,premiumRows,{configLigues:LEAGUES_CONFIG,cotesAnjPar:LIVRES_ANJ})"));
  assert.ok(iRel < SCRIPT.indexOf("PRONOSTIC.publierPronostics(allMatchsData,premiumRows,"));
  assert.doesNotMatch(SCRIPT, /writeFileSync\([^)]*LIVRES_ANJ/);
  assert.doesNotMatch(SCRIPT, /LIVRES_ANJ[^\n]*premiumRows|row\.livres|m\.livres/);
  // Le plafond du jour (le notre) ne laisse plus un match analyse sans cote ni sans blessures (preuve du 03/10 dans le commentaire).
  assert.match(SCRIPT, /get\('https:\/\/v3\.football\.api-sports\.io\/odds\?fixture='\+fixtureId, APS, \{essentiel: true\}\)/);
  assert.match(SCRIPT, /injuries\?fixture='\+fixtureId, APS, \{ttlMs: ttl\('journalier'\), essentiel: true\}\)/);
  assert.match(SCRIPT, /if\(\(r\.__ia_status\|\|'OK'\)!=='OK'\|\|!Array\.isArray\(r\.response\)\)return\{fetch_ok:false,items:\[\]\};/);
  // Moins de 1,5 et 3,5 buts gardes sur le match (chance sans marge des deux lignes).
  assert.match(SCRIPT, /cu15:odds\.cu15\|\|'--',cu35:odds\.cu35\|\|'--'/);
  const { parseOdds } = require("../lib/odds.js");
  const o = parseOdds({ bookmakers: [{ id: 1, name: "B", bets: [{ name: "Goals Over/Under", values: [{ value: "Over 1.5", odd: "1.30" }, { value: "Under 1.5", odd: "3.40" }] }] }] });
  assert.deepEqual([o.co15, o.cu15], ["1.30", "3.40"]);
});
