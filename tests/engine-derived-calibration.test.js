"use strict";
// Calibration des familles DERIVEES de la matrice de scores (18/09/2026).
//
// Pourquoi ce test existe : la selection du marche (lib/decision.js#
// pickMarketDeterministic) est un argmax de probabilite sur TOUS les
// candidats. Tant que seuls 1X2 / Over 2.5 / BTTS etaient calibres, les
// familles derivees (totaux par equipe, clean sheet, resultat + total...)
// concouraient avec des probabilites BRUTES, gonflees par la surconfiance
// mesuree du moteur coeur - et remportaient l'argmax pour perdre ensuite
// (~-12% de ROI sur les 290 premiers picks reels). Ce test verrouille :
//   1. derived est calibre en place pour tout marche marque wired:true ;
//   2. derived_raw conserve la matrice PRE-calibration (les outils de mesure
//      ne doivent jamais refitter par-dessus une correction) ;
//   3. la coherence mathematique inter-marches survit a des courbes
//      ajustees independamment ;
//   4. aucune courbe n'est appliquee si elle n'est pas branchee.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { calcFinalProbs } = require(path.join(ROOT, "lib/engine.js"));
const { buildCalibrationRows } = require(path.join(ROOT, "scripts/backtest-current-engine-offline.js"));
const PARAMS = require(path.join(ROOT, "lib/data/calibration-params.json"));

const EPS = 1e-9;
// Balayage representatif du domaine reel des lambdas (bornes de calcLambdas).
const LAMBDAS = [[1.05, 0.9], [1.2, 1.1], [1.6, 1.1], [1.9, 0.95], [2.4, 1.3], [1.3, 2.1], [3.4, 3.0], [1.35, 1.35]];

const DERIVED_KEYS = [
  ["OVER_1_5", (d) => d.overUnder["1.5"].over], ["OVER_3_5", (d) => d.overUnder["3.5"].over],
  ["HOME_TEAM_OVER_1_5", (d) => d.teamTotals.home["1.5"].over], ["AWAY_TEAM_OVER_1_5", (d) => d.teamTotals.away["1.5"].over],
  ["HOME_CLEAN_SHEET", (d) => d.cleanSheet.home], ["AWAY_CLEAN_SHEET", (d) => d.cleanSheet.away],
  ["HOME_WIN_TO_NIL", (d) => d.winToNil.home], ["AWAY_WIN_TO_NIL", (d) => d.winToNil.away],
  ["HOME_WIN_OVER_1_5", (d) => d.resultTotals.home.over1_5], ["HOME_WIN_OVER_2_5", (d) => d.resultTotals.home.over2_5],
  ["HOME_WIN_OVER_3_5", (d) => d.resultTotals.home.over3_5], ["HOME_WIN_UNDER_2_5", (d) => d.resultTotals.home.under2_5],
  ["HOME_WIN_UNDER_3_5", (d) => d.resultTotals.home.under3_5],
  ["AWAY_WIN_OVER_1_5", (d) => d.resultTotals.away.over1_5], ["AWAY_WIN_OVER_2_5", (d) => d.resultTotals.away.over2_5],
  ["AWAY_WIN_OVER_3_5", (d) => d.resultTotals.away.over3_5], ["AWAY_WIN_UNDER_2_5", (d) => d.resultTotals.away.under2_5],
  ["AWAY_WIN_UNDER_3_5", (d) => d.resultTotals.away.under3_5],
];

// 18/09/2026 (soir) : les courbes des familles derivees branchees le matin ont
// ete DEBRANCHEES. Apprises sur une plage etroite, avec des extremites portees
// par tres peu d'echantillons, elles s'appliquaient hors de leur plage (valeur
// de bord) et doublaient certaines probabilites en production (clean sheet
// exterieur 36 % -> 73 % sur le match offert du 19/09). Seules restent les trois
// courbes validees le 13/09. Rebrancher une famille exige un refit avec effectif
// minimal par palier ET de passer le test de couverture ci-dessous.
const VALIDATED = ["1X2", "BTTS_YES", "OVER_2_5"];

test("seules les courbes validees sont branchees, et le fit a bien tourne sur les deux metriques", () => {
  const wired = Object.entries(PARAMS.markets).filter(([, m]) => m.wired);
  assert.deepEqual(wired.map(([k]) => k).sort(), VALIDATED, "courbes branchees inattendues");
  for (const [k, m] of Object.entries(PARAMS.markets)) {
    if (!m.wired && !VALIDATED.includes(k) && m.unwired_on) assert.match(m.unwired_reason || "", /plage/, k + " : raison du debranchement documentee");
  }
  for (const [k, m] of wired) {
    assert.ok(m.holdout_brier_after < m.holdout_brier_before, k + " : branche sans amelioration du Brier sur le holdout");
    assert.ok(m.holdout_ece_after < m.holdout_ece_before, k + " : branche sans amelioration de l'ECE sur le holdout");
    assert.ok(m.n_holdout >= 1000, k + " : holdout trop petit pour brancher (" + m.n_holdout + ")");
  }
});

// Garde-fou qui aurait arrete le branchement du 18/09 : une courbe branchee doit
// avoir ete apprise sur la plage des probabilites BRUTES que le moteur produit
// reellement. Hors de sa plage, applyIsotonicCurve renvoie la valeur de bord,
// portee par une poignee d'echantillons (0 ou 1 aux extremes) : c'est la que
// naissent les probabilites aberrantes.
test("toute courbe branchee couvre au moins 90 % des probabilites brutes realistes", () => {
  const GETTERS = {
    "1X2": (d) => [d.p1, d.pN, d.p2],
    OVER_2_5: (d) => [d.overUnder["2.5"].over],
    BTTS_YES: (d) => [d.btts.yes],
  };
  DERIVED_KEYS.forEach(([k, get]) => { if (!GETTERS[k]) GETTERS[k] = (d) => [get(d)]; });
  const inputs = {};
  for (let lh = 0.9; lh <= 2.61; lh += 0.1) for (let la = 0.7; la <= 2.11; la += 0.1) {
    const raw = calcFinalProbs(lh, la, null).derived_raw;
    for (const k of Object.keys(GETTERS)) (inputs[k] = inputs[k] || []).push(...GETTERS[k](raw));
  }
  for (const [k, m] of Object.entries(PARAMS.markets)) {
    if (!m.wired) continue;
    assert.ok(GETTERS[k], k + " : branchee mais sans entree connue pour ce test");
    const pts = m.curve.points, lo = pts[0].x, hi = pts[pts.length - 1].x;
    const xs = inputs[k], inside = xs.filter((x) => x >= lo && x <= hi).length / xs.length;
    assert.ok(inside >= 0.9, k + " : seulement " + Math.round(inside * 100) + " % des probabilites realistes dans la plage apprise [" + lo.toFixed(2) + " ; " + hi.toFixed(2) + "]");
  }
});

test("derived est calibre en place pour chaque marche branche, et pas pour les autres", () => {
  for (const [lh, la] of LAMBDAS) {
    const P = calcFinalProbs(lh, la, null);
    for (const [key, get] of DERIVED_KEYS) {
      const entry = PARAMS.markets[key];
      const raw = get(P.derived_raw), cal = get(P.derived);
      if (entry && entry.wired) {
        assert.equal(P.calibration_applied[key], true, key + " : courbe branchee mais non appliquee");
      } else {
        assert.ok(!P.calibration_applied[key], key + " : courbe appliquee alors qu'elle n'est pas branchee");
        // Sans courbe, la valeur ne peut bouger que par un clamp de coherence (jamais par une calibration).
        assert.ok(Math.abs(raw - cal) < 0.2, key + " : valeur non branchee modifiee au-dela d'un clamp plausible");
      }
    }
  }
});

test("derived_raw est la matrice PRE-calibration : intacte, et c'est elle que lit le fit", () => {
  for (const [lh, la] of LAMBDAS) {
    const P = calcFinalProbs(lh, la, null);
    // Le brut n'est pas le calibre (sinon derived_raw ne servirait a rien).
    assert.notEqual(P.derived_raw.p1, P.derived.p1, "p1 brut identique au calibre : la copie brute n'est pas prise avant la calibration");
    // Le brut somme a 1 comme une matrice non touchee.
    assert.ok(Math.abs(P.derived_raw.p1 + P.derived_raw.pN + P.derived_raw.p2 - 1) < EPS);
    // Les lignes de calibration sont construites depuis le brut, jamais depuis le calibre.
    const rows = buildCalibrationRows(P, 2, 1, { fixture_id: 1, season: 2025 });
    const row = rows.find((r) => r.market === "HOME_TEAM_OVER_1_5");
    assert.equal(row.prob, P.derived_raw.teamTotals.home["1.5"].over, "le fit lirait une valeur deja calibree");
    assert.ok(rows.length >= 24, "familles derivees absentes des lignes de calibration");
  }
});

test("coherence inter-marches apres calibration independante de chaque famille", () => {
  for (const [lh, la] of LAMBDAS) {
    const d = calcFinalProbs(lh, la, null).derived;
    const tag = " (lambdas " + lh + "/" + la + ")";
    assert.ok(Math.abs(d.p1 + d.pN + d.p2 - 1) < EPS, "1X2 ne somme plus a 1" + tag);
    assert.ok(d.overUnder["1.5"].over + EPS >= d.overUnder["2.5"].over && d.overUnder["2.5"].over + EPS >= d.overUnder["3.5"].over, "echelle Over 1.5 >= 2.5 >= 3.5 rompue" + tag);
    for (const line of ["1.5", "2.5", "3.5"]) assert.ok(Math.abs(d.overUnder[line].over + d.overUnder[line].under - 1) < EPS, "over+under != 1 sur " + line + tag);
    for (const side of ["home", "away"]) {
      const tt = d.teamTotals[side], rt = d.resultTotals[side], pWin = side === "home" ? d.p1 : d.p2;
      assert.ok(tt["0.5"].over + EPS >= tt["1.5"].over && tt["1.5"].over + EPS >= tt["2.5"].over, "echelle des totaux par equipe rompue " + side + tag);
      assert.ok(Math.abs(tt["1.5"].over + tt["1.5"].under - 1) < EPS, "total equipe 1.5 over+under != 1 " + side + tag);
      assert.ok(d.winToNil[side] <= d.cleanSheet[side] + EPS, "gagner sans encaisser > clean sheet " + side + tag);
      assert.ok(d.winToNil[side] <= pWin + EPS, "gagner sans encaisser > probabilite de victoire " + side + tag);
      assert.ok(rt.over1_5 <= pWin + EPS && rt.over1_5 + EPS >= rt.over2_5 && rt.over2_5 + EPS >= rt.over3_5, "resultat + total : echelle over rompue " + side + tag);
      assert.ok(rt.under3_5 <= pWin + EPS && rt.under2_5 <= rt.under3_5 + EPS, "resultat + total : echelle under rompue " + side + tag);
    }
    // Double chance et Draw No Bet derivent des 1X2 CALIBRES, jamais d'une courbe propre.
    assert.ok(Math.abs(d.doubleChance.oneX - (d.p1 + d.pN)) < EPS && Math.abs(d.doubleChance.xTwo - (d.p2 + d.pN)) < EPS && Math.abs(d.doubleChance.oneTwo - (d.p1 + d.p2)) < EPS, "double chance decorrelee des 1X2 calibres" + tag);
    assert.ok(Math.abs(d.drawNoBet.home + d.drawNoBet.away - 1) < EPS, "draw no bet ne somme pas a 1" + tag);
  }
});

test("les champs top-level over15/over35/under35 refletent la matrice calibree", () => {
  for (const [lh, la] of LAMBDAS) {
    const P = calcFinalProbs(lh, la, null);
    assert.ok(Math.abs(P.over15 - P.derived.overUnder["1.5"].over * 100) < EPS, "over15 top-level != matrice");
    assert.ok(Math.abs(P.over35 - P.derived.overUnder["3.5"].over * 100) < EPS, "over35 top-level != matrice");
    assert.ok(Math.abs(P.under35 - (100 - P.over35)) < EPS, "under35 != 100 - over35");
    assert.ok(Math.abs(P.over25 - P.derived.overUnder["2.5"].over * 100) < EPS, "over25 top-level != matrice");
  }
});
