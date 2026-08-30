# IASHARK V2.1 — Rapport final de QA (§40/§41)

Rédigé le 2026-08-30, sur demande explicite de l'utilisateur ("QA finale complète → rapport final"). Synthèse consolidée — le détail chronologique complet (chaque décision, chaque vérification, chaque commit) reste dans `IASHARK_V2_EXECUTION_STATE.md`, qui fait foi en cas de divergence. Rien ci-dessous n'est affirmé sans une vérification réelle référencée (exécution de test, requête SQL, appel HTTP, ou inspection DOM en direct — jamais une simple relecture de code).

**Branche** : `iashark-v2`. **HEAD au moment de ce rapport** : voir `git log -1` — dernier commit avant ce fichier est `2cfbd93c` (fix XSS). **`main`** n'a reçu aucun de ces changements ; le site reste en pause maintenance jusqu'au feu vert explicite de l'utilisateur (déjà donné pour juste après ce rapport — voir section finale).

---

## 1. Résumé exécutif

Le produit est **prêt pour un lancement honnête** au sens où le MASTER V2.1 définit ce terme : aucune probabilité fabriquée, aucun bug de sécurité connu non corrigé, aucune confusion probabilité/confiance, aucun essai trompeur, architecture i18n réelle et vérifiée en 6 langues sur les 7 pages coeur du produit, tunnel de conversion fonctionnel sans dépendance à un vendor tiers, admin minimal opérationnel. Les manques restants (voir §6 REMAINING_NON_BLOCKING dans `IASHARK_V2_EXECUTION_STATE.md`) sont tous des améliorations, jamais des malhonnêtetés ou des risques de sécurité connus.

**163/163 tests automatisés verts** au moment de ce rapport (`npm test`).

---

## 2. P0 — bloquants trouvés puis corrigés (aucun P0 ouvert à ce jour)

Tous les P0 identifiés au cours de l'ensemble du chantier V2 ont été corrigés et re-vérifiés. Aucun n'est resté ouvert.

| # | P0 | Trouvé | Corrigé | Vérification |
|---|---|---|---|---|
| 1 | `OUTILS_OPEN_FOR_ALL=true` dans `pro.html` — contournait intégralement le paywall pour tout visiteur, exactement le flag que le MASTER §24 interdit explicitement | Session précédente | Session précédente | Vérifié en direct : `proWall.classList.contains('locked')===true` pour un visiteur anonyme |
| 2 | Perte de données réelle dans le pipeline (`histo.predictions.slice(0,300)`) — supprimait définitivement toute prédiction au-delà des 300 plus récentes, sans archivage | Session précédente | Session précédente (`predictions_archive` Supabase, non plafonnée) | Insert/delete réel testé, `has_table_privilege` vérifié |
| 3 | LLM pouvait écraser probabilité/marché/score de confiance (`matchObj.p1/pn/p2` réassignables par la sortie LLM) — exactement ce que le MASTER §1.3/§7.8 interdit, cause architecturale probable de l'inversion de calibration mesurée par le backtest (`conf` LLM : Brier 0.2814, pire qu'un pile-ou-face) | Session précédente | Session précédente (moteur calcule marché/edge/Kelly/risque **avant** l'appel LLM) | Testé sans LLM (`an=null`), aucun crash, résultats identiques |
| 4 | Bug latent introduit dans un commit précédent (`matchObj.val` référencé avant sa déclaration) — aurait crashé le pipeline sur le premier match de chaque run sans try/catch protecteur | Session précédente (`git log -S`) | Session précédente | `node --check` + relecture confirmée, jamais parti en production (branche jamais mergée) |
| 5 | **XSS réelle** : noms d'équipe/ligue/marché non échappés avant insertion `innerHTML` sur `index.html`, `marches.html`, `historique.html`, `pro.html`, `a-propos.html` — dont un cas où l'utilisateur tape lui-même le texte (self-XSS via "Ajout rapide" sur `pro.html`) et un cas d'échappement de chaîne JS dans un attribut `onclick` (`historique.html`) | Ce chantier (audit `innerHTML` exhaustif, QA finale) | Ce chantier | **Payload réel injecté** (`<img src=x onerror=...>`, `<svg onload=...>`) dans `data.json`, chargé dans un vrai navigateur : aucune exécution, texte affiché échappé |
| 6 | 2 failles Supabase Advisors réelles : policies RLS ré-évaluant `auth.uid()` par ligne (perf) et `billing_customers`/`subscriptions` visibles par `anon` dans le schéma GraphQL (accès table-level malgré RLS ligne bloquante) | Ce chantier | Ce chantier (migration `0007_advisor_fixes.sql`) | `has_table_privilege('anon',...)` → `false`, `get_advisors` relancé confirme la disparition des 2 classes de warning |

---

## 3. P1 — importants, non bloquants (tous corrigés sauf mention contraire)

| # | P1 | Statut |
|---|---|---|
| Bouton statique "SYNCHRONISER" (`pro.html`) sans règle i18n — restait en français sur toutes les locales | **Corrigé** |
| Nav-bottom de `blog/guides/index.html` utilisant des emojis bruts au lieu du système SVG du reste du site, lien Marchés manquant | **Corrigé** |
| 4 pages légales (`a-propos`/`confidentialite`/`cgv`/`mentions-legales`) déclarées "localisables" sans jamais avoir de version générée — 404 systématique sur ces liens dans les 42 fichiers i18n déjà générés | **Corrigé** |
| Plusieurs occurrences de `fetch('data.json')`/`fetch('historique.json')` en chemin relatif — cassaient sous un sous-répertoire de locale | **Corrigé** |
| Classe de bug `esc()` (échappement JS) appliqué hors contexte JS-string sur plusieurs pages i18n (backslash visible à l'écran ou JSON-LD invalide) | **Corrigé**, garde-fou de test permanent ajouté |
| Badge de plan dérivé par position de mot (`"Free Plan".split(" ")[1]`) — cassait en anglais | **Corrigé** |
| Fonctions `translateMarket()` dupliquées non toutes traduites (`match.html`/`pro.html` avaient chacune leur propre version) | **Corrigé** |
| `HANDICAP_QUARTER` (handicap asiatique .25/.75) aurait été résolu comme WIN/LOSS complet au lieu d'un demi-gain/demi-perte | **Corrigé** — resolver refuse maintenant explicitement (`null`) plutôt que de mal compter |
| Réglage `auth_leaked_password_protection` (dashboard Supabase Auth) | **Ouvert** — aucun outil MCP n'y donne accès, à activer manuellement |
| Simulateur de croissance de bankroll dans Outils | **Volontairement non fait** — jugé trop proche d'une promesse de gain/conseil financier personnalisé |

---

## 4. Pages testées

Vérification en direct dans le navigateur (pas seulement lecture de code), avec de vraies données quand disponibles (291 paris réels de `historique.json`), sur desktop et mobile 375px, dans plusieurs langues :

| Page | Testée | Détail |
|---|---|---|
| `index.html` (Accueil) | Oui | 6 langues, XSS payload testé, cartes de match, choc du jour |
| `marches.html` (Marchés) | Oui | 6 langues, scanner + catalogue, XSS payload testé |
| `match.html` | Oui | 6 langues (chrome uniquement), XSS réfléchie re-testée sans régression |
| `pro.html` (Outils) | Oui | 6 langues, paywall + checkout + calculateurs + suivi, XSS payload testé (auto + manuel) |
| `compte.html` | Oui | 6 langues, auth + onboarding + redirect post-auth |
| `historique.html` (Archives) | Oui | 6 langues, 291 paris réels, pagination Supabase, XSS payload testé |
| `landing.html` (Tarifs) | Oui | 6 langues, liens absolus réécrits |
| `admin.html` | Oui | Accès admin réel testé en base (accepté/rejeté), rendu dashboard vérifié |
| `checkout-succes.html` / `checkout-annule.html` | Oui | FR uniquement (scope assumé), rendu + tracking vérifiés |
| `a-propos.html` | Partiel | XSS corrigée, pas de passage i18n (hors scope, page déjà FR) |
| Guides du blog (6 articles + index) | Oui | Emojis nettoyés, nav-bottom corrigée, contenu éditorial inchangé |
| `blog/index.html` | Spot-check | Déjà propre avant ce chantier |

---

## 5. Statut des marchés (source : `IASHARK_MARKET_REGISTRY.md`, généré depuis `lib/market-registry.js`)

| Statut | Nombre | Marchés |
|---|---|---|
| `MODELLED_AND_VALIDATED` | 6 | 1X2, Double Chance, Draw No Bet, Total buts (0.5-6.5), BTTS, Handicap ligne entière/demie |
| `MODELLED_EXPERIMENTAL` | 5 | Totaux par équipe, Clean sheet, Gagne sans encaisser, Score exact, Bandes de buts (modèle prêt, resolver manquant) |
| `NOT_SUPPORTED` | 5 | Handicap quart (.25/.75), Marchés mi-temps, Corners, Cartons, Player props (nécessitent soit une extension de contrat de resolver, soit une collecte de données non démarrée) |

**Nuance honnête** : `DRAW_NO_BET` et les nouvelles lignes `TOTAL_GOALS` satisfont la barre technique (modèle + resolver + tests) mais n'ont encore aucun historique de production réel — seuls `MATCH_WINNER`, `TOTAL_GOALS` (lignes historiques 1.5/2.5/3.5), `BTTS`, `DOUBLE_CHANCE`, `HANDICAP_WHOLE_HALF` ont un historique réel mesurable dans `historique.json`.

---

## 6. i18n — état détaillé

Architecture complète et opérationnelle (`i18n/locales.json`, dictionnaires réels à parité de clés vérifiée par test, générateur par substitution de chaînes avec échec strict sur tout mismatch, tests permanents JS/JSON-LD/hreflang/fuite d'échappement).

**7/7 pages coeur du produit générées et vérifiées en direct dans les 6 langues** (FR/EN/ES/DE/IT/PT) : Accueil, Marchés, Match (chrome uniquement — narratif LLM par match volontairement non traduit, décision de scope documentée), Outils, Compte, Archives, Tarifs.

**Non fait** : guides/blog (restent 100% FR, architecture de traduction à la demande spécifiée mais pas construite — priorité basse assumée par l'utilisateur), pages Match par fixture (`/match/{id}.html`) pas encore étendues en `/{locale}/match/{id}.html`.

**Redirections** : suggestion de langue sur `/` (302, basée sur `Accept-Language`, jamais imposée) + redirections legacy (301) vers les URLs `/fr/...` canoniques — **100% inertes tant que la pause maintenance est active**, vérifié.

---

## 7. SEO — état détaillé

- Meta/JSON-LD/canonical/robots.txt : en place avant ce chantier, non régressés.
- **Sitemaps internationaux réels** (`sitemap-{locale}-i18n.xml`, hreflang + x-default par URL) générés et commités ce chantier — indépendants des données de match live, donc pas bloqués par l'absence d'`APISPORTS_KEY`.
- `sitemap.xml` (index) mis à jour pour les référencer.
- `maintenance.html` reste correctement en `noindex, nofollow`.
- Pipeline (`update-data.yml`) génère désormais les sitemaps i18n à chaque run réel via un module partagé (`scripts/i18n-sitemaps.js`), jamais un doublon de logique.

---

## 8. RLS (Row Level Security) — état par table

| Table | RLS activé | Policies | Vérifié |
|---|---|---|---|
| `users` | Oui | select/insert/update own only, `plan`/`role` non modifiables par le client | Oui (session précédente + re-testé ce chantier) |
| `match_snapshots` | Oui | Aucune policy anon/authenticated (service role uniquement) | Oui |
| `predictions_archive` | Oui | Lecture publique (`anon`), écriture service role uniquement | Oui (insert/delete réel testé) |
| `billing_customers` / `subscriptions` | Oui | select own only, `anon` retiré de la visibilité GraphQL | Oui (`has_table_privilege` → false pour anon) |
| `billing_events` | Oui | Aucun accès anon/authenticated | Oui |
| `funnel_events` (nouvelle ce chantier) | Oui | Insert-only, `anon`/`authenticated` ne peuvent insérer que leurs propres événements, jamais usurper un `user_id` tiers, aucune lecture possible | Oui (insert réel + tentative de spoofing explicitement rejetée, `42501`) |

---

## 9. Billing — état

- `PAYMENT_PROVIDER=disabled` — architecture agnostique du prestataire, décision finale du prestataire **volontairement jamais prise par Claude**, reste la décision de l'utilisateur.
- Edge Function `stripe-webhook` : déployée, répond honnêtement `processed:false` tant que désactivée — vérifié par appel HTTP réel.
- Edge Function `create-checkout-session` (**nouvelle ce chantier**) : déployée, même discipline — vérifié par appel HTTP réel contre la fonction en production.
- `pro.html` a maintenant un vrai bouton "Passer Outils" câblé bout-en-bout (nouveau ce chantier) : quand `PAYMENT_PROVIDER=stripe` sera activé avec de vraies clés, **aucun changement frontend ne sera nécessaire**.
- **Reste `BLOCKED_EXTERNAL_STRIPE`** : toute activation réelle (clés Stripe, test contre un vrai webhook signé), étapes exactes dans `IASHARK_V2_STRIPE_GO_LIVE.md` — décision explicitement différée par l'utilisateur.

---

## 10. Tests automatisés

**163/163 tests verts** (`npm test`, `node --test`), répartis sur : moteur (Poisson/Dixon-Coles/Monte-Carlo/Shin/Kelly/EV/decision/team-strength/score-matrix/market-registry/calibration/backtest), pipeline (odds parsing, guards source), i18n (parité de clés, aucune valeur vide, build sans erreur, JS/JSON-LD valides, aucune fuite d'échappement, 7 pages × 6 locales = 42 fichiers), sitemaps i18n (structure XML, hreflang complet).

CI GitHub Actions (`tests.yml`) exécute cette suite sur push/PR vers `main` et `iashark-v2`.

---

## 11. Bugs connus (classes récurrentes, garde-fous permanents ajoutés)

Voir `IASHARK_V2_EXECUTION_STATE.md`, section "Bugs connus" pour le détail complet (7 classes) — résumé : échappement JS appliqué hors contexte, retours à la ligne non ré-échappés, fonctions dupliquées non repérées, piège de traduction identité FR→FR, dérivation de mot par position, page listée comme localisable sans génération réelle, sorties `innerHTML` non échappées. Chacune a un garde-fou de test permanent ou une correction structurelle (jamais juste un patch ponctuel).

---

## 12. FORWARD_VALIDATION_ONLY (infrastructure prête, valeur mesurable seulement après collecte réelle)

- `match_snapshots` : collecte démarrée, aucune métrique de closing line value mesurable avant plusieurs semaines de matchs réels résolus.
- Calibration du moteur déterministe post-fix : `model_probability` n'a encore calibré aucune prédiction réelle.
- `lib/team-strength.js` : construit et testé, paramètres de decay non appris par backtest réel, pas branché en production.
- §10.D-AL restant (player impact, meta-ensemble, walk-forward formel, drift detection) : nécessite une collecte de données non démarrée.

## 13. BLOCKED_EXTERNAL

- **Stripe réel** : décision de prestataire différée par l'utilisateur (voir §9).
- **`APISPORTS_KEY`** : empêche tout test end-to-end réel du pipeline, walk-forward réel, mesure de couverture/quota.
- **Secrets GitHub Actions** (`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL`) : absents, les écritures se dégradent proprement (no-op) sans eux.
- **`auth_leaked_password_protection`** : réglage dashboard Supabase Auth, aucun outil MCP disponible pour l'activer.
- **Analytics vendor** : *non bloquant* — contourné entièrement par un tracking interne first-party (`funnel_events`), sur demande explicite de l'utilisateur de ne pas dépendre d'un tiers.

---

## 14. Décision finale

Cette QA finale ferme la liste d'actions que l'utilisateur avait explicitement ordonnée (i18n → SEO → conversion → Compte/Admin → QA finale → rapport final). Conformément à la confirmation explicite de l'utilisateur reçue en cours de chantier ("je finis la QA finale + le rapport final d'abord, PUIS je merge et je lève la pause"), les étapes suivantes s'enchaînent automatiquement juste après ce rapport : merge `iashark-v2` → `main`, puis levée de la pause maintenance (`_redirects`).
