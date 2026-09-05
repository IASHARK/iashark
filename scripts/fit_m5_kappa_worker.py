#!/usr/bin/env python3
"""EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC_MEAN_PRESERVING) -
worker Python PERSISTANT pour le fit de kappa M5, MEME architecture deja
validee que scripts/fit_kappa_worker.py (M4) : import scipy UNE SEULE
FOIS, protocole JSONL (une ligne requete/reponse par cutoff, flush
explicite).

CORRECTIF MEAN-PRESERVATION (audit 2026-09-05, AVANT toute performance
reelle) : appliquer tau DC directement sur les intensites CIBLES
(lambdaH,lambdaA) puis normaliser par Zdc NE preserve PAS E[H]=lambdaH,
E[A]=lambdaA (jusqu'a ~3% d'ecart observe). Ce fitter resout desormais,
pour CHAQUE row et CHAQUE candidat kappa, des intensites INTERNES
thetaH/thetaA (jamais un parametre statistique appris - kappa reste le
SEUL parametre global) telles que la distribution finale
(shared-gamma+tau DC+Zdc) ait EXACTEMENT E[H]=lambdaH, E[A]=lambdaA.
rho reste FIXE (-0.0845, jamais reestime).

Formule (identique a lib/lab/shared-gamma-theta-solver.js, ecrite
independamment ici) :
    q(h,a|theta,kappa) = Gamma(h+a+kappa)/(Gamma(kappa)*h!*a!) * kappa^kappa * thetaH^h * thetaA^a / (kappa+thetaH+thetaA)^(h+a+kappa)
    tau(h,a) : MEME correction Dixon-Coles que M2, evaluee a theta (item 2)
    Zdc = 1 + sum_4_cellules_basses q(h,a)*(tau(h,a)-1)
    P_M5(h,a) = q(h,a)*tau(h,a)/Zdc
Moments fermes (E[H],E[A]) en O(1) via les 4 cellules basses (jamais une
somme sur toute la matrice) - solveur Newton 2D avec repli
"backtracking" borne, MEME algorithme que lib/lab/shared-gamma-theta-solver.js.

Si une row n'a pas de solution theta valide pour un candidat kappa donne,
ce kappa est traite comme une region INVALIDE de l'objectif (penalite
1e12) - la row n'est JAMAIS supprimee, JAMAIS remplacee par M2
silencieusement (item 14).

Entree (stdin, JSONL) : {"request_id": "...", "matches": [{"lambda_home":.., "lambda_away":.., "goals_home_90":.., "goals_away_90":..}, ...],
                         "eta_lower_bound": ..., "eta_upper_bound": ..., "eta_start": ...}
Sortie (stdout, JSONL) : {"request_id": "...", "kappa_hat": ..., ..., "theta_solve_failures_at_optimum": ...}
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
DEFAULT_ETA_LOWER = math.log(1.0)     # KAPPA_MIN_ROBUST=1.0 (item 8, pre-enregistre suite au stress test)
DEFAULT_ETA_UPPER = math.log(1e6)     # kappa <= 1e6
DEFAULT_ETA_START = math.log(10)      # kappa_start=10 PRE-ENREGISTRE
BOUNDARY_EPS = 1e-3

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
    # item 2 : tau evalue aux intensites INTERNES theta (jamais lambda directement)
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
        "eH": (theta_h + correction_h) / zdc,
        "eA": (theta_a + correction_a) / zdc,
        "zdc": zdc,
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
        return {"theta_h": None, "theta_a": None, "converged": False, "error_code": "M5_INVALID_PARAMETER_REGION"}

    theta_h, theta_a = lambda_h, lambda_a
    residual_norm = float("inf")

    for iteration in range(THETA_MAX_ITER):
        m = closed_form_moments(theta_h, theta_a, kappa, rho)
        if not check_positivity(theta_h, theta_a, m):
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": False, "error_code": "M5_INVALID_PARAMETER_REGION"}

        r_h = m["eH"] - lambda_h
        r_a = m["eA"] - lambda_a
        if abs(r_h) < THETA_TOL and abs(r_a) < THETA_TOL:
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": True, "iterations": iteration, "residual_h": r_h, "residual_a": r_a}

        m_h1 = closed_form_moments(theta_h + THETA_EPS, theta_a, kappa, rho)
        m_a1 = closed_form_moments(theta_h, theta_a + THETA_EPS, kappa, rho)
        d_h_d_th = (m_h1["eH"] - m["eH"]) / THETA_EPS
        d_h_d_ta = (m_a1["eH"] - m["eH"]) / THETA_EPS
        d_a_d_th = (m_h1["eA"] - m["eA"]) / THETA_EPS
        d_a_d_ta = (m_a1["eA"] - m["eA"]) / THETA_EPS
        det = d_h_d_th * d_a_d_ta - d_h_d_ta * d_a_d_th
        if abs(det) < 1e-14:
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": False, "error_code": "JACOBIAN_SINGULAR"}

        step_h = (r_h * d_a_d_ta - r_a * d_h_d_ta) / det
        step_a = (r_a * d_h_d_th - r_h * d_a_d_th) / det

        accepted = False
        scale = 1.0
        for _bt in range(THETA_MAX_BACKTRACK):
            cand_h = theta_h - scale * step_h
            cand_a = theta_a - scale * step_a
            if cand_h > 0 and cand_a > 0:
                cand_m = closed_form_moments(cand_h, cand_a, kappa, rho)
                if check_positivity(cand_h, cand_a, cand_m):
                    cand_norm = math.sqrt((cand_m["eH"] - lambda_h) ** 2 + (cand_m["eA"] - lambda_a) ** 2)
                    if cand_norm < residual_norm or _bt == THETA_MAX_BACKTRACK - 1:
                        theta_h, theta_a, residual_norm = cand_h, cand_a, cand_norm
                        accepted = True
                        break
            scale /= 2
        if not accepted:
            return {"theta_h": theta_h, "theta_a": theta_a, "converged": False, "error_code": "BACKTRACKING_EXHAUSTED"}

    final_m = closed_form_moments(theta_h, theta_a, kappa, rho)
    return {"theta_h": theta_h, "theta_a": theta_a, "converged": False, "error_code": "MAX_ITERATIONS_EXCEEDED",
            "residual_h": final_m["eH"] - lambda_h, "residual_a": final_m["eA"] - lambda_a}


def log_probability_m5(lambda_h, lambda_a, h, a, kappa, rho=CHAMPION_RHO):
    solved = solve_theta_for_target_means(lambda_h, lambda_a, kappa, rho)
    if not solved["converged"]:
        return None  # region invalide - jamais une valeur fabriquee
    theta_h, theta_a = solved["theta_h"], solved["theta_a"]
    t = tau_dixon_coles(h, a, theta_h, theta_a, rho)
    if t <= 0:
        return None
    m = closed_form_moments(theta_h, theta_a, kappa, rho)
    return log_joint_q(h, a, theta_h, theta_a, kappa) + math.log(t) - math.log(m["zdc"])


def negative_log_likelihood_eta(eta, matches):
    kappa = math.exp(eta)
    total = 0.0
    n = len(matches)
    n_invalid = 0
    for m in matches:
        lp = log_probability_m5(m["lambda_home"], m["lambda_away"], m["goals_home_90"], m["goals_away_90"], kappa)
        if lp is None:
            n_invalid += 1
            continue
        total += -lp
    if n_invalid > 0:
        return 1e12  # region invalide pour AU MOINS une row - jamais une row supprimee/remplacee silencieusement
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
        numerical_boundary_status = "KAPPA_LOWER_BOUND_HIT"
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
