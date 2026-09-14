# Surveillance automatique d'IAShark

Ce guide explique ce qui surveille le site, comment vous êtes prévenu, et quoi faire pour chaque alerte.

**En bref.** Si quelque chose casse, une **issue GitHub** s'ouvre toute seule sur le dépôt `IASHARK/iashark`, avec un titre qui commence par 🚨. Elle explique le problème en clair et dit quoi faire. Elle se **ferme toute seule** quand le problème disparaît. Pour recevoir ces alertes par e-mail ou sur votre téléphone, suivez la section « Recevoir les alertes » (2 minutes, une seule fois).

---

## 1. Ce qui est surveillé, et quand

Tout tient dans un seul workflow : `.github/workflows/site-health.yml`.

### A. Échec d'un workflow (dès la fin du run)

À la fin de chaque run sur `main` de ces workflows, le résultat est lu :

| Workflow | Rôle | Fréquence |
|---|---|---|
| **Update IASHARK Daily** | Pipeline quotidien : matchs, pronostics, textes IA, `data.json`, pages match, sitemaps | chaque jour à 06:00 UTC |
| **closing-odds** | Cotes de clôture juste avant le coup d'envoi | toutes les 30 min |
| **forward-odds-broad** | Cotes des matchs des 3 prochains jours | toutes les 6 h |
| **forward-odds-near-kickoff** | Cotes des matchs des 6 prochaines heures | toutes les heures |
| **tests** | Tests automatiques après chaque modification du code | à chaque push |

- **Échec, délai dépassé ou démarrage impossible** : une issue s'ouvre, par exemple « 🚨 Pipeline quotidien en échec – 2026-09-14 ». Elle contient :
  - le lien du run ;
  - le nom du job et de l'étape en rouge ;
  - une explication en français et la marche à suivre.
- **Annulation** :
  - pour le pipeline quotidien et les tests, une annulation déclenche aussi une alerte ;
  - pour les trois collecteurs de cotes, les annulations sont ignorées : GitHub annule normalement un run en attente quand le suivant arrive.
- **Nouvel échec du même workflow** : l'issue existante est mise à jour, sans en créer une nouvelle. Au plus un commentaire (donc une notification) toutes les 6 heures.
- **Prochain run réussi** : l'issue est fermée automatiquement, avec un commentaire « ✅ Résolu automatiquement ».

### B. Contrôle de santé de la production (toutes les 2 heures)

Le script `scripts/site-health-check.js` teste le vrai site `https://iashark.com` à chaque heure paire (00:15, 02:15, … UTC). Vous pouvez aussi le lancer à la main.

**Contrôles critiques.** Un échec ouvre l'issue « 🚨 Santé du site – date » :

| Catégorie | Ce qui est vérifié |
|---|---|
| Fraîcheur | La liste publique des matchs (`data-home.json`, ou `data.json` en secours) contient des matchs **aujourd'hui ou demain** (heure de Paris). |
| Fraîcheur | Le dernier commit « Daily update » sur `main` a **moins de 30 heures**. |
| Déploiement | Le site sert bien les données du dernier commit quotidien. Plus de 3 h de retard veut dire que le déploiement Netlify est bloqué. |
| Contenu | Il y a **au moins un match offert** (`is_free: true`) quand il y a des matchs. |
| Contenu | Au moins un match a des **cotes** (0 % = échec). |
| Fuite premium | **Aucun champ payant** sur un match non offert dans `data-home.json`, `data.json` et un échantillon de `match/<id>.json`. La recherche descend dans les sous-objets. La liste des champs vient de `lib/premium-fields.js` et `lib/public-data-split.js`. |
| Fuite premium | Dans `data.json`, le pari du jour (`run_output.safe_pick`), les combinés et le top buteurs sont masqués, sauf pour le match offert. |
| Pages | Code 200 et bonne langue (`<html lang>`) pour : `/fr/`, `/gb/`, `/za/`, `/mx/`, `/en/`, `/gb/match.html`, `/mx/abonnement.html` et `/fr/cgv.html`. `/sitemap.xml` et `/robots.txt` doivent aussi répondre 200 avec un contenu valide. |
| Pages | Les redirections clés répondent 301 vers la bonne adresse (`/match.html`, `/cgv`, `/index.html`, `/gb/blog.html`, `/historique.html`). |
| Fichiers internes | Les documents internes renvoient 404 (`/FINAL_360_AUDIT.md`, migrations SQL, code des fonctions, scripts). |
| Supabase | `match-data`, appelée en visiteur anonyme, renvoie des matchs **sans champ payant**. |
| Supabase | `create-checkout-session` sans consentement refuse (`consent_required`) ou répond « paiement désactivé ». Jamais d'erreur 5xx, jamais de session de paiement créée. |
| Supabase | `login-guard` avec un JSON invalide répond 400 (sinon, plus personne ne peut se connecter). |
| Supabase *(optionnel)* | Les tâches pg_cron `expire-past-due-access` et `purge-old-funnel-events` existent, sont actives et leur dernière exécution n'a pas échoué. |
| Fournisseurs *(optionnel)* | Le quota **api-football** du jour n'est pas épuisé (avertissement à partir de 85 %). |

**Avertissements.** Ils n'ouvrent pas d'issue. Ils apparaissent dans le résumé du job (Actions → site-health → le run → Summary) :

- **Textes IA absents** : 0 % des matchs ont `analyse_card` ou `contexte`. Cause probable : le secret `ANTHROPIC_KEY`. Quand ces textes sont premium, le calcul porte sur le match offert.
- **Cotes Pinnacle vides.**
- **Cotes présentes sur moins de 50 % des matchs.**
- **Fichiers découpés pas encore en ligne** : `data-home.json` ou `match/<id>.json` manquent. C'est normal tant que le premier pipeline qui les produit n'a pas été déployé ; le contrôle utilise alors `data.json`.

**Remarques.**

- `data.json` pèse environ 25 Mo. Pour ne pas consommer la bande passante Netlify toutes les 2 heures, il n'est téléchargé qu'à 08:15 et 20:15 UTC, ou quand `data-home.json` est absent. Un lancement manuel le télécharge toujours.
- Les deux contrôles *optionnels* ne tournent que si leur secret existe (voir section 3). Sans secret, ils sont marqués « non exécuté », jamais en échec.
- La clé Supabase utilisée est la clé **anon publique**, lue dans `funnel-track.js`. Le script refuse toute clé qui ne serait pas « anon ».

---

## 2. Recevoir les alertes (e-mail et téléphone)

Les issues sont créées par le robot `github-actions`. Pour être prévenu :

1. **Suivre les issues du dépôt.**
   - Ouvrir `https://github.com/IASHARK/iashark`.
   - En haut à droite, cliquer sur **Watch**, puis **Custom**.
   - Cocher **Issues**, puis **Apply**.
2. **Choisir comment être prévenu.**
   - Aller sur `https://github.com/settings/notifications`.
   - Dans la section **Subscriptions → Watching**, cocher **Email**, et aussi **GitHub Mobile** si vous avez l'application.
   - Vérifier en haut de la page que l'adresse e-mail par défaut est la bonne.
3. **Sur téléphone.**
   - Installer l'application **GitHub Mobile** (iOS / Android) et se connecter.
   - Dans l'application : **Profil → Settings → Notifications**, activer les notifications push.
4. *(Facultatif)* **Filtrer les e-mails.** Toutes les alertes portent le label `monitoring` et un titre qui commence par 🚨. Vous pouvez créer un filtre dans votre messagerie sur « 🚨 » ou sur l'expéditeur `notifications@github.com`.

Pour vérifier que tout marche, lancez le contrôle à la main (Actions → **site-health** → **Run workflow**). Tant qu'un contrôle critique échoue, vous recevez l'issue.

---

## 3. Mise en service (une seule fois)

1. **Fusionner sur `main`.** GitHub n'exécute les déclenchements « à la fin d'un autre workflow » et « toutes les 2 heures » que pour les workflows présents sur la branche par défaut (`main`).
2. **Vérifier** que **site-health** apparaît dans l'onglet **Actions**, puis cliquer sur **Run workflow** une première fois.
3. **Secrets optionnels** (Settings → Secrets and variables → Actions) :
   - `APISPORTS_KEY` : déjà utilisé par les collecteurs de cotes, donc le contrôle du quota api-football fonctionne tout seul.
   - `SUPABASE_ACCESS_TOKEN` : à créer pour surveiller les tâches pg_cron.
     - Créer un jeton sur `https://supabase.com/dashboard/account/tokens`, puis l'ajouter comme secret.
     - Le script ne fait qu'une lecture, mais ce jeton donne accès à tout le compte Supabase : ne l'ajouter que si vous acceptez ce niveau d'accès pour GitHub Actions.
     - Sans lui, vérifiez les tâches à la main (voir 4.9).

Aucun autre réglage n'est nécessaire : le jeton `GITHUB_TOKEN` est fourni automatiquement par GitHub. Le workflow a seulement les droits `issues: write`, `contents: read` et `actions: read` : il ne peut rien modifier dans le code ni déployer.

---

## 4. Que faire pour chaque alerte

Chaque issue contient déjà la marche à suivre. Voici le détail.

### 4.1 « 🚨 Pipeline quotidien en échec »

Conséquence : le site garde les données de la veille, puis n'affiche plus de match du jour.

1. Cliquer sur le lien du run dans l'issue, puis sur l'étape en rouge.
2. Selon l'erreur :
   - **429 / quota / « requests limit »** (api-football) : attendre minuit UTC, puis relancer.
   - **Anthropic / ANTHROPIC_KEY / 401** : vérifier le secret `ANTHROPIC_KEY` et le crédit sur console.anthropic.com.
   - **Erreur au `git push`** : un autre commit est arrivé pendant le run ; relancer suffit.
   - **Délai dépassé (timed out)** : relancer. Si cela se répète, le pipeline est devenu trop long (trop de ligues, API lente) : à signaler au développeur.
   - **Autre** : copier le message d'erreur à votre développeur.
3. Relancer : Actions → **Update IASHARK Daily** → **Run workflow**.

### 4.2 « 🚨 Capture des cotes de clôture / Collecte des cotes … en échec »

Conséquence : l'historique des cotes a des trous (mesure de la valeur des pronostics). Le site public continue de fonctionner.

- **Erreur Supabase 401/403** : vérifier les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
- **Quota api-football** : attendre la remise à zéro à minuit UTC.
- Un échec isolé se referme tout seul au run suivant (30 min à 6 h plus tard). Pas d'action si l'issue est déjà fermée.

### 4.3 « 🚨 Tests automatiques en échec »

Le dernier changement de code sur `main` a cassé quelque chose, et le site peut déjà être déployé avec ce défaut. Ouvrir le run, noter le nom du test en échec, et demander la correction (ou l'annulation du dernier commit) au développeur. Ces tests protègent notamment contre les fuites de données payantes : ne pas les ignorer.

### 4.4 « 🚨 Santé du site » : Fraîcheur des données

- **Aucun match aujourd'hui ni demain** ou **Daily update de plus de 30 h** : le pipeline quotidien ne publie plus.
  - Ouvrir Actions → **Update IASHARK Daily** et regarder le dernier run.
  - S'il est en échec, voir 4.1.
  - S'il n'y a pas de run récent, le workflow est peut-être désactivé : bouton **Enable workflow**, puis **Run workflow**.
  - Cas rare : trêve internationale sans aucun match couvert.

### 4.5 « Santé du site » : Déploiement Netlify

Le commit quotidien est sur `main` mais le site sert d'anciennes données.

1. Ouvrir Netlify → site IAShark → **Deploys**.
2. Lire le log du dernier déploiement en échec (souvent `node scripts/build-public.js`).
3. Cliquer sur **Retry deploy**.

### 4.6 « Santé du site » : Match offert ou cotes

- **Aucun match offert** : les visiteurs gratuits n'ont plus d'analyse offerte. Relancer le pipeline quotidien. Si cela persiste, signaler au développeur (choix du match offert, `lib/free-match.js`).
- **Aucune cote** :
  - vérifier le quota et l'abonnement sur dashboard.api-football.com ;
  - vérifier le secret `APISPORTS_KEY` ;
  - puis relancer le pipeline.

### 4.7 « Santé du site » : Fuite de données premium (priorité haute)

Des informations payantes sont lisibles gratuitement : pari recommandé, probabilités, textes d'analyse…

1. L'issue indique le fichier (`data.json`, `data-home.json`, `match/<id>.json`, ou la fonction `match-data`) et les champs concernés.
2. **Si la correction est déjà dans le code** mais que le pipeline n'a pas encore tourné : relancer **Update IASHARK Daily** pour régénérer les fichiers publics, puis attendre le déploiement Netlify.
3. **Si c'est la fonction `match-data`** : sa liste de champs protégés doit être alignée avec `lib/premium-fields.js`, puis la fonction redéployée sur Supabase (développeur).
4. **Si la fuite réapparaît après un pipeline réussi** : un changement de code l'a réintroduite, à signaler immédiatement au développeur.

### 4.8 « Santé du site » : Pages, redirections, fichiers internes

- **Page en erreur ou mauvaise langue** : vérifier le dernier déploiement Netlify. Le développeur régénère les pages avec `node scripts/build-locales.js`.
- **Redirection cassée** : `_redirects` est généré par `scripts/build-locales.js` et doit être présent dans `dist/`.
- **Fichier interne accessible** (priorité haute) : vérifier que `netlify.toml` publie bien `dist` et que le dernier déploiement a réussi.

### 4.9 « Santé du site » : Supabase

- **match-data en erreur (502)** : la fonction n'arrive pas à lire les fichiers publics du site. Voir Supabase → Edge Functions → match-data → Logs.
- **create-checkout-session en 5xx** : vérifier `PAYMENT_PROVIDER` et les secrets `STRIPE_*` dans Supabase → Edge Functions → Secrets.
- **Session de paiement créée sans consentement** (priorité haute) : à signaler immédiatement au développeur.
- **login-guard en erreur** : plus personne ne peut se connecter. Voir les logs de la fonction.
- **pg_cron en échec** : dans Supabase → SQL Editor, lancer
  `select * from cron.job_run_details order by start_time desc limit 20;`
  et lire la colonne `return_message`.

### 4.10 « Santé du site » : Quota api-football épuisé

Le quota se remet à zéro à minuit UTC. Si cela arrive souvent, passer à l'offre supérieure sur dashboard.api-football.com ou réduire le nombre de ligues suivies.

### 4.11 « Le contrôle de santé n'a pas pu s'exécuter »

Le script lui-même a planté. Ouvrir le run **site-health** et transmettre l'erreur au développeur.

---

## 5. Lancer un contrôle à la main

- **Depuis GitHub** : Actions → **site-health** → **Run workflow**. Le résumé détaillé est dans l'onglet **Summary** du run. Le fichier `health-results.json` est téléchargeable dans **Artifacts** pendant 14 jours.
- **Depuis un ordinateur** (Node 20 ou plus, à la racine du dépôt) :

  ```bash
  node scripts/site-health-check.js --data-json always
  ```

  Le rapport JSON s'affiche, avec un résumé lisible à la fin. Le code de sortie vaut 1 si un contrôle critique échoue.
- **Tests du système de surveillance** (sans réseau) : `node --test tests/site-health.test.js`.

---

## 6. Limites connues

- **Délai de détection.**
  - Un problème de production est détecté en **2 heures au plus**. GitHub peut décaler les tâches planifiées de 5 à 30 minutes quand il est chargé.
  - Un **workflow en échec** est signalé dès la fin du run. Un workflow qui **ne démarre plus du tout** (désactivé) est détecté par le contrôle « Daily update de moins de 30 h ».
- **Inactivité du dépôt.** GitHub désactive les tâches planifiées d'un dépôt public sans activité depuis 60 jours. Les commits quotidiens du pipeline évitent ce cas, mais après une longue pause, réactiver **site-health** et **Update IASHARK Daily** dans l'onglet Actions.
- **Workflows non surveillés.** « Generate IA Shark TikTok Images » et « Scientific Regression (Lab) » ne sont pas surveillés : ils ne touchent pas au site public. Pour les ajouter, mettre leur nom exact dans la liste `workflows:` de `site-health.yml`.
- **Contrôles optionnels.** Sans le secret `SUPABASE_ACCESS_TOKEN`, les tâches pg_cron ne sont pas surveillées automatiquement.

---

## 7. Plus tard : recevoir aussi un e-mail direct (Resend)

*Non mis en place. Les notifications GitHub (section 2) suffisent pour démarrer.* Pour un e-mail envoyé directement par le workflow, sans passer par GitHub :

1. Créer un compte sur resend.com, vérifier le domaine d'envoi (par exemple `alertes@iashark.com`) et créer une clé API.
2. Ajouter le secret `RESEND_API_KEY`, et éventuellement `ALERT_EMAIL_TO`, dans Settings → Secrets and variables → Actions.
3. Dans `site-health.yml`, ajouter au job `checks` une étape conditionnée par `if: steps.health.outcome == 'failure'`. Cette étape appelle `https://api.resend.com/emails` en `POST` avec :
   - l'en-tête `Authorization: Bearer $RESEND_API_KEY` ;
   - un corps JSON `{ "from": …, "to": …, "subject": "🚨 Santé du site IAShark", "text": … }`.
   
   Le texte peut reprendre le fichier `health-results.json`. Même principe pour le job `workflow-alert`.
4. Ne jamais écrire la clé dans un fichier du dépôt : uniquement dans les secrets GitHub.
