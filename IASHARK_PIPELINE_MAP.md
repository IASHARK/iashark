# IASHARK — Cartographie complète de la pipeline produit

Document de référence : où vient chaque donnée, quel code la transforme, où elle atterrit.
Source unique de toute la logique métier : **`.github/workflows/update-data.yml`** (un seul fichier, 2694 lignes, dont ~2670 lignes de script Node.js embarqué dans un heredoc YAML). Il n'existe aucun autre backend, aucun dossier `scripts/`, aucun service séparé — toute l'intelligence d'IASHARK vit dans ce seul fichier, exécuté une fois par jour par GitHub Actions.

Second fichier pertinent, sans lien fonctionnel avec le premier : `supabase/functions/match-data/index.ts` (Edge Function Supabase, code mort — voir §9).

---

## 0. Déclenchement

```yaml
on:
  schedule:
    - cron: '0 6 * * *'          # tous les jours à 06:00 UTC
  workflow_dispatch:               # déclenchement manuel
    inputs:
      force_refresh: {default: 'false'}
      test_wc_only:  {default: 'false'}   # existe mais ne fait rien (voir §10)
```
Pas de clé `concurrency:` dans le fichier — deux exécutions peuvent se chevaucher (voir audit, §H).

---

## 1. SOURCE DE DONNÉES → APIs utilisées

| API | Variable d'env | Usage | Fichier:ligne |
|---|---|---|---|
| **api-football** (v3.football.api-sports.io) | `APISPORTS_KEY` | Source **primaire** : fixtures, cotes, stats équipe, blessures, H2H, compos, arbitres, classements | tout le fichier, ex. `getFixtures()` [625](.github/workflows/update-data.yml:625) |
| **the-odds-api** (Pinnacle) | `ODDS_API_KEY` | Cotes "sharp" de référence pour ancrer les probabilités | `getPinnacleOdds()` [991](.github/workflows/update-data.yml:991) |
| **OpenWeatherMap** | `OPENWEATHER_KEY` | Météo du match | `getWeather()` [701](.github/workflows/update-data.yml:701) |
| **NewsAPI** | `NEWS_KEY` | Actus équipe (2 articles/équipe) | `getNews()` [719](.github/workflows/update-data.yml:719) |
| **Anthropic (Claude sonnet-4-6)** | `ANTHROPIC_KEY` | **Choix du marché + rédaction du verdict** — voir §5 | `genAnalyse()` [1348](.github/workflows/update-data.yml:1348) |
| **Sportmonks** (implicite, via `getSM()`) | — | Repli pour petites ligues / stats api-football vides | `getSM()` [752](.github/workflows/update-data.yml:752) et fonctions `sm*` |
| RSS (L'Équipe, Foot01, RMC, Foot Mercato) | — | Alimente `actus.json` (rumeurs mercato) | `RSS_SOURCES` [130](.github/workflows/update-data.yml:130) |

35 ligues suivies (`LEAGUES`, [594](.github/workflows/update-data.yml:594)) + Coupe du Monde (league id `1`), sur 3 dates (aujourd'hui / demain / après-demain).

---

## 2. INGESTION

**INPUT** → aucune (déclenchement cron/manuel)
**CODE** → `getFixtures()` [625](.github/workflows/update-data.yml:625) : boucle sur 35 ligues × 3 dates + CDM × 3 dates, dédoublonnage par `fixture.id`.
**OUTPUT** → tableau de fixtures brutes api-football.
**DESTINATION** → boucle principale [1935](.github/workflows/update-data.yml:1935) qui traite chaque match un par un.

Pour chaque fixture, un second lot d'appels récupère (en parallèle logique, séquentiel en pratique avec `sleep()` entre chaque) :
- Stats équipe (saison en cours + repli saison précédente) — `getTeamStats()` [665](.github/workflows/update-data.yml:665)
- 20 derniers matchs par équipe — `getLast10()` [676](.github/workflows/update-data.yml:676)
- Cotes du match — `getOdds()` [685](.github/workflows/update-data.yml:685) + `getPinnacleOdds()` [991](.github/workflows/update-data.yml:991)
- Blessures, H2H, compos, arbitre, météo, actus — [690-724](.github/workflows/update-data.yml:690)
- xG pondéré sur les derniers matchs — `getWeightedXGStats()` [1022](.github/workflows/update-data.yml:1022) (jusqu'à ~10 appels statistiques par équipe)

**Si une équipe n'a pas de stats api-football** (ligue mineure ou réponse vide) : repli Sportmonks via matching flou de nom (`smBestMatch`, [773](.github/workflows/update-data.yml:773)) ; si ça échoue aussi, valeurs par défaut plates (`{fd:50,att:50,def:50,fr:50,mot:70,fat:50}`, [1191](.github/workflows/update-data.yml:1191)) — **indiscernables dans la sortie d'une vraie équipe moyenne**.

---

## 3. NORMALISATION

- **Fuseau horaire** : conversion UTC → Paris faite à la main (`toParisHeure()`, [395](.github/workflows/update-data.yml:395)), calcul manuel du passage été/hiver (dernier dimanche de mars/octobre) plutôt qu'une librairie de fuseaux standard.
- **Identité équipe/match** : primairement par ID numérique api-football (`team.id`, `fixture.id`) — stable. **Sauf** deux points de repli par similarité de texte (Levenshtein) : le matching Sportmonks (`smBestMatch`, seuil <0.45, [773](.github/workflows/update-data.yml:773)) et le matching des cotes Pinnacle (`bestTeamMatch`, seuil <0.4, [981](.github/workflows/update-data.yml:981)) — ce dernier alimente directement le modèle de probabilité publié, pas juste un affichage secondaire.
- **Cotes** : `parseOdds()` [1131](.github/workflows/update-data.yml:1131) — filtre le marché 1X2 à la plage `1.05–15.0` ; **aucune plage de validation pour Over/Under, BTTS, Double Chance, Handicap asiatique**. Une cote absente devient la chaîne `'--'`.

---

## 4. STOCKAGE

Aucune base de données pour les données de match — **fichiers JSON commités dans git** :
- `data.json` — matchs du jour/demain/après-demain (fenêtre glissante de 3 jours)
- `historique.json` — 300 dernières prédictions résolues ou en attente (fenêtre glissante, plus ancien = perdu du fichier live, mais reste dans l'historique git)
- `transferts.json`, `actus.json` — mercato/rumeurs

`supabase` (projet `ksvjraqitxouwiabecai`) sert **uniquement** l'authentification et la table `users` (email, `plan`, `role`, `capital`) — aucune donnée de match n'y transite.

---

## 5. CALCULS — du score brut à la probabilité finale

1. **Lambdas Poisson** (buts attendus) : `calcLambdas()` [546](.github/workflows/update-data.yml:546) — ratio attaque/défense de l'équipe vs moyenne ligue, bornes par ligue (Coupe du Monde vs ligues « top » vs autres).
2. **Trois modèles indépendants**, tous appliqués aux mêmes lambdas :
   - Poisson pur — `calcPoissonProbs()` [423](.github/workflows/update-data.yml:423)
   - Dixon-Coles (correction petit score, ρ=-0.13) — `calcDixonColesProbs()` [450](.github/workflows/update-data.yml:450)
   - Monte-Carlo (5000 simulations, tirage Poisson par la méthode de Knuth) — `calcMonteCarlo()` [479](.github/workflows/update-data.yml:479)
3. **Élo** (si dispo) — `eloWinProb()` [1120](.github/workflows/update-data.yml:1120)
4. **Cotes marché → probabilité "fair"** : méthode de **Shin** (retire la marge bookmaker en résolvant un paramètre z par Newton, pas une simple normalisation 1/cote) — `shinProbabilities()` [563](.github/workflows/update-data.yml:563)
5. **Fusion pondérée** (`calcFinalProbs()`, [505](.github/workflows/update-data.yml:505)) : Poisson 32-35% + Dixon-Coles 36-40% + Monte-Carlo 22-25% + Élo 10% (si dispo) → probabilités "ancrées" (`final_p1/pN/p2`) envoyées au LLM comme **seule base autorisée** pour choisir le marché (la consigne du prompt l'exige explicitement, [1409](.github/workflows/update-data.yml:1409)).

Ces cinq formules (Poisson, Dixon-Coles, Monte-Carlo, Élo, Shin) sont mathématiquement standard et correctement implémentées — voir vérification indépendante dans `IASHARK_PIPELINE_AUDIT.md`.

---

## 6. ANALYSE DES MARCHÉS → EDGE / KELLY / CONFIANCE / VERDICT

**C'est ici que la logique change de nature : ce n'est plus un calcul, c'est un appel à un LLM (Claude sonnet-4-6).**

`genAnalyse()` [1348-1482](.github/workflows/update-data.yml:1348) construit un prompt (~120 lignes) contenant : stats domicile/extérieur, forme, blessures, H2H, Élo, tous les modèles de probabilité, la liste des marchés jouables avec leur cote et la probabilité du modèle pour chacun, et les scores Monte-Carlo. Consignes clés données au modèle :
- **Règle 0** : le marché choisi DOIT être celui à la probabilité modèle la plus haute — les signaux qualitatifs ajustent la confiance, ne choisissent jamais le marché seuls.
- **Règle 0bis** : toute exception doit être justifiée explicitement dans `verdict_shark`.
- **Confiance** : note continue 5.5-9.0, avec repères explicites par tranche.
- Sortie : JSON strict (`pari_rec`, `cote_rec`, `confiance`, `verdict_shark`, `facteur_x`, `p1/pn/p2`, `vbet`, etc.)

**Aucune de ces règles n'est vérifiée par du code après coup** — rien ne contrôle que `pari_rec` correspond vraiment au marché le mieux noté, ni que `cote_rec` correspond à une cote réellement disponible. C'est une dépendance pure à l'obéissance du modèle au prompt.

**edge** [2602](.github/workflows/update-data.yml:2602) : recherche du marché choisi dans la liste des marchés, renvoie sa probabilité modèle suivie de `(modele)`. **Ce n'est pas un edge** (probabilité modèle − probabilité marché) — juste la probabilité brute, rebaptisée.

**kelly** [2564](.github/workflows/update-data.yml:2564) : `var kellyVal='2';` — codé en dur. La vraie fonction `fractionalKelly()` [587](.github/workflows/update-data.yml:587) existe mais n'est appelée **nulle part** dans le fichier (vérifié par recherche exhaustive). La variable prévue pour porter son résultat, `nodeKelly` [2416](.github/workflows/update-data.yml:2416), reste `null` du début à la fin.

**verdict_shark** = texte généré par Claude, stocké tel quel.

---

## 7. FREE / PREMIUM

Il n'existe **aucune séparation côté serveur** entre contenu gratuit et premium au moment de la génération. `matchObj` (l'objet écrit dans `data.json`) contient TOUJOURS tous les champs (`kelly`, `edge`, `verdict_shark`, `facteur_x`, `dropping_odds`, etc.), pour tout le monde, sans distinction d'abonnement. La séparation est censée se faire **côté frontend uniquement** (CSS/JS), ce qui expose ces champs à quiconque appelle `data.json` directement — confirmé avec des données réelles historiques (voir `IASHARK_PIPELINE_AUDIT.md`, §I).

Le seul code qui filtre réellement les champs premium (`PREMIUM_FIELDS`, Supabase Edge Function `match-data`) n'est **jamais appelé par le site** — `index.html`, `pro.html`, `match.html` récupèrent tous `data.json` directement.

---

## 8. FRONTEND

`data.json` est fetché côté client par `index.html` (accueil), `pro.html` (outils), `match.html` (détail match). Le "mur payant" est une classe CSS (`proWall.classList.remove('locked')`) déclenchée par :
- `pro.html` : flag `OUTILS_OPEN_FOR_ALL = true` (codé en dur, [392](.github/workflows/update-data.yml) — en réalité dans `pro.html`, pas ce fichier ; commentaire du code : "TEMPORAIRE (phase de test)")
- `match.html` : `isPro = x || true` — toujours vrai quel que soit `x`, bug distinct du flag ci-dessus.

Aucune vérification serveur de l'abonnement avant l'envoi des données — le "mur" n'a jamais eu accès à un mécanisme qui bloque réellement les données à la source (voir §7).

---

## 9. HISTORIQUE / RÉSULTATS → WIN / LOSS

`updateHistorique()` [1608-1735](.github/workflows/update-data.yml:1608) :

1. **Ajout** : chaque match du jour avec `pari_rec` non vide devient une entrée `historique.json` (`result:'scheduled'`), avec la cote figée au moment de la prédiction (`betCote`, [1661](.github/workflows/update-data.yml:1661)) — **jamais modifiée ensuite**.
2. **Résolution** (J+1 à J+4, plus rattrapage des entrées `scheduled` plus vieilles) : re-fetch des scores finaux par date, recherche de l'entrée correspondante par `fixture_id` (repli par distance de Levenshtein ≤3 sur les deux noms d'équipe si l'ID ne matche pas — [1648](.github/workflows/update-data.yml:1648)), puis `resolveMarketWin(prediction, gh, ga)` [136-150](.github/workflows/update-data.yml:136) décide gagné/perdu par correspondance texte sur le nom du marché.
3. **Seuls les statuts `FT`/`AET`/`PEN` sont résolus** — aucune gestion de `ABD`/`PST`/`CANC` : un match reporté ou annulé reste `scheduled` indéfiniment (aucun statut VOID n'existe dans le système).
4. `resolveMarketWin()` ne sait résoudre **aucun marché Handicap** malgré leur génération possible et leur catégorisation dédiée dans le code d'agrégation ([1670-1671](.github/workflows/update-data.yml:1670)) — ils restent bloqués en `scheduled` pour toujours.

---

## 10. STATISTIQUES DE PERFORMANCE

Dans la même fonction, après résolution :
- `histo.stats` : winrate/ROI globaux, calcul standard (gain = cote−1 si gagné, −1 si perdu, unité de mise fixe = 1) — **cote manquante → repli fictif à 1.75** ([1698](.github/workflows/update-data.yml:1698)).
- `histo.backtesting.by_market/by_league/by_conf/...` : ventilations, même formule.
- `histo.monthly` : **formule différente** — paiement fixe supposé de 0.75 par victoire au lieu de la vraie cote ([1729](.github/workflows/update-data.yml:1729)) — troisième formule de ROI, incohérente avec les deux précédentes.

`historique.html` (frontend) recalcule ces mêmes stats **en direct côté client** à partir de `historique.json` — c'est la seule page du site dont les chiffres affichés sont garantis à jour avec les données réelles.

---

## 11. Diagramme récapitulatif

```
api-football/OddsAPI/OpenWeather/NewsAPI/Sportmonks (repli)
        │  (35 ligues × 3 dates, ~35-50 appels/match)
        ▼
   getFixtures() + collecte stats/cotes/H2H/blessures/météo
        │
        ▼
   Poisson + Dixon-Coles + Monte-Carlo + Élo + Shin(cotes)
        │  fusion pondérée → probabilité "ancrée"
        ▼
   genAnalyse() ──► Claude sonnet-4-6 (choix marché + texte)
        │  pari_rec, cote_rec, confiance, verdict_shark, facteur_x
        ▼
   edge = probabilité modèle relabellisée (PAS un vrai edge)
   kelly = '2' codé en dur (PAS calculé)
        │
        ▼
   matchObj (TOUS les champs, y compris premium) ──► data.json
        │                                              │
        │                                              ▼
        │                                   index.html / pro.html / match.html
        │                                   (mur payant = CSS/JS, actuellement désactivé)
        ▼
   updateHistorique() ──► historique.json (win/loss, ROI, winrate)
        │
        ▼
   historique.html (recalcul live, chiffres réels)
        vs
   a-propos.html (chiffres statiques fabriqués, jamais synchronisés)
```

---

*Voir `IASHARK_PIPELINE_AUDIT.md` pour la vérification indépendante des formules, la matrice de couverture complète et le verdict.*
