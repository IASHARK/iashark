# IASHARK — Politique de snapshots de cotes (MASTER V2.1 §10.U.1, §10.C)

## Règle du MASTER

API-Sports ne doit jamais être considéré comme une archive historique permanente. Les cotes doivent être capturées localement dès qu'elles apparaissent. Snapshots cibles idéaux : `FIRST_SEEN`, `T72`, `T24`, `T6`, `T90`, `LINEUP`, `CLOSE`. Si un snapshot exact est manqué, enregistrer le timestamp réel, ne jamais fabriquer la valeur attendue.

## État réel aujourd'hui

Deux snapshots existent, pas la séquence complète de sept :

| Snapshot | Table | Job | Fréquence | Contenu |
|---|---|---|---|---|
| `'prediction'` | `match_snapshots` (migration `0004_forward_snapshots.sql`) | `update-data.yml` (`writeSnapshots`) | 1×/jour (cron pipeline) | odds, injuries, lineups, team stats, H2H, météo, arbitre, Elo, classement — tout ce que le pipeline a en mémoire au moment de la génération |
| `'closing'` | `match_snapshots` | `closing-odds.yml` | Toutes les 30 min, dans les 3h avant coup d'envoi | cotes uniquement (`parseOdds`) |

Ce que ça couvre du MASTER : approximativement `FIRST_SEEN` (le snapshot `'prediction'` du jour où le match apparaît pour la première fois dans le pipeline) et `CLOSE` (le dernier `'closing'` écrit avant kickoff). **`T72`/`T24`/`T6`/`T90`/`LINEUP` n'existent pas** — le pipeline ne tourne qu'une fois par jour, donc il n'y a par construction qu'un seul point de mesure "prediction" par match (pas de re-snapshot à mesure que le coup d'envoi approche, sauf le `'closing'` dédié aux cotes).

## Contrainte honnête

`match_snapshots` utilise `primary key (fixture_id, snapshot_type)` — un seul `'prediction'` par fixture, **écrasé** si le pipeline tourne plusieurs fois avant que le match soit verrouillé (`matchCache`). C'est un choix délibéré (voir commentaire dans la migration) : on garde l'état le plus récent avant verrouillage, pas l'historique complet des révisions. Si le MASTER veut une vraie séquence `T72`→`T24`→`T6`→`T90`→`LINEUP`, la clé primaire devra changer pour inclure un identifiant de snapshot temporel (ex: `(fixture_id, snapshot_type, captured_bucket)`), et le pipeline principal devra tourner plus fréquemment qu'une fois par jour — ce qui a un coût en quota API-Sports (§10.AM) à budgéter avant de le faire.

## Prochaine étape concrète

1. Décider si `update-data.yml` doit tourner plusieurs fois par jour (ex: 4× pour approximer `T72`/`T24`/`T6`/`T90`) ou si un job séparé, léger, dédié aux re-snapshots suffit (sur le modèle de `closing-odds.yml`, qui ne refait qu'un sous-ensemble léger du travail).
2. Si oui, étendre la clé primaire de `match_snapshots` pour ne plus écraser les snapshots précédents.
3. Une fois plusieurs semaines de vrais snapshots multiples accumulées, mesurer réellement le closing line value (§10.U.5) — actuellement impossible (un seul point `'prediction'` par match, sans historique de révision).
