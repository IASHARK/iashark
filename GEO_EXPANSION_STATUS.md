# GB/MX/ZA Expansion — Status (checkpoint 2026-09-13, updated)

Point de sauvegarde pour le chantier en cours. Tout ce qui est listé "FAIT" est **commité sur la branche `feature/gb-mx-za-geo-expansion`** (pas pushé) — donc jamais perdu même si la conversation qui a produit ce fichier disparaît. Ce fichier remplace `IASHARK_V2_EXECUTION_STATE.md` uniquement pour ce chantier précis.

## Contexte / sources

- Dossier business : `/Users/clement/Downloads/IAShark_TOUT_2026/` (docs 00, 04, 05, 06/07/08, 18).
- Doc 18 cadrait initialement sur UK seul — décision explicite du propriétaire produit : élargir à GB+MX+ZA (contradiction assumée avec doc 18).
- Repo code réel : `/Users/clement/Documents/IASHARK CLAUDE CODE/iashark`.

## FAIT (commité)

### Socle CORE
- `i18n/i18n.js` : routage marché (`/gb`→en, `/mx`→es-mx, `/za`→en), fallback localStorage pour pages sans préfixe.
- `config/markets.json` : source de vérité GEO. Tout marché non-FR marqué `DRAFT_PENDING_LEGAL_REVIEW`.
- `supabase/functions/create-checkout-session/index.ts` : accepte un `market`, résout le Price Stripe par devise. **Corrigé en cours de route** : un marché explicitement demandé mais non configuré renvoie une erreur honnête au lieu de facturer silencieusement au tarif FR.
- `i18n/dict/es-mx.json` créé, terminologie "momios" (pas "cuota") appliquée partout, y compris dans un exemple du document business Mexique lui-même qui avait l'erreur.

### i18n : branchement complet du dictionnaire existant sur les 5 pages + navigation
- `account-page.js`/`compte.html`, `player-page.js`/`joueur.html`, `tools-page.js`/`pro.html`, `match-page.js`/`match.html`, `historique.html` : **100% migrés**, 7 langues chacun. ~650 clés au total, toutes fusionnées et vérifiées (clés identiques dans les 7 fichiers dict).
- `bottom-navigation.js` (partagé par tout le site) : corrigé (affichait "Accueil/Outils/Blog/Compte" en français partout, jamais branché) + corrigé une seconde fois (routait les liens partagés de `/mx` vers `/es-mx/pro.html` qui n'existe pas → 404 réel, maintenant vers `/es/`).
- `site-prefs.js` (bandeau cookies, partagé) : corrigé (texte français partout) + corrigé un bug de timing introduit par le premier correctif (le bandeau se figeait sur le français si affiché avant la fin du chargement du dictionnaire).
- 4 vrais bugs trouvés et corrigés en tout : statut joueur mal testé, facturation au mauvais tarif, navigation en français, bandeau cookies en français.

### Moteur de prédiction
- Backtest offline sur 6965 matchs réels (2021-2025) : moteur SURCONFIANT confirmé (ex: annonce 90%+, réalité ~52%).
- **Recalibration faite, validée et déployée** (isotonic regression, ajustée sur 2021-2023, validée sur 2024-2025 jamais vu) : erreur de calibration divisée par 4 à 10 selon les marchés. 2 bugs supplémentaires trouvés et corrigés pendant la validation (agrégation de valeurs dupliquées, incohérence mathématique Over 2.5).
- Un onglet public "Test du moteur" (liste des 6965 matchs, prédiction vs résultat réel) a été construit, vérifié dans le navigateur, **puis retiré sur décision produit** (pas assez réfléchi sur la présentation du ROI négatif hérité de l'ancien pipeline) — le code/les données restent disponibles (`scripts/export-backtest-matches.js`, `backtest-matches.json`) pour une reprise future plus posée.
- Le ROI actuellement affiché sur `historique.html` (-5.2%) est **réel, vérifié indépendamment directement en base** — pas un bug. Il vient de l'ancien pipeline (winrate 55% mais sous le seuil de rentabilité vu la cote moyenne). Pas truqué, pas caché — juste plus mis en avant que la précision du nouveau moteur.

### Pages marchés — les 3 sont construites
- `/gb/` (UK) : construite, vérifiée dans le navigateur, checkout branché honnêtement (affiche "bientôt disponible" tant que le vrai prix Stripe n'existe pas).
- `/mx/` (Mexique) : construite en espagnol mexicain authentique (pas traduit depuis l'anglais), même mécanique.
- `/za/` (Afrique du Sud) : construite, PSL honnêtement indiqué comme "collecte en cours, pas encore en direct" (vrai, vérifié).
- Les 3 utilisent le même modèle (repris de GB), même discipline de placeholders (jamais de numéro d'entreprise ou de prix Stripe inventé).

### Ligues (Score Lab Factory V2)
- **VALIDÉES** : `brazil_seriea`, `ligue2` (+ `primeira`, `championship` déjà avant ce chantier).
- **INCONCLUSIVE** : `belgium_pro`, `scotland_premiership` (+ 5 autres déjà connues).
- **Prérequis débloqué, prêt pour validation finale** : `liga_mx` (pipeline complet exécuté, ~4100 appels API).
- **Bloqué** : `denmark_superliga` (même souci que Liga MX avant, prérequis jamais lancé).
- Collecte de données Afrique du Sud (PSL) : faite, 984 matchs réels (2021-2024), jamais validée scientifiquement.
- Aucune ligue ajoutée au catalogue live (`config/leagues.json`) — décision business volontairement laissée de côté.

### Clé API
- `APISPORTS_KEY` confirmée active (compte Ultra). ~11 000/75 000 requêtes utilisées au total sur la session.

## À FAIRE ENSUITE (par priorité)

1. **QA complète** : parcours signup→checkout sur les 3 marchés, mobile+desktop, avant tout merge vers `main`.
2. **Décision business** : Liga MX Phase A/B/C (validation finale scientifique) ; PSL idem une fois qu'elle aura les mêmes étapes.
3. **Décision business** : que faire de l'onglet "Test du moteur" retiré — le refaire avec une présentation plus posée ?
4. **Vague COMPLIANCE** : contenu légal/responsible-gambling par pays plus poussé (déjà esquissé, marqué DRAFT).
5. **Vague ANALYTICS** : funnel par marché sur les migrations Supabase existantes (`funnel_events` déjà utilisé par les 3 pages marché pour `landing_view`/`checkout_started`/`checkout_unavailable`).
6. Localisation des pages partagées restantes (`mentions-legales.html`, `confidentialite.html`, `cgv.html`) — volontairement françaises pour l'instant en attendant validation juridique par pays.

## Blocages externes qui ne se résolvent pas en codant

- SIREN/SIRET manquant côté entreprise → bloque Stripe live + mentions légales complètes.
- Vrais Price ID Stripe par devise (GB/MX/ZA) → à créer dans le dashboard Stripe.
- Validation juridique réelle par pays (UK/MX/ZA) → recommandée par les docs business, pas encore obtenue.
- Dossiers TikTok Gambling Information + X pre-authorization → pas encore soumis.
- Aide au jeu responsable Mexique → aucune ressource confirmée cette session, jamais inventée (placeholder honnête laissé).
