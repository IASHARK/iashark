# IASHARK — Template vidéo Match Pulse réutilisable

## Message à copier-coller à Claude

Tu travailles dans ce projet Remotion :

`/Users/clement/Documents/IASHARK CLAUDE CODE/iashark/remotion-score-template`

La template maître existe déjà. Ne la redessine pas et ne change pas sa mise en page.

Fichier du composant :

`src/MatchPulseBrentfordChelseaInstagram.tsx`

Fichier dans lequel créer la nouvelle composition du match :

`src/Composition.tsx`

La composition de référence déjà terminée est :

`MarseillePsgChelseaStyle`

Elle est en 1080 × 1920, 30 fps, 600 frames, soit 20 secondes. Elle contient :

- logo IASHARK dans la zone sûre TikTok ;
- compétition, date et heure ;
- deux grands logos et les noms des clubs ;
- chrono animé de 0 à 90 minutes ;
- pause de 2,5 secondes à 45 minutes ;
- frise 0–90 ;
- ballons qui apparaissent uniquement lorsque le chrono atteint la minute du but ;
- courbe de fréquence animée par tranches de 15 minutes ;
- indicateurs Pression, Tirs et Rythme ;
- jauge xG dynamique entre les deux équipes ;
- adresse IASHARK.COM dans la zone sûre ;
- aucune voix et aucun commentaire central.

### Ta mission pour chaque nouveau match

1. Ne modifie jamais le design, les positions, les tailles, les animations, les couleurs, la durée ou les marges TikTok du composant maître.
2. Ajoute seulement une nouvelle `<Composition>` dans `src/Composition.tsx`.
3. Change uniquement les données listées dans `defaultProps`.
4. Utilise les logos officiels placés dans `public/logos/`. Si un logo manque, télécharge le PNG officiel de l’API dans ce dossier avant le rendu.
5. Vérifie que les six tableaux ont exactement six valeurs, une par période : 0–15, 15–30, 30–45, 45–60, 60–75 et 75–90.
6. Les valeurs `homeXg` et `awayXg` doivent être cumulatives et toujours croissantes.
7. Les buts sont un scénario représentatif. Un ballon ne doit jamais être visible avant sa minute.
8. `pressure`, `shots` et `rhythm` sont des niveaux entiers de 1 à 5 pour chaque période.
9. Garde obligatoirement `showVs:false` et `showCommentary:false`.
10. Avant l’export final, rends une image de contrôle vers la 80e minute et vérifie que rien n’est coupé ou masqué.

### Bloc à dupliquer dans `src/Composition.tsx`

```tsx
<Composition
  id="NomUniqueDuMatch"
  component={MatchPulseBrentfordChelseaInstagram}
  durationInFrames={600}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{
    homeName: "EQUIPE DOMICILE",
    awayName: "EQUIPE EXTERIEURE",
    homeLogo: "logos/logo-domicile.png",
    awayLogo: "logos/logo-exterieur.png",
    competition: "COMPETITION • DATE • HEURE",
    showVs: false,
    showCommentary: false,

    // Minutes du scénario représentatif. Supprimer le tableau si aucun but.
    goals: [
      {minute: 14},
      {minute: 59},
      {minute: 86},
      {minute: 90},
    ],

    // xG cumulés à la fin de chaque tranche de 15 minutes.
    homeXg: [0.20, 0.37, 0.54, 0.78, 0.96, 1.27],
    awayXg: [0.35, 0.59, 0.82, 1.25, 1.51, 2.04],

    // share = fréquence des buts observés pendant la période.
    // pressure, shots et rhythm = niveau visuel de 1 à 5.
    phases: [
      {label:"0–15",  share:19, level:"", title:"", note:"", pressure:3, shots:2, rhythm:3, balance:50},
      {label:"15–30", share:7,  level:"", title:"", note:"", pressure:2, shots:2, rhythm:2, balance:50},
      {label:"30–45", share:12, level:"", title:"", note:"", pressure:3, shots:3, rhythm:3, balance:50},
      {label:"45–60", share:19, level:"", title:"", note:"", pressure:4, shots:4, rhythm:4, balance:50},
      {label:"60–75", share:13, level:"", title:"", note:"", pressure:3, shots:4, rhythm:3, balance:50},
      {label:"75–90", share:29, level:"", title:"", note:"", pressure:5, shots:5, rhythm:5, balance:50},
    ],
  }}
/>
```

`balance` est conservé pour la compatibilité du type, mais il n’est pas utilisé quand `showCommentary:false` : la jauge est calculée automatiquement avec les xG.

### Comment calculer les données

- `share` : part des buts des deux équipes tombés dans chaque tranche de 15 minutes. Les six valeurs devraient totaliser environ 100 % ; un petit écart lié aux arrondis est accepté.
- `homeXg` / `awayXg` : xG cumulés prévus à 15, 30, 45, 60, 75 et 90 minutes.
- `pressure` : convertir l’intensité ou la probabilité de but de la période sur une échelle de 1 à 5.
- `shots` : convertir le volume attendu de tirs/tirs cadrés de la période sur une échelle de 1 à 5.
- `rhythm` : convertir l’intensité générale de la période sur une échelle de 1 à 5.
- `goals` : prendre les minutes du scénario représentatif fourni par le moteur, sans inventer de buteur.

Conversion simple recommandée pour une valeur normalisée de 0 à 100 :

- 0–20 → 1 barre
- 21–40 → 2 barres
- 41–60 → 3 barres
- 61–80 → 4 barres
- 81–100 → 5 barres

### Contrôle visuel

Depuis le dossier du projet :

```bash
npx remotion still src/index.ts NomUniqueDuMatch out/controle-nom-match.png --frame=500 --timeout=120000
```

Vérifie :

- logo du haut suffisamment bas ;
- adresse IASHARK.COM suffisamment haute ;
- contenu centré verticalement ;
- marge libre en haut et en bas ;
- aucune donnée importante dans la colonne des boutons TikTok à droite ;
- ballons posés directement sur la frise ;
- aucun ballon futur visible.

### Export final

```bash
npx remotion render src/index.ts NomUniqueDuMatch out/nom-match-iashark.mp4 --codec=h264 --crf=18 --timeout=120000
```

À la fin, donne le chemin absolu du MP4 et ouvre son dossier dans le Finder avec :

```bash
open -R "/Users/clement/Documents/IASHARK CLAUDE CODE/iashark/remotion-score-template/out/nom-match-iashark.mp4"
```

### Interdictions

- Ne pas recréer une nouvelle direction artistique.
- Ne pas réintroduire le grand commentaire central.
- Ne pas afficher de score exact.
- Ne pas afficher de buteur.
- Ne pas afficher de cote de bookmaker.
- Ne pas ajouter `VS`.
- Ne pas déplacer les blocs sans demande explicite.
- Ne pas modifier la template Chelsea originale pour un seul match : ajouter une nouvelle composition configurée.
- Ne jamais exposer une clé API dans le code, les logs ou la vidéo.

## Exemple validé

La vidéo validée servant de référence visuelle est :

`out/marseille-psg-template-chelsea-centered.mp4`

L’image de contrôle est :

`out/marseille-psg-centered-check.png`

