"use strict";
// REPLI « FORME » DES MATCHS DE COUPE (lib/repli-forme.js, demande de Clement du 28/10/2026) : un match de coupe resté
// sans pari recoit un pari tire des 10 derniers matchs des clubs et de l'ecart de division, seulement sur une cote
// REELLE entre 1,40 et la borne du repli ; jamais sous 1,40, jamais une cote inventee, jamais un pari fige modifie,
// jamais un texte qui contredit le pari ; zero fuite du futur.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RF = require("../lib/repli-forme.js");
const P = require("../lib/pronostic.js");
const MP = require("../lib/marches-paris.js");
const CFG = require("../config/leagues.json");

const KO = "2026-10-28T19:00:00+00:00";
// Un match API-Football fini (score du temps reglementaire).
let idMatch = 1;
function fx(date, ligue, dom, ext, bd, be, opts) {
  opts = opts || {};
  return { fixture: { id: idMatch++, date: date, status: { short: opts.statut || "FT" } }, league: { id: ligue, name: opts.nom || "Ligue " + ligue },
    teams: { home: { id: dom, name: "Club " + dom }, away: { id: ext, name: "Club " + ext } },
    goals: { home: bd + (opts.prol || 0), away: be }, score: { fulltime: { home: bd, away: be } } };
}
// 10 matchs d'un club dans un championnat (buts marques / encaisses par match), du 01/09 au 10/10.
function saison(club, ligue, bm, be) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const d = "2026-09-" + String(1 + i * 3).padStart(2, "0") + "T18:00:00+00:00";
    out.push(i % 2 ? fx(d, ligue, club, 9000 + i, bm, be) : fx(d, ligue, 9000 + i, club, be, bm));
  }
  return out;
}
// Releve de cotes API-Football (un bookmaker de reference, bet365).
function releve(bets) {
  return { bookmakers: [{ name: "Bet365", bets: bets }] };
}
const B = {
  resultat: (h, n, a) => ({ id: 1, name: "Match Winner", values: [{ value: "Home", odd: h }, { value: "Draw", odd: n }, { value: "Away", odd: a }] }),
  buts: (lignes) => ({ id: 5, name: "Goals Over/Under", values: lignes.flatMap((l) => [{ value: "Over " + l[0], odd: l[1] }, { value: "Under " + l[0], odd: l[2] }]) }),
  ext: (lignes) => ({ id: 17, name: "Total - Away", values: lignes.flatMap((l) => [{ value: "Over " + l[0], odd: l[1] }, { value: "Under " + l[0], odd: l[2] }]) }),
};
// Petit club de Tercera RFEF (niveau 5) qui recoit un club de Liga (niveau 1), Coupe du Roi.
function matchCoupe(extra) {
  return Object.assign({ id: 777, league_id: 143, league_key: "copa_del_rey", date: "2026-10-28 20:00", status: "NS",
    home: { n: "Petit Club", id: 1 }, away: { n: "Gros Club", id: 2 }, data_quality_score: 15, model_output_available: false,
    no_signal: true, no_signal_reason: "AUCUN_MARCHE_AVEC_COTE_REELLE", no_signal_label: "Aucun signal clair sur ce match", pari_rec: "", market_id: null }, extra || {});
}
const DONNEES = { dom: saison(1, 445, 2, 1), ext: saison(2, 140, 1.6, 1) };
const ODDS = releve([B.resultat("9.00", "5.50", "1.30"), B.buts([[1.5, "1.18", "4.80"], [2.5, "1.55", "2.40"], [3.5, "2.30", "1.60"], [4.5, "2.60", "1.50"]]), B.ext([[1.5, "1.62", "2.25"], [2.5, "2.60", "1.48"]])]);
const opts = (extra) => Object.assign({ configLigues: CFG, figes: {}, koIso: { 777: KO }, donnees: { 777: Object.assign({}, DONNEES, { odds: ODDS }) }, nowIso: "2026-10-28T06:00:00Z" }, extra || {});

test("parametres : lus dans config/leagues.json#fiabilite.repli_forme ; jamais sous 1,40, jamais au-dessus de la borne du repli", () => {
  const p = RF.lireParametres(CFG);
  assert.ok(p, "repli_forme absent ou illisible");
  assert.equal(p.cote_min, CFG.fiabilite.fourchette_pari.cote_min);
  assert.ok(p.cote_min >= 1.4);
  assert.ok(p.cote_max <= CFG.fiabilite.fourchette_pari.cote_max);
  assert.deepEqual(p.competitions.slice().sort(), ["copa_del_rey", "coppa_italia", "coupe_de_france", "dfb_pokal", "efl_cup", "fa_cup"]);
  // Chaque competition du repli est une coupe nationale analysee, de l'un des 5 pays de la table des divisions.
  p.competitions.forEach((k) => {
    const l = CFG.leagues.find((x) => x.key === k);
    assert.ok(l, k);
    assert.ok(RF.PAYS_COUPE[l.apiFootballId], k + " sans pays");
  });
});

test("zero fuite du futur : seuls les matchs officiels joues AVANT le coup d'envoi comptent (amicaux exclus, 90 minutes)", () => {
  const avant = fx("2026-10-20T18:00:00+00:00", 140, 2, 50, 1, 0);
  const meme = fx(KO, 140, 2, 51, 7, 0); // meme heure : exclu
  const apres = fx("2026-10-30T18:00:00+00:00", 140, 2, 52, 9, 0);
  const amical = fx("2026-10-10T18:00:00+00:00", 667, 2, 53, 8, 0, { nom: "Friendlies Clubs" });
  const prol = fx("2026-10-01T18:00:00+00:00", 143, 2, 54, 1, 1, { statut: "AET", prol: 2 });
  const enCours = fx("2026-10-27T18:00:00+00:00", 140, 2, 55, 3, 0, { statut: "2H" });
  const ms = RF.matchsAvant([apres, meme, avant, amical, prol, enCours], 2, KO);
  assert.deepEqual(ms.map((x) => x.id), [avant.fixture.id, prol.fixture.id]);
  assert.equal(ms[1].bd, 1, "prolongation : le score du temps reglementaire");
  const f = RF.formeClub([apres, meme, avant, amical, prol], 2, KO, 10);
  assert.equal(f.n, 2);
  assert.equal(f.bm, 1);
});

test("division : le championnat le plus joue dans les derniers matchs ; inconnu -> un niveau sous la plus basse division du pays", () => {
  const d = RF.divisionDuClub(DONNEES.dom.concat([fx("2026-10-05T18:00:00+00:00", 143, 1, 60, 3, 0)]), 1, KO, "ES");
  assert.deepEqual([d.ligue, d.niveau, d.connue], [445, 5, true]);
  assert.equal(RF.divisionDuClub(DONNEES.ext, 2, KO, "ES").niveau, 1);
  const inconnu = RF.divisionDuClub([fx("2026-10-05T18:00:00+00:00", 143, 3, 61, 2, 0)], 3, KO, "ES");
  assert.deepEqual([inconnu.niveau, inconnu.connue], [RF.NIVEAU_INCONNU.ES, false]);
  // Tables : 5 pays, niveaux 1 et 2 presents partout.
  ["ES", "DE", "EN", "IT", "FR"].forEach((pays) => [1, 2].forEach((n) => assert.ok(Object.values(RF.NIVEAUX).some((x) => x.pays === pays && x.niveau === n), pays + " " + n)));
});

test("ecart de division : le club de la division la plus haute marque plus et encaisse moins", () => {
  const p = RF.lireParametres(CFG);
  const fD = RF.formeClub(DONNEES.dom, 1, KO, 10), fE = RF.formeClub(DONNEES.ext, 2, KO, 10);
  const meme = RF.butsAttendus(fD, fE, 1, 1, p), ecart = RF.butsAttendus(fD, fE, 5, 1, p);
  assert.ok(ecart.ext > meme.ext && ecart.dom < meme.dom);
  const pr = RF.probabilites(ecart);
  assert.ok(pr["away-win"] > pr["home-win"]);
  assert.ok(Math.abs(pr["home-win"] + pr["draw"] + pr["away-win"] - 100) < 0.01);
  assert.ok(Math.abs(pr["over-25"] + pr["under-25"] - 100) < 0.01);
});

test("publication : pari sur une cote reelle de la fourchette, chance = le plus bas entre la forme et la cote sans marge, « en test »", () => {
  const m = matchCoupe();
  const row = { fixture_id: 777, raw_response: {} };
  const r = RF.publierRepli([m], [row], opts());
  assert.equal(r.publies, 1, JSON.stringify(r));
  const p = RF.lireParametres(CFG);
  const c = Number(m.cote_rec);
  assert.ok(c >= 1.4 && c >= p.cote_min && c <= p.cote_max, "cote " + c);
  assert.ok(RF.MARCHES_REPLI.includes(m.market_id));
  assert.ok(!p.marches_exclus.includes(m.market_id), "marche ecarte par la mesure");
  assert.equal(m.pari_rec, MP.CATALOGUE[m.market_id].marche);
  assert.equal(m.no_signal, false);
  assert.equal(m.no_signal_label, "");
  assert.equal(m.no_signal_reason, undefined);
  assert.equal(m.model_output_available, true);
  assert.equal(m.pronostic.fiabilite, "en test");
  assert.equal(m.pronostic.voie, "repli_forme");
  assert.equal(m.pronostic.selection, false);
  assert.ok(!m.selection_iashark);
  assert.ok(m.pronostic.chance <= Math.round(m.pronostic.sans_marge) && m.pronostic.chance <= Math.round(m.pronostic.base_forme.chance_forme));
  assert.equal(m.model_probability, m.pronostic.chance);
  assert.equal(m.cote_source, "indicative");
  assert.equal(m.cote_bookmaker, null);
  // Ligne premium : meme pari, gel pose (un calcul suivant le restaure tel quel).
  assert.deepEqual([row.pari_rec, row.market_id, row.cote_rec], [m.pari_rec, m.market_id, c]);
  assert.ok(row.raw_response.pick_freeze && row.raw_response.pick_freeze.frozen_at === m.pick_frozen_at);
  assert.equal(P.motifExceptionGel({ pari_rec: m.pari_rec, market_id: m.market_id, cote_rec: m.cote_rec }), null, "le gel garde ce pari");
  // La chance affichee est ensuite alignee comme tout pari (corrections_chance), jamais plus haute.
  const avant = m.model_probability;
  P.alignerChancesAffichees([m], [row], { configLigues: CFG, figes: {} });
  assert.ok(m.model_probability <= avant);
});

test("reglement : chaque marche du repli se regle comme il se lit (lib/resolvers.js, temps reglementaire)", () => {
  const R = require("../lib/resolvers.js");
  const scores = [[0, 0], [1, 0], [0, 1], [2, 3], [3, 2], [1, 4], [5, 0], [2, 2], [0, 6]];
  RF.MARCHES_REPLI.forEach((id) => {
    const d = MP.CATALOGUE[id];
    assert.ok(d, id);
    scores.forEach(([h, a]) => assert.equal(R.resolveMarketWin(d.marche, h, a, {}), d.test({ h1: h, a1: a, h2: 0, a2: 0 }), id + " " + h + "-" + a));
  });
  // Jamais le match nul, jamais « au moins une equipe ne marque pas », jamais un handicap, une mi-temps ou des tirs.
  ["draw", "btts-no"].forEach((id) => assert.ok(!RF.MARCHES_REPLI.includes(id), id));
  RF.MARCHES_REPLI.forEach((id) => assert.ok(["RESULTAT", "DOUBLE_CHANCE", "TOTAL_BUTS", "BTTS", "BUTS_EQUIPE"].includes(MP.CATALOGUE[id].categorie), id));
});

test("cote agreee d'abord (meme regle que le pari normal) : nom de l'agree et heure reelle du releve", () => {
  const COTE_ANJ = require("../lib/cote-anj.js");
  const [a, b] = COTE_ANJ.BOOKMAKERS_SUIVIS;
  const livres = {}; livres[a + "_fr"] = { ou: { "4.5": [2.55, 1.52] } }; livres[b + "_fr"] = { ou: { "4.5": [2.50, 1.55] } };
  const m = matchCoupe();
  const r = RF.publierRepli([m], [], opts({ cotesAnjPar: { 777: livres }, relevesAnj: { 777: "2026-10-28T05:40:00Z" } }));
  assert.equal(r.publies, 1);
  assert.equal(m.market_id, "under-45");
  assert.deepEqual([m.cote_rec, m.cote_source, m.cote_bookmaker, m.cote_releve_a], ["1.55", "anj", COTE_ANJ.nomBookmaker(b), "2026-10-28T05:40:00Z"]);
  assert.equal(m.pronostic.cote_source, "anj");
});

test("jamais sous 1,40 ni au-dessus de la borne : aucune cote dans la fourchette -> pas de pari, rien d'invente", () => {
  const bas = releve([B.resultat("15.0", "8.00", "1.10"), B.buts([[1.5, "1.05", "9.00"], [2.5, "1.25", "3.80"], [3.5, "1.38", "2.90"]])]);
  const m = matchCoupe();
  const r = RF.publierRepli([m], [], opts({ donnees: { 777: Object.assign({}, DONNEES, { odds: bas }) } }));
  assert.equal(r.publies, 0);
  assert.equal(m.no_signal, true);
  assert.equal(m.pari_rec, "");
  assert.equal(m.cote_rec, undefined);
  // Aucune cote du tout : pas de pari (decision C4 : jamais une cote inventee).
  const m2 = matchCoupe();
  const r2 = RF.publierRepli([m2], [], opts({ donnees: { 777: Object.assign({}, DONNEES, { odds: null }) } }));
  assert.equal(r2.publies, 0);
  assert.equal(r2.sans_pari.AUCUN_MARCHE_AVEC_COTE_REELLE, 1);
  assert.equal(m2.no_signal, true);
  // Donnees de forme insuffisantes : pas de pari.
  const m3 = matchCoupe();
  const r3 = RF.publierRepli([m3], [], opts({ donnees: { 777: { dom: DONNEES.dom.slice(0, 3), ext: DONNEES.ext, odds: ODDS } } }));
  assert.equal(r3.sans_pari.REPLI_FORME_DONNEES_INSUFFISANTES, 1);
  assert.equal(m3.no_signal, true);
});

test("paris deja publies intouches : fige (gel), match avec pari, match commence, championnat (pas une coupe)", () => {
  const fige = matchCoupe({ id: 1 });
  const avecPari = matchCoupe({ id: 2, no_signal: false, no_signal_reason: undefined, pari_rec: "Over 2.5", market_id: "over-25", cote_rec: "1.80", model_probability: 55 });
  const commence = matchCoupe({ id: 3, status: "1H" });
  const ferme = matchCoupe({ id: 4, no_signal_reason: "KICKOFF_IMMINENT" });
  const ligue = matchCoupe({ id: 5, league_id: 140, league_key: "laliga" });
  const tous = [fige, avecPari, commence, ferme, ligue];
  const avant = JSON.stringify(tous);
  const d = {}; const ko = {};
  tous.forEach((m) => { d[m.id] = Object.assign({}, DONNEES, { odds: ODDS }); ko[m.id] = KO; });
  const r = RF.publierRepli(tous, [], opts({ figes: { 1: true }, donnees: d, koIso: ko }));
  assert.equal(r.candidats, 0);
  assert.equal(r.publies, 0);
  assert.equal(JSON.stringify(tous), avant);
});

test("textes : aucun texte ne contredit le pari (phrases « aucun pari » retirees, textes d'un autre marche vides)", () => {
  const m = matchCoupe({ contexte: "Le petit club recoit. Aucun pari n'est retenu sur ce match.", verdict_shark: "Pas de pari.", analyse_card: "Rien a jouer.",
    scenario: { phase1: "Debut ferme.", phase2: "Aucun marché ne remplit les conditions.", phase3: "Fin." } });
  const row = { fixture_id: 777, verdict_shark: "Pas de pari.", raw_response: { verdict_shark: "Pas de pari." } };
  RF.publierRepli([m], [row], opts({ texteMarche: { 777: "" } }));
  assert.equal(m.no_signal, false);
  const textes = [m.contexte, m.verdict_shark, m.analyse_card, m.scenario.phase1, m.scenario.phase2, m.scenario.phase3, row.verdict_shark, row.raw_response.verdict_shark].join(" ");
  assert.doesNotMatch(textes, /aucun pari|pas de pari|aucun march|ne remplit pas les conditions/i);
  assert.equal(m.contexte, "Le petit club recoit.");
  assert.equal(m.verdict_shark, "");
});

test("chance minimale : sous repli_forme.chance_min, pas de pari", () => {
  const cfg = JSON.parse(JSON.stringify(CFG));
  cfg.fiabilite.repli_forme.chance_min = 99;
  const m = matchCoupe();
  const r = RF.publierRepli([m], [], opts({ configLigues: cfg }));
  assert.equal(r.publies, 0);
  assert.equal(r.sans_pari.REPLI_FORME_CHANCE_TROP_BASSE, 1);
  assert.equal(m.no_signal, true);
});

test("pipeline : le repli passe APRES publierPronostics et AVANT l'alignement des chances, les tickets et le gel des fichiers", () => {
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
  const iPub = wf.indexOf("PRONOSTIC.publierPronostics(allMatchsData");
  const iRepli = wf.indexOf("REPLI_FORME.publierRepli(");
  const iAlign = wf.indexOf("PRONOSTIC.alignerChancesAffichees(allMatchsData");
  const iTickets = wf.indexOf("TICKETS_DU_JOUR.publierTicketsDuJour(");
  assert.ok(iPub > 0 && iRepli > iPub && iAlign > iRepli && iTickets > iAlign, [iPub, iRepli, iAlign, iTickets].join(" "));
  // Figes transmis (un pari publie ne change jamais) et journal sans pari, cote ni chance.
  const bloc = wf.slice(iRepli - 3000, iRepli + 1500);
  assert.match(bloc, /figes:GEL_FIGES/);
  assert.match(bloc, /koIso:/);
  assert.doesNotMatch(bloc, /console\.log\([^)]*(cote_rec|model_probability|pari_rec)/);
});
