"use strict";
// EXP-004 (SPEC LAB PRO v1.0, M4 NB2) - parametrisation NB2 officielle,
// IDENTIQUE Node/Python (verifie par tests/lab-nb2-node-python-fidelity.test.js) :
//   Y ~ NB2(mu, kappa), mu>0, kappa>0
//   Var(Y) = mu + mu^2/kappa   (petit kappa = forte surdispersion, kappa->inf = limite Poisson)
//   P(Y=y) = Gamma(y+kappa)/(Gamma(kappa)*y!) * (kappa/(kappa+mu))^kappa * (mu/(kappa+mu))^y
// Aucune autre convention NB (n,p) utilisee implicitement.

// log-gamma haute precision : recurrence lgamma(z)=lgamma(z+1)-log(z)
// pour ramener z au-dessus d'un seuil ou la serie de Stirling converge
// avec une erreur de troncature negligeable (< 1e-18 pour z>=SHIFT_THRESHOLD),
// puis serie de Stirling classique (coefficients de Bernoulli). Reproduit
// la precision de math.lgamma (C stdlib) a l'epsilon machine pres -
// necessaire pour tenir la tolerance <=1e-12 exigee entre Node et Python.
const SHIFT_THRESHOLD = 15;
const HALF_LOG_2PI = 0.9189385332046727; // 0.5*log(2*pi)

function lgamma(zIn) {
  if (!(zIn > 0)) throw new RangeError(`lgamma: argument doit etre > 0 (recu ${zIn})`);
  let z = zIn;
  let shift = 0;
  while (z < SHIFT_THRESHOLD) {
    shift -= Math.log(z);
    z += 1;
  }
  const invz = 1 / z;
  const invz2 = invz * invz;
  // serie de Stirling : (z-0.5)ln(z) - z + 0.5ln(2pi) + 1/(12z) - 1/(360z^3) + 1/(1260z^5) - 1/(1680z^7) + 1/(1188z^9) - 691/(360360z^11) + 1/(156z^13)
  const series = invz * (
    1 / 12 + invz2 * (
      -1 / 360 + invz2 * (
        1 / 1260 + invz2 * (
          -1 / 1680 + invz2 * (
            1 / 1188 + invz2 * (
              -691 / 360360 + invz2 * (1 / 156)
            )
          )
        )
      )
    )
  );
  return (z - 0.5) * Math.log(z) + HALF_LOG_2PI - z + series + shift;
}

function assertNb2Domain(y, mu, kappa) {
  if (!Number.isInteger(y) || y < 0) throw new RangeError(`NB2: y doit etre un entier >=0 (recu ${y})`);
  if (!(mu > 0)) throw new RangeError(`NB2: mu doit etre >0 (recu ${mu})`);
  if (!(kappa > 0)) throw new RangeError(`NB2: kappa doit etre >0 (recu ${kappa})`);
}

const { logFactorial } = require("../models.js");

// log[Gamma(y+kappa)/Gamma(kappa)] pour y ENTIER >=0 - identite EXACTE
// (produit croissant kappa*(kappa+1)*...*(kappa+y-1), somme vide=0 pour
// y=0), utilisee au lieu de lgamma(y+kappa)-lgamma(kappa) : cette
// difference souffre d'une annulation catastrophique quand kappa est
// grand (kappa=1000 : lgamma(~1005)-lgamma(1000), deux valeurs ~5900
// dont la difference vaut ~35 - perd ~13 chiffres significatifs). Comme
// y (buts marques) est TOUJOURS un entier petit en pratique, cette somme
// directe est a la fois exacte mathematiquement et numeriquement stable -
// c'est la MEME identite utilisee cote Python (scripts/fit_kappa.py,
// scripts/eval_nb2_log_probability.py), necessaire pour tenir la
// tolerance Node<->Python <=1e-12 (verifie tests/lab-nb2-node-python-fidelity.test.js).
function logRisingFactorialRatio(y, kappa) {
  let sum = 0;
  for (let i = 0; i < y; i++) sum += Math.log(kappa + i);
  return sum;
}

// log P(Y=y) pour Y~NB2(mu,kappa), parametrisation officielle EXP-004.
function logPmfNB2(y, mu, kappa) {
  assertNb2Domain(y, mu, kappa);
  const logKappaOverKappaPlusMu = Math.log(kappa) - Math.log(kappa + mu);
  const logMuOverKappaPlusMu = Math.log(mu) - Math.log(kappa + mu);
  return logRisingFactorialRatio(y, kappa) - logFactorial(y)
    + kappa * logKappaOverKappaPlusMu
    + y * logMuOverKappaPlusMu;
}

function pmfNB2(y, mu, kappa) {
  return Math.exp(logPmfNB2(y, mu, kappa));
}

// CDF(M) = sum_{y=0}^{M} P(Y=y). M doit etre un entier >=0.
function cdfNB2(M, mu, kappa) {
  if (!Number.isInteger(M) || M < 0) throw new RangeError(`cdfNB2: M doit etre un entier >=0 (recu ${M})`);
  let sum = 0;
  for (let y = 0; y <= M; y++) sum += pmfNB2(y, mu, kappa);
  return sum;
}

// Variance officielle NB2 - utilisee par les tests contractuels et les
// diagnostics de surdispersion residuelle, jamais par le calcul de
// vraisemblance lui-meme.
function varianceNB2(mu, kappa) {
  return mu + (mu * mu) / kappa;
}

module.exports = { lgamma, logPmfNB2, pmfNB2, cdfNB2, varianceNB2 };
