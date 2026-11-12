"use strict";
// Petites ligues Bet365, chemin leger (lib/petites-ligues.js) : perimetre, controles qualite, zero donnee du futur,
// meme regle de pari que le site (1,70-3,50, Bet365), gel du pari, suivi de cloture, reglement sur le score.
const test = require("node:test");
const assert = require("node:assert/strict");
const PL = require("../lib/petites-ligues.js");
const LIGUES = require("../config/leagues.json");
const MARCHES = require("../config/marches-pari.json");
const CFG = require("../config/petites-ligues.json");

const NOW = Date.parse("2026-11-12T10:00:00Z");
const KO = Date.parse("2026-11-14T15:00:00Z");
const c = PL.lireConfig(CFG);
const exclues = PL.competitionsExclues(LIGUES);

function league(id, name, country) { return { id: id, name: name, country: country || "Italy", season: 2026 }; }
function fixture(o) {
  o = o || {};
  const ko = o.ko || KO;
  return {
    fixture: { id: o.id || 101, date: new Date(ko).toISOString().replace("Z", "+00:00"), timestamp: ko / 1000, status: { short: o.statut || "NS" } },
    league: o.league || league(138, "Serie C - Girone A"),
    teams: { home: { id: 1, name: "Alpha", winner: null }, away: { id: 2, name: "Beta", winner: null } },
    score: o.score || { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
    goals: o.goals || { home: null, away: null },
  };
}
function bets365(o) {
  o = o || {};
  return [
    { id: 1, name: "Match Winner", values: [{ value: "Home", odd: o.h || "2.10" }, { value: "Draw", odd: o.d || "3.30" }, { value: "Away", odd: o.a || "3.40" }] },
    { id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: o.o25 || "1.95" }, { value: "Under 2.5", odd: o.u25 || "1.85" }, { value: "Over 1.5", odd: "1.30" }, { value: "Under 1.5", odd: "3.40" }] },
    { id: 12, name: "Double Chance", values: [{ value: "Home/Draw", odd: "1.30" }, { value: "Home/Away", odd: "1.33" }, { value: "Draw/Away", odd: "1.65" }] },
  ];
}
function odds(o) {
  o = o || {};
  const ko = o.ko || KO;
  return [{ league: o.league || league(138, "Serie C - Girone A"), fixture: { id: o.id || 101, timezone: "Europe/Paris", date: "x", timestamp: (o.tsOdds || ko) / 1000 }, update: o.maj || "2026-11-12T09:00:00+00:00",
    bookmakers: [{ id: 8, name: "Bet365", bets: o.bets || bets365(o) }] }].concat(o.pinnacle ? [{ league: o.league || league(138, "Serie C - Girone A"), fixture: { id: o.id || 101, timestamp: ko / 1000 }, update: o.majPin || "2026-11-12T09:00:00+00:00", bookmakers: [{ id: 4, name: "Pinnacle", bets: o.pinnacle }] }] : []);
}
const opts = { config: CFG, configLigues: LIGUES, marchesPari: MARCHES };

test("perimetre : competitions du site, retirees, feminines, jeunes, amicaux exclues ; vraies petites ligues gardees", () => {
  assert.equal(PL.motifExclusion(league(39, "Premier League", "England"), c, exclues), "competition_du_site");
  assert.equal(PL.motifExclusion(league(41, "League One", "England"), c, exclues), "competition_retiree");
  assert.equal(PL.motifExclusion(league(239, "Primera A", "Colombia"), c, exclues), "competition_retiree");
  assert.equal(PL.motifExclusion(league(44, "FA WSL", "England"), c, exclues), "competition_douteuse");
  assert.equal(PL.motifExclusion(league(254, "NWSL Women", "USA"), c, exclues), "competition_douteuse");
  assert.equal(PL.motifExclusion(league(999, "UEFA U19 Championship - Qualification", "World"), c, exclues), "competition_douteuse");
  assert.equal(PL.motifExclusion(league(998, "Reserve League", "Argentina"), c, exclues), "competition_douteuse");
  assert.equal(PL.motifExclusion(league(10, "Friendlies", "World"), c, exclues), "competition_exclue");
  assert.equal(PL.motifExclusion(league(138, "Serie C - Girone A"), c, exclues), null);
  assert.equal(PL.motifExclusion(league(109, "II Liga - East", "Poland"), c, exclues), null);
  assert.equal(PL.motifExclusion(league(72, "Serie B", "Brazil"), c, exclues), null);
});

test("controles : reporte, commence, imminent, fuseau incoherent, cote du futur ou d'apres coup d'envoi, cotes aberrantes", () => {
  const e = (o) => PL.indexerCotes(odds(o)).cotes.get(101);
  assert.equal(PL.controler(e(), fixture(), NOW, c), null);
  assert.equal(PL.controler(e(), null, NOW, c), "absent_du_programme");
  assert.equal(PL.controler(e(), fixture({ statut: "PST" }), NOW, c), "FIXTURE_NOT_UPCOMING");
  assert.equal(PL.controler(e(), fixture({ ko: NOW - 60000 }), NOW, c), "KICKOFF_PASSED");
  assert.equal(PL.controler(e(), fixture({ statut: "1H" }), NOW, c), "FIXTURE_NOT_UPCOMING");
  assert.equal(PL.controler(e({ ko: NOW + 10 * 60000 }), fixture({ ko: NOW + 10 * 60000 }), NOW, c), "KICKOFF_IMMINENT");
  assert.equal(PL.controler(e({ tsOdds: KO + 3600e3 }), fixture(), NOW, c), "horaire_incoherent");
  assert.equal(PL.controler(e({ maj: "2026-11-12T12:00:00+00:00" }), fixture(), NOW, c), "cote_du_futur");
  assert.equal(PL.controler(e({ maj: "pas une date" }), fixture(), NOW, c), "cote_sans_heure");
  assert.equal(PL.controler(e({ h: "1.20", d: "1.20", a: "1.20" }), fixture(), NOW, c), "cotes_aberrantes");
  assert.equal(PL.controler(e({ h: "5", d: "5", a: "5" }), fixture(), NOW, c), "cotes_aberrantes");
  assert.equal(PL.controler(e({ bets: bets365().slice(1) }), fixture(), NOW, c), "sans_1n2_bet365");
});

test("meme regle que le site : pari Bet365 dans 1,70-3,50, jamais sous 1,70, etiquette « en test », horodate", () => {
  const arch = {};
  const n = PL.lancer(arch, [fixture()], odds(), NOW, opts);
  assert.equal(n.nouveaux_paris, 1);
  const ent = arch["2026-11-14"].matchs["101"];
  assert.equal(ent.fiabilite, "en_test");
  assert.equal(ent.pari.fiabilite, "en_test");
  assert.equal(ent.pari.bookmaker, "Bet365");
  assert.ok(ent.pari.cote >= 1.7 && ent.pari.cote <= 3.5, "cote " + ent.pari.cote);
  assert.match(ent.pari.code, /^F\d+:/);
  assert.equal(ent.pari.cote_maj_bookmaker, "2026-11-12T09:00:00+00:00");
  assert.equal(ent.pari.cote_lue_a, new Date(NOW).toISOString());
  assert.equal(ent.pari.fige_a, new Date(NOW).toISOString());
  // Toutes les cotes sous 1,70 : aucun pari (jamais de repli dessous).
  const arch2 = {};
  const basses = [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.25" }, { value: "Draw", odd: "6.00" }, { value: "Away", odd: "11.00" }] },
    { id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.50" }, { value: "Under 2.5", odd: "2.50" }] }];
  PL.lancer(arch2, [fixture()], odds({ bets: basses }), NOW, opts);
  const e2 = arch2["2026-11-14"].matchs["101"];
  if (e2.pari) assert.ok(e2.pari.cote >= 1.7, "jamais sous 1,70 : " + e2.pari.cote);
});

test("gel : un pari fige ne change jamais ; la cote de la meme issue est suivie jusqu'au coup d'envoi, jamais apres", () => {
  const arch = {};
  PL.lancer(arch, [fixture()], odds(), NOW, opts);
  const avant = JSON.stringify(arch["2026-11-14"].matchs["101"].pari);
  const plusTard = NOW + 3600e3 * 24;
  PL.lancer(arch, [fixture()], odds({ h: "1.80", d: "3.60", a: "4.50", o25: "2.40", u25: "1.55", maj: new Date(plusTard - 60000).toISOString() }), plusTard, opts);
  const ent = arch["2026-11-14"].matchs["101"];
  assert.equal(JSON.stringify(ent.pari), avant);
  assert.equal(ent.cloture.cote_lue_a, new Date(plusTard).toISOString());
  const apres = KO + 60000;
  const clo = JSON.stringify(ent.cloture);
  PL.lancer(arch, [fixture({ statut: "1H" })], odds({ maj: new Date(KO + 30000).toISOString() }), apres, opts);
  assert.equal(JSON.stringify(ent.cloture), clo);
  assert.equal(JSON.stringify(ent.pari), avant);
});

test("Pinnacle releve apres maintenant ou apres le coup d'envoi : jamais utilise pour le controle", () => {
  const pin = [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "2.05" }, { value: "Draw", odd: "3.40" }, { value: "Away", odd: "3.60" }] }];
  const e = PL.indexerCotes(odds({ pinnacle: pin, majPin: "2026-11-12T11:00:00+00:00" })).cotes.get(101);
  assert.deepEqual(PL.bookmakersUtilisables(e, fixture(), NOW, c).map((b) => b.id), [8]);
  const e2 = PL.indexerCotes(odds({ pinnacle: pin })).cotes.get(101);
  assert.deepEqual(PL.bookmakersUtilisables(e2, fixture(), NOW, c).map((b) => b.id), [8, 4]);
});

test("selections nationales : seulement 1N2 et double chance, comme le site", () => {
  const lg = league(36, "Africa Cup of Nations - Qualification", "World");
  assert.equal(PL.estSelectionNationale(lg, c), true);
  assert.equal(PL.estSelectionNationale(league(17, "AFC Champions League", "World"), c), false);
  const arch = {};
  PL.lancer(arch, [fixture({ league: lg })], odds({ league: lg }), NOW, opts);
  const p = arch["2026-11-14"].matchs["101"].pari;
  assert.ok(p, "un pari 1N2 ou double chance dans la fourchette existe");
  assert.ok([1, 12].indexOf(p.bet_id) !== -1, "bet " + p.bet_id);
  assert.equal(p.selection_nationale, true);
});

test("doublons : meme match, meme bookmaker -> la mise a jour la plus recente seulement", () => {
  const a = odds({ maj: "2026-11-12T08:00:00+00:00", h: "2.50" })[0], b = odds({ maj: "2026-11-12T09:30:00+00:00", h: "2.20" })[0];
  const r = PL.indexerCotes([a, b]);
  assert.equal(r.doublons, 1);
  assert.equal(r.cotes.get(101).maj["8"], "2026-11-12T09:30:00+00:00");
  assert.equal(PL.marge1n2(r.cotes.get(101), 8) !== null, true);
});

test("reglement : sur le score seulement, apres le match ; reporte = annule ; jamais avant l'heure", () => {
  const arch = {};
  PL.lancer(arch, [fixture()], odds(), NOW, opts);
  const ent = arch["2026-11-14"].matchs["101"];
  const fini = fixture({ statut: "FT", score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 } }, goals: { home: 2, away: 1 } });
  assert.equal(PL.regler(arch, [fini], KO + 60 * 60000, CFG).regles, 0); // trop tot
  assert.equal(ent.resultat, null);
  assert.equal(PL.regler(arch, [fini], KO + 3 * 3600e3, CFG).regles, 1);
  assert.ok(["gagne", "perdu", "rembourse"].indexOf(ent.resultat.issue) !== -1, ent.resultat.issue);
  const arch2 = {};
  PL.lancer(arch2, [fixture()], odds(), NOW, opts);
  PL.regler(arch2, [fixture({ statut: "PST" })], KO + 3 * 3600e3, CFG);
  assert.equal(arch2["2026-11-14"].matchs["101"].resultat.issue, "annule");
  const r = PL.resumer(arch);
  assert.equal(r.avec_pari, 1);
  assert.equal(r.regles, 1);
});

test("isolement : le chemin leger ne touche a aucun fichier du site", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "lib", "petites-ligues.js"), "utf8");
  assert.doesNotMatch(src, /writeFile|data-home|data\.json|supabase/i);
});
