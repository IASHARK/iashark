# Video tooling landscape research: extension, continuation, and complementary tools beyond LTX/LongCat/OmniHuman/VOID

Added 2026-08-23. Triggered by a standing hypothesis: the pipeline currently
handles scripts longer than the ~14s internal cutoff (`VIDEO_AUDIO_SAFE_MAX_SECONDS`
in `../scripts/pipeline.py`) by slicing the audio at silence points and calling
`wavespeed-ai/ltx-2.3/lipsync` **independently for each chunk, every chunk
conditioned on the same static locked source image** (see
`generate_video()`/`generate_video_auto()`, `../scripts/pipeline.py:852-1002` —
`image_url` is the one constant passed to every chunk, never the previous
chunk's own output frame), then concatenating with `concat_videos()`. Chunk
boundaries have zero frame-to-frame conditioning between them; whatever visual
continuity survives comes entirely from reusing the same source image, seed
behavior, and prompt wording across independent generations — not from any
mechanism that actually looks at what the previous chunk rendered. This is the
concrete architectural gap this document investigates: does a real tool exist
that extends an **existing generated video** forward from its own last frame,
instead of regenerating fresh from the static photo every time?

**Method note, same standard as `post-production-repair-research.md`:** every
claim is tagged **documented** (traced to an official vendor page, cited
inline) or **unclear/unverified** (flagged explicitly, not rounded up to
"probably works"). Marketing adjectives ("seamless," "photorealistic,"
"state-of-the-art") are never treated as evidence. Most WaveSpeed pages here
were reached via `WebFetch`, which renders the same public model/docs/blog
pages a browser would; page content is attributed to WaveSpeed (or the
named upstream vendor, e.g. Lightricks/sync.so/Alibaba) as the documentation
owner throughout, per the source URLs. `known-issues.md` and
`post-production-repair-research.md` are treated as already-established fact
and not re-derived — referenced by name where relevant.

---

## Part 1 — Does a video extension/continuation model exist?

**Yes — it's a large, distinct WaveSpeed catalog category** (`wavespeed.ai/collections/video-extend`
lists **26 models** as of this research), and the most relevant candidate for
this pipeline is same-vendor: `wavespeed-ai/ltx-2.3/video-extend`, from the
same LTX-2.3 family already locked as `VIDEO_MODEL` in `pipeline.py`.

### 1.1 WaveSpeed LTX-2.3 Video Extend — primary candidate

Sources: `wavespeed.ai/models/wavespeed-ai/ltx-2.3/video-extend`,
`wavespeed.ai/docs/docs-api/wavespeed-ai/ltx-2.3-video-extend`,
`wavespeed.ai/blog/posts/introducing-wavespeed-ai-ltx-2-3-video-extend-on-wavespeedai/`.

**Documented parameters:** `video` (URL/upload, required — "source video to
extend"), `duration` (integer, 1–20s, default 5–6s depending on which page —
the model page and blog give slightly different defaults; treat the exact
default as **unclear**, but the 1–20s range is consistent across all three
sources), `prompt` (optional, "describe how the video should continue").
Pricing $0.10/s.

Answering the five required questions:

- **Does it accept an existing video as input (not just an image)? Documented,
  yes.** `video` is the required input field on all three sources. This is
  the core capability this research was checking for.
- **How is identity/face/environment/framing continuity technically supposed
  to work?** Documented mechanism: "The model analyzes the motion patterns,
  visual style, lighting, and composition of your source footage, then
  generates a continuation that flows naturally **from the last frame**"
  (vendor blog). This is the structurally important detail: continuity is
  conditioned on the actual last frame of the real video handed to it, which
  is categorically different from the current pipeline's method of
  regenerating every chunk fresh from the same static source photo. No
  separate identity-lock parameter is documented — continuity is an emergent
  property of last-frame conditioning plus prompt guidance, not a guaranteed
  lock.
- **Input and output duration limits?** Output: 1–20s per call, documented on
  all three sources. Input (source video) duration: **not documented** on any
  of the three pages checked — no stated maximum or minimum for what you feed
  in.
- **Can audio/lipsync be preserved or resynced?** **No audio parameter exists
  in the documented request schema at all** — only `video`, `duration`,
  `prompt`. The model is described elsewhere as "a DiT-based audio-video
  foundation model designed to generate synchronized video and audio," which
  suggests the Extend variant likely generates its own audio track for the
  new segment rather than accepting one — but this is **not explicitly
  confirmed** by any of the three sources for the Extend endpoint
  specifically. **Concretely: there is no documented way to feed this
  endpoint your own continuation-script audio and have it lipsync to that
  audio.** This is the single most important limitation found in this whole
  document for the "extend instead of chunk" hypothesis — Extend alone
  cannot replace a lipsync chunk, only a silent (or self-generated-audio)
  visual chunk. See 1.3 below for the workaround this implies.
- **Suited to "person talking to camera" vs generic b-roll?** The
  introductory blog post's own use-case list is generic-scene-first: "B-roll
  extension (establishing shots, landscape footage, drone flybys), short-form
  social clips, product demos, loop creation." **No claim is made anywhere
  about preserving a specific person's facial identity across the extension,
  and no talking-head-specific example is given.** Not disqualifying, but not
  a documented strength either — treat identity continuity as untested, not
  as vendor-confirmed.

**First-party corroboration specific to the exact use case (9:16 portrait
talking-head), found independently in a separate WaveSpeed blog post**
(`wavespeed.ai/blog/posts/ltx-2-3-portrait-video-9-16-workflow-2026/`):
*"For portrait sequences longer than 8–10 seconds, extend rather than
regenerate — it preserves subject consistency across the extended clip."*
The same post independently names **"subject drift" — the model gradually
shifts subject position toward center-frame beyond 12–15 seconds** — as the
specific portrait-mode failure mode, worded almost identically to this
project's own already-confirmed "progressive framing/zoom drift within a
single generation" finding in `known-issues.md`. This is a real, first-party,
independently-authored data point that (a) the drift this project found is a
known, named phenomenon on this exact model in this exact aspect ratio, and
(b) WaveSpeed's own guidance is to extend rather than regenerate past that
point — directly on-point for the hypothesis this research was asked to
check, though it is vendor guidance, not a controlled study, and should be
read with that caveat.

A separate, more technical first-party post
(`wavespeed.ai/blog/posts/ltx-2-3-api-endpoints-guide/`) independently
describes real hands-on usage: *"I chained two 6s clips into a 12s shot by
extending the first clip's tail with the same prompt, seed, and camera
notes... continuity is decent if prompts and seeds are stable."* This
confirms chaining Extend calls is a real, exercised workflow (not just a spec
claim), while still hedging with "decent," not "solved."

### 1.2 Other extend candidates surveyed

| Model | Video-in? | Continuity mechanism (documented) | Duration limits | Audio/lipsync | Talking-head fit |
|---|---|---|---|---|---|
| `wavespeed-ai/ltx-2/video-extend` | Yes | Same family as 2.3, less current | Up to 20s | Not documented | Not documented |
| `alibaba/wan-2.5/video-extend`, `wan-2.6/video-extend`, `wan-2.7/video-extend` | Yes | Last-frame + motion pattern analysis (2.7 docs describe an `audio` field but say it only "guide[s] the rhythm and pacing," **not lipsync**) | 5/10/15s (2.6) or 2–15s (2.7) | Optional `audio` param exists but is explicitly **not** documented as a lipsync driver | Generic use cases only ("Short Film," "Social Media," "Marketing") — model-agnostic to subject matter, no talking-head claim |
| `bytedance/seedance-2.0/video-extend`, `seedance-2.5/video-extend` | Yes | Last-frame + recent motion as "continuation anchor"; 2.5 uses up to the last 30s of context, not just one frame | 4–30s new segment | **`generate_audio` boolean documented** — "Generate synchronized audio for the extended segment while preserving the original video's audio." This is the *only* candidate found with a documented audio-generation toggle for the extended segment specifically — but it is described as the model composing its own new audio to match the new visuals, **not** accepting a user-supplied continuation script to sync to | Generic scene continuation / story progression / ad-creative use cases; no talking-head-specific claim |
| `google/veo3.1/video-extend` | Yes, **but restricted**: "input must be originally produced by Veo 3.1" | "True continuation, not a restart"; prompt guidance to name what should stay the same | +7s per call, up to 20 chained extensions, 148s max total | Audio-continuity guidance given ("ensure the last second of the input clip has clean, usable audio") but no dedicated lipsync feature | Explicitly generic — storytelling, marketing, social; not positioned for talking-head |

Source for the table: same model pages fetched directly
(`wavespeed.ai/models/alibaba/wan-2.7/video-extend`,
`wavespeed.ai/models/alibaba/wan-2.6/video-extend`,
`wavespeed.ai/models/bytedance/seedance-2.5/video-extend`,
`wavespeed.ai/models/google/veo3.1/video-extend`,
plus the collection listing at `wavespeed.ai/collections/video-extend` for
the full 26-model enumeration).

**Veo 3.1 Video Extend is disqualified outright** for this pipeline: its
documented input restriction ("must be originally produced by Veo 3.1")
means it cannot extend an LTX-2.3-generated clip at all — this is a real,
stated constraint, not a guess.

**None of the surveyed extend models document an identity-lock mechanism.**
The strongest documented continuity claims are all about "motion/style/
lighting/composition carrying forward," never about a named person's face.
This is consistent with the finding in `post-production-repair-research.md`
that no candidate tool documents identity-lock for edit-in-place use cases —
the same gap exists here for generation-in-place (extend).

### 1.3 The two-step hypothesis this research surfaces: silent visual extend + mouth-only audio resync

Given 1.1's finding that LTX-2.3 Video Extend has **no audio input at all**,
it cannot alone replace a lipsync chunk. But cross-referencing against the
lipsync-adjacent tools surveyed in Part 2.2 below surfaces a genuine
candidate two-step architecture that was not part of the original four known
models:

1. **`wavespeed-ai/ltx-2.3/video-extend`** — extend the previous chunk's real
   last frame silently (or with the model's own self-generated placeholder
   audio, which would be discarded) into a new segment of the target length,
   using a prompt describing continued natural talking behavior per the
   existing `video-performance-protocol.md` method.
2. **`sync/lipsync-2-pro`** (or `sync/lipsync-2`) — re-sync the new segment's
   mouth to the next audio chunk. Source: `wavespeed.ai/models/sync/lipsync-2-pro`,
   `wavespeed.ai/models/sync/lipsync-2`. Both take `video` + `audio` +
   `sync_mode` as documented parameters, and both explicitly document a
   **mouth-only, localized edit mechanism**: *"Preserves identity, lighting,
   background and facial structure; only the mouth and local expressions are
   changed"* (lipsync-2-pro page); lipsync-2's page similarly states it
   "re-animates the mouth so lip movements match the speech" while aiming to
   "preserve the original speaker's facial mannerisms and timing as much as
   possible." Documented use case explicitly matches this exact scenario:
   *"Record once, edit forever — change lines after shooting without new
   takes; keep the original performance and camera work."* Pricing: lipsync-2
   $0.05/s of video, lipsync-2-pro $0.08/s of audio; both real REST APIs, not
   UI-only.

This is meaningfully different from every tool surveyed in
`post-production-repair-research.md`: those were all whole-clip
prompt-driven edits (Kling O1, Bria, Runway Aleph) with no documented
face/mouth-region scoping, or a structurally-possible-but-unproven per-frame
mask (VOID). **`sync/lipsync-2-pro`'s documented behavior is the closest
thing found anywhere in this research to a tool that touches only the mouth
and nothing else, by design, not by careful mask authoring.** That is exactly
the "downrank anything that risks identity/mouth/eyes/general AI-look drift"
priority this research was asked to weight most heavily.

**Caveats, stated plainly:**
- This exact two-step chain (Extend → sync-2/2-pro) is **not documented as a
  combined workflow by either vendor** — it is an inference this research
  constructed from two independently-documented tools, not a
  vendor-confirmed pipeline. Treat it as a hypothesis, not a validated
  method.
- LTX-2.3 Video Extend's silent output will contain *some* mouth movement
  (the model is audio-video by design and likely hallucinates plausible
  speech motion even without a real audio track feeding it, or generates its
  own audio track that gets discarded — **unconfirmed** which). Whether
  `sync/lipsync-2-pro`'s mouth-region resync can reliably override that
  starting motion without visible seams is untested.
- Neither sync.so model's page documents an identity-verification score or
  any confirmed track record on this specific "already-AI-generated video"
  input class — their examples are all real-footage dubbing/re-editing
  scenarios.

---

## Part 2 — Complementary tools around LTX

### 2.1 Localized video editing — one genuinely new candidate beyond `post-production-repair-research.md`

That document already surveyed VOID, Bria Video Eraser, Kling O1 Video-Edit,
Runway Aleph 2.0, Google Veo object removal, Luma Ray Modify Video, Adobe
Firefly, and Pika — not re-derived here. One relevant candidate was **not**
in that survey and should be flagged for it: **`lightricks/ltx-2-retake`**
(same vendor, Lightricks, as the pipeline's LTX-2.3 model family). Sources:
`wavespeed.ai/models/lightricks/ltx-2-retake`,
`wavespeed.ai/docs/docs-api/lightricks/lightricks-ltx-2-retake`,
`wavespeed.ai/blog/posts/introducing-lightricks-ltx-2-retake-on-wavespeedai/`.

1. **What does it do per the docs?** "Performs targeted retakes on any
   section of a video — replace visuals, audio, or both — while preserving
   timing and continuity," described as "reshooting part of a finished clip
   without bringing the crew back." Three documented `mode` values:
   `replace_video`, `replace_audio`, `replace_audio_and_video`. Time-range
   targeting is **written directly into the `prompt` string** ("From 00:05 to
   00:10, do X") — **no separate mask, region, or time-range parameter
   exists**, which is a materially weaker targeting mechanism than VOID's
   per-frame mask video (see `post-production-repair-research.md` §B.1), even
   though it is simpler to use.
2. **How would it fit the current pipeline?** As a post-generation repair
   step for a localized visual defect (e.g. the documented invented-hand
   finding), or — relevant to Part 1 — potentially for "rewriting a line" if
   a script change is needed after generation, per the explicitly documented
   use case: "rewrite or replace dialogue while preserving the speaker's
   identity and general performance style."
3. **What concrete problem would it solve?** Same target case as
   `post-production-repair-research.md`'s fingertip finding — a minor,
   time-localized defect — but via prompt-embedded time ranges instead of a
   mask video, and it is same-vendor as the model already producing the
   defects, which is circumstantial (not evidence of better compatibility,
   just worth knowing).
4. **Risks?** No documented identity-lock or lipsync-protection mechanism —
   same documented gap as every candidate in the repair-research survey. The
   prompt-embedded time range is coarser than VOID's per-frame mask, so
   precision around a mouth region specifically (avoid touching it) is
   harder to guarantee by construction.
5. **Worth a real test?** Only under the exact same conditions
   `post-production-repair-research.md` already sets for any repair
   candidate (minor + localized defect only, full re-audit after, treated as
   an unvalidated single-variable experiment) — it does not change that
   document's conclusion that no candidate has a documented safety guarantee
   for this use case. Fixed resolution (1080p) and duration cap (2–16s
   billed) may also constrain which segments it can even be applied to.

### 2.2 Video-to-video lipsync / lipsync-correction tools beyond LTX

Surveyed via `wavespeed.ai/collections/avatar-lipsync` (42 models total) plus
individual model pages. Beyond `sync/lipsync-2` and `sync/lipsync-2-pro`
(detailed in 1.3, the strongest documented mouth-only mechanism found):

- **`wavespeed-ai/infinitetalk/video-to-video`** — takes an existing
  **silent video** + an audio track and generates a new synchronized talking
  video. Documented parameters: `video`, `audio`, `mask_image` (optional,
  "define which regions can move"), `prompt`, `resolution`. Documented
  identity handling: *"identity preservation: ensures consistent visual
  identity across all frames"* and alignment of "head pose, facial
  expressions, and posture with speech." **Important distinction from
  sync/lipsync-2:** InfiniteTalk's description implies broader
  regeneration (head pose, posture, expression, not just mouth), which is a
  larger surface for drift than a documented mouth-only edit, even though it
  also claims identity preservation. Source:
  `wavespeed.ai/models/wavespeed-ai/infinitetalk/video-to-video`.
- **`bytedance/lipsync/audio-to-video`**, **`kwaivgi/kling-lipsync/audio-to-video`** —
  both listed in the catalog as talking-head-capable audio-to-video lipsync
  tools, but neither returned enough independently-fetched detail in this
  research pass to confirm parameter surface or identity mechanism beyond
  the one-line catalog description. **Unclear/unverified** — flagged for a
  future pass if either becomes a real candidate, not included in the
  ranked recommendations below on that basis.
- **`sync/react-1`** — catalog description: "production-grade model mapping
  any speech track to a target face with phoneme accuracy." Not
  independently fetched for full parameter detail in this pass; same
  unclear/unverified status as the two above.

### 2.3 Talking-head/person-speaking tools beyond the four known models

The full `avatar-lipsync` collection (42 models,
`wavespeed.ai/collections/avatar-lipsync`) was enumerated. Beyond LTX-2.3,
LongCat Avatar, and OmniHuman (already known — see `known-issues.md`'s
"LTX vs LongCat" entry, not re-derived here), the one architecturally
distinct finding worth flagging:

- **`wavespeed-ai/infinitetalk`** (image+audio, not the video-to-video
  variant above) — documented to accept **one photo + one audio track and
  output up to 10 minutes** in a single job (`wavespeed.ai/models/wavespeed-ai/infinitetalk`),
  billing-capped at 600s. This is the same category of tool as LongCat
  Avatar (already known, single-call native long-duration generation,
  avoiding the chunk-and-concatenate problem structurally rather than
  patching it after the fact) — **not previously evaluated in this
  project's known-issues.md**, and worth noting as a second candidate in
  that same "avoid chunking entirely" category, distinct from the
  chunk-then-extend hypothesis in Part 1. Documented identity claim:
  "maintains consistent facial identity and visual style across frames,"
  with **no internal chunking mechanism explicitly documented** — long-
  duration coherence is presented as end-to-end, not stitched. This claim is
  vendor-stated, not independently verified by this research (no video was
  generated).
- **`kwaivgi/kling-v2-ai-avatar-pro`** — catalog description: "enhanced
  avatar generation with stable motion and strong identity consistency."
  Generic-avatar framing (not talking-head-specific in the one-line
  description found), and not independently fetched for parameter detail —
  **unclear/unverified**, flagged only as a name to check if InfiniteTalk or
  LongCat don't pan out.

### 2.4 Face restoration / enhancement

Source: `wavespeed.ai/landing/models/upscale-image`, corroborated by
search-indexed vendor descriptions (a dedicated standalone face-restoration
model page/API reference was not directly located in this pass — treat the
API-accessibility claim as **unclear/unverified**, distinct from the
feature's general existence, which is documented). WaveSpeed's upscale
pipeline documents integrated **GFPGAN and CodeFormer** — both real, named,
published academic face-restoration models (Tencent ARC's GFPGAN,
`github.com/TencentARC/GFPGAN`) — bundled into image/video upscaling to
"detect faces and rebuild features separately for maximum realism."

**Verdict: same category, same conclusion as Topaz Video AI in
`post-production-repair-research.md`.** GFPGAN/CodeFormer are signal-level
sharpening/reconstruction models, not semantic content editors — they have
no documented mechanism for removing an invented object, fixing eye
incoherence, or correcting a lipsync error. **Explicitly not a candidate for
any of the confirmed defects in this project's `known-issues.md`.** Their
only plausible use is sharpening/detail-recovery after a heavy compression or
upscale pass — and per the non-negotiable evaluation priority in this
research's brief, sharpening a face that's already borderline "reads as
synthetic" (the confirmed baseline finding in `known-issues.md`'s Run #1
entry) is a real risk of making the result look *more* artificial
("waxy"/over-smoothed, the same complaint already logged against
nano-banana-pro's 2k output), not less. **Downranked, not recommended.**

### 2.5 Stabilization / motion correction

**Largely inapplicable to this project by construction, independent of
tool quality.** `video-performance-protocol.md`'s standing forbidden-movements
block requires "no camera movement of any kind (pan/zoom/shake) — the phone
is fixed" for every generation; the shots this pipeline produces are
deliberately locked-camera. A stabilization tool corrects camera motion that
this pipeline's prompting already forbids from existing in the first place.

**Tool-finding status: unclear/unverified.** A dedicated
`wavespeed.ai/campaign/feature/ai-video-stabilization` page returned HTTP 410
Gone at fetch time — the feature may have been renamed, merged into a
different product page, or discontinued; no standalone stabilization model
page was independently located and confirmed in this pass. Given the
category is not relevant to this project's locked-camera shots regardless of
whether the tool exists, no further research time was spent chasing it down.

### 2.6 Temporal-coherence improvement / general video upscaling

Source: `wavespeed.ai/models/wavespeed-ai/ultimate-video-upscaler`,
`wavespeed.ai/models/wavespeed-ai/video-upscaler-pro`,
`wavespeed.ai/models/wavespeed-ai/ltx-2-19b/video-upscaler` (catalog listing
via search; full parameter pages not independently fetched in this pass).
Documented, per catalog descriptions: convert low-resolution video to
720p/1080p/2K/4K "with seamless motion dynamics and frame consistency,"
positioned generically (Video Upscaler Pro is explicitly "ideal for
upscaling Seedance 2.0 videos," not talking-head-specific).

**Verdict: signal-level only, same category as 2.4 — not a defect-repair
tool, and a real risk under the non-negotiable evaluation priority.** A
sharper, higher-resolution talking-head clip with the same underlying
identity/eye/mouth issues does not become more convincing — per this
research's explicit brief, "perfect 4K upscale but robotic motion" is
exactly the failure mode to downrank, and nothing in these three models'
documentation claims to fix motion naturalness, only resolution and
denoise-level frame consistency. **Not recommended** as a step in this
pipeline; flagged only so the category is documented as considered and
rejected rather than silently skipped.

---

## Cross-cutting comparison — extension/continuation candidates only

| Model | Video-in | Duration in/out | Audio param | Identity/continuity mechanism documented | Talking-head positioning | Real API |
|---|---|---|---|---|---|---|
| `wavespeed-ai/ltx-2.3/video-extend` | Yes | in: undocumented / out: 1–20s | **No** | Last-frame + motion/style/lighting analysis; no identity-lock | Not claimed; drift beyond 12-15s independently documented by WaveSpeed's own portrait-mode blog | Yes — same WaveSpeed API/auth pipeline.py already uses |
| `wavespeed-ai/ltx-2/video-extend` | Yes | out: up to 20s | Not documented | Not documented | Not documented | Yes (WaveSpeed) |
| `alibaba/wan-2.5/2.6/2.7 video-extend` | Yes | out: 2-15s (varies by version) | Optional, **not** lipsync ("guide rhythm/pacing" only, per 2.7 docs) | Not documented | Generic, model-agnostic to subject | Yes (WaveSpeed) |
| `bytedance/seedance-2.0/2.5 video-extend` | Yes | out: 4-30s | `generate_audio` bool — model's own new audio, not user-supplied | Last-frame + up to 30s prior context (2.5) | Generic scene/story continuation | Yes (WaveSpeed) |
| `google/veo3.1/video-extend` | Yes, **Veo-3.1-sourced only** | out: +7s/call, 148s cap | Audio-continuity guidance only | "True continuation, not restart," prompt-driven | Generic, explicitly not talking-head-positioned | Yes (WaveSpeed + native Google) — **disqualified by source restriction** |
| `sync/lipsync-2` / `lipsync-2-pro` (resync, not extend) | Yes (existing video + new audio) | in: undocumented / billed per-second | **Yes — this is its whole function** | **Documented mouth-only edit: "preserves identity, lighting, background and facial structure"** | **Explicitly this use case** ("record once, edit forever") | Yes (WaveSpeed) |

No candidate in the pure "extend" row satisfies the audio/lipsync question on
its own — that gap is real and consistent across every vendor checked. The
`sync/lipsync-2-pro` row is not an extend model; it's included here because
it is the piece that could close that gap in a two-step chain (Part 1.3).

---

## Conclusions

**Genuinely relevant to this project, in priority order:**

1. **`wavespeed-ai/ltx-2.3/video-extend`** — real, documented, same-vendor,
   same API pattern already integrated. Directly addresses the architectural
   gap identified at the top of this document (current chunking has zero
   frame-to-frame conditioning between chunks). First-party WaveSpeed
   documentation independently names the exact drift phenomenon this project
   already found, which is unusually strong corroboration for a hypothesis
   this early. **Caveat that must not be lost: it has no audio input, so it
   cannot alone replace a lipsync chunk.**
2. **`sync/lipsync-2-pro`** (and `sync/lipsync-2`) — the strongest documented
   mouth-only, identity/lighting/background-preserving edit mechanism found
   across *both* this document and `post-production-repair-research.md`.
   Directly closes the audio gap in candidate 1, on paper.
3. **`wavespeed-ai/infinitetalk`** (image+audio, native up to 10 minutes) —
   a second, structurally different candidate in the same "avoid chunking
   entirely" category as the already-known LongCat Avatar. Not previously
   evaluated in this project.
4. **`lightricks/ltx-2-retake`** — should be added to
   `post-production-repair-research.md`'s candidate list for future
   localized-defect repairs; weaker targeting precision than VOID (prompt-
   embedded time range vs. per-frame mask) but same-vendor and worth knowing
   about.

**Tools to rule out, and why:**

- **`google/veo3.1/video-extend`** — hard disqualified: documented input
  restriction requires Veo-3.1-originated source video.
- **GFPGAN/CodeFormer-based face restoration, and the general video
  upscalers (2.4, 2.6)** — signal-level only, no semantic/identity/lipsync
  editing capability documented anywhere; real risk of making an
  already-borderline-synthetic-looking result look *more* artificial per
  this research's non-negotiable evaluation priority. Not a fit for any
  confirmed defect in `known-issues.md`.
- **Stabilization tooling (2.5)** — inapplicable by construction; this
  pipeline's shots are locked-camera by explicit prompting rule, so there is
  no camera motion to stabilize regardless of what WaveSpeed offers here.
- **`bytedance/lipsync/audio-to-video`, `kwaivgi/kling-lipsync/audio-to-video`,
  `sync/react-1`, `kwaivgi/kling-v2-ai-avatar-pro`** — not ruled out on
  merit, ruled out on evidence: not independently verified in this research
  pass beyond a one-line catalog description. Revisit only if the
  higher-priority candidates above fail.

**Worth a real test, ranked:**

1. `wavespeed-ai/ltx-2.3/video-extend` alone, visual-continuity-only (no
   audio yet) — see the recommended next step below.
2. `sync/lipsync-2-pro` alone, as a mouth-resync test on an existing already-
   validated clip with a *new* audio track (independent of the extend
   question — tests the resync mechanism's real-world identity/mouth
   preservation claim on its own).
3. The full two-step chain (extend → resync) — only after 1 and 2 are each
   independently validated, per the standing single-variable methodology.
4. `wavespeed-ai/infinitetalk` as a from-scratch alternative to the
   image+audio→video architecture entirely (a bigger, riskier swap — lowest
   priority of the four, since it would replace rather than augment the
   already-locked, already-partially-validated LTX-2.3 recipe).

**THE single best next experimental step:**

Per this project's standing baseline/single-variable/comparison/decision
methodology (`feedback_baseline_single_variable_methodology.md`), the
correct next test changes exactly one variable relative to the existing
baseline: **take the real, already-generated first chunk of a validated
multi-chunk production video (e.g. the 27.9s/3-chunk test already on record
in `post-production-repair-research.md`) as the fixed input, and generate
ONE test call to `wavespeed-ai/ltx-2.3/video-extend`** — silent, no audio
input available regardless — with `duration` matched to the target second
chunk's length and a prompt written per the existing
`video-performance-protocol.md` method describing continued natural talking
behavior. Run the full frame-by-frame audit on the result and compare
specifically against the known baseline defects for that same chunk boundary
(framing/zoom drift, invented hand/fingertip, eye coherence) — nothing else.

**Do not bundle in `sync/lipsync-2-pro` in this first test.** Adding the
resync step at the same time would change two variables at once (the
chunk-generation mechanism AND the lipsync mechanism) and make it impossible
to attribute a result to either tool individually — exactly the mistake this
project's methodology exists to prevent. If and only if the Extend-alone test
shows a real, audited improvement in chunk-boundary continuity, `sync/lipsync-2-pro`
becomes the second, separately-tested variable.

---

## Sources

- WaveSpeed video-extend collection and models: `wavespeed.ai/collections/video-extend`,
  `wavespeed.ai/models/wavespeed-ai/ltx-2.3/video-extend`,
  `wavespeed.ai/docs/docs-api/wavespeed-ai/ltx-2.3-video-extend`,
  `wavespeed.ai/blog/posts/introducing-wavespeed-ai-ltx-2-3-video-extend-on-wavespeedai/`,
  `wavespeed.ai/models/wavespeed-ai/ltx-2/video-extend`,
  `wavespeed.ai/models/alibaba/wan-2.6/video-extend`,
  `wavespeed.ai/models/alibaba/wan-2.7/video-extend`,
  `wavespeed.ai/models/bytedance/seedance-2.5/video-extend`,
  `wavespeed.ai/models/google/veo3.1/video-extend`
- WaveSpeed LTX-2.3 first-party technical blogs (not the introduction posts):
  `wavespeed.ai/blog/posts/ltx-2-3-portrait-video-9-16-workflow-2026/`,
  `wavespeed.ai/blog/posts/ltx-2-3-api-endpoints-guide/`
- WaveSpeed LTX-2.3 lipsync endpoint reference (confirms no video-input
  capability on the pipeline's own locked model): `wavespeed.ai/docs/docs-api/wavespeed-ai/ltx-2.3-lipsync`
- WaveSpeed localized editing: `wavespeed.ai/models/lightricks/ltx-2-retake`,
  `wavespeed.ai/docs/docs-api/lightricks/lightricks-ltx-2-retake`,
  `wavespeed.ai/blog/posts/introducing-lightricks-ltx-2-retake-on-wavespeedai/`,
  `wavespeed.ai/collections/video-edit`
- WaveSpeed lipsync/avatar collection: `wavespeed.ai/collections/avatar-lipsync`,
  `wavespeed.ai/models/sync/lipsync-2`, `wavespeed.ai/models/sync/lipsync-2-pro`,
  `wavespeed.ai/models/wavespeed-ai/infinitetalk`,
  `wavespeed.ai/models/wavespeed-ai/infinitetalk/video-to-video`
- WaveSpeed face restoration / upscale: `wavespeed.ai/landing/models/upscale-image`,
  `wavespeed.ai/models/wavespeed-ai/ultimate-video-upscaler`,
  `wavespeed.ai/models/wavespeed-ai/video-upscaler-pro`,
  `wavespeed.ai/models/wavespeed-ai/ltx-2-19b/video-upscaler`
  (upstream face-restoration models named: TencentARC GFPGAN,
  `github.com/TencentARC/GFPGAN`; CodeFormer)
- WaveSpeed stabilization: `wavespeed.ai/campaign/feature/ai-video-stabilization`
  (returned HTTP 410 Gone at fetch time — no working page found, category
  status recorded as unclear/unverified)
- Pipeline cross-reference for the architectural gap this document
  investigates: `../scripts/pipeline.py:852-1002` (`generate_video`,
  `generate_video_auto`, `slice_audio_at_silences`, `concat_videos`) —
  confirms every chunk is generated from the same static `image_url`, never
  from a previous chunk's own last frame
- Existing project docs referenced, not re-derived:
  `known-issues.md` (confirmed defects, LTX vs LongCat benchmark status),
  `video-performance-protocol.md` (locked-camera prompting rule, prompt
  method), `post-production-repair-research.md` (localized-repair candidate
  survey — VOID, Bria, Kling O1, Runway Aleph, Veo object removal, Luma Ray,
  Adobe, Pika — not duplicated here)

---

# Part 3 — Deep dive: InfiniteTalk motion mechanism and prompting (added 2026-08-23)

Triggered by a follow-up to Part 2.2/2.3's shallow, WaveSpeed-API-page-only entry
for `wavespeed-ai/infinitetalk/video-to-video`. That entry flagged the model's
claimed "full-body coherence: aligns head pose, facial expressions, and posture
with speech" as a materially bigger edit surface than `sync/lipsync-2-pro`'s
documented mouth-only edit, without investigating what that actually means in
practice. This section goes to the model's real creator and reads primary
sources plus real hands-on reports, per the same **documented / hands-on /
hypothesis** evidence tagging used throughout this document.

**Same non-negotiable priority as the rest of this document, restated because
it matters more here than anywhere else in this research: this project needs
the *least* obviously-animated, most human-restrained result, not the most
expressive or full-body-coherent one.** Findings below are read through that
lens throughout — an official feature ("full-body coherence") is not
automatically a benefit for this use case; it can just as easily be a bigger
attack surface for exactly the artifacts this project is trying to eliminate.

## 3.0 Who actually built this, and where the real documentation lives

**WaveSpeed is confirmed to be a hosting/API wrapper, not the source.**
InfiniteTalk is a real academic/industry research project from **MeiGen-AI**
(a research group; GitHub org `MeiGen-AI`), with:

- **Technical paper (documented, primary source):** *"InfiniteTalk:
  Audio-driven Video Generation for Sparse-Frame Video Dubbing,"*
  `arxiv.org/abs/2508.14033`, also mirrored at `arxiv.org/pdf/2508.14033` and
  `arxiv.org/html/2508.14033v1` (full HTML version, used for the deepest
  technical read below). Released with weights and code August 19, 2026 per
  the project's own dating.
- **Official code + README (documented):** `github.com/MeiGen-AI/InfiniteTalk`
  (canonical repo — a `bmwas/InfiniteTalk` mirror also surfaced in search
  results and was not used as a source here since it is not the origin).
- **Official project page (documented):** `meigen-ai.github.io/InfiniteTalk/`
  (demo videos and abstract-level claims).
- **Model weights (documented):** `huggingface.co/MeiGen-AI/InfiniteTalk`.
- **Real-world, hands-on, non-marketing reports (hands-on, cited inline
  below):** the official repo's own GitHub Issues
  (`github.com/MeiGen-AI/InfiniteTalk/issues`), and — because InfiniteTalk is
  used far more often today through the popular ComfyUI-WanVideoWrapper
  integration than through the raw repo — that integration's own issue
  tracker (`github.com/kijai/ComfyUI-WanVideoWrapper`), maintained by `kijai`,
  a well-known, high-output ComfyUI node developer whose direct responses in
  those threads are treated here as credible practitioner testimony, not
  vendor marketing.

**Important architectural fact, documented, that reframes everything else in
this section:** InfiniteTalk is not a standalone model. It is a conditioning
layer bolted onto **Wan2.1-I2V-14B-480P** (Alibaba's open video diffusion
base model), using **Chinese-wav2vec2-base** (a real, published, general-purpose
audio encoder — not a custom speech-emotion model built for this task) as the
audio embedder, plus InfiniteTalk-specific trained weights for audio
cross-attention and reference-frame conditioning. This matters directly for
the prompting question below: any text-prompt behavior InfiniteTalk exhibits
is inherited machinery from a general-purpose text+image-to-video base model,
not a feature MeiGen-AI built or validated for this task — see 3.5.

## 3.1 How does the model actually decide head/body motion? (documented, from the paper)

**Audio conditioning path (documented, `arxiv.org/html/2508.14033v1`):** the
diffusion transformer has a dedicated **audio cross-attention layer** and a
**reference cross-attention layer** in each block. Wav2vec2 audio features
`a ∈ ℝ^(n×d_audio)` attend against the noisy video latent directly — this is a
real, architected audio→motion pathway, not audio used only for a lipsync
post-pass. This is genuinely different from LTX-2.3/lipsync's approach as
documented in this project's own testing: LTX-2.3 is conditioned on a prompt
+ static image + audio track together in one pass without a documented
separate audio-cross-attention mechanism of this kind (see
`video-performance-protocol.md`); InfiniteTalk's architecture gives audio a
more direct, structurally privileged channel into motion generation. Whether
that translates to *better* results for this project's restrained-motion goal
is a separate question — see 3.4, where "more audio-coupled" is shown in
practice to often mean "more exaggerated," not "more naturally proportionate."

**Motion continuity across chunks (documented):** context/"motion frames" —
the first `4(t_c−1)+1` frames of the source segment (9 frames = 3 latent
frames by default, matching the CLI's `--motion_frame 9` default found in the
README) — are concatenated with the noisy latent to "propagate kinetic
momentum into subsequent segments." This is the mechanism for the model's
headline "infinite length" claim: streaming generation chunk-by-chunk, each
chunk conditioned on the real motion of the end of the previous chunk — a
different architecture from this project's own current chunking (`known-issues.md`,
`pipeline.py:852-1002`), which conditions every chunk on the same static
photo with zero frame-to-frame handoff.

**Motion *amount*/control mechanism (documented):** the paper's real technical
contribution is a **sparse-frame reference-keyframe strategy** — reference
frames from the *source video itself* (not a separate control input) are
sampled at a specific temporal offset and concatenated with a mask channel
`m ∈ ℝ^(4×(t+t_c)×h×w)` to tell the model which regions/frames are "already
decided" vs. "should be generated fresh." Four sampling strategies were
ablated (Table 3, quoted numbers in the earlier fetch above): **M0** (random
uniform reference sampling) over-constrains and causes "excessive control,
inappropriate duplication"; **M1** (first/last frame only) is "rigid
replication"; **M2** (temporally distant, >5s) is "weak control, accumulated
errors"; **M3** (adjacent chunks, ~1s apart) was found best — "moderate
control strength: references preserve identity and camera motion without
exact duplication" — and is what the released model uses. **This means "how
much the model moves" is not exposed as a simple user-facing knob at all in
the trained/released model** — it is a property baked into the training
recipe (M3's fixed ~1s reference spacing), not something adjustable per
generation via a documented parameter. The closest thing to a real amplitude
knob at inference time is `--sample_audio_guide_scale` (audio CFG, default 4,
"works optimally between 3–5" per the README) — but that scales how strongly
the model *follows the audio signal at all*, not motion amplitude directly,
and is a raw-repo/ComfyUI parameter, **not exposed on WaveSpeed's hosted API**
(see 3.7).

## 3.2 Camera motion / stability — a real risk specific to this pipeline's locked-camera requirement

**Documented, and important:** the paper states plainly that the base
mechanism **"will not replicate the subtle camera movement of source
video"** on its own. Two plugin fixes were tested: **SDEdit** (adds the
source video into the initial noise at a partial diffusion timestep) and
**Uni3C** (a ControlNet-style camera-trajectory conditioner). SDEdit showed
better background preservation in the paper's own comparison, but the paper
also states SDEdit **causes color shift and "suits only short clips."** Even
with SDEdit active, the paper's own honest caveat: **"the utilization of
reference frames is providing a global control of camera trajectory. However,
the detailed camera movement within each video chunk is not controlled and
may contradict the source video."**

**Why this matters specifically for this project:** the pipeline's whole
performance-direction method (`video-performance-protocol.md`) is built
around a hard-locked, genuinely-static camera ("no camera movement of any
kind... the phone is fixed"). InfiniteTalk video-to-video's own authors are
telling you, in their own paper, that camera stillness in a source clip is
**not guaranteed to carry through** without an add-on technique that has its
own documented downside (color shift), and even then only a coarse,
"global," non-per-chunk guarantee. This is a real, first-party-documented
risk factor for this exact use case, independent of anything found in the
GitHub issues below.

## 3.3 Real-world hands-on evidence: "exaggerated and fake movement" is a widely reported, still-open problem

This is the single most load-bearing finding in this whole section, and it is
**hands-on evidence, not paper claims or marketing.**

- **`MeiGen-AI/InfiniteTalk` issue #65**, title *"movement looks too
  exagerated and fake"* (official repo, still open at time of research). The
  reporter: *"Multitalk's movement is more realistic... can the movement be
  toned down so it is not so exaggerated. The movement is very jerky at
  times."* A maintainer (`yzhang2016`) responded with a working
  counter-example using a **minimal prompt — literally `"the man is
  talking."`** — at two tested settings (480p/10 steps/FusionX
  LoRA/`audiocfg=2`/`textcfg=1` **or** 480p/40 steps, no LoRA,
  `audiocfg=5`/`textcfg=5`) and reported "no shaking observed" in that
  specific test. The original reporter (`trashkollector`) tried the current
  repo and still found it "a little over exaggerated... a very quick head
  turn," explicitly unresolved as of their last comment: *"Maybe this
  weekend, I will sit down and try various settings."*
- **`kijai/ComfyUI-WanVideoWrapper` issue #1203**, title *"exaggerated and
  fake movement with InfiniteTalk"* (independent report, cross-referencing
  #65, also still open). Multiple independent users (`batuhan-ince`,
  `receptektas`, `trashkollector`, `muyifeiyang`) confirm the same symptom
  with real attached video clips: jerky motion, unusually quick head turns,
  exaggerated facial expressions. `kijai` (the integration's maintainer, a
  credible practitioner) suggested concrete levers — **fewer sampling steps,
  an LCM or `flowmatch_distill` scheduler, and adjusting `audio_scale`** —
  and posted his own clean examples (6-step and 4-step generations) as
  evidence the model *can* look natural. But the thread's most recent
  comment (`muyifeiyang`, after trying the suggested fixes): **"I tried
  adjusting the audio_scale or scheduler, but the fake movement problem
  hasn't improved."** **Read plainly: this is a real, independently
  corroborated, not-fully-solved failure mode as of the most recent activity
  in the most relevant public thread found — not a one-off complaint, and not
  yet resolved by any single documented fix.**
- **One genuinely useful hands-on data point on prompting** (hands-on, single
  anecdotal comparison, not a controlled study): user `RuneGjerde`, in the
  same thread, ran two generations with **identical settings** (same steps,
  scale, sampler) and **calm audio in both**, changing only the prompt text:
  - `"an old man is calmly telling a bedtime story to the viewer, with a
    relaxing body language."` → visibly calmer result.
  - `"a charismatic wizard is talking and explaining an exciting story,
    gesticulating as he articulates and explains"` → visibly more animated
    result.
  This is real evidence that the prompt text has *some* real effect on output
  energy — but `batuhan-ince` immediately pushed back with a counterpoint from
  his own testing: even a calm/mellow prompt still produced "exaggerated"
  facial expressions for him, and running the same job through the **original
  MeiGen-AI Gradio demo (not the ComfyUI wrapper)** gave "smoother mimics and
  movements" — implying **some of the exaggeration may be specific to the
  ComfyUI-WanVideoWrapper integration's defaults/scheduling, not the
  underlying model itself** — an important distinction this research cannot
  fully resolve (WaveSpeed's own hosted API is a third integration, with its
  own undocumented internal defaults, and it is unclear/unverified which of
  these two behaviors — raw Gradio's smoother output or ComfyUI's more jerky
  one — WaveSpeed's hosted service is actually closer to).
- **`MeiGen-AI/InfiniteTalk` issue #156**, title *"How to avoid messing up the
  source video? Limit infinitetalk to the face."* — the reporter asks
  specifically for a way to constrain InfiniteTalk to only the head region on
  a video-to-video job, to stop it from degrading motion elsewhere in frame.
  **Confirmed: this issue has zero responses as of this research** — no
  maintainer or community answer, no documented mask-based solution, nothing.
  **Read plainly: "constrain InfiniteTalk to just the face/head, leave
  everything else alone" — precisely the control this project would most
  want — has no confirmed working answer in the model's own official issue
  tracker.** This is a real evidentiary gap, not an inference.

## 3.4 Answering the brief's specific motion-control questions, one by one

Per the ground rule: officially confirmed vs. hands-on vs. hypothesis, stated
explicitly for each.

- **How does the model decide head movement?** Documented: audio
  cross-attention + reference-keyframe conditioning at a fixed ~1s spacing
  (M3, baked into training, not a runtime knob) — see 3.1. Not a
  choreography engine; it is a learned mapping from audio features + recent
  motion context to new motion, structurally similar in spirit to
  LTX's "narrative prompt → tendencies" philosophy but with audio given a
  materially larger, architecturally dedicated role.
- **Can the prompt actually control amplitude/frequency of head movement?**
  **Hands-on evidence says partially, inconsistently, not officially
  validated.** The paper (documented) describes text conditioning
  `y ∈ ℝ^(m×d_text)` as present in the model's mathematical formulation but
  states **no mechanism for using it is described or evaluated** by the
  authors. RuneGjerde's real side-by-side (hands-on) shows a visible
  difference from prompt wording alone; batuhan-ince's real counter-test
  (hands-on) shows a calm prompt did *not* fix exaggerated facial expressions
  for him. **Net assessment: prompt is a real but unreliable and
  unofficially-documented lever for this model — nowhere near as validated as
  this project's own LTX prompting method** (`video-performance-protocol.md`,
  which has an actual validated zero-defect real test behind it).
- **How to avoid repetitive/mechanical head-nodding or "AI-looking" motion?**
  **No official guidance found.** The closest real signal is `kijai`'s
  practitioner advice (hands-on): fewer steps / different scheduler /
  `audio_scale` tuning — none of which is confirmed to work reliably
  (muyifeiyang's follow-up says it didn't), and none of which is exposed on
  WaveSpeed's hosted endpoint (3.7).
- **How to get natural micro-movements instead of obviously synthetic
  animation?** **Not answered anywhere found** — this is exactly the
  open, unresolved problem in 3.3, not a solved technique with a citable
  answer. Stated plainly per the ground rules rather than padded.
- **How to control body/energy level?** Same answer as amplitude: audio CFG
  scale (`sample_audio_guide_scale`, raw-repo only) plus unofficial,
  contested prompt effects (hands-on). No documented, reliable, dedicated
  "energy" control.
- **How to make posture/movement match what the voice actually sounds like?**
  This is architecturally InfiniteTalk's stated selling point (audio
  cross-attention drives motion directly, documented) — but 3.3's hands-on
  evidence is that this coupling in practice often reads as "exaggerated"
  rather than "proportionate," even on calm audio (RuneGjerde's "calm audio"
  baseline, batuhan-ince's calm-prompt test). **The mechanism for
  audio-matching motion is real and documented; whether it produces
  *restrained, believable* matching (this project's actual bar) rather than
  *generically more/less motion* is not established by any source found.**
- **How to avoid invented gestures / hands entering frame?** **No documented
  or hands-on mitigation found specific to hands.** The paper claims reduced
  hand/body distortion *relative to MultiTalk* (a documented comparative
  claim, Table 1/2/4 FID/FVD/Sync numbers), which is a claim about visual
  quality/distortion, not about whether hands stay out of frame when they
  shouldn't be there — a different failure mode this research found no
  source addressing either way.
- **Is a nearly-still, seated subject easier to control reliably than a
  subject with lots of movement?** **Not directly tested or documented
  anywhere found — flagged as an open question, not answered.** The nearest
  thing to supporting inference (hypothesis, reasoning from the paper's own
  mechanism, not evidence): the control-strength mechanism (3.1) is described
  as a function of "similarity between the video context and image
  condition" — a source clip that is already very still is, by construction,
  more self-similar frame-to-frame, which by the paper's own logic *could*
  push the model toward the more "rigid replication" (M1-like) end of the
  spectrum rather than the intended M3 "moderate control" behavior. This is
  a plausible mechanical inference from the architecture description, not a
  tested or confirmed finding — treat it as a hypothesis worth a real
  single-variable test, not a fact.
- **How does the model interpret descriptive context like "tired but warm,"
  "natural conversation," "low energy"?** **No official prompting guide for
  this exact vocabulary was found anywhere** (paper, README, project page,
  WaveSpeed docs, or the hands-on threads). The single closest real data
  point is RuneGjerde's "calmly... relaxing body language" vs.
  "gesticulating... exciting story" pair (3.3) — real, but one anecdotal
  comparison on someone else's subject/audio, not a validated vocabulary for
  this model.

## 3.5 Real prompting method — what's actually documented vs. inferred

**Officially documented (WaveSpeed hosted product docs, `wavespeed.ai/models/wavespeed-ai/infinitetalk`
and the `/video-to-video` variant):** *"Avoid writing too many prompts"* and
*"the recommended language is English... otherwise the model will make
analysis errors, resulting in noisy and unexpected videos."* This is a real,
if thin, documented preference for **short, simple, English prompts** —
consistent with `yzhang2016`'s working minimal example (`"the man is
talking."`) in 3.3, and structurally the *opposite* of this project's own
validated LTX method, which favors **one fluid, detailed, narrative
performance-context prompt** (`video-performance-protocol.md`, steps 5–9).
**This is a real, documented difference between the two models' prompting
philosophy, not an oversight to reconcile — a long, detailed LTX-style prompt
translated verbatim onto InfiniteTalk would go directly against InfiniteTalk's
own vendor guidance ("avoid writing too many prompts").**

**No official example prompt library, no worked examples beyond the one-line
`"the man is talking"` case (found in a GitHub issue, not documentation), and
no first-party guidance distinguishing "narrative vs. short description" or
"positive description vs. negation list" was found for this model anywhere** —
paper, README, project page, and WaveSpeed docs are all silent on this beyond
the "keep it short, use English" instruction. **This sub-question has real
depth on LTX (this project's own validated method) and essentially none on
InfiniteTalk — stated plainly rather than padded with generic prompting
advice that isn't specific to this model.**

**A concrete phrasing attempt for the exact use case in the brief** ("a person
sitting in a parked car, talking naturally on the phone, energy matching the
audio, mostly facing camera, small natural gaze/head variation, no excessive
gesturing, no artificial movement"), built from the real evidence available
(short + English + calm-descriptive per WaveSpeed's own guidance + RuneGjerde's
real calm-language example), offered as a **hypothesis to test, not a
validated recipe** the way the LTX prompt method is:

> *"A woman sits still in a parked car, talking calmly on the phone, relaxed
> and mostly facing the camera, minimal head movement, natural but low-key
> body language."*

This deliberately mirrors the "calm... relaxing body language" phrasing that
had a real, observed effect in 3.3, kept short per the vendor's own "avoid
writing too many prompts" guidance. **It is explicitly not validated for this
model the way `video-performance-protocol.md`'s LTX method is validated** —
no test of this exact phrasing was run in this research (no generation was
performed, per the ground rules), and 3.3's `batuhan-ince` counter-example is
a real, documented reason to expect this alone will not reliably prevent
exaggerated motion.

## 3.6 What `mask_image` and `prompt` actually do, per WaveSpeed vs. the raw model

**WaveSpeed's hosted parameter surface (documented, both `infinitetalk` and
`infinitetalk/video-to-video` model pages):** `video` (v2v)/`image` (i2v),
`audio`, `mask_image` (optional — "define which regions can move"/"specifies
which regions can move"), `prompt` (optional — "guides style, pose, or
expressions"), `resolution` (480p/720p), `seed`. **That is the entire
documented parameter surface on the hosted API this project would actually
call.** WaveSpeed's own doc gives one explicit warning: *"Do not upload the
full image as `mask_image` — the mask should only cover the regions you want
to animate — otherwise the result may render as fully black."**

**This `mask_image` behavior is a WaveSpeed hosted-product-level exposure of
the paper's internal reference/mask mechanism (3.1), not something documented
in the raw MeiGen-AI repo's own README as a simple user-facing image-mask
input** — the raw repo's own equivalent concept (the reference-frame mask
`m`) is computed internally from the sparse-frame sampling strategy, not
supplied as a separate uploaded mask image by the CLI user in the documented
`README.md` usage examples fetched for this research. **This is flagged as a
real, unresolved discrepancy between the hosted product's documented
interface and the open-source model's own documented interface** — it is
plausible WaveSpeed built a genuine face-only-masking feature on top of the
raw model (which would directly answer issue #156's still-unanswered
question), but **no independent confirmation of `mask_image`'s real
behavior on a talking-head use case was found in this research** — no
hands-on report, no example, nothing beyond the one-line "don't upload the
full image, or output goes black" warning. **Unclear/unverified — flagged
explicitly, not rounded up to "this solves the face-only-constraint
problem."**

**Critically, for the amplitude-control question:** none of the raw model's
real, community-corroborated motion-amount levers (`sample_steps`,
scheduler choice, `sample_audio_guide_scale`/`audio_scale`, `sample_shift`)
appear anywhere in WaveSpeed's documented hosted parameter list. **This is a
material finding for this project specifically: even if the raw-repo/ComfyUI
community eventually nails down a reliable fix for "exaggerated and fake
movement" via those parameters, it is unclear/unverified whether WaveSpeed's
hosted endpoint exposes any equivalent control, or has simply picked one
fixed internal default for all of them.** This project would be consuming
InfiniteTalk through the one integration surface (WaveSpeed's hosted API)
that has the least documented control over the exact problem (3.3) that
matters most here.

## 3.7 Audio-to-motion relationship — direct answer to the brief's question 4

**Documented, architecturally real:** audio genuinely drives motion through a
dedicated cross-attention pathway (3.1), not just lipsync layered on top of
generic animation — this is a structurally true, real difference from a
mouth-only tool like `sync/lipsync-2-pro`.

**But — and this is the load-bearing caveat for this pipeline specifically —
the hands-on evidence in 3.3 shows that this coupling tends to produce
*more motion, more energetically*, not necessarily *proportionate, restrained
motion that matches a calm or tired vocal register*.** RuneGjerde's own real
test used "somewhat calm audio" in *both* his comparisons and still needed
different prompt text to get a calmer *result* — meaning, on this specific
hands-on data point, **audio content alone was not sufficient to produce
restrained motion; prompt language did more of the work than the audio
did**, which is close to the opposite of "the video should actually reflect
the real vocal energy" as this project needs it. This is one anecdotal
data point, not a systematic finding, but it is the only real evidence
found addressing this exact question, and it points toward a real risk: the
model's documented audio-coupling does not, on the evidence available,
reliably translate into calm audio → calm visual energy. Whether it does so
more reliably at different `audio_scale`/CFG values is plausible in theory
(3.1) but unconfirmed by any source found — and that exact parameter is not
exposed on WaveSpeed's hosted API (3.6) regardless.

## 3.8 Four-way comparison — LTX Lipsync / LTX Video Extend / sync-2-pro / InfiniteTalk video-to-video

Per the brief: (a) and (b) are LTX-family, already covered above and in
`known-issues.md`/`video-performance-protocol.md`; (c) is `sync/lipsync-2-pro`,
already covered in Part 1.3 above; summarized here for a fair side-by-side,
not re-researched. (d) is this section's subject.

| | **(a) LTX-2.3 Lipsync** (current, locked) | **(b) LTX-2.3 Video Extend** | **(c) `sync/lipsync-2-pro`** | **(d) InfiniteTalk video-to-video** |
|---|---|---|---|---|
| What's actually generated/regenerated | Entire clip regenerated per chunk from the static locked photo + audio + prompt | New visual continuation only, conditioned on the real last frame of the previous clip; no audio | Mouth + "local expressions" only, on an existing video — everything else explicitly preserved by design | Head pose, facial expression, posture **and** lips, regenerated from an existing silent video + audio — the broadest edit surface of the four |
| Identity risk | Confirmed real: per-chunk regeneration + documented "subject drift toward center-frame beyond 12-15s" (WaveSpeed's own portrait-mode blog, cited in Part 1.1) | Lower by construction (conditioned on real pixels, not regenerated from scratch) — but no documented identity-lock; untested in this project | **Lowest of the four, by documented design** — "preserves identity, lighting, background and facial structure" | Authors document a dedicated identity-preservation mechanism (sparse-frame reference keyframes) — but the edit surface is structurally the largest of the four, so more can go wrong even with that mechanism in place; no independent identity-drift measurement found for this model |
| Eye/teeth risk | **Confirmed real defects**: caption hallucination (`known-issues.md`), gray/warped forehead + discolored-teeth glitch (seed-dependent, retry-fixable) | Untested in this project | Untested in this project; structurally lower risk since only mouth/local region is touched | Not evaluated for eye/teeth specifically in the paper (evaluated on FID/FVD/Sync-C/D + human lip/body-sync ranking only); no source found addressing eye coherence directly |
| Invented-gesture/hand risk | **Confirmed real**: one documented invented-hand-mid-clip instance despite explicit forbidden-movement prompting (`video-performance-protocol.md`) | Untested | Low by construction — not a full-body regenerator | Paper claims reduced hand/body *distortion* vs. MultiTalk (a quality claim, not a "hands stay out of frame" claim); **no source found addressing whether hands are invented into frame** |
| Real control over motion | **Validated method exists** — narrative "tendencies not choreography" prompt, one real zero-defect test behind it (`video-performance-protocol.md`) | Untested; presumably similar prompt philosophy but not confirmed | N/A — it doesn't add motion, it preserves the source clip's existing performance by design | **Weakest of the four, on the evidence.** No validated prompt method; the one real documented amplitude lever (audio CFG scale) isn't exposed on WaveSpeed's hosted API; the most credible practitioner fixes (steps/scheduler) are raw-repo-only and reported by their own users as not fully working |
| Ability to preserve natural, restrained human behavior | Best documented track record in this project specifically (one real clean pass exists) but not defect-free | Unknown — the whole point would be preserving whatever restraint the source clip already had, via last-frame conditioning; plausible but untested | **Best documented fit for this exact goal** — it doesn't generate new motion at all, it keeps what's already there | **Actively working against this goal on the evidence found** — "exaggerated and fake movement" is the single most-corroborated, still-open complaint about this model across two independent issue trackers |
| Best role in this pipeline, if any | Current default initial generation (already locked, already the most real-world-tested tool in the stack) | Proposed (not yet validated) — extend-only step in the two-step chain from Part 1.3 | Proposed (not yet validated) — mouth-resync step closing the audio gap in the same chain | **No confirmed good role found for this project's actual goal.** Its one genuine architectural advantage (audio directly drives full-body motion, not just lips) is also, on the real-world evidence, its biggest liability for a project that explicitly wants *less* visible animation, not more audio-reactive motion |

## 3.9 Concrete recommendations and final assessment

**Actionable, if InfiniteTalk is ever tested for real (not a pipeline
decision — this is what a real single-variable test should control for,
per this project's standing methodology):**

1. Use a **short, plain, English prompt** describing calm context + explicit
   restrained body language — the phrasing offered in 3.5 is a reasonable
   starting hypothesis, not a validated recipe. Do **not** port the LTX
   narrative-prompt method over verbatim; WaveSpeed's own guidance for this
   model explicitly favors brevity, the opposite instinct from LTX.
2. Test with the **stillest, most self-similar source clip available** (a
   validated LTX output where the subject is already close to motionless) —
   3.4's hypothesis is that a more self-similar source clip may push the
   model's reference-frame mechanism toward more conservative, less
   "exaggerated" behavior, but this is unconfirmed and worth being the
   single variable of a real test rather than assumed.
3. **Budget for the "exaggerated and fake movement" failure mode to show up
   by default** — this is the single best-corroborated real-world finding in
   this whole section, from two independent, still-open GitHub issue
   threads, not a rare edge case.
4. Before spending real API cost on this model, it would be worth directly
   asking WaveSpeed support (or checking for updated docs) whether the
   hosted endpoint exposes anything equivalent to `sample_audio_guide_scale`/
   `audio_scale`/`sample_steps`/scheduler choice — as documented in 3.6, none
   of the raw model's real motion-amount levers appear in WaveSpeed's public
   parameter list, and that gap alone may make this model impractical to
   tune for restraint regardless of prompting, even before generating a
   single test clip.

**Final assessment, directly answering the brief's ask for a plain verdict:**

Of the four models compared, **`sync/lipsync-2-pro` remains the most
promising component for this project's actual goal** — a real person filmed
naturally, stable identity, restrained motion coherent with her real voice —
because it is the only one of the four that does not attempt to *generate*
new motion at all; it edits the mouth and leaves an already-restrained
performance alone by design. **LTX-2.3 Lipsync remains the most
production-proven single tool** (it has one real, audited, defect-free test
behind it in this project, which no other candidate here has). **LTX-2.3
Video Extend is the most promising way to get more duration without
restarting the identity/motion problem from zero**, precisely because it
conditions on real pixels from the last frame rather than regenerating.

**InfiniteTalk video-to-video is, on the primary-source and hands-on evidence
gathered in this research, the weakest fit of the four for this project's
specific goal — not because it's a bad model in general, but because its
core documented capability (audio directly drives full-body motion) is
exactly backwards from what this project needs (motion that stays out of the
way, coherent with but not amplified by the audio).** Its single most
consistently reported real-world behavior across two independent,
still-open GitHub issue threads is the opposite of "restrained" — described
by multiple independent users as "exaggerated," "jerky," and "fake" — and
the one real mitigation path the community has found (steps/scheduler/audio_scale
tuning) is not confirmed to be reachable on the hosted API surface this
project would actually use. Its genuine architectural strength — audio
directly driving posture/expression, not just lips — is real and documented,
but on every piece of real-world evidence found, it currently produces *more*
visible animation, not more *natural-looking restraint*, which is the exact
opposite of what this pipeline is optimizing for. If this project's priority
ever shifts toward wanting Shanon to visibly gesture/react more, InfiniteTalk
would deserve a real look; for the stated goal of an unremarkable, restrained,
spontaneous-feeling smartphone video, it is not recommended as a next test
ahead of validating the LTX Extend + sync-2-pro chain already proposed in
Part 1.3.

## 3.11 Counter-evidence found, specific to WaveSpeed's own hosted product (added 2026-08-23, same day, in response to a direct follow-up)

Sections 3.3–3.9 draw their "exaggerated and fake movement" finding entirely
from the raw MeiGen-AI repo's GitHub issues and the third-party ComfyUI-
WanVideoWrapper integration — **neither of which is WaveSpeed's own hosted
product**, a distinction 3.4 and 3.6 already flagged as an open, unresolved
question ("unclear/unverified which of these two behaviors ... WaveSpeed's
hosted service is actually closer to"). A direct follow-up check of
WaveSpeed's own blog surfaces real, WaveSpeed-specific counter-evidence that
this section did not have before, and it points the other way.

**WaveSpeed's own comparison post**, *"The 2026 AI Digital Human Crown: More
Real Than Reality?"* (`wavespeed.ai/blog/posts/the-2026-ai-digital-human-crown/`),
describes InfiniteTalk's motion, specifically in contrast to competing models
on the same platform, as **"nods, head tilts, pointing, and subtle
shoulder–neck movements, with smooth transitions,"** characterizing it overall
as **"restrained, varied, and purposeful movements rather than exaggerated
animation"** and "closer to camera-ready realism" — explicitly contrasted
against OmniHuman ("gestures often overreach or distort") and Kling ("relies
on a single raised-hand movement that quickly becomes repetitive") on the same
page. A second WaveSpeed post, *"Introducing InfiniteTalk: Infinite
Conversations, Maximum Realism"* (`wavespeed.ai/blog/posts/introducing-infinitetalk-infinite-conversations-maximum-realism/`),
separately claims an upgraded version rated **"Excellent (No jitter in
long-form)"** versus a legacy version's "Good."

**This directly contradicts 3.3's hands-on GitHub findings and must be read
honestly, not resolved by picking whichever answer is more convenient:**

- **Real, structural reason to distrust the comparison post at face value**:
  it is WaveSpeed's own marketing/comparison content for a product WaveSpeed
  sells access to — a real incentive to present it favorably, unlike the
  GitHub issue reporters, who have no such incentive and posted real
  attached clips showing the problem.
- **Real, structural reason the two sources could both be honestly correct**:
  they may simply be describing two different integrations with different
  tuned defaults (WaveSpeed's hosted endpoint vs. the raw repo / ComfyUI
  community defaults) — exactly the gap 3.6 already identified as unresolved.
  Nothing found in this follow-up check independently verifies WaveSpeed's
  comparison claims against a real, independently-generated clip.
- **Neither `wavespeed.ai/blog/posts/create-an-ai-anchor-5-minutes/` nor the
  hosted model pages give any concrete prompting technique for controlling
  motion restraint** beyond "add more specific instructions in the prompt" —
  so even if WaveSpeed's hosted version is genuinely more restrained by
  default, there is still no documented method for *directing* that restraint
  deliberately, the way `video-performance-protocol.md` does for LTX.

**Revised verdict, honestly unresolved rather than settled either way:** the
3.9 conclusion that InfiniteTalk is "the weakest fit of the four" was drawn
before this counter-evidence existed and overstated the certainty of that
call — the real state of the evidence is a genuine conflict between two real
source types (vendor-neutral hands-on reports on one integration vs. the
hosting vendor's own comparative claims about a possibly-different
integration), not a settled negative. Given InfiniteTalk's native up-to-10-
minute single-call duration would, if the restraint claim holds, structurally
eliminate this project's entire chunking problem at once, this is now judged
**worth a real, cheap, single-variable test — after, not instead of,
validating the already-proposed LTX Extend + `sync/lipsync-2-pro` chain from
Part 1.3** — specifically to observe WaveSpeed's actual hosted behavior
directly rather than trusting either secondhand source further.

## 3.10 Sources (Part 3)

- Primary technical paper: `arxiv.org/abs/2508.14033`,
  `arxiv.org/pdf/2508.14033`, `arxiv.org/html/2508.14033v1` (full HTML,
  architecture/ablation/limitations detail)
- Official code + README: `github.com/MeiGen-AI/InfiniteTalk`,
  `raw.githubusercontent.com/MeiGen-AI/InfiniteTalk/main/README.md`
- Official project page: `meigen-ai.github.io/InfiniteTalk/`
- Official model weights: `huggingface.co/MeiGen-AI/InfiniteTalk`
- Real hands-on GitHub issues (primary evidence for 3.3, 3.4, 3.7):
  `github.com/MeiGen-AI/InfiniteTalk/issues/65` ("movement looks too
  exagerated and fake"), `github.com/MeiGen-AI/InfiniteTalk/issues/156`
  ("How to avoid messing up the source video? Limit infinitetalk to the
  face" — zero responses, confirmed), `github.com/kijai/ComfyUI-WanVideoWrapper/issues/1203`
  ("exaggerated and fake movement with InfiniteTalk," including maintainer
  `kijai`'s responses and multiple independent users' real generated-clip
  reports), `github.com/kijai/ComfyUI-WanVideoWrapper/issues/1947` (reported
  "no body and hand motion" counter-case, thread content not fully
  retrievable — flagged unclear/unverified, not used as evidence beyond
  noting its existence)
- WaveSpeed-specific counter-evidence (3.11):
  `wavespeed.ai/blog/posts/the-2026-ai-digital-human-crown/`,
  `wavespeed.ai/blog/posts/introducing-infinitetalk-infinite-conversations-maximum-realism/`,
  `wavespeed.ai/blog/posts/create-an-ai-anchor-5-minutes/`,
  `wavespeed.ai/models/wavespeed-ai/infinitetalk`
- WaveSpeed hosted product docs (documented, but confirmed thinner than the
  primary sources above — this is the actual API surface this project would
  call): `wavespeed.ai/models/wavespeed-ai/infinitetalk`,
  `wavespeed.ai/models/wavespeed-ai/infinitetalk/video-to-video`,
  `wavespeed.ai/blog/posts/introducing-wavespeed-ai-infinitetalk-video-to-video-on-wavespeedai/`
- Independent hands-on tutorial (partial, non-vendor):
  `learn.thinkdiffusion.com/latest-in-lipsync-infinitetalk-video2video-comfyui-guide/`
- Existing project docs referenced, not re-derived: Part 1.3 above
  (`sync/lipsync-2-pro` documentation and the extend+resync two-step
  hypothesis), `known-issues.md` (LTX-2.3 lipsync confirmed defects),
  `video-performance-protocol.md` (LTX's own validated prompting method, used
  here only as a contrast point for InfiniteTalk's different, thinner,
  officially-recommended-brevity prompting style)

---

# Part 4 — WaveSpeed-only deep dive: InfiniteTalk control + `sync/lipsync-2-pro` optimal usage (added 2026-08-23)

**Scope discipline for this section, stated explicitly because it differs from
Part 3 above:** every source in this Part is WaveSpeed's own site
(`wavespeed.ai` model pages, `/docs/docs-api/...` API reference, `/blog/...`
posts and guides, `/docs/...` how-to guides, `/landing/...` pages, and
`/collections/...` listings). No GitHub issues, no arXiv paper, no ComfyUI
integrations, and no generic AI-video-prompting knowledge appear anywhere
below — that ground was already covered in Part 3 (§3.0–3.11) and is treated
as out of scope for this pass, per the brief that triggered it. Where a claim
cannot be sourced to a WaveSpeed page, it is tagged **D — unknown / not
documented by WaveSpeed** rather than filled in from outside knowledge, even
where Part 3's academic/hands-on research already answered the same question
from a different source class.

**Evidence tags used throughout, per the brief:**
**A** = officially documented by WaveSpeed (page/URL + quote).
**B** = official WaveSpeed example (an actual example prompt/output WaveSpeed
shows).
**C** = reasonable inference from WaveSpeed's docs, not stated outright —
inference basis given.
**D** = unknown / not documented by WaveSpeed — a valid, expected outcome for
several sub-questions below, not a research failure.

**Pages fetched directly for this pass** (in addition to the pages already
cited in §3.5/§3.6 above, re-checked here as part of a full site sweep):
`wavespeed.ai/models/wavespeed-ai/infinitetalk`,
`wavespeed.ai/models/wavespeed-ai/infinitetalk/video-to-video`,
`wavespeed.ai/models/wavespeed-ai/infinitetalk-fast`,
`wavespeed.ai/models/sync/lipsync-2-pro`, `wavespeed.ai/models/sync/lipsync-2`,
`wavespeed.ai/docs/docs-api/wavespeed-ai/infinitetalk`,
`wavespeed.ai/docs/docs-api/wavespeed-ai/infinitetalk-video-to-video`,
`wavespeed.ai/docs/docs-api/wavespeed-ai/infinitetalk-fast-video-to-video`,
`wavespeed.ai/docs/docs-api/sync/sync-lipsync-2-pro`,
`wavespeed.ai/blog/posts/introducing-wavespeed-ai-infinitetalk-on-wavespeedai/`,
`wavespeed.ai/blog/posts/introducing-wavespeed-ai-infinitetalk-video-to-video-on-wavespeedai/`,
`wavespeed.ai/blog/posts/create-an-ai-anchor-5-minutes/`,
`wavespeed.ai/blog/posts/introducing-sync-lipsync-2-pro-on-wavespeedai/`,
`wavespeed.ai/blog/posts/the-2026-ai-digital-human-crown/`,
`wavespeed.ai/docs/docs-faq`, `wavespeed.ai/docs/create-digital-human`,
`wavespeed.ai/docs/video-generator`, `wavespeed.ai/docs/write-prompts`,
`wavespeed.ai/collections/avatar-lipsync`, `wavespeed.ai/landing/infinite-talk`.
Two URLs returned HTTP 404 and are not used as sources:
`wavespeed.ai/blog/en/posts/Fastest-Ever-Digital-Human-Generation-Guide` (the
working mirror, `wavespeed.ai/blogs/index.php/2025/12/10/fastest-ever-...`,
also 404'd on this pass — the "Fastest-Ever Digital Human Generation Guide"
post named in the brief could not be reached by either URL found via search;
its content is therefore **not** represented below) and
`wavespeed.ai/blog/posts/The-2025-AI-Digital-Human-Crown` (predecessor post,
404, superseded by the 2026 version which was reachable and is used).

---

## 4.1 What's confirmed (A — officially documented by WaveSpeed)

**InfiniteTalk (`infinitetalk`, `/video-to-video`, `infinitetalk-fast`) —
documented parameter surface, identical shape across all three variants:**
`image` (i2v) or `video` (v2v) — required; `audio` — required; `prompt` —
optional, "the positive prompt for the generation"; `mask_image` — optional;
`resolution` — 480p/720p, default 480p; `seed` — default -1. Source: the four
`docs-api` pages fetched above, cross-checked against the three model pages.

**Prompt-length guidance is real and explicit, repeated verbatim across
`infinitetalk`, `/video-to-video`, and `infinitetalk-fast` model pages:**
*"Avoid writing too many prompts and the recommend language is English,
otherwise the model will make analysis errors, resulting in noisy and
unexpect videos."* [sic, WaveSpeed's own wording, typos preserved] This is
the single most repeated, most confidently-documented prompting instruction
found anywhere in this research pass.

**`mask_image`'s function is documented at the level of "what it's for," not
"how it's encoded":** every page carrying the parameter (three `docs-api`
pages, three model pages, the "Introducing InfiniteTalk" and "Introducing
InfiniteTalk Video-to-Video" blog posts, and the FAQ-adjacent search index)
repeats a near-identical two-part statement: (1) mask images "let you define
which regions can move" / "specify which regions should animate," and (2) a
standing warning, quoted identically on every parameter-carrying page found:
*"Do not upload the full image as mask_image. The mask should only cover the
regions you want to animate—otherwise the result may render as fully
black."* This warning is the single most consistently repeated `mask_image`
fact across the entire site.

**The Playground UI builds the mask via a paint tool, not a manually
authored image file — documented directly on `create-an-ai-anchor-5-minutes`:**
*"accurately define the movable area: adjust **Brush Size**, paint over the
regions you want to animate, then click **Use Mask** to apply."* The same
post documents that the resulting mask can be saved: *"You can also click
**Download Mask** to save the **mask_image** as a template for quick reuse in
future projects."* This is the clearest first-party description found of how
`mask_image` is actually produced in practice: a user paints (brushes) over
the regions that should be allowed to move, and the tool exports that
painted selection as the `mask_image` file, which can then be reused across
generations as a template. **This directly confirms the mechanism is a
positive-selection paint mask (paint = "let this move"), which strongly
implies but does not explicitly state the pixel convention** — see §4.2 for
why this still falls short of a documented format spec.

**`create-digital-human` guide — real, WaveSpeed-authored production tips,
independent of the model pages:** *"Keep it simple — Complex expressions may
not animate well,"* *"Match aspect ratios — Face image should match output
video ratio,"* *"Test short clips first — Iterate before generating long
videos,"* *"Use high-quality inputs — Better images and audio = better
output."* Image requirements documented on the same page: *"At least
512x512"* resolution, *"Centered, facing camera"* positioning, *"Even, no
harsh shadows"* lighting. Audio requirements: *"Clear, minimal noise"*,
formats *"MP3, WAV, M4A."*

**`write-prompts` guide — platform-wide, not InfiniteTalk-specific, but
explicitly includes a digital-human sub-section:** *"Specify the speaking
style and emotion"*, *"Describe appearance in detail (age, clothing,
expression),"* *"Include background and lighting preferences."* General
guidance: *"Describe the motion or action clearly"* and *"Keep prompts
focused on one main action."* A **Prompt Enhancer** tool ($0.001/use) is
documented as available next to the prompt field on model pages, positioned
by WaveSpeed as the primary recommended path to a better prompt rather than
a manual-technique document.

**`sync/lipsync-2-pro` — documented parameter surface:** `video` (required,
"input video to be re-synced... works best with relatively stable
talking-head or upper-body shots"), `audio` (required, "target speech...
the new lip motion will follow this track"), `sync_mode` (optional, default
`cut_off`). All five `sync_mode` values are documented, identically worded
across the model page and the `docs-api` reference page:
- **`cut_off`** — *"Trim to the shorter of audio or video (default,
  safest)."*
- **`loop`** — *"Loop the shorter track until the longer one finishes."*
- **`bounce`** — *"Ping-pong the video when looping (forward–back–
  forward…)."*
- **`silence`** — *"Pad missing audio with silence."*
- **`remap`** — *"Time-warp to better match durations."*

**Preservation scope, documented, the model's single clearest safety-relevant
claim:** *"Only the mouth and local expressions are changed"* — identity,
lighting, background, and facial structure are stated as preserved by
design, not by mask authoring (contrast with InfiniteTalk's `mask_image`,
which requires the user to author the scope).

**`sync/lipsync-2-pro`'s own introduction blog independently confirms and
narrows the sync_mode recommendation for a stable single clip:** *"Cut-off:
Trim to the shorter track (recommended for most use cases)"* — this is a
second, independent WaveSpeed source (the blog, not just the model/docs
pages) giving the same default-and-recommended answer.

**Audio-to-motion, InfiniteTalk, documented (not hands-on, not paper —
WaveSpeed's own blog wording):** *"Every syllable triggers not just lip
movement, but corresponding head turns, facial expressions, subtle
micro-expressions, and body posture adjustments"* (Introducing InfiniteTalk
blog). *"Precise Lip Synchronization: Audio analysis aligns lip motion with
speech at the phoneme level, preserving natural rhythm, pronunciation, and
timing across any language"* and *"Full-Body Coherence: Goes beyond lips to
capture realistic head movements, gaze shifts, eyebrow raises, smiles,
frowns, and shoulder motion synchronized to audio tone and context"* (same
post). The video-to-video variant's blog adds: *"synthesizes a new video
with accurate lip synchronization while simultaneously aligning head
movements, body posture, and facial expressions with the audio."* The 2026
Digital Human Crown comparison post adds a comparative claim: InfiniteTalk
shows *"nods, head tilts, pointing, and subtle shoulder–neck movements, with
smooth transitions and more accurate emotional expression,"* and separately,
in a different context on the same page, that gestures/expressions/tone
align *"with the lesson material"* (an education-scenario example, not a
general claim). A separate WaveSpeed-indexed summary (search-engine snippet
of WaveSpeed's own site, not independently re-fetched verbatim) states
InfiniteTalk shows *"consistent emotion–motion alignment even over long
runs."* **Read plainly: WaveSpeed's own documentation says audio tone,
phoneme timing, and (per the syllable-level claim) even individual syllables
are stated to drive head/face/posture motion — this is a real, repeated,
first-party claim, not a hands-on inference.** Whether "tone/emotion driving
motion" in WaveSpeed's own wording means the model reliably produces
*restrained* motion on *calm* audio, specifically, is **not addressed by any
WaveSpeed source found** — every quote above describes richness/coverage of
what audio can drive, never restraint or proportionality. See §4.4 below for
how this cuts against this project's stated priorities.

## 4.2 Official example prompts found (B — official WaveSpeed examples)

**The only real, verbatim example prompts found anywhere on WaveSpeed's site
for InfiniteTalk live on `wavespeed.ai/landing/infinite-talk`, not on any
model page or blog post (which describe the `prompt` field but show zero
worked examples):**

1. *"Professional news anchor presenting a business report, neutral
   expression transitioning to engaged discussion."*
2. *"Teacher explaining a concept with enthusiastic expressions, occasional
   nods and hand gestures."*
3. *"Brand ambassador delivering a product pitch with confident smile and
   direct eye contact."*
4. *"Two characters engaged in a casual conversation, natural turn-taking and
   reactive expressions."*

**This is a materially important finding for this project, independent of
anything else in this section: every one of WaveSpeed's own four official
example prompts describes an expressive, presenter-register performance —
"engaged discussion," "enthusiastic... nods and hand gestures," "confident
smile," "reactive expressions."** None demonstrates restraint, stillness, or
low energy. **No calm/tired/low-energy/seated-in-a-car example exists
anywhere on WaveSpeed's site for this model** — the calm-register prompt
built in Part 3 §3.5 (*"A woman sits still in a parked car, talking calmly on
the phone..."*) remains, after this full site sweep, a hypothesis this
project constructed by analogy to a single GitHub hands-on comparison (§3.3),
**not** something modeled on any WaveSpeed-provided example. If this
project's phrasing follows WaveSpeed's own example pattern too closely, the
pattern itself points toward more animation, not less — see §4.4.

**No example prompts, worked or otherwise, were found anywhere for
`mask_image` usage** beyond the one repeated warning sentence in §4.1 — no
page shows a sample mask image, a before/after result, or a worked
"face-only" / "head + upper body" region example. (An earlier-pass
WebSearch-engine synthesis had suggested a "head + upper body" example
existed; **that specific phrasing could not be verified against any directly
fetched WaveSpeed page in this research pass and is not treated as a real
finding** — flagged explicitly rather than carried forward on a
search-snippet's own paraphrase.)

**No example prompts were found for `sync/lipsync-2-pro`** — every source
checked (model page, `docs-api` page, introduction blog) describes the model
and its parameters but shows no worked prompt or example clip, which is
consistent with the model not taking a text prompt at all (it takes only
`video` + `audio` + `sync_mode`).

## 4.3 What's recommended (A/C mix — WaveSpeed's stated preferences plus reasonable inferences from them, each labeled)

**InfiniteTalk prompting, directly recommended by WaveSpeed (A):**
- Keep the prompt short; avoid "writing too many prompts" (repeated
  verbatim across all three InfiniteTalk model pages, §4.1).
- Write in English specifically — WaveSpeed states non-English prompts risk
  "analysis errors" (A, same source).
- Keep the described expression simple — *"Complex expressions may not
  animate well"* (A, `create-digital-human`).
- Match the face image's aspect ratio to the intended output ratio (A,
  same source) — directly relevant since this project's format is 9:16
  portrait; confirm the locked source photo's ratio matches before any
  InfiniteTalk test.
- Test short clips before committing to a long generation (A, same source)
  — aligns naturally with this project's single-variable-test methodology
  already in place.
- Use the Prompt Enhancer tool as WaveSpeed's own primary recommended path
  to a better prompt (A, `write-prompts`) — **not evaluated in this research
  pass**: it is an automated black-box rewrite tool, and running this
  project's carefully-scoped calm-register prompt through a generic
  enhancer risks the enhancer pushing it back toward WaveSpeed's own
  example register (§4.2) rather than preserving restraint. Flagged as a
  real risk (C, inferred from the enhancer's generic positioning + the
  skew observed in §4.2), not recommended for this project's use without a
  dedicated test of its own.
- For the digital-human prompt specifically, "specify the speaking style
  and emotion" (A, `write-prompts`) — directly actionable: this project's
  performance-context method (`video-performance-protocol.md`) already does
  this for LTX; the same energy/state answer from that four-question method
  can be carried over as the "speaking style and emotion" content for an
  InfiniteTalk prompt, worded briefly per the length guidance above (C,
  combining two separately-documented WaveSpeed recommendations).

**`mask_image` construction, recommended workflow (A):** build it in the
Playground via the brush tool (*"adjust Brush Size, paint over the regions
you want to animate, then click Use Mask"*), and save it as a reusable
template via *"Download Mask"* rather than hand-authoring a mask image file
from scratch — this is the only concretely documented, repeatable procedure
found for producing a valid `mask_image`.

**`sync/lipsync-2-pro`, recommended settings for a single stable clip (A):**
`sync_mode: cut_off` — stated as both the API default and, independently, as
*"recommended for most use cases"* on the introduction blog. No WaveSpeed
source recommends any other `sync_mode` for a single, already-duration-matched
talking-head take.

## 4.4 What remains unknown (D — not documented by WaveSpeed, stated plainly)

**`mask_image` exact encoding — the core Part 2 question, and still
unresolved after a full site sweep.** Not one of the ~15 InfiniteTalk-related
WaveSpeed pages fetched in this pass states:
- Whether the exported/uploaded mask uses a strict binary
  white-equals-animate / black-equals-static convention, a grayscale
  gradient, an alpha channel, or some other encoding. The only real
  operational fact found is procedural (§4.1: paint = "region to animate"
  in the Playground UI) — the underlying file format the API actually
  expects when a mask is supplied via the raw API (not the Playground) is
  never specified in the `docs-api` parameter tables, which list
  `mask_image` only as `string` with no format note beyond "URL."
- Required dimensions or aspect-ratio correspondence to the source
  image/video (must it be pixel-identical dimensions? Is it auto-resized?).
  **Not documented anywhere found.**
- Any worked example, before/after pair, or sample mask file. **Not found.**
- Whether motion can be limited to *just* the face, or *just* the face plus
  upper body, as separate documented options — WaveSpeed's own text only
  ever says "the regions you want to animate" in the singular/generic sense,
  never enumerating specific supported region presets. **Not documented.**
- Whether specific regions can be **fully locked** (zero motion guaranteed)
  as opposed to merely "not preferentially selected for animation" — this is
  a meaningful distinction (a soft bias vs. a hard constraint) that no
  WaveSpeed source addresses either way.
- What happens if the mask is too tight/narrow around the face — no
  guidance on broken hair, shoulder, or face-contour edges is documented
  anywhere. The only documented failure mode at all is the opposite extreme
  (mask covers too much / the whole image → fully black output). **The
  narrow-mask failure mode the brief specifically asked about is a
  confirmed, total gap — not partially answered, not hinted at, simply
  absent from every WaveSpeed source checked.**

**This confirms, rather than merely repeats, Part 3's earlier finding
(§3.6): the gap identified there is still a real, current gap after a
dedicated full-site search pass targeting exactly this question.** Nothing
found in this pass moves `mask_image`'s format from "documented at the
concept level, undocumented at the encoding level" to "safe to use with
confidence" — if anything, the added Playground/brush detail in §4.1
narrows the gap slightly (procedural how-to) without closing the encoding
question (technical what-format) that actually determines whether a
raw-API caller (as this pipeline is, per `pipeline.py`'s existing Bearer-
token REST pattern, not a Playground user) could construct a correct mask
file from scratch.

**Amplitude/energy control — no dedicated knob documented anywhere on
WaveSpeed's site.** No `audio_scale`, no CFG-style weight, no steps
parameter, nothing beyond `prompt` and `mask_image` appears in any
InfiniteTalk parameter table found (§4.1's full parameter list is exhaustive
for what WaveSpeed documents). This matches and reconfirms §3.6's finding.

**How to avoid repetitive head-nodding specifically — not documented.** No
WaveSpeed page uses the word "nodding" except once, positively, as part of a
*more* expressive example ("occasional nods and hand gestures," §4.2's
Teacher example) — there is no counter-guidance anywhere about avoiding
repetition or mechanical-looking nodding.

**How to avoid artificial-looking smiles — not documented.** No WaveSpeed
source anywhere addresses smile naturalness, forced-vs-natural expression
quality, or any related failure mode.

**Whether pauses in speech specifically influence behavior — not
documented.** WaveSpeed's audio-to-motion language (§4.1) speaks in terms of
"syllable," "phoneme," and "audio tone," never "pause," "silence," or
"rhythm gap." Silence/pause handling is discussed only in the unrelated
context of `sync/lipsync-2-pro`'s `sync_mode: silence` value (padding a
*duration* mismatch, not a behavioral response to a pause within otherwise-
matched audio).

**`sync/lipsync-2-pro` — teeth-specific risk: not documented.** The only
teeth-adjacent statement found anywhere (model page and its introduction
blog, both checked) is positive framing about detail *preservation*: *"high-
resolution content with enhanced detail preservation, especially critical
for features like beards, teeth, freckles, and fine facial textures"* and
*"preserving... sharp details like natural teeth and facial features — even
in 4K."* **No risk, failure mode, or caveat specific to teeth is stated
anywhere.** This is a marketing-style preservation claim, not a documented
safety guarantee, and should not be read as one.

**`sync/lipsync-2-pro` — eye-specific risk: not documented.** No WaveSpeed
source mentions eyes, gaze, or blinking at all, positively or negatively.

**`sync/lipsync-2-pro` — what happens if the head turns in the source video:
not documented.** The only source-video guidance found, repeated near-
identically across the model page and `docs-api` page, is the single
sentence *"works best with relatively stable talking-head or upper-body
shots."* No threshold, no degrees-of-turn guidance, no described failure
mode (blur? seam? mouth misplacement?) is given for what happens beyond
"stable." This project's parked-car, fixed-camera, face-to-camera framing is
about as close to "stable" as a real source clip gets, which is
reassuring by fit but not by any documented tolerance margin.

**No direct `lipsync-2` vs. `lipsync-2-pro` comparison page found.** Both
model pages were checked (§source list); neither cross-references the other
with a feature/quality comparison table. The only distinguishing facts found
are pricing ($0.05/s of video for `lipsync-2` vs. $0.08/s of audio for
`lipsync-2-pro`, per Part 1.3 above) and `lipsync-2-pro`'s explicit
high-resolution/4K detail-preservation framing, which `lipsync-2`'s page
does not repeat.

## 4.5 Best documented settings for this project's exact use case

**InfiniteTalk, if tested (per Experiment A below):**
- `resolution: 720p` — the higher of the two documented options; no
  WaveSpeed source states 480p is preferable for any reason relevant to this
  project (both are simply offered as tiers).
- `seed`: fixed, non–`-1` value, for reproducibility across any repeated
  test — directly documented behavior (§4.1).
- `prompt`: short, English, built from this project's own performance-
  context method (`video-performance-protocol.md`'s four-question answer)
  but compressed to WaveSpeed's documented brevity preference — this is a
  **C-tagged construction**, not a WaveSpeed example, since no calm-register
  WaveSpeed example exists (§4.2). Do not run it through the Prompt Enhancer
  without a separate, dedicated test of what the Enhancer does to it first
  (§4.3).
- `mask_image`: **recommend leaving unset for the first test.** Given §4.4's
  findings — no documented pixel convention, no dimension spec, no
  documented narrow-mask failure mode, and the brief's own instruction that
  `mask_image` should be included in Experiment A "only if its behavior is
  documented well enough to use responsibly" — the honest conclusion is that
  it is **not** documented well enough. Using it anyway would add an
  unvalidated, unverifiable-format variable to a test that already has
  plenty riding on the prompt/model question alone.

**`sync/lipsync-2-pro`, if tested (per Experiment B below):**
- `sync_mode: cut_off` — the documented default and the only value
  WaveSpeed's own blog independently labels "recommended for most use
  cases" (§4.1, §4.3). Directly answers the brief's specific question about
  `loop`/`bounce`: **there is no WaveSpeed documentation anywhere that
  recommends `loop` or `bounce` for a single natural take.** Both are
  described only as mechanisms for stretching a *shorter* track to cover a
  *longer* one by repeating (and, for `bounce`, reversing) content — exactly
  the "repeating/reversing a human performance" pattern this project's own
  brief already suspected would look artificial. **WaveSpeed's own
  documentation does not contradict that suspicion; if anything it
  independently confirms `cut_off` as the recommended choice for the normal
  case and gives no scenario anywhere in which `loop`/`bounce` is framed as
  preferable for a one-take performance.** The correct practical takeaway,
  stated plainly: prepare the source video and the already-validated audio
  to already be closely duration-matched before calling this model, so
  `cut_off`'s trimming has minimal-to-nothing to actually trim — `remap`
  ("time-warp to better match durations") is the only documented alternative
  if a small mismatch needs correcting without any repeat/reverse artifact,
  though "time-warp" itself is not further explained (unknown whether it
  speeds/slows the video or the audio, or both, to converge — **D,
  unknown**).

## 4.6 Risks specific to this project's exact use case (parked car, one person, fixed camera, 30–50s)

- **InfiniteTalk's own official example library skews toward exactly the
  register this project wants to avoid.** All four landing-page example
  prompts (§4.2) describe expressive, gesture-forward, presenter-style
  delivery. A user following WaveSpeed's own patterns as a starting template
  — the most natural thing to do absent any calm/restrained official example
  — would be modeling toward more motion, not less. This is a real,
  documented-pattern risk, not a hands-on anecdote.
- **The `mask_image` documentation gap (§4.4) is itself a risk to this
  project's stated priority of minimizing regenerated frame area.** Without
  a confirmed pixel convention or dimension spec, a mask authored outside
  the Playground (which this pipeline would need, since it calls the raw
  REST API per `pipeline.py`'s existing pattern, not the web Playground) has
  a real chance of being misinterpreted — inverted, mis-scaled, or
  triggering the documented "fully black" failure — before any question of
  whether masking even helps motion restraint can be answered.
  - Additionally, the parked-car use case doesn't obviously map to a face-
  only region — the standing forbidden-movements block already forbids "no
  camera movement," "no environment changes," etc.; if the mask leaves the
  car interior/background unprotected by construction, an over-eager
  animate-everything default (the model's stated behavior absent a mask,
  per §4.1's "full-body coherence" framing) could put exactly those forbidden
  elements at risk. This is a **C-tagged inference** from the documented
  default scope, not a documented finding — but it is a coherent reason to
  treat masking as a meaningful lever *if* the format question can ever be
  resolved, and a real reason it can't be leaned on today.
- **Audio-driving-motion, as WaveSpeed itself describes it (§4.1), is stated
  as comprehensive ("every syllable... head turns... body posture
  adjustments") but never as proportionate or restraint-aware.** Nothing in
  WaveSpeed's own language distinguishes "calm audio → calm motion" from
  "any audio → full expressive range." Combined with §4.2's finding that
  every official example is already expressive, the working assumption for
  this project should be that InfiniteTalk's *default* tendency, per
  WaveSpeed's own positioning of the product, leans toward visible,
  syllable-reactive animation — consistent with (not contradicted by) Part
  3's independent hands-on "exaggerated" finding, even though this section
  deliberately did not re-derive that finding from GitHub sources.
- **`sync/lipsync-2-pro`'s source-video guidance ("stable... shots") has no
  documented degree threshold**, so there's no way to confirm from WaveSpeed
  documentation alone whether this project's naturally-still parked-car
  framing is "stable enough" versus some undocumented tighter bar the model
  was actually tuned against. Low risk by fit (this is about as still as a
  real clip gets) but not a documented guarantee.
- **No documented teeth or eye risk exists for `lipsync-2-pro` (§4.4) — but
  absence of a stated risk is not a safety guarantee**, and this project's
  own priority order (coherent teeth and natural eyes rank near the top)
  means the mandatory full frame-by-frame audit (already standing practice
  per `post-production-repair-research.md`) remains just as necessary for
  any `lipsync-2-pro` output as for any LTX output — nothing found here
  changes that.

## 4.7 The two single-variable experiment proposals (per the brief's Part 6 — proposed only, not run, not coded)

**These two experiments must not be combined in the first test of either —
each isolates exactly one tool's real behavior on this project's actual
locked assets, per this project's standing baseline/single-variable
methodology (`feedback_baseline_single_variable_methodology.md`).**

**Experiment A — InfiniteTalk alone.**
- **Fixed inputs:** the locked Shanon source image (already identity-
  verified) + the already-validated, locked audio track for one real script
  (per `voice-generation-protocol.md`) — unchanged from the current
  pipeline's normal inputs.
- **The one variable under test:** replace the current LTX-2.3
  lipsync generation step with a single `wavespeed-ai/infinitetalk` (image-
  to-video) call, `resolution: 720p`, fixed `seed`, and a short English
  prompt built from this project's own four-question performance-context
  method (`video-performance-protocol.md`) compressed to WaveSpeed's
  documented brevity preference (§4.5) — **`mask_image` deliberately
  omitted**, per §4.5's finding that its format isn't documented well enough
  to use responsibly yet.
- **Goal:** determine whether InfiniteTalk can directly produce a longer
  (up to InfiniteTalk's documented 10-minute native ceiling), more human
  performance than the current LTX chunk-and-concatenate pipeline — i.e.,
  whether it structurally solves the chunking problem `video-tooling-
  landscape-research.md`'s Part 1 was originally written to investigate.
- **What the full frame-by-frame audit on the result should specifically
  check, given §4.6's risks:** whether the output's motion energy matches
  this specific audio's real energy (not WaveSpeed's own expressive-example
  register), whether the car/background stays static despite no mask being
  used, and whether teeth/eyes/identity hold up across the model's
  documented "full-body coherence" edit surface — the standard defect
  checklist plus these InfiniteTalk-specific watch-items.

**Experiment B — `sync/lipsync-2-pro` alone.**
- **Fixed inputs:** an existing, already-audited, stable talking-head video
  (e.g., a validated LTX output already on record) + its matching,
  already-validated audio.
- **The one variable under test:** a single `sync/lipsync-2-pro` call,
  `sync_mode: cut_off` (§4.5's documented-recommended default), with the
  source video and audio pre-trimmed to already-closely-matched duration so
  `cut_off`'s trim has effectively nothing to do — isolating the model's
  real mouth-resync behavior from any duration-mismatch handling.
- **Goal:** determine how far `sync/lipsync-2-pro` can correct or reapply
  lipsync to an existing, already-good clip without degrading identity,
  teeth, eyes, expression, lighting, or overall naturalness — testing the
  model's central documented claim (*"only the mouth and local expressions
  are changed"*) against this project's own real footage for the first
  time, independent of the InfiniteTalk question entirely.
- **What the full frame-by-frame audit on the result should specifically
  check:** whether the "mouth + local expressions only" claim holds in
  practice on this project's specific face/lighting/framing (teeth and eyes
  are this project's top priorities and the least-documented risk area for
  this model per §4.4/§4.6), and whether any seam or mismatch appears at the
  edges of whatever region the model actually touches — a region whose
  precise boundary is, per §4.4, not documented by WaveSpeed either.

**Restated plainly, per the brief: do not run Experiment A and Experiment B
together, and do not chain their outputs, in this first round.** Each must
be validated (or invalidated) independently against its own baseline before
any combined or sequential use is considered — the same discipline Part 1.3
and the Conclusions section above already apply to the Extend→resync
hypothesis.
