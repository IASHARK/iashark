# Onglet « Hier » et preuve des resultats — specification (20/09/2026)

Decision du proprietaire (19-20/09/2026, nuit). Remplace l'onglet « Apres-demain »
(toujours vide) par un onglet « Hier » qui sert de PREUVE : le visiteur voit, sans
cliquer et sans payer, le marche qu'on avait retenu la veille et s'il est passe.

## Regles non negociables

1. **Tout est publie, y compris les pertes.** On n'affiche jamais une selection des
   bons resultats. Un marche retenu et regle apparait, gagnant ou perdant. Un jour a
   20/52 s'affiche comme un jour a 47/52. Toute autre approche est une pratique
   commerciale trompeuse (art. L121-2 du code de la consommation) et detruirait la
   credibilite de la preuve.
2. **Jamais avant la fin du match.** Le pari d'un match non termine reste payant :
   aucune donnee premium d'un match en cours ou a venir ne passe dans un fichier
   public, un JSON client ou une reponse non authentifiee. Le declencheur est le
   statut reel renvoye par l'API (FT/AET/PEN), jamais une heure estimee cote client.
3. **Jamais de promesse.** Aucun ROI, aucun « gagnez », aucun taux de reussite moyen
   mis en avant comme argument de vente. Un constat factuel et date : « 47 marches
   sur 52 realises hier ». Mention obligatoire a cote du bilan : les resultats passes
   ne prejugent pas des resultats futurs.
4. **Le resultat juge le pari PUBLIE** (gel, lib/pick-freeze.js), jamais un pari
   recalcule apres coup.
5. **Jamais de donnee inventee.** Un match non regle n'est pas affiche comme gagne ou
   perdu : il est « en attente ». Un buteur dont on ne connait pas le resultat n'est
   pas colore.
6. **Source des cotes affichee telle qu'elle est.** `market_source` / `has_pinnacle`
   disent la verite match par match : « (Pinnacle) » seulement quand la cote vient
   vraiment de Pinnacle, sinon la source reelle (« cotes moyennes »). En tout petit,
   entre parentheses, a cote de la cote.
7. **Parite mobile/desktop** : meme contenu, meme droits, seule la presentation change.

## Ce que voit le visiteur

- Accueil, bande d'onglets : **Hier | Aujourd'hui | Demain** (actif par defaut :
  Aujourd'hui).
- Onglet Hier : uniquement les matchs OU UN MARCHE AVAIT ETE RETENU (no_signal retire).
  Chaque ligne montre, sans clic : equipes, competition, score final, marche retenu,
  cote + source, et le verdict.
- Verdict visuel (decision : bordure ET fond teinte ET libelle, jamais la couleur
  seule — daltonisme, WCAG 1.4.1) :
  - gagne : bordure gauche 3px `--green` (#34d399), fond `rgba(52,211,153,.10)`,
    badge « Gagne » avec une coche ;
  - perdu : bordure gauche 3px `--red` (#fb8a8a), fond `rgba(251,138,138,.10)`,
    badge « Perdu » avec une croix ;
  - annule/rembourse (void) : neutre, badge « Match annule » ;
  - non regle : neutre, badge « En attente ».
- Bandeau en haut de l'onglet : « Resultats d'hier : 47 marches sur 52 realises »
  (void exclus du total), + lien « Voir tous les resultats » vers la page SEO.
- Les 3 buteurs du jour de la veille : meme code couleur, nom du joueur visible
  (le match est termine), « a marque » / « n'a pas marque ».
- L'analyse complete d'un match termine est ouverte a tous (voir lot R4).
- Accueil, bloc d'appel : le gros cadre « Voir l'analyse du jour » (gratuite) reste ;
  le second bouton devient « Voir les resultats d'hier ».

## Architecture

Contrainte Netlify : le compte a ete coupe pour depassement le 15/09/2026. Un
rafraichissement toutes les 30 minutes NE DOIT PAS declencher de build : rien n'est
commite par le job de resolution. Il ecrit dans Supabase, le navigateur lit Supabase.

- **Resolution (toutes les 30 min, en soiree)** : `.github/workflows/results-refresh.yml`
  appelle `fixtures?date=<aujourd'hui>&timezone=Europe/Paris` (1 appel, tous les
  matchs du jour) + la Coupe du monde (`league=1`), regle les paris publies et ecrit
  la table `match_results` (service role). ~2 appels par passage, ~32 par jour, sur un
  quota de 75 000/jour.
- **Lecture navigateur** : table `match_results` en lecture anonyme (RLS : SELECT
  pour `anon`), uniquement des lignes de matchs termines.
- **Fichier statique** : le pipeline quotidien ecrit `results/<YYYY-MM-DD>.json`
  (public, 60 jours glissants) + `results/index.json`. Sert de source aux pages SEO
  et de repli au navigateur.
- **Pages SEO** : `<dir>/resultats/index.html` et `<dir>/resultats/<date>.html` dans
  les 9 versions, generees par le pipeline quotidien.

## Lots et proprietaires de fichiers (travail parallele : ne jamais toucher un
fichier d'un autre lot)

- **R1 — resolution et donnees** : `lib/match-results.js`, `tests/match-results.test.js`,
  `.github/workflows/results-refresh.yml`, `supabase/migrations/0032_*.sql`,
  `.github/workflows/update-data.yml`, `scripts/build-public.js`, `results/`.
- **R2 — accueil** : `home-list.js`, `home-scorers.js`, `assets/home-list.css`,
  `assets/home-scorers.css`, `index.html`, `i18n/parts/homelist.*.json`,
  `i18n/parts/scorers.*.json`, `tests/home-list*.test.js`, `tests/home-scorers*.test.js`.
- **R3 — pages SEO resultats** : `scripts/results-pages.js`, `i18n/parts/resultats.*.json`,
  `i18n/seo/*.json`, `scripts/i18n-sitemaps.js`, `tests/results-pages.test.js`,
  `<dir>/resultats/`.
- **R4 — ouverture des analyses terminees** : `supabase/functions/match-data/index.ts`,
  `match-page.js`, `lib/match-view-model.js`, `assets/match-page.css`,
  `i18n/parts/matchpage.*.json`, `tests/match-page*.test.js`.

Aucun agent ne lance `git commit`, `git push`, ni la suite de tests complete ni
Playwright : chacun teste SES fichiers (`node --test tests/<son fichier>`). Le
rassemblement, la suite complete et la publication sont faits par la session
principale.

## Format commun `results/<YYYY-MM-DD>.json` (contrat entre R1, R2 et R3)

```json
{
  "day": "2026-09-19",
  "generated_at": "2026-09-20T06:12:00.000Z",
  "totals": { "settled": 52, "won": 47, "lost": 5, "void": 1, "pending": 0 },
  "matches": [
    {
      "id": 1575507,
      "home": "Nacional",
      "away": "Famalicao",
      "league": "Primeira Liga",
      "league_key": "primeira",
      "kickoff": "2026-09-19 21:30",
      "score": "2-1",
      "pick": "Plus de 1.5 buts",
      "market_id": "over15",
      "cote": 1.32,
      "odds_source": "pinnacle",
      "result": "win",
      "href": "/match/nacional-famalicao-1575507.html"
    }
  ],
  "scorers": [
    {
      "match_id": 1575507,
      "match": "Nacional - Famalicao",
      "player": "Nom du joueur",
      "goals": 1,
      "result": "win"
    }
  ]
}
```

- `result` : `"win" | "loss" | "void" | "pending"`. `totals.settled = won + lost`
  (les `void` et `pending` ne comptent ni au numerateur ni au denominateur du
  bandeau : « 47 marches sur 52 realises » = won sur (won+lost)).
- `odds_source` : `"pinnacle"` quand la cote vient de Pinnacle, sinon la source
  reelle (`"moyenne"`). Jamais devine.
- `href` : lien vers la page match existante (registre
  `data/match-pages-registry.json`), absent si la page n'existe pas.
- Un match sans marche retenu (no_signal) n'entre pas dans le fichier.
