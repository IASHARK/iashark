# Analyse indépendante — K League 1 — 9 septembre 2026

Générée à `2026-09-09T06:39:48.802044+00:00`. Aucune cote et aucune prédiction fournisseur n'entrent dans les probabilités.

## Validation du modèle

- Matchs historiques : **857**
- Couverture tirs cadrés : **56.0%**
- Demi-vie sélectionnée : **365 jours**
- Régularisation sélectionnée : **0.150**
- Log loss score en validation : **2.8507**
- Brier 1N2 en validation : **0.6580**
- Baseline ligue — log loss/Brier : **2.8522 / 0.6637**
- Poids du modèle buts dans l'ensemble : **100%**
- Rééchantillonnages réussis : **101**
- Loi de score retenue : **Independent Poisson**

## 1. Daejeon Citizen - FC Anyang

Coup d'envoi : `2026-09-09T10:30:00+00:00` — Repos : 4.0 j / 3.0 j.

Buts attendus : **1.76 – 1.23**.

| Marché standard | Probabilité | Intervalle bootstrap 10–90 % | Cote juste indicative |
|---|---:|---:|---:|
| Domicile plus de 0.5 but | 82.2% | 76.3%–87.0% | 1.22 |
| 12 | 76.6% | 74.2%–78.7% | 1.31 |
| Plus de 1.5 buts | 79.6% | 73.8%–84.9% | 1.26 |
| 1X | 72.8% | 66.9%–78.2% | 1.37 |
| Extérieur plus de 0.5 but | 70.7% | 66.5%–75.3% | 1.41 |
| Extérieur moins de 1.5 but | 65.1% | 59.2%–70.2% | 1.54 |

Scores exacts les plus probables : 1-1 (10.9%), 2-1 (9.6%), 1-0 (8.9%), 2-0 (7.8%).

- **Domicile** : rang recalculé 7, saison 9V-8N-10D, 1.48 but marqué et 1.19 encaissé/match ; split pertinent 1.08/1.15 ; indices modèle attaque/défense-faiblesse 1.20/0.98.
- **Extérieur** : rang recalculé 9, saison 8V-10N-9D, 1.22 but marqué et 1.56 encaissé/match ; split pertinent 1.38/1.23 ; indices modèle attaque/défense-faiblesse 1.01/1.14.

Compositions officielles non disponibles au moment du calcul : aucun joueur supposé titulaire n'est traité comme certain.
Aucune indisponibilité renvoyée par l'endpoint du match ; cela ne prouve pas une infirmerie vide.

Comparaison de prix effectuée après gel des probabilités :

| Marché | Probabilité | Cote juste | Meilleure cote observée | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| Extérieur plus de 2.5 but | 12.9% | 7.74 | 13.00 | 68.0% | 27.6% |
| 2 | 27.2% | 3.68 | 5.74 | 56.0% | 25.4% |
| Extérieur plus de 1.5 but | 34.9% | 2.86 | 3.93 | 37.3% | 17.3% |
| Extérieur plus de 0.5 but | 70.7% | 1.41 | 1.59 | 12.4% | 5.7% |
| X2 | 50.5% | 1.98 | 2.42 | 22.3% | 5.6% |

## 2. Gangwon FC - Jeonbuk Motors

Coup d'envoi : `2026-09-09T10:30:00+00:00` — Repos : 3.0 j / 4.0 j.

Buts attendus : **0.95 – 1.12**.

| Marché standard | Probabilité | Intervalle bootstrap 10–90 % | Cote juste indicative |
|---|---:|---:|---:|
| Moins de 3.5 buts | 84.4% | 79.8%–88.6% | 1.19 |
| Domicile moins de 1.5 but | 75.5% | 68.5%–81.2% | 1.33 |
| 12 | 69.9% | 67.7%–72.1% | 1.43 |
| Extérieur moins de 1.5 but | 69.4% | 63.8%–75.2% | 1.44 |
| X2 | 69.4% | 62.8%–74.8% | 1.44 |
| Extérieur plus de 0.5 but | 67.0% | 61.6%–71.9% | 1.49 |

Scores exacts les plus probables : 0-1 (13.9%), 1-1 (13.4%), 0-0 (12.2%), 1-0 (11.8%).

- **Domicile** : rang recalculé 4, saison 10V-10N-6D, 1.27 but marqué et 0.92 encaissé/match ; split pertinent 1.33/0.92 ; indices modèle attaque/défense-faiblesse 0.97/0.83.
- **Extérieur** : rang recalculé 3, saison 11V-9N-7D, 1.26 but marqué et 0.85 encaissé/match ; split pertinent 1.00/0.71 ; indices modèle attaque/défense-faiblesse 1.12/0.76.

Compositions officielles non disponibles au moment du calcul : aucun joueur supposé titulaire n'est traité comme certain.
Aucune indisponibilité renvoyée par l'endpoint du match ; cela ne prouve pas une infirmerie vide.

Comparaison de prix effectuée après gel des probabilités :

| Marché | Probabilité | Cote juste | Meilleure cote observée | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| BTTS Non | 59.2% | 1.69 | 1.91 | 13.1% | 1.8% |
| Domicile moins de 0.5 but | 39.1% | 2.55 | 3.12 | 22.1% | 0.0% |
| Moins de 2.5 buts | 66.0% | 1.52 | 1.68 | 10.8% | -0.3% |
| Moins de 1.5 buts | 39.2% | 2.55 | 3.03 | 18.7% | -0.4% |
| Domicile moins de 2.5 but | 92.7% | 1.08 | 1.11 | 2.9% | -0.9% |

## 3. Gwangju FC - Jeju United FC

Coup d'envoi : `2026-09-09T10:30:00+00:00` — Repos : 3.0 j / 4.0 j.

Buts attendus : **0.95 – 1.29**.

| Marché standard | Probabilité | Intervalle bootstrap 10–90 % | Cote juste indicative |
|---|---:|---:|---:|
| Moins de 3.5 buts | 81.2% | 76.5%–85.7% | 1.23 |
| Domicile moins de 1.5 but | 75.5% | 70.5%–81.0% | 1.32 |
| 12 | 71.7% | 69.5%–73.8% | 1.39 |
| X2 | 72.5% | 66.8%–78.7% | 1.38 |
| Extérieur plus de 0.5 but | 72.0% | 66.1%–76.8% | 1.39 |
| Plus de 1.5 buts | 65.1% | 59.5%–70.5% | 1.54 |

Scores exacts les plus probables : 0-1 (14.1%), 1-1 (13.0%), 0-0 (10.9%), 1-0 (10.0%).

- **Domicile** : rang recalculé 12, saison 1V-10N-16D, 0.67 but marqué et 2.19 encaissé/match ; split pertinent 0.79/2.07 ; indices modèle attaque/défense-faiblesse 0.76/1.17.
- **Extérieur** : rang recalculé 5, saison 10V-9N-8D, 1.15 but marqué et 1.00 encaissé/match ; split pertinent 1.30/0.90 ; indices modèle attaque/défense-faiblesse 0.91/0.93.

Compositions officielles non disponibles au moment du calcul : aucun joueur supposé titulaire n'est traité comme certain.
Aucune indisponibilité renvoyée par l'endpoint du match ; cela ne prouve pas une infirmerie vide.

Comparaison de prix effectuée après gel des probabilités :

| Marché | Probabilité | Cote juste | Meilleure cote observée | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| Extérieur moins de 0.5 but | 28.0% | 3.57 | 4.47 | 25.1% | 3.7% |
| Extérieur moins de 1.5 but | 63.3% | 1.58 | 1.80 | 13.9% | 2.8% |
| Moins de 2.5 buts | 61.5% | 1.63 | 1.85 | 13.7% | 2.3% |
| Moins de 1.5 buts | 34.9% | 2.86 | 3.44 | 20.2% | 1.4% |
| Extérieur moins de 2.5 but | 85.9% | 1.16 | 1.22 | 4.8% | -0.1% |

## 4. Pohang Steelers - Gimcheon Sangmu FC

Coup d'envoi : `2026-09-09T10:30:00+00:00` — Repos : 4.0 j / 3.0 j.

Buts attendus : **1.11 – 1.20**.

| Marché standard | Probabilité | Intervalle bootstrap 10–90 % | Cote juste indicative |
|---|---:|---:|---:|
| Moins de 3.5 buts | 79.7% | 74.5%–83.7% | 1.25 |
| 12 | 71.8% | 70.2%–73.7% | 1.39 |
| Domicile moins de 1.5 but | 69.6% | 64.4%–75.6% | 1.44 |
| Extérieur plus de 0.5 but | 69.4% | 64.4%–74.7% | 1.44 |
| Plus de 1.5 buts | 66.8% | 62.3%–72.5% | 1.50 |
| Domicile plus de 0.5 but | 66.8% | 61.1%–71.4% | 1.50 |

Scores exacts les plus probables : 1-1 (13.3%), 0-1 (12.2%), 1-0 (11.2%), 0-0 (10.3%).

- **Domicile** : rang recalculé 8, saison 10V-5N-12D, 0.89 but marqué et 1.15 encaissé/match ; split pertinent 0.36/0.91 ; indices modèle attaque/défense-faiblesse 0.89/0.92.
- **Extérieur** : rang recalculé 11, saison 4V-16N-7D, 0.96 but marqué et 1.26 encaissé/match ; split pertinent 1.00/1.14 ; indices modèle attaque/défense-faiblesse 1.04/0.95.

Compositions officielles non disponibles au moment du calcul : aucun joueur supposé titulaire n'est traité comme certain.
Aucune indisponibilité renvoyée par l'endpoint du match ; cela ne prouve pas une infirmerie vide.

Comparaison de prix effectuée après gel des probabilités :

| Marché | Probabilité | Cote juste | Meilleure cote observée | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| Domicile moins de 2.5 but | 89.7% | 1.11 | 1.13 | 1.4% | -1.9% |
| 2 | 38.0% | 2.63 | 3.11 | 18.3% | -2.1% |
| Domicile moins de 0.5 but | 33.2% | 3.01 | 3.40 | 13.0% | -2.7% |
| Domicile moins de 1.5 but | 69.6% | 1.44 | 1.50 | 4.4% | -3.4% |
| Plus de 0.5 buts | 89.9% | 1.11 | 1.09 | -2.0% | -4.2% |

## Limites

Les intervalles mesurent surtout l'instabilité historique du modèle. Ils ne rendent pas prévisibles les cartons rouges, blessures pendant le match, erreurs individuelles ou variations extrêmes de finition. Une cote bookmaker peut être comparée ensuite à la cote juste, mais elle n'a pas modifié ces probabilités.
