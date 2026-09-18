"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pickMarketDeterministic, computeRiskLabel, computeModelAgreement, computeDataQualityScore, computeReliability, scoreMatchesMarket, scoresConsistentWithMarket } = require("../lib/decision.js");

test("pickMarketDeterministic: choisit le marche de plus haute probabilite modele", () => {
  const markets = [
    { market: "Over 2.5", prob: 55, cote: 1.9 },
    { market: "BTTS Oui", prob: 68, cote: 1.7 },
    { market: "DC 1X", prob: 60, cote: 1.3 },
  ];
  const picked = pickMarketDeterministic(markets);
  assert.equal(picked.market, "BTTS Oui");
});

test("pickMarketDeterministic: liste vide -> null, jamais un marche invente", () => {
  assert.equal(pickMarketDeterministic([]), null);
  assert.equal(pickMarketDeterministic(null), null);
});

test("pickMarketDeterministic: un seul marche -> le retourne", () => {
  const markets = [{ market: "Over 2.5", prob: 55, cote: 1.9 }];
  assert.equal(pickMarketDeterministic(markets).market, "Over 2.5");
});

test("pickMarketDeterministic: egalite de probabilite -> deterministe (premier rencontre dans l'ordre du tableau)", () => {
  const markets = [
    { market: "A", prob: 60, cote: 1.9 },
    { market: "B", prob: 60, cote: 1.8 },
  ];
  assert.equal(pickMarketDeterministic(markets).market, "A");
});

test("pickMarketDeterministic: ignore une meilleure probabilite si sa cote reelle est sous 1,50", () => {
  const markets = [
    { id: "dc-1x", market: "Double chance 1X", prob: 82, cote: 1.31 },
    { id: "under-35", market: "Moins de 3,5 buts", prob: 74, cote: 1.52 },
  ];
  assert.equal(pickMarketDeterministic(markets, { minOdds: 1.5 }).id, "under-35");
});

test("pickMarketDeterministic: le resultat ne depend pas de l'ordre ni de la famille", () => {
  const a = { id: "btts-no", market: "BTTS Non", prob: 63, cote: 1.72, reliability: 80 };
  const b = { id: "home-win", market: "Victoire domicile", prob: 63, cote: 1.85, reliability: 70 };
  assert.equal(pickMarketDeterministic([a, b], { minOdds: 1.5 }).id, "btts-no");
  assert.equal(pickMarketDeterministic([b, a], { minOdds: 1.5 }).id, "btts-no");
});

test("pickMarketDeterministic: aucune cote reelle eligible -> abstention", () => {
  assert.equal(pickMarketDeterministic([
    { id: "home", prob: 75, cote: null },
    { id: "over", prob: 70, cote: 1.49 },
  ], { minOdds: 1.5 }), null);
});

test("computeRiskLabel: cote basse -> FAIBLE, moyenne -> MODERE, haute -> ELEVE", () => {
  assert.equal(computeRiskLabel(1.5), "FAIBLE");
  assert.equal(computeRiskLabel(1.9), "MODERE");
  assert.equal(computeRiskLabel(3.5), "ELEVE");
});

test("computeRiskLabel: bornes exactes", () => {
  assert.equal(computeRiskLabel(1.75), "MODERE"); // pas strictement < 1.75
  assert.equal(computeRiskLabel(2.2), "MODERE"); // <= 2.2
  assert.equal(computeRiskLabel(2.21), "ELEVE");
});

test("computeRiskLabel: cote invalide -> repli MODERE, pas de crash", () => {
  assert.equal(computeRiskLabel(null), "MODERE");
  assert.equal(computeRiskLabel("abc"), "MODERE");
  assert.equal(computeRiskLabel(0), "MODERE");
});

test("computeModelAgreement: modeles identiques -> Fort, stdDev=0", () => {
  const r = computeModelAgreement([55, 55, 55]);
  assert.equal(r.label, "Fort");
  assert.equal(r.stdDev, 0);
});

test("computeModelAgreement: modeles tres divergents -> Faible", () => {
  const r = computeModelAgreement([20, 50, 80]);
  assert.equal(r.label, "Faible");
});

test("computeModelAgreement: divergence moderee -> Moyen", () => {
  const r = computeModelAgreement([45, 55, 65]);
  assert.equal(r.label, "Moyen", "stdDev=" + r.stdDev);
});

test("computeModelAgreement: moins de 2 valeurs valides -> Faible par defaut, pas de crash", () => {
  const r = computeModelAgreement([55]);
  assert.equal(r.label, "Faible");
  assert.equal(r.stdDev, null);
});

test("computeDataQualityScore: toutes les sources presentes -> 100", () => {
  const r = computeDataQualityScore({
    hasTeamStatsHome: true, hasTeamStatsAway: true, hasOdds: true,
    hasInjuries: true, hasH2H: true, hasElo: true, hasLineups: true,
  });
  assert.equal(r.score, 100);
  assert.equal(r.label, "Élevée");
});

test("computeDataQualityScore: aucune source -> 0", () => {
  const r = computeDataQualityScore({});
  assert.equal(r.score, 0);
  assert.equal(r.label, "Faible");
});

test("computeDataQualityScore: partiel -> label Moyenne dans la plage attendue", () => {
  const r = computeDataQualityScore({ hasTeamStatsHome: true, hasTeamStatsAway: true, hasOdds: true });
  assert.ok(r.score >= 40 && r.score < 70, "score=" + r.score);
  assert.equal(r.label, "Moyenne");
});

test("computeDataQualityScore: flags null -> 0, pas de crash", () => {
  const r = computeDataQualityScore(null);
  assert.equal(r.score, 0);
});

test("computeReliability: n'est jamais une copie de la probabilite - jamais de champ 'prob'/'probability'", () => {
  const r = computeReliability({ label: "Fort" }, { score: 80, label: "Élevée" }, 20);
  assert.equal(r.prob, undefined);
  assert.equal(r.probability, undefined);
});

test("computeReliability: tous les signaux forts -> Élevée", () => {
  const r = computeReliability({ label: "Fort" }, { label: "Élevée" }, 20);
  assert.equal(r.label, "Élevée");
});

test("computeReliability: tous les signaux faibles -> Faible", () => {
  const r = computeReliability({ label: "Faible" }, { label: "Faible" }, 2);
  assert.equal(r.label, "Faible");
});

test("computeReliability: sample_size null -> label 'Inconnue', jamais une valeur inventee", () => {
  const r = computeReliability({ label: "Moyen" }, { label: "Moyenne" }, null);
  assert.equal(r.sample_size, null);
  assert.equal(r.sample_size_label, "Inconnue");
});

test("computeReliability: historical_calibration toujours NOT_AVAILABLE_YET (aucune prediction post-fix resolue)", () => {
  const r = computeReliability({ label: "Fort" }, { label: "Élevée" }, 30);
  assert.equal(r.historical_calibration, "NOT_AVAILABLE_YET");
});

test("computeReliability: expose les composants individuels, pas juste un label composite", () => {
  const r = computeReliability({ label: "Moyen" }, { label: "Moyenne" }, 10);
  assert.equal(r.model_agreement, "Moyen");
  assert.equal(r.data_quality, "Moyenne");
  assert.equal(r.sample_size, 10);
});

test("scoreMatchesMarket: over/under total de buts", () => {
  assert.equal(scoreMatchesMarket(2, 1, "over-25"), true);
  assert.equal(scoreMatchesMarket(1, 0, "over-25"), false);
  assert.equal(scoreMatchesMarket(1, 0, "under-25"), true);
});
test("scoreMatchesMarket: resultat et double chance", () => {
  assert.equal(scoreMatchesMarket(2, 0, "home-win"), true);
  assert.equal(scoreMatchesMarket(1, 1, "draw"), true);
  assert.equal(scoreMatchesMarket(1, 1, "dc-1x"), true);
  assert.equal(scoreMatchesMarket(0, 1, "dc-1x"), false);
});
test("scoreMatchesMarket: BTTS et clean sheet", () => {
  assert.equal(scoreMatchesMarket(1, 1, "btts-yes"), true);
  assert.equal(scoreMatchesMarket(1, 0, "btts-yes"), false);
  assert.equal(scoreMatchesMarket(2, 0, "home-clean-sheet"), true);  // away n'a pas marque
  assert.equal(scoreMatchesMarket(2, 0, "away-clean-sheet"), false); // home a marque 2, away a encaisse
  assert.equal(scoreMatchesMarket(0, 2, "away-clean-sheet"), true);  // home n'a pas marque
});
test("scoreMatchesMarket: marche non evaluable depuis le score seul (1re mi-temps, tirs) -> null, jamais un filtrage errone", () => {
  assert.equal(scoreMatchesMarket(2, 1, "fh-over-05"), null);
  assert.equal(scoreMatchesMarket(2, 1, "total-shots-over-9_5"), null);
});

test("scoresConsistentWithMarket: reordonne pour ne garder que les scores compatibles avec le marche recommande", () => {
  const raw = [
    { score: "1-0", n: 800, pct: 16 },
    { score: "1-1", n: 550, pct: 11 },
    { score: "2-1", n: 400, pct: 8 },
    { score: "2-0", n: 350, pct: 7 },
    { score: "3-1", n: 200, pct: 4 },
  ];
  const result = scoresConsistentWithMarket(raw, "over-25", 3);
  assert.deepEqual(result.map((s) => s.score), ["2-1", "3-1"]);
});
test("scoresConsistentWithMarket: sans marche recommande (NO_PICK) -> classement brut inchange", () => {
  const raw = [{ score: "1-0", n: 800, pct: 16 }, { score: "0-0", n: 500, pct: 10 }];
  assert.deepEqual(scoresConsistentWithMarket(raw, null, 3), raw);
});
test("scoresConsistentWithMarket: marche non evaluable ou aucun score compatible simule -> repli honnete sur le brut, jamais une liste vide ni un score invente", () => {
  const raw = [{ score: "0-0", n: 900, pct: 90 }, { score: "1-0", n: 100, pct: 10 }];
  assert.deepEqual(scoresConsistentWithMarket(raw, "fh-over-05", 3), raw.slice(0, 3));
  assert.deepEqual(scoresConsistentWithMarket(raw, "over-35", 3), raw.slice(0, 3));
});

// Filet de securite general, pose apres le bug des lignes basses de tirs :
// une probabilite de 100 % face a une cote de 1.60 n'est pas un ecart a
// exploiter, c'est le signe que notre nombre et celui du bookmaker ne
// decrivent pas le meme evenement.
test("un marche donne quasi certain n'est jamais recommande", () => {
  const marches = [
    { id: "tirs-bas", market: "Tirs du match over 9.5", prob: 100, cote: "1.60" },
    { id: "over-25", market: "Over 2.5", prob: 72, cote: "1.85" }
  ];
  const choisi = pickMarketDeterministic(marches, { minOdds: 1.5 });
  assert.equal(choisi.id, "over-25",
    "le marche a 100 % a ete recommande alors qu'il est incoherent avec sa cote");

  // Et s'il ne reste que la quasi-certitude, on ne recommande rien plutot que
  // de la publier.
  assert.equal(pickMarketDeterministic([marches[0]], { minOdds: 1.5 }), null);
  assert.equal(pickMarketDeterministic([marches[0]], {}), null);
});

test("le seuil de quasi-certitude ne coupe pas les marches legitimes", () => {
  // Sur les 46 matchs du 03/09/2026, aucune recommandation legitime ne
  // depassait 90 % : le plus haut palier reel etait 80-90 %.
  const haut = { id: "haut", market: "DC 1X", prob: 89.4, cote: "1.55" };
  assert.equal(pickMarketDeterministic([haut], { minOdds: 1.5 }).id, "haut");
  const limite = { id: "limite", market: "Limite", prob: 96.9, cote: "1.55" };
  assert.equal(pickMarketDeterministic([limite], { minOdds: 1.5 }).id, "limite");
});

// ---------------------------------------------------------------------------
// pickMarketFair (19/09/2026) : une meme regle pour toutes les familles.
const { pickMarketFair, fairMarketProbabilities, SELECTION } = require("../lib/decision.js");
const mk = (id, cote, prob) => ({ id, market: id, cote: String(cote), prob });

test("fairMarketProbabilities : marge retiree livre par livre (1X2, paires, BTTS), double chance = somme des issues justes", () => {
  const f = fairMarketProbabilities([
    mk("home-win", 2.0, 50), mk("draw", 3.5, 25), mk("away-win", 4.0, 25),
    mk("dc-1x", 1.25, 75), mk("over-25", 1.9, 55), mk("under-25", 1.9, 45),
    mk("btts-yes", 1.8, 60), mk("btts-no", 2.0, 40),
  ]);
  const s1x2 = 1 / 2 + 1 / 3.5 + 1 / 4;
  assert.ok(Math.abs(f.get("home-win") - (100 / 2) / s1x2) < 1e-9);
  assert.ok(Math.abs(f.get("home-win") + f.get("draw") + f.get("away-win") - 100) < 1e-9);
  assert.ok(Math.abs(f.get("dc-1x") - (f.get("home-win") + f.get("draw"))) < 1e-9);
  assert.ok(Math.abs(f.get("over-25") - 50) < 1e-9, "paire symetrique : 50/50 apres retrait de marge");
  assert.ok(Math.abs(f.get("btts-yes") + f.get("btts-no") - 100) < 1e-9);
});

test("fairMarketProbabilities : un combine n'est jamais apparie a son « moins de », marche d'un seul cote = marge la plus forte du match retiree", () => {
  const f = fairMarketProbabilities([
    mk("over-25", 1.8, 55), mk("under-25", 1.9, 45),          // marge ~7,2 %
    mk("home-team-over-15", 2.0, 40), mk("home-team-under-15", 1.6, 60), // marge 12,5 %
    mk("home-win-over-25", 3.0, 30), mk("home-win-under-25", 4.0, 20),   // combines
    mk("home-clean-sheet", 2.5, 38),
  ]);
  const marge = 1 / 2.0 + 1 / 1.6 - 1;
  assert.ok(Math.abs(f.get("home-win-over-25") - (100 / 3.0) / (1 + marge)) < 1e-9);
  assert.ok(Math.abs(f.get("home-win-under-25") - (100 / 4.0) / (1 + marge)) < 1e-9);
  assert.ok(Math.abs(f.get("home-clean-sheet") - (100 / 2.5) / (1 + marge)) < 1e-9);
  // Sans aucun livre complet, pas de probabilite juste inventee.
  assert.equal(fairMarketProbabilities([mk("home-clean-sheet", 2.5, 38)]).size, 0);
});

test("fairMarketProbabilities : paires de tirs et de 1re mi-temps reconnues ; Shin prioritaire pour le 1X2", () => {
  const f = fairMarketProbabilities([
    mk("total-shots-over-22_5", 1.85, 70), mk("total-shots-under-22_5", 1.85, 30),
    mk("fh-over-05", 1.4, 70), mk("fh-under-05", 2.8, 30),
    mk("home-win", 2.0, 50), mk("draw", 3.4, 26), mk("away-win", 4.0, 24),
  ], { shin: { p1: 48, pN: 28, p2: 24 } });
  assert.ok(Math.abs(f.get("total-shots-over-22_5") - 50) < 1e-9);
  assert.ok(Math.abs(f.get("fh-over-05") + f.get("fh-under-05") - 100) < 1e-9);
  assert.ok(Math.abs(f.get("home-win") - 48) < 1e-9);
});

test("pickMarketFair : une famille qui s'exagere ne gagne plus (le cas des tirs), le plus probable pour de vrai l'emporte", () => {
  const r = pickMarketFair([
    // Tirs : le modele dit 80 %, le bookmaker ~50 % (paire symetrique a 1,85).
    mk("total-shots-over-22_5", 1.85, 80), mk("total-shots-under-22_5", 1.85, 20),
    // Moins de 2,5 buts a 1,55 : bookmaker ~61 %, modele 63 %.
    mk("under-25", 1.55, 63), mk("over-25", 2.45, 37),
  ]);
  assert.equal(r.market.id, "under-25");
  assert.equal(r.downgrade, null);
  // Estimation publiee = 80 % juste + 20 % modele, jamais la probabilite du modele seul.
  const juste = (1 / 1.55) / (1 / 1.55 + 1 / 2.45) * 100;
  assert.ok(Math.abs(r.market.prob - (0.8 * juste + 0.2 * 63)) < 1e-9);
  assert.equal(r.market.modelProb, 63);
  assert.ok(Math.abs(r.market.fairProb - juste) < 1e-9);
});

test("pickMarketFair : fourchette de cotes, puis au-dessus du maximum, puis sous le minimum (LOW_ODDS)", () => {
  assert.equal(SELECTION.minOdds, 1.40);
  assert.equal(SELECTION.maxOdds, 2.00);
  // 1,20 plus probable mais hors fourchette : le 1,60 est retenu.
  const dans = pickMarketFair([mk("dc-1x", 1.2, 80), mk("home-win", 1.6, 60), mk("draw", 4.5, 22), mk("away-win", 6, 18)]);
  assert.equal(dans.market.id, "home-win");
  // Rien entre 1,40 et 2,00 : le plus probable au-dessus de 2,00, sans signalement.
  const dessus = pickMarketFair([mk("over-25", 1.25, 75), mk("under-25", 3.8, 25), mk("btts-yes", 2.2, 44), mk("btts-no", 1.3, 56)]);
  assert.equal(dessus.market.id, "btts-yes");
  assert.equal(dessus.downgrade, null);
  // Tout sous 1,40 : le plus probable quand meme, signale LOW_ODDS.
  const dessous = pickMarketFair([mk("over-15", 1.2, 80), mk("under-15", 1.3, 20)]);
  assert.equal(dessous.downgrade, "LOW_ODDS");
  assert.equal(dessous.market.id, "over-15");
});

test("pickMarketFair : l'ordre du tableau et la famille ne changent rien ; plafond de 97 % respecte", () => {
  const a = [mk("over-25", 1.7, 55), mk("under-25", 2.2, 45), mk("btts-yes", 1.75, 54), mk("btts-no", 2.05, 46)];
  assert.equal(pickMarketFair(a).market.id, pickMarketFair(a.slice().reverse()).market.id);
  const quasiCertain = pickMarketFair([mk("over-05", 1.5, 99), mk("under-05", 2.5, 1), mk("over-25", 1.9, 50), mk("under-25", 1.9, 50)]);
  assert.notEqual(quasiCertain.market.id, "over-05");
});

test("pickMarketFair : donnees vides ou abimees -> null, jamais une exception ni un marche invente", () => {
  assert.equal(pickMarketFair([]), null);
  assert.equal(pickMarketFair(null), null);
  assert.equal(pickMarketFair([mk("over-25", "--", 55), mk("under-25", "", 45)]), null);
  assert.equal(pickMarketFair([{ id: "over-25", cote: "1.9" }, { id: "under-25", cote: "1.9", prob: "abc" }]), null);
  assert.equal(pickMarketFair([mk("home-clean-sheet", 1.8, 50)]), null, "aucun livre complet : pas de probabilite juste, le pipeline garde ses replis");
});
