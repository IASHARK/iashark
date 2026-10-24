"use strict";
// Integrite des empreintes des paris (23/10/2026). Enquete : le 21/10, la version du
// moteur de 4 paris deja publies (19/10, 20/10) a ete reecrite avant leur coup d'envoi
// (lib/pick-freeze.js#alignPendingPrediction) ; les journees etaient re-scellees le
// lendemain ; la cote revenait de predictions_archive en texte ; le verificateur sautait
// les journees avec un pari annule masque et tombait en echec sur la journee coupee par la
// limite de 500 paris de historique.json.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../lib/empreintes-paris.js");
const C = require("../lib/journal-corrections.js");
const PICK_FREEZE = require("../lib/pick-freeze.js");
const PREMIUM = require("../lib/premium-fields.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const WF = read(".github/workflows/update-data.yml");

const pari = (id, extra) => Object.assign({ fixture_id: id, home: "A" + id, away: "B" + id, prediction: "Over 1.5", cote: 1.3, model_probability: 64.5, market: "over-15", date: "2026-10-03", type: "single", result: "scheduled", moteur: "v3", moteur_version: "3.0.0", published_at: "2026-10-03T06:10:00.000Z", kickoff_at: "2026-10-03T19:00:00.000Z" }, extra || {});
const JOUR = "2026-10-03";
const opts = { aujourdhui: JOUR };

// ---------------------------------------------------------------- 1. moteur fige
test("1. moteur fige : un pari identique ne reecrit jamais moteur ni version (cas du 19/10)", () => {
  const match = { id: 1635672, pari_rec: "Victoire Domicile", cote_rec: "1.2", model_probability: 82, market_id: "home-win" };
  const p = pari(1635672, { prediction: "Victoire Domicile", cote: "1.2", model_probability: 82, market: "home-win", moteur: "v3", moteur_version: "3.0.0+60ce47f", kickoff_at: "2026-10-21T19:00:00.000Z" });
  const now = Date.parse("2026-10-21T05:39:00Z");
  // Run du 21/10 au matin : moteur v3 absent -> l'ancien moteur etait inscrit.
  assert.equal(PICK_FREEZE.alignPendingPrediction(p, match, { moteur: "ancien", moteur_version: "score-matrix-dc-early-season-v2", nowMs: now }), false);
  // Run du 21/10 apres-midi : nouvelle version du v3 -> inscrite aussi avant.
  assert.equal(PICK_FREEZE.alignPendingPrediction(p, match, { moteur: "v3", moteur_version: "3.0.0+7594318", nowMs: now + 9 * 3600000 }), false);
  assert.deepEqual([p.moteur, p.moteur_version, p.corrections], ["v3", "3.0.0+60ce47f", undefined]);
});

test("1. vraie correction avant le coup d'envoi : trace ancien/nouveau, motif de l'exception au gel", () => {
  const ko = Date.parse("2026-10-03T19:00:00Z");
  const p = pari(5, { prediction: "Buteur : X", cote: 2.1, market: "F1:buteur" });
  const match = { id: 5, pari_rec: "Buteur : Y", cote_rec: "2.3", model_probability: 41, market_id: "F1:buteur", remplacement_gel: { motif: "buteur absent de la composition", le: "2026-10-03T17:50:00Z" } };
  assert.equal(PICK_FREEZE.alignPendingPrediction(p, match, { moteur: "v3", moteur_version: "3.0.1", kickoffMs: ko, nowMs: ko - 3600000 }), true);
  assert.equal(p.corrections.length, 1);
  const c = p.corrections[0];
  assert.equal(c.motif, "exception au gel : buteur absent de la composition");
  assert.equal(c.le, "2026-10-03T18:00:00.000Z");
  assert.deepEqual(c.champs, ["prediction", "cote", "model_probability", "moteur_version"]);
  assert.deepEqual([c.ancien.prediction, c.ancien.cote, c.ancien.moteur_version], ["Buteur : X", 2.1, "3.0.0"]);
  assert.deepEqual([c.nouveau.prediction, c.nouveau.cote, c.nouveau.moteur_version], ["Buteur : Y", 2.3, "3.0.1"]);
  // Pari masque non relu : complete depuis le pari publie, moteur non touche, rien a tracer (ancien inconnu).
  const m = { fixture_id: 6, type: "single", result: "scheduled", redacted: true, moteur: "v3", moteur_version: "3.0.0", kickoff_at: "2026-10-03T19:00:00.000Z" };
  assert.equal(PICK_FREEZE.alignPendingPrediction(m, Object.assign({}, match, { id: 6 }), { moteur: "ancien", moteur_version: "x", nowMs: ko - 3600000 }), true);
  assert.deepEqual([m.moteur, m.moteur_version, m.corrections], ["v3", "3.0.0", undefined]);
});

test("1. trace d'un pari encore masque : valeurs chiffrees dans le fichier public, relues par le pipeline", () => {
  const ko = Date.parse("2026-10-03T19:00:00Z");
  const p = pari(5, { prediction: "Buteur : X", cote: 2.1 });
  PICK_FREEZE.alignPendingPrediction(p, { id: 5, pari_rec: "Buteur : Y", cote_rec: "2.3", model_probability: 41, market_id: "over-15" }, { nowMs: ko - 3600000 });
  const pub = PREMIUM.redactPendingPredictions([p], null, { nowMs: ko - 3600000, secret: "s" })[0];
  const texte = JSON.stringify(pub);
  assert.doesNotMatch(texte, /Buteur|2\.3|2\.1/, "aucune valeur du pari lisible avant le match");
  assert.equal(pub.corrections[0].masque, true);
  assert.deepEqual(pub.corrections[0].champs, ["prediction", "cote", "model_probability"]);
  // Run suivant : le pipeline dechiffre (meme secret) ; un autre secret ne lit rien.
  const relu = JSON.parse(texte);
  assert.equal(C.dechiffrerCorrections([JSON.parse(texte)], "autre"), 0);
  assert.equal(C.dechiffrerCorrections([relu], "s"), 1);
  assert.deepEqual(relu.corrections[0].ancien, p.corrections[0].ancien);
  assert.deepEqual(relu.corrections[0].nouveau, p.corrections[0].nouveau);
  // Chiffrement stable : le fichier public ne change pas a chaque run.
  assert.equal(PREMIUM.redactPendingPredictions([p], null, { nowMs: 0, secret: "s" })[0].corrections[0].chiffre, pub.corrections[0].chiffre);
  // Pipeline : dechiffre a la lecture, chiffre a l'ecriture.
  assert.match(WF, /CORRECTIONS\.dechiffrerCorrections\(predictions,process\.env\.EMPREINTE_SECRET\|\|SUPA_SERVICE_KEY\|\|''\)/);
  assert.match(WF, /redactPendingPredictions\(h\.predictions,null,\{nowMs:Date\.now\(\),secret:process\.env\.EMPREINTE_SECRET\|\|SUPA_SERVICE_KEY\|\|''\}\)/);
});

test("1. journal public des corrections : valeurs secretes ajoutees seulement au reglement (comme historique.json), jamais reecrit", () => {
  const ko = Date.parse("2026-10-03T19:00:00Z");
  const p = pari(5, { prediction: "Buteur : X", cote: 2.1 });
  PICK_FREEZE.alignPendingPrediction(p, { id: 5, pari_rec: "Buteur : Y", cote_rec: "2.3", model_probability: 41, market_id: "over-15" }, { nowMs: ko - 3600000, motif: "buteur absent" });
  const j = C.journalVide();
  assert.deepEqual(C.mettreAJourJournal(j, [p], ko - 3000000), { ajoutees: 1, completees: 0 });
  const e = j.corrections[0];
  assert.equal(e.masque, true);
  assert.equal(e.ancien.prediction, undefined); assert.equal(e.nouveau.cote, undefined);
  assert.deepEqual([e.fixture_id, e.jour, e.motif], [5, JOUR, "buteur absent"]);
  assert.deepEqual(C.mettreAJourJournal(j, [p], ko - 3000000), { ajoutees: 0, completees: 0 }, "pas de doublon");
  // Coup d'envoi passe mais pari pas encore regle : masque dans historique.json, donc dans le journal aussi.
  assert.deepEqual(C.mettreAJourJournal(j, [p], ko + 1), { ajoutees: 0, completees: 0 });
  assert.equal(e.masque, true);
  p.result = "win";
  assert.deepEqual(C.mettreAJourJournal(j, [p], ko + 7200000), { ajoutees: 0, completees: 1 });
  assert.deepEqual([e.ancien.prediction, e.nouveau.prediction, e.masque], ["Buteur : X", "Buteur : Y", undefined]);
  assert.equal(j.corrections.length, 1);
});

test("1. migration 0055 proposee (non appliquee) : moteur fige en base, journal des revisions", () => {
  const sql = read("supabase/migrations/0055_predictions_archive_moteur_fige.sql");
  assert.match(sql, /NE PAS APPLIQUER sans l'accord de Clement/);
  assert.match(sql, /'MOTEUR_REECRIT_PARI_IDENTIQUE'/);
  assert.match(sql, /new\.moteur := old\.moteur;\n\s+new\.moteur_version := old\.moteur_version;/);
  assert.match(sql, /create table if not exists public\.predictions_archive_revisions/);
  assert.match(sql, /now\(\) < old\.kickoff_at/);
  assert.match(sql, /before update on public\.predictions_archive/);
  assert.doesNotMatch(sql, /create policy/, "journal des revisions reserve au service role");
});

// ---------------------------------------------------------------- 2. cote en nombre
test("2. cote et chance toujours en nombres dans l'empreinte, quelle que soit la source", () => {
  const a = E.parisDuJour([pari(1, { cote: 1.2, model_probability: 82 })], JOUR).paris;
  const b = E.parisDuJour([pari(1, { cote: "1.2", model_probability: "82" })], JOUR).paris;
  const c = E.parisDuJour([pari(1, { cote: "1,20", kickoff_at: "2026-10-03T19:00:00+00:00" })], JOUR).paris;
  assert.deepEqual([a[0].cote, a[0].model_probability], [1.2, 82]);
  assert.equal(E.empreinteParis(a, "s"), E.empreinteParis(b, "s"));
  assert.deepEqual([c[0].cote, c[0].kickoff_at], [1.2, "2026-10-03T19:00:00.000Z"]);
  // Relecture de predictions_archive (colonne texte) : nombre.
  const pub = [{ fixture_id: 1, redacted: true, result: "scheduled" }];
  PREMIUM.rehydratePredictions(pub, [{ fixture_id: 1, prediction: "X", cote: "1.2", model_probability: 70, conf: "7.0" }]);
  assert.deepEqual([pub[0].cote, pub[0].conf], [1.2, 7]);
});

test("2. maillons d'avant le format 3 : cote empreinte en nombre ou en texte, la valeur doit etre la meme", () => {
  const reg = E.vide();
  const preds = [pari(1, { cote: "1.2" })];
  // Ancien maillon (sans format), calcule avec la cote en texte.
  const sel = E.sel("s", JOUR);
  const m = { n: 1, jour: JOUR, genere_le: "2026-10-03T06:00:00Z", nb_paris: 1, empreinte_paris: E.empreinteParis(E.parisDuJour(preds, JOUR, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
  m.empreinte = E.empreinteMaillon(m);
  reg.chaine.push(m);
  assert.deepEqual(E.verifier(reg, [pari(1, { cote: 1.2 })]).verifies, [1]);
  assert.equal(E.verifier(reg, [pari(1, { cote: 1.25 })]).ok, false, "valeur differente : ecart");
});

// ---------------------------------------------------------------- 3. un seul scelle
test("3. un pari est scelle une fois, le jour meme, avant le coup d'envoi ; jamais la veille ou le lendemain", () => {
  const reg = E.vide();
  const preds = [pari(1), pari(2, { kickoff_at: "2026-10-03T21:00:00.000Z" })];
  assert.match(E.ajouter(reg, JOUR, preds, "s", "2026-10-04T05:30:00Z", { aujourdhui: "2026-10-04" }).raison, /jamais re-scelle hors de son jour/);
  const a = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T06:00:00Z", opts);
  assert.deepEqual([a.ajoute, a.maillon.type, a.maillon.format, a.maillon.premier_coup_envoi], [true, "scelle", 3, "2026-10-03T19:00:00.000Z"]);
  // Un pari publie plus tard le meme jour : maillon « complement » sur CE pari seulement.
  preds.push(pari(3, { kickoff_at: "2026-10-03T20:00:00.000Z" }));
  const b = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T12:00:00Z", opts);
  assert.deepEqual([b.maillon.type, b.maillon.fixtures, b.maillon.nb_paris], ["complement", [3], 1]);
  // Rien de nouveau : rien n'est re-scelle, meme si un pari deja scelle a change.
  preds[0] = Object.assign({}, preds[0], { moteur_version: "autre" });
  assert.equal(E.ajouter(reg, JOUR, preds, "s", "2026-10-03T13:00:00Z", opts).raison, "inchange");
  // ... et la verification (secret du pipeline, avant la revelation) voit l'ecart.
  const v = E.verifier(reg, preds, { secret: "s", nowMs: Date.parse("2026-10-03T13:30:00Z") });
  assert.equal(v.ok, false);
  assert.match(v.erreurs[0], /maillon 1 \(2026-10-03\) : les paris ne correspondent plus/);
  assert.deepEqual(v.verifies, [2]);
  // Journee deja scellee a l'ancien format (jour de la mise en service) : les paris publies avant
  // son dernier maillon restent couverts par lui ; ceux publies apres sont scelles au format 3.
  const ancien = { chaine: [{ n: 1, jour: JOUR, genere_le: "2026-10-03T06:30:00Z", nb_paris: 1, empreinte_paris: "x", precedente: E.GENESE }] };
  assert.equal(E.ajouter(ancien, JOUR, [pari(1)], "s", "2026-10-03T07:00:00Z", opts).raison, "inchange");
  const tard = E.ajouter(ancien, JOUR, [pari(1), pari(2, { published_at: "2026-10-03T09:00:00.000Z" })], "s", "2026-10-03T09:05:00Z", opts);
  assert.deepEqual([tard.maillon.type, tard.maillon.fixtures], ["complement", [2]]);
  // Le jour par defaut est le jour en heure universelle (comme TODAY et p.date), plus celui de Paris.
  const r = E.vide();
  assert.match(E.ajouter(r, "2026-10-03", [pari(1)], "s", "2026-10-02T22:30:00Z").raison, /jamais re-scelle hors de son jour \(2026-10-03, nous sommes le 2026-10-02\)/);
});

test("3. scelle partiel : un pari deja commence n'empeche plus de sceller les autres, il est declare non scelle", () => {
  const reg = E.vide();
  const preds = [pari(1, { kickoff_at: "2026-10-03T12:00:00.000Z" }), pari(2, { kickoff_at: "2026-10-03T20:00:00.000Z" })];
  // Run 1 (05:00) bloque par le pari 2 masque : le pari 1 est scelle, le 2 attend.
  preds[1] = Object.assign({}, preds[1], { redacted: true, prediction: undefined });
  const r1 = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T05:00:00Z", opts);
  assert.deepEqual([r1.ajoute, r1.maillon.fixtures, r1.en_attente.map((x) => x.fixture_id)], [true, [1], [2]]);
  // Run 2 (13:00) : pari 2 relu, coup d'envoi a 20 h -> scelle (complement), meme si le match de 12 h a commence.
  preds[1] = pari(2, { kickoff_at: "2026-10-03T20:00:00.000Z" });
  const r2 = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T13:00:00Z", opts);
  assert.deepEqual([r2.ajoute, r2.maillon.type, r2.maillon.fixtures, r2.non_scelles], [true, "complement", [2], []]);
  // Pari publie puis jamais scelle avant son coup d'envoi : declare, avec la raison, jamais scelle apres.
  preds.push(pari(3, { kickoff_at: "2026-10-03T14:00:00.000Z" }), pari(4, { kickoff_at: "2026-10-03T21:00:00.000Z" }));
  const r3 = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T14:00:00Z", opts);
  assert.deepEqual(r3.maillon.fixtures, [4]);
  assert.deepEqual(r3.non_scelles, [{ fixture_id: 3, raison: "coup d'envoi passe avant le scelle", apres_coup: true, coup_envoi: "2026-10-03T14:00:00.000Z" }]);
  assert.deepEqual([r3.declaration.type, r3.declaration.nb_paris, r3.declaration.empreinte_paris], ["non_scelle", 0, null]);
  // D (23/10) : declare a l'heure de son coup d'envoi = ERREUR, meme le jour meme, sauf note publique.
  const v = E.verifier(reg, preds, { secret: "s", nowMs: Date.parse("2026-10-03T23:00:00Z") });
  assert.deepEqual([v.ok, v.verifies], [false, [1, 2, 3]], "maillon 4 = declaration, sans empreinte");
  assert.match(v.erreurs.join("\n"), /pari 3 \(2026-10-03\) : declare non scelle a l'heure de son coup d'envoi ou apres/);
  const vNote = E.verifier(reg, preds, { secret: "s", nowMs: Date.parse("2026-10-03T23:00:00Z"), parisNonScellesExpliques: [JOUR + "|3"] });
  assert.equal(vNote.ok, true);
  assert.match(vNote.avertissements.join("\n"), /pari 3 \(2026-10-03\) : ajoute apres coup, non scelle \(note publique/);
  // Sel du jour deja revele : un pari ajoute ensuite n'est jamais sale avec un sel public.
  preds.forEach((p) => { p.result = "loss"; });
  E.revelerSels(reg, "s", { predictions: preds, nowMs: Date.parse("2026-10-04T01:00:00Z") });
  assert.ok(reg.chaine[0].sel_revele);
  preds.push(pari(5, { kickoff_at: "2026-10-04T02:00:00.000Z", published_at: "2026-10-03T23:30:00.000Z" }));
  const r4 = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T23:40:00Z", opts);
  assert.deepEqual([r4.ajoute, r4.non_scelles], [false, [{ fixture_id: 5, raison: "sel du jour deja revele", coup_envoi: "2026-10-04T02:00:00.000Z" }]]);
  // Paris d'un jour passe (depuis le premier jour au format 3) jamais scelles : declares, une seule fois.
  const o5 = { aujourdhui: "2026-10-05" };
  const oublie = [pari(7, { date: "2026-10-04", kickoff_at: "2026-10-06T19:00:00.000Z" })];
  assert.equal(E.verifier(reg, preds.concat(oublie), { secret: "s", nowMs: Date.parse("2026-10-07T00:00:00Z") }).erreurs.some((e) => /pari 7 \(2026-10-04\) : ni scelle ni declare/.test(e)), true);
  const d = E.declarerNonScelles(reg, preds.concat(oublie), "2026-10-05T05:00:00Z", o5);
  assert.deepEqual([d.declares, d.maillons[0].jour, d.maillons[0].non_scelles[0].raison], [1, "2026-10-04", "non scelle le jour de sa publication"]);
  assert.equal(E.declarerNonScelles(reg, preds.concat(oublie), "2026-10-05T06:00:00Z", o5).declares, 0);
  const veille = [pari(8, { date: "2026-10-02" })];
  assert.equal(E.declarerNonScelles(reg, veille, "2026-10-05T06:00:00Z", o5).declares, 0, "avant le premier jour au format 3 : rien");
});

test("3. vraie correction : maillon « correction » explicite, chaque maillon se verifie sur l'etat a son heure", () => {
  const reg = E.vide();
  const preds = [pari(1), pari(2)];
  E.ajouter(reg, JOUR, preds, "s", "2026-10-03T06:00:00Z", opts);
  // Buteur absent a 17 h 50 : le pari 2 change avant son coup d'envoi.
  const ko = Date.parse("2026-10-03T19:00:00Z");
  PICK_FREEZE.alignPendingPrediction(preds[1], { id: 2, pari_rec: "Victoire Domicile", cote_rec: "1.7", model_probability: 60, market_id: "home-win" }, { nowMs: ko - 4200000, motif: "buteur absent de la composition" });
  const trace = preds[1].corrections[0];
  const c = E.corriger(reg, JOUR, preds, "s", "2026-10-03T17:51:00Z", { fixture_id: 2, motif: trace.motif, le: trace.le, ancien: trace.ancien });
  assert.equal(c.ajoute, true);
  assert.deepEqual([c.maillon.type, c.maillon.fixtures, c.maillon.correction.motif], ["correction", [2], "buteur absent de la composition"]);
  assert.match(c.maillon.correction.ancienne_empreinte, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(c.maillon).indexOf("Victoire"), -1, "aucune valeur du pari dans le maillon");
  // Le scelle d'origine se verifie (correction posterieure defaite), la correction aussi.
  const v = E.verifier(reg, preds, { secret: "s", nowMs: Date.parse("2026-10-03T18:00:00Z") });
  assert.deepEqual([v.ok, v.verifies], [true, [1, 2]]);
  // Sans la trace, le scelle d'origine ne correspond plus : rien n'est cache.
  const sansTrace = preds.map((p) => Object.assign({}, p, { corrections: undefined }));
  assert.equal(E.verifier(reg, sansTrace, { secret: "s", nowMs: Date.parse("2026-10-03T18:00:00Z") }).ok, false);
  // Apres le coup d'envoi : plus aucune correction.
  assert.match(E.corriger(reg, JOUR, preds, "s", "2026-10-03T19:00:00Z", { fixture_id: 2, motif: "x", le: "2026-10-03T19:00:00Z", ancien: trace.ancien }).raison, /coup d'envoi passe/);
  // Un maillon retouche (heure du scelle avancee apres le coup d'envoi) casse la chaine.
  const triche = JSON.parse(JSON.stringify(reg)); triche.chaine[0].genere_le = "2026-10-03T20:00:00Z";
  assert.equal(E.verifier(triche).ok, false);
});

// ---------------------------------------------------------------- 4bis. controle de l'historique public
test("4bis. pari d'un match reporte : public une fois l'heure prevue passee, masque avant", () => {
  const p = { fixture_id: 1603053, result: "void", reporte: true, prediction: "Over 1.5", cote: 1.3, market: "over-15", kickoff_at: "2026-10-19T15:20:00.000Z" };
  const avant = PREMIUM.redactPendingPredictions([p], null, { nowMs: Date.parse("2026-10-19T15:00:00Z") })[0];
  assert.deepEqual([avant.redacted, avant.prediction], [true, undefined]);
  const apres = PREMIUM.redactPendingPredictions([p], null, { nowMs: Date.parse("2026-10-19T15:20:00Z") })[0];
  assert.deepEqual([apres.redacted, apres.prediction, apres.cote], [undefined, "Over 1.5", 1.3]);
  // Sans heure d'origine : on ne sait pas, reste masque.
  assert.equal(PREMIUM.redactPendingPredictions([Object.assign({}, p, { kickoff_at: null })], null, { nowMs: Date.now() })[0].redacted, true);
  // Pari en attente (pas encore regle) : toujours masque.
  assert.equal(PREMIUM.redactPendingPredictions([Object.assign({}, p, { result: "scheduled", reporte: undefined })], null, { nowMs: Date.now() })[0].redacted, true);
});

test("4bis. historique.json en journees entieres ; une journee coupee n'est jamais une fausse alerte", () => {
  const liste = [pari(1, { date: "2026-10-05" }), pari(2, { date: "2026-10-04" }), pari(3, { date: "2026-10-04" }), pari(4, { date: "2026-10-03" })];
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2).map((p) => p.fixture_id), [1, 2, 3]);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 9).map((p) => p.fixture_id), [1, 2, 3, 4]);
  assert.match(WF, /histo\.predictions=EMPREINTES\.fenetreJourneesEntieres\(histo\.predictions,500,\{registre:registreFenetre,figees:joursFiges\}\);/);
  assert.doesNotMatch(WF, /histo\.predictions=histo\.predictions\.slice\(0,500\);/);
  // Ancien maillon de 2 paris, un seul encore dans le fichier : ERREUR (pari retire), sauf journee
  // documentee dans preuves/corrections.json (14/10).
  const sel = E.sel("s", JOUR);
  const deux = [pari(1), pari(2)];
  const m = { n: 1, jour: JOUR, genere_le: "2026-10-03T06:00:00Z", nb_paris: 2, empreinte_paris: E.empreinteParis(E.parisDuJour(deux, JOUR, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
  m.empreinte = E.empreinteMaillon(m);
  const v = E.verifier({ chaine: [m] }, [pari(1)]);
  assert.deepEqual([v.ok, v.verifies], [false, []]);
  assert.match(v.erreurs[0], /1 paris dans les donnees pour 2 scelles par le dernier maillon/);
  const doc = E.verifier({ chaine: [m] }, [pari(1)], { journeesNonVerifiables: [JOUR] });
  assert.deepEqual([doc.ok, doc.verifies, doc.non_verifiables.length], [true, [], 1]);
  assert.match(doc.non_verifiables[0].raison, /documentee/);
  assert.deepEqual(C.journeesNonVerifiables(JSON.parse(read("preuves/corrections.json"))), ["2026-10-14"]);
  assert.deepEqual(E.verifier({ chaine: [m] }, deux).verifies, [1], "journee complete (fichier preuves/paris-scelles) : verifiee");
});

test("4bis. sel revele seulement 3 h apres le dernier coup d'envoi de la journee", () => {
  const reg = E.vide();
  const preds = [pari(1), pari(2, { kickoff_at: "2026-10-05T19:00:00.000Z" })];
  E.ajouter(reg, JOUR, preds, "s", "2026-10-03T06:00:00Z", opts);
  assert.equal(E.revelerSels(reg, "s", { predictions: preds, nowMs: Date.parse("2026-10-05T12:00:00Z") }), 0, "J+2 mais un match pas joue : rien");
  assert.equal(E.revelerSels(reg, "s", { predictions: preds, nowMs: Date.parse("2026-10-05T22:00:00Z") }), 0, "3 h passees mais paris pas regles : rien");
  preds.forEach((p) => { p.result = "win"; });
  assert.equal(E.revelerSels(reg, "s", { predictions: preds, nowMs: Date.parse("2026-10-05T22:00:00Z") }), 1);
  assert.equal(reg.chaine[0].sel_revele, E.sel("s", JOUR));
});

test("4bis. pipeline : chaque maillon verifie avant et apres le scelle, ecart = run au rouge", () => {
  assert.match(WF, /var verif=EMPREINTES\.verifier\(registreEmp,parisPourVerif\(\),optsVerif\(\)\);/);
  assert.match(WF, /journeesNonVerifiables:CORRECTIONS\.journeesNonVerifiables\(journalCorr\)/);
  assert.match(WF, /if\(!verif\.ok\) alerteEmpreintes\(/);
  assert.match(WF, /if\(!verifApres\.ok\) alerteEmpreintes\(/);
  assert.match(WF, /iashark-empreintes-alerte\.txt/);
  // Etape d'alerte presente, mais NON BLOQUANTE (voir test 9. alerte non bloquante).
  assert.match(WF, /- name: Alerte empreintes des paris\n\s+# [^\n]*\n(?:\s+#[^\n]*\n)*\s+if: always\(\)\n/);
  // Journees verifiees figees dans preuves/paris-scelles/ (jamais coupees), relues pour la verification.
  assert.match(WF, /var DOSSIER_SCELLES='preuves\/paris-scelles';/);
  assert.match(WF, /fs\.readdirSync\(DOSSIER_SCELLES\)/);
  // Corrections de ce run scellees par un maillon « correction » avant les nouveaux paris du jour.
  assert.ok(WF.indexOf("EMPREINTES.corriger(registreEmp,") < WF.indexOf("EMPREINTES.ajouter(registreEmp,TODAY,"));
  assert.match(WF, /CORRECTIONS_DU_RUN\.push\(/);
  // Archive avant le scelle (inchange), fenetre de historique.json apres le scelle.
  assert.ok(WF.indexOf("await writePredictionsArchive(histo.predictions);") < WF.indexOf("EMPREINTES.ajouter(registreEmp,TODAY,"));
  assert.ok(WF.indexOf("EMPREINTES.ajouter(registreEmp,TODAY,") < WF.indexOf("EMPREINTES.fenetreJourneesEntieres(histo.predictions,500,"));
});

// ---------------------------------------------------------------- 4. journal public
test("4. preuves/corrections.json : notes factuelles du 19/10 et du 14/10, sans promesse ni chiffre de resultat", () => {
  const j = JSON.parse(read("preuves/corrections.json"));
  const notes = j.notes.map((n) => n.texte).join("\n");
  assert.ok(j.notes.some((n) => n.jour === "2026-10-19"));
  assert.ok(j.notes.some((n) => n.jour === "2026-10-14"));
  assert.match(notes, /n'ont pas change/);
  assert.match(notes, /ne prouve ni une modification de ces paris, ni leur integrite/);
  assert.doesNotMatch(notes, /aucun pari n'a ete modifie/i);
  assert.doesNotMatch(notes, /%|gagn|perdu|reussite|garanti/i);
  // 4 paris x 2 reecritures, dans un intervalle prouve par les commits et les maillons.
  const v = j.corrections.filter((e) => e.type === "version_moteur");
  assert.equal(v.length, 8);
  assert.deepEqual([...new Set(v.map((e) => e.fixture_id))].sort(), [1635672, 1635716, 1635737, 1636449]);
  v.forEach((e) => { assert.deepEqual(e.champs, ["moteur", "moteur_version"]); assert.ok(Date.parse(e.apres) < Date.parse(e.au_plus_tard)); });
});

test("4. donnees reelles : avec le journal, les maillons du 19/10 se verifient ; sans lui, non (seul le moteur a change)", () => {
  const reg = JSON.parse(read("preuves/empreintes-paris.json"));
  const h = JSON.parse(read("historique.json"));
  let preds = h.predictions;
  const dossier = path.join(root, "preuves/paris-scelles");
  if (fs.existsSync(dossier)) fs.readdirSync(dossier).forEach((f) => { preds = preds.concat(JSON.parse(fs.readFileSync(path.join(dossier, f), "utf8")).paris); });
  const corr = C.pourVerification(JSON.parse(read("preuves/corrections.json")));
  const avec = E.verifier(reg, preds, { corrections: corr });
  const du19 = reg.chaine.filter((m) => m.jour === "2026-10-19").map((m) => m.n);
  const present = E.parisDuJour(preds, "2026-10-19").paris.length > 0;
  if (!present) return; // journee sortie des donnees publiques
  assert.deepEqual(avec.erreurs.filter((e) => /2026-10-19/.test(e)), []);
  du19.forEach((n) => assert.ok(avec.verifies.includes(n), "maillon " + n));
  const sans = E.verifier(reg, preds.map((p) => Object.assign({}, p, { corrections: undefined })));
  du19.forEach((n) => assert.ok(!sans.verifies.includes(n), "maillon " + n + " sans le journal"));
});

// ---------------------------------------------------------------- 5. attaques (avocat du diable, PR #195)
// Scenarios de scratchpad/avocat-195/attaques.js : avant ces corrections, la suppression, l'ajout,
// la correction antidatee et la correction masquee donnaient ok=true (journee « non verifiable »).
const J5 = "2026-11-02";
const p5 = (fid, pred, cote, ko) => ({ fixture_id: fid, home: "H" + fid, away: "A" + fid, prediction: pred, cote: cote, model_probability: 60, market: "m", moteur: "v3", moteur_version: "3.0.0+x", published_at: "2026-11-02T03:59:00.000Z", kickoff_at: ko, date: J5, type: "single", result: "scheduled" });
const base5 = () => [p5(1, "Victoire domicile", 1.5, "2026-11-02T19:00:00.000Z"), p5(2, "Plus de 2,5 buts", 1.6, "2026-11-02T21:00:00.000Z")];
const scelle5 = (preds) => { const r = E.vide(); assert.equal(E.ajouter(r, J5, preds, "s", "2026-11-02T04:00:00.000Z", { aujourdhui: J5 }).ajoute, true); return r; };
const apres5 = { secret: "s", nowMs: Date.parse("2026-11-03T12:00:00Z") };

test("5. temoins : rien ne change -> verifie ; pari modifie sans trace -> erreur", () => {
  const p = base5(); const reg = scelle5(p);
  assert.deepEqual([E.verifier(reg, p, apres5).ok, E.verifier(reg, p, apres5).verifies], [true, [1]]);
  p[0].prediction = "Match nul";
  assert.equal(E.verifier(reg, p, apres5).ok, false);
});

test("5. attaque : pari perdant SUPPRIME apres coup -> erreur (plus « non verifiable »)", () => {
  const p = base5(); const reg = scelle5(p);
  p[1].result = "loss"; p.splice(1, 1);
  const v = E.verifier(reg, p, apres5);
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /maillon 1 \(2026-11-02\) : pari\(s\) scelle\(s\) absent\(s\) des donnees publiques \(historique\.json, preuves\/paris-scelles\/\) : 2/);
  // Journee entierement sortie des donnees : ERREUR aussi (A2, 23/10 ; avant : « non verifiable »).
  assert.equal(E.verifier(reg, [], apres5).ok, false);
});

test("5. attaque : pari gagnant AJOUTE apres coup au jour scelle -> erreur", () => {
  const p = base5(); const reg = scelle5(p);
  p.push(Object.assign(p5(3, "Victoire exterieur", 2.1, "2026-11-02T19:00:00.000Z"), { result: "win" }));
  const v = E.verifier(reg, p, apres5);
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /pari 3 \(2026-11-02\) : ni scelle ni declare non scelle/);
  // Ancien format : un pari de plus que le dernier maillon de la journee est une erreur aussi.
  const sel = E.sel("s", J5);
  const m = { n: 1, jour: J5, genere_le: "2026-11-02T04:00:00Z", nb_paris: 2, empreinte_paris: E.empreinteParis(E.parisDuJour(base5(), J5, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
  m.empreinte = E.empreinteMaillon(m);
  assert.match(E.verifier({ chaine: [m] }, p).erreurs.join("\n"), /3 paris dans les donnees pour 2 scelles/);
});

test("5. attaque : pari change apres le match + correction ANTIDATEE sans maillon « correction » -> erreur", () => {
  const p = base5(); const reg = scelle5(p);
  p[0].prediction = "Match nul"; p[0].result = "win";
  p[0].corrections = [{ le: "2026-11-02T10:00:00.000Z", motif: "exception au gel", champs: ["prediction"], ancien: { prediction: "Victoire domicile" }, nouveau: { prediction: "Match nul" } }];
  const v = E.verifier(reg, p, apres5);
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /pari 1 \(2026-11-02\) : correction du 2026-11-02T10:00:00.000Z sans maillon « correction »/);
  // La meme correction, scellee avant le coup d'envoi par un maillon « correction » : acceptee.
  const q = base5(); const r2 = scelle5(q);
  const ko = Date.parse("2026-11-02T19:00:00Z");
  PICK_FREEZE.alignPendingPrediction(q[0], { id: 1, pari_rec: "Match nul", cote_rec: "3.1", model_probability: 30, market_id: "m" }, { nowMs: ko - 3 * 3600000, motif: "buteur absent" });
  const t = q[0].corrections[0];
  assert.equal(E.corriger(r2, J5, q, "s", "2026-11-02T16:01:00Z", { fixture_id: 1, motif: t.motif, le: t.le, ancien: t.ancien }).ajoute, true);
  assert.deepEqual([E.verifier(r2, q, apres5).ok, E.verifier(r2, q, apres5).verifies], [true, [1, 2]]);
  // Ancienne empreinte de la correction controlee : un ancien pari retouche dans la trace -> erreur.
  const triche = q.map((x) => Object.assign({}, x));
  triche[0].corrections = [Object.assign({}, t, { ancien: Object.assign({}, t.ancien, { cote: 1.9 }) })];
  assert.equal(E.verifier(r2, triche, apres5).ok, false);
});

test("5. attaque : correction MASQUEE sans valeurs -> non verifiable tant que le pari est masque, erreur une fois public", () => {
  const p = base5(); const reg = scelle5(p);
  p[0].prediction = "Match nul";
  p[0].corrections = [{ le: "2026-11-02T10:00:00.000Z", masque: true }];
  const v = E.verifier(reg, p, apres5);
  assert.equal(v.ok, false, "sans maillon « correction » : erreur dans tous les cas");
  assert.match(v.erreurs.join("\n"), /correction encore masquee alors que le pari est public/);
  // Correction legitime (maillon « correction ») encore masquee, pari encore masque : non verifiable.
  const q = base5(); const r2 = scelle5(q);
  const ko = Date.parse("2026-11-02T19:00:00Z");
  PICK_FREEZE.alignPendingPrediction(q[0], { id: 1, pari_rec: "Match nul", cote_rec: "3.1", model_probability: 30, market_id: "m" }, { nowMs: ko - 3 * 3600000, motif: "buteur absent" });
  const t = q[0].corrections[0];
  E.corriger(r2, J5, q, "s", "2026-11-02T16:01:00Z", { fixture_id: 1, motif: t.motif, le: t.le, ancien: t.ancien });
  const pub = PREMIUM.redactPendingPredictions(q, null, { nowMs: ko - 3600000 });
  const w = E.verifier(r2, pub, { secret: "s", nowMs: ko - 3600000 });
  assert.equal(w.ok, true);
  assert.ok(w.non_verifiables.some((x) => x.n === 1 && /masque/.test(x.raison)));
  // Meme correction dans le journal (masquee) et dans la ligne (dechiffree) : la version dechiffree l'emporte.
  const journal = [{ fixture_id: 1, le: t.le, masque: true, ancien: { moteur: "v3" } }];
  assert.deepEqual(E.verifier(r2, q, Object.assign({ corrections: journal }, apres5)).verifies, [1, 2]);
});

test("5. sel jamais revele si un pari scelle du jour manque des donnees", () => {
  const p = base5().concat([p5(5, "Victoire domicile", 1.5, "2026-11-04T19:00:00.000Z")]);
  const reg = scelle5(p);
  assert.equal(E.revelerSels(reg, "s", { predictions: p, nowMs: Date.parse("2026-11-03T12:00:00Z") }), 0);
  // Le pari du 04/11 absent : avant, le sel sortait le 03/11 (avant son match).
  assert.equal(E.revelerSels(reg, "s", { predictions: p.filter((x) => x.fixture_id !== 5), nowMs: Date.parse("2026-11-03T12:00:00Z") }), 0);
  p.forEach((x) => { x.result = "loss"; });
  assert.equal(E.revelerSels(reg, "s", { predictions: p, nowMs: Date.parse("2026-11-04T22:01:00Z") }), 1);
});

test("5. heures des maillons : une correction antidatee ajoutee en fin de chaine casse la verification", () => {
  const p = base5(); const reg = scelle5(p);
  E.ajouter(reg, J5, p.concat([p5(6, "X", 1.5, "2026-11-02T22:00:00.000Z")]), "s", "2026-11-02T15:00:00Z", { aujourdhui: J5 });
  const m = { jour: J5, genere_le: "2026-11-02T10:00:00Z", nb_paris: 1, empreinte_paris: "x", format: 3, type: "correction", fixtures: [1], premier_coup_envoi: "2026-11-02T19:00:00.000Z", correction: { fixture_id: 1, motif: "x", le: "2026-11-02T09:59:00Z", ancienne_empreinte: "y" } };
  m.n = reg.chaine.length + 1; m.precedente = reg.chaine[reg.chaine.length - 1].empreinte; m.empreinte = E.empreinteMaillon(m); reg.chaine.push(m);
  assert.match(E.verifier(reg).erreurs.join("\n"), /maillon 3 : heure anterieure au maillon precedent/);
});

// ---------------------------------------------------------------- 6. ajout seulement
test("6. chaine et journal : ajout seulement (jamais repartis de zero ni reecrits)", () => {
  const p = base5(); const reg = scelle5(p);
  const avant = JSON.parse(JSON.stringify(reg));
  E.ajouter(reg, J5, p.concat([p5(6, "X", 1.5, "2026-11-02T22:00:00.000Z")]), "s", "2026-11-02T15:00:00Z", { aujourdhui: J5 });
  E.revelerSels(reg, "s", { predictions: p, nowMs: Date.parse("2026-11-03T12:00:00Z") });
  assert.deepEqual(E.prolonge(avant, reg), [], "maillon ajoute et sel revele : permis");
  assert.deepEqual(E.prolonge(null, reg), []);
  assert.match(E.prolonge(avant, E.vide()).join(), /0 maillons, l'ancienne 1/);
  const retouche = JSON.parse(JSON.stringify(reg)); retouche.chaine[0].nb_paris = 9;
  assert.match(E.prolonge(avant, retouche).join(), /maillon 1 modifie/);
  // Journal : une entree masquee peut etre completee ; rien d'autre ne change.
  const j0 = JSON.parse(read("preuves/corrections.json"));
  const j1 = JSON.parse(JSON.stringify(j0));
  j1.corrections.push({ id: "9|t", type: "pari", fixture_id: 9, le: "t", masque: true, ancien: { moteur: "v3" }, nouveau: { moteur: "v3" } });
  assert.deepEqual(C.ajoutSeulement(j0, j1), []);
  const j2 = JSON.parse(JSON.stringify(j1));
  Object.assign(j2.corrections[j2.corrections.length - 1], { ancien: { moteur: "v3", prediction: "A" }, nouveau: { moteur: "v3", prediction: "B" }, complete_le: "u" });
  delete j2.corrections[j2.corrections.length - 1].masque;
  assert.deepEqual(C.ajoutSeulement(j1, j2), []);
  const j3 = JSON.parse(JSON.stringify(j0)); j3.corrections[0].motif = "autre";
  assert.match(C.ajoutSeulement(j0, j3).join(), /entree 1 .* modifiee/);
  const j4 = JSON.parse(JSON.stringify(j0)); j4.corrections.pop();
  assert.match(C.ajoutSeulement(j0, j4).join(), /entrees retirees/);
  const j5 = JSON.parse(JSON.stringify(j0)); j5.notes[0].texte += " !";
  assert.match(C.ajoutSeulement(j0, j5).join(), /note 1 modifiee/);
});

test("6. pipeline : fichier illisible = alerte sans ecriture, scelle rate = alerte, ajout seulement controle", () => {
  assert.match(WF, /var lirePreuve=function\(chemin,vide\)\{/);
  assert.match(WF, /execSync\('git show HEAD:'\+chemin/);
  assert.match(WF, /if\(!lectReg\.ok\|\|!lectCorr\.ok\)\{\n\s+alerteEmpreintes\('Preuves illisibles','fichier de preuves illisible : '/);
  assert.doesNotMatch(WF, /try\{ registreEmp=JSON\.parse\(fs\.readFileSync\(REG_CHEMIN,'utf8'\)\); \}catch\(e\)\{\}/, "plus jamais de repli silencieux sur vide()");
  assert.doesNotMatch(WF, /try\{ journalCorr=JSON\.parse\(fs\.readFileSync\(CORRECTIONS\.CHEMIN,'utf8'\)\); \}catch\(e\)\{\}/);
  assert.match(WF, /var reecritures=EMPREINTES\.prolonge\(lectReg\.avant,registreEmp\)\.concat\(CORRECTIONS\.ajoutSeulement\(lectCorr\.avant,journalCorr\)\)\.concat\(EMPREINTES\.dossierAjoutSeulement\(scellesHead,scellesIci\)\);/);
  assert.ok(WF.indexOf("var reecritures=") < WF.indexOf("fs.writeFileSync(REG_CHEMIN,"), "controle avant toute ecriture");
  assert.match(WF, /if\(a\.en_attente\.length\) alerteEmpreintes\(/);
  assert.match(WF, /if\(a\.non_scelles\.length\) alerteEmpreintes\(/);
  assert.match(WF, /var decl=EMPREINTES\.declarerNonScelles\(registreEmp,histo\.predictions,maintenantEmp,\{aujourdhui:TODAY\}\);/);
  assert.match(WF, /if\(!SECRET_EMPREINTE\) alerteEmpreintes\(/);
  assert.match(WF, /\}catch\(e\)\{ alerteEmpreintes\('Erreur du pipeline','erreur pendant le scelle ou la verification : '/);
});

// ---------------------------------------------------------------- 7. textes publics et verification par tous
test("7. textes publics : ce qui est verifie, sans date de mise en service supposee ni « pari inchange » non prouve", () => {
  assert.doesNotMatch(E.EXPLICATION, /Un pari modifie apres coup ou un maillon retire casse la chaine/);
  assert.doesNotMatch(E.EXPLICATION, /23\/10\/2026/);
  assert.match(E.EXPLICATION, /declare dans un maillon « non_scelle »/);
  assert.match(E.EXPLICATION, /node scripts\/verifier-empreintes\.js/);
  const j = JSON.parse(read("preuves/corrections.json"));
  j.corrections.filter((e) => e.fixture_id === 1636449).forEach((e) => assert.doesNotMatch(e.motif, /inchange/));
  assert.doesNotMatch(JSON.stringify(j.notes), /Depuis le 23\/10\/2026/);
  assert.ok(j.notes.some((n) => /maillons 1 a 29/.test(n.texte) && /ne prouve ni une modification/.test(n.texte)), "perimetre verifiable dit publiquement");
});

test("7. script public : charge le journal et les journees figees, aucun ecart sur les donnees du depot", () => {
  const S = require("../scripts/verifier-empreintes.js");
  const v = S.verifierDepot(root);
  assert.deepEqual(v.erreurs, []);
  const reg = JSON.parse(read("preuves/empreintes-paris.json"));
  reg.chaine.filter((m) => m.jour === "2026-10-19" && m.sel_revele).forEach((m) => {
    if (E.parisDuJour(S.donneesPubliques(root).paris, "2026-10-19").paris.length) assert.ok(v.verifies.includes(m.n), "maillon " + m.n);
  });
});

test("7. pari masque complete depuis la page : trace visible", () => {
  const m = { fixture_id: 6, type: "single", result: "scheduled", redacted: true, kickoff_at: "2026-10-03T19:00:00.000Z" };
  PICK_FREEZE.alignPendingPrediction(m, { id: 6, pari_rec: "X", cote_rec: "1.5", model_probability: 60, market_id: "m" }, { nowMs: Date.parse("2026-10-03T10:00:00Z") });
  assert.equal(m.complete_depuis_la_page, "2026-10-03T10:00:00.000Z");
});

// ---------------------------------------------------------------- 8. contre-verification finale (avocat du diable, 23/10)
// Scenarios de scratchpad/avocat-final-emp/attaques2.js (S1 a S4) : chacun doit etre refuse.
test("8. B1 : sel jamais revele ni journee figee en clair tant qu'un pari du jour n'est pas regle (match decale)", () => {
  const p = base5(); const reg = scelle5(p);
  p[0].result = "win";
  // Match 2 decale au 03/11 13 h : kickoff_at garde l'heure d'origine (21 h le 02/11).
  const run = Date.parse("2026-11-03T05:30:00Z");
  assert.equal(E.revelerSels(reg, "s", { predictions: p, nowMs: run }), 0, "heure passee mais pari 2 pas regle");
  assert.deepEqual(E.journeeReglee(p, J5, run), { ok: false, en_attente: [2] });
  // Cas du 21/10 : sel deja public, un pari encore en attente -> rien en clair.
  reg.chaine[0].sel_revele = E.sel("s", J5);
  const v = E.verifier(reg, p, { secret: "s", nowMs: run });
  assert.deepEqual(v.verifies, [1]);
  assert.deepEqual(E.journeeAFiger(reg, p, J5, v.verifies, run), { ok: false, raison: "pari(s) pas encore regle(s) : 2" });
  // Pari d'un match reporte : public (donc figeable) seulement une fois l'heure d'origine passee.
  p[1].result = "void"; p[1].reporte = true; p[1].kickoff_at = "2026-11-03T13:00:00.000Z";
  assert.equal(E.journeeReglee(p, J5, run).ok, false);
  assert.equal(E.journeeReglee(p, J5, Date.parse("2026-11-03T13:00:00Z")).ok, true);
  // Pari sans resultat : jamais tenu pour regle.
  assert.equal(E.journeeReglee([Object.assign({}, p[0], { result: undefined })], J5, run).ok, false);
  // Tout regle : sel revele et journee figeable.
  const q = base5(); const r2 = scelle5(q);
  q.forEach((x) => { x.result = "loss"; });
  assert.equal(E.revelerSels(r2, "s", { predictions: q, nowMs: run }), 1);
  assert.deepEqual(E.journeeAFiger(r2, q, J5, E.verifier(r2, q, { nowMs: run }).verifies, run), { ok: true, raison: "" });
  // Pipeline : le gel passe par journeeAFiger (reglement), plus par l'heure seule.
  assert.match(WF, /if\(!EMPREINTES\.journeeAFiger\(registreEmp,histo\.predictions,jour,verifApres\.verifies,Date\.now\(\)\)\.ok\) return;/);
  assert.match(WF, /paris\.some\(function\(p\)\{return p\.redacted\|\|!p\.prediction\|\|!CORRECTIONS\.pariPublic\(p,Date\.now\(\)\);\}\)/);
  assert.match(WF, /var reveles=EMPREINTES\.revelerSels\(registreEmp,SECRET_EMPREINTE,\{predictions:histo\.predictions,nowMs:Date\.now\(\)\}\);/);
});

test("8. B2 : pari declare apres son jour ET apres son coup d'envoi = erreur permanente, sauf note publique", () => {
  const p = base5(); const reg = scelle5(p);
  p.forEach((x) => { x.result = "loss"; });
  p.push(Object.assign(p5(3, "Victoire exterieur", 2.1, "2026-11-02T19:00:00.000Z"), { result: "win" }));
  const now = Date.parse("2026-11-04T05:30:00Z");
  const d = E.declarerNonScelles(reg, p, "2026-11-04T05:30:00.000Z", { aujourdhui: "2026-11-04" });
  assert.deepEqual(d.maillons[0].non_scelles, [{ fixture_id: 3, raison: E.RAISON_APRES_COUP, apres_coup: true, coup_envoi: "2026-11-02T19:00:00.000Z" }]);
  const v = E.verifier(reg, p, { secret: "s", nowMs: now });
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /pari 3 \(2026-11-02\) : declare non scelle a l'heure de son coup d'envoi ou apres \(ajoute apres coup \?\), sans note publique/);
  // Permanent : runs suivants, sel revele, kickoff_at retouche ensuite.
  assert.equal(E.declarerNonScelles(reg, p, "2026-11-05T05:30:00.000Z", { aujourdhui: "2026-11-05" }).declares, 0);
  E.revelerSels(reg, "s", { predictions: p, nowMs: now });
  const retouche = p.map((x) => (x.fixture_id === 3 ? Object.assign({}, x, { kickoff_at: "2026-11-09T19:00:00.000Z" }) : x));
  assert.equal(E.verifier(reg, retouche, { nowMs: now }).ok, false);
  // Note publique explicite (preuves/corrections.json) : avertissement, pas d'erreur.
  const journal = { notes: [{ type: "pari_non_scelle", jour: J5, fixture_id: 3, texte: "Run du 02/11 en panne : pari publie mais jamais scelle." }] };
  assert.deepEqual(C.parisNonScellesExpliques(journal), [J5 + "|3"]);
  assert.deepEqual(C.parisNonScellesExpliques({ notes: [{ type: "pari_non_scelle", jour: J5, fixture_id: 3, texte: " " }] }), [], "texte obligatoire");
  const w = E.verifier(reg, p, { nowMs: now, parisNonScellesExpliques: C.parisNonScellesExpliques(journal) });
  assert.equal(w.ok, true);
  assert.match(w.avertissements.join("\n"), /pari 3 \(2026-11-02\) : ajoute apres coup, non scelle \(note publique/);
  // Declare un jour plus tard mais AVANT son coup d'envoi : simple avertissement.
  const q = base5(); const r2 = scelle5(q);
  q.push(p5(4, "X", 1.5, "2026-11-03T19:00:00.000Z"));
  const d2 = E.declarerNonScelles(r2, q, "2026-11-03T05:30:00.000Z", { aujourdhui: "2026-11-03" });
  assert.equal(d2.maillons[0].non_scelles[0].raison, "non scelle le jour de sa publication");
  const w2 = E.verifier(r2, q, { secret: "s", nowMs: Date.parse("2026-11-04T00:00:00Z") });
  assert.equal(w2.ok, true);
  assert.match(w2.avertissements.join("\n"), /pari 4 \(2026-11-02\) : non scelle/);
  // Script public et pipeline : la note est lue.
  assert.match(read("scripts/verifier-empreintes.js"), /parisNonScellesExpliques: C\.parisNonScellesExpliques\(d\.journal\)/);
  assert.match(WF, /parisNonScellesExpliques:CORRECTIONS\.parisNonScellesExpliques\(journalCorr\)/);
});

test("8. B3 : exception « version_moteur » limitee aux 8 reecritures connues, champs moteur et moteur_version seulement", () => {
  const jour = "2026-10-19";
  const mk = (fid, pred, extra) => Object.assign(p5(fid, pred, 1.5, "2026-10-21T19:00:00.000Z"), { date: jour, published_at: "2026-10-19T05:00:00.000Z", result: "loss" }, extra || {});
  const scelle = (preds) => {
    const sel = E.sel("s", jour);
    const m = { n: 1, jour: jour, genere_le: "2026-10-20T05:38:23.000Z", nb_paris: preds.length, empreinte_paris: E.empreinteParis(E.parisDuJour(preds, jour, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
    m.empreinte = E.empreinteMaillon(m);
    return { chaine: [m] };
  };
  const T = "2026-10-21T05:39:51.616Z";
  const entree = (fid, champs, ancien, nouveau, t) => ({ id: fid + "|" + (t || T), type: "version_moteur", jour: jour, fixture_id: fid, au_plus_tard: t || T, champs: champs, ancien: ancien, nouveau: nouveau, source: "commits" });
  // Legitime : pari 1635672, moteur reecrit (connu).
  const ok = [mk(1635672, "Victoire domicile", { moteur: "v3", moteur_version: "3.0.0+60ce47f" })];
  const reg = scelle(ok);
  const reecrit = [Object.assign({}, ok[0], { moteur: "ancien", moteur_version: "score-matrix-dc-early-season-v2" })];
  const legit = [entree(1635672, ["moteur", "moteur_version"], { moteur: "v3", moteur_version: "3.0.0+60ce47f" }, { moteur: "ancien", moteur_version: "score-matrix-dc-early-season-v2" })];
  assert.deepEqual(E.verifier(reg, reecrit, { corrections: legit }).verifies, [1]);
  assert.equal(E.verifier(reg, reecrit, { corrections: legit }).ok, true);
  // Attaque S2 : pronostic reecrit avec une entree « version_moteur » (champ prediction).
  const triche = [Object.assign({}, ok[0], { prediction: "Match nul", result: "win" })];
  const faux = [entree(1635672, ["moteur"], { prediction: "Victoire domicile" }, { prediction: "Match nul" })];
  assert.equal(E.verifier(reg, triche, { corrections: faux }).ok, false);
  // Champs annonces moteur mais ancien/nouveau avec un autre champ : refuse.
  const melange = [entree(1635672, ["moteur", "moteur_version"], { moteur: "v3", moteur_version: "3.0.0+60ce47f", prediction: "Victoire domicile" }, { moteur: "ancien", moteur_version: "x", prediction: "Match nul" })];
  assert.equal(E.verifier(reg, triche, { corrections: melange }).ok, false);
  // Match ou heure hors de la liste des 8 : refuse, meme sur le seul moteur.
  const autre = [mk(999, "Victoire domicile", { moteur: "v3", moteur_version: "3.0.0+60ce47f" })];
  const regAutre = scelle(autre);
  const autreReecrit = [Object.assign({}, autre[0], { moteur: "ancien", moteur_version: "y" })];
  assert.equal(E.verifier(regAutre, autreReecrit, { corrections: [entree(999, ["moteur", "moteur_version"], { moteur: "v3", moteur_version: "3.0.0+60ce47f" }, { moteur: "ancien", moteur_version: "y" })] }).ok, false);
  assert.equal(E.verifier(reg, reecrit, { corrections: [entree(1635672, ["moteur", "moteur_version"], legit[0].ancien, legit[0].nouveau, "2026-10-21T05:39:52.000Z")] }).ok, false);
  // Les 8 entrees publiees sont exactement la liste connue.
  const j = JSON.parse(read("preuves/corrections.json"));
  assert.deepEqual(j.corrections.filter((e) => e.type === "version_moteur").map((e) => e.fixture_id + "|" + e.au_plus_tard).sort(), E.REECRITURES_MOTEUR_CONNUES.slice().sort());
});

test("8. pari scelle a l'ancien format vraiment corrige : raison explicite et alerte du pipeline", () => {
  const jour = "2026-10-23";
  const p = [Object.assign(p5(20, "Buteur : X", 2.1, "2026-10-25T19:00:00.000Z"), { date: jour, published_at: "2026-10-23T06:10:00.000Z", market: "F1:buteur" })];
  const sel = E.sel("s", jour);
  const m = { n: 1, jour: jour, genere_le: "2026-10-23T06:10:56.350Z", nb_paris: 1, empreinte_paris: E.empreinteParis(E.parisDuJour(p, jour, { format: 2 }).paris, sel), precedente: E.GENESE };
  m.empreinte = E.empreinteMaillon(m);
  const reg = { chaine: [m] };
  const ko = Date.parse("2026-10-25T19:00:00Z");
  PICK_FREEZE.alignPendingPrediction(p[0], { id: 20, pari_rec: "Buteur : Y", cote_rec: "2.3", model_probability: 41, market_id: "F1:buteur" }, { nowMs: ko - 3600000, kickoffMs: ko, motif: "buteur absent" });
  const tr = p[0].corrections[0];
  const c = E.corriger(reg, jour, p, "s", new Date(ko - 3500000).toISOString(), { fixture_id: 20, motif: tr.motif, le: tr.le, ancien: tr.ancien });
  assert.deepEqual([c.ajoute, c.raison], [false, "pari scelle a l'ancien format : correction impossible a sceller"]);
  // Pari d'aujourd'hui pas encore scelle : pas d'alerte (le scelle du jour porte la valeur corrigee).
  const q = base5();
  const c2 = E.corriger(E.vide(), J5, q, "s", "2026-11-02T04:00:00.000Z", { fixture_id: 1, motif: "x", le: "2026-11-02T03:59:30.000Z", ancien: { prediction: "Y" } });
  assert.match(c2.raison, /pas encore scelle/);
  assert.match(WF, /if\(!c\.ajoute&&!\(\/pas encore scelle\/\.test\(c\.raison\)&&jourCorr===TODAY\)\) alerteEmpreintes\('Correction non scellee',/);
});

test("8. textes et alertes : journal aligne, commentaire des reports, alertes differenciees, preuves/ jamais supprime en bloc", () => {
  // Explication du fichier public = celle du code (valeurs publiees au reglement).
  assert.equal(JSON.parse(read("preuves/corrections.json")).explication, C.journalVide().explication);
  assert.match(C.journalVide().explication, /ajoutees au reglement/);
  // Commentaire des matchs reportes : masque seulement jusqu'a l'heure d'origine.
  const pf = read("lib/pick-freeze.js");
  assert.doesNotMatch(pf, /son pari reste masque dans\n\/\/ historique\.json \(lib\/premium-fields\.js#redactPendingPredictions\) : le match peut encore se jouer\./);
  assert.match(pf, /tant que l'heure d'origine\n\/\/ de son coup d'envoi n'est pas passee/);
  // Un titre par cause.
  ["Ecart", "Secret absent", "Scelle incomplet", "Preuves illisibles", "Reecriture refusee", "Chaine rompue", "Correction non scellee", "Pari ajoute apres coup", "Erreur du pipeline"].forEach((t) => {
    assert.ok(WF.indexOf("alerteEmpreintes('" + t + "',") !== -1, t);
  });
  assert.doesNotMatch(WF, /alerteEmpreintes\('[a-z]/, "plus d'alerte sans titre");
  assert.match(WF, /while IFS=\$'\\t' read -r titre msg; do\n\s+echo "::error title=Empreintes des paris : \$titre::\$msg"/);
  assert.doesNotMatch(WF, /Les paris ne correspondent plus a leurs empreintes publiees :"/);
  // Reprise apres push refuse : preuves/ n'est jamais supprime en bloc (corrections.json garde).
  assert.match(WF, /if \[ "\$f" = "preuves" \]; then\n\s+mkdir -p preuves\n\s+if \[ -d "\$SAVE\/preuves" \]; then cp -R "\$SAVE\/preuves\/\." preuves\/; fi\n\s+continue\n\s+fi\n\s+rm -rf "\$f"/);
});

// ---------------------------------------------------------------- 9. tour 4 (mathematicien C1, C2, A2, A3, D ; avocat F1, F2, K1)
// Scenarios de scratchpad/avocat-r3/attaques3.js et des attaques du mathematicien : chacun doit etre refuse.
const pj = (fid, pred, cote, ko, jour, extra) => Object.assign({ fixture_id: fid, home: "H" + fid, away: "A" + fid, prediction: pred, cote: cote, model_probability: 60, market: "m", moteur: "v3", moteur_version: "3.0.0+x", published_at: jour + "T03:59:00.000Z", kickoff_at: ko, date: jour, type: "single", result: "scheduled" }, extra || {});
// Maillon ecrit a la main (operateur du pipeline qui a le secret) puis chaine.
const forger = (reg, champs) => {
  const chaine = reg.chaine;
  const m = Object.assign({ n: chaine.length + 1 }, champs);
  m.precedente = chaine[chaine.length - 1].empreinte; m.empreinte = E.empreinteMaillon(m); chaine.push(m);
  return m;
};

test("9. F1/C1 faux maillon : premier coup d'envoi recalcule depuis les paris, jamais lu dans le champ declare", () => {
  const J = "2026-11-09";
  const reg = E.vide();
  const p = [pj(1, "Victoire domicile", 1.5, J + "T19:00:00.000Z", J)];
  E.ajouter(reg, J, p, "s", J + "T05:17:00.000Z", { aujourdhui: J });
  p[0].result = "loss";
  p.push(pj(2, "Victoire exterieur", 2.1, J + "T19:00:00.000Z", J, { result: "win" }));
  const lu = E.parisDuJour(p, J, { fixtures: [2] });
  const base = { jour: J, genere_le: J + "T22:00:00.000Z", nb_paris: 1, empreinte_paris: E.empreinteParis(lu.paris, E.sel("s", J)), format: 3, type: "complement", fixtures: [2] };
  const now = Date.parse("2026-11-10T06:00:00Z");
  // F1 : premier_coup_envoi absent.
  const r1 = JSON.parse(JSON.stringify(reg)); forger(r1, Object.assign({}, base, { premier_coup_envoi: null }));
  E.revelerSels(r1, "s", { predictions: p, nowMs: now });
  const v1 = E.verifier(r1, p, { nowMs: now });
  assert.equal(v1.ok, false);
  assert.match(v1.erreurs.join("\n"), /maillon 2 \(2026-11-09\) : premier coup d'envoi declare \(aucun\) different de celui des paris couverts \(2026-11-09T19:00:00.000Z\)/);
  assert.match(v1.erreurs.join("\n"), /maillon 2 \(2026-11-09\) : scelle apres un coup d'envoi/);
  // C1 : premier_coup_envoi declare plus tard que le vrai (23 h au lieu de 19 h).
  const r2 = JSON.parse(JSON.stringify(reg)); forger(r2, Object.assign({}, base, { premier_coup_envoi: J + "T23:00:00.000Z" }));
  const v2 = E.verifier(r2, p, { secret: "s", nowMs: now });
  assert.equal(v2.ok, false);
  assert.match(v2.erreurs.join("\n"), /premier coup d'envoi declare \(2026-11-09T23:00:00.000Z\) different/);
  assert.match(v2.erreurs.join("\n"), /scelle apres un coup d'envoi/);
  assert.ok(!v2.verifies.includes(2));
  // Le vrai complement (avant 19 h) se verifie.
  const r3 = JSON.parse(JSON.stringify(reg));
  const q = p.map((x) => Object.assign({}, x));
  assert.equal(E.ajouter(r3, J, q, "s", J + "T12:00:00.000Z", { aujourdhui: J }).maillon.premier_coup_envoi, J + "T19:00:00.000Z");
  assert.deepEqual([E.verifier(r3, q, { secret: "s", nowMs: now }).ok, E.verifier(r3, q, { secret: "s", nowMs: now }).verifies], [true, [1, 2]]);
});

test("9. F2 faux maillon « correction » apres le match ; correction datee apres son maillon : refuses", () => {
  const J = "2026-11-11";
  const reg = E.vide();
  const p = [pj(1, "Victoire domicile", 1.5, J + "T19:00:00.000Z", J), pj(2, "Moins de 2,5 buts", 1.6, J + "T19:00:00.000Z", J)];
  E.ajouter(reg, J, p, "s", J + "T05:17:00.000Z", { aujourdhui: J });
  const s = E.sel("s", J);
  const avant = E.parisDuJour(p, J, { fixtures: [1] });
  const le = J + "T17:00:00.000Z";
  p[0].corrections = [{ le: le, motif: "exception au gel : buteur absent de la composition", champs: ["prediction"], ancien: { prediction: "Victoire domicile" }, nouveau: { prediction: "Victoire exterieur" } }];
  p[0].prediction = "Victoire exterieur"; p[0].result = "win"; p[1].result = "loss";
  const lu = E.parisDuJour(p, J, { fixtures: [1] });
  const corr = { fixture_id: 1, motif: "exception au gel : buteur absent de la composition", le: le, ancienne_empreinte: E.empreinteParis(avant.paris, s) };
  const now = Date.parse("2026-11-12T06:00:00Z");
  // F2 : maillon ecrit a 22 h 30 (apres le match de 19 h), premier_coup_envoi absent.
  const r1 = JSON.parse(JSON.stringify(reg));
  forger(r1, { jour: J, genere_le: J + "T22:30:00.000Z", nb_paris: 1, empreinte_paris: E.empreinteParis(lu.paris, s), format: 3, type: "correction", fixtures: [1], premier_coup_envoi: null, correction: corr });
  E.revelerSels(r1, "s", { predictions: p, nowMs: now });
  const v1 = E.verifier(r1, p, { nowMs: now });
  assert.equal(v1.ok, false);
  assert.match(v1.erreurs.join("\n"), /maillon 2 \(2026-11-11\) : scelle apres un coup d'envoi/);
  // Correction datee APRES son maillon (maillon a 16 h, correction a 17 h) : refusee.
  const r2 = JSON.parse(JSON.stringify(reg));
  forger(r2, { jour: J, genere_le: J + "T16:00:00.000Z", nb_paris: 1, empreinte_paris: E.empreinteParis(lu.paris, s), format: 3, type: "correction", fixtures: [1], premier_coup_envoi: J + "T19:00:00.000Z", correction: corr });
  assert.match(E.verifier(r2, p, { secret: "s", nowMs: now }).erreurs.join("\n"), /maillon 2 \(2026-11-11\) : correction datee apres son maillon ou apres le coup d'envoi/);
  // corriger() refuse pareil : correction datee apres l'heure du maillon.
  const q = [pj(1, "Victoire domicile", 1.5, J + "T19:00:00.000Z", J)];
  const r3 = E.vide(); E.ajouter(r3, J, q, "s", J + "T05:17:00.000Z", { aujourdhui: J });
  q[0].prediction = "Victoire exterieur";
  assert.match(E.corriger(r3, J, q, "s", J + "T16:00:00.000Z", { fixture_id: 1, motif: "x", le: J + "T17:00:00.000Z", ancien: { prediction: "Victoire domicile" } }).raison, /heure de la correction apres le maillon/);
  assert.equal(E.corriger(r3, J, q, "s", J + "T17:01:00.000Z", { fixture_id: 1, motif: "x", le: J + "T17:00:00.000Z", ancien: { prediction: "Victoire domicile" } }).ajoute, true);
});

test("9. C2 : un « scelle » ou « complement » doit etre du jour (UTC) de sa journee ; ajouter() refuse pareil", () => {
  const J = "2026-11-14";
  const reg = E.vide();
  // Pari du 14/11 pour un match du 15/11 a 19 h, re-scelle le 15/11 au matin (avant le match).
  const p = [pj(1, "Victoire domicile", 1.5, "2026-11-15T19:00:00.000Z", J)];
  E.ajouter(reg, "2026-11-13", [pj(9, "X", 1.5, "2026-11-13T19:00:00.000Z", "2026-11-13")], "s", "2026-11-13T05:00:00.000Z", { aujourdhui: "2026-11-13" });
  const lu = E.parisDuJour(p, J);
  forger(reg, { jour: J, genere_le: "2026-11-15T05:00:00.000Z", nb_paris: 1, empreinte_paris: E.empreinteParis(lu.paris, E.sel("s", J)), format: 3, type: "scelle", fixtures: [1], premier_coup_envoi: "2026-11-15T19:00:00.000Z" });
  const v = E.verifier(reg, p.concat([pj(9, "X", 1.5, "2026-11-13T19:00:00.000Z", "2026-11-13")]), { secret: "s", nowMs: Date.parse("2026-11-15T06:00:00Z") });
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /maillon 2 \(2026-11-14\) : scelle hors de son jour \(heure du maillon 2026-11-15T05:00:00.000Z\)/);
  // ajouter() : jour du run force (opts.aujourdhui) mais heure du maillon d'un autre jour UTC : refuse.
  assert.match(E.ajouter(E.vide(), J, p, "s", "2026-11-15T05:00:00.000Z", { aujourdhui: J }).raison, /jamais re-scelle hors de son jour \(2026-11-14, heure du maillon/);
});

test("9. K1 : un pari sans heure de coup d'envoi n'est jamais scelle ; « anteriorite non prouvee », alerte du pipeline", () => {
  const J = "2026-11-13";
  const reg = E.vide();
  const p = [pj(1, "Victoire domicile", 1.5, J + "T19:00:00.000Z", J)];
  E.ajouter(reg, J, p, "s", J + "T05:17:00.000Z", { aujourdhui: J });
  p.push(pj(2, "Victoire exterieur", 2.1, null, J, { result: "win" }));
  const a = E.ajouter(reg, J, p, "s", J + "T22:00:00.000Z", { aujourdhui: J });
  assert.equal(a.ajoute, false, "jamais scelle");
  assert.deepEqual(a.non_scelles, [{ fixture_id: 2, raison: E.RAISON_SANS_HEURE, anteriorite_non_prouvee: true, coup_envoi: null }]);
  p[0].result = "loss";
  const now = Date.parse("2026-11-14T06:00:00Z");
  E.revelerSels(reg, "s", { predictions: p, nowMs: now });
  const v = E.verifier(reg, p, { nowMs: now });
  assert.deepEqual(v.verifies, [1]);
  assert.match(v.avertissements.join("\n"), /pari 2 \(2026-11-13\) : non scelle \(anteriorite non prouvee : heure du coup d'envoi inconnue\)/);
  // Un maillon qui scelle quand meme un pari sans heure : erreur.
  const r2 = E.vide();
  const q = [pj(1, "Victoire domicile", 1.5, J + "T19:00:00.000Z", J)];
  E.ajouter(r2, J, q, "s", J + "T05:17:00.000Z", { aujourdhui: J });
  q.push(pj(2, "Victoire exterieur", 2.1, null, J));
  forger(r2, { jour: J, genere_le: J + "T22:00:00.000Z", nb_paris: 1, empreinte_paris: E.empreinteParis(E.parisDuJour(q, J, { fixtures: [2] }).paris, E.sel("s", J)), format: 3, type: "complement", fixtures: [2], premier_coup_envoi: null });
  assert.match(E.verifier(r2, q, { secret: "s", nowMs: now }).erreurs.join("\n"), /maillon 2 \(2026-11-13\) : pari scelle sans heure de coup d'envoi \(anteriorite non prouvee\)/);
  // Pipeline : alerte dediee.
  assert.ok(WF.indexOf("alerteEmpreintes('Anteriorite non prouvee',") !== -1);
  assert.match(WF, /var sansHeure=a\.non_scelles\.filter\(function\(x\)\{return x\.anteriorite_non_prouvee;\}\);/);
});

test("9. A2 : journee effacee des donnees publiques = ERREUR, sel revele ou non", () => {
  const p = base5(); const reg = scelle5(p);
  const avantRevelation = Date.parse("2026-11-02T12:00:00Z");
  // Sel pas encore revele, verification publique : la journee entiere a disparu.
  const v1 = E.verifier(reg, [], { nowMs: avantRevelation });
  assert.equal(v1.ok, false);
  assert.match(v1.erreurs.join("\n"), /maillon 1 \(2026-11-02\) : pari\(s\) scelle\(s\) absent\(s\) des donnees publiques \(historique\.json, preuves\/paris-scelles\/\) : 1, 2/);
  // Journee presente, sel pas revele : « non verifiable (sel pas encore revele) », jamais en silence.
  const v2 = E.verifier(reg, p, { nowMs: avantRevelation });
  assert.equal(v2.ok, true);
  assert.deepEqual(v2.non_verifiables.map((x) => [x.n, x.raison]), [[1, "sel pas encore revele"]]);
  // Pari declare non scelle retire des donnees : erreur aussi.
  p.push(p5(3, "X", 1.5, "2026-11-02T03:00:00.000Z"));
  E.ajouter(reg, J5, p, "s", "2026-11-02T05:00:00.000Z", { aujourdhui: J5 });
  assert.match(E.verifier(reg, p.filter((x) => x.fixture_id !== 3), { nowMs: avantRevelation }).erreurs.join("\n"), /maillon 2 \(2026-11-02\) : pari\(s\) declare\(s\) absent\(s\) des donnees publiques/);
  // Script public : les maillons au sel pas encore revele sont listes.
  assert.match(read("scripts/verifier-empreintes.js"), /Non verifiables \(" \+ r \+ "\)/);
});

test("9. A2 : preuves/paris-scelles/ en ajout seulement, historique.json garde toute journee au format 3 pas encore figee", () => {
  assert.deepEqual(E.dossierAjoutSeulement({ "2026-11-02.json": "a" }, { "2026-11-02.json": "a", "2026-11-03.json": "b" }), []);
  assert.deepEqual(E.dossierAjoutSeulement({ "2026-11-02.json": "a" }, {}), ["preuves/paris-scelles/2026-11-02.json supprime"]);
  assert.deepEqual(E.dossierAjoutSeulement({ "2026-11-02.json": "a" }, { "2026-11-02.json": "a2" }), ["preuves/paris-scelles/2026-11-02.json modifie"]);
  assert.match(WF, /execSync\('git ls-tree --name-only HEAD '\+DOSSIER_SCELLES\+'\/'/);
  assert.ok(WF.indexOf("EMPREINTES.dossierAjoutSeulement(scellesHead,scellesIci)") < WF.indexOf("fs.writeFileSync(REG_CHEMIN,"), "controle avant toute ecriture");
  // Fenetre : la journee du 03/10 (format 3, pas figee) reste entiere ; figee, elle peut sortir.
  const liste = [pari(1, { date: "2026-10-05" }), pari(2, { date: "2026-10-04" }), pari(3, { date: "2026-10-03" }), pari(4, { date: "2026-10-03" })];
  const reg = E.vide(); E.ajouter(reg, JOUR, [pari(3), pari(4)], "s", "2026-10-03T06:00:00Z", opts);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2, { registre: reg, figees: [] }).map((p) => p.fixture_id), [1, 2, 3, 4]);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2, { registre: reg, figees: [JOUR] }).map((p) => p.fixture_id), [1, 2]);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2, { registre: null }).map((p) => p.fixture_id), [1, 2, 3, 4], "registre illisible : rien n'est coupe");
  // Journee faite seulement de declarations : figee une fois reglee (sinon gardee pour toujours).
  const r2 = E.vide(); E.ajouter(r2, JOUR, [pari(1)], "s", "2026-10-03T06:00:00Z", opts);
  const decl = [pari(7, { date: "2026-10-04", kickoff_at: "2026-10-04T03:00:00.000Z", result: "loss" })];
  E.ajouter(r2, "2026-10-04", decl, "s", "2026-10-04T05:00:00Z", { aujourdhui: "2026-10-04" });
  assert.deepEqual(E.journeeAFiger(r2, decl, "2026-10-04", [], Date.parse("2026-10-05T00:00:00Z")), { ok: true, raison: "" });
});

test("9. A3 : sel d'un maillon au format 3 pas revele 7 jours apres la fin de sa journee = ERREUR « sel en retard »", () => {
  const p = base5(); const reg = scelle5(p);
  // Un pari laisse « en attente » pour toujours : le sel n'est jamais revele.
  p[0].result = "loss";
  assert.equal(E.revelerSels(reg, "s", { predictions: p, nowMs: Date.parse("2026-11-09T12:00:00Z") }), 0);
  assert.equal(E.verifier(reg, p, { nowMs: Date.parse("2026-11-09T23:59:59Z") }).ok, true, "7 jours apres la fin de la journee : pas encore");
  const v = E.verifier(reg, p, { nowMs: Date.parse("2026-11-10T00:00:00Z") });
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /maillon 1 \(2026-11-02\) : sel en retard \(pas revele 7 jours apres la fin de sa journee\)/);
  // Le pipeline aussi (avec le secret) : l'erreur ne depend pas de la verification de l'empreinte.
  assert.equal(E.verifier(reg, p, { secret: "s", nowMs: Date.parse("2026-11-10T00:00:00Z") }).ok, false);
  // Journee effacee ET sel jamais revele : erreur.
  assert.equal(E.verifier(reg, [], { nowMs: Date.parse("2026-11-20T00:00:00Z") }).ok, false);
  // Sel revele a temps : aucune erreur, meme bien plus tard.
  p[1].result = "win";
  E.revelerSels(reg, "s", { predictions: p, nowMs: Date.parse("2026-11-03T12:00:00Z") });
  assert.deepEqual(E.verifier(reg, p, { nowMs: Date.parse("2026-12-01T00:00:00Z") }).erreurs, []);
  assert.equal(E.DELAI_SEL_MS, 8 * 86400000);
});

test("9. D : pari declare a l'heure de son coup d'envoi ou apres = ERREUR, meme jour ou jour suivant, sauf note publique", () => {
  // B2-ter : meme jour, run manuel apres le match.
  const J = "2026-11-07";
  const reg = E.vide();
  const p = [pj(1, "Victoire domicile", 1.5, J + "T19:00:00.000Z", J)];
  E.ajouter(reg, J, p, "s", J + "T05:17:00.000Z", { aujourdhui: J });
  p.push(pj(2, "Plus de 2,5 buts", 1.9, J + "T12:00:00.000Z", J, { result: "win" }));
  const a = E.ajouter(reg, J, p, "s", J + "T15:00:00.000Z", { aujourdhui: J });
  assert.deepEqual(a.non_scelles, [{ fixture_id: 2, raison: "coup d'envoi passe avant le scelle", apres_coup: true, coup_envoi: J + "T12:00:00.000Z" }]);
  p[0].result = "loss";
  const now = Date.parse("2026-11-08T06:00:00Z");
  E.revelerSels(reg, "s", { predictions: p, nowMs: now });
  const v = E.verifier(reg, p, { nowMs: now });
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /pari 2 \(2026-11-07\) : declare non scelle a l'heure de son coup d'envoi ou apres/);
  // kickoff_at retire des donnees ensuite : l'heure ecrite dans la declaration compte.
  const sansHeure = p.map((x) => (x.fixture_id === 2 ? Object.assign({}, x, { kickoff_at: null }) : x));
  assert.equal(E.verifier(reg, sansHeure, { nowMs: now }).ok, false);
  // Ancienne declaration sans drapeau ni heure ecrite, meme jour, apres le coup d'envoi : erreur aussi (calcul).
  const r0 = E.vide();
  E.ajouter(r0, J, [p[0]], "s", J + "T05:17:00.000Z", { aujourdhui: J });
  forger(r0, { jour: J, genere_le: J + "T15:00:00.000Z", nb_paris: 0, empreinte_paris: null, format: 3, type: "non_scelle", fixtures: [], premier_coup_envoi: null, non_scelles: [{ fixture_id: 2, raison: "coup d'envoi passe avant le scelle" }] });
  assert.equal(E.verifier(r0, p, { secret: "s", nowMs: now }).ok, false);
  // Note publique : avertissement.
  const w = E.verifier(reg, p, { nowMs: now, parisNonScellesExpliques: [J + "|2"] });
  assert.equal(w.ok, true);
  // B2-bis : pari injecte le 05/11 (date = jour de l'injection) pour un match joue le 04/11.
  const r2 = E.vide();
  const q = [pj(1, "Victoire domicile", 1.5, "2026-11-04T19:00:00.000Z", "2026-11-04")];
  E.ajouter(r2, "2026-11-04", q, "s", "2026-11-04T05:17:00.000Z", { aujourdhui: "2026-11-04" });
  q[0].result = "loss";
  q.push(pj(2, "Victoire exterieur", 2.1, "2026-11-04T21:00:00.000Z", "2026-11-05", { published_at: "2026-11-04T10:00:00.000Z", result: "win" }));
  E.ajouter(r2, "2026-11-05", q, "s", "2026-11-05T00:37:00.000Z", { aujourdhui: "2026-11-05" });
  assert.equal(E.verifier(r2, q, { secret: "s", nowMs: Date.parse("2026-11-05T06:00:00Z") }).ok, false);
  // Declare AVANT son coup d'envoi (sel du jour deja revele) : simple avertissement.
  assert.match(WF, /var apresCoupJour=a\.non_scelles\.filter\(function\(x\)\{return x\.apres_coup;\}\);/);
});

test("9. alerte empreintes NON BLOQUANTE : le calcul du matin reste « success » (videos, canal Telegram)", () => {
  const debut = WF.indexOf("- name: Alerte empreintes des paris");
  const fin = WF.indexOf("- name: Alerte moteur v3");
  assert.ok(debut !== -1 && fin > debut);
  const etape = WF.slice(debut, fin);
  assert.doesNotMatch(etape, /exit 1/, "plus jamais le run au rouge pour une alerte empreintes");
  assert.match(etape, /if: always\(\)/);
  assert.match(etape, /TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/);
  assert.match(etape, /text=Alerte empreintes : \$\{N\} alerte\(s\)/);
  assert.match(etape, /GITHUB_STEP_SUMMARY/);
  // Le pipeline n'arrete jamais le run pour les empreintes (alertes ecrites dans un fichier).
  const bloc = WF.slice(WF.indexOf("var alerteEmpreintes=function"), WF.indexOf("histo.predictions=EMPREINTES.fenetreJourneesEntieres("));
  assert.doesNotMatch(bloc, /process\.exit|throw /);
  // Ce que lisent les workflows en aval : videos seulement si success, canal previent si failure.
  const videos = read(".github/workflows/daily-videos.yml");
  assert.match(videos, /github\.event\.workflow_run\.conclusion == 'success'/);
  const canal = read(".github/workflows/telegram-canal.yml");
  assert.match(canal, /Le calcul du matin a échoué/);
  assert.match(canal, /if: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion == 'failure' \}\}/);
});

test("9. corrections chiffrees a taille fixe ; limites ecrites dans le texte public", () => {
  const court = C.chiffrer({ ancien: { prediction: "1" }, nouveau: { prediction: "2" } }, "s", 1);
  const long = C.chiffrer({ ancien: { prediction: "Buteur : Kylian Mbappe a tout moment", cote: 2.35, model_probability: 41.2, market: "F1:buteur" }, nouveau: { prediction: "Buteur : Vinicius Junior a tout moment", cote: 2.6, model_probability: 38.9, market: "F1:buteur" } }, "s", 1);
  assert.equal(Buffer.from(court, "base64").length, Buffer.from(long, "base64").length);
  assert.equal(Buffer.from(court, "base64").length, 12 + 16 + C.TAILLE_BLOC);
  assert.deepEqual(C.dechiffrer(long, "s", 1).nouveau.cote, 2.6);
  // Ancien chiffre (sans rembourrage) : relu pareil.
  const crypto = require("node:crypto");
  const k = crypto.createHash("sha256").update(crypto.createHmac("sha256", "s").update("iashark-corrections|1").digest()).digest();
  const iv = Buffer.alloc(12, 1); const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const corps = Buffer.concat([c.update(Buffer.from('{"a":1}')), c.final()]);
  assert.deepEqual(C.dechiffrer(Buffer.concat([iv, c.getAuthTag(), corps]).toString("base64"), "s", 1), { a: 1 });
  assert.match(E.EXPLICATION, /le resultat \(gagne, perdu\) n'entre pas dans l'empreinte/);
  assert.match(E.EXPLICATION, /l'heure des maillons est declaree par le pipeline, sans horodatage externe/);
  assert.match(E.EXPLICATION, /sel en retard/);
  assert.doesNotMatch(E.EXPLICATION, /garanti|%/);
});

// ---------------------------------------------------------------- 10. controle du mathematicien, tour 5
// Journee du 02/11 scellee au format 3, reglee, sel revele : base des attaques N2 et N3.
const regle5 = (r0, r1) => {
  const p = base5(); const reg = scelle5(p);
  p[0].result = r0; p[1].result = r1;
  assert.equal(E.revelerSels(reg, "s", { predictions: p, nowMs: Date.parse("2026-11-03T06:00:00Z") }), 1);
  return { p: p, reg: reg };
};
const plusTard5 = { nowMs: Date.parse("2026-11-04T06:00:00Z") };

test("10. N3 : pari hors chaine (sans fixture_id, date illisible, jour sans maillon) = ERREUR, plus jamais ignore", () => {
  const { p, reg } = regle5("loss", "loss");
  assert.deepEqual([E.verifier(reg, p, plusTard5).ok, E.verifier(reg, p, plusTard5).verifies], [true, [1]], "temoin");
  const gagnant = (extra) => Object.assign(p5(70, "Victoire exterieur", 2.4, "2026-11-02T19:00:00.000Z"), { result: "win" }, extra || {});
  // N3a : sans numero de match (absent, vide, illisible).
  [undefined, null, "", "abc"].forEach((fid) => {
    const g = gagnant({ fixture_id: fid }); if (fid === undefined) delete g.fixture_id;
    const v = E.verifier(reg, p.concat([g]), plusTard5);
    assert.equal(v.ok, false, "fixture_id " + JSON.stringify(fid));
    assert.match(v.erreurs.join("\n"), /pari hors chaine \(H70 - A70\) : sans numero de match \(fixture_id\), jamais scelle/);
  });
  // N3b : date qui ne commence pas par un vrai jour AAAA-MM-JJ.
  [null, undefined, "", "01/11/2026", "1/11/2026", "02/11/2026", "2026-02-30", 20261102].forEach((d) => {
    const v = E.verifier(reg, p.concat([gagnant({ date: d })]), plusTard5);
    assert.equal(v.ok, false, "date " + JSON.stringify(d));
    assert.match(v.erreurs.join("\n"), /pari hors chaine 70 \(H70 - A70\) : date illisible \(.*, AAAA-MM-JJ attendu\), jamais scelle/);
  });
  // N3c : jour sans aucun maillon avant le premier jour au format 3 (02/11).
  ["2025-11-25", "2026-10-01", "2026-11-01"].forEach((d) => {
    const v = E.verifier(reg, p.concat([gagnant({ date: d, kickoff_at: d + "T19:00:00.000Z" })]), plusTard5);
    assert.equal(v.ok, false, "date " + d);
    assert.match(v.erreurs.join("\n"), new RegExp("pari hors chaine 70 \\(" + d + "\\) : aucun maillon ce jour-la, avant le premier jour au format 3 \\(2026-11-02\\), jamais scelle"));
  });
  // Meme jour, avec numero et date valides : regle du format 3 inchangee (ni scelle ni declare).
  assert.match(E.verifier(reg, p.concat([gagnant()]), plusTard5).erreurs.join("\n"), /pari 70 \(2026-11-02\) : ni scelle ni declare non scelle/);
  // Les combines ne sont pas dans la chaine (paris simples seulement) : jamais signales.
  assert.equal(E.verifier(reg, p.concat([{ type: "combi", date: "01/11/2026", result: "win" }]), plusTard5).ok, true);
});

test("10. N3 : avant le premier scelle au format 3, chaque pari simple a un maillon ; jour pas encore atteint = non verifiable", () => {
  // Chaine d'avant le format 3 : un maillon pour le 03/10 seulement.
  const sel = E.sel("s", JOUR);
  const un = [pari(1)];
  const m = { n: 1, jour: JOUR, genere_le: "2026-10-03T06:00:00Z", nb_paris: 1, empreinte_paris: E.empreinteParis(E.parisDuJour(un, JOUR, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
  m.empreinte = E.empreinteMaillon(m);
  const reg = { chaine: [m] };
  const now = { nowMs: Date.parse("2026-10-05T12:00:00Z") };
  assert.deepEqual([E.verifier(reg, un, now).ok, E.verifier(reg, un, now).verifies], [true, [1]], "temoin");
  // Jour d'avant, sans maillon : erreur, meme sans aucun jour au format 3.
  const avant = pari(2, { date: "2026-10-02", kickoff_at: "2026-10-02T19:00:00.000Z", result: "win" });
  const va = E.verifier(reg, un.concat([avant]), now);
  assert.equal(va.ok, false);
  assert.match(va.erreurs.join("\n"), /pari hors chaine 2 \(2026-10-02\) : aucun maillon ce jour-la, jamais scelle/);
  // Jour apres le dernier maillon (pipeline avant son premier scelle au format 3) : match a venir et
  // pas regle -> non verifiable ; regle ou coup d'envoi passe -> erreur.
  const demain = pari(3, { date: "2026-10-05", kickoff_at: "2026-10-05T19:00:00.000Z" });
  const vd = E.verifier(reg, un.concat([demain]), now);
  assert.equal(vd.ok, true);
  assert.deepEqual(vd.non_verifiables.map((x) => [x.jour, x.raison]), [["2026-10-05", "pari 3 pas encore scelle (coup d'envoi a venir)"]]);
  assert.equal(E.verifier(reg, un.concat([Object.assign({}, demain, { result: "win" })]), now).ok, false, "regle avant son coup d'envoi");
  assert.equal(E.verifier(reg, un.concat([demain]), { nowMs: Date.parse("2026-10-05T19:00:00Z") }).ok, false, "coup d'envoi passe");
  // Chaine vide : tout pari simple deja joue est hors chaine.
  assert.equal(E.verifier(E.vide(), un, now).ok, false);
});

test("10. N2 : pari remasque apres la revelation du sel (format 3) = ERREUR ; secret seul ou ancien format : non verifiable", () => {
  const { p, reg } = regle5("loss", "win");
  assert.deepEqual([E.verifier(reg, p, plusTard5).ok, E.verifier(reg, p, plusTard5).verifies], [true, [1]], "temoin");
  // N2a : le perdant redevient « masque » (pronostic retire) et passe gagne.
  const a = p.map((x) => Object.assign({}, x));
  a[0].redacted = true; delete a[0].prediction; delete a[0].cote; delete a[0].model_probability; delete a[0].market; a[0].result = "win";
  const va = E.verifier(reg, a, plusTard5);
  assert.equal(va.ok, false);
  assert.match(va.erreurs.join("\n"), /maillon 1 \(2026-11-02\) : pari masque apres la revelation du sel/);
  assert.deepEqual(va.non_verifiables, []);
  // N2b : pronostic reecrit ET redacted: true.
  const b = p.map((x) => Object.assign({}, x));
  b[0].prediction = "Victoire exterieur"; b[0].redacted = true; b[0].result = "win";
  assert.match(E.verifier(reg, b, plusTard5).erreurs.join("\n"), /pari masque apres la revelation du sel/);
  // Sel connu seulement par le secret du pipeline (pas encore revele) : pari masque = non verifiable.
  const p2 = base5(); const reg2 = scelle5(p2);
  p2[0].redacted = true; delete p2[0].prediction;
  const v2 = E.verifier(reg2, p2, { secret: "s", nowMs: Date.parse("2026-11-02T10:00:00Z") });
  assert.equal(v2.ok, true);
  assert.deepEqual(v2.non_verifiables.map((x) => [x.n, x.raison]), [[1, "pari encore masque"]]);
  // Maillon d'avant le format 3, sel revele, pari masque (cas du 21/10) : non verifiable, comme avant.
  const sel = E.sel("s", JOUR);
  const deux = [pari(1), pari(2)];
  const m = { n: 1, jour: JOUR, genere_le: "2026-10-03T06:00:00Z", nb_paris: 2, empreinte_paris: E.empreinteParis(E.parisDuJour(deux, JOUR, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
  m.empreinte = E.empreinteMaillon(m);
  const v3 = E.verifier({ chaine: [m] }, [pari(1), pari(2, { redacted: true })], { nowMs: Date.parse("2026-10-05T12:00:00Z") });
  assert.equal(v3.ok, true);
  assert.deepEqual(v3.non_verifiables.map((x) => [x.n, x.raison]), [[1, "pari encore masque"]]);
});

test("10. retouches : registre mal forme sans exception, delai du curl Telegram, texte public a jour (N1, N5)", () => {
  const liste = [pari(1, { date: "2026-10-05" }), pari(2, { date: "2026-10-04" }), pari(3, { date: "2026-10-03" })];
  [{}, "x", null, 3].forEach((chaine) => {
    assert.deepEqual(E.fenetreJourneesEntieres(liste, 1, { registre: { chaine: chaine }, figees: [] }).map((p) => p.fixture_id), [1, 2, 3], "chaine " + JSON.stringify(chaine) + " : rien n'est coupe");
  });
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 1, { registre: E.vide(), figees: "x" }).map((p) => p.fixture_id), [1]);
  const etape = WF.slice(WF.indexOf("- name: Alerte empreintes des paris"), WF.indexOf("- name: Alerte moteur v3"));
  assert.match(etape, /curl -sS --max-time 20 -X POST "https:\/\/api\.telegram\.org\/bot/);
  // Texte public : limites N1 et N5 ecrites, plus de « retirer ou retoucher un maillon casse la chaine » sans reserve.
  // Tour 6 : N'IMPORTE QUEL maillon peut etre reecrit sans secret (16/10 retire au milieu : ok=true) ; dit honnetement.
  assert.match(E.EXPLICATION, /l'heure du coup d'envoi vient du pipeline et n'est pas recoupee avec l'heure reelle du match/);
  assert.match(E.EXPLICATION, /La chaine seule ne protege pas contre une reecriture du fichier : n'importe quel maillon, ancien ou recent, peut etre retire ou reecrit \(sel revele compris\) et les suivants rechaines, sans aucun secret/);
  assert.match(E.EXPLICATION, /Seules les versions deja publiees \(historique Git du depot, copies gardees par chacun\) montrent un tel changement/);
  assert.doesNotMatch(E.EXPLICATION, /Seuls les maillons suivis d'un maillon deja publie sont proteges/);
  assert.doesNotMatch(E.EXPLICATION, /Les derniers maillons peuvent etre retires ou reecrits/);
  assert.doesNotMatch(E.EXPLICATION, /: retirer ou retoucher un maillon casse la chaine/);
  assert.match(E.EXPLICATION, /pari hors chaine/);
  assert.match(E.EXPLICATION, /un pari encore masque est une erreur/);
  assert.doesNotMatch(E.EXPLICATION, /garanti|%/);
  // Fichier public : texte a jour des la fusion (la chaine n'est pas touchee).
  assert.equal(JSON.parse(read("preuves/empreintes-paris.json")).explication, E.EXPLICATION);
});

// ---------------------------------------------------------------- 11. tour 6 (mathematicien, 23/10) : M1, M2, M3
const jourP = (id, jour, extra) => pari(id, Object.assign({ date: jour, published_at: jour + "T06:10:00.000Z", kickoff_at: jour + "T19:00:00.000Z" }, extra || {}));
// Chaine d'ancien format (avant le format 3) : un maillon par journee, sel revele sauf sansSel.
const chaineAncienne = (journees) => {
  const chaine = [];
  journees.forEach(({ jour, paris, sansSel }) => {
    const s = E.sel("s", jour);
    const m = { n: chaine.length + 1, jour: jour, genere_le: jour + "T06:00:00.000Z", nb_paris: paris.length, empreinte_paris: E.empreinteParis(E.parisDuJour(paris, jour, { format: 2 }).paris, s), precedente: chaine.length ? chaine[chaine.length - 1].empreinte : E.GENESE };
    if (!sansSel) m.sel_revele = s;
    m.empreinte = E.empreinteMaillon(m);
    chaine.push(m);
  });
  return { version: 2, chaine: chaine };
};
// Fichier fige comme l'ecrit le pipeline (update-data.yml) : champs de l'empreinte + date, type, corrections.
const figer = (p) => { const o = {}; E.CHAMPS.concat(["date", "type", "corrections"]).forEach((k) => { if (p[k] !== undefined) o[k] = p[k]; }); return o; };
const depotTemp = (registre, historique, figees) => {
  const d = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "iashark-empreintes-"));
  fs.mkdirSync(path.join(d, "preuves/paris-scelles"), { recursive: true });
  fs.writeFileSync(path.join(d, "preuves/empreintes-paris.json"), JSON.stringify(registre));
  fs.writeFileSync(path.join(d, "historique.json"), JSON.stringify({ predictions: historique }));
  Object.keys(figees).forEach((j) => fs.writeFileSync(path.join(d, "preuves/paris-scelles", j + ".json"), JSON.stringify({ jour: j, paris: figees[j].map(figer) })));
  return d;
};

test("11. M3 : journees figees fusionnees par JOURNEE (script public et pipeline) ; perdants ou journee retires = erreur", () => {
  const A = "2026-10-03", B = "2026-10-04", D = "2026-10-05";
  const pa = [jourP(1, A, { result: "win" }), jourP(2, A, { result: "loss" }), jourP(3, A, { result: "loss" })];
  const pb = [jourP(4, B, { result: "win" }), jourP(5, B, { result: "loss" })];
  const pd = [jourP(6, D, { result: "loss" }), jourP(7, D, { result: "win" })];
  const reg = chaineAncienne([{ jour: A, paris: pa }, { jour: B, paris: pb }, { jour: D, paris: pd }]);
  const figees = { [A]: pa, [B]: pb, [D]: pd };
  const tous = pd.concat(pb, pa); // historique.json : le plus recent d'abord
  const now = Date.parse("2026-10-08T06:00:00Z");
  const S = require("../scripts/verifier-empreintes.js");
  const essai = (histo) => { const d = depotTemp(reg, histo, figees); try { return S.verifierDepot(d, now); } finally { fs.rmSync(d, { recursive: true, force: true }); } };
  const t = essai(tous);
  assert.deepEqual([t.ok, t.verifies], [true, [1, 2, 3]], "temoin");
  // M3 : perdants des journees figees retires de historique.json (le bilan monte) -> erreur pour chaque journee.
  const v = essai(tous.filter((p) => p.result !== "loss"));
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /maillon 1 \(2026-10-03\) : 1 paris dans les donnees pour 3 scelles/);
  assert.match(v.erreurs.join("\n"), /maillon 3 \(2026-10-05\) : 1 paris dans les donnees pour 2 scelles/);
  // M3b : journee figee B retiree en entier alors que A, plus ancienne, est encore la -> erreur.
  const vb = essai(tous.filter((p) => p.date !== B));
  assert.equal(vb.ok, false);
  assert.match(vb.erreurs.join("\n"), /journee 2026-10-04 figee \(preuves\/paris-scelles\/\) mais retiree de historique\.json alors que des journees figees plus anciennes y restent \(2026-10-03\)/);
  // Glissement normal (les plus anciennes sortent d'abord) : aucune fausse alerte, journees relues dans les fichiers figes.
  [tous.filter((p) => p.date !== A), pd, []].forEach((h, i) => assert.deepEqual([essai(h).ok, essai(h).verifies], [true, [1, 2, 3]], "glissement " + i));
  // Regle partagee (lib) : une ligne combinee ne rend pas une journee « presente ».
  const f = E.fusionnerFigees(tous.filter((p) => p.date !== B), figees);
  assert.deepEqual([f.presentes, f.absentes, f.paris.length], [[A, D], [B], 7]);
  assert.deepEqual(E.fusionnerFigees([{ type: "combi", date: A }], { [A]: pa }).absentes, [A]);
  // Pipeline : meme regle (code du workflow execute tel quel), alerte dediee.
  const bloc = WF.slice(WF.indexOf("var erreursFigees=[];"), WF.indexOf("var optsVerif=function()"));
  assert.match(bloc, /var fusion=EMPREINTES\.fusionnerFigees\(histo\.predictions,figees\);/);
  assert.match(WF, /if\(erreursFigees\.length\) alerteEmpreintes\('Journee figee retiree',/);
  assert.doesNotMatch(WF, /if\(!vus\[k\]\)\{ vus\[k\]=true; out\.push\(p\); \}/);
  assert.doesNotMatch(read("scripts/verifier-empreintes.js"), /if \(!vus\[k\]\)/);
  const d = depotTemp(reg, [], figees);
  try {
    const pipeline = (histo) => new Function("fs", "DOSSIER_SCELLES", "histo", "EMPREINTES", bloc + "\nreturn { paris: parisPourVerif(), erreurs: erreursFigees };")(fs, path.join(d, "preuves/paris-scelles"), { predictions: histo }, E);
    const m3 = pipeline(tous.filter((p) => p.result !== "loss"));
    assert.equal(m3.paris.length, 3);
    assert.equal(E.verifier(reg, m3.paris, { secret: "s", nowMs: now }).ok, false);
    const m3b = pipeline(tous.filter((p) => p.date !== B));
    assert.equal(m3b.paris.length, 7);
    assert.match(m3b.erreurs.join("\n"), /journee 2026-10-04 figee/);
    const normal = pipeline(pd);
    assert.deepEqual([normal.erreurs, E.verifier(reg, normal.paris, { secret: "s", nowMs: now }).verifies], [[], [1, 2, 3]]);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  assert.match(E.EXPLICATION, /une journee figee dans preuves\/paris-scelles\/ n'est relue que si elle n'a plus aucun pari dans historique\.json/);
  assert.match(E.EXPLICATION, /Une journee figee retiree de historique\.json alors que des journees figees plus anciennes y restent est une erreur/);
});

test("11. M1 : pari regle (gagne ou perdu) au pronostic masque = ERREUR, quel que soit le format", () => {
  const A = "2026-10-03";
  const pa = [jourP(1, A, { result: "loss" }), jourP(2, A, { result: "loss" })];
  const reg = chaineAncienne([{ jour: A, paris: pa }]);
  const now = { nowMs: Date.parse("2026-10-05T06:00:00Z") };
  assert.deepEqual([E.verifier(reg, pa, now).ok, E.verifier(reg, pa, now).verifies], [true, [1]], "temoin");
  // Ancien format, sel revele : perdant remasque (pronostic retire) et passe gagne -> erreur (avant : « non verifiable »).
  const a = pa.map((x) => Object.assign({}, x));
  a[0].redacted = true; delete a[0].prediction; delete a[0].cote; delete a[0].model_probability; delete a[0].market; a[0].result = "win";
  const va = E.verifier(reg, a, now);
  assert.equal(va.ok, false);
  assert.match(va.erreurs.join("\n"), /pari 1 \(2026-10-03\) : regle \(win\) mais pronostic masque/);
  // redacted: true seul, ou pronostic vide : erreur aussi.
  assert.equal(E.verifier(reg, [Object.assign({}, pa[0], { redacted: true }), pa[1]], now).ok, false);
  assert.equal(E.verifier(reg, [Object.assign({}, pa[0], { prediction: "" }), pa[1]], now).ok, false);
  // Format 3, sel pas encore revele (pipeline, avec le secret) : erreur, plus « non verifiable ».
  const p2 = base5(); const reg2 = scelle5(p2);
  p2[0].redacted = true; delete p2[0].prediction; p2[0].result = "loss";
  assert.match(E.verifier(reg2, p2, { secret: "s", nowMs: Date.parse("2026-11-02T22:00:00Z") }).erreurs.join("\n"), /pari 1 \(2026-11-02\) : regle \(loss\) mais pronostic masque/);
  // Pari masque PAS encore regle : toujours « non verifiable » (jamais une fausse alerte).
  const v3 = E.verifier(reg, [Object.assign({}, pa[0], { redacted: true, result: "scheduled" }), pa[1]], now);
  assert.deepEqual([v3.ok, v3.non_verifiables.map((x) => x.raison)], [true, ["pari encore masque"]]);
  assert.match(E.EXPLICATION, /Un pari regle \(gagne ou perdu\) dont le pronostic est masque est une erreur, quel que soit le format/);
  // Donnees du depot : aucun pari regle masque (le masquage ne touche jamais un pari regle).
  assert.deepEqual(JSON.parse(read("historique.json")).predictions.filter((p) => (p.result === "win" || p.result === "loss") && (p.redacted === true || !p.prediction)).map((p) => p.fixture_id), []);
});

test("11. M2 : sel en retard pour TOUT format ; historique.json garde les journees au sel pas encore revele", () => {
  const J = "2026-10-22";
  const pj = [jourP(1, J), jourP(2, J)];
  const reg = chaineAncienne([{ jour: J, paris: pj, sansSel: true }]);
  // Ancien format, sel jamais revele : « non verifiable » jusqu'au 29/10 a 23 h 59 UTC, puis ERREUR.
  const v1 = E.verifier(reg, pj, { nowMs: Date.parse("2026-10-29T23:59:59Z") });
  assert.deepEqual([v1.ok, v1.non_verifiables.map((x) => x.raison)], [true, ["sel pas encore revele"]]);
  const v2 = E.verifier(reg, pj, { nowMs: Date.parse("2026-10-30T00:00:00Z") });
  assert.equal(v2.ok, false);
  assert.match(v2.erreurs.join("\n"), /maillon 1 \(2026-10-22\) : sel en retard \(pas revele 7 jours apres la fin de sa journee\)/);
  assert.equal(E.verifier(reg, pj, { secret: "s", nowMs: Date.parse("2026-11-30T12:00:00Z") }).ok, false, "pipeline aussi");
  // Fenetre : journee au sel pas revele (ancien format, pas figee) gardee entiere ; sel revele ou journee figee : elle peut sortir.
  const liste = [jourP(9, "2026-10-24"), jourP(8, "2026-10-23")].concat(pj);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2, { registre: reg, figees: [] }).map((p) => p.fixture_id), [9, 8, 1, 2]);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2, { registre: chaineAncienne([{ jour: J, paris: pj }]), figees: [] }).map((p) => p.fixture_id), [9, 8]);
  assert.deepEqual(E.fenetreJourneesEntieres(liste, 2, { registre: reg, figees: [J] }).map((p) => p.fixture_id), [9, 8]);
  assert.match(E.EXPLICATION, /un sel, tout format, pas revele 7 jours apres la fin de sa journee aussi \(sel en retard\)/);
  assert.doesNotMatch(E.EXPLICATION, /un sel au format 3 pas revele/);
});

test("11. pari deja regle au coup d'envoi ecrit dans le futur (2099), jour passe au format 3 = ERREUR ; texte « depuis le format 3 »", () => {
  const { p, reg } = regle5("loss", "loss");
  const faux = Object.assign(p5(77, "Victoire exterieur", 1.5, "2099-01-01T19:00:00.000Z"), { result: "win" });
  const v = E.verifier(reg, p.concat([faux]), plusTard5);
  assert.equal(v.ok, false);
  assert.match(v.erreurs.join("\n"), /pari 77 \(2026-11-02\) : ni scelle ni declare non scelle/);
  // Pas encore regle : « non verifiable (coup d'envoi a venir) », comme avant.
  const va = E.verifier(reg, p.concat([Object.assign({}, faux, { result: "scheduled" })]), plusTard5);
  assert.deepEqual([va.ok, va.non_verifiables.map((x) => x.raison)], [true, ["pari 77 pas encore scelle (coup d'envoi a venir)"]]);
  assert.match(E.EXPLICATION, /Depuis le format 3, le sel d'un jour est revele 3 heures apres/);
});
