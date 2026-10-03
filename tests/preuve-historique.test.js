"use strict";
// Corrections demandees par historique-public (29/09/2026, VERIF-HISTORIQUE-V3.md) :
// published_at / kickoff_at et verrou en base, empreinte quotidienne chainee,
// moteur suivi au realignement, retraits motives, dates, publics, jamais sur le v3.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../lib/empreintes-paris.js");
const R = require("../lib/results-exclusions.js");
const PICK_FREEZE = require("../lib/pick-freeze.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const WF = read(".github/workflows/update-data.yml");

const pari = (id, extra) => Object.assign({ fixture_id: id, home: "A" + id, away: "B" + id, prediction: "Over 1.5", cote: 1.3, model_probability: 64.5, market: "over-15", date: "2026-10-03", type: "single", result: "scheduled", moteur: "v3", moteur_version: "3.0.0", published_at: "2026-10-03T06:10:00.000Z", kickoff_at: "2026-10-03T19:00:00.000Z" }, extra || {});

test("migration 0035 : published_at, kickoff_at, verrou apres le coup d'envoi sauf le resultat", () => {
  const sql = read("supabase/migrations/0035_predictions_archive_verrou.sql");
  assert.match(sql, /add column if not exists published_at timestamptz/);
  assert.match(sql, /add column if not exists kickoff_at timestamptz/);
  // Ronde 4 : plus de contrainte qui refuserait une ligne (et tout son lot de 200).
  assert.doesNotMatch(sql, /add constraint predictions_archive_publie_avant_match/);
  assert.match(sql, /libres constant text\[\] := array\['result', 'score', 'resolved_date', 'updated_at'\]/);
  assert.match(sql, /before update or delete on public\.predictions_archive/);
  assert.match(sql, /now\(\) < old\.kickoff_at/);
  assert.match(sql, /suppression refusee/);
  // Contre-controle (30/09/2026) : un resultat regle ne change plus en silence
  // (un perdu ne devient pas « rembourse ») ; seule correction possible : publique et motivee.
  assert.match(sql, /pas_regle constant text\[\] := array\['scheduled', 'pending'\]/);
  assert.match(sql, /old\.result is not null and not \(old\.result = any\(pas_regle\)\)/);
  assert.match(sql, /new\.result := old\.result;\n\s+new\.score := old\.score;\n\s+new\.resolved_date := old\.resolved_date;/);
  assert.match(sql, /'UPDATE_RESULTAT'/);
  assert.match(sql, /create table if not exists public\.predictions_archive_corrections/);
  assert.match(sql, /raison text not null check \(length\(btrim\(raison\)\) >= 10\)/);
  assert.match(sql, /for select to anon, authenticated using \(true\)/, "journal des corrections lisible par tous");
  assert.match(sql, /journal public, ajout seulement/);
  assert.match(sql, /before update or delete on public\.predictions_archive_corrections/);
  assert.match(sql, /c\.corrige_le = now\(\)/, "la correction doit etre journalisee dans la meme transaction");
  assert.match(sql, /revoke all on function public\.corriger_resultat_archive\(bigint, text, text, text\) from public, anon, authenticated;/);
  // Le pipeline les ecrit (et archive quand meme si la migration manque, run au rouge).
  assert.match(WF, /published_at:p\.published_at\|\|null,kickoff_at:p\.kickoff_at\|\|null,/);
  assert.match(WF, /0035_predictions_archive_verrou\.sql/);
});

// Contre-controle ronde 4 (30/09/2026). Preuves des specialistes : published_at etait
// DECLARE par le pipeline (il pouvait l'antidater), kickoff_at pouvait etre remis a vide
// (la ligne sortait du verrou), et le verrou n'avait jamais ete essaye.
test("migration 0035 : published_at pose par la base, kickoff_at jamais remis a vide, essai du verrou pret", () => {
  const sql = read("supabase/migrations/0035_predictions_archive_verrou.sql");
  const fn = (nom) => { const i = sql.indexOf("create or replace function public." + nom + "()"); assert.ok(i >= 0, nom); return sql.slice(i, sql.indexOf("$$;", i)); };
  // A l'ajout : heure de la base, jamais celle envoyee.
  const pub = fn("predictions_archive_publication");
  assert.match(pub, /^\s*new\.published_at := now\(\);/m);
  assert.match(pub, /if exists \(select 1 from public\.predictions_archive a where a\.fixture_id = new\.fixture_id\) then\n\s+return new;/);
  assert.match(pub, /now\(\) >= new\.kickoff_at[\s\S]*'INSERT_APRES_COUP_D_ENVOI'/);
  assert.match(sql, /create trigger predictions_archive_publication\n\s+before insert on public\.predictions_archive/);
  // A la mise a jour : l'heure d'origine, sauf pari change avant le coup d'envoi (heure de la base).
  const verrou = fn("predictions_archive_verrou");
  const avantRetour = verrou.slice(0, verrou.indexOf("if old.kickoff_at is null or now() < old.kickoff_at then"));
  assert.match(avantRetour, /\(new\.prediction, new\.cote, new\.market, new\.model_probability\)\s+is distinct from \(old\.prediction, old\.cote, old\.market, old\.model_probability\)/);
  assert.match(avantRetour, /new\.published_at := now\(\);\n\s+else\n\s+new\.published_at := old\.published_at;/);
  assert.doesNotMatch(verrou.replace(/new\.published_at := (?:now\(\)|old\.published_at);/g, ""), /new\.published_at :=/, "published_at n'a pas d'autre source");
  // kickoff_at : jamais remis a vide (tentative notee), report note.
  assert.match(avantRetour, /if old\.kickoff_at is not null and new\.kickoff_at is null then[\s\S]*'UPDATE_KICKOFF_VIDE'[\s\S]*new\.kickoff_at := old\.kickoff_at;/);
  assert.match(avantRetour, /'KICKOFF_DEPLACE'/);
  assert.ok(verrou.indexOf("'UPDATE_KICKOFF_VIDE'") < verrou.indexOf("return new;"), "protection AVANT la sortie « pas encore commence »");
  // Essai du verrou sur une base d'essai : chaque preuve a sa verification, tout est annule.
  const essai = read("supabase/tests/0035_predictions_archive_verrou.test.sql");
  assert.match(essai, /^begin;$/m);
  assert.match(essai, /^rollback;$/m);
  assert.doesNotMatch(essai, /^commit;?$/im, "l'essai ne laisse rien");
  for (let i = 1; i <= 8; i++) assert.match(essai, new RegExp("raise exception 'ECHEC " + i + " "), "verification " + i);
  assert.match(essai, /published_at declare par le pipeline accepte/);
  assert.match(essai, /kickoff_at remis a vide/);
  assert.match(essai, /Jamais sur la vraie base/);
});

test("empreinte : chainee, stable, revision visible, jamais sur des paris masques", () => {
  const reg = E.vide();
  const preds = [pari(2), pari(1), pari(9, { date: "2026-10-02" })];
  const a = E.ajouter(reg, "2026-10-03", preds, "secret", "2026-10-03T06:20:00Z");
  assert.equal(a.ajoute, true); assert.equal(a.maillon.nb_paris, 2); assert.equal(a.maillon.precedente, E.GENESE);
  assert.equal(E.ajouter(reg, "2026-10-03", preds, "secret").raison, "inchange");
  // Un pari realigne avant son coup d'envoi : nouveau maillon, l'ancien reste.
  preds[0].prediction = "Victoire Domicile";
  const b = E.ajouter(reg, "2026-10-03", preds, "secret", "2026-10-03T12:00:00Z");
  assert.equal(b.raison, "revision"); assert.equal(reg.chaine.length, 2); assert.equal(b.maillon.precedente, a.maillon.empreinte);
  assert.deepEqual(E.verifier(reg), { ok: true, erreurs: [] });
  // Sel : sans lui, l'empreinte ne se recalcule pas ; revele, elle se verifie sur les paris.
  assert.equal(reg.chaine[0].sel_revele, undefined);
  assert.equal(E.revelerSels(reg, "secret", "2026-10-03"), 2);
  assert.deepEqual(E.verifier(reg, preds), { ok: true, erreurs: [] });
  // Pari modifie apres coup : detecte.
  const triche = preds.map((p) => Object.assign({}, p)); triche[1].cote = 1.9;
  assert.equal(E.verifier(reg, triche).ok, false);
  // Probabilite annoncee retouchee apres coup (contre-controle, 30/09/2026) : detectee aussi.
  assert.ok(E.CHAMPS.includes("model_probability"));
  const proba = preds.map((p) => Object.assign({}, p)); proba[1].model_probability = 71;
  assert.equal(E.verifier(reg, proba).ok, false);
  // Maillon retouche : chaine rompue.
  const casse = JSON.parse(JSON.stringify(reg)); casse.chaine[0].nb_paris = 5;
  assert.equal(E.verifier(casse).ok, false);
  // Paris masques non relus, ou aucun secret : pas d'empreinte.
  assert.equal(E.ajouter(E.vide(), "2026-10-03", [pari(3, { redacted: true, prediction: undefined })], "secret").raison, "pari masque non relu");
  assert.equal(E.ajouter(E.vide(), "2026-10-03", preds, "").raison, "secret absent");
  // Pipeline : fichier public commite, sel revele a J+2, deux derniers jours empreints.
  assert.match(WF, /OUTPUTS="preuves /);
  assert.match(WF, /EMPREINTES\.revelerSels\(registreEmp,SECRET_EMPREINTE,avant2\)/);
  assert.match(WF, /\[hierEmp,TODAY\]\.forEach/);
});

test("realignement : le moteur suit le pari publie, jamais apres le coup d'envoi", () => {
  const match = { id: 7, pari_rec: "Victoire Domicile", cote_rec: "1.6", model_probability: 66, conf: 6.6, market_id: "home-win" };
  const p = pari(7, { moteur: "ancien", moteur_version: "score-matrix", prediction: "Over 1.5" });
  const ko = Date.parse("2026-10-03T19:00:00Z");
  assert.equal(PICK_FREEZE.alignPendingPrediction(Object.assign({}, p), match, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: ko, nowMs: ko + 1 }), false, "coup d'envoi passe");
  const q = Object.assign({}, p);
  assert.equal(PICK_FREEZE.alignPendingPrediction(q, match, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: ko, nowMs: ko - 3600000 }), true);
  assert.equal(q.prediction, "Victoire Domicile"); assert.equal(q.moteur, "v3"); assert.equal(q.moteur_version, "3.0.0");
  // Meme pari, seul le moteur differe : realigne quand meme (l'etiquette suit).
  const r = Object.assign({}, q, { moteur: "v3" });
  assert.equal(PICK_FREEZE.alignPendingPrediction(r, match, { moteur: "ancien", moteur_version: "score-matrix", nowMs: 0 }), true);
  assert.equal(r.moteur, "ancien");
  assert.equal(PICK_FREEZE.alignPendingPrediction(r, match, { moteur: "ancien", moteur_version: "score-matrix", nowMs: 0 }), false, "rien a changer");
});

// Avocat du diable, ronde 4.2 (30/09/2026), rejeu avocat-r41/report-realign.js : match
// reporte de 2 jours. La prediction locale garde son kickoff_at d'origine (le pipeline ne
// l'envoie qu'une fois) ; la base (0035) verrouille a cette heure. Le pipeline passe la
// NOUVELLE date en kickoffMs : avant, le pari local etait realigne apres l'heure d'origine
// et l'archive melangeait l'ancien pari (base) et le resultat du nouveau (local).
test("match reporte : jamais de realignement apres le coup d'envoi d'origine (meme verrou que la base)", () => {
  const { parisLocalToMs } = require("../lib/kickoff-guard.js");
  const origine = "2026-10-04 21:00", nouvelle = "2026-10-06 21:00";
  const koOrigine = parisLocalToMs(origine), koNouveau = parisLocalToMs(nouvelle);
  const m = { id: 123, pari_rec: "Victoire Domicile", cote_rec: "1.70", model_probability: 74, market_id: "home-win", conf: 7.4, date: nouvelle };
  const pred = () => pari(123, { prediction: "Plus de 2.5 buts", cote: 1.9, model_probability: 72, market: "over-25", kickoff_at: new Date(koOrigine).toISOString(), published_at: "2026-10-03T08:00:00Z" });
  // Apres l'heure d'origine (base verrouillee) : le pari local ne bouge plus.
  const apres = pred();
  assert.equal(PICK_FREEZE.alignPendingPrediction(apres, m, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: koNouveau, nowMs: koOrigine + 3600000 }), false);
  assert.equal(apres.prediction, "Plus de 2.5 buts");
  assert.equal(apres.cote, 1.9);
  assert.equal(apres.kickoff_at, new Date(koOrigine).toISOString(), "kickoff_at d'origine garde");
  // Pile a l'heure d'origine : deja verrouille.
  assert.equal(PICK_FREEZE.alignPendingPrediction(pred(), m, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: koNouveau, nowMs: koOrigine }), false);
  // Avant l'heure d'origine (la base accepte encore le changement) : realignement normal.
  const avant = pred();
  assert.equal(PICK_FREEZE.alignPendingPrediction(avant, m, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: koNouveau, nowMs: koOrigine - 3600000 }), true);
  assert.equal(avant.prediction, "Victoire Domicile");
  // Prediction ancienne sans kickoff_at : seule la garde du coup d'envoi du match compte.
  const sansKo = pred(); delete sansKo.kickoff_at;
  assert.equal(PICK_FREEZE.alignPendingPrediction(sansKo, m, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: koNouveau, nowMs: koOrigine + 3600000 }), true);
  // Le pipeline n'envoie jamais un nouveau kickoff_at (ecrit une seule fois, a l'ajout).
  assert.equal((WF.match(/kickoff_at:koMs!=null\?new Date\(koMs\)\.toISOString\(\):null/g) || []).length, 1);
});

test("retraits : raison et date obligatoires, jamais un pari v3, publies dans le bilan", () => {
  const fichier = { day: "2026-10-03", totals: {}, matches: [
    { id: 1, league_key: "peru_primera", result: "loss" },
    { id: 2, league_key: "peru_primera", result: "win", moteur: "v3" },
    { id: 3, league_key: "peru_primera", result: "win", moteur: "ancien" },
    { id: 4, league_key: "ligue_1", result: "loss", moteur: "v3" }], scorers: [{ match_id: 1, player: "X" }] };
  const ok = R.appliquerRetraits(fichier, { league_keys: ["peru_primera"], reason: "Donnees insuffisantes", decided_on: "2026-10-04" });
  assert.equal(ok.erreur, null);
  assert.deepEqual(ok.file.matches.map((m) => m.id), [2, 4], "le pari v3 reste");
  assert.deepEqual(ok.file.totals, { settled: 2, won: 1, lost: 1, void: 0, pending: 0 });
  assert.deepEqual(ok.file.exclusions, { raison: "Donnees insuffisantes", decidee_le: "2026-10-04", championnats: ["peru_primera"], paris_retires: 2, gagnes_retires: 1, perdus_retires: 1, rembourses_retires: 0, en_attente_retires: 0, paris_v3_gardes: 1 });
  assert.deepEqual(ok.file.scorers, []);
  assert.equal(fichier.matches.length, 4, "fichier d'origine intact");
  for (const mauvais of [{ league_keys: ["peru_primera"], decided_on: "2026-10-04" }, { league_keys: ["peru_primera"], reason: "x" }, { league_keys: ["peru_primera"], reason: "x", decided_on: "hier" }]) {
    const r = R.appliquerRetraits(fichier, mauvais);
    assert.ok(r.erreur); assert.equal(r.file.matches.length, 4, "retrait ignore"); assert.equal(r.file.exclusions, undefined);
  }
  // Le fichier de configuration du depot respecte la regle.
  const cfg = JSON.parse(read("config/results-exclusions.json"));
  Object.keys(cfg.days).forEach((j) => assert.equal(R.lireRetrait(cfg.days[j]).ok, true, j));
  assert.match(WF, /RETRAITS\.appliquerRetraits\(out\.file,EXCLUSIONS_JOUR\[jour\]\)/);
  assert.doesNotMatch(WF, /function ligueExclue/);
});
