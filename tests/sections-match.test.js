"use strict";
// NOUVELLES SECTIONS DE LA PAGE MATCH (demande de Clement du 04/10/2026 ; plan UX §2.3 ;
// verdicts du mathematicien du 04/10/2026). lib/sections-match.js, lib/marches-panneau.js
// (arrondis communs), lib/moteur-v3.js (premier buteur), pipeline.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const S = require("../lib/sections-match.js");
const P = require("../lib/marches-panneau.js");
const V3 = require("../lib/moteur-v3.js");
const PREMIUM = require("../lib/premium-fields.js");
const VERDICTS = require("../config/verdicts-maths.json");
const SORTIES = ["vraie_sortie_bb2a929.json", "exemple_sortie.json"].map((f) => require("./fixtures/moteur-v3/" + f));

// Match du site tel que le pipeline le laisse (moteur v3 relie, couverture verifiee, dans un
// des 12 championnats mesures : perimetre du mathematicien du 04/10/2026).
function matchDe(v3, o) {
  return Object.assign({
    id: 1, home: { n: v3.domicile }, away: { n: v3.exterieur }, league_key: "mls",
    moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes", couverture: v3.couverture },
    v3_fiabilite: { couverture: "vérifiée" },
    v3_marches: v3.marches.map((x) => ({ cle: x.cle, probabilite: Math.round(x.probabilite * 1000) / 10 })),
  }, o || {});
}
const AVEC_GRILLE = [];
SORTIES.forEach((s) => s.matchs.forEach((v) => { if (v.marches.some((x) => x.cle === "SCORE:0-0") && v.marches.some((x) => x.cle === "PREMIER_BUT:dom")) AVEC_GRILLE.push(v); }));
// Paris : [marche, ecart en points avec la probabilite du v3 arrondie]. Le controle du
// mathematicien (04/10/2026, point 2) n'accepte le partage « les autres issues se partagent le
// reste » qu'a 2 points d'ecart au plus : on reste dans cette tolerance (1,5 point au plus).
const PARIS = [null, ["home-win", 1], ["away-win", -1], ["draw", 0], ["dc-1x", 1], ["dc-12", -1], ["over-25", 1], ["under-25", -1], ["over-15", 0], ["under-35", 1]];
function avecPari(m, pr) {
  if (!pr) return m;
  const cle = P.cleV3DuMarche(pr[0]);
  const pv = m.v3_marches.find((x) => x.cle === cle).probabilite;
  return Object.assign(m, { pari_rec: "x", market_id: pr[0], chance_iashark: Math.round(pv) + pr[1] });
}
function lignesPanneau(pn) {
  const o = {};
  (pn ? pn.familles : []).forEach((f) => f.marches.forEach((l) => { o[l.libelle] = l.chance; }));
  return o;
}
const somme = (l) => l.reduce((a, x) => a + x.n, 0);

test("« 10 000 fois » : comptes exacts (pourcentage entier x 100), sommes justes, jamais de tirage", () => {
  assert.ok(AVEC_GRILLE.length >= 2);
  for (const v of AVEC_GRILLE) for (const pr of PARIS) {
    const r = S.resumeSur10000(avecPari(matchDe(v), pr));
    assert.equal(r.v, "grille-v3-1");
    assert.equal(r.base, 10000);
    assert.equal(r.issues.dom + r.issues.nul + r.issues.ext, 10000);
    assert.equal(somme(r.total_buts), 10000);
    assert.ok(r.scores.length >= 1 && r.scores.length <= 5);
    for (const x of [r.issues.dom, r.issues.nul, r.issues.ext].concat(r.scores.map((y) => y.n), r.total_buts.map((y) => y.n))) assert.equal(x % 100, 0);
    assert.doesNotMatch(JSON.stringify(r), /nb_simulations|graine|tirage/);
  }
});

test("une seule source : le pari garde la chance de l'Avis, et la page dit la meme chose que le panneau", () => {
  for (const v of AVEC_GRILLE) for (const pr of PARIS) {
    const m = avecPari(matchDe(v), pr);
    const r = S.resumeSur10000(m);
    const lp = lignesPanneau(P.construirePanneau(m));
    const dom = v.domicile, ext = v.exterieur;
    // 1N2 : identique au panneau.
    assert.equal(r.issues.dom / 100, lp["Victoire " + dom]);
    assert.equal(r.issues.nul / 100, lp["Match nul"]);
    assert.equal(r.issues.ext / 100, lp["Victoire " + ext]);
    // Pari : exactement la chance de l'Avis.
    const ch = m.chance_iashark;
    if (pr && pr[0] === "home-win") assert.equal(r.issues.dom, ch * 100);
    if (pr && pr[0] === "draw") assert.equal(r.issues.nul, ch * 100);
    if (pr && pr[0] === "dc-1x") assert.equal(r.issues.dom + r.issues.nul, ch * 100);
    if (pr && pr[0] === "dc-12") assert.equal(r.issues.dom + r.issues.ext, ch * 100);
    const n = Object.fromEntries(r.total_buts.map((x) => [x.buts, x.n / 100]));
    if (pr && pr[0] === "over-25") assert.equal(n["3"] + n["4+"], ch);
    if (pr && pr[0] === "under-25") assert.equal(n["0"] + n["1"] + n["2"], ch);
    if (pr && pr[0] === "over-15") assert.equal(n["2"] + n["3"] + n["4+"], ch);
    if (pr && pr[0] === "under-35") assert.equal(n["0"] + n["1"] + n["2"] + n["3"], ch);
    // Nombre de buts : chaque « plus de k,5 » du panneau se relit dans les barres.
    assert.equal(100 - n["0"], lp["Plus de 0,5 but"]);
    assert.equal(n["2"] + n["3"] + n["4+"], lp["Plus de 1,5 but"]);
    assert.equal(n["3"] + n["4+"], lp["Plus de 2,5 buts"]);
    assert.equal(n["4+"], lp["Plus de 3,5 buts"]);
    // Scores : les memes chiffres que le panneau ; le 0-0 = « 0 but » = « aucun but ».
    r.scores.forEach((x) => assert.equal(x.n / 100, lp["Score exact " + x.score], x.score));
    const zz = r.scores.find((x) => x.score === "0-0");
    if (zz) assert.equal(zz.n / 100, n["0"]);
    if (lp["Score exact 0-0"] !== undefined) assert.equal(lp["Score exact 0-0"], n["0"]);
    const pb = S.premierBut(m);
    assert.equal(pb.dom + pb.ext + pb.aucun, 100);
    assert.equal(pb.aucun, n["0"]);
    assert.equal(pb.avant_pause, lp["1re mi-temps : plus de 0,5 but"]);
  }
});

test("scores les plus probables SANS le filtre du pari (verdict d1) : les 5 premiers de la grille", () => {
  for (const v of AVEC_GRILLE) {
    const grille = v.marches.filter((x) => /^SCORE:\d+-\d+$/.test(x.cle)).sort((a, b) => b.probabilite - a.probabilite).slice(0, 5).map((x) => x.cle.slice(6));
    for (const pr of [["home-win", 1], ["away-win", -1], ["under-25", 0]]) {
      const r = S.resumeSur10000(avecPari(matchDe(v), pr));
      assert.deepEqual(r.scores.map((x) => x.score).sort(), grille.slice().sort(), "pari " + pr[0]);
    }
  }
});

test("plus de 1,5 but juge faux par le moteur dans ce championnat (H-022) : les barres 1 et 2 buts sont fusionnees", () => {
  const v = AVEC_GRILLE[0];
  const m = matchDe(v, { moteur_v3: { source: "v3", origine_probabilite: "modèle seul" } });
  m.v3_marches.forEach((x) => { if (/^TOTAL:(plus|moins)1\.5$/.test(x.cle)) x.panneau = false; });
  const r = S.resumeSur10000(m);
  assert.deepEqual(r.total_buts.map((x) => x.buts), ["0", "1-2", "3", "4+"]);
  assert.equal(somme(r.total_buts), 10000);
  assert.equal(S.tranchesButs({ "TOTAL:plus0.5": 90, "TOTAL:plus1.5": 92 }, () => true), null, "incoherent : rien");
});

test("garde : couverture verifiee du v3 et feux du mathematicien, sinon rien ; un match ferme garde son gel", () => {
  const v = AVEC_GRILLE[0];
  const ok = matchDe(v);
  const limite = matchDe(v, { v3_fiabilite: { couverture: "données limitées" }, sim_resume: { vieux: 1 }, premier_but: { vieux: 1 } });
  const ancien = matchDe(v, { moteur_v3: { source: "ancien moteur (repli)" } });
  const ferme = matchDe(v, { no_signal_reason: "KICKOFF_PASSED", sim_resume: { gele: true } });
  const n = S.poserSections([ok, limite, ancien, ferme]);
  assert.deepEqual(n, { sim_resume: 1, premier_but: 1, hors_perimetre: 1, ecart_avis: 0, cotes_marche: 0 });
  assert.ok(ok.sim_resume && ok.premier_but);
  assert.equal(limite.sim_resume, undefined); assert.equal(limite.premier_but, undefined);
  assert.equal(ancien.sim_resume, undefined);
  assert.deepEqual(ferme.sim_resume, { gele: true });
  // Sans feu vert : rien.
  const sans = JSON.parse(JSON.stringify(VERDICTS));
  Object.keys(sans.match).forEach((k) => { if (sans.match[k] === "GO") sans.match[k] = "en_attente"; });
  const m2 = matchDe(v);
  assert.deepEqual(S.poserSections([m2], { verdicts: sans }), { sim_resume: 0, premier_but: 0, hors_perimetre: 0, ecart_avis: 0, cotes_marche: 0 });
  assert.equal(m2.sim_resume, undefined);
  assert.equal(S.simulationPermise(m2, sans), false);
  assert.deepEqual(S.ajoutsSimulation(sans), { tr_equipes: false, et_si: false, minute_mediane: false });
  // Feux du jour (verdicts du 04/10/2026).
  assert.deepEqual(S.ajoutsSimulation(), { tr_equipes: true, et_si: true, minute_mediane: true });
  assert.equal(S.simulationPermise(matchDe(v)), true);
  assert.equal(S.simulationPermise(limite), false);
  assert.equal(VERDICTS.match.zone_chaude, "NO-GO");
  assert.equal(VERDICTS.match.score_le_plus_fou, "NO-GO");
});

test("arbitre : feu vert du mathematicien, arbitre de la fixture lu avant le coup d'envoi, faits seulement ; jamais recopie par le gel", () => {
  const sb = { gratuit: { premier_but_dom: null, premier_but_ext: null, ligue_apres_75: { n: 3 }, detail_pro: ["quarts", "arbitre", "ligue"] },
    pro: { dom: { nom: "A" }, ext: null, ligue: { n: 1 }, arbitre: { nom: "X", n: 64, debut: "2023-08-01", fin: "2026-10-02",
      cartons: { m: [4.6, 4, 5], attendu: 4.1, ecart: [0.5, 0.1, 0.9] }, rouges: { m: [0.2, 0.1, 0.3], attendu: 0.1 }, penaltys: { m: [0.3, 0.2, 0.4], attendu: 0.25 } } } };
  assert.equal(VERDICTS.match.arbitre, "en_attente");
  const AVANT = { avantCoupEnvoi: true, connuLe: "2026-10-04T03:00:00.000Z" };
  // Sans feu vert : retire, meme lu avant le match.
  const r = S.feuArbitre(sb, undefined, AVANT);
  assert.equal(r.pro.arbitre, null);
  assert.deepEqual(r.gratuit.detail_pro, ["quarts", "ligue"]);
  assert.equal(sb.pro.arbitre.nom, "X", "l'objet d'origine n'est pas modifie");
  assert.equal(S.feuArbitre({ gratuit: { detail_pro: ["arbitre"] }, pro: { arbitre: { nom: "X", n: 5, cartons: { m: [4, 3, 5] } } } }, undefined, AVANT), null, "rien d'autre que l'arbitre : rien");
  const go = JSON.parse(JSON.stringify(VERDICTS)); go.match.arbitre = "GO";
  // Feu vert, arbitre lu avant le coup d'envoi : faits seulement (cartons, penaltys par match, nombre de matchs, periode).
  const ok = S.feuArbitre(sb, go, AVANT);
  assert.deepEqual(ok.pro.arbitre, { nom: "X", n: 64, debut: "2023-08-01", fin: "2026-10-02", connu_le: "2026-10-04T03:00:00.000Z",
    cartons: { m: [4.6, 4, 5] }, penaltys: { m: [0.3, 0.2, 0.4] } });
  assert.doesNotMatch(JSON.stringify(ok.pro.arbitre), /attendu|ecart|rouges/, "jamais l'attendu ni l'ecart");
  assert.deepEqual(ok.gratuit.detail_pro, ["quarts", "arbitre", "ligue"]);
  // Match deja commence (fixture lue apres le coup d'envoi) : jamais l'arbitre.
  assert.equal(S.feuArbitre(sb, go, { avantCoupEnvoi: false }).pro.arbitre, null);
  assert.equal(S.feuArbitre(sb, go).pro.arbitre, null, "sans garde ouverte connue : jamais");
  assert.equal(S.feuArbitre(null), null);
  // Gel : stats_iashark est vivant (recalcule a chaque run), jamais restaure depuis la ligne publiee.
  const F = require("../lib/pick-freeze.js");
  assert.ok(F.LIVE_PREMIUM_FIELDS.includes("stats_iashark"));
  assert.ok(!F.FROZEN_PAYLOAD_FIELDS.includes("stats_iashark"));
  const publie = { fixture_id: 9, pari_rec: "Over 2.5", cote_rec: 1.5, market_id: "over-25", model_probability: 60,
    premium_fields: { stats_iashark: { arbitre: { nom: "F. Letexier", n: 64 } }, p1: 50 }, raw_response: { pick_freeze: { frozen_at: "2026-10-03T03:00:00.000Z", kickoff: "2026-10-05 20:45" } } };
  const frais = { id: 9, home: { n: "A" }, away: { n: "B" }, date: "2026-10-05 20:45", stats_iashark: null, pari_rec: "", no_signal: true };
  const fx = { fixture: { id: 9, status: { short: "NS" }, timestamp: Date.parse("2026-10-05T18:45:00Z") / 1000 } };
  const gel = F.freezeAnalysis(frais, publie, { nowMs: Date.parse("2026-10-04T03:00:00Z"), fixture: fx, premiumRow: { fixture_id: 9 } });
  assert.equal(gel.status, "FROZEN");
  assert.equal(gel.match.pari_rec, "Over 2.5");
  assert.equal(gel.match.stats_iashark, null, "l'arbitre ne revient jamais par le gel");
});

test("premier buteur (c3) : titulaires probables, 3 au plus, % entier, jamais en « données limitées »", () => {
  const v = SORTIES[0].matchs[0];
  const l = V3.premiersButeursV3(v, { ligue: "mls" });
  assert.ok(l.length >= 1 && l.length <= 3);
  for (let i = 1; i < l.length; i++) assert.ok(l[i - 1].p_premier_buteur >= l[i].p_premier_buteur);
  for (const b of l) {
    assert.ok(Number.isInteger(b.chance) && b.chance >= 1 && b.chance < 100);
    assert.ok(b.cote === "home" || b.cote === "away");
    const src = v.buteurs.find((x) => x.joueur === b.joueur);
    assert.equal(src.statut, "titulaire probable");
    assert.equal(b.chance, Math.round(src.p_premier_buteur * 100));
  }
  const absent = JSON.parse(JSON.stringify(v));
  absent.buteurs.forEach((b) => { if (b.joueur === l[0].joueur) b.statut = "absent"; });
  assert.ok(!V3.premiersButeursV3(absent, { ligue: "mls" }).some((b) => b.joueur === l[0].joueur));
  assert.deepEqual(V3.premiersButeursV3(Object.assign({}, v, { couverture: "données limitées" }), { ligue: "mls" }), []);
  // Hors des 12 championnats mesures (selection, coupe) ou ligue inconnue : rien.
  for (const ligue of ["nations_league", "wcq_europe", "ldc", "fa_cup", undefined]) assert.deepEqual(V3.premiersButeursV3(v, { ligue }), [], String(ligue));
  assert.deepEqual(V3.premiersButeursV3(v), []);
  assert.equal(VERDICTS.match.premier_buteur, "GO");
});

test("acces : sim_resume, jumeaux, premier_but et premier buteur jamais publics ; sur le match offert, servis au compte connecte (04/10/2026)", () => {
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs", "jumeaux"]) assert.ok(PREMIUM.PREMIUM_PAYLOAD_FIELDS.includes(k), k);
  // Decision de Clement du 04/10/2026 : sur le match offert, le compte gratuit connecte voit TOUT sauf le panneau
  // Marches ; rien de payant dans le fichier public (le visiteur sans compte ne voit qu'un apercu flou).
  assert.deepEqual(PREMIUM.PRO_ONLY_FIELDS, ["marches_panneau", "v3_marches", "marches_flux"]);
  for (const k of ["premier_but", "v3_premiers_buteurs", "sim_resume", "jumeaux"]) assert.ok(!PREMIUM.PRO_ONLY_FIELDS.includes(k), k);
  const m = Object.assign(matchDe(AVEC_GRILLE[0]), { id: 9, sim_resume: { base: 10000 }, premier_but: { dom: 50 }, v3_premiers_buteurs: [{ joueur: "X", chance: 12 }] });
  const pub = PREMIUM.stripPremium(m);
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs"]) assert.equal(pub[k], undefined, k);
  assert.deepEqual(PREMIUM.deepPremiumLeaks(pub), []);
  const offert = PREMIUM.stripPremium(Object.assign({}, m, { is_free: true }));
  assert.equal(offert.sim_resume, undefined);
  assert.equal(offert.premier_but, undefined);
  assert.equal(offert.v3_premiers_buteurs, undefined);
  // Fonction match-data : meme liste Pro seulement (copie litterale).
  const fn = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "match-data", "index.ts"), "utf8");
  const bloc = /const CHAMPS_PRO_SEULEMENT = \[([^\]]*)\];/.exec(fn);
  assert.deepEqual([...bloc[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]), PREMIUM.PRO_ONLY_FIELDS);
  // Gel : le premier buteur suit les compositions (vivant), comme v3_buteurs.
  assert.ok(require("../lib/pick-freeze.js").LIVE_PREMIUM_FIELDS.includes("v3_premiers_buteurs"));
});

test("pipeline : sections posees apres le panneau, simulation gardee par la couverture et les feux, bornes des quarts d'heure justes", () => {
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
  const iPanneau = wf.indexOf("poserPanneaux(allMatchsData)");
  const iSections = wf.indexOf("SECTIONS_MATCH.poserSections(allMatchsData)");
  const iProtection = wf.indexOf("PROTECTION DU FICHIER PUBLIC");
  assert.ok(iPanneau > 0 && iSections > iPanneau && iProtection > iSections);
  assert.match(wf, /ajouts:SECTIONS_MATCH\.ajoutsSimulation\(\)/);
  assert.match(wf, /&&SECTIONS_MATCH\.simulationPermise\(matchObj\)\)/);
  assert.match(wf, /var sbMatch=SECTIONS_MATCH\.feuArbitre\(statsBookChamps\(f,lg,home,away\),undefined,\{avantCoupEnvoi:kickoffGateFix\.open===true,connuLe:new Date\(\)\.toISOString\(\)\}\);/);
  // Bornes : 1-15, 16-30, 31-45 (+ arrets), 46-60, 61-75, 76-90 (+ arrets) ; prolongations hors tranches.
  const src = /function trancheBut\(e\)\{[^\n]*\}/.exec(wf)[0];
  const trancheBut = new Function(src + "; return trancheBut;")();
  const t = (el, ex) => trancheBut({ time: { elapsed: el, extra: ex == null ? null : ex } });
  assert.deepEqual([1, 15, 16, 30, 31, 45, 46, 60, 61, 75, 76, 90].map((x) => t(x)), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(t(45, 2), 2, "45e+2 : fin de 1re mi-temps");
  assert.equal(t(90, 4), 5, "90e+4 : fin de match");
  assert.equal(t(105), -1, "prolongation : hors tranches");
});

test("panneau : un pari ajoute le 04/10 (plus de 1,5 but, les deux marquent) porte la chance de l'Avis", () => {
  const v = AVEC_GRILLE[0];
  const m = avecPari(matchDe(v, { marches_flux: { releve_at: null, liste: [{ marche: "Les deux équipes marquent", selection: "oui", code: "F8:Yes", chance: 61 }] } }), ["btts-yes", 0]);
  const pn = P.construirePanneau(m);
  const l = pn.familles.find((f) => f.cle === "btts").marches[0];
  assert.equal(l.chance, m.chance_iashark);
  assert.equal(l.pari_avis, true);
  const m2 = avecPari(matchDe(v), ["over-15", -1]);
  const l2 = P.construirePanneau(m2).familles.find((f) => f.cle === "buts").marches.find((x) => x.libelle === "Plus de 1,5 but");
  assert.equal(l2.chance, m2.chance_iashark);
  assert.equal(l2.pari_avis, true);
  assert.equal(P.cleV3DuMarche("over-15"), "TOTAL:plus1.5");
  assert.equal(P.cleV3DuMarche("home-win"), "1N2:1");
});

// ============ CONTROLE DU MATHEMATICIEN DU 04/10/2026 (points 1 et 2) ============
// Grille Dixon-Coles reconstruite avec les vrais buts attendus du v3 (le meme calcul que le
// controle du mathematicien, scratchpad ctl-maths/ecart_avis.js).
function pois(l, k) { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; }
function grilleDC(lh, la, rho) {
  const G = []; let s = 0;
  for (let i = 0; i <= 10; i++) { G.push([]); for (let j = 0; j <= 10; j++) {
    let t = 1; if (i === 0 && j === 0) t = 1 - lh * la * rho; else if (i === 0 && j === 1) t = 1 + lh * rho; else if (i === 1 && j === 0) t = 1 + la * rho; else if (i === 1 && j === 1) t = 1 - rho;
    const p = pois(lh, i) * pois(la, j) * t; G[i].push(p); s += p; } }
  return G.map((r) => r.map((p) => p / s));
}
function marchesDe(G) {
  const P2 = {}; let p1 = 0, pn = 0, p2 = 0; const tot = {}; let dom = 0, ext = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = G[i][j]; if (i > j) p1 += p; else if (i === j) pn += p; else p2 += p;
    tot[i + j] = (tot[i + j] || 0) + p; if (i + j > 0) { dom += p * i / (i + j); ext += p * j / (i + j); }
    if (i <= 4 && j <= 4) P2["SCORE:" + i + "-" + j] = p;
  }
  P2["1N2:1"] = p1; P2["1N2:N"] = pn; P2["1N2:2"] = p2;
  [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].forEach((l) => { let c = 0; Object.keys(tot).forEach((k) => { if (Number(k) > l) c += tot[k]; }); P2["TOTAL:plus" + l] = c; P2["TOTAL:moins" + l] = 1 - c; });
  P2["PREMIER_BUT:dom"] = dom; P2["PREMIER_BUT:ext"] = ext; P2["PREMIER_BUT:aucun"] = G[0][0];
  return Object.keys(P2).map((k) => ({ cle: k, probabilite: Math.round(P2[k] * 1000) / 10 }));
}
// Cas reel du 03/10 : Macedoine du Nord - Ecosse, Ligue des nations. Avis « Victoire Ecosse »
// 58 % (cotes du marche) ; v3 30,6 / 28,9 / 40,5, buts attendus 1,092 / 1,295.
function macedoineEcosse(o) {
  const v3 = marchesDe(grilleDC(1.092, 1.295, -0.15));
  return Object.assign({ id: 1545660, home: { n: "FYR Macedonia" }, away: { n: "Scotland" }, date: "2026-10-03 20:45", league_key: "nations_league",
    pari_rec: "Victoire Exterieur", market_id: "away-win", no_signal: false, chance_iashark: 58,
    moteur_v3: { source: "v3", couverture: "vérifiée", origine_probabilite: "modèle seul" }, v3_fiabilite: { couverture: "vérifiée" }, v3_marches: v3,
    sim_15min: { v: 1, tr: [0.2, 0.2, 0.25, 0.22, 0.24, 0.3], tr_dom: [0.1, 0.1, 0.12, 0.11, 0.12, 0.15], tr_ext: [0.11, 0.11, 0.14, 0.12, 0.13, 0.17],
      si: { dom_premier: { p1: 0.4, pn: 0.3, p2: 0.3 } }, si_affiche: { dom_premier: { p1: 40, pn: 30, p2: 30 } } },
    v3_premiers_buteurs: [{ joueur: "X", cote: "away", chance: 12 }] }, o || {});
}

test("perimetre (point 1) : un match de Ligue des nations « vérifiée » ne recoit ni simulation, ni sections, ni premier buteur, ni ligne v3 au panneau", () => {
  const m = macedoineEcosse({ chance_iashark: 41 }); // meme coherent avec l'Avis : hors perimetre
  assert.equal(S.couvertureVerifiee(m), false);
  assert.equal(S.simulationPermise(m), false, "sim_15min jamais calcule (update-data.yml)");
  P.poserPanneaux([m]); S.poserSections([m]);
  assert.equal(m.sim_15min, null);
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs"]) assert.equal(m[k], undefined, k);
  const lignes = m.marches_panneau ? m.marches_panneau.familles.flatMap((f) => f.marches) : [];
  assert.deepEqual(lignes.filter((x) => x.source === "modele"), []);
  // Eliminatoires, coupes d'Europe, coupes nationales, amicaux : pareil.
  for (const lk of ["wcq_europe", "ldc", "el", "ecl", "fa_cup", "copa_del_rey", "libertadores", undefined]) {
    const x = macedoineEcosse({ league_key: lk, chance_iashark: 41 });
    assert.equal(S.couvertureVerifiee(x), false, String(lk));
  }
  // Le meme match dans un championnat mesure : produit.
  assert.equal(S.couvertureVerifiee(macedoineEcosse({ league_key: "ligue1" })), true);
});

test("coherence (point 2) : Macedoine du Nord - Ecosse, Avis 58 % contre 40,5 % au v3 : l'Avis reste seul", () => {
  // Place dans un championnat mesure pour isoler la garde d'ecart.
  const m = macedoineEcosse({ league_key: "ligue1" });
  assert.ok(P.ecartAvisV3(m) > 17);
  P.poserPanneaux([m]); const n = S.poserSections([m]);
  assert.deepEqual(n, { sim_resume: 0, premier_but: 0, hors_perimetre: 0, ecart_avis: 1, cotes_marche: 0 });
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs"]) assert.equal(m[k], undefined, k);
  assert.ok(m.sim_15min && Array.isArray(m.sim_15min.tr), "le film du match reste");
  assert.equal(m.sim_15min.si, undefined); assert.equal(m.sim_15min.si_affiche, undefined);
  // Controle du mathematicien de la PR 114, point 4 : ni la chance de chaque equipe par quart d'heure.
  assert.equal(m.sim_15min.tr_dom, undefined); assert.equal(m.sim_15min.tr_ext, undefined);
  const lignes = m.marches_panneau ? m.marches_panneau.familles.flatMap((f) => f.marches) : [];
  assert.deepEqual(lignes.filter((x) => x.source === "modele"), [], "aucune ligne du v3 au panneau");
  // Avis a 41 % (0,5 point du v3) : tout est produit, et l'Ecosse vaut exactement 41 partout.
  const ok = macedoineEcosse({ league_key: "ligue1", chance_iashark: 41 });
  P.poserPanneaux([ok]); S.poserSections([ok]);
  assert.equal(ok.sim_resume.issues.ext, 4100);
  assert.ok(ok.premier_but && ok.sim_15min.si_affiche && ok.v3_premiers_buteurs && ok.sim_15min.tr_dom && ok.sim_15min.tr_ext);
  // Juste au seuil : 2 points d'ecart acceptes, 2,1 non.
  const pv = ok.v3_marches.find((x) => x.cle === "1N2:2").probabilite;
  assert.equal(P.avisCoherent(macedoineEcosse({ league_key: "ligue1", chance_iashark: pv + 2 })), true);
  assert.equal(P.avisCoherent(macedoineEcosse({ league_key: "ligue1", chance_iashark: pv + 2.1 })), false);
});

// « 10 000 FOIS » ET PANNEAU SUR TOUS LES MATCHS (demande de Clement du 04/10/2026, soir) : hors du
// perimetre du v3, chances SANS MARGE des cotes du match, la MEME source que l'Avis ; rien ne change
// pour un match du v3 ; jamais de score exact ni de premier but tires des cotes.
const PR = require("../lib/pronostic.js");
// Ligue des nations (cotes moyennes reelles de France - Belgique, 05/10/2026), pari publie par la voie
// « cotes du marche » : plus de 2,5 buts a 65 %, cote 1,47.
function franceBelgique(o) {
  return Object.assign({ id: 1528944, home: { n: "France", id: 2 }, away: { n: "Belgium", id: 1 }, date: "2026-10-05 20:45", league_key: "nations_league",
    c1: "1.53", cn: "4.40", c2: "5.50", co25: "1.47", cu25: "2.75", co15: "1.12", co35: "2.40", btts_oui: "1.60", btts_non: "2.30",
    pari_rec: "Over 2.5", market_id: "over-25", no_signal: false, chance_iashark: 65, model_probability: 65, cote_rec: 1.47, cote_source: "indicative" }, o || {});
}
test("cotes du marche : « 10 000 fois » hors du v3 (victoire / nul / victoire), meme source que l'Avis, sommes justes", () => {
  const m = franceBelgique();
  const q = PR.sansMargeDesCotes(m);
  const n = S.poserSections([m]);
  assert.deepEqual(n, { sim_resume: 1, premier_but: 0, hors_perimetre: 0, ecart_avis: 0, cotes_marche: 1 });
  const r = m.sim_resume;
  assert.equal(r.v, S.VERSION_RESUME_MARCHE); assert.equal(r.source, "cotes"); assert.equal(r.base, 10000);
  assert.deepEqual(r.scores, [], "jamais de score exact sans grille"); assert.equal(r.total_buts, null);
  assert.equal(r.issues.dom + r.issues.nul + r.issues.ext, 10000);
  for (const [k, id] of [["dom", "home-win"], ["nul", "draw"], ["ext", "away-win"]]) assert.ok(Math.abs(r.issues[k] / 100 - q[id]) < 1, k + " : la cote sans marge");
  assert.equal(m.premier_but, undefined, "ni premier but"); assert.equal(m.sim_15min, undefined);
  // Pari en 1N2 : son issue porte EXACTEMENT la chance de l'Avis.
  const v = franceBelgique({ pari_rec: "Victoire Domicile", market_id: "home-win", chance_iashark: Math.round(q["home-win"]), cote_rec: 1.53 });
  S.poserSections([v]);
  assert.equal(v.sim_resume.issues.dom, Math.round(q["home-win"]) * 100);
  // Double chance : ses deux issues font la chance de l'Avis.
  const dc = franceBelgique({ pari_rec: "DC 1X", market_id: "dc-1x", chance_iashark: Math.round(q["dc-1x"]) });
  S.poserSections([dc]);
  assert.equal(dc.sim_resume.issues.dom + dc.sim_resume.issues.nul, Math.round(q["dc-1x"]) * 100);
  // Les cotes des agrees quand la cote de l'Avis est agreee (meme source que l'Avis).
  const anj = franceBelgique({ cote_source: "anj", sans_marge_anj: { "home-win": 60.2, draw: 22.5, "away-win": 17.3, "over-25": 64.6, "under-25": 35.4 } });
  S.poserSections([anj]);
  assert.deepEqual(anj.sim_resume.issues, { dom: 6000, nul: 2300, ext: 1700 });
});
test("cotes du marche : garde d'ecart avec l'Avis, aucune cote, feu du mathematicien ; un match du v3 ne change pas", () => {
  // Chance de l'Avis a plus de 2 points de la cote sans marge du meme marche (chance corrigee) : rien.
  const q = PR.sansMargeDesCotes(franceBelgique());
  const loin = franceBelgique({ chance_iashark: Math.round(q["over-25"]) - 3 });
  S.poserSections([loin]);
  assert.equal(loin.sim_resume, undefined);
  assert.equal(P.chancesMarche(loin), null);
  // Aucune cote reelle : rien.
  const sans = franceBelgique({ c1: "--", cn: "--", c2: "--", co25: "--", cu25: "--", btts_oui: null, btts_non: null });
  S.poserSections([sans]);
  assert.equal(sans.sim_resume, undefined);
  // Sans feu vert du mathematicien : rien.
  const nogo = JSON.parse(JSON.stringify(VERDICTS)); nogo.match.sim_resume = "en_attente";
  const m3 = franceBelgique(); S.poserSections([m3], { verdicts: nogo });
  assert.equal(m3.sim_resume, undefined);
  // Match du v3 dans son perimetre : sa grille, jamais les cotes (meme avec des cotes).
  const v = AVEC_GRILLE[0];
  const v3 = matchDe(v, { c1: "1.80", cn: "3.60", c2: "4.50" });
  S.poserSections([v3]);
  assert.equal(v3.sim_resume.v, S.VERSION_RESUME);
  assert.equal(P.chancesMarche(v3), null, "perimetre du v3 : jamais la voie des cotes");
  // v3 en perimetre mais Avis trop loin : l'Avis reste seul, aucun repli sur les cotes.
  const loinV3 = matchDe(v, { c1: "1.80", cn: "3.60", c2: "4.50", pari_rec: "x", market_id: "home-win", chance_iashark: 99 });
  const n = S.poserSections([loinV3]);
  assert.equal(n.ecart_avis, 1); assert.equal(loinV3.sim_resume, undefined);
});
test("cotes du marche : le panneau Marches liste les marches cotes (chance sans marge), le pari garde la chance de l'Avis", () => {
  const m = franceBelgique();
  P.poserPanneaux([m]);
  const lignes = m.marches_panneau.familles.flatMap((f) => f.marches);
  assert.ok(lignes.length >= 8 && lignes.every((l) => l.source === "marche"));
  const par = (id) => lignes.find((l) => l.id === id);
  assert.equal(par("over-25").chance, 65); assert.equal(par("over-25").pari_avis, true);
  assert.equal(par("over-25").chance + par("under-25").chance, 100);
  assert.equal(par("home-win").chance + par("draw").chance + par("away-win").chance, 100);
  assert.equal(par("dc-1x").chance, par("home-win").chance + par("draw").chance);
  assert.ok(par("BTTS:oui") && par("BTTS:oui").libelle === "Les deux équipes marquent");
  assert.ok(!lignes.some((l) => /^SCORE:|^PREMIER_BUT:/.test(String(l.id))), "jamais de score ni de premier but tires des cotes");
  assert.equal(m.nb_marches, m.marches_panneau.nb);
  // Champs payants, Pro seulement (inchanges) : jamais dans la copie publique.
  const pub = PREMIUM.stripPremium(Object.assign({}, m, { is_free: false }));
  assert.equal(pub.marches_panneau, undefined); assert.equal(pub.sim_resume, undefined);
  assert.ok(PREMIUM.PRO_ONLY_FIELDS.includes("marches_panneau"));
});
