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

// Match du site tel que le pipeline le laisse (moteur v3 relie, couverture verifiee).
function matchDe(v3, o) {
  return Object.assign({
    id: 1, home: { n: v3.domicile }, away: { n: v3.exterieur },
    moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes", couverture: v3.couverture },
    v3_fiabilite: { couverture: "vérifiée" },
    v3_marches: v3.marches.map((x) => ({ cle: x.cle, probabilite: Math.round(x.probabilite * 1000) / 10 })),
  }, o || {});
}
const AVEC_GRILLE = [];
SORTIES.forEach((s) => s.matchs.forEach((v) => { if (v.marches.some((x) => x.cle === "SCORE:0-0") && v.marches.some((x) => x.cle === "PREMIER_BUT:dom")) AVEC_GRILLE.push(v); }));
const PARIS = [null, ["home-win", 48], ["away-win", 30], ["draw", 27], ["dc-1x", 70], ["dc-12", 75], ["over-25", 52], ["under-25", 44], ["over-15", 74], ["under-35", 70]];
function avecPari(m, pr) { return pr ? Object.assign(m, { pari_rec: "x", market_id: pr[0], chance_iashark: pr[1] }) : m; }
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
    if (pr && pr[0] === "home-win") assert.equal(r.issues.dom, pr[1] * 100);
    if (pr && pr[0] === "draw") assert.equal(r.issues.nul, pr[1] * 100);
    if (pr && pr[0] === "dc-1x") assert.equal(r.issues.dom + r.issues.nul, pr[1] * 100);
    if (pr && pr[0] === "dc-12") assert.equal(r.issues.dom + r.issues.ext, pr[1] * 100);
    const n = Object.fromEntries(r.total_buts.map((x) => [x.buts, x.n / 100]));
    if (pr && pr[0] === "over-25") assert.equal(n["3"] + n["4+"], pr[1]);
    if (pr && pr[0] === "under-25") assert.equal(n["0"] + n["1"] + n["2"], pr[1]);
    if (pr && pr[0] === "over-15") assert.equal(n["2"] + n["3"] + n["4+"], pr[1]);
    if (pr && pr[0] === "under-35") assert.equal(n["0"] + n["1"] + n["2"] + n["3"], pr[1]);
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
    for (const pr of [["home-win", 48], ["away-win", 30], ["under-25", 44]]) {
      const r = S.resumeSur10000(avecPari(matchDe(v), pr));
      assert.deepEqual(r.scores.map((x) => x.score).sort(), grille.slice().sort(), "pari " + pr[0]);
    }
  }
});

test("« modèle seul » : plus de 1,5 but est cache (verdict f) : les barres 1 et 2 buts sont fusionnees", () => {
  const v = AVEC_GRILLE[0];
  const r = S.resumeSur10000(matchDe(v, { moteur_v3: { source: "v3", origine_probabilite: "modèle seul" } }));
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
  assert.deepEqual(n, { sim_resume: 1, premier_but: 1 });
  assert.ok(ok.sim_resume && ok.premier_but);
  assert.equal(limite.sim_resume, undefined); assert.equal(limite.premier_but, undefined);
  assert.equal(ancien.sim_resume, undefined);
  assert.deepEqual(ferme.sim_resume, { gele: true });
  // Sans feu vert : rien.
  const sans = JSON.parse(JSON.stringify(VERDICTS));
  Object.keys(sans.match).forEach((k) => { if (sans.match[k] === "GO") sans.match[k] = "en_attente"; });
  const m2 = matchDe(v);
  assert.deepEqual(S.poserSections([m2], { verdicts: sans }), { sim_resume: 0, premier_but: 0 });
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

test("arbitre : retire tant que le mathematicien n'a pas dit GO (heure de nomination non mesuree)", () => {
  const sb = { gratuit: { premier_but_dom: null, premier_but_ext: null, ligue_apres_75: { n: 3 }, detail_pro: ["quarts", "arbitre", "ligue"] },
    pro: { dom: { nom: "A" }, ext: null, ligue: { n: 1 }, arbitre: { nom: "X", cartons: { m: [4.6, 4, 5] } } } };
  assert.equal(VERDICTS.match.arbitre, "en_attente");
  const r = S.feuArbitre(sb);
  assert.equal(r.pro.arbitre, null);
  assert.deepEqual(r.gratuit.detail_pro, ["quarts", "ligue"]);
  assert.equal(sb.pro.arbitre.nom, "X", "l'objet d'origine n'est pas modifie");
  assert.equal(S.feuArbitre({ gratuit: { detail_pro: ["arbitre"] }, pro: { arbitre: { nom: "X" } } }), null, "rien d'autre que l'arbitre : rien");
  const go = JSON.parse(JSON.stringify(VERDICTS)); go.match.arbitre = "GO";
  assert.equal(S.feuArbitre(sb, go), sb);
  assert.equal(S.feuArbitre(null), null);
});

test("premier buteur (c3) : titulaires probables, 3 au plus, % entier, jamais en « données limitées »", () => {
  const v = SORTIES[0].matchs[0];
  const l = V3.premiersButeursV3(v);
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
  assert.ok(!V3.premiersButeursV3(absent).some((b) => b.joueur === l[0].joueur));
  assert.deepEqual(V3.premiersButeursV3(Object.assign({}, v, { couverture: "données limitées" })), []);
  assert.equal(VERDICTS.match.premier_buteur, "GO");
});

test("acces : sim_resume premium (visible sur le match offert) ; premier_but et premier buteur Pro seulement", () => {
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs"]) assert.ok(PREMIUM.PREMIUM_PAYLOAD_FIELDS.includes(k), k);
  for (const k of ["premier_but", "v3_premiers_buteurs"]) assert.ok(PREMIUM.PRO_ONLY_FIELDS.includes(k), k);
  assert.ok(!PREMIUM.PRO_ONLY_FIELDS.includes("sim_resume"));
  const m = Object.assign(matchDe(AVEC_GRILLE[0]), { id: 9, sim_resume: { base: 10000 }, premier_but: { dom: 50 }, v3_premiers_buteurs: [{ joueur: "X", chance: 12 }] });
  const pub = PREMIUM.stripPremium(m);
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs"]) assert.equal(pub[k], undefined, k);
  assert.deepEqual(PREMIUM.deepPremiumLeaks(pub), []);
  const offert = PREMIUM.stripPremium(Object.assign({}, m, { is_free: true }));
  assert.deepEqual(offert.sim_resume, { base: 10000 });
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
  assert.match(wf, /var sbMatch=SECTIONS_MATCH\.feuArbitre\(statsBookChamps\(f,lg,home,away\)\);/);
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
  const m = avecPari(matchDe(v, { marches_flux: { releve_at: null, liste: [{ marche: "Les deux équipes marquent", selection: "oui", code: "F8:Yes", chance: 61 }] } }), ["btts-yes", 57]);
  const pn = P.construirePanneau(m);
  const l = pn.familles.find((f) => f.cle === "btts").marches[0];
  assert.equal(l.chance, 57);
  assert.equal(l.pari_avis, true);
  const m2 = avecPari(matchDe(v), ["over-15", 71]);
  const l2 = P.construirePanneau(m2).familles.find((f) => f.cle === "buts").marches.find((x) => x.libelle === "Plus de 1,5 but");
  assert.equal(l2.chance, 71);
  assert.equal(l2.pari_avis, true);
  assert.equal(P.cleV3DuMarche("over-15"), "TOTAL:plus1.5");
  assert.equal(P.cleV3DuMarche("home-win"), "1N2:1");
});
