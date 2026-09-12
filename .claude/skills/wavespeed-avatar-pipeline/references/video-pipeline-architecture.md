# Video pipeline architecture — validated system (2026-08-24)

**This file records a reusable system, not one example.** Everything below
that says "recreate this per video" must actually be recreated per video —
script, performance context, LTX prompt, voice takes. Everything that says
"locked asset" or "validated parameter" is fixed and should not be
regenerated or re-decided casually. Confusing the two is exactly the mistake
this file exists to prevent: an example prompt is not a rule, and a locked
asset is not a style to imitate on a new subject.

## Why this file exists

Real testing on 2026-08-23/24 found that generating the full performance
(motion + lipsync) in one `wavespeed-ai/ltx-2.3/lipsync` call — this
project's original method — carries real, recurring risk: progressive
framing/zoom drift within a generation, and an invented hand/object appearing
near the end of a clip, especially on chunked multi-part generations. A
controlled, single-variable test that separated the two jobs — LTX generates
the silent visual performance only, `sync/lipsync-2-pro` applies the selected
voice afterward — passed a full audit with no reservations: stable identity,
no framing drift, natural eyes/blinks, no invented hands, full script content
intact, no burned-in captions. That result is what this file locks in as the
default production pipeline. See `known-issues.md` for the original
single-step defects this replaces, and `video-tooling-landscape-research.md`
for the full research trail (including why `wavespeed-ai/infinitetalk` and
LongCat Avatar were tested and rejected — do not retry either in the normal
pipeline; both produced a less convincing result than this LTX→lipsync-2-pro
chain, on real generated evidence, not on paper).

**One real pass is one real data point, not a statistical guarantee.** Keep
the frame-by-frame audit habit alive for genuinely new situations (a new
location, a much longer script, a first attempt at something not covered
below) — see "How much to audit now" at the end of this file for what changed
and what didn't.

---

## A — Content preparation (recreate every video)

1. **Pick or receive the subject.** For factual/news content: verify the real
   facts before writing anything (real sources, real dates, real numbers —
   see `script-writing-protocol.md`'s research-pipeline-by-category section).
   Never invent a stat, a quote, or a result.
2. **Write a real, natural script** — hook varied per content (see
   `script-writing-protocol.md`'s hook-variety rule: not "Bon,"/"Alors," by
   default), oral register, no filler tics stacked for effect.
3. **Target duration is decided by content, not by habit** —
   `SCRIPT_DURATION_TARGET_SECONDS = (14, 50)` in `pipeline.py`, tiered by
   what the content actually needs (`script-writing-protocol.md`'s
   14-20s/20-35s/35-50s tiers). Never pad, never cut a real idea short to hit
   a number.

## B — Performance context (recreate every video, never reused mechanically)

Before writing anything that goes into an LTX prompt, answer
`video-performance-protocol.md`'s four questions **fresh, from this specific
script and this specific selected voice take**: physical context, state and
energy, visual behavior, forbidden movements. The answer determines gaze,
micro-expression, posture, and how (if at all) expression should evolve
across the clip. **A new script gets a new answer, every time** — see the
correction at the top of `video-performance-protocol.md` if this rule is
ever unclear in the moment.

## C — LTX prompt method (recreate every video — structure is fixed, content is not)

Structure (from `video-performance-protocol.md`'s 9-point method, unchanged):
one flowing narrative sentence built from the fresh context in step B —
what she's doing and why she's speaking, the energy/state that content
implies, translated into natural tendencies (not timestamped choreography),
positive and performance-oriented, minimal negation, no redescribing what the
locked image/scene already shows. Standing content requirements, restated
because they're the whole point: natural human movement, no artificial
choreography, no minute-by-minute gesture list, behavior that follows from
what's actually being said and felt, gaze mostly natural toward camera,
discrete/unscheduled variation, head/shoulder micro-movement coherent with
state, no invented gestures.

**What changes video to video:** the sentence's actual content (her state,
energy, what's implied about the moment). **What doesn't change:** the
method — narrative structure, restraint, no choreography, no redescribing the
locked scene.

---

## Validated production pipeline (the fixed system)

```
Locked source image (hash-verified)
        │
        ▼
Step 1 — wavespeed-ai/ltx-2.3/image-to-video
  performance/motion only, SILENT (no audio input/dependency)
        │
        ▼
Step 2 — sync/lipsync-2-pro
  applies the selected, already-STT-verified voice take
        │
        ▼
Final video
```

**Do not use `wavespeed-ai/infinitetalk` or LongCat Avatar in this pipeline.**
Both were tested for real and rejected on realism grounds — see
`video-tooling-landscape-research.md` (InfiniteTalk: documented full-body
motion regeneration read as more "AI-animated," not more restrained, on both
GitHub hands-on evidence and this project's own real test) and
`known-issues.md` (LongCat: "ressemble davantage à un avatar IA" on direct
comparison). Neither is the default; neither should be silently retried.

### Locked assets — verify, don't regenerate

- **Source image**: hash-verify with `shasum -a 256` against the value
  recorded in `known-issues.md`'s locked-image entry (and any newer entry, if
  a different scene/outfit ever gets locked the same way) before every real
  generation call — by hash, not filename, per
  `photo-direction-protocol.md`'s point 8.
- **Voice**: `VOICE_MODEL="minimax/speech-2.8-hd"`, `VOICE_ID="Shanon2026v1"`,
  per `pipeline.py` and `voice-generation-protocol.md`. The recipe is locked;
  the *text* is written fresh per video (section A above).

### Step 1 — `wavespeed-ai/ltx-2.3/image-to-video` (validated parameters)

- `image`: the locked source image URL (uploaded via `pipeline.upload_media`
  or the `upload` CLI command).
- `prompt`: built per section C above — fresh every video.
- `resolution`: `1080p` — validated in the real test; this endpoint documents
  480p/720p/1080p (unlike `infinitetalk`, which tops out at 720p).
- `duration`: integer 5-20s, set to match the selected voice take's real
  measured duration (so step 2 has minimal-to-nothing to trim — see below).
  If a script's real duration exceeds 20s, this becomes a genuinely new,
  not-yet-validated situation (this endpoint's own documented ceiling is
  20s) — don't silently chunk it the old way; treat it as worth a real check
  before assuming a method, the same discipline that produced this file.
- `seed`: fix a real integer for any repeat/comparison test; `-1` (random)
  is fine for a one-off real production video.
- The call will return its own self-generated placeholder audio (LTX-2.3 is
  an audio-video joint model) — **discard it**, it's never the real voice
  track. This is expected behavior, not a bug.

### Step 2 — `sync/lipsync-2-pro` (validated parameters)

- `video`: step 1's output, uploaded.
- `audio`: the selected, STT-verified voice take (the real mp3 from the
  voice-generation step, not step 1's placeholder audio).
- `sync_mode`: `cut_off` — the documented default and independently
  WaveSpeed's own stated recommendation "for most use cases"
  (`video-tooling-landscape-research.md` §4.1/§4.3). Never `loop`/`bounce`
  for a one-take real performance — no WaveSpeed source anywhere recommends
  either for this case, and repeating/reversing a human take is a real,
  obvious artifact risk.
- **Duration matching matters**: `cut_off` trims to the shorter of video/
  audio. Set step 1's `duration` to closely match the voice take's real
  length (measured via `pipeline._audio_duration_seconds`, not the pre-flight
  word-count estimate) so `cut_off` has effectively nothing to trim — this is
  what made the validated test clean; an untrimmed mismatch is untested.
- Documented preservation: "identity, lighting, background and facial
  structure... only the mouth and local expressions are changed." **Eyes and
  head-movement preservation are not explicitly documented one way or the
  other** (confirmed absent from every WaveSpeed source checked,
  `video-tooling-landscape-research.md` §4.4) — the real test's clean eyes
  are one good data point, not a standing guarantee; keep half an eye on this
  specifically on new content, without turning it into a blocking audit.

### Voice selection (unchanged, still the locked method)

Full method in `voice-generation-protocol.md`: write the script fresh →
pick `emotion` from the real confirmed enum → generate 2-3 independent takes
→ mandatory STT verify each (a same-digit-vs-word false positive on numbers
like "24"/"vingt-quatre" is a known, confirmed non-issue — see
`test_pipeline.py`'s pending fix task, judge those by ear if flagged) →
select the best take **by ear, on naturalness** (not by STT score, not by
duration) — this remains a human-judgment step; hand the takes to the user
for the pick, the same as every real video this project has produced.

---

## How much to audit now (changed, per explicit direction 2026-08-24)

**The experimentation phase is over for this specific chain.** Do not re-run
a full frame-by-frame audit after every intermediate generation as if
starting from zero — that discipline did its job (it's what validated this
pipeline in the first place) and continuing it on every routine production
video would block real output for no new information.

**What to still actually do, every video:**
- STT-verify every voice take (cheap, mandatory, unchanged).
- Glance at the final video before delivering it — obviously wrong things
  (a visible defect, a broken face, a missing chunk of audio) get caught and
  fixed; a full multi-crop frame-by-frame forensic pass does not run by
  default anymore for this validated chain.
- Verify the source image by hash before each generation call (cheap, fast,
  prevents a real recurrence of the earlier mislock incident).

**What escalates back to a real audit:** a genuinely new situation this
pipeline hasn't been checked against yet — a new location/outfit, a script
long enough to approach the 20s step-1 ceiling, a visibly-wrong result on the
quick look above. Fix the real cause found, the same evidence-first way this
whole file was produced — don't paper over a real defect to keep moving, and
don't invent a defect to keep auditing either.
