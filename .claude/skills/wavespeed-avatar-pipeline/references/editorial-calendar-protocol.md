# Editorial calendar protocol for Shanon

This sits above `script-writing-protocol.md` and `photo-direction-protocol.md`,
not instead of them. Those two know how to build ONE video once you know what
it's about. This protocol decides *what gets made today, and why*, and thinks
about the day's 3 videos as one program instead of three independent guesses.

**Central rule: no video starts directly with a script.** Every video starts
from a row in `editorial_calendar.csv` (path: `EDITORIAL_CALENDAR_PATH` in
`pipeline.py`, currently `/Users/clement/Desktop/Shanon avatar/editorial_calendar.csv`).
If you catch yourself about to write a script from "make a video about X"
with no calendar row behind it, stop and go fill in the row first — subject →
category → content type → objective → research method → angle → tone →
*then* script → visual direction → generation.

## Three axes that are NOT the same thing

Filling these in as one blurry idea ("a betting video") is exactly what
produces generic content. Keep them separate for every row:

- **Catégorie** — what world it's from: Betting / Foot / Personnel / Lifestyle.
- **Type de contenu** — the shape: Prono, Réaction, Storytelling, Opinion/Débat,
  Éducation, Communauté/Réponse, Découverte/Viralité. (Maps to the research
  pipelines in `script-writing-protocol.md`, plus the two new ones below.)
- **Objectif principal** — the result being chased: Conversion, Engagement,
  Proximité, Autorité/crédibilité, Découverte.

A finished decision reads like "Football → Réaction → Engagement", not "un truc
sur le PSG."

All research processes, including for these two content types, are defined
in `research-methods-protocol.md` — that file's `education_explanation_research`
and `community_comment_analysis` slugs cover Éducation and Communauté/réponse
commentaire.

## Never force a prono

The system must never reason "there's a big match today, so let's do a
prono on it." It reasons: list today's available events → analyze several
markets → compare the opportunities → eliminate the weak ones → select the
one with the best justification by the criteria in the prono research
pipeline (`script-writing-protocol.md`). **If nothing clears the bar, that
slot becomes a different content type instead of a weak prono.** This is a
hard rule, not a preference — it's what protects Shanon's credibility as
someone whose picks mean something.

## Priority scoring (for choosing among candidate ideas)

When there are more candidate ideas than slots (there almost always are),
score each candidate 1-5 on each of these five criteria before picking:

| Criterion | 1 | 5 |
|---|---|---|
| Potentiel viral | personne ne s'arrête | hook évident, mécanique forte |
| Pertinence pour Shanon | hors sujet pour elle | cœur de son expertise/persona |
| Actualité / fraîcheur | déjà vu, périmé | vraiment nouveau aujourd'hui |
| Crédibilité / qualité des données | rien de solide trouvé | données/sources vérifiées et fortes |
| Originalité vs les autres vidéos du jour | répète une autre vidéo du jour | angle/mécanique distincts |

**Score total /25.** Working thresholds (adjust with real data over time, note
here when you do):
- **Below 15/25**: don't use it, keep looking or pick a different content type.
- **Prono specifically**: the "crédibilité / qualité des données" sub-score
  must be **at least 4/5** on its own regardless of the total — a prono can't
  be saved by being viral if the data behind it is thin. This is the
  mechanical enforcement of "never force a prono" above.

Log the score on the calendar row (`priority_score` column) so a later
question ("why did we pick this?") has an answer.

## The day's 3 videos are one program, not 3 draws

Before writing the first script of the day, decide all three rows together:

- **Vary category/type/objective across the three** — the failure mode to
  avoid is 3 pronos, 3 réactions, 3 aggressive videos, or 3 identical hooks
  in one day. A healthy day looks more like: V1 Expertise/Conversion, V2
  Actu/Engagement, V3 Personnel/Proximité — or Prono, Opinion forte, Réponse
  communauté. There's no single fixed pattern; the point is diversity, not a
  template to copy every day.
- **Check recent days too, not just today** — before locking in each slot's
  retention mechanic (see `viral-mechanics-protocol.md`), scan the
  `viral_mechanic` column of the last several days in the calendar. A hook
  mechanic that repeats every day stops working even if no single day repeats
  it internally — this is a real vector, not just an in-day one.
- **Decide the day's visual constants before generating anything** — per
  `photo-direction-protocol.md`: same location and outfit across the three is
  fine (a real person filming three videos in one sitting), but pose,
  expression, and framing should differ intentionally between them, decided
  up front, not improvised photo by photo.
- **CTA is chosen per video, not defaulted** — decide what the ending should
  provoke (comment, prise de position, partage, curiosité pour la suite,
  conversion, proximité) based on that video's own objective. A generic
  "abonne-toi" is not a CTA decision, it's skipping the decision.

## Sources traceability

For any video built on real facts (prono, actu, réaction, opinion), keep a
`sources` note on the calendar row — the specific stats/odds source, the
media outlet and original reporter for an actu, the event source for a
réaction, the factual basis for an opinion. If a script gets questioned
later, this is how you trace a claim back to where it came from. Never leave
this blank for a fact-based video.

## The calendar file

CSV at the path in `EDITORIAL_CALENDAR_PATH`. Columns:

```
date, slot, category, content_type, objective, subject, research_method,
sources, angle, viral_mechanic, viewer_emotion, tone, cta, location, outfit,
priority_score, status
```

- `slot`: V1 / V2 / V3 (or more, if the daily count ever changes).
- `research_method`: one of the slugs in `research-methods-protocol.md` — not
  a free-text description. If a candidate idea doesn't map cleanly to one of
  those slugs, that's a sign the research process for it hasn't actually been
  designed yet (see that file's closing note on adding a new one).
- `viral_mechanic` / `viewer_emotion`: two different decisions from
  `viral-mechanics-protocol.md`, not the same thing written twice —
  `viral_mechanic` is the structural device (contradiction, révélation
  progressive...), `viewer_emotion` is what the viewer is meant to feel
  watching it (curiosité, surprise, envie de répondre...). Keeping them in
  separate columns is what stops them from getting blurred into one vague
  "vibe" decision.
- `status`: idée → recherche → script → visuel → généré → publié (advance it
  as the video moves through the pipeline; don't skip straight to "généré").
- `location` / `outfit`: reference names from `SCENE_PROMPTS` / the future
  outfit catalogue (see `photo-direction-protocol.md`) — not free text.

Use `pipeline.py`'s calendar helpers (`read_calendar`, `append_calendar_row`,
`todays_calendar_entries`) instead of hand-editing the CSV once a day's rows
exist — keeps the file format consistent.
