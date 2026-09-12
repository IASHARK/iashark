# Post-production repair research: can a localized defect be fixed without full regeneration?

Added 2026-08-23, triggered by a real finding: a frame-by-frame audit of a 27.9s
test generation (3 LTX chunks concatenated) found one confirmed defect — a
small fingertip/fingernail appears and stays visible for roughly the last 2
seconds of the final chunk, resting on the steering wheel, not present in the
locked source image. Everything else (identity, framing, eyes, teeth,
mouth/lipsync, lighting, color, hair, background, both chunk-boundary seams)
audited clean. This is the target case for this research: a minor,
time-localized (a few seconds out of ~28s) and space-localized (lower-frame,
hand/fingertip) defect on an otherwise-clean result.

**The question:** does a real, currently-available tool exist that can
surgically repair a defect like this — mask a region + time range, regenerate
only that — without touching the identity, lipsync, and everything-else that
already passed audit? Or is "video editing AI" in practice always closer to
"regenerate the whole clip and hope nothing else moved," which would defeat
the purpose and just be a slower, riskier version of a full re-run?

**Method note:** every claim below is tagged **documented** (traced to an
official vendor doc/product page, cited inline) or **unclear/unverified**
(not found in a primary source, explicitly flagged as such). Marketing
adjectives ("seamless," "photorealistic," "state of the art") are not treated
as evidence anywhere in this document. Several official pages returned only
navigation shells to the fetch tool (JS-rendered) and had to be re-fetched
through a rendered browser or cross-checked against search-engine snippets of
the same official domain — noted per source where that happened.

---

## Category A — classic restoration/enhancement tools

### Topaz Video AI

**Documented feature set** (topazlabs.com/topaz-video, topazlabs.com/video-pro,
topazlabs.com/tools/video-upscale, topazlabs.com/tools/video-denoiser):
upscaling (to 4K/8K), denoising (Nyx/Nyx XL/Artemis models — separating noise
from texture), deinterlacing, frame interpolation/slow-motion, stabilization,
SDR-to-HDR conversion, and compression-artifact cleanup (blockiness, mosquito
noise, chroma noise) via per-clip denoise/detail/sharpen/dehalo controls.

**Verdict: not applicable to this defect.** Topaz's entire documented feature
set is signal-level processing — every model name and feature description
found (Starlight, Proteus, Iris, Nyx, Rhea, Artemis, Gaia, Theia, Apollo,
Chronos, Aion, Themis) maps to upscale/denoise/interpolate/stabilize/deinterlace,
never to semantic content editing. **No object-removal, inpainting, or
"remove this thing from the frame" capability is documented anywhere in
Topaz's own materials.** This confirms the premise in the research brief:
classic restoration tools are not a candidate category for this defect at
all, regardless of how good their signal-level processing is. Don't route
this problem to Topaz or an equivalent (DaVinci Resolve Neural Engine,
similar) — check their docs before assuming otherwise, but nothing found
here suggests any of them do content removal.

---

## Category B — generative video editing / inpainting tools

Seven real, findable 2026 candidates were checked against official docs. Two
patterns emerged immediately and matter more than any single tool's spec
sheet:

1. **Almost none of these tools expose a spatial+temporal mask as a first-class
   API parameter.** Most take a whole video + a text prompt and let the model
   decide what "the thing described" is and where it is — which means the
   model reprocesses the *entire* clip, not just the defect region. That is
   exactly the failure mode the user wants to avoid: it puts the
   already-validated identity, lipsync, and everything else back at risk to
   fix two seconds of hand.
2. **None of the seven documents an explicit mouth/lipsync-protection
   mechanism**, and none documents an explicit face-identity-lock mechanism
   for this specific edit-in-place use case (as opposed to generation from a
   reference image, which is a different feature most of these vendors do
   have for *generation*, not for *editing an existing clip*).

### B.1 — WaveSpeed VOID Video Inpainting (`wavespeed-ai/void-video-inpainting/mask`)

Source: wavespeed.ai/models/wavespeed-ai/void-video-inpainting/mask (model
page) and wavespeed.ai/blog/posts/introducing-wavespeed-ai-void-video-inpainting-mask-on-wavespeedai/
(vendor blog).

- **True localized correction — the strongest candidate found, with a caveat.**
  The mask input (`mask_video`) is itself a *video*, not a single region: it
  supports a 4-value "quadmask" (0 = remove, 63 = overlap, 127 = affected
  area, 255 = keep) per frame, or a simple binary mask, or an auto-generated
  mask from a text description (`mask_prompt`) / SAM-3 bounding-box or
  click-prompt. Because the mask is per-frame, it is **structurally capable**
  of encoding both a spatial region (the hand/fingertip area) and a time
  range (only the last ~2s) — a mask video that is all-"keep" for the first
  ~26s and only opens a removal region in the last 2s is exactly what the
  parameter shape allows. **This is an inference from the documented
  parameter design, not a documented worked example of "edit only 2 seconds
  of a longer clip" — no such example was found on the vendor's page**, so
  treat it as plausible-per-the-spec rather than vendor-confirmed until
  tested.
  - `num_frames` (documented range 69–197, default 85) / `temporal_window_size`
    (named differently between the model page and the blog post — **the two
    official-source summaries disagree on the exact parameter name; verify
    against the live API schema before use, don't trust either name blind**)
    governs how many frames the model reasons over at once for motion
    coherence — this is not the same thing as a start/end time-range
    selector, and conflating the two would be a mistake.
- **Temporal coherence:** documented. `enable_pass2_refinement` is an
  optional second pass described as "sharpen[ing] temporal consistency —
  dramatically reducing flicker on difficult shots," at roughly double the
  base cost.
- **Face identity preservation:** **not documented.** No mechanism for
  locking or protecting a specific person's face/identity was found on
  either source page. One listed use case ("privacy and compliance... remove
  identifying marks, faces, or license plates") shows the model *can* alter
  faces, which is a risk signal, not a safeguard.
- **Lipsync preservation:** **not documented.** No mouth-region protection
  parameter found. If the mask is correctly scoped to only the
  fingertip/steering-wheel region in the last 2s (see above), the mouth
  would never enter the edited region at all — but that protection would
  come entirely from how carefully the mask is authored, not from any
  tool-side safeguard.
- **API accessibility: documented and directly compatible with the existing
  pipeline.** `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/void-video-inpainting/mask`,
  Bearer-token auth — the exact same `API_BASE` (`https://api.wavespeed.ai/api/v3`)
  and Bearer-auth pattern `pipeline.py` already uses for LTX/Seedream/MiniMax
  calls (see `API_BASE` at `scripts/pipeline.py:34` and the `Authorization`
  header construction at `scripts/pipeline.py:249-257`). Pricing $0.05–$0.15
  per run depending on options; median ~222s generation time.

### B.2 — Bria Video Eraser (`bria/video-eraser/prompt`, on WaveSpeed)

Source: wavespeed.ai/models/bria/video-eraser/prompt.

- **True localized correction:** **no.** Targeting is prompt-only ("cup",
  "person on the right") over the whole clip — no mask, no region, no
  time-range parameter documented. The model decides what matches the prompt
  across the entire video.
- **Temporal coherence:** loosely documented ("tracks targets across frames
  and reconstructs clean, temporally consistent backgrounds") with no
  technical mechanism disclosed.
- **Face identity / lipsync preservation:** **not documented** at all.
- **API accessibility:** documented, same WaveSpeed API base/auth as B.1.
  Duration-based pricing ($0.05/s up to $30 at 600s cap); median ~56s.
- **Verdict:** simpler and cheaper than VOID, but the lack of any spatial
  mask makes it a worse fit here — a prompt like "remove the fingertip" has
  no guarantee of leaving the rest of the frame (including the mouth)
  untouched, and no documented safeguard says otherwise.

### B.3 — Kling Video O1 "Video-Edit" (native and via WaveSpeed)

Sources: wavespeed.ai/docs/docs-api/kwaivgi/kwaivgi-kling-video-o1-video-edit-fast
(WaveSpeed's docs for the same underlying Kuaishou model); klingapi.com/docs
and app.klingai.com quickstart pages (native Kling docs; the quickstart page
itself returned an HTTP error to the fetch tool and could not be directly
read — treat native-Kling specifics below as **partially unverified**,
resting on the WaveSpeed integrator's documentation of the same model plus
search-indexed summaries of Kling's own marketing/help pages, not a
directly-read Kling first-party doc).

- **True localized correction: no, by design.** The documented workflow is
  explicitly whole-clip + natural-language prompt ("remove bystanders",
  "remove the pedestrians from the background") with **no masking, no
  tracking, no keyframing** — this is stated as a *feature* (conversational
  editing, no manual mask needed) but it is precisely the opposite of
  surgical localization. WaveSpeed's own parameter list for this endpoint
  (`prompt`, `video`, `images` [0-4 reference images], `keep_original_sound`,
  `aspect_ratio`) has no mask or region field. The documented mechanism is
  "pixel-level semantic reconstruction" — reads as full-frame regeneration
  guided by the prompt, not a masked patch.
- **Temporal coherence / identity / lipsync:** **not documented** on either
  source checked.
- **API accessibility:** documented via WaveSpeed (same base/auth as B.1/B.2,
  $0.09/s, 6–20s duration billing window) and via Kling's own API
  (klingapi.com/docs, official Python/Node/Java SDKs) — real and shipped,
  not roadmap.
- **Verdict:** disqualified on the single most important criterion for this
  use case (true localized correction) by the vendor's own description of
  how the feature works, independent of any of the other four criteria.

### B.4 — Runway Aleph 2.0 (`aleph2`, video-to-video)

Sources: runway.com/research/introducing-runway-aleph (official announcement
page — high-level, not a parameter spec); docs.dev.runwayml.com/assets/inputs/
(official Runway developer docs — directly fetched, confirms duration/FPS/
resolution constraints, does **not** list a mask parameter for Aleph anywhere
on the page); parameter names below are corroborated by third-party API
integrators reflecting the same underlying schema (Runware, useapi.net,
CometAPI) since the specific Aleph parameter-reference sub-page could not be
directly rendered by the fetch tool — **treat the exact parameter list as
integrator-corroborated, not a direct quote of Runway's own reference page.**

- **Documented capability, high level (official):** "a wide range of edits on
  an input video such as adding, removing, and transforming objects,
  generating any angle of a scene, and modifying style and lighting,"
  described as keeping "the rest of the clip stable." No technical mechanism
  for *how* the rest of the clip stays stable is documented on the official
  announcement page.
- **True localized correction:** the official developer-docs page
  (docs.dev.runwayml.com/assets/inputs/) that does list real Aleph
  constraints (2–30s input, ≤1080p, preserves input resolution, 30fps max)
  **does not list a mask, region, or frame-range parameter anywhere.** The
  integrator-reflected parameter set (`promptText`, `videoUri`, `ratio`,
  `references` [tagged reference images], `seed`, content-moderation
  settings) has no mask field either. **Conclusion: Aleph 2.0's real API
  surface, as documented, is whole-clip + text-prompt + optional reference
  images — not masked/localized editing**, despite "removing objects" being
  in the marketing description. This is exactly the "editing means
  re-rendering the whole clip" failure mode the research brief asked to
  check for.
- **Temporal coherence:** only the vague official claim above; no mechanism
  documented.
- **Face identity / lipsync preservation:** **not documented** for this
  edit-in-place use case.
- **API accessibility:** documented, real, shipped (`docs.dev.runwayml.com`,
  official SDK/API, "available for all paid users" per the announcement
  page). Note: the original (non-2.0) Aleph model is documented as being
  deprecated/deactivated July 30, 2026 — Aleph 2.0 is the current model.

### B.5 — Google Veo object removal (Vertex AI / Gemini Enterprise Agent Platform)

Source: docs.cloud.google.com/vertex-ai/generative-ai/docs/video/remove-objects-from-videos
(official Google Cloud documentation; the fetch tool initially returned only
a navigation shell for this JS-rendered page — content below was obtained by
rendering it in a real browser and reading the page text directly, French
locale as served, translated in this summary).

- **Documented mechanism:** provide a mask (image) + the source video +
  a text prompt describing the desired result; request body fields
  documented via Google's own API reference (`VideoGenerationModelInstance`)
  include `prompt`, `mask.gcsUri`/`mask.mimeType`, `maskMode: "remove"`,
  `video.gcsUri`/`video.mimeType`, plus output controls (`storageUri`,
  `sampleCount`).
- **Critical documented limitation — model support:** this capability is
  **only listed as supported on `veo-2.0-generate-001`, `veo-2.0-generate-exp`
  (preview), and `veo-2.0-generate-preview` (preview)** on the page fetched.
  **Veo 3 / Veo 3.1 are not listed as supporting object removal on this
  page.** If the production pipeline or any comparison work is thinking of
  "Veo" as a single current-generation tool, this is the single most
  important finding in this whole document for that assumption: object
  removal is tied to the *older* Veo 2.0 model family, not the current
  flagship.
  What "Veo 3" and "Veo 3.1" *are* documented as supporting elsewhere is
  different: outpainting, scene/clip extension, frame-to-frame
  interpolation, image-guided generation — not masked object removal, per
  the pages surfaced for those model versions.
- **Documented status: Pre-GA.** The page explicitly states this feature is
  covered by "Pre-GA Offerings Terms" — available "as is," with "limited
  compatibility." Google's own launch-stage framing, not a vendor-neutral
  paraphrase.
- **Time-range targeting:** the documented mechanism is "the image mask is
  used to determine an object in the first video frame to track, and this
  object is removed from the video" — i.e., the mask identifies the object
  once (on the first frame) and the model tracks/removes it for the
  **entire** video, not a delimited time window. There is no documented way
  to say "only remove this in the last 2 seconds" — if the object needs
  removing for only part of the clip, that is not what this feature is built
  for.
- **Face identity / lipsync preservation:** **not documented** anywhere on
  the page found.
- **API accessibility:** real, documented, but Vertex AI / Google Cloud
  infrastructure (GCS URIs for input/output, Google Cloud project + IAM
  setup, "preview" API surface) — a materially heavier integration lift than
  a WaveSpeed REST call with a Bearer token, and disconnected from the
  models the pipeline already validated identity/skin-texture against.

### B.6 — Luma Ray "Modify Video" (`ray-2` / `ray-flash-2`)

Source: docs.lumalabs.ai/docs/modify-video (official Luma developer docs,
directly fetched).

- **Documented capability:** whole-clip video-to-video with three adherence
  tiers (Adhere / Flex / Reimagine, 3 intensity levels each) controlling how
  closely the output tracks the source. Notably, the docs specifically claim
  preservation of "full-body motion and facial performance, including
  choreography, lip sync, and nuanced expression" — **this is the only
  candidate found with an explicit, documented lipsync-preservation claim**,
  worth flagging even though the rest of its profile disqualifies it below.
- **True localized correction: no.** Parameters are `prompt`, `media.url`,
  optional `first_frame.url`, `mode`, `model` — no mask, no region, no
  frame-range field documented. This is whole-clip regeneration at a chosen
  adherence level, not a masked patch.
- **Hard disqualifier — duration:** documented max duration is **10s
  (ray-2) or 15s (ray-flash-2)**. The defect is in the last ~2s of a 27.9s,
  3-chunk clip; Modify Video could not even ingest the full clip in one call,
  and applying it per-chunk would mean regenerating an entire ~9-10s chunk
  (all of it already-validated) to fix 2 seconds — the opposite of surgical.
- **Face identity preservation:** not separately documented beyond the
  "facial performance" claim above, which is about motion/expression
  fidelity, not identity-lock against drift.
- **API accessibility:** documented, real, shipped (`lumalabs.ai/api`,
  official REST API, per-megapixel pricing).

### B.7 — Adobe Firefly / Premiere generative video tools

Sources: helpx.adobe.com generative-remove pages (official, image editing
only); developer.adobe.com/firefly-services/docs (official API docs index);
search-indexed references to a video "generative remove" tool (including a
vendor Instagram post, not an official doc).

- **Generative Remove for images: documented and shipped**, including an
  on-device (~4GB local model) version added 2026, auto-detection of
  signs/poles/trash — but this is the **image** editor, not video.
- **Generative Remove for video: not confirmed shipped as of this research.**
  The only reference found to an Adobe video object-removal tool was a
  vendor social-media post, not an official Adobe help page or API doc.
  Adobe's own Firefly Video Model documentation (Generative Extend,
  Image-to-Video, Text-to-Video) does not list object removal as a shipped
  video feature on the pages checked. **Explicitly unclear/unverified — do
  not treat this as available.** If it matters for a future decision, check
  developer.adobe.com/firefly-services/docs directly before assuming it
  exists.
- **API accessibility:** Firefly Services does have a real API
  (developer.adobe.com/firefly-services/docs/firefly-api/) with AI
  dubbing/lipsync in beta for enterprise — but nothing found there covers
  masked object removal on an existing video.

### B.8 — Pika Labs (Pikaswaps / inpainting)

Source: search-indexed vendor/reseller pages only; no official Pika API
reference page was directly fetched.

- Vendor pages describe masking/erasing/replacing via "Pikaswaps," but
  **Pika's own public API is described (by search-indexed summaries) as "in
  active development" / selective partnerships**, not generally available.
  Third-party platforms (fal.ai) expose some Pika models, but not confirmed
  to include the masked-inpainting feature specifically.
- **Verdict: too unverified to include as a real candidate.** No official,
  directly-read documentation confirms a shipped, generally-available,
  masked video-editing API for Pika at the time of this research. Flagged
  here only so it isn't silently missing from the survey.

---

## Cross-cutting comparison (documented facts only)

| Tool | True localized (mask+time) correction | Identity-lock documented | Lipsync/mouth protection documented | Temporal-coherence mechanism documented | Real API (not UI-only) |
|---|---|---|---|---|---|
| Topaz Video AI | N/A — no content-removal capability at all | N/A | N/A | N/A (signal-level only) | No (desktop app) |
| WaveSpeed VOID Video Inpainting | Structurally possible via per-frame mask video; **not a documented worked example** | No | No | Yes (`Pass 2 refinement`) | **Yes — same WaveSpeed API/auth the pipeline already uses** |
| Bria Video Eraser | No (prompt-only, whole clip) | No | No | Vague claim, no mechanism | Yes (WaveSpeed) |
| Kling Video O1 Video-Edit | **No, explicitly by design** ("no masking, no tracking") | No | No | No | Yes (WaveSpeed + native Kling) |
| Runway Aleph 2.0 | **No** — documented API params have no mask field | No | No | No | Yes (official Runway API) |
| Google Veo object removal | Spatial mask yes; time-range no (object removed for whole video once tracked) | No | No | No | Yes, but Vertex AI-only, Pre-GA, **Veo 2.0 family only — not Veo 3/3.1** |
| Luma Ray Modify Video | No (whole-clip, adherence-tier based) | No | **Only tool with an explicit lipsync-preservation claim** | Implied by adherence tiers, not detailed | Yes, but 10-15s max duration (clip is 27.9s) |
| Adobe Firefly (video) | Unverified — not confirmed shipped for video | Unverified | Unverified | Unverified | Unverified for this feature |
| Pika Labs | Unverified — API not confirmed GA | Unverified | Unverified | Unverified | Unverified |

No candidate satisfies all five criteria as documented. The closest technical
fit on paper (VOID's per-frame mask) rests on an inference about how the
`mask_video` parameter *could* be used, not a vendor-confirmed workflow for
this exact scenario — and even it has zero documented identity or
lipsync-protection mechanism.

---

## Proposed method

**1. Audit (already the standing practice — see `known-issues.md` and
`video-performance-protocol.md`).** Full frame-by-frame audit on every real
generation, regardless of prompt quality, is non-negotiable and stays that
way independent of anything in this document.

**2. Classify every finding, every time, before deciding what to do about it:**

- **Major defect or drift** — identity drift, lipsync break, facial
  geometry/skin-tone drift, light/color instability, caption hallucination,
  anything affecting more than a few localized seconds or touching the face/
  mouth region: **mandatory full regeneration. Never attempt a repair tool
  on these.** Nothing surveyed here documents a reliable way to touch a
  region without risking the face or the lipsync — that's the core finding
  of this research, not just a caveat.
- **Minor + localized** (this fingertip case: a few seconds, lower-frame,
  hand/object only, nowhere near the face or mouth) — candidate for a repair
  attempt, but only under the conditions below.

**3. If a candidate repair is attempted, treat it as an unvalidated
experiment, not a production step**, matching this project's standing
single-variable-methodology rule: baseline the current clip, apply exactly
one candidate tool with a tightly-scoped mask/prompt, run the **full**
frame-by-frame audit again on the repaired output (not just the previously
broken region — the repair tool could introduce a new defect elsewhere,
which is precisely the risk this whole research is about), and compare
against the baseline before deciding whether the repair is actually safe to
adopt. A repair that "looks fixed" without a full re-audit is not evidence
of anything.

**4. Concrete tool recommendation, stated honestly:**

**No candidate found here can be recommended with confidence for this
exact use case** (an identified real person's face, with lipsync already
locked and validated) **on the basis of documented identity-lock or
lipsync-protection guarantees — because none of the seven tools document
either.** That is a genuine gap in what's currently shipped, not a failure
of this research to find the right tool.

If a repair is going to be tried anyway despite that gap, **WaveSpeed VOID
Video Inpainting is the least-bad candidate to test first**, for reasons
that are all about fit, not about any safety guarantee:
- it is the only candidate whose mask mechanism is *structurally* capable of
  being scoped to both the correct few seconds and the correct spatial
  region (the fingertip/steering-wheel area), keeping the mask away from the
  mouth entirely by construction of the mask video itself;
- it is reachable through the exact API base and auth pattern `pipeline.py`
  already uses (`https://api.wavespeed.ai/api/v3/...`, Bearer token), so it
  costs nothing in new integration surface to test;
- it is cheap to trial ($0.05–$0.15) relative to a full LTX regeneration.

This is a recommendation to **test as a single-variable experiment under the
method above**, not a recommendation to adopt. If the post-repair full audit
shows any new defect anywhere in the clip — face, teeth, lighting, either
chunk seam, anything — the honest conclusion given everything above is that
no current tool reliably does this, and full regeneration is the correct
fallback for this specific fingertip finding too, not just for major
defects.

---

## Sources

- Topaz Labs product pages: topazlabs.com/topaz-video, topazlabs.com/video-pro,
  topazlabs.com/tools/video-upscale, topazlabs.com/tools/video-denoiser
- WaveSpeed: wavespeed.ai/models/wavespeed-ai/void-video-inpainting/mask,
  wavespeed.ai/blog/posts/introducing-wavespeed-ai-void-video-inpainting-mask-on-wavespeedai/,
  wavespeed.ai/models/bria/video-eraser/prompt,
  wavespeed.ai/docs/docs-api/kwaivgi/kwaivgi-kling-video-o1-video-edit-fast
- Kling: klingapi.com/docs (native API reference, search-indexed, not
  directly fetched), app.klingai.com quickstart (fetch failed, HTTP 446)
- Runway: runway.com/research/introducing-runway-aleph,
  docs.dev.runwayml.com/assets/inputs/ (official, directly fetched);
  integrator-reflected parameter schema via Runware/useapi.net/CometAPI docs
  (not Runway first-party, flagged as such above)
- Google Cloud / Vertex AI: docs.cloud.google.com/vertex-ai/generative-ai/docs/video/remove-objects-from-videos
  (official, rendered via browser after initial fetch returned a nav shell
  only), docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/Shared.Types/VideoGenerationModelInstance
- Luma: docs.lumalabs.ai/docs/modify-video (official, directly fetched),
  lumalabs.ai/api
- Adobe: helpx.adobe.com/firefly/web/work-with-images/edit-images/generative-remove.html,
  developer.adobe.com/firefly-services/docs/firefly-api/
- Pika: search-indexed reseller/vendor summaries only — no official API
  reference found and directly read; treat all Pika claims above as the
  weakest-sourced in this document
- Pipeline's existing WaveSpeed integration for cross-reference:
  `scripts/pipeline.py:34` (`API_BASE`), `scripts/pipeline.py:249-257`
  (Bearer-auth request pattern)
