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

- **`google/nano-banana-pro/edit`:** noticeably more airbrushed/CGI-looking skin
  than Seedream on an identical prompt. Also confirmed to mirror the entire image
  left-right when generating at `resolution: "2k"` — text on visor stickers and
  garment logos come out backwards. Root cause not identified; avoid 2k on this
  model, or avoid the model for this use case entirely.
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
