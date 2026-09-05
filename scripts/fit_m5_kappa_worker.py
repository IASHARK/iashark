#!/usr/bin/env python3
"""EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - worker Python
PERSISTANT pour le fit de kappa M5, MEME architecture deja validee que
scripts/fit_kappa_worker.py (M4) : import scipy UNE SEULE FOIS, protocole
JSONL (une ligne requete/reponse par cutoff, flush explicite) - evite le
hang diagnostique et corrige le 2026-09-05 (respawn repete = degradation
progressive jusqu'au blocage).

Fitter DEDIE M5, DISTINCT de scripts/fit_kappa_worker.py (M4) : formule
objectif totalement differente (shared-gamma+DC jointe, PAS des marges
NB2 independantes). rho reste FIXE (-0.0845, jamais un parametre du fit)
- seul kappa est optimise, sur eta=log(kappa).

Formule (identique a lib/lab/shared-gamma-dc.js, ecrite independamment
ici en Python - pas une traduction ligne a ligne, pour que
tests/lab-m5-node-python-fidelity.test.js soit une vraie preuve croisee) :
    q(h,a) = Gamma(h+a+kappa)/(Gamma(kappa)*h!*a!) * kappa^kappa * muH^h * muA^a / (kappa+muH+muA)^(h+a+kappa)
    tau(h,a) : MEME correction Dixon-Coles que M2 (rho=-0.0845 FIXE)
    Zdc = 1 + sum_{4 cellules basses} q(h,a)*(tau(h,a)-1)
    P_M5(h,a) = q(h,a)*tau(h,a)/Zdc

Entree (stdin, JSONL - une ligne par requete) :
    {"request_id": "...", "matches": [{"mu_home":.., "mu_away":.., "goals_home_90":.., "goals_away_90":..}, ...],
     "eta_lower_bound": ..., "eta_upper_bound": ..., "eta_start": ...}
Sortie (stdout, JSONL - une ligne par reponse, flush immediat) :
    {"request_id": "...", "kappa_hat": ..., "log_kappa_hat": ..., "training_N": ...,
     "objective_nll": ..., "convergence": .., "iterations": .., "optimizer_message": "...",
     "on_boundary": .., "numerical_boundary_status": "OK"|"KAPPA_M2_LIMIT"|"KAPPA_LOWER_BOUND"}
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

CHAMPION_RHO = -0.0845
DEFAULT_ETA_LOWER = math.log(1e-2)   # kappa >= 0.01 (garde-fou numerique, item 9)
DEFAULT_ETA_UPPER = math.log(1e6)    # kappa <= 1e6
DEFAULT_ETA_START = math.log(10)     # kappa_start=10 PRE-ENREGISTRE (item 9) - jamais le kappa observe M4 comme start adaptatif
BOUNDARY_EPS = 1e-3


def log_rising_factorial_ratio(n, kappa):
    # log[Gamma(n+kappa)/Gamma(kappa)] via le produit croissant (n ENTIER
    # >=0) - identite exacte et numeriquement stable, MEME technique que
    # lib/lab/shared-gamma-dc.js#logRisingFactorialRatio (ecrite
    # independamment ici).
    total = 0.0
    for i in range(n):
        total += math.log(kappa + i)
    return total


def log_joint_q(h, a, mu_h, mu_a, kappa):
    n = h + a
    denom = kappa + mu_h + mu_a
    return (
        log_rising_factorial_ratio(n, kappa)
        - math.lgamma(h + 1) - math.lgamma(a + 1)
        + kappa * math.log(kappa)
        + h * math.log(mu_h) + a * math.log(mu_a)
        - (n + kappa) * math.log(denom)
    )


def tau_dixon_coles(h, a, mu_h, mu_a, rho):
    # MEME formule que lib/lab/dc-log-probability.js#tau (M2), rho FIXE.
    if h == 0 and a == 0:
        return 1.0 - mu_h * mu_a * rho
    if h == 1 and a == 0:
        return 1.0 + mu_a * rho
    if h == 0 and a == 1:
        return 1.0 + mu_h * rho
    if h == 1 and a == 1:
        return 1.0 - rho
    return 1.0


def compute_zdc(mu_h, mu_a, kappa, rho):
    low_cells = [(0, 0), (1, 0), (0, 1), (1, 1)]
    sum_low = 0.0
    for (h, a) in low_cells:
        t = tau_dixon_coles(h, a, mu_h, mu_a, rho)
        if t <= 0:
            return None
        sum_low += math.exp(log_joint_q(h, a, mu_h, mu_a, kappa)) * (t - 1)
    zdc = 1.0 + sum_low
    if not math.isfinite(zdc) or zdc <= 0:
        return None
    return zdc


def log_probability_m5(mu_h, mu_a, h, a, kappa, rho=CHAMPION_RHO):
    t = tau_dixon_coles(h, a, mu_h, mu_a, rho)
    if t <= 0:
        return float("-inf")
    zdc = compute_zdc(mu_h, mu_a, kappa, rho)
    if zdc is None:
        return float("-inf")
    return log_joint_q(h, a, mu_h, mu_a, kappa) + math.log(t) - math.log(zdc)


def negative_log_likelihood_eta(eta, matches):
    kappa = math.exp(eta)
    total = 0.0
    n = len(matches)
    for m in matches:
        lp = log_probability_m5(m["mu_home"], m["mu_away"], m["goals_home_90"], m["goals_away_90"], kappa)
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
        numerical_boundary_status = "KAPPA_M2_LIMIT"
    elif on_lower_boundary:
        numerical_boundary_status = "KAPPA_LOWER_BOUND"
    else:
        numerical_boundary_status = "OK"

    return {
        "kappa_hat": kappa_hat,
        "log_kappa_hat": eta_hat,
        "eta_lower_bound": eta_lower,
        "eta_upper_bound": eta_upper,
        "eta_start_registered": DEFAULT_ETA_START,
        "training_N": len(matches),
        "objective_nll": float(result.fun),
        "convergence": bool(result.success),
        "iterations": int(getattr(result, "nit", getattr(result, "nfev", 0))),
        "optimizer_message": str(result.message),
        "on_boundary": bool(on_upper_boundary or on_lower_boundary),
        "numerical_boundary_status": numerical_boundary_status,
    }


def main():
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
