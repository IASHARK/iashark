# Known issues — read before assuming a bug is fixed

Dated so you can tell if a finding is stale. Newer entries can partially or fully
revise older ones.

## numpy/torch/opencv version conflict (pipeline dependencies)

- **2026-08-23:** `insightface` (identity-check, A.3) pulls in `opencv-python`,
  which on this machine installed a numpy 2.x build. `easyocr` (caption
  detection, E.19) pulls in `torch`, which was compiled against numpy 1.x and
  crashes at runtime ("Numpy is not available") under numpy 2.x. Both features
  are needed in the same process. Fix: pin `numpy<2` and `opencv-python==4.9.0.80`
  (an opencv-python build old enough to not require numpy 2) — see
  `../scripts/requirements.txt`. If either dependency's own requirements shift
  in a future reinstall, re-check this pairing before assuming a fresh
  `pip install -r requirements.txt` will just work.

## Caption hallucination on LTX-2.3/lipsync (video comes back with garbled English
text burned into every frame)

- **2026-08-22, early:** believed caused by the source photo having no visible
  teeth (model never "learned" the person's real teeth, hallucinates something).
  Fix: generate a reference photo with a genuine visible-teeth smile first (the
  "teeth trick") before lipsync. Confirmed 4/4 clean in a controlled test.
- **2026-08-22, later same night:** the bug came back — 1 failure out of 5 videos,
  same teeth-trick photo pipeline that had just gone 4/4. The failing clip's audio
  was 17.92s; the earlier clean batch used ~5.8s audio. **Revised conclusion: audio
  length above ~14-15s is a real contributing risk factor, but the bug is NOT fully
  deterministic and NOT fully fixed by the teeth trick alone.** Treat it as residual
  model variance to catch via frame verification, not a solved problem.
- **Standing rule:** always do the teeth trick AND keep audio under ~14s where
  possible AND extract the full frame grid before declaring a video done. Don't
  skip the frame check just because the last batch was clean — it doesn't predict
  the next one.

## Facial glitch on LTX-2.3/lipsync (gray/warped patch across forehead, briefly
discolored teeth, a few frames only)

- **2026-08-22:** seen once, same night as the caption bug's recurrence, on a
  different clip (16s audio) from the same batch. Not captions — a different
  failure mode, same model. Fix that worked: regenerate with a different `--seed`
  (default -1 for random); the retry was clean. No known trigger identified yet.

## Photo model comparison (identity-preserving edit, same source photo, same prompt)

- **`google/nano-banana-pro/edit`, early test (2026-08-22, 1 reference image, generic
  smile prompt, `resolution: "2k"`):** noticeably more airbrushed/CGI-looking skin
  than Seedream on an identical prompt. Also confirmed to mirror the entire image
  left-right at 2k — text on visor stickers and garment logos come out backwards.
  Root cause not identified; avoid 2k on this model unless retested.
- **`google/nano-banana-pro/edit`, re-tested 2026-08-23 with the full "real capture"
  protocol (all 6 identity refs, `resolution: "1k"`, explicit off-center/incidental
  framing + banal-light + no-visible-mount prompt) — result reversed the earlier
  verdict.** Won decisively against Seedream on perceived capture-realism (the
  actual goal, not generic "photo quality"). No mirroring observed at 1k with this
  prompt (no on-screen text/logo requested, so the earlier bug's trigger condition
  wasn't present — not proof the bug is fixed, just not exercised). **This is the
  locked source image for the current video work**, not just a comparison note:
  - File: `~/Desktop/Shanon avatar/output/2026-08-23/LOCKED-source-image/shanon_car_locked.jpg`
    (copy of `realism-test-5-nanobanana/candidate_raw_v3_facingforward.png` — **verify
    by SHA256 before trusting this note**: the wrong file — a Seedream image from an
    unrelated earlier test round — was mistakenly copied here once already on
    2026-08-23, and a full LTX-vs-LongCat video benchmark was run against it before
    the user caught the mismatch by eye. If in doubt, recompute the checksum and
    compare against `realism-test-5-nanobanana/candidate_raw_v3_facingforward.png`
    rather than trusting this filename alone.)
  - Model: `google/nano-banana-pro/edit`, `resolution: "1k"`, `aspect_ratio: "9:16"`
  - All 6 identity reference photos passed (not a single reference like the 2026-08-22 test)
  - No post-processing applied (raw model output)
  - Identity-check score, re-verified 2026-08-23 after the mislock was fixed: 0.78
    (no drift, comfortably above the 0.35 threshold)
  - Chosen over a "v4" variant (more negative space around her) specifically for
    camera geometry: v3's face-forward framing with a slight low-angle read as a
    physically plausible dashboard-mounted phone; v4's looser framing read as shot
    from the side, breaking the "phone facing her to talk" illusion.
  - Scene: car interior, camera implied by framing/angle only (no phone/mount/device
    visible anywhere in frame), slight natural off-center imperfection (not a
    centered "portrait" composition), plain/banal daylight (explicitly not
    cinematic, no beauty lighting, no rim light), natural un-retouched skin.
  - **`pipeline.py`'s `PHOTO_MODEL` constant still says `bytedance/seedream-v5.0-pro/edit`
    — deliberately NOT changed yet.** Switching the locked constant to nano-banana
    is a real pipeline change (different resolution enum, different prompt-building
    needs) that deserves its own TDD pass, not a rushed edit mid-video-benchmark.
    Until that happens, the CLI's `identity-photo`/`generate_photo` commands still
    produce Seedream output — the locked source image above was generated via a
    standalone script, not the CLI.
- **`bytedance/seedream-v4.5/edit`:** clearly better skin texture than nano-banana.
  No `resolution` enum — takes `width`/`height` in pixels, but they were observed
  to be silently ignored (model returned its own ~1760x2592 regardless of what was
  requested).
- **`bytedance/seedream-v5.0-pro/edit`:** best of the three for photorealistic skin
  texture (visible pores, natural oil sheen, sun/shadow behavior). Has a proper
  `resolution` enum (`1k`/`2k`/`4k`) — but **defaults to `1k` (784x1424) if you
  don't pass it explicitly**, which is below the "1k minimum, 2k preferred" bar.
  Always pass `resolution: "2k"`.
- **`wavespeed-ai/flux-kontext-max`:** failed outright (`code 1200: "Content
  flagged as potentially sensitive"`) on this exact photo/prompt pair that Seedream
  handled fine. Its content filter is stricter for this use case — don't retry with
  a softened prompt as a first move, just use Seedream.

## "Make it look more like a real amateur photo" — three approaches tried

Source photo was validated for identity but looked too polished/professional.

- **A — prompt-only fix** (add "RAW unprocessed", "candid iPhone snapshot", "not
  flawless", grain/noise keywords, regenerate through Seedream): identity held up
  well, but the visual difference from the original was subtle — didn't fully solve
  the "too polished" complaint on its own.
- **B — local deterministic post-process** (Gaussian blur 0.6, ±6 gaussian pixel
  noise, contrast/saturation pulled down ~6-8%, vignette, JPEG re-encode at q82):
  **identity is pixel-identical by construction** (it's a filter on the approved
  image, not a new generation) and produced a visibly more "real phone photo"
  texture. **This is the validated choice** — see `apply_realism_postprocess()` in
  `../scripts/pipeline.py`.
- **C — re-run through another WaveSpeed model** (`wavespeed-ai/z-image-turbo/image-to-image`,
  prompted to "add grain"): **identity drifted to a visibly different-looking
  person** in the one test done, and resolution dropped to 576x1024 unrequested.
  Do not use a second generative pass for this — any regeneration risks identity
  drift, however small the prompt change looks.

## Voice: a `pitch` parameter is not part of the locked recipe

- **2026-08-22:** added `pitch: 2` (with `emotion: "surprised"`, `speed: 1.15`) to
  try to make a voice sound "more dynamic". The user immediately flagged the
  result as "not my voice at all" — a real, audible timbre shift, not a subjective
  complaint. Removing `pitch` entirely (keeping only `emotion` + `speed` inside the
  documented `1.1-1.15` range) restored the expected voice. **Only `emotion` and
  `speed` are validated dynamism knobs — do not add `pitch` (or any other
  undocumented param) to "improve" a voice without flagging it to the user first
  and treating the result as unverified until they confirm it still sounds right.**

## Pronunciation fixes found via mandatory STT check

- "Paixão" → came out as "Passons" → fixed via respelling "Paichão".
- "Wahi" → came out as "Eliyahu" → fixed by using surname alone.
- "Liga" (as in "la Liga") → came out as "Ligue un" when written bare → fixed by
  writing "la Liga" (the article disambiguates it from a truncation of "Ligue 1").
- "deux buts d'écart" repeatedly lost the word "deux" in a handicap phrase → fixed
  by rewording ("Inter, deux buts d'avance, direct") rather than respelling —
  sometimes the fix is restructuring the sentence, not respelling the one word.
- "Espanyol" reads phonetically close to the French word "Espagnol" — this is
  inherent to the name (Catalan pronunciation), not a bug; don't chase a "fix" for
  it.

General rule confirmed multiple times: test a suspect word embedded in the full
sentence, not in isolation — STT on an isolated word gives misleading results.

## Run #1 — first real end-to-end `full-video` execution (2026-08-23)

The very first real run of `pipeline.py full-video` against the live APIs, after
weeks of the pipeline existing only as code + unit tests. Slug
`pipeline-integration-test-1`, scene `car`, a short neutral 44-word test text (no
prono, no stats — pure infra test, not meant to be published).

**Two real technical bugs found, both fixed same day — see the code + tests for
detail, this entry is the "what/why" record:**
- `check_script`'s pre-flight duration estimate (`FRENCH_WORDS_PER_SECOND=2.6`)
  said ~16.9s; the real generated `voice.mp3` measured 10.55s (38% off, real rate
  ~4.17 words/sec at speed 1.1 — but this is a single sample, NOT treated as a
  recalibrated constant). The gap wasn't caught until the very last pipeline step
  (`format_check`), after the most expensive step (video generation) had already
  run. Fixed by adding a real-duration gate right after `generate_voice`, before
  video generation — `check_generated_voice_duration()`.
- The video came back at 1024×1920 for a "1080p" request, not 1080×1920 (5.19%
  off literal 9:16). Investigated (WaveSpeed's own docs for
  `wavespeed-ai/ltx-2.3/lipsync` name 480p/720p/1080p only as price/quality tiers,
  never promise exact pixel dimensions) — no evidence of a request-side mistake.
  Likely normal model behavior for this tier, not confirmed with certainty (one
  real sample, no first-party spec found). `check_video_format`'s aspect
  tolerance widened from 3% to 6% specifically to cover this real measurement
  plus a small margin — **treat 6% as provisional, not a confirmed spec of the
  model**, revisit if a future real run shows a different width at the same tier.

**Baseline qualitative observations (human review of run #1's actual video,
2026-08-23) — recorded as-is, NOT yet acted on.** Per the user's explicit rule:
any future attempt to improve these follows BASELINE → one variable changed →
comparison → decision, never folded in on a hypothesis. Do not touch either of
these without that process:
- **Photo/identity realism** — the generated photo of Shanon reads as
  noticeably synthetic/AI-looking to the human eye, despite passing the
  automated identity-similarity check (0.78, well above the 0.35 threshold).
  The automated check verifies *identity match*, not *photorealism* — the two
  are different questions and this run makes that distinction concrete, not
  theoretical.
- **Audio naturalness** — the generated voice lacks natural micro-pauses
  between some sentences/ideas; it reads as slightly too continuous/flat in
  its pacing compared to real speech.
  **Update 2026-08-23, addressed, not fully closed**: extensive real A/B testing
  (interjection tags, punctuation/text restructuring, `emotion` values, `speed`)
  found that **text formulation matters far more than any API parameter** —
  rewriting the script in a genuinely conversational, spoken register (short
  discourse markers used sparingly, varied sentence length, oral vocabulary
  like "prono" over "pronostic") produced a clearly perceptible improvement;
  no single parameter tweak did. Full parameter surface for
  `minimax/speech-2.8-hd` confirmed exhaustively (see below) — nothing hidden
  remains to search for.

## Voice generation — locked recipe and real parameter surface (2026-08-23)

**Locked, unchanged from `pipeline.py`**: `VOICE_MODEL="minimax/speech-2.8-hd"`,
`VOICE_ID="Shanon2026v1"`, `speed=1.1` (within the validated `VOICE_SPEED_RANGE`
1.1-1.15), `language_boost="French"`, `sample_rate=44100`, `pitch` forbidden
(confirmed identity-breaking, do not use — see the original pitch entry above).

**Confirmed via the live API's own error message (2026-08-23), not just docs**:
the only valid `emotion` values on this exact endpoint are `happy, sad, angry,
fearful, disgusted, surprised, neutral` — `calm` and `fluent`/`whisper` do NOT
exist on speech-2.8-hd (they appear in some third-party docs for the 2.6 family
only; the live 2.8-hd endpoint rejects `calm` outright). Of the 7 real values,
only `happy` and `neutral` fit Shanon's content register — `happy` tested
better in every real A/B run this session.

**Full parameter surface confirmed exhaustively** (WaveSpeed + MiniMax platform
docs, cross-checked): `text` (supports inline `<#x#>` pause tags 0.01-99.99s,
and 22 documented interjection tags like `(breath)`/`(sighs)` — MiniMax's own
guidance: use sparingly, only where they support meaning, avoid stacking),
`voice_id`, `speed`, `volume`, `pitch` (forbidden), `sample_rate`, `bitrate`,
`channel`, `format`, `emotion`, `pronunciation_dict`, `language_boost`,
`english_normalization`. **Explicitly does NOT exist**: any per-phrase/per-segment
emotion control within one call, any "style"/"tone"/"expressiveness" parameter,
any SSML-equivalent markup beyond the pause/interjection tags. Splitting text
into multiple generation calls (one per desired emotion) to work around the
single-global-emotion limit was considered — **already tested and rejected
earlier in this project**: audible seams between separately-generated segments,
flattens the result. Don't retry this despite it being WaveSpeed's own generic
"split long text" suggestion — our own real test overrides that generic advice.
`voice_modify` (pitch/intensity/timbre) and `timbre_weights` (voice blending)
exist on the wider MiniMax platform API but are identity-risk by definition —
same category as the forbidden `pitch`, never use them on Shanon's clone.

**Production method adopted, not just a one-off finding**: voice generation has
real take-to-take variance even with byte-identical text and parameters
(confirmed: 3 independent generations of the same text produced 7, 13, and 10
internal pauses respectively). The standing method going forward is: **generate
2-3 identical takes per final script, select the best by ear** — naturalness is
the deciding criterion, never STT score, duration, or pause count (all of which
can pass cleanly on a take that still sounds flat). This replaces chasing a
single "perfect" parameter set. Full method: `references/voice-generation-protocol.md`.

## LTX vs LongCat video benchmark — INVALID, do not cite (2026-08-23)

**The first LTX-2.3-lipsync vs `wavespeed-ai/longcat-avatar` comparison run
this session used the wrong source image** — a Seedream file from an earlier,
unrelated test round (`realism-test-3-geometry-fix/candidate_raw.jpg`) had
been mistakenly copied into `LOCKED-source-image/shanon_car_locked.jpg`
instead of the actually-chosen nano-banana v3
(`realism-test-5-nanobanana/candidate_raw_v3_facingforward.png`). The mistake
was caught by the user visually recognizing the wrong image, not by any
automated check. **Both generated videos and the full frame-by-frame audit
from that run are invalid as evidence about LTX vs LongCat with the real
locked configuration — do not treat that comparison as settled.** The image
was re-locked and hash-verified afterward; see the locked-image entry above.
**Standing rule going forward**: verify the source image by SHA256
immediately before every video generation call, not just once at lock time —
see `photo-direction-protocol.md`'s capture-realism method, point 8.
