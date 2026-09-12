# IAshark V2 — plan directeur produit, moteur et lancement

**Date :** 2026-08-30  
**Statut :** stratégie proposée à valider avant implémentation.  
**Principe :** reconstruire le produit dans un nouveau dépôt, sans reprendre automatiquement l’ancienne interface ou l’ancienne architecture.

## 1. Décision stratégique

IAshark V2 est une **plateforme d’intelligence footballistique explicable**. Elle transforme des données sportives et des cotes en une lecture simple :

> Quelle est la décision la plus cohérente sur ce match, pourquoi, à quel niveau de confiance, et quels risques peuvent l’invalider ?

IAshark ne promet jamais un gain. Le produit doit pouvoir conclure qu’aucun marché n’est suffisamment fiable ou correctement coté.

## 2. Cœur du produit

L’expérience centrale est une page de match unique comprenant :

1. contexte et fraîcheur des données ;
2. décision IAshark principale ;
3. probabilité interne et cote juste ;
4. cote observée, bookmaker et horodatage ;
5. facteurs favorables ;
6. facteurs contradictoires et données manquantes ;
7. marchés alternatifs classés ;
8. version du modèle et historique de la décision ;
9. mise à jour « compositions confirmées » avant le match ;
10. résultat final après le match, sans suppression des erreurs.

Le dashboard n’est qu’un moyen rapide d’atteindre cette page : matchs du jour, recherche, filtres, favoris et état des analyses.

## 3. Périmètre de lancement

### Marchés modélisés au MVP

- 1N2 ;
- double chance ;
- Draw No Bet ;
- Over/Under 1,5, 2,5 et 3,5 buts ;
- BTTS ;
- totaux d’équipe après calibration.

### Modules différés

- handicaps asiatiques multi-lignes ;
- corners ;
- cartons ;
- buteurs et tirs joueurs ;
- combinés corrélés ;
- live betting.

L’interface peut afficher d’autres cotes disponibles, mais IAshark ne les recommande pas tant qu’un modèle spécialisé n’est pas validé.

## 4. Moteur d’analyse

### MVP

- modèle de scores Poisson hiérarchique par championnat ;
- correction Dixon–Coles pour les faibles scores ;
- pondération temporelle des matchs ;
- forces offensives/défensives domicile et extérieur ;
- force des adversaires ;
- repos et congestion ;
- avantage domicile par compétition ;
- calibration temporelle par marché et compétition.

Le moteur produit une distribution complète des scores. Tous les marchés du MVP sont dérivés de cette distribution pour rester mathématiquement cohérents.

### Décision marché

- convertir les cotes en probabilités implicites ;
- retirer approximativement la marge du bookmaker ;
- comparer la probabilité IAshark à la probabilité du marché ;
- appliquer un seuil minimal supérieur à l’incertitude du modèle ;
- refuser une décision si les données, la calibration ou le prix sont insuffisants.

### IA générative

Le modèle de langage ne calcule aucune probabilité. Il reçoit un objet structuré avec résultats, preuves, risques et données manquantes, puis rédige l’explication dans la langue choisie. Chaque phrase factuelle doit être traçable vers une donnée stockée.

## 5. Module buteur

Le module buteur ne doit pas retarder le lancement. Sa version sérieuse nécessite :

- probabilité de titularisation ;
- distribution des minutes attendues ;
- rôle et position ;
- statut de tireur de penalty ;
- taux de buts et de tirs régularisés ;
- force offensive de l’équipe et adversaire ;
- composition confirmée ;
- validation spécifique par championnat.

Il sera lancé uniquement sur les compétitions dont les statistiques joueurs et compositions sont suffisamment complètes. Il ne sera jamais extrapolé automatiquement à toutes les ligues.

## 6. Pipeline de données

1. récupérer et historiser fixtures, équipes, joueurs, compétitions et couverture ;
2. importer plusieurs saisons historiques pour entraîner le moteur ;
3. reconstruire uniquement des variables disponibles avant chaque match ;
4. capturer quotidiennement statistiques, blessures et cotes ;
5. capturer plusieurs snapshots de cotes jusqu’à la clôture ;
6. capturer les compositions dès confirmation ;
7. calculer une analyse Preview puis une analyse Confirmed XI ;
8. enregistrer features, probabilités, modèle, timestamp et décision ;
9. résoudre le résultat après match ;
10. recalculer calibration, dérive et performances sans réécrire l’historique.

API-Sports est la source primaire au lancement. La couverture doit être mesurée empiriquement par compétition et type de donnée. Le quota du compte était épuisé lors du contrôle du 2026-08-30 ; la clé est valide mais les audits réels doivent reprendre après remise à zéro.

## 7. Architecture SaaS

### Stack proposée

- Next.js avec TypeScript pour le nouveau frontend et le rendu serveur ;
- Supabase Auth + Postgres + RLS ;
- jobs serveur/planifiés pour ingestion et calculs ;
- Stripe Checkout, Customer Portal et webhooks ;
- stockage privé des snapshots et artefacts de modèle ;
- environnements local, staging et production ;
- CI avec tests, migrations et vérifications SEO.

Toutes les clés API restent côté serveur. Le navigateur ne contacte jamais directement API-Sports avec une clé secrète.

### Zones

- publique et indexable : accueil, pages compétitions, pages match éligibles, méthodologie, historique, guides ;
- connectée et non indexable : dashboard, analyses complètes, favoris, alertes, compte, facturation ;
- administration : couverture, jobs, modèles, anomalies, contenus et support.

## 8. Internationalisation

### Lancement

- produit et acquisition d’abord en français ;
- architecture prête dès le départ pour français, anglais et espagnol ;
- ouverture EN/ES après validation du produit français.

### Règles

- routes distinctes `/fr`, `/en`, `/es` ;
- slugs et métadonnées localisés ;
- `hreflang`, canonical et sitemaps par langue ;
- nombres, dates, fuseaux horaires et cotes localisés ;
- dictionnaire d’interface versionné ;
- explications générées depuis les mêmes données structurées ;
- relecture humaine des pages commerciales, légales et SEO importantes.

## 9. SEO

Le SEO ne doit pas produire une page vide pour chaque fixture. Une page match est indexable uniquement lorsqu’elle offre une vraie valeur : données suffisamment complètes, analyse originale, risques, fraîcheur, résultat et historique.

Piliers :

- pages compétitions durables ;
- pages match utiles avant et après la rencontre ;
- méthodologie et historique public ;
- guides répondant à une intention réelle ;
- maillage compétition → match → analyse → méthodologie ;
- performance, accessibilité et rendu serveur ;
- aucun texte massif généré seulement pour manipuler le référencement.

## 10. Modèle économique

### Positionnement prix à tester

- Gratuit : découverte, analyses limitées et aperçu des preuves ;
- Pro : **12,99 € TTC/mois** comme hypothèse initiale à tester ;
- annuel uniquement après mesure de la rétention.

Le plan Pro peut inclure : analyses complètes, marchés alternatifs, mises à jour Confirmed XI, favoris, alertes, historique personnel et comparaisons de prix.

Pas d’affiliation bookmaker au lancement. Elle brouillerait la promesse d’indépendance et augmenterait les risques réglementaires et réputationnels.

### Cœur de cible

Parieur rationnel débutant/intermédiaire qui consulte plusieurs sources, manque de temps et veut comprendre le raisonnement plutôt que copier un ticket.

### Acquisition

1. analyses partageables et réseaux sociaux ;
2. pages match et contenus SEO réellement utiles ;
3. transparence des résultats ;
4. partenariats avec créateurs football analytiques ;
5. publicité payante seulement après preuve de conversion et rétention.

## 11. Conformité et confiance

- présenter le produit comme information et aide à la compréhension ;
- aucune promesse de gain, méthode infaillible ou enrichissement ;
- avertissement clair sur l’incertitude et le jeu responsable ;
- contrôle d’âge et contenu non destiné aux mineurs ;
- consentement analytics conforme ;
- minimisation des données personnelles ;
- historique public non retouché ;
- politique claire sur l’usage de l’IA et les sources de données ;
- validation juridique avant campagnes ou affiliation liées aux paris.

## 12. Ordre d’exécution

### Phase 0 — verrouillage produit

- valider ce plan ;
- choisir le nom final et une nouvelle direction visuelle ;
- définir le périmètre exact des compétitions et marchés ;
- définir les critères de validation du moteur.

### Phase 1 — preuve de données

- attendre le renouvellement du quota API-Sports ;
- auditer la couverture réelle sur les compétitions ciblées ;
- importer un historique multi-saisons ;
- démarrer l’historisation systématique des cotes.

### Phase 2 — moteur hors ligne

- entraîner Dixon–Coles ;
- backtester en découpage temporel ;
- calibrer ;
- comparer aux baselines et au marché ;
- publier un rapport reproductible.

### Phase 3 — prototype produit

- créer trois directions visuelles réellement différentes ;
- valider une page match desktop et mobile ;
- construire le design system ;
- valider le parcours gratuit et Pro.

### Phase 4 — fondation SaaS

- nouveau dépôt ;
- Next.js, Supabase, schéma, RLS et CI ;
- ingestion et API interne ;
- authentification et droits ;
- dashboard et page match.

### Phase 5 — monétisation et contenu

- Stripe ;
- limites de plans ;
- SEO français contrôlé ;
- analytics et observabilité ;
- bêta privée.

### Phase 6 — lancement

- correction des incidents de bêta ;
- publication française ;
- mesure activation, conversion, rétention et confiance ;
- EN/ES seulement après validation de la boucle française.

## 13. Définition de « opérationnel »

Le produit n’est pas considéré terminé parce que les pages s’affichent. Il est opérationnel lorsque :

- les données sont fraîches, traçables et couvertes ;
- chaque probabilité est reproductible ;
- les modèles sont backtestés et calibrés ;
- le système sait s’abstenir ;
- les droits Free/Pro sont appliqués côté serveur ;
- paiement, annulation et webhooks sont testés ;
- aucune clé n’est exposée ;
- FR fonctionne intégralement et EN/ES sont structurellement prêts ;
- SEO, accessibilité et performance passent les contrôles ;
- erreurs et dérives sont monitorées ;
- les résultats passés restent visibles.

## 14. Rapports sources

- [Étude de marché et plan d’affaires](research/market-business/iashark-market-business-plan-2026.md)
- [Architecture du moteur](research/engine/iashark-engine-concrete-design.md)
- [Architecture SaaS, SEO et internationalisation](research/platform/iashark-v2-saas-platform-architecture.md)
- [Recherche initiale sur le moteur](research/iashark-football-analysis-engine-architecture.md)

