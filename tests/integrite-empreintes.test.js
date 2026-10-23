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
  const v = E.verifier(reg, preds, { secret: "s" });
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
  assert.deepEqual(r3.non_scelles, [{ fixture_id: 3, raison: "coup d'envoi passe avant le scelle" }]);
  assert.deepEqual([r3.declaration.type, r3.declaration.nb_paris, r3.declaration.empreinte_paris], ["non_scelle", 0, null]);
  const v = E.verifier(reg, preds, { secret: "s", nowMs: Date.parse("2026-10-03T23:00:00Z") });
  assert.deepEqual([v.ok, v.verifies], [true, [1, 2, 3]], "maillon 4 = declaration, sans empreinte");
  assert.match(v.avertissements.join("\n"), /pari 3 \(2026-10-03\) : non scelle \(coup d'envoi passe avant le scelle\)/);
  // Sel du jour deja revele : un pari ajoute ensuite n'est jamais sale avec un sel public.
  E.revelerSels(reg, "s", { predictions: preds, nowMs: Date.parse("2026-10-04T01:00:00Z") });
  assert.ok(reg.chaine[0].sel_revele);
  preds.push(pari(5, { kickoff_at: "2026-10-04T02:00:00.000Z", published_at: "2026-10-03T23:30:00.000Z" }));
  const r4 = E.ajouter(reg, JOUR, preds, "s", "2026-10-03T23:40:00Z", opts);
  assert.deepEqual([r4.ajoute, r4.non_scelles], [false, [{ fixture_id: 5, raison: "sel du jour deja revele" }]]);
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
  const v = E.verifier(reg, preds, { secret: "s" });
  assert.deepEqual([v.ok, v.verifies], [true, [1, 2]]);
  // Sans la trace, le scelle d'origine ne correspond plus : rien n'est cache.
  const sansTrace = preds.map((p) => Object.assign({}, p, { corrections: undefined }));
  assert.equal(E.verifier(reg, sansTrace, { secret: "s" }).ok, false);
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
  assert.match(WF, /histo\.predictions=EMPREINTES\.fenetreJourneesEntieres\(histo\.predictions,500\);/);
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
  assert.equal(E.revelerSels(reg, "s", { predictions: preds, nowMs: Date.parse("2026-10-05T22:00:00Z") }), 1);
  assert.equal(reg.chaine[0].sel_revele, E.sel("s", JOUR));
});

test("4bis. pipeline : chaque maillon verifie avant et apres le scelle, ecart = run au rouge", () => {
  assert.match(WF, /var verif=EMPREINTES\.verifier\(registreEmp,parisPourVerif\(\),optsVerif\(\)\);/);
  assert.match(WF, /journeesNonVerifiables:CORRECTIONS\.journeesNonVerifiables\(journalCorr\)/);
  assert.match(WF, /if\(!verif\.ok\) alerteEmpreintes\(/);
  assert.match(WF, /if\(!verifApres\.ok\) alerteEmpreintes\(/);
  assert.match(WF, /iashark-empreintes-alerte\.txt/);
  assert.match(WF, /- name: Alerte empreintes des paris\n\s+# [^\n]*\n(?:\s+#[^\n]*\n)*\s+if: always\(\)\n\s+run: \|\n\s+F="\$RUNNER_TEMP\/iashark-empreintes-alerte\.txt"\n\s+if \[ -s "\$F" \]; then[\s\S]{0,400}exit 1/);
  // Journees verifiees figees dans preuves/paris-scelles/ (jamais coupees), relues pour la verification.
  assert.match(WF, /var DOSSIER_SCELLES='preuves\/paris-scelles';/);
  assert.match(WF, /fs\.readdirSync\(DOSSIER_SCELLES\)/);
  // Corrections de ce run scellees par un maillon « correction » avant les nouveaux paris du jour.
  assert.ok(WF.indexOf("EMPREINTES.corriger(registreEmp,") < WF.indexOf("EMPREINTES.ajouter(registreEmp,TODAY,"));
  assert.match(WF, /CORRECTIONS_DU_RUN\.push\(/);
  // Archive avant le scelle (inchange), fenetre de historique.json apres le scelle.
  assert.ok(WF.indexOf("await writePredictionsArchive(histo.predictions);") < WF.indexOf("EMPREINTES.ajouter(registreEmp,TODAY,"));
  assert.ok(WF.indexOf("EMPREINTES.ajouter(registreEmp,TODAY,") < WF.indexOf("EMPREINTES.fenetreJourneesEntieres(histo.predictions,500)"));
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
  assert.match(v.erreurs.join("\n"), /maillon 1 \(2026-11-02\) : pari\(s\) scelle\(s\) absent\(s\) des donnees alors que la journee y est : 2/);
  // Journee entierement sortie des donnees : non verifiable, pas une erreur.
  assert.equal(E.verifier(reg, [], apres5).ok, true);
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
  assert.match(WF, /if\(!lectReg\.ok\|\|!lectCorr\.ok\)\{\n\s+alerteEmpreintes\('fichier de preuves illisible : '/);
  assert.doesNotMatch(WF, /try\{ registreEmp=JSON\.parse\(fs\.readFileSync\(REG_CHEMIN,'utf8'\)\); \}catch\(e\)\{\}/, "plus jamais de repli silencieux sur vide()");
  assert.doesNotMatch(WF, /try\{ journalCorr=JSON\.parse\(fs\.readFileSync\(CORRECTIONS\.CHEMIN,'utf8'\)\); \}catch\(e\)\{\}/);
  assert.match(WF, /var reecritures=EMPREINTES\.prolonge\(lectReg\.avant,registreEmp\)\.concat\(CORRECTIONS\.ajoutSeulement\(lectCorr\.avant,journalCorr\)\);/);
  assert.ok(WF.indexOf("var reecritures=") < WF.indexOf("fs.writeFileSync(REG_CHEMIN,"), "controle avant toute ecriture");
  assert.match(WF, /if\(a\.en_attente\.length\) alerteEmpreintes\(/);
  assert.match(WF, /if\(a\.non_scelles\.length\) alerteEmpreintes\(/);
  assert.match(WF, /var decl=EMPREINTES\.declarerNonScelles\(registreEmp,histo\.predictions,maintenantEmp,\{aujourdhui:TODAY\}\);/);
  assert.match(WF, /if\(!SECRET_EMPREINTE\) alerteEmpreintes\(/);
  assert.match(WF, /\}catch\(e\)\{ alerteEmpreintes\('erreur pendant le scelle ou la verification : '/);
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
