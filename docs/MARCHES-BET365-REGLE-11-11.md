# Marchés Bet365 d'API-Sports et règle du pari du 11/11/2026

Décision de Clément du 11/11/2026 (21 h 40 et 21 h 50) : le pari affiché est choisi parmi TOUS les marchés cotés par Bet365 (bookmaker 8 d'API-Football), cote 1,70-3,50, sans exclusion de famille par défaut ; seul est écarté un marché qu'on ne sait pas régler automatiquement après le match (jamais publié).

- Liste : `/odds/bets` d'API-Sports, 338 types, relevée le 11/11/2026 (un seul appel).
- « Offert par Bet365 » : part des 1052 matchs archivés (odds_snapshots, 06/10-11/11/2026) où Bet365 cote ce type.
- 110 types vus chez Bet365 ; 130 types candidats (réglables), dont 81 vus chez Bet365.
- Méthode de chance juste : la même pour toutes les familles (code : lib/flux-paris.js#selectionsDuMatch, réglages : config/marches-pari.json#choix_du_pari).
  - Marché complet (toutes les issues cotées) : marge retirée par la méthode puissance (somme des (1/cote)^k = 1).
  - Marché d'un seul côté (buteurs, joueurs « N ou plus », « Home / Away » qui peuvent perdre tous les deux) : la méthode puissance est impossible ; chance = (1/cote)/(1+M), M = max(15 %, 3 × marge du 1N2 Bet365 du même match) ; buteurs : en plus, la somme des chances des buteurs d'une équipe ne dépasse jamais ses buts attendus (lignes de buts Bet365). M est provisoire : à calibrer par le mathématicien (verdict ROUGE du 06/10 : joueurs annoncés 70 %, 29 % réels).
  - Pinnacle : quand il cote la même issue, écart de chance > 8 points = issue écartée.
  - Moteur v3 (dépôt privé) : là où il calcule le marché et le dit juste, chance = le plus bas des deux.
- Règlement : lib/flux-paris.js#regler, données d'API-Football du match terminé. Cartons : jaune = 1, rouge = 2, 2e jaune non compté en plus (au plus 3 par joueur), carton sans joueur (banc) non compté, temps réglementaire : règle Bet365 à confirmer par l'ingénieur données.

| Id | Marché (API-Sports) | Offert par Bet365 | Famille | Réglable automatiquement (donnée API) | Chance juste utilisée |
|---|---|---|---|---|---|
| 1 | Match Winner | 99 % | Résultat | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 2 | Home/Away | 99 % | — | non : remboursé si nul : remboursement, règlement non branché | — |
| 3 | Second Half Winner | 94 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 4 | Asian Handicap | 99 % | Handicap asiatique | oui : score final et mi-temps (/fixtures) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 5 | Goals Over/Under | 99 % | Buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 6 | Goals Over/Under First Half | 96 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 7 | HT/FT Double | 98 % | Mi-temps/fin | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 8 | Both Teams Score | 98 % | Les deux marquent | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 9 | Handicap Result | 97 % | Handicap européen | oui : score final et mi-temps (/fixtures) | puissance sur les 3 issues de la ligne ; contrôle Pinnacle (écart > 8 points : écarté) |
| 10 | Exact Score | 99 % | Score exact | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 11 | Highest Scoring Half | 95 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 12 | Double Chance | 98 % | Double chance | oui : score final et mi-temps (/fixtures) | somme de 2 issues du marché à 3 issues sans marge (puissance) ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 13 | First Half Winner | 99 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 14 | Team To Score First | 95 % | Ordre des buts | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 15 | Team To Score Last | 96 % | Ordre des buts | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 16 | Total - Home | 95 % | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 17 | Total - Away | 95 % | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 18 | Handicap Result - First Half | 98 % | Handicap européen | oui : score final et mi-temps (/fixtures) | puissance sur les 3 issues de la ligne ; contrôle Pinnacle (écart > 8 points : écarté) |
| 19 | Asian Handicap First Half | 98 % | Handicap asiatique | oui : score final et mi-temps (/fixtures) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 20 | Double Chance - First Half | 99 % | Mi-temps | oui : score final et mi-temps (/fixtures) | somme de 2 issues du marché à 3 issues sans marge (puissance) ; moteur v3 : le plus bas des deux là où il dit le marché juste ; contrôle Pinnacle (écart > 8 points : écarté) |
| 21 | Odd/Even | 96 % | Pair/impair | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 22 | Odd/Even - First Half | 96 % | Pair/impair | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 23 | Home Odd/Even | 95 % | Pair/impair | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 24 | Results/Both Teams Score | 98 % | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 25 | Result/Total Goals | 98 % | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 26 | Goals Over/Under - Second Half | 97 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 27 | Clean Sheet - Home | 96 % | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 28 | Clean Sheet - Away | 96 % | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 29 | Win to Nil - Home | jamais vu | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 30 | Win to Nil - Away | jamais vu | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 31 | Correct Score - First Half | 98 % | Score exact | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 32 | Win Both Halves | 98 % | Mi-temps | oui : score final et mi-temps (/fixtures) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 33 | Double Chance - Second Half | jamais vu | Mi-temps | oui : score final et mi-temps (/fixtures) | somme de 2 issues du marché à 3 issues sans marge (puissance) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 34 | Both Teams Score - First Half | 98 % | Les deux marquent | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 35 | Both Teams To Score - Second Half | 98 % | Les deux marquent | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 36 | Win To Nil | 98 % | Résultat et buts | oui : score final et mi-temps (/fixtures) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 37 | Home win both halves | jamais vu | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 38 | Exact Goals Number | 97 % | Nombre de buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 39 | To Win Either Half | 98 % | Mi-temps | oui : score final et mi-temps (/fixtures) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 40 | Home Team Exact Goals Number | 95 % | Nombre de buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 41 | Away Team Exact Goals Number | 95 % | Nombre de buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 42 | Second Half Exact Goals Number | 96 % | Nombre de buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 43 | Home Team Score a Goal | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 44 | Away Team Score a Goal | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 45 | Corners Over Under | 96 % | Corners | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 46 | Exact Goals Number - First Half | 94 % | Nombre de buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 47 | Winning Margin | 95 % | — | non : écart de victoire : libellés ambigus (« Draw » et « Score Draw ») | — |
| 48 | To Score In Both Halves By Teams | 98 % | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 49 | Total Goals/Both Teams To Score | 98 % | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 50 | Goal Line | 99 % | Buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 51 | Halftime Result/Total Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 52 | Halftime Result/Both Teams Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 53 | Away win both halves | jamais vu | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 54 | First 10 min Winner | 93 % | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 55 | Corners 1x2 | 4 % | Corners | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 56 | Corners Asian Handicap | 95 % | Corners | oui : statistiques d'équipe (/fixtures/statistics) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 57 | Home Corners Over/Under | 95 % | Corners | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 58 | Away Corners Over/Under | 95 % | Corners | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 59 | Own Goal | 86 % | Ordre des buts | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 60 | Away Odd/Even | 94 % | Pair/impair | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 61 | To Qualify | 3 % | — | non : qualification : dépend du match aller (score cumulé non fourni) | — |
| 62 | Correct Score - Second Half | jamais vu | Score exact | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 63 | Odd/Even - Second Half | 95 % | Pair/impair | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 72 | Goal Line (1st Half) | 98 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 73 | Both Teams to Score 1st Half - 2nd Half | jamais vu | — | non branché : règle de règlement à écrire | — |
| 74 | 10 Over/Under | jamais vu | — | non branché : règle de règlement à écrire | — |
| 75 | Last Corner | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 76 | First Corner | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 77 | Total Corners (1st Half) | 96 % | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 78 | RTG_H1 | 94 % | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 79 | Cards European Handicap | 43 % | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 80 | Cards Over/Under | 48 % | Cartons | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 81 | Cards Asian Handicap | 45 % | Cartons | oui : événements du match (/fixtures/events) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 82 | Home Team Total Cards | 43 % | Cartons | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 83 | Away Team Total Cards | 43 % | Cartons | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 84 | Total Corners (3 way) (1st Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 85 | Total Corners (3 way) | 96 % | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 86 | RCARD | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 87 | Total ShotOnGoal | 34 % | Tirs | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 88 | Home Total ShotOnGoal | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 89 | Away Total ShotOnGoal | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 91 | Total Goals (3 way) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 92 | Anytime Goal Scorer | 88 % | Buteurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) + plafond aux buts attendus de l'équipe (buts Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 93 | First Goal Scorer | 88 % | — | non : premier buteur : règle des buts contre son camp différente selon les bookmakers | — |
| 94 | Last Goal Scorer | 88 % | — | non : dernier buteur : idem | — |
| 95 | To Score Two or More Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 96 | Last Goal Scorer | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 97 | First Goal Method | 50 % | — | non : façon de marquer le premier but (tête, coup franc, tir) : absente des événements | — |
| 99 | To Score A Penalty | 50 % | Ordre des buts | oui : événements du match (/fixtures/events) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 100 | To Miss A Penalty | 50 % | Ordre des buts | oui : événements du match (/fixtures/events) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 102 | Player to be booked | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 103 | Player to be Sent Off | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 104 | Asian Handicap (2nd Half) | jamais vu | Handicap asiatique | oui : score final et mi-temps (/fixtures) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 105 | Home Team Total Goals(1st Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 106 | Away Team Total Goals(1st Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 107 | Home Team Total Goals(2nd Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 108 | Away Team Total Goals(2nd Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 109 | Draw No Bet (1st Half) | jamais vu | — | non : remboursé si nul : idem | — |
| 110 | Scoring Draw | jamais vu | Résultat et buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 111 | Home team will score in both halves | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 112 | Away team will score in both halves | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 113 | Both Teams To Score in Both Halves | jamais vu | Les deux marquent | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 114 | Home Team Score a Goal (1st Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 115 | Home Team Score a Goal (2nd Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 116 | Away Team Score a Goal (1st Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 117 | Away Team Score a Goal (2nd Half) | jamais vu | Buts d'une équipe | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 118 | Home Win/Over | jamais vu | — | non branché : règle de règlement à écrire | — |
| 119 | Home Win/Under | jamais vu | — | non branché : règle de règlement à écrire | — |
| 120 | Away Win/Over | jamais vu | — | non branché : règle de règlement à écrire | — |
| 121 | Away Win/Under | jamais vu | — | non branché : règle de règlement à écrire | — |
| 122 | Home team will win either half | jamais vu | — | non branché : règle de règlement à écrire | — |
| 123 | Away team will win either half | jamais vu | — | non branché : règle de règlement à écrire | — |
| 124 | Home Come From Behind and Win | jamais vu | Ordre des buts | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 125 | Corners Asian Handicap (1st Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 126 | Corners Asian Handicap (2nd Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 127 | Total Corners (2nd Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 128 | Total Corners (3 way) (2nd Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 129 | Away Come From Behind and Win | jamais vu | Ordre des buts | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 130 | Corners 1x2 (1st Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 131 | Corners 1x2 (2nd Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 132 | Home Total Corners (1st Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 133 | Home Total Corners (2nd Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 134 | Away Total Corners (1st Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 135 | Away Total Corners (2nd Half) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 136 | 1x2 - 15 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 137 | 1x2 - 60 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 138 | 1x2 - 75 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 139 | 1x2 - 30 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 140 | DC - 30 minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 141 | DC - 15 minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 142 | DC - 60 minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 143 | DC - 75 minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 144 | Goal in 1-15 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 145 | Goal in 16-30 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 146 | Goal in 31-45 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 147 | Goal in 46-60 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 148 | Goal in 61-75 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 149 | Goal in 76-90 minutes | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 150 | Home Team Yellow Cards | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 151 | Away Team Yellow Cards | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 152 | Yellow Asian Handicap | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 153 | Yellow Over/Under | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 154 | Yellow Double Chance | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 155 | Yellow Over/Under (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 156 | Yellow Over/Under (2nd Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 157 | Yellow Odd/Even | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 158 | Yellow Cards 1x2 | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 159 | Yellow Asian Handicap (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 160 | Yellow Asian Handicap (2nd Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 161 | Yellow Cards 1x2 (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 162 | Yellow Cards 1x2 (2nd Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 163 | Penalty Awarded | jamais vu | — | non branché : règle de règlement à écrire | — |
| 164 | Offsides Total | 2 % | Hors-jeu | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 165 | Offsides 1x2 | jamais vu | Hors-jeu | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 166 | Offsides Handicap | jamais vu | Hors-jeu | oui : statistiques d'équipe (/fixtures/statistics) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 167 | Offsides Home Total | 2 % | Hors-jeu | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 168 | Offsides Away Total | 2 % | Hors-jeu | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 169 | Offsides Double Chance | jamais vu | Hors-jeu | oui : statistiques d'équipe (/fixtures/statistics) | somme de 2 issues du marché à 3 issues sans marge (puissance) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 170 | Fouls. Away Total | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 171 | Fouls. Home Total | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 172 | Fouls. Double Chance | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | somme de 2 issues du marché à 3 issues sans marge (puissance) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 173 | Fouls. Total | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 174 | Fouls. Handicap | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 175 | Fouls. 1x2 | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 176 | ShotOnTarget 1x2 | 34 % | Tirs | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 177 | ShotOnTarget Handicap | jamais vu | Tirs | oui : statistiques d'équipe (/fixtures/statistics) | puissance par demi-ligne (2 issues) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 178 | ShotOnTarget Double Chance | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 179 | First Team to Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 180 | Last Team to Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 181 | European Handicap (2nd Half) | jamais vu | Handicap européen | oui : score final et mi-temps (/fixtures) | puissance sur les 3 issues de la ligne ; contrôle Pinnacle (écart > 8 points : écarté) |
| 182 | Draw No Bet (2nd Half) | jamais vu | — | non : remboursé si nul : idem | — |
| 183 | Double Chance/Total | jamais vu | — | non branché : règle de règlement à écrire | — |
| 184 | To Score in Both Halves | jamais vu | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 185 | First Team to Score (3 way) 1st Half | jamais vu | Ordre des buts | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 186 | Total Goals Number By Ranges | jamais vu | — | non branché : règle de règlement à écrire | — |
| 187 | Total Goals By Ranges (1st Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 188 | Clean Sheet | jamais vu | — | non branché : règle de règlement à écrire | — |
| 189 | To Advance Handicap | jamais vu | — | non branché : règle de règlement à écrire | — |
| 190 | Home Exact Goals Number (1st Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 191 | Away Exact Goals Number (1st Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 192 | Home Highest Scoring Half | 96 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 193 | Away Highest Scoring Half | 96 % | Mi-temps | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 194 | Result/Total Goals (2nd Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 195 | Either Team Wins By 1 Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 196 | Either Team Wins By 2 Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 197 | Over/Under 15m-30m | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 198 | Over/Under 30m-45m | jamais vu | Minutes | oui : événements du match (/fixtures/events) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 199 | Home Win To Nill (1st Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 200 | Home Win To Nill (2nd Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 201 | To Score In 1st Half | jamais vu | — | non branché : règle de règlement à écrire | — |
| 202 | To Score In 2nd Half | jamais vu | — | non branché : règle de règlement à écrire | — |
| 203 | Yellow Cards. Odd/Even (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 204 | Yellow Cards. Odd/Even (2nd Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 205 | First Team to Score (3 way) 2nd Half | jamais vu | — | non branché : règle de règlement à écrire | — |
| 206 | Home No Bet | jamais vu | — | non branché : règle de règlement à écrire | — |
| 207 | Away No Bet | jamais vu | — | non branché : règle de règlement à écrire | — |
| 208 | Corners. First Corner (3 way) | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 209 | Home Come From Behind and Draw | jamais vu | — | non branché : règle de règlement à écrire | — |
| 210 | Away Come From Behind and Draw | jamais vu | — | non branché : règle de règlement à écrire | — |
| 211 | Total Shots | 35 % | Tirs | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 212 | Player Assists | 0 % | — | non : passes décisives d'un joueur : marché sans nom de joueur | — |
| 213 | Player Triples | 19 % | — | non : « Player Triples » : marché non documenté | — |
| 214 | Player Points | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 215 | Player Singles | 68 % | — | non : « Player Singles » : marché non documenté (doublon des tirs ?) | — |
| 216 | Multi Touchdown Scorer (2 or More) | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 217 | Multi Touchdown Scorer (3 or More) | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 218 | Away Anytime Goal Scorer | 88 % | Buteurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) + plafond aux buts attendus de l'équipe (buts Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 219 | Away First Goal Scorer | 88 % | — | non : premier buteur : idem | — |
| 220 | Shots. Away Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 221 | Shots. Home Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 222 | To Win From Behind | 98 % | Ordre des buts | oui : événements du match (/fixtures/events) | un seul côté : (1/cote)/(1+M), M = max(15 %, 3 × marge 1N2 Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 223 | Number of Goals In Match (Range) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 224 | Game Decided After Penalties | 2 % | Prolongation | oui : statut final AET/PEN (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 225 | Game Decided in Extra Time | 2 % | Prolongation | oui : statut final AET/PEN (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 226 | Away Last Goal Scorer | 88 % | — | non : dernier buteur : idem | — |
| 227 | Goal Method Header | jamais vu | — | non branché : règle de règlement à écrire | — |
| 228 | Home Goal Method Header | 45 % | — | non : but de la tête : absent des événements | — |
| 229 | Goal Method Outside the Box | 45 % | — | non : but hors de la surface : absent des événements | — |
| 230 | Home Goal Method Outside the Box | jamais vu | — | non branché : règle de règlement à écrire | — |
| 231 | Home Anytime Goal Scorer | 88 % | Buteurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) + plafond aux buts attendus de l'équipe (buts Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 232 | Home First Goal Scorer | 88 % | — | non : premier buteur : idem | — |
| 233 | Home Last Goal Scorer | 88 % | — | non : dernier buteur : idem | — |
| 234 | Home To Score Three or More Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 235 | Away To Score Three or More Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 236 | Away To Score Two or More Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 237 | Home To Score Two or More Goals | jamais vu | — | non branché : règle de règlement à écrire | — |
| 238 | Home Team Goalscorers First | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 239 | Corners. European Handicap | 92 % | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 240 | Home Player Shots | 68 % | Joueurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 241 | Away Player Shots | 68 % | Joueurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 242 | Player Shots On Target | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 243 | Home Shots On Target | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 244 | Away Shots On Target | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 245 | Away Goal Method Header | 45 % | — | non : but de la tête : absent des événements | — |
| 246 | Away Goal Method Outside the Box | jamais vu | — | non branché : règle de règlement à écrire | — |
| 247 | Corners Race To | 92 % | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 248 | Time Of 1st Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 249 | Multicorners | 91 % | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 250 | First Card Received (3 way) | 42 % | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 251 | Player to be booked | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 252 | Both Teams to Receive a Card | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 253 | Time Of 1st Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 254 | Team Performances (Range) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 255 | Home Player Assists | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 256 | Away Player Assists | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 257 | Player to Score or Assist | 66 % | Buteurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) + plafond aux buts attendus de l'équipe (buts Bet365) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 258 | Home Player to Score or Assist | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 259 | Away Player to Score or Assist | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 260 | Team Time Of 1st Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 261 | Total Goal Minutes (Range) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 262 | Late Goal (Range) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 263 | Early Goal (Range) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 264 | Player Shots On Target Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 265 | Player Shots Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 266 | Player Fouls Committed | 21 % | Joueurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 267 | Goalkeeper Saves | 29 % | Joueurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 268 | Home Goalkeeper Saves | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 269 | Home Player Shots On Target Total | 68 % | Joueurs | oui : effectifs + statistiques joueurs (/fixtures/players, /fixtures/events) | un seul côté : (1/cote)/(1+M) ; contrôle Pinnacle (écart > 8 points : écarté) |
| 270 | Home Player Shots Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 271 | Home Player Fouls Committed | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 272 | Home Player Tackles | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 273 | Home Player Passes | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 274 | Away Goalkeeper Saves | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 275 | Away Player Shots On Target Total | 45 % | — | non : libellé incohérent avec les cotes relevées | — |
| 276 | Away Player Shots Total | 35 % | — | non : libellé incohérent avec les cotes relevées | — |
| 277 | Away Player Fouls Committed | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 278 | Away Player Tackles | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 279 | Away Player Passes | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 280 | First Set Piece 5 Minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 281 | Total Tackles | 4 % | — | non : tacles : non fournis dans les statistiques d'équipe | — |
| 282 | Double Chance/Both Teams To Score | jamais vu | — | non branché : règle de règlement à écrire | — |
| 283 | Away Win To Nill (1st Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 284 | Away Win To Nill (2nd Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 285 | Team To Score (Goals) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 286 | Team Goalscorers First | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 287 | Team Goalscorers Last | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 288 | Home Team Goalscorers Last | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 289 | Away Team Goalscorers First | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 290 | Away Team Goalscorers Last | jamais vu | — | non branché : marché joueur à décrire (format des valeurs) | — |
| 291 | Time of First Goal Brackets (Range) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 292 | Over/Under between 0 and 10m | jamais vu | — | non branché : règle de règlement à écrire | — |
| 293 | Double Chance 0-15m | jamais vu | — | non branché : règle de règlement à écrire | — |
| 294 | Double Chance 15-30m | jamais vu | — | non branché : règle de règlement à écrire | — |
| 295 | Corners. Total (Range) | 96 % | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 296 | Double Chance 30-45m | jamais vu | — | non branché : règle de règlement à écrire | — |
| 297 | Corners. total between 0 and 10m | 95 % | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 298 | Method of Victory | 3 % | Prolongation | oui : statut final AET/PEN (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 299 | Cards over/under between 0 and 10 m | 47 % | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 300 | Both Teams to Receive 2+ Cards | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 301 | Tackles. Away Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 302 | Tackles. Home Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 303 | Over/Under between 0 and 10 m | jamais vu | — | non branché : règle de règlement à écrire | — |
| 304 | Over/Under between  0 and 10 m | jamais vu | — | non branché : règle de règlement à écrire | — |
| 305 | Race to the 2nd goal? | jamais vu | — | non branché : règle de règlement à écrire | — |
| 306 | Race to the 3rd goal? | jamais vu | — | non branché : règle de règlement à écrire | — |
| 307 | Corners. Double Chance | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 308 | Race To | jamais vu | — | non branché : règle de règlement à écrire | — |
| 309 | Yellow Cards. Home Total (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 310 | Yellow Cards Away Total (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 311 | Which team will score the 1st goal? | jamais vu | — | non branché : règle de règlement à écrire | — |
| 312 | 1x2 - 20 minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 313 | Offsides Odd/Even | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 314 | Fouls Odd/Even | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 315 | Saves Total | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 316 | Saves 1x2 | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 317 | Saves Asian H | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 318 | Saves O/U Home | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 319 | Saves O/U Away | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 320 | Saves Double Chance | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 321 | Penalty Awarded (1st Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 322 | Penalty Awarded (2nd Half) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 323 | Saves Odd/Even | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 324 | Corner in 1-15 minutes | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 325 | Corner in 16-30 minutes | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 326 | Corner in 31-45 minutes | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 327 | Corner in 45-60 minutes | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 328 | Corner in 60-75 minutes | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 329 | Corner in 75-90 minutes | jamais vu | — | non : il faudrait la minute de chaque corner/carton/tir, absente d'API-Football | — |
| 330 | Home Not lose/Over | jamais vu | — | non branché : règle de règlement à écrire | — |
| 331 | Home Not lose/Under | jamais vu | — | non branché : règle de règlement à écrire | — |
| 332 | Away Not lose/Over | jamais vu | — | non branché : règle de règlement à écrire | — |
| 333 | Away Not lose/Under | jamais vu | — | non branché : règle de règlement à écrire | — |
| 334 | 1x2 - 70 minutes | jamais vu | — | non branché : règle de règlement à écrire | — |
| 335 | Red Cards Over/Under | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 336 | Goal Line | jamais vu | — | non branché : règle de règlement à écrire | — |
| 337 | Asian Handicap (Sets) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 338 | Corners. Odd/Even | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 339 | Corners. Double Chance | jamais vu | — | non branché : règle à écrire (statistiques ou événements), à vérifier marché par marché | — |
| 340 | Shots.1x2 | 34 % | Tirs | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 341 | (sans nom) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 342 | Red Card In The Match (1st Half) | jamais vu | — | non : cartons : règlement automatique non vérifié (rouge compté 1 ou 2, 2e jaune, cartons du banc : règles du bookmaker) | — |
| 343 | Fouls. Odd/Even | jamais vu | Fautes | oui : statistiques d'équipe (/fixtures/statistics) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |
| 344 | Odd/Even (1st Set) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 345 | Set Betting | jamais vu | — | non branché : règle de règlement à écrire | — |
| 346 | Extra Point (1st Set) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 347 | Home Winning Margin (1st Set) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 348 | Away Winning Margin (1st Set) | jamais vu | — | non branché : règle de règlement à écrire | — |
| 349 | Number Of Goals In Match | 96 % | Nombre de buts | oui : score final et mi-temps (/fixtures) | puissance sur le marché complet ; contrôle Pinnacle (écart > 8 points : écarté) |

