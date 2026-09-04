#!/usr/bin/env python3
"""GATE C2 - utilitaire de verification croisee Node<->Python UNIQUEMENT
(tests/lab-node-python-fidelity.test.js). N'est pas appele par le
pipeline de production ni par fit_rho.py - evalue log_probability() en
plusieurs points pour les comparer a lib/lab/dc-log-probability.js.

Entree (stdin, JSON) : {"points": [{"lambda_home":..,"lambda_away":..,"h":..,"a":..,"rho":..}, ...]}
Sortie (stdout, JSON) : {"log_probabilities": [...]}
"""
import json
import sys
import math


def log_poisson_pmf(lam, k):
    if lam <= 0:
        return 0.0 if k == 0 else float("-inf")
    return -lam + k * math.log(lam) - math.lgamma(k + 1)


def tau_dixon_coles(h, a, lambda_h, lambda_a, rho):
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


def main():
    payload = json.loads(sys.stdin.read())
    out = []
    for p in payload["points"]:
        v = log_probability(p["lambda_home"], p["lambda_away"], p["h"], p["a"], p["rho"])
        # json.dumps(float('-inf')) produit le litteral "-Infinity", du
        # JSON invalide qu'un JSON.parse() Node standard rejette (verifie
        # en direct). On serialise donc explicitement -inf/+inf/NaN en
        # null, JSON valide des deux cotes - Node compare alors sa propre
        # valeur -Infinity a `null` cote Python, pas une exception de parsing.
        out.append(None if not math.isfinite(v) else v)
    print(json.dumps({"log_probabilities": out}))


if __name__ == "__main__":
    main()
