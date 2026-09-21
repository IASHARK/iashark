# IASHARK — à lire avant de toucher au code

Site d'analyses statistiques de matchs de football (iashark.com). **Pas un
bookmaker** : aucun pari pris, aucune mise collectée.

Ce fichier est la carte du dépôt. Il est court exprès. Quand il contredit un
autre document, **c'est lui qui a raison** : les fichiers `*.md` de la racine
datent pour la plupart d'août 2026 et décrivent un site qui a beaucoup changé
depuis (voir « Documents » plus bas).

---

## Architecture réelle

| Brique | Où | Déployé par |
|---|---|---|
| Site (HTML/JS statique, 9 versions pays) | `fr/ en/ gb/ za/ mx/ es/ de/ it/ pt/` | Netlify, depuis `dist/` |
| Construction de `dist/` | `scripts/build-public.js` | Netlify à chaque push sur `main` |
| Pages localisées | `scripts/build-locales.js` (→ lancer à la main après toute modif de `config/markets.json` ou `i18n/parts/`) | commitées |
| Calcul quotidien | `.github/workflows/update-data.yml` | GitHub Actions, 6h UTC |
| Base + auth + fonctions Edge | Supabase (`supabase/`) | **à la main** — Netlify ne les déploie pas |
| Paiements | Stripe (abonnement « IASHARK Pro ») | — |

**Les dates sont calculées en UTC** dans le pipeline (`TODAY`), alors que le
site raisonne en heure de Paris. Entre minuit et 2h, les deux ne sont pas
d'accord sur le jour courant.

## Où vit quoi

- `lib/` — **logique pure, testée**. C'est ici qu'on met une règle métier, pas
  dans le pipeline. Modules clés : `pick-freeze.js` (gel des analyses),
  `kickoff-guard.js` (garde coup d'envoi), `decision.js` (choix du marché),
  `match-results.js` (onglet résultats), `premium-fields.js` (liste unique des
  champs payants).
- `config/markets.json` — **source de vérité des marchés** : pays, devise,
  prix, durées vendables (`checkoutOpen`), identifiants de Price Stripe.
- `config/leagues.json` — les 19 compétitions couvertes.
- `i18n/parts/*.json` — textes par langue. Après modification :
  `node scripts/merge-i18n-parts.js` puis `node scripts/build-locales.js`.
- `tests/` — 1 895 tests. `npm test` lance tout ;
  `node scripts/list-preflight-tests.js` donne la liste exacte que
  l'intégration continue exige (`.github/workflows/tests.yml`).
- `data/` — **jamais publié** (garde-fou dans `build-public.js`). Contient des
  caches d'API lourds. `player-lab`, `club-hubs` et `league-factory`
  alimentent des tests de l'intégration continue : ne pas les retirer du suivi
  git. `daily-market-scan` et `analysis` ne sont plus suivis (21/09/2026).

## Règles non négociables

1. **Libellés honnêtes.** Jamais « gains garantis », « pari sûr » ni promesse
   de résultat. Toujours « estimation statistique ». Les pertes sont publiées
   comme les gains.
2. **Aucun champ payant dans un fichier public.** La liste fait foi :
   `lib/premium-fields.js`. Un visiteur non abonné ne doit jamais pouvoir lire
   le pari, la cote ou la probabilité dans le HTML ou le JSON servi.
3. **Gel de l'analyse** (`lib/pick-freeze.js`) : une fois un pari publié, il ne
   change plus jusqu'au coup d'envoi — et un match commencé **garde** son
   analyse affichée au lieu de la perdre.
4. **Les CGV doivent dire ce que le site vend.** Ouvrir une durée de paiement
   implique de mettre à jour `legal/<dir>/cgv.html`, d'archiver l'ancienne
   version dans `legal/<dir>/archives/` et de poser une version de
   consentement dans `lib/checkout-consent.js`. Des tests le vérifient.
5. **Aucun secret dans le dépôt.** Les identifiants de Price Stripe ne sont pas
   des secrets et vivent dans `config/markets.json` ; les clés vivent dans les
   secrets Supabase et GitHub.

## Pièges connus (constatés, pas théoriques)

- **Les fonctions Supabase ne sont pas déployées par un push.** Modifier
  `supabase/functions/**` sans redéployer ne change rien en production.
- **Le dépôt est en retard sur la production pour `create-checkout-session`**
  (21/09/2026) : le commit `3fa03d606` (« Retour arrière : la vague SEO
  retirée ») a supprimé du dépôt le garde-fou `open` qui interdit de vendre une
  durée fermée, alors que la version déployée l'a toujours. **Déployer le code
  du dépôt tel quel rouvrirait l'abonnement annuel français à la vente.** À
  réparer : remettre le champ `open` dans `scripts/build-locales.js` et la
  garde dans `pricing.ts`.
- **Le pipeline est un seul fichier de 4 100 lignes** contenant ~250 Ko de
  JavaScript inline. Pour en vérifier la syntaxe :
  `awk '/cat > pipeline.js << .JSEOF./{flag=1;next}/^          JSEOF/{flag=0}flag' .github/workflows/update-data.yml | sed 's/^          //' > /tmp/p.js && node --check /tmp/p.js`
- **Ne jamais retirer un match publié d'un bilan** sans que ce soit une
  décision explicite du propriétaire, tracée dans
  `config/results-exclusions.json`.

## Documents de la racine

**À jour :** `MODEL_CHANGELOG.md`, `MODEL_ARCHITECTURE.md`,
`ENGINE_RECALIBRATION_REPORT.md`, `MONITORING.md`, `LATAM_OPENING_STATUS.md`,
`GEO_EXPANSION_STATUS.md`.

**Périmés (août 2026) — informatifs, jamais à croire sur l'état actuel :**
`IASHARK_PIPELINE_MAP.md`, `IASHARK_PIPELINE_AUDIT.md`, `IASHARK_V2_*.md`,
`FINAL_360_AUDIT.md`, `FINAL_REMEDIATION_PLAN.md`, `IASHARK_DESIGN_FREEZE.md`,
`IASHARK_MARKET_REGISTRY.md`, `CALIBRATION_REPORT.md`, `FEATURE_DICTIONARY.md`,
`DATA_LEAKAGE_POLICY.md`, `ODDS_SNAPSHOT_POLICY.md`. `README.md` date de mars.

**La documentation la plus fiable du dépôt, ce sont les commentaires du code** :
chaque décision non évidente porte un commentaire daté qui explique le
pourquoi. Les lire avant de modifier un comportement.

## Avant de pousser

```bash
node scripts/build-locales.js          # si markets.json ou i18n/ ont changé
node lib/lifecycle-email-build.js      # si les textes d'e-mail ont changé
node scripts/list-preflight-tests.js > /tmp/pf.txt && xargs node --test < /tmp/pf.txt
```

Vérifier ensuite **en production** ce qui vient d'être déployé, plutôt que de
supposer que ça marche.
