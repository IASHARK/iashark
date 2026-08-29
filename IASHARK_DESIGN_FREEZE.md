# IASHARK — Design Freeze (V1 → gel visuel avant V2)

Inventaire de l'identité visuelle actuelle, à conserver telle quelle pendant la transformation V2 (§1.1 du cahier des charges). Aucune valeur ci-dessous ne doit être réinventée — seulement centralisée/réutilisée.

## Constat architectural (à corriger en V2, pas à contourner)

**Il n'existe aucune feuille de style partagée.** Chaque page HTML définit son propre bloc `<style>` avec sa propre déclaration `:root{...}`. Les valeurs sont identiques à 95% d'une page à l'autre mais avec une dérive mineure de nommage déjà observée :
- `historique.html` : `--border-cyan`
- `compte.html` : `--bc` (même valeur) + `--ba` (amber border, absent ailleurs)
- `pro.html`, `match.html`, `a-propos.html`, `landing.html` : tokens présents mais formatés différemment (non capturés par une regex simple sur une seule ligne — à vérifier individuellement avant extraction).

Ce n'est pas un bug visuel (rien ne casse), mais c'est exactement le problème que §35 demande de corriger : extraire ces tokens dans un fichier CSS partagé unique, sans changer une seule valeur.

## Palette de couleurs (confirmée identique sur index.html/historique.html/compte.html)

```css
--bg: #080c12;              /* fond principal, noir bleuté profond */
--card: #0d1520;            /* fond de carte */
--card2: #0f1a28;           /* fond de carte secondaire/hover */
--cyan: #22d3ee;            /* accent principal — liens, boutons, logo "IA" */
--cyan2: #06b6d4;           /* variante cyan plus foncée */
--amber: #f59e0b;           /* accent secondaire — badges, avertissements, eyebrow */
--green: #10b981;           /* succès / WIN */
--red: #ef4444;             /* erreur / LOSS */
--text: #e2e8f0;            /* texte principal */
--muted: #4a6580;           /* texte secondaire / labels */
--border: rgba(255,255,255,0.06);
--border-cyan: rgba(34,211,238,0.18);   /* nommé --bc dans compte.html */
--border-amber: rgba(245,158,11,0.2);   /* --ba dans compte.html, absent ailleurs */
```

**Aucune nouvelle couleur ne doit être ajoutée en V2** sans qu'elle serve un besoin fonctionnel réel (ex. un état supplémentaire comme VOID/PUSH pourrait légitimement réutiliser `--muted` plutôt qu'une nouvelle teinte).

## Typographie

Trois familles, chargées via Google Fonts sur toutes les pages testées :
```
Bebas Neue                 — display/titres (logo, H1, valeurs chiffrées mises en avant)
Space Mono (400, 700)      — labels, eyebrows, badges, boutons (UPPERCASE + letter-spacing)
DM Sans (300,400,500,600 + italique 400) — corps de texte
```

Convention observée : les labels/eyebrows utilisent systématiquement `font-family:'Space Mono'`, `text-transform` implicite via écriture en majuscules dans le HTML lui-même (pas de `text-transform:uppercase` CSS — le texte est écrit en capitales directement dans le contenu), avec `letter-spacing` entre 1px et 3px selon la taille.

## Composants récurrents identifiés

- **Header sticky** : `position:sticky; top:0; z-index:99; background:rgba(8,12,18,0.96); backdrop-filter:blur(14px); border-bottom:1px solid var(--border); height:56px`
- **Logo** : `font-family:'Bebas Neue'; font-size:24px; letter-spacing:3px`, avec le "IA" de "IASHARK" coloré en `var(--cyan)`, le reste en `var(--text)`
- **Bouton primaire (login/CTA)** : `font-family:'Space Mono'; font-size:9px; letter-spacing:1px; padding:6px 14px; border-radius:8px; border:1px solid rgba(34,211,238,0.3); background:rgba(34,211,238,0.06); color:var(--cyan)`
- **Cartes** : fond `var(--card)`, bordure `var(--border)`, coins arrondis (rayon observé ~10-14px selon composant)
- **Navigation basse mobile** : icônes + labels, 5 entrées (Accueil/Historique/Outils/Guides/Compte), item actif coloré en `var(--cyan)`
- **Badges d'état** : pastille colorée + texte Space Mono majuscule (`WIN` vert, `LOSS` rouge, `⭐ OUTILS` cyan/amber)
- **Glow radial décoratif** : `background:radial-gradient(ellipse, rgba(34,211,238,0.03-0.08) 0%, transparent 60-65%)` — utilisé en fond de hero sur plusieurs pages, à réutiliser tel quel plutôt que réinventer un effet différent.

## Captures de référence prises pendant l'audit (à réutiliser comme baseline visuelle)

Capturées en direct via serveur statique local (contournement de la redirection maintenance), disponibles dans l'historique de conversation de l'audit précédent — non re-sauvegardées en fichiers image dans le dépôt à ce stade :
- Accueil — desktop (800×450) et état avec bannière cookies
- `a-propos.html` — desktop, section méthodologie + bloc stats
- `historique.html` — desktop, liste complète 291 paris + filtres
- `pro.html` — desktop et mobile 390px, mur "Outils" ouvert
- `compte.html` — desktop et mobile 390px, formulaire connexion/inscription
- `maintenance.html` — desktop, page de pause actuelle

**Recommandation pour la suite** : avant toute modification de page en Phase 5, reprendre une capture desktop + mobile 390px de la page concernée avec le serveur statique local, la sauvegarder dans `design-baseline/<page>-<breakpoint>-before.png`, puis comparer visuellement après modification. Aucune capture de ce type n'existe encore dans le dépôt — à créer au fil de l'eau plutôt que toutes d'un coup, pour rester synchronisé avec l'état réel de chaque page au moment où elle est modifiée.

## Règle de non-régression

Toute page modifiée en Phase 5 doit, après modification :
1. Réutiliser les tokens ci-dessus sans changement de valeur.
2. Conserver le header sticky, le logo, la navigation basse mobile identiques.
3. Ne pas introduire de nouvelle police.
4. Être revérifiée visuellement (capture avant/après) sur au moins desktop (1440) et mobile (390) avant d'être considérée terminée.
