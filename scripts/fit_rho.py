#!/usr/bin/env python3
"""GATE C2 (SPEC LAB PRO v1.0) - fitter offline de rho (Dixon-Coles),
utilise UNIQUEMENT hors ligne (SPEC LAB PRO v1.0 SS20 : "fitting robuste
!= dependance Python en production" - le runtime live reste Node.js,
lib/engine.js). Ce script ecrit un rho appris ; il ne calcule jamais de
probabilite en production.

La fonction objectif (NLL exact-score) est ECRITE INDEPENDAMMENT de
lib/lab/dc-log-probability.js (pas une traduction ligne a ligne), pour
que tests/lab-node-python-fidelity.test.js soit une vraie preuve croisee
et non une tautologie - si les deux implementations independantes
convergent numeriquement, la formule mathematique est confirmee, pas
seulement la fidelite d'une traduction.

Entree (stdin, JSON) :
    {
      "matches": [{"lambda_home": 1.5, "lambda_away": 1.2, "goals_home_90": 2, "goals_away_90": 1}, ...],
      "lower_bound": -0.4,
      "upper_bound": 0.6,
      "initial_guess": -0.0845
    }

Sortie (stdout, JSON) :
    {
      "rho_hat": ..., "lower_bound": ..., "upper_bound": ...,
      "objective_nll": ..., "convergence": true/false,
      "iterations": ..., "optimizer_message": "..."
    }
"""
import json
import sys
import math

try:
    import numpy as np
    from scipy.optimize import minimize_scalar
except ImportError as e:
    print(json.dumps({"error": "MISSING_DEPENDENCY", "detail": str(e)}))
    sys.exit(1)


def log_poisson_pmf(lam, k):
    # log P(K=k) pour K~Poisson(lam), lam>0, k entier >=0.
    # Ecrit independamment de lib/models.js#logFactorial : utilise
    # math.lgamma(k+1) (log-gamma, equivalent mathematique de log(k!)).
    if lam <= 0:
        return 0.0 if k == 0 else float("-inf")
    return -lam + k * math.log(lam) - math.lgamma(k + 1)


def tau_dixon_coles(h, a, lambda_h, lambda_a, rho):
    # Meme structure que le tau Dixon-Coles standard (Dixon & Coles 1997),
    # reecrite ici independamment du code Node - pas une copie.
    if h == 0 and a == 0:
        return 1.0 - lambda_h * lambda_a * rho
    if h == 1 and a == 0:
        return 1.0 + lambda_a * rho
    if h == 0 and a == 1:
        return 1.0 + lambda_h * rho
    if h == 1 and a == 1:
        return 1.0 - rho
    return 1.0


def log_probability(lambda_h, lambda_a, h, a, rho):
    t = tau_dixon_coles(h, a, lambda_h, lambda_a, rho)
    if t <= 0:
        return float("-inf")
    return log_poisson_pmf(lambda_h, h) + log_poisson_pmf(lambda_a, a) + math.log(t)


def negative_log_likelihood(rho, matches):
    total = 0.0
    n = len(matches)
    for m in matches:
        lp = log_probability(m["lambda_home"], m["lambda_away"], m["goals_home_90"], m["goals_away_90"], rho)
        if lp == float("-inf"):
            # rho hors du domaine valide pour ce match -> penalite tres
            # forte plutot qu'une erreur silencieuse, pour que l'optimiseur
            # borne (deja contraint a [lower_bound, upper_bound]) ne s'y
            # aventure jamais en pratique.
            return 1e12
        total += -lp
    return total / n if n > 0 else float("inf")


def fit(payload):
    matches = payload["matches"]
    lower_bound = payload["lower_bound"]
    upper_bound = payload["upper_bound"]
    initial_guess = payload.get("initial_guess", (lower_bound + upper_bound) / 2)

    if not matches:
        return {"error": "NO_TRAIN_DATA"}
    if lower_bound >= upper_bound:
        return {"error": "FIT_INVALID_CONSTRAINTS", "lower_bound": lower_bound, "upper_bound": upper_bound}

    # Optimisation bornee 1D (rho est un scalaire) - methode "bounded" de
    # SciPy, deterministe pour une fonction objectif donnee (pas de seed
    # aleatoire necessaire pour un scalaire borne).
    result = minimize_scalar(
        negative_log_likelihood,
        bounds=(lower_bound, upper_bound),
        method="bounded",
        args=(matches,),
        options={"xatol": 1e-10},
    )

    rho_hat = float(result.x)
    on_boundary = (abs(rho_hat - lower_bound) < 1e-6) or (abs(rho_hat - upper_bound) < 1e-6)

    return {
        "rho_hat": rho_hat,
        "lower_bound": lower_bound,
        "upper_bound": upper_bound,
        "objective_nll": float(result.fun),
        "convergence": bool(result.success),
        "iterations": int(getattr(result, "nit", getattr(result, "nfev", 0))),
        "optimizer_message": str(result.message),
        "on_boundary": on_boundary,
    }


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw)
    out = fit(payload)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
