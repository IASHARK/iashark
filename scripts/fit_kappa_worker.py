#!/usr/bin/env python3
"""EXP-004 (audit 2026-09-05, diagnostic hang subprocess) - worker Python
PERSISTANT pour le fit de kappa. Meme fonction objectif EXACTE que
scripts/fit_kappa.py (identite numeriquement stable, voir
lib/lab/nb2.js#logRisingFactorialRatio) - la SEULE difference est le
protocole d'appel : import scipy UNE SEULE FOIS au demarrage, puis boucle
JSONL (une ligne JSON par cutoff sur stdin, une ligne JSON par reponse sur
stdout, flush immediat) au lieu de re-spawner un process par cutoff.

Diagnostic (scripts/diagnose_fit_kappa_hang.js) : spawner un NOUVEAU
process Python (avec son propre import scipy/numpy a froid) ~229 fois en
sequence degrade progressivement (le temps d'ecriture stdin croit de ~2s
a 13s+ puis bloque completement vers l'iteration 96/100) - accumulation
de ressources systeme liee aux imports scipy/numpy repetes, PAS un
probleme de payload ni de l'optimiseur lui-meme (un fit isole termine
toujours normalement et rapidement une fois les donnees recues). Ce
worker elimine le probleme en ne payant le cout d'import qu'UNE fois.

Protocole (stdin/stdout, une ligne JSON par requete/reponse) :
    requete  : {"request_id": "...", "matches": [...], "eta_lower_bound": ..., "eta_upper_bound": ...}
    reponse  : {"request_id": "...", "kappa_hat": ..., ...} (memes champs que fit_kappa.py)
Une ligne "SHUTDOWN" ferme proprement le worker.
"""
import json
import sys
import math

try:
    from scipy.optimize import minimize_scalar
except ImportError as e:
    print(json.dumps({"error": "MISSING_DEPENDENCY", "detail": str(e)}))
    sys.stdout.flush()
    sys.exit(1)

DEFAULT_ETA_LOWER = math.log(1e-4)
DEFAULT_ETA_UPPER = math.log(1e7)
BOUNDARY_EPS = 1e-3


def log_nb2_pmf(y, mu, kappa):
    # identite numeriquement stable IDENTIQUE a scripts/fit_kappa.py et
    # lib/lab/nb2.js#logRisingFactorialRatio.
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
    # Signale au parent (Node) que l'import scipy est termine et que le
    # worker est pret a recevoir des requetes - evite toute course ou le
    # parent ecrirait avant que le worker ne lise (le meme phenomene qui
    # causait le blocage stdin observe avec le mode one-shot).
    print(json.dumps({"ready": True}))
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if line == "SHUTDOWN":
            break
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": "INVALID_JSON", "detail": str(e)}))
            sys.stdout.flush()
            continue
        request_id = payload.get("request_id")
        out = fit(payload)
        out["request_id"] = request_id
        print(json.dumps(out))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
