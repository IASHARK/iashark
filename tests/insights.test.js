"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeMatchup,
  computeScoringProbability,
  computeOutputShare,
  computeFormTrend,
  classifyKeyInsights,
  topMarketsToWatch,
  formMarginNote,
} = require("../lib/insights.js");

test("computeMatchup: attaque plus forte -> avantage home sur un vrai ecart xG", () => {
  const home = { xg: 2.1, xga: 0.9, possession: 61, fouls: 9.2, corners: 6.7 };
  const away = { xg: 1.4, xga: 1.6, possession: 39, fouls: 11.4, corners: 5.1 };
  const m = computeMatchup(home, away);
  assert.ok(m.categories.length === 5);
  const attaque = m.categories.find((c) => c.key === "attaque");
  assert.equal(attaque.advantage, "home");
  assert.ok(m.globalHome > m.globalAway, "home domine sur un vrai ecart favorable partout");
});

test("computeMatchup: defense - la valeur xGA la plus basse gagne (moins de buts concedes = mieux)", () => {
  const m = computeMatchup({ xga: 0.5 }, { xga: 1.8 });
  const defense = m.categories.find((c) => c.key === "defense");
  assert.equal(defense.advantage, "home");
});

test("computeMatchup: aucune stat reelle -> null, jamais une categorie inventee", () => {
  assert.equal(computeMatchup({}, {}), null);
  assert.equal(computeMatchup(null, null), null);
});

test("computeMatchup: categorie manquante d'un cote -> exclue, jamais 0 par defaut", () => {
  const m = computeMatchup({ xg: 2, possession: 55 }, { xg: 1.5 });
  assert.equal(m.categories.length, 1);
  assert.equal(m.categories[0].key, "attaque");
});

test("computeScoringProbability: Poisson reel a partir de buts/90 et minutes attendues", () => {
  const r = computeScoringProbability(0.6, 90);
  assert.equal(r.lambda, 0.6);
  assert.ok(Math.abs(r.probability - 45.1) < 1, "P(>=1) = 1-e^-0.6 ~= 45.1%");
});

test("computeScoringProbability: moins de minutes attendues -> probabilite plus faible, jamais recopiee telle quelle", () => {
  const full = computeScoringProbability(0.6, 90);
  const partial = computeScoringProbability(0.6, 45);
  assert.ok(partial.probability < full.probability);
});

test("computeScoringProbability: buts/90 absent -> null, jamais 0% invente", () => {
  assert.equal(computeScoringProbability(null, 90), null);
});

test("computeOutputShare: part reelle buts+passes+passes cles du joueur sur le total equipe", () => {
  const share = computeOutputShare({ goals: 5, assists: 2, keyPasses: 3 }, { goals: 20, assists: 15, keyPasses: 25 });
  assert.equal(share, Math.round((10 / 60) * 1000) / 10);
});

test("computeOutputShare: total equipe absent/nul -> null, jamais une division par zero silencieuse", () => {
  assert.equal(computeOutputShare({ goals: 1, assists: 0, keyPasses: 0 }, { goals: 0, assists: 0, keyPasses: 0 }), null);
  assert.equal(computeOutputShare({ goals: 1, assists: 0, keyPasses: 0 }, null), null);
});

test("computeFormTrend: nettement mieux recemment -> tendance up", () => {
  const t = computeFormTrend([6.0, 6.1, 7.5, 7.8]);
  assert.equal(t.trend, "up");
});

test("computeFormTrend: moins de 4 notes -> null, signal trop bruite sur un split 2-2", () => {
  assert.equal(computeFormTrend([7, 7.2]), null);
});

test("classifyKeyInsights: classe les vrais signaux deja calcules (matchups/absences/ecart marche), jamais un signal invente", () => {
  const out = classifyKeyInsights({
    matchups: [{ title: "Arsenal au volume de tirs", text: "..." }, { title: "Liverpool a la précision", text: "..." }],
    keyAbsenceAlerts: ["Défenseur central titulaire d'Arsenal absent."],
    marketsCompared: [{ market: "Over 2.5", edge: 8.2 }],
    homeName: "Arsenal",
    awayName: "Liverpool",
  });
  assert.equal(out.length, 4);
  assert.equal(out[0].type, "positive_home");
  assert.equal(out[1].type, "positive_away");
  assert.equal(out[2].type, "watch");
  assert.equal(out[3].type, "contradiction");
});

test("classifyKeyInsights: aucun signal reel -> tableau vide, jamais un point inventé pour remplir", () => {
  assert.deepEqual(classifyKeyInsights({ matchups: [], keyAbsenceAlerts: [], marketsCompared: [], homeName: "A", awayName: "B" }), []);
});

test("topMarketsToWatch: classe par ecart absolu reel, jamais recalcule", () => {
  const out = topMarketsToWatch(
    [
      { market: "Over 2.5", edge: 8 },
      { market: "BTTS Oui", edge: -6 },
      { market: "DC 1X", edge: 1 },
      { market: "Nul", edge: 0.2 },
    ],
    78
  );
  assert.equal(out.length, 3);
  assert.equal(out[0].market, "Over 2.5");
  assert.equal(out[1].market, "BTTS Oui");
  assert.equal(out[0].confidence, 8);
});

test("formMarginNote: signale les victoires a marge etroite dans le vrai historique recent", () => {
  const last10 = [
    { result: "W", score: "2-1" },
    { result: "W", score: "3-0" },
    { result: "W", score: "1-0" },
    { result: "D", score: "1-1" },
  ];
  const note = formMarginNote(last10);
  assert.equal(note.wins, 3);
  assert.equal(note.narrowWins, 2);
});

test("formMarginNote: aucune victoire -> null, jamais une note inventee", () => {
  assert.equal(formMarginNote([{ result: "L", score: "0-2" }]), null);
  assert.equal(formMarginNote([]), null);
});
