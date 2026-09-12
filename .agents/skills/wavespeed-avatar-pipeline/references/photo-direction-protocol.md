# Photo art-direction protocol for Shanon

Same idea as `script-writing-protocol.md`, for photos: the problem was never
that a nice image can't be imagined — it's that there was no stable decision
method for what actually goes in the prompt, especially across the 3 photos
needed for one day's videos. This is the decision method. Apply it before
writing any prompt passed to `generate_identity_photo` / `generate_story_variants`
(currently `bytedance/seedream-v5.0-pro/edit`, see `PHOTO_MODEL` in
`pipeline.py` — treat that constant as the source of truth for which model,
not this doc, in case it changes).

**Resolved 2026-08-23, with a nuance — don't collapse this to "nano-banana is
now the locked model":** Seedream's output is genuinely better for
photorealistic *skin texture* (see the model comparison in `known-issues.md`).
But re-tested properly (all 6 identity refs, no mirroring trigger present),
`google/nano-banana-pro/edit` produced a clearly better result for a
*different, narrower objective*: passing as an authentic incidental smartphone
capture rather than a composed portrait. Two different objectives, two
different answers — `PHOTO_MODEL` in `pipeline.py` deliberately still says
Seedream; nano-banana is used via a standalone script for this specific
objective, not yet wired into the CLI. See the method below and
`known-issues.md`'s "Photo model comparison" entry for the real evidence
behind both verdicts.

## Capture-realism generation method (validated 2026-08-23)

The reproducible method that got from "looks like a generated portrait" to a
locked, identity-safe image judged as a convincing incidental smartphone
capture. This is the method to reuse for a new location/outfit, not just a
record of one result.

**Never touch these, for any of it**: the 6 identity reference photos
(`shanon_profile.json`), passed unmodified and complete on every single call.
Identity is fixed; only how the same person is captured is the variable.

1. **State the objective precisely before generating anything.** Not "more
   realistic" — the actual test used: *"if you saw this image alone, would you
   spontaneously believe it's a real frame captured by a smartphone in a real
   car, not 'is this a beautiful realistic image'."* A different, sharper
   question than the general realism checklist below.
2. **Diagnose first, referencing the actual generated result, not theory** —
   what specifically reads as generated (perspective, lighting bias, framing
   composition, exposure) before touching the prompt. Re-diagnose after every
   real candidate; don't keep iterating on a stale diagnosis.
3. **Treat the physical capture setup as ONE coherent hypothesis, not several
   independent variables.** Phone position, camera height/angle, distance,
   perspective, and light are physically linked (angle depends on position,
   perspective depends on distance) — bundle them into one prompt describing
   a specific, physically consistent scenario, tested as a single unit against
   the baseline. Isolating them separately produces physically incoherent
   combinations.
4. **The explicit ingredients that mattered, concretely** (not exhaustive for
   every future scene, but the ones proven to move the needle for "car"):
   - Framing: incidental, not composed — a small natural off-center
     imperfection, not a centered "portrait" crop. Don't over-correct into
     looking "shot from the side" either (see point 7).
   - Perspective: natural phone front-camera field of view at a real
     implied distance (~45-55cm) — neither a flattened long-lens portrait
     compression nor an exaggerated wide-angle distortion.
   - Camera position implied only by framing/angle — **never described via a
     visible object**. Any prompt language describing a mount/phone/holder
     risks the model rendering that object in frame, which then contradicts
     the "this IS the camera" illusion. State the angle/height, not the prop.
   - Light: explicitly banal/ordinary daylight, explicitly ruling out beauty/
     ad/cinematic register, no deliberate rim light or backlight — a vaguely
     worded "directional light" instruction alone drifted toward a cinematic
     look; the negative constraints had to be spelled out explicitly.
   - Background: a normal, lived-in car interior — don't add deliberate
     clutter, that risks new artifacts for no proven benefit.
5. **Safety-check identity on every candidate, but it is not the decision
   criterion.** `identity-check` catches gross drift; it says nothing about
   whether the image reads as a real capture. A high score (this round's
   candidates scored 0.70-0.85) is a pass/fail gate, not a quality ranking.
6. **Decide on ONE human question at a time, in writing, before generating
   the next candidate** — e.g. "does the geometry read as a phone mounted in
   front of her" is a different, narrower question than "does the light read
   as banal daylight," and conflating them makes it unclear which fix
   actually helped.
7. **A "looser/more space" correction can overcorrect.** Going from a
   centered composed portrait to more negative space around the subject can
   swing too far and read as "shot from the side" instead of "camera facing
   her" — check the specific geometry question (point 6) again after any
   framing change, don't assume "more natural-looking" in isolation is
   always the right direction.
8. **Verify the exact file before locking, every time — by hash, not by
   filename or folder-number memory.** A wrong file (from an earlier,
   unrelated test round) was mistakenly locked as "the" source image on
   2026-08-23 and used for a full downstream video benchmark before the
   mismatch was caught by eye. See `known-issues.md`'s locked-image entry for
   the concrete fix: always confirm SHA256 before using a "locked" image path
   in a real generation call, and re-confirm right before each API call, not
   just once at lock time.

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
