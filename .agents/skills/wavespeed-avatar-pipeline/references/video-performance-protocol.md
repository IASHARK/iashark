# Video performance-direction protocol for Shanon

Added 2026-08-23 after a real finding: a generic motion prompt (even a good
one) treats every script the same way. A tired post-workout aside, a reaction
to a score, and a confident prono delivery don't share the same energy, gaze,
or micro-expression — a generic prompt can't tell them apart, so it produces
the same flat "talking head" behavior regardless of content. This protocol is
the mandatory step between "audio selected" and "write the LTX prompt."

**Never generate a video prompt directly from a script. Always fill this out
first, for that specific audio, then translate it into the prompt.**

**Correction 2026-08-24, stated as plainly as possible because it was
observed happening: never mechanically reuse a previous video's context.**
The "Retour de sport" worked example later in this file is exactly that — one
illustration of the method being applied to one specific script, not a
template whose energy (tired-but-warm) or content (just finished working out)
carries over to the next video. A new script means genuinely re-answering all
four questions below from that script's own content — a match-result
reaction, an opinion take, a surprising fact, and a tired aside are different
people-moments and must produce different answers, every time. If two videos
in a row would get the same answer to "state and energy," that's a signal to
look harder at what's actually different about this script, not a coincidence
to accept.

**Since 2026-08-24 this method feeds the first of a two-step video pipeline,
not a single lipsync call — see `video-pipeline-architecture.md` for the full
system.** Concretely: this file's four-question method and the LTX prompting
method below are used to write the prompt for a **silent** `wavespeed-ai/ltx-2.3/image-to-video`
generation (performance/motion only, no audio dependency) — voice/lipsync is
applied afterward, separately, via `sync/lipsync-2-pro`. Everything in this
file about reading the audio's real energy into the performance context still
applies exactly as before — you still need the selected voice take in hand
before filling out the four questions, because the context has to match what
she's about to be heard saying, even though this step's own generation call
doesn't take that audio as an input.

## The four questions, filled out for this specific audio every time

1. **Physical context** — where is Shanon, what is she doing, is the car
   parked or moving, what state is the camera/light in. Get this right before
   anything else: it constrains everything downstream (a car that's moving
   would need different camera/light behavior than one parked and still).
2. **State and energy** — the energy level implied by *this* audio's content,
   general mood, and the explicit reminder that the target is a spontaneous
   conversational moment, not a presenter performance.
3. **Visual behavior** — gaze (mostly camera, described as a tendency not a
   scripted event), what micro-movements/expressions are natural at points
   that follow the sense of the speech, upper body stability.
4. **Forbidden movements** — the standing list below, plus anything specific
   to this scene that shouldn't happen.

## Critical: describe tendencies, not choreography

A prompt that reads like stage directions at specific timestamps ("at this
moment, look away, then return") gets read literally and mechanically by the
model — it produces a chorus of discrete actions, not continuous natural
behavior. State qualities and tendencies instead: *"gaze stays mostly on the
camera, with only subtle natural micro-variations"*, not *"look away at
second 3, return at second 5"*. Same for expression changes — *"can turn
slightly warmer toward the end if it follows naturally from her tone"*, not
*"smile at the last sentence."* The model should be following the natural
rhythm of the speech, not executing a list.

## Standing forbidden-movements block (reuse for every video, add scene-specific items on top)

No camera movement of any kind (pan/zoom/shake) — the phone is fixed. If the
car is meant to be parked, say so explicitly and state nothing should suggest
driving or the vehicle moving. Lighting must stay stable frame to frame — no
appearing/disappearing warmth, no color-temperature shift, no flicker, no
new shadows or highlights. Facial geometry/identity/skin tone must not drift.
No hands, arms, objects, or gestures beyond what's already visible in the
source image — explicitly no spontaneous hand movement into frame. No sudden
head repositioning or exaggerated turns. No environment changes.

## Known real limitation — read before trusting the prompt alone

**This standing block was already used, worded explicitly, in a real LTX
test — and the video still showed a light-drift artifact and an invented
hand appearing mid-clip.** Prompting reduces the failure rate, it does not
reliably prevent it on this model. This is exactly why the frame-by-frame
audit stays mandatory on every real generation, regardless of how carefully
the prompt was written — a clean-looking prompt is not evidence of a clean
result.

## Official default LTX prompting method (validated 2026-08-23)

Added after `ltx-final-v3-correct/video.mp4`: the first real LTX test that
came back with zero instances of the two previously-recurring defects (light/
color drift, invented hands/objects) across a full 16-frame audit. The prompt
that produced it was structurally different from every earlier attempt — not
just reworded, restructured — and this is now the default method for turning
the four-question performance context above into the actual LTX prompt text.

**Epistemic caveat — read this before treating the method as proven:** the
success of this one test does not scientifically prove the prompt was the
sole cause of the previous defects. It is strong experimental evidence that
this new method works clearly better in our pipeline, and it becomes the
default method until a future test contradicts it — not a confirmed causal
finding. Keep the frame-by-frame audit mandatory on every generation
regardless (see "Known real limitation" above); this method lowers the
failure rate, it doesn't retire the audit.

The method, in order:

1. **Start from the real scene context, not from the prompt.** Before writing
   a single word of the prompt, answer the four questions above (physical
   context, state/energy, visual behavior, forbidden movements) for this exact
   audio. The prompt is a translation of that answer, not an independent
   creative pass.
2. **Define what she's doing and why she's speaking.** A prompt that doesn't
   establish the situational reason for the speech (just finished training,
   reacting to something, thinking out loud) produces generic "talking head"
   delivery — the situational anchor is what gives the performance a
   throughline.
3. **Define the energy/physical state that must match the vocal content**,
   from the state/energy question — tired, upbeat, thoughtful, whatever the
   audio actually carries. This is what the visual behavior in step 4 should
   serve, not decorate.
4. **Translate that into natural physical behaviors, without frame-by-frame
   choreography.** Same principle as "describe tendencies, not choreography"
   above — this method doesn't replace that rule, it's the same rule applied
   at the prompt-writing stage specifically.
5. **Prefer one fluid, positive, performance-oriented narrative prompt** over
   a list of instructions. A single flowing description of what's happening
   reads to the model as one coherent scene; a list of separate directives
   reads as separate things to insert.
6. **Do not redescribe elements already established in the source image** —
   lighting, background, car interior, her face, her outfit are already
   locked by the reference image. Redescribing them is the single biggest
   risk factor found this session for drift: restating "warm afternoon light"
   or "car interior" in the prompt gives the model room to reinterpret them
   instead of just preserving what's already in the frame it was given.
7. **Avoid long defensive lists of negations.** A prompt built mostly out of
   "no X, no Y, no Z, never W" reads as uncertain/unstable to the model and
   competes for attention with the actual positive description of what should
   happen. Keep the standing forbidden-movements block, but keep it short and
   separate — don't let negation become the majority of the prompt.
8. **Let the locked image carry identity, decor, and appearance.** The
   prompt's job is exclusively to describe what changes during the video —
   motion, delivery, micro-expression — never to re-establish who she is or
   where she is.
9. **Describe mainly what should happen during the video**, then generate
   with the validated locked assets (image + selected voice take) and run the
   full frame-by-frame audit on the real result before treating it as usable.

## Worked example (2026-08-23, script: "Retour de sport")

This example predates the official method above and only demonstrates steps
1-4 (filling out the performance context) — it was written before the
redescription/negation-list findings, so its own prompt translation isn't a
model example for steps 5-9. The next real production video is the reference
for a complete example that includes the actual prompt text.

Audio: *"Je sors tout juste du sport, j'ai zéro énergie là tout de suite.
Mais bon, je voulais pas vous laisser sans nouvelles. Ce soir j'analyse deux
ou trois matchs et je vous envoie ça demain matin."*

1. Physical context: parked, engine off, phone fixed on a dashboard mount
   implied by framing only (never a visible object), the light/scene of the
   locked source image, unchanged throughout.
2. State/energy: low energy, physically tired, not sad or flat — warm despite
   the tiredness. Spontaneous, not presenter-scripted.
3. Visual behavior: gaze mostly on camera with subtle natural variation, no
   scripted look-away; minimal head movement following speech rhythm, not
   choreographed to words; expression can warm slightly toward the end if it
   follows naturally, no forced smile; upper body stable, shoulders relaxed
   (post-workout).
4. Forbidden: the standing block above, with the parked/stationary point
   emphasized given the "just finished training, sitting down" context makes
   an accidentally-implied moving car a real risk to guard against explicitly.

---

## Deep research: the direct single-call `ltx-2.3/lipsync` endpoint — full documented parameter surface, and the honest comparative verdict vs. the two-step chain (2026-08-24)

Triggered by real evidence from tonight's production runs: the direct
single-call `wavespeed-ai/ltx-2.3/lipsync` endpoint (image+audio+prompt in
one call — this project's *original* method, since replaced as the default
by the two-step chain in `video-pipeline-architecture.md`) produced an
invented hand on a chunked PSG-Rennes clip, and — more importantly — a bare
arm extending into frame, sustained across roughly 6 consecutive frames, on
a **single-chunk 14s generation, well under any documented chunking
threshold, using this file's own validated 9-point narrative prompt, at
1080p.** That third data point matters because every documented heuristic
that "should" have made it safe (short, single-chunk, well-prompted, high
resolution) was already satisfied and it still failed. This section goes
looking for a real, documented fix beyond "write a better prompt," and
reports what was and wasn't found — evidence-first, same discipline as
`video-tooling-landscape-research.md`.

**Method note, same standard as this project's other deep-dive research
files:** every claim is tagged **documented** (traced to a specific official
page, quoted inline), **hands-on** (a real practitioner report, not vendor
copy), or **hypothesis/unverified**. The single most decisive check in this
section — the endpoint's real parameter surface — was verified against the
literal default-values object embedded in the live page's own React payload
(`"values":{"audio":"$undefined","image":"$undefined","prompt":"$undefined","resolution":"720p","seed":-1}`
for `wavespeed-ai/ltx-2.3/lipsync`, fetched directly, not summarized from
marketing copy), not inferred from a rendered parameter table alone — a
distinction that matters below, because the page's shared UI-schema bundle
literally contains strings like `cfg_scale`, `guidance_scale`,
`num_inference_steps`, and `negative_prompt` *elsewhere on the same page*
(reused across many different WaveSpeed models' generic form config) that do
**not** apply to this specific model. Trusting the rendered table without
checking the underlying values object would risk false positives here.

### What the full parameter surface actually is — confirmed, not five params by omission but by direct verification

**Documented, cross-checked across the model page, the API docs page, and
the introduction blog post, three independent WaveSpeed sources agreeing
exactly:** the entire real parameter surface is `audio` (required, drives
duration), `image` (optional portrait reference), `prompt` (optional),
`resolution` (`480p` / `720p` / `1080p`), `seed` (integer, `-1` = random).
**That is all.** No `steps`, `num_inference_steps`, `cfg_scale`,
`guidance_scale`, `negative_prompt`, `motion_strength`, or any quality-preset
parameter exists on this endpoint — confirmed by name-by-name absence in the
literal embedded schema, not just absence from the readable docs.
(Source: `wavespeed.ai/models/wavespeed-ai/ltx-2.3/lipsync`,
`wavespeed.ai/docs/docs-api/wavespeed-ai/ltx-2.3-lipsync`,
`wavespeed.ai/blog/posts/introducing-wavespeed-ai-ltx-2-3-lipsync-on-wavespeedai/`.)

**Resolution, precisely — corrects an assumption worth stating plainly:**
`720p` is the vendor's own **documented default**, not `1080p`. The three
tiers are framed by WaveSpeed purely as quality/cost tiers — `480p` ("fast
previews, iteration, lowest cost"), `720p` (default, "balanced quality and
cost"), `1080p` ("final delivery, maximum detail") — with the blog's own
guidance being *"Start at 480p... then render your final version at 720p or
1080p."* **No source found anywhere (model page, API docs, intro blog)
documents any relationship between resolution and artifact/hallucination
rate.** This project's use of `1080p` is not documented anywhere as a risk
factor — but it is also not documented anywhere as protective. Tonight's
bare-arm defect happened *at* 1080p, the "maximum detail" tier; there is no
vendor claim in either direction to update on that basis, only the one real
data point already on record. **720p is real, is offered, and is in fact the
vendor's own recommended default for this endpoint** — directly answering
the question of whether it's relevant: yes, it exists, it's not a lesser
"unsupported" tier, it's what WaveSpeed itself defaults to.

### Negative prompting — the closest thing to a real, named fix for this exact failure class, and why it doesn't reach this project's calls

**This is the single most important finding in this section.** The
underlying LTX-2.3 model family *does* have an officially documented
negative-prompt mechanism, and it is officially targeted at exactly this
failure mode. From LTX's own (Lightricks, the model's creator) blog,
`ltx.io/blog/negative-prompts`: *"In LTX-2.3 the negative prompt has the
same weight as the positive prompt by default... Negative prompts suppress
the classes of artifact most likely to surface: temporal flicker,
**deformed limbs**, dropped resolution, baked-in subtitles, brand marks the
model learned from web-scraped training data."* And, even more directly on
point: *"Hands and faces are where models fail most often.
Negative-prompt 'distorted hands, extra fingers, asymmetric eyes, deformed
face' on every portrait shot."* This is a real, first-party, named
mitigation for the exact defect class this project has now observed three
times.

**It does not reach either of this project's WaveSpeed calls.** Direct
verification of the live embedded parameter schema for both
`wavespeed-ai/ltx-2.3/lipsync` (this section's subject) **and**
`wavespeed-ai/ltx-2.3/image-to-video` (the two-step chain's own step 1)
shows neither exposes a `negative_prompt` field — both real values objects
are five-or-fewer named keys (`audio`/`image`/`prompt`/`resolution`/`seed`
for lipsync; `duration`/`image`/`prompt`/`resolution`/`seed` for
image-to-video), confirmed the same way as above. **This rules out a lead
that looked promising at first glance: negative prompting is real and
official for LTX-2.3 as a model family, but WaveSpeed's hosted REST API
does not expose it on either endpoint this project actually calls — it is
not a lever available to the direct endpoint, and switching to the two-step
chain would not gain access to it either.** (`sync/lipsync-2-pro`'s own real
values object — `audio`/`sync_mode`/`video` — confirms it has no prompt
field of any kind, positive or negative, consistent with its documented
mouth-only, non-generative-from-noise edit mechanism — see below.)

### Chunking/duration guidance — real, and directly contradicted by tonight's evidence

**Documented** (WaveSpeed's own intro blog): *"For content beyond 20
seconds, generate multiple clips and stitch them together in
post-production. Keep each segment under 20 seconds for optimal quality."*
This is real vendor guidance that shorter, single-chunk generations should
be the safer case. **Tonight's third data point directly contradicts relying
on this as sufficient insurance**: a 14s single-chunk generation — already
well under the 20s ceiling this guidance treats as the risk boundary — still
produced a sustained, multi-frame bare-arm defect. The vendor's own duration
guidance is real, but it does not extend to a documented claim that staying
under it prevents this specific failure mode, and this project's own real
result shows it doesn't.

**Tangentially corroborating, not identical — stated with the caution it
deserves:** `github.com/Lightricks/LTX-2/issues/148` ("Artifacting at end of
video with LTX-2.3") reports a different symptom (a bright flash/overlay in
the final second of a clip) but the same general shape of problem —
unresolved instability concentrated near the tail of a generation on this
exact model family — and was closed **"not planned,"** i.e. acknowledged and
left unfixed, not resolved. Different exact defect (flash, not a limb), so
this is circumstantial context that tail-of-clip instability is a
recognized, still-open category on this model generally — not evidence
about hands specifically, and not to be cited as if it were the same bug.

### Seed strategy, retry behavior, quality/steps controls — confirmed absent for this endpoint

**No vendor guidance found anywhere** (model page, API docs, intro blog, or
either general LTX-2.3 prompt guide checked) recommending seed-cycling,
multi-take generation-and-select, or any retry strategy specifically to
reduce hallucinated-limb risk on this endpoint. The project's own
`known-issues.md` already has one real, self-derived data point (2026-08-22:
a different `--seed` cleared a facial glitch on one occasion, "no known
trigger identified yet") — that remains this project's own empirical
finding, not something corroborated by any vendor source found in this
research. **The underlying LTX-2.3/LTX-2.5 model family does have real,
officially documented levers for exactly this category of problem
(temporal/motion instability) at the raw-model level** — IC-LoRA
motion-anchoring (Canny/Depth/Pose), the Dev vs. Distilled pipeline choice,
and `num_inference_steps`/`cfg_scale` control, per LTX's own
`ltx.io/blog/how-to-reduce-warble-and-ai-pattern-artifacts-in-ltx-2` —
**but every one of those levers requires the raw model or a local/ComfyUI
integration, and is confirmed absent from WaveSpeed's hosted parameter
surface for both LTX-2.3 endpoints this project calls** (same verification
method as above). This is a structural gap, not a prompting gap: the
vendor's own real fixes for this class of problem exist, but not on the API
this project actually has access to.

### Newer version check

**No newer version of this exact endpoint exists.** `wavespeed-ai/ltx-2-19b/lipsync`
is an older, lower-tier sibling (LTX-2 19B predates 2.3), not a successor.
No `ltx-2.5/lipsync` or later hosted lipsync endpoint was found on WaveSpeed
as of this research — LTX-2.5 exists as an open-source/local Lightricks
release with its own warble-reduction guidance (above), but WaveSpeed has
not published a hosted `.../lipsync` endpoint for it. **`ltx-2.3/lipsync` is
confirmed to be WaveSpeed's current, latest hosted version of this specific
direct single-call lipsync endpoint** — there is nothing newer to switch to
within this same architecture.

### The honest comparative verdict

Putting the evidence together plainly, per this project's own
evidence-first standard:

- **Real, confirmed defects on the direct endpoint, three times now**: a
  chunked-clip invented hand, and — the more serious data point — a bare-arm
  artifact on a single-chunk 14s generation that satisfied every documented
  "should be safe" heuristic (short, unchunked, validated prompt, top-tier
  resolution).
- **No documented vendor-side lever on this exact endpoint targets this
  failure mode.** No negative prompting (real for the model family, not
  exposed here), no steps/cfg/guidance control, no documented
  resolution-to-reliability relationship, no seed-cycling guidance, no
  first-party troubleshooting page for hallucinated limbs on this endpoint.
  The full parameter surface — five values — offers nothing to tune beyond
  what this project's prompting method already does.
- **The two-step chain's step 2 has the one real, documented, mechanism-level
  scoping advantage found anywhere in this research**:
  `sync/lipsync-2`/`lipsync-2-pro` documents *"preserves identity, lighting,
  background and facial structure — only the mouth and local expressions are
  changed"* (already cited in `video-pipeline-architecture.md` and
  `video-tooling-landscape-research.md`, not re-derived here). That is a
  structurally narrower edit surface than the direct endpoint's full
  joint audio-video generation, which regenerates the entire frame — limbs
  included — fresh from noise every call, with no documented region-scoping
  of any kind.
- **This project's own real audits this session corroborate the paper
  argument**, per the task brief's own framing: the two-step chain has come
  back clean more consistently on comparable content tonight, while the
  direct endpoint has now produced the invented-limb defect on three
  separate real generations across this project's history
  (`known-issues.md`'s original invented-hand finding, tonight's chunked
  PSG-Rennes hand, tonight's single-chunk bare arm).

**Conclusion, stated plainly rather than false-balanced: there is no
documented reason to expect the direct single-call endpoint can be tuned to
close this gap.** The vendor does not expose the mechanisms (negative
prompting, region/mask scoping, step/cfg control) on this endpoint that
would make that tuning possible — they exist for this model family in
principle, just not on this REST API. Combined with three real, confirmed
failures including one under supposedly-safe conditions, the two-step chain
(`ltx-2.3/image-to-video` silent performance → `sync/lipsync-2-pro` mouth-only
resync) is the correct default going forward, not a temporary preference
pending a better prompt.

**When (if ever) the direct endpoint is still reasonable to use:** cheap,
fast, throwaway iteration only — e.g. a `480p` check of whether a
performance-context idea reads right before committing to the full two-step
production chain — never as the path for a deliverable, and never without
the full frame-by-frame audit discipline (not the reduced "glance" level
this project now applies to the validated two-step chain, per
`video-pipeline-architecture.md`'s "How much to audit now"). It should not
be reached for as a shortcut when the two-step chain is available, given the
real evidence above.
