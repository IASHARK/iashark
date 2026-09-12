# Analyse multi-ligues — 9 septembre 2026

Générée à `2026-09-09T11:14:04.780869+00:00`. Les probabilités sportives ont été gelées avant lecture des cotes.

## Synthèse

| Match | Buts attendus | 1–N–2 | BTTS oui | +2,5 | Marché robuste du modèle | Score modal |
|---|---:|---:|---:|---:|---|---:|
| HJK Helsinki - Inter Turku | 1.30–1.28 | 37.3%–26.5%–36.2% | 52.2% | 47.6% | 12 73.5% | 1-1 (12.6%) |
| Samgurali - Dila | 1.19–1.58 | 28.8%–24.8%–46.4% | 54.9% | 52.3% | Extérieur plus de 0.5 but 79.2% | 1-1 (11.8%) |
| Spaeri - Rustavi | 0.98–1.36 | 27.6%–27.0%–45.5% | 44.8% | 41.1% | Moins de 3.5 buts 79.1% | 0-1 (13.3%) |
| FK Jablonec - Baník Ostrava | 1.55–1.08 | 48.0%–25.4%–26.6% | 51.6% | 48.7% | Domicile plus de 0.5 but 78.4% | 1-1 (12.1%) |

## Validation par championnat

### Veikkausliiga (Finlande)

- **650** matchs historiques ; tirs cadrés couverts sur **41.5%**.
- Validation chronologique : log loss score **3.0094**, Brier 1N2 **0.6148**.
- Baseline ligue : **3.0968 / 0.6541**.
- Loi retenue : **Poisson indépendant** ; demi-vie **240 j** ; ridge **0.150** ; poids buts **100%**.
- Rééchantillonnages réussis : **81**.

### Erovnuli Liga (Géorgie)

- **667** matchs historiques ; tirs cadrés couverts sur **1.0%**.
- Validation chronologique : log loss score **2.9698**, Brier 1N2 **0.6215**.
- Baseline ligue : **2.9785 / 0.6589**.
- Loi retenue : **Poisson indépendant** ; demi-vie **540 j** ; ridge **0.150** ; poids buts **100%**.
- Rééchantillonnages réussis : **81**.

### Czech Liga (Tchéquie)

- **890** matchs historiques ; tirs cadrés couverts sur **97.5%**.
- Validation chronologique : log loss score **2.9236**, Brier 1N2 **0.5829**.
- Baseline ligue : **3.0244 / 0.6432**.
- Loi retenue : **Poisson indépendant** ; demi-vie **540 j** ; ridge **0.015** ; poids buts **70%**.
- Rééchantillonnages réussis : **81**.

## 1. HJK Helsinki - Inter Turku

Compétition : **Veikkausliiga** — coup d’envoi **09/09/2026 17:00 CEST** — repos **4.0 j / 4.0 j**.

Projection centrale : **1.30–1.28 buts attendus**.

### Forces et forme

- **HJK Helsinki** : rang 3, bilan 11V-4N-7D, buts 36-27, forme récente `WLWWLWWL` ; indices attaque/défense-faiblesse 1.36/0.96.
- **Inter Turku** : rang 2, bilan 11V-9N-2D, buts 29-16, forme récente `WDWDWLDW` ; indices attaque/défense-faiblesse 1.12/0.66.

Derniers matchs de l’équipe à domicile : 2026-08-31 Ilves 2-1 (A); 2026-08-23 Gnistan 2-3 (H); 2026-08-16 FF Jaro 3-0 (H); 2026-08-09 AC Oulu 1-0 (A); 2026-08-03 SJK 0-3 (A).

Derniers matchs de l’équipe à l’extérieur : 2026-08-31 KuPS 1-0 (H); 2026-08-23 Turku PS 0-0 (A); 2026-08-16 AC Oulu 3-2 (A); 2026-08-09 Lahti 0-0 (H); 2026-08-02 VPS 1-0 (A).

### Probabilités

| Marché | Probabilité | Intervalle 10–90 % | Cote juste |
|---|---:|---:|---:|
| 1 | 37.3% | 32.6%–42.4% | 2.68 |
| N | 26.5% | 24.5%–28.7% | 3.78 |
| 2 | 36.2% | 29.8%–41.5% | 2.76 |
| 1X | 63.8% | 58.5%–70.2% | 1.57 |
| X2 | 62.7% | 57.6%–67.4% | 1.59 |
| 12 | 73.5% | 71.3%–75.5% | 1.36 |
| BTTS Oui | 52.2% | 45.5%–58.7% | 1.92 |
| BTTS Non | 47.8% | 41.3%–54.5% | 2.09 |
| Plus de 1.5 buts | 72.6% | 65.7%–78.7% | 1.38 |
| Plus de 2.5 buts | 47.6% | 39.0%–55.6% | 2.10 |
| Moins de 2.5 buts | 52.4% | 44.4%–61.0% | 1.91 |
| Moins de 3.5 buts | 73.8% | 66.8%–81.0% | 1.36 |
| Domicile plus de 0.5 but | 72.6% | 67.3%–77.5% | 1.38 |
| Extérieur plus de 0.5 but | 71.9% | 65.1%–77.6% | 1.39 |
| Domicile moins de 1.5 but | 62.6% | 56.1%–69.3% | 1.60 |
| Extérieur moins de 1.5 but | 63.4% | 55.8%–71.7% | 1.58 |

Scores exacts : **1-1** 12.6%, **0-1** 9.8%, **1-0** 9.7%, **1-2** 8.2%, **2-1** 8.1%, **0-0** 7.6%.

Face-à-face disponibles : **8**, bilan vu depuis HJK Helsinki : 2V-5N-1D, buts 9-10. Poids informatif faible dans le modèle.

Compositions officielles non disponibles : l’incertitude d’effectif reste ouverte.
Aucune indisponibilité renvoyée par l’endpoint du match ; cela ne prouve pas que l’effectif est complet.
Terrain vérifié : **Bolt Arena, Helsinki**.
Absences/suspensions annoncées officiellement : **Alex Ring, Amara Nallo, Joona Veteli, David Ezeh, Eemil Toivonen**.
Retours/disponibles annoncés : **Ville Tikkanen, Lassi Lappalainen**.
Informations publiées par HJK ; l’avant-match d’Inter ne donne pas de liste d’absents. Source : [avant-match officiel HJK](https://www.hjk.fi/uutiset/mestaruussarja-kayntiin-revanssi-mielessa).

### Prix disponibles après gel du modèle

| Marché | Proba modèle | Cote juste | Meilleure cote | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| 12 | 73.5% | 1.36 | 1.36 | -0.0% | -3.0% |
| Plus de 0.5 buts | 92.2% | 1.08 | 1.07 | -1.3% | -4.3% |
| Moins de 4.5 buts | 87.7% | 1.14 | 1.12 | -1.8% | -7.0% |
| Domicile moins de 2.5 but | 85.5% | 1.17 | 1.14 | -2.5% | -7.5% |
| Extérieur moins de 2.5 but | 85.9% | 1.16 | 1.14 | -2.0% | -7.7% |
| Moins de 3.5 buts | 73.8% | 1.36 | 1.36 | 0.3% | -9.2% |
| 1 | 37.3% | 2.68 | 2.78 | 3.7% | -9.3% |
| Domicile plus de 0.5 but | 72.6% | 1.38 | 1.34 | -2.8% | -9.9% |

## 2. Samgurali - Dila

Compétition : **Erovnuli Liga** — coup d’envoi **09/09/2026 17:00 CEST** — repos **4.0 j / 4.0 j**.

Projection centrale : **1.19–1.58 buts attendus**.

### Forces et forme

- **Samgurali** : rang 7, bilan 9V-5N-10D, buts 33-43, forme récente `LDWLWDLW` ; indices attaque/défense-faiblesse 1.16/1.08.
- **Dila** : rang 5, bilan 10V-3N-10D, buts 28-24, forme récente `WLDWWWLL` ; indices attaque/défense-faiblesse 1.17/0.71.

Derniers matchs de l’équipe à domicile : 2026-09-05 FC Iberia 1999 1-2 (A); 2026-08-30 Rustavi 1-1 (H); 2026-08-22 Spaeri 4-3 (A); 2026-08-16 Dinamo Batumi 0-4 (H); 2026-08-09 Meshakhte 2-1 (A).

Derniers matchs de l’équipe à l’extérieur : 2026-09-05 Gagra 1-0 (H); 2026-08-31 Dinamo Tbilisi 1-2 (A); 2026-08-22 Torpedo Kutaisi 2-2 (H); 2026-08-16 Meshakhte 3-1 (H); 2026-06-22 Rustavi 3-0 (H).

### Probabilités

| Marché | Probabilité | Intervalle 10–90 % | Cote juste |
|---|---:|---:|---:|
| 1 | 28.8% | 22.9%–34.5% | 3.47 |
| N | 24.8% | 23.1%–26.5% | 4.04 |
| 2 | 46.4% | 40.7%–52.3% | 2.16 |
| 1X | 53.6% | 47.7%–59.3% | 1.87 |
| X2 | 71.2% | 65.5%–77.1% | 1.41 |
| 12 | 75.2% | 73.5%–76.9% | 1.33 |
| BTTS Oui | 54.9% | 48.3%–61.9% | 1.82 |
| BTTS Non | 45.1% | 38.1%–51.7% | 2.22 |
| Plus de 1.5 buts | 76.2% | 70.3%–81.9% | 1.31 |
| Plus de 2.5 buts | 52.3% | 44.5%–60.5% | 1.91 |
| Moins de 2.5 buts | 47.7% | 39.5%–55.5% | 2.10 |
| Moins de 3.5 buts | 69.6% | 61.8%–76.7% | 1.44 |
| Domicile plus de 0.5 but | 69.3% | 62.5%–76.1% | 1.44 |
| Extérieur plus de 0.5 but | 79.2% | 75.2%–83.5% | 1.26 |
| Domicile moins de 1.5 but | 66.5% | 58.1%–74.3% | 1.50 |
| Extérieur moins de 1.5 but | 53.2% | 46.3%–59.4% | 1.88 |

Scores exacts : **1-1** 11.8%, **0-1** 10.0%, **1-2** 9.3%, **0-2** 7.9%, **1-0** 7.4%, **2-1** 6.9%.

Face-à-face disponibles : **8**, bilan vu depuis Samgurali : 1V-0N-7D, buts 9-15. Poids informatif faible dans le modèle.

Compositions officielles non disponibles : l’incertitude d’effectif reste ouverte.
Aucune indisponibilité renvoyée par l’endpoint du match ; cela ne prouve pas que l’effectif est complet.
Terrain vérifié : **Football Centre, Tskaltubo (source ligue officielle)**.
Aucune suspension ou blessure affichée ; la section Squads n’est pas un onze officiel. Source : [fiche officielle Erovnuli Liga](https://erovnuliliga.ge/en/game/9292-smg-dil).

### Prix disponibles après gel du modèle

| Marché | Proba modèle | Cote juste | Meilleure cote | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| Extérieur plus de 1.5 but | 46.8% | 2.13 | 2.50 | 17.1% | 1.5% |
| Extérieur plus de 2.5 but | 21.4% | 4.68 | 6.00 | 28.2% | -1.0% |
| 2 | 46.4% | 2.16 | 2.41 | 11.8% | -1.9% |
| Extérieur plus de 0.5 but | 79.2% | 1.26 | 1.30 | 3.0% | -2.3% |
| 12 | 75.2% | 1.33 | 1.33 | 0.0% | -2.3% |
| Plus de 0.5 buts | 93.6% | 1.07 | 1.06 | -0.8% | -3.1% |
| Plus de 2.5 buts | 52.3% | 1.91 | 2.13 | 11.5% | -5.3% |
| Plus de 1.5 buts | 76.2% | 1.31 | 1.34 | 2.1% | -5.7% |

## 3. Spaeri - Rustavi

Compétition : **Erovnuli Liga** — coup d’envoi **09/09/2026 17:00 CEST** — repos **4.1 j / 5.0 j**.

Projection centrale : **0.98–1.36 buts attendus**.

### Forces et forme

- **Spaeri** : rang 9, bilan 5V-9N-10D, buts 32-37, forme récente `DLLDLDLD` ; indices attaque/défense-faiblesse 1.03/1.10.
- **Rustavi** : rang 1, bilan 12V-6N-6D, buts 30-20, forme récente `LDWWWLWW` ; indices attaque/défense-faiblesse 0.99/0.66.

Derniers matchs de l’équipe à domicile : 2026-09-05 Meshakhte 2-2 (A); 2026-08-30 Dinamo Batumi 0-3 (A); 2026-08-22 Samgurali 3-4 (H); 2026-08-17 Gagra 1-1 (A); 2026-08-09 Dinamo Tbilisi 1-2 (H).

Derniers matchs de l’équipe à l’extérieur : 2026-09-04 Dinamo Batumi 0-1 (H); 2026-08-30 Samgurali 1-1 (A); 2026-08-22 Gagra 3-0 (H); 2026-08-15 Dinamo Tbilisi 3-0 (A); 2026-08-07 Torpedo Kutaisi 1-0 (H).

### Probabilités

| Marché | Probabilité | Intervalle 10–90 % | Cote juste |
|---|---:|---:|---:|
| 1 | 27.6% | 15.9%–38.1% | 3.63 |
| N | 27.0% | 23.6%–29.8% | 3.70 |
| 2 | 45.5% | 33.6%–60.0% | 2.20 |
| 1X | 54.5% | 40.0%–66.4% | 1.83 |
| X2 | 72.4% | 61.9%–84.1% | 1.38 |
| 12 | 73.0% | 70.2%–76.4% | 1.37 |
| BTTS Oui | 44.8% | 37.9%–51.2% | 2.23 |
| BTTS Non | 55.2% | 48.8%–62.1% | 1.81 |
| Plus de 1.5 buts | 67.2% | 59.0%–74.8% | 1.49 |
| Plus de 2.5 buts | 41.1% | 31.9%–50.2% | 2.43 |
| Moins de 2.5 buts | 58.9% | 49.8%–68.1% | 1.70 |
| Moins de 3.5 buts | 79.1% | 71.8%–86.0% | 1.26 |
| Domicile plus de 0.5 but | 61.5% | 52.6%–72.3% | 1.62 |
| Extérieur plus de 0.5 but | 73.2% | 63.8%–81.8% | 1.37 |
| Domicile moins de 1.5 but | 74.5% | 63.3%–82.8% | 1.34 |
| Extérieur moins de 1.5 but | 61.1% | 49.2%–72.9% | 1.64 |

Scores exacts : **0-1** 13.3%, **1-1** 12.8%, **0-0** 9.7%, **1-0** 9.3%, **0-2** 9.1%, **1-2** 8.8%.

Face-à-face disponibles : **2**, bilan vu depuis Spaeri : 0V-1N-1D, buts 2-3. Poids informatif faible dans le modèle.

Compositions officielles non disponibles : l’incertitude d’effectif reste ouverte.
Aucune indisponibilité renvoyée par l’endpoint du match ; cela ne prouve pas que l’effectif est complet.
Terrain vérifié : **Mikheil Meskhi 2, Tbilisi (source ligue officielle)**.
Absences/suspensions annoncées officiellement : **Nikoloz Kenchadze (Spaeri, suspendu), Mamuka Kapanadze (Rustavi, suspendu)**.
Le Rustavi concerné est l’équipe API 3501, distincte de Metalurgi/Olimpi Rustavi 13846. Source : [fiche officielle Erovnuli Liga](https://erovnuliliga.ge/en/game/9295-spa-rus).

### Prix disponibles après gel du modèle

| Marché | Proba modèle | Cote juste | Meilleure cote | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| BTTS Non | 55.2% | 1.81 | 2.00 | 10.5% | -2.5% |
| Moins de 4.5 buts | 90.9% | 1.10 | 1.10 | 0.0% | -4.8% |
| Moins de 3.5 buts | 79.1% | 1.26 | 1.30 | 2.8% | -6.7% |
| 12 | 73.0% | 1.37 | 1.33 | -2.9% | -6.7% |
| Moins de 2.5 buts | 58.9% | 1.70 | 1.85 | 9.0% | -7.9% |
| Domicile moins de 2.5 but | 92.1% | 1.09 | 1.06 | -2.4% | -8.7% |
| Plus de 0.5 buts | 90.0% | 1.11 | 1.05 | -5.5% | -9.4% |
| Extérieur moins de 2.5 but | 83.9% | 1.19 | 1.17 | -1.8% | -11.5% |

## 4. FK Jablonec - Baník Ostrava

Compétition : **Czech Liga** — coup d’envoi **09/09/2026 17:00 CEST** — repos **3.1 j / 3.2 j**.

Projection centrale : **1.55–1.08 buts attendus**.

### Forces et forme

- **FK Jablonec** : rang 7, bilan 3V-1N-2D, buts 7-6, forme récente `LDLWWW` ; indices attaque/défense-faiblesse 1.31/0.88.
- **Baník Ostrava** : rang 11, bilan 3V-0N-3D, buts 4-10, forme récente `LWWLLW` ; indices attaque/défense-faiblesse 1.12/0.91.

Derniers matchs de l’équipe à domicile : 2026-09-06 Slovan Liberec 1-2 (H); 2026-09-02 Bohemians 1905 1-1 (A); 2026-08-30 Teplice 0-2 (A); 2026-08-09 Slovácko 1-0 (H); 2026-08-02 Pardubice 2-0 (A).

Derniers matchs de l’équipe à l’extérieur : 2026-09-06 Mlada Boleslav 0-4 (A); 2026-08-29 Sigma Olomouc 1-0 (H); 2026-08-16 Artis 1-0 (H); 2026-08-09 Hradec Králové 1-2 (A); 2026-08-01 Slavia Praha 0-4 (H).

### Probabilités

| Marché | Probabilité | Intervalle 10–90 % | Cote juste |
|---|---:|---:|---:|
| 1 | 48.0% | 42.5%–53.4% | 2.08 |
| N | 25.4% | 23.8%–27.2% | 3.94 |
| 2 | 26.6% | 22.1%–31.8% | 3.75 |
| 1X | 73.4% | 68.2%–77.9% | 1.36 |
| X2 | 52.0% | 46.6%–57.5% | 1.92 |
| 12 | 74.6% | 72.8%–76.2% | 1.34 |
| BTTS Oui | 51.6% | 46.7%–56.2% | 1.94 |
| BTTS Non | 48.4% | 43.8%–53.3% | 2.07 |
| Plus de 1.5 buts | 73.5% | 68.7%–78.0% | 1.36 |
| Plus de 2.5 buts | 48.7% | 42.5%–54.6% | 2.05 |
| Moins de 2.5 buts | 51.3% | 45.4%–57.5% | 1.95 |
| Moins de 3.5 buts | 73.0% | 67.8%–78.3% | 1.37 |
| Domicile plus de 0.5 but | 78.4% | 74.3%–82.2% | 1.28 |
| Extérieur plus de 0.5 but | 65.8% | 60.6%–70.8% | 1.52 |
| Domicile moins de 1.5 but | 54.4% | 48.6%–60.7% | 1.84 |
| Extérieur moins de 1.5 but | 70.6% | 65.2%–76.1% | 1.42 |

Scores exacts : **1-1** 12.1%, **1-0** 11.2%, **2-1** 9.3%, **2-0** 8.7%, **0-1** 7.8%, **0-0** 7.2%.

Face-à-face disponibles : **7**, bilan vu depuis FK Jablonec : 5V-0N-2D, buts 13-7. Poids informatif faible dans le modèle.

Compositions officielles non disponibles : l’incertitude d’effectif reste ouverte.
Aucune indisponibilité renvoyée par l’endpoint du match ; cela ne prouve pas que l’effectif est complet.
Terrain vérifié : **Stadion Strelnice, Jablonec nad Nisou**.
Absences/suspensions annoncées officiellement : **Milla (Jablonec), Gning (Baník), Vlasiy Sinyavskiy (Baník), Michal Kohút (Baník)**.
Match de la 5e journée reprogrammé après le parcours européen de Jablonec. Source : [avant-match officiel Baník](https://www.fcb.cz/clanek.asp?id=Preview-Jablonec-Banik-streda-17-00-12333).

### Prix disponibles après gel du modèle

| Marché | Proba modèle | Cote juste | Meilleure cote | EV centrale | EV conservatrice |
|---|---:|---:|---:|---:|---:|
| Moins de 4.5 buts | 87.2% | 1.15 | 1.16 | 1.2% | -2.8% |
| Domicile moins de 2.5 but | 79.7% | 1.26 | 1.29 | 2.7% | -3.1% |
| Moins de 3.5 buts | 73.0% | 1.37 | 1.42 | 3.6% | -3.8% |
| Domicile moins de 1.5 but | 54.4% | 1.84 | 1.98 | 7.7% | -3.8% |
| Plus de 0.5 buts | 92.6% | 1.08 | 1.06 | -1.8% | -3.8% |
| 2 | 26.6% | 3.75 | 4.29 | 14.3% | -5.1% |
| Extérieur moins de 2.5 but | 90.3% | 1.11 | 1.08 | -2.5% | -5.7% |
| 12 | 74.6% | 1.34 | 1.29 | -3.7% | -6.1% |

## Interprétation

Le ‘marché robuste’ est celui dont la borne basse bootstrap est la plus forte parmi une famille limitée de marchés usuels. Ce n’est pas automatiquement un bon pari : sans cote supérieure à la cote juste avec marge de sécurité, une forte probabilité peut rester un mauvais prix.

Les scores exacts sont les issues individuelles les plus probables, mais restent naturellement peu probables. Cartons rouges, changements tardifs, erreurs et blessures en match ne sont pas prévisibles.
