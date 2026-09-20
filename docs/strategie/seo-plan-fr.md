# IASHARK /fr/ : plan SEO France (marché principal)

Date : 19/09/2026 (Ligue 1, 5e journée, veille du Classique OM - PSG).
Statut du document : **REVIEW**. Les décisions du propriétaire sont marquées **BLOCKED_DECISION**.

**Sources et méthode**
- Worktree `/Users/clement/Documents/IASHARK CLAUDE CODE/wt-seo`, HEAD `a136911ed`, lu **en lecture seule**. L'arbre de travail contient la vague 1 en cours (1 085 fichiers modifiés, dont `scripts/seo-pages.js`, `scripts/seo-common.js`, `config/team-display-names.json`, `lib/standings-groups.js` et `scripts/home-summary.js`). Je n'ai rien modifié et je n'ai lancé ni build ni test.
- Site en ligne https://iashark.com/fr/ : en-têtes HTTP relevés avec curl, page match rendue dans un vrai navigateur.
- Recherche web du 19/09/2026.

**Limites à connaître**
- L'outil de recherche interroge un **index américain**. Pour des requêtes en français, il renvoie surtout des sites français, mais parfois leur version `/us/` (SportyTrader, Windrawwin). Je n'ai trouvé **aucun volume de recherche public**. L'ordre de priorité ci-dessous repose donc sur la composition des SERP et sur l'investissement visible des concurrents. À valider dans Search Console (filtre France) dès que les impressions arrivent.
- PageSpeed Insights était hors quota ce jour-là : les constats de performance viennent de l'analyse statique du HTML.

**Ce que je ne refais pas (vague 1 en cours)** : écrasement du titre au rendu (`match-page.js`), classements, fuseaux horaires, noms d'équipes (mécanisme), Liga MX, 404, hreflang, données structurées. J'indique seulement là où le plan FR **dépend** de ces correctifs ou **les prolonge** (entrées FR à ajouter).

**Rapports des autres marchés** (`us-seo-plan.md`, `seo-plan-gb.md`, `seo-plan-za.md`, `seo-plan-mx.md`, même dossier)
- Plusieurs de leurs actions sont des changements de **générateur partagé** :
  - sections de faits publics sur les pages match (GB A6) ;
  - pages match publiées plus tôt (US A6) ;
  - H1 de l'accueil propre à chaque version (GB A4, MX A11) ;
  - pages par journée (MX A4, ZA A7) ;
  - tableaux de stats (GB A9).
- Pour `/fr/`, je donne le **contenu français** et l'**ordre de priorité**, pas une seconde implémentation.

---

## 0. Résumé

### Les sept constats qui comptent

1. **Aucune page française n'est construite pour une requête « pronostic ».**
   - Les titres de match sont en anglais d'usage : « Marseille vs Paris Saint Germain : pronostic et stats ». Le mot-clé n'est pas en tête, il n'y a pas de date, ni « OM » ni « PSG », et le nom du club est mal orthographié (tiret manquant).
   - Le H1 contient seulement « Marseille vs Paris Saint Germain ».
   - Les pages championnat s'appellent « Champions League », « Europa League » et « Conference League », alors que la France cherche « Ligue des champions », « Ligue Europa » et « Ligue Conférence ».
   - En face, les SERP françaises suivent toutes le même format : `Pronostic OM - PSG (20/09/2026)`.
2. **Les pages match arrivent trop tard pour un domaine jeune.**
   - Dans le registre, 161 pages sur 201 sont créées 2 jours avant le coup d'envoi, et 36 le jour même ou la veille.
   - La page du Classique (`/match/1552773.html`) est apparue le 18/09 pour un match le 20/09.
   - Or la demande « pronostic OM PSG » monte toute la semaine, et le 19/09 les concurrents étaient déjà publiés et mis à jour (RueDesJoueurs, Eurosport, Footix, Afrik-foot…).
3. **Le contenu statique des pages match est mince, et l'avis IASHARK est invisible.**
   - Environ 150 mots de faits (forme, classement, face-à-face).
   - Des champs pourtant publics ne sont pas affichés en HTML statique : buts par tranche de 15 min, absences (Hakimi forfait), stats d'équipe, décomptes BTTS et +2,5.
   - Le seul signal de l'analyse, le niveau `prob_band` (« Probabilité modérée »), n'apparaît qu'après le JavaScript.
4. **Les moteurs de réponse IA citent des pourcentages explicites.**
   - Constaté dans cette session : les synthèses IA de la recherche web ont repris « 50-52 % PSG » (Footix) et « 49,04 % Auxerre » (algorithme SportyTrader).
   - IASHARK ne publie aucun chiffre public : il ne peut donc pas être cité sur « qui va gagner ».
   - C'est l'arbitrage central avec le paywall (§5.1).
5. **Les requêtes françaises les plus accessibles ne sont pas les têtes.**
   - Accessibles :
     - « pronostic foot IA », où de petits sites IA rankent ;
     - les matchs de Ligue 1 hors affiche (Le Mans - Lorient, Auxerre - Brest), où la SERP est pleine de petits sites ;
     - « pronostic Ligue 1 5e journée » ;
     - les stats par club (« BTTS Ligue 1 »).
   - « Pronostic foot » et « pronostic foot aujourd'hui » sont tenus par des affiliés puissants : RueDesJoueurs, SportyTrader, Wincomparator, Coteur, SOSPronostics, Forebet.
6. **Des pages clés manquent.**
   - Il n'existe ni page « pronostics du jour », ni page par journée, ni page stats.
   - Seuls 6 clubs sur 18 ont une page, et 2 derbies. Lyon - Saint-Étienne n'est pas jouable en Ligue 1 cette saison : l'ASSE est en Ligue 2.
   - Ligue 2 et Coupe de France ne sont pas couvertes, alors que les données existent pour la Ligue 2 (voir A19).
7. **Hors SEO mais critique : le dépôt GitHub `IASHARK/iashark` est public** (`"private": false` via l'API GitHub).
   - Sur la requête « iashark pronostic », les pull requests GitHub sortent devant le site.
   - Le code du moteur, l'historique git et les rapports de calibration sont lisibles par tous.
   - **BLOCKED_DECISION** : le passer en privé a un coût possible en minutes GitHub Actions pour le pipeline. À décider avec le lead ; je n'ai rien touché.

### Les actions prioritaires, dans l'ordre

| # | Action | Impact | Effort |
|---|---|---|---|
| A1 | Gabarits FR des pages match : `Pronostic OM - PSG (Ligue 1, 20/09) : stats et analyse`, H1 avec mot-clé, noms français | Élevé | S |
| A2 | Noms français des compétitions (Ligue des champions…) dans titres, H1, fils d'Ariane, libellés | Élevé | S |
| A3 | Pages match publiées 7 à 10 jours avant (Ligue 1, clubs français en Europe, grandes affiches) | Élevé | L, décision |
| A4 | Faits publics complets en HTML statique sur les pages match | Élevé | M |
| A5 | Bloc public « L'avis IASHARK » (niveau de probabilité, fiabilité, ce que contient Pro) | Élevé | M |
| A6 | Hubs datés stables : `/fr/pronostics/` (aujourd'hui et ce soir), demain, week-end | Élevé | M |
| A7 | Pages « Pronostic Ligue 1, Ne journée » (URL stable par journée) | Élevé | M |

**Fenêtre favorable** : selon plusieurs sources, les trêves de septembre et d'octobre sont fusionnées du 21/09 au 07/10 (à vérifier sur le calendrier LFP). La 2e journée de Ligue des champions a lieu les 13 et 14/10. Cela laisse environ 3 semaines pour livrer A1, A2, A4 à A9 avant la reprise.

---

## 1. Recherche de mots-clés en français

### 1.1 Ce que montrent les SERP (19/09/2026)

| Requête | Qui ranke | Format des pages | Intention |
|---|---|---|---|
| **pronostic foot**, **prono foot**, pronostic foot gratuit | RueDesJoueurs (`/pronostics/foot.html`), SportyTrader, Wincomparator, Coteur, SOSPronostics, Forebet, BetMines, MightyTips, SoProno, Feedinco | Liste de 40 à 150 matchs par date puis compétition, avec pour chaque match un prono, des cotes de 3 opérateurs et un lien « Lire l'analyse ». Intro de ~150 mots en haut, experts présentés, bonus opérateurs, pied de page « Jouez responsable » | Transactionnelle : « donne-moi un prono ». Pas de fraîcheur affichée |
| **pronostic foot aujourd'hui** / **ce soir** / **demain** / **week-end** | Mêmes sites, plus des sites internationaux traduits (Forebet, BetMines, Windrawwin, Eaglepredict, PredictZ) ; **PronoFootIA** (jeune site IA) sur « pronostic Ligue 1 ce week-end » | Une URL stable par jour (`/today/`, `/tomorrow/`, `/weekend`), tableaux de pourcentages chez les sites « data », pronos + cotes chez les affiliés. PronoFootIA : page « vivante » avec probabilités par match, indice de confiance, FAQ et 18+ | Liste datée. « ce soir » est servi par les pages « aujourd'hui » |
| **pronostic OM PSG** / PSG OM (20/09) | Eurosport (`/paris-sportifs/pronostics/`), Unibet (opérateur), Footballclubdemarseille, But! Football Club, Afrik-foot, RueDesJoueurs, Footix, X-TremLimit, Topmercato | 1 600 à 2 400 mots. H2 : enjeux, forme, effectifs et absences, compos probables, historique, probabilités, « notre pronostic », meilleures cotes. Signature d'auteur, date de mise à jour, pari recommandé en haut et en bas, bonus opérateurs, Joueurs Info Service en pied de page | Un pari pour ce match et sa justification |
| **pronostic Le Mans Lorient**, **Auxerre Brest pronostic** (matchs moyens) | SportyTrader, RueDesJoueurs, Footix, Topmercato, **Mediapronos, Pensebet, footballtunisien.com (« pronostic IA »)**, pages anglaises parasites (Toffeeweb, thefootballfaithful) | Mêmes gabarits, souvent plus courts. Titre `Pronostic X - Y – Ligue 1 (19/09/2026)` | Même intention, **concurrence nettement plus faible** |
| **pronostic Ligue 1 5e journée**, pronostic Ligue 1 ce week-end | Flashscore et Soccerway (un article daté par journée), Pronosoft (concours), scores24, PronoFootIA, hubs RueDesJoueurs et SportyTrader | Un H2 par match, un pari et sa cote, « explication du pari », 2 500 à 3 000 mots. **Nouvelle URL à chaque journée** chez Flashscore | Tour d'horizon d'une journée |
| **pronostic Ligue 1** | RueDesJoueurs (`/pronostics/ligue-1-937873.html`), SportyTrader, SOSPronostics, Forebet | Liste des prochains matchs avec prono et cotes, puis environ 2 800 mots éditoriaux en bas (enjeux de saison, maintien, Europe). Pas de classement, pas de date de mise à jour | Hub championnat |
| **pronostic Ligue des champions** | RueDesJoueurs, SportyTrader, Forebet (`/fr/predictions-europe/...`), SOSPronostics, FlashFootball, Pronosoft (concours J2 : 13/10) | Hub, plus des articles « favoris au titre » (scores24) | Hub avec pics les soirs de match |
| **pronostic les deux équipes marquent** (aujourd'hui), **plus de 2,5 buts aujourd'hui** | Forebet (`/fr/pronostics-pour-aujourd-hui/chaque-equipe-marque`), BetMines, SportyTrader, FootyStats, Windrawwin, Protipster, scores24 | Tableaux de pourcentages et de scores prédits, très peu de texte, des centaines de championnats | Liste « data ». Trafic surtout international |
| **pronostic foot IA**, prédiction foot IA, pronostic foot statistique probabilité | **Petits sites** : Predixfoot, ia-foot.com, NerdyTips, Probwin, AiBet, FootProbability, XPronostic ; un article Pronosoft ; des apps | Pages d'accueil produit, « historique public », modèles nommés (Dixon-Coles) | Chercher un outil ou une méthode. **C'est exactement le positionnement d'IASHARK** |
| **stats Ligue 1 BTTS**, buts par match Ligue 1 2026-2027 | FootyStats (`/fr/france/ligue-1`), Foot Mercato (statistiques par équipe), FotMob, one-versus-one | Tableaux par club | Consultation de stats. Concurrence moyenne |
| **pronostic PSG** (prochain match), **pronostic OM** | CulturePSG, Pronopotes (page club), page équipe Forebet, articles Goal par match | Pages club et articles par match | Club et match |
| **pronostic Ligue 2**, **pronostic Coupe de France** | RueDesJoueurs, SportyTrader, FlashFootball, Forebet | Hubs | **Non couvert par IASHARK** (A19) |
| combiné foot du jour, prono sûr, score exact | pronostics-gagnants, FootballFeeling, FootyStats, LicoBet | Combinés « sûrs » | **À ne pas viser** (conformité, §3.5) |

**Précisions**
- **Zone Turf** : ce sont des pronostics hippiques PMU, pas un concurrent football dans les SERP relevées.
- **Footpronos** : n'est pas ressorti. Sites proches : pronos-foot.fr, SoProno.
- **Pronosoft** : apparaît via ses concours et son forum, pas sur les requêtes de match.

**Deux réalités d'audience**
- **Afrique francophone** : `_redirects` envoie vers `/fr/` une quarantaine de pays d'Afrique francophone (sn, ci, ml, cm…). Les SERP génériques (« pronostic foot », BTTS du jour) servent largement ce public, comme Forebet et BetMines. Ce trafic existe, mais les clients payants actuels viennent de France.
- **Priorité aux entités françaises** : Ligue 1, OM, PSG, derbies et Coupe de France. Ces requêtes sont à la fois **plus accessibles** et **plus rentables** que les têtes génériques.

### 1.2 Anatomie des pages qui rankent (et ce qu'IASHARK peut en reprendre)

- **Titre de match**
  - Formats relevés : `Pronostic X Y GRATUIT - Ligue 1 20/09/2026` (RueDesJoueurs), `Pronostic : X VS Y | 20/09/2026` (Footix), `X – Y | Pronostics, conseils et cotes | Ligue 1` (Eurosport), `Pronostic X Y – Ligue 1 (20/09/2026)` (Topmercato).
  - **Toujours « Pronostic » en tête, puis les deux clubs, puis la date au format jj/mm/aaaa.**
- **Fraîcheur**
  - Auteur signé et date de mise à jour visibles (« 19/09/2026 à 14:37 » chez RueDesJoueurs, « Jeremy Ernou, mis à jour le 19/09/2026 » chez Eurosport).
  - Publication 2 à 3 jours avant le match (Footix : 18/09 pour le 20/09).
- **Structure d'un match**
  - Enjeux, forme, absences, compos, historique, probabilités, « notre pronostic », cotes.
  - Plusieurs sites affichent des **probabilités chiffrées** : Footix (fourchettes), SportyTrader (« selon l'algorithme… 36,32 % »), PronoFootIA.
- **Ce qu'IASHARK ne doit pas reprendre** : le pari offert à tous, les comparateurs de cotes avec bonus et codes promo opérateurs, les « cotes boostées x10 ».
  - Son modèle est l'abonnement.
  - Il n'est pas affilié.
  - Mettre en avant des opérateurs l'exposerait au régime des communications commerciales ANJ (§3.5).
- **Ce qu'il peut faire mieux**
  - Faits chiffrés avec échantillon (N) et date.
  - Niveau de probabilité du modèle.
  - Transparence sur la méthode.
  - Données propres couvrant 5 saisons (§4).

### 1.3 Clusters → types de page → difficulté → délai réaliste

Délais comptés **après** livraison et indexation, pour un domaine jeune avec peu de liens.

| # | Cluster | Exemples | Page IASHARK | Difficulté | Délai réaliste |
|---|---|---|---|---|---|
| K1 | Tête générique | pronostic foot, prono foot, pronostics football | Accueil `/fr/` | Très élevée | Top 10 peu probable avant 12 mois ou plus de liens. Ne pas en faire l'objectif |
| K2 | Pronos datés | pronostic foot aujourd'hui, ce soir, demain, week-end ; « pronostic foot ce soir Ligue 1 » | `/fr/pronostics/`, `/fr/pronostics/demain.html`, `/fr/pronostics/week-end.html` (A6) | Élevée (tête), moyenne (variantes longues) | Variantes longues : 3 à 6 mois. Tête : 9 à 12 mois et plus |
| K3 | Grande affiche | pronostic OM PSG, PSG OM prono, pronostic Classique | Page match + **page Classique stable** (A10) | Très élevée pour la page match (médias, opérateurs, affiliés) | Page match : top 20 possible avec A1, A3 et A4. Page Classique : 3 à 6 mois sur « Classique OM PSG historique / confrontations », puis montée saison après saison sur « pronostic OM PSG », car l'URL reste |
| K4 | Match de Ligue 1 ordinaire | pronostic Le Mans Lorient, Auxerre Brest pronostic, Angers Troyes prono | Page match (A1, A3, A4) | **Moyenne** | **4 à 8 semaines** une fois les pages indexées avant le match. Positions 5 à 15 plausibles |
| K5 | Journée | pronostic Ligue 1 5e journée, pronostics ligue 1 journée 6 | `/fr/pronostics/ligue-1/journee-N.html` (A7) | Moyenne | 2 à 4 mois, meilleur la saison suivante (l'URL est réutilisée) |
| K6 | Hub compétition | pronostic Ligue 1, pronostic Ligue des champions, Premier League, Liga, Serie A, Bundesliga | `/fr/leagues/*.html` (A2, A9) | Élevée | 6 à 12 mois. La Ligue des champions pique les semaines de match |
| K7 | Marchés « du jour » | pronostic les deux équipes marquent aujourd'hui, plus de 2,5 buts aujourd'hui | **Pas de page liste.** Les guides et la page stats servent ces requêtes | Très élevée (Forebet, FootyStats), public surtout international | Non visé |
| K8 | Stats | stats Ligue 1 BTTS, buts par match Ligue 1 2026-2027, OM buts encaissés | `/fr/stats/ligue-1.html` + stats sur les pages club (A12, A11) | Moyenne | 2 à 4 mois |
| K9 | Clubs et derbies | Classique historique, derby du Nord, Olympico, derby de la Côte d'Azur, PSG prochain match | `/fr/clubs/*` (A10, A11) | Élevée pour « calendrier », moyenne pour « historique du derby » | 3 à 6 mois pour les derbies |
| K10 | IA et méthode | pronostic foot IA, prédiction foot IA, probabilité match foot, loi de Poisson foot, value bet c'est quoi, xG c'est quoi | Accueil (titre), guides, méthodologie | **Faible à moyenne** | **1 à 3 mois**. Le meilleur quasi-tête accessible |
| K11 | Ligue 2, Coupe de France | pronostic Ligue 2, pronostic Coupe de France | À créer si A19 est décidé | Moyenne (Ligue 2 moins disputée) | 2 à 4 mois après ouverture |
| K12 | À éviter | prono sûr, combiné du jour, score exact sûr, « gagner aux paris » | Aucune | n/a | Risque de pratique commerciale trompeuse (§3.5) |

### 1.4 Calendrier des 8 prochaines semaines (à vérifier sur les sources officielles)

- **20/09** : OM - PSG, 5e journée. Puis trêve internationale fusionnée, selon Monaco Tribune et LesViolets : 21/09 → 07/10.
- **13 et 14/10** : 2e journée de Ligue des champions ; le 14/10, Manchester City - PSG. **20 et 21/10** : 3e journée ; le 20/10, PSG - Barcelone.
  - Source : Footmercato, Topmercato. La 1re journée s'est jouée du 8 au 10/09.
- **Coupe de France 2026-2027**
  - 4e tour le 27/09.
  - 5e tour le 11/10, entrée de la Ligue 3.
  - 7e tour le 14/11, entrée de la Ligue 2.
  - Finale le 15/05/2027 (source : Wikipédia).
  - Les clubs de Ligue 1 entrent plus tard.

---

## 2. Audit on-page de `/fr/`, type de page par type de page

Légende : ✓ correct · ✗ défaut · (v1) = traité par la vague 1, rappelé seulement si le plan en dépend.

### 2.1 Tableau transversal, balise par balise

| Élément | Accueil `/fr/` | Hubs `/fr/leagues/*` | Match `/match/<id>.html` | Clubs et derbies `/fr/clubs/*` | Articles `/fr/articles/*` et `/blog/guides/*` | Pro, abonnement, exemple |
|---|---|---|---|---|---|---|
| `<title>` | ✓ 58 car., mot-clé en tête | ✓ Ligue 1 (54) · ✗ « Champions League » | ✗ mot-clé pas en tête, pas de date, noms du flux | ✓ longueur · ✗ pas de « pronostic » | ✓ · ✗ Title Case et « — » dans les guides | ✗ H1 et titres de vente sans mot-clé |
| Meta description | ✓ 155 | ✓ · pas de journée | ✗ ni heure, ni journée, ni « Classique » | ✓ | ✓ | ✓ (prix via `{pro_price}`) |
| H1 | ✗ slogan sans mot-clé | ✓ Ligue 1 · ✗ « Champions League » | ✗ « Marseille vs Paris Saint Germain » | ✓ | ✓ | ✗ « Débloque tout IASHARK », « Vos outils. Nos probabilités. » |
| H2 et H3 | ✗ H2 SEO tout en bas, H2 marketing | ✓ H2 · pas de H3 par jour | ✓ H2 « Informations du match » · faits minces | ✓ | ✓ | ✗ `pro.html` et `marches.html` sans H2 |
| alt des images | ✓ (1 logo sans dimensions) | ✓ 64/64 | ✓ logo `alt` · ✗ sans dimensions | ✓ | pas d'image | ✓ |
| Canonical | ✓ auto-référente | ✓ | ✓ | ✓ | ✓ (index des guides → `/blog.html`) | ✓ |
| hreflang | ✓ 9 + x-default (v1) | ✓ (v1) | ✓ fr/en + x-default `/en/` (v1) | ✓ Classique ↔ `/en/clubs/le-classique.html` | ✓ | ✓ |
| Open Graph et Twitter | ✗ `icon-512.png` carré avec `summary_large_image` | ✗ image générique, `summary` | ✗ `og:image` = blason api-sports (hotlink d'une marque tierce), `summary` | ✗ blason api-sports / logo | ✗ `icon-512` (512 px) pour un `Article` | ✗ générique |
| JSON-LD | ✓ Organization + WebSite + WebPage | ✓ BreadcrumbList + CollectionPage + ItemList | ✓ SportsEvent + BreadcrumbList (v1) | ✓ SportsTeam et SportsEvent | ✓ Article + Breadcrumb (+ FAQPage sur les guides) · ✗ auteur = Organization | ✓ Breadcrumb (+ AboutPage) |
| robots | ✓ index | ✓ | ✓ (noindex si < 80 mots ou J+7) | ✓ | ✓ `max-image-preview:large` | ✓ · `max-image-preview:large` seulement sur articles et blog |
| Liens internes et ancres | ✓ hubs, guides · ✗ aucun lien vers « demain » ni vers l'affiche du week-end | ✗ ancres = cartes « date + équipes + Analyse disponible » | ✓ hub, clubs, derby, guide · ✗ pas de journée, pas de matchs voisins | ✗ ancre « Analyse disponible » | ✓ | ✓ |
| Fil d'Ariane | n/a | ✓ | ✓ (sans niveau journée) | ✓ | ✓ | ✓ |
| Sitemap et lastmod | ✓ `sitemap-fr-i18n.xml` | ✓ `sitemap-leagues.xml` | ✓ `sitemap-fr.xml` (97 URL) | ✓ `sitemap-clubs.xml` | ✓ `sitemap-articles.xml`, `sitemap-fr-i18n.xml` | ✓ |
| Poids et LCP | ✗ HTML 134 Ko (30 Ko br), 35 Ko de CSS inline, 4 familles de polices, 17 scripts sur 19 sans `defer`, logo PNG 86 Ko sans dimensions, dictionnaire `fr.json` de 143 Ko chargé au runtime | ✓ HTML 35 Ko, 3 scripts `defer` · ✗ logo WebP 1648×440 affiché en petit | ✗ 16 scripts sur 18 synchrones (≈312 Ko de JS local brut) + dictionnaire de 143 Ko, logo PNG sans dimensions, risque de CLS quand `#matchRoot` se remplit au-dessus des faits | ✓ | ✓ | ✗ `pro.html` : 11 scripts, 4 familles de polices |
| Mobile | ✓ même HTML | ✓ | ✓ | ✓ | ✓ | ✓ |

### 2.2 Accueil `/fr/`

Générateur : `scripts/build-locales.js` (`injectHomeSeo`, `homeSeoBlock`, `homeJsonLd`), avec le gabarit `index.html` à la racine, `i18n/seo/fr.json#home`, `i18n/dict/fr.json` et `scripts/home-summary.js` (vague 1).

| ID | Défaut | Preuve | Correctif | Fichier |
|---|---|---|---|---|
| H-1 | H1 sans mot-clé, partagé par les 9 versions | « Comprenez le match. Identifiez le marché juste. » | Surcharge par répertoire (même mécanisme que GB A4 et MX A11) : H1 **« Pronostics foot du jour, calculés par un modèle statistique »** (59) ; le slogan passe en sous-titre | `i18n/seo/fr.json#home.hero_h1`/`hero_sub`, `build-locales.js#injectHomeSeo`, marqueur autour du H1 dans `index.html` |
| H-2 | Titre à reconsidérer pour K10 (IA) | « Pronostics foot : probabilités et stats par modèle \| IASHARK » (58), qui vise K1 (inaccessible) | Proposé : **« Pronostic foot IA : probabilités de chaque match \| IASHARK »** (58). Condition d'honnêteté : l'accueil et la méthodologie doivent expliquer ce que recouvre « IA » (modèle statistique, simulation, textes rédigés par IA à partir des chiffres calculés) | `i18n/seo/fr.json#meta.index.title` |
| H-3 | Description sans les compétitions phares | 155 car. | « Pronostics foot par modèle statistique : Ligue 1, Ligue des champions et 17 autres compétitions. Stats, forme, probabilités. Une analyse offerte/jour. 18+ » (154) | `i18n/seo/fr.json#meta.index.description` |
| H-4 | Le résumé statique ne couvre qu'**aujourd'hui** : le Classique (demain) est absent du HTML de l'accueil | Bloc « Analyses IA du jour — 19 septembre 2026 » : 57 lignes (toutes liées), toutes du 19/09 à l'heure de Paris, aucune du 20/09 | Titre du bloc : « Pronostics foot du jour — samedi 19 septembre (heure de Paris) ». Ajouter un H3 « Demain » (jour de Paris suivant) et un H3 « À l'affiche » (derbys et matchs de clubs français en Europe sur 7 jours), avec liens vers `/fr/pronostics/`, `demain.html` et `week-end.html` | `scripts/home-summary.js`, `i18n/dict/fr.json#home_app.seo_summary_title`, `.github/workflows/update-data.yml#injectHomeSeoSummary` |
| H-5 | Bloc SEO en bas de page, sans lien vers les nouveaux hubs | `<!--SEO_INTRO-->` | Ajouter les liens « Pronostics du jour », « Demain », « Ce week-end », « Ligue 1 : 5e journée » et « Stats Ligue 1 » dans `versionNav(fr).sections` | `scripts/seo-common.js#versionNav`, `i18n/seo/fr.json#nav` |
| H-6 | Image de partage carrée avec une carte « large » | `og:image` = `icon-512.png`, `twitter:card` = `summary_large_image` | Image de marque 1200×630, `/assets/og/fr-accueil.png` | `build-locales.js#completeHead` (valeur par défaut par répertoire) |
| H-7 | Organization sans `sameAs` | JSON-LD | Ajouter les profils officiels quand ils existent. **Ne pas** ajouter de `SearchAction` : il n'y a pas de recherche interne, et Google a retiré la boîte de recherche des sitelinks | `build-locales.js#homeJsonLd` |
| H-8 | FAQ visible (7 questions) sans `FAQPage` | Section « Ce que tu te demandes avant de payer » | Optionnel : `FAQPage` strictement identique au texte. Aucun résultat enrichi Google depuis 2023, mais utile aux moteurs IA non-Google | `build-locales.js` |
| H-9 | Formulations à revoir (§3.5) | « De la donnée brute au **signal exploitable** » ; FAQ : « choisie parmi les **écarts les plus favorables** du jour » | « …au signal lisible » ; « choisie parmi les écarts entre notre estimation et la cote les plus marqués du jour ». **Revue juridique** | `i18n/dict/fr.json` |
| H-10 | Poids | voir 2.1 | Logo `iashark-logo.webp` redimensionné (≈240×64 et @2x) avec `width`/`height` ; `defer` sur les scripts non critiques ; 2 familles de polices au plus ; découpage de `i18n/dict/fr.json` par page. Mesurer d'abord (PSI ou CrUX) | `index.html`, `scripts/build-public.js` |
| H-11 | Gabarit racine avec une meta obsolète | `index.html` (racine) : « edge IA et value bets quotidiens » (jamais servi, puisque `/` répond toujours en 302, mais c'est la source) | Aligner sur `fr.json` | `index.html` |
| H-12 | Mélange du vous (hero) et du tu (sections) | Texte de l'accueil | Choisir un registre. Le « vous » est recommandé pour un sujet sensible à la confiance | `i18n/dict/fr.json` |

### 2.3 Hubs championnat `/fr/leagues/*.html`

Générateur : `scripts/seo-pages.js` (`renderLeagueHub`, `hubMeta`, `hubSeason`, `hubFixture`, `hubResult`), `lib/hub-ui.js`, `scripts/league-hub-data.js`, `i18n/seo/fr.json#league`.

| ID | Défaut | Preuve | Correctif | Fichier |
|---|---|---|---|---|
| L-1 | **Noms anglais des compétitions UEFA** sur les pages FR | Titre « Pronostics Champions League : matchs et classement », H1 et fil d'Ariane « Champions League », liste « Autres compétitions » | Carte de noms FR pour la version fr : `ldc` → « Ligue des champions », `el` → « Ligue Europa », `ecl` → « Ligue Conférence », `laliga` → « Liga ». `match.league_labels` (déjà lu par `leagueLabel`, vague 1) sert aux titres de match. Titres proposés : « Pronostic Ligue des champions : matchs, stats et classement » (59) ; « Pronostic Ligue Europa : matchs et classement \| IASHARK » (55) ; « Pronostic Liga : matchs, stats et classement \| IASHARK » (54) | `i18n/seo/fr.json` (nouveau `league.names` + `league.overrides.{ldc,el,ecl,laliga}` + `match.league_labels`), `seo-pages.js#hubVars`/`leagueName`, libellés runtime dans `i18n/dict/fr.json` |
| L-2 | Hub Ligue des champions vide jusqu'au 13/10 | 473 mots, « Aucun match… dans les 14 prochains jours », pas de classement de la phase de ligue | Afficher « Prochaine journée : 2e journée, 13 et 14 octobre » à partir des fixtures au-delà de 14 jours, le classement de la phase de ligue (36 clubs, `/standings`) et un bloc « Les clubs français engagés » | `league-hub-data.js`, `seo-pages.js#renderLeagueHub` |
| L-3 | Saison au format d'une seule année | « Saison 2026 », « Ligue 1 · 2026 » | « Saison 2026-2027 » pour les championnats à calendrier européen (`calendarType: EUROPEAN_SEASON` existe déjà dans `config/league-expansion.json`) | `seo-pages.js#hubSeason`, `lib/hub-ui.js`, `lib/club-hub-render.js` |
| L-4 | Aucune notion de journée | Liste sur 14 jours | Bloc d'ouverture « 5e journée (18-20 sept.) » avec lien vers la page journée (A7). Le titre du hub reste stable | `seo-pages.js#renderLeagueHub` |
| L-5 | Ancres des matchs non descriptives | Ancre = « sam. 19 sept. 20:45 Angers vs Estac Troyes Stade Raymond Kopa Analyse disponible » | Libellé visible « Pronostic Angers - Troyes » et `aria-label` identique | `seo-pages.js#hubFixture`, `lib/hub-ui.js` |
| L-6 | Résultat sans score | « Paris FC vs Strasbourg … Match terminé » | Masquer la ligne tant que le score manque | `seo-pages.js#hubResult` |
| L-7 | Pas de bloc stats ni de FAQ | n/a | Bloc « La saison en chiffres » calculé sur les résultats (buts par match, % BTTS, % +2,5, % nuls, avec N) et FAQ visible de 3 questions factuelles (« Quand a lieu la prochaine journée ? », « Combien de buts par match cette saison ? »…) | `seo-pages.js`, `i18n/seo/fr.json#league` |
| L-8 | Pas de H3 par jour | Liste plate | H3 « Samedi 19 septembre », « Dimanche 20 septembre » | `seo-pages.js#renderLeagueHub` |
| L-9 | Navigation d'en-tête pauvre | `ACCUEIL · Clubs et derbies · BLOG` | Ajouter « Pronostics du jour » | gabarit du hub dans `seo-pages.js` |
| L-10 | Description | « …matchs des 14 prochains jours… » | Ligue 1 : « Pronostics Ligue 1 par modèle statistique : matchs de la journée à l'heure de Paris, forme, buts, BTTS et classement. Une analyse offerte par jour. 18+ » (151). H1 : « Pronostics Ligue 1 : calendrier, stats et classement » | `i18n/seo/fr.json#league.overrides.ligue1` |
| L-11 | Image de partage générique, carte `summary` | n/a | Carte 1200×630 par hub | A14 |
| (v1) | Classement périmé (« au 14 septembre ») | n/a | Traité par la vague 1 | n/a |

### 2.4 Pages match `/match/<id>.html` (le FR est à la racine)

Générateur : `scripts/seo-pages.js` (`matchVars`, `matchTitle`, `matchDescription`, `matchSummaryHtml`, `matchFactSections`, `matchFactsHtml`, `matchMetaBlock`, `matchEvent`, `matchCrumbs`), `i18n/seo/fr.json#match`, `config/team-display-names.json` + `lib/team-names.js`, `scripts/match-lifecycle.js`.

Page de référence : `/match/1552773.html`, Marseille - PSG, dimanche 20/09 à 20h45.

| ID | Défaut | Preuve | Correctif | Fichier |
|---|---|---|---|---|
| M-1 | Titre à l'anglaise, sans date, noms du flux | « Marseille vs Paris Saint Germain : pronostic et stats » (la version complète avec « (Ligue 1) \| IASHARK » dépasse 60 caractères, donc repli sur la version courte) | Gabarits FR, format des SERP françaises : `title` = « Pronostic {home_s} - {away_s} ({league_label}, {dm}) : stats et analyse » (ex. « Pronostic OM - PSG (Ligue 1, 20/09) : stats et analyse », 54) ; `title_short` = « Pronostic {home_s} - {away_s} ({dm}) : stats et analyse » ; `title_min` = « Pronostic {home_s} - {away_s} ({dm}) ». La marque saute seule au-delà de 60 (`fitText`) | `i18n/seo/fr.json#match`, `seo-pages.js#matchVars` (nouvelles variables `{dm}` = jj/mm à Paris, `{home_s}`/`{away_s}`, `{round}`, `{day}`, `{venue}`) |
| M-2 | Noms d'usage français absents | « Paris Saint Germain » (le club s'écrit avec un tiret), « Stade Brestois 29 », « Estac Troyes » ; aucun « OM » ni « PSG » | Prolonger le mécanisme de la vague 1 : entrées Ligue 1 dans `config/team-display-names.json` (id 85 → « Paris Saint-Germain » ; 106 → « Brest » ; Troyes → « Troyes » ; sources et REVIEW exigés par le `_readme` du fichier). Plus un **alias court FR réservé aux titres et H1** : 85 → « PSG », 81 → « OM ». Les deux sont des abréviations officielles et ce que la France tape. Ne jamais remplacer le nom dans le corps de page ni dans le JSON-LD | `config/team-display-names.json` (champ `short.fr`), `lib/team-names.js` (copie runtime), `seo-pages.js#tn` |
| M-3 | Description sans heure, sans journée, sans affiche | « Marseille reçoit Paris Saint Germain (Ligue 1) le 20 septembre 2026 : horaire à l'heure de Paris… » | « {home_s} - {away_s}, {league} ({round}), {day} {dm} à {time} au {venue} : forme, buts, absences, confrontations et analyse IASHARK. 18+ ». Ex. « OM - PSG, Ligue 1 (5e journée), dimanche 20/09 à 20h45 à l'Orange Vélodrome : forme, buts, absences, confrontations et analyse IASHARK. 18+ » (139). Heure au format français « 20h45 » | `i18n/seo/fr.json#match.description` + `C.clockIn` (option `clock_style` fr) |
| M-4 | H1 sans mot-clé | « Marseille vs Paris Saint Germain » | `match.h1` (clé ajoutée par la vague 1) = « Pronostic {home_s} - {away_s} : stats et analyse du match ». Sous le H1 : « Ligue 1, 5e journée · dimanche 20 septembre 2026, 20h45 (heure de Paris) · Orange Vélodrome » | `i18n/seo/fr.json#match.h1`, `seo-pages.js#matchSummaryHtml` |
| M-5 | **Contenu statique mince** | ≈150 mots de faits. Les champs publics `events_*` (buts par tranche de 15 min, moyennes), `injuries`, `match_stats_*` et `stade.temp/desc` ne sont pas dans le HTML statique | Mêmes sections que GB A6, en français : « Buts et BTTS sur les 5 derniers matchs » (« X sur N », jamais un % sans N) ; « Quand ces équipes marquent » (tranches de 15 min, avec « sur les 20 derniers matchs, source API-Football ») ; « Absences » (joueur, motif, statut ; pas le champ `impact`) ; « Comparatif » (tirs, corners, possession, fautes ; xG seulement une fois la source confirmée). Titres de section FR : « Le match en bref », « Forme récente », « Buts et BTTS », « Quand tombent les buts », « Absences », « Classement », « Confrontations directes », « L'avis IASHARK », « Questions fréquentes » | `seo-pages.js#matchFactSections`, `match-lifecycle.js#publicSnapshot` (liste blanche), `i18n/seo/fr.json#match.*` |
| M-6 | L'avis IASHARK (niveau de probabilité) n'existe qu'après le JavaScript | Rendu navigateur : « Niveau du marché retenu : Probabilité modérée » ; HTML statique : « Analyse statistique IASHARK disponible pour ce match. » | Bloc statique « L'avis IASHARK » (§5.2) | `seo-pages.js#matchSummaryHtml` (nouveau `teaserHtml`), tests anti-fuite |
| M-7 | Pas de FAQ | n/a | FAQ visible générée depuis les faits (4 questions : heure et stade, forme, face-à-face, absences), plus éventuellement un `FAQPage` identique | `seo-pages.js` |
| M-8 | Maillage incomplet | Liens : hub, 2 clubs, derby, guide, accueil | Ajouter : page journée, `/fr/pronostics/` ou `demain.html`, bloc « Autres pronostics de la 5e journée » (3 à 8 liens, ancres « Pronostic Lyon - Rennes »). Ancre derby : « Classique OM - PSG : historique et prochain match » | `seo-pages.js#matchFactsHtml` |
| M-9 | Fil d'Ariane sans journée | Accueil › Ligue 1 › match | Accueil › Ligue 1 › 5e journée › OM - PSG (après A7) | `seo-pages.js#matchCrumbs` |
| M-10 | Image de partage = blason d'un club tiers (hotlink api-sports, marque) | `og:image` = `media.api-sports.io/.../81.png`, `twitter:card` = `summary` | Carte texte 1200×630 générée (équipes, compétition, date et heure, IASHARK), sans blason ni photo de joueur ; `summary_large_image`. Même image dans `SportsEvent.image` | A14, `seo-pages.js#matchImage`/`matchMetaBlock` |
| M-11 | **Pages créées 0 à 2 jours avant le match** | Registre : décalage `first_seen` → coup d'envoi = 2 j (161 pages), 1 j (21), 0 j (15), -1 j (4) ; Classique vu le 18/09 | A3 : aperçu 7 à 10 jours avant, même URL | `match-lifecycle.js`, `seo-pages.js`, `league-hub-data.js`, `update-data.yml#generateMatchPages` |
| M-12 | À J+30, la 301 vers le hub perd les liens d'une affiche | `retiredDirTarget` → hub | Si le match est un derby présent dans `data/derby-index.json` : 301 vers la page derby de la version | `match-lifecycle.js#retiredDirTarget`/`redirectRules` |
| M-13 | Poids et CLS | voir 2.1 | `defer` sur les 16 scripts synchrones (ordre conservé), logo WebP redimensionné avec dimensions, hauteur réservée pour `#matchRoot` | `match.html` (gabarit), `scripts/build-public.js` |
| M-14 | Heure au format d'application dans le rendu | Rendu : « 20:45 UTC+2 » ; statique : « 20:45 (heure de Paris) » | Version fr : « 20h45 (heure de Paris) » partout | `match-page.js#dateHeure`, `i18n/seo/fr.json#clock_*` (v1 fuseaux) |

### 2.5 Clubs et derbies `/fr/clubs/*`

Générateur : `scripts/build-club-hubs.js`, `lib/club-hub-render.js`, `config/club-hubs.json` (`versions.fr`, `clubs[].pages.fr`, `derbies[].pages.fr`).

| ID | Défaut | Preuve | Correctif | Fichier |
|---|---|---|---|---|
| C-1 | Couverture : 6 clubs et 2 derbies seulement | Pages fr : psg, marseille, lyon, monaco, lille, lens ; le-classique, derby-du-nord | 12 clubs à ajouter : Rennes, Nice, Strasbourg, Brest, Toulouse, Lorient, Le Havre, Auxerre, Angers, Paris FC, Le Mans, Troyes. Derbies (sources à citer, statut REVIEW) : **Olympico** OM - OL, **derby de la Côte d'Azur** Nice - Monaco, **derby parisien** PSG - Paris FC, **derby breton** Rennes - Brest. **Lyon - Saint-Étienne : pas maintenant**, l'ASSE est en Ligue 2 en 2026-2027 (Wikipédia, calendrier de Ligue 2). Une page sans match à venir serait mince ; à revoir si l'ASSE remonte ou en cas de tirage en Coupe de France | `config/club-hubs.json` |
| C-2 | Journées en anglais | « Ligue 1 · Regular Season - 5 », « Regular Season - 19 » | « 5e journée ». Traduire aussi « Final », « Round of 16 »… via une table FR | `lib/club-hub-render.js` (l.142, 178, 360 : `fx.league.round` brut), `i18n/parts/clubs.fr.json` |
| C-3 | Pluriels « (s) » | « 4 victoire(s) pour Paris Saint-Germain, 1 pour…, 1 nul(s) » | Pluriels réels | `lib/club-hub-render.js`, `i18n/parts/clubs.fr.json` |
| C-4 | Ancre vers le match non descriptive | Ancre « Analyse disponible » | « Pronostic OM - PSG du 20/09 : l'analyse » | `lib/club-hub-render.js` |
| C-5 | La page derby ne passe pas en mode « semaine de match » | Titre « Classique PSG-OM : confrontations et prochain match » | Titre dynamique quand le prochain match a lieu dans les 7 jours : « Classique OM - PSG : pronostic, historique et prochain match » (60) ; H1 : « Le Classique OM - PSG : prochain match, pronostic et historique » ; description : « OM - PSG le dimanche 20/09 à 20h45 : l'analyse IASHARK du prochain Classique, les confrontations directes, la forme et le classement des deux clubs. 18+ » (152). Hors semaine de match : « Classique PSG - OM : historique, confrontations et stats » (56) | `lib/club-hub-render.js`, `config/club-hubs.json` (variantes `title_matchweek`) |
| C-6 | Titres de club tournés vers « calendrier », tête tenue par les clubs et L'Équipe | « PSG : calendrier, classement, forme et analyses statistiques » | « {Club} : calendrier, stats et pronostics des matchs » (ex. Stade Rennais, 58) | `config/club-hubs.json` |
| C-7 | Pas de stats de saison | n/a | Section « 2026-2027 en chiffres » (GB A10 en français) : V-N-D domicile et extérieur, buts par match, BTTS X/N, +2,5 X/N, clean sheets | `lib/club-hub-render.js` |
| C-8 | Image de partage | Blason api-sports (clubs) ou `icon-512` (derbies) | A14 | n/a |
| C-9 | Hub des clubs figé sur 6 clubs | Titre « Clubs de Ligue 1, Classique et derby du Nord : calendrier » | Titre à régénérer quand la liste s'allonge : « Clubs de Ligue 1 et derbies : calendrier, stats, pronostics » | `config/club-hubs.json#versions.fr.hub` |

### 2.6 Articles et blog

Sources : `content/local-articles/fr.json` et `content/local-articles/fr/*.htm` (générés par `scripts/build-local-articles.js`) ; `blog/*.html` et `blog/guides/*.html` (sources FR à la racine) ; `blog.html`.

| ID | Défaut | Preuve | Correctif | Fichier |
|---|---|---|---|---|
| A-1 | Deux maisons éditoriales FR, un sujet en doublon | `/fr/articles/marches-plus-moins-2-5-buts-btts.html` et `/blog/guides/plus-de-2-5-buts-probabilite-methode-poisson.html` visent tous deux « plus de 2,5 buts » | Séparer les cibles : l'article « marchés » vise « plus/moins de 2,5 buts BTTS c'est quoi » ; le guide vise « loi de Poisson foot, calculer une probabilité ». Titres distincts et liens croisés dans les deux sens. Pas de fusion pour l'instant (pas de redirection à gérer) | `content/local-articles/fr.json`, `blog/guides/plus-de-2-5-buts-…html` |
| A-2 | Auteur = Organization | `"author":{"@type":"Organization","name":"IASHARK"}` | Auteur **Person** réel (le propriétaire ou un rédacteur nommé) avec une page `/fr/auteur/<nom>.html` : parcours, rôle, et mention « textes d'analyse rédigés par IA à partir des chiffres calculés, relus par… ». Sujet proche du YMYL : l'E-E-A-T compte | `scripts/build-local-articles.js`, `content/local-articles/fr.json`, JSON-LD des guides |
| A-3 | Image d'article de 512 px | `"image":"https://iashark.com/icon-512.png"` | Visuel ≥ 1200 px par article (graphique de données maison) pour Discover et le partage | `content/local-articles/fr.json` |
| A-4 | Typographie anglaise et émojis dans les titres des guides FR | H2 « ️ Comment Fonctionne IASHARK », « Championnats Couverts par IASHARK », « Questions Fréquentes » ; H3 « 🦈 Les Analyses du Jour » ; titre « Prédiction IA Football 2026 — Comment ça marche vraiment » | Casse française (« Comment fonctionne IASHARK »), sans émoji dans les titres. Titre : « Prédiction foot par IA : comment ça marche vraiment (2026) » | `blog/guides/*.html` (FR) |
| A-5 | `/blog/` (dossier) sert le fil « Transferts » en noindex, alors que le hub est `/blog.html` | `blog/index.html` : `noindex, follow` | Garder le noindex. Ajouter sur le fil un lien bien visible vers `/blog.html` | `blog/index.html` |
| A-6 | Guides « débutant » et « value bet » : ton à vérifier | Titres : « Paris sportifs : le guide complet pour débuter avec méthode », « Value bet : comparer une probabilité à une cote… » | Relecture ANJ et DGCCRF (§3.5) : pas d'incitation, pas de « gagner », pas de « rentable » | `blog/guides/guide-paris-sportifs-debutant-complet.html`, `value-bet-guide-complet-2026.html` |
| ✓ | Articles locaux | 1 440 à 1 460 mots, sommaire, sources vérifiées, dates, statut REVIEW | À garder comme niveau de qualité | n/a |

### 2.7 Pro, abonnement, exemple, méthodologie, jeu responsable

| ID | Page | Défaut | Correctif | Fichier |
|---|---|---|---|---|
| P-1 | `/fr/pro.html` | 226 mots, H1 « Vos outils. Nos probabilités. », aucun H2 ; meta « Sélections à forte probabilité modèle… » ; libellés « Calculateur de mise », « Simulateur de capital », « Ce que les paris enregistrés ont réellement rapporté » | Titre « Outils IASHARK Pro : comparer probabilités et cotes » (51), environ 300 mots d'explication, un H2 par outil. Libellés à revoir (§3.5). Sinon, `noindex` | `i18n/seo/fr.json#meta.pro`, `i18n/dict/fr.json`, `pro.html` |
| P-2 | `/fr/abonnement.html` | H1 « Débloque tout IASHARK » | H1 « Abonnement IASHARK Pro : toutes les analyses de match ». Sections « Ce que Pro contient / ne contient pas » et « Résilier en ligne », FAQ. Prix toujours via `{pro_price}` (`config/markets.json`) | `abonnement.html`, `i18n/dict/fr.json` |
| P-3 | `/fr/exemple-analyse.html` | 148 mots statiques : l'exemple (la seule analyse complète publique) est rendu en JavaScript | Intégrer l'exemple au HTML statique. Indiquer sa date et le résultat réel du match (honnêteté). Titre « Exemple d'analyse de match IASHARK : PSG - Monaco (complète) » (60) | `exemple-analyse.html`, `build-locales.js` |
| P-4 | `/fr/methodologie.html` | « Méthodologie IAShark » (titre et H2) alors que la marque est IASHARK ailleurs | « Méthodologie IASHARK : données, modèle et limites » (49). Encadré « En bref » de 50 mots en tête (§4.3) | `legal/fr/methodologie.html` |
| P-5 | `/fr/marches.html` | 223 mots, H1 « Analyse des marchés », aucun H2 | Texte explicatif statique ou `noindex` | `marches.html` |
| P-6 | `/fr/jeu-responsable.html` | Titre « Jeu responsable — IASHARK » (25) | « Jeu responsable : 18+ et aide Joueurs Info Service \| IASHARK » (60) | `legal/fr/jeu-responsable.html` |
| P-7 | `/fr/a-propos.html` | H1 « Des données , un modèle… » (espace avant la virgule) | Coquille à corriger | `a-propos.html` / `i18n/dict/fr.json` |

### 2.8 Sitemaps, robots, suivi, marque

- ✓ `robots.txt` autorise tout (y compris GPTBot, PerplexityBot, ClaudeBot et Google-Extended) et déclare `sitemap.xml`. Les 14 sitemaps et leurs `lastmod` sont corrects (rapport de nuit du 19/09).
- ✗ **Les pages match FR sont hors de `/fr/`** (à la racine, `/match/`).
  - Une propriété Search Console en préfixe `https://iashark.com/fr/` ne les voit pas.
  - Il faut une **propriété Domaine** plus une propriété préfixe `/match/` (§6).
- ✗ `max-image-preview:large` n'est présent que sur les articles.
  - L'ajouter à toutes les pages indexables (hubs, matchs, clubs) pour les grandes vignettes (Discover, partages).
  - Fichiers : `seo-pages.js`, `build-club-hubs.js`, `build-locales.js#completeHead`.
- ✗ Pas de `/llms.txt` ni de `/tarifs.md` (404) → A17.
- Nouvelles pages (A6, A7, A12) à ajouter à `scripts/i18n-sitemaps.js` et `writeSeoSitemaps` : nouveau `sitemap-fr-pronostics.xml`, avec un `lastmod` quotidien pour les hubs datés.

---

## 3. Architecture française pour gagner les requêtes « pronostic »

### 3.1 Arborescence cible

```
/fr/  Accueil : « Pronostic foot IA », résumé du jour + demain + à l'affiche
├── /fr/pronostics/                           NOUVEAU : aujourd'hui + ce soir (#ce-soir)
├── /fr/pronostics/demain.html                NOUVEAU
├── /fr/pronostics/week-end.html              NOUVEAU (ven.-lun. ; en semaine : le prochain week-end)
├── /fr/pronostics/ligue-1/journee-1.html … journee-34.html   NOUVEAU (URL réutilisées chaque saison)
├── /fr/pronostics/ligue-des-champions/journee-1.html … journee-8.html  (puis barrages, 8es…)  NOUVEAU, phase 2
├── /fr/leagues/ligue-1.html                  Hub « Pronostic Ligue 1 » (existe, amélioré)
├── /fr/leagues/champions-league.html         Hub « Pronostic Ligue des champions » (URL gardée, titres FR)
├── /fr/leagues/…                             17 autres hubs (titres FR)
├── /match/<id>.html                          Pages match FR (URL gardée : A3, A4, A5)
├── /fr/clubs/                                Hub clubs et derbies
│   ├── classique-psg-om.html, derby-du-nord-lens-lille.html   (existent, mode « semaine de match »)
│   ├── olympico-om-ol.html, derby-cote-d-azur-nice-monaco.html,
│   │   derby-parisien-psg-paris-fc.html, derby-breton-rennes-brest.html   NOUVEAU (REVIEW)
│   └── 18 pages club de Ligue 1 (12 nouvelles)
├── /fr/stats/ligue-1.html                    NOUVEAU : tableaux BTTS, +2,5, clean sheets, buts par club
├── /fr/articles/                             Articles locaux + articles de données (A12, A18)
├── /blog.html, /blog/guides/*                Guides FR (existent : typographie, auteur)
└── /fr/auteur/<nom>.html                     NOUVEAU (E-E-A-T)
```

**Choix d'URL**
- **Pages match** : garder `/match/<id>.html`. Les déplacer sous `/fr/` avec un slug apporterait peu (Google affiche le fil d'Ariane, pas l'URL). En revanche, cela toucherait le cycle de vie, les 301 et le hreflang que la vague 1 stabilise.
- **Hubs** : garder `/fr/leagues/`. Le dossier est en anglais, mais l'impact est faible et un changement coûterait des redirections.
- **Nouvelles pages** : sous `/fr/pronostics/`, **pas** sous `/fr/leagues/`. Comme le rappelle le rapport MX, `writeSeoPages` supprime tout ce qui n'est pas un hub dans ce dossier.
- **Dossiers intermédiaires** : `/fr/pronostics/ligue-1/` redirige en 301 vers `/fr/leagues/ligue-1.html`, pour ne pas créer deux hubs Ligue 1.

**Anti-cannibalisation (une cible par page)**
- L'accueil vise « pronostic foot (IA) ».
- `/fr/pronostics/` vise « aujourd'hui / ce soir » ; `demain.html` vise « demain » ; `week-end.html` vise « week-end ».
- Le hub vise « pronostic Ligue 1 » ; la page journée vise « pronostic Ligue 1 Ne journée ».
- La page match vise « pronostic X - Y (date) » ; la page derby vise « Classique OM PSG » (historique, confrontations) et « pronostic » en semaine de match.

### 3.2 Spécifications des pages

Règles communes à toutes ces pages :
- **Données réelles uniquement.** Heures de Paris.
- **Aucune sortie premium du modèle.** Seuls sont publics : `prob_band`, `data_quality_*`, `has_signal`, `is_free`.
- 18+ et Joueurs Info Service visibles.
- `noindex,follow` si le contenu tombe sous le seuil (même logique que `MIN_HUB_FIXTURES` et `MIN_INDEXABLE_WORDS`).
- Tests anti-fuite : `tests/premium-leak-real-files.test.js`.

#### A) `/fr/pronostics/` : « Pronostic foot aujourd'hui et ce soir »

- **Title** : « Pronostic foot aujourd'hui et ce soir ({jour} {jj/mm}) \| IASHARK ». Ex. « Pronostic foot aujourd'hui et ce soir (samedi 19/09) » (52) : la marque saute au-delà de 60 caractères.
- **H1** : « Pronostics foot aujourd'hui, samedi 19 septembre 2026 ».
- **Meta** : « Les matchs du samedi 19/09 à l'heure de Paris : Ligue 1, Premier League, Liga… Forme, stats et niveau de probabilité IASHARK. Une analyse offerte. 18+ » (150).
- **Blocs, dans l'ordre**
  1. **Intro générée** (40 à 60 mots) : « {N} matchs analysés aujourd'hui dans {K} compétitions, dont {x} de Ligue 1. L'affiche : {match le plus suivi}. Une analyse complète est offerte : {match offert}. Des probabilités, pas des certitudes. 18+ »
     - « Match le plus suivi » est une règle fixe : derby présent dans `derby-index`, sinon Ligue 1, sinon Ligue des champions, sinon premier par heure.
  2. **H2 « L'analyse offerte du jour »** : le match où `is_free` vaut vrai (champ public), avec un lien. **Sans nommer le pari**, avec « compte gratuit requis ».
  3. **H2 « Ligue 1 »**, puis Ligue des champions et Ligue Europa (clubs français d'abord), Premier League, Liga, Serie A, Bundesliga, puis les autres compétitions : **un H2 par compétition**, dans l'ordre de `fr.json#home.priority_leagues`. Pour chaque match :
     - heure ;
     - lien « Pronostic {home_s} - {away_s} » ;
     - forme (5 derniers, V/N/D) ;
     - places au classement ;
     - « BTTS 3/5 · +2,5 4/5 » (calculé depuis les scores de forme, avec N) ;
     - badge de niveau : « ●●○ Bonne probabilité », avec l'infobulle « niveau du marché retenu par le modèle, pas le résultat du match ; 75 % échoue encore 1 fois sur 4 » ;
     - « Fiabilité des données : élevée ».
  4. **H2 `id="ce-soir"` « Les matchs de ce soir (à partir de 18h) »** : un rappel filtré, en liens seulement, pour « ce soir » sans page dédiée.
  5. **H2 « Demain »** : 5 liens et un lien vers `demain.html`.
  6. **H2 « Comment lire ces pronostics »** : 80 mots, avec liens vers la méthodologie et le guide Poisson.
  7. **FAQ visible** (3 questions) : « Les heures sont-elles à l'heure de Paris ? », « Que veut dire le niveau de probabilité ? », « Pourquoi un seul match gratuit ? ».
  8. Mise en garde (§3.5).
- **Mise à jour** : à chaque passage du pipeline, et reconstruction à minuit heure de Paris. Afficher « Mis à jour le {date} à {heure} ».
- **Maillage** : liens depuis l'accueil (H-4 et H-5), la navigation d'en-tête de toutes les pages SEO, les hubs, les pages match (« Tous les pronostics du jour ») et le pied de page.
- **Schema** : `CollectionPage` avec `dateModified` et `mainEntity` = `ItemList` de `SportsEvent` (name, startDate avec fuseau, location.name, homeTeam et awayTeam, url de la page match), plus `BreadcrumbList` (Accueil › Pronostics du jour). `FAQPage` identique à la FAQ, facultatif.
- **Fichiers** : nouveau `scripts/build-day-pages.js` (ou une fonction dans `seo-pages.js`) alimenté par le run (`match/*.json` publics) et par le registre ; `i18n/seo/fr.json#day` (gabarits) ; `update-data.yml` (appel après `writeSeoPages`) ; sitemaps.
- **Garde-fou** : `noindex` si moins de 3 matchs dans la journée (rare).

#### B) `/fr/pronostics/demain.html`

- **Title** : « Pronostic foot demain ({jour} {jj/mm}) : matchs et stats » (56).
- **H1** : « Pronostics foot de demain, {jour} {date} ».
- **Meta** : « Les matchs de demain, dimanche 20/09, à l'heure de Paris : Ligue 1, Premier League, Liga… Forme, stats et niveau de probabilité IASHARK. 18+ » (140).
- **Contenu** : blocs 3, 6 et 7 de A. Le niveau de probabilité n'apparaît que si l'analyse existe déjà ; sinon « Analyse publiée avant le coup d'envoi ».

#### C) `/fr/pronostics/week-end.html`

- **Title** : « Pronostic foot ce week-end : Ligue 1 et Europe ({jj-jj/mm}) » (57).
- **H1** : « Pronostics foot du week-end : Ligue 1 et grands championnats ».
- **Période** : du vendredi au lundi. Du mardi au jeudi, la page annonce le week-end suivant et les dates.
- **Contenu** : un H2 par jour, les matchs groupés par compétition, les 3 affiches du week-end en tête, et un lien vers la page de la journée de Ligue 1.

#### D) `/fr/pronostics/ligue-1/journee-{N}.html` : « Pronostic Ligue 1, Ne journée »

Dépend du champ `round`, conservé par la vague 1 (`update-data.yml` : `round:lg.round||null` ; `publicSnapshot` le recopie).

- **Title** : « Pronostic Ligue 1 {N}e journée : matchs, stats et classement » (58).
- **H1** : « Pronostics Ligue 1 : {N}e journée ({dates}) ».
- **Meta** : « Ligue 1, {N}e journée ({jj-jj/mm}) : les 9 matchs à l'heure de Paris, forme, buts, classement avant la journée et analyse statistique IASHARK. 18+ » (142).
- **Contenu, tiré à 100 % des données**
  1. Hook : « La {N}e journée de Ligue 1 se joue du {jour} au {jour}. L'affiche : {derby ou match des deux clubs les mieux classés}. Voici les 9 matchs, la forme des équipes et l'analyse IASHARK de chaque rencontre dès sa publication. »
  2. **Les 9 matchs** : une carte par match (heure, stade, forme, places, BTTS et +2,5 X/N, niveau de probabilité, lien).
  3. **« La journée en chiffres »** : calculé, jamais narratif. Exemples : « 3 matchs entre équipes du top 6 », « Le Mans : les deux équipes ont marqué dans ses 4 matchs ».
  4. Classement avant la journée.
  5. Après les matchs : **« Résultats de la {N}e journée »** avec les scores du registre.
  6. Journée précédente et suivante, lien vers le hub, liens vers les derbies de la journée.
- **Entre deux saisons** : la page garde la journée N de la saison écoulée avec son en-tête daté, puis bascule sur la nouvelle saison quand la fixture existe. L'URL est réutilisée : c'est ce qui accumule de l'autorité, là où Flashscore et Soccerway créent une URL par semaine.
- **Schema** : `CollectionPage` + `ItemList` de `SportsEvent` + `BreadcrumbList` (Accueil › Ligue 1 › {N}e journée).
- **Indexable** à partir de 5 matchs connus.
- **Fichiers** : nouveau `scripts/build-round-pages.js` (généraliser le `build-liga-mx-rounds.js` proposé par MX A4 : **un seul générateur** pour Liga MX, PSL, Ligue 1 et Premier League) ; `i18n/seo/fr.json#round` ; liens depuis `renderLeagueHub` (L-4) et `matchFactsHtml` (M-8).
- **Phase 2** : même gabarit pour la Ligue des champions (« Pronostic Ligue des champions, 2e journée : matchs et stats », 59), avant le 13/10.

#### E) Hubs par compétition (existants)

- Voir L-1 à L-10.
- Tableau des titres cibles : Ligue 1, Ligue des champions, Ligue Europa, Liga, Premier League (« Pronostic Premier League : matchs, stats et classement », 54), Serie A, Bundesliga.
- Ordre des blocs : journée en cours, matchs, classement, la saison en chiffres, résultats, clubs et derbies, FAQ, méthode.

#### F) Pages match

- Voir M-1 à M-14 et §5.2.
- Ordre des blocs :
  1. H1, puis ligne compétition, journée, date et stade.
  2. **L'avis IASHARK** (§5.2).
  3. Le match en bref.
  4. Forme.
  5. Buts et BTTS.
  6. Quand tombent les buts.
  7. Absences.
  8. Classement.
  9. Confrontations.
  10. Questions fréquentes.
  11. Autres pronostics de la journée.
  12. Liens (clubs, derby, hub, journée, du jour).
  13. Mise en garde.

#### G) Classique et derbies

- **Page Classique** (C-5), en semaine de match :
  - bloc « Le prochain Classique : dimanche 20/09, 20h45, Orange Vélodrome », avec niveau de probabilité, fiabilité et lien « Pronostic OM - PSG : l'analyse » ;
  - « Le Classique en chiffres » (depuis les confrontations détenues par l'API, avec « depuis {année}, N matchs ») ;
  - historique sourcé (l'intro actuelle, sourcée, est bonne).
- **Nouveaux derbies** : même gabarit, intros sourcées (Wikipédia FR/EN, ligue1.com), statut REVIEW, `noindex` tant qu'aucune donnée live n'existe (le builder le fait déjà).
- **A10 (redirection)** : à J+30, la page match d'un derby redirige en 301 vers la page derby.

#### H) Pages club

Voir C-1, C-6, C-7. Titre « {Club} : calendrier, stats et pronostics des matchs ». Le bloc « Prochain match » porte une ancre « Pronostic ».

#### I) `/fr/stats/ligue-1.html` (A12)

- **Title** : « Stats Ligue 1 2026-2027 : BTTS, +2,5 buts et buts par équipe » (60).
- **H1** : « Ligue 1 2026-2027 en chiffres : buts, BTTS et clean sheets ».
- **Meta** : « Chaque club de Ligue 1 : buts marqués et encaissés, les deux équipes marquent, plus de 2,5 buts et clean sheets, mis à jour après chaque journée. » (145).
- **Tableaux triables** (club, J, total, domicile, extérieur), toujours avec N et « au {date} ». Pas de pourcentage si N < 3.
- **Encadré méthode** : scores à la 90e minute, source API-Football.
- **Schema** : `BreadcrumbList` + `WebPage` (pas de `Dataset`, comme dans GB A9).
- **Plus tard** : Premier League, Liga, et la Ligue des champions (phase de ligue).

#### J) Guides évergreens (à écrire, REVIEW, sources)

1. « Les deux équipes marquent (BTTS) : définition et chiffres par championnat » : chiffres réels, §4.1.
2. « Comment se calcule la probabilité d'un match de foot (exemple réel) » : un match terminé, stats publiques datées.
3. « Cote et probabilité implicite : convertir et retirer la marge ».
4. « Combinés : pourquoi la probabilité chute si vite ». Ton pédagogique, décourageant, sans « combiné du jour ».
5. « Ligue des champions 2026-2027 : format de la phase de ligue et dates » : sources UEFA.
6. « Coupe de France 2026-2027 : tours, dates et entrée des clubs » : sources FFF.

### 3.3 Règles de maillage et d'ancres

- **Ancres de match** : « Pronostic {home_s} - {away_s} », jamais « Analyse disponible » ni « cliquez ici ». Hors cartes, varier avec « l'analyse de OM - PSG » ou « OM - PSG : stats et analyse ».
- **Chaque page match** pointe vers : hub, journée, `/fr/pronostics/` (ou `demain.html`), les 2 clubs, le derby s'il existe, 3 à 8 matchs de la même journée, 1 guide.
- **Chaque hub daté** (A, B, C) pointe vers toutes les pages match du jour ou de la période, ainsi que les hubs des compétitions présentes.
- **Hubs championnat** : journée en cours, puis matchs, clubs, stats.
- **En-tête de toutes les pages SEO** : Accueil · Pronostics du jour · Ligue 1 · Ligue des champions · Clubs · Guides.
- **Pas de lien vers une page `noindex`** depuis l'accueil (règle déjà appliquée par la vague 1 sur les cartes).

### 3.4 Données structurées : récapitulatif

| Page | Schema | Remarques |
|---|---|---|
| Accueil | Organization (+ `sameAs` plus tard), WebSite, WebPage ; FAQPage facultatif | Pas de SearchAction |
| Hubs datés et journée | CollectionPage (`dateModified`) + ItemList de SportsEvent + BreadcrumbList | SportsEvent : uniquement les champs connus |
| Hub championnat | CollectionPage + SportsOrganization + ItemList + BreadcrumbList (existe) | + FAQPage si FAQ visible |
| Match | SportsEvent + BreadcrumbList (existe) ; `image` = carte OG maison ; FAQPage facultatif identique à la FAQ | Pas de résultat enrichi à attendre : Google affiche ses propres fiches match |
| Club et derby | SportsTeam, SportsEvent, BreadcrumbList (existent) | n/a |
| Articles et guides | Article avec auteur **Person**, image ≥ 1200 px, `dateModified` ; FAQPage identique | n/a |
| Stats | WebPage + BreadcrumbList | Pas de Dataset |

### 3.5 Cadre légal et d'honnêteté en France (recherche, pas un avis juridique ; faire valider par un avocat)

1. **IASHARK n'est pas un opérateur.** Publier des analyses ne demande pas d'agrément ANJ. En revanche :
   - **Aucune mention ni lien vers un opérateur non agréé**, par exemple Pinnacle, dont les cotes alimentent `pinnacle_snapshot`. La publicité pour un site illégal est sanctionnée (loi 2010-476).
   - Parler de « cotes moyennes du marché », sans nommer d'opérateur. Aucun nom n'est affiché aujourd'hui : c'est à garder ainsi.
2. **Code de la consommation**
   - Affirmer qu'un service « augmente les chances de gagner » aux jeux d'argent est une pratique **réputée trompeuse en toutes circonstances** (liste noire de l'art. L.121-4).
   - Précédent : la DGCCRF a infligé **80 000 €** à Black Mandrill (france-pronos.com) le 27/08/2025, après signalement de l'ANJ. L'entreprise a dû retirer un « outil de performance » jugé trompeur.
   - Enquête DGCCRF : 36 % d'anomalies sur les sites de conseils contrôlés.
   - Conséquences pour IASHARK :
     - pas de taux de réussite ni de ROI sans preuve complète (méthode, période, tous les paris, pertes comprises) ;
     - pas de « gains », « rentable », « pronostic sûr », « combiné gagnant » ;
     - libellés des outils Pro à relire (P-1, H-9).
3. **Loi 2023-451 sur l'influence commerciale, art. 4**
   - Elle **interdit aux influenceurs toute promotion, directe ou indirecte, d'abonnements à des conseils ou pronostics sportifs**. IASHARK Pro en est un.
   - Donc **aucun partenariat influenceur**, payé ou en nature, pour Pro.
   - Pour les comptes de marque, **la loi ne tranche pas clairement**. **BLOCKED_DECISION**, avis juridique à demander avant tout contenu social qui pousse l'abonnement (§6).
4. **Messages de mise en garde**
   - Les arrêtés (11/07/2023 en ligne, 04/03/2026 mise à jour) visent les **opérateurs**, pas IASHARK.
   - Reprendre volontairement la formule officielle dans le pied de page `/fr/` est un signal de confiance : « Les jeux d'argent et de hasard peuvent être dangereux : pertes d'argent, conflits familiaux, addiction… Retrouvez nos conseils sur joueurs-info-service.fr (09 74 75 13 13 – appel non surtaxé) ».
   - Vérifier le texte exact sur Légifrance le jour de la mise en ligne.
5. **Mineurs** : 18+ partout (déjà en place). Pas de visuels de joueurs, pas de codes « jeunes » dans les images de partage et les réseaux.
6. **Honnêteté du contenu**
   - Chaque statistique porte son N et sa date.
   - Le niveau de probabilité est expliqué (« 75 % échoue 1 fois sur 4 »).
   - Les textes rédigés par IA sont signalés.
   - Rien n'est inventé : pas de chaîne TV, pas de compo probable, pas d'arbitre, pas d'adresse de stade sans source.
7. **Abonnement** : prix, renouvellement et résiliation en ligne clairement affichés (résiliation « en 3 clics » pour les contrats en ligne). Pas de compte à rebours ni de fausse rareté.

---

## 4. Du contenu qui gagne des liens et des citations IA

### 4.1 Articles de données, à partir des données réelles du dépôt

`data/gate-b1/<ligue>-<saison>.json` contient les **scores finaux de saisons complètes** (API-Football) pour 36 championnats, saisons 2021-2022 à 2025-2026. Exemples calculés le 19/09 à partir de ces fichiers (scores à 90 minutes ; les barrages de fin de saison sont inclus, à exclure à la publication) :

| Championnat (5 saisons, 2021-2022 → 2025-2026) | Matchs | Les deux marquent | +2,5 buts | Nuls | Victoires domicile | Buts par match |
|---|---|---|---|---|---|---|
| Bundesliga | 1 540 | 60,0 % | 61,0 % | 25,0 % | 43,8 % | 3,17 |
| Premier League | 1 900 | 55,3 % | 56,6 % | 23,9 % | 44,2 % | 2,93 |
| **Ligue 1** | 1 685 | **55,3 %** | **53,5 %** | 24,7 % | 43,4 % | 2,82 |
| Liga | 1 900 | 51,8 % | 47,4 % | 26,2 % | 45,7 % | 2,59 |
| Serie A | 1 901 | 51,4 % | 48,9 % | 27,2 % | 40,3 % | 2,61 |
| Ligue 2 | 1 764 | 48,5 % | 45,2 % | 27,7 % | 42,3 % | 2,45 |

Ligue 1 par saison (BTTS / +2,5) :

| Saison | Matchs | Les deux marquent | +2,5 buts |
|---|---|---|---|
| 2021-2022 | 382 | 55,5 % | 50,0 % |
| 2022-2023 | 380 | 58,2 % | 56,3 % |
| 2023-2024 | 308 | 54,2 % | 53,2 % |
| 2024-2025 | 308 | 57,1 % | 55,2 % |
| 2025-2026 | 307 | 50,8 % | 52,8 % |

**Articles proposés** (toujours : méthode, N, source, date ; statut REVIEW)

1. **« Les deux équipes marquent : quel championnat en tête ? 5 saisons de chiffres »**
   - Slug : `/fr/articles/btts-plus-2-5-buts-championnats-5-saisons.html`.
   - Titre : « BTTS et +2,5 buts : les 5 grands championnats sur 5 saisons » (59).
   - Phrases citables : « En Ligue 1, les deux équipes ont marqué dans 55,3 % des 1 685 matchs joués de 2021-2022 à 2025-2026. » Et : « La Bundesliga est le grand championnat où les deux équipes marquent le plus (60,0 %) ; la Serie A, celui où elles marquent le moins (51,4 %). »
   - Un graphique maison (≥ 1200 px) sert d'image d'article et de visuel pour les réseaux.
2. **« Ligue 1 2026-2027 en chiffres »** (page vivante `/fr/stats/ligue-1.html`, A12), mise à jour après chaque journée. C'est le format qui gagne le plus de liens : selon une étude Foundation Inc. (mars 2026, sites B2B, donc à prendre comme une tendance), les **pages de statistiques tenues à jour captent environ 4 fois plus de liens** que leur part de pages. Les rédacteurs citent ce qui leur facilite la citation.
3. **« À quelle minute tombent les buts en Ligue 1 ? »** (A18)
   - Il faut les minutes des buts. Aujourd'hui, `events_*.slots` ne couvre que les 20 derniers matchs de chaque équipe, un échantillon qui se chevauche.
   - Il faut donc collecter `/fixtures/events` pour une saison, soit environ 306 appels (budget API : **BLOCKED_DECISION** légère).
   - Titre : « À quelle minute tombent les buts en Ligue 1 ? Les chiffres » (58).
4. **« Le Classique en chiffres »**, mis à jour avant chaque Classique
   - Uniquement sur les confrontations détenues par l'API (« depuis {année}, N matchs »).
   - Wikipédia et DAZN donnent un bilan historique complet (108 confrontations, 51 victoires du PSG, 34 de l'OM, 23 nuls) : le citer **avec sa source** plutôt que le recalculer.
5. **« L'avantage du terrain en Ligue 1 : 5 saisons »** : victoires à domicile 43,4 %, à l'extérieur 31,9 %, nuls 24,7 %.
6. **Page de calibration** : **BLOCKED_DECISION**.
   - `CURRENT_ENGINE_CALIBRATION_REPORT.md` mesure le moteur actuel en rejeu hors ligne sur 6 965 matchs (Brier 1X2 de 0,204 à 0,214 selon le championnat).
   - Une page « Quand notre modèle dit 60 %, que se passe-t-il ? » serait l'actif de confiance le plus fort, pour l'E-E-A-T comme pour les citations IA.
   - **Mais** :
     - c'est un rejeu, pas un historique en direct ;
     - il n'y a pas de cotes ;
     - le rapport de l'ancien pipeline était **moins bon que le hasard**.
   - Toute publication doit être formulée en calibration, jamais en taux de réussite (§3.5), et validée par le propriétaire.

**Licence** : vérifier que les conditions d'API-Football autorisent la publication d'**agrégats** (sans doute oui) ; ne jamais republier les données brutes.

### 4.2 Ce que les moteurs IA citent pour « pronostic »

**Constaté dans cette session (moteur de recherche avec synthèse IA)**
- Sur « pronostic OM PSG 20 septembre 2026 », la synthèse a repris la date, l'heure, le classement, le pari d'Eurosport (« OM 1-2 PSG, victoire PSG ~1,50 ») et des **probabilités explicites** de Footix (« 50-52 % PSG, 25-27 % nul, 23-25 % OM »).
- Sur « Auxerre Brest », elle a cité « 49,04 % » de l'algorithme SportyTrader.
- **Les moteurs extraient les pourcentages et les phrases datées autonomes.**

**Hypothèses, à mesurer** (ChatGPT via Bing, Perplexity, Google AI Overviews ; non testé directement ici)
- **ChatGPT et Copilot** : index Bing, donc Bing Webmaster et IndexNow comptent (§6). Ils citent les médias (Eurosport, Foot Mercato, L'Équipe) et les affiliés qui écrivent une phrase-réponse (« notre pronostic : victoire du PSG »).
- **Perplexity** : privilégie les pages fraîches et structurées (tableaux, dates).
- **Google AI Overviews** : il est possible qu'elles s'affichent peu sur les requêtes de paris, un sujet sensible. Leurs sources suivent le classement organique : le SEO classique reste la base.
- Pour « meilleur site de pronostic foot », les réponses reprennent des listes comparatives (pronor.fr, completesports) : **IASHARK n'y figure pas**.

**Conséquences pratiques**
1. Sans chiffre public, IASHARK ne sera **jamais** cité sur « qui va gagner OM - PSG ». Les leviers compatibles avec le paywall :
   - probabilités **implicites du marché** (pas le produit IASHARK, décision D2) ;
   - faits chiffrés (« le PSG n'a gagné qu'1 de ses 4 derniers matchs de Ligue 1 ») ;
   - option 1X2 publique (D3).
2. Les pages de stats et les articles de données donnent des **phrases citables** (§4.1), avec N, date et source dans la même phrase.
3. Écrire chaque bloc pour qu'il tienne seul (40 à 60 mots, la réponse d'abord) : « Le match en bref », « L'avis IASHARK », encadré « En bref » de la méthodologie.
4. **Présence tierce** : les moteurs citent davantage les tiers que le site lui-même. Comptent donc les mentions dans les forums et médias FR (§6) et une présence correcte dans les listes comparatives. Ne **pas** acheter de place dans ces listes.
5. **Suivi** : 20 requêtes FR (§8), 3 passages par moteur et par mois, noter le taux de citation (« cité 1/3 »). Une seule réponse est une anecdote, pas une mesure.

### 4.3 Lisibilité par les agents (A17)

- **`/llms.txt`** (FR et EN) : ce qu'est IASHARK (analyses statistiques, pas un opérateur, 18+), liens vers la méthodologie, les hubs, les pronostics du jour, la page stats et les tarifs.
- **`/tarifs.md`** : offre gratuite (1 analyse par jour, compte gratuit) et Pro (prix lu dans `config/markets.json`, sans engagement, résiliation en ligne). **Ne jamais recopier un prix en dur** : le générer au build.
- **Méthodologie** : encadré « En bref » de 50 mots.

  > IASHARK estime la probabilité de chaque issue d'un match de football avec un modèle statistique (buts attendus, loi de Poisson ajustée, simulation), puis la compare aux cotes moyennes du marché, marge retirée. Chaque analyse indique la fiabilité de ses données. Ce sont des estimations, pas des garanties. 18+.

  Vérifier ce texte contre `MODEL_ARCHITECTURE.md` avant publication.
- **`robots.txt`** autorise déjà les robots IA : ne rien bloquer. Bloquer éventuellement CCBot (entraînement seul), au choix du propriétaire.

---

## 5. Plan d'action classé

### 5.1 L'arbitrage central : contenu public contre paywall

**Le constat**
- L'intention « pronostic X - Y » attend un **avis**. Les affiliés le donnent gratuitement (ils vivent des bonus opérateurs) ; IASHARK vit de l'abonnement.
- Tant que la page match ne montre ni avis ni chiffre :
  - elle ne satisfera qu'une partie de l'intention ;
  - Google la classera derrière les pages qui répondent ;
  - les moteurs IA ne la citeront pas.
- À l'inverse, publier le pari **détruit** le produit.

**Ce qui ne coûte rien au produit** : les faits publics (forme, buts, absences, face-à-face, tranches de 15 min historiques). Ce sont des commodités que tout le monde publie. Les montrer entièrement rend la page utile et indexable (A4).

**Options pour l'avis**

| Option | Ce qui devient public | Gain SEO et IA | Coût pour Pro | Recommandation |
|---|---|---|---|---|
| O1 (aujourd'hui, étendu) | `prob_band` (3 niveaux), fiabilité des données, statut « analyse prête », liste de ce que contient Pro | Faible à moyen : une information réelle et un appel à l'action clair | Nul | **Oui, maintenant (A5)** |
| O2 | Probabilités **implicites des cotes moyennes** (1 / cote, normalisées, calcul simple, affiché « ce que dit le marché, pas le modèle IASHARK ») | Moyen : répond à « qui est favori ? », citable par l'IA, unique face aux sites sans chiffres | Faible : ce n'est pas le produit. Mais cela revient sur la décision du 19/09 (vue visiteur : en-tête et un seul panneau) et frôle `market_consensus_*` (méthode de Shin, premium) | **BLOCKED_DECISION D2.** Je recommande oui, avec la méthode proportionnelle et le libellé explicite |
| O3 | **Probabilités 1X2 du modèle** ; le marché retenu, l'écart, les scores, les buteurs et le scénario restent Pro | Élevé : l'IA peut citer « le modèle IASHARK donne 62 % au PSG », répond à l'intention | Moyen : quand le marché retenu est un 1X2 ou une double chance, il devient **en partie devinable** | **BLOCKED_DECISION D3.** À tester sur un sous-ensemble (Ligue 1 seulement, 4 à 6 semaines), mesuré par le CTR Search Console et les inscriptions |
| O4 | **L'analyse complète, rendue publique après le coup d'envoi** (« Ce que disait le modèle ») | Moyen : contenu unique indexable, historique transparent, confiance | Quasi nul : une analyse d'avant-match ne vaut plus rien après le coup d'envoi (pas d'analyse en direct) | **BLOCKED_DECISION D4.** Seulement si **tous** les matchs sont publiés, sans tri (sinon pratique trompeuse, §3.5) |

### 5.2 Spécification du « teaser public » (O1, et O2 si décidé)

Bloc HTML **statique**, placé juste sous le H1 de chaque page match, identique pour Googlebot et le visiteur, sur mobile comme sur ordinateur :

```
L'AVIS IASHARK                                   Analyse prête · mise à jour le 19/09 à 14:00
Niveau de probabilité du marché retenu : ●○○ Modérée (moins de 65 %)
   → le marché lui-même et son pourcentage sont réservés à l'analyse complète.
Fiabilité des données : Élevée (70/100)
[si D2] Ce que dit le marché (cotes moyennes au 19/09, 14:00, marge retirée) :
   OM 13 % · Nul 18 % · PSG 69 %  (calcul simple à partir des cotes, pas le modèle IASHARK)
L'analyse complète contient : le marché retenu et sa probabilité · les scores les plus probables
   · le buteur le plus probable · le scénario par tranche de 15 minutes · nos probabilités face aux cotes
[ Voir l'analyse complète : 19,95 €/mois, sans engagement ]   ← prix via {pro_price}
Aujourd'hui, l'analyse offerte est {match offert} (compte gratuit) →
Une probabilité n'est pas une certitude : 65 % échoue encore 1 fois sur 3. 18+ · Joueurs Info Service 09 74 75 13 13
```

**Règles**
- Jamais le marché retenu, jamais la probabilité du modèle, jamais les scores, jamais les buteurs, jamais `conf`.
- Le badge reprend les seuils publics du code : « élevée » ≥ 75 %, « bonne » ≥ 65 %, « modérée » < 65 %.
- Le bloc « marché » n'apparaît que si D2 est accepté. Il affiche l'heure du relevé et ne nomme aucun opérateur.
- Un test ajouté à `tests/premium-leak-real-files.test.js` vérifie que le bloc ne contient aucune clé de `lib/premium-fields.js`.
- `match-page.js` (vue visiteur) reprend **le même bloc**, pour que le rendu JavaScript ne contredise pas le HTML statique.

**Fichiers** : `scripts/seo-pages.js` (nouveau `teaserHtml`, appelé par `matchSummaryHtml`), `i18n/seo/fr.json#match.teaser_*` (libellés FR), `match-page.js` (vue visiteur), tests.

### 5.3 Les 20 actions classées

Effort : **S** = 1 jour ou moins, **M** = 2 à 4 jours, **L** = 1 semaine ou plus. Tout le HTML est généré : on change les générateurs, jamais `fr/*.html` à la main. À livrer **après** la vague 1, puis reconstruire côté lead.

| Rang | Action | Impact | Effort | Dépend de / bloqué |
|---|---|---|---|---|
| 1 | **A1** Gabarits FR des pages match : titre « Pronostic X - Y (compétition, jj/mm) », H1, description, alias PSG et OM, noms FR (M-1 à M-4) | Élevé | S | Vague 1 (titre conservé au rendu, `match.h1`, mécanisme des noms) |
| 2 | **A2** Noms FR des compétitions partout (L-1) | Élevé | S | n/a |
| 3 | **A4** Faits publics complets en HTML statique + FAQ (M-5, M-7) | Élevé | M | Générateur GB A6 (une seule implémentation) |
| 4 | **A5** Teaser public « L'avis IASHARK » (O1) (§5.2) | Élevé | M | D2 pour la partie « marché » |
| 5 | **A6** `/fr/pronostics/` (aujourd'hui et ce soir), `demain.html`, `week-end.html` (§3.2 A à C) | Élevé | M | n/a |
| 6 | **A3** Pages match 7 à 10 jours avant (Ligue 1, clubs français en Europe, 10 grandes affiches par semaine) (M-11) | Élevé | L | **BLOCKED_DECISION D1** (périmètre, budget API) ; générateur US A6 |
| 7 | **A7** Pages journée de Ligue 1 (§3.2 D), puis Ligue des champions avant le 13/10 | Élevé | M | Champ `round` (vague 1) |
| 8 | **A8** Accueil : H1, titre IA, résumé « du jour + demain + à l'affiche », navigation (H-1 à H-6) | Moyen à élevé | S | Mécanisme d'H1 par version (GB A4) |
| 9 | **A9** Hubs : bloc journée, stats de saison, FAQ, saison « 2026-2027 », prochaine date et classement de la Ligue des champions, ancres, H3 par jour (L-2 à L-9) | Moyen à élevé | M | n/a |
| 10 | **A10** Classique et derbies en mode semaine de match, 301 J+30 vers le derby, journées FR, pluriels, ancres (C-2 à C-5, M-12) | Moyen à élevé | S à M | n/a |
| 11 | **A13** Passe conformité : libellés de l'accueil et de Pro, mise en garde officielle en pied de page, aucune mention d'opérateur non agréé (H-9, P-1, §3.5) | Élevé (risque) | S | Revue juridique |
| 12 | **A12** `/fr/stats/ligue-1.html` + article « BTTS et +2,5 : 5 championnats, 5 saisons » (§4.1) | Moyen à élevé (liens, IA) | M | Licence API (agrégats) |
| 13 | **A11** 12 clubs, 4 derbies, stats de saison des clubs (C-1, C-6, C-7) | Moyen | M | Intros sourcées (REVIEW) |
| 14 | **A14** Images OG 1200×630 générées (match, hub, journée, accueil), `summary_large_image`, `max-image-preview:large` partout (M-10, H-6) | Moyen | S à M | Aucun blason ni photo de joueur |
| 15 | **A15** Éditorial : cibles distinctes blog/articles, auteur Person et page auteur, typographie FR des guides, exemple d'analyse en statique, méthodologie IASHARK et « En bref » (A-1 à A-4, P-3, P-4) | Moyen | S à M | Choix de l'auteur (propriétaire) |
| 16 | **A16** Performance : logo, `defer`, polices, découpage du dictionnaire, réservation de hauteur (H-10, M-13) | Faible à moyen | S à M | Mesure PSI ou CrUX d'abord |
| 17 | **A17** `llms.txt`, `tarifs.md` générés, blocs-réponses (§4.3) | Faible à moyen | S | n/a |
| 18 | **A18** Article « À quelle minute tombent les buts en Ligue 1 » (collecte des événements d'une saison) | Moyen | M | Budget API (léger) |
| 19 | **A19** Ligue 2 et Coupe de France | Élevé (demande FR, concurrence moindre) | L | **BLOCKED_DECISION D5** |
| 20 | **A20** Options O3 (1X2 public), O4 (analyses publiques après match), page de calibration | Élevé | S une fois décidé | **BLOCKED_DECISION D3, D4, D6** |

### 5.4 Ordre de livraison (pendant la trêve)

- **Semaine 1** (21 → 27/09) : A1, A2, A8, A13, partie texte d'A10, début d'A14.
- **Semaine 2** (28/09 → 04/10) : A4, A5 (O1), A6, A9.
- **Semaine 3** (05 → 11/10) :
  - A7 (Ligue 1), et la journée 2 de la Ligue des champions avant le 13/10 ;
  - A3 si D1 est accepté (au moins pour les matchs de Ligue 1 de la reprise et les clubs français en Europe) ;
  - A12.
- **Ensuite** : A11, A15, A16, A17, A18. Les décisions D1 à D6 se prennent en parallèle.
- **Après chaque mise en ligne** : Search Console → inspection d'URL → demande d'indexation pour `/fr/pronostics/`, `demain.html`, `week-end.html`, la page journée, `/fr/stats/ligue-1.html` et le hub Ligue des champions. Le quota est limité : les hubs d'abord.

---

## 6. Hors site, pour le propriétaire

### 6.1 Google Search Console (cette semaine)

- **Propriété Domaine** (enregistrement TXT DNS). La vérification actuelle passe par une balise meta, sans doute en préfixe d'URL.
- **Propriétés préfixe** : `https://iashark.com/fr/`, **`https://iashark.com/match/`** (les pages match FR sont hors de `/fr/`) et `https://iashark.com/blog/`.
- Soumettre `https://iashark.com/sitemap.xml`, puis les nouveaux sitemaps.
- **Rapports**
  - Performance, filtre Pays = France. Filtres de requêtes enregistrés : regex `pronostic|prono`, `ligue 1`, `ligue des champions`, `om|psg|classique`, `ia`, `btts|deux équipes`.
  - Comparer Belgique, Suisse, Canada, et un segment Afrique francophone (Sénégal, Côte d'Ivoire, Cameroun…).
  - Pages : « Explorée, actuellement non indexée » sur `/match/`. Si ce compteur reste élevé, A3 devient prioritaire.
  - Mesurer la part des pages match indexées **avant** le coup d'envoi.
- **Ne pas utiliser l'Indexing API de Google** pour les matchs : elle est réservée aux offres d'emploi et aux diffusions en direct.

### 6.2 Bing Webmaster Tools et IndexNow

- « Importer depuis Google Search Console » : vérifie le site et importe les sitemaps.
- Bing alimente Copilot, la recherche de ChatGPT, DuckDuckGo, et en partie Qwant et Ecosia.
- **IndexNow** : très utile pour des pages match de courte durée de vie.
  - Fichier clé à la racine, ajouté à `scripts/build-public.js#PUBLIC_ROOT_FILES`.
  - Ping des URL créées ou modifiées à chaque passage du pipeline.
  - Google ne l'utilise pas ; Bing et Yandex, oui.

### 6.3 Liens entrants (le vrai goulot d'un domaine jeune)

- **Articles de données (§4.1)** à proposer, chiffres et graphique à l'appui, aux médias et blogs foot qui aiment l'analyse. Par exemple *Les Cahiers du football*, les rubriques data des médias sportifs et les newsletters foot. Présenter une info (« la Bundesliga, championnat où les deux équipes marquent le plus »), pas un produit.
- **Sites de supporters** (OM, PSG, OL, RC Lens, LOSC…) : proposer une **carte stats intégrable** (image et lien) pour leurs avant-matchs, comme « Le Classique en 5 chiffres ». Gratuit, sans contrepartie.
- **Page stats Ligue 1** : c'est l'infrastructure de citation (§4.1). La tenir à jour chaque journée.
- **À éviter**
  - liens payants, réseaux de blogs (PBN), échanges de liens « pronostic », signatures de forum et commentaires. Le secteur des paris est une cible fréquente d'actions manuelles ;
  - tout lien d'**affiliation opérateur** : cela ferait basculer IASHARK dans le régime des communications commerciales ANJ.

### 6.4 Communautés françaises (lire chaque règlement, jamais de spam)

- **Reddit** (r/Ligue1, subreddits de clubs)
  - Je n'ai pas pu lire les règles : Reddit bloque l'outil. **Lire la barre latérale de chaque subreddit avant de publier.**
  - Règle générale : pas d'autopromotion ni de vente de pronostics.
  - Participer en personne, déclarer le lien avec IASHARK, partager des **données** (graphique BTTS, Classique en chiffres) plutôt que des liens.
- **Forum Pronosoft** : plus de 150 000 membres selon des sources tierces. Charte à lire : pas de publicité sauvage, opérateurs non agréés interdits.
- **Autres forums** : forum.parieur-sportif.com, forum « Paris sportifs » de jeuxvideo.com. Mêmes règles : membre actif, données, déclaration de lien, pas de lien en signature.
- **X / Twitter foot FR** : compte de marque publiant une carte data par grande affiche, sans pari, sans cote et sans appel à s'abonner (voir 6.5).

### 6.5 TikTok et Instagram en français

- **Aucun influenceur rémunéré** (en argent ou en nature) ne doit promouvoir l'abonnement : c'est **interdit** par la loi 2023-451, art. 4.
- **Comptes de marque** : zone grise juridique (**BLOCKED_DECISION D7**, avis d'avocat). D'ici là :
  - contenu **éditorial et data** : « Le Classique en 3 chiffres », « Pourquoi 65 % échoue 1 fois sur 3 », « Quel championnat marque le plus ? » ;
  - pas de pari, pas de cote, pas de nom d'opérateur, pas de « abonne-toi pour les pronos » ;
  - mention 18+ à l'écran.
- **Règles des plateformes** : TikTok interdit la promotion des jeux d'argent et restreint les contenus de « conseils pour améliorer ses paris » (règles communautaires, rubrique « activités commerciales réglementées » : relire la version en vigueur).
  - Viser le format « comprendre le foot par les stats », pas des « pronos ».
  - Sur Instagram, limiter l'audience aux 18 ans et plus si l'option existe.
- **Visuels**
  - Pas de photos de joueurs (droit à l'image) ni de blasons (marques). Pas de codes « jeunes ».
  - Textes et couleurs IASHARK, comme les cartes OG d'A14 : une seule production pour les deux usages.
- **Suivi** : lien en bio vers `/fr/` ou `/fr/pronostics/` avec UTM (`utm_source=tiktok&utm_medium=social&utm_campaign=fr_data`). Publication le soir, aux heures de Ligue 1. Reprise en YouTube Shorts (peu coûteuse ; les descriptions sont lues par les moteurs IA).

---

## 7. Décisions du propriétaire (BLOCKED_DECISION)

| # | Question | Pourquoi | Options |
|---|---|---|---|
| D1 | Publier les pages match 7 à 10 jours avant ? Sur quel périmètre et avec quel budget API ? | Le plus gros levier pour les requêtes de match (M-11) | Ligue 1 + clubs français en Europe (recommandé), puis grandes affiches étrangères |
| D2 | Afficher publiquement les probabilités implicites des cotes moyennes (O2) ? | Répond à « qui est favori », citable par l'IA ; revient sur la décision « vue visiteur » du 19/09 | Oui, calcul simple et libellé « le marché, pas le modèle » (recommandé) / non |
| D3 | 1X2 du modèle en public (O3) ? | Plus grand gain SEO et IA ; rend le pari en partie devinable | Test sur la Ligue 1 pendant 4 à 6 semaines / non |
| D4 | Analyses publiques après le coup d'envoi (O4) ? | Contenu unique, transparence | Oui, sur 100 % des matchs, sans tri / non |
| D5 | Ligue 2 et Coupe de France ? | Forte demande en France ; données Ligue 2 disponibles sur 5 saisons ; modèle Ligue 2 **INCONCLUSIVE** (`config/league-expansion.json`) ; Coupe de France absente de toute config | (a) couverture complète avec la note de fiabilité, (b) **pages « calendrier, classement et stats » sans sortie du modèle** (titre sans « pronostic », pour rester honnête), (c) attendre |
| D6 | Page de calibration publique ? | Actif de confiance le plus fort ; rejeu hors ligne seulement ; l'ancien pipeline était moins bon que le hasard | Publier en calibration, avec toutes les limites / attendre un historique en direct |
| D7 | Comptes sociaux de marque : peuvent-ils mentionner l'abonnement Pro ? | Loi 2023-451, art. 4, portée incertaine | Avis juridique |
| D8 | Titre de l'accueil avec « IA » (H-2) ? | Vise K10, le cluster le plus accessible ; exige d'expliquer ce que recouvre « IA » | « Pronostic foot IA : probabilités de chaque match » / garder le titre actuel |
| D9 | Dépôt GitHub public | Les PR sortent sur la requête de marque ; code du moteur et historique exposés | Passer en privé (vérifier le coût des minutes Actions du pipeline) / garder public mais faire le ménage |
| D10 | Auteur nommé (Person) pour les articles | E-E-A-T | Le propriétaire, un rédacteur, ou « Rédaction IASHARK » avec une page transparente |

---

## 8. Mesure

- **Point de départ, cette semaine**
  - impressions et clics France sur `pronostic|prono` ;
  - nombre de pages `/match/` indexées et part indexée **avant** le coup d'envoi ;
  - pages `/fr/` indexées par type ;
  - visites et inscriptions France (tunnel admin).
- **Points d'étape à 2, 4, 8 et 12 semaines.** Un domaine jeune bouge d'abord en impressions, puis en positions, puis en clics. Juger A1 et A4 à 4 semaines sur les matchs ordinaires de Ligue 1 (K4) ; juger K1 et K2 à 6 mois ou plus.
- **Indicateurs avancés**
  - positions sur « pronostic {match ordinaire de Ligue 1} » ;
  - CTR des pages match après A1 ;
  - impressions sur « pronostic ligue 1 {N}e journée » et « pronostic foot ia » ;
  - liens entrants gagnés par l'article de données ;
  - taux de citation IA, mesuré chaque mois : 20 requêtes × 3 passages × ChatGPT, Perplexity, Google.
- **Les 20 requêtes IA à suivre** :
  - pronostic OM PSG ; pronostic Ligue 1 ce week-end ; pronostic foot IA ; meilleur site pronostic foot ;
  - statistiques BTTS Ligue 1 ; quel championnat a le plus de buts ; pronostic Ligue des champions ; pronostic Lyon Rennes ;
  - OM PSG historique ; derby du Nord pronostic ; probabilité match foot calcul ; loi de Poisson foot ;
  - value bet définition ; les deux équipes marquent définition ; pronostic foot aujourd'hui ; pronostic foot demain ;
  - pronostic Ligue 2 ; Coupe de France pronostic ; buts par match Ligue 1 ; site pronostic foot fiable.

---

## Sources (consultées le 19/09/2026)

**SERP et pages concurrentes**
- [RueDesJoueurs, pronostic foot](https://www.ruedesjoueurs.com/pronostics/foot.html), [RueDesJoueurs, pronostic OM PSG](https://www.ruedesjoueurs.com/pronostic/psg-om-4830646.html), [RueDesJoueurs, Ligue 1](https://www.ruedesjoueurs.com/pronostics/ligue-1-937873.html)
- [Eurosport, Marseille - PSG](https://www.eurosport.fr/paris-sportifs/pronostics/marseille-psg-pronostics-conseils-et-cotes-ligue-1/), [Footix, OM - PSG](https://www.footix.fr/pronostic-olympique-de-marseille-vs-paris-saint-germain-20-09-2026), [Unibet, OM - PSG](https://www.unibet.fr/paris-sportifs/ligue1-om-psg), [Afrik-foot](https://www.afrik-foot.com/pronostic-marseille-vs-psg-20-09-2026), [Topmercato](https://www.topmercato.com/2142219-pronostic-marseille-vs-psg-20-09-2026)
- [Flashscore, Ligue 1 5e journée](https://www.flashscore.fr/actualites/football-ligue-1-ligue-1-pronostics-meilleurs-paris-et-cotes-5e-journee/44uXzx9b/), [PronoFootIA, Ligue 1 ce week-end](https://pronofootia.fr/pronostic-ligue-1-ce-week-end-%E2%9A%BD/), [Pronosoft, concours Ligue 1](https://www.pronosoft.com/fr/concours/scores-ligue-1/pronostics/), [Pronosoft, concours Ligue des champions](https://www.pronosoft.com/fr/concours/ligue-des-champions/pronostics/)
- [SportyTrader, Le Mans - Lorient](https://www.sportytrader.com/pronostics/le-mans-lorient-373618/), [Mediapronos, Le Mans - Lorient](https://mediapronos.com/pronostic-le-mans-lorient-19-09/), [footballtunisien.com, Le Mans - Lorient (IA)](https://footballtunisien.com/2026/09/le-mans-fc-fc-lorient-19-09-2026-pronostic-ia/), [Pensebet, Auxerre - Brest](https://pensebet.com/pronostic-auxerre-brest-ligue-1-20-09-2026/)
- [Forebet, BTTS aujourd'hui](https://www.forebet.com/fr/pronostics-pour-aujourd-hui/chaque-equipe-marque), [BetMines, BTTS](https://betmines.com/football-predictions-today/btts), [FootyStats, Ligue 1](https://footystats.org/fr/france/ligue-1), [Foot Mercato, stats par équipe](https://www.footmercato.net/france/ligue-1/statistique-equipe)
- [Predixfoot](https://predixfoot.com/), [IA FOOT](https://ia-foot.com/), [NerdyTips](https://nerdytips.com/), [Pronosoft, IA et pronostics](https://www.pronosoft.com/fr/bookmakers/conseils/pronostics-et-intelligence-artificielle.htm)
- [Wincomparator, aujourd'hui](https://www.wincomparator.com/predictions/football/today/), [SOSPronostics](https://www.sospronostics.com/pronostics/football/), [Coteur](https://www.coteur.com/pronostic-foot), [Pronor, meilleur site](https://www.pronor.fr/meilleur-site-de-pronostic-football-fiable/)

**Calendrier**
- [Footmercato, calendrier Ligue des champions](https://www.footmercato.net/europe/ligue-des-champions-uefa/calendrier/), [Topmercato, calendrier par club](https://www.topmercato.com/2133355-calendrier-ligue-des-champions-psg-programme-equipe-par-equipe/)
- [Monaco Tribune, calendrier Ligue 1 2026-2027](https://www.monaco-tribune.com/2025/12/ligue-1-un-calendrier-2026-2027-redessine-par-la-coupe-du-monde/), [LesViolets, dates 2026-2027](https://www.lesviolets.com/actu/ligue-1-20262027-calendrier-treves-barrages-les-premieres-dates-deja-connues,82933.html)
- [Wikipédia, Championnat de France 2026-2027](https://fr.wikipedia.org/wiki/Championnat_de_France_de_football_2026-2027), [Wikipédia, Coupe de France 2026-2027](https://fr.wikipedia.org/wiki/Coupe_de_France_de_football_2026-2027), [Wikipedia, 2026-27 Ligue 2](https://en.wikipedia.org/wiki/2026%E2%80%9327_Ligue_2)

**Derbies**
- [Wikipedia, Derby de la Côte d'Azur](https://en.wikipedia.org/wiki/Derby_de_la_C%C3%B4te_d%27Azur), [ligue1.com, Côte d'Azur](https://ligue1.com/en/articles/l1_article_1113-preview-monaco-and-nice-clash-in-latest-derby-de-la-cote-d-azur), [Wikipédia, OM - PSG](https://fr.wikipedia.org/wiki/Olympique_de_Marseille_-_Paris_Saint-Germain_en_football), [DAZN, le Classique en chiffres](https://www.dazn.com/fr-FR/news/football/psg-om-classique-en-quelques-chiffres/1aqcf0zh3ul5d1f5ay0t2goiqg)

**Cadre légal**
- [ANJ et DGCCRF, sites de tipsters (25/06/2024)](https://anj.fr/conseils-en-paris-sportifs-la-dgccrf-et-lanj-appellent-les-parieurs-la-prudence-face-aux-sites-de), [DGCCRF, 36 % d'anomalies](https://www.economie.gouv.fr/dgccrf/comprendre-la-dgccrf/publications-et-kits-de-communication/des-faux-bons-tuyaux-sur-les), [DGCCRF, sanction Black Mandrill (27/08/2025)](https://www.economie.gouv.fr/files/files/directions_services/dgccrf/media-document/2025-08-27-CP-DGCCRF-Conseils-en-paris-sportifs-sanction-Black-Mandrill.pdf), [Journal de l'économie, France Pronos](https://www.journaldeleconomie.fr/france-pronos-amendes-dgccrf-paris-sportifs/)
- [Loi 2023-451, art. 4 (Légifrance)](https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000047663210), [Kohen Avocats, tipsters](https://kohenavocats.fr/2026/06/14/tipsters-paris-sportifs-dgccrf-anj-influenceurs-sanctions/)
- [Arrêté du 11/07/2023, message en ligne](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047836085), [Arrêté du 04/03/2026](https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000053625948)

**Plateformes et communautés**
- [TikTok, règles sur les activités commerciales réglementées](https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities), [TikTok, politique publicitaire jeux](https://ads.tiktok.com/help/article/tiktok-ads-policy-gambling-and-games/), [Forum Pronosoft](https://www.pronosoft.com/forums/index.php), [Forum Parieur-Sportif](https://forum.parieur-sportif.com/)

**Marque et dépôt** : `https://api.github.com/repos/IASHARK/iashark` (`"private": false`) ; recherche « iashark pronostic », qui renvoie les PR GitHub.

**Données du dépôt** (lecture seule) : `data/match-pages-registry.json`, `data.json`, `match/1552773.html` et `.json`, `data/gate-b1/*.json`, `CURRENT_ENGINE_CALIBRATION_REPORT.md`, `config/leagues.json`, `config/league-expansion.json`, `config/club-hubs.json`, `config/team-display-names.json`, `i18n/seo/fr.json`, `scripts/seo-pages.js`, `scripts/build-locales.js`, `lib/premium-fields.js`, `lib/public-data-split.js`, `reports/seo-night-2026-09-19.md`.
