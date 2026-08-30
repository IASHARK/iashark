# IASHARK V2.1 — Recette produit visuelle A→Z (branche `hotfix-v2-acceptance`)

## Mise à jour 2026-08-30 (suite 9) : fermeture BUG 6/8/9/10 + correctif sécurité sur `main`

Suite directe de la suite 8 ("STOP aux nouvelles features moteur... vasy fais le"). Correctifs uniquement, aucune feature moteur touchée, code existant réutilisé au maximum. Comptes de test réels créés/testés/supprimés cette passe (`qa3-*`, `qa4-*@iashark-test.com`).

**Correctif sécurité appliqué directement sur `main`** (autorisation explicite, action ponctuelle) : la clé API-Sports était exposée côté client via les widgets `<api-sports-widget>` sur `main` (4 commits en avance sur mon dernier état connu, poussés par une session parallèle qui a redessiné `match.html` "en trois espaces" — signalé à l'utilisateur). Widgets + clé retirés sur `match.html` et ses 6 copies de locale (`fr/`, `en/`, `es/`, `de/`, `it/`, `pt/`), `checkSession()` corrigé pour reconnaître `role==='admin'` (même bug que BUG 2 mais sur `main`). BROWSER_VERIFIED en production réelle (`iashark.com`, vrai compte admin) : clé absente, mur PRO correctement débloqué pour l'admin. Commit `1b5aacd6`, poussé sur `origin/main`.

**BUG 6 (funnel PRO/CTA intelligents)** — `match.html` : le CTA du mur PRO pointait vers `/compte.html` avec le libellé "PASSER PRO" et un prix mal formaté ("19.95" au lieu de "19,95"), ajoutant un détour inutile avant `/pro.html` qui gère déjà lui-même le funnel réel (redirige vers l'inscription si non connecté, sinon lance le vrai checkout Stripe). Corrigé pour pointer directement vers `/pro.html`, réutilise la traduction existante `tools_page.pw_cta` au lieu d'une clé dupliquée et désynchronisée (supprimée). `marches.html` : aucun funnel du tout vers OUTILS (page volontairement 100% gratuite, mais sans invitation). Ajout d'un bandeau discret, jamais affiché à un compte déjà pro/admin (vérification réelle plan/role avant affichage, caché par défaut). `pro.html`/`compte.html` déjà corrects, non touchés. BROWSER_VERIFIED (comptes FREE et PRO réels) : bandeau visible pour FREE, invisible pour PRO. DESKTOP: PASS. MOBILE: PASS.

**BUG 8 (Guides/Marchés, liens cassés/contenu manquant)** — Les 5 pages d'articles individuelles (`blog/guides/*.html`) n'avaient **aucune** intégration Supabase/auth-header.js, contrairement à `blog/guides/index.html` et à toutes les autres pages du site (même bug que BUG 1/3, raté sur ces 5 pages lors de la passe précédente) : un compte PRO/admin naviguant depuis un guide n'avait aucune indication de connexion, aucun accès rapide au compte. Corrigé avec le pattern déjà utilisé par `blog/guides/index.html` (slot + SDK + `mount()`, CSS `.btn-login` avec les tokens propres à ce template). Vérifié par ailleurs : aucun lien interne cassé, aucune ancre de sommaire orpheline sur les 5 articles + les 2 index (`blog/`, `blog/guides/`), tous les assets référencés (`auth-header.js`, `site-prefs.js`) existent réellement. BROWSER_VERIFIED : chip CONNEXION visible et stylé correctement en desktop et mobile (375px, le lien "ANALYSES DU JOUR" reste caché comme prévu, le chip reste visible).

**BUG 9 (recette mobile complète, tous sous-cas)** — Recette réelle à 375px avec de vrais comptes FREE/PRO/ADMIN : `index.html`, `marches.html`, `match.html` (onglets DONNÉES AVANCÉES et JOUEURS), `pro.html`, `compte.html`, `admin.html` (précédemment `MOBILE: TO_VERIFY`, désormais **PASS**), `blog/index.html` (fil + onglet GUIDES), un article de guide. Un vrai bug trouvé et corrigé : sur `pro.html`, le bouton flottant "+" (ajout rapide) restait affiché en permanence dès le déverrouillage OUTILS, quel que soit l'onglet actif, et chevauchait/rendait illisible le libellé du 3ᵉ onglet "CALCULATEURS" en mobile. Corrigé pour ne s'afficher que sur l'onglet MON SUIVI (seul contexte où l'action a un sens), propagé aux 6 copies de locale via `npm run build:i18n`. Aucune autre régression de layout trouvée.

**BUG 10 (widgets API-Sports classement/calendrier)** — Conclusion (recherche déjà faite en amont via la documentation officielle API-Sports, confirmée par test réel de hash sur la clé exposée) : **non intégrables proprement**. L'architecture des widgets `<api-sports-widget>` expose systématiquement la clé API du compte côté client — aucune "clé publique" séparée n'existe côté API-Sports ; seules la restriction de domaine (protection partielle, la clé reste lisible) ou un proxy/cache serveur complet (hors périmètre "pas de nouvelle feature moteur/infra") permettraient de les sécuriser. Le rendu natif déjà présent (classement, H2H) couvre la même fonctionnalité sans ce risque. Vérifié repo entier (`match.html`, tous branches/locales) : zéro référence widget ou clé restante.

npm test : 208/208 après tous les correctifs de cette passe.

## Mise à jour 2026-08-30 (suite 8) : bugs réels post-lancement, corrigés en navigateur

Suite au retour utilisateur après test réel en production ("la recette précédente n'est pas acceptable"). Correctifs uniquement, aucune nouvelle feature moteur, code existant réutilisé au maximum. 3 vrais comptes de test créés (FREE/PRO/ADMIN, `qa-*-recette@iashark-test.com`), connexion réelle via curl, supprimés après usage.

**BUG 1/3 (session ne persiste pas, chip incohérent)** — CAUSE : `marches.html` n'incluait ni le SDK Supabase ni `auth-header.js` (seule page cœur dans ce cas, `landing.html` aussi mais hors périmètre du bug list) ; `match.html` incluait `auth-header.js` mais utilisait `class="btn-conn"` sans règle CSS `.btn-login` définie (le composant partagé rend toujours `btn-login`) — le chip perdait tout style une fois monté. FIX : SDK + `auth-header.js` + `mount()` ajoutés à `marches.html`, `blog/index.html`, `blog/guides/index.html` ; règle `.btn-login` ajoutée à `match.html`. BROWSER_VERIFIED : vrai compte FREE, vrai token, navigation réelle (pas reload) sur index→marches→match→pro→compte→guides — chip correct et persistant partout, plus aucune réapparition de "CONNEXION". DESKTOP: PASS. MOBILE: PASS (capture réelle marches.html 375px). VISITOR: PASS (aucun chip, correct). FREE: PASS. PRO: PASS. ADMIN: PASS.

**BUG 2 (admin doit tout voir)** — Pas de bug trouvé : `admin.html` vérifié avec le vrai compte admin, accès réel confirmé (dashboard réel : 8 utilisateurs, funnel réel), rôle lu depuis Supabase (`role,plan` RLS-protégés), aucun fallback FREE détecté. BROWSER_VERIFIED, DESKTOP: PASS, MOBILE: TO_VERIFY (non retesté mobile faute de temps), ADMIN: PASS.

**BUG 4 (section JOUEURS invisible)** — CAUSE, la plus sérieuse : `player_markets` est protégé côté serveur depuis la suite 7 (déplacé dans `match_premium_data`, fusionné uniquement pour PRO/admin par l'Edge Function `match-data`) — mais cette Edge Function corrigée n'avait **jamais été déployée** (confirmé : la version live, v5, ne contenait pas le correctif). Tout visiteur, PRO compris, recevait donc toujours des matchs sans `player_markets`, d'où la section systématiquement vide. FIX : Edge Function déployée réellement (v6, via l'outil MCP Supabase `deploy_edge_function`, disponible dans cette session — correction de mon évaluation précédente qui la classait `BLOCKED_EXTERNAL`). BROWSER_VERIFIED en conditions live réelles (pas locales) : ligne de test insérée dans `match_premium_data` pour une vraie fixture (id 1490425, Toronto FC vs New York City FC, issue du run pipeline réel du jour), appel réel à `https://ksvjraqitxouwiabecai.supabase.co/functions/v1/match-data` avec le vrai token admin → `player_markets` bien renvoyé ; même appel avec le vrai token FREE → `player_markets` absent (sécurité confirmée). Ligne de test supprimée après vérification. **Constat honnête restant** : `match_premium_data` est vide en conditions réelles (0 lignes) — le run pipeline déclenché par l'utilisateur a bien peuplé `data.json` (49 matchs réels) mais n'a écrit ni `match_premium_data` ni `odds_snapshots`, ce qui indique que `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` ne sont probablement pas configurés (ou échouent silencieusement) dans les secrets GitHub Actions — à vérifier côté utilisateur, `BLOCKED_EXTERNAL` réel cette fois. Tant que ce n'est pas résolu, la section JOUEURS restera vide en production même pour un compte PRO, par manque de données, pas par bug de code. DESKTOP: PASS (mécanisme). MOBILE: TO_VERIFY. PRO/ADMIN: PASS (mécanisme confirmé) mais données réelles actuellement absentes (cause externe, pas un bug de rendu).

**BUG 5/7 (Outils entièrement ouverts, PRO caché seulement en CSS)** — CAUSE, réelle et sérieuse : `pro.html` bloquait visuellement les sélections (`filter:blur`+`opacity`+`pointer-events:none`) mais `renderSelections()` peuplait le DOM avec les **vraies données** (équipes, cotes, probabilités réelles) pour tout visiteur, authentifié ou non — vérifié : `innerText` d'un visiteur anonyme réel contenait "Real Madrid vs Malaga ... 2.06 ... 77%" en clair. FIX : nouveau flag `isProUnlocked` (alimenté uniquement par `checkProAccess()`, qui lit le plan réel Supabase/RLS) ; `renderSelections()` refuse de peupler les vraies données tant qu'il est `false`, affiche un état explicite à la place. Les calculateurs gratuits restent, eux, intentionnellement hors mur (déjà correct). BROWSER_VERIFIED : visiteur anonyme réel → plus aucune donnée réelle dans le DOM ; compte PRO réel → données réelles correctement affichées, admin idem, aucune régression. DESKTOP: PASS. MOBILE: TO_VERIFY. VISITOR: PASS. FREE: PASS (verrouillé). PRO: PASS (débloqué). ADMIN: PASS (débloqué).

**Point important sur le déploiement** : la correction de l'Edge Function `match-data` (BUG 4) est un déploiement serveur direct (via l'outil MCP Supabase), **indépendant des branches git** — elle est donc déjà active en production dès maintenant, contrairement aux correctifs `match.html`/`marches.html`/`pro.html` qui restent sur `hotfix-v2-acceptance` tant qu'ils ne sont pas mergés. Le site actuellement en ligne (`main`) a donc la nouvelle Edge Function (sécurisée) mais encore l'ancien `pro.html` (mur CSS uniquement) et l'ancien `marches.html` (pas de session persistante) — à mergé pour que ces correctifs prennent effet en production.

**Non traité dans cette passe, à signaler honnêtement (contexte limité, priorité donnée aux bugs les plus sérieux)** : BUG 6 (funnel PRO/CTA intelligents sur Match/Marchés/Outils/Compte), BUG 8 (vérification exhaustive Guides/Marchés page par page pour liens cassés/contenu manquant), BUG 9 (recette mobile complète des 6 pages avec tous les sous-cas demandés), BUG 10 (étude des widgets API-Sports pour classements/calendrier). Aucun de ces points n'a révélé de régression bloquante pendant les vérifications déjà faites (marches.html/pro.html mobile testés en passant, propres), mais n'a pas reçu la vérification dédiée demandée — à reprendre en priorité à la prochaine session.

npm test : 203/203. Toujours sur `hotfix-v2-acceptance`, `main` non re-touché depuis le merge précédent (le site est réellement en ligne depuis le feu vert explicite antérieur — ces correctifs vivent uniquement sur `hotfix-v2-acceptance` tant qu'ils ne sont pas mergés).


Rédigé le 2026-08-30, suite au refus explicite de la V2 par l'utilisateur après contrôle manuel réel du site en production. **`IASHARK_V2_RAPPORT_FINAL.md` est annulé** : tout ce qui y était marqué `PASS` sur la seule base de tests automatisés ou de l'existence d'un fichier doit être considéré `TO_VERIFY` tant que ce document-ci ne le confirme pas explicitement avec une preuve navigateur/donnée réelle.

**Nouveau critère de `PASS`** : `CODE EXISTS + DATA EXISTS + BROWSER VERIFIED + USER FLOW VERIFIED`. Chaque ligne `PASS` ci-dessous référence la vérification réelle qui la justifie — jamais un test unitaire seul.

**Méthode et limite honnête à connaître avant de lire la suite** : l'extension Claude in Chrome (navigateur réel) n'est pas connectée dans cet environnement — impossible d'obtenir une session authentifiée réelle dans un navigateur avec accès réseau complet. Pour vérifier les états FREE/PRO malgré cette contrainte : (1) deux vrais comptes de test ont été créés dans Supabase (production), un FREE et un PRO, avec connexion réelle via `curl` (mot de passe réel, token réel obtenu via l'API Auth réelle) ; (2) la réponse RÉELLE de l'API a été injectée dans le code RÉEL de la page (via `javascript_tool`, en remplaçant uniquement l'appel réseau bloqué par le sandbox) pour observer le rendu réel. C'est la vérification la plus rigoureuse possible dans cet environnement — mais ce n'est PAS une navigation authentifiée de bout en bout dans un vrai navigateur. Signalé explicitement à chaque ligne concernée. Les deux comptes de test ont été supprimés après usage (aucune trace résiduelle en base).

## Mise à jour 2026-08-30 (suite 7) : fermeture des PARTIAL/TO_VERIFY corrigeables

Demande : transformer les `PARTIAL`/`TO_VERIFY` de la suite 6 en `PASS` là où c'est réellement possible, sans nouvelle fonctionnalité.

### 1. Secrets pipeline E2E — table précise

| Variable | Utilisée où | Obligatoire | Locale (.env) | CI (secrets déclarés) | Bloque réellement |
|---|---|---|---|---|---|
| `APISPORTS_KEY` | Partout (fixtures/stats/lineups/joueurs/odds) | **Oui** | ✅ | ✅ | Oui — sans elle, aucune donnée réelle |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `writePremiumData`/`writeSnapshots`/`odds_snapshots` | Oui pour la persistance | ❌ | déclarées, non vérifiables par moi (pas de `gh`/token) | Seulement la **persistance** (dégrade proprement, log clair, ne crashe pas) |
| `ANTHROPIC_KEY` | `genAnalyse` — texte narratif uniquement (`verdict_shark`, `analyse_card`...), jamais les probabilités/marchés déjà décidés en code déterministe avant l'appel | Oui pour le texte narratif | ❌ | déclarée | Seulement le **narratif** (échec rapide, pas de retry bloquant — `postJSONWithRetry` ne retente que sur `rate_limit`/`overloaded`, pas sur une auth invalide) |
| `OPENWEATHER_KEY` | `getWeather`, gardé `if(!city\|\|!OWM_KEY) return null` | Non | ❌ | déclarée | Non — météo absente uniquement |
| `NEWSAPI_KEY` | `getNews`, gardé `if(!NEWS_KEY) return []` | Non | ❌ | déclarée | Non |
| `ODDS_API_KEY` | `getPinnacleOdds`, gardé `if(!ODDS_KEY) return null` | Non (le moteur analyse sans cote par design) | ❌ | déclarée | Non |
| `CREATOMATE_KEY` / `ODDS_API_IO_KEY` | **Jamais consommées par `pipeline.js`** (grep `process.env` : aucune occurrence) | N/A | ❌ | déclarées mais mortes pour ce pipeline | Non applicable |
| `GITHUB_SHA` | `pipeline_sha` | Non (auto-fourni par Actions) | ❌ (normal) | ✅ | Non |

`.env` chargé proprement via `scripts/load-env.js` (nouveau, 0 dépendance npm, jamais de `console.log` de valeur) — `require("./load-env.js")` en tête de `verify-league-coverage.js`/`audit-odds-markets.js`/`save-odds-snapshot.js`, plus besoin de `source .env` manuel.

**Exécution E2E réelle effectuée** (`scripts/e2e-pipeline-smoketest.js`, nouveau) : chaîne complète API-Football → team engine (réutilise `lib/models.js`/`lib/markets/score-matrix.js`, mêmes fonctions qu'en production) → Market Registry → data quality/reliability → Player Engine (gate `analysis_tier` + lineup confirmée) testée sur 4 fixtures réelles couvrant les 3 tiers (Premier League `FULL_ANALYSIS`, Liga Portugal `STANDARD_ANALYSIS`, Champions League `LIMITED_DATA`, MLS `FULL_ANALYSIS`) — résultat écrit dans `e2e-pipeline-smoketest-report.json`. Confirmé réel : lambdas calculés depuis les vraies stats saison, marchés dérivés (12/fixture), classification registry correcte, `data_quality`/`reliability` cohérents avec l'échantillon réel disponible (`sample_size:21` MLS → "Élevée" ; `sample_size:null` Champions League → "Inconnue"/"Faible", cohérent avec la phase de ligue pas encore démarrée déjà documentée en suite 4-5). Player Engine à 0 résultat sur cet échantillon car **aucune fixture n'avait de composition officiellement confirmée** au moment du run (normal, publiée ~1h avant coup d'envoi) — le chemin Player Engine lui-même a été vérifié séparément avec de vrais joueurs (suite 6, Jackson/Neto/Mudryk).

**Ce que je ne peux toujours pas faire** : exécuter `node pipeline.js` complet (13 ligues × 3 jours + SEO + sitemaps + narratif LLM + météo/news, ~2400 lignes) en une fois — nécessiterait `SUPABASE_SERVICE_ROLE_KEY`/`ANTHROPIC_KEY` absents ici, et écrirait des dizaines de fichiers locaux (data.json, pages match/, sitemaps) qu'il faudrait ensuite `git checkout --` avant tout commit. Déclencher le workflow GitHub Actions moi-même (`workflow_dispatch` sur `hotfix-v2-acceptance`) — pas de `gh`/token dans cet environnement. → `BLOCKED_EXTERNAL`, nécessite une action de l'utilisateur (déclencher le workflow manuellement sur GitHub, ou confirmer que `SUPABASE_SERVICE_ROLE_KEY`/`ANTHROPIC_KEY` sont bien configurés).

### 2. Marchés — filtres Buteurs/Tirs/Tirs cadrés

Ajoutés sur `marches.html` (`renderPlayerMarketsTable`, branche séparée du scanner équipe existant, jamais mélangée à sa logique). Utilisent le Market Registry réel (`PLAYER_FILTER_MARKET`→bet_id réels de l'audit) ; les 3 marchés sont `MODELLED_EXPERIMENTAL` donc affichent une probabilité IASHARK — aucun des 3 n'est `ODDS_AVAILABLE_ONLY`, la règle "jamais de probabilité sur `ODDS_AVAILABLE_ONLY`" n'a donc rien à bloquer ici (déjà verrouillée par ailleurs, `tests/classify-market-audit.test.js`). Catalogue statique (`CATALOGUE DES MARCHÉS`) mis à jour en cohérence (Buteur/Tirs joueur/Tirs cadrés joueur en EXPÉRIMENTAL, Draw No Bet corrigé en EXPÉRIMENTAL pour matcher `lib/market-registry.js`). Vérifié réellement desktop + mobile (375px) : dropdown, empty-state, table, aucun débordement.

### 3. Player Engine / page Match — 6 cas visuels

Vérifiés via rendu réel de `buildPlayerEngineSection` (données synthétiques de forme réaliste, javascript_tool sur les pages construites) :
- **Données complètes** (titulaire, buteur+tirs+tirs cadrés, qualité haute) : rendu propre, 3 lignes de marché par joueur.
- **Joueur sans odds** : `oddsInfo` absent → seule la probabilité IASHARK affichée, aucune ligne "Cote/Probabilité marché" fabriquée.
- **Joueur sans données suffisantes** (< 3 apparitions, ex. Mudryk réel) : `buildPlayerMarketOutput` retourne `null`, aucune carte générée pour ce joueur — vérifié en session précédente avec de vraies données API.
- **Lineup non confirmée** : `computePlayerMarketsForFixture` retourne `[]` (gate réel, vérifié dans le smoke test E2E sur 4 vraies fixtures ce jour) → état vide honnête affiché ("PAS ENCORE DE DONNÉES PLAYER ENGINE POUR CE MATCH").
- **Lineup confirmée** : chemin vérifié end-to-end avec de vrais joueurs Chelsea (suite 6).
- **Aucun player prop disponible** : même état vide que "lineup non confirmée", testé réellement en DOM (capture d'écran mobile, aucun écran cassé).

Aucun écran cassé dans les 6 cas — confirmé par rendu DOM réel, pas supposé.

### 4. I18N — 6 langues, vérification réelle de rendu

Toutes les nouvelles chaînes (section JOUEURS, filtres Marchés, catalogue) déplacées dans des constantes JS uniques (`PE_TXT`, `marketLabels`, `lineupLabels`, `PM_TXT`, `PLAYER_MARKET_LABELS`) traduites via `scripts/i18n-manifest.js` (même pattern que l'existant `DATA_QUALITY_LABELS`/`MARKET_KEY_LABELS`) + nouvelles clés dans les 6 `i18n/dict/*.json`. `npm run build:i18n` : 0 erreur (fail-fast `Replacement mismatch` n'a rien signalé, confirmant chaque règle a matché exactement 1 fois). **Rendu réel vérifié** (pas seulement génération de fichier) : EN et ES (marches.html, dropdown + empty-state réels), DE et PT (match.html, `buildPlayerEngineSection` exécuté en direct avec caractères spéciaux ü/ö/ß/ç/ã confirmés corrects), IT (marches.html, dropdown réel). Sélecteur de langue non re-testé dans cette passe spécifique (déjà vérifié fonctionnel sur les 6 locales en suite 1, aucun changement de son code cette session).

### 5. Mobile — recette complète

`marches.html` (nouveau filtre + empty-state) et `match.html` (nouvelle section JOUEURS, carte avec nom long) vérifiés réellement à 375px : aucun débordement horizontal (`scrollWidth` mesuré < largeur viewport), textes non coupés, cartes qui wrap correctement. `index.html`, `pro.html` (Outils), `compte.html` re-vérifiés à 375px (captures d'écran) : aucune régression, console propre (bruit 502/401 Supabase habituel uniquement). `admin.html`/`match.html` (état ID manquant) déjà vérifiés en suite 4. Non repris dans cette passe car non modifiés : détail fin des dropdowns/paywall déjà vérifié en suite 1/4.

### 6. Sécurité — revue dédiée, 2 problèmes réels trouvés et corrigés

- **XSS trouvé et corrigé** : `match.html`, l'affichage du statut lineup (`lineupLabels[pl.lineup_status]||pl.lineup_status`) n'était pas passé par `esc()` avant insertion HTML — corrigé. Pas exploitable aujourd'hui (la valeur vient exclusivement de notre propre pipeline, 4 valeurs fixes), mais corrigé par principe de défense en profondeur.
- **Fuite de donnée premium trouvée et corrigée (plus sérieux)** : `player_markets` était écrit directement dans `data.json` (public, servi tel quel à `https://iashark.com/data.json` sans authentification), alors que les autres champs premium (`kelly`/`edge`/`verdict_shark`/`facteur_x`/`dropping_odds`) ne le sont jamais — ils vivent dans la table protégée `match_premium_data`, fusionnée uniquement pour les vrais utilisateurs PRO par l'Edge Function `match-data`. Corrigé : `player_markets` retiré de `matchObj` (pipeline), déplacé dans `premiumRows`/`match_premium_data` (nouvelle colonne `player_markets jsonb`, migration appliquée et vérifiée), `match-data/index.ts` mis à jour (`PREMIUM_FIELDS`, requête de sélection, fusion PRO) pour suivre exactement le même chemin que `kelly`/`edge`. **Aucune exposition réelle n'a eu lieu** : ce code n'a jamais tourné en production (uniquement sur `hotfix-v2-acceptance`, jamais mergé, jamais exécuté par la CI faute de secrets locaux) — trouvé et corrigé avant tout déploiement.
- Confirmé (pas juste supposé) : RLS activé sur `odds_snapshots` avec **zéro policy** (deny-all pour `anon`/`authenticated`, accès `service_role` uniquement — requête `pg_policies` directe) ; `users.plan`/`users.role` n'ont **aucun GRANT UPDATE** pour `authenticated` (`information_schema.column_privileges` interrogé directement) — un utilisateur FREE ne peut pas s'auto-promouvoir PRO même via un appel client direct, la RLS `users_update_own` ne suffirait pas à elle seule sans ce verrou complémentaire au niveau colonne.
- `.env` confirmé jamais commité (`git log --all --full-history -- .env` vide) et gitignoré. Aucune clé API/secret trouvée dans le code frontend ni dans l'historique de cette session (scan répété à chaque commit). `esc()` utilisé systématiquement pour toute donnée dynamique insérée en HTML dans le nouveau code (vérifié ligne par ligne). Paramètres fixture/player : toujours des identifiants numériques issus de l'API ou de notre propre pipeline, jamais interpolés depuis une entrée utilisateur non validée. Rate limiting : mêmes pauses 150-300ms entre appels API que le pipeline existant, cache en mémoire par run (`PLAYER_STATS_CACHE`) pour ne jamais refetcher un joueur déjà vu dans le même run.
- **Non fait, à signaler** : l'Edge Function `match-data` corrigée n'a pas pu être redéployée (pas d'accès `supabase functions deploy` dans cet environnement) ni testée en conditions réelles avec un vrai compte PRO/FREE post-correctif — le code est réel et syntaxiquement cohérent (mêmes patterns que le code déjà en prod pour kelly/edge), mais son exécution réelle post-déploiement reste `BLOCKED_EXTERNAL`.

### 7. FREE/PRO/Outils/Compte — régression fraîche

Aucun fichier d'auth, `pro.html`, ni `compte.html` n'a été modifié dans cette session (seuls `match.html`/`marches.html`/pipeline/Edge Function ont changé). Le mécanisme FREE/PRO lui-même (`sb.from('users').select('plan,role,capital')`, vérifié inchangé) et le paywall `pro.html` restent exactement ceux vérifiés avec de vrais comptes Supabase en jalon précédent. Vérification fraîche faite cette passe : re-confirmation par lecture de code que `checkSession()`/`isPro` n'ont pas été touchés, re-capture d'écran mobile de `pro.html`/`compte.html` (aucune régression visuelle), et la correction de fuite `player_markets` ci-dessus qui, si elle n'avait pas été trouvée, aurait **créé** une régression FREE/PRO (accès à une donnée premium sans être PRO) — donc directement pertinente et couverte par cette régression.

npm test : 203/203 après tous les correctifs de cette section.

## Mise à jour 2026-08-30 (suite 6) : Player Engine réel + recette de lancement (rapport final honnête)

Demande : exploiter l'audit odds/marchés (suite 5) pour construire un vrai Player Engine (buteur, tirs, tirs cadrés), le brancher dans le pipeline, l'afficher sur `match.html`, mettre à jour le Market Registry, continuer les snapshots de cotes avec une vraie cadence, puis produire un rapport de lancement final avec 17 statuts.

**Livré et vérifié réellement dans cette passe** : `lib/markets/player-engine.js` (19 tests) — minutes attendues réelles (jamais fixes), P(buteur) via Poisson jamais un passthrough de `goals_per_90`, modèle tirs/tirs cadrés distinct, `chooseDistributionModel` qui ne retourne JAMAIS `VALIDATED` automatiquement (toujours `FORWARD_VALIDATION_ONLY`, testé même sur un grand échantillon synthétique), suppression totale du résultat si données insuffisantes. Vérifié end-to-end avec de vrais joueurs Chelsea (N. Jackson, Pedro Neto, M. Mudryk) et leurs vraies stats saison 2025 via `/players?id=X&season=2025&team=49` — Mudryk (2 apparitions) correctement supprimé, Jackson/Neto avec des probabilités réelles et distinctes selon leurs minutes attendues réelles (25 vs 76 min). 3 nouvelles entrées Market Registry (`ANYTIME_GOALSCORER`/`PLAYER_SHOTS`/`PLAYER_SHOTS_ON_TARGET`) avec les vrais `bet_id` de l'audit. Pipeline branché (`getPlayerSeasonStats` caché en mémoire par run, `computePlayerMarketsForFixture` gaté sur `analysis_tier` FULL/STANDARD uniquement et sur composition officiellement confirmée) — syntaxiquement vérifié mais **jamais exécuté de bout en bout** (pas de `SUPABASE_SERVICE_ROLE_KEY`/`ANTHROPIC_KEY` dans cette session). Nouvelle section JOUEURS sur `match.html`, vérifiée visuellement (capture d'écran + rendu DOM avec données de forme réelle), séparant explicitement Probabilité IASHARK / Cote / Probabilité marché. Cadence de snapshots FIRST_SEEN/T72/T24/T6/CLOSE + dedup réel contre Supabase (6 tests). Correction de coherence trouvée en chemin : l'ancien badge "proba de marquer" (goals/games via Poisson, sans ajustement minutes/contexte) relabelisé honnêtement "ratio buts/match (saison)".

**Non fait dans cette passe, à signaler honnêtement** : filtres Buteurs/Tirs/Tirs cadrés sur `marches.html` (risque jugé trop élevé d'éditer `renderMatchMarkets()` sans pouvoir l'exécuter en conditions réelles) ; traduction de la nouvelle section JOUEURS dans les 6 langues (copiée telle quelle en français par le build i18n, aucune règle de traduction ajoutée) ; re-vérification mobile 375px de la nouvelle section ; exécution réelle du pipeline complet (bloquée par les mêmes clés manquantes que d'habitude) ; revue de sécurité dédiée sur les nouveaux fichiers (au-delà des pratiques déjà en place : `esc()` systématique, aucun `eval`, aucune donnée non fiable injectée en HTML brut) ; Stripe (toujours `PAYMENT_PROVIDER=disabled`, jamais touché cette session, comme depuis le début de l'engagement).

npm test : 203/203.

### Rapport de lancement final

| Statut demandé | Valeur | Justification |
|---|---|---|
| `LAUNCH_READY` | **NON** | Plusieurs items ci-dessous restent `PARTIAL`/`TO_VERIFY`/`BLOCKED_EXTERNAL` — voir détail |
| `PLAYER_ENGINE_STATUS` | **FORWARD_VALIDATION_ONLY** | Modèle réel, testé, vérifié avec de vraies données ; aucun backtest hors échantillon réel exécuté — jamais promu `VALIDATED` par construction |
| `PIPELINE_PASS` | **PARTIAL** | Code branché et syntaxiquement vérifié (config/leagues.json, analysis_tier, Market Registry, odds snapshots, Player Engine tous réellement reliés) mais jamais exécuté de bout en bout cette session (secrets manquants localement) — `BLOCKED_EXTERNAL` pour la vérification E2E complète |
| `LEAGUES_PASS` | **PASS** | 13/13 ids et saisons vérifiés réellement contre l'API (suite 4) |
| `FREE_PRO_PASS` | **PASS** | Vérifié avec 2 vrais comptes Supabase + curl (jalons précédents) |
| `PAYWALL_PASS` | **PASS** | FREE verrouillé/PRO déverrouillé avec vraies données de compte (jalons précédents) |
| `MATCH_PASS` | **PARTIAL** | Structure/nav/JOUEURS vérifiés ; edge-function PRO toujours bloquée par la pause maintenance elle-même ; JOUEURS jamais peuplé avec un vrai match live (pas de run pipeline complet) |
| `MARKETS_PASS` | **PARTIAL** | Market Registry + audit réels et cohérents ; filtres Buteurs/Tirs/Tirs cadrés sur `marches.html` non ajoutés cette passe |
| `TOOLS_PASS` | **PASS** (jalon précédent, non retesté cette passe) | Calculateurs + séparation FREE/PRO déjà vérifiés |
| `ACCOUNT_PASS` | **PASS** (jalon précédent, non retesté cette passe) | Auth/onboarding/badges déjà vérifiés |
| `STRIPE_READY` | **BLOCKED_EXTERNAL** | `PAYMENT_PROVIDER=disabled` depuis le début de l'engagement, jamais de clé Stripe fournie |
| `SEO_PASS` | **PASS** pour ce qui a été vérifié (Historique noindex/sitemaps, jalon précédent) | Nouvelle section JOUEURS fait partie de `match.html` existant, pas une nouvelle page indexable |
| `I18N_PASS` | **PARTIAL** | Sélecteur 6 langues vérifié (jalon précédent) ; nouvelle section JOUEURS non traduite (copiée en français dans les 6 copies) |
| `MOBILE_PASS` | **PARTIAL** | Pages cœur vérifiées à 375px (jalon précédent) ; nouvelle section JOUEURS non retestée à 375px |
| `SECURITY_PASS` | **TO_VERIFY** | Pratiques sûres respectées dans le nouveau code (`esc()`, pas d'`eval`) mais pas de revue de sécurité dédiée cette passe |
| `TESTS_PASS` | **PASS** | 203/203, exécutés réellement |
| `FORWARD_VALIDATION_ONLY` | Voir `PLAYER_ENGINE_STATUS` | Statut du Player Engine, jamais `VALIDATED` sans backtest réel |
| `BLOCKED_EXTERNAL` | Pipeline E2E complet, Stripe, vraie session navigateur authentifiée | Limitations d'environnement documentées et inchangées depuis le début de l'engagement |

**Maintenance toujours active sur `main`, aucun merge.** Travail sur `hotfix-v2-acceptance` uniquement.

## Mise à jour 2026-08-30 (suite 5) : audit RÉEL odds/marchés + démarrage des snapshots de cotes

Demande explicite : auditer réellement les marchés/cotes API-Football sur les 13 ligues de lancement, comparer au Market Registry interne (`lib/market-registry.js`), classer chaque marché (`MODEL_SUPPORTED` / `ODDS_AVAILABLE_ONLY` / `MODEL_AND_ODDS` / `INSUFFICIENT_DATA` / `NOT_AVAILABLE`), ne jamais publier une probabilité IASHARK juste parce qu'un bookmaker propose le marché, et démarrer immédiatement la sauvegarde de nos propres snapshots de cotes.

### 1-2. Catalogues réels (`scripts/audit-odds-markets.js`, appels `/odds/bets` et `/odds/bookmakers`)

- **338 types de marché** dans le catalogue API-Football.
- **33 bookmakers** dans le catalogue API-Football.

### 3. Cotes réelles sur plusieurs fixtures de chacune des 13 ligues

3 fixtures réelles à venir par ligue (39 au total), `/odds` interrogé pour chacune :

| Ligue | Fixtures avec cote | Bookmakers/fixture | Marchés distincts/fixture |
|---|---|---|---|
| Premier League | 3/3 | 12-13 | 175-177 |
| La Liga | 3/3 | 13 | 170-179 |
| Serie A | 3/3 | 13 | 173-175 |
| Bundesliga | 3/3 | 11-14 | 120-175 |
| Ligue 1 | 3/3 | 13 | 173-174 |
| Eredivisie | 3/3 | 13 | 152-155 |
| Liga Portugal | 3/3 | 13 | 149 |
| MLS | 3/3 | 10-12 | 114-143 |
| Allsvenskan | 3/3 | 13 | 129 |
| J1 League | 3/3 | 9-10 | 88 |
| **Champions League** | **0/3** | — | — |
| **Europa League** | **0/3** | — | — |
| **Conference League** | **0/3** | — | — |

**30/39 fixtures avec cote réelle, 184 marchés distincts réellement observés** sur l'ensemble. Les 3 compétitions UEFA n'ont **aucune cote publiée** sur leurs prochaines fixtures — cohérent avec le constat déjà fait dans la "suite 4" (phase de ligue 2026-27 pas encore démarrée, `standings` également absent côté couverture). Pas une anomalie de cet audit, la même cause réelle des deux côtés.

**Odds live (in-play)** : endpoint `/odds/live` interrogé réellement — 23 fixtures avec cote live tous sports/ligues confondus au moment du run, **0 dans nos 13 ligues de lancement** (aucun match de nos ligues n'était en cours à cet instant précis). Confirme que l'endpoint fonctionne, mais échantillon nul par pur hasard de timing — à ré-observer lors d'un run pendant un vrai créneau de matchs.

### 4. Rapport marché par marché (`odds-market-audit-report.json`)

Pour chacun des 184 marchés réellement observés : `bet_id`, nom API, liste des bookmakers qui le proposent réellement, nombre de fixtures où il apparaît, ligues où il apparaît, `pre_match_or_live`, et **fréquence réelle** (`fixture_count / fixtures_checked_with_odds`). Exemples réels :

| bet_id | Marché | Bookmakers | Fréquence réelle | Ligues |
|---|---|---|---|---|
| 1 | Match Winner | 14 | 1.0 (30/30) | 10/10 |
| 5 | Goals Over/Under | 12 | 1.0 (30/30) | 10/10 |
| 45 | Corners Over Under | 9 | 1.0 (30/30) | 10/10 |
| 80 | Cards Over/Under | 6 | 0.733 (22/30) | 8/10 |
| 212 | Player Assists | 3 | 1.0 (30/30) | 10/10 |
| 213 | Player Triples | 1 | 0.133 (4/30) | — |
| 172 | Fouls. Double Chance | 1 | 0.033 (1/30) | 1/10 |

Constat marquant, vérifié en direct (pas supposé) : **aucun bet type plein-match "Draw No Bet"** n'existe dans le catalogue des 338 marchés — seuls "Draw No Bet (1st Half)" et "(2nd Half)" existent. Les marchés Corners/Cards/Player Props sont réellement proposés et liquides chez les bookmakers (fréquence 0.13 à 1.0 selon le prop) — confirme que le Market Registry a raison de les marquer `NOT_SUPPORTED` : la donnée bookmaker existe, c'est bien nous qui n'avons aucun modèle.

### 5-7. Comparaison au Market Registry + classification (`scripts/classify-market-audit.js`, `market-audit-classification.json`)

Règle appliquée sans exception : **un marché n'est jamais publié avec une probabilité IASHARK juste parce qu'un bookmaker le propose** — il faut un modèle mathématique spécifique côté nous (`model_function` réel dans le registry). Résumé réel :

| Statut | Nombre |
|---|---|
| `MODEL_AND_ODDS` | 9 |
| `MODEL_SUPPORTED` | 2 |
| `ODDS_AVAILABLE_ONLY` | 148 |
| `INSUFFICIENT_DATA` | 8 |
| `NOT_AVAILABLE` (marché registry sans aucune correspondance) | 0 |
| Marchés du catalogue jamais observés dans cet audit | 154 |

Détail par marché du Market Registry :

| Marché IASHARK | Statut registry | Classification de cet audit | Cote(s) bookmaker correspondante(s) |
|---|---|---|---|
| MATCH_WINNER | MODELLED_AND_VALIDATED | **MODEL_AND_ODDS** | Match Winner |
| DOUBLE_CHANCE | MODELLED_AND_VALIDATED | **MODEL_AND_ODDS** | Double Chance |
| DRAW_NO_BET | MODELLED_EXPERIMENTAL | **MODEL_SUPPORTED** | aucune (pas de bet type plein-match équivalent dans le catalogue) |
| TOTAL_GOALS | MODELLED_AND_VALIDATED | **MODEL_AND_ODDS** | Goals Over/Under |
| TEAM_TOTALS | MODELLED_EXPERIMENTAL | **MODEL_AND_ODDS** | Total - Home, Total - Away |
| BTTS | MODELLED_AND_VALIDATED | **MODEL_AND_ODDS** | Both Teams Score |
| CLEAN_SHEET | MODELLED_EXPERIMENTAL | **MODEL_AND_ODDS** | Clean Sheet - Home/Away |
| WIN_TO_NIL | MODELLED_EXPERIMENTAL | **MODEL_AND_ODDS** | Win To Nil (+ Home/Away) |
| EXACT_SCORE | MODELLED_EXPERIMENTAL | **MODEL_AND_ODDS** | Exact Score |
| GOAL_BANDS | MODELLED_EXPERIMENTAL | **MODEL_SUPPORTED** | aucune (bandes de buts = métrique propre à IASHARK, pas pricée par les bookmakers) |
| HANDICAP_WHOLE_HALF | MODELLED_AND_VALIDATED | **MODEL_AND_ODDS** | Asian Handicap |
| HANDICAP_QUARTER | NOT_SUPPORTED | **ODDS_AVAILABLE_ONLY** | Asian Handicap (lignes quart incluses dans le même flux ; notre resolver refuse explicitement de les régler) |
| HALF_TIME_MARKETS | NOT_SUPPORTED | **ODDS_AVAILABLE_ONLY** | First Half Winner, Goals O/U 1st Half, BTTS 1st Half, HT/FT Double |
| CORNERS | NOT_SUPPORTED | **ODDS_AVAILABLE_ONLY** | Corners O/U, Corners 1x2, Home/Away Corners O/U |
| CARDS | NOT_SUPPORTED | **ODDS_AVAILABLE_ONLY** | Cards O/U, Cards Asian Handicap, Home/Away Total Cards |
| PLAYER_PROPS | NOT_SUPPORTED | **ODDS_AVAILABLE_ONLY** | Player Assists, Shots, Singles, Score-or-Assist |

**Incohérence trouvée et corrigée dans le Market Registry lui-même** (effet de bord positif de cet audit) : `DRAW_NO_BET` était codé `availability_status: "MODELLED_AND_VALIDATED"` alors que sa propre note interne disait déjà "à considérer MODELLED_EXPERIMENTAL tant qu'aucun échantillon réel n'existe" — corrigé en `MODELLED_EXPERIMENTAL` dans `lib/market-registry.js`, cohérent maintenant avec le fait (confirmé par cet audit) qu'aucune cote réelle plein-match n'existe pour ce marché.

Les 148 marchés `ODDS_AVAILABLE_ONLY` restants (non mappés à une entrée du registry) sont classés par une règle objective et documentée dans le script : bookmaker(s)/fréquence suffisants → `ODDS_AVAILABLE_ONLY` (cote brute affichable, jamais de probabilité IASHARK) ; 1 seul bookmaker ET fréquence < 0.3 → `INSUFFICIENT_DATA` (8 marchés, ex. "Fouls. Odd/Even" à 0.033/1 bookmaker — trop marginal même pour un simple affichage de cote).

### 8. Démarrage réel de nos propres snapshots de cotes (l'historique API est limité)

- **Nouvelle table Supabase `odds_snapshots`** (migration `create_odds_snapshots_table`, projet `ksvjraqitxouwiabecai`) : append-only, `raw_odds jsonb`, RLS activé sans policy publique (même pattern que `match_snapshots`/`match_premium_data` — accès service_role uniquement). Créée réellement et vérifiée par une requête `information_schema.columns` indépendante (pas seulement le `{"success":true}` de la migration).
- **`scripts/save-odds-snapshot.js`** (nouveau) : capture réellement `/odds` sur les fixtures à venir des 13 ligues et écrit dans `odds_snapshots` (insert direct via `SUPABASE_SERVICE_ROLE_KEY`, même pattern `upsertJSON` que `writeSnapshots`/`writePremiumData` dans le pipeline). Sans clé Supabase, le script récupère quand même les cotes réelles mais les écrit dans un fichier local (`odds-snapshots-local.json`, gitignoré) plutôt que de prétendre les avoir persistées — testé réellement dans cette session (30 fixtures, 30 snapshots réels capturés en local, fichier ensuite supprimé du dépôt car 19 Mo, bien trop volumineux pour être commité).
- **Bootstrap réel effectué aujourd'hui** : 2 lignes réelles insérées directement dans `odds_snapshots` (Premier League Chelsea vs Brighton, MLS Columbus Crew vs New England Revolution — cotes réelles William Hill/10Bet), vérifiées par une requête `select` indépendante (pas seulement le retour de l'insert). Colonnes `bookmaker_count`/`market_count` renseignées avec les vrais totaux observés (12/177 et 11/143) même si le `raw_odds` de ce bootstrap est volontairement réduit à 1 bookmaker pour rester gérable manuellement (`source: 'manual_audit_bootstrap_proof'`, distinct du `source: 'pipeline'` que les runs automatisés utiliseront).
- **Nouvelle étape CI** ajoutée dans `.github/workflows/update-data.yml` ("Sauvegarder un snapshot reel des cotes") : s'exécute avant chaque run du pipeline, avec les vrais secrets `APISPORTS_KEY`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de la CI — c'est ce mécanisme, pas le bootstrap manuel d'aujourd'hui, qui capturera la capture RAW complète (tous bookmakers, tous marchés) à chaque run à partir de la mise en production de cette branche.
- **`tests/classify-market-audit.test.js`** (nouveau, 6 tests) : verrouille la règle §8 (jamais de `MODEL_AND_ODDS` sans modèle réel, même si la cote est très fréquente) au niveau du code, pas seulement de la documentation.

npm test : 178/178 (172 + 6 nouveaux). Toujours sur `hotfix-v2-acceptance`, `main` reste en maintenance — aucun merge.

## Mise à jour 2026-08-30 (suite 4) : vérification RÉELLE des 13 compétitions (clé API-Football fournie)

L'utilisateur a fourni `APISPORTS_KEY` dans un `.env` local (confirmé gitignoré avant toute manipulation : `.gitignore` contient déjà `.env` et `.env.*`, jamais affichée/loguée/committée). `scripts/verify-league-coverage.js` a été exécuté pour de vrai contre l'API-Football en production — ceci remplace/complète la limite honnête documentée dans la mise à jour précédente (suite 3), qui n'avait pu construire que l'architecture sans pouvoir l'exécuter.

### Résultat réel du run (`league-coverage-report.json`, généré le 2026-08-30T08:35 UTC)

| Compétition | Id vérifié | Saison résolue | Tier réel | Détail |
|---|---|---|---|---|
| Premier League | 39 (nom API confirmé) | 2026 | **FULL_ANALYSIS** | fixtures/lineups/stats équipe+joueur/standings/injuries tous actifs |
| La Liga | 140 | 2026 | **FULL_ANALYSIS** | idem |
| Serie A | 135 | 2026 | **FULL_ANALYSIS** | idem |
| Bundesliga | 78 | 2026 | **FULL_ANALYSIS** | idem |
| Ligue 1 | 61 | 2026 | **FULL_ANALYSIS** | idem |
| Eredivisie | 88 | 2026 | **FULL_ANALYSIS** | idem |
| MLS | 253 (nom API "Major League Soccer") | 2026 | **FULL_ANALYSIS** | idem |
| Allsvenskan | 113 | 2026 | **FULL_ANALYSIS** | idem |
| Liga Portugal | 94 (nom API "Primeira Liga") | 2026 | **STANDARD_ANALYSIS** | tout actif sauf `injuries` — ce module ne sera pas fabriqué pour cette compétition |
| J1 League | 98 | **2027** | **STANDARD_ANALYSIS** | tout actif sauf `injuries` ; saison résolue = 2027 (voir explication ci-dessous) |
| Champions League | 2 (nom API "UEFA Champions League") | 2026 | **LIMITED_DATA** | `standings=false` (voir investigation ci-dessous) |
| Europa League | 3 | 2026 | **LIMITED_DATA** | `standings=false`, et `fixtures.statistics_players=false`, `injuries=false` |
| Conference League | 848 | 2026 | **LIMITED_DATA** | `standings=false` |

**8 FULL_ANALYSIS, 2 STANDARD_ANALYSIS, 3 LIMITED_DATA.** Aucune valeur fabriquée : chaque ligne provient directement du champ `coverage` retourné par `/leagues?id=X`.

### IDs et config : rien de faux trouvé, un faux-positif corrigé

Les 13 `apiFootballId` utilisés dans `config/leagues.json` (choisis dans la session précédente à partir de la documentation publique API-Football, sans pouvoir les re-tester alors) sont **tous confirmés corrects** : le nom retourné par l'API correspond au nom attendu pour chacun des 13 (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UEFA Champions League, UEFA Europa League, UEFA Europa Conference League, Eredivisie, Primeira Liga, Major League Soccer, Allsvenskan, J1 League). Aucun id/saison n'était faux — rien à corriger sur ce plan.

Un seul ajustement fait : le contrôle de correspondance de nom du script comparait `"Major League Soccer".includes("mls")`, ce qui est faux par construction (l'API ne renvoie jamais le sigle) et générait un avertissement "nom ne correspond pas" alors que l'id 253 est bien le bon. Corrigé en ajoutant un champ `apiNameHint` optionnel dans `config/leagues.json` (`"Major League Soccer"` pour l'entrée `mls`) que le script compare en priorité — élimine le faux avertissement sans toucher à l'id (qui n'a jamais été en cause). Re-exécuté après correctif : rapport identique, plus aucun avertissement.

### Investigation réelle : pourquoi Champions League / Europa League / Conference League sortent en `LIMITED_DATA`

Pas pris au mot le flag `coverage.standings=false` sans le recontrôler directement :

- **`GET /standings?league=2&season=2026`** interrogé en direct : `results: 0`, réponse vide — confirme que le flag n'est pas trompeur, les standings sont réellement absents pour cette saison actuellement.
- **`GET /leagues?id=2`** relu en entier (historique complet des saisons) : **toutes** les saisons 2011 à 2025 ont `coverage.standings=true` ; seule la saison 2026 (marquée `current:true` par l'API) a `standings=false`, avec une fenêtre de dates anormalement courte (`2026-07-07` → `2026-09-08`, contre ~10 mois pour les saisons précédentes).
- **`GET /fixtures?league=2&season=2026&next=3`** confirme que les fixtures elles-mêmes sont réelles et à jour (ex. Club Brugge KV vs Aston Villa, 2026-09-08, round "Group Stage").

Conclusion : ce n'est pas une erreur de configuration ni un bug du script — c'est un état réel et temporaire de l'API-Football, cohérent avec le calendrier UEFA (nous sommes le 2026-08-30, la phase de qualification est en cours, la phase de ligue à 36 équipes démarre mi-septembre ; le tableau de classement n'existe pas tant que cette phase n'a pas commencé). `resolveSeason()` a fait exactement ce qu'il doit faire : suivre le flag `current` de l'API sans jamais deviner, donc refléter cet état honnêtement en `LIMITED_DATA` plutôt que de forcer un repli sur la saison 2025 (déjà terminée le 2026-05-30, donc inutile pour analyser des matchs à venir). **Auto-correctif attendu sans changement de code** : une prochaine exécution de `scripts/verify-league-coverage.js`, une fois la phase de ligue lancée en septembre, devrait faire remonter ces 3 compétitions en `FULL_ANALYSIS` — à recontrôler avant la fusion en production.

### J1 League : saison résolue 2027, pas une erreur

Fenêtre retournée par l'API pour la saison `current:true` : `2026-08-07` → `2027-06-06`. Ceci correspond à la transition réelle et documentée du J.League vers un calendrier automne-printemps ("shift to autumn-to-spring") à partir du cycle 2026-27 — le script l'a détecté et utilisé sans intervention manuelle, exactement le comportement recherché en remplaçant l'ancien système `SEASON_2026` codé à la main.

### Tests multi-ligues réels (fixtures/team stats/player stats/injuries/lineups/fixture statistics)

Demande explicite de tester "plusieurs fixtures réelles sur plusieurs ligues" — fait en direct (hors du script, appels `curl` bruts contre l'API en production) :

- **Premier League** : 3 fixtures à venir récupérées (Chelsea vs Brighton, Leeds vs Brentford, Sunderland vs Fulham, 2026-08-30) ; team stats Chelsea réelles (1 match joué, forme "W") ; **304 vraies blessures actives** récupérées via `/injuries?league=39` (ex. D. Kulusevski, Tottenham, "Knee Injury") ; lineups réels sur le dernier match joué Tottenham vs Newcastle (formations 4-2-3-1 des deux côtés, 11 titulaires chacun) ; fixture statistics réelles sur ce même match (18 types de stats par équipe).
- **MLS** : 3 fixtures réelles à venir (Columbus Crew vs New England Revolution, St. Louis City vs FC Dallas, New York City FC vs Nashville SC).
- **Liga Portugal** : 3 fixtures réelles à venir (Nacional vs Estrela, Casa Pia vs Moreirense, Famalicão vs Gil Vicente) ; standings réels (18 équipes, FC Porto 1er avec 12 pts).
- **Champions League** (malgré son tier `LIMITED_DATA`) : fixtures réelles quand même récupérées (Club Brugge vs Aston Villa, AEK Athènes vs LASK, Lille vs Real Betis, 2026-09-08) — confirme que `LIMITED_DATA` ne bloque pas les fixtures elles-mêmes, seulement les modules réellement absents (standings ici), conformément à la consigne "ne pas fabriquer, mais ne pas non plus tout bloquer".

Aucune donnée simulée dans cette section : toutes les valeurs ci-dessus sont copiées directement des réponses JSON réelles de l'API.

npm test : 172/172 après le correctif `apiNameHint` (`node --check` + suite complète re-exécutés).

## Mise à jour 2026-08-30 (suite 3) : liste de lancement officielle des compétitions (FULL ANALYSIS)

Décision utilisateur : restreindre le lancement à 13 compétitions fortes et bien couvertes plutôt que la trentaine de championnats/coupes hétérogènes couverts jusqu'ici (dont plusieurs 2èmes divisions et championnats peu couverts). Liste officielle : Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Conference League, Eredivisie, Liga Portugal, MLS, Allsvenskan, J1 League.

**Limite honnête à signaler avant tout** : cet environnement d'exécution n'a pas accès à `APISPORTS_KEY` (secret GitHub Actions uniquement, confirmé absent en local — ni fichier `.env`, ni variable d'environnement, ni token `gh`/GitHub disponible ici). Il n'a donc pas été possible d'appeler réellement `/leagues?id=X` depuis cette session pour confirmer en direct les ids/saisons/coverage. Plutôt que de fabriquer une "vérification" que je n'ai pas pu exécuter, la couverture est maintenant **vérifiée pour de vrai, automatiquement, à chaque exécution du pipeline réel (qui a le secret)** :

- **`config/leagues.json`** (nouveau) : identité des 13 compétitions (id API-Football, clé interne, mapping cotes best-effort, indicateur "qualification européenne possible"). Les 13 `apiFootballId` utilisés sont les identifiants publics documentés par API-Football, stables depuis plusieurs saisons (ex. Premier League=39, Champions League=2, Conference League=848, J1 League=98) — connaissance publique, pas une supposition, mais **pas ré-authentifiée par un appel réel dans cette session**. C'est exactement pour ça que le système ci-dessous existe.
- **`scripts/verify-league-coverage.js`** (nouveau) : appelle réellement `/leagues?id=X` pour chacune des 13 compétitions, lit la saison marquée `current:true` par l'API (jamais devinée à partir du nom de la ligue — élimine l'ancien système `SEASON_2026` codé en dur qui listait des ids à la main), et calcule `FULL_ANALYSIS` / `STANDARD_ANALYSIS` / `LIMITED_DATA` à partir du vrai champ `coverage` retourné par l'API (fixtures/lineups/statistics_fixtures/statistics_players/standings/players/injuries — les cotes ne conditionnent jamais le tier). Si la clé est absente ou qu'un appel échoue, le script **n'écrit rien** plutôt que d'inventer une valeur (`process.exitCode=1`, testé en local : confirmé qu'aucun `league-coverage-report.json` n'est produit sans clé). 9 tests unitaires (`tests/verify-league-coverage.test.js`) couvrent la logique de tiering et de résolution de saison sans dépendre du réseau.
- **`.github/workflows/update-data.yml`** : nouvelle étape "Verifier la couverture reelle des ligues de lancement" exécutée avant chaque run du pipeline (avec le vrai secret `APISPORTS_KEY`), qui écrit `league-coverage-report.json` — désormais commité automatiquement par l'étape de commit existante. Le pipeline lit ce rapport pour choisir la vraie saison de chaque ligue (`seasonForLeague()`, repli sur 2025 avec avertissement explicite en console si aucun rapport n'existe pour une ligue) et tague chaque match avec son `analysis_tier` réel (`analysisTierForLeague()`, `UNVERIFIED` tant qu'aucune vérification n'a eu lieu — jamais `FULL_ANALYSIS` par défaut). L'ancien tableau `LEAGUES` (35 ids codés en dur, mélange de championnats forts et de divisions secondaires) et le tableau `SEASON_2026` sont supprimés, remplacés par une lecture de `config/leagues.json` — la liste est maintenant éditable sans toucher au pipeline.
- **Effets de bord corrigés en cohérence** : `TOP` (seuils de lambda Poisson) référence maintenant directement les 13 ligues de lancement au lieu d'une sous-liste ad hoc de 7 ; `EUROPEAN_LEAGUE_KEYS` (alerte "en course pour l'Europe") dérivée du champ `europeanQualification` de la config, purgée des clés de championnats retirés (Championship anglais, D2 espagnole/italienne, Écosse, Belgique, Corée, Chine, etc.) ; le mapping cotes Pinnacle/the-odds-api étendu aux 13 clés (et corrigé au passage : `'premier'` pointait par erreur vers `soccer_england_league1`, une division inférieure — désormais `soccer_epl`). Ces clés `oddsSportKey` sont des noms publics documentés par the-odds-api, non ré-vérifiés en direct dans cette session non plus — sans conséquence sur la justesse de l'analyse puisque les cotes restent strictement facultatives (`getPinnacleOdds` retourne `null` sur toute erreur/mismatch, jamais une exception).
- **Ce que ça ne fait PAS (à l'époque de cette entrée)** : à ce stade, rien n'affirmait encore que les 13 compétitions étaient confirmées `FULL_ANALYSIS`. **Mis à jour depuis** : la vérification réelle a été exécutée (clé fournie par l'utilisateur) — voir la section "suite 4" au-dessus pour le résultat réel (8 `FULL_ANALYSIS`, 2 `STANDARD_ANALYSIS`, 3 `LIMITED_DATA`).

npm test : 172/172 (163 existants + 9 nouveaux sur `verify-league-coverage.js`).

## Mise à jour 2026-08-30 (suite 2) : ES/IT/PT vérifiés + retrait public d'Historique/Archives

### ES/IT/PT — vérification visuelle terminée (desktop + mobile, 7 pages)

Balayage structurel réel (extraction des `href`/labels de nav depuis les fichiers générés, pas une supposition) sur les 7 pages × ES/IT/PT : nav identique partout (5 items après le retrait d'Historique — voir ci-dessous), aucune incohérence trouvée. Complété par une vérification navigateur réelle (captures d'écran, pas seulement du texte) : ES desktop (`pro.html`) + ES mobile (`marches.html`), IT desktop (`match.html`) + IT mobile (`compte.html`), PT desktop (`index.html`) + PT mobile (`historique.html`, pour confirmer que la page retirée du public reste fonctionnelle en interne). Aucune régression trouvée. Console vérifiée propre sur chaque page (seul bruit sandbox habituel : 502/401 sur les appels Supabase bloqués).

### Historique/Archives retiré du produit public

Sur décision explicite de l'utilisateur : la page reste en ligne et fonctionnelle (aucune donnée Supabase supprimée, vérifié en rechargeant `historique.html` avec les 291 vrais paris toujours affichés), mais n'est plus découvrable publiquement.

- **Navigation** : le lien "HISTORIQUE"/"Historique" retiré de la nav-bottom des 6 pages qui l'avaient (`index`, `marches`, `match`, `pro`, `compte`, `confidentialite`), racine + 6 langues. `historique.html` garde son propre lien actif vers lui-même (navigation interne normale une fois sur la page), c'est le seul endroit où le mot reste.
- **CTA publics retirés** : carte "VOIR →" du dashboard `compte.html` (remplacée par une carte "MARCHÉS", garde l'équilibre visuel à 2 colonnes plutôt que de laisser un trou) ; section entière "Rien à cacher, tout est tracé" + CTA "VOIR L'HISTORIQUE COMPLET" sur `landing.html` (supprimée, pas juste masquée) ; lien "Historique" du 404 (remplacé par "Marchés") ; 5 références dans 2 guides du blog qui pointaient vers "la page Historique" comme preuve de confiance (texte reformulé pour rester honnête sans pointer vers une page non listée, y compris dans le JSON-LD FAQ).
- **ROI/winrate legacy retiré ailleurs** : `a-propos.html` avait toute une section "Ce qu'un ROI de 20% veut vraiment dire" + un tableau de performance par marché, alimentés en direct par `historique.json` — supprimés entièrement, aucune nouvelle statistique inventée pour remplacer. **Distinction vérifiée et documentée** : le ROI/winrate affiché dans `pro.html` ("Mon Suivi") est calculé à partir des paris que l'utilisateur suit lui-même (`PARIS`, son propre `localStorage`), jamais des résultats globaux de l'ancien moteur — n'a pas été touché, ce n'est pas le même sujet. Le winrate affiché sur `match.html` est celui d'un joueur de tennis réel (statistique tour, contexte du match), pas une performance IASHARK — vérifié, pas touché non plus.
- **`noindex`** : `historique.html` marqué `<meta name="robots" content="noindex, nofollow">`, propagation vérifiée sur les 6 copies générées (testé en direct sur la copie PT).
- **Retiré des sitemaps** : `historique.html` retiré de `STATIC_SITEMAP_PAGES` (pipeline) et du `sitemap-fr.xml` déjà commité ; nouveau flag `noSitemap: true` dans `scripts/i18n-manifest.js`, respecté par `scripts/i18n-sitemaps.js` (la page reste traduite/générée pour un usage interne, juste jamais listée dans un sitemap) — garde-fou de test ajouté (`tests/i18n-sitemaps.test.js` vérifie maintenant explicitement l'absence de toute page `noSitemap` dans chaque sitemap généré).
- **Aucun lien mort** : recherche exhaustive `historique.html` sur tout le dépôt (racine, blog, et les 6 dossiers de langue générés) — la seule occurrence restante est `historique.html` se référençant lui-même. Vérifié pour FR/EN/ES/DE/IT/PT.

163/163 tests verts (dont le nouveau garde-fou noSitemap).

## Mise à jour 2026-08-30 (suite 1) : sélecteur de langue + passe 21st.dev pragmatique

### Sélecteur de langue — FAIT, visible et fonctionnel

Ajouté sur les 7 pages coeur (`index`, `marches`, `match`, `pro`, `compte`, `historique`, `landing`) : script partagé `lang-switcher.js` (racine, non dupliqué par locale — même patron que `funnel-track.js`), monté dans le header de chaque page.

- **Desktop** : pastille "XX ▾" à côté de CONNEXION (ou du pill de page pour `compte.html`) — clic ouvre un menu déroulant listant les 6 langues (code + nom natif + coche sur la langue active), même langage visuel que le reste du site (carte sombre, bordure cyan au survol).
- **Mobile** : même composant, même position, testé à 375px — aucun débordement, dropdown fonctionnel (vérifié en appelant le toggle réel, pas juste visuellement).
- **Redirection vers l'URL équivalente** : le clic navigue vers la même page dans la langue choisie (`/pro.html` → `/en/pro.html`), **vérifié réellement** (navigation confirmée, pas juste le HTML du lien).
- **Mémorisation** : le choix est stocké (`localStorage`). Au prochain chargement d'une page non préfixée dans la même session, une redirection automatique **unique** vers la langue mémorisée se déclenche (jamais répétée dans la même session, pour ne pas combattre une navigation volontaire dans une autre langue) — **vérifié réellement** : après avoir choisi EN, visiter `/marches.html` redirige vers `/en/marches.html` une fois, puis `/historique.html` reste en FR (pas de seconde redirection forcée).
- Vérifié en direct FR (desktop + mobile), EN (desktop + mobile), DE (desktop + mobile).

163/163 tests toujours verts après ajout (aucune règle i18n cassée — le composant ne contient aucun texte à traduire, les noms de langue restent dans leur propre script).

### Passe 21st.dev — pragmatique, sans React

21st.dev interrogé (recherche de composants, gratuite) comme référence de patterns UI uniquement — aucun code installé (confirmé architecturalement incompatible avec le site statique sans bundler, voir rapport précédent). Améliorations réelles apportées, dans le langage visuel IASHARK existant :

- **Dropdowns** (`marches.html`, `pro.html`, `historique.html`) : les `<select>` de filtres (marché, tri) passaient par le rendu brut du navigateur — ajout d'un chevron custom (SVG, `appearance:none`) et d'états hover/focus cyan cohérents avec le reste du site. Le `<select>` natif est conservé volontairement (pas de réimplémentation JS complète) : c'est déjà accessible, navigable au clavier, et déclenche le picker natif sur mobile — remplacer ça par un composant custom aurait été un risque réel pour un gain cosmétique marginal, exactement le genre de "churn" que la consigne "pragmatique" demande d'éviter.
- **États vides** (`marches.html` "aucun marché exploitable", `historique.html` "aucun pari") : ajout d'une icône (loupe, cohérente avec le reste du vocabulaire d'icônes SVG du site) au-dessus du texte — remplace le bloc de texte brut par un vrai composant d'état vide.
- **Modal "Ajout rapide"** (`pro.html`) et **paywall/pricing** (`match.html`/`pro.html`/`landing.html`) : inspectés en direct, déjà conformes au niveau attendu (carte sombre, hiérarchie claire, aucun effet proscrit) — non retouchés, changement jugé non nécessaire plutôt que fait par principe.
- **Tabs Match, Compte** : inspectés, déjà cohérents (tabs segmentées existantes, cartes bien hiérarchisées) — non retouchés pour la même raison.

163/163 tests toujours verts après ces changements. Vérifié en direct : chevrons de dropdown et icônes d'état vide visibles et correctement stylés en FR/EN, aucune régression.

## Bugs réels trouvés et corrigés pendant cette recette

| # | Bug | Où | Gravité | Statut |
|---|---|---|---|---|
| 1 | `marches.html` (page racine, non préfixée FR) — le lien HISTORIQUE était **totalement absent** de la nav-bottom (5 items au lieu de 6, seule page du site dans ce cas) | `marches.html` + les 6 copies `/xx/marches.html` (règle i18n manquante, ajoutée) | **Réel, correspond exactement à la plainte de l'utilisateur** | Corrigé, vérifié en direct FR + EN |
| 2 | `match.html` (page racine) — le lien vers `/pro.html` était étiqueté **"PRO"** au lieu de "OUTILS", seule page du site dans ce cas. Les copies `/fr/match.html` etc. affichaient déjà "OUTILS" correctement (la règle i18n masquait le bug côté racine) | `match.html` (source racine) | Réel — incohérence de marque visible sur la page la plus importante du produit | Corrigé, vérifié |
| 3 | Guide `prediction-ia-football-guide-2026.html` — FAQ (JSON-LD + HTML visible) affichait **"accès VIP à partir de 9€/mois"** au lieu du vrai plan "Outils à 19,95€/mois" utilisé partout ailleurs sur le site | `blog/guides/prediction-ia-football-guide-2026.html` | **Réel, tarif faux publié** | Corrigé (JSON-LD + HTML) |
| 4 | Même guide — FAQ affirmait qu'IASHARK "utilise le modèle Claude d'Anthropic... combiné à des algorithmes d'analyse statistique" pour l'analyse, ce qui laisse croire que le LLM fait l'analyse statistique — contredit directement le principe architectural du MASTER ("LLM = explication uniquement", déjà vérifié ce chantier) | même fichier | Réel — désinformation sur le fonctionnement du produit | Corrigé (reformulé : modèles statistiques déterministes font le calcul, Claude rédige seulement l'explication) |
| 5 | **`coupe-du-monde-2026-guide-complet.html` (page SEO déjà indexée)** — affichait des pourcentages de victoire finale **fabriqués et attribués à "notre IA"** ("Notre IA attribue 18% de chances à la France", "11% selon notre IA" pour l'Argentine, etc.) alors que le moteur réel d'IASHARK ne fait AUCUNE prédiction d'issue de tournoi, seulement des probabilités match par match | même fichier | **Réel, sérieux — exactement le "faux positionnement" signalé par l'utilisateur** | Corrigé — section réécrite en analyse éditoriale explicitement non-algorithmique, avec disclaimer |
| 6 | Même page — FAQ (JSON-LD + HTML) : une question disait explicitement **"Notre IA recommande de parier maintenant sur les outsiders (Portugal, Pays-Bas, Maroc, USA) pendant que les cotes sont encore hautes"** — un conseil de pari direct attribué à une capacité IA fictive, publié dans des données structurées que Google peut afficher directement dans les résultats de recherche | même fichier | **Réel, le plus grave des 6 — conseil de pari non fondé attribué au produit** | Corrigé (JSON-LD + HTML), plus aucune formulation "notre IA recommande de parier" sur le site (vérifié par recherche globale) |

163/163 tests automatisés toujours verts après ces 6 corrections. Tous les fichiers i18n régénérés (`npm run build:i18n`) et re-vérifiés.

## Matrice de recette

Légende : **PASS** = vérifié réellement (preuve indiquée) · **TO_VERIFY** = pas encore re-vérifié dans cette recette (statut précédent invalidé par principe, pas encore recontrôlé) · **N/A** = non applicable à cette page.

| PAGE | MASTER REQUIREMENT | DESKTOP | MOBILE | ANON | FREE | PRO | DATA | STATUS |
|---|---|---|---|---|---|---|---|---|
| Nav globale (bottom-nav, toutes pages) | Cohérente partout, 6 entrées (Accueil/Marchés/Historique/Outils/Guides/Compte) | **PASS** — extraction réelle des `href`/labels sur les 7 pages racine + 6 copies EN, identiques après correction | **PASS** — capture d'écran réelle 375px sur `marches.html` | **PASS** | N/A | N/A | statique | **PASS** (2 bugs réels trouvés et corrigés, voir tableau ci-dessus) |
| `index.html` (Accueil) | Sélecteur sport, filtre jour, recherche, cartes match avec badges VALUE BET/SHARK LOCK | **PASS** — capture + inspection DOM | **PASS** — capture réelle 375px (serveur statique local), hero/recherche/filtres/empty-state propres, nav-bottom 5 items, aucun débordement | **PASS** | N/A | N/A | data.json vide en local (pas de vrai match du jour disponible dans cet environnement) | **PASS** (structure/nav desktop+mobile), **TO_VERIFY** (rendu avec un vrai match du jour, nécessite un run pipeline complet — voir section `TO_VERIFY`) |
| `marches.html` (Marchés) | Scanner du jour + Market Registry avec statuts VALIDATED/EXPERIMENTAL/NOT_SUPPORTED | **PASS** — capture réelle, table de statuts confirmée affichée (FR et EN) | **PASS** — capture 375px, table scrollable horizontalement confirmée par inspection (`overflow-x:auto` réel, pas juste déclaré en CSS) | **PASS** | N/A | N/A | Market Registry statique (réel, vérifié) ; scanner du jour vide (pas de match live) | **PASS** pour le registre ; **TO_VERIFY** pour le scanner avec de vrais matchs du jour |
| `match.html` (page flagship) | Probabilité modèle + fiabilité, analyse (marchés/modèles/attaque-défense/stats), décision ("pourquoi ce pari"), FAQ dynamique, paywall PRO | **PASS** — testé avec un **vrai match historique réel** (HFX Wanderers vs Forge, données réelles reconstituées d'un commit `data.json` réel) : bloc "SÉLECTION IA DU JOUR" (68% probabilité modèle, fiabilité ÉLEVÉE), onglet ANALYSE (consensus marché, Monte-Carlo 5000 sims, comparatif attaque/défense/forme/motivation, stats 10 derniers matchs), onglet DÉCISION (5 blocs "pourquoi ce pari" avec vraies valeurs interpolées), onglet EN SAVOIR+ (9 FAQ dynamiques réelles) — **confirmé : ce n'est PAS du code dormant** | **PASS** pour le shell/chrome (capture réelle 375px : état "ID MANQUANT" propre, nav/header cohérents, aucun débordement) — le contenu profond du flagship illustré en desktop n'a pas été re-capturé à 375px spécifiquement (même contenu responsive, pas de logique différente par breakpoint identifiée dans le CSS) | **PASS** | **PASS backend** (checkSession/plan réel vérifié), **TO_VERIFY frontend edge function** (bloqué par la pause maintenance elle-même — `match-data` dépend d'un fetch externe qui échoue tant que le site est en pause) | **PASS backend**, **TO_VERIFY frontend edge function** (même blocage) | Vraies données historiques (commit git réel), pas data.json vide | **PASS** contenu/structure ; **TO_VERIFY** le chemin edge-function PRO tant que la pause est active |
| `historique.html` (Archives) | **RETIRÉ DU PRODUIT PUBLIC** (décision explicite) : plus aucune entrée nav, aucun CTA public, `noindex`, retiré des sitemaps — mais reste fonctionnel en interne (aucune donnée supprimée), chargement archive complète Supabase | **PASS** — page interne vérifiée fonctionnelle (291 paris réels toujours affichés, PT testé), `noindex` confirmé sur le HTML généré, aucune page du site n'y renvoie (vérifié FR/EN/ES/DE/IT/PT) | **PASS** — page interne vérifiée à 375px (PT), aucun lien public non plus sur mobile | N/A (page non publique) | N/A | N/A | 291 vrais paris (production), intacts | **PASS** (retrait public + fonctionnement interne préservé) |
| `pro.html` (Outils) | Calculateurs FREE, séparation FREE/PRO réelle, checkout câblé | **PASS** — calculateurs testés, paywall FREE confirmé verrouillé avec de vraies données de compte FREE (via curl+injection), déverrouillé avec de vraies données de compte PRO | **PASS** (capture 375px) | **PASS** | **PASS** — `proWall.locked===true`, FAB caché, avec la vraie ligne `plan:'free'` obtenue par connexion réelle | **PASS** — `proWall.locked===false`, FAB visible, avec la vraie ligne `plan:'pro'` obtenue par connexion réelle | Réelles requêtes Supabase authentifiées | **PASS** |
| `compte.html` (Compte) | Auth, onboarding, badge de plan correct FREE/PRO | **PASS** — écran de connexion capturé, badge "GRATUIT"/"Plan Gratuit" avec vraie donnée FREE, badge "OUTILS"/"Plan Outils" avec vraie donnée PRO | **PASS** — capture réelle 375px, formulaire de connexion complet, onglet Compte actif dans la nav-bottom, aucun débordement | **PASS** | **PASS** (voir ci-dessus) | **PASS** (voir ci-dessus) | Réelles requêtes Supabase authentifiées | **PASS** |
| `admin.html` | Accès réservé réel, agrégats réels | TO_VERIFY (pas re-testé cette recette ; vérifié en base à un jalon précédent avec le vrai compte admin et un vrai compte non-admin) | **PASS** — capture réelle 375px, état « ACCÈS RÉSERVÉ » par défaut cohérent avec la vérification backend | **PASS** (état refusé par défaut) | N/A | N/A | Vraies requêtes SQL contre la base de production | **PASS** pour l'état refusé par défaut (desktop+mobile) ; **TO_VERIFY** les agrégats réels avec un vrai compte admin (pas re-testé cette recette, vérifié à un jalon précédent) |
| Guides/Blog | Pas d'ancien positionnement dangereux/faux | **PASS** — recherche globale + lecture manuelle de tous les guides, 6 problèmes réels trouvés et corrigés (voir tableau ci-dessus) | N/A | **PASS** | N/A | N/A | Contenu éditorial statique | **PASS** (après corrections) |
| Design (passe 21st.dev pragmatique) | Composants réellement améliorés, design IASHARK conservé strictement, pas de React installé | **PASS** — dropdowns (`marches`/`pro`/`historique`) et états vides (`marches`/`historique`) améliorés et vérifiés en direct ; modal/paywall/pricing/tabs inspectés et jugés déjà conformes (non retouchés, décision assumée) | **PASS** — vérifié à 375px sur `marches.html` (EN), aucune régression | **PASS** | N/A | N/A | — | **PASS** pour les composants listés dans la demande qui ont été jugés nécessitant une amélioration ; les autres (modal/paywall/tabs) sont `PASS` par inspection, pas par réécriture |
| i18n (6 langues) + sélecteur de langue | Rendu réel dans le navigateur, sélecteur visible et fonctionnel sur desktop + mobile, redirige vers l'équivalent localisé et mémorise le choix | **PASS** — FR/EN/DE : sélecteur vérifié en direct (dropdown ouvert, clic testé, redirection confirmée). ES/IT/PT : nav structurelle vérifiée sur les 7 pages + captures d'écran réelles (ES `pro.html`, IT `match.html`, PT `index.html`) confirmant sélecteur visible et contenu traduit | **PASS** — FR/EN/DE vérifiés à 375px. ES/IT/PT vérifiés à 375px également (ES `marches.html`, IT `compte.html`, PT `historique.html`), aucun débordement | **PASS** | N/A | N/A | — | **PASS pour les 6 langues** (FR/EN/DE en profondeur, ES/IT/PT structurel + captures réelles desktop/mobile) |
| Compétitions (liste de lancement) | 13 compétitions fortes (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Conference League, Eredivisie, Liga Portugal, MLS, Allsvenskan, J1 League), configurable, tiers dépendants de la vraie couverture API, pas de cote obligatoire | N/A (backend/config) | N/A (backend/config) | N/A | N/A | N/A | `league-coverage-report.json` réel (13/13 ids confirmés, appels `/leagues`/`/standings`/`/fixtures`/`/injuries`/lineups/fixture-statistics testés en direct sur 4 ligues) | **PASS** — 13/13 ids et saisons vérifiés réellement contre l'API : **8 `FULL_ANALYSIS`** (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, MLS, Allsvenskan), **2 `STANDARD_ANALYSIS`** (Liga Portugal, J1 League — `injuries` non couvert, non fabriqué), **3 `LIMITED_DATA`** (Champions League, Europa League, Conference League — `standings` réellement absent pour la saison en cours, investigué et expliqué : phase de ligue UEFA pas encore démarrée mi-septembre, ré-évaluation automatique attendue sans changement de code) |
| Marchés/odds (audit réel + classification) | Comparer les marchés bookmaker réellement disponibles au Market Registry, ne jamais afficher de probabilité IASHARK sans modèle propre, démarrer la sauvegarde de nos cotes | N/A (backend/config) | N/A (backend/config) | N/A | N/A | N/A | `odds-market-audit-report.json` (338 bet types, 33 bookmakers, 39 fixtures réelles testées sur les 13 ligues, 184 marchés réellement observés) + `market-audit-classification.json` (9 `MODEL_AND_ODDS`, 2 `MODEL_SUPPORTED`, 148 `ODDS_AVAILABLE_ONLY`, 8 `INSUFFICIENT_DATA`) + table Supabase `odds_snapshots` (2 lignes bootstrap réelles vérifiées) | **PASS** — audit et classification réels, aucun marché publié sans modèle propre (règle §8 verrouillée par 6 tests unitaires), 1 incohérence trouvée et corrigée dans `lib/market-registry.js` (DRAW_NO_BET), snapshots de cotes démarrés réellement (2 lignes bootstrap + mécanisme CI automatisé en place pour la capture complète à partir du premier run réel) |

## Ce qui reste `TO_VERIFY` (honnêtement, pas encore re-contrôlé dans cette recette)

- ~~Rendu mobile (375px) de `index.html`, `match.html`, `compte.html`, `admin.html`~~ — **RÉSOLU**, re-testé pour de vrai dans cette recette (serveur statique local `.claude/static-server.js`, viewport 375×812) : `index.html` (hero + recherche/filtres + empty state, nav-bottom 5 items confirmée), `match.html` (état "ID MANQUANT" propre sans `?id=`, nav/header cohérents — le contenu profond du flagship avec un vrai match reste vérifié à desktop uniquement, voir plus bas), `compte.html` (formulaire connexion complet, onglet Compte actif), `admin.html` (« ACCÈS RÉSERVÉ » par défaut, cohérent avec la vérification backend déjà faite). Aucune régression, aucun débordement horizontal sur les 4 pages. Bruit console habituel (502/401 Supabase bloqués par le sandbox) sans rapport avec le rendu.
- Le chemin `match-data` (Edge Function) pour le contenu PRO du flagship — actuellement impossible à tester de bout en bout car il dépend d'un fetch qui échoue tant que le site est en pause maintenance (effet de bord de la pause elle-même, pas un bug de code confirmé).
- ~~`league-coverage-report.json` réel~~ — **RÉSOLU** : l'utilisateur a fourni `APISPORTS_KEY` dans un `.env` local, le script a été exécuté pour de vrai. Voir la section "suite 4" plus haut pour le résultat complet (8 `FULL_ANALYSIS`, 2 `STANDARD_ANALYSIS`, 3 `LIMITED_DATA`, investigation des 3 `LIMITED_DATA`, correctif `apiNameHint`, tests multi-ligues). À re-contrôler une seule fois avant fusion en production si beaucoup de temps s'est écoulé (la couverture UEFA en particulier doit évoluer mi-septembre).
- Rendu de `index.html`/`marches.html` avec un **vrai match du jour reconstruit par un run complet du pipeline** — `APISPORTS_KEY` est désormais disponible (fixtures/team stats/injuries/lineups/standings testés en direct, voir suite 4), mais un run complet du pipeline (`node pipeline.js`) nécessite aussi `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_KEY`, `OPENWEATHER_KEY`, `NEWSAPI_KEY` pour produire un `data.json` complet et fidèle à la production — non tenté dans cette session (hors périmètre de la demande de vérification de couverture).
- `landing.html`, `checkout-succes.html`, `checkout-annule.html` — pas retestés dans cette recette (déjà vérifiés à un jalon précédent, pas de changement depuis).

## Décision

**La pause maintenance reste active sur `main`** (restaurée en urgence en tout début de cette recette, vérifié en direct sur `iashark.com`). Aucun merge ne sera fait sans feu vert explicite de l'utilisateur, après qu'il ait pu revoir ce document. Le travail de cette recette vit sur la branche `hotfix-v2-acceptance`, jamais mergée automatiquement.
