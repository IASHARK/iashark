"use strict";
// MOTEUR « SCENARIO » (plan de Clement du 13/11/2026) : tests du RACCORD du site. Les formules vivent dans le depot prive
// (leurs tests aussi) ; ici un faux moteur suffit a verifier la collecte, le choix final par la cote, la note et le suivi.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const SD = require("../lib/scenario-donnees.js");
const SCN = require("../lib/scenario.js");
const FP = require("../lib/flux-paris.js");
const PR = require("../lib/pronostic.js");

function fixture(o) {
  o = o || {};
  return {
    fixture: { id: o.id || 100, referee: "M. Oliver, England", date: "2026-11-01T15:00:00+00:00", status: { short: o.st || "FT" } },
    league: { id: 39, season: 2026, round: "Regular Season - 10" },
    teams: { home: { id: 1, name: "Dom" }, away: { id: 2, name: "Ext" } }, goals: { home: 2, away: 1 },
    score: { fulltime: { home: 2, away: 1 }, halftime: { home: 1, away: 0 } },
    statistics: o.sansStats ? [] : [1, 2].map((id) => ({ team: { id: id }, statistics: [{ type: "Total Shots", value: 10 + id }, { type: "Shots on Goal", value: 4 }, { type: "Corner Kicks", value: id === 1 ? 6 : null },
      { type: "Fouls", value: 12 }, { type: "Offsides", value: null }, { type: "Yellow Cards", value: 2 }, { type: "Red Cards", value: null }, { type: "Ball Possession", value: "55%" }, { type: "expected_goals", value: "1.45" }] })),
    events: o.events || [
      { type: "Card", detail: "Yellow Card", time: { elapsed: 20 }, team: { id: 1 }, player: { id: 11 } },
      { type: "Card", detail: "Yellow Card", time: { elapsed: 30 }, team: { id: 2 }, player: { id: 21 } },
      { type: "Card", detail: "Second Yellow card", time: { elapsed: 70 }, team: { id: 2 }, player: { id: 21 } },
      { type: "Card", detail: "Yellow Card", time: { elapsed: 80 }, team: { id: 1 }, player: { id: 99 }, comments: "Coach" },
      { type: "Card", detail: "Yellow Card", time: { elapsed: 105 }, team: { id: 1 }, player: { id: 12 } },
      { type: "Goal", detail: "Penalty", time: { elapsed: 50 }, team: { id: 1 }, player: { id: 11 } },
    ],
    lineups: [1, 2].map((id) => ({ team: { id: id }, startXI: Array.from({ length: 11 }, (_, i) => ({ player: { id: id * 100 + i } })) })),
  };
}

test("ligne courte : faits du match seulement, cartons comptes « a la Bet365 », rien d'invente", () => {
  const L = SD.compacter(fixture());
  assert.strictEqual(L.id, 100); assert.strictEqual(L.ref, "m oliver"); assert.deepStrictEqual(L.ft, [2, 1]);
  assert.deepStrictEqual(L.s[0].slice(0, 5), [11, 4, 6, 12, 0]);
  assert.strictEqual(L.s[1][2], 0, "corner vide dans un bloc present = 0");
  assert.strictEqual(L.s[0][7], 55); assert.strictEqual(L.s[0][8], 1.45);
  // jaune = 1 ; 2e jaune qui donne le rouge = 1 + 2 = 3 au plus par joueur ; entraineur et apres la 90e : non comptes.
  assert.deepStrictEqual(L.ev.b365, [1, 3]);
  assert.deepStrictEqual(L.ev.pen, [1, 0]);
  assert.strictEqual(L.xi[0].length, 11);
  assert.strictEqual(SD.compacter(fixture({ st: "NS" })), null, "match non fini : jamais range");
  assert.strictEqual(SD.compacter(fixture({ sansStats: true })).s, null, "statistiques absentes : null, jamais 0");
});

test("quota : en-tete absent jamais lu comme zero, arret sous le plancher, cle jamais dans une erreur", async () => {
  let n = 0;
  const rep = (restant, corps) => ({ status: 200, headers: { get: (k) => (k === "x-ratelimit-requests-remaining" ? restant : null) }, json: async () => corps });
  const api = SD.client({ cle: "SECRET", fetch: async () => { n++; return n === 1 ? rep(null, { response: [] }) : rep("2500", { response: [] }); } });
  await api.get("/a"); assert.strictEqual(api.restant(), null);
  await api.get("/b"); assert.strictEqual(api.restant(), 2500);
  await assert.rejects(() => api.get("/c"), (e) => e.quota === true && !/SECRET/.test(e.message));
  assert.strictEqual(n, 2, "aucun appel de plus sous le plancher");
});

test("collecte : un match deja en base n'est jamais redemande", async () => {
  const demandes = [], ajoutes = [];
  const api = { get: async (c) => { demandes.push(c); return /team=/.test(c) ? [fixture({ id: 100 }), fixture({ id: 101 })] : [fixture({ id: 101 })]; }, appels: () => demandes.length, restant: () => 50000 };
  const mag = { manquants: async (ids) => ids.filter((i) => i !== 100), ajouter: async (l) => { ajoutes.push.apply(ajoutes, l); }, equipeVue: () => null, noterEquipe: () => {} };
  const r = await SD.collecterEquipes(api, mag, [1], { derniers: 22 });
  assert.strictEqual(r.matchs_nouveaux, 1);
  assert.deepStrictEqual(demandes, ["/fixtures?team=1&last=22", "/fixtures?ids=101"]);
  assert.strictEqual(ajoutes[0].id, 101);
});

test("regle scenario des marches : rembourse si nul ouvert ; cartons, mi-temps, pair / impair, joueurs fermes", () => {
  const R = { tousMarches: true, scenario: true };
  [80, 81, 82, 83].forEach((b) => assert.strictEqual(FP.raisonExclusion(b, "Cards", R), FP.RAISON_CARTONS_ATTENTE));
  assert.strictEqual(FP.raisonExclusion(2, "Home/Away", R), null);
  assert.ok(FP.raisonExclusion(2, "Home/Away", { tousMarches: true }), "hors regle scenario : toujours exclu");
  [[19, "Asian Handicap First Half"], [21, "Odd/Even"], [92, "Anytime Goal Scorer"], [13, "First Half Winner"], [54, "First 10 min Winner"]].forEach(([b, nom]) => assert.ok(FP.raisonExclusion(b, nom, R), nom));
  assert.strictEqual(FP.regler("F2:Home", { ft: [1, 1], statut: "FT" }), "rembourse");
  assert.strictEqual(FP.regler("F2:Home", { ft: [2, 1], statut: "FT" }), true);
  assert.strictEqual(FP.regler("F2:Away", { ft: [2, 1], statut: "FT" }), false);
  assert.ok(require("../lib/market-labels.js").fluxLibelle("F2:Home", { home: "Lyon", away: "Nice" }));
});

test("suivi : reglement depuis la ligne courte, fermeture d'une famille sous la moitie sur 50 paris", () => {
  const L = SD.compacter(fixture());
  assert.strictEqual(SCN.reglerSuivi("F45:Over 5.5", L, FP), "gagne");
  assert.strictEqual(SCN.reglerSuivi("F45:Over 6.5", L, FP), "perdu");
  assert.strictEqual(SCN.reglerSuivi("F80:Over 3.5", L, FP), "gagne");
  assert.strictEqual(SCN.reglerSuivi("F2:Away", L, FP), "perdu");
  const paris = (n, g, fam, jour) => Array.from({ length: n }, (_, i) => ({ famille: fam, resultat: i < g ? "gagne" : "perdu", publie_le: "2026-11-" + (jour || "10") + "T" + String(100000 + i).slice(1) }));
  const tous = paris(50, 24, "Corners").concat(paris(50, 25, "Buts"), paris(49, 10, "Tirs"), [{ famille: "Tirs", resultat: "rembourse", publie_le: "2026-11-12" }]);
  const e = SCN.etatFamilles(tous);
  assert.strictEqual(e.Corners.fermee, true, "24 sur 50 : fermee");
  assert.strictEqual(e.Buts.fermee, false, "25 sur 50 : la moitie, ouverte");
  assert.strictEqual(e.Tirs.fermee, false, "moins de 50 paris regles : pas encore jugee");
  // Blocs sans chevauchement : un mauvais bloc suivi de 30 bons paris reste juge sur le bloc complet ; un 2e bloc complet le remplace.
  assert.strictEqual(SCN.etatFamilles(tous.concat(paris(30, 30, "Corners", "12"))).Corners.fermee, true);
  assert.strictEqual(SCN.etatFamilles(tous.concat(paris(50, 30, "Corners", "12"))).Corners.fermee, false);
  // Reouverture par Clement : seuls les paris publies apres la date comptent, la famille repart de zero.
  assert.strictEqual(SCN.etatFamilles(tous, { depuis: { Corners: "2026-11-11T000000" } }).Corners, undefined);
});

// Releve Bet365 minimal : corners (deux lignes), buts, 1N2.
const RAW = { bookmakers: [{ name: "Bet365", bets: [
  { id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.90" }, { value: "Draw", odd: "3.60" }, { value: "Away", odd: "4.20" }] },
  { id: 45, name: "Corners Over Under", values: [{ value: "Over 9.5", odd: "1.80" }, { value: "Under 9.5", odd: "2.00" }, { value: "Over 10.5", odd: "2.05" }, { value: "Under 10.5", odd: "1.75" }] },
  { id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.75" }, { value: "Under 2.5", odd: "2.05" }, { value: "Over 3.5", odd: "3.10" }, { value: "Under 3.5", odd: "1.36" }] },
] }] };
const CFG = { choix_du_pari: { regle: "scenario", controle_pinnacle_tous_marches: true, ecart_max_pinnacle: 0.08 }, scenario: { seuil_chance: 0.58, ecart_max_bookmaker: 0.15, familles_fermees: ["Résultat / 1N2"] } };
function ctx(issues, fermees) {
  return { fluxPar: { 7: { raw: RAW } }, regleFlux: PR.regleFlux(CFG), scenarioPar: issues ? { 7: { issues: issues, version: "test" } } : {}, famillesFermees: fermees || [],
    fourchette: { cote_min: 1.7, cote_max: 3.5, marge_sans_agree: 0 }, ligues: {}, cles: null, couverture: () => null };
}
const M7 = { id: 7, home: { n: "Lyon", id: 1 }, away: { n: "Nice", id: 2 }, league_key: "ligue1" };
const I = (p, brut, fam, sf) => ({ p: p, brut: brut, note: 5.6, famille: fam, sous_famille: sf, faits: { stat: "corners", sous_famille: sf, attendu_total: 10.4 } });

test("choix final : parmi les paris juges probables, la plus belle cote ; la cote ne donne jamais la chance", () => {
  const issues = { "F45:Over 9.5": I(0.56, 0.64, "Corners", "total"), "F45:Over 10.5": I(0.53, 0.59, "Corners", "total"), "F5:Over 2.5": I(0.52, 0.57, "Buts", "total"), "F1:Home": I(0.6, 0.66, "Résultat", "1N2") };
  const b = PR.choisirPariFourchette(M7, ctx(issues), {});
  assert.ok(b, "un pari");
  assert.strictEqual(b.code_flux, "F45:Over 10.5", "deux corners probables : la plus belle cote (2,05), pas la plus sure");
  assert.strictEqual(b.cote, 2.05);
  assert.strictEqual(b.chance, 53, "chance affichee = chance recalee du moteur, pas celle de la cote");
  assert.strictEqual(b.scenario.note, 5.6);
  assert.strictEqual(b.source_chance, "modele");
  // « Over 2.5 » : chance du moteur 0,57 sous le seuil 0,58 ; « Home » : famille fermee par le rejeu.
  const c = PR.evaluerCandidatsScenario(M7, ctx(issues), FP.selectionsDuMatch(RAW, { match: M7, regle: PR.regleFlux(CFG) }).selections).map((x) => x.code_flux).sort();
  assert.deepStrictEqual(c, ["F45:Over 10.5", "F45:Over 9.5"]);
});

test("choix final : securite d'ecart, famille fermee par le suivi, match sans scenario = pas de pari", () => {
  // Over 10.5 : Bet365 sans marge ~ 46 % ; moteur a 0,62 -> ecart 16 points > 15 : ecarte (information manquante probable).
  const loin = { "F45:Over 10.5": I(0.55, 0.62, "Corners", "total"), "F45:Over 9.5": I(0.56, 0.64, "Corners", "total") };
  assert.strictEqual(PR.choisirPariFourchette(M7, ctx(loin), {}).code_flux, "F45:Over 9.5");
  assert.strictEqual(PR.choisirPariFourchette(M7, ctx(loin, ["Corners"]), {}), null, "famille fermee toute seule par le suivi");
  assert.strictEqual(PR.choisirPariFourchette(M7, ctx(loin, ["Corners / total"]), {}), null, "sous-famille fermee");
  assert.strictEqual(PR.choisirPariFourchette(M7, ctx(null), {}), null, "moteur absent : jamais une autre regle en secours");
  // Cote hors fourchette (1,36) : jamais prise, meme tres probable.
  assert.strictEqual(PR.choisirPariFourchette(M7, ctx({ "F5:Under 3.5": I(0.74, 0.75, "Buts", "total") }), {}), null);
});

test("note et risque : rien qui depende de la cote", () => {
  assert.strictEqual(PR.risqueScenario(70), "FAIBLE"); assert.strictEqual(PR.risqueScenario(56), "MODERE"); assert.strictEqual(PR.risqueScenario(52), "ELEVE");
  assert.strictEqual(PR.risqueScenario.length, 1);
});

test("calcul : le faux moteur recoit les matchs gardes et rend chance, chance du moteur, note et faits par issue", () => {
  let lignesVues = null;
  const moteur = { version: "faux", P: {}, M: {
    preparer: (l) => { lignesVues = l; return {}; }, evaluer: (idx, m) => ({ ok: m.h !== 9, raison: "moins de 12 matchs connus", att: { corners: [5.4, 5] }, ouvert: { corners: true } }),
    famille: (b) => (b === 45 ? { famille: "Corners", sous_famille: "total" } : null), chanceBrute: () => 0.62, chance: () => 0.55, solidite: () => 1, note: () => 5.8, faits: () => ({ stat: "corners" }) } };
  const out = SCN.calculer(moteur, [{ id: 1 }], {}, [{ id: 7, t: 1, h: 1, a: 2, raw: RAW, nomDom: "Lyon", nomExt: "Nice" }, { id: 8, t: 1, h: 9, a: 2, raw: RAW }], { FP: FP, regle: PR.regleFlux(CFG) });
  assert.deepStrictEqual(lignesVues, [{ id: 1 }]);
  assert.deepStrictEqual(Object.keys(out[7].issues).sort(), ["F45:Over 10.5", "F45:Over 9.5", "F45:Under 10.5", "F45:Under 9.5"]);
  assert.deepStrictEqual(out[7].issues["F45:Over 9.5"], { p: 0.55, brut: 0.62, note: 5.8, famille: "Corners", sous_famille: "total", faits: { stat: "corners" } });
  assert.deepStrictEqual(out[7].attendus, { corners: [5.4, 5] });
  assert.deepStrictEqual(out[8].issues, {}); assert.ok(out[8].ferme);
});

test("depot public : aucune formule du moteur, config sur la regle scenario, dossier prive ignore par git", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "marches-pari.json"), "utf8"));
  assert.strictEqual(cfg.choix_du_pari.regle, "scenario");
  assert.ok(cfg.scenario.seuil_chance >= 0.5 && cfg.scenario.seuil_chance <= 0.7);
  assert.ok(cfg.scenario.ecart_max_bookmaker > 0 && cfg.scenario.ecart_max_bookmaker <= 0.2);
  assert.ok(/^\.moteur-scenario-prive\/$/m.test(fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8")));
  assert.strictEqual(SCN.charger(path.join(__dirname, "dossier-qui-n-existe-pas")), null, "moteur absent : null, jamais une erreur");
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "scenario")), "le dossier scenario/ ne doit jamais entrer dans le depot public");
});
