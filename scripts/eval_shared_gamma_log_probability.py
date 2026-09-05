#!/usr/bin/env python3
"""EXP-005 item 11 - utilitaire de verification croisee Node<->Python
UNIQUEMENT (tests/lab-m5-node-python-fidelity.test.js). N'est pas appele
par fit_m5_kappa_worker.py ni par aucun pipeline reel - evalue
log_probability_m5() en plusieurs points pour les comparer a
lib/lab/shared-gamma-dc.js. Ecrit independamment (pas une traduction
ligne a ligne) pour que la comparaison soit une vraie preuve croisee.

Entree (stdin, JSON) : {"points": [{"mu_home":..,"mu_away":..,"h":..,"a":..,"kappa":..,"rho":..}, ...]}
Sortie (stdout, JSON) : {"log_probabilities": [...]}
"""
import json
import sys
import math


def log_rising_factorial_ratio(n, kappa):
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


def log_probability_m5(mu_h, mu_a, h, a, kappa, rho):
    t = tau_dixon_coles(h, a, mu_h, mu_a, rho)
    if t <= 0:
        return float("-inf")
    zdc = compute_zdc(mu_h, mu_a, kappa, rho)
    if zdc is None:
        return float("-inf")
    return log_joint_q(h, a, mu_h, mu_a, kappa) + math.log(t) - math.log(zdc)


def main():
    payload = json.loads(sys.stdin.read())
    out = []
    for p in payload["points"]:
        v = log_probability_m5(p["mu_home"], p["mu_away"], p["h"], p["a"], p["kappa"], p["rho"])
        out.append(None if not math.isfinite(v) else v)
    print(json.dumps({"log_probabilities": out}))


if __name__ == "__main__":
    main()
