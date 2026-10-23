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

test("1. journal public des corrections : valeurs secretes ajoutees seulement apres le coup d'envoi, jamais reecrit", () => {
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
  assert.deepEqual(C.mettreAJourJournal(j, [p], ko + 1), { ajoutees: 0, completees: 1 });
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
  assert.match(E.ajouter(reg, JOUR, preds, "s", "2026-10-03T19:00:00Z", opts).raison, /deja commence/, "pile au coup d'envoi : refuse");
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
  // Journee deja scellee a l'ancien format : plus completee.
  const ancien = { chaine: [{ n: 1, jour: JOUR, genere_le: "2026-10-03T05:00:00Z", nb_paris: 1, empreinte_paris: "x", precedente: E.GENESE }] };
  assert.equal(E.ajouter(ancien, JOUR, [pari(1)], "s", "2026-10-03T06:00:00Z", opts).raison, "jour deja scelle (ancien format)");
  // Le jour par defaut est le jour de Paris de l'heure du scelle.
  assert.equal(E.jourDeParis("2026-10-02T22:30:00Z"), "2026-10-03");
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
  // Ancien maillon de 2 paris, un seul encore dans le fichier : non verifiable, pas une erreur.
  const sel = E.sel("s", JOUR);
  const deux = [pari(1), pari(2)];
  const m = { n: 1, jour: JOUR, genere_le: "2026-10-03T06:00:00Z", nb_paris: 2, empreinte_paris: E.empreinteParis(E.parisDuJour(deux, JOUR, { format: 2 }).paris, sel), precedente: E.GENESE, sel_revele: sel };
  m.empreinte = E.empreinteMaillon(m);
  const v = E.verifier({ chaine: [m] }, [pari(1)]);
  assert.deepEqual([v.ok, v.verifies, v.non_verifiables.length], [true, [], 1]);
  assert.match(v.non_verifiables[0].raison, /incomplete/);
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
  assert.match(WF, /var verif=EMPREINTES\.verifier\(registreEmp,parisPourVerif\(\),\{secret:SECRET_EMPREINTE,corrections:corrPourVerif\}\);/);
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
