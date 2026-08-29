# IASHARK — Plan de correction

Ordre de reconstruction réel, en 8 phases. Pour chaque correction : `problème → cause racine → fichier → correction → risque de régression → test de validation`.
Rappel : `WHAT_NOT_TO_REWRITE` dans `FINAL_360_AUDIT.md` liste les composants du moteur mathématique à préserver tels quels — aucune des phases ci-dessous ne doit y toucher.

---

## PHASE 0 — ARRÊTER LES FAUSSES PROMESSES

Objectif : ne plus jamais afficher une donnée fausse à un visiteur, même si le reste n'est pas encore corrigé. C'est la phase la plus rapide et la plus urgente — elle peut être faite avant tout le reste.

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| `a-propos.html` affiche des stats fabriquées | Page statique jamais connectée à `historique.json` | `a-propos.html:190-207` | Soit rendre la page dynamique (fetch `historique.json`, réutiliser `calcStats()` d'`historique.html`), soit retirer le tableau chiffré et renvoyer vers `/historique.html` | Faible — page vitrine, pas de logique métier dépendante | Comparer les chiffres affichés à `historique.json` après déploiement, sur 3 marchés au hasard |
| Claim faux sur le blog ("≥7/10 → >60%") | Chiffre écrit à la main, jamais vérifié contre la réalité | `blog/guides/prediction-ia-football-guide-2026.html:182` | Retirer la phrase ou la remplacer par un chiffre recalculé et daté, avec mention de la fraîcheur des données | Aucune | Recalculer manuellement le winrate de la tranche citée avant publication |
| "62% vs 54% humain" non sourcé | Comparaison inventée sans méthodologie | même fichier, lignes 155,159,191,225 | Retirer toute comparaison "vs humain" tant qu'aucune méthodologie n'existe, ou la sourcer explicitement | Aucune | Relecture éditoriale : zéro chiffre sans source citée |
| "Edge" affiché comme un edge | Champ mal nommé dans le pipeline (voir Phase 2 pour le fond) | `pro.html`/`match.html` (affichage) | En attendant la Phase 2 : renommer l'affichage en "Probabilité modèle" jusqu'à ce qu'un vrai edge existe | Faible — changement de libellé uniquement | Vérifier qu'aucune page n'utilise plus le mot "edge" tant que le calcul n'est pas réel |
| "Mise recommandée par Kelly Criterion" (CGV) | Promesse commerciale sur une fonctionnalité inexistante | `cgv.html` Art.2 | Retirer la mention Kelly du CGV jusqu'à implémentation réelle (Phase 2), ou remplacer par "mise suggérée à titre indicatif (2-3% de bankroll)" | Moyen — le CGV engage juridiquement, toute modif doit être datée et versionnée | Relecture juridique légère avant publication |
| Promotion de bookmakers non agréés + contournement VPN | Article rédigé sans vérification réglementaire | `blog/guides/meilleurs-bookmakers-monde-2026.html` | Dépublier ou réécrire l'article pour ne lister que les opérateurs agréés ANJ, retirer la section VPN | Faible — un seul article | `LEGAL_REVIEW_REQUIRED` avant republication |
| Paywall grand ouvert | `OUTILS_OPEN_FOR_ALL=true` laissé en dur | `pro.html:392` | Repasser à `false` **uniquement** une fois Phase 5 (paiement réel) livrée — sinon aucun visiteur ne peut jamais devenir "Pro" légitimement | **Élevé si fait seul** : couper l'accès gratuit sans avoir de moyen de paiement = zéro utilisateur Pro possible. Séquencer avec Phase 5. | Vérifier qu'un compte `plan=free` voit le mur, qu'un compte `plan=pro` ne le voit pas |
| `match.html` : `isPro = x \|\| true` | Bug de code, pas un flag | `match.html:1896,1899` | Retirer le `\|\| true` | Faible | Vérifier qu'un compte non-Pro voit le mur sur une page match |

---

## PHASE 1 — SÉCURITÉ

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| XSS réfléchie via `?id=` | Concaténation directe dans `innerHTML` sans échappement | `match.html:535,1903` | Utiliser la fonction `esc()` déjà présente dans le fichier ([527]) avant toute injection dans `innerHTML`, et valider que `id` est numérique avant usage | Faible — fonction d'échappement déjà écrite et utilisée ailleurs dans le même fichier | Tester `match.html?id="><script>alert(1)</script>` — doit s'afficher comme texte, pas s'exécuter |
| Aucun CSP | Jamais configuré | config Netlify (`_headers` ou `netlify.toml`, à créer) | Ajouter un `Content-Security-Policy` restrictif (`script-src 'self' https://cdn.jsdelivr.net` pour le SDK Supabase, etc.) | Moyen — un CSP trop strict peut casser des scripts tiers légitimes (GA, Supabase) | Charger chaque page publique après déploiement, vérifier zéro erreur CSP en console |
| Auto-XSS notes de paris | Non échappé avant `innerHTML` | `pro.html:544-550` | Même traitement `esc()` | Faible | Saisir `<b>test</b>` dans une note, vérifier qu'il s'affiche en texte brut |
| Aucun rate limiting login/signup | Jamais implémenté | `compte.html`, `auth-header.js` | Ajouter un rate limit applicatif (ex. Supabase Edge Function devant `signInWithPassword`) ou s'appuyer sur/renforcer les limites natives Supabase Auth | Moyen — un rate limit mal calibré peut bloquer des utilisateurs légitimes | Simuler 20 tentatives de connexion rapides, vérifier un blocage temporaire |
| Données premium exposées dans `data.json` public | Aucun filtrage serveur réel, Edge Function jamais appelée | `data.json` généré par `update-data.yml`, consommé par `index.html`/`pro.html`/`match.html` | Voir Phase 5 (refonte de la séparation free/pro) — ce n'est pas un correctif de sécurité isolé, c'est un problème d'architecture | Élevé si fait sans Phase 5 — nécessite de repenser où et comment le contenu premium est servi | Vérifier qu'un appel anonyme à l'endpoint public ne renvoie plus `verdict_shark`/`kelly`/`edge`/`facteur_x` |
| RLS Supabase réelle non vérifiable | Aucun schema versionné | (dépôt) | Créer et committer `supabase/schema.sql` avec les policies RLS réelles exportées du projet, pour que toute future revue puisse les auditer | Aucun — travail de documentation | Comparer le schema exporté à l'état réel du dashboard Supabase |

---

## PHASE 2 — FIABILITÉ DU MOTEUR

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| Kelly non calculé | `fractionalKelly()` jamais appelée, `kellyVal` codé en dur | `update-data.yml:587,2416,2564` | Appeler `fractionalKelly(probIA, cote, fraction)` avec la probabilité finale ancrée (`anchored.p1/pN/p2` selon le marché) et la cote réelle du marché choisi ; écrire le résultat dans `kellyVal` au lieu de `'2'` | Moyen — change une valeur affichée à tous les utilisateurs ; doit être testé sur plusieurs cotes avant mise en prod | Recalculer à la main 5 cas (cotes différentes), comparer au résultat produit |
| Edge non calculé | Champ = probabilité modèle relabellisée | `update-data.yml:2602` | Calculer un vrai edge = probabilité modèle finale − probabilité implicite marché (`1/cote`, ou mieux : probabilité Shin déjà calculée) | Faible — nouveau champ, n'affecte pas la sélection de marché existante | Vérifier que `edge` peut être négatif (actuellement impossible vu que c'est juste une probabilité positive) |
| Marché Handicap non résolvable | `resolveMarketWin()` n'a pas de branche Handicap | `update-data.yml:136-150` | Ajouter la logique de résolution Handicap (comparer l'écart de buts à la ligne de handicap) | Moyen — nécessite de parser correctement la ligne (+0.5, -1, etc.) depuis `pari_rec` | Résoudre manuellement les 2 prédictions Handicap actuellement bloquées, vérifier le résultat |
| Aucun statut VOID | Seuls FT/AET/PEN traités | `update-data.yml:1645` | Ajouter la détection des statuts `ABD`/`PST`/`CANC`/`SUSP`/`INT`, marquer l'entrée `result:'void'`, l'exclure explicitement des stats (déjà le comportement de fait pour "scheduled", mais VOID doit être un statut distinct et visible) | Faible | Simuler un match annulé (fixture avec status PST), vérifier qu'il devient `void` et non `scheduled` indéfiniment |
| Cote manquante → repli fictif 1.75 | `parseFloat(p.cote)\|\|1.75` | `update-data.yml:1698` | Exclure le pari du calcul de ROI si `cote` est manquante (ou le marquer explicitement "cote indisponible" plutôt que d'inventer une valeur) | Faible — un seul cas historique connu | Vérifier que le total de paris comptés dans le ROI diminue de 1 (le cas Inter Miami/Chicago Fire) après correctif |
| ROI mensuel incohérent avec ROI global | Formule différente (paiement fixe 0.75) | `update-data.yml:1729` | Réutiliser exactement la même formule que `roiTotal` (ligne 1698), agrégée par mois | Faible | Vérifier que `histo.monthly[].roi` d'un mois donné égale le ROI recalculé à la main sur les paris de ce mois |
| 12 prédictions bloquées "scheduled" | Logique de rattrapage incomplète | `update-data.yml:1620-1626` | Étendre la fenêtre de rattrapage, et surtout ajouter un statut "introuvable après N jours → void" pour éviter l'accumulation indéfinie | Faible | Après correctif, vérifier que le nombre d'entrées "scheduled" de plus de 7 jours tombe à 0 |
| Score de confiance non corrélé à la réussite | Auto-évaluation LLM jamais recalibrée sur la performance réelle | `update-data.yml:1442-1445` (prompt) | Ne pas retoucher le moteur mathématique — mais soit (a) retirer l'affichage du score de confiance au client tant qu'il n'est pas validé empiriquement, soit (b) mettre en place une boucle de recalibration : comparer périodiquement `by_conf` réel et ajuster le barème du prompt en conséquence | Élevé si fait à la légère — c'est un changement de logique métier, à traiter avec la même rigueur qu'un A/B test | Suivre `by_conf` sur au moins 100 nouveaux paris après ajustement avant de re-publier le score |
| Matching flou (Levenshtein) risque d'attribution croisée | `bestTeamMatch()`/`smBestMatch()` utilisés comme repli | `update-data.yml:773,981` | Réduire les seuils de tolérance, logger chaque match flou accepté pour audit a posteriori, ne jamais l'utiliser silencieusement sur le calcul de cotes Pinnacle (préférer "pas de cote Pinnacle" à "cote potentiellement de la mauvaise équipe") | Moyen — resserrer les seuils réduit la couverture des petites ligues | Comparer avant/après sur un lot de matchs de ligues mineures, vérifier qu'aucune stats n'est plus attribuée à une mauvaise équipe |

---

## PHASE 3 — PIPELINE

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| Toute erreur avalée, CI toujours verte | `process.exit(0)` dans le catch | `update-data.yml:2664` | `process.exit(1)` sur erreur fatale, + notification (email/Slack/webhook) sur échec de run | Faible — le comportement actuel (masquer l'échec) est strictement pire que tout changement | Faire échouer volontairement un run (ex. clé API invalide temporairement), vérifier que le run apparaît rouge et qu'une alerte part |
| Pas de protection de concurrence | Absence de `concurrency:` | `.github/workflows/update-data.yml` (bloc `on:`) | Ajouter `concurrency: {group: update-data, cancel-in-progress: false}` | Faible | Déclencher un run manuel pendant un run cron simulé, vérifier que le second attend plutôt que de se chevaucher |
| `TEST_WC_ONLY` fantôme | Variable déclarée, jamais utilisée | `update-data.yml:606-607` | Soit l'implémenter réellement (filtrer `getFixtures()` sur `league===1` uniquement), soit retirer l'input du `workflow_dispatch` | Faible | Déclencher manuellement avec le flag à `true`, vérifier que seuls les matchs CDM sont traités |
| Aucun monitoring du volume/échec API | Jamais mis en place | `update-data.yml` (tout le fichier) | Compter et logger le nombre d'appels échoués par run, alerter si le taux dépasse un seuil (ex. 10%) | Faible | Simuler une clé API invalide pour une des APIs, vérifier que le taux d'échec est visible dans les logs/alertes |
| Pas d'écriture atomique (`fs.writeFileSync` direct) | Jamais implémenté, risque théorique compte tenu de l'architecture | tous les `writeFileSync` | Optionnel/bas risque réel — si fait : écrire dans un fichier temporaire puis `fs.renameSync()` | Faible | Vérifier qu'un run interrompu en plein milieu d'écriture ne laisse jamais un JSON invalide committé |

---

## PHASE 4 — HISTORIQUE ET PREUVES

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| Aucune version/SHA stockée par prédiction | Jamais implémenté | `update-data.yml:1678` (objet `histo.predictions`) | Ajouter un champ `pipeline_sha: process.env.GITHUB_SHA` à chaque nouvelle entrée | Aucun — ajout de champ, rétrocompatible | Vérifier que les nouvelles entrées portent bien le SHA du commit qui les a générées |
| Prompt/réponse Claude jamais persistés | Jamais implémenté | `update-data.yml:1473-1481` | Sauvegarder le prompt + la réponse brute dans un fichier séparé (ex. `logs/YYYY-MM-DD/<fixture_id>.json`), même si ce n'est pas committé en clair — au minimum uploadé comme artifact GitHub Actions avec une rétention plus longue que 90 jours si besoin de traçabilité longue durée | Faible — attention au volume (peut grossir vite), prévoir une politique de rétention | Vérifier qu'une entrée récente peut être reliée à son prompt/réponse d'origine |
| Statistiques calculées à plusieurs endroits divergents | 3 formules de ROI différentes dans le repo (§ Phase 0/2) | `a-propos.html`, `update-data.yml:1729`, blog | Une seule fonction de calcul (`calcStats()` déjà écrite côté client dans `historique.html`) doit devenir la source unique ; toute page qui affiche un chiffre de performance doit soit l'appeler en direct, soit être générée automatiquement depuis elle | Moyen — nécessite de connecter `a-propos.html` aux données réelles (Phase 0 fait déjà le premier pas) | Après refonte, vérifier qu'aucune page du site n'affiche un chiffre de performance qui diverge de `historique.json` |

---

## PHASE 5 — PREMIUM / BUSINESS

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| Aucun paiement réel | Jamais implémenté | à créer | Intégrer Stripe Checkout (mode subscription, prix 19,95€/mois avec essai selon ce que le CGV finalise), webhook `checkout.session.completed`/`customer.subscription.*` qui met à jour `users.plan` côté serveur (jamais côté client) | Élevé — première fois qu'un vrai paiement existe, nécessite des tests en mode test Stripe complets avant tout mode live | Parcours complet en mode test Stripe : souscription → webhook reçu → `plan` mis à jour → accès Pro effectif → résiliation → accès retiré |
| Séparation free/pro cosmétique uniquement | Toutes les données partent au navigateur, filtrage jamais réel | `update-data.yml` (génération), `index.html`/`pro.html`/`match.html` (consommation) | Deux options : (a) servir `data.json` via un endpoint serveur (Supabase Edge Function déjà à moitié écrite) qui vérifie la session et filtre `PREMIUM_FIELDS` avant réponse — et **faire pointer le frontend dessus au lieu du fichier statique** ; (b) si le statique doit rester pour le SEO/perf, générer deux fichiers (`data-public.json` sans champs premium, `data-full.json` derrière auth) | Élevé — change l'architecture de distribution du contenu ; à faire en connexion avec Phase 1 (sécurité premium) | Requête anonyme sur l'endpoint public : vérifier l'absence totale de `verdict_shark`/`kelly`/`edge`/`facteur_x`/`dropping_odds` dans la réponse |
| Prix landing/CGV incohérents | Déjà traité en Phase 0 (retrait) | — | Une fois l'offre finale décidée (Phase 5), republier un prix unique cohérent partout | Faible | Grep `€` sur tout le repo, vérifier une seule offre affichée partout |

---

## PHASE 6 — FRONT / MOBILE / SEO

| Problème | Cause racine | Fichier | Correction | Risque régression | Test de validation |
|---|---|---|---|---|---|
| Couverture frontend non exhaustive | Spot-check réalisé, pas un audit complet | tout le site | Audit dédié sur 5 breakpoints (390/430/768/1024/1440) × toutes les pages publiques + Chrome/Safari/Firefox | Aucun — travail de test pur | Checklist de non-régression visuelle par page/breakpoint |
| `match.html` SEO statique jamais rempli | Placeholder `<!--SEO_META-->` vide, injection JS fragile | `match.html:6-7` | Injecter les balises meta côté pipeline au moment de `generateMatchPages()` (déjà fait pour les pages `/match/<id>.html` générées — vérifier pourquoi `match.html` lui-même, la page dynamique, n'en profite pas) | Faible | Vérifier via `curl` (sans JS) que le title/description sont présents dans le HTML brut |
| Alt manquants (2 images) | Oubli ponctuel | `index.html:456`, `match.html:1268` | Ajouter un `alt` descriptif basé sur le nom d'équipe/joueur déjà disponible en JS | Aucun | Audit a11y automatique (axe/Lighthouse), vérifier 0 image sans alt |
| Jeu responsable absent sur pro/match/compte | Oubli lors de l'ajout du bandeau sur les autres pages | `pro.html`,`match.html`,`compte.html` | Copier le composant déjà utilisé sur `index.html`/`landing.html`/`historique.html` | Aucun | Vérifier la présence du bandeau + lien Joueurs Info Service sur les 3 pages |

---

## PHASE 7 — VALIDATION EXTERNE

Ne peut pas être faite depuis le dépôt seul — nécessite un accès ou une expertise externe à ce qui a été audité ici.

| Point | Ce qu'il faut faire | Qui |
|---|---|---|
| RLS Supabase réelle | Exporter et documenter les policies RLS réelles du projet `ksvjraqitxouwiabecai`, confirmer qu'elles correspondent à ce que le code suppose (`auth.uid()=id` sur `users`) | Propriétaire du projet Supabase (dashboard) |
| Paiement réel | Une fois Phase 5 livrée en mode test, faire une passe de bout en bout en mode Stripe live avec un montant réel avant d'ouvrir au public | Propriétaire + Stripe |
| Juridique — CGV/mentions légales/statistiques/guide bookmaker | Revue par un avocat (droit de la consommation, publicité, jeux d'argent) — en particulier le guide bookmakers (Phase 0) et toute statistique de performance encore affichée après Phase 4 | Avocat |
| Fréquence/fiabilité réelle du cron en production | Consulter l'historique des runs GitHub Actions (au-delà de la rétention 90 jours si besoin, exporter régulièrement) | Propriétaire (accès GitHub) |

---

## Ordre de dépendance résumé

```
Phase 0 (arrêter de mentir)  ──┐
Phase 1 (sécurité)             ├─► peuvent démarrer immédiatement, en parallèle
Phase 3 (pipeline/CI)          │
                                │
Phase 2 (fiabilité moteur)  ◄──┘  dépend de rien, mais Phase 0 doit désactiver
                                    les affichages faux AVANT que Phase 2 les corrige
                                    (sinon fenêtre où le mensonge reste visible)

Phase 4 (historique/preuves)  ◄── bénéficie de Phase 2 (VOID, SHA) terminée

Phase 5 (paiement/premium)    ◄── ne JAMAIS refermer le paywall (Phase 0) avant
                                    que Phase 5 soit livrée et testée en mode test

Phase 6 (front/mobile/SEO)    ── indépendant, peut être fait à tout moment

Phase 7 (validation externe)  ◄── dernière étape, après que tout le reste soit
                                    livré et testable de bout en bout
```
