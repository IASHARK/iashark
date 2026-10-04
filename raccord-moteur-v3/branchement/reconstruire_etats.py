"""Reconstruit, pendant le run, les 2 fichiers d'états du moteur v3 qui ne sont pas dans git.

Côté site (dépôt iashark), aucune donnée brute n'est commitée. Le moteur v3 (copié dans moteur-v3/) a besoin de :
- etats/resultats_recents.csv : fenêtre de 4 ans de résultats (Dixon-Coles, forme, promus) ;
- etats/complement_forme.csv  : les 30 derniers matchs de chaque équipe AVANT cette fenêtre.
Les deux sont des extraits des fichiers publics et gratuits de football-data.co.uk, la source même du moteur
(il y télécharge déjà la saison en cours à chaque production, moteur/produire.py#telecharger). Ce script les
retélécharge (1 requête par seconde, pas de clé), les transforme avec LES FONCTIONS DU MOTEUR (aucune règle
réécrite) et applique exactement la découpe de moteur/etats.py#exporter à la date de coupure de
etats/constantes.json. Les fichiers téléchargés restent dans data/brut/football-data/ (ignoré par git, mis en
cache par GitHub Actions : une saison terminée ne change plus).

Emplacement (contre-controle de l'avocat du diable, 30/09/2026) : ce raccord est du code du SITE (public, sans
poids ni regle du moteur). Il vit dans raccord-moteur-v3/branchement/, HORS de moteur-v3/, pour que le dossier
moteur-v3/ puisse etre retire du depot public. Les workflows le copient dans le dossier du moteur utilise ce jour-la
(.moteur-v3-prive/ ou moteur-v3/) juste avant de le lancer.

Usage (depuis le dossier du moteur) :  python -m branchement.reconstruire_etats [--verifier DOSSIER_REFERENCE]
--verifier compare le résultat aux fichiers exportés par le moteur (même colonnes, mêmes valeurs).
"""
import os, sys, csv, json, time, argparse, urllib.request

import numpy as np
import pandas as pd

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)
from moteur import donnees as D  # noqa: E402
from moteur import produire as P  # noqa: E402
from moteur.etats import COLS_RECENTS  # noqa: E402

CACHE = os.path.join(RACINE, "data", "brut", "football-data")
ETATS = os.path.join(RACINE, "etats")
PREMIERE_SAISON = 1993
N_COMPLEMENT = 30  # moteur/etats.py#exporter : tail(30) par ligue et par côté
# Fichiers football-data écartés, comme dans l'historique du moteur : mmz4281/9394/P1.csv contient en réalité
# des matchs espagnols (Ath Bilbao, Albacete...). Trouvé par la comparaison du 28/09/2026.
EXCLUS = {("P1", 1993)}


def _code_saison(annee):
    return f"{annee % 100:02d}{(annee + 1) % 100:02d}"


def _telecharger(url, fichier, forcer=False):
    if os.path.exists(fichier) and os.path.getsize(fichier) > 0 and not forcer:
        return True
    for essai in (1, 2, 3):
        try:
            texte = P._get(url)
            os.makedirs(os.path.dirname(fichier), exist_ok=True)
            with open(fichier, "w") as f:
                f.write(texte)
            time.sleep(1)
            return True
        except Exception as e:  # saison absente (ligue non suivie cette année-là) ou réseau
            if essai == 3:
                print("  indisponible :", url, type(e).__name__)
                return False
            time.sleep(3)


def _lire_csv(fichier):
    """Lecture tolérante : les vieux fichiers football-data ont des lignes plus longues que l'en-tête
    (virgules finales). pandas les rejette ; on garde les colonnes de l'en-tête (rien n'est perdu)."""
    with open(fichier, encoding="utf-8", errors="replace", newline="") as f:
        lignes = [l for l in csv.reader(f) if any(c.strip() for c in l)]
    if not lignes:
        return pd.DataFrame()
    tete = [c.strip() for c in lignes[0]]
    n = len(tete)
    corps = [[c.strip() for c in (l + [""] * n)[:n]] for l in lignes[1:]]
    df = pd.DataFrame(corps, columns=tete, dtype=str).replace("", np.nan)
    return df.loc[:, [c for c in df.columns if c]]


def _id_europe(x, code, saison):
    base = x["date_iso"].astype(str) + "-" + x["HomeTeam"].astype(str).str.strip() + "-" + x["AwayTeam"].astype(str).str.strip()
    return ("FD-" + code + "-" + saison + "-" + base).str.replace(" ", "_", regex=False)


def charger(coupure):
    """Tous les résultats football-data des 12 ligues couvertes, avant la coupure, au format du moteur."""
    annee_courante = coupure.year - (coupure.month < 7)
    morceaux = []
    for code in P.EUROPE_FICHIERS:
        for annee in range(PREMIERE_SAISON, annee_courante + 1):
            if (code, annee) in EXCLUS:
                continue
            s = _code_saison(annee)
            f = os.path.join(CACHE, f"{s}_{code}.csv")
            if not _telecharger(f"{P.URL}/mmz4281/{s}/{code}.csv", f, forcer=(annee == annee_courante)):
                continue
            x = _lire_csv(f).dropna(how="all")
            if x.empty or "HomeTeam" not in x:
                continue
            x = P._format_fusionne_europe(x, code)
            # Saison = celle du fichier (une saison finie en juillet-aout 2020 reste 2019-2020).
            x["season"] = f"{annee}-{annee + 1}"
            x["match_id"] = _id_europe(x, code, s)
            morceaux.append(x)
    for code in P.EXTRA:
        f = os.path.join(CACHE, f"extra_{code}.csv")
        if not _telecharger(f"{P.URL}/new/{code}.csv", f, forcer=True):
            continue
        x = P._format_fusionne_extra(_lire_csv(f), code)
        x["season"] = x["season"].astype(str)
        base = x["date_iso"].astype(str) + "-" + x["HomeTeam"].astype(str).str.strip() + "-" + x["AwayTeam"].astype(str).str.strip()
        x["match_id"] = ("FD-" + code + "-" + x["season"] + "-" + base).str.replace(" ", "_", regex=False)
        morceaux.append(x)
    df = D.transformer(pd.concat(morceaux, ignore_index=True))
    return df[df["date"] < coupure].reset_index(drop=True)


def reconstruire(dossier=ETATS):
    const = json.load(open(os.path.join(dossier, "constantes.json")))
    coupure, debut = pd.Timestamp(const["coupure"]), pd.Timestamp(const["fenetre_debut"])
    df = charger(coupure)
    rec = df[df["date"] >= debut]
    avant = df[df["date"] < debut]
    idx = set()
    for cote in ("dom", "ext"):
        idx |= set(avant.sort_values("date").groupby(["ligue", cote]).tail(N_COMPLEMENT).index)
    comp = avant.loc[sorted(idx)]
    rec[COLS_RECENTS].to_csv(os.path.join(dossier, "resultats_recents.csv"), index=False)
    comp[COLS_RECENTS].to_csv(os.path.join(dossier, "complement_forme.csv"), index=False)
    print(f"états reconstruits : {len(rec)} résultats récents, {len(comp)} lignes de complément (coupure {coupure.date()})")
    return rec, comp


CLE = ["ligue", "date", "dom", "ext"]
VALEURS = ["bd", "be", "mtd", "mte", "tirs_d", "tirs_e", "cadres_d", "cadres_e", "corners_d", "corners_e",
           "fautes_d", "fautes_e", "jaunes_d", "jaunes_e", "rouges_d", "rouges_e"]


def comparer(nom, ref_fichier, nouveau_fichier):
    a = pd.read_csv(ref_fichier, low_memory=False)
    b = pd.read_csv(nouveau_fichier, low_memory=False)
    ka, kb = a[CLE].astype(str).agg("|".join, axis=1), b[CLE].astype(str).agg("|".join, axis=1)
    seul_ref, seul_neuf = sorted(set(ka) - set(kb)), sorted(set(kb) - set(ka))
    m = a.assign(k=ka).merge(b.assign(k=kb), on="k", suffixes=("_ref", "_neuf"))
    ecarts = {}
    for c in VALEURS + ["saison", "heure", "pli", "zone"]:
        x, y = m[c + "_ref"], m[c + "_neuf"]
        diff = ~((x.astype(str) == y.astype(str)) | (x.isna() & y.isna()) |
                 (pd.to_numeric(x, errors="coerce").sub(pd.to_numeric(y, errors="coerce")).abs() < 1e-9))
        if diff.any():
            ecarts[c] = int(diff.sum())
    print(f"{nom} : référence {len(a)} lignes, reconstruit {len(b)} ; seulement référence {len(seul_ref)}, "
          f"seulement reconstruit {len(seul_neuf)} ; valeurs différentes {ecarts or 'aucune'}")
    for k in seul_ref[:5]:
        print("   manque :", k)
    for k in seul_neuf[:5]:
        print("   en trop :", k)
    return {"ref": len(a), "neuf": len(b), "seul_ref": len(seul_ref), "seul_neuf": len(seul_neuf), "ecarts": ecarts}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verifier", help="dossier etats/ exporté par le moteur, pour comparaison")
    a = ap.parse_args()
    reconstruire()
    if a.verifier:
        for f in ("resultats_recents.csv", "complement_forme.csv"):
            comparer(f, os.path.join(a.verifier, f), os.path.join(ETATS, f))
