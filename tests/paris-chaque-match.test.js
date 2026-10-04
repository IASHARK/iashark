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

test("publierPronostics : le pronostic devient le pari publie (page du 29/09 : pari_rec, cote_rec, model_probability)", () => {
  const m = match();
  const row = { fixture_id: 101, pari_rec: "", cote_rec: null, model_probability: null, market_id: null, marche: null, raw_response: {} };
  P.poserPronostics([m], { configLigues: CFG });
  assert.ok(m.pronostic && m.pronostic.market_id, "pronostic pose");
  const r = P.publierPronostics([m], [row], { configLigues: CFG, figes: {}, nowIso: "2026-10-04T01:00:00.000Z" });
  assert.equal(r.publies, 1);
  assert.equal(m.pari_rec, P.MARCHE[m.market_id].marche);
  assert.ok(["1N2", "DC"].includes(P.MARCHE[m.market_id].famille), "selection : 1N2 ou double chance seulement");
  assert.ok(Number(m.cote_rec) >= P.COTE_MIN);
  assert.equal(m.no_signal, false);
  assert.equal(m.pick_frozen_at, "2026-10-04T01:00:00.000Z");
  assert.equal(row.pari_rec, m.pari_rec); assert.equal(row.market_id, m.market_id); assert.equal(row.model_probability, m.model_probability);
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

test("publierPronostics : jamais un pari fige remplace, jamais un match ferme, jamais « modele seul », jamais sous 1,20", () => {
  const fige = match({ id: 1 }); P.poserPronostics([fige], { configLigues: CFG });
  assert.equal(P.publierPronostics([fige], [], { configLigues: CFG, figes: { 1: true } }).publies, 0);
  const ferme = match({ id: 2, no_signal_reason: "KICKOFF_PASSED" }); P.poserPronostics([ferme], { configLigues: CFG });
  assert.equal(P.publierPronostics([ferme], [], { configLigues: CFG, figes: {} }).publies, 0);
  const sansCote = match({ id: 3, c1: null, cn: null, c2: null, cdc1x: null, cdc2x: null, cdc12: null, co25: null, cu25: null, p1: 50, pn: 30, p2: 20 });
  P.poserPronostics([sansCote], { configLigues: CFG });
  const r = P.publierPronostics([sansCote], [], { configLigues: CFG, figes: {} });
  assert.equal(r.publies, 0); assert.equal(r.voie_modele, 1); assert.equal(sansCote.pari_rec, "");
  const petiteCote = match({ id: 4, league_key: "ligue1", league_id: 61, c1: "1.05", cn: "12", c2: "30", cdc1x: "1.01", cdc2x: "8", cdc12: "1.02", co25: "1.10", cu25: "6.5" });
  P.poserPronostics([petiteCote], { configLigues: CFG });
  assert.equal(P.publierPronostics([petiteCote], [], { configLigues: CFG, figes: {} }).publies, 0);
  const horsListe = match({ id: 5, league_key: "colombia_primera_a", league_id: 239 }); P.poserPronostics([horsListe], { configLigues: CFG });
  assert.equal(P.publierPronostics([horsListe], [], { configLigues: CFG, figes: {} }).publies, 0);
});

test("publierPronostics : un championnat non verifie recoit son pari par les cotes du marche (fiabilite « en test »)", () => {
  const m = match({ id: 7, league_key: "k_league1", league_id: 292, league: "K League 1", c1: "2.10", cn: "3.30", c2: "3.40", cdc1x: "1.30", cdc2x: "1.70", cdc12: "1.35" });
  P.poserPronostics([m], { configLigues: CFG });
  assert.equal(m.pronostic.voie, "cotes_marche");
  assert.equal(m.pronostic.fiabilite, "en test");
  assert.equal(P.publierPronostics([m], [], { configLigues: CFG, figes: {} }).publies, 1);
  assert.ok(m.model_probability >= 50 && m.model_probability < 100);
});

test("option « cote plus haute » : 70 % ou plus, la plus grosse cote, jamais le pari principal, chance corrigee", () => {
  const m = match({ id: 9, league_key: "ligue1", league_id: 61, c1: "1.30", cn: "5.50", c2: "11.00", cdc1x: "1.05", cdc2x: "3.60", cdc12: "1.20", co25: "1.55", cu25: "2.45" });
  P.poserPronostics([m], { configLigues: CFG });
  P.publierPronostics([m], [], { configLigues: CFG, figes: {} });
  P.alignerChancesAffichees([m], [], { configLigues: CFG, figes: {} });
  assert.equal(P.poserOptionCote([m], { configLigues: CFG }), 1);
  const o = m.option_cote;
  assert.notEqual(o.market_id, m.market_id);
  assert.ok(o.chance_calculee >= P.OPTION_COTE.chance_min);
  assert.equal(o.chance, o.chance_calculee - 6);
  assert.equal(o.cote_minimum, Math.round((100 / o.chance) * 100) / 100);
  assert.ok(o.cote >= P.COTE_MIN);
  // Aucune issue a 70 % ou plus en dehors du pari : pas d'option.
  const serre = match({ id: 10, league_key: "ligue1", league_id: 61, c1: "2.60", cn: "3.20", c2: "2.80", cdc1x: "1.45", cdc2x: "1.50", cdc12: "1.35", co25: "2.00", cu25: "1.80" });
  P.poserPronostics([serre], { configLigues: CFG });
  P.publierPronostics([serre], [], { configLigues: CFG, figes: {} });
  P.poserOptionCote([serre], { configLigues: CFG });
  assert.equal(serre.option_cote, undefined);
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
  const iPub = SCRIPT.indexOf("PRONOSTIC.publierPronostics(allMatchsData,premiumRows,{configLigues:LEAGUES_CONFIG,figes:GEL_FIGES})");
  const iAlign = SCRIPT.indexOf("PRONOSTIC.alignerChancesAffichees(allMatchsData,premiumRows,{configLigues:LEAGUES_CONFIG,figes:GEL_FIGES})");
  const iOpt = SCRIPT.indexOf("PRONOSTIC.poserOptionCote(allMatchsData,{configLigues:LEAGUES_CONFIG})");
  assert.ok(iProno > 0 && iPub > iProno && iAlign > iPub && iOpt > iAlign);
  assert.ok(iOpt < SCRIPT.indexOf("(function designerMatchGratuit(){"));
  assert.ok(iOpt < SCRIPT.indexOf("await writePremiumData(premiumRows);"));
  assert.ok(iOpt < SCRIPT.indexOf("await updateHistorique(allMatchsData);"));
  assert.ok(SCRIPT.indexOf("var GEL_FIGES={}") < iPub, "le gel est connu avant la publication");
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
