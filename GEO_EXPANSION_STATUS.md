# GB/MX/ZA Expansion — Status (checkpoint 2026-09-13)

Point de sauvegarde pour le chantier en cours. Tout ce qui est listé "FAIT" est **commité sur la branche `feature/gb-mx-za-geo-expansion`** (pas pushé) — donc jamais perdu même si la conversation qui a produit ce fichier disparaît. Ce fichier remplace `IASHARK_V2_EXECUTION_STATE.md` uniquement pour ce chantier précis (ce dernier documente une architecture antérieure, périmée).

## Contexte / sources

- Dossier business : `/Users/clement/Downloads/IAShark_TOUT_2026/` (docs 00, 04, 05, 06/07/08, 18).
- Doc 18 (cahier des charges 5 jours) cadrait initialement sur UK seul — décision explicite du propriétaire produit : élargir à GB+MX+ZA maintenant (contradiction assumée avec doc 18, voir conversation).
- Repo code réel : `/Users/clement/Documents/IASHARK CLAUDE CODE/iashark` (PAS le dossier Downloads, qui ne contient que des docs).

## FAIT (commité)

### Socle CORE
- `i18n/i18n.js` : routage marché (`/gb`→en, `/mx`→es-mx, `/za`→en), support codes de locale à tiret, fallback localStorage pour pages sans préfixe (ex: `/match/<id>.html`).
- `config/markets.json` : source de vérité GEO (devise, conformité, feature flags par pays GB/MX/ZA/FR). Tout marché non-FR marqué `DRAFT_PENDING_LEGAL_REVIEW`.
- `supabase/functions/create-checkout-session/index.ts` : accepte un `market`, résout le bon Price Stripe par devise via env vars (`STRIPE_PRICE_ID_GB/MX/ZA`), 100% rétro-compatible avec le flux FR existant.
- `i18n/dict/es-mx.json` créé (n'existait pas), terminologie des cotes corrigée ("momios" au lieu de "cuota", grammaticalement correct).

### i18n : branchement du dictionnaire existant (jamais câblé avant ce chantier)
- `account-page.js` + `compte.html` (7 locales) : **100% migré**, 142 clés `compte_page.*`.
- `player-page.js` + `joueur.html` : **100% migré**, 120 clés `player_page.*`. Bug corrigé au passage (testait le texte déjà traduit au lieu d'un code de statut — cassait l'affichage de disponibilité joueur pour tout non-francophone).
- `tools-page.js` + `pro.html` (7 locales) : **100% migré**, 164 nouvelles clés `tools_page.*` (l'ancien dictionnaire ne correspondait à aucun outil réel du fichier actuel — détecté avant de forcer un mauvais mapping).
- `match-page.js` + `match.html` : **EN COURS** (agent toujours actif au moment de ce checkpoint).

**⚠️ ACTION RESTANTE CRITIQUE** : les nouvelles clés (164 tools_page + 120 player_page + celles de match_page à venir) sont dans des fragments JSON en scratchpad (`/private/tmp/claude-501/.../scratchpad/new_keys_*.json` pour tools_page) et dans le corps des rapports d'agents pour player_page — **pas encore fusionnées dans `i18n/dict/{fr,en,es,es-mx,de,it,pt}.json`**. Tant que ce n'est pas fait, ces pages affichent le français en repli partout (pas cassé, juste pas traduit). À faire dès que match-page.js est fini, en UNE passe pour éviter les collisions.

### Backtest moteur de prédiction
- `scripts/backtest-current-engine-offline.js` + `CURRENT_ENGINE_CALIBRATION_REPORT.md` : 6965 matchs réels (5 ligues déjà en ligne, 2021-2025), 100% offline, zéro impact site.
- **Verdict** : le moteur actuel bat largement le hasard mais est **SURCONFIANT** (ex : annonce 90%+ sur Over/Under 2.5, réalité ~52%). Meilleure ligue : Premier League. Pire : Bundesliga. Ligue 1 n'est PAS meilleure que les autres (idée reçue corrigée).
- **Recommandation actée** : ne PAS reconstruire le moteur avec une IA générative (l'ancien pipeline LLM-confiance faisait pire que pile-ou-face, Brier 0.28 vs 0.20-0.21 aujourd'hui) — recalibration statistique ciblée à la place. **Pas encore fait, en attente de GO.**

### Validation scientifique des ligues (Score Lab Factory V2)
- **VALIDÉES** ✓ : `brazil_seriea`, `ligue2` (+ `primeira`, `championship` déjà validées avant ce chantier).
- **INCONCLUSIVE** : `belgium_pro`, `scotland_premiership` (+ bundesliga/eredivisie/laliga/jleague/seriea déjà connus).
- **BLOQUÉ (prérequis manquant, pas la faute des données)** : `denmark_superliga`, `liga_mx` (le pipeline LEAGUE_EXPANSION_FACTORY_V1 n'avait jamais tourné dessus).
- Bug de statut périmé corrigé dans `config/league-expansion.json` et `data/league-validation-registry.json` (disait "NOT_STARTED" partout, sourcé et corrigé pour les 5 ligues vérifiées).
- **Aucune ligue ajoutée au catalogue live** (`config/leagues.json`) — décision business volontairement laissée au propriétaire produit.

### Clé API
- `APISPORTS_KEY` confirmée active (compte Ultra, ~68 000/75 000 requêtes/jour restantes au moment du test). Débloque la collecte de données pour l'Afrique du Sud et Liga MX.

## EN COURS (agents actifs au moment de ce checkpoint)

1. `match-page.js` + `match.html` (i18n) — le plus gros fichier (~100 clés existantes + nouvelles).
2. Collecte PSL (championnat sud-africain) — `data/gate-b1/south_africa_premiership-*` (2021-2024 uniquement, jamais 2025).
3. Suite pipeline Liga MX (Player Lab en direct + étapes 4-10 du prérequis) — pour débloquer enfin la Phase A Score Lab Factory V2 sur Liga MX.

## À FAIRE ENSUITE (par priorité)

1. **Fusionner les dictionnaires** (bloquant pour tout le reste de l'i18n) — une seule passe, dès que match-page.js est fini.
2. **Décision business** : recalibrer le moteur (surconfiance) — proposé, en attente de GO.
3. **Décision business** : Liga MX Phase A/B/C une fois le prérequis fini ; PSL idem une fois collecté ; ajouter brazil_seriea/ligue2 au catalogue live ou pas.
4. **Vague GEO** : construire les pages `/gb /mx /za` (routing, landing, pricing dynamique) sur le socle i18n maintenant fiable.
5. **Vague COMPLIANCE** : contenu légal/responsible-gambling par pays (déjà esquissé dans `config/markets.json`, marqué DRAFT — jamais APPROVED sans validation juridique réelle).
6. **Vague ANALYTICS** : funnel par marché (landing→signup→checkout) sur les migrations Supabase existantes.
7. **QA** : parcours signup→checkout sur les 3 marchés, mobile+desktop, avant tout merge vers `main`.

## Blocages externes qui ne se résolvent pas en codant

- SIREN/SIRET manquant côté entreprise → bloque Stripe live + mentions légales complètes.
- Vrais Price ID Stripe par devise → à créer dans le dashboard Stripe (action externe).
- Validation juridique réelle par pays (UK/MX/ZA) → recommandée par les docs business, pas encore obtenue.
- Dossiers TikTok Gambling Information + X pre-authorization → pas encore soumis (action business, pas technique).
