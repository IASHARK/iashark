"use strict";
// SIMULATION PAR QUARTS D'HEURE : AJOUTS DU 04/10/2026 (verdicts-maths-temps.md a2, b1, b2, c2).
// Valeurs de controle du mathematicien (§ 7, tests/fixtures/simulation-15min/
// valeurs-controle-2026-10-04.json, portage Python verifie contre le JS existant et par
// tirage independant) retrouvees a 0,001 pres (condition 1 de a2 et 3 de b1).
const test = require("node:test");
const assert = require("node:assert/strict");
const SIM = require("../lib/simulation-15min.js");
const CONTROLE = require("./fixtures/simulation-15min/valeurs-controle-2026-10-04.json");

function simuler(e) {
  return SIM.simuler({ lambdaH: e.lambda_h, lambdaA: e.lambda_a, favori: e.favori, ligueApi: e.ligue_api, detail: true });
}
function proche(a, b, tol, quoi) {
  assert.equal(a.length, b.length, quoi);
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, quoi + " [" + i + "] : " + x + " contre " + b[i]));
}

test("valeurs de controle du mathematicien : tranches (match, domicile, exterieur), « Et si », premier but, minute mediane", () => {
  assert.equal(CONTROLE.length, 5);
  for (const c of CONTROLE) {
    const s = simuler(c.entree);
    const q = JSON.stringify(c.entree);
    proche(s.tranches.map((x) => x.pBut), c.tranches_au_moins_un_but, 0.001, "tr " + q);
    proche(s.tranchesEquipes.dom, c.tranches_domicile_marque, 0.001, "tr_dom " + q);
    proche(s.tranchesEquipes.ext, c.tranches_exterieur_marque, 0.001, "tr_ext " + q);
    proche(s.etSi.domPremier, c.si_domicile_ouvre_1N2, 0.001, "si domicile ouvre " + q);
    proche(s.etSi.extPremier, c.si_exterieur_ouvre_1N2, 0.001, "si exterieur ouvre " + q);
    proche([s.premierBut.home, s.premierBut.away, s.premierBut.aucun], c.premier_but_simulation_dom_ext_aucun, 0.001, "premier but " + q);
    assert.ok(Math.abs(s.minuteMedianePremierBut - c.minute_mediane_premier_but_simulation) <= 0.06, "minute mediane " + q);
  }
});

test("coherence interne : chaque drapeau pese la chance d'ouvrir le score ; drapeaux + 0-0 = issue finale", () => {
  for (const c of CONTROLE) {
    const s = simuler(c.entree);
    // Issues conditionnelles : chacune fait 100 %.
    for (const v of [s.etSi.domPremier, s.etSi.extPremier, s.etSi.nulPause]) assert.ok(Math.abs(v[0] + v[1] + v[2] - 1) < 1e-9);
    // P(issue) = P(dom ouvre) x P(issue | dom) + P(ext ouvre) x P(issue | ext) + P(aucun but) sur le nul.
    const tot = [0, 1, 2].map((k) => s.premierBut.home * s.etSi.domPremier[k] + s.premierBut.away * s.etSi.extPremier[k] + (k === 1 ? s.premierBut.aucun : 0));
    proche(tot, s.final.p1n2, 1e-6, "loi totale " + JSON.stringify(c.entree));
    // L'equipe qui marque dans une tranche : jamais plus que « au moins un but » dans la tranche.
    s.tranches.forEach((t, i) => assert.ok(s.tranchesEquipes.dom[i] <= t.pBut + 1e-12 && s.tranchesEquipes.ext[i] <= t.pBut + 1e-12));
  }
});

test("champ du pipeline : sans ajouts, exactement le champ du 28/09 ; la zone chaude n'est jamais publiee", () => {
  const base = SIM.champPipeline({ lambdaH: 1.4, lambdaA: 1.2, favori: null, ligueApi: 39 });
  assert.deepEqual(Object.keys(base).sort(), ["premier", "tr", "v"]);
  const tout = SIM.champPipeline({ lambdaH: 1.4, lambdaA: 1.2, favori: null, ligueApi: 39, ajouts: { tr_equipes: true, et_si: true, minute_mediane: true } });
  assert.deepEqual(Object.keys(tout).sort(), ["minute_mediane_premier_but", "premier", "si", "si_affiche", "tr", "tr_dom", "tr_ext", "v"]);
  // Memes chiffres de base avec ou sans ajouts.
  assert.deepEqual(tout.tr, base.tr);
  assert.deepEqual(tout.premier, base.premier);
  // Jamais de tranche la plus chaude (a3 NO-GO) ni de nombre de simulations (aucun tirage).
  assert.doesNotMatch(JSON.stringify(tout), /chaude|nb_simulations|trancheChaude/);
  // Un seul ajout a la fois.
  assert.deepEqual(Object.keys(SIM.champPipeline({ lambdaH: 1.4, lambdaA: 1.2, ajouts: { tr_equipes: true } })).sort(), ["premier", "tr", "tr_dom", "tr_ext", "v"]);
  assert.deepEqual(Object.keys(SIM.champPipeline({ lambdaH: 1.4, lambdaA: 1.2, ajouts: { et_si: true } })).sort(), ["premier", "si", "si_affiche", "tr", "v"]);
});

test("« Et si » affiche : multiples de 5, somme 100 ; millieme dans si", () => {
  for (const c of CONTROLE) {
    const e = c.entree;
    const ch = SIM.champPipeline({ lambdaH: e.lambda_h, lambdaA: e.lambda_a, favori: e.favori, ligueApi: e.ligue_api, ajouts: { et_si: true } });
    for (const k of ["dom_premier", "ext_premier", "nul_pause"]) {
      const a = ch.si_affiche[k];
      assert.equal(a.p1 + a.pn + a.p2, 100, k);
      for (const x of [a.p1, a.pn, a.p2]) assert.equal(x % 5, 0, k);
      for (const x of [ch.si[k].p1, ch.si[k].pn, ch.si[k].p2]) assert.equal(Math.round(x * 1000) / 1000, x);
      // Arrondi a 5 points : jamais a plus de 5 points du millieme.
      assert.ok(Math.abs(a.p1 - ch.si[k].p1 * 100) <= 5 && Math.abs(a.p2 - ch.si[k].p2 * 100) <= 5, k);
    }
  }
  // Exemple du verdict (1,50 / 1,20, domicile favori) : « si Lens ouvre le score », environ 70 %.
  const ex = SIM.champPipeline({ lambdaH: 1.5, lambdaA: 1.2, favori: "home", ligueApi: 39, ajouts: { et_si: true } });
  assert.deepEqual(ex.si_affiche.dom_premier, { p1: 70, pn: 20, p2: 10 });
});

test("minute mediane : entiere, absente quand la chance d'au moins un but est sous 50 %", () => {
  const c = SIM.champPipeline({ lambdaH: 1.5, lambdaA: 1.2, favori: "home", ligueApi: 39, ajouts: { minute_mediane: true } });
  assert.equal(c.minute_mediane_premier_but, 29);
  // 0,2 + 0,2 but attendu : aucun but dans environ 2 matchs sur 3.
  const rare = SIM.champPipeline({ lambdaH: 0.2, lambdaA: 0.2, favori: null, ligueApi: 39, ajouts: { minute_mediane: true } });
  assert.equal(rare.minute_mediane_premier_but, undefined);
  assert.ok(rare.premier.n > 0.5);
});

test("repartir en cours de match : aucun ajout calcule (les chances « avant le match » n'ont plus de sens)", () => {
  const s = SIM.simuler({ lambdaH: 1.5, lambdaA: 1.0, favori: "home", detail: true, etat: { minute: 70, butsDom: 1, butsExt: 0 } });
  assert.equal(s.tranchesEquipes, undefined);
  assert.equal(s.etSi, undefined);
});
