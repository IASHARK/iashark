# IASHARK — Dictionnaire des features (MASTER V2.1 §10.AP)

Liste les features réellement calculées par le pipeline aujourd'hui (`update-data.yml`), avec leur source et leur fonction de calcul. Ce n'est pas encore un feature store versionné (§10.B) — chaque feature est recalculée à la volée par match, pas stockée avec `available_at`/`observed_at`/`feature_version`. C'est la prochaine étape structurelle si le moteur évolue vers un vrai feature store.

## Force d'équipe (legacy — calcCriteres, calcLambdas)

| Feature | Calcul | Fonction |
|---|---|---|
| `fd` (forme domicile/extérieur) | Ratio victoires / matchs joués (domicile pour l'équipe recevante, extérieur pour l'équipe visiteuse) | `calcCriteres` |
| `att`/`def` | Buts marqués/encaissés par match, bornés | `calcCriteres` |
| `fr` (forme récente) | 5 derniers résultats, pondérés (1.50/1.35/1.20/1.10/1.00, plus récent = plus lourd) | `calcCriteres` |
| `lambdaH`/`lambdaA` | Ratio attaque/défense normalisé par la moyenne de ligue, borné par ligue (`isTop`/`isWC`) | `calcLambdas` |

**Statut §10.D** : pas de decroissance temporelle continue (fenêtre fixe implicite via l'API `/teams/statistics`), pas d'ajustement qualité adversaire. `lib/team-strength.js` (EXPERIMENTAL, non branché) couvre ces deux manques mais n'est pas encore la source de production.

## xG (proxy, jamais nommé xG réel — §10.F)

| Feature | Calcul | Fonction |
|---|---|---|
| `xg_avg` / `xg_against` | `goals_avg*0.65 + (shots_on_target_avg*0.32)*0.35` — **proxy nommé `APPROX_GOAL_THREAT`**, PAS un xG événementiel réel (API-Sports ne fournit pas de xG événementiel exploitable ici) | `calcApproxXG` |

## Fatigue / calendrier (§10.K, simplifié)

| Feature | Calcul | Fonction |
|---|---|---|
| `fatigue.val`/`info` | Fréquence des matchs récents (`last10`) | `calcFatigue` |

**Statut §10.K** : pas de `rest_days`/`matches_last_3_7_14_28`/`travel_km` détaillés — proxy simple, pas la version complète du MASTER.

## Contexte (§10.M, simplifié)

| Feature | Calcul | Fonction |
|---|---|---|
| `motivation.alerts` | Classement, points, écart au titre/à la relégation | `calcMotivation` |
| `disciplineRisk` | Stats arbitre (cartons/pénaltys par match) + xG proxy | `calcDisciplineRisk` |
| `matchup.insights` | Comparaison xG/stats des deux équipes | `calcMatchup` |
| `tendances` | Comparaison des 10 derniers matchs des deux équipes | `calcTendances` |

**Statut §10.M** : proxies observables corrects en esprit (pas de "motivation 90/100" halluciné), mais pas encore les indices formalisés (`COMPETITION_STAGE_INDEX`, `STAKES_INDEX`, `TABLE_PRESSURE_PROXY`) du MASTER.

## Absences (§10.I, simplifié)

| Feature | Calcul | Fonction |
|---|---|---|
| `keyAbsenceAlerts` | Croise `injuries` (liste brute api-football) avec les meilleurs buteurs connus | `calcKeyAbsences` |

**Statut §10.I** : liste brute + croisement buteurs, pas de `ABSENCE_WEIGHTED_ATTACK_IMPACT` pondéré par le rôle réel du joueur (minutes, statut titulaire).

## Segments temporels (§10.W, simplifié)

| Feature | Calcul | Fonction |
|---|---|---|
| `slotSummary` | Répartition des buts marqués/encaissés par tranche de 15 min, calculée depuis les événements des 10 derniers matchs | `calcSlotSummary` |

**Statut §10.W** : distribution empirique simple, pas un vrai modèle temporel (piecewise Poisson/hazard model).

## Marché (nouveau ce jalon)

| Feature | Calcul | Fonction |
|---|---|---|
| `pickedMarket` | Marché de plus haute probabilité modèle parmi les marchés jouables (cote ≥ 1.50) | `lib/decision.js#pickMarketDeterministic` |
| `modelAgreement` | Écart-type entre les probabilités 1X domicile de Poisson/Dixon-Coles/Monte-Carlo | `lib/decision.js#computeModelAgreement` |
| `dataQuality` | Score 0-100 pondéré (présence team stats/odds/injuries/H2H/Elo/lineups) | `lib/decision.js#computeDataQualityScore` |

## Non implémenté (§10.G, §10.H, §10.J, §10.L, §10.N, §10.O, §10.X, §10.Y, §10.Z)

Player Impact ratings, Squad Continuity/Transfer indices, Lineup Strength (expected XI probabiliste), Coach/Tactical Stability, Early-Season priors hiérarchiques, Venue/Travel/Environment, Corners features, Cards features, Player props features — aucun n'est calculé aujourd'hui, faute de collecte de données dédiée (voir `IASHARK_V2_EXECUTION_STATE.md`).
