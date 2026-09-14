# Tests E2E IASHARK (Playwright)

Suite de bout en bout qui rejoue les parcours reels du site dans un vrai navigateur,
sur les **9 versions** (`fr gb za en mx es de it pt`), en desktop (Chromium 1366x900)
et en mobile (Chromium 375x812, scenarios marques `@mobile`).

**Aucun compte reel, aucun paiement reel.** Supabase (Auth, REST, Edge Functions),
Stripe et les analytics sont entierement simules par interception reseau
(`helpers/supabase-mock.js`). Un appel Supabase non prevu fait echouer le test.

## Lancer

```bash
npm ci                                   # installe @playwright/test (version figee)
npm run test:e2e:install                 # navigateur Chromium
npm run test:e2e:local                   # node scripts/build-public.js -> dist/, puis suite locale
npm run test:e2e                         # suite locale sur le dist/ existant
npm run test:e2e:prod                    # meme suite contre https://iashark.com
npm run test:e2e:report                  # ouvre le rapport HTML du dernier run
```

`dist/` est construit exactement comme sur Netlify (`node scripts/build-public.js`, voir
`netlify.toml`), puis servi par `helpers/static-server.js` (serveur node sans dependance,
demarre et arrete par Playwright a chaque run ; aucun serveur de dev permanent).
Les repertoires de langue generes (`build-locales.js`) sont ceux du depot.

Options utiles :

| Variable | Effet |
| --- | --- |
| `E2E_BASE_URL=https://iashark.com` | cible la production (active redirections / 404 internes) |
| `E2E_VERSIONS=gb,mx` | limite aux versions citees |
| `E2E_MOBILE_BROWSER=webkit` | mobile sous iPhone 13 / WebKit (`npx playwright install webkit`) |
| `E2E_PORT` / `E2E_DIST` | port (4173) et repertoire du serveur statique local |

Filtrer : `npx playwright test account.spec.js -g "/gb/" --project=desktop-chromium`.

## Ce qui est couvert

| Fichier | Scenarios (x 9 versions) |
| --- | --- |
| `home.spec.js` | `<html lang>`, match offert et lien dans la version, liste des cartes de match, filtre de championnat, selecteur 9 versions, navigation basse, ligne d'aide du marche, pas de defilement horizontal, aucune erreur console |
| `match.spec.js` | anonyme : mur Pro sur un match payant, aucun appel `match-data`, aucun champ de `lib/premium-fields.js` (a toute profondeur) dans les JSON lus par la page ; match offert -> mur de compte ; compte gratuit ; Pro simule : analyse complete, heure avec fuseau |
| `subscription.spec.js` | prix Pro et devise de la version (montant lu dans `config/markets.json`, devise attendue EUR/GBP/ZAR/MXN, aucun symbole d'un autre marche) ; cases de consentement par regime (UE 2, gb 2, za 2, mx 1 + info), bouton verrouille tant qu'elles ne sont pas cochees ; corps `market`/`dir`/`consent` et devise facturee ; redirection Stripe interceptee ; `market_not_configured`, `consent_required` ; Pro sans second paiement |
| `account.spec.js` | anonyme -> connexion de la version ; gratuit, Pro, admin ; portail Stripe ; suppression avec le mot de confirmation traduit ; deconnexion ; mobile : pas de debordement, boutons au-dessus de la barre basse |
| `auth.spec.js` | validations traduites (connexion, inscription), connexion simulee -> compte de la version, reinitialisation sans jeton -> lien invalide |
| `checkout.spec.js` | succes avec session Pro simulee -> acces active ; sans session -> connexion ; annulation |
| `tools.spec.js` | anonyme et gratuit : demo seulement, aucun appel ni nom d'equipe reel ; Pro simule : scanner sur marches reels |
| `legal-blog.spec.js` | 5 pages legales en 200 avec la bonne langue, accueil du blog |
| `production.spec.js` | (prod) redirections `/pro`, `/gb/blog/`, `/historique` ; fichiers internes en 404 ; (local + prod) aucun champ premium dans `data-home.json` et un echantillon de `match/<id>.json` |

## Donnees et etats simules

- **Donnees de match** : toujours les vraies formes (`data-home.json`, `match/<id>.json`).
  En local, les dates sont decalees pour que le match offert tombe aujourd'hui (sinon un
  `dist/` de la veille n'affiche aucune carte). En production, donnees live.
- **Prix** : jamais recopies dans les tests ; `helpers/versions.js` lit `config/markets.json`.
- **Personas** (`PERSONAS` dans `supabase-mock.js`) : `free`, `pro` (abonnement Stripe actif),
  `admin`. `await supa.as('pro')` injecte la session dans `localStorage` sous la cle de
  supabase-js v2 `sb-ksvjraqitxouwiabecai-auth-token` (JWT factice non signe).
- **Fonctions Edge** : reponses par defaut realistes ; `supa.onFunction(nom, reponse)` pour
  un cas precis ; `supa.waitForCall(nom)` renvoie le corps envoye.
  `create-checkout-session` n'a volontairement **aucune** reponse par defaut.

## Lire un echec

1. **CI** : sur push, l'issue GitHub ouverte automatiquement liste les tests en echec et le
   run. Telecharger l'artefact `e2e-report-local-*` ou `e2e-report-production-*`, ouvrir
   `report/index.html`.
2. Chaque test en echec a une **capture** (`test-failed-1.png`), un **error-context.md**
   (arbre d'accessibilite de la page au moment de l'echec) et une **trace**
   (`npx playwright show-trace <trace.zip>` : reseau, console, DOM pas a pas).
3. Le nom du test dit la version (`/gb/`) et le parcours ; le message d'assertion dit ce qui
   etait attendu (texte du dictionnaire, URL, corps de requete).
4. Echec **local seul** : regression dans le code. Echec **production seul** : deploiement,
   `_redirects`, en-tetes ou donnees live. Echec des deux : regression deployee.

Ne pas affaiblir une assertion pour faire passer un test : corriger le site, ou documenter
le bug a son proprietaire.

## CI (`.github/workflows/e2e.yml`)

- push et pull request sur `main` -> job **local** : Node 24, `npm ci`,
  `node scripts/build-public.js`, Chromium seul, suite sur `dist/`.
- push sur `main` (ou lancement manuel `target=production|both`) -> job **production** :
  attend le deploiement Netlify du commit (`helpers/wait-for-deploy.js`), puis suite sur
  https://iashark.com.
- Navigateur en cache, 1 relance automatique par test, 4 workers.
- Echec -> rapport en artefact (14 jours) ; sur push, issue GitHub.
- `tests.yml` (tests unitaires) est inchange et independant.
- Attente du deploiement : le plus fiable est un marqueur de build contenant le SHA du
  commit dans `/gb/` (ex. `<meta name="iashark-build" content="$COMMIT_REF">`, a ajouter par
  le build) ; a defaut, statut GitHub Netlify ; a defaut, attente fixe de 4 min.
