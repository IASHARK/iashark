# IASHARK : système de contenu social et garde-fous d'exactitude

**Statut : REVIEW.** Le document est à valider par le propriétaire. Les points juridiques sont à confirmer par un avocat.
**Date :** 19/09/2026.
**Données utilisées :**
- `data-home.json`, run `DAILY_2026-09-19`, `generated_at` 2026-09-19T11:50:15Z, soit 13 h 50, heure de Paris ;
- `match/<id>.json` téléchargés le 19/09 vers 21 h 50 ;
- le code lu en lecture seule dans `wt-seo` (branche `nuit/travail`) et dans `iashark/remotion-score-template`.

**Prototype exécutable :** `scratchpad/social-sys/facts_proto.py` écrit toutes les phrases « PUBLIE » citées dans ce document. Sa sortie brute est dans `scratchpad/social-sys/facts-output-2026-09-19.txt`.

---

## 0. L'essentiel en 12 lignes

1. Le propriétaire a raison : les textes des vidéos sont aujourd'hui écrits à la main ou par un LLM, puis collés dans le gabarit. Rien ne les relie aux données. Plusieurs phrases publiées sont fausses ou trompeuses. La section 1 les liste une par une.
2. Le principe à adopter : **aucune phrase libre.** Chaque phrase affichée vient d'un gabarit de la bibliothèque de faits (section 3). Un calcul la remplit à partir d'un champ nommé, avec des seuils. Une fiche de preuves l'accompagne.
3. Les contrôles automatiques bloquent toute phrase dont un nombre n'a pas de preuve. Ils bloquent aussi une fenêtre fausse (« 20 derniers matchs » pour un promu qui n'en a que 4), un joueur parti, un mot interdit ou une fuite du pick Pro. Une phrase bloquée devient `MISSING`. Elle n'est jamais adoucie en texte vague.
4. **Même formule que le site.** La vidéo doit reprendre exactement le calcul de `lib/match-view-model.js#goalTiming`. Aujourd'hui, la vidéo Lyon–Rennes annonce un pic « à la reprise » alors que la page du site affiche 15-30 min.
5. Le paywall est protégé par construction. Le générateur social ne lit **que** les JSON publics de iashark.com. Pour un match non offert, ces fichiers ne contiennent aucun champ premium (vérifié sur 3 matchs non offerts ; le match offert, lui, les contient bien).
6. Il y a trois lignes rouges juridiques :
   - L121-4 15° du code de la consommation : dire qu'un service « augmente les chances de gagner » est une pratique trompeuse **même si c'est vrai** ;
   - loi 2023-451, art. 4-VI : aucun influenceur ne peut promouvoir un abonnement à des pronostics ;
   - règles TikTok : un contenu qui fait la promotion des paris est exclu du fil Pour toi, voire retiré.
7. Il y a 13 formats récurrents nommés (section 9). Huit peuvent être entièrement automatisés depuis les données du site : Remotion pour la vidéo, Remotion Still ou HTML+Playwright pour le statique.
8. Conversion : le lien en bio pointe vers `/fr/#decisions` (l'analyse offerte du jour, calculée selon le marché et le fuseau du visiteur). Attention, `utm_content` **n'est pas enregistré** par `funnel-track.js`. La variante de hook va donc dans `utm_campaign`.
9. Onze décisions attendent le propriétaire (`BLOCKED_DECISION`, section 14). La plus urgente : le Match Pulse montre publiquement la répartition des buts par tranche de 15 min. Or la page match présente justement ce « scénario par tranche de 15 minutes » comme un contenu Pro (`pro_gate_item_scenario`).
10. Il faut arrêter définitivement `generate_tiktok_images.js`. Il demande à un LLM d'« estimer » des tirs, des corners et un score, puis les publie en image : ce sont des statistiques inventées.
11. Les anciens scripts de `docs/research/social/` ne doivent plus être réutilisés. On y lit « le modèle calcule cent pour cent », « il gagne de l'argent », « tout est public ». Ils mettent aussi en scène un faux consommateur (« je n'y connais rien, j'ai testé »).
12. La relecture humaine dure 30 secondes par vidéo (section 7). Elle arrive **après** les contrôles automatiques et ne les remplace pas.

---

## 1. Audit de l'existant : ce qui produit aujourd'hui des phrases fausses

Tous les exemples viennent des données réelles du 19/09/2026.

### 1.1 Deux formules différentes pour le même « % des buts »

| | Site (`lib/match-view-model.js#goalTiming`) | Vidéo (`make-pulse.py#shares`) |
|---|---|---|
| Ce qui est compté | les buts **marqués** par les 2 équipes | marqués + encaissés des 2 équipes (4 séries) |
| Lyon–Rennes, tranche la plus fournie | **15-30 min (20,3 %)** | **45-60 min (22 %)**, avec le texte « LE PIC DE DANGER ARRIVE À LA REPRISE » |
| Roma–Inter, 45-60 min | 27,1 % | 28 % |

Un spectateur qui clique voit un autre chiffre sur le site. Pour lui, IASHARK « raconte n'importe quoi ».

**Règle :** une seule implémentation. Le générateur appelle `goalTiming()` du site (même fichier, même seuil `total < 10 → null`).

### 1.2 Les tranches n'ont pas les bornes que les textes leur prêtent

Le pipeline (`.github/workflows/update-data.yml`, `calcEventsPattern`) range un but selon `time.elapsed`, par intervalles `[0,15) [15,30) [30,45) [45,60) [60,75) [75,91)`. Un but à 45+2 porte `elapsed = 45` : il tombe donc dans la tranche **45-60**, alors qu'il a été marqué **avant** la pause.

- « L'Inter a marqué 16 buts **à la reprise** » est faux. Il faut écrire « entre la 45e et la 59e minute (arrêts de jeu de la 1re période compris) ».
- « Le gros du danger arrive **après la pause** » est faux de la même façon. En plus, c'est une prévision.
- « Dernier quart d'heure » pour 75-90 reste juste : la tranche contient bien le temps additionnel.

### 1.3 « Sur ses 20 derniers matchs » : mauvaise compétition, et parfois pas 20

`getLast10(team, season, leagueId)` filtre sur **le championnat** : ce sont les 20 derniers matchs de Ligue 1, saison en cours plus saison précédente. Les coupes et l'Europe en sont exclues.

- La formulation juste est donc « sur ses 20 derniers matchs **de Ligue 1** ». Jamais « cette saison » : le code du site le rappelle déjà (commentaire du 18/09 dans `match-page.js#scenarioCard`).
- Les promus ont `games = 4`, parce que leur saison précédente s'est jouée en Ligue 2 : **Estac Troyes et Le Mans**, sur la journée du 19-20/09. Un gabarit qui écrit « 20 » en dur ment sur ces deux équipes.

### 1.4 Deux champs « forme » dans des ordres opposés

Pour Marseille, `form_home` liste Rennes (D), Paris FC (D), Monaco (D), Strasbourg (V), du plus récent au plus ancien. Le champ `forme_h = "WLLL"` donne la même série à l'envers, du plus ancien au plus récent.

Lu naïvement, « WLLL » ferait écrire « l'OM reste sur une victoire ». La réalité est l'inverse : **3 défaites consécutives**.

**Règle :** seul `form_home`/`form_away` est utilisé (liste datée).

### 1.5 H2H : toutes compétitions, pas de tirs au but, et un `w` piégeux

`formatH2H` ne garde que le score :
- pas de compétition ;
- pas de séance de tirs au but ;
- le lieu est nominal, même sur terrain neutre.

Le champ `w` vaut `"1"` quand **l'équipe qui reçoit le match à venir** a gagné, et non l'équipe à domicile de ce match passé. Exemple : Inter 0-1 Roma (27/04/2025) porte `w: "1"`, parce que la Roma reçoit le 19/09.

**Règle :**
- on recalcule le vainqueur depuis le score et les noms, puis on compare à `w`. Au moindre écart, la phrase est bloquée ;
- la mention « toutes compétitions » est obligatoire ;
- « X n'a pas perdu » est interdit, car un nul peut avoir été perdu aux tirs au but.

### 1.6 Les absents sont en double

| Match | Lignes dans `injuries` | Joueurs réels |
|---|---|---|
| OM–PSG | 12 (et `injuries_count` = 12) | 6 |
| Lyon–Rennes | 8 | 4 |
| Fulham–United | 18 | 9 |

Le site dédoublonne déjà (`uniqueInjuries`). La vidéo doit utiliser la même fonction.

Autre piège : les raisons ne sont pas toutes des blessures. On trouve aussi `Inactive` et `Coach's decision`. Écrire « 3 blessés au PSG » serait faux : Zabarnyi est absent sur choix de l'entraîneur.

### 1.7 Joueur « en forme » qui n'est plus au club

Le passeur le plus prolifique de l'OM sur les 10 derniers matchs de Ligue 1 est `hot_assist_home = M. Greenwood` (3 passes). Or Greenwood **n'est pas dans `current_squads.home`**.

**Règle :** un joueur n'est cité que s'il remplit les deux conditions :
- son `player_id` figure dans l'effectif actuel ;
- il n'est pas dans la liste des absents.

Autre détail : les noms varient pour un même joueur (« C. Tolisso » / « Corentin Tolisso »). On affiche toujours le nom de `current_squads`.

### 1.8 La « fatigue » ignore l'Europe et les coupes

`calcFatigue(last10H)` ne voit que les matchs de championnat. « Repos 8 jours » pour l'OM ou « dernier match il y a 6 j » pour le PSG ne tient pas compte d'un éventuel match de coupe ou d'Europe en semaine.

**Règle : champ interdit en social.**

### 1.9 Les textes rédigés par IA contredisent les données (match offert Fulham–United)

- `scenario_15min[2]` affirme que « Fulham n'encaisse que 4 % des siens » entre la 30e et la 45e. Les données `events_home.slots_against` disent **7 sur 27, soit 26 %**. Le texte s'appuie sur un autre échantillon et sur un autre calcul.
- `conseil_public` commence par « **Miser** sur un total de buts contenu… ». C'est une incitation directe à parier, impossible à publier en social.
- `paris_safe.proba = "63%"` alors que la page affiche `model_probability = 69,8 %` et `conf = 7/10`. Seule la valeur de la vue (`buildMatchViewModel().recommendation`) fait foi.

**Règle :** aucun texte premium ou IA n'est recopié en social. On recalcule tout depuis les champs bruts.

### 1.10 Le gabarit Remotion lui-même

Le gabarit est `MatchPulseBrentfordChelseaInstagram.tsx`, copié par `make-pulse.py`.

| Élément | Problème | Correction |
|---|---|---|
| `WAVE_VALUES` + `wobble = sin(...)` | Une courbe minute par minute avec des bosses **inventées** (±4 points), alors qu'on n'a que 6 valeurs réelles | Des paliers réels (6 marches) ou une interpolation lisse sans bruit, avec la mention « 6 tranches de 15 min » |
| Jauges « BUTS ROMA » de 0 à 5 | Une échelle relative lue comme « 5 buts » | Afficher le vrai nombre : « ROMA : 10 BUTS » |
| Kicker final « LECTURE FINALE DU MODÈLE » | Il chapeaute « CHOC DES LEADERS » ou « 3E CONTRE 4E », qui ne sont pas des sorties du modèle | Remplacer par « À RETENIR » |
| Maître Brentford–Chelsea : « LE MODÈLE PRIVILÉGIE MOINS DE 3,5 BUTS » | C'est le **pick** : une fuite Pro si le match n'était pas le match offert du 18/09 (je n'ai pas pu le vérifier, le fichier du 18/09 n'est plus disponible) | Pick interdit hors match offert (section 6) |
| Titres « DÉBUT PRUDENT », « LE MATCH SOUFFLE », « LYON REPREND LA MAIN », « MATCH ÉQUILIBRÉ » | Interprétations et prévisions déguisées | Titres factuels venant de la bibliothèque (section 3.4) |
| `make-pulse.py` remplace des chaînes dans le TSX | Fragile : une chaîne oubliée reste celle de Brentford | Une composition pilotée par des props (section 11) |

### 1.11 `generate_tiktok_images.js` (racine du dépôt) : à retirer

Ce script cumule quatre défauts :
- il envoie `scenario_15min` à un LLM avec la consigne « **estime** les statistiques globales du match » (score, tirs, corners, cartons), puis publie ces nombres en image via Creatomate. Ce sont des **statistiques inventées présentées comme des données** ;
- il trie les matchs par `conf` et lit `pari_rec`, deux champs premium ;
- il calcule `TODAY = new Date().toISOString()`, c'est-à-dire la date UTC : entre 0 h et 2 h, heure de Paris, il se trompe de jour ;
- ses alias fonctionnent par **sous-chaîne** (`nom.includes('Barcelona')` renvoie « le Barça »). Ils renommeraient Barcelona SC (Équateur) ou « Real Madrid Castilla ».

### 1.12 Les anciens scripts de `docs/research/social/`

| Phrase | Pourquoi c'est interdit |
|---|---|
| « Le modèle du site, lui, calcule cent pour cent » | Absurde et trompeur. Un modèle probabiliste n'est jamais à 100 %. |
| « Sur les moins de 2,5, le modèle… **gagne de l'argent** » | Allégation de rentabilité (DGCCRF, L121-4 15°) |
| « Sur IAshark tout est public » | Faux aujourd'hui : l'historique n'est plus publié (`index.html`, `methodologie.html`) |
| « Il croise quatre modèles… le signal sort quand les quatre sont d'accord » | Ne décrit plus la règle actuelle (80 % bookmaker + 20 % modèle, depuis le 19/09) ni la méthodologie publiée |
| « Je n'y connais presque rien… j'ai testé un site » (voix de la marque ou d'un avatar) | Se présenter faussement comme un consommateur (L121-4) |
| « Il va devenir numéro un », « plus d'un million de données » | Allégations invérifiables |
| « Écris Analyse en commentaire, je t'envoie le site en privé » | Appât à engagement, et tunnel de paris en messages privés |
| « Treize championnats » | Nombre écrit en dur : il y en a 15 dans `data-home` du 19/09 |

### 1.13 Vidéos de match simulé (`IasharkSimulationReveal`, `generated-match.ts`)

Un score simulé avec des buteurs nommés et des minutes (« Mbappé 36e, 50e ») sera pris pour une prévision, voire pour un vrai résultat. De plus, les scores et les buteurs probables sont des champs premium (`mc_scores`, `top_scorers`).

**Règle :** ces vidéos ne sont pas publiées hors match offert. Si on les publie un jour, le mot « SIMULATION » reste affiché en permanence.

---

## 2. Le pipeline d'exactitude

```
iashark.com (JSON PUBLICS uniquement)
  data-home.json · match/<id>.json · buteurs-du-jour.json
        │   aucune clé Supabase, aucune table premium : le générateur ne peut pas lire le pick
        ▼
[1] INSTANTANÉ daté    → snapshot/<run_id>/ (fichiers + generated_at + pipeline_sha)
        ▼
[2] CONTRÔLES D'ENTRÉE → schéma, sommes, fraîcheur, statut NS, is_free
        ▼
[3] BIBLIOTHÈQUE DE FAITS (gabarits typés, seuils) → faits candidats + preuves
        ▼
[4] VALIDATEURS (V1–V16) → PUBLIE / REJETE(raison) / MISSING(raison)
        ▼
[5] SÉLECTION (score d'intérêt, déjà filtrée) → props JSON du format
        ▼
[6] RENDU : Remotion (vidéo) / Remotion Still ou HTML+Playwright (statique)
        ▼
[7] RAPPORT DE PREUVES (1 page par contenu : chaque phrase → champ → valeurs → ✅)
        ▼
[8] RELECTURE HUMAINE 30 s (section 7) → publication manuelle ou programmée
        ▼
[9] SUIVI : commentaires, signalements, corrections → registre d'incidents → nouveau test V*
```

Principes :
- **Même code que le site.** L'étape 3 importe `lib/match-view-model.js` (`goalTiming`, `uniqueInjuries`), `lib/team-names.js` et `lib/match-time.js`. On ne réimplémente pas.
- **Entrée publique seulement.** C'est la meilleure protection du paywall : pour un match non offert, les fichiers publics ne contiennent ni `paris_safe`, ni `scenario`, ni `top_scorers`, ni `conf`. Je l'ai vérifié sur OM–PSG, Lyon–Rennes et Roma–Inter.
- **Chaque contenu embarque sa fiche de preuves** (JSON + page lisible). Si un commentaire conteste un chiffre, on retrouve en 30 s le champ, la valeur, le `run_id` et l'heure.
- **Un trou reste un trou.** Si le seuil n'est pas atteint, le fait devient `MISSING` et le format prend un autre fait ou ne sort pas. On ne comble jamais avec « un match qui promet ».

---

## 3. La bibliothèque de faits

### 3.1 Vocabulaire obligatoire

| Donnée | Formulation obligatoire | Interdit |
|---|---|---|
| `events_*` (tranches) | « sur ses N derniers matchs de {compétition} », avec N = `events.games` | « cette saison », « 20 » écrit en dur, « toutes compétitions » |
| tranche 0-15 | « entre la 1re et la 14e minute » ou « dans le premier quart d'heure » | — |
| tranche 30-45 | « entre la 30e et la 44e minute » | « juste avant la pause » (les buts à 45+x n'y sont pas) |
| tranche 45-60 | « entre la 45e et la 59e minute (arrêts de jeu de la 1re période compris) » | « à la reprise », « après la pause », « en début de 2e mi-temps » |
| tranche 75-90 | « entre la 75e minute et le coup de sifflet final » ou « dans le dernier quart d'heure » | « dans les 15 dernières minutes » (la tranche dure plus longtemps) |
| `form_*` | « sur ses N matchs de {compétition} cette saison » (N = longueur de la liste) | lire `forme_h`/`forme_a` |
| `h2h` | « sur leurs N derniers face-à-face (toutes compétitions, depuis {mois année}) » | « en Ligue 1 », « invaincu » |
| `hot_scorer_*` | « {joueur} : N buts lors des 10 derniers matchs de {compétition} de {équipe} » | « meilleur buteur » (ce n'est pas un classement) |
| `match_stats_*` | « en moyenne sur ses derniers matchs de {compétition} (10 au plus) » | xG au centième ; « domine », « écrase » |
| `classement` | « {équipe} occupe la Xe place (P pts), après J journées », à la date du run | un rang tiré d'un run d'un autre jour |
| `injuries` | « absents annoncés (N) : noms (raison) », puis « À confirmer avec la composition officielle. » | « N blessés », le nombre brut de lignes |
| heure | « {jour} {date}, {h} h {mm} (heure de Paris) », depuis `date` (déjà en heure de Paris) | `date_full` (UTC) : « 18 h 45 » au lieu de 20 h 45 |
| toute tranche | reprendre la phrase du site : « Fréquence observée, pas une prévision pour celui-ci. » | « attendu », « va », « devrait » |

### 3.2 Catalogue des faits

| ID | Source | Calcul | Seuil (sinon MISSING) | Gabarit |
|---|---|---|---|---|
| `CTX_AFFICHE` | `home`, `away`, `league`, `date` | alias par identifiant, date en heure de Paris | `status == "NS"`, coup d'envoi à plus de 30 min | « {H} – {A}, {Ligue}, {jour} {j} {mois}, {h} (heure de Paris). » |
| `CLS_POSITIONS` | `classement.home/away` | rang, points, matchs joués | au moins 3 journées jouées par les 2 équipes ; run du jour même | « {H} occupe la {r}e place ({p} pts), {A} la {r}e place ({p} pts), après {j} journées de {Ligue}. » |
| `CLS_CHOC_TETE` | `classement` | rangs {1,2} | idem | « Choc en tête : le 1er reçoit le 2e. » |
| `FORM_BILAN` | `form_*` | V/N/D | au moins 3 matchs | « {É} : {v} victoires, {n} nuls, {d} défaites sur ses {N} matchs de {Ligue} cette saison. » |
| `FORM_SERIE` | `form_*` | série depuis le plus récent | série d'au moins 3 | « {É} reste sur {k} défaites consécutives en {Ligue}. » ou « a gagné ses {N} matchs… » |
| `H2H_BILAN` | `h2h` | vainqueur recalculé depuis le score, comparé à `w` | au moins 3 matchs, `w` cohérent | « Sur leurs {n} derniers face-à-face (toutes compétitions, depuis {mois année}) : … » |
| `H2H_DERNIER` | `h2h[0]` | — | — | « Dernier face-à-face : {h} {s} {a}, le {date}. » |
| `EV_TRANCHE_PIC` | `events_*.slots` | **`goalTiming()` du site** | T ≥ 30 buts, `games` ≥ 10 pour les 2 équipes, pic unique | « {p} % des {T} buts marqués par {H} et {A} sur leurs {N} derniers matchs de {Ligue} sont tombés {tranche}. » |
| `EV_SLOTS` | `events_X.slots` | tranche maximale de l'équipe | total ≥ 15, max ≥ 6, part ≥ 25 %, max unique | « {É} a marqué {k} de ses {g} buts {tranche}, sur ses {N} derniers matchs de {Ligue}. » |
| `EV_SLOTS_AGAINST` | `events_X.slots_against` | idem, buts encaissés | idem | « {É} a encaissé {k} de ses {g} buts encaissés {tranche}, … » |
| `EV_ZERO` | `slots_against` | tranche à 0 | encaissés ≥ 15, `games` ≥ 15 | « {É} n'a encaissé aucun but {tranche} sur ses {N} derniers matchs de {Ligue}. » |
| `PL_HOT_SCORER` / `PL_HOT_ASSIST` | `hot_*` + `current_squads` + `injuries` | — | compteur ≥ 3, joueur dans l'effectif, non absent | « {joueur} : {k} buts lors des 10 derniers matchs de {Ligue} de {É}. » |
| `ABS_LISTE` | `injuries` dédoublonné | — | `injuries_fetch_ok` | « Absents annoncés côté {É} ({n}) : … À confirmer avec la composition officielle. » |
| `MS_MOYENNES` | `match_stats_*` | — | les 2 valeurs non nulles ; carrousel seulement | « {É} : {xg} xG en moyenne par match sur ses derniers matchs de {Ligue} (10 au plus). » |
| **Interdits** | `fatigue`, `tendances`, cotes `c1…`, `prob_band`, tout champ de `lib/premium-fields.js` | — | toujours | — |

`tendances` est interdit pour deux raisons :
- ses champs portent des noms de marchés de paris (`over25`, `btts`) ;
- ses échantillons sont minuscules. « 2 sur 2 » donne un 100 % trompeur, et `n = max(len, 1)` peut produire « 0 sur 1 ».

### 3.3 Sortie réelle du prototype (19/09/2026)

**Marseille – Paris Saint-Germain** (non offert, id 1552773)
- PUBLIE `CTX_AFFICHE` : OM – PSG, Ligue 1, dimanche 20 septembre, 20 h 45 (heure de Paris).
- PUBLIE `CLS_POSITIONS` : L'OM occupe la 13e place (3 pts), le PSG la 8e place (5 pts), après 4 journées de Ligue 1. *(Rang valable au run du samedi à 13 h 50. Il faut le régénérer dimanche : Le Mans, 14e à 3 pts, joue samedi soir, et Auxerre, 15e à 3 pts, joue dimanche à 15 h. Tous deux peuvent passer devant l'OM avant le coup d'envoi, tout comme les équipes classées derrière.)*
- PUBLIE `FORM_SERIE` : L'OM reste sur 3 défaites consécutives en Ligue 1.
- PUBLIE `FORM_BILAN` : Le PSG : 1 victoire, 2 nuls, 1 défaite sur ses 4 matchs de Ligue 1 cette saison.
- PUBLIE `H2H_BILAN` : Sur leurs 5 derniers face-à-face (toutes compétitions, depuis octobre 2024) : 1 victoire de l'OM, 1 nul, 3 victoires du PSG.
- PUBLIE `EV_TRANCHE_PIC` : 29 % des 68 buts marqués par l'OM et le PSG sur leurs 20 derniers matchs de Ligue 1 sont tombés entre la 75e minute et le coup de sifflet final.
- PUBLIE `EV_SLOTS` : Le PSG a marqué 12 de ses 40 buts entre la 75e minute et le coup de sifflet final, sur ses 20 derniers matchs de Ligue 1.
- PUBLIE `PL_HOT_SCORER` : A. Gouiri : 5 buts lors des 10 derniers matchs de Ligue 1 de l'OM.
- PUBLIE `ABS_LISTE` : Absents annoncés côté PSG (3) : A. Hakimi (blessure à la cuisse), S. Mayulu (indisponible), I. Zabarnyi (choix de l'entraîneur). À confirmer avec la composition officielle.
- MISSING `PL_HOT_ASSIST` : M. Greenwood absent de l'effectif actuel, bloqué.
- MISSING `ABS_COMPTE_BRUT` : le flux compte 12 lignes pour 6 joueurs. Ne jamais afficher 12.

**Lyon – Rennes** (non offert, id 1552768, vidéo déjà produite)
- PUBLIE : Lyon occupe la 4e place (8 pts), Rennes la 3e place (10 pts), après 4 journées de Ligue 1.
- PUBLIE : Rennes reste sur 3 victoires consécutives en Ligue 1.
- PUBLIE : 20 % des 69 buts marqués par Lyon et Rennes sur leurs 20 derniers matchs de Ligue 1 sont tombés entre la 15e et la 29e minute. *(La vidéo publiée disait « le pic arrive à la reprise ».)*
- PUBLIE : Rennes a encaissé 9 de ses 30 buts encaissés entre la 45e et la 59e minute (arrêts de jeu de la 1re période compris), sur ses 20 derniers matchs de Ligue 1.
- PUBLIE : Rennes n'a encaissé aucun but entre la 15e et la 29e minute sur ses 20 derniers matchs de Ligue 1.
- PUBLIE : E. Lepaul : 8 buts lors des 10 derniers matchs de Ligue 1 de Rennes.

**AS Roma – Inter** (non offert, id 1550128, vidéo déjà produite)
- PUBLIE : La Roma occupe la 1re place (12 pts), l'Inter la 2e place (12 pts), après 4 journées de Serie A. « Choc en tête : le 1er reçoit le 2e. » *(Le titre « CHOC DES LEADERS » de la vidéo est donc juste.)*
- PUBLIE : La Roma a gagné ses 4 matchs de Serie A cette saison. L'Inter aussi.
- PUBLIE : Sur leurs 5 derniers face-à-face (toutes compétitions, depuis février 2024) : 1 victoire de la Roma, 0 nul, 4 victoires de l'Inter.
- PUBLIE : 27 % des 96 buts marqués par la Roma et l'Inter sur leurs 20 derniers matchs de Serie A sont tombés entre la 45e et la 59e minute (arrêts de jeu de la 1re période compris).
- PUBLIE : D. Malen : 10 buts lors des 10 derniers matchs de Serie A de la Roma.

**Fulham – Manchester United** (**match offert du 20/09**, id 1557411)
- PUBLIE : Fulham occupe la 18e place (1 pt), Manchester United la 13e place (4 pts), après 4 journées de Premier League.
- PUBLIE : Manchester United a encaissé 10 de ses 25 buts encaissés entre la 75e minute et le coup de sifflet final, sur ses 20 derniers matchs de Premier League.
- Pick autorisé (match offert seulement, section 6.3) : « Le modèle retient "moins de 3,5 buts", estimé à 69,8 % (7/10). Fiabilité "Moyenne", échantillon de la saison "insuffisant" (4 matchs). Une estimation, pas une certitude : environ 3 fois sur 10, ce scénario ne se produit pas. »

### 3.4 Titres des tranches (Match Pulse)

Les titres ne s'écrivent plus. On les choisit dans une liste fermée, avec une règle calculée :

| Condition (part de la tranche, formule du site ; moyenne = 16,7 %) | Libellé « niveau » | Titre |
|---|---|---|
| tranche maximale et part ≥ 22,5 % | TRANCHE LA PLUS CHARGÉE | « {k} DES {T} BUTS » |
| tranche minimale et part ≤ 10,8 % | TRANCHE LA PLUS CALME | « SEULEMENT {k} BUTS SUR {T} » |
| sinon | DANS LA MOYENNE | le fait d'équipe le plus fort de la tranche (`EV_SLOTS` ou `EV_ZERO`), sinon « {H} {a} · {A} {b} » |

Libellés supprimés : « PIC DE DANGER », « DÉBUT PRUDENT », « LE MATCH SOUFFLE », « REPREND LA MAIN », « VERROUILLE », « MATCH ÉQUILIBRÉ », « FIN DE MATCH BOUILLANTE ». Ce sont des interprétations lues comme des prévisions.

### 3.5 Avant / après sur les vidéos déjà produites

| Vidéo, tranche | Publié | Corrigé (données identiques) |
|---|---|---|
| Roma–Inter 45-60 | « L'INTER A MARQUÉ 16 BUTS À LA REPRISE SUR SES 20 DERNIERS MATCHS » | « L'INTER : 16 DE SES 52 BUTS ENTRE LA 45E ET LA 59E (ARRÊTS DE JEU DE LA 1RE PÉRIODE COMPRIS) · 20 DERNIERS MATCHS DE SERIE A » |
| Roma–Inter 60-75 | « LE MATCH SOUFFLE · LA PÉRIODE LA PLUS CALME APRÈS LA PAUSE » | « DANS LA MOYENNE · ROMA 7 · INTER 7 » |
| Roma–Inter mi-temps | « LE GROS DU DANGER ARRIVE APRÈS LA PAUSE » | « AVANT LA 45E : 35 DES 96 BUTS (36 %) » |
| Lyon–Rennes final | « LE PIC DE DANGER ARRIVE À LA REPRISE » | « TRANCHE LA PLUS FOURNIE : 15E-29E (14 DES 69 BUTS) » |
| Lyon–Rennes 30-45 | « LYON REPREND LA MAIN » | « RENNES : 7 BUTS ENCAISSÉS ENTRE LA 30E ET LA 44E » |
| Les deux | « LE MARCHÉ RETENU PAR LE MODÈLE EST SUR IASHARK.COM » | « L'ANALYSE OFFERTE DU JOUR : LIEN EN BIO » (on n'envoie pas un inconnu vers un mur payant) |

---

## 4. Les contrôles automatiques (V1–V16)

Chaque contrôle est bloquant, sauf mention contraire. Un échec produit `REJETE(raison)` dans le rapport.

| # | Contrôle | Ce qu'il attrape (cas réel) |
|---|---|---|
| V1 | Schéma : champs présents et typés | `slots` absent, `classement` vide |
| V2 | `Σ slots = goals_avg × games` et `Σ slots_against = conceded_avg × games` | Corruption de données (vérifié sur 16 équipes de Ligue 1 : tout est cohérent le 19/09) |
| V3 | **Chaque nombre de la phrase figure dans les preuves du fait** (analyse par expression régulière, puis comparaison) | Un chiffre tapé à la main ; « 12 absents » |
| V4 | Recalcul des pourcentages avec la formule du site, arrondi identique | 28 % (vidéo) contre 27,1 % (site) |
| V5 | La fenêtre dans le texte vaut `events.games` (ou 10 pour les joueurs, ou `len(form)`) et nomme la compétition | « 20 derniers matchs » pour Le Mans (4) ; « sur ses 20 derniers matchs » sans « de Ligue 1 » |
| V6 | Noms d'équipes : seuls les noms du match et les alias approuvés **par identifiant** ; toute autre équipe du jour est rejetée | Texte de Roma–Inter recopié dans Lyon–Rennes ; « le Barça » pour Barcelona SC |
| V7 | Joueurs : `player_id` présent dans `current_squads`, absent de la liste dédoublonnée des absents, nom tiré de l'effectif | Greenwood |
| V8 | Date et heure : depuis `date` (Paris), jour de la semaine recalculé, jamais `date_full` ; la ligne en haut de la vidéo (« LIGUE 1 • 20 SEPT. • 20:45 ») est comparée à la donnée | 18 h 45 au lieu de 20 h 45 ; « samedi » au lieu de « dimanche » |
| V9 | Fraîcheur : run de moins de 24 h ; classement et absents du run **du jour de publication** ; `status == "NS"` ; publication au moins 30 min avant le coup d'envoi | « 13e » publié dimanche avec les données de samedi |
| V10 | Paywall : si `is_free !== true`, aucun champ de `PREMIUM_FIELDS` (`lib/premium-fields.js`) parmi les sources, plus la liste de motifs de la section 6.2 | « LE MODÈLE PRIVILÉGIE MOINS DE 3,5 BUTS » |
| V11 | Lexique interdit (section 5), analysé **après masquage des noms propres** | voir la note ci-dessous |
| V12 | Seuils des faits (section 3.2) : sous le seuil, MISSING | « 2 sur 2 », « 0 sur 1 » |
| V13 | Cohérence du H2H : vainqueur recalculé contre `w` | Inter 0-1 Roma, `w: "1"` |
| V14 | Pas de texte premium ou IA réutilisé : les champs `scenario*`, `analyse_card*`, `conseil_public*`, `contexte*` ne sont jamais lus | « Miser sur un total de buts contenu » ; « 4 % » faux |
| V15 | Mentions obligatoires présentes à l'écran : 18+, « Pas un conseil de pari », ligne source et date, fenêtre | Carte sans source |
| V16 (côté pipeline, à ajouter) | Recoupement : buts des events de la saison en cours contre scores de `form_*` (mêmes matchs) | Attribution des c.s.c. par le flux, non vérifiable depuis le JSON public |

**Leçon tirée du prototype.** La première version du filtre de lexique a rejeté « **Paris** Saint-Germain » et « heure de **Paris** » (motif `pari(s)`), ainsi que « **sur** ses 20 derniers matchs » (motif `sûr` sans accent). Trois règles en découlent :
- on masque les noms propres (équipes, compétition, « heure de Paris ») **avant** d'analyser le texte ;
- les motifs tiennent compte des accents ;
- chaque motif a un test de non-régression.

Le même prototype a aussi révélé des fautes de grammaire qui passent pour des erreurs : « 3 victoires **de le** PSG », « la Roma est **1er** », « le **1** février », « **1 pts** ». Le moteur de gabarits a désormais ses règles :
- contraction de + le = du, élision ;
- « 1re place » ;
- « 1er » pour le premier du mois ;
- pt/pts.

---

## 5. Lexique interdit et ses remplacements

Sources juridiques (liens en fin de document) :
- **Code de la consommation, L121-4 15°**. Est réputé trompeur le fait d'« affirmer d'un produit ou d'un service qu'il augmente les chances de gagner aux jeux de hasard ». Selon la Cour de cassation, l'infraction est constituée **même si l'affirmation est exacte**.
- **Loi 2023-451, art. 4-VI**. Toute promotion, directe ou indirecte, d'abonnements à des conseils ou pronostics sportifs est interdite aux personnes qui exercent l'influence commerciale. Peine prévue à l'art. 4-IX : 2 ans et 300 000 €. Le texte a été modifié par l'ordonnance 2024-978 : il faut vérifier la version consolidée.
- **DGCCRF.** Ses enquêtes sur les pronostiqueurs (2020-2022, avec l'ANJ) ont relevé des allégations de « chances de gains ». Elle a infligé une amende de 80 000 € à l'exploitant de France Pronos (août 2025).
- **ANJ.** IASHARK n'est pas opérateur (voir `legal/fr/jeu-responsable.html`). Mais tout lien d'affiliation avec un bookmaker ferait de nos contenus de la publicité pour les jeux d'argent, avec les règles de l'art. 4-VII (exclusion des mineurs, mention permanente).
- **TikTok.** D'après les règles communautaires (section « Biens et services réglementés »), la promotion ou la facilitation des jeux d'argent n'est pas admise en organique. Les contenus qui montrent ou valorisent les paris sont réservés aux 18+ et exclus du fil Pour toi. La publicité exige une autorisation.
- **Meta.** Une publicité pour les jeux d'argent en ligne exige une autorisation écrite préalable et un ciblage 18+.

| Catégorie | Interdit (FR) | À la place |
|---|---|---|
| Gain et chance (L121-4 15°) | gagner, gains, rentable, rentabilité, ROI, bénéfice, « bats les bookmakers », « augmente tes chances », « maximise tes chances », « met toutes les chances de ton côté », « value », « écart exploitable » | « ce que disent les données », « pour se faire un avis » |
| Certitude | sûr, sûre, à coup sûr, certain, garanti, immanquable, fiable à X %, « lock », « banker », « 100 % » | « estimation », « fréquence observée », « pas une prévision » |
| Incitation | mise, miser, misez, parie, pariez, « joue-le », « fonce », « à jouer », « tente », combiné, montante, bankroll, « code promo », bonus | aucun équivalent : on ne l'écrit pas |
| Paris et cotes | cote, côte, « à 1,54 », « pronostic du jour », « prono », « ticket », « notre pari » | en public, rien ; sur le match offert, « le marché retenu par le modèle » |
| Faux résultats | « encore un ticket gagnant », « 9/10 validés », « série de X » (au sujet de nos analyses) | aucun résultat de nos analyses en marketing (section 13.2) |
| Prévision déguisée | « va marquer », « devrait », « match fermé attendu », « festival de buts », « danger », « verrouille », « souffle » | le fait brut et sa fenêtre |
| Bornes fausses | « à la reprise », « après la pause » (pour 45-60), « juste avant la pause » (pour 30-45) | vocabulaire de la section 3.1 |
| Autorité inventée | « notre IA a vu ce que personne n'a vu », « numéro 1 », « 1 million de données » | « un modèle statistique, des limites expliquées » (lien vers la méthodologie) |
| Ciblage des mineurs | emojis argent 💰🤑, liasses, voitures, montres, « quitte ton job », références scolaires | — |

**En anglais** (comptes EN) : sure bet, lock, banker, guaranteed, free money, beat the bookies, profit, ROI, units, bet now, odds boost, value bet.
**En espagnol** (comptes MX/ES) : apuesta segura, fija, ganancias, gana dinero, stake, momio, cuota, apuesta ya, combinada.

---

## 6. Protection du paywall

### 6.1 Ce qui peut sortir, et où

Source de la liste : `lib/premium-fields.js`.

| Donnée | Statut technique | En social, hors match offert | En social, sur le match offert |
|---|---|---|---|
| Équipes, date, stade | PUBLIC_FACT | ✅ | ✅ |
| Classement, forme, H2H | PUBLIC_FACT (mais la page match les réserve désormais aux Pro côté visiteur, décision du 19/09 ; ils restent dans le HTML SEO statique) | ✅ | ✅ |
| Absents | PUBLIC_FACT | ✅ dédoublonnés, avec « à confirmer » | ✅ |
| `events_*` (tranches de 15 min) | PUBLIC_FACT dans le JSON | ⚠️ `BLOCKED_DECISION` n° 1 : la page match vend « le scénario par tranche de 15 minutes » comme contenu Pro | ✅ |
| `hot_scorer` / `hot_assist` (buts réels) | PUBLIC_FACT | ✅, sauf le même jour que le teaser « 3 buteurs » sur les mêmes matchs (6.4) | ✅ |
| `match_stats` (xG, tirs, possession) | PUBLIC_FACT | ✅ en carrousel seulement | ✅ |
| Cotes brutes `c1`, `cn`… | PUBLIC_FACT | ❌ (plateformes, incitation) | ❌ |
| `prob_band` (high/good/moderate) | PUBLIC_TEASER | ❌ (indice du pick, incite à parier) | — |
| `has_signal` | PUBLIC_TEASER | ✅ sous la forme « analyse disponible » | ✅ |
| Marché retenu, %, /10, scores, buteurs probables, xG du modèle, textes d'analyse | PREMIUM | ❌ | ✅ avec des conditions (6.3) |
| Les 3 buteurs du jour : noms, équipes, photos | PREMIUM (décision du 19/09) | ❌ : match, compétition et heure seulement | ❌ même règle |

### 6.2 Fuites indirectes à bloquer (V10)

Pour un match non offert, les motifs suivants sont bloqués :
- « moins de / plus de … buts », « X,5 buts » ;
- « les deux équipes marquent », BTTS ;
- « le modèle privilégie / retient / voit / prévoit » ;
- « score probable », « buteur probable », « niveau du marché » ;
- un « % » associé à probabilité ou chance ; « /10 » ;
- « match fermé », « festival de buts », « favori selon le modèle ».

On bloque aussi toute **sélection orientée**. Le choix des faits d'une vidéo ne lit jamais de champ premium : la protection est structurelle, puisque le générateur ne voit que le JSON public. Cela garantit qu'on ne met pas en avant trois faits « peu de buts » sur un match dont le pick est Moins de 2,5.

### 6.3 Le match offert : la seule exception, avec des conditions

- On utilise **uniquement** les valeurs affichées par la page, via `buildMatchViewModel(raw).recommendation` : `probability = round1(model_probability)` = 69,8, et `confidence = conf` = 7. Jamais `paris_safe.proba` (63 %, incohérent).
- On écrit toujours le marché en toutes lettres (« moins de 3,5 buts »), accompagné de la phrase de la méthodologie : « environ 3 fois sur 10, ce scénario ne se produit pas ».
- On n'affiche jamais la cote, jamais « misez », jamais un bookmaker.
- On affiche la fiabilité telle quelle, même défavorable (ici « Moyenne », échantillon « Insuffisant »). C'est un atout de confiance.
- **TikTok : le marché n'apparaît ni dans la vidéo ni dans la légende.** La vidéo dit seulement « L'analyse complète de Fulham – Manchester United est offerte aujourd'hui », parce qu'un contenu « conseil de pari » y est exclu du fil Pour toi. Instagram et X : marché autorisé dans la légende, avec la mention.
- La désignation se fait par marché (`free_markets`) : l'offre générale, une offre Liga MX pour `/mx/`, une offre PSL pour `/za/`. Un compte ES-MX renvoie vers l'analyse offerte de `/mx/`, pas vers celle de la France.

### 6.4 « Les 3 buteurs du jour »

- Seuls les champs publics de `buteurs-du-jour.json` sont utilisés : `match_id`, `match_rank`, `league`, `kickoff`. Pas de nom, pas de camp, pas de photo, pas de %.
- Le même jour, on ne publie pas de joueur « en forme » (`hot_scorer`) des matchs du teaser. Le recoupement révélerait les noms.
- Exemple réel pour le 19/09 : « 3 buteurs, 3 matchs ce samedi. Örgryte – Sirius (Allsvenskan, 17 h 30), Séville – Barcelone (LaLiga, 21 h), Sporting – Arouca (Liga Portugal, 21 h 30). Qui ? Réservé aux abonnés Pro. » Les matchs sont affichés dans l'ordre chronologique : le fichier les liste dans un autre ordre.

---

## 7. Relecture humaine : 30 secondes par vidéo

La relecture se fait sur la vidéo finale et le rapport de preuves ouverts côte à côte.

| s | Vérification | Si non |
|---|---|---|
| 0-5 | Le rapport affiche **0 REJETE** et une date de run d'aujourd'hui | Ne pas publier |
| 5-10 | L'affiche, la compétition, le jour et l'heure (« heure de Paris ») correspondent à la page du match sur le site | Ne pas publier |
| 10-14 | **Match offert ?** Sinon : aucun marché, aucun %, aucun /10, aucun score, aucun buteur probable, pas de « le modèle… » | Supprimer le passage |
| 14-18 | Le plus gros chiffre à l'écran est comparé à la page du site | Ouvrir un incident V4 |
| 18-21 | Chaque écran chiffré porte sa fenêtre (« N derniers matchs de {compétition} ») | Corriger le gabarit |
| 21-24 | Aucun joueur parti ou absent (le nom a un sens aujourd'hui ?) | Retirer |
| 24-27 | 18+, « Pas un conseil de pari », ligne source et date visibles ; CTA vers l'analyse offerte ; pas de prix ; pas de « DM » | Corriger |
| 27-30 | Musique de la bibliothèque commerciale ; pas de logo de bookmaker ; blasons et photos selon la décision n° 3 | Corriger |

Le relecteur **n'ajoute jamais de texte**. S'il trouve une phrase à améliorer, il crée un gabarit ou un fait, qui passera par V1-V16.

---

## 8. Communauté : réponses types et modération

### 8.1 Principes

1. On ne donne **jamais** de conseil de pari individuel : ni en commentaire, ni en message privé, ni « perso je jouerais », ni « tente le combiné ». Cela vaut aussi pour le match offert.
2. On ne donne aucun prix en commentaire (source unique : `config/markets.json`, affichée sur la page Pro). On répond « lien en bio ».
3. On ne supprime pas une critique polie. On supprime les insultes, les spams et les tipsters concurrents.
4. On répond dans la première heure (moment où la vidéo est poussée), avec des réponses types **adaptées**, jamais copiées-collées dix fois de suite (les plateformes repèrent les réponses répétitives).
5. Commentaire épinglé sur chaque vidéo : « Chiffres : 20 derniers matchs de Ligue 1 de chaque équipe (données du 19/09). Fréquence observée, pas une prévision. Pas un conseil de pari. 18+. »

### 8.2 Réponses types

| Question | Réponse |
|---|---|
| « C'est sûr ? » | « Non, rien n'est sûr en foot. La vidéo décrit ce qui s'est passé sur leurs 20 derniers matchs de Ligue 1, pas ce qui va se passer. Même une estimation à 70 % se trompe environ 3 fois sur 10. » |
| « Quel pari ? », « Tu joues quoi ? » | « On ne donne pas de conseil de pari, ni ici ni en privé. Les stats du match sont dans la vidéo, et une analyse complète est offerte chaque jour sur le site (lien en bio). 18+. » |
| « T'es un arnaqueur » | « On comprend la méfiance, le milieu des "pronos" en a donné des raisons. Chez nous : aucune promesse de gain, aucun bookmaker partenaire, une analyse complète offerte chaque jour pour juger sur pièce, et un abonnement résiliable à tout moment. Si un chiffre de la vidéo te paraît faux, dis-nous lequel : on vérifie. » |
| « Combien tu gagnes ? », « Montre tes gains » | « On ne parie pas et on ne publie pas de gains : IASHARK vend des analyses, pas des résultats. Méfie-toi de quiconque te promet de gagner aux paris. » |
| « Taux de réussite ? » | Tant que la décision n° 2 n'est pas prise : « On ne met pas de taux de réussite en avant : un chiffre passé ne dit rien de la suite, et il est trop facile de le présenter à son avantage. La méthode et ses limites : iashark.com/fr/methodologie.html » |
| « Ta stat est fausse » | « Merci, on vérifie maintenant. » Vérification avec le rapport de preuves en moins d'1 h. Si c'est une erreur : commentaire épinglé « Erreur de notre part : X et non Y. Corrigé. », puis registre d'incidents. |
| « Donne le buteur », « Qui marque ? » | « Les 3 buteurs du jour sont réservés aux abonnés. En public, on montre les buts réels des joueurs sur leurs 10 derniers matchs. » |
| « Pourquoi tu ne donnes pas le pari en vidéo ? » | « Parce que nos vidéos montrent des stats, pas des paris. L'analyse complète du jour est offerte sur le site. » |
| Signal de mineur (« j'ai 16 ans », contexte scolaire) | « Les paris sont interdits aux moins de 18 ans. On ne répond pas aux questions de paris dans ce cas. » On n'insiste pas, on ne relance pas. |
| Détresse (« je dois me refaire », « j'ai tout perdu ») | « Si le jeu devient un problème, Joueurs Info Service t'écoute gratuitement et anonymement au 09 74 75 13 13 (8 h – 2 h, 7 j/7). » Aucune mention du produit. |
| « Envoie-moi en DM » | « On ne fait rien en privé : tout est sur le site (lien en bio). » |

### 8.3 Modération

**Filtres de mots** (Mots masqués sur Instagram, filtres de commentaires sur TikTok) :
- telegram, whatsapp, wa.me, vip, « code promo », bonus, montante, combiné, « fixed », « 100% », « sûr à », « inbox me » ;
- noms de bookmakers.

**À supprimer et bloquer :**
- liens d'affiliation, tipsters et arnaques « match truqué » ;
- captures de tickets ;
- insultes, propos discriminatoires, doxxing ;
- sollicitations de mineurs.

**À masquer :** les débats sur les montants misés.

**À escalader au propriétaire :**
- une menace juridique ;
- un journaliste ;
- une plateforme qui signale un contenu ;
- une personne qui dit avoir perdu de l'argent « à cause » d'IASHARK.

---

## 9. Les formats récurrents

Légende de l'effort : **A** = entièrement automatique (relecture de 30 s seulement), **S** = semi-automatique (faits automatiques, cadrage humain), **M** = manuel.

| # | Nom | Objectif | Durée ou forme | Fréquence | Plateformes | Effort |
|---|---|---|---|---|---|---|
| 1 | **Match Pulse** | Portée | 18-25 s, 9:16 | 1 par jour (l'affiche) | TikTok, Reels, Shorts | A |
| 2 | **L'Analyse offerte** | Conversion | 12-15 s ou carte | 1 par jour | Reels, Stories, X (le marché n'apparaît pas sur TikTok) | A |
| 3 | **Les 3 buteurs du jour** (noms verrouillés) | Conversion | 8-10 s ou Story | 1 par jour | Stories IG, X (pas TikTok) | A |
| 4 | **Les buteurs en forme** | Portée et confiance | carrousel de 6 visuels | lundi | IG, X, TikTok (photo-mode) | A |
| 5 | **La stat de la journée** | Portée | 1 carte ou 5 visuels | jeudi | IG, X, Threads | A |
| 6 | **Le quart d'heure qui fait peur** | Portée | 20 s ou carrousel | vendredi | TikTok, IG | A |
| 7 | **Mythe ou réalité ?** | Confiance | 25-35 s | 1 semaine sur 2 | TikTok, Reels, Shorts | S |
| 8 | **L'avant-journée Ligue 1** | Portée et trafic | carrousel de 9 visuels | vendredi | IG, X | A |
| 9 | **Spécial Classique / derby** | Portée | 30 s + carrousel | à l'événement (`data/derby-index.json`) | toutes | S |
| 10 | **Le quiz du vendredi** / sondage | Engagement | Story de 3 visuels | vendredi, réponse samedi | Stories IG, sondage X | A |
| 11 | **70 %, ça veut dire quoi ?** (comprendre une proba) | Confiance | 30-45 s, voix | 1 semaine sur 2 | TikTok, Reels, Shorts | M |
| 12 | **Dans la salle des machines** | Confiance | 30-40 s, voix | 1 par mois | TikTok, Reels | M |
| 13 | **Tu m'as demandé** (réponse à un commentaire) | Engagement | 15-25 s | selon les questions | TikTok, Reels | S |

### 9.1 Match Pulse (quotidien, sur l'affiche du jour)

- **Objectif :** portée. Le match choisi est le plus attractif du jour (Ligue 1 en priorité), pas forcément le match offert.
- **Structure** (gabarit existant, 18-25 s) :
  - 0-1,5 s : affiche, compétition, heure de Paris ; hook = le fait `EV_TRANCHE_PIC` ou `CLS_CHOC_TETE` du jour ;
  - 1,5-9 s : tranches 0-15, 15-30, 30-45, avec pour chacune le niveau (règle 3.4), un titre factuel, une note chiffrée et les jauges en **vrais nombres** ;
  - 9-11,5 s : « AVANT LA 45E : X DES T BUTS » ;
  - 11,5-19 s : tranches 45-60, 60-75, 75-90 ;
  - 19-21 s : « À RETENIR », classement ou série, puis CTA.
- **Texte à l'écran :**
  - au maximum 2 lignes par écran ;
  - un chiffre par écran, toujours avec sa fenêtre ;
  - bandeau permanent en bas : « Buts de leurs N derniers matchs de {compétition} · Fréquence observée, pas une prévision · 18+ ».
- **Voix :** non. Le texte seul limite le risque de dérive orale et la vidéo reste lisible sans le son.
- **Musique :** oui, uniquement dans la bibliothèque commerciale de la plateforme (TikTok Commercial Music Library, bibliothèque des comptes professionnels Instagram).
- **CTA :** « L'analyse offerte du jour : lien en bio ».
- **Automatisation :** totale (section 11).
- **Condition :** `BLOCKED_DECISION` n° 1 (tranches de 15 min hors match offert). En attendant, deux options :
  - le Pulse seulement sur le match offert ;
  - pour l'affiche, le format « L'affiche en 5 faits » : classement, série, H2H, joueur en forme, absents. Tout est PUBLIC_FACT.

**Exemple réel, script du Pulse OM – PSG** (dimanche 20/09). Les parts suivent la formule du site, sur 68 buts marqués en 20 matchs de Ligue 1 chacun.

| Écran | Niveau | Titre | Note |
|---|---|---|---|
| Accroche | — | « OM – PSG · LIGUE 1 · DIM. 20 SEPT. · 20 H 45 » | « 29 % DE LEURS BUTS APRÈS LA 75E » + « 20 DERNIERS MATCHS DE L1 » |
| 0-15 (19,1 %) | DANS LA MOYENNE | 7 BUTS DE L'OM | L'OM A MARQUÉ 7 DE SES 28 BUTS ENTRE LA 1RE ET LA 14E |
| 15-30 (7,4 %) | TRANCHE LA PLUS CALME | SEULEMENT 5 BUTS SUR 68 | ENTRE LA 15E ET LA 29E, POUR LES DEUX ÉQUIPES |
| 30-45 (11,8 %) | DANS LA MOYENNE | LE PSG : 7 BUTS | L'OM N'A ENCAISSÉ QU'1 BUT ENTRE LA 30E ET LA 44E |
| Mi-temps | — | AVANT LA 45E : 26 DES 68 BUTS | 38 % (les buts à 45+x comptent dans la tranche suivante) |
| 45-60 (19,1 %) | DANS LA MOYENNE | OM : 8 MARQUÉS, 9 ENCAISSÉS | ENTRE LA 45E ET LA 59E, ARRÊTS DE JEU DE LA 1RE PÉRIODE COMPRIS |
| 60-75 (13,2 %) | DANS LA MOYENNE | LE PSG : 7 BUTS | L'OM : 2 BUTS SUR CETTE TRANCHE |
| 75-90 (29,4 %) | TRANCHE LA PLUS CHARGÉE | 20 DES 68 BUTS | LE PSG Y A MARQUÉ 12 BUTS, L'OM Y EN A ENCAISSÉ 9 |
| Final | À RETENIR | 13E CONTRE 8E *(à régénérer avec le run de dimanche)* | L'ANALYSE OFFERTE DU JOUR : LIEN EN BIO |

### 9.2 L'Analyse offerte (quotidien)

- **Objectif :** conversion, vers le seul contenu complet et gratuit.
- **Structure :**
  - 0-2 s : « L'ANALYSE OFFERTE DU JOUR » + affiche ;
  - 2-8 s : 2 faits publics (classement, forme) ;
  - 8-12 s : sur IG et X, le marché retenu, le %, le /10, la fiabilité et la phrase « environ 3 fois sur 10… » ; sur TikTok, « L'analyse complète est offerte aujourd'hui » ;
  - 12-15 s : CTA.
- **Voix :** non. **Musique :** bibliothèque commerciale, discrète.
- **Automatisation :** totale. `is_free === true` est connu la veille (le pipeline désigne aujourd'hui et demain), ce qui permet de préparer le soir et de relire le matin.

### 9.3 Les 3 buteurs du jour (quotidien, noms verrouillés)

- **Structure :**
  - 3 cartes avec une silhouette floutée et un cadenas ;
  - sur chaque carte : match, compétition, heure ;
  - fin : « Qui ? Réservé aux abonnés Pro » + lien (Story).
- **Remotion :** composition `ButeursDuJour` (props = `buteurs-du-jour.json` + noms des matchs pris dans `data-home.json`). **Aucun** accès aux champs premium.
- **À publier avant le premier coup d'envoi.**
- **Pas sur TikTok :** c'est un contenu marketing autour d'un marché de paris (buteur).

### 9.4 Les buteurs en forme (lundi)

- **Structure :**
  - couverture : « Les 5 buteurs en forme de Ligue 1 » ;
  - 5 visuels : « {joueur} ({club}) : {k} buts lors des 10 derniers matchs de Ligue 1 de {club} », avec les contrôles V7 ;
  - dernier visuel : méthode, 18+.
- **Pourquoi le lundi :** il n'y a pas de teaser « 3 buteurs » sur les mêmes matchs. Aucun recoupement possible.

### 9.5 La stat de la journée (jeudi)

- **Sélection automatique :** le fait le plus éloigné de la norme sur la journée à venir, avec un « score d'intérêt » calculé.
- **Exemple réel** (journée du 19-20/09) : « Angers a encaissé 8 de ses 28 buts encaissés entre la 1re et la 14e minute, sur ses 20 derniers matchs de Ligue 1. » C'est 29 %, contre 16,7 % pour une tranche moyenne.
- **Format :** 1 carte (4:5) avec le chiffre géant, la phrase, la fenêtre, la source et la date, 18+.

### 9.6 Le quart d'heure qui fait peur (vendredi)

Exemple réel de carrousel, sur les 14 équipes de la 5e journée qui ont 20 matchs de Ligue 1 dans les données. Troyes et Le Mans sont exclus : 4 matchs seulement, car ils sont promus.

1. « Après la 75e minute, qui marque le plus en Ligue 1 ? »
2. « PSG : 12 de ses 40 buts entre la 75e et la fin (20 derniers matchs de L1) »
3. « Strasbourg : 11 sur 39 »
4. « Paris FC : 9 sur 29 »
5. « Côté défense : l'OM a encaissé 9 de ses 32 buts sur cette tranche »
6. « Sur les 383 buts de ces 14 équipes, 24,0 % sont tombés entre la 75e et la fin, et 14,6 % dans le premier quart d'heure. Pourquoi cet écart ? La dernière tranche compte aussi le temps additionnel : elle dure plus de 15 minutes. »
7. « Méthode · données du 19/09 · Fréquence observée, pas une prévision · 18+ »

L'explication honnête de la diapo 6 est ce qui distingue IASHARK des comptes « pronos ».

### 9.7 Mythe ou réalité ? (une semaine sur deux)

- **Structure (30 s) :**
  - 0-3 s : l'affirmation courante, par exemple « On marque surtout en fin de match » ;
  - 3-20 s : les données (celles de 9.6) ;
  - 20-27 s : la nuance, ici la tranche plus longue ;
  - 27-30 s : verdict « Réalité… à nuancer » + CTA.
- **Voix :** possible, mais le script vient des faits validés et une voix de synthèse ou humaine le lit **mot pour mot**.
- **Effort :** le choix du mythe est humain ; les chiffres sont automatiques.
- **À construire :** un historique local des instantanés quotidiens (dossier `snapshot/`). Il permettra de traiter à terme des mythes plus larges, comme l'avantage du terrain, sur des centaines de matchs.

### 9.8 L'avant-journée Ligue 1 (vendredi)

- **Structure :**
  - couverture : « 5e journée : 8 matchs, 8 chiffres » ;
  - 8 visuels : `CTX_AFFICHE` + 1 fait de la bibliothèque, le plus intéressant du match ;
  - dernier visuel : « L'analyse offerte du jour » + 18+.
- **Automatisation :** totale.
- **Précaution :** les rangs ne sont publiés que si le run date du jour de publication. Sinon, on utilise les séries et les tranches, qui sont plus stables.

### 9.9 Spécial Classique / derby

- **Déclencheur :** une paire présente dans `data/derby-index.json` (Le Classique 81-85, Derby du Nord 79-116, Clásico Nacional…).
- **Contenu :**
  - J-2 : carrousel « Le Classique en 6 chiffres » (classement, séries, H2H, tranche 75-90, joueurs en forme, absents), avec les faits de la section 3.3 ;
  - J-0 : Match Pulse.
- **Page d'arrivée :** `/fr/clubs/classique-psg-om.html`, plus l'article `/fr/articles/classique-psg-om-histoire-analyse.html`.
- **Levier :** voir la décision n° 4 (faire du derby le match offert du jour).

### 9.10 Le quiz du vendredi

- **Forme :** Story avec autocollant quiz. Question tirée d'un fait, 3 mauvaises réponses calculées (autres équipes, autres tranches).
- **Exemple :** « Qui a marqué le plus de buts après la 75e sur ses 20 derniers matchs de L1 ? PSG / Strasbourg / Lyon / Rennes ». Réponse le samedi : PSG, 12 buts.
- **Aucun lot, aucun concours avec gain** (règles des jeux-concours et proximité avec le jeu d'argent).

### 9.11 « 70 %, ça veut dire quoi ? » (comprendre une probabilité)

- **Épisodes :**
  - « 70 % = ça rate 3 fois sur 10 » ;
  - « Une série de résultats ne prouve rien » ;
  - « Pourquoi un petit échantillon ment » (exemple réel : `tendances` « 2 sur 2 ») ;
  - « Fréquence observée contre prévision ».
- **Voix :** humaine de préférence (confiance). **Musique :** légère.
- **CTA :** « Méthodologie : lien en bio ».
- **Effort :** script manuel, puis contrôle V3 et V11 de chaque chiffre et de chaque mot.
- **Pas d'épisode sur la lecture des cotes ou de la marge sur TikTok** (trop proche de la promotion). IG et X seulement.

### 9.12 Dans la salle des machines (mensuel, volontairement vague)

- **Contenu :** uniquement ce que dit `legal/fr/methodologie.html`.
  - « un modèle statistique estime les chances des principales issues » ;
  - « une règle fixe choisit parmi les marchés réellement cotés » ;
  - « l'IA rédige le texte à partir des chiffres, sans rien choisir » ;
  - « pas d'analyse quand les données manquent » ;
  - « calculé une fois par jour, les compos de dernière minute ne sont pas prises en compte ».
- **Interdits :** noms de modèles, poids, sources de données, « 4 modèles », taux de réussite.
- **Tournage :** plan de l'écran du site (vue publique) et voix du propriétaire.

### 9.13 Tu m'as demandé

- **Principe :** la réponse vidéo à un commentaire utilise un fait de la bibliothèque.
- **Si la donnée n'existe pas :** « On n'a pas ce chiffre, donc on ne va pas l'inventer. » Cette phrase est elle-même un contenu de confiance.

### 9.14 Semaine type (compte FR)

| Jour | TikTok | Instagram | X |
|---|---|---|---|
| Lun | Pulse (affiche du jour, si match) | Buteurs en forme (carrousel) | Buteurs en forme |
| Mar | Mythe ou réalité (1 sem. sur 2) ou 70 % | Stories : 3 buteurs + Analyse offerte | Analyse offerte |
| Mer | Pulse (Europe si couverte) | Reel Pulse + Stories | Pulse |
| Jeu | Stat de la journée (vidéo courte) | Stat de la journée (carte) | Stat de la journée |
| Ven | Quart d'heure qui fait peur | Avant-journée L1 (carrousel) + quiz en Story | Avant-journée (fil) |
| Sam | Pulse (grosse affiche) | Reel Pulse + Stories 3 buteurs / Analyse offerte / réponse du quiz | Analyse offerte |
| Dim | Pulse (grosse affiche) | Reel Pulse + Stories | Analyse offerte |

Effort estimé en régime de croisière :
- environ 10 min par jour de relecture pour les formats A ;
- 45 min par semaine pour les formats S ;
- 2 h par mois pour les formats M.

---

## 10. Formats statiques et règles de design

**Jetons** (tirés de `IASHARK_DESIGN_FREEZE.md`) :

| Jeton | Valeur | Usage |
|---|---|---|
| fond | `#080c12` | fond de toutes les cartes |
| carte | `#0d1520` / `#0f1a28` | panneaux, tuiles de chiffres |
| accent | `#22d3ee` | chiffre héros, filets, logo « IA » (contraste 10,8:1 sur le fond) |
| texte | `#e2e8f0` | texte principal |
| texte secondaire | `#91a0b3` | source, fenêtre, mentions (7,3:1) |
| ambre | `#f59e0b` | badge 18+ et « À CONFIRMER » seulement |
| vert / rouge | `#10b981` / `#ef4444` | pastilles V/D de la forme seulement ; jamais pour « gagné/perdu » de nos analyses |

Le `--muted #4a6580` n'offre que 3,2:1 sur le fond : jamais pour du texte de moins de 24 px.

⚠️ Trois cyans coexistent : `#22d3ee` (design freeze), `#20d5ef` (Tailwind) et `#09d9ff` (Remotion). Décision n° 8.

**Typographie :**
- Bebas Neue pour les chiffres héros et les titres ;
- Space Mono en capitales, espacement de 2 px, pour les étiquettes (« 20 DERNIERS MATCHS DE L1 ») ;
- Inter pour les phrases.

**Formats :**
- carrousel et carte : 1080×1350 (4:5) ;
- Story : 1080×1920, avec des zones sûres de 250 px en haut, 340 px en bas et 140 px à droite pour l'interface TikTok ;
- carte X : 1600×900 ou 1080×1350.

**Règles :**
- une idée par visuel, au maximum 25 mots ;
- le chiffre héros est toujours sur le même visuel que son unité et sa fenêtre ;
- pied de page sur **chaque** visuel : « Données IASHARK au 19/09, 13 h 50 · Fréquence observée, pas une prévision · Pas un conseil de pari · 18+ ». Le fournisseur n'est pas nommé : la méthodologie publique ne le cite pas ;
- la couverture d'un carrousel se lit seule (vignette) ;
- même gabarit sur tous les visuels intérieurs ;
- interdits :
  - logos de bookmakers, cotes, captures de tickets ;
  - symboles monétaires et images de luxe ;
  - emojis 💰🤑🔒🔥 « lock » ;
  - photos de joueurs tirées de `media.api-sports.io` et blasons de clubs, tant que la décision n° 3 n'est pas prise.

**Autocollants de Stories :**
- Sondage : « Qui marque le plus après la 75e ? » ;
- Quiz : voir 9.10 ;
- Compte à rebours : jusqu'au **coup d'envoi** (« OM – PSG, 20 h 45 »). Jamais « fin des paris ». Jamais d'offre « dernière chance » sur l'abonnement si elle n'est pas réelle ;
- Lien : vers l'analyse offerte ou la page du derby, avec les UTM de la section 12.

---

## 11. Automatisation : comment produire sans écrire

```
cron après update-data (≈ 13 h 50 heure de Paris, run DAILY)
  └─ social/generate.mjs (Node, IMPORTE les libs du site)
       ├─ fetch iashark.com : data-home.json, match/<id>.json, buteurs-du-jour.json
       ├─ facts(match)    → lib/match-view-model.js (goalTiming, uniqueInjuries), team-names, match-time
       ├─ validate(facts) → V1–V15 (tests unitaires par règle, cas réels de la section 1 en fixtures)
       ├─ select(format)  → props JSON (zod) par composition
       ├─ render
       │    vidéo :    npx remotion render src/index.ts MatchPulse out/<date>-<id>.mp4 --props=props.json
       │    statique : npx remotion still src/index.ts StatCard out/<date>-stat.png --props=props.json
       │               (ou HTML + Playwright : le dépôt sait déjà faire, voir shot-scorers.js)
       └─ evidence/<date>-<id>.html (phrases → champs → valeurs → ✅/❌) + file de relecture
```

**Remotion** (règles de `remotion-best-practices`) :
- Une composition par format, **pilotée par des props typées** (schéma zod). Aucun texte en dur dans le TSX, aucun remplacement de chaînes comme dans `make-pulse.py`.
- `calculateMetadata` fixe la durée selon le nombre d'écrans.
- Polices chargées par `@remotion/google-fonts` (Bebas Neue, Space Mono, Inter).
- Suppression de `WAVE_VALUES.wobble` ; paliers réels.
- Jauges en valeurs absolues.
- Kicker « À RETENIR ».
- Bandeau permanent « Fréquence observée, pas une prévision · 18+ ».

**Entièrement automatisables :** Pulse, Analyse offerte, 3 buteurs, Buteurs en forme, Stat de la journée, Quart d'heure, Avant-journée, Quiz.
**Semi-automatiques :** Mythe ou réalité, Spécial derby, Tu m'as demandé.
**Manuels :** 70 %, Salle des machines.

**Publication :** d'abord manuelle depuis la file de relecture. La programmation native (Meta Business Suite, planificateur TikTok) n'intervient qu'après 4 semaines sans erreur. On ne publie jamais directement depuis le script.

**Tests :** chaque cas réel de la section 1 devient un test de non-régression :
- Greenwood ;
- Le Mans avec `games` = 4 ;
- `w` de Roma–Inter ;
- 12 lignes d'absents ;
- « Paris » et « sur » dans le filtre de lexique ;
- Lyon–Rennes et son pic à 15-30.

---

## 12. Du social au site

### 12.1 Convention UTM (adaptée à `funnel-track.js` et à l'admin)

Contraintes relevées dans le code :
- `funnel-track.js` n'enregistre que `utm_source`, `utm_medium` et `utm_campaign`, tronqués à 80 caractères. **`utm_content` et `utm_term` sont perdus** ;
- l'admin groupe les sources par expression régulière (`admin-dashboard.js` `SOURCE_RULES` = SQL `admin_source_group`, avec un test de parité). Les sources reconnues sont tiktok, instagram (ou `ig`), facebook (ou `fb`), x, twitter, whatsapp. **`youtube` et `threads` tombent dans « Autres sites »** ;
- un `utm_source` qui commence par `qa` marque la visite comme test et l'exclut des chiffres. On s'en sert pour vérifier ses propres liens (`utm_source=qa-tiktok`) ;
- le SQL de l'admin calcule déjà un tableau `campaigns` (source, medium, campagne, visiteurs, inscriptions), mais `admin-dashboard.js` ne l'affiche pas. Petite tâche technique.

| Paramètre | Valeurs |
|---|---|
| `utm_source` | `tiktok`, `instagram`, `x`, `facebook`, `youtube` (après ajout de la règle), `threads` |
| `utm_medium` | `bio`, `story`, `post`, `profile` |
| `utm_campaign` | `{langue}-{format}-{AAAAMMJJ ou semaine}-{sujet}-{variante}`, 80 caractères au plus. Il porte la variante, puisque `utm_content` est perdu |

Exemples prêts à l'emploi :
- Bio TikTok, changée chaque lundi : `https://iashark.com/fr/?utm_source=tiktok&utm_medium=bio&utm_campaign=fr-bio-2026w38#decisions`
- Story Instagram, Classique, hook B : `https://iashark.com/fr/clubs/classique-psg-om.html?utm_source=instagram&utm_medium=story&utm_campaign=fr-derby-20260920-om-psg-hookB`
- X, analyse offerte du 20/09 : `https://iashark.com/match/1557411.html?utm_source=x&utm_medium=post&utm_campaign=fr-offerte-20260920-fulham-mu`

On pointe `/fr/` et non la racine `/`. La racine fait une redirection 302 géolocalisée (`_redirects`), qui peut envoyer un spectateur français vers une autre version.

### 12.2 Page d'arrivée par plateforme

| Plateforme | Destination | Pourquoi |
|---|---|---|
| Bio TikTok / Instagram (FR) | `/fr/#decisions` | L'analyse offerte du jour est toujours à jour : `lib/free-match.js` gère le jour et le fuseau du visiteur. Le lien reste stable. |
| Story Instagram (lien) | la page de l'objet de la Story (derby, match offert, article) | Cohérence du message |
| X / Threads | la page du match offert ou l'article, avec le lien en réponse (X favorise les publications sans lien) | Trafic qualifié |
| Shorts | `/fr/` depuis la description et le lien de chaîne | Pas de lien cliquable dans un Short |
| EN | `/gb/` (Royaume-Uni) ou `/en/` (international, USD) | Offre et devise du marché |
| ES | `/mx/` (Mexique : analyse offerte Liga MX désignée à part) ou `/es/` | `free_markets` |
| **Jamais** | `/pro.html`, `/abonnement.html` en premier contact | Trafic froid ; en plus, on n'est plus dans le registre d'un média de données mais dans celui d'une publicité pour un abonnement |

### 12.3 Indicateurs à suivre chaque semaine (tableau unique, le lundi)

| Niveau | Indicateur | Où le lire |
|---|---|---|
| Accroche | taux de visionnage à 3 s, % moyen regardé, complétion | analytics des plateformes, par format |
| Intérêt | enregistrements, partages, commentaires, **part de commentaires « quel pari ? »** (si elle monte, le contenu est lu comme un tuyau) | plateformes + comptage manuel |
| Profil | visites du profil, clics sur le lien de la bio (IG), abonnés gagnés | plateformes |
| Site | visiteurs `source_group` tiktok / instagram / x, pages vues, rebond | admin, filtre « social » du tunnel (migration 0031) |
| Conversion | `gate_view`, inscriptions (`signup_completed`), `checkout_started`, `checkout_success` par source | tunnel admin « Où les visiteurs décrochent » |
| Campagnes | visiteurs et inscriptions par `utm_campaign` | SQL `campaigns` (à afficher) |
| **Exactitude** | erreurs signalées, erreurs confirmées (**objectif : 0**), délai de correction, taux de REJETE des validateurs | registre d'incidents + rapports |
| Plateforme | retraits, « non éligible au fil Pour toi », restrictions d'âge, avertissements | notifications des comptes |

### 12.4 Tester les hooks (A/B)

- Un hook est lui-même **un fait de la bibliothèque**, reformulé en accroche. Il passe V1-V15 comme le reste.
- Exemple, OM – PSG :
  - A (classement) : « L'OM est 13e avant le Classique » ;
  - B (tranche) : « 29 % de leurs buts après la 75e » ;
  - C (question) : « Qui marque le plus en fin de match, l'OM ou le PSG ? ». La réponse, PSG avec 12 buts contre 8, est donnée dans la vidéo.
- **Protocole :**
  - même format, même type de match (affiches comparables) ;
  - variantes alternées sur 2 semaines, à la même heure ;
  - au moins 6 publications par variante ;
  - métrique principale : visionnage à 3 s, puis % moyen regardé ;
  - un gagnant n'est retenu qu'avec un écart de 15 % ou plus, **dans la même direction chaque semaine**.
- Sur Instagram, les « Reels d'essai » servent à tester sur des non-abonnés.
- La variante est notée dans `utm_campaign` (lien de Story) et dans un tableau de suivi (pour les liens en bio, qu'on ne peut pas changer à chaque vidéo).
- **Facteurs de confusion :**
  - la popularité de l'affiche (un OM – PSG bat tout) : on compare des affiches du même rang ;
  - le jour ;
  - l'heure ;
  - une tendance ponctuelle.

---

## 13. Angles auxquels le propriétaire n'a peut-être pas pensé

### 13.1 Versions anglaise et espagnole

- **Des comptes séparés par langue.** Un compte qui mélange les langues brouille l'algorithme et l'audience.
- **Ordre conseillé :**
  1. FR pendant 6 semaines, le temps que les validateurs et le taux d'erreur soient stables ;
  2. EN (Premier League, marché `gb` mensuel ouvert, `/en/` en USD) ;
  3. ES-MX (Liga MX, offre gratuite `mx` désignée à part).
- **La bibliothèque de faits est multilingue.** Même identifiant de fait, gabarits natifs par langue. Jamais de traduction automatique de la phrase finale. Lexique interdit propre à chaque langue (section 5).
- **Heures :** converties par `lib/match-time.js` (Europe/London, America/Mexico_City qui n'a plus d'heure d'été depuis 2022, fuseau affiché). Pour le compte `/en/` international, on affiche « UK time » ou plusieurs fuseaux.
- **Lignes d'aide :** celles de `config/markets.json` et de la méthodologie. GamCare 0808 8020 133 (UK), 0800 006 008 (ZA), Línea de la Vida 800 911 2000 (MX), Gambling Therapy (international).
- **Droit local, `BLOCKED_DECISION` n° 7 :**
  - UK : code CAP section 16 et décisions répétées de l'ASA contre les tipsters qui annoncent des profits ;
  - Espagne : cadre très restrictif sur les communications liées au jeu ;
  - Mexique : PROFECO pour les allégations.

### 13.2 Une page de transparence honnête : utile, mais en conflit avec l'existant

- **Aujourd'hui :**
  - `methodologie.html` dit : « IAShark ne publie aucun historique de résultats ni aucun chiffre de rentabilité » ;
  - l'onglet « hier » a été retiré de l'accueil ;
  - `historique.json` n'est plus publié.
- **Les chiffres internes existent** (`historique.json` du 19/09) : 217 analyses justes sur 362, soit 59,9 % ; rendement −0,6 % au global ; juillet à −45 %.
- **Le risque :** afficher un taux de réussite dans un contexte marketing peut être lu comme « augmente les chances de gagner » (L121-4 15°, infraction même si c'est vrai).
- **Trois options :**
  - A. Statu quo ;
  - B. Un journal neutre de toutes les analyses (date, marché, résultat), sans agrégat mis en avant ni rendement, avec la phrase « aucune méthode ne rend les paris rentables » ;
  - C. **La calibration** : « quand le modèle annonce environ 70 %, l'issue s'est produite X % du temps sur N analyses ». C'est la transparence la plus honnête et la plus pédagogique, parce qu'elle mesure la justesse des probabilités et non des gains.
- **Recommandation :** C, après avis d'un avocat. Jamais comme hook publicitaire. `BLOCKED_DECISION` n° 2.

### 13.3 Saisonnalité

- **Trêves internationales** (fenêtres FIFA, dates à reporter du calendrier officiel) : les clubs ne jouent pas.
  - On bascule sur les formats sans échéance (Mythe, 70 %, Quiz, Salle des machines, Buteurs en forme sur la période précédente).
  - Il faut vérifier dans `config/leagues.json` si les matchs de sélections sont couverts **avant** d'en promettre.
- **Début de saison :**
  - les faits « saison en cours » ont besoin d'au moins 3 matchs ;
  - la fenêtre `events` chevauche deux saisons ;
  - les promus sont exclus automatiquement (`games` < 10).
- **Mercato (août, janvier) :** le contrôle V7 (effectif actuel) devient critique.
- **Été :** la couverture se réduit à MLS, Allsvenskan, J1, Argentine, Pérou, Colombie, avec peu d'intérêt en France. On réduit la cadence et on prépare la saison.
- **Décembre :** calendrier chargé en Premier League, c'est le bon moment pour lancer l'EN.

### 13.4 Contenu créé par la communauté

- « Pose ta question stat » donne le format 9.13.
- On ne republie un contenu qu'avec l'accord de son auteur, et on le crédite.
- **Jamais** de repost de tickets de paris ni de gains, jamais de « tague un pote qui parie ».
- Un sondage sans lot (« qui gagne le Classique ? ») reste acceptable. Un concours avec gain ne l'est pas.

### 13.5 Collaborations légales (sans influenceur qui pousse Pro)

- **Interdit (art. 4-VI) :** rémunérer, sous quelque forme que ce soit (argent, accès Pro offert, affiliation, code promo), un créateur qui parle d'IASHARK, même pour l'analyse gratuite, parce que la promotion indirecte est visée.
- **Envisageable après avis juridique :**
  - être **cité comme source** par des médias ou des journalistes, sans contrepartie et avec une rédaction indépendante ;
  - des interviews du propriétaire sur la construction d'un produit de données, sans promotion de l'abonnement ;
  - des contenus pédagogiques sur la probabilité avec des vulgarisateurs, sans lien vers Pro ;
  - de la licence de données B2B à des médias.
- **Jamais :** bookmakers, affiliés ou « tipsters ». Un seul lien d'affiliation fait basculer tout le compte dans la publicité pour les jeux d'argent.

### 13.6 Gérer une crise si une vidéo est signalée

| Incident | Réaction |
|---|---|
| Stat fausse publiée | Vérification avec la fiche de preuves en moins d'1 h. Si c'est confirmé : suppression si le chiffre trompe, sinon légende corrigée et commentaire épinglé « Erreur de notre part ». Puis un test V* ajouté **avant** la publication suivante. |
| Pick Pro divulgué | Suppression immédiate, alerte au propriétaire, cause (quel fichier a été lu ?), vérification de la règle « entrée publique seulement ». |
| Retrait, « non éligible au fil Pour toi », restriction d'âge | Pause de 7 jours sur le format concerné. Lecture du motif. Recours (contenu éducatif, pas de promotion de paris). Correction du gabarit. **Jamais** republier la même vidéo, jamais ouvrir un second compte (contournement de sanction). |
| Lettre de la DGCCRF, de l'ANJ ou d'un avocat | Aucune réponse publique. Propriétaire et avocat. Conservation des preuves et des rapports. |
| Mauvais buzz « arnaque » | Une réponse calme (8.2), une FAQ épinglée, pas de débat. On ne supprime pas les critiques polies. |
| Compte piraté | Double authentification obligatoire sur tous les comptes, accès de secours notés hors ligne. |

On garde un canal qu'on possède (blog et newsletter du site), pour ne pas dépendre d'un compte suspendu.

### 13.7 Le gabarit Remotion pour les « 3 buteurs »

- **Oui**, en réutilisant l'habillage du Pulse (fond stade, logo, accent).
- Trois cartes verrouillées, révélation « réservé Pro ».
- Props uniquement issues des champs publics (6.4).
- Ne jamais y ajouter le camp du joueur, sa photo, ni le rang de probabilité.

### 13.8 Recycler les articles SEO en publications

- **Articles :** `classique-psg-om-histoire-analyse`, `ligue-1-format-enjeux-saison`, `marches-plus-moins-2-5-buts-btts`, `joueurs-africains-europe-reperes`, `can-calendrier-clubs-europeens`.
  - carrousels selon les cadres « Value-Stack » ou « Hack list » du skill social ;
  - fil sur X ;
  - UTM qui renvoie vers l'article.
- **Pages club** (`/fr/clubs/*.html`) : une « fiche club » en carrousel avant un match du club.
- **Règle :** tout chiffre repris d'un article est **revalidé** sur les données du jour et daté. Un article vieillit, pas la date affichée.
- L'article « plus/moins 2,5 et BTTS » parle de marchés de paris : IG et X seulement, pas TikTok.

### 13.9 Compte personnel du propriétaire ou compte de marque

- **Compte de marque :** la voix du produit, les formats de la section 9.
- **Compte personnel (recommandé tant que l'avis juridique n'est pas rendu) :**
  - raconter la construction d'un produit de données (bugs, décisions, erreurs corrigées, « on a retiré notre historique, voici pourquoi ») ;
  - **sans pick, sans lien vers Pro, sans promotion de l'abonnement**.
- **Pourquoi :** l'art. 4-VI vise les personnes qui monétisent leur notoriété pour promouvoir des abonnements à des pronostics. Un dirigeant qui met en avant sa propre offre pourrait être concerné. `BLOCKED_DECISION` n° 5.

### 13.10 Autres points de vigilance

- **Restriction d'âge :** activer les réglages 18+ proposés par chaque plateforme sur les comptes professionnels (TikTok, Instagram). Cela rejoint l'esprit de l'art. 4-VII.
- **Mention IA :** les motion designs Remotion ne sont pas de l'« IA réaliste » et ne demandent pas d'étiquette. Toute voix ou tout avatar de synthèse doit être étiqueté, et **aucun avatar ne joue un faux client**.
- **Licence des données :** vérifier que les conditions du fournisseur autorisent la rediffusion de statistiques sur les réseaux sociaux. `BLOCKED_DECISION` n° 11.
- **Publication hors direct :** jamais de contenu pendant le match. Statut `NS` obligatoire.

---

## 14. Décisions attendues du propriétaire (`BLOCKED_DECISION`)

| # | Question | Ce qui en dépend | Recommandation |
|---|---|---|---|
| 1 | Le Match Pulse peut-il montrer la répartition par tranche de 15 min sur un match **non offert** ? La donnée est publique dans le JSON, mais la page match liste « Le scénario du match par tranche de 15 minutes » comme contenu Pro (`pro_gate_item_scenario`). | Format 9.1, Quart d'heure 9.6 | Autoriser, en le présentant comme des « buts réels des 20 derniers matchs », à condition de reformuler l'élément Pro en « le scénario du modèle ». Sinon, le Pulse seulement sur le match offert. |
| 2 | Page de transparence : A (statu quo), B (journal neutre) ou C (calibration) ? | 13.2, réponse « taux de réussite ? » | C, après avis d'avocat. |
| 3 | Blasons de clubs (droit des marques) et photos de joueurs (`media.api-sports.io`) en social ? | Visuels de tous les formats | Noms en typographie seulement, en attendant. |
| 4 | Aligner le match offert sur l'affiche sociale des grands soirs (par exemple faire d'OM – PSG le match offert du 20/09) ? | Cohérence entre le Pulse et l'analyse offerte | Oui pour les derbies de `derby-index.json` (demande une règle dans le pipeline). |
| 5 | Le compte personnel du propriétaire peut-il parler de Pro (art. 4-VI) ? | 13.9 | Non, en attendant l'avis juridique. |
| 6 | Une collaboration, quelle qu'elle soit, avec des créateurs ? | 13.5 | Aucune avant l'avis juridique. |
| 7 | Validation juridique locale UK, US, MX et ES avant les comptes EN et ES | 13.1 | Obligatoire. |
| 8 | Un seul cyan pour tout le social : `#22d3ee`, `#20d5ef` ou `#09d9ff` ? | Section 10 | `#22d3ee` (design freeze). |
| 9 | Tâches techniques : règle `youtube` et `threads` dans `admin_source_group` (SQL + JS + test de parité) ; affichage du tableau `campaigns` ; ajout de `n` (nombre de matchs) dans `match_stats` ; retrait de `generate_tiktok_images.js` | 12.1, 3.2, 1.11 | Oui. |
| 10 | Le marché du match offert peut-il apparaître en social ? (Paywall : oui. TikTok : risque de sortie du fil Pour toi.) | 6.3 | IG et X oui, TikTok non. |
| 11 | Les conditions du fournisseur de données autorisent-elles la rediffusion sociale ? | Tout | À vérifier avant de passer à l'échelle. |

**Ce que je n'ai pas pu vérifier :**
- si Brentford – Chelsea était le match offert du 18/09 : il faut le confirmer, sinon la phrase « LE MODÈLE PRIVILÉGIE MOINS DE 3,5 BUTS » était une fuite ;
- comment le flux attribue les buts contre son camp dans les events (d'où V16) ;
- le texte exact et actuel des règles TikTok (la page ne se charge pas sans navigateur) ;
- la version consolidée de l'art. 4 après l'ordonnance 2024-978 ;
- les dates exactes des trêves internationales 2026-27.

---

## 15. Sources

- Loi n° 2023-451, art. 4 : [Légifrance](https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000047663210). Ordonnance n° 2024-978 : [Légifrance](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000050456412/)
- Code de la consommation, art. L121-4 : [Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044224578/). Jurisprudence sur les jeux de hasard : [Gazette du Palais](https://www.gazette-du-palais.fr/actualites-juridiques/jur-les-pronostics-de-jeux-de-hasard-sont-des-pratiques-deloyales/)
- DGCCRF : [enquête sur les sites de conseils en paris sportifs](https://www.economie.gouv.fr/dgccrf/comprendre-la-dgccrf/publications-et-kits-de-communication/des-faux-bons-tuyaux-sur-les), [sanction France Pronos (27/08/2025)](https://www.economie.gouv.fr/files/files/directions_services/dgccrf/media-document/2025-08-27-CP-DGCCRF-Conseils-en-paris-sportifs-sanction-Black-Mandrill.pdf), [question écrite AN n° 11745 (tipsters)](https://questions.assemblee-nationale.fr/q17/17-11745QE.htm)
- TikTok : [Regulated Goods, Services, and Commercial Activities](https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities), [Ads policy, Gambling and Games](https://ads.tiktok.com/help/article/tiktok-ads-policy-gambling-and-games/)
- Meta : [Online Gambling and Games (Ad Standards)](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/gambling-games/), [Instagram Branded Content Policies](https://help.instagram.com/1695974997209192)
- Code IASHARK lu (lecture seule) :
  - `lib/premium-fields.js`, `lib/public-data-split.js`, `lib/match-view-model.js`, `lib/free-match.js`, `lib/buteurs-du-jour.js` ;
  - `match-page.js`, `funnel-track.js`, `admin-dashboard.js`, `supabase/migrations/0022*`, `0031*` ;
  - `.github/workflows/update-data.yml` (`calcEventsPattern`, `getLast10`, `formatH2H`, `calcTendances`, `calcHotPlayers`) ;
  - `legal/fr/methodologie.html`, `legal/fr/jeu-responsable.html`, `config/markets.json`, `data/derby-index.json`, `IASHARK_DESIGN_FREEZE.md` ;
  - `generate_tiktok_images.js`, `docs/research/social/*.txt` ;
  - `remotion-score-template/src/MatchPulse*.tsx`.
