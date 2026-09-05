#!/usr/bin/env python3
"""EXP-005 item 11 (CORRECTIF mean-preservation, audit 2026-09-05) -
utilitaire de verification croisee Node<->Python UNIQUEMENT
(tests/lab-m5-node-python-fidelity.test.js). N'est pas appele par
fit_m5_kappa_worker.py ni par aucun pipeline reel. Evalue, pour chaque
point (lambdaH,lambdaA,h,a,kappa,rho) : theta resolu, Zdc, logP final,
E[H], E[A]. Ecrit independamment (pas une traduction ligne a ligne) pour
que la comparaison soit une vraie preuve croisee.

Entree (stdin, JSON) : {"points": [{"lambda_home":..,"lambda_away":..,"h":..,"a":..,"kappa":..,"rho":..}, ...]}
Sortie (stdout, JSON) : {"results": [{"theta_h":.., "theta_a":.., "zdc":.., "log_p":.., "e_h":.., "e_a":.., "converged":bool}, ...]}
"""
import json
import sys
import math

THETA_MAX_ITER = 30
THETA_TOL = 1e-10
THETA_MAX_BACKTRACK = 20
THETA_EPS = 1e-6


def log_rising_factorial_ratio(n, kappa):
    total = 0.0
    for i in range(n):
        total += math.log(kappa + i)
    return total


def log_joint_q(h, a, theta_h, theta_a, kappa):
    n = h + a
    denom = kappa + theta_h + theta_a
    return (
        log_rising_factorial_ratio(n, kappa)
        - math.lgamma(h + 1) - math.lgamma(a + 1)
        + kappa * math.log(kappa)
        + h * math.log(theta_h) + a * math.log(theta_a)
        - (n + kappa) * math.log(denom)
    )


def joint_q(h, a, theta_h, theta_a, kappa):
    return math.exp(log_joint_q(h, a, theta_h, theta_a, kappa))


def tau_dixon_coles(h, a, theta_h, theta_a, rho):
    if h == 0 and a == 0:
        return 1.0 - theta_h * theta_a * rho
    if h == 1 and a == 0:
        return 1.0 + theta_a * rho
    if h == 0 and a == 1:
        return 1.0 + theta_h * rho
    if h == 1 and a == 1:
        return 1.0 - rho
    return 1.0


def closed_form_moments(theta_h, theta_a, kappa, rho):
    q00 = joint_q(0, 0, theta_h, theta_a, kappa)
    q10 = joint_q(1, 0, theta_h, theta_a, kappa)
    q01 = joint_q(0, 1, theta_h, theta_a, kappa)
    q11 = joint_q(1, 1, theta_h, theta_a, kappa)
    tau00 = tau_dixon_coles(0, 0, theta_h, theta_a, rho)
    tau10 = tau_dixon_coles(1, 0, theta_h, theta_a, rho)
    tau01 = tau_dixon_coles(0, 1, theta_h, theta_a, rho)
    tau11 = tau_dixon_coles(1, 1, theta_h, theta_a, rho)
    zdc = 1 + q00 * (tau00 - 1) + q10 * (tau10 - 1) + q01 * (tau01 - 1) + q11 * (tau11 - 1)
    correction_h = q10 * (tau10 - 1) + q11 * (tau11 - 1)
    correction_a = q01 * (tau01 - 1) + q11 * (tau11 - 1)
    return {
        "eH": (theta_h + correction_h) / zdc, "eA": (theta_a + correction_a) / zdc, "zdc": zdc,
        "tau00": tau00, "tau01": tau01, "tau10": tau10, "tau11": tau11,
    }


def check_positivity(theta_h, theta_a, m):
    if theta_h <= 0 or theta_a <= 0:
        return False
    if m["tau00"] <= 0 or m["tau01"] <= 0 or m["tau10"] <= 0 or m["tau11"] <= 0:
        return False
    if not math.isfinite(m["zdc"]) or m["zdc"] <= 0:
        return False
    return True


def solve_theta_for_target_means(lambda_h, lambda_a, kappa, rho):
    if lambda_h <= 0 or lambda_a <= 0 or kappa <= 0:
        return {"theta_h": None, "theta_a": None, "converged": False}
    theta_h, theta_a = lambda_h, lambda_a
    residual_norm = float("inf")
    for _ in range(THETA_MAX_ITER):
        m = closed_form_moments(theta_h, theta_a, kappa, rho)
        if not check_positivity(theta_h, theta_a, m):
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": False}
        r_h, r_a = m["eH"] - lambda_h, m["eA"] - lambda_a
        if abs(r_h) < THETA_TOL and abs(r_a) < THETA_TOL:
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": True}
        m_h1 = closed_form_moments(theta_h + THETA_EPS, theta_a, kappa, rho)
        m_a1 = closed_form_moments(theta_h, theta_a + THETA_EPS, kappa, rho)
        d_h_d_th = (m_h1["eH"] - m["eH"]) / THETA_EPS
        d_h_d_ta = (m_a1["eH"] - m["eH"]) / THETA_EPS
        d_a_d_th = (m_h1["eA"] - m["eA"]) / THETA_EPS
        d_a_d_ta = (m_a1["eA"] - m["eA"]) / THETA_EPS
        det = d_h_d_th * d_a_d_ta - d_h_d_ta * d_a_d_th
        if abs(det) < 1e-14:
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": False}
        step_h = (r_h * d_a_d_ta - r_a * d_h_d_ta) / det
        step_a = (r_a * d_h_d_th - r_h * d_a_d_th) / det
        accepted = False
        scale = 1.0
        for bt in range(THETA_MAX_BACKTRACK):
            cand_h, cand_a = theta_h - scale * step_h, theta_a - scale * step_a
            if cand_h > 0 and cand_a > 0:
                cand_m = closed_form_moments(cand_h, cand_a, kappa, rho)
                if check_positivity(cand_h, cand_a, cand_m):
                    cand_norm = math.sqrt((cand_m["eH"] - lambda_h) ** 2 + (cand_m["eA"] - lambda_a) ** 2)
                    if cand_norm < residual_norm or bt == THETA_MAX_BACKTRACK - 1:
                        theta_h, theta_a, residual_norm = cand_h, cand_a, cand_norm
                        accepted = True
                        break
            scale /= 2
        if not accepted:
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": False}
    return {"theta_h": theta_h, "theta_a": theta_a, "converged": False}


def main():
    payload = json.loads(sys.stdin.read())
    out = []
    for p in payload["points"]:
        solved = solve_theta_for_target_means(p["lambda_home"], p["lambda_away"], p["kappa"], p["rho"])
        if not solved["converged"]:
            out.append({"converged": False})
            continue
        theta_h, theta_a = solved["theta_h"], solved["theta_a"]
        m = closed_form_moments(theta_h, theta_a, p["kappa"], p["rho"])
        t = tau_dixon_coles(p["h"], p["a"], theta_h, theta_a, p["rho"])
        log_p = None
        if t > 0:
            log_p = log_joint_q(p["h"], p["a"], theta_h, theta_a, p["kappa"]) + math.log(t) - math.log(m["zdc"])
        out.append({
            "converged": True,
            "theta_h": theta_h, "theta_a": theta_a, "zdc": m["zdc"],
            "e_h": m["eH"], "e_a": m["eA"],
            "log_p": log_p if (log_p is not None and math.isfinite(log_p)) else None,
        })
    print(json.dumps({"results": out}))


if __name__ == "__main__":
    main()
