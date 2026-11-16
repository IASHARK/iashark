"use strict";
// Ecrit pour l'ancienne regle du pari (1,40-2,20, avant le 11/11/2026) : remise en memoire, voir le module.
require("./ancienne-regle-pari.js");
// Match offert quand le moteur v3 est allume : on EXECUTE le vrai bloc du
// pipeline (designerMatchGratuit, .github/workflows/update-data.yml), pas une
// copie (demande du mathematicien, 29/09/2026). Regle ecrite en clair dans le
// bloc, filtres gardes par decision de Clement :
//  1. seulement les paris publies par le v3, coup d'envoi a venir ;
//  2. ligue « fiable » (FULL / STANDARD) s'il y en a ;
//  3. coup d'envoi entre 12 h et 22 h 59 heure de Paris s'il y en a ;
//  4. le plus probable, puis le plus tot, puis le plus petit numero de match.
// Jamais la « valeur ». Aucun pari v3 : aucun match offert, et le site affiche
// « pas de match offert aujourd'hui » au lieu d'un match verrouille.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { reasonableParisSlot } = require("../lib/kickoff-guard.js");
const FM = require("../lib/free-match.js");
const MO = require("../lib/matchs-offerts.js");

const root = path.join(__dirname, "..");
const WF = fs.readFileSync(path.join(root, ".github", "workflows", "update-data.yml"), "utf8");
const debut = WF.indexOf("(function designerMatchGratuit(){");
const fin = WF.indexOf("\n            })();", debut) + "\n            })();".length;
const BLOC = WF.slice(debut, fin);
const SELECTIONS = require("../lib/selections-nationales.js");
const LEAGUES_CONFIG = require("../config/leagues.json");
const PRONOSTIC = require("../lib/pronostic.js");
const designer = new Function("eligibleForFree", "FIXTURE_BY_ID", "PICK_FREEZE", "prevByFixture", "allMatchsData", "TODAY", "MOTEUR_V3", "reasonableParisSlot", "console", "SELECTIONS", "LEAGUES_CONFIG", "PRONOSTIC", "FREE_MATCH", BLOC);

const TODAY = "2026-10-03";
function v3(id, prob, date, extra) {
  return Object.assign({ id: id, date: date || TODAY + " 20:00", pari_rec: "Over 1.5", no_signal: false, model_probability: prob, cote_rec: "1.55",
    analysis_tier: "FULL_ANALYSIS", v3_pari: { cle: "TOTAL:plus1.5" }, moteur_v3: { source: "v3" }, home: { n: "A" + id }, away: { n: "B" + id },
    // Pose par lib/pronostic.js avant la designation (03/10/2026) : la selection est un pronostic.
    pronostic: { market_id: "over-15", chance: prob, selection: true } }, extra || {});
}
function ancien(id, prob, date, extra) {
  return Object.assign(v3(id, prob, date, extra), { v3_pari: undefined, moteur_v3: { source: "ancien moteur (repli)" } });
}
function choisir(matchs, opts) {
  opts = opts || {};
  const fx = {};
  matchs.forEach((m) => { fx[String(m.id)] = { started: !!m._commence }; });
  designer((f) => !!f && !f.started, fx, { keptFreeDesignations: () => opts.gardes || {} }, opts.prev || {}, matchs, TODAY,
    { actif: opts.eteint ? false : true }, reasonableParisSlot, { log: () => {} }, SELECTIONS, LEAGUES_CONFIG, PRONOSTIC, opts.sansRepliSite ? null : FM);
  return matchs.filter((m) => m.is_free).map((m) => m.id);
}

test("la regle est ecrite en clair dans le bloc du pipeline", () => {
  assert.match(BLOC, /REGLE COMPLETE, dans cet ordre/);
  assert.match(BLOC, /les grands championnats d'abord/);
  assert.match(BLOC, /Ligue fiable et creneau 12 h-22 h 59 : retires le 21\/10\/2026/);
  assert.match(BLOC, /REGLE DU 16\/11\/2026 : 18 h ou plus d'abord/);
  assert.match(BLOC, /le plus petit numero de match/);
});

test("le plus probable des paris v3, jamais un pari de l'ancien moteur ni la « valeur »", () => {
  assert.deepEqual(choisir([v3(1, 78), v3(2, 81), ancien(3, 90)]), [2]);
  // « Valeur » : 70 % a 1,70 (valeur +0,19) contre 83 % a 1,40 (valeur +0,16) : le plus probable gagne.
  assert.deepEqual(choisir([v3(1, 83, null, { cote_rec: "1.40" }), v3(2, 70, null, { cote_rec: "1.70" })]), [1]);
});

test("sans selection (simplification du 21/10) : hors fourchette jamais ; demain aussi ; une designation gardee ne se double pas", () => {
  const sansSel = (id, prob, date, extra) => ancien(id, prob, date, Object.assign({ pronostic: { market_id: "over-15", chance: prob, selection: false } }, extra || {}));
  assert.deepEqual(choisir([sansSel(1, 90, null, { cote_rec: "3.50" }), sansSel(2, 70)]), [2], "cote hors fourchette : jamais offerte");
  const demain = "2026-10-04";
  assert.deepEqual(choisir([sansSel(1, 70), sansSel(2, 80, demain + " 20:00"), sansSel(3, 60, demain + " 21:00")]).sort(), [1, 2], "aujourd'hui et demain");
  assert.deepEqual(choisir([sansSel(1, 70), sansSel(2, 90)], { gardes: { [TODAY]: sansSel(1, 70) } }).length, 1, "une designation gardee ne se double pas");
});

test("aujourd'hui sans designation : le match deja affiche par le site depuis minuit est garde", () => {
  const sansSel = (id, prob, date, extra) => ancien(id, prob, date, Object.assign({ pronostic: { market_id: "over-15", chance: prob, selection: false } }, extra || {}));
  // Le site (lib/free-match.js) montrait le 7 (meilleur data_quality_score) ; le moteur aurait prefere le 8 (plus probable).
  const prev = { 7: { id: 7, date: TODAY + " 21:00", has_signal: true, data_quality_score: 95, is_free: false }, 8: { id: 8, date: TODAY + " 20:00", has_signal: true, data_quality_score: 40, is_free: false } };
  assert.deepEqual(choisir([sansSel(7, 60), sansSel(8, 85)], { prev }), [7], "le match affiche depuis minuit reste offert");
  assert.deepEqual(choisir([sansSel(7, 60), sansSel(8, 85)], { prev, sansRepliSite: true }), [8], "sans la regle du site : le plus probable");
  const prevDesigne = { 9: { id: 9, date: TODAY + " 19:00", has_signal: true, data_quality_score: 10, is_free: true, free_day: TODAY } };
  assert.deepEqual(choisir([sansSel(7, 60), sansSel(8, 85)], { prev: Object.assign({}, prev, prevDesigne) }), [], "jour deja pourvu par un run precedent (match disparu) : jamais un autre match ce jour-la (regle existante)");
});

test("egalites : le plus tot, puis le plus petit numero de match (ordre fixe)", () => {
  assert.deepEqual(choisir([v3(5, 80, TODAY + " 21:00"), v3(9, 80, TODAY + " 18:00")]), [9]);
  assert.deepEqual(choisir([v3(9, 80, TODAY + " 18:00"), v3(5, 80, TODAY + " 18:00")]), [5]);
  assert.deepEqual(choisir([v3(5, 80, TODAY + " 18:00"), v3(9, 80, TODAY + " 18:00")]), [5]);
});

test("simplification du 21/10 : le plus probable, sans tri par ligue fiable ; depuis le 16/11, le soir d'abord", () => {
  // 16/11/2026 (Clement) : 83 % a 3 h du matin contre 74 % a 20 h : celui du soir (18 h ou plus d'abord).
  assert.deepEqual(choisir([v3(1, 83, TODAY + " 03:00"), v3(2, 74, TODAY + " 20:00")]), [2]);
  // 83 % en ligue non verifiee (tier) contre 74 % en ligue fiable : le plus probable.
  assert.deepEqual(choisir([v3(1, 83, null, { analysis_tier: "UNVERIFIED" }), v3(2, 74)]), [1]);
  // Mais jamais une competition « en test », ni une cote sous la fourchette.
  assert.deepEqual(choisir([v3(1, 83, null, { league_reliability: "en_test" }), v3(2, 74)]), [2]);
  assert.deepEqual(choisir([v3(1, 83, null, { cote_rec: "1.20" }), v3(2, 74)]), [2]);
});

test("jamais un match deja commence ; aujourd'hui et demain, un chacun", () => {
  assert.deepEqual(choisir([v3(1, 90, null, { _commence: true }), v3(2, 70)]), [2]);
  assert.deepEqual(choisir([v3(1, 70), v3(2, 75, "2026-10-04 20:00"), v3(3, 80, "2026-10-05 20:00")]).sort(), [1, 2]);
});

test("aucun pari v3 ce jour-la : repli sur une Selection IASHARK verifiee (decision de Clement, 03/10) ; sans selection, aucun match offert", () => {
  assert.deepEqual(choisir([ancien(1, 90), ancien(2, 80)]), [1], "jour sans pari v3 (treve) : la Selection IASHARK la plus probable d'une competition verifiee");
  assert.deepEqual(choisir([ancien(1, 90), v3(2, 60)]), [2], "un pari v3 ce jour-la : il reste prioritaire");
  // 21/10/2026 (simplification de Clement) : plus besoin d'une Selection IASHARK ; le pronostic publie
  // le plus probable d'une competition verifiee ; jamais une competition « en test ».
  assert.deepEqual(choisir([ancien(1, 90, null, { pronostic: { market_id: "over-15", chance: 90, selection: false } }), ancien(2, 95, null, { league_reliability: "en_test", pronostic: { market_id: "over-15", chance: 95, selection: false } })]), [1],
    "sans selection : le pronostic le plus probable d'une competition verifiee");
  // 16/11/2026 : un match offert chaque jour. Que des competitions « en test » : le plus probable est offert quand meme.
  assert.deepEqual(choisir([ancien(1, 90, null, { league_reliability: "en_test", pronostic: { market_id: "over-15", chance: 90, selection: false } }), ancien(2, 80, null, { league_reliability: "en_test" })]), [1],
    "ni selection ni competition verifiee : le plus probable est offert (avant le 16/11 : aucun)");
  const liste = [ancien(1, 90, null, { cote_rec: "1.20", pronostic: { market_id: "over-15", chance: 90, selection: false } }), ancien(2, 80, null, { cote_rec: "1.25" })];
  assert.deepEqual(choisir(liste), [], "aucune cote dans la fourchette : aucun match offert");
  assert.ok(liste.every((m) => m.is_free === false), "is_free pose a false sur chaque match");
  const h = { day: TODAY, now: TODAY + " 10:00" };
  const publique = liste.map((m) => ({ id: m.id, date: m.date, is_free: m.is_free, has_signal: false, data_quality_score: 90 }));
  // Depuis le 21/10/2026 le site garde un match de secours du jour (lib/free-match.js) : l'ancienne attente « null » etait perimee.
  assert.equal(FM.pickFreeMatchId(publique, h), 1, "sans designation : match de secours du site (repli du 21/10)");
  // (16/11/2026 : l'ancienne attente sur le texte « PAS DE MATCH OFFERT AUJOURD'HUI » de l'accueil est retiree, ce texte n'existe plus.)
  // Fichiers anciens (sans le drapeau is_free) : l'ancien repli reste possible.
  assert.equal(FM.pickFreeMatchId([{ id: 7, date: TODAY + " 20:00", has_signal: true, data_quality_score: 50 }], h), 7);
});

test("moteur v3 eteint : l'ancien choix reste en place (le bloc v3 ne s'applique pas)", () => {
  const ids = choisir([ancien(1, 60, null, { cote_rec: "1.70" }), ancien(2, 80, null, { cote_rec: "1.45" })], { eteint: true });
  assert.equal(ids.length, 1);
});

// Pari du match offert : masque jusqu'au coup d'envoi (decision de Clement du 04/10/2026), devoile ensuite
// depuis match_premium_data (le pari publie, fige jusqu'au coup d'envoi).
function devoiler(reg, id, ligne) {
  return MO.reveler(reg, [Object.assign({ fixture_id: id }, ligne)], Date.parse(TODAY + "T19:00:00Z"), TODAY + "T19:00:00.000Z");
}

test("archive des matchs offerts : pari masque jusqu'au coup d'envoi, puis devoile, puis cote de cloture", () => {
  const reg = MO.vide();
  const m = Object.assign(v3(11, 81, TODAY + " 20:00", { market_id: "over-15", cote_rec: "1.31" }), { is_free: true, moteur_v3: { source: "v3", version_moteur: "3.0.0" } });
  assert.equal(MO.enregistrer(reg, [m], { nowIso: "2026-10-03T06:05:00Z" }), 1);
  assert.equal(MO.enregistrer(reg, [m], { nowIso: "2026-10-03T12:00:00Z" }), 0, "une seule entree par jour et par match");
  assert.deepEqual(reg.matchs[0], { jour: TODAY, fixture_id: 11, match: "A11 - B11", ligue: null, coup_envoi: TODAY + " 20:00", pari: null, market_id: null, probabilite: null, chance_iashark: null, cote_affichee: null, moteur: "v3", moteur_version: "3.0.0", designe_le: "2026-10-03T06:05:00Z", cote_cloture: null, cloture_relevee_le: null, masque: true });
  assert.doesNotMatch(JSON.stringify(reg), /Over 1\.5|1\.31/, "aucun pari public avant le match");
  // Avant le coup d'envoi (18:00 UTC) : rien a devoiler ; apres : le pari publie.
  assert.deepEqual(MO.aReveler(reg, Date.parse(TODAY + "T17:00:00Z")), []);
  assert.deepEqual(MO.aReveler(reg, Date.parse(TODAY + "T19:00:00Z")), [11]);
  assert.equal(MO.reveler(reg, [{ fixture_id: 11, pari_rec: "Over 1.5", market_id: "over-15", cote_rec: 1.31, model_probability: 81, premium_fields: { chance_iashark: 79 } }], Date.parse(TODAY + "T17:00:00Z")), 0, "jamais avant le coup d'envoi");
  const snap = [{ fixture_id: 11, captured_at: "2026-10-03T17:45:00Z", raw_inputs: { odds: { co15: "1.27" } } }];
  assert.equal(MO.completerClotures(reg, snap, () => true), 0, "pari encore masque : la cloture attend");
  assert.equal(devoiler(reg, 11, { pari_rec: "Over 1.5", market_id: "over-15", cote_rec: 1.31, model_probability: 81, premium_fields: { chance_iashark: 79 } }), 1);
  assert.deepEqual([reg.matchs[0].pari, reg.matchs[0].market_id, reg.matchs[0].probabilite, reg.matchs[0].chance_iashark, reg.matchs[0].cote_affichee, reg.matchs[0].masque, reg.matchs[0].devoile_le],
    ["Over 1.5", "over-15", 81, 79, 1.31, undefined, TODAY + "T19:00:00.000Z"]);
  assert.equal(MO.completerClotures(reg, snap, () => false), 0, "match pas commence : on attend");
  assert.equal(MO.completerClotures(reg, snap, () => true), 1);
  assert.equal(reg.matchs[0].cote_cloture, 1.27);
  assert.deepEqual(MO.aCompleter(reg), []);
  assert.match(WF, /MATCHS_OFFERTS\.enregistrer\(regOfferts,allMatchsData\.filter\(function\(m\)\{ return m&&m\.is_free===true; \}\)/);
  assert.match(WF, /MATCHS_OFFERTS\.masquerAvantCoupEnvoi\(regOfferts,OFFERTS_MS\)/);
  assert.match(WF, /match_premium_data\?select=fixture_id,pari_rec,market_id,cote_rec,model_probability,premium_fields/);
  // Entree ecrite en clair avant le 04/10/2026 : masquee tant que le match n'a pas commence ; sans ligne, reste masquee.
  const ancien = MO.vide();
  ancien.matchs.push({ jour: TODAY, fixture_id: 15, coup_envoi: TODAY + " 20:00", pari: "Victoire Domicile", market_id: "home-win", probabilite: 59.8, chance_iashark: 58, cote_affichee: 1.62, cote_cloture: null, cloture_relevee_le: null });
  assert.equal(MO.masquerAvantCoupEnvoi(ancien, Date.parse(TODAY + "T10:00:00Z")), 1);
  assert.equal(ancien.matchs[0].pari, null);
  assert.equal(devoiler(ancien, 99, { pari_rec: "x" }), 0, "jamais un pari invente");
  assert.equal(ancien.matchs[0].masque, true);
  const joue = MO.vide();
  joue.matchs.push({ jour: TODAY, fixture_id: 16, coup_envoi: TODAY + " 20:00", pari: "Victoire Domicile", market_id: "home-win" });
  assert.equal(MO.masquerAvantCoupEnvoi(joue, Date.parse(TODAY + "T19:00:00Z")), 0, "match commence : deja public");
});

// Ronde 5 (30/09/2026). Point encore ouvert : la cote de cloture etait la derniere ligne
// renvoyee par la base, sans tri ni filtre « avant le coup d'envoi ». Preuve : 3 releves
// dans le desordre, dont un pris apres le coup d'envoi (cote en direct).
test("cote de cloture : le DERNIER releve pris AVANT le coup d'envoi, quel que soit l'ordre de la base", () => {
  const reg = MO.vide();
  const m = Object.assign(v3(12, 81, TODAY + " 20:00", { market_id: "over-15", cote_rec: "1.31" }), { is_free: true, moteur_v3: { source: "v3", version_moteur: "3.0.0" } });
  MO.enregistrer(reg, [m], { nowIso: "2026-10-03T06:05:00Z" });
  devoiler(reg, 12, { pari_rec: "Over 1.5", market_id: "over-15", cote_rec: 1.31, model_probability: 81 });
  // Coup d'envoi : 20:00 a Paris = 18:00 UTC.
  const snaps = [
    { fixture_id: 12, captured_at: TODAY + "T17:50:00Z", raw_inputs: { odds: { co15: "1.25" } } }, // derniere avant le match
    { fixture_id: 12, captured_at: TODAY + "T18:20:00Z", raw_inputs: { odds: { co15: "1.05" } } }, // en direct : jamais
    { fixture_id: 12, captured_at: TODAY + "T15:30:00Z", raw_inputs: { odds: { co15: "1.33" } } }, // plus ancienne
    { fixture_id: 12, captured_at: null, raw_inputs: { odds: { co15: "1.40" } } },                   // sans heure : ignoree
  ];
  // Avant la ronde 5 : la derniere ligne de la liste gagnait (ici 1.40, puis 1.33 sans elle).
  for (const ordre of [snaps, snaps.slice().reverse(), [snaps[1], snaps[3], snaps[0], snaps[2]]]) {
    const r = JSON.parse(JSON.stringify(reg));
    assert.equal(MO.completerClotures(r, ordre, () => true), 1);
    assert.equal(r.matchs[0].cote_cloture, 1.25);
    assert.equal(r.matchs[0].cloture_relevee_le, TODAY + "T17:50:00Z");
  }
  // Seulement un releve pris apres le coup d'envoi : rien n'est complete, on reessaiera.
  const r2 = JSON.parse(JSON.stringify(reg));
  assert.equal(MO.completerClotures(r2, [snaps[1]], () => true), 0);
  assert.equal(r2.matchs[0].cote_cloture, null);
  assert.deepEqual(MO.aCompleter(r2), [12]);
});

// Avocat du diable (30/09/2026, point 5) : le match offert, choisi sur le plus haut
// chiffre, tombait sur des paris « modèle seul » (hors d'Europe), ou le chiffre est en
// moyenne ~7 points trop haut au-dessus de la cote (549 paris jamais vus). Desormais :
// chaque jour, d'abord un pari « modèle + cotes » (Europe) ; un « modèle seul »
// seulement s'il n'y en a aucun ce jour-la (affiche au plus « Fiabilité moyenne »).
const europe = (id, prob, date, extra) => v3(id, prob, date, Object.assign({ moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes" } }, extra || {}));
const seul = (id, prob, date, extra) => v3(id, prob, date, Object.assign({ moteur_v3: { source: "v3", origine_probabilite: "modèle seul" } }, extra || {}));
test("match offert : d'abord un pari « modèle + cotes », un « modèle seul » seulement s'il n'y en a aucun", () => {
  // MLS 86 % (modele seul) contre Ligue 1 70 % (modele + cotes), meme jour : l'Europe gagne.
  assert.deepEqual(choisir([seul(1, 86), europe(2, 70)]), [2]);
  // Meme hors creneau ou en ligue moins fiable, un pari europeen passe avant le modele seul.
  assert.deepEqual(choisir([seul(1, 86, TODAY + " 20:00"), europe(2, 70, TODAY + " 23:30")]), [2]);
  assert.deepEqual(choisir([seul(1, 86), europe(2, 70, null, { analysis_tier: "UNVERIFIED" })]), [2]);
  // Aucun pari europeen ce jour-la : le modele seul le plus probable.
  assert.deepEqual(choisir([seul(1, 86), seul(2, 70)]), [1]);
  // Jour par jour : Europe aujourd'hui, modele seul demain (aucun europeen demain).
  assert.deepEqual(choisir([seul(1, 86), europe(2, 70), seul(3, 90, "2026-10-04 20:00")]).sort(), [2, 3]);
  // Origine absente ou inconnue : jamais comptee comme « modèle + cotes ».
  assert.deepEqual(choisir([v3(1, 86), europe(2, 70)]), [2]);
  // Une designation deja annoncee le matin (gel) n'est pas remise en cause.
  const matin = seul(1, 86);
  assert.deepEqual(choisir([matin, europe(2, 70)], { gardes: { [TODAY]: matin } }), [1]);
});

// Decision de Clement (30/09/2026), REMPLACEE le 03/10/2026 : la Ligue des nations et les
// eliminatoires du Mondial zone Europe (fiabilite.selections_cotes_marche) peuvent etre le
// match offert, et passent meme en premier (treve internationale), SI le match est une
// selection ; amicaux et autres selections nationales : jamais.
test("match offert : Ligue des nations / eliminatoires Europe si c'est une selection, jamais les amicaux", () => {
  const ldn = (id, prob, extra) => v3(id, prob, null, Object.assign({ league_id: 5, league: "UEFA Nations League", league_key: "nations_league", league_reliability: "en_test" }, extra || {}));
  assert.deepEqual(choisir([ldn(1, 70), v3(2, 90, null, { league_key: "premier" })]), [1], "competition connue d'abord : la Ligue des nations pendant la treve (decision de Clement, 03/10)");
  assert.deepEqual(choisir([ldn(1, 90, { pronostic: { market_id: "dc-1x", chance: 90, selection: false } }), v3(2, 70)]), [2], "un pronostic qui n'est pas une selection : jamais offert");
  assert.deepEqual(choisir([v3(1, 90, null, { league_id: 10, league: "Friendlies", league_key: "other" }), v3(2, 60)]), [2], "un amical ne passe jamais devant une competition connue");
  assert.deepEqual(choisir([v3(1, 90, null, { league_id: 10, league: "Friendlies", league_key: "other" })]), [1], "16/11/2026 : seul match du jour, offert quand meme (un match offert chaque jour)");
  assert.deepEqual(choisir([ancien(1, 90, null, { league_id: 32 }), ancien(2, 60)], { eteint: true }), [2], "selection hors liste (sans cle verifiee) : jamais, moteur v3 eteint aussi");
});

test("match offert : une selection nationale par les cotes du marche (sans pari v3) peut etre offerte, en premier", () => {
  const nat = v3(1, 64, null, { league_id: 5, league: "UEFA Nations League", league_key: "nations_league", league_reliability: "en_test", v3_pari: undefined, moteur_v3: { source: "v3", origine_probabilite: "modèle seul" },
    pronostic: { market_id: "home-win", chance: 64, selection: true, moteur: "cotes_marche" } });
  assert.deepEqual(choisir([nat, v3(2, 85, null, { league_key: "ligue1", moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes" } })]), [1]);
  assert.deepEqual(choisir([nat]), [1], "seule en lice : offerte");
  // Amical avec le meme marquage : jamais.
  const ami = Object.assign({}, nat, { id: 3, league_id: 10, league: "Friendlies", league_key: "other" });
  assert.deepEqual(choisir([ami, nat]), [1], "jamais devant la Ligue des nations");
  assert.deepEqual(choisir([ami]), [3], "16/11/2026 : seul match du jour, offert quand meme");
});

test("match offert : grands championnats avant les autres, puis la plus haute chance", () => {
  assert.deepEqual(choisir([v3(1, 88, null, { league_key: "league_two" }), v3(2, 72, null, { league_key: "ligue1" })]), [2]);
  assert.deepEqual(choisir([v3(1, 88, null, { league_key: "league_two" }), v3(2, 72, null, { league_key: "spain_segunda" })]), [1]);
  // La chance du pronostic (chance IASHARK) departage, pas la probabilite brute.
  assert.deepEqual(choisir([v3(1, 88, null, { pronostic: { market_id: "x", chance: 70, selection: true } }), v3(2, 80)]), [2]);
});

test("match offert : jamais un match sans selection (pronostic seul)", () => {
  const sansSel = v3(1, 95, null, { pari_rec: "", pronostic: { market_id: "dc-1x", chance: 95, selection: false } });
  assert.deepEqual(choisir([sansSel, v3(2, 60)]), [2]);
  assert.deepEqual(choisir([sansSel]), []);
});

// Avocat du diable (01/10/2026) : le match offert n'est JAMAIS dans une competition
// « Fiabilité : en test » (champ public league_reliability, lib/league-scope.js), meme
// s'il est le plus probable, meme s'il etait deja designe.
test("match offert : jamais une competition « en test », ni designee ce run ni gardee d'un run precedent", () => {
  assert.deepEqual(choisir([v3(1, 90, null, { league_reliability: "en_test" }), v3(2, 70)]), [2]);
  assert.deepEqual(choisir([v3(1, 90, null, { league_reliability: "en_test" })]), [1], "16/11/2026 : seul match du jour, en test -> offert quand meme (avant : aucun, et le site affichait un match de secours)");
  // Regle de Clement du 04/10/2026, 20 h (« le match gratuit reste le meme de 00 h a 23 h 59 ») : une designation
  // deja publiee reste jusqu'a minuit, meme si sa competition est passee « en test » (avant : remplacee).
  const matin = v3(1, 90, null, { league_reliability: "en_test" });
  assert.deepEqual(choisir([matin, v3(2, 70)], { gardes: { [TODAY]: matin } }), [1], "designation precedente : gardee jusqu'a minuit");
  assert.deepEqual(choisir([v3(1, 90, null, { league_reliability: "validee" }), v3(2, 70)]), [1], "temoin : competition validee");
});

test("fourchette du 04/10/2026 : le match offert a une cote dans la fourchette du pari (config : 1,40-2,20 depuis le 06/10), jamais un pari fige hors fourchette, meme garde", () => {
  const F = PRONOSTIC.fourchettePari(LEAGUES_CONFIG);
  assert.deepEqual([F.cote_min, F.cote_max], [1.4, 2.2]);
  assert.match(BLOC, /var FOURCHETTE_OFFERT=PRONOSTIC\.fourchettePari\(LEAGUES_CONFIG\);/);
  // Le plus probable est hors fourchette (1,30 ou 2,25) : c'est le suivant, dans la fourchette.
  assert.deepEqual(choisir([v3(1, 90, null, { cote_rec: "1.30" }), v3(2, 85, null, { cote_rec: "2.25" }), v3(3, 70, null, { cote_rec: "1.70" })]), [3]);
  // Bornes comprises.
  assert.deepEqual(choisir([v3(1, 90, null, { cote_rec: "1.39" }), v3(2, 80, null, { cote_rec: "1.40" })]), [2]);
  // Aucun pari dans la fourchette : aucun match offert.
  assert.deepEqual(choisir([v3(1, 90, null, { cote_rec: "1.25" }), v3(2, 60, null, { cote_rec: "2.30" })]), []);
  // Designation d'un run precedent (gel) dont le pari fige est hors fourchette : GARDEE jusqu'a minuit (regle de
  // Clement du 04/10/2026, 20 h ; avant : remplacee en cours de journee).
  const garde = v3(1, 90, null, { cote_rec: "1.25" });
  assert.deepEqual(choisir([garde, v3(2, 70, null, { cote_rec: "1.60" })], { gardes: { [TODAY]: garde } }), [1]);
});

// REGLE DE CLEMENT DU 04/10/2026, 20 h : « Le match gratuit reste le meme de 00 h a 23 h 59 (heure de Paris), quoi
// qu'il arrive. » On EXECUTE le vrai bloc du pipeline : une designation deja publiee pour le jour n'est jamais
// remplacee, meme commencee, reportee, sans pari, sans cote ou hors fourchette ; free_day dit pour quel jour.
test("match offert garde toute la journee : commence, reporte, sans pari, sans cote, hors fourchette -> le meme, free_day pose", () => {
  const cas = {
    commence: { _commence: true },
    reporte: { date: "2026-10-06 20:00", no_signal: true, pari_rec: "", no_signal_reason: "KICKOFF_POSTPONED" },
    sans_pari: { pari_rec: "", no_signal: true, pronostic: undefined },
    sans_cote: { cote_rec: "" },
    hors_fourchette: { cote_rec: "2.35" },
    moteur_eteint_ou_ancien: { v3_pari: undefined, moteur_v3: { source: "ancien moteur (repli)" } },
  };
  for (const [nom, mut] of Object.entries(cas)) {
    const offert = v3(1, 80, null, mut);
    const autre = v3(2, 85);
    const matchs = [offert, autre];
    assert.deepEqual(choisir(matchs, { gardes: { [TODAY]: offert } }), [1], nom);
    assert.equal(offert.free_day, TODAY, nom + " : jour de la designation");
    assert.equal(autre.free_day, undefined, nom);
  }
});

test("jour deja pourvu par un run precedent mais match introuvable : aucun AUTRE match offert ce jour-la ; le lendemain, choix normal", () => {
  const prev = { 7: { id: 7, date: TODAY + " 20:00", is_free: true } };
  assert.deepEqual(choisir([v3(2, 85), v3(3, 80, "2026-10-04 20:00")], { prev: prev }), [3], "aujourd'hui : personne d'autre ; demain : choisi");
  assert.deepEqual(choisir([v3(2, 85)], { prev: prev }), [], "ni par le repli");
  // Designation d'un jour passe : ignoree.
  const hier = { 7: { id: 7, date: "2026-10-02 20:00", is_free: true } };
  assert.deepEqual(choisir([v3(2, 85)], { prev: hier }), [2]);
});

test("site : un match offert reporte a un autre jour reste le match offert de son jour (free_day) jusqu'a minuit", () => {
  const horloge = { day: "2026-10-03", now: "2026-10-03 21:00" };
  const reporte = { id: 1, is_free: true, free_day: "2026-10-03", date: "2026-10-06 20:00" };
  const demain = { id: 2, is_free: true, free_day: "2026-10-04", date: "2026-10-04 20:00" };
  assert.equal(FM.pickFreeMatchId([demain, reporte], horloge), 1);
  // Le lendemain : celui du nouveau jour.
  assert.equal(FM.pickFreeMatchId([demain, reporte], { day: "2026-10-04", now: "2026-10-04 09:00" }), 2);
  // Commence ou termine : toujours celui du jour.
  const commence = { id: 3, is_free: true, free_day: "2026-10-03", date: "2026-10-03 15:00", status: "FT" };
  assert.equal(FM.pickFreeMatchId([commence, demain], horloge), 3);
});

test("archive des matchs offerts : un match offert reporte est enregistre une fois, pour son jour de designation", () => {
  const reg = MO.vide();
  const m = { id: 1, free_day: "2026-10-03", date: "2026-10-06 20:00", pari_rec: "Over 1.5", market_id: "over-15", cote_rec: "1.55", model_probability: 80, home: { n: "A" }, away: { n: "B" } };
  assert.equal(MO.enregistrer(reg, [m], { nowIso: "2026-10-03T08:00:00Z" }), 1);
  assert.equal(reg.matchs[0].jour, "2026-10-03");
  assert.equal(MO.enregistrer(reg, [m], { nowIso: "2026-10-03T12:00:00Z" }), 0, "pas de doublon");
});

// REGLE DU 16/11/2026 (Clement : « le pari le plus sur de la journee, parmi les matchs a 18 h minimum »).
test("match du soir : 18 h ou plus d'abord ; sinon le coup d'envoi le plus tardif ; un match offert chaque jour", () => {
  assert.match(BLOC, /var HEURE_SOIR=18;/);
  const sc = (id, prob, heure, extra) => ancien(id, prob, TODAY + " " + heure, Object.assign({ cote_rec: "1.75", pronostic: { market_id: "under-35", chance: prob, selection: false, voie: "scenario" } }, extra || {}));
  // Le plus probable est a 14 h : c'est le plus probable du soir qui est offert.
  assert.deepEqual(choisir([sc(1, 62, "00:00"), sc(2, 60, "14:00"), sc(3, 55, "18:00"), sc(4, 57, "20:45"), sc(5, 54, "21:15")]), [4]);
  // 18 h 00 pile compte ; 17 h 59 non.
  assert.deepEqual(choisir([sc(1, 70, "17:59"), sc(2, 51, "18:00")]), [2]);
  // REPLI : aucun match a 18 h ou plus -> le plus tardif (le plus probable des matchs a cette heure-la).
  assert.deepEqual(choisir([sc(1, 70, "00:00"), sc(2, 66, "13:00"), sc(3, 52, "16:00"), sc(4, 58, "16:00")]), [4]);
  // Treve du 16/11/2026 : selections sans « Selection IASHARK » et championnats « en test » -> la Ligue des nations du soir.
  const ldn = { league_id: 5, league: "UEFA Nations League", league_key: "nations_league", league_reliability: "en_test" };
  assert.deepEqual(choisir([sc(1, 52, "00:00", { league_reliability: "en_test" }), sc(2, 57, "21:15", { league_reliability: "en_test" }), sc(3, 54, "20:45", ldn), sc(4, 54, "20:45", ldn)]), [3]);
  // Le soir, la regle d'avant garde la main : une competition verifiee passe devant une competition « en test » plus probable.
  assert.deepEqual(choisir([sc(1, 60, "20:00", { league_reliability: "en_test" }), sc(2, 55, "21:00")]), [2]);
  // Cote hors fourchette, match commence : jamais, meme le soir.
  assert.deepEqual(choisir([sc(1, 70, "20:00", { cote_rec: "1.20" }), sc(2, 70, "21:00", { _commence: true }), sc(3, 55, "10:00")]), [3]);
});

test("match de secours affiche depuis minuit : garde seulement s'il est du soir, ou si aucun match du soir ne peut etre offert", () => {
  const sc = (id, prob, heure) => ancien(id, prob, TODAY + " " + heure, { cote_rec: "1.75", pronostic: { market_id: "under-35", chance: prob, selection: false } });
  const pub = (id, heure, q) => ({ id: id, date: TODAY + " " + heure, has_signal: true, data_quality_score: q, is_free: false });
  // Le site montrait le match de 00 h 00 : remplace par le plus probable du soir.
  assert.deepEqual(choisir([sc(7, 60, "00:00"), sc(8, 55, "20:45")], { prev: { 7: pub(7, "00:00", 95), 8: pub(8, "20:45", 40) } }), [8]);
  // Aucun match du soir a offrir : le match deja affiche reste (meme match toute la journee).
  assert.deepEqual(choisir([sc(7, 60, "13:00"), sc(8, 85, "15:00")], { prev: { 7: pub(7, "13:00", 95), 8: pub(8, "15:00", 40) } }), [7]);
});

// Avocat du diable (16/11/2026) : le jour J est designe des le calcul de J-1, puis gele.
test("lendemain : designe seulement s'il a deja un match du soir avec pari ; jamais un match de nuit gele la veille", () => {
  const DEMAIN = "2026-10-04";
  const sc = (id, prob, date) => ancien(id, prob, date, { cote_rec: "1.75", pronostic: { market_id: "under-35", chance: prob, selection: false } });
  // Calcul de la veille : demain n'a que des matchs de nuit avec pari -> rien pour demain (aujourd'hui garde son repli).
  assert.deepEqual(choisir([sc(1, 60, TODAY + " 15:00"), sc(2, 70, DEMAIN + " 01:00"), sc(3, 65, DEMAIN + " 03:30")]), [1]);
  // Des qu'un match du soir de demain a son pari : c'est lui.
  assert.deepEqual(choisir([sc(1, 60, TODAY + " 15:00"), sc(2, 70, DEMAIN + " 03:30"), sc(4, 55, DEMAIN + " 23:30")]).sort(), [1, 4]);
  // Rien aujourd'hui, que de la nuit demain : aucun match offert designe (jamais le match de nuit par le dernier repli).
  assert.deepEqual(choisir([sc(2, 70, DEMAIN + " 03:30")]), []);
});
