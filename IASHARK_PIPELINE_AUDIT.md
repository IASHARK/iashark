# IASHARK — Audit de la pipeline produit (moteur de prédiction)

Complète `FINAL_360_AUDIT.md` (front/sécurité/contenu/SEO) avec l'audit du moteur d'analyse lui-même : source de données → calcul → décision → historique → statistiques publiées. Voir `IASHARK_PIPELINE_MAP.md` pour la cartographie complète, référencée ici.

Méthodologie : lecture intégrale du fichier `.github/workflows/update-data.yml` (2694 lignes), recalcul manuel indépendant sur un échantillon réel de `historique.json` (sans réutiliser le code du site), traçage de matchs réels via `git show` sur des commits historiques de `data.json`, test live du frontend (serveur statique local, contournant la redirection maintenance).

---

## 1. Formules — inventaire et vérification

| Nom affiché | Formule réelle | Fichier:ligne | Verdict |
|---|---|---|---|
| Probabilité modèle (Poisson) | PMF Poisson standard, calcul en log-espace | [423](.github/workflows/update-data.yml:423) | **VÉRIFIÉ CORRECT** |
| Probabilité modèle (Dixon-Coles) | Poisson + correction petit score ρ=-0.13 (méthode publiée standard) | [450](.github/workflows/update-data.yml:450) | **VÉRIFIÉ CORRECT** |
| Probabilité modèle (Monte-Carlo) | 5000 tirages Poisson (algo de Knuth) | [479](.github/workflows/update-data.yml:479) | **VÉRIFIÉ CORRECT** |
| Probabilité "fair" depuis les cotes | Méthode de Shin (résolution Newton, retire la marge bookmaker) | [563](.github/workflows/update-data.yml:563) | **VÉRIFIÉ CORRECT** — plus rigoureux qu'une simple normalisation 1/cote |
| Probabilité finale ("ancrée") | Moyenne pondérée Poisson/DC/MC/Élo | [505](.github/workflows/update-data.yml:505) | **VÉRIFIÉ CORRECT** (pondérations arbitraires mais raisonnables, somme=100 forcée) |
| **edge** | `mk.prob+'% (modele)'` — probabilité du modèle recopiée telle quelle | [2602](.github/workflows/update-data.yml:2602) | **🔴 FAUX** — aucune soustraction à la probabilité marché, ce n'est pas un edge |
| **kelly** | `var kellyVal='2';` codé en dur, pour tous les matchs | [2564](.github/workflows/update-data.yml:2564) | **🔴 FAUX** — `fractionalKelly()` existe ([587](.github/workflows/update-data.yml:587)) mais **n'est appelée nulle part** (vérifié par recherche exhaustive) ; `nodeKelly` reste `null` du début à la fin ([2416](.github/workflows/update-data.yml:2416), [2544](.github/workflows/update-data.yml:2544)) |
| ROI global (`histo.stats.roi`) | Σ(cote−1 si gagné, −1 si perdu) / n, cote manquante → repli **1.75 fictif** | [1698](.github/workflows/update-data.yml:1698) | **PARTIELLEMENT CORRECT** — formule standard mais silencieusement faussée si cote absente (1 cas réel confirmé) |
| ROI mensuel (`histo.monthly[].roi`) | `(wins×0.75 − losses)/total` — paiement fixe supposé, **pas** la vraie cote | [1729](.github/workflows/update-data.yml:1729) | **🔴 FAUX / INCOHÉRENT** — 3ᵉ formule de ROI, différente des deux autres |
| Winrate | wins/total, standard | [1696](.github/workflows/update-data.yml:1696) | **VÉRIFIÉ CORRECT** |
| Confiance (score SHARK) | Auto-évaluation du LLM selon un barème écrit dans le prompt (5.5-9.0) | [1442-1445](.github/workflows/update-data.yml:1442) | **NON VALIDÉ EMPIRIQUEMENT** — voir §6 : corrélation inverse observée |
| Mise recommandée affichée sur le site | `'2-3% bankroll'` (chaîne fixe) | [2607](.github/workflows/update-data.yml:2607) | **🔴 FAUX** — cohérent avec `kelly` codé en dur, aucun calcul réel |

**Constantes hardcodées identifiées** : `kellyVal='2'`, `mise:'2-3% bankroll'`, cote de repli `1.75` (deux endroits, formules différentes), `risqueRaw` par défaut `'MODERE'`.
**Variable calculée mais jamais utilisée** : `nodeKelly` (toujours `null`), `fractionalKelly()` (fonction complète, zéro appel).

---

## 2. Vérification mathématique indépendante — 8 prédictions réelles, 8 marchés différents

Échantillon tiré directement de `historique.json` (un match par type de marché résolu), recalculé à la main **sans réutiliser `resolveMarketWin()` ni aucune fonction du site** :

| Match | Marché | Score | Résolution indépendante | Résolution IASHARK | Cote | P/L (1 unité) |
|---|---|---|---|---|---|---|
| SJK vs HJK Helsinki | Over 2.5 | 3-0 | 3 buts > 2.5 → **WIN** | win | 1.50 | +0.50 |
| Auda vs Ogre United | BTTS Oui | 4-1 | les deux marquent → **WIN** | win | 1.74 | +0.74 |
| IA Akranes vs Vikingur | Victoire Ext. | 2-2 | pas de victoire extérieure → **LOSS** | loss | 1.50 | −1.00 |
| Macara vs Guayaquil City | Under 2.5 | 2-1 | 3 buts, pas under → **LOSS** | loss | 1.62 | −1.00 |
| Bohemians vs Galway Utd | Victoire Dom. | 1-1 | nul, pas de victoire → **LOSS** | loss | 1.55 | −1.00 |
| Portland vs Seattle | DC X2 | 2-1 | domicile gagne, X2 perd → **LOSS** | loss | 1.68 | −1.00 |
| Univ. Catolica vs Tec. Univ. | BTTS Non | 5-0 | une équipe à 0 → **WIN** | win | 1.75 | +0.75 |
| Jeju Utd vs Gangwon FC | DC 1X | 1-1 | nul, 1X gagne → **WIN** | win | 1.65 | +0.65 |

**Résultat : 8/8 résolutions indépendantes concordent avec celles du site.** Sur cet échantillon, ROI recalculé = (0.50+0.74−1−1−1−1+0.75+0.65)/8 = **−17.0%** (4 gains/4 pertes), du même ordre que le −4.6% global sur 288 paris — cohérent, pas d'anomalie de résolution détectée.

**Verdict § marchés/résolution : PASS.** Le moteur qui décide gagné/perdu sur les 8 marchés implémentés est mathématiquement fiable. Le problème n'est pas là — il est dans la mise en scène commerciale (edge, kelly, chiffres affichés) autour de ce moteur par ailleurs correct.

**Preuve indépendante que "kelly=2" ne peut pas être du vrai Kelly** : la formule Kelly `f = (p·b − q)/b` dépend nécessairement de la cote (`b = cote−1`). Rien que dans cet échantillon de 8 paris, `b` varie de 0.50 à 0.75 — un vrai calcul de Kelly ne peut donc pas produire la même sortie pour tous, par construction mathématique, indépendamment de toute probabilité `p`. Le fait que la sortie soit constante ('2' partout) prouve, sans même regarder le code, qu'aucun calcul de Kelly n'a lieu.

**Limite reconnue** : je n'ai pas pu recalculer un "vrai" edge indépendant, faute de disposer de la probabilité modèle au moment exact de chaque prédiction historique — `historique.json` ne conserve que `prediction`/`cote`/`conf`/`result`, pas les probabilités p1/pN/p2 sous-jacentes. **BLOCKED** — voir §7 (reproductibilité).

---

## 3. Tous les marchés — GÉNÉRATION → AFFICHAGE → RÉSOLUTION

| Marché | Génération | Affichage | Résolution | Statut |
|---|---|---|---|---|
| Over/Under 2.5 buts | ✅ (`genAnalyse`) | ✅ | ✅ (`resolveMarketWin`) | **PASS** |
| BTTS Oui/Non | ✅ | ✅ | ✅ | **PASS** |
| Double Chance 1X / X2 | ✅ | ✅ | ✅ | **PASS** |
| Victoire sèche Dom./Ext. | ✅ | ✅ | ✅ | **PASS** |
| **Handicap** (+0.5 Dom/Ext observé réellement) | ✅ (catégorisé, [1670](.github/workflows/update-data.yml:1670)) | ✅ | ❌ aucune branche dans `resolveMarketWin` | **FAIL** — 2 prédictions réelles bloquées "scheduled" depuis le 9 juillet 2026 (7+ semaines) |
| Over/Under 1.5 / 3.5 | cotes récupérées (`co15`/`co35`) mais **jamais proposées** au choix du LLM (règle du prompt limite à 2.5) | — | non applicable (jamais généré en pratique) | **NOT_IMPLEMENTED** en tant que marché recommandable |
| Corners | données brutes collectées (contexte uniquement) | — | — | **NOT_IMPLEMENTED** comme marché parieur |
| Cartons | données brutes (score de risque discipline arbitre) | — | — | **NOT_IMPLEMENTED** comme marché parieur |
| Buts par équipe (ex. "Team to score X+") | non trouvé dans le code | — | — | **NOT_IMPLEMENTED** |

**Un marché générable mais non résolvable est un bug majeur confirmé, avec preuve datée réelle** (Handicap).

---

## 4. Logique de décision (`genAnalyse`)

- Prompt bien construit : ancrage numérique obligatoire ("cite un chiffre exact"), interdiction d'inventer un enjeu, règle de priorité au marché le mieux noté par le modèle statistique (règle 0), obligation de justifier tout écart (règle 0bis), vérification de cohérence avec les scores Monte-Carlo, `passe_ton_tour=true` si signal insuffisant.
- **Aucune vérification code après coup** que le LLM a respecté ces règles — dépendance pure à l'obéissance du modèle.
- **Flags temporaires trouvés** : `OUTILS_OPEN_FOR_ALL=true` (pro.html), `isPro = x || true` (match.html, bug — pas un flag intentionnel), `OPEN_FOR_ALL=true` (Edge Function Supabase, code mort de toute façon).
- **`TEST_WC_ONLY`** : lu depuis l'input manuel, jamais utilisé après sa déclaration — fonctionnalité fantôme, sans risque de fuite en prod mais trompeuse pour quiconque l'active en pensant qu'elle fait quelque chose.
- **`TEST_ONE_MATCH`** : codé en dur à `false` dans le source — sûr, nécessiterait une modification de code pour s'activer.
- Recommandation avec cote absente : `allMarkets` filtre déjà les cotes `'--'`/<1.50 avant le prompt — mais rien ne vérifie que `cote_rec` renvoyée par le LLM correspond à une vraie entrée de `allMarkets`.

---

## 5. Qualité et fraîcheur des données

- Pas de contrôle de fraîcheur des cotes (aucun horodatage comparé à l'heure du coup d'envoi).
- Pas de plage de validation sur les cotes Over/Under/BTTS/Handicap (seul le marché 1X2 est borné 1.05–15.0).
- Échec silencieux généralisé : chaque appel API (`get`/`getArr`/`getText`) résout en `{}`/`[]`/`''` sur toute erreur/timeout (10s) — **aucun match n'est jamais exclu** faute de données, il est publié avec des champs manquants/nuls et, pour les stats équipe, des **valeurs par défaut plates indiscernables d'une vraie équipe moyenne**.
- `market_source` (Pinnacle vs cotes moyennes vs aucune) est calculé mais **jamais exposé** dans `data.json` — l'utilisateur ne peut jamais savoir si une prédiction s'appuie sur de vraies cotes de marché ou sur rien.

---

## 6. Calibration du score de confiance — **le point le plus grave après le Kelly/edge**

Recalcul indépendant depuis `historique.json` (hors du champ `histo.backtesting` déjà stocké, pour validation croisée) :

| Tranche confiance | n | Gains | Pertes | Winrate | ROI |
|---|---|---|---|---|---|
| 6-7 | 137 | 78 | 59 | **56.9%** | **+1.2%** |
| 7-8 | 138-140 | 75-76 | 63-64 | 54.3% | −7.3% à −7.6% |
| 8+ | 11 | 4 | 7 | **36.4%** | **−38.6%** |

Recalcul indépendant confirme (à 2 entrées près, écart de bordure de tranche, négligeable) les chiffres stockés par le pipeline lui-même.

**La tranche de confiance la plus haute (8+/10, censée être "cas rarissime où absolument tout converge" selon le prompt) est la pire des trois, et de loin — pire qu'un tirage à pile ou face.** La tranche la plus basse testée (6-7) est la meilleure. La corrélation est inversée par rapport à ce que le produit vend.

Échantillon 8+ petit (n=11) — la significativité statistique est limitée, mais la direction est claire et va dans le sens le plus défavorable possible pour un produit vendu sur la fiabilité de son score de confiance. **Comment ce score est construit** : uniquement une auto-évaluation du LLM suivant un barème textuel (§4) — **aucune boucle de rétroaction n'existe qui recalibre ce barème sur la performance réelle historique**. Le score n'a, à ce stade, **aucune valeur prédictive démontrée** au sens statistique.

**Verdict : FAIL.**

---

## 7. Reproductibilité et observabilité

- Le prompt exact envoyé à Claude et sa réponse brute ne sont **jamais persistés** — ils n'existent que dans le log GitHub Actions (rétention par défaut 90 jours, non interrogeable après coup).
- **Aucun identifiant de version** (commit SHA, numéro de version d'algorithme) n'est stocké avec une prédiction dans `historique.json`.
- `git log --oneline -- .github/workflows/update-data.yml` → **235 commits en ~6 mois** (création 2026-03-02), plusieurs touchant directement la construction du prompt/la logique de score, sans changelog dédié.
- **Conséquence directe** : impossible de savoir sous quelle version du pipeline chaque entrée du backtest de 288 paris a été produite, ni de reproduire exactement pourquoi une prédiction passée a été faite. Une partie significative du backtest reflète une logique aujourd'hui modifiée, pas forcément la version actuelle.
- Non-déterminisme intrinsèque du LLM (même avec un input identique) — plafond de reproductibilité inhérent à l'architecture, indépendant de la qualité du code.

**Verdict : FAIL** sur la reproductibilité et l'observabilité — si une prédiction bizarre apparaît demain, il est aujourd'hui impossible d'expliquer son origine au-delà du texte déjà généré.

---

## 8. Pipeline / cron / CI

- Un seul workflow pertinent, déclenché par cron quotidien + déclenchement manuel — pas de `concurrency:` définie → un lancement manuel pendant le cron peut se chevaucher (conflit de `git push`, écrasement non atomique).
- **`main().catch(e => {console.error(...); process.exit(0);})`** [2664] — **toute erreur fatale est avalée et le job se termine en code 0 (succès)**. Un plantage en cours de route laisse le run GitHub Actions vert, et le commit se fait quand même sur l'état partiel (ou l'ancien fichier si le crash a eu lieu avant l'écriture). **Aucune alerte n'existe.**
- Écritures fichier (`fs.writeFileSync`, 9 occurrences) sans motif fichier-temporaire-puis-renommage — risque de corruption largement théorique ici (process unique séquentiel sur son propre checkout, pas de lecteur concurrent), le vrai risque est la masquation silencieuse ci-dessus, pas la corruption disque.
- Volume d'appels API : de l'ordre de plusieurs milliers d'appels externes par run (35 ligues × 3 dates + jusqu'à ~35-50 appels par match) — aucun monitoring de taux d'échec.

**Verdict : FAIL** sur l'observabilité des échecs (le point le plus grave de cette section), **PASS** relatif sur l'atomicité (risque réel faible vu l'architecture).

---

## 9. Données premium — preuve directe

Confirmé avec des données réelles (`git show 96fc7f62:data.json`, run du 2026-08-03) : le match "HFX Wanderers FC vs Forge" contenait dans le `data.json` **public, sans authentification** :
```
verdict_shark: "Over 2.5 à 1.73 - le modèle Poisson/Dixon-Coles/Monte-Carlo converge à 77% ..."
facteur_x: "Lambda Poisson de Forge à l'extérieur : 3.061 buts attendus, soit 3x le lambda de HFX..."
kelly: '2', edge: '77% (modele)', conf: 7.8, cote_rec: '1.73', vbet: 'OUI'
```
Texte d'analyse complet, chiffres, verdict — tout ce que le CGV vend à 19,95€/mois, disponible sans compte ni paiement, à toute personne appelant `data.json` directement. Le seul filtre censé exister (`PREMIUM_FIELDS` dans l'Edge Function Supabase) n'est jamais invoqué par le site.

**Verdict : FAIL — confirmé avec preuve réelle, pas théorique.**

---

## 10. Source unique de vérité

Chiffres de performance globale trouvés à travers le repo, comparés à la réalité (`historique.json` aujourd'hui : 54.9% / −4.6% / 288 paris) :

| Source | Winrate | ROI | Paris | Statut |
|---|---|---|---|---|
| `historique.json` (recalculé live par `historique.html`) | 54.9% | −4.6% | 288 | **Référence réelle** |
| `a-propos.html` (statique, 0 script) | 68% | +22% | 203 | **CONFLICTING** |
| Tableau par marché de `a-propos.html` (7 lignes) | — | — | — | **CONFLICTING sur les 7 lignes**, écarts jusqu'à 90+ points de ROI |
| `blog/guides/prediction-ia-football-guide-2026.html` | 62% (+"54% humain" non sourcé) | — | — | **CONFLICTING / UNVERIFIABLE_CLAIM** — un 3ᵉ chiffre |
| Même page : "confiance ≥7/10 → réussite >60%" | — | — | — | **CONFLICTING** — recalcul réel = 53.0%, et la tranche 8+ est la pire (§6) |
| `histo.stats.roi` (global, pipeline) | — | −4.6% | — | référence |
| `histo.monthly[].roi` (pipeline, même fichier) | — | formule différente (§1) | — | **CONFLICTING avec sa propre source** |

**Zéro statistique commerciale hardcodée ne devrait être présentée comme calculée en direct — trois pages violent ce principe, dont une à l'intérieur du pipeline lui-même (ROI mensuel vs global).**

---

## 11. Matrice de couverture complète

`PASS` = testé avec preuve · `FAIL` = problème trouvé avec preuve · `BLOCKED` = impossible à tester (raison donnée) · `NOT_IMPLEMENTED` = fonctionnalité inexistante

| # | Domaine | Statut | Preuves (résumé) |
|---|---|---|---|
| A | Pipeline data — source matchs/cotes, mapping, fraîcheur | **FAIL** | Sourcing api-football/Pinnacle correct (PASS partiel) ; mais recommandation possible avec données incomplètes/périmées **sans aucun avertissement affiché** (§5) ; `market_source` calculé mais caché ; défauts plats indiscernables d'une vraie équipe |
| B | Moteur de calcul — inventaire formules | **FAIL** | Poisson/Dixon-Coles/Monte-Carlo/Shin/Élo : PASS (§1) ; edge et kelly : FAIL confirmés (§1-2) |
| C | Test mathématique indépendant (10 prédictions) | **PASS** (résolution/ROI) + **BLOCKED** (edge) | 8/8 résolutions indépendantes correctes (§2) ; edge non re-testable — probabilité modèle historique non conservée dans `historique.json` |
| D | Tous les marchés (génération/affichage/résolution) | **FAIL** | 6 marchés OK 3/3 étapes ; Handicap généré+affiché mais **jamais résolu**, preuve réelle datée (§3) ; corners/cartons/buts équipe : NOT_IMPLEMENTED |
| E | Historique / backtest | **FAIL** | Pas de data leakage (PASS — cotes figées à la prédiction) ; pas de cherry-picking ni doublon (PASS) ; mais VOID absent du modèle de statut, cote manquante → repli fictif 1.75 (1 cas réel), formule ROI mensuel incohérente |
| F | Calibration du score de confiance | **FAIL** | Tranche 8+ = pire performance réelle (36.4% / −38.6%), tranche 6-7 = meilleure (56.9% / +1.2%) — corrélation inversée, confirmée par recalcul indépendant (§6) |
| G | Reproductibilité | **FAIL** | Aucun SHA/version stocké par prédiction ; prompt/réponse Claude jamais persistés ; 235 révisions du pipeline en 6 mois sans changelog (§7) |
| H | Pipeline / cron / CI | **FAIL** | `process.exit(0)` sur toute erreur fatale → échec silencieux garanti en CI verte ; pas de `concurrency:` ; volume API non monitoré (§8) |
| I | Données premium | **FAIL** | Confirmé avec données réelles historiques : `verdict_shark`/`facteur_x`/`kelly`/`edge` publics, sans auth (§9) |
| J | Source unique de vérité | **FAIL** | Au moins 3 chiffres de performance globale mutuellement contradictoires + incohérence interne du pipeline (ROI mensuel vs global) (§10) |
| K | Sécurité (auth, XSS, CSP, RLS, secrets, rate limit) | **FAIL** (partiel) + **BLOCKED** (partiel) | XSS réfléchie confirmée sur `match.html` (aucun CSP) ; pas de rate limit login ; auth/reset password réellement implémentés (PASS) ; requêtes Supabase correctement scopées dans le code (PASS) ; RLS réelle sur `users` **BLOCKED** — aucun schema/migration en dépôt |
| L | Abonnement / paywall (bout en bout) | **NOT_IMPLEMENTED** (paiement) + **FAIL** (accès) | Aucun Stripe/checkout/webhook nulle part malgré CGV commitée à 19,95€/mois ; mur payant contournable par 2 flags + accès direct à `data.json` sans aucune authentification |
| M | Claims commerciaux | **FAIL** | Tableau dédié §10 ; risque publicité trompeuse sur produit payant → `LEGAL_REVIEW_REQUIRED` |
| N | Exploitation (logs, alertes, rollback) | **FAIL** | Pas d'alerte sur échec pipeline ; `git revert` reste possible (rollback technique existant, PASS partiel) ; délai de détection d'une anomalie = illimité (aucun monitoring) |
| O | Front complet (mobile/desktop/formulaires/perf/a11y) | **PARTIAL / BLOCKED (exhaustivité)** | Spot-check live réel effectué (accueil, outils, historique — desktop + mobile 390px, serveur local hors redirection maintenance) : 0 erreur console, rendu propre, paywall confirmé ouvert en live ; **couverture non exhaustive** — pas testé sur les 5 breakpoints × toutes les pages ni sur plusieurs navigateurs |

**12 des 15 domaines évalués sont en FAIL avec preuve.** Un seul (C, le cœur mathématique de résolution des paris) est un PASS net. Aucun domaine n'a été laissé implicite ; là où la preuve n'était pas obtenable depuis le dépôt, le statut `BLOCKED` est explicite avec sa raison.

---

## 12. Chaîne complète expliquée sans trou

> API sportive (api-football/Pinnacle) → fixtures+cotes brutes → normalisation ID/fuseau/cotes → Poisson+Dixon-Coles+Monte-Carlo+Shin → probabilité ancrée → **Claude choisit le marché et rédige le verdict** → **edge = probabilité relabellisée (pas un vrai edge)** → **kelly = '2' codé en dur (pas calculé)** → confiance auto-évaluée par le LLM (non recalibrée, non corrélée empiriquement au succès réel, voire inversée) → `matchObj` complet (y compris champs premium) écrit dans `data.json` public → **aucun filtrage serveur réel** avant affichage → mur payant CSS/JS actuellement désactivé (2 mécanismes distincts) → match joué → résolution par correspondance texte (fiable sur 6 marchés, impossible sur Handicap) → `historique.json` (backtest honnête dans sa mécanique : pas de triche, pas de data leakage) → **mais les chiffres publiés ailleurs sur le site (`a-propos.html`, un article de blog) ne proviennent pas de ce calcul et le contredisent frontalement**.

Chaque maillon de cette chaîne a été tracé avec preuve de code et, pour plusieurs, avec des données réelles historiques. Aucun maillon ne reste une boîte noire non expliquée.

---

## 13. Verdict de cette section (pipeline uniquement)

Le moteur statistique sous-jacent (Poisson/Dixon-Coles/Monte-Carlo/Shin/Élo, résolution des paris sur 6 marchés/8) est **réel, correctement implémenté, et honnête dans sa mécanique de backtest** (pas de data leakage, pas de triche, pertes bien conservées). C'est la partie la plus solide de tout IASHARK.

Mais le produit tel que présenté et vendu au client (edge calculé, mise Kelly, score de confiance fiable, historique vérifiable "68%/+22%") **ne correspond pas à ce que le code fait réellement** sur trois points vérifiés indépendamment et avec preuve : le Kelly est une constante, l'edge est une probabilité rebaptisée, et les statistiques de performance affichées à l'endroit précis censé prouver la fiabilité du produit sont fabriquées et contredites par les propres données du système.

Ce sous-système ne peut pas, à lui seul, être déclaré prêt pour un lancement commercial payant. Détail des correctifs dans `FINAL_REMEDIATION_PLAN.md`.
