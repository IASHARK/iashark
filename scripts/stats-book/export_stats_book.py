# -*- coding: utf-8 -*-
"""Export des STATS IASHARK (profils equipe / arbitre / ligue) pour les pages match.

Lancement (machine de Clement, jamais sur GitHub : le Book n'y est pas) :
    nice -n 19 "/Users/clement/Documents/IASHARK CLAUDE CODE/iashark-book/.venv/bin/python" \
        scripts/stats-book/export_stats_book.py [--sortie stats-book] [--fin AAAA-MM-JJ] [--avec-recent]

Sources (LECTURE SEULE, rien n'est ecrit dans iashark-book) :
  - Book, registre_site/evenements.parquet et registre_site/matchs.parquet (30/09/2026) : registre SEPARE des
    stats DESCRIPTIVES du site, construit par iashark-book/outils/b1 + b3 --tout-jusqu-a-hier avec les memes
    regles et les memes identifiants que le registre du Book, TOUS les matchs jusqu'a la veille de sa
    construction, empreinte SHA-256 dans registre_site/EMPREINTE.json (verifiee ici avant le calcul).
    Le registre du Book (registre/, coffre-fort au 01/07/2025) n'est plus lu : les strategies et le cerveau
    gardent leur regle, ce registre-ci ne sert qu'aux chiffres descriptifs des pages match.
    (buts, cartons, penaltys avec la convention « contre son camp » et le controle de coherence du Book ;
    corners du registre).
  - Book, travail/api/fixtures.parquet : identite des matchs (ligue, equipes par identifiant API-Football,
    arbitre, scores a la pause et a la fin).
  Periode glissante : 2 ans jusqu'a hier pour les equipes et les ligues, 3 ans pour les arbitres, bornee par la
  fin du registre_site (« un chiffre public = une source dans l'archive », controle historique-public).
  --avec-recent (ancien usage INTERNE, sans objet tant que le registre_site va jusqu'a hier) ajoute les matchs
  apres la fin du registre depuis
  travail/api/events et travail/api/statistics (fichiers API-Football jamais integres au registre), recodes
  ici avec les regles du Book. L'export s'arrete si ce recodage differe du registre sur plus de 0,5 % des
  matchs d'avril-juin 2025 (seuil fixe a l'avance), et sceller.js refuse ces fichiers tant que ces matchs ne
  sont pas dans le registre du Book.

Equipes : chaque profil ne compte QUE les matchs d'UN championnat (controle avocat du diable du 30/09/2026 :
Le Mans, en Ligue 1, n'avait que 5 matchs de Ligue 1 sur 70). Pour un match de championnat, la page prend le
profil de l'equipe dans CE championnat (rien sous le seuil, meme si l'equipe a beaucoup joue ailleurs). Pour un
match de coupe d'Europe, elle prend son dernier championnat, et le nom de ce championnat est ecrit a cote du
chiffre (rien pour un club dont le championnat n'est pas suivi par le site). Selections : leurs matchs officiels
(amicaux exclus), ecrit comme tel.

Empreinte des sources : calculee AVANT le calcul et recalculee a la fin ; si un fichier a change entre les deux,
arret, rien n'est ecrit.

Anti-fuite : ce sont des stats DESCRIPTIVES du passe. Chaque profil porte la date de son dernier match (« fin ») ;
un profil ne s'affiche que pour un match joue APRES cette date (lib/stats-book.js#profilUtilisable). Aucune donnee
de ces fichiers ne doit servir de variable au moteur pour un match anterieur a « fin ».
"""
import argparse, datetime as dt, hashlib, json, math, os, re, sys, unicodedata
from decimal import Decimal, ROUND_HALF_UP

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
from scipy import stats as sst

VERSION = "2.0.2"                # 2.0.1 (30/09/2026) : parts arrondies une seule fois, au pourcent
#                                  2.0.2 (30/09/2026) : parts d'un meme bloc a 100 % (plus grand reste, parts_bloc)
BOOK = "/Users/clement/Documents/IASHARK CLAUDE CODE/iashark-book"
REG = os.path.join(BOOK, "registre_site")   # 30/09/2026 : registre des stats du site (voir en tete)
API = os.path.join(BOOK, "travail", "api")
EMPREINTE_REG = os.path.join(REG, "EMPREINTE.json")


def fin_registre():
    """Dernier jour inclus du registre_site : la veille de sa construction (EMPREINTE.json, « matchs_avant_le »)."""
    e = json.load(open(EMPREINTE_REG, encoding="utf-8"))
    return (dt.date.fromisoformat(e["matchs_avant_le"]) - dt.timedelta(days=1)).isoformat()


FIN_BOOK = fin_registre()        # le registre s'arrete la (nom garde : « fin de l'archive »)
ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))

SEUIL_EQUIPE = 15                # matchs minimum pour un profil d'equipe (tout, domicile, exterieur)
SEUIL_SOUS_GROUPE = 30           # chaque cas « a la pause » (15 donnait « defaite 88 % sur 17 matchs »)
SEUIL_ARBITRE = 30
SEUIL_LIGUE = 30
# Controle du recodage API contre le registre (avril-juin 2025), FIXE AVANT TOUT CALCUL (30/09/2026) :
# au-dela de 0,5 % de matchs differents, ou sous 500 matchs compares, arret sans rien ecrire.
SEUIL_RECOUVREMENT = 0.005
MIN_RECOUVREMENT = 500
# Arbitre : trois lignes (cartons, rouges, penaltys) comparees ensemble a l'attendu. Chaque marge est
# prise au niveau 1 - 0,05/3 (Bonferroni) : l'ensemble reste juste 95 fois sur 100.
ALPHA_ARBITRE = 0.05 / 3
FENETRE_EQUIPE_J = 730           # 2 ans
FENETRE_LIGUE_J = 730
FENETRE_ARBITRE_J = 1095         # 3 ans
AMICAUX = {10, 667}              # matchs amicaux exclus
INTERNATIONAL = [1, 4, 5, 32]    # competitions de selections presentes sur le site
EUROPE = [2, 3, 848]             # coupes d'Europe des clubs presentes sur le site
TRANCHES = ["1-15", "16-30", "31-45+", "46-60", "61-75", "76-90+"]
BUTS = ("but", "but_penalty", "but_csc")


def log(*a):
    print(*a, flush=True)


def memoire_ok():
    """> 1,5 Go de memoire disponible et > 3 Go de disque, sinon on attend (regle de la machine)."""
    import shutil, subprocess, time
    for _ in range(30):
        libre_disque = shutil.disk_usage("/").free / 1e9
        # posix_spawn (chemin absolu, close_fds=False) plutot qu'un fork : un fork depuis un
        # processus dont pyarrow a lance des fils d'execution a deja bloque sous macOS (30/09/2026).
        vm = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, text=True, close_fds=False).stdout
        pages = sum(int(re.search(r"(\d+)", l.split(":")[1]).group(1)) for l in vm.splitlines()
                    if l.startswith(("Pages free", "Pages inactive", "Pages speculative")))
        libre_mem = pages * 4096 / 1e9
        if libre_disque > 3 and libre_mem > 1.5:
            return
        log(f"attente : disque {libre_disque:.1f} Go, memoire {libre_mem:.1f} Go")
        time.sleep(120)
    sys.exit("ressources insuffisantes, arret propre")


def sha256(chemin):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def cle_arbitre(nom):
    """Cle stable d'un arbitre : initiale du prenom + nom de famille, sans accent ni pays.
    L'API ecrit le meme arbitre de plusieurs facons (30/09/2026, sur 3 ans : « F. Letexier » 205 fois,
    « Francois Letexier, France » 93, « François Letexier, France » 17) : toutes donnent « f letexier ».
    Risque accepte : deux arbitres de meme initiale et meme nom seraient confondus (rare, a surveiller)."""
    if not isinstance(nom, str) or not nom.strip():
        return None
    s = nom.split(",")[0]
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    mots = re.sub(r"[^a-z]+", " ", s).split()
    if not mots:
        return None
    if len(mots) == 1:
        return mots[0]
    return mots[0][0] + " " + " ".join(mots[1:])


def nom_arbitre(noms):
    """Nom affiche : la forme complete la plus frequente (« Francois Letexier » plutot que « F. Letexier »)."""
    vc = noms[noms.str.len() > 0].value_counts()
    if not len(vc):
        return None
    complets = [n for n in vc.index if len(n.split()[0].strip(".")) > 1]
    return complets[0] if complets else vc.index[0]


def arrondi_part(x):
    """Une part arrondie UNE SEULE FOIS, au pourcent pres (ce que la page affiche) : 0.99478 -> 0.99.
    4e relecture du 30/09/2026 : garder 3 decimales puis arrondir a l'entier sur la page faisait DEUX
    arrondis (0.99478 -> 0.995 -> « 100 % », « victoire 97 % (85 a 100 %) » alors qu'un nul a eu lieu).
    Demi vers le haut, comme la page (Intl.NumberFormat) : 0.125 -> 0.13."""
    return float(Decimal(repr(float(x))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def wilson(k, n):
    if n <= 0:
        return None
    p = k / n
    z = 1.96
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [arrondi_part(p), arrondi_part(max(0, c - m)), arrondi_part(min(1, c + m))]


def parts_bloc(ks, n):
    """Parts d'UN bloc qui se partage les memes n matchs (a ouvert le score / a encaisse le premier but / 0-0 ;
    victoire / nul / defaite) : [valeur, bas, haut] pour chacune, dans l'ordre de ks.
    5e relecture du 30/09/2026 : arrondies chacune a part, les trois parts du PSG faisaient 79 + 19 + 1 = 99 %.
    Valeurs arrondies au pourcent par la methode du PLUS GRAND RESTE : on prend la partie entiere de chaque
    pourcentage, puis on donne les points manquants, un par un, aux plus grands restes (a egalite : la plus
    grande part, puis l'ordre du bloc). Le bloc fait toujours exactement 100 %, une part de 0 match reste a 0 %,
    et un bloc que l'arrondi simple mettait deja a 100 % ne change pas. Calcul en entiers (aucune erreur de
    virgule). Les marges (Wilson) restent arrondies une fois chacune et contiennent toujours la valeur affichee."""
    if n <= 0:
        return [None for _ in ks]
    ks = [int(k) for k in ks]
    if sum(ks) != n or min(ks) < 0:
        raise ValueError(f"bloc incomplet : {ks} ne fait pas {n} matchs")
    cent = [100 * k // n for k in ks]
    restes = [100 * k % n for k in ks]
    manque = 100 - sum(cent)
    for i in sorted(range(len(ks)), key=lambda i: (-restes[i], -ks[i], i))[:manque]:
        cent[i] += 1
    out = []
    for k, c in zip(ks, cent):
        _, bas, haut = wilson(k, n)
        p = arrondi_part(c / 100)
        out.append([p, min(bas, p), max(haut, p)])
    return out


def moyenne(x):
    """Moyenne par match et sa marge a 95 % ; [valeur, bas, haut] et le nombre de matchs REELLEMENT utilises.
    Tout ce qu'on moyenne ici est un comptage (buts, corners, cartons) : la borne basse ne descend pas sous 0."""
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 2:
        return None, n
    m = x.mean()
    e = 1.96 * x.std(ddof=1) / math.sqrt(n)
    return [round(m, 2), round(max(0.0, m - e), 2), round(m + e, 2)], n


def marge_comptage(x, alpha):
    """Moyenne par match d'un comptage et sa marge au niveau 1 - alpha : la PLUS LARGE de la marge exacte de
    Poisson (juste pour les evenements rares : rouges, penaltys ; jamais negative) et de la marge tiree de la
    variance observee (juste quand les matchs varient plus qu'une loi de Poisson : cartons)."""
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    k = float(x.sum())
    bas_p = sst.chi2.ppf(alpha / 2, 2 * k) / 2 / n if k > 0 else 0.0
    haut_p = sst.chi2.ppf(1 - alpha / 2, 2 * k + 2) / 2 / n
    m = k / n
    e = sst.norm.ppf(1 - alpha / 2) * x.std(ddof=1) / math.sqrt(n)
    return m, max(0.0, min(bas_p, m - e)), max(haut_p, m + e)


def tranche(minute, arrets):
    m = np.asarray(minute, dtype=float)
    return np.select([m <= 15, m <= 30, m <= 45, m <= 60, m <= 75, m <= 90], [0, 1, 2, 3, 4, 5], -1)


# ------------------------------------------------------------------ 1. matchs
def charger_matchs(fin, debut, qualite):
    t = pq.read_table(os.path.join(API, "fixtures.parquet"),
                      columns=["fixture_id", "date_utc", "statut", "league_id", "ligue_api", "pays_api", "saison_api",
                               "dom_id", "dom_api", "ext_id", "ext_api", "mtd", "mte", "bd", "be", "arbitre_api"])
    d = pc.utf8_slice_codeunits(t["date_utc"], 0, 10)
    t = t.append_column("date", d)
    t = t.filter(pc.and_(pc.greater_equal(d, debut), pc.less_equal(d, fin)))
    M = t.to_pandas()
    qualite["fixtures_fenetre"] = int(len(M))
    qualite["statuts_exclus"] = {k: int(v) for k, v in M[M.statut != "FT"].statut.value_counts().items()}
    M = M[M.statut == "FT"]                                  # reportes, annules, prolongations, tirs au but : exclus
    M = M[~M.league_id.isin(AMICAUX)]
    avant = len(M)
    M = M.drop_duplicates("fixture_id")
    qualite["doublons_fixture"] = int(avant - len(M))
    avant = len(M)
    M = M.dropna(subset=["bd", "be", "dom_id", "ext_id"])
    M = M[(M.bd >= 0) & (M.be >= 0) & (M.bd <= 15) & (M.be <= 15) & (M.dom_id != M.ext_id)]
    qualite["scores_absents_ou_aberrants"] = int(avant - len(M))
    # meme affiche le meme jour (doublon sous deux identifiants)
    avant = len(M)
    M = M.drop_duplicates(["date", "dom_id", "ext_id"])
    qualite["doublons_affiche_jour"] = int(avant - len(M))
    mt_ok = M.mtd.notna() & M.mte.notna() & (M.mtd <= M.bd) & (M.mte <= M.be)
    qualite["mi_temps_incoherente_ou_absente"] = int((~mt_ok).sum())
    M.loc[~mt_ok, ["mtd", "mte"]] = np.nan
    M["dom_id"] = M.dom_id.astype(int)
    M["ext_id"] = M.ext_id.astype(int)
    M["arbitre"] = M.arbitre_api.map(cle_arbitre)
    M["arbitre_nom"] = M.arbitre_api.fillna("").str.split(",").str[0].str.strip()
    M["source"] = np.where(M.date <= FIN_BOOK, "book", "recent")
    return M.drop(columns=["arbitre_api", "date_utc", "statut"])


# ------------------------------------------------------------------ 2. evenements
def evenements_book(ids):
    """Buts, penaltys rates et cartons du registre (convention CSC et coherence du Book)."""
    f = pq.ParquetFile(os.path.join(REG, "evenements.parquet"))
    cols = ["fixture_id", "ordre", "minute", "arrets", "nature", "cote_acteur", "coherent_score"]
    ids_a = pa.array(sorted(ids), type=pa.int64())
    morceaux, cohs = [], []
    for rg in range(f.num_row_groups):
        memoire_ok()
        t = f.read_row_group(rg, columns=cols)
        t = t.filter(pc.is_in(t["fixture_id"], value_set=ids_a))
        # coherence lue sur TOUS les evenements du match (un 0-0 sans carton reste un match avec evenements)
        cohs.append(t.select(["fixture_id", "coherent_score"]).to_pandas().drop_duplicates("fixture_id"))
        t = t.filter(pc.is_in(t["nature"], value_set=pa.array(list(BUTS) + ["penalty_rate", "jaune", "rouge"])))
        morceaux.append(t.to_pandas())
    E = pd.concat(morceaux, ignore_index=True)
    E = E.rename(columns={"cote_acteur": "cote"})
    coh = pd.concat(cohs).drop_duplicates("fixture_id").set_index("fixture_id").coherent_score.fillna(False).astype(bool)
    return E.drop(columns=["coherent_score"]), coh


def normaliser_api(E, M, avec_ev):
    """Memes regles que iashark-book/outils/b3_registre.py (natures, convention CSC choisie sur les donnees).
    avec_ev : matchs dont le fichier d'evenements n'est pas vide (tous types confondus)."""
    E = E[E.ordre >= 0].drop_duplicates(["fixture_id", "ordre"])
    E = E[~E.commentaire.fillna("").str.contains("Shootout", case=False)]
    info = M.set_index("fixture_id")[["dom_id", "ext_id", "bd", "be"]]
    E = E.join(info, on="fixture_id")
    E["cote"] = np.where(E.team_id == E.dom_id, "dom", np.where(E.team_id == E.ext_id, "ext", None))
    E["arrets"] = E.arrets.fillna(0).astype(int)
    d = E.detail.fillna("")
    E["nature"] = np.select(
        [(E.type == "Goal") & (d == "Normal Goal"), (E.type == "Goal") & (d == "Penalty"),
         (E.type == "Goal") & (d == "Own Goal"), (E.type == "Goal") & d.str.contains("Missed"),
         (E.type == "Card") & d.str.contains("Yellow") & ~d.str.contains("Second"),
         (E.type == "Card") & (d.str.contains("Red") | d.str.contains("Second"))],
        ["but", "but_penalty", "but_csc", "penalty_rate", "jaune", "rouge"], "autre")
    E = E[E.nature != "autre"]
    buts = E[E.nature.isin(BUTS) & (E.minute <= 90)]

    def taux(benef):
        c = np.where((buts.nature == "but_csc") & (not benef), np.where(buts.cote == "dom", "ext", "dom"), buts.cote)
        s = pd.DataFrame({"f": buts.fixture_id, "c": c}).value_counts().unstack(fill_value=0)
        s = s.reindex(columns=["dom", "ext"], fill_value=0).reindex(avec_ev, fill_value=0)
        s = s.join(info[["bd", "be"]])
        return ((s.dom == s.bd) & (s.ext == s.be)).mean()

    benef = taux(True) >= taux(False)
    if not benef:
        csc = E.nature == "but_csc"
        E.loc[csc, "cote"] = np.where(E.loc[csc, "cote"] == "dom", "ext", "dom")
    g = E[E.nature.isin(BUTS) & (E.minute <= 90)].groupby(["fixture_id", "cote"]).size().unstack(fill_value=0)
    g = g.reindex(columns=["dom", "ext"], fill_value=0).reindex(avec_ev, fill_value=0)
    g = g.join(info[["bd", "be"]])
    coh = (g.dom == g.bd) & (g.ext == g.be)
    return E[["fixture_id", "ordre", "minute", "arrets", "nature", "cote"]], coh, benef


def evenements_api(ids, M):
    dset = ds.dataset(os.path.join(API, "events"))
    ids_a = pa.array(sorted(ids), type=pa.int64())
    morceaux, tous = [], []
    for frag in dset.get_fragments():
        memoire_ok()
        u = frag.to_table(columns=["fixture_id", "ordre"], filter=ds.field("fixture_id").isin(ids_a) & (ds.field("ordre") >= 0))
        tous.append(pc.unique(u["fixture_id"]).to_pandas())
        t = frag.to_table(columns=["fixture_id", "ordre", "minute", "arrets", "team_id", "type", "detail", "commentaire"],
                          filter=ds.field("fixture_id").isin(ids_a) & ds.field("type").isin(["Goal", "Card"]))
        if t.num_rows:
            morceaux.append(t.to_pandas())
    if not morceaux:
        return pd.DataFrame(columns=["fixture_id", "ordre", "minute", "arrets", "nature", "cote"]), pd.Series(dtype=bool), True
    avec_ev = pd.Index(sorted(set(pd.concat(tous))))
    return normaliser_api(pd.concat(morceaux, ignore_index=True), M, avec_ev)


def corners(M):
    """Corners par equipe : registre du Book (<= 30/06/2025), statistiques API-Football ensuite."""
    m = pq.read_table(os.path.join(REG, "matchs.parquet"), columns=["fixture_id", "corners_d", "corners_e"]).to_pandas()
    m = m.dropna(subset=["fixture_id"]).drop_duplicates("fixture_id")
    m["fixture_id"] = m.fixture_id.astype(np.int64)
    book = M[M.source == "book"][["fixture_id"]].merge(m, on="fixture_id", how="left")
    parts = [book[["fixture_id", "corners_d", "corners_e"]]]
    r = M[M.source == "recent"][["fixture_id", "dom_id", "ext_id"]]
    if len(r):                                               # --avec-recent seulement (hors archive)
        s = ds.dataset(os.path.join(API, "statistics")).to_table(columns=["fixture_id", "team_id", "corner_kicks"]).to_pandas()
        s = s.dropna().drop_duplicates(["fixture_id", "team_id"])
        r = r.merge(s.rename(columns={"team_id": "dom_id", "corner_kicks": "corners_d"}), on=["fixture_id", "dom_id"], how="left")
        r = r.merge(s.rename(columns={"team_id": "ext_id", "corner_kicks": "corners_e"}), on=["fixture_id", "ext_id"], how="left")
        parts.append(r[["fixture_id", "corners_d", "corners_e"]])
    c = pd.concat(parts)
    bad = (c.corners_d < 0) | (c.corners_e < 0) | (c.corners_d > 25) | (c.corners_e > 25)
    c.loc[bad, ["corners_d", "corners_e"]] = np.nan
    return c.set_index("fixture_id"), int(bad.sum())


# ------------------------------------------------------------------ 3. table par match
def table_matchs(M, E, coh):
    M = M.copy()
    M["ev_ok"] = M.fixture_id.map(coh).fillna(False).astype(bool)
    E = E[E.fixture_id.isin(M.fixture_id[M.ev_ok])].copy()
    E["t"] = E.minute + E.arrets / 100.0
    E = E.sort_values(["fixture_id", "t", "ordre"])
    B = E[E.nature.isin(BUTS) & (E.minute <= 90)].copy()
    B["tr"] = tranche(B.minute, B.arrets)
    for cote in ("dom", "ext"):
        g = B[B.cote == cote].groupby(["fixture_id", "tr"]).size().unstack(fill_value=0).reindex(columns=range(6), fill_value=0)
        for k in range(6):
            M[f"b{k}_{cote[0]}"] = M.fixture_id.map(g[k]).fillna(0)
    prem = B.drop_duplicates("fixture_id").set_index("fixture_id").cote
    M["premier"] = M.fixture_id.map(prem)                       # dom / ext / NaN (0-0)
    C = E[E.nature.isin(["jaune", "rouge"])]
    for cote in ("dom", "ext"):
        M[f"cartons_{cote[0]}"] = M.fixture_id.map(C[C.cote == cote].groupby("fixture_id").size()).fillna(0)
        M[f"rouges_{cote[0]}"] = M.fixture_id.map(C[(C.cote == cote) & (C.nature == "rouge")].groupby("fixture_id").size()).fillna(0)
    P = E[E.nature.isin(["but_penalty", "penalty_rate"])]
    M["penaltys"] = M.fixture_id.map(P.groupby("fixture_id").size()).fillna(0)
    cols_ev = [c for c in M.columns if re.match(r"b\d_[de]$", c)] + ["cartons_d", "cartons_e", "rouges_d", "rouges_e", "penaltys"]
    M.loc[~M.ev_ok, cols_ev + ["premier"]] = np.nan
    aberrant = (M.cartons_d > 12) | (M.cartons_e > 12)
    M.loc[aberrant, ["cartons_d", "cartons_e", "rouges_d", "rouges_e"]] = np.nan
    return M, int(aberrant.sum())


def vue_equipe(M, tid):
    """Une ligne par match, du point de vue de l'equipe : pour / contre."""
    d = M[M.dom_id == tid].copy(); d["lieu"] = "dom"
    e = M[M.ext_id == tid].copy(); e["lieu"] = "ext"
    out = []
    for x, moi, lui in ((d, "d", "e"), (e, "e", "d")):
        y = pd.DataFrame({"date": x.date, "lieu": x.lieu, "ev_ok": x.ev_ok,
                          "bp": x["b" + moi], "bc": x["b" + lui], "mtp": x["mt" + moi], "mtc": x["mt" + lui],
                          "cp": x["corners_" + moi], "cc": x["corners_" + lui],
                          "cartons": x["cartons_" + moi], "cartons_adv": x["cartons_" + lui],
                          "premier": np.where(x.premier.isna(), np.where(x.ev_ok, "aucun", None),
                                              np.where(x.premier == ("dom" if moi == "d" else "ext"), "moi", "lui"))})
        for k in range(6):
            y[f"p{k}"] = x[f"b{k}_{moi}"]; y[f"c{k}"] = x[f"b{k}_{lui}"]
        out.append(y)
    return pd.concat(out, ignore_index=True)


def profil_equipe(V):
    """Profil d'UN championnat (V ne contient que ses matchs). Chaque chiffre porte sa marge a 95 %
    et le nombre de matchs reellement utilises."""
    r = {"n": int(len(V))}
    if len(V) < SEUIL_EQUIPE:
        return None
    r["bp"], _ = moyenne(V.bp); r["bc"], _ = moyenne(V.bc)
    ev = V[V.ev_ok]
    if len(ev) >= SEUIL_EQUIPE:
        n = len(ev)
        r["tranches"] = {"n": n,
                         "pour": [moyenne(ev[f"p{k}"])[0] for k in range(6)],
                         "contre": [moyenne(ev[f"c{k}"])[0] for k in range(6)]}
        marque, encaisse, zero = parts_bloc([(ev.premier == "moi").sum(), (ev.premier == "lui").sum(),
                                             (ev.premier == "aucun").sum()], n)
        r["premier_but"] = {"n": n, "marque": marque, "encaisse": encaisse, "zero_zero": zero}
        tard = (ev.p5 + ev.c5) > 0
        r["apres_75"] = {"n": n, "match_avec_but": wilson(int(tard.sum()), n),
                         "pour": moyenne(ev.p5)[0], "contre": moyenne(ev.c5)[0]}
        m, k = moyenne(ev.cartons)
        if k >= SEUIL_EQUIPE:
            r["cartons"] = {"n": k, "pour": m, "adverse": moyenne(ev.cartons_adv)[0]}
    mt = V.dropna(subset=["mtp", "mtc"])
    pause = {}
    for nom, sel in (("mene", mt.mtp > mt.mtc), ("egalite", mt.mtp == mt.mtc), ("menee", mt.mtp < mt.mtc)):
        g = mt[sel]
        if len(g) >= SEUIL_SOUS_GROUPE:
            n = len(g)
            v, nul, d = parts_bloc([(g.bp > g.bc).sum(), (g.bp == g.bc).sum(), (g.bp < g.bc).sum()], n)
            pause[nom] = {"n": n, "v": v, "nul": nul, "d": d}
    if pause:
        r["pause"] = pause
    c = V.dropna(subset=["cp", "cc"])
    if len(c) >= SEUIL_EQUIPE:
        r["corners"] = {"n": int(len(c)), "pour": moyenne(c.cp)[0], "contre": moyenne(c.cc)[0]}
    r["debut"] = str(V.date.min()); r["fin"] = str(V.date.max())
    return r


def profil_ligue(L):
    """Profil d'une ligue sur UNE seule base de matchs (relecture du 30/09/2026 : la meme carte ecrivait « sur 605
    matchs » puis « sur 606 matchs »). Base : les matchs ou tout est connu, evenements controles (ev_ok), cartons
    non aberrants et corners. Si les corners manquent sur plus de 5 % de ces matchs (source sans corners), la base
    reste celle des evenements et les corners gardent leur propre nombre de matchs (la page l'ecrit a part)."""
    ok = L.ev_ok & L.cartons_d.notna() & L.cartons_e.notna()
    avec_c = ok & L.corners_d.notna() & L.corners_e.notna()
    corners_dans_base = int(avec_c.sum()) >= 0.95 * int(ok.sum())
    base = L[avec_c] if corners_dans_base else L[ok]
    n = len(base)
    if n < SEUIL_LIGUE:
        return None
    tot = base.bd + base.be
    dom, nul, ext = parts_bloc([(base.bd > base.be).sum(), (base.bd == base.be).sum(), (base.bd < base.be).sum()], n)
    r = {"n": int(n), "buts": moyenne(tot)[0], "plus_2_5": wilson(int((tot > 2.5).sum()), n),
         "btts": wilson(int(((base.bd > 0) & (base.be > 0)).sum()), n),
         "dom": dom, "nul": nul, "ext": ext}
    r["tranches"] = {"n": int(n), "buts": [moyenne(base[f"b{i}_d"] + base[f"b{i}_e"])[0] for i in range(6)]}
    r["premier_but_dom"] = wilson(int((base.premier == "dom").sum()), n)
    r["zero_zero"] = wilson(int(base.premier.isna().sum()), n)
    r["apres_75"] = wilson(int(((base.b5_d + base.b5_e) > 0).sum()), n)
    r["cartons"] = {"n": int(n), "m": moyenne(base.cartons_d + base.cartons_e)[0]}
    r["penaltys"] = {"n": int(n), "m": moyenne(base.penaltys)[0]}
    c = base if corners_dans_base else L[avec_c]
    if len(c) >= SEUIL_LIGUE:
        r["corners"] = {"n": int(len(c)), "m": moyenne(c.corners_d + c.corners_e)[0]}
    r["debut"] = str(base.date.min()); r["fin"] = str(base.date.max())
    return r


def profils_arbitres(M):
    """Cartons, rouges, penaltys par match face a l'attendu = moyenne de la ligue et de la saison de chacun de ses matchs.
    Marge : marge_comptage au niveau 1 - ALPHA_ARBITRE (trois lignes testees ensemble). Un ecart n'est « net » que si
    l'attendu sort de cette marge. A TRANCHER par le mathematicien (30/09/2026) : l'attendu compte aussi les matchs de
    l'arbitre lui-meme, et les arbitres ne sont pas tires au hasard selon les affiches."""
    ev = M[M.ev_ok & M.arbitre.notna()].copy()
    ev["cartons"] = ev.cartons_d + ev.cartons_e
    ev["rouges"] = ev.rouges_d + ev.rouges_e
    base = M[M.ev_ok].assign(cartons=M.cartons_d + M.cartons_e, rouges=M.rouges_d + M.rouges_e)
    ref = base.groupby(["league_id", "saison_api"])[["cartons", "rouges", "penaltys"]].mean()
    ev = ev.join(ref, on=["league_id", "saison_api"], rsuffix="_att")
    out = {}
    for cle, g in ev.groupby("arbitre"):
        g = g.dropna(subset=["cartons", "cartons_att"])
        n = len(g)
        if n < SEUIL_ARBITRE:
            continue
        p = {"nom": nom_arbitre(g.arbitre_nom), "n": int(n), "debut": str(g.date.min()), "fin": str(g.date.max())}
        for s in ("cartons", "rouges", "penaltys"):
            m, bas, haut = marge_comptage(g[s], ALPHA_ARBITRE)
            a = float(g[s + "_att"].mean())
            ecart = [round(m - a, 2), round(bas - a, 2), round(haut - a, 2)]
            p[s] = {"m": [round(m, 2), round(bas, 2), round(haut, 2)], "attendu": round(a, 2), "ecart": ecart,
                    "net": bool(ecart[1] > 0 or ecart[2] < 0)}
        p["niveau_marge"] = "simultane_95"
        p["ligue_principale"] = int(g.league_id.mode().iat[0])
        out[cle] = p
    return out


# ------------------------------------------------------------------ 4. controle registre / recodage API
def controle_recouvrement(M):
    """Sur avril-juin 2025, le recodage API doit redonner les memes buts par tranche que le registre du Book."""
    S = M[(M.date >= "2025-04-01") & (M.date <= FIN_BOOK)]
    ids = set(S.fixture_id)
    Eb, cb = evenements_book(ids)
    Ea, ca, _ = evenements_api(ids, S)
    commun = sorted(set(cb[cb == True].index) & set(ca[ca == True].index))
    def sig(E):
        B = E[E.fixture_id.isin(commun) & E.nature.isin(BUTS) & (E.minute <= 90)].copy()
        B["tr"] = tranche(B.minute, B.arrets)
        return B.groupby(["fixture_id", "cote", "tr"]).size()
    a, b = sig(Eb), sig(Ea)
    j = pd.concat([a.rename("a"), b.rename("b")], axis=1).fillna(0)
    diff = j[j.a != j.b].index.get_level_values(0).nunique()
    n = len(commun)
    return {"matchs_compares": n, "matchs_differents": int(diff), "taux_differents": round(diff / n, 5) if n else None,
            "seuil": SEUIL_RECOUVREMENT, "minimum_compares": MIN_RECOUVREMENT,
            "coherents_book": int((cb == True).sum()), "coherents_recodage": int((ca == True).sum())}


def empreinte_sources(avec_recent):
    """SHA-256 de chaque fichier du Book lu par l'export, et l'empreinte de l'ensemble."""
    rels = ["registre_site/matchs.parquet", "registre_site/evenements.parquet", "registre_site/EMPREINTE.json",
            "travail/api/fixtures.parquet"]
    if avec_recent:
        for sous in ("events", "statistics"):
            for dossier, _, fichiers in os.walk(os.path.join(API, sous)):
                for f in fichiers:
                    if f.endswith(".parquet"):
                        rels.append(os.path.relpath(os.path.join(dossier, f), BOOK))
    sources = {rel: sha256(os.path.join(BOOK, rel)) for rel in sorted(rels)}
    return sources, hashlib.sha256(json.dumps(sources, sort_keys=True).encode()).hexdigest()


# ------------------------------------------------------------------ 5. profils d'equipe par championnat
def profils_equipes(ME, championnats, noms, noms_ligues):
    """Clubs : un profil par (equipe, championnat), calcule sur les SEULS matchs de ce championnat.
    Selections : leurs matchs officiels entre selections (amicaux deja exclus), ranges dans la competition de
    selections du site qu'elles ont le plus jouee.
    Renvoie {ligue: {id_equipe: profil}}, l'index id_equipe -> fichier pour les matchs de coupe d'Europe et de
    selections (dernier championnat joue ; jamais un championnat plus ancien si le dernier est sous le seuil),
    et le nombre de profils sous le seuil."""
    par_ligue = {lg: {} for lg in championnats + INTERNATIONAL}
    index, sous_seuil = {}, 0

    def complet(V, tid, lg_nom, comp):
        p = {"nom": noms.get(tid), "championnat": comp, "championnat_nom": lg_nom,
             "tout": profil_equipe(V), "dom": profil_equipe(V[V.lieu == "dom"]), "ext": profil_equipe(V[V.lieu == "ext"])}
        return None if p["tout"] is None else {k: v for k, v in p.items() if v is not None or k == "championnat_nom"}

    for lg in championnats:
        L = ME[ME.league_id == lg]
        for tid in sorted(set(L.dom_id) | set(L.ext_id)):
            p = complet(vue_equipe(L, tid), tid, noms_ligues.get(lg), int(lg))
            if p is None:
                sous_seuil += 1
                continue
            par_ligue[lg][str(tid)] = p
    C = ME[ME.league_id.isin(championnats)]
    long = pd.concat([C[["date", "dom_id", "league_id"]].rename(columns={"dom_id": "t"}),
                      C[["date", "ext_id", "league_id"]].rename(columns={"ext_id": "t"})])
    dernier = long.sort_values("date").drop_duplicates("t", keep="last").set_index("t").league_id
    for tid, lg in dernier.items():
        if str(tid) in par_ligue[int(lg)]:
            index[str(tid)] = int(lg)
    # selections
    N = ME[ME.league_id.isin(INTERNATIONAL)]
    long = pd.concat([N[["dom_id", "league_id"]].rename(columns={"dom_id": "t"}), N[["ext_id", "league_id"]].rename(columns={"ext_id": "t"})])
    rattache = long.groupby(["t", "league_id"]).size().reset_index(name="k").sort_values(["t", "k"], ascending=[True, False]) \
        .drop_duplicates("t").set_index("t").league_id
    for tid, lg in rattache.items():
        p = complet(vue_equipe(ME, tid), tid, None, "selections")   # une selection ne joue que des matchs de selections
        if p is None:
            sous_seuil += 1
            continue
        par_ligue[int(lg)][str(tid)] = p
        index[str(tid)] = int(lg)
    return par_ligue, index, sous_seuil


# ------------------------------------------------------------------ 6. principal
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sortie", default=os.path.join(RACINE, "stats-book"))
    ap.add_argument("--fin", default=None, help="dernier jour inclus (defaut : hier, borne par la fin du registre_site)")
    ap.add_argument("--avec-recent", action="store_true",
                    help="USAGE INTERNE : ajouter les matchs apres le 30/06/2025 (hors archive, sceller.js les refuse)")
    a = ap.parse_args()
    maintenant = dt.datetime.now(dt.timezone.utc)
    fin = a.fin or (maintenant.date() - dt.timedelta(days=1)).isoformat()
    if not a.avec_recent:
        fin = min(fin, FIN_BOOK)
    if fin >= maintenant.date().isoformat():
        sys.exit("fin doit etre strictement avant aujourd'hui (UTC) : aucun match du jour ni du futur")
    recent = fin > FIN_BOOK
    fin_d = dt.date.fromisoformat(fin)
    debut = (fin_d - dt.timedelta(days=max(FENETRE_EQUIPE_J, FENETRE_ARBITRE_J, FENETRE_LIGUE_J))).isoformat()
    memoire_ok()
    # Empreinte des sources AVANT le calcul (recalculee a la fin : si un fichier a change entre-temps, arret).
    sources, empreinte = empreinte_sources(recent)
    log("empreinte des sources (debut) :", empreinte)
    # Le registre_site lu doit etre EXACTEMENT celui de son empreinte (sinon il a change depuis sa construction).
    emp_reg = json.load(open(EMPREINTE_REG, encoding="utf-8"))
    for nom in ("matchs.parquet", "evenements.parquet"):
        if emp_reg["fichiers_sha256"].get(nom) != sources["registre_site/" + nom]:
            sys.exit(f"registre_site/{nom} ne correspond pas a registre_site/EMPREINTE.json : rien n'est ecrit")
    qualite = {}
    config = json.load(open(os.path.join(RACINE, "config", "leagues.json"), encoding="utf-8"))["leagues"]
    noms_ligues = {int(l["apiFootballId"]): l.get("displayName") for l in config}
    ligues_site = sorted(set(noms_ligues) | set(INTERNATIONAL))
    championnats = [lg for lg in ligues_site if lg not in EUROPE and lg not in INTERNATIONAL]

    M = charger_matchs(fin, debut, qualite)
    log(f"matchs FT {debut} -> {fin} : {len(M)} (book {int((M.source == 'book').sum())}, recent {int((M.source == 'recent').sum())})")
    ids_b = set(M.fixture_id[M.source == "book"]); ids_r = set(M.fixture_id[M.source == "recent"])
    Eb, cb = evenements_book(ids_b) if ids_b else (pd.DataFrame(), pd.Series(dtype=bool))
    Ea, ca, benef = evenements_api(ids_r, M[M.source == "recent"]) if ids_r else (pd.DataFrame(), pd.Series(dtype=bool), True)
    qualite["book"] = {"matchs": len(ids_b), "avec_evenements": int(len(cb)), "coherents": int((cb == True).sum())}
    if ids_r:
        qualite["recent"] = {"matchs": len(ids_r), "avec_evenements": int(len(ca)), "coherents": int((ca == True).sum()),
                             "convention_csc": "equipe beneficiaire" if benef else "equipe fautive"}
    E = pd.concat([x for x in (Eb, Ea) if len(x)], ignore_index=True)
    coh = pd.concat([x for x in (cb, ca) if len(x)]) if len(cb) or len(ca) else pd.Series(dtype=bool)
    del Eb, Ea
    C, qualite["corners_aberrants"] = corners(M)
    M = M.join(C, on="fixture_id")
    M, qualite["cartons_aberrants"] = table_matchs(M, E, coh)
    del E
    if recent:
        memoire_ok()
        ctl = controle_recouvrement(M)
        qualite["controle_book_vs_recodage_avr_juin_2025"] = ctl
        log("controle recouvrement :", ctl)
        if ctl["matchs_compares"] < MIN_RECOUVREMENT or ctl["taux_differents"] is None or ctl["taux_differents"] > SEUIL_RECOUVREMENT:
            sys.exit(f"recodage API trop different du registre ({ctl['matchs_differents']} / {ctl['matchs_compares']} matchs, "
                     f"seuil {SEUIL_RECOUVREMENT:.1%}, minimum {MIN_RECOUVREMENT} matchs) : rien n'est ecrit")
    fuite = int((M.date > fin).sum())
    assert fuite == 0, "match posterieur a la fin de periode"

    deb_eq = (fin_d - dt.timedelta(days=FENETRE_EQUIPE_J)).isoformat()
    deb_lg = (fin_d - dt.timedelta(days=FENETRE_LIGUE_J)).isoformat()
    ME = M[M.date >= deb_eq]
    noms = pd.concat([ME[["date", "dom_id", "dom_api"]].set_axis(["date", "t", "nom"], axis=1),
                      ME[["date", "ext_id", "ext_api"]].set_axis(["date", "t", "nom"], axis=1)]).sort_values("date").drop_duplicates("t", keep="last").set_index("t").nom

    fichiers = {lg: {"ligue": None, "equipes": {}, "arbitres": {}} for lg in ligues_site}
    equipes, index_eq, sous_seuil = profils_equipes(ME, championnats, noms, noms_ligues)
    for lg, eq in equipes.items():
        fichiers[lg]["equipes"] = eq
    index_arb = {}
    for lg in ligues_site:
        fichiers[lg]["ligue"] = profil_ligue(M[(M.league_id == lg) & (M.date >= deb_lg)])
    for cle, p in profils_arbitres(M[M.league_id.isin(ligues_site)]).items():
        lg = p.pop("ligue_principale")
        fichiers[lg]["arbitres"][cle] = p
        index_arb[cle] = lg

    memoire_ok()
    sources_fin, empreinte_fin = empreinte_sources(recent)
    if empreinte_fin != empreinte:
        change = sorted(k for k in set(sources) | set(sources_fin) if sources.get(k) != sources_fin.get(k))
        sys.exit("sources du Book modifiees pendant le calcul (" + ", ".join(change[:5]) + ") : rien n'est ecrit")

    os.makedirs(a.sortie, exist_ok=True)
    entete = {"version": VERSION, "calcule_le": maintenant.strftime("%Y-%m-%dT%H:%M:%SZ"),
              "periode": {"fin": fin, "fin_book": FIN_BOOK, "recent_inclus": recent, "registre": "registre_site",
                          "empreinte_registre": emp_reg["empreinte"],
                          "equipes_ligues_depuis": deb_eq, "arbitres_depuis": debut},
              "empreinte_sources": empreinte}
    total = 0
    for lg, contenu in fichiers.items():
        if not contenu["equipes"] and not contenu["ligue"] and not contenu["arbitres"]:
            continue
        chemin = os.path.join(a.sortie, f"ligue-{lg}.json")
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump({**entete, "league_id": lg, **contenu}, f, ensure_ascii=False, separators=(",", ":"))
        total += os.path.getsize(chemin)
    manifeste = {**entete, "sources_sha256": sources,
                 "seuils": {"equipe": SEUIL_EQUIPE, "sous_groupe": SEUIL_SOUS_GROUPE, "arbitre": SEUIL_ARBITRE, "ligue": SEUIL_LIGUE},
                 "tranches": TRANCHES, "qualite": qualite,
                 "championnats": championnats, "selections": INTERNATIONAL,
                 "compte": {"equipes": len(index_eq), "profils_sous_seuil": sous_seuil, "arbitres": len(index_arb),
                            "ligues": sum(1 for c in fichiers.values() if c["ligue"])},
                 "regle_affichage": "profil affiche seulement si la date du match (UTC) est posterieure a profil.fin ; "
                                    "match de championnat : profil de l'equipe dans CE championnat seulement ; "
                                    "usage descriptif, jamais variable du moteur pour un match anterieur a profil.fin",
                 "index_equipes": index_eq, "index_arbitres": index_arb}
    with open(os.path.join(a.sortie, "manifeste.json"), "w", encoding="utf-8") as f:
        json.dump(manifeste, f, ensure_ascii=False, indent=1)
    total += os.path.getsize(os.path.join(a.sortie, "manifeste.json"))
    log(json.dumps({"fin": fin, "equipes": len(index_eq), "arbitres": len(index_arb), "octets": total,
                    "qualite": qualite}, ensure_ascii=False))


if __name__ == "__main__":
    main()
