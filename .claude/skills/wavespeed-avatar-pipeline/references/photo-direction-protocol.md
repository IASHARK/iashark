# Photo art-direction protocol for Shanon

Same idea as `script-writing-protocol.md`, for photos: the problem was never
that a nice image can't be imagined — it's that there was no stable decision
method for what actually goes in the prompt, especially across the 3 photos
needed for one day's videos. This is the decision method. Apply it before
writing any prompt passed to `generate_identity_photo` / `generate_story_variants`
(currently `bytedance/seedream-v5.0-pro/edit`, see `PHOTO_MODEL` in
`pipeline.py` — treat that constant as the source of truth for which model,
not this doc, in case it changes).

**Open question, not yet decided:** Seedream's output may be too polished/
"too good quality" for the amateur-phone-photo feel that's wanted; nano-banana
was the stronger candidate for that specific problem before it was dropped for
the mirror bug and CGI-ish skin (see `known-issues.md`). Worth re-testing
later specifically for this — not a reason to switch back now.

## Available locations

**Only "car" is actually validated right now** (multiple rounds, drift caught
and fixed, framing and wardrobe confirmed). The other entries in
`SCENE_PROMPTS` (`bedroom_draft_unvalidated`, `livingroom_draft_unvalidated`,
`outdoor_draft_unvalidated`) are exactly that — unvalidated drafts, not a
real second or third location yet. **Never invent a new location that isn't
either "car" or one of these drafts already checked with the user.** Your job
is to direct Shanon visually inside an existing, validated environment — not
to invent new ones on the fly. When more locations get validated together
with the user, add them to `SCENE_PROMPTS` and this doc's location list, the
same way "car" was done.

## Available outfits

**Not built yet — same status as the unvalidated locations.** Outfits work
exactly like locations: they are complete references stored in a dedicated
catalogue (a future `OUTFIT_001`, `OUTFIT_002`, ... — reference photo each,
plus metadata like season, outfit type, context, elegance level; the exact
structure gets decided with the user when it's actually built). **Never
invent a new outfit when an existing catalogue entry fits the context.** For
each video, select an existing outfit based on the subject, the location, the
season/weather, and continuity with the day's other videos. The outfit's
reference photo is given to the model — the prompt should not re-describe or
reinvent each garment. What the prompt actually needs to specify is *how*
Shanon wears that outfit in this scene, and what varies naturally around it:
hairstyle, posture, expression, accessories if needed. Until the catalogue
exists, fall back to `shanon_profile.json`'s `wardrobe_style` philosophy
(feminine, fitted, weather-appropriate) and say so explicitly rather than
silently inventing a specific garment.

## For every image, decide these explicitly — never with a vague term

"Natural pose", "elegant look", "realistic expression" are not decisions,
they're placeholders that let the model decide instead of you. For every
photo, write out concretely:

- **Body position / posture** (sitting how, upright/leaning, where exactly)
- **Body orientation** (squared to camera, slightly turned, how many degrees)
- **Arm and hand position** (not "relaxed" — where exactly, doing what)
- **Gaze direction** (at the lens, slightly off, how)
- **Expression** (specific: small closed-lip smile, neutral about to speak,
  raised eyebrow — not "natural expression")
- **Hairstyle** (up, down, which strands loose — matches or intentionally
  varies from the reference)
- **Outfit reference** (select an existing complete outfit from the outfit
  catalogue; do not invent a new outfit when a suitable reference exists.
  Check season, weather, location, and same-day continuity. Catalogue not
  built yet — see "Available outfits" above for the fallback.)
- **Accessories** (necklace as established, anything else, or explicitly none)
- **Framing** (per `FRAMING_PROMPT` in `pipeline.py` unless there's a reason
  to deviate — and if there is, that reason should be explicit too)
- **Camera angle**
- **Lighting**

The face reference and the location reference are the base; the prompt's job
is to describe exactly what changes around them. If you can't fill in one of
these with a specific answer, you haven't finished deciding — don't paper over
it with a vague adjective.

## Think about the day's videos together, not one photo at a time

Variation does not mean systematically changing location, outfit, or
hairstyle. Two or three of the day's videos can share the exact same
location, outfit, and conditions — that's coherent with one person filming
several videos in one sitting, which is exactly what's happening.

What must NOT repeat identically across the day's images: the exact same
pose, expression, hand position, body orientation, framing, or hairstyle.
Vary only what a real person would naturally change between separate takes —
the same way `generate_story_variants`'s "story time" mode holds everything
fixed except loose hair strands, but for three separate videos in a day, the
natural variation is a bit wider than that (a genuinely different small pose
or expression is fine, a different location or outfit usually isn't needed).
Keep whatever should stay consistent for a believable same-day continuity;
change only what a person actually would.

**Decide what stays fixed and what varies BEFORE writing the three prompts —
not one photo at a time.** Treating V1, V2, V3 as three independent requests
is exactly how inconsistent or randomly-varied results happen. Instead, make
one decision up front, e.g.: same car + same outfit + same shooting moment,
but three different poses, three slightly different expressions, three
different orientations/framings, and possibly a natural hairstyle variation.
Then write each of the three prompts to match that one decision, instead of
improvising each one fresh.

## Silent pre-send check

Before sending the prompt, verify, silently, every time:

- Est-ce que le lieu demandé correspond bien à la référence utilisée ?
- Est-ce que la tenue est cohérente avec la saison et les autres vidéos ?
- Est-ce que la pose est suffisamment précise ?
- Est-ce que la coiffure/position du corps apporte une variation naturelle ?
- Est-ce que cette image ressemble à une nouvelle prise de vue de Shanon
  plutôt qu'à une copie de l'image précédente ?
- Si un élément n'a pas besoin de changer, ne le change pas.
- Est-ce que ce prompt contient uniquement les informations nécessaires pour
  contrôler l'image, sans redécrire inutilement le visage ou le lieu déjà
  fournis en référence ?
- Est-ce que les variations entre V1/V2/V3 sont intentionnelles et décidées
  à l'avance, plutôt que générées au hasard ?

This is an art-direction system, not "write a good prompt" — that's the whole
point. A vague prompt lets the model guess; guessing is what produced
incoherent results and randomly-varied elements before this existed.
