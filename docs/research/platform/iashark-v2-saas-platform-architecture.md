# IAshark V2 — architecture produit, technique, SEO et go-to-market

**Statut :** proposition de référence, sans modification du code de production  
**Date :** 30 août 2026  
**Périmètre :** produit SaaS, parcours, information architecture, responsive, SEO FR/EN/ES, traduction, Supabase/Postgres, Stripe, sécurité, observabilité, analytics, déploiement et séquence de lancement.

## 1. Résumé exécutif

IAshark V2 doit être construit comme un **assistant de décision footballistique fondé sur les données**, et non comme un site de tickets, un bookmaker ou un chatbot qui improvise des pronostics.

Sa promesse centrale :

> Comprendre un match, comparer les marchés pertinents et identifier la décision la plus cohérente avec les données — avec ses raisons, ses risques et la fraîcheur des informations.

La stratégie recommandée repose sur cinq choix structurants :

1. **Un parcours principal unique :** choisir un match → comprendre le contexte → voir la décision IAshark → inspecter les preuves et risques → enregistrer l'analyse.
2. **Des pages publiques utiles et des fonctions privées :** les pages de compétition, d'équipe et de match apportent une vraie valeur éditoriale et SEO ; le dashboard, les favoris, alertes et analyses détaillées nécessitent un compte.
3. **Une architecture multilingue native :** `/fr`, `/en`, `/es`, contenu réellement traduit, URL stable par langue, `hreflang`, aucun mélange de langues sur une même page.
4. **Un SaaS simple au lancement :** Freemium + Pro forfaitaire, Stripe Checkout et Customer Portal, sans facturation complexe à l'usage.
5. **Une plateforme vérifiable :** chaque calcul et chaque recommandation conserve ses entrées, sa version de modèle, sa date, sa provenance et son résultat futur.

Le MVP ne doit pas essayer de couvrir tous les marchés. Il doit être excellent sur les marchés liés au résultat et aux buts, puis ajouter corners, cartons et joueurs avec des modèles séparés et seulement après validation.

---

## 2. Légende épistémique

Ce rapport sépare volontairement deux niveaux :

- **Confirmé :** comportement, règle ou capacité explicitement documenté par une source officielle.
- **Recommandation IAshark :** décision de produit ou d'architecture proposée pour ce SaaS. Elle doit être validée par prototypage, tests techniques ou données utilisateurs.

Une recommandation n'est pas présentée comme un fait externe.

---

## 3. Positionnement du produit

### 3.1 Recommandation IAshark

**Catégorie :** football match intelligence / aide à l'analyse.

**Public initial :** parieurs et passionnés de football débutants à intermédiaires qui veulent comprendre une rencontre sans parcourir plusieurs sites.

**Travail à accomplir :**

> « Quand je m'intéresse à un match, aide-moi à réunir les informations importantes, à comprendre ce qu'elles impliquent et à choisir le marché le plus cohérent sans me vendre une certitude. »

**Différenciation :**

- données structurées et actualisées ;
- calculs probabilistes indépendants ;
- comparaison des probabilités avec les cotes ;
- explication humaine et traçable ;
- capacité à dire « aucune opportunité suffisamment fiable » ;
- historique public des analyses terminées.

### 3.2 Ce que le produit ne doit pas être

- Une promesse de gains.
- Un flux de « paris sûrs ».
- Un clone de scores en direct.
- Un chatbot comme interface principale.
- Une page SEO automatique pour chaque combinaison de mots-clés.
- Un moteur unique prétendant prédire avec la même qualité résultats, buteurs, corners et cartons.

### 3.3 Boucle de valeur

```text
Match pertinent
  → données fiables et horodatées
  → modèle de marché spécialisé
  → décision et niveau de confiance
  → explication + risques + cote
  → résultat du match
  → évaluation de la décision
  → amélioration/calibration du moteur
```

La vraie défense concurrentielle n'est pas seulement l'interface : c'est l'historique de snapshots pré-match, de décisions versionnées, de cotes et de résultats.

---

## 4. Parcours utilisateurs

### 4.1 Visiteur anonyme provenant de Google ou d'un réseau social

1. Arrive sur une page de match publique dans sa langue.
2. Voit immédiatement : horaire, compétition, état des données, résumé du contexte.
3. Consulte une lecture gratuite : tendances majeures, facteurs pour/contre, données actualisées.
4. Voit un aperçu de la décision IAshark, mais certains détails Pro restent verrouillés.
5. Crée un compte pour consulter davantage d'analyses ou enregistrer ce match.

**Principe :** ne pas masquer la totalité de la valeur derrière l'inscription. La page publique doit déjà satisfaire l'intention de recherche.

### 4.2 Utilisateur gratuit

1. Ouvre le dashboard « Matchs ».
2. Filtre par date, compétition, pays ou équipe.
3. Ouvre un match.
4. Consulte un nombre limité d'analyses complètes par période.
5. Enregistre des favoris et choisit ses compétitions.
6. Reçoit une invitation Pro lorsqu'une limite liée à une valeur réelle est atteinte.

### 4.3 Utilisateur Pro

1. Accède à toutes les analyses couvertes.
2. Compare décision principale, alternatives, probabilité, cote juste et cote observée.
3. Consulte les modifications entre la preview et la composition confirmée.
4. Configure favoris et alertes.
5. Retrouve l'historique de ses analyses.
6. Gère abonnement et factures depuis le portail Stripe.

### 4.4 Administrateur / analyste IAshark

1. Contrôle la fraîcheur et la couverture des flux.
2. Examine les matchs dont les données sont insuffisantes ou contradictoires.
3. Publie, suspend ou corrige une analyse sans modifier rétroactivement son historique.
4. Compare les performances par modèle, championnat et marché.
5. Suit les erreurs d'ingestion, de calcul et de paiement.

### 4.5 Parcours à exclure du MVP

- Communauté et commentaires.
- Création de tickets combinés.
- Paris directement placés chez un bookmaker.
- Marketplace de tipsters.
- Application mobile native.
- Analyse libre de n'importe quel événement saisi manuellement.

---

## 5. Architecture de l'information

### 5.1 Zone publique et indexable

```text
/{locale}
├── /matches                         Matchs du jour et calendrier utile
├── /matches/{competition}/{slug}   Page canonique d'un match
├── /competitions/{slug}            Vue compétition
├── /teams/{slug}                   Vue équipe
├── /methodology                    Méthode, limites et transparence
├── /track-record                    Historique agrégé et vérifiable
├── /pricing                         Offre et conversion
├── /about                           Mission et responsabilité éditoriale
├── /legal/*                         Confidentialité, cookies, CGU, jeu responsable
└── /insights/{slug}                 Analyses éditoriales sélectionnées
```

### 5.2 Zone authentifiée, non indexable

```text
/{locale}/app
├── /matches                         Dashboard personnalisé
├── /matches/{fixtureId}             Analyse interactive complète
├── /saved                           Favoris / analyses enregistrées
├── /alerts                          Préférences d'alertes
├── /account                         Profil, langue, sécurité
└── /billing                         État de l'offre + accès portail Stripe
```

Ces routes doivent envoyer `noindex` et ne jamais entrer dans les sitemaps.

### 5.3 Zone d'administration

```text
/admin
├── /coverage
├── /fixtures
├── /analyses
├── /models
├── /subscriptions
├── /content
└── /incidents
```

L'administration doit être séparée logiquement, protégée par un rôle d'application non modifiable par l'utilisateur, et ne pas reposer sur un simple champ de profil éditable.

---

## 6. Dashboard responsive

### 6.1 Recommandation IAshark — desktop

**Colonne latérale fixe :** logo, Matchs, Enregistrés, Alertes, Méthode, compte.

**Barre supérieure :** date, recherche, compétitions suivies, langue, état de fraîcheur des données.

**Zone principale :**

1. « Aujourd'hui » avec filtres compacts.
2. Cartes de matchs montrant seulement : équipes, heure, compétition, statut d'analyse, signal principal.
3. Panneau de détail ou page dédiée pour l'analyse.

La carte de décision doit présenter dans cet ordre :

1. décision ;
2. niveau de confiance ;
3. probabilité estimée ;
4. cote disponible et horodatage ;
5. trois raisons majeures ;
6. risques ;
7. qualité/fraîcheur des données ;
8. alternatives et marchés écartés.

### 6.2 Recommandation IAshark — mobile

- Navigation basse : Matchs, Enregistrés, Alertes, Compte.
- Date et filtres dans une barre horizontale défilable.
- Une carte de match par ligne.
- La décision principale reste visible sans défilement excessif.
- Les statistiques détaillées sont dans des sections repliables.
- Cibles tactiles conformes à une ambition **WCAG 2.2 AA**.

### 6.3 États obligatoires de l'interface

- Chargement.
- Données absentes.
- Données partielles.
- Analyse en cours.
- Analyse disponible.
- Composition non publiée.
- Analyse recalculée après composition.
- Match reporté ou annulé.
- Cotes indisponibles ou périmées.
- Aucune décision suffisamment robuste.

Afficher honnêtement ces états est une fonctionnalité produit, pas un détail technique.

### 6.4 Accessibilité confirmée

Le W3C recommande l'usage de la version actuelle **WCAG 2.2**. Ses critères sont testables et indépendants d'une technologie particulière. La V2 doit viser AA : navigation clavier, focus visible, contraste, messages d'erreur associés aux champs, alternatives textuelles, taille minimale des cibles et authentification accessible. [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/)

---

## 7. Architecture multilingue FR / EN / ES

### 7.1 Confirmé par Google

Google recommande des URL distinctes par langue plutôt qu'un contenu modifié uniquement par cookie ou réglage navigateur. Google recommande aussi d'annoter les variantes avec `hreflang`, d'éviter la redirection automatique forcée et de rendre le choix de langue accessible par des liens. Google détermine la langue principalement depuis le contenu visible ; une page doit donc utiliser une langue cohérente pour son contenu et sa navigation. [Google — sites multilingues](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)

Chaque groupe de variantes `hreflang` doit être réciproque et inclure la page elle-même. `x-default` peut servir de repli pour une page sans correspondance linguistique. [Google — variantes localisées](https://developers.google.com/search/docs/specialty/international/localized-versions)

### 7.2 Recommandation IAshark

Utiliser un domaine unique et des sous-répertoires :

```text
iashark.com/fr/...
iashark.com/en/...
iashark.com/es/...
```

Avantages recommandés : autorité concentrée sur un domaine, opérations simplifiées, correspondance claire entre routes.

La racine `/` peut présenter un sélecteur léger ou rediriger une seule fois vers une préférence enregistrée. Ne jamais forcer un utilisateur déjà présent sur `/en/...` vers `/fr/...`.

### 7.3 Modèle de contenu localisé

Séparer trois catégories :

1. **Interface :** dictionnaires versionnés (`navigation.matches`, `analysis.risk`, etc.).
2. **Entités :** noms officiels d'équipes, compétitions, stades, joueurs ; conserver l'identifiant source et éventuellement un nom localisé.
3. **Contenu analytique :** faits structurés + texte éditorial traduit.

Ne jamais traduire les probabilités ou décisions sous forme de texte libre avant le calcul. Le moteur produit un objet structuré indépendant de la langue ; chaque langue le rend ensuite avec son propre vocabulaire.

### 7.4 Workflow de traduction

```text
Source structurée et validée
  → rédaction canonique FR
  → pré-traduction assistée EN/ES
  → contrôles automatiques (variables, chiffres, équipes, cotes)
  → revue humaine des pages commerciales et stratégiques
  → publication synchronisée
  → suivi des modifications de la source
```

Règles :

- Les noms, scores, probabilités et cotes sont des variables verrouillées.
- Les traductions ont un statut : `draft`, `machine_review_needed`, `reviewed`, `published`, `stale`.
- Toute modification de la source marque les traductions concernées comme obsolètes.
- Landing, pricing, onboarding, méthodologie et pages légales exigent une revue humaine.
- Les résumés automatisés de matchs peuvent utiliser des gabarits localisés, mais seulement lorsque les données et la qualité de l'analyse dépassent le seuil de publication.

### 7.5 Stack recommandée

Next.js App Router avec segment `app/[locale]`. La documentation officielle confirme le routage par locale et l'utilisation de dictionnaires chargés côté serveur ; les Server Components évitent d'envoyer les dictionnaires complets au navigateur. [Next.js — internationalisation](https://nextjs.org/docs/app/guides/internationalization)

Bibliothèque recommandée : `next-intl` ou équivalent mature, choisie après prototype. Ce choix reste une recommandation, pas une exigence de Next.js.

---

## 8. SEO technique et programmatique

### 8.1 Principe éditorial confirmé

Google recommande un contenu créé d'abord pour les personnes, avec une finalité claire, une audience réelle et une expérience satisfaisante. La production automatisée massive ou les pages assemblées sans valeur originale sont des signaux d'une approche « search-engine first ». [Google — contenu utile](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

Google définit l'abus de contenu à grande échelle comme la création de nombreuses pages surtout pour manipuler le classement et sans valeur réelle, quel que soit le moyen de production, y compris l'IA, le scraping ou la traduction automatique. [Google — spam policies](https://developers.google.com/search/docs/essentials/spam-policies)

### 8.2 Politique de publication des pages de match

Une page de match n'est indexable que si elle passe un **quality gate** :

- match appartenant à une compétition couverte ;
- données minimales réellement disponibles ;
- contenu principal rendu côté serveur ;
- analyse originale IAshark ;
- contexte et risques spécifiques à ce match ;
- date/heure et fraîcheur visibles ;
- identité de l'éditeur et méthodologie accessibles ;
- aucun texte générique répété pour remplir la page ;
- traduction principale complète dans la langue de l'URL.

Sinon : page accessible aux utilisateurs mais `noindex, follow`, ou aucune page publique.

### 8.3 Cycle SEO d'une page de match

**Avant le match :** preview, données disponibles, état de composition, analyse horodatée.

**Après le match :** score final, résultat de la décision, courte rétrospective factuelle. Conserver l'URL : la page devient un élément de transparence et d'historique.

**Match sans analyse suffisante :** ne pas créer de faux texte ; afficher un état utile et conserver `noindex`.

### 8.4 URL, canonical et hreflang

Exemple :

```text
/fr/matches/premier-league/chelsea-fulham-2026-08-30
/en/matches/premier-league/chelsea-fulham-2026-08-30
/es/partidos/premier-league/chelsea-fulham-2026-08-30
```

- Identifiant de fixture conservé en base, même si non visible dans le slug.
- Canonical auto-référent dans chaque langue réellement traduite.
- `hreflang` entre variantes équivalentes.
- Aucun canonical de l'anglais vers le français si les pages sont de vraies traductions.
- Redirection 301 si le slug change ; l'identifiant reste stable.

Google traite redirections et `rel=canonical` comme des signaux forts, et la présence dans le sitemap comme un signal plus faible. [Google — canonicalisation](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

### 8.5 Sitemaps et crawl

Créer des sitemaps séparés :

- pages statiques ;
- compétitions ;
- équipes ;
- matchs à venir indexables ;
- archives de matchs ;
- insights.

Inclure uniquement les URL canoniques et indexables. Google limite un sitemap à 50 000 URL ou 50 Mo non compressés ; les grands ensembles doivent être découpés et peuvent être regroupés dans un index. [Google — sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

Next.js sait générer des sitemaps localisés et plusieurs sitemaps via `generateSitemaps`. [Next.js — sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)

### 8.6 Rendu et métadonnées

- SSR ou rendu statique incrémental pour les pages publiques.
- HTML principal disponible sans interaction client.
- `title`, description, Open Graph et image sociale propres à chaque page.
- `robots.txt` et sitemaps générés par l'application.
- Données structurées uniquement lorsqu'elles correspondent réellement au contenu visible.

Google peut rendre JavaScript, mais le crawl, le rendu et l'indexation restent des étapes distinctes, et l'indexation n'est jamais garantie. [Google — fonctionnement de Search](https://developers.google.com/search/docs/fundamentals/how-search-works)

La Metadata API de Next.js prend officiellement en charge métadonnées statiques/dynamiques, fichiers robots, sitemap et images Open Graph. [Next.js — metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)

### 8.7 Données structurées

Recommandation prudente :

- `Organization` sur le site et les pages institutionnelles ;
- `BreadcrumbList` sur les hiérarchies compétition/équipe/match ;
- `Article` uniquement pour de vrais contenus éditoriaux ;
- ne pas supposer que chaque match sportif est éligible à l'expérience enrichie `Event`, conçue autour de la découverte/participation aux événements ; vérifier l'éligibilité avant déploiement.

Valider avec Rich Results Test et déployer d'abord sur quelques pages. Google demande que les données structurées reflètent la page visible et recommande une validation progressive. [Google — données structurées Event](https://developers.google.com/search/docs/appearance/structured-data/event), [Google — Breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)

### 8.8 Performance

Objectifs de lancement recommandés au 75e percentile mobile :

- LCP ≤ 2,5 s ;
- INP ≤ 200 ms ;
- CLS ≤ 0,1.

Mesurer des données réelles, pas uniquement Lighthouse en laboratoire. Les Core Web Vitals servent d'indicateurs de l'expérience utilisateur ; ils ne remplacent pas la qualité globale. [web.dev — Core Web Vitals](https://web.dev/articles/vitals)

---

## 9. Authentification et autorisation Supabase

### 9.1 Confirmé

Supabase Auth est compatible avec le SSR et utilise des sessions en cookies dans ce contexte. Sa documentation recommande le flux PKCE pour le SSR. `@supabase/ssr` est recommandé, mais officiellement encore en bêta avec une API potentiellement instable. [Supabase — SSR Auth](https://supabase.com/docs/guides/auth/server-side)

Supabase indique d'utiliser un client navigateur côté navigateur et un client serveur côté serveur. La documentation actuelle recommande `getClaims()` pour protéger pages et données avec les clés asymétriques des nouveaux projets. [Supabase — client SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

Supabase avertit qu'une route authentifiée ne doit pas être mise en cache avec ISR lorsqu'un rafraîchissement de session peut inclure `Set-Cookie`, au risque de servir la session d'un utilisateur à un autre. [Supabase — SSR avancé](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

### 9.2 Recommandation IAshark

- Email + mot de passe ou magic link au lancement.
- Google OAuth en deuxième méthode pour réduire la friction.
- Vérification email avant alertes et fonctionnalités sensibles.
- Sessions SSR en cookies sécurisés.
- Routes publiques cacheables ; routes `/app` dynamiques et privées.
- `profiles` séparé de `auth.users`.
- Rôle administrateur dans `app_metadata` ou table privée, jamais dans les métadonnées modifiables par l'utilisateur.
- Protection anti-abus : rate limits sur login, reset, génération d'analyse et endpoints coûteux.

### 9.3 RLS et clés

Supabase confirme que toute table dans un schéma exposé doit avoir RLS activé et que permissions (`GRANT`) et policies sont deux contrôles différents. La clé `service_role` contourne RLS et doit rester uniquement côté serveur. [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Règles :

- Clé publishable autorisée côté client.
- Clé secrète/service role jamais exposée dans un bundle `NEXT_PUBLIC_*`.
- RLS sur toutes les tables exposées.
- Politiques par propriété réelle, par exemple `auth.uid() = user_id`.
- Vues publiques en `security_invoker` lorsque disponible.
- Schéma `private` pour secrets métiers, tables de modèles, exécutions et administration.
- Vérifier explicitement les droits Data API en plus de RLS.

---

## 10. Architecture Postgres proposée

### 10.1 Domaines de données

```text
identity
  profiles, user_preferences, favorite_teams, favorite_competitions

football
  countries, competitions, seasons, teams, players, fixtures
  fixture_events, lineups, injuries, team_statistics, player_statistics

markets
  bookmakers, market_types, odds_snapshots, odds_selections

analysis
  model_versions, analysis_runs, analysis_inputs
  market_probabilities, recommendations, recommendation_factors
  recommendation_outcomes, calibration_metrics

billing
  billing_customers, subscriptions, entitlements, webhook_events

content
  localized_pages, translations, editorial_reviews, seo_publication_state

operations
  ingestion_runs, job_failures, data_quality_incidents, audit_log
```

### 10.2 Principes de modélisation

- IDs internes stables ; IDs du fournisseur stockés avec contrainte unique par source.
- Horodatages UTC, rendu dans le fuseau de l'utilisateur.
- Données sources séparées des données dérivées.
- Append-only pour les cotes, décisions, changements de modèle et audits.
- `analysis_run` immuable : inputs, version du modèle, sortie, date de calcul.
- Une recommandation publiée ne doit jamais être réécrite rétroactivement ; publier une révision liée.
- Colonnes numériques adaptées pour probabilités et cotes, avec contraintes de domaine.
- `jsonb` seulement pour payload source/audit ou structures réellement variables, pas comme substitut à un schéma.

### 10.3 Indexation recommandée

- `fixtures(kickoff_at, competition_id, status)`.
- `fixtures(home_team_id, kickoff_at)` et équivalent extérieur selon requêtes réelles.
- `odds_snapshots(fixture_id, bookmaker_id, captured_at desc)`.
- `recommendations(fixture_id, published_at desc)`.
- `favorite_teams(user_id, team_id)` unique.
- Index partiels sur matchs à venir, subscriptions actives et jobs non terminés.
- Indexer les clés étrangères fréquemment jointes.

Valider systématiquement avec `EXPLAIN (ANALYZE, BUFFERS)` sur les requêtes critiques et `pg_stat_statements`, plutôt que d'ajouter des index par intuition.

### 10.4 Ingestion et jobs

Recommandation : un worker idempotent distinct du rendu web.

```text
Scheduler
  → synchronisation compétitions/calendriers
  → statistiques historiques
  → blessures/compositions
  → snapshots de cotes
  → calcul des features
  → analyse
  → publication conditionnelle
```

Chaque job doit avoir : clé d'idempotence, statut, tentative, durée, curseur fournisseur, réponse normalisée, erreur nettoyée et politique de retry avec backoff.

Supabase propose `pg_cron` et des Database Webhooks ; ces derniers sont des déclencheurs asynchrones fondés sur `pg_net` après `INSERT`, `UPDATE` ou `DELETE`. Ils peuvent convenir à des notifications simples, mais l'ingestion principale et les calculs longs doivent rester dans un worker observable. [Supabase — Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [Supabase — Database](https://supabase.com/docs/guides/database/overview)

---

## 11. Stripe et abonnements

### 11.1 Offre recommandée au lancement

**Free**

- exploration des matchs ;
- données et résumé publics ;
- quota limité d'analyses détaillées ;
- favoris limités.

**Pro — forfait mensuel/annuel**

- analyses détaillées couvertes ;
- probabilités, cotes justes et alternatives ;
- historique et favoris étendus ;
- alertes preview/compositions ;
- aucune publicité.

Ne pas lancer trois offres payantes sans preuve. Démarrer avec un plan Pro unique rend le positionnement, le checkout et l'analyse de conversion plus lisibles.

### 11.2 Architecture confirmée par Stripe

Stripe recommande Billing APIs pour les abonnements, associées à Checkout pour le paiement. Checkout en mode subscription prend en charge paiement initial, essais et proratisation. Stripe recommande Customer Portal pour les mises à niveau, annulations, méthodes de paiement et factures. [Stripe — design subscription](https://docs.stripe.com/billing/subscriptions/design-an-integration), [Stripe — Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)

### 11.3 Recommandation d'intégration

- Un Product Stripe par plan sélectionnable (`IAshark Pro`).
- Prices distincts pour mensuel et annuel, et éventuellement par devise.
- Checkout Session hébergée, `mode=subscription`.
- Ne pas passer `payment_method_types` : laisser les moyens de paiement dynamiques configurés dans Stripe.
- Portail client Stripe pour gérer abonnement et factures.
- Une table locale `entitlements` comme cache d'autorisation, alimentée uniquement par webhooks vérifiés.
- Ne jamais débloquer Pro sur la seule page de succès du checkout.

Événements minimaux :

- `checkout.session.completed` ;
- `customer.subscription.created/updated/deleted` ;
- `invoice.paid` ;
- `invoice.payment_failed` ;
- événements de portail utiles.

Chaque événement doit être traité de manière idempotente et archivé par `event_id` unique.

Stripe exige la vérification de signature avant traitement d'un webhook. Les clés doivent rester hors du code ; une clé restreinte avec privilèges minimaux est préférable lorsqu'elle suffit. [Stripe — webhooks](https://docs.stripe.com/webhooks), [Stripe — clés restreintes](https://docs.stripe.com/keys/restricted-api-keys)

### 11.4 TVA et fiscalité

Stripe Tax peut calculer TVA/taxes selon localisation et inscriptions actives. **Activer `automatic_tax` ne suffit pas** : Stripe ne collecte rien dans une juridiction sans inscription active et ne renvoie pas nécessairement d'erreur. Le statut fiscal et le code produit doivent être confirmés avec un professionnel ; Stripe enregistre une inscription existante mais n'effectue pas lui-même toutes les démarches fiscales. [Stripe — Tax](https://docs.stripe.com/tax), [Stripe — registrations](https://docs.stripe.com/tax/registering)

Décision à prendre avant production : IAshark est-il soumis et inscrit à la TVA française, quel code fiscal correspond précisément au SaaS, et le prix affiché aux consommateurs inclut-il la taxe.

---

## 12. Observabilité et fiabilité

### 12.1 Confirmé

OpenTelemetry est un framework vendor-neutral pour générer, collecter et exporter traces, métriques et logs ; ce n'est pas un backend de stockage/visualisation. Ses signaux incluent traces, métriques et logs. [OpenTelemetry — présentation](https://opentelemetry.io/docs/what-is-opentelemetry/), [OpenTelemetry — observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)

### 12.2 Recommandation IAshark

Instrumenter dès le MVP :

**Technique**

- disponibilité de l'application ;
- erreurs 5xx et erreurs client critiques ;
- durée des requêtes ;
- requêtes Postgres lentes ;
- jobs échoués et retard de file ;
- quotas/erreurs du fournisseur sportif ;
- latence et erreurs Stripe/Supabase ;
- Core Web Vitals réels.

**Données métier**

- fraîcheur du dernier snapshot par endpoint/compétition ;
- taux de matchs avec couverture suffisante ;
- analyses générées/publiées/refusées ;
- divergence entre versions de modèle ;
- calibration et Brier score par marché ;
- cotes manquantes ou périmées.

**SLO initiaux recommandés**

- 99,9 % de disponibilité mensuelle pour consultation ;
- 99 % des matchs prioritaires actualisés dans la fenêtre définie ;
- 100 % des webhooks Stripe vérifiés/idempotents ;
- aucune recommandation publiée sans version du modèle et provenance ;
- alerte si un flux critique dépasse son budget de fraîcheur.

Corréler chaque requête et job avec `trace_id`, sans enregistrer clés, tokens, payloads de paiement complets ou données personnelles inutiles.

---

## 13. Sécurité et conformité

### 13.1 Baseline

Utiliser OWASP ASVS 5.0 comme grille de contrôle. OWASP présente ASVS comme une base pour tester les contrôles techniques d'une application web et définir des exigences de développement sécurisé. [OWASP — ASVS](https://owasp.org/www-project-application-security-verification-standard/)

### 13.2 Contrôles recommandés

- Secrets séparés dev/staging/prod et stockés dans le gestionnaire de secrets de la plateforme.
- Jamais de clé API-Sports, Stripe ou Supabase secrète dans le navigateur.
- RLS et moindre privilège.
- CSP stricte ; protections XSS/CSRF ; cookies `Secure`, `HttpOnly`, `SameSite` adaptés.
- Validation serveur de toutes les entrées.
- Rate limiting par IP/utilisateur/action.
- Vérification de signature Stripe sur le corps brut.
- Idempotence des webhooks et jobs.
- Journal d'audit admin append-only.
- 2FA obligatoire pour administrateurs et comptes Stripe/Supabase/GitHub.
- Sauvegardes testées et procédure de restauration.
- Scan de secrets avant commit et rotation immédiate en cas d'exposition.
- Dépendances verrouillées par lockfile, analyse automatique et mises à jour contrôlées.

### 13.3 Vie privée et analytics

La CNIL confirme que certains traceurs de mesure d'audience peuvent être exemptés de consentement seulement sous conditions strictes : mesure limitée au site pour le compte exclusif de l'éditeur, statistiques anonymes, absence de suivi inter-sites et de recoupement/transmission à des tiers. Ces traitements restent soumis au RGPD. [CNIL — questions/réponses cookies](https://www.cnil.fr/fr/questions-reponses-lignes-directrices-modificatives-et-recommandation-cookies-traceurs)

Recommandation :

- choisir au lancement une analytics first-party configurée selon les critères d'exemption, si possible ;
- sinon, bloquer la collecte non essentielle jusqu'au consentement ;
- collecter le minimum ;
- séparer analytics produit identifiables et mesure d'audience publique ;
- prévoir export et suppression des données utilisateur ;
- documenter finalités, durées, sous-traitants et transferts ;
- demander un conseil juridique pour CGU, politique de confidentialité, jeu responsable et réglementation applicable aux contenus de paris.

---

## 14. Analytics produit et modèle de croissance

### 14.1 Événements produit

Taxonomie minimale :

```text
landing_viewed
match_list_viewed
match_opened
analysis_preview_viewed
analysis_unlocked
analysis_saved
market_explanation_opened
signup_started / signup_completed
checkout_started / subscription_activated
paywall_viewed
alert_created
language_changed
```

Chaque événement possède : schéma versionné, date, locale, device class, acquisition source, user/session pseudonyme si autorisé. Ne pas envoyer le texte libre des analyses ou des données sensibles par défaut.

### 14.2 Funnel principal

```text
Visite qualifiée
→ page de match utile
→ ouverture de l'analyse
→ création de compte
→ activation (2 analyses consultées ou 1 enregistrée)
→ paywall contextuel
→ Checkout
→ première valeur Pro
→ retour hebdomadaire
```

### 14.3 North-star et métriques

**North-star recommandée :** nombre hebdomadaire d'utilisateurs qui consultent au moins deux analyses qualifiées.

Métriques secondaires :

- activation J0 ;
- rétention S1/S4 ;
- conversion visiteur → compte → Pro ;
- revenu mensuel récurrent, churn, ARPU ;
- usage par compétition et langue ;
- taux de page de match sans décision ;
- calibration et performance par famille de marché ;
- satisfaction déclarée « cette analyse m'a aidé à comprendre le match ».

Le taux de réussite brut ne doit pas être l'unique KPI : il dépend des cotes et peut favoriser artificiellement des sélections très faibles. Séparer calibration, rendement théorique, closing-line value lorsque disponible et qualité de compréhension.

---

## 15. Déploiement et environnements

### 15.1 Stack recommandée

- **Frontend/backend web :** Next.js App Router + TypeScript.
- **UI :** composants accessibles et design system propre à IAshark.
- **Données/auth :** Supabase Postgres + Auth.
- **Jobs :** worker séparé et scheduler ; ne pas dépendre exclusivement des requêtes web.
- **Paiement :** Stripe Billing + Checkout + Customer Portal.
- **Observabilité :** instrumentation OpenTelemetry vers un backend choisi.
- **Hébergement :** plateforme compatible SSR/edge + worker dédié ; Vercel est un candidat naturel, mais le choix doit être comparé sur coûts de compute, cron, logs, régions et portabilité.

### 15.2 Environnements

```text
local      données de test, Stripe sandbox
preview    branche/PR, base isolée ou branche Supabase
staging    données contrôlées, intégrations sandbox, tests E2E
production secrets et données séparés, Stripe live
```

- Migrations SQL versionnées et testées avant production.
- Preview deploy par pull request.
- CI : format, lint, types, tests unitaires, intégration, E2E critiques, scan dépendances/secrets.
- Déploiement production depuis une branche protégée.
- Feature flags pour nouveaux modèles et marchés.
- Rollback application et migration compatible.
- Sauvegarde/PITR selon plan et criticité ; Supabase précise que les sauvegardes base ne couvrent pas automatiquement les objets Storage. [Supabase — Database](https://supabase.com/docs/guides/database/overview)

---

## 16. Go-to-market

### 16.1 Positionnement public

**Message recommandé :**

> IAshark transforme les données d'un match en une décision expliquée : ce qui paraît le plus cohérent, ce qui fragilise l'analyse et ce que la cote change réellement.

### 16.2 Canaux initiaux

1. **SEO utile :** pages de matchs sélectionnées, compétitions et méthodologie.
2. **Short-form vidéo :** Shanon ou créateur humain présente une idée et renvoie vers la page de match correspondante.
3. **Partage produit :** cartes d'analyse sociales horodatées, sans masquer le risque.
4. **Email/push :** uniquement pour favoris, compositions confirmées et changement important d'analyse.
5. **Partenariats plus tard :** créateurs football crédibles, sans rémunération opaque liée aux pertes des utilisateurs.

### 16.3 Lancement géographique

L'architecture est FR/EN/ES dès le départ, mais le lancement éditorial doit rester concentré :

- Phase 1 : produit français, quelques compétitions majeures, contenu FR revu.
- Phase 2 : EN sur les compétitions où couverture et support sont maîtrisés.
- Phase 3 : ES après validation du workflow de traduction et du support.

Construire l'i18n dès le départ ne signifie pas publier simultanément des milliers de pages dans trois langues.

### 16.4 Offre de lancement

- Accès gratuit utile sans carte.
- Pro mensuel et annuel.
- Pas de faux compte à rebours ni de réduction permanente.
- Cohorte beta avec feedback structuré.
- Garantie commerciale conforme aux règles locales, sans promesse de gains.

---

## 17. Séquence de lancement recommandée

### Phase 0 — décision produit (2–3 jours)

- Verrouiller promesse, cible et marchés MVP.
- Cartographier les données réellement disponibles.
- Définir les critères de publication et de « no decision ».
- Choisir une direction visuelle après plusieurs prototypes, sans coder tout le SaaS.

**Sortie :** product brief, modèle de données, wireframes, design direction, KPI.

### Phase 1 — fondation (semaine 1)

- Nouveau dépôt séparé.
- Next.js, TypeScript, design tokens.
- Routes `/fr`, `/en`, `/es` et dictionnaires.
- Supabase local/staging, migrations, Auth SSR, RLS.
- CI et secrets.
- Observabilité minimale.

**Critère :** inscription, session et pages publiques fonctionnent de bout en bout avec données de test.

### Phase 2 — cœur du produit (semaines 2–3)

- Ingestion et normalisation des fixtures.
- Dashboard responsive.
- Page match publique + analyse privée.
- Moteur initial résultats/buts.
- Provenance, versionnement, fraîcheur et « aucune décision ».
- Admin couverture/analyse.

**Critère :** un match réel passe de l'ingestion à une analyse traçable puis à son résultat.

### Phase 3 — monétisation et SEO contrôlé (semaine 4)

- Freemium/entitlements.
- Stripe Checkout, webhooks, portail.
- Sitemaps, canonical, hreflang, metadata, OG.
- Quality gate des pages programmatiques.
- Analytics produit respectueuse du consentement.

**Critère :** parcours compte → Pro → accès → annulation testé en sandbox ; petit ensemble de pages publiques validé dans Search Console.

### Phase 4 — beta privée (2 semaines)

- 25 à 50 utilisateurs ciblés.
- Mesurer compréhension, activation, rétention, bugs et confiance.
- Tester le prix et le paywall.
- Auditer calibration et données manquantes.
- Revoir les traductions des écrans principaux.

### Phase 5 — lancement public

- Production française.
- Contenu vidéo lié à des pages réellement utiles.
- Suivi quotidien qualité des données et conversion.
- EN puis ES par lots, uniquement après validation qualitative.

### Phase 6 — expansion des marchés

Ajouter une famille à la fois :

1. corners ;
2. cartons ;
3. handicaps ;
4. joueurs/buteurs.

Chaque famille exige : couverture des données, modèle dédié, backtest hors échantillon, calibration, suivi production et nouvelle présentation des risques.

---

## 18. Décisions à verrouiller avant de coder la V2

1. Compétitions couvertes au lancement.
2. Marchés MVP exacts.
3. Définition calculée de la confiance.
4. Seuil de publication et règle « aucune décision ».
5. Contenu gratuit vs Pro.
6. Prix mensuel et annuel à tester.
7. Style visuel choisi parmi plusieurs maquettes réellement différentes.
8. Niveau de revue humaine requis par type de page/langue.
9. Fournisseur d'hébergement et worker.
10. Outil analytics et régime de consentement.
11. Obligations juridiques liées au contenu de paris et aux marchés visés.

---

## 19. Verdict

La meilleure stratégie n'est ni de reproduire l'ancien IAshark, ni de construire immédiatement une plateforme couvrant tous les marchés et trois pays à grande échelle.

La V2 doit commencer comme un produit focalisé :

> une excellente page de match, une excellente décision expliquée, une traçabilité complète et une expérience mobile irréprochable.

La bonne architecture est déjà compatible avec trois langues, le SEO, les abonnements et l'expansion future, mais le contenu et les marchés sont activés progressivement selon leur qualité réelle. Cette séparation évite deux erreurs : un MVP techniquement jetable et une usine trop ambitieuse jamais terminée.

---

## 20. Sources officielles principales

### Google Search / web

- [Google Search — Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google Search — Tell Google about localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google Search — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google Search — Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [Google Search — Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search — Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search — How Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [Google Search — Event structured data](https://developers.google.com/search/docs/appearance/structured-data/event)
- [Google Search — Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [web.dev — Web Vitals](https://web.dev/articles/vitals)
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/)

### Next.js

- [Next.js — Internationalization](https://nextjs.org/docs/app/guides/internationalization)
- [Next.js — Metadata and Open Graph images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [Next.js — Sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)

### Supabase / Postgres

- [Supabase — Auth server-side rendering](https://supabase.com/docs/guides/auth/server-side)
- [Supabase — Creating an SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase — Advanced SSR guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Database overview](https://supabase.com/docs/guides/database/overview)
- [Supabase — Database Webhooks](https://supabase.com/docs/guides/database/webhooks)

### Stripe

- [Stripe — Design a subscriptions integration](https://docs.stripe.com/billing/subscriptions/design-an-integration)
- [Stripe — Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Stripe — Webhooks](https://docs.stripe.com/webhooks)
- [Stripe — Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)
- [Stripe — Tax](https://docs.stripe.com/tax)
- [Stripe — Tax registrations](https://docs.stripe.com/tax/registering)

### Sécurité, observabilité et confidentialité

- [OWASP — Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OpenTelemetry — What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/)
- [OpenTelemetry — Observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)
- [CNIL — Questions/réponses cookies et traceurs](https://www.cnil.fr/fr/questions-reponses-lignes-directrices-modificatives-et-recommandation-cookies-traceurs)
- [CNIL — Règles cookies et traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles)

