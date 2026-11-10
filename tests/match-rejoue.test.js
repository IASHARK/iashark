"use strict";
// MATCH REJOUE APRES UN PARI ANNULE (decision de Clement du 10/11/2026, vers 4 h : « enleve "match reporte",
// laisse-les normaux et donne des pronos »).
// Cas reel : Pamplona - Eibar (1644365), Amorebieta - UD Logrones (1644335), Mijas Las Lagunas - Real Jaen
// (1644362), Coupe du Roi. Pari « Plus de 2.5 buts » publie le 28/10, match reporte, pari annule (void, sans
// score, kickoff_at du 28/10 dans predictions_archive). Les matchs se jouent le 10/11 au soir (statut NS) et
// l'accueil affichait « Match reporte / Aucun pronostic sur ce match ».
// Regle : le match redevient normal (premiere publication, pari B), le pari A reste annule tel quel, B a sa
// propre ligne d'historique et d'archive (rejoue = 1, migration 0073).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PF = require("../lib/pick-freeze.js");
const PREMIUM = require("../lib/premium-fields.js");
const MR = require("../lib/match-results.js");
const BP = require("../lib/bandeau-preuves.js");
const { parisLocalToMs } = require("../lib/kickoff-guard.js");

const root = path.join(__dirname, "..");
const WF = fs.readFileSync(path.join(root, ".github/workflows/update-data.yml"), "utf8");
const H = 3600e3;

// Pamplona - Eibar : origine 28/10 19:00 Paris (18:00 UTC, kickoff_at de l'archive), rejoue le 10/11 19:00 Paris.
const ID = 1644365;
const ORIGINE_ISO = "2026-10-28T18:00:00+00:00";
const KO_ORIGINE = Date.parse(ORIGINE_ISO);
const NOUVELLE = "2026-11-10 19:00";
const KO_NOUVEAU = parisLocalToMs(NOUVELLE);
const MATIN = parisLocalToMs("2026-11-10 08:00");

// Ligne de predictions_archive du pari A, telle que lue en base le 10/11.
const archiveA = (extra) => Object.assign({ fixture_id: ID, type: "single", result: "void", score: null, kickoff_at: ORIGINE_ISO }, extra || {});
// Calcul du jour (pari B).
const frais = (extra) => Object.assign({ id: ID, date: NOUVELLE, pari_rec: "Victoire Domicile", cote_rec: "1.55", model_probability: 66,
  market_id: "home-win", conf: 6.6, model_output_available: true, data_quality_score: 70 }, extra || {});
const fixture = (statut, ko) => ({ fixture: { id: ID, status: { short: statut || "NS" }, timestamp: Math.floor((ko || KO_NOUVEAU) / 1000) } });
// Ligne premium du match fermee comme « reporte » par les runs precedents.
const marquee = () => ({ fixture_id: ID, pari_rec: "", cote_rec: null, market_id: null, raw_response: { explanation_status: PF.POSTPONED_MARK } });
// Ligne premium fraiche du run (calcul du jour).
const ligneDuJour = () => ({ fixture_id: ID, pari_rec: "Victoire Domicile", cote_rec: 1.55, market_id: "home-win", model_probability: 66, raw_response: { explanation_status: "OK" } });
const run = (previous, opts) => PF.freezeAnalysis(frais(opts && opts.frais), previous, Object.assign({
  nowMs: MATIN, fixture: fixture(), premiumRow: ligneDuJour(), previousPublic: null,
  historyLock: PF.historyLocks([], [archiveA()])[String(ID)], rejouePossible: true }, opts || {}));

test("cas reel du 10/11 : pari A annule, match de nouveau a venir -> pari B publie normalement (plus de « Match reporte »)", () => {
  const lock = PF.historyLocks([], [archiveA()])[String(ID)];
  assert.deepEqual(lock, { kickoffMs: KO_ORIGINE, result: "void" });
  const entree = marquee();
  const r = run(entree);
  assert.equal(r.status, "FIRST_PUBLICATION");
  assert.equal(r.reason, PF.REPLAY_REASON);
  assert.equal(r.rejoue, 1);
  assert.equal(r.match.rejoue, 1);
  assert.equal(r.match.pari_rec, "Victoire Domicile");
  assert.equal(r.match.cote_rec, "1.55");
  assert.notEqual(r.match.no_signal, true);
  assert.notEqual(r.match.no_signal_reason, PF.POSTPONED_REASON);
  assert.equal(r.match.pick_frozen_at, new Date(MATIN).toISOString(), "premiere publication horodatee");
  // Ligne premium : celle du calcul du jour, sans la marque « reporte », avec l'horodatage du gel.
  assert.equal(r.premiumRow.pari_rec, "Victoire Domicile");
  assert.equal(r.premiumRow.raw_response.explanation_status, "OK");
  assert.equal(r.premiumRow.raw_response.pick_freeze.kickoff, NOUVELLE);
  assert.equal(PF.isPostponedMark(r.premiumRow), false);
  // Entree jamais modifiee.
  assert.deepEqual(entree, marquee());
  // Les trois matchs du soir : meme situation (marque « reporte », A annule le 28/10, NS le 10/11).
  for (const [id, origine, ko] of [[1644335, "2026-10-28T19:00:00+00:00", "2026-11-10 20:00"], [1644362, "2026-10-28T19:00:00+00:00", "2026-11-10 20:00"]]) {
    const l = PF.historyLocks([], [{ fixture_id: id, type: "single", result: "void", score: null, kickoff_at: origine }])[String(id)];
    const x = PF.freezeAnalysis(Object.assign(frais(), { id, date: ko }), Object.assign(marquee(), { fixture_id: id }), { nowMs: MATIN,
      fixture: { fixture: { id, status: { short: "NS" }, timestamp: Math.floor(parisLocalToMs(ko) / 1000) } }, premiumRow: Object.assign(ligneDuJour(), { fixture_id: id }), historyLock: l, rejouePossible: true });
    assert.equal(x.status, "FIRST_PUBLICATION", String(id));
    assert.equal(x.match.rejoue, 1, String(id));
  }
});

test("sans la migration 0073 (rejouePossible absent) : rien ne change, le match reste ferme « reporte »", () => {
  const r = run(marquee(), { rejouePossible: undefined });
  assert.equal(r.status, "POSTPONED_CLOSED");
  assert.equal(r.match.pari_rec, "");
  assert.equal(r.match.no_signal_reason, PF.POSTPONED_REASON);
  assert.equal(r.match.rejoue, undefined);
  assert.equal(run(marquee(), { rejouePossible: false }).status, "POSTPONED_CLOSED");
});

test("runs suivants : le pari B publie est fige (jamais un pari C), qu'il soit relu depuis l'historique ou non", () => {
  const r1 = run(marquee());
  // Ce que la base renvoie au run suivant : la ligne premium ecrite par le 1er run.
  const relue = Object.assign({}, r1.premiumRow, { premium_fields: { conf: 6.6 }, updated_at: new Date(MATIN).toISOString() });
  const autreCalcul = { pari_rec: "Moins de 3.5 buts", cote_rec: "1.40", market_id: "under-35", model_probability: 75 };
  // a. Ligne B dans historique.json (en tete), ligne A dans le fichier aussi : B l'emporte (rejoue 1).
  const ligneB = { fixture_id: ID, type: "single", result: "scheduled", rejoue: 1, kickoff_at: new Date(KO_NOUVEAU).toISOString() };
  const lockB = PF.historyLocks([ligneB, archiveA({ reporte: true })])[String(ID)];
  assert.deepEqual(lockB, { kickoffMs: KO_NOUVEAU, result: "scheduled", rejoue: 1 });
  assert.deepEqual(PF.historyLocks([archiveA()], [ligneB])[String(ID)].rejoue, 1, "la ligne au plus grand numero l'emporte, ou qu'elle soit");
  const r2 = run(relue, { nowMs: MATIN + 4 * H, historyLock: lockB, frais: autreCalcul });
  assert.equal(r2.status, "FROZEN");
  assert.equal(r2.match.pari_rec, "Victoire Domicile", "jamais le pari C du calcul du jour");
  assert.equal(r2.match.pick_frozen_at, new Date(MATIN).toISOString());
  assert.equal(r2.match.rejoue, 1, "le match garde son numero : l'historique suit la ligne B");
  // b. Ligne B absente (ecriture de l'historique en echec) : A annule relu, mais B deja publie -> fige quand meme.
  const r3 = run(relue, { nowMs: MATIN + 4 * H, frais: autreCalcul });
  assert.equal(r3.status, "FROZEN");
  assert.equal(r3.match.pari_rec, "Victoire Domicile");
  assert.equal(r3.match.rejoue, 1);
  // c. Lecture de la ligne premium en echec : calcul du jour sans horodatage (regle existante), numero garde.
  const r4 = run(undefined);
  assert.equal(r4.status, "PREVIOUS_UNKNOWN");
  assert.equal(r4.match.rejoue, 1);
});

test("l'ancien pari A encore dans la ligne premium n'est jamais restaure sur le match rejoue", () => {
  const ligneA = { fixture_id: ID, pari_rec: "Plus de 2.5 buts", cote_rec: 1.8, market_id: "over-25", model_probability: 60, premium_fields: { conf: 6 },
    raw_response: { pick_freeze: { frozen_at: "2026-10-28T06:39:49Z", kickoff: "2026-10-28 19:00", public: { model_output_available: true, data_quality_score: 70 } } },
    updated_at: "2026-10-28T06:39:49Z" };
  const r = run(ligneA);
  assert.equal(r.status, "FIRST_PUBLICATION");
  assert.equal(r.match.pari_rec, "Victoire Domicile");
  // Ligne sans pari (videe par la garde au statut PST) : premiere publication aussi.
  assert.equal(run({ fixture_id: ID, pari_rec: "", raw_response: { explanation_status: "SKIPPED_FIXTURE_NOT_UPCOMING" } }).status, "FIRST_PUBLICATION");
  assert.equal(run(null).status, "FIRST_PUBLICATION");
});

test("autres cas inchanges : PST non rejoue, pari rembourse sur un match joue, heure d'origine inconnue, A en attente", () => {
  // Match encore reporte (statut PST) : garde fermee, aucun pari.
  const pst = run(marquee(), { fixture: fixture("PST") });
  assert.equal(pst.status, "KICKOFF_CLOSED");
  // Pari annule AVEC un score (rembourse sur un match joue) : jamais un match rejoue.
  const joue = run(marquee(), { historyLock: PF.historyLocks([], [archiveA({ score: "1-1" })])[String(ID)] });
  assert.equal(joue.status, "POSTPONED_CLOSED");
  assert.equal(joue.reason, "PREVIOUS_POSTPONED");
  const joueSansMarque = run(null, { historyLock: { kickoffMs: KO_ORIGINE, result: "void", score: "1-1" } });
  assert.equal(joueSansMarque.reason, "HISTORY_SETTLED");
  // Heure d'origine inconnue (lignes d'avant la migration 0035) : jamais devine, reste ferme.
  assert.equal(run(null, { historyLock: { kickoffMs: null, result: "void" } }).reason, "HISTORY_SETTLED");
  // Pari gagne ou perdu : jamais rejoue.
  assert.equal(run(null, { historyLock: { kickoffMs: KO_ORIGINE, result: "win" } }).reason, "HISTORY_SETTLED");
  // Nouvelle date AVANT l'heure d'origine (incoherent) : reste ferme.
  assert.equal(run(null, { historyLock: { kickoffMs: KO_NOUVEAU + 24 * H, result: "void" } }).reason, "HISTORY_SETTLED");
  // Pari A encore en attente, heure d'origine passee : ferme et annule (regle de la ronde 5), B au run suivant.
  const attente = run(marquee(), { historyLock: { kickoffMs: KO_ORIGINE, result: "scheduled" } });
  assert.equal(attente.status, "POSTPONED_CLOSED");
  const a = { fixture_id: ID, type: "single", result: "scheduled", prediction: "Plus de 2.5 buts", kickoff_at: ORIGINE_ISO };
  assert.equal(PF.voidPostponedPrediction(a, attente.match, { today: "2026-11-10" }), true);
  const lockApres = PF.historyLocks([a])[String(ID)];
  assert.equal(run(marquee(), { historyLock: lockApres, nowMs: MATIN + 4 * H }).status, "FIRST_PUBLICATION");
  // Match normal, jamais reporte : inchange.
  assert.equal(PF.freezeAnalysis(frais(), null, { nowMs: MATIN, fixture: fixture(), premiumRow: ligneDuJour(), rejouePossible: true }).match.rejoue, undefined);
});

test("match rejoue reporte une 2e fois : B annule a son tour, puis pari C sur une 3e ligne (rejoue 2)", () => {
  const ligneB = { fixture_id: ID, type: "single", result: "scheduled", rejoue: 1, prediction: "Victoire Domicile", kickoff_at: new Date(KO_NOUVEAU).toISOString() };
  const relueB = Object.assign({}, run(marquee()).premiumRow, { premium_fields: { conf: 6.6 } });
  const encore = "2026-11-20 19:00";
  const opts = { nowMs: KO_NOUVEAU + 12 * H, frais: { date: encore }, fixture: fixture("NS", parisLocalToMs(encore)) };
  const r = run(relueB, Object.assign({ historyLock: PF.historyLocks([ligneB])[String(ID)] }, opts));
  assert.equal(r.status, "POSTPONED_CLOSED");
  assert.equal(r.match.rejoue, 1, "l'historique annule la ligne B, jamais A");
  assert.equal(PF.voidPostponedPrediction(ligneB, r.match, { today: "2026-11-11" }), true);
  assert.equal(ligneB.result, "void");
  const lockC = PF.historyLocks([ligneB, archiveA()])[String(ID)];
  assert.equal(lockC.rejoue, 1);
  const c = run(r.premiumRow, Object.assign({ historyLock: lockC }, opts));
  assert.equal(c.status, "FIRST_PUBLICATION");
  assert.equal(c.match.rejoue, 2);
});

test("historique.json et archive : chaque ligne relue dans la SIENNE (cle fixture_id + rejoue)", () => {
  const predictions = [
    { fixture_id: ID, rejoue: 1, result: "scheduled", redacted: true, date: "2026-11-10" },
    { fixture_id: ID, result: "void", reporte: true, redacted: true, date: "2026-10-28" },
  ];
  const archive = [
    { fixture_id: ID, rejoue: 0, prediction: "Plus de 2.5 buts", cote: "1.80", market: "over-25" },
    { fixture_id: ID, rejoue: 1, prediction: "Victoire Domicile", cote: "1.55", market: "home-win" },
  ];
  assert.equal(PREMIUM.rehydratePredictions(predictions, archive), 2);
  assert.equal(predictions[0].prediction, "Victoire Domicile");
  assert.equal(predictions[1].prediction, "Plus de 2.5 buts", "le pari annule garde le sien");
  // Archive sans colonne rejoue (avant 0073) : rejoue absent = 0, comme avant.
  const p = [{ fixture_id: 9, result: "scheduled", redacted: true }];
  assert.equal(PREMIUM.rehydratePredictions(p, [{ fixture_id: 9, prediction: "BTTS Oui" }]), 1);
  assert.equal(p[0].prediction, "BTTS Oui");
  // results/ du 10/11 : le pari du match rejoue, avec son propre resultat.
  const jour = MR.parisDuJour ? MR.parisDuJour("2026-11-10",
    [{ fixture_id: ID, rejoue: 1, type: "single", result: "win", score: "2-0", prediction: "Victoire Domicile", date: "2026-11-10" },
     { fixture_id: ID, type: "single", result: "void", reporte: true, date: "2026-10-28" }],
    [Object.assign(archiveA(), { rejoue: 0, prediction: "Plus de 2.5 buts", date: "2026-10-28" }), { fixture_id: ID, rejoue: 1, type: "single", result: "win", score: "2-0", prediction: "Victoire Domicile", date: "2026-11-10" }],
    () => "2026-11-10") : null;
  if (jour) {
    assert.equal(jour.length, 1);
    assert.equal(jour[0].prediction, "Victoire Domicile");
    assert.equal(jour[0].result, "win");
  }
});

test("combines : la jambe d'un match rejoue est reglee par la ligne de SON coup d'envoi", () => {
  const lignes = [
    Object.assign(archiveA(), { market: "over-25", published_at: "2026-10-28T06:39:49Z" }),
    { fixture_id: ID, rejoue: 1, type: "single", result: "win", score: "2-0", market: "home-win", published_at: "2026-11-10T07:00:00Z", kickoff_at: new Date(KO_NOUVEAU).toISOString() },
  ];
  const regler = BP.creerRegleur(lignes, []);
  assert.equal(regler(ID, "home-win", KO_NOUVEAU), "win", "ticket du 10/11");
  assert.equal(regler(ID, "over-25", KO_ORIGINE), "void", "ticket du 28/10 : jambe annulee, jamais reglee sur le match rejoue");
  assert.equal(regler(ID, "home-win"), "win", "sans coup d'envoi : derniere ligne, comme avant");
});

test("pipeline : colonne rejoue verifiee, gel branche, nouvelle ligne d'historique, archive en (fixture_id, rejoue)", () => {
  assert.match(WF, /var REJOUE_POSSIBLE=await archiveAColonneRejoue\(\);/);
  assert.match(WF, /historyLock:VERROUS_HISTORIQUE\[cleGel\]\|\|null,\n\s+rejouePossible:REJOUE_POSSIBLE\n\s+\}\);/);
  assert.ok(WF.indexOf("var REJOUE_POSSIBLE=await archiveAColonneRejoue();") < WF.indexOf("gel=PICK_FREEZE.freezeAnalysis(m,precedent,{"));
  const debut = WF.indexOf("async function updateHistorique(matchsData){");
  const fn = WF.slice(debut, WF.indexOf("var TRANSFER_CACHE_DAYS", debut));
  assert.match(fn, /var rejoueM=Number\(m\.rejoue\)>0\?Math\.floor\(Number\(m\.rejoue\)\):0;/);
  assert.match(fn, /histo\.predictions\.find\(function\(p\)\{return p\.fixture_id===m\.id&&\(Number\(p\.rejoue\)\|\|0\)===rejoueM;\}\)/);
  assert.match(fn, /if\(rejoueM\)\{ nouvelleLigne\.rejoue=rejoueM;/);
  // Vraie fonction d'archivage rejouee : avec la colonne, cle (fixture_id, rejoue), A et B envoyes tous les deux.
  const d = WF.indexOf("          var ARCHIVE_REJOUE_PROMESSE=null;");
  const f = WF.indexOf("          // GEL DU PARI (19/09/2026, lib/pick-freeze.js) : relit dans match_premium_data", d);
  assert.ok(d !== -1 && f > d);
  const src = WF.slice(d, f);
  const fabrique = (avecColonne) => {
    const appels = [], erreurs = [];
    const get = async (url) => { appels.push(url); return avecColonne ? [] : { code: "42703", message: "column predictions_archive.rejoue does not exist" }; };
    const up = async (host, chemin, lot) => { appels.push({ chemin, lot }); return { ok: true }; };
    const ecrire = new Function("SUPA_URL_PIPELINE", "SUPA_SERVICE_KEY", "rawHttpGetJson", "upsertJSON", "signalerEchecPersistance", "dedoublonnerParFixture", "sleep", "console",
      src + "\nreturn writePredictionsArchive;")("https://exemple.supabase.co", "cle", get, up, (z, m) => erreurs.push(m),
      (rows) => { const vus = {}; return rows.filter((r) => (vus[r.fixture_id] ? false : (vus[r.fixture_id] = true))); }, async () => {}, { log() {} });
    return { ecrire, appels, erreurs };
  };
  const lignes = [
    { fixture_id: ID, rejoue: 1, type: "single", result: "scheduled", prediction: "Victoire Domicile", date: "2026-11-10" },
    { fixture_id: ID, type: "single", result: "void", prediction: "Plus de 2.5 buts", date: "2026-10-28" },
  ];
  return (async () => {
    const avec = fabrique(true);
    await avec.ecrire(lignes);
    const envoi = avec.appels.find((a) => typeof a === "object");
    assert.equal(envoi.chemin, "/rest/v1/predictions_archive?on_conflict=fixture_id,rejoue");
    assert.deepEqual(envoi.lot.map((r) => [r.fixture_id, r.rejoue, r.prediction]), [[ID, 1, "Victoire Domicile"], [ID, 0, "Plus de 2.5 buts"]]);
    assert.deepEqual(avec.erreurs, []);
    // Sans la colonne : ancienne cle, la ligne du match rejoue n'est JAMAIS envoyee (elle ecraserait A), et c'est signale.
    const sans = fabrique(false);
    await sans.ecrire(lignes);
    const envoiSans = sans.appels.find((a) => typeof a === "object");
    assert.equal(envoiSans.chemin, "/rest/v1/predictions_archive?on_conflict=fixture_id");
    assert.deepEqual(envoiSans.lot.map((r) => [r.fixture_id, r.rejoue, r.prediction]), [[ID, undefined, "Plus de 2.5 buts"]]);
    assert.equal(sans.erreurs.length, 1);
    assert.match(sans.erreurs[0], /0073_predictions_archive_rejoue\.sql/);
  })();
});

test("migration 0073 : cle (fixture_id, rejoue), ligne d'origine intacte, correction publique par ligne", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/0073_predictions_archive_rejoue.sql"), "utf8");
  assert.match(sql, /add column if not exists rejoue smallint not null default 0/);
  assert.match(sql, /primary key \(fixture_id, rejoue\)/);
  assert.match(sql, /a\.fixture_id = new\.fixture_id and a\.rejoue = new\.rejoue/);
  assert.match(sql, /REJOUE_SANS_ANNULATION/);
  assert.match(sql, /and c\.rejoue = old\.rejoue/);
  assert.match(sql, /drop function if exists public\.corriger_resultat_archive\(bigint, text, text, text\);/);
  assert.match(sql, /NE PAS APPLIQUER sans l'accord de Clement/);
  // Aucune ligne existante modifiee : ni update ni delete de donnees.
  assert.doesNotMatch(sql.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/--.*$/gm, ""), /^\s*(update|delete)\s/im);
});
