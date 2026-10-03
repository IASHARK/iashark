"use strict";
// MATCH REPORTE APRES L'HEURE PREVUE (avocat du diable, ronde 4.2 ; corrige ronde 5,
// 30/09/2026). Preuve de l'avocat (avocat-r42/report-page-vs-archive.js) : match
// reporte de 2 jours, nouvelle date connue APRES l'heure d'origine. La page publiait
// un nouveau pari B (FIRST_PUBLICATION, KICKOFF_MOVED) ; l'historique et la base
// gardaient l'ancien pari A et le jugeaient sur le match rejoue. Regle prudente : aucun
// nouveau pari sur ce match, et A est annule (comme le statut PST). Un seul pari de
// reference pour ce match : A, annule.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PF = require("../lib/pick-freeze.js");
const { parisLocalToMs } = require("../lib/kickoff-guard.js");

const root = path.join(__dirname, "..");
const WF = fs.readFileSync(path.join(root, ".github/workflows/update-data.yml"), "utf8");

const ORIGINE = "2026-10-04 21:00", NOUVELLE = "2026-10-06 21:00";
const koO = parisLocalToMs(ORIGINE), koN = parisLocalToMs(NOUVELLE);
const H = 3600e3;

// Publication precedente (ligne match_premium_data) : pari A, fige le 03/10, coup d'envoi d'origine.
const precedent = () => ({ fixture_id: 123, pari_rec: "Plus de 2.5 buts", cote_rec: 1.9, model_probability: 72, market_id: "over-25",
  premium_fields: { conf: 7.2 }, raw_response: { pick_freeze: { frozen_at: "2026-10-03T08:00:00Z", kickoff: ORIGINE, public: { model_output_available: true, data_quality_score: 80 } } }, updated_at: "2026-10-03T08:00:00Z" });
// Calcul du jour : pari B, a la nouvelle date.
const frais = (date) => ({ id: 123, date: date || NOUVELLE, pari_rec: "Victoire Domicile", cote_rec: "1.70", model_probability: 74, market_id: "home-win", conf: 7.4, model_output_available: true, data_quality_score: 80 });
const fixture = (ko) => ({ fixture: { id: 123, status: { short: "NS" }, timestamp: Math.floor((ko || koN) / 1000) } });
const ligneDuJour = () => ({ fixture_id: 123, pari_rec: "Victoire Domicile", cote_rec: 1.7, market_id: "home-win", model_probability: 74, raw_response: { explanation_status: "OK" } });
// Ligne d'historique de A (kickoff_at = heure d'origine, jamais mise a jour par le pipeline).
const predA = () => ({ fixture_id: 123, match: "A vs B", type: "single", result: "scheduled", prediction: "Plus de 2.5 buts", cote: 1.9, model_probability: 72,
  moteur: "v3", moteur_version: "3.0.0", kickoff_at: new Date(koO).toISOString(), published_at: "2026-10-03T08:00:00Z" });

test("preuve de l'avocat rejouee : nouvelle date connue apres l'heure d'origine -> aucun pari B, A annule", () => {
  const now = koO + 12 * H; // 05/10 09:00 Paris, run du matin
  const fresh = frais();
  const r = PF.freezeAnalysis(fresh, precedent(), { nowMs: now, fixture: fixture(), premiumRow: ligneDuJour(), previousPublic: { id: 123, date: ORIGINE, model_output_available: true } });
  assert.equal(r.status, "POSTPONED_CLOSED", "avant la ronde 5 : FIRST_PUBLICATION (pari B publie)");
  assert.equal(r.reason, "KICKOFF_MOVED_AFTER_KICKOFF");
  // Page : aucun pari, ni dans le match ni dans la ligne premium.
  assert.equal(r.match.pari_rec, "");
  assert.equal(r.match.no_signal, true);
  assert.equal(r.match.no_signal_reason, PF.POSTPONED_REASON);
  assert.equal(r.match.is_free, false);
  assert.equal(r.match.cote_rec, undefined);
  assert.equal(r.match.model_probability, undefined);
  assert.equal(r.match.pick_frozen_at, undefined);
  assert.equal(r.premiumRow.pari_rec, "");
  assert.equal(r.premiumRow.cote_rec, null);
  // Entrees jamais modifiees.
  assert.equal(fresh.pari_rec, "Victoire Domicile");
  // L'accueil montre une ligne fermee « Match reporte » (etat closed de home-list.js,
  // voir le test des libelles plus bas), jamais « aucun signal ».
  assert.match(fs.readFileSync(path.join(root, "home-list.js"), "utf8"), /String\(m\.no_signal_reason\|\|''\)==='KICKOFF_POSTPONED'\)return \{state:'closed',postponed:true/);
  assert.match(PF.POSTPONED_REASON, /^KICKOFF_/);
  // Historique : A n'est pas realigne (aucun pari B) et il est annule, comme un match PST.
  const a = predA();
  assert.equal(PF.alignPendingPrediction(a, r.match, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: koN, nowMs: now }), false);
  assert.equal(PF.voidPostponedPrediction(a, r.match, { today: "2026-10-05" }), true);
  assert.equal(a.result, "void");
  assert.equal(a.score, null);
  assert.equal(a.resolved_date, "2026-10-05");
  assert.equal(a.prediction, "Plus de 2.5 buts", "le pari de reference reste A");
  // Le reglement du 07/10 ne touche plus A (il ne cherche que scheduled / pending).
  assert.equal(PF.voidPostponedPrediction(a, r.match, { today: "2026-10-07" }), false);
});

test("meme preuve avec la ligne d'historique transmise par le pipeline : meme resultat", () => {
  const now = koO + 12 * H;
  const lock = PF.historyLocks([predA()])["123"];
  assert.deepEqual(lock, { kickoffMs: koO, result: "scheduled" });
  const r = PF.freezeAnalysis(frais(), precedent(), { nowMs: now, fixture: fixture(), premiumRow: ligneDuJour(), historyLock: lock });
  assert.equal(r.status, "POSTPONED_CLOSED");
  assert.equal(r.match.pari_rec, "");
});

test("match passe par le statut PST (ligne premium videe) puis reprogramme : toujours aucun nouveau pari", () => {
  const now = koO + 30 * H;
  const videe = { fixture_id: 123, pari_rec: "", cote_rec: null, raw_response: { explanation_status: "SKIPPED_FIXTURE_NOT_UPCOMING" } };
  // Sans l'historique, c'etait une nouvelle premiere publication (pari B jamais suivi).
  assert.equal(PF.freezeAnalysis(frais(), videe, { nowMs: now, fixture: fixture(), premiumRow: ligneDuJour() }).status, "FIRST_PUBLICATION");
  // A deja annule par le reglement (statut PST) :
  const regle = PF.freezeAnalysis(frais(), videe, { nowMs: now, fixture: fixture(), premiumRow: ligneDuJour(), historyLock: { kickoffMs: koO, result: "void" } });
  assert.equal(regle.status, "POSTPONED_CLOSED");
  assert.equal(regle.reason, "HISTORY_SETTLED");
  assert.equal(regle.match.pari_rec, "");
  // A encore en attente :
  const attente = PF.freezeAnalysis(frais(), videe, { nowMs: now, fixture: fixture(), premiumRow: ligneDuJour(), historyLock: { kickoffMs: koO, result: "scheduled" } });
  assert.equal(attente.status, "POSTPONED_CLOSED");
  assert.equal(attente.reason, "HISTORY_LOCKED");
  const a = predA();
  assert.equal(PF.voidPostponedPrediction(a, attente.match, { today: "2026-10-06" }), true);
  assert.equal(a.result, "void");
});

test("nouvelle date connue AVANT l'heure d'origine : nouveau pari B, et l'historique le suit (inchange)", () => {
  const now = koO - 30 * H;
  const lock = { kickoffMs: koO, result: "scheduled" };
  const r = PF.freezeAnalysis(frais(), precedent(), { nowMs: now, fixture: fixture(), premiumRow: ligneDuJour(), historyLock: lock });
  assert.equal(r.status, "FIRST_PUBLICATION");
  assert.equal(r.reason, "KICKOFF_MOVED");
  assert.equal(r.match.pari_rec, "Victoire Domicile");
  const a = predA();
  assert.equal(PF.voidPostponedPrediction(a, r.match, { today: "2026-10-03" }), false);
  assert.equal(PF.alignPendingPrediction(a, r.match, { moteur: "v3", moteur_version: "3.0.0", kickoffMs: koN, nowMs: now }), true);
  assert.equal(a.prediction, "Victoire Domicile", "page et historique : le meme pari B");
});

test("simple retard (moins de 24 h) apres l'heure d'origine : le pari A reste, sur la page et dans l'historique", () => {
  const now = koO + 1 * H;
  const nouvelle = "2026-10-04 23:30";
  const r = PF.freezeAnalysis(frais(nouvelle), precedent(), { nowMs: now, fixture: fixture(parisLocalToMs(nouvelle)), premiumRow: ligneDuJour(), historyLock: { kickoffMs: koO, result: "scheduled" } });
  assert.equal(r.status, "FROZEN");
  assert.equal(r.match.pari_rec, "Plus de 2.5 buts");
  const a = predA();
  assert.equal(PF.voidPostponedPrediction(a, r.match, { today: "2026-10-04" }), false);
  assert.equal(a.result, "scheduled");
});

test("match normal (heure d'origine pas encore passee) : la ligne d'historique ne change rien", () => {
  const now = koO - 5 * H;
  const lock = { kickoffMs: koO, result: "scheduled" };
  const fige = PF.freezeAnalysis(frais(ORIGINE), precedent(), { nowMs: now, fixture: fixture(koO), premiumRow: ligneDuJour(), historyLock: lock });
  assert.equal(fige.status, "FROZEN");
  const premiere = PF.freezeAnalysis(frais(ORIGINE), null, { nowMs: now, fixture: fixture(koO), premiumRow: ligneDuJour(), historyLock: null });
  assert.equal(premiere.status, "FIRST_PUBLICATION");
  // Un pari masque non relu n'est jamais annule a l'aveugle ; un combine non plus.
  const ferme = PF.freezeAnalysis(frais(), precedent(), { nowMs: koO + 12 * H, fixture: fixture(), premiumRow: ligneDuJour() }).match;
  assert.equal(PF.voidPostponedPrediction(Object.assign(predA(), { redacted: true }), ferme, {}), false);
  assert.equal(PF.voidPostponedPrediction(Object.assign(predA(), { type: "combi" }), ferme, {}), false);
  // historyLocks : predictions simples, la plus recente d'abord ; sans kickoff_at -> null.
  const locks = PF.historyLocks([{ fixture_id: 7, type: "combi", result: "win" }, { fixture_id: 7, result: "scheduled" }, { fixture_id: 7, result: "win", kickoff_at: "2026-09-01T19:00:00Z" }]);
  assert.deepEqual(locks, { 7: { kickoffMs: null, result: "scheduled" } });
});

test("pipeline : la ligne d'historique est transmise au gel, le match ferme n'a pas de SAFE_PICK, A est annule avant l'archivage", () => {
  const gel = WF.indexOf("var VERROUS_HISTORIQUE=PICK_FREEZE.historyLocks(");
  assert.ok(gel !== -1);
  assert.ok(gel < WF.indexOf("gel=PICK_FREEZE.freezeAnalysis(m,precedent,{"));
  assert.match(WF, /JSON\.parse\(fs\.readFileSync\('historique\.json','utf8'\)\)\.predictions; \}catch\(e\)\{ return \[\]; \}/);
  assert.match(WF, /historyLock:VERROUS_HISTORIQUE\[cleGel\]\|\|null\n\s+\}\);/);
  assert.match(WF, /if\(gel\.status==='FROZEN'\|\|gel\.status==='FROZEN_CLOSED'\|\|gel\.status==='POSTPONED_CLOSED'\) GEL_FIGES\[cleGel\]=true;/);
  assert.ok(WF.indexOf("GEL_FIGES[cleGel]=true;") < WF.indexOf("RUN_OUTPUT_CANDIDATES=PICK_FREEZE.withoutFrozenCandidates(RUN_OUTPUT_CANDIDATES,GEL_FIGES);"));
  const debut = WF.indexOf("async function updateHistorique(matchsData){");
  const fn = WF.slice(debut, WF.indexOf("var TRANSFER_CACHE_DAYS", debut));
  const annule = fn.indexOf("try{ if(alreadyExists&&PICK_FREEZE.voidPostponedPrediction(alreadyExists,m,{today:TODAY}))");
  assert.ok(annule !== -1);
  assert.ok(annule < fn.indexOf("PICK_FREEZE.alignPendingPrediction(alreadyExists"));
  assert.ok(annule < fn.indexOf("await writePredictionsArchive(histo.predictions);"));
});

// ---------------------------------------------------------------------------
// MATCH REPORTE LONGTEMPS (avocat du diable, contre-controle de la ronde 5, 30/09/2026).
// Preuve avocat-r5/scenarios-report.js, S3b : report de 3 semaines, le pari A est sorti de
// historique.json (500 paris, environ 27 jours). Le 1er run du jour fermait bien le match,
// mais il vidait la ligne premium ; au 2e run, cette ligne « sans pari » donnait un nouveau
// pari C (FIRST_PUBLICATION, PREVIOUS_WITHOUT_PICK), candidat au match offert.
// Correction : la marque « reporte » de la ligne premium est relue (isPostponedMark), et la
// ligne du pari est relue dans predictions_archive (sans plafond) pour les matchs sortis
// de historique.json.

// Entrees EXACTES de la preuve de l'avocat (S3a / S3b).
const S3 = (() => {
  const ko = "2026-10-25 21:00";
  const fx = { fixture: { id: 4, status: { short: "NS" }, timestamp: Math.floor(parisLocalToMs(ko) / 1000), date: new Date(parisLocalToMs(ko)).toISOString() } };
  const prevA = { fixture_id: 4, pari_rec: "Plus de 2.5 buts", cote_rec: 1.9, model_probability: 72, market_id: "over-25", premium_fields: { conf: 7.2 },
    raw_response: { pick_freeze: { frozen_at: "2026-10-04T08:00:00Z", kickoff: "2026-10-04 21:00", public: { model_output_available: true, data_quality_score: 80 } } }, updated_at: "2026-10-04T08:00:00Z" };
  const fresh = { id: 4, date: ko, pari_rec: "Victoire Domicile", cote_rec: "1.70", model_probability: 74, market_id: "home-win", conf: 7.4, model_output_available: true, data_quality_score: 80 };
  const vide = { fixture_id: 4, pari_rec: "", cote_rec: null, market_id: null, raw_response: { explanation_status: "SKIPPED_KICKOFF_POSTPONED" } };
  const run = (previous, nowParis, historyLock) => PF.freezeAnalysis(Object.assign({}, fresh), previous, {
    nowMs: parisLocalToMs(nowParis), fixture: fx, premiumRow: { fixture_id: 4 }, previousPublic: null, historyLock: historyLock || null });
  return { prevA, vide, run };
})();

test("S3b rejouee : report de 3 semaines, A hors historique.json, 2e run du jour -> toujours aucun pari (plus de pari C)", () => {
  // Aucune ligne d'historique : A est sorti des 500 paris de historique.json.
  assert.equal(PF.historyLocks([])["4"], undefined);
  const r1 = S3.run(S3.prevA, "2026-10-25 08:00");
  assert.equal(r1.status, "POSTPONED_CLOSED");
  assert.equal(r1.reason, "KICKOFF_MOVED_AFTER_KICKOFF");
  const r2 = S3.run(S3.vide, "2026-10-25 12:00");
  assert.equal(r2.status, "POSTPONED_CLOSED", "avant la correction : FIRST_PUBLICATION, pari C « Victoire Domicile » publie");
  assert.equal(r2.reason, "PREVIOUS_POSTPONED");
  assert.equal(r2.match.pari_rec, "");
  assert.equal(r2.match.no_signal, true);
  assert.equal(r2.match.no_signal_reason, PF.POSTPONED_REASON);
  assert.equal(r2.match.is_free, false, "jamais le match offert");
  assert.equal(r2.match.pick_frozen_at, undefined);
  assert.equal(r2.premiumRow.pari_rec, "");
  // La marque reste dans la ligne premium ecrite par ce run : le run suivant la relit.
  assert.deepEqual(r2.premiumRow.raw_response, { explanation_status: PF.POSTPONED_MARK });
});

test("chaine de runs : la ligne premium ecrite par un run est relue par le suivant, le match reste ferme jusqu'au coup d'envoi", () => {
  // Ce que la base renvoie au run suivant : la ligne ecrite (premium_fields recalcule a null).
  const relue = (r) => Object.assign({}, r.premiumRow, { premium_fields: null });
  let r = S3.run(S3.prevA, "2026-10-23 08:00");
  assert.equal(r.status, "POSTPONED_CLOSED");
  for (const heure of ["2026-10-23 12:00", "2026-10-24 08:00", "2026-10-24 12:00", "2026-10-25 08:00", "2026-10-25 12:00", "2026-10-25 20:30"]) {
    r = S3.run(relue(r), heure);
    assert.equal(r.status, "POSTPONED_CLOSED", heure);
    assert.equal(r.match.pari_rec, "", heure);
  }
  // Apres le coup d'envoi : garde fermee, jamais un pari restaure (la ligne n'en a pas).
  const joue = PF.freezeAnalysis({ id: 4, date: "2026-10-25 21:00", pari_rec: "" }, relue(r), { nowMs: parisLocalToMs("2026-10-25 21:30"),
    fixture: { fixture: { id: 4, status: { short: "1H" }, timestamp: Math.floor(parisLocalToMs("2026-10-25 21:00") / 1000) } }, premiumRow: { fixture_id: 4 } });
  assert.equal(joue.status, "KICKOFF_CLOSED");
});

test("la marque « reporte » ne ferme que les matchs fermes comme reportes", () => {
  assert.equal(PF.POSTPONED_MARK, "SKIPPED_KICKOFF_POSTPONED");
  assert.equal(PF.isPostponedMark(S3.vide), true);
  assert.equal(PF.isPostponedMark({ pari_rec: "", raw_response: { explanation_status: "SKIPPED_KICKOFF_PASSED" } }), false);
  assert.equal(PF.isPostponedMark({ pari_rec: "", raw_response: { explanation_status: "SKIPPED_FIXTURE_NOT_UPCOMING" } }), false);
  assert.equal(PF.isPostponedMark({ pari_rec: "Plus de 2.5 buts", raw_response: { explanation_status: "SKIPPED_KICKOFF_POSTPONED" } }), false);
  assert.equal(PF.isPostponedMark(null), false);
  // Statut PST sans pari publie avant (aucune ligne d'historique) : premiere publication, inchange.
  const pst = { fixture_id: 4, pari_rec: "", raw_response: { explanation_status: "SKIPPED_FIXTURE_NOT_UPCOMING" } };
  assert.equal(S3.run(pst, "2026-10-25 12:00").status, "FIRST_PUBLICATION");
  // Ligne d'un autre match : jamais lue comme la marque de celui-ci.
  assert.equal(S3.run(Object.assign({}, S3.vide, { fixture_id: 99 }), "2026-10-25 12:00").status, "PREVIOUS_UNKNOWN");
});

test("predictions_archive complete historique.json : A relu dans l'archive ferme le match reporte longtemps", () => {
  const koA = parisLocalToMs("2026-10-04 21:00");
  const archiveA = (extra) => Object.assign({ fixture_id: 4, type: "single", result: "scheduled", kickoff_at: new Date(koA).toISOString().replace("Z", "+00:00") }, extra || {});
  // Match passe par PST (ligne premium videe par la garde, sans marque « reporte »), A hors du fichier.
  const pst = { fixture_id: 4, pari_rec: "", raw_response: { explanation_status: "SKIPPED_FIXTURE_NOT_UPCOMING" } };
  // A annule par le statut PST (archive sans kickoff_at : migration 0035 pas encore appliquee).
  const regle = PF.historyLocks([], [{ fixture_id: 4, type: "single", result: "void" }])["4"];
  assert.deepEqual(regle, { kickoffMs: null, result: "void" });
  const r1 = S3.run(pst, "2026-10-25 12:00", regle);
  assert.equal(r1.status, "POSTPONED_CLOSED");
  assert.equal(r1.reason, "HISTORY_SETTLED");
  // A encore en attente, heure d'origine connue (migration 0035) :
  const attente = PF.historyLocks([], [archiveA()])["4"];
  assert.deepEqual(attente, { kickoffMs: koA, result: "scheduled" });
  const r2 = S3.run(pst, "2026-10-25 12:00", attente);
  assert.equal(r2.status, "POSTPONED_CLOSED");
  assert.equal(r2.reason, "HISTORY_LOCKED");
  // Lecture de la ligne premium en echec : l'archive suffit a fermer le match.
  const r3 = S3.run(undefined, "2026-10-25 12:00", attente);
  assert.equal(r3.status, "POSTPONED_CLOSED");
  // Le fichier passe toujours avant l'archive ; les combines de l'archive sont ignores.
  const fichier = [Object.assign(predA(), { fixture_id: 4, result: "scheduled" })];
  assert.equal(PF.historyLocks(fichier, [archiveA({ result: "void" })])["4"].result, "scheduled");
  assert.deepEqual(PF.historyLocks([], [archiveA({ type: "combi", result: "win" })]), {});
});

test("pipeline : predictions_archive relue pour les matchs absents de historique.json, avant le gel (vraie fonction rejouee)", async () => {
  const debut = WF.indexOf("async function lireVerrousArchive(ids){");
  assert.ok(debut !== -1);
  const fin = WF.indexOf("\n          }\n", debut) + "\n          }\n".length;
  const src = WF.slice(debut, fin);
  // Rejeu : 1er lot refuse (colonne kickoff_at absente sans 0035) puis relu sans elle.
  const urls = [], journal = [];
  const fabrique = new Function("SUPA_URL_PIPELINE", "SUPA_SERVICE_KEY", "rawHttpGetJson", "console", src + "\nreturn lireVerrousArchive;");
  const rep = async (url) => {
    urls.push(url);
    if (/kickoff_at/.test(url)) return { code: "42703", message: "column predictions_archive.kickoff_at does not exist" };
    return [{ fixture_id: 4, type: "single", result: "void" }];
  };
  const lire = fabrique("https://exemple.supabase.co/", "cle-de-test", rep, { log: (s) => journal.push(s) });
  const lignes = await lire(["4", "4", "abc", 5]);
  assert.deepEqual(lignes, [{ fixture_id: 4, type: "single", result: "void" }]);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/rest\/v1\/predictions_archive\?select=fixture_id,type,result,kickoff_at&type=eq\.single&fixture_id=in\.\(4,5\)$/);
  assert.match(urls[1], /select=fixture_id,type,result&type=eq\.single&fixture_id=in\.\(4,5\)$/);
  assert.ok(!journal.some((s) => /::warning/.test(s)));
  // Archive illisible : avertissement, jamais bloquant.
  const panne = fabrique("https://exemple.supabase.co", "cle-de-test", async () => ({ __ia_network_error: true }), { log: (s) => journal.push(s) });
  assert.deepEqual(await panne(["4"]), []);
  assert.ok(journal.some((s) => /::warning title=Gel des paris::predictions_archive illisible/.test(s)));
  // Sans cle service role : aucune lecture.
  assert.deepEqual(await fabrique("", "", rep, { log() {} })(["4"]), []);
  // Branchement : lu apres historique.json, pour les matchs qui n'y sont pas, avant le gel.
  const iFichier = WF.indexOf("var VERROUS_FICHIER=PICK_FREEZE.historyLocks(HISTORIQUE_GEL);");
  const iArchive = WF.indexOf("var ARCHIVE_GEL=await lireVerrousArchive(allMatchsData.map(");
  const iVerrous = WF.indexOf("var VERROUS_HISTORIQUE=PICK_FREEZE.historyLocks(HISTORIQUE_GEL,ARCHIVE_GEL);");
  assert.ok(iFichier !== -1 && iArchive > iFichier && iVerrous > iArchive);
  assert.ok(iVerrous < WF.indexOf("gel=PICK_FREEZE.freezeAnalysis(m,precedent,{"));
  assert.match(WF.slice(iArchive, iVerrous), /filter\(function\(id\)\{ return id&&!VERROUS_FICHIER\[id\]; \}\)/);
});

test("libelle « Match reporte » : accueil et page match, dans les 7 langues", () => {
  const HL = require("../home-list.js");
  const H = Object.assign(HL.defaultHelpers(), { leagueName: () => "Ligue 1", heure: () => "21:00", matchTimestamp: () => koN, matchDay: () => "2026-10-06",
    translateMarket: () => null, marketIdLabel: () => null, hasReliableModelOutput: () => true, lien: (p) => "/" + p });
  const c = { isPro: true, freeMatchId: null, simulations: 5000, nowTs: koO + 12 * H, favorites: { has: () => false, list: () => [] }, collapsed: {}, lockedHref: "match" };
  const ligne = (raison) => HL.renderMatchRow({ id: 123, league_key: "ligue1", league: "Ligue 1", home: { n: "A" }, away: { n: "B" }, date: NOUVELLE,
    has_signal: false, no_signal: true, no_signal_reason: raison, pari_rec: "" }, c, H, 0);
  const reporte = ligne(PF.POSTPONED_REASON);
  assert.match(reporte, /is-closed/);
  assert.match(reporte, /Match reporté/);
  assert.match(reporte, /Aucun pronostic sur ce match/);
  assert.doesNotMatch(reporte, /Pronostic fermé|après le coup d’envoi|Pas de signal clair/);
  const ferme = ligne("KICKOFF_PASSED");
  assert.match(ferme, /Pronostic fermé/);
  assert.doesNotMatch(ferme, /Match reporté/);
  // Page match : meme libelle dans l'avis, le mur, la note et la FAQ.
  const MP = fs.readFileSync(path.join(root, "match-page.js"), "utf8");
  assert.match(MP, /raw&&raw\.no_signal_reason==='KICKOFF_POSTPONED'\n\s+\?t\('match_page\.avis_postponed','Match reporté : aucun pronostic sur ce match'\)/);
  // Match de selections reporte (avocat du diable, 01/10/2026) : « Match reporté », jamais le texte des selections.
  assert.match(MP, /if\(estSelection\(raw\)&&!\(raw&&raw\.no_signal_reason==='KICKOFF_POSTPONED'\)\)return t\('match_page\.avis_no_signal_selections'/);
  // 6 appels : avis (selection et sans pari), FAQ, « Le match en 30 secondes », mur (titre et note).
  assert.equal((MP.match(/(?<!function )sansPari\(raw\)/g) || []).length, 6, "avis (2), FAQ, match en 30 secondes, mur (titre et note)");
  assert.doesNotMatch(MP.replace(/function sansPari[\s\S]*?\n\}\n/, ""), /'match_page\.avis_no_signal'/, "un « pas de pari retenu » est reste en dur");
  // 7 langues : dictionnaire = parts, repli francais = dictionnaire francais.
  const cles = { home_list: ["postponed_short", "postponed_sub"], match_page: ["avis_postponed"] };
  const parts = { home_list: "homelist", match_page: "matchpage" };
  const valeurs = {};
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/" + loc + ".json"), "utf8"));
    for (const section of Object.keys(cles)) {
      const p = JSON.parse(fs.readFileSync(path.join(root, "i18n/parts/" + parts[section] + "." + loc + ".json"), "utf8"));
      for (const k of cles[section]) {
        assert.ok(typeof d[section][k] === "string" && d[section][k].trim(), loc + " : " + section + "." + k);
        assert.equal(p[section][k], d[section][k], loc + " : " + section + "." + k + " differe entre parts et dictionnaire");
        assert.doesNotMatch(d[section][k], /gagn|garanti|sûr|win|guarant|sure/i);
        valeurs[section + "." + k] = (valeurs[section + "." + k] || new Set()).add(d[section][k]);
      }
    }
  }
  const fr = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/fr.json"), "utf8"));
  assert.equal(fr.home_list.postponed_short, "Match reporté");
  assert.equal(fr.home_list.postponed_sub, "Aucun pronostic sur ce match");
  assert.equal(fr.match_page.avis_postponed, "Match reporté : aucun pronostic sur ce match");
  const HLsrc = fs.readFileSync(path.join(root, "home-list.js"), "utf8");
  assert.ok(HLsrc.includes("t('home_list.postponed_short','Match reporté')") && HLsrc.includes("t('home_list.postponed_sub','Aucun pronostic sur ce match')"));
  // Vraiment traduit : pas la meme chaine dans toutes les langues.
  for (const k of Object.keys(valeurs)) assert.ok(valeurs[k].size >= 5, k + " n'est pas traduit");
});
