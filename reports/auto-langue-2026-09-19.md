# Langue automatique selon le pays du visiteur — 19/09/2026

Demande : « quand quelqu'un vient d'un autre pays, qu'on lui mette sa langue direct (capteur IP ou autre) ».

Statut : **REVIEW** (code et tests prêts ; bandeau vérifié en local dans un navigateur, mobile 375 px et ordinateur 1280 px ; redirections de la racine pas encore vérifiées sur un aperçu Netlify).

## En deux phrases

1. Quand un visiteur tape **iashark.com** (la racine `/`), Netlify regarde son pays (d'après son adresse IP) puis la langue de son navigateur, et l'envoie directement vers la bonne version du site (`/es/`, `/pt/`, `/de/`...).
2. Quand un visiteur arrive **directement sur une page** (depuis Google, un lien partagé...) qui n'est pas dans la langue de son navigateur, il n'est **jamais** redirigé : un petit bandeau en bas de l'écran lui propose la même page dans sa langue (« This page is also available in English — Switch to English »). Il peut le fermer.

## Ce qui se passe pour un visiteur de chaque pays (racine `/`)

Netlify lit les règles de haut en bas et applique la première qui correspond.

| Le visiteur vient de... | Il arrive sur | Pourquoi |
|---|---|---|
| Royaume-Uni | `/gb/` (prix en £) | marché UK, toujours, quelle que soit la langue du navigateur |
| Afrique du Sud | `/za/` (prix en rand) | marché ZA, toujours |
| Mexique | `/mx/` (prix en pesos) | marché MX, toujours |
| Suisse | `/de/` ; `/fr/` si navigateur en français ; `/it/` si italien ; `/en/` si anglais | pays multilingue |
| Belgique | `/fr/` ; `/de/` si navigateur en allemand ; `/en/` si anglais **ou néerlandais** | pays multilingue (pas de version néerlandaise) |
| Luxembourg | `/fr/` ; `/de/` si allemand ; `/en/` si anglais | pays multilingue |
| Canada | `/en/` ; `/fr/` si navigateur en français (Québec...) | Netlify ne connaît que le pays, pas la province |
| Cameroun, Maurice | `/fr/` ; `/en/` si navigateur en anglais | pays bilingues |
| Rwanda, Seychelles | `/en/` ; `/fr/` si navigateur en français | pays bilingues |
| Andorre | `/es/` ; `/fr/` si navigateur en français | |
| Porto Rico | `/es/` ; `/en/` si navigateur en anglais | |
| France, Monaco, Outre-mer (Guadeloupe, Martinique, Guyane, Réunion, Mayotte, Nouvelle-Calédonie, Polynésie...) | `/fr/` | |
| Afrique francophone (Sénégal, Côte d'Ivoire, Mali, Burkina, Niger, Guinée, Bénin, Togo, Gabon, Congo, RD Congo, Centrafrique, Tchad, Djibouti, Comores, Madagascar, Burundi, Mauritanie), Maroc, Algérie, Tunisie, Haïti | `/fr/` | |
| Espagne, Andorre, Guinée équatoriale | `/es/` | |
| Amérique latine hispanophone **hors Mexique** (Argentine, Colombie, Chili, Pérou, Venezuela, Équateur, Bolivie, Paraguay, Uruguay, Cuba, République dominicaine, Amérique centrale...) | `/es/` | voir « Pourquoi `/es/` et pas `/mx/` » |
| Portugal, Brésil, Angola, Mozambique, Cap-Vert, Guinée-Bissau, São Tomé, Timor | `/pt/` | |
| Allemagne, Autriche, Liechtenstein | `/de/` | |
| Italie, Saint-Marin, Vatican | `/it/` | |
| États-Unis, Canada, Australie, Nouvelle-Zélande, Irlande, Nigeria, Ghana, Kenya, Ouganda, Tanzanie, Zambie, Zimbabwe, Botswana, Namibie, Lesotho, Eswatini, Malawi, Sierra Leone, Liberia, Gambie, Soudan du Sud, Inde, Pakistan, Bangladesh, Sri Lanka, Singapour, Malaisie, Philippines, Hong Kong, Jamaïque, Trinité-et-Tobago, Barbade, Bahamas, Belize, Guyana, Malte, Chypre, îles anglo-normandes, île de Man, Gibraltar, Fidji, Papouasie | `/en/` (anglais international, prix en €) | |
| Autre pays (ex. Pays-Bas, Pologne) avec un navigateur en français / anglais / espagnol / portugais / allemand / italien | la version de cette langue | langue du navigateur |
| Pays dont la langue n'a pas de version : Pays-Bas, Scandinavie, Europe de l'Est, Grèce, Turquie, Israël, Japon, Corée, Chine, Asie du Sud-Est, pays du Golfe, Égypte... | `/en/` | même choix que le « x-default » déjà utilisé pour Google |
| Pays inconnu et langue non proposée | `/fr/` | comme avant |

Remarques :
- **Seule la première langue** du navigateur compte (règle de Netlify). Un navigateur « néerlandais, puis anglais » compte comme néerlandais.
- Un navigateur réglé en « anglais (Royaume-Uni) » ou « espagnol (Mexique) » **hors** du Royaume-Uni ou du Mexique va vers `/en/` ou `/es/` (prix en €), jamais vers les prix en £ ou en pesos.

### Pourquoi `/es/` et pas `/mx/` pour l'Amérique latine hors Mexique

`/mx/` est le **marché Mexique** : prix en pesos mexicains, paiement Stripe du marché mexicain, CGV et ligne d'aide au jeu mexicaines (Línea de la Vida). Rien de cela ne s'applique à un Argentin ou à un Colombien. `/es/` est la version espagnole **internationale** : prix en euros (offre ouverte à tous) et ressource d'aide internationale (Gambling Therapy), prévue pour les visiteurs sans marché dédié (config/markets.json). Même logique pour l'Irlande, l'Australie, le Nigeria... qui vont vers `/en/` et pas `/gb/` ou `/za/`.

## Le choix du visiteur est toujours respecté

- Quand le visiteur choisit une langue dans le sélecteur (ou clique sur « Switch » dans le bandeau), le site dépose deux petits cookies, `nf_country` et `nf_lang` (13 mois). Netlify les lit **à la place** de l'adresse IP et de la langue du navigateur : ensuite, `iashark.com` le renvoie toujours vers la version qu'il a choisie.
- Le bandeau ne s'affiche plus du tout après un choix.

## Le bandeau des pages profondes (détail)

- Affiché environ 1 seconde après le chargement complet de la page, en bas de l'écran, au-dessus de la barre de navigation, **même rendu sur mobile et sur ordinateur**, sans faire bouger la page.
- Écrit dans la langue du visiteur (français, anglais, espagnol, allemand, italien, portugais), lisible par les lecteurs d'écran, fermable au clavier (touche Échap).
- Le lien mène à **la même page** dans l'autre langue (liens « hreflang » de la page). Si la page n'existe pas dans cette langue, pas de bandeau (on n'annonce jamais une page qui n'existe pas).
- Jamais affiché : aux robots (Google compris), après un choix de langue, après une fermeture, après 3 affichages sans réaction, sur les pages connexion / inscription / mot de passe / retour de paiement / 404, ni si le navigateur bloque le stockage local.
- Jamais de changement d'offre à l'aveugle : un visiteur sur `/gb/`, `/za/` ou `/mx/` ne se voit proposer une autre version que si son pays est connu et que cette version correspond à son pays. Le pays vient de la localisation déjà demandée par les statistiques du site (aucun appel en plus).
- Pas encore sur les articles du blog et les articles locaux (ils ne chargent pas le script de traduction du site).

## Ce que voit Google

- Les pages profondes ne sont **jamais** redirigées : Googlebot voit chaque version à sa propre adresse, avec ses liens hreflang (inchangés).
- La racine `/` reste une redirection **302** (temporaire), jamais 301 : Google comprend que c'est un aiguillage. Googlebot explore surtout depuis les États-Unis, sans langue de navigateur : il reçoit `/en/`, qui est aussi la page « x-default » déclarée dans les hreflang. Cohérent.
- Le bandeau n'est jamais affiché aux robots et n'est pas dans le HTML de la page (ajouté après chargement) : aucun effet sur le contenu indexé.

## Comment tester sur Netlify

Il n'existe **pas** de paramètre d'URL du type `?nf_country=` (vérifié dans la documentation Netlify). On simule le pays et la langue avec les cookies `nf_country` / `nf_lang`, ou avec un VPN.

1. Ouvrir un **Deploy Preview** de la branche (ou le site en production après mise en ligne).
2. Dans un terminal (remplacer l'adresse par celle de l'aperçu) :
   - `curl -sI -H "Cookie: nf_country=br" https://ADRESSE/` → `location: /pt/`
   - `curl -sI -H "Cookie: nf_country=ch" -H "Accept-Language: fr-CH,fr" https://ADRESSE/` → `location: /fr/`
   - `curl -sI -H "Cookie: nf_country=nl" -H "Accept-Language: nl-NL" https://ADRESSE/` → `location: /en/`
   - `curl -sI -H "Cookie: nf_country=gb; nf_lang=fr" https://ADRESSE/` → `location: /gb/`
   - `curl -sI https://ADRESSE/fr/pro.html` → `200` (une page profonde n'est jamais redirigée).
3. Dans le navigateur : console → `document.cookie = "nf_country=it; path=/"`, puis ouvrir la racine → `/it/`. Effacer : `document.cookie = "nf_country=; path=/; max-age=0"` (idem `nf_lang`).
4. Bandeau : dans Chrome, Paramètres → Langues → mettre « English » en premier ; ouvrir en navigation privée une page `/fr/...` (ex. `/fr/pro.html`) ; attendre 2 secondes. Pour le revoir : effacer le stockage local du site (outils de développement → Application → Local Storage).

## Limites

- La localisation par IP est approximative (VPN, réseaux d'entreprise, roaming). Le sélecteur de langue reste toujours disponible.
- Netlify ne connaît que le pays, pas la région : le Québec est reconnu seulement par la langue du navigateur.
- Le cookie `nf_country` sert aux redirections Netlify ; la documentation ne dit pas s'il modifie aussi la localisation lue par les statistiques (`/api/geo`). À vérifier une fois sur un aperçu (un visiteur qui a choisi une langue pourrait apparaître dans le pays « représentatif » de cette langue).
- Le bandeau ne couvre pas encore les articles de blog ni les articles locaux.
- `/index.html` reste une redirection permanente vers `/fr/` (ancienne adresse, inchangée).

## À faire par d'autres (hors de mon périmètre)

1. **Générateur (important)** : `_redirects` est régénéré par `scripts/build-locales.js`, qui contient encore l'ancien aiguillage. Pendant ce chantier, un autre agent a relancé le générateur et **a effacé le nouvel aiguillage deux fois** (02:39 et 02:43 ; je l’ai remis à chaque fois). Tant que le correctif n’est pas appliqué, chaque lancement du générateur recommencera. Il faut appliquer le correctif prêt à l'emploi `reports/auto-langue-2026-09-19-build-locales.patch` (2 petits changements : le générateur lit la table de `lib/lang-routing.js`) — vérifié : avec ce correctif, le générateur produit exactement le `_redirects` actuel. Tant que ce n'est pas fait, le test `tests/lang-routing.test.js` échoue dès qu'on relance le générateur (c'est voulu, pour ne pas perdre l'aiguillage en silence).
2. **Page Cookies** (pages légales, les 9 versions) : ajouter `nf_country` et `nf_lang` (cookies, 13 mois, « mémoriser la version du site choisie »), et en stockage local `iashark_dir_chosen` (version choisie), `iashark_lang_hint_dismissed` et `iashark_lang_hint_seen` (bandeau fermé / nombre d'affichages). Cookies fonctionnels déposés à la demande du visiteur : pas de consentement nécessaire, mais ils doivent être listés.

## Choix faits sans décision du propriétaire (modifiables en une ligne dans `lib/lang-routing.js`)

- Belgique avec navigateur néerlandais → `/en/` (plutôt que `/fr/`).
- Maroc, Algérie, Tunisie → `/fr/` même avec un navigateur en arabe.
- Pays sans version dans leur langue (Pays-Bas, Scandinavie, Japon...) → `/en/` au lieu de `/fr/` auparavant.
- Île de Man, Jersey, Guernesey, Namibie, Botswana, Lesotho, Eswatini → `/en/` (en €), car les offres en £ et en rand ne couvrent que le Royaume-Uni et l'Afrique du Sud dans config/markets.json.

## Fichiers (pour le responsable du dépôt)

- `_redirects` : bloc de la racine `/` remplacé (le reste du fichier est inchangé).
- `lib/lang-routing.js` (nouveau, non publié) : table pays → version, simulation de Netlify.
- `lib/lang-suggest.js` (nouveau, publié) : bandeau.
- `i18n/i18n.js` : cookies `nf_country`/`nf_lang` et clé `iashark_dir_chosen` au choix d'une version ; chargement du bandeau à la demande (seulement si la langue du navigateur diffère de celle de la page).
- `tests/lang-routing.test.js`, `tests/lang-suggest.test.js` (nouveaux) ; `tests/geo-dirs.test.js` : attentes de la racine lues dans `lib/lang-routing.js`.
- `reports/auto-langue-2026-09-19-build-locales.patch` : correctif du générateur à appliquer (`git apply`).
