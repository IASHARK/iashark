#!/usr/bin/env python3
"""
IASHARK — generate_data.py
Script GitHub Actions qui génère data.json en combinant :
  - Airtable MATCHES + ANALYSES + COTES
  - API-Sports : 5 derniers matchs par équipe (form_home / form_away)
  - API-Sports : Classement de la ligue (standings)
  - API-Sports : H2H (5 dernières confrontations)

Variables d'environnement requises (GitHub Secrets) :
  AIRTABLE_TOKEN   → patq214IFx2n54C0B...
  AIRTABLE_BASE    → appWZRYiCM6c4wQfG
  API_SPORTS_KEY   → ta clé API-Sports
"""

import os, json, requests, re
from datetime import datetime, timezone

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
AIRTABLE_TOKEN = os.environ["AIRTABLE_TOKEN"]
AIRTABLE_BASE  = os.environ["AIRTABLE_BASE"]
API_SPORTS_KEY = os.environ["API_SPORTS_KEY"]

AIRTABLE_HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json"
}
API_SPORTS_HEADERS = {
    "x-airtable-application-id": "1",  # pas utilisé ici
    "x-rapidapi-key": API_SPORTS_KEY,
    "x-rapidapi-host": "v3.football.api-sports.io"
}
AS_BASE = "https://v3.football.api-sports.io"

# Mapping ligue_icon → league_id API-Sports
LEAGUE_IDS = {
    "Premier League": 39,
    "Ligue 1":        61,
    "La Liga":        140,
    "Serie A":        135,
    "Bundesliga":     78,
    "Champions League": 2,
    "Europa League":  3,
    "Conference League": 848,
    "Championship":   40,
    "Ligue 2":        62,
}

CURRENT_SEASON = 2025  # saison en cours

# ─────────────────────────────────────────────
# HELPERS AIRTABLE
# ─────────────────────────────────────────────
def airtable_get_all(table_name):
    """Récupère tous les enregistrements d'une table Airtable."""
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE}/{requests.utils.quote(table_name)}"
    records, offset = [], None
    while True:
        params = {"pageSize": 100}
        if offset:
            params["offset"] = offset
        r = requests.get(url, headers=AIRTABLE_HEADERS, params=params)
        r.raise_for_status()
        data = r.json()
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
    return records

# ─────────────────────────────────────────────
# HELPERS API-SPORTS
# ─────────────────────────────────────────────
def as_get(endpoint, params):
    """Appel API-Sports avec gestion d'erreur."""
    r = requests.get(f"{AS_BASE}/{endpoint}", headers={
        "x-rapidapi-key": API_SPORTS_KEY,
        "x-rapidapi-host": "v3.football.api-sports.io"
    }, params=params)
    if r.status_code == 200:
        return r.json().get("response", [])
    print(f"⚠️  API-Sports {endpoint} {params} → {r.status_code}")
    return []

def get_last_5_matches(team_id, league_id=None, season=CURRENT_SEASON):
    """Récupère les 5 derniers matchs joués par une équipe."""
    params = {
        "team": team_id,
        "last": 5,
        "season": season,
        "status": "FT"
    }
    if league_id:
        params["league"] = league_id

    data = as_get("fixtures", params)
    results = []
    for fix in data:
        home_t = fix["teams"]["home"]
        away_t = fix["teams"]["away"]
        goals_h = fix["goals"]["home"] or 0
        goals_a = fix["goals"]["away"] or 0
        is_home = home_t["id"] == team_id
        opponent = away_t["name"] if is_home else home_t["name"]
        opp_id   = away_t["id"]   if is_home else home_t["id"]
        score_str = f"{goals_h}-{goals_a}"
        # Résultat du point de vue de l'équipe
        if is_home:
            if goals_h > goals_a: res = "W"
            elif goals_h == goals_a: res = "D"
            else: res = "L"
        else:
            if goals_a > goals_h: res = "W"
            elif goals_h == goals_a: res = "D"
            else: res = "L"
        date_str = fix["fixture"]["date"][:10]  # YYYY-MM-DD
        results.append({
            "d": date_str,
            "opponent": opponent,
            "opp_id": opp_id,
            "score": score_str,
            "result": res,
            "home": is_home,
            "venue": fix["fixture"]["venue"]["name"] if fix["fixture"]["venue"] else ""
        })
    return results

def get_h2h(team1_id, team2_id, last=5):
    """Récupère les dernières confrontations entre 2 équipes."""
    data = as_get("fixtures/headtohead", {
        "h2h": f"{team1_id}-{team2_id}",
        "last": last,
        "status": "FT"
    })
    results = []
    for fix in data:
        home_t = fix["teams"]["home"]
        away_t = fix["teams"]["away"]
        goals_h = fix["goals"]["home"] or 0
        goals_a = fix["goals"]["away"] or 0
        score_str = f"{goals_h}-{goals_a}"
        if goals_h > goals_a: w = "1"
        elif goals_h < goals_a: w = "2"
        else: w = "draw"
        results.append({
            "d": fix["fixture"]["date"][:10],
            "s": score_str,
            "w": w,
            "home": home_t["name"],
            "away": away_t["name"]
        })
    return results

def get_standings(league_id, season=CURRENT_SEASON):
    """Récupère le classement d'une ligue."""
    data = as_get("standings", {"league": league_id, "season": season})
    if not data:
        return []
    standings = []
    try:
        for entry in data[0]["league"]["standings"][0]:
            team = entry["team"]
            all_ = entry["all"]
            standings.append({
                "rank": entry["rank"],
                "team": team["name"],
                "team_id": team["id"],
                "played": all_["played"],
                "won": all_["win"],
                "draw": all_["draw"],
                "lost": all_["lose"],
                "gf": all_["goals"]["for"],
                "ga": all_["goals"]["against"],
                "gd": entry["goalsDiff"],
                "pts": entry["points"],
                "form": entry.get("form", "")
            })
    except (KeyError, IndexError, TypeError) as e:
        print(f"⚠️  Standings parse error: {e}")
    return standings

# ─────────────────────────────────────────────
# PARSER CHAMPS AIRTABLE
# ─────────────────────────────────────────────
def parse_float(v, default=None):
    try:
        return float(str(v).replace(',', '.'))
    except:
        return default

def parse_h2h_from_airtable(txt):
    """Parse le champ H2H texte d'Airtable vers une liste de dicts."""
    if not txt or not isinstance(txt, str):
        return []
    results = []
    # Format attendu : "01/01/2025 TeamA 2-1 TeamB\n..."
    for line in txt.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        # Cherche un score XX-XX
        m = re.search(r'(\d+)-(\d+)', line)
        if m:
            g1, g2 = int(m.group(1)), int(m.group(2))
            # Date en début de ligne
            date_m = re.match(r'^(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})', line)
            date_str = date_m.group(1) if date_m else ''
            if g1 > g2: w = "1"
            elif g1 < g2: w = "2"
            else: w = "draw"
            results.append({"d": date_str, "s": f"{g1}-{g2}", "w": w})
    return results[:5]

def parse_scores(txt):
    """Parse les scores probables depuis le texte Airtable."""
    if not txt:
        return []
    if isinstance(txt, list):
        return txt[:6]
    # Ex: "1-0 (28%), 0-0 (18%), 1-1 (16%)"
    scores = [s.strip() for s in re.split(r'[,;\n]', str(txt)) if s.strip()]
    return scores[:6]

def parse_crit(txt):
    """Parse les critères IA depuis texte ou retourne défaut."""
    default = {"fd": 50, "att": 50, "def": 50, "fr": 50, "mot": 50, "fat": 30}
    if not txt or not isinstance(txt, str):
        return default
    result = dict(default)
    patterns = {
        "fd": r"forme.{1,10}dom\w*[:\s]+(\d+)",
        "att": r"attaque[:\s]+(\d+)|puissance[:\s]+(\d+)",
        "def": r"d[eé]fense[:\s]+(\d+)|solidit[eé][:\s]+(\d+)",
        "fr": r"forme.{1,5}r[eé]cente[:\s]+(\d+)",
        "mot": r"motivation[:\s]+(\d+)",
        "fat": r"fatigue[:\s]+(\d+)"
    }
    for key, pat in patterns.items():
        m = re.search(pat, txt.lower())
        if m:
            val = next(g for g in m.groups() if g is not None)
            result[key] = int(val)
    return result

# ─────────────────────────────────────────────
# CONSTRUCTION DU MATCH
# ─────────────────────────────────────────────
def build_match(match_rec, analyses_by_mid, cotes_by_mid, standings_cache):
    f = match_rec["fields"]
    mid = f.get("match_id", match_rec["id"])

    # Équipes et infos de base
    home_name = f.get("home_team", "?")
    away_name = f.get("away_team", "?")
    home_id   = int(f.get("home_team_id", 0))
    away_id   = int(f.get("away_team_id", 0))
    league    = f.get("league", "")
    league_id = LEAGUE_IDS.get(league, 0)
    date_raw  = f.get("date", "")
    heure     = f.get("heure", "")

    # Formate la date
    try:
        d = datetime.fromisoformat(str(date_raw).replace("Z", "+00:00"))
        date_fmt = d.strftime("%a %d %b %Y") + (f" · {heure}" if heure else "")
    except:
        date_fmt = str(date_raw)

    # Analyse IA
    ana = analyses_by_mid.get(str(mid), {})
    p1  = parse_float(ana.get("p1",  f.get("p1",  0)), 0)
    pn  = parse_float(ana.get("pn",  f.get("pn",  0)), 0)
    p2  = parse_float(ana.get("p2",  f.get("p2",  0)), 0)
    po15 = parse_float(ana.get("po15", 0), 0)
    po25 = parse_float(ana.get("po25", 0), 0)
    btts = parse_float(ana.get("btts", 0), 0)
    dc1x = parse_float(ana.get("dc1x", 0), 0) or round(p1 + pn, 1)
    dc2x = parse_float(ana.get("dc2x", 0), 0) or round(p2 + pn, 1)
    dc12 = parse_float(ana.get("dc12", 0), 0) or round(p1 + p2, 1)

    conf       = parse_float(ana.get("confiance",    f.get("confiance", 5)), 5)
    edge       = ana.get("edge",       f.get("edge", ""))
    edge_detail= ana.get("edge_detail", "")
    pari_rec   = ana.get("pari_rec",   f.get("pari_rec", ""))
    mise       = ana.get("mise",       f.get("mise", "2-3% bankroll"))
    risque     = ana.get("risque",     f.get("risque", "MODÉRÉ"))
    contexte   = ana.get("contexte",   f.get("contexte", ""))
    enjeux     = ana.get("enjeux",     f.get("enjeux", ""))
    arg        = ana.get("argument",   ana.get("arg", f.get("arg", "")))
    conseil    = ana.get("conseil",    ana.get("conseil_public", f.get("conseil_public", "")))
    val_calc   = ana.get("value_calc", "")

    # Cotes marché
    cote = cotes_by_mid.get(str(mid), {})
    c1   = str(cote.get("c1",   f.get("c1",   "—")) or "—")
    cn   = str(cote.get("cn",   f.get("cn",   "—")) or "—")
    c2   = str(cote.get("c2",   f.get("c2",   "—")) or "—")
    co15 = str(cote.get("co15", f.get("co15", "—")) or "—")
    co25 = str(cote.get("co25", f.get("co25", "—")) or "—")
    vbet = ana.get("vbet",  cote.get("vbet", f.get("vbet", "—")))

    # Value bet automatique si non renseigné
    if vbet == "—" or not vbet:
        # Calcule le marché le plus probable avec cote
        best_proba = 0
        best_market = ""
        markets = [
            ("Victoire "+home_name, p1, c1),
            ("Nul", pn, cn),
            ("Victoire "+away_name, p2, c2),
            ("Over 1.5", po15, co15),
            ("Over 2.5", po25, co25),
            ("DC 1X", dc1x, "—"),
            ("DC X2", dc2x, "—"),
            ("BTTS", btts, "—"),
        ]
        for label, proba, cote_val in markets:
            if proba > best_proba and proba > 0:
                best_proba = proba
                try:
                    c_num = float(cote_val)
                    implied = round(100 / c_num, 1)
                    edge_val = round(proba - implied, 1)
                    if edge_val > 3:
                        best_market = f"{label} @{cote_val} (edge +{edge_val}%)"
                    else:
                        best_market = f"{label} — prob. {proba}%"
                except:
                    best_market = f"{label} — prob. {proba}%"
        vbet = best_market or "—"

    # Catégories
    cat_map = {
        "Premier League": "pl", "Ligue 1": "l1", "La Liga": "laliga",
        "Serie A": "seriea", "Bundesliga": "bundesliga",
        "Champions League": "ucl", "Europa League": "uel"
    }
    cat = ["all", cat_map.get(league, "other")]
    val = bool(ana.get("value_bet", vbet not in ["—", "PASS"]))
    hot = bool(ana.get("hot", conf >= 7))

    # Stade
    stade_nom  = f.get("stade", f"{home_name} Stadium")
    meteo_txt  = f.get("meteo", "")
    temp_txt   = f.get("temperature", "")
    meteo_icon = "🌤️"
    if "nuage" in str(meteo_txt).lower(): meteo_icon = "⛅"
    elif "pluie" in str(meteo_txt).lower() or "rain" in str(meteo_txt).lower(): meteo_icon = "🌧️"
    elif "neige" in str(meteo_txt).lower(): meteo_icon = "❄️"
    elif "soleil" in str(meteo_txt).lower() or "clear" in str(meteo_txt).lower(): meteo_icon = "☀️"
    elif "brouillard" in str(meteo_txt).lower(): meteo_icon = "🌫️"

    # H2H depuis Airtable (texte) — sera enrichi par API-Sports si home/away_id connus
    h2h_txt_raw = f.get("h2h", ana.get("h2h_resume", ""))
    h2h_list    = parse_h2h_from_airtable(str(h2h_txt_raw) if h2h_txt_raw else "")
    h2h_resume  = str(ana.get("h2h_txt", f.get("h2h_txt", "")))

    # Joueurs décisifs
    joueurs_raw = ana.get("joueurs", f.get("joueurs", ""))
    if isinstance(joueurs_raw, str) and joueurs_raw:
        joueurs = [{"n": j.strip(), "c": "", "d": ""} for j in joueurs_raw.split(",") if j.strip()]
    elif isinstance(joueurs_raw, list):
        joueurs = joueurs_raw
    else:
        joueurs = []

    # Actualités
    actu_raw = f.get("actualites", ana.get("actu", ""))
    if isinstance(actu_raw, str) and actu_raw:
        actu = [{"c": league, "t": a.strip(), "tx": "", "tm": "Récent"} for a in actu_raw.split("\n") if a.strip()]
    elif isinstance(actu_raw, list):
        actu = actu_raw
    else:
        actu = []

    # Critères IA
    crit_home_raw = ana.get("criteres_dom", f.get("criteres_dom", ""))
    crit_away_raw = ana.get("criteres_ext", f.get("criteres_ext", ""))
    crit_home = parse_crit(str(crit_home_raw))
    crit_away = parse_crit(str(crit_away_raw))

    # Scores probables
    scores_raw = ana.get("scores_probables", f.get("scores_probables", ""))
    scores = parse_scores(scores_raw)

    # Paris par risque
    paris_risque = {
        "bet": ana.get("pari_risque", ""),
        "cote": str(ana.get("cote_risque", "")),
        "proba": str(ana.get("proba_risque", ""))
    }
    paris_safe = {
        "bet": ana.get("pari_safe", pari_rec),
        "cote": str(ana.get("cote_safe", c1 if p1 > p2 else c2)),
        "proba": str(ana.get("proba_safe", max(p1, p2)))
    }

    # Marchés IA enrichis pour le nouveau bloc
    markets = []
    market_data = [
        {"label": "Victoire "+home_name, "proba": p1, "tag": "1", "tagColor": "#00e5ff"},
        {"label": "Nul", "proba": pn, "tag": "N", "tagColor": "#ffab00"},
        {"label": "Victoire "+away_name, "proba": p2, "tag": "2", "tagColor": "#00e5ff"},
        {"label": "Double Chance 1X", "proba": dc1x, "tag": "1X", "tagColor": "#00b4d8"},
        {"label": "Double Chance X2", "proba": dc2x, "tag": "X2", "tagColor": "#00b4d8"},
        {"label": "Double Chance 12", "proba": dc12, "tag": "12", "tagColor": "#00b4d8"},
        {"label": "Plus de 1.5 buts", "proba": po15, "tag": "O1.5", "tagColor": "#00e676"},
        {"label": "Plus de 2.5 buts", "proba": po25, "tag": "O2.5", "tagColor": "#00e676"},
        {"label": "Moins de 2.5 buts", "proba": round(100-po25, 1) if po25 else 0, "tag": "U2.5", "tagColor": "#ffab00"},
        {"label": "Les 2 équipes marquent", "proba": btts, "tag": "BTTS", "tagColor": "#ff6b6b"},
    ]
    markets = sorted([m for m in market_data if m["proba"] > 0], key=lambda x: -x["proba"])[:6]

    # 5 derniers matchs - sera rempli par get_form ci-dessous
    form_home = f.get("form_home", [])
    form_away = f.get("form_away", [])

    # Classement (ranking) depuis cache
    standing_info = {}
    if league_id and league_id in standings_cache:
        for entry in standings_cache[league_id]:
            if entry["team_id"] == home_id:
                standing_info["home"] = entry
            if entry["team_id"] == away_id:
                standing_info["away"] = entry

    return {
        "id": int(str(mid).replace("-", "")[:8]) if str(mid).isdigit() else hash(str(mid)) % 100000,
        "match_id_raw": str(mid),
        "home": {"n": home_name, "id": home_id},
        "away": {"n": away_name, "id": away_id},
        "league": league,
        "league_id": league_id,
        "ligue_icon": f.get("ligue_icon", "🏆"),
        "date": date_fmt,
        "cat": cat,
        "val": val,
        "hot": hot,
        "p1": p1, "pn": pn, "p2": p2,
        "po15": po15, "po25": po25,
        "btts": btts, "dc1x": dc1x, "dc2x": dc2x, "dc12": dc12,
        "conf": conf,
        "edge": edge,
        "edge_detail": edge_detail,
        "vbet": vbet,
        "pari_rec": pari_rec,
        "mise": mise,
        "risque": risque,
        "conseil_public": conseil,
        "arg": arg,
        "contexte": contexte,
        "enjeux": enjeux,
        "value_calc": val_calc,
        "stade": {
            "nom": str(stade_nom),
            "cap": str(f.get("capacite", "")),
            "desc": str(meteo_txt),
            "meteo": meteo_icon,
            "temp": str(temp_txt)
        },
        "scores": scores,
        "crit_home": crit_home,
        "crit_away": crit_away,
        "c1": c1, "cn": cn, "c2": c2,
        "co15": co15, "co25": co25,
        "h2h": h2h_list,
        "h2h_txt": h2h_resume,
        "joueurs": joueurs,
        "actu": actu,
        "bookies": [
            {"n": "Betclic", "o": "200€ offerts", "c": c1, "l": "https://www.betclic.fr"},
            {"n": "Unibet",  "o": "100€ remboursés", "c": cn, "l": "https://www.unibet.fr"},
            {"n": "Winamax","o": "Jusqu'à 100€",  "c": c2, "l": "https://www.winamax.fr"}
        ],
        "paris_risque": paris_risque,
        "paris_safe": paris_safe,
        "markets": markets,
        "standing_home": standing_info.get("home", {}),
        "standing_away": standing_info.get("away", {}),
        "form_home": form_home,
        "form_away": form_away,
    }

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    print("🦈 IASHARK — Génération data.json")
    print(f"   Date : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    # 1. Charger les tables Airtable
    print("\n📡 Chargement Airtable...")
    matches_records  = airtable_get_all("MATCHES")
    print(f"   MATCHES   : {len(matches_records)} entrées")

    try:
        analyses_records = airtable_get_all("ANALYSES")
        print(f"   ANALYSES  : {len(analyses_records)} entrées")
    except Exception as e:
        print(f"   ANALYSES  : échec ({e}), on continue")
        analyses_records = []

    try:
        cotes_records = airtable_get_all("COTES")
        print(f"   COTES     : {len(cotes_records)} entrées")
    except Exception as e:
        print(f"   COTES     : échec ({e}), on continue")
        cotes_records = []

    # Index par match_id
    analyses_by_mid = {}
    for rec in analyses_records:
        f = rec["fields"]
        mid = str(f.get("match_id", ""))
        if mid:
            analyses_by_mid[mid] = f

    cotes_by_mid = {}
    for rec in cotes_records:
        f = rec["fields"]
        mid = str(f.get("match_id", ""))
        if mid:
            cotes_by_mid[mid] = f

    # 2. Identifier les ligues pour les classements
    leagues_needed = set()
    for rec in matches_records:
        league = rec["fields"].get("league", "")
        lid = LEAGUE_IDS.get(league, 0)
        if lid:
            leagues_needed.add(lid)

    # 3. Charger les classements
    print("\n📊 Classements...")
    standings_cache = {}
    for lid in leagues_needed:
        print(f"   League {lid}...")
        standings_cache[lid] = get_standings(lid)
        print(f"   → {len(standings_cache[lid])} équipes")

    # 4. Construire les matchs + enrichissement API-Sports
    print("\n⚽ Construction des matchs...")
    matchs = []
    for rec in matches_records:
        f = rec["fields"]
        home_id  = int(f.get("home_team_id", 0))
        away_id  = int(f.get("away_team_id", 0))
        league   = f.get("league", "")
        league_id = LEAGUE_IDS.get(league, 0)

        # Build match data
        match_data = build_match(rec, analyses_by_mid, cotes_by_mid, standings_cache)

        # 5 derniers matchs via API-Sports
        if home_id:
            print(f"   Form {f.get('home_team','?')} (id={home_id})...")
            form_home = get_last_5_matches(home_id, league_id)
            match_data["form_home"] = form_home
            print(f"   → {len(form_home)} matchs")
        if away_id:
            print(f"   Form {f.get('away_team','?')} (id={away_id})...")
            form_away = get_last_5_matches(away_id, league_id)
            match_data["form_away"] = form_away
            print(f"   → {len(form_away)} matchs")

        # H2H via API-Sports si pas de données Airtable
        if not match_data["h2h"] and home_id and away_id:
            print(f"   H2H {home_id} vs {away_id}...")
            h2h = get_h2h(home_id, away_id, last=5)
            match_data["h2h"] = h2h
            print(f"   → {len(h2h)} confrontations")

        matchs.append(match_data)
        print(f"   ✅ {f.get('home_team','?')} vs {f.get('away_team','?')} ({league})")

    # 5. Combinés Airtable (si table COMBINATIONS existe)
    combis = []
    try:
        combis_records = airtable_get_all("COMBINATIONS")
        for rec in combis_records:
            f = rec["fields"]
            combis.append({
                "label": f.get("label", f.get("titre", "COMBINÉ")),
                "cote_totale": str(f.get("cote_totale", "")),
                "conseil": f.get("conseil", f.get("description", "")),
                "selections": f.get("selections", ""),
                "matchs": f.get("matchs_ids", f.get("matchs", "")),
            })
        print(f"\n🎰 COMBINATIONS : {len(combis)} combinés")
    except Exception as e:
        print(f"\n🎰 COMBINATIONS : pas de table ({e})")

    # 6. Classements pour affichage (standalone)
    standings_export = {}
    for lid, entries in standings_cache.items():
        league_name = next((k for k,v in LEAGUE_IDS.items() if v==lid), str(lid))
        standings_export[league_name] = entries

    # 7. Historique (statique par défaut)
    historique = [
        {"match": "IASHARK Track", "bet": "—", "result": "—", "gain": "—", "cote": "—"}
    ]

    # 8. Générer data.json
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "matchs": matchs,
        "combis": combis,
        "standings": standings_export,
        "historique": historique
    }

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ data.json généré — {len(matchs)} matchs, {len(combis)} combinés")
    print(f"   Taille : {os.path.getsize('data.json') / 1024:.1f} Ko")

if __name__ == "__main__":
    main()
