#!/usr/bin/env python3
"""EXP-004 item 9 - utilitaire de verification croisee Node<->Python
UNIQUEMENT (tests/lab-nb2-node-python-fidelity.test.js). N'est pas
appele par fit_kappa.py ni par aucun pipeline reel - evalue
log_probability() NB2 en plusieurs points pour les comparer a
lib/lab/nb2-log-probability.js. Ecrit independamment (pas une traduction
ligne a ligne de nb2.js) pour que la comparaison soit une vraie preuve
croisee.

Entree (stdin, JSON) : {"points": [{"mu_home":..,"mu_away":..,"h":..,"a":..,"kappa":..}, ...]}
Sortie (stdout, JSON) : {"log_probabilities": [...]}
"""
import json
import sys
import math


def log_nb2_pmf(y, mu, kappa):
    # meme identite numeriquement stable que scripts/fit_kappa.py et
    # lib/lab/nb2.js#logRisingFactorialRatio (evite l'annulation
    # catastrophique de lgamma(y+kappa)-lgamma(kappa) a grand kappa).
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


def main():
    payload = json.loads(sys.stdin.read())
    out = []
    for p in payload["points"]:
        v = log_probability(p["mu_home"], p["mu_away"], p["h"], p["a"], p["kappa"])
        out.append(None if not math.isfinite(v) else v)
    print(json.dumps({"log_probabilities": out}))


if __name__ == "__main__":
    main()
