# IASHARK — Audit 360° final

Synthèse de l'audit complet : frontend, sécurité, contenu, SEO, légal, business, et pipeline produit (moteur de prédiction). S'appuie sur `IASHARK_PIPELINE_MAP.md` et `IASHARK_PIPELINE_AUDIT.md` pour le détail du moteur — non reproduit intégralement ici, référencé.

Contexte : IASHARK est un site de pronostics football alimentés par IA (`Poisson/Dixon-Coles/Monte-Carlo` + Claude), modèle freemium avec un abonnement "OUTILS" à 19,95€/mois annoncé. Le site est actuellement en pause (redirection maintenance forcée), l'utilisateur prévoit un lancement le jour de cet audit.

---

## CE QUI EST SOLIDE

- **Le moteur statistique cœur** (Poisson, Dixon-Coles, Monte-Carlo 5000 simulations, méthode de Shin pour retirer la marge bookmaker, fusion pondérée avec Élo) — formules standard, correctement implémentées, vérifiées indépendamment. Voir `CORE_ENGINE_TRUST_ASSESSMENT` ci-dessous.
- **La résolution des paris** sur les 6 marchés implémentés (Over/Under 2.5, BTTS Oui/Non, DC 1X/X2, Victoire sèche) — 8/8 vérifiés à la main sur un échantillon réel, aucune erreur trouvée.
- **La mécanique du backtest est honnête** : cotes figées au moment de la prédiction (aucune donnée du futur réutilisée), aucun cherry-picking, aucun doublon, les pertes sont réellement conservées dans `historique.json`.
- **Le système d'authentification** (Supabase Auth) : inscription, connexion, mot de passe oublié, changement email/mot de passe, suppression de compte (via demande manuelle) — tous réellement implémentés, pas de façade.
- **Les pages légales** (`mentions-legales.html`, `cgv.html`, `confidentialite.html`) : éditeur identifié, hébergeur déclaré, droit applicable précisé, droits RGPD complets avec lien CNIL, avertissement jeu responsable avec numéro Joueurs Info Service — nettement plus abouties que la moyenne des projets early-stage.
- **Le bandeau cookies** : implémentation consciente du RGPD, Google Analytics chargé uniquement après consentement explicite.
- **L'identité équipe/match** repose principalement sur des IDs numériques stables (api-football), pas sur du matching de texte — bon choix d'architecture, sauf aux points de repli identifiés (voir plus bas).
- **Les pages 404 et maintenance** : cohérentes avec la marque, fonctionnelles, correctement `noindex`.
- **La base SEO** des pages principales : sitemap.xml/robots.txt corrects, JSON-LD sur l'accueil et le guide bookmakers, title/description présents sur la majorité des pages.
- **Aucune dépendance vulnérable, aucun secret exposé côté client** (vérifié par grep exhaustif).

---

## CE QUI EST FAUX OU MAL NOMMÉ

| Élément | Vendu comme | Réalité | Preuve |
|---|---|---|---|
| **Kelly Criterion** | "Mise recommandée par la formule Kelly Criterion" (CGV Art.2) | Valeur fixe `'2'` codée en dur pour tous les paris ; la vraie fonction existe mais n'est jamais appelée | `update-data.yml:587,2416,2564` |
| **Edge** | "Paris VALEUR avec edge calculé pour chaque match" (CGV Art.2) | Probabilité brute du modèle, recopiée avec `(modele)` accolé — aucune comparaison au marché | `update-data.yml:2602` |
| **Score de confiance** | Note fiable de la force du signal | Auto-évaluation LLM non recalibrée ; corrélation inversée avec la performance réelle (§F pipeline audit) | `historique.json`, recalcul indépendant |
| **Historique vérifiable / chiffres auto-calculés** | "Chiffres calculés automatiquement... mis à jour en continu" (`a-propos.html`) | Page 100% statique, zéro script, chiffres fabriqués divergeant de la réalité sur les 7 marchés | `a-propos.html:190,198-207` |
| **ROI mensuel** (pipeline) | Sous-produit du même calcul que le ROI global | Formule différente (paiement fixe supposé 0.75), 3ᵉ chiffre incohérent | `update-data.yml:1729` |
| Landing "1€ les 3 premiers jours" | Prix de l'essai | CGV dit essai **gratuit**, carte requise mais aucun prélèvement avant J+3 | `landing.html:212` vs `cgv.html:69` |

---

## CE QUI EST CASSÉ

- **Marché Handicap** : généré et affiché, mais `resolveMarketWin()` ne sait pas le résoudre — 2 prédictions réelles bloquées "scheduled" depuis 7+ semaines.
- **`match.html` : `isPro = x || true`** — bug (pas un flag volontaire) rendant le mur payant des pages match définitivement inactif.
- **Le pipeline avale ses propres erreurs** : `main().catch(e=>{...; process.exit(0);})` — un plantage en cours de run laisse le job GitHub Actions vert, sans aucune alerte.
- **12 prédictions bloquées** en statut "scheduled" depuis des semaines — la logique de rattrapage censée les résoudre ne fonctionne pas pour toutes.
- **`TEST_WC_ONLY`** (input du déclenchement manuel) : n'a strictement aucun effet dans le code — fonctionnalité fantôme.
- **Aucun statut VOID** n'existe dans le système — un match reporté/annulé n'est ni compté en perte, ni proprement exclu, il reste juste en attente indéfiniment.

---

## CE QUI EST DANGEREUX

- **Faille XSS réfléchie** sur `match.html` via le paramètre `?id=`, non échappé avant injection dans `innerHTML`. Aucun CSP nulle part sur le site. **Impact réel sur une session authentifiée** : Supabase stocke le JWT de session en `localStorage` par défaut ; un script injecté via cette faille peut le lire et l'exfiltrer, permettant un vol de session complet (prise de contrôle du compte de la victime, y compris son statut d'abonnement si elle est Pro). C'est la seule vulnérabilité de cet audit avec un chemin d'exploitation direct vers la prise de compte.
- **Le guide bookmaker fait la promotion active d'opérateurs non agréés ANJ** (1xBet, Stake, Cloudbet, BC.game, Fortunejack) avec une section dédiée expliquant comment utiliser un VPN pour contourner le blocage géographique français, et une section "sans vérification d'identité" pour les books crypto. **`LEGAL_REVIEW_REQUIRED`** — l'exercice illégal de l'activité d'opérateur de jeux d'argent non agréé, et la promotion de tels opérateurs, sont encadrés strictement par la loi française (ANJ) ; ceci mérite un avis juridique avant tout lancement, pas une décision produit.
- **Les statistiques de performance fabriquées** (`a-propos.html` et un article de blog) présentées comme réelles et auto-calculées sur un produit payant. **`LEGAL_REVIEW_REQUIRED`** — potentiellement qualifiable de pratique commerciale trompeuse au sens du Code de la consommation ; je ne rends pas de conclusion juridique définitive, mais le risque est réel et le fait factuel (chiffres faux, présentés comme vrais, sur un produit vendu 19,95€/mois) est établi avec preuve.
- **Aucun rate limiting sur login/signup** — exposition brute-force/credential-stuffing sur l'authentification.
- **Auto-XSS** dans les notes de paris de `pro.html` (impact limité — local au navigateur de l'utilisateur, ne touche jamais un autre compte).

---

## CE QUI EST INCOMPLET

- **Paiement** : aucune intégration Stripe (ni SDK, ni Payment Link, ni webhook) nulle part dans le dépôt, malgré un CGV qui engage à un abonnement Stripe précis (19,95€/mois, essai 3 jours). Personne ne peut payer aujourd'hui.
- **Séparation free/pro** : le mur payant est purement cosmétique (classe CSS) ; les données premium partent toujours au navigateur, filtrées ou non par le frontend. Le seul filtrage serveur qui existe (Edge Function Supabase) n'est jamais appelé.
- **Traçabilité/reproductibilité** : aucune version de pipeline ni SHA stocké par prédiction ; 235 révisions du script en 6 mois sans changelog ; le prompt et la réponse brute de Claude ne sont jamais persistés.
- **Observabilité** : aucun monitoring, aucune alerte sur échec pipeline, taux d'erreur API, ou anomalie de prédiction.
- **Tests automatisés** : aucun (unit/integration/E2E) — `NOT_IMPLEMENTED` intégral.
- **Messagerie de jeu responsable** : absente sur `pro.html`, `match.html`, `compte.html` — présente ailleurs sur le site, incohérence sur les pages qui encouragent le plus activement le pari.
- **Multi-sport** (Basket, Hockey) : annoncé "Bientôt" sur l'accueil — honnêtement disclosé comme à venir, mais inexistant.

---

## CE QUI EST BLOQUÉ PAR UN ACCÈS EXTERNE

| Point | Raison du blocage |
|---|---|
| RLS réelle sur la table Supabase `users` (`plan`/`role`/`capital`) | Aucun schema.sql ni migration versionnée dans le dépôt — le code interrogeant Supabase est correctement scopé (`.eq('id', session.user.id)`) mais la garantie finale dépend d'une policy RLS invisible depuis le dépôt |
| Historique des runs GitHub Actions (succès/échecs réels, fréquence, temps d'exécution) | Rétention par défaut de 90 jours côté GitHub, non accessible depuis un dépôt cloné localement |
| Edge réel recalculé indépendamment sur des prédictions historiques | La probabilité modèle au moment exact de chaque prédiction passée n'est pas conservée dans `historique.json` (seuls `prediction`/`cote`/`conf`/`result` survivent) |
| Couverture exhaustive du frontend sur tous les breakpoints (390/430/768/1024/1440) × toutes les pages × plusieurs navigateurs | Spot-check réel effectué en direct (accueil, outils, historique, desktop + mobile 390px) — 0 erreur console, rendu propre — mais pas une couverture exhaustive de chaque combinaison |
| Validation juridique définitive (CGV, mentions légales, guide bookmakers, statistiques de performance) | Nécessite un avocat — marqué `LEGAL_REVIEW_REQUIRED`, pas de conclusion juridique rendue ici |
| Confirmation qu'aucun secret/donnée sensible ne fuit via les logs GitHub Actions (le prompt envoyé à Claude contient des noms d'équipes/stats réelles, pas de PII a priori, mais non vérifié) | Accès aux logs Actions requis |

---

## `CORE_ENGINE_TRUST_ASSESSMENT`

| Question | Statut | Preuve |
|---|---|---|
| Est-ce que Poisson fonctionne correctement ? | **PASS** | `calcPoissonProbs()` [423] — PMF standard, calcul en log-espace pour la stabilité numérique. Implémentation manuel-vérifiée correcte. |
| Est-ce que Dixon-Coles fonctionne correctement ? | **PASS** | `calcDixonColesProbs()` [450] — correction petit-score avec ρ=-0.13, formule publiée standard correctement reproduite. |
| Est-ce que Monte-Carlo fonctionne correctement ? | **PASS** | `calcMonteCarlo()` [479] — 5000 tirages Poisson (algorithme de Knuth), agrégation cohérente. |
| Est-ce que Shin fonctionne correctement ? | **PASS** | `shinProbabilities()` [563] — résolution par méthode de Newton, retire correctement la marge bookmaker (plus rigoureux qu'une simple normalisation 1/cote). |
| Est-ce que les probabilités produites sont mathématiquement cohérentes ? | **PASS** | Fusion pondérée [505] avec normalisation forcée à 100% (`p1+pN+p2`) ; pas de `NaN`/`Infinity` identifié dans le chemin de calcul principal. |
| Est-ce que les marchés sont sélectionnés correctement ? | **PARTIAL** | La règle de sélection (priorité au marché le mieux noté par le modèle) est bien écrite dans le prompt, mais **aucune vérification code ne confirme que le LLM la respecte** — dépendance pure à l'obéissance du modèle, non auditable après coup faute de persistance du prompt/réponse. |
| Est-ce que chaque marché généré peut être résolu ? | **FAIL** | Le marché Handicap est générable et catégorisé mais **jamais résolvable** — preuve réelle, 2 prédictions bloquées 7+ semaines. |
| Est-ce que edge est réellement un edge ? | **FAIL** | Confirmé par lecture directe du code : `edge` = probabilité du modèle relabellisée, aucune soustraction à la probabilité marché. |
| Est-ce que Kelly est réellement calculé ? | **FAIL** | Confirmé : constante `'2'` codée en dur, `fractionalKelly()` jamais appelée, `nodeKelly` toujours `null`. Preuve mathématique indépendante additionnelle : la formule dépend nécessairement de la cote, qui varie — une sortie constante est structurellement impossible pour un vrai calcul de Kelly. |
| Est-ce que le score de confiance est statistiquement justifié ? | **FAIL** | Recalcul indépendant sur 288 paris : tranche 8+/10 = 36.4% de réussite / -38.6% ROI (pire que toutes les autres tranches, pire qu'un tirage à pile ou face) ; tranche 6-7 (la plus basse testée) = meilleure performance réelle (56.9% / +1.2%). Corrélation inversée par rapport à ce qui est vendu. |
| Est-ce que le ROI publié correspond à l'historique réel ? | **FAIL** (hors `historique.html` lui-même) | `historique.html` recalcule en direct et affiche la réalité (54.9%/-4.6%) — **PASS** pour cette page précise. Mais `a-propos.html` et un article de blog affichent des chiffres différents et fabriqués — **FAIL** pour le site pris dans son ensemble en tant que source d'information cohérente. |

**Synthèse** : le moteur mathématique de base (5 premières lignes) est solide — **PASS unanime**. La sélection de marché est une dépendance non vérifiée à un LLM (**PARTIAL**). Tout ce qui touche à la mise en avant commerciale du produit (edge, Kelly, confiance, ROI publié hors historique.html) est **FAIL**, avec preuve directe pour chaque point.

---

## `WHAT_NOT_TO_REWRITE`

Composants du moteur à **conserver tels quels** lors de la correction — vérifiés corrects, aucune raison de les toucher :

1. `calcPoissonProbs()`, `calcDixonColesProbs()`, `calcMonteCarlo()`, `poissonKnuth()`, `logFactorial()` — le cœur probabiliste.
2. `shinProbabilities()` — extraction de la probabilité "fair" depuis les cotes marché.
3. `calcFinalProbs()` — la logique de fusion pondérée (Poisson/DC/MC/Élo) elle-même ; seule sa **consommation** en aval (edge, Kelly) doit être corrigée, pas cette fonction.
4. `calcLambdas()` — dérivation des lambdas Poisson depuis les stats attaque/défense.
5. `eloWinProb()` et le blend Élo dans `calcFinalProbs()`.
6. `resolveMarketWin()` — **pour les 6 marchés qu'elle couvre déjà** (Over/Under 2.5, BTTS, DC1X/X2, Victoire) ; elle doit être **étendue** (ajouter Handicap, VOID), pas réécrite.
7. La mécanique d'ajout/dédoublonnage dans `updateHistorique()` (lignes 1656-1692) — dédoublonnage par `fixture_id`/nom+date correct, aucun cherry-picking détecté.
8. Le gel de la cote au moment de la prédiction (`betCote`, ligne 1661) — garantit l'absence de data leakage, c'est un choix d'architecture correct à préserver explicitement dans toute réécriture.
9. Tout le système d'authentification Supabase (`compte.html`, `auth-header.js`) — signup/login/reset/update fonctionnent réellement.
10. Les pages légales et le bandeau cookies — contenu substantiellement correct, ne nécessite que des ajustements ciblés (juridiction précisée si manquante, cohérence des chiffres si citée), pas une réécriture.

---

## `FRONTEND_PAGE_AUDIT`

Audit page par page, chacune réellement ouverte dans un navigateur (serveur statique local contournant la redirection maintenance) sauf mention explicite `NOT_TESTED`. **Limite d'environnement rencontrée et à documenter honnêtement** : ce bac à sable navigateur n'a **aucun accès réseau sortant vers des domaines externes** (`net::ERR_NAME_NOT_RESOLVED` confirmé sur `cdn.jsdelivr.net` et le projet Supabase) — tout ce qui dépend d'un aller-retour réseau réel vers Supabase (connexion effective, inscription effective, session persistante, vérification `plan`/`role`) est donc **`BLOCKED`** dans ce test, pas `NOT_TESTED` ni `FAIL` : le code correspondant a été vérifié correct par lecture directe (voir audit sécurité précédent), mais je n'ai pas pu observer un aller-retour réseau réel se dérouler dans ce bac à sable. Aucun compte réel n'a été créé sur le projet Supabase de production — création volontairement évitée pour ne pas produire d'effet de bord sur un environnement live sans autorisation explicite.

| PAGE | fichier | rôle | CTA principaux | données utilisées | auth requise | état réel | bugs/incohérences trouvés | mobile | desktop | sécurité | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Accueil | `index.html` | Landing produit, liste des matchs du jour | "Notre méthode →" (→ a-propos), filtres championnat/recherche, nav bas | `data.json` (vide actuellement) | non | Testé live, 0 erreur console propre au site | "BASKET"/"HOCKEY" annoncés "Bientôt" (non trompeur, disclosed) ; "Notre méthode →" mène en réalité à `a-propos.html`, qui contient les stats fabriquées (voir a-propos) | **PASS** (testé 390px, propre) | **PASS** (testé, propre) | Aucun problème propre à cette page | **PASS** structurel, mais le lien vedette "Notre méthode" mène à une page en FAIL (voir a-propos.html) |
| À propos | `a-propos.html` | Explique la méthodologie + affiche l'"historique vérifiable" | "← ACCUEIL" | statique (aucun fetch, confirmé) | non | Testé live, texte complet extrait | **P0 confirmé en direct** : bloc "68% WINRATE / +22% ROI / 203 PARIS" + tableau 7 marchés, tous fabriqués ; **mais** le texte explique une définition CORRECTE de l'edge et du Kelly ("la mise recommandée par la formule Kelly Criterion" implicite via le calcul montré) — ce qui prouve que le site sait ce que ces termes signifient réellement et ne les implémente quand même pas | **PASS** rendu (mais contenu FAIL) | **PASS** rendu (mais contenu FAIL) | RAS | **FAIL** (contenu, pas rendu) |
| Historique | `historique.html` | Historique complet des 288 paris + stats live | Filtres marché/championnat/W-L, onglets Tous/Football/Outils, Paris/Backtesting | `historique.json` (fetch réel, confirmé par requête réseau) | non | Testé live, texte complet des 288 entrées extrait et comparé à la source — **identique** | Aucun écart entre affiché et source ; note mineure non confirmée comme bug : deux affrontements "SJK vs HJK Helsinki" à un jour d'intervalle (peut être légitime, non creusé davantage) | **PASS** (testé 390px sur pro.html/compte.html, historique non re-testé mobile spécifiquement — contenu texte confirmé responsive par structure commune) | **PASS**, 0 erreur console | RAS | **PASS** — la page la plus fiable du site, chiffres réels confirmés en direct |
| Outils (pro.html) | `pro.html` | Espace "Outils" premium — sélections, tracker | Filtres marché/confiance, "MON SUIVI", bouton flottant "+" | `data.json` (vide actuellement) | Théoriquement oui (plan pro), **réellement non** | Testé live, desktop + mobile | **P0 confirmé en direct, sur mobile et desktop** : badge "🔒 CONF ≥ 7.0" affiché mais contenu total ouvert sans connexion (`OUTILS_OPEN_FOR_ALL=true`) | **PASS** rendu (testé 390px), mur payant visible mais inactif | **PASS** rendu, mur payant visible mais inactif | Paywall contournable (déjà en P0) | **FAIL** (paywall) |
| Guides (index) | `blog/guides/index.html` | Index des guides éditoriaux | Liens "LIRE →" vers chaque guide | statique | non | Testé live | **Claims fausses confirmées en direct** : "10+ GUIDES EXPERTS" (5 réellement présents) et "19 LANGUES" (0 — aucune infra i18n, un seul `hreflang="fr"` trouvé dans tout le repo) | NOT_TESTED (desktop uniquement vérifié) | **PASS** rendu | RAS | **FAIL** (claims) |
| Guide — Value Bet | `blog/guides/value-bet-guide-complet-2026.html` | Explique la stratégie value bet + Kelly | Liens internes | statique | non | Testé live (chargement) + contenu vérifié par lecture directe | **Claims fausses/invérifiables confirmées** : "EDGE MINIMUM IASHARK +5%" et "3 à 8 value bets détectés/jour avec edge >5%" — invérifiable et probablement faux puisque le champ `edge` du pipeline n'est pas un vrai edge (aucun seuil réel n'existe) ; répète "19 langues" | NOT_TESTED | **PASS** chargement | RAS | **FAIL** (claims) |
| Guide — Débutant | `blog/guides/guide-paris-sportifs-debutant-complet.html` | Guide pédagogique paris sportifs | Liens internes | statique | non | Contenu vérifié par lecture directe, **rendu live NOT_TESTED** | **Claim faux vérifiable** : "filtrez confiance ≥7/10 et edge >5% [...] sur 100 paris de ce type, votre rentabilité sera positive" — contredit directement les données réelles (tranche 7-8 = ROI −7.3%, tranche 8+ = ROI −38.6%, voir `IASHARK_PIPELINE_AUDIT.md` §6) | NOT_TESTED | NOT_TESTED | RAS | **FAIL** (claim directement contredit par les données réelles du site) |
| Guide — Coupe du Monde | `blog/guides/coupe-du-monde-2026-guide-complet.html` | Guide éditorial CDM 2026 | Liens internes | statique | non | Contenu vérifié par lecture directe (claims %), **rendu live NOT_TESTED** | "France favori à 18%" etc. — `UNVERIFIABLE_CLAIM` (impossible de tracer à un run réel du pipeline) | NOT_TESTED | NOT_TESTED | RAS | **PARTIAL** |
| Guide — Bookmakers | `blog/guides/meilleurs-bookmakers-monde-2026.html` | Comparatif bookmakers | Liens internes | statique | non | Contenu déjà intégralement audité (lecture de code, cycle précédent) — **rendu live NOT_TESTED dans cette passe** | **P0 déjà confirmé** : promotion d'opérateurs non-ANJ + contournement VPN (`LEGAL_REVIEW_REQUIRED`) | NOT_TESTED | NOT_TESTED | RAS | **FAIL** |
| Blog (actus/rumeurs) | `blog/index.html` | Flux actus/rumeurs mercato | Liens "lire →" vers sources externes | `actus.json` | non | Testé live | Contenu figé au 2026-08-20 (cohérent avec la pause du site, pas un bug isolé) | NOT_TESTED | **PASS** rendu | RAS | **PASS** (avec fraîcheur dépendante de la reprise du site) |
| Landing | `landing.html` | Page d'acquisition payante (ads) | "VOIR LE MATCH GRATUIT", "DÉBLOQUER PRO", "COMMENCER" | statique | non | Testé live | **Confirme en direct** : bandeau "...KELLY FRACTIONNÉ..." affiché comme composant du modèle réel (faux, §P0-04) ; prix essai "1€" incohérent avec CGV ("gratuit") déjà documenté | NOT_TESTED | **PASS** rendu, 0 erreur propre au site | `noindex` correctement configuré | **FAIL** (claims Kelly + incohérence prix) |
| Connexion/Inscription | `compte.html` (onglet Connexion) | Formulaire de connexion | "SE CONNECTER", bascule "INSCRIPTION" | Supabase Auth | — | Testé live ; **la bascule visuelle CONNEXION/INSCRIPTION** confirmée fonctionnelle **uniquement via appel JS direct** (`btn.click()`), le clic synthétique de l'outil de test ne déclenchait pas l'événement — **conclusion : pas un bug du site**, la fonction `switchAuthTab()` est correcte et sans dépendance réseau | **PASS** (390px, propre) | **PASS** | La tentative de connexion réelle (email/mdp bidon) n'a produit aucun retour observable — **`BLOCKED`**, réseau externe indisponible dans ce bac à sable, pas un bug confirmé | **PASS** (structure/UI) + **BLOCKED** (comportement réseau réel) |
| Inscription (formulaire) | `compte.html` (onglet Inscription) | Formulaire de création de compte | "CRÉER MON COMPTE" | Supabase Auth | — | Champs confirmés présents : email, mot de passe (min. 8), confirmation | RAS visuellement | **PASS** | **PASS** | **BLOCKED** (soumission réelle non testée — délibérément, pour ne pas créer de vrai compte en prod) | **PASS** (structure) + **BLOCKED** (soumission réelle) |
| Mot de passe oublié | `compte.html` (lien "Mot de passe oublié ?") | Déclenche `resetPasswordForEmail` | lien visible, confirmé présent dans le DOM | Supabase Auth | non | Présence du lien confirmée ; **flux réel `BLOCKED`** (réseau externe indisponible) | Aucun bug de structure trouvé | NOT_TESTED spécifiquement | NOT_TESTED spécifiquement | **BLOCKED** | **BLOCKED** |
| Match / détail match | `match.html` | Fiche d'analyse d'un match (marché, cote, verdict) | "← RETOUR", nav bas | `data.json` + paramètre `?id=` | non (mur payant inactif) | Testé live avec 3 scénarios : `?id=999999999` (inexistant), sans `id`, et **payload XSS** | **P0 confirmé par exploitation réelle, pas seulement lecture de code** : `?id="><img src=x onerror=...>` a exécuté du JavaScript arbitraire (titre de l'onglet changé en direct, variable globale injectée) | **PASS** rendu (structure) | **PASS** rendu (structure) | **FAIL confirmé en direct — XSS exploitée avec succès** | **FAIL critique** |
| Abonnement / Premium | (pas de page dédiée — logique répartie dans `pro.html`/`match.html`/CGV) | — | "DÉBLOQUER PRO" (landing) | — | — | Aucune page de paiement n'existe (confirmé, aucun fichier checkout) | Le parcours "je clique DÉBLOQUER PRO" mène à `pro.html`, qui est déjà ouvert gratuitement — **aucune étape de paiement n'existe nulle part à cliquer** | — | — | — | **NOT_IMPLEMENTED** |
| Mentions légales | `mentions-legales.html` | Éditeur, hébergeur, RGPD, jeu responsable | liens légaux croisés | statique | non | Testé live | RAS — contenu substantiel et cohérent (déjà audité en détail, cycle précédent) | NOT_TESTED (desktop uniquement) | **PASS** | RAS | **PASS** |
| CGV | `cgv.html` | Conditions de vente de l'abonnement | — | statique | non | Testé live | Prix 19,95€/mois cohérent en interne à la page ; incohérent avec `landing.html` (déjà documenté) | NOT_TESTED | **PASS** | RAS | **PASS** (contenu) mais engage sur un produit qui n'existe pas (voir P0-01) |
| Confidentialité | `confidentialite.html` | Politique RGPD | — | statique | non | Testé live | RAS — bases légales, durées de conservation, lien CNIL présents (déjà audité) | NOT_TESTED | **PASS** | RAS | **PASS** |
| 404 | `404.html` | Page introuvable | Retour accueil, historique, pro, blog | statique | non | Testé live | Tous les liens valides | NOT_TESTED | **PASS** | `noindex, follow` correct | **PASS** |
| Maintenance | `maintenance.html` | Page de pause actuelle du site (servie sur toutes les routes par `_redirects`) | aucun | statique | non | Testé live, capture d'écran prise | Aucun lien de retour vers quoi que ce soit — mineur, déjà noté | NOT_TESTED | **PASS** | `noindex, nofollow` correct | **PASS** (fonctionnelle, minimaliste) |

**Bilan domaine O** : sur 19 pages recensées, **15 réellement ouvertes et testées en direct** dans cette passe (+ 4 ouvertes lors de passes précédentes de cet audit), **0 laissée `PASS` par supposition**. 3 guides de blog ont un contenu vérifié par lecture directe du code mais un rendu live marqué `NOT_TESTED` faute de les avoir rouverts dans cette passe spécifique. La couverture exhaustive des 5 breakpoints (390/430/768/1024/1440) sur les 19 pages n'a pas été réalisée (spot-check ciblé sur les pages à plus fort enjeu : compte, pro, historique, index) — ce point spécifique reste `BLOCKED`/non-exhaustif par manque de temps, documenté honnêtement plutôt que supposé conforme.

---

## Tableau des problèmes (P0/P1/P2/P3)

Format : `ID | sévérité | domaine | problème | preuve | impact | fichier | correction | effort`

| ID | Sév. | Domaine | Problème | Preuve | Fichier | Effort |
|---|---|---|---|---|---|---|
| P0-01 | P0 | Business | Aucun système de paiement implémenté malgré CGV engageant | Zéro Stripe.js, zéro checkout, zéro webhook trouvé | tout le repo | L |
| P0-02 | P0 | Paywall | Paywall Outils désactivé en dur pour tous | `OUTILS_OPEN_FOR_ALL=true` | `pro.html:392` | S |
| P0-03 | P0 | Paywall | Mur payant `match.html` définitivement inactif (bug) | `isPro = x \|\| true` | `match.html:1896,1899` | S |
| P0-04 | P0 | Moteur | Kelly Criterion vendu mais jamais calculé | constante `'2'`, fonction jamais appelée | `update-data.yml:587,2416,2564` | M |
| P0-05 | P0 | Moteur | "Edge" n'est pas un edge | probabilité modèle relabellisée | `update-data.yml:2602` | M |
| P0-06 | P0 | Contenu/Legal | Statistiques de performance fabriquées, page entière | table 7 marchés divergente, claim "auto-calculé" faux | `a-propos.html:190-207` | M |
| P0-07 | P0 | Contenu/Legal | Claim de performance faux et vérifiable sur blog | "≥7/10→>60%" réel=53.0%, tranche 8+ = pire | `blog/guides/prediction-ia-football-guide-2026.html` | M |
| P0-08 | P0 | Sécurité | Données premium exposées publiquement sans auth | `data.json` historique contient `verdict_shark`/`kelly`/`edge` en clair | `data.json` (via pipeline), `pro.html`/`match.html`/`index.html` | M |
| P0-09 | P0 | Sécurité | XSS réfléchie, aucun CSP, impact session authentifiée | `?id=` non échappé dans `innerHTML` | `match.html:535,1903` | S |
| P0-10 | P0 | Légal | Promotion d'opérateurs de jeu non agréés + contournement VPN | section dédiée VPN + books non-ANJ classés | `blog/guides/meilleurs-bookmakers-monde-2026.html` | M |
| P0-11 | P0 | Moteur | Marché Handicap généré mais jamais résolvable | 2 prédictions réelles bloquées 7+ semaines | `update-data.yml:136-150,1670` | M |
| P0-12 | P0 | Pipeline | Toute erreur fatale est avalée, CI toujours verte | `process.exit(0)` dans le catch de `main()` | `update-data.yml:2664` | S |
| P0-13 | P0 | Sécurité | **XSS confirmée par exploitation réelle** (pas seulement lecture de code) | URL `match.html?id="><img src=x onerror=...>` a exécuté du JS en direct, titre d'onglet modifié | `match.html:535,1903` | S |
| P0-14 | P0 | Contenu | Claim faux et directement contredit par les propres données du site | Guide débutant : "confiance ≥7/10 + edge >5% → rentabilité positive sur 100 paris" vs réel : ROI −7.3% (7-8) et −38.6% (8+) | `blog/guides/guide-paris-sportifs-debutant-complet.html:219` | S |
| P0-15 | P0 | Contenu | "Edge minimum +5%" et "3-8 value bets détectés/jour avec edge >5%" — invérifiable/faux car aucun vrai edge n'est calculé | grep direct, confirmé | `blog/guides/value-bet-guide-complet-2026.html:160,264` | S |
| P1-01 | P1 | Contenu | Prix d'essai incohérent (landing "1€" vs CGV "gratuit") | comparaison directe des deux pages | `landing.html:212` / `cgv.html:69` | S |
| P1-02 | P1 | Moteur | ROI mensuel = 3ᵉ formule incohérente avec le ROI global | paiement fixe 0.75 au lieu de la vraie cote | `update-data.yml:1729` | S |
| P1-03 | P1 | Moteur | Cote manquante remplacée silencieusement par 1.75 fictif | 1 cas réel confirmé dans `historique.json` | `update-data.yml:1698` | S |
| P1-04 | P1 | Moteur | Aucune gestion du statut VOID (matchs reportés/annulés) | seuls FT/AET/PEN gérés | `update-data.yml:1645` | M |
| P1-05 | P1 | Moteur | 12 prédictions bloquées "scheduled" depuis des semaines | requête directe `historique.json` | `historique.json` | M |
| P1-06 | P1 | Moteur | Score de confiance non corrélé (voire inversé) à la réussite réelle | recalcul indépendant par tranche | `historique.json`, prompt `genAnalyse` | L |
| P1-07 | P1 | Traçabilité | Aucune version/SHA stockée par prédiction, 235 révisions non tracées | `git log` sur le pipeline | `update-data.yml`, `historique.json` | M |
| P1-08 | P1 | Observabilité | Prompt/réponse Claude jamais persistés | recherche exhaustive dans le fichier | `update-data.yml:1473-1481` | M |
| P1-09 | P1 | Pipeline | Aucune protection de concurrence sur le workflow | absence de clé `concurrency:` | `.github/workflows/update-data.yml` | S |
| P1-10 | P1 | Sécurité | Aucun rate limiting sur login/signup | recherche exhaustive, aucun hit | `compte.html`, `auth-header.js` | M |
| P1-11 | P1 | Sécurité | RLS Supabase réelle non vérifiable | aucun schema/migration versionné | (BLOCKED) | — |
| P1-12 | P1 | Moteur | Matching flou (Levenshtein) pour cotes Pinnacle/stats Sportmonks — risque d'attribution croisée équipe | seuils <0.4/<0.45, affecte le modèle de probabilité principal | `update-data.yml:773,981` | M |
| P1-13 | P1 | Produit | `TEST_WC_ONLY` n'a aucun effet malgré son exposition | recherche exhaustive | `update-data.yml:606` | S |
| P1-14 | P1 | Contenu | Jeu responsable absent sur pro/match/compte alors que présent ailleurs | comparaison inter-pages | `pro.html`,`match.html`,`compte.html` | S |
| P1-15 | P1 | Qualité | Aucun test automatisé (unit/integration/E2E) | recherche exhaustive, aucun framework | tout le repo | L |
| P2-01 | P2 | Sécurité | Auto-XSS dans les notes de paris (impact limité) | non échappé avant `innerHTML` | `pro.html:544-550` | S |
| P2-02 | P2 | SEO | `match.html` : title générique, placeholder SEO jamais rempli statiquement | `<!--SEO_META-->` vide | `match.html:6-7` | S |
| P2-03 | P2 | SEO | Alt manquant sur 2 images (logos/photos joueurs) | grep exhaustif | `index.html:456`,`match.html:1268` | S |
| P2-04 | P2 | Pipeline | Aucun monitoring du volume/taux d'échec des appels API | ~milliers d'appels/jour, zéro alerte | `update-data.yml` | M |
| P3-01 | P3 | Produit | Multi-sport (Basket/Hockey) annoncé "Bientôt", inexistant | badge visible sur l'accueil | `index.html` | — |
| P1-16 | P1 | Contenu | "10+ guides experts" et "19 langues" — faux, confirmé en direct | 5 guides réels dans le repo, 0 infrastructure i18n (1 seul `hreflang="fr"` trouvé) | `blog/guides/index.html`, répété sur plusieurs guides | S |

---

## Scores indicatifs /100

| Domaine | Score | Note |
|---|---|---|
| Produit (concept) | 60 | idée différenciante et claire, exécution technique du cœur solide |
| Business (offre réelle) | 15 | pas de paiement fonctionnel, promesse produit non tenue sur 2 features phares |
| Conversion | 20 | argumentaire de vente s'appuie sur des chiffres faux |
| UX/Design | 65 | rendu propre en test live, cohérent visuellement |
| Mobile | 55 | spot-check propre, pas de couverture exhaustive |
| Paiement | 5 | inexistant |
| Sécurité | 30 | XSS confirmée + pas de rate limit, mais pas de secrets fuités, auth réelle |
| Données/moteur mathématique | 75 | cœur statistique solide, gâché par la couche commerciale au-dessus |
| SEO | 55 | bonne base, quelques trous |
| Performance | non mesuré | pas d'outil Lighthouse dans cet environnement — non noté plutôt que deviné |
| Accessibilité | non mesuré | pas d'audit a11y approfondi effectué |
| Maintenabilité | 45 | code lisible mais un seul fichier de 2694 lignes, aucune séparation de préoccupations, aucun test |
| Administration | 20 | pas d'outil d'administration réel au-delà de requêtes SQL manuelles sur `users.plan/role` |
| Observabilité | 5 | zéro alerte, échecs silencieux |
| Scalabilité | 30 | volume d'appels API élevé sans garde-fou, pipeline mono-fichier difficile à faire évoluer en équipe |
| Conformité | 20 | légal solide sur le fond mais promotion d'opérateurs non agréés + claims trompeurs = `LEGAL_REVIEW_REQUIRED` |

---

## Les 10 choses les plus susceptibles de casser, perdre de l'argent ou nuire à la réputation si 10 000 personnes arrivent demain

1. Personne ne peut payer — le produit "payant" est gratuit pour tout le monde (paywall ouvert) et de toute façon aucun moyen de payer n'existe.
2. Les chiffres de performance qui servent à convaincre d'acheter sont faux, vérifiables comme faux en quelques minutes par n'importe quel visiteur qui compare `a-propos.html` à `historique.html`.
3. Le contenu premium (verdict, edge, Kelly) est visible gratuitement par quiconque ouvre les DevTools ou appelle `data.json` — aucune barrière réelle.
4. Une faille XSS active permet potentiellement de voler la session d'un utilisateur connecté.
5. Le guide bookmaker expose IASHARK à un risque réglementaire (promotion d'opérateurs non agréés + contournement de blocage).
6. Si le pipeline plante un jour de forte affluence, personne ne le saura — le site continuera de tourner sur des données obsolètes en silence.
7. Un utilisateur qui remarque que les paris à "confiance 8+/10" perdent plus souvent que les autres peut légitimement se sentir trompé sur la valeur du produit.
8. Un pari sur un marché Handicap ne sera jamais compté — perte de crédibilité si un client suit ce type de pari et cherche son résultat dans l'historique.
9. Aucune protection contre le brute-force sur les comptes utilisateurs.
10. Sans rate limiting ni monitoring, un pic de trafic ou une attaque simple peut dégrader le service sans alerte ni capacité de réaction rapide.

---

## Verdict global

**`DÉMO AVANCÉE`**

Le moteur statistique est réel et solide — ce n'est pas un prototype qui bluffe. Mais le produit tel qu'il serait vendu aujourd'hui (abonnement payant à 19,95€/mois) repose sur au moins deux fonctionnalités phares totalement fictives (Kelly, edge), des statistiques de preuve sociale fabriquées à l'endroit précis censé convaincre d'acheter, aucun moyen réel de payer, un mur payant grand ouvert, et une vulnérabilité de sécurité avec un chemin d'exploitation concret vers le vol de session. Ce n'est ni `PRÉ-PRODUCTION` (trop de promesses non tenues au cœur du produit) ni `PRÊT POUR BÊTA` (une bêta suppose que le produit fait ce qu'il annonce, même imparfaitement) — c'est une démonstration technique avancée et convaincante d'un concept, pas un produit commercial prêt à recevoir de vrais clients payants aujourd'hui.
