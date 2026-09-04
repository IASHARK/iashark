"use strict";
// GATE C8 - test d'identifiabilite obligatoire : pour rho_true dans
// {0, -0.05, -0.10}, le VRAI fit_rho.py doit retrouver approximativement
// rho_true sur des donnees generees par le modele Dixon-Coles lui-meme.
// Purement un test de laboratoire (donnees 100% synthetiques) - ne doit
// JAMAIS etre confondu avec un resultat EXP-001 reel.

const test = require("node:test");
const assert = require("node:assert/strict");
const { runIdentifiabilityCheck } = require("../lib/lab/synthetic-identifiability.js");

// Tolerance et taille d'echantillon : verifie empiriquement (voir
// discussion GATE C8) que le signal de rho dans le modele Dixon-Coles ne
// vient QUE des 4 cellules bas-score (0-0/1-0/0-1/1-1) - l'information de
// Fisher sur rho est donc faible par match, et un championnat "reel"
// (~380 matchs/saison) presente une variance d'echantillonnage non
// negligeable sur rho_hat (mesure empiriquement jusqu'a ~0.05 d'ecart a
// 3 saisons). nSeasons=40 (20 equipes x 19 adversaires x 40 saisons =
// 15200 matchs) reduit cette variance a <0.03 de facon reproductible
// (verifie sur 9 combinaisons rho_true x seed avant de fixer ce seuil) -
// c'est un test de LABORATOIRE (identifiabilite du fitter), pas une
// contrainte sur la taille reelle d'EXP-001.
const TOLERANCE = 0.03;
const N_SEASONS = 40;
const SEED = 101;

for (const rhoTrue of [0, -0.05, -0.10]) {
  test(`fit_rho.py retrouve rho_true=${rhoTrue} a +/-${TOLERANCE} sur donnees synthetiques generees par le modele DC lui-meme`, () => {
    const res = runIdentifiabilityCheck({ rhoTrue, nTeams: 20, nSeasons: N_SEASONS, seed: SEED });
    assert.equal(res.fit.convergence, true, `le fitter doit converger sur des donnees propres generees par son propre modele (rho_true=${rhoTrue})`);
    assert.ok(
      Math.abs(res.rho_hat - rhoTrue) < TOLERANCE,
      `rho_hat=${res.rho_hat} trop eloigne de rho_true=${rhoTrue} (ecart=${Math.abs(res.rho_hat - rhoTrue)}, tolerance=${TOLERANCE}) - si ce test echoue, EXP-001 reel est interdit tant que le fitter n'est pas corrige`
    );
  });
}

test("des rho_true distincts produisent des rho_hat distincts et dans le bon ordre (le fitter n'est pas juste un bruit centre sur 0)", () => {
  // Meme seed pour les trois -> memes forces d'equipes et memes tirages
  // uniformes de sampling, seul rho_true change : isole proprement l'effet
  // de rho_true (design controle, pas de confusion avec la variance des
  // forces d'equipes generees).
  const r0 = runIdentifiabilityCheck({ rhoTrue: 0, nTeams: 20, nSeasons: N_SEASONS, seed: SEED });
  const rMinus05 = runIdentifiabilityCheck({ rhoTrue: -0.05, nTeams: 20, nSeasons: N_SEASONS, seed: SEED });
  const rMinus10 = runIdentifiabilityCheck({ rhoTrue: -0.10, nTeams: 20, nSeasons: N_SEASONS, seed: SEED });
  assert.ok(r0.rho_hat > rMinus05.rho_hat, `rho_hat(0)=${r0.rho_hat} devrait etre > rho_hat(-0.05)=${rMinus05.rho_hat}`);
  assert.ok(rMinus05.rho_hat > rMinus10.rho_hat, `rho_hat(-0.05)=${rMinus05.rho_hat} devrait etre > rho_hat(-0.10)=${rMinus10.rho_hat}`);
});

// --- Durcissement demande le 2026-09-04 : le smoke test ci-dessus (±0.03
// sur rho_hat) reste en place tel quel, mais ne detecte PAS a coup sur une
// fonction objectif ou une parametrisation incoherente entre le fitter et
// l'evaluation - rho_hat pourrait "ressembler" a rho_true par coincidence
// avec une objective legerement fausse. Ce bloc verifie directement les
// VALEURS de NLL sur le MEME echantillon, avec un jeu de donnees beaucoup
// plus grand (20 equipes x 19 adversaires x 100 saisons = 38000 matchs),
// et exige :
//   NLL(rho_hat) <= NLL(rho_true) + tolerance   (proprie du minimiseur -
//     doit TOUJOURS etre vrai si l'objectif est correctement implemente,
//     quelle que soit la taille de l'echantillon)
//   NLL(rho_hat) <= NLL(0) + tolerance           (idem)
//   pour rho_true != 0 : NLL(0) - NLL(rho_hat) capture une fraction
//     substantielle de l'ecart theorique NLL(0)-NLL(rho_true) (coherence
//     de signe/magnitude - la correction doit reellement aider, pas juste
//     "ne pas empirer")
const LARGE_N_SEASONS = 100; // 38000 matchs
const NLL_OPTIMALITY_TOLERANCE = 1e-6; // marge numerique pure (convergence SciPy xatol=1e-10), jamais un vrai relachement statistique

for (const rhoTrue of [0, -0.05, -0.10]) {
  test(`DURCI - rho_true=${rhoTrue}, N=38000 : NLL(rho_hat)<=NLL(rho_true)<=NLL(0) et coherence signe/magnitude`, () => {
    const res = runIdentifiabilityCheck({ rhoTrue, nTeams: 20, nSeasons: LARGE_N_SEASONS, seed: 9001 });
    assert.equal(res.fit.convergence, true);

    const report = `rho_true=${rhoTrue} rho_hat=${res.rho_hat} abs_error=${res.abs_error} ` +
      `NLL(rho_hat)=${res.nll_at_rho_hat} NLL(0)=${res.nll_at_zero} NLL(rho_true)=${res.nll_at_rho_true}`;

    // Propriete du minimiseur - doit TOUJOURS etre vraie si l'objectif est
    // correctement implemente, quelle que soit la taille de l'echantillon.
    assert.ok(
      res.nll_at_rho_hat <= res.nll_at_rho_true + NLL_OPTIMALITY_TOLERANCE,
      `NLL(rho_hat) devrait etre <= NLL(rho_true) - ${report}`
    );
    assert.ok(
      res.nll_at_rho_hat <= res.nll_at_zero + NLL_OPTIMALITY_TOLERANCE,
      `NLL(rho_hat) devrait etre <= NLL(0) - ${report}`
    );

    if (rhoTrue !== 0) {
      // Coherence de signe/magnitude : la correction apprise doit capturer
      // une fraction substantielle du gain theorique vs rho=0, pas juste
      // "ne pas empirer" - sinon la fonction objectif ou la parametrisation
      // du fitter est suspecte, meme si rho_hat "ressemble" a rho_true.
      const theoreticalGain = res.nll_at_zero - res.nll_at_rho_true;
      const observedGain = res.nll_at_zero - res.nll_at_rho_hat;
      assert.ok(theoreticalGain > 0, `pre-condition : gain theorique doit etre positif - ${report}`);
      assert.ok(
        observedGain >= 0.3 * theoreticalGain,
        `gain observe=${observedGain} devrait capturer >=30% du gain theorique=${theoreticalGain} - ${report}`
      );
      assert.ok(res.rho_hat < 0, `rho_hat devrait etre negatif comme rho_true - ${report}`);
    }
  });
}
