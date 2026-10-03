"use strict";
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
const designer = new Function("eligibleForFree", "FIXTURE_BY_ID", "PICK_FREEZE", "prevByFixture", "allMatchsData", "TODAY", "MOTEUR_V3", "reasonableParisSlot", "console", "SELECTIONS", BLOC);

const TODAY = "2026-10-03";
function v3(id, prob, date, extra) {
  return Object.assign({ id: id, date: date || TODAY + " 20:00", pari_rec: "Over 1.5", no_signal: false, model_probability: prob, cote_rec: "1.30",
    analysis_tier: "FULL_ANALYSIS", v3_pari: { cle: "TOTAL:plus1.5" }, moteur_v3: { source: "v3" }, home: { n: "A" + id }, away: { n: "B" + id } }, extra || {});
}
function ancien(id, prob, date, extra) {
  return Object.assign(v3(id, prob, date, extra), { v3_pari: undefined, moteur_v3: { source: "ancien moteur (repli)" } });
}
function choisir(matchs, opts) {
  opts = opts || {};
  const fx = {};
  matchs.forEach((m) => { fx[String(m.id)] = { started: !!m._commence }; });
  designer((f) => !!f && !f.started, fx, { keptFreeDesignations: () => opts.gardes || {} }, {}, matchs, TODAY,
    { actif: opts.eteint ? false : true }, reasonableParisSlot, { log: () => {} }, SELECTIONS);
  return matchs.filter((m) => m.is_free).map((m) => m.id);
}

test("la regle est ecrite en clair dans le bloc du pipeline", () => {
  assert.match(BLOC, /REGLE COMPLETE, dans cet ordre/);
  assert.match(BLOC, /ligue « fiable » \(analysis_tier FULL ou\s*\/\/\s*STANDARD\)/);
  assert.match(BLOC, /entre 12 h et 22 h 59, heure de Paris/);
  assert.match(BLOC, /le plus petit numero de match/);
});

test("le plus probable des paris v3, jamais un pari de l'ancien moteur ni la « valeur »", () => {
  assert.deepEqual(choisir([v3(1, 78), v3(2, 81), ancien(3, 90)]), [2]);
  // « Valeur » : 60 % a 1,70 (valeur +0,02) contre 83 % a 1,10 (valeur -0,09) : le plus probable gagne.
  assert.deepEqual(choisir([v3(1, 83, null, { cote_rec: "1.10" }), v3(2, 60, null, { cote_rec: "1.70" })]), [1]);
});

test("egalites : le plus tot, puis le plus petit numero de match (ordre fixe)", () => {
  assert.deepEqual(choisir([v3(5, 80, TODAY + " 21:00"), v3(9, 80, TODAY + " 18:00")]), [9]);
  assert.deepEqual(choisir([v3(9, 80, TODAY + " 18:00"), v3(5, 80, TODAY + " 18:00")]), [5]);
  assert.deepEqual(choisir([v3(5, 80, TODAY + " 18:00"), v3(9, 80, TODAY + " 18:00")]), [5]);
});

test("filtres gardes (decision de Clement) : ligue fiable, puis creneau 12 h-22 h 59, avant la probabilite", () => {
  // 83 % a 3 h du matin contre 74 % a 20 h : le creneau passe avant.
  assert.deepEqual(choisir([v3(1, 83, TODAY + " 03:00"), v3(2, 74, TODAY + " 20:00")]), [2]);
  // 83 % en ligue non verifiee contre 74 % en ligue fiable : la ligue passe avant.
  assert.deepEqual(choisir([v3(1, 83, null, { analysis_tier: "UNVERIFIED" }), v3(2, 74)]), [2]);
  // Aucun match dans le creneau : le plus probable quand meme.
  assert.deepEqual(choisir([v3(1, 83, TODAY + " 03:00"), v3(2, 74, TODAY + " 02:00")]), [1]);
});

test("jamais un match deja commence ; aujourd'hui et demain, un chacun", () => {
  assert.deepEqual(choisir([v3(1, 90, null, { _commence: true }), v3(2, 70)]), [2]);
  assert.deepEqual(choisir([v3(1, 70), v3(2, 75, "2026-10-04 20:00"), v3(3, 80, "2026-10-05 20:00")]).sort(), [1, 2]);
});

test("aucun pari v3 : aucun match offert, et le site n'en invente pas un verrouille", () => {
  const liste = [ancien(1, 90), ancien(2, 80)];
  assert.deepEqual(choisir(liste), []);
  assert.ok(liste.every((m) => m.is_free === false), "is_free pose a false sur chaque match");
  const h = { day: TODAY, now: TODAY + " 10:00" };
  const publique = liste.map((m) => ({ id: m.id, date: m.date, is_free: m.is_free, has_signal: false, data_quality_score: 90 }));
  assert.equal(FM.pickFreeMatch(publique, h), null, "pas de vitrine sur un match dont l'analyse n'est pas publique");
  // Message clair sur l'accueil, traduit.
  const accueil = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(accueil, /feature-loading">PAS DE MATCH OFFERT AUJOURD’HUI</);
  // Fichiers anciens (sans le drapeau is_free) : l'ancien repli reste possible.
  assert.equal(FM.pickFreeMatchId([{ id: 7, date: TODAY + " 20:00", has_signal: true, data_quality_score: 50 }], h), 7);
});

test("moteur v3 eteint : l'ancien choix reste en place (le bloc v3 ne s'applique pas)", () => {
  const ids = choisir([ancien(1, 60, null, { cote_rec: "2.00" }), ancien(2, 80, null, { cote_rec: "1.20" })], { eteint: true });
  assert.equal(ids.length, 1);
});

test("archive des matchs offerts : cote affichee, puis cote de cloture une fois le match commence", () => {
  const reg = MO.vide();
  const m = Object.assign(v3(11, 81, TODAY + " 20:00", { market_id: "over-15", cote_rec: "1.31" }), { is_free: true, moteur_v3: { source: "v3", version_moteur: "3.0.0" } });
  assert.equal(MO.enregistrer(reg, [m], { nowIso: "2026-10-03T06:05:00Z" }), 1);
  assert.equal(MO.enregistrer(reg, [m], { nowIso: "2026-10-03T12:00:00Z" }), 0, "une seule entree par jour et par match");
  assert.deepEqual(reg.matchs[0], { jour: TODAY, fixture_id: 11, match: "A11 - B11", ligue: null, coup_envoi: TODAY + " 20:00", pari: "Over 1.5", market_id: "over-15", probabilite: 81, chance_iashark: null, cote_affichee: 1.31, moteur: "v3", moteur_version: "3.0.0", designe_le: "2026-10-03T06:05:00Z", cote_cloture: null, cloture_relevee_le: null });
  const snap = [{ fixture_id: 11, captured_at: "2026-10-03T17:45:00Z", raw_inputs: { odds: { co15: "1.27" } } }];
  assert.equal(MO.completerClotures(reg, snap, () => false), 0, "match pas commence : on attend");
  assert.equal(MO.completerClotures(reg, snap, () => true), 1);
  assert.equal(reg.matchs[0].cote_cloture, 1.27);
  assert.deepEqual(MO.aCompleter(reg), []);
  assert.match(WF, /MATCHS_OFFERTS\.enregistrer\(regOfferts,allMatchsData\.filter\(function\(m\)\{ return m&&m\.is_free===true; \}\)/);
});

// Ronde 5 (30/09/2026). Point encore ouvert : la cote de cloture etait la derniere ligne
// renvoyee par la base, sans tri ni filtre « avant le coup d'envoi ». Preuve : 3 releves
// dans le desordre, dont un pris apres le coup d'envoi (cote en direct).
test("cote de cloture : le DERNIER releve pris AVANT le coup d'envoi, quel que soit l'ordre de la base", () => {
  const reg = MO.vide();
  const m = Object.assign(v3(12, 81, TODAY + " 20:00", { market_id: "over-15", cote_rec: "1.31" }), { is_free: true, moteur_v3: { source: "v3", version_moteur: "3.0.0" } });
  MO.enregistrer(reg, [m], { nowIso: "2026-10-03T06:05:00Z" });
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

// Decision de Clement (30/09/2026) : un match de selections nationales (Ligue des
// nations, amicaux, qualifications) ne peut jamais etre le match offert.
test("match offert : jamais un match de selections nationales", () => {
  assert.deepEqual(choisir([v3(1, 90, null, { league_id: 5, league: "UEFA Nations League" }), v3(2, 70)]), [2]);
  assert.deepEqual(choisir([v3(1, 90, null, { league_id: 10, league: "Friendlies" })]), []);
  assert.deepEqual(choisir([ancien(1, 90, null, { league_id: 32 }), ancien(2, 60)], { eteint: true }), [2], "moteur v3 eteint aussi");
});

// Avocat du diable (01/10/2026) : le match offert n'est JAMAIS dans une competition
// « Fiabilité : en test » (champ public league_reliability, lib/league-scope.js), meme
// s'il est le plus probable, meme s'il etait deja designe.
test("match offert : jamais une competition « en test », ni designee ce run ni gardee d'un run precedent", () => {
  assert.deepEqual(choisir([v3(1, 90, null, { league_reliability: "en_test" }), v3(2, 70)]), [2]);
  assert.deepEqual(choisir([v3(1, 90, null, { league_reliability: "en_test" })]), [], "seul match : en test -> aucun match offert");
  const matin = v3(1, 90, null, { league_reliability: "en_test" });
  assert.deepEqual(choisir([matin, v3(2, 70)], { gardes: { [TODAY]: matin } }), [2], "designation precedente en test : remplacee");
  assert.deepEqual(choisir([v3(1, 90, null, { league_reliability: "validee" }), v3(2, 70)]), [1], "temoin : competition validee");
});
