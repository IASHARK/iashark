#!/usr/bin/env python3
"""EXP-004 item 7 (SPEC LAB PRO v1.0, M4 NB2) - fitter offline de kappa
(dispersion NB2 partagee), utilise UNIQUEMENT hors ligne, meme discipline
que scripts/fit_rho.py (SS20 : fitting robuste != dependance Python en
production).

La fonction objectif (NLL exact-score NB2) est ECRITE INDEPENDAMMENT de
lib/lab/nb2-log-probability.js (pas une traduction ligne a ligne), pour
que tests/lab-nb2-node-python-fidelity.test.js soit une vraie preuve
croisee. Parametrisation NB2 IDENTIQUE (voir lib/lab/nb2.js) :
    P(Y=y) = Gamma(y+kappa)/(Gamma(kappa)*y!) * (kappa/(kappa+mu))^kappa * (mu/(kappa+mu))^y
Optimise sur eta=log(kappa) (garantit kappa>0 sans contrainte explicite
sur le parametre optimise lui-meme), MAIS l'optimisation reste bornee sur
un intervalle eta large et deterministe (pas de x0 aleatoire requis pour
un scalaire borne) - permet de detecter explicitement la limite Poisson
(eta au voisinage de la borne haute => kappa_hat enorme => les donnees ne
demontrent pas de surdispersion utile, PAS un succes NB).

Entree (stdin, JSON) :
    {
      "matches": [{"mu_home": 1.5, "mu_away": 1.2, "goals_home_90": 2, "goals_away_90": 1}, ...],
      "eta_lower_bound": -9.210340371976184,   # log(1e-4)
      "eta_upper_bound": 16.11809565095832     # log(1e7)
    }

Sortie (stdout, JSON) :
    {
      "kappa_hat": ..., "log_kappa_hat": ..., "training_N": ...,
      "objective_nll": ..., "convergence": true/false, "iterations": ...,
      "optimizer_message": "...", "on_boundary": bool,
      "numerical_boundary_status": "OK"|"KAPPA_POISSON_LIMIT"|"KAPPA_LOWER_BOUND"
    }
"""
import json
import sys
import math

try:
    from scipy.optimize import minimize_scalar
except ImportError as e:
    print(json.dumps({"error": "MISSING_DEPENDENCY", "detail": str(e)}))
    sys.exit(1)

DEFAULT_ETA_LOWER = math.log(1e-4)
DEFAULT_ETA_UPPER = math.log(1e7)
BOUNDARY_EPS = 1e-3  # distance (en eta, log-space) en-deca de laquelle on considere kappa_hat "sur la borne"


def log_nb2_pmf(y, mu, kappa):
    # log P(Y=y) pour Y~NB2(mu,kappa) - parametrisation officielle EXP-004.
    # log[Gamma(y+kappa)/Gamma(kappa)] calcule via le produit croissant
    # kappa*(kappa+1)*...*(kappa+y-1) (y ENTIER >=0, toujours vrai pour un
    # nombre de buts) plutot que math.lgamma(y+kappa)-math.lgamma(kappa) :
    # cette derniere souffre d'une annulation catastrophique quand kappa
    # est grand. MEME identite cote Node (lib/lab/nb2.js#logRisingFactorialRatio),
    # necessaire pour tenir la tolerance Node<->Python <=1e-12.
    if mu <= 0 or kappa <= 0:
        return float("-inf")
    log_rising_factorial_ratio = sum(math.log(kappa + i) for i in range(y))
    log_k_over_kmu = math.log(kappa) - math.log(kappa + mu)
    log_mu_over_kmu = math.log(mu) - math.log(kappa + mu)
    return (
        log_rising_factorial_ratio - math.lgamma(y + 1)
        + kappa * log_k_over_kmu
        + y * log_mu_over_kmu
    )


def log_probability(mu_home, mu_away, h, a, kappa):
    return log_nb2_pmf(h, mu_home, kappa) + log_nb2_pmf(a, mu_away, kappa)


def negative_log_likelihood_eta(eta, matches):
    kappa = math.exp(eta)
    total = 0.0
    n = len(matches)
    for m in matches:
        lp = log_probability(m["mu_home"], m["mu_away"], m["goals_home_90"], m["goals_away_90"], kappa)
        if lp == float("-inf"):
            return 1e12
        total += -lp
    return total / n if n > 0 else float("inf")


def fit(payload):
    matches = payload["matches"]
    eta_lower = payload.get("eta_lower_bound", DEFAULT_ETA_LOWER)
    eta_upper = payload.get("eta_upper_bound", DEFAULT_ETA_UPPER)

    if not matches:
        return {"error": "NO_TRAIN_DATA"}
    if eta_lower >= eta_upper:
        return {"error": "FIT_INVALID_CONSTRAINTS", "eta_lower_bound": eta_lower, "eta_upper_bound": eta_upper}

    # Optimisation bornee 1D sur eta=log(kappa) - deterministe (methode
    # "bounded" de SciPy, pas de seed necessaire pour un scalaire borne).
    result = minimize_scalar(
        negative_log_likelihood_eta,
        bounds=(eta_lower, eta_upper),
        method="bounded",
        args=(matches,),
        options={"xatol": 1e-10},
    )

    eta_hat = float(result.x)
    kappa_hat = math.exp(eta_hat)

    on_upper_boundary = (eta_upper - eta_hat) < BOUNDARY_EPS
    on_lower_boundary = (eta_hat - eta_lower) < BOUNDARY_EPS
    if on_upper_boundary:
        numerical_boundary_status = "KAPPA_POISSON_LIMIT"
    elif on_lower_boundary:
        numerical_boundary_status = "KAPPA_LOWER_BOUND"
    else:
        numerical_boundary_status = "OK"

    return {
        "kappa_hat": kappa_hat,
        "log_kappa_hat": eta_hat,
        "eta_lower_bound": eta_lower,
        "eta_upper_bound": eta_upper,
        "training_N": len(matches),
        "objective_nll": float(result.fun),
        "convergence": bool(result.success),
        "iterations": int(getattr(result, "nit", getattr(result, "nfev", 0))),
        "optimizer_message": str(result.message),
        "on_boundary": bool(on_upper_boundary or on_lower_boundary),
        "numerical_boundary_status": numerical_boundary_status,
    }


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw)
    out = fit(payload)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
