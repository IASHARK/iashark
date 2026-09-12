# Voice generation protocol for Shanon

Same idea as `photo-direction-protocol.md`: the result that finally worked
came from a *method*, not from a single locked parameter set. Recording only
"`emotion=happy`, `speed=1.1`" loses the method — this file is the method.
Apply it for every new script, not just the one it was built on.

## Locked recipe (unchanged, verify against `pipeline.py` constants)

`VOICE_MODEL="minimax/speech-2.8-hd"`, `VOICE_ID="Shanon2026v1"` (a real voice
clone, not a preset voice), `speed` within `VOICE_SPEED_RANGE` (1.1-1.15),
`language_boost="French"`, `sample_rate=44100`. `pitch` is forbidden —
confirmed identity-breaking earlier in the project, do not use it or the
wider MiniMax platform's `voice_modify`/`timbre_weights` (same risk category:
they alter vocal character, not just performance).

## The method, in order

1. **Write a genuinely conversational, situational script — not prose that
   happens to have commas added.** The single biggest lever found this
   session: real A/B testing across interjection tags, pause tags, `emotion`
   values, and `speed` all moved the needle less than rewriting the text
   itself in spoken register. Concretely: short discourse markers used
   *sparingly* (one, not stacked — "Bon," alone, not "Bon," + "hein" + "en
   fait" + "Et voilà." all in one short script, which reads as performed
   spontaneity rather than the real thing), oral vocabulary over written
   vocabulary ("prono" not "pronostic"), varied sentence length, a situation
   actually happening ("I just got out of training, zero energy") rather
   than announcement-register content ("today's forecast is..."). **Correction
   2026-08-23: "Bon," here was one example marker from one test, not a
   default opener.** It became a repeated tic across scripts instead of one
   option among several — see `script-writing-protocol.md`'s hook-variety
   rule for the actual list of openings to choose from per content, and pick
   a discourse marker (if any) the same way: per script, not by default.
2. **Pick `emotion` for register fit, then stop searching for a better one
   per-script by intuition — verify against the real enum first.** Confirmed
   via the live API's own rejection error, not third-party docs: the only
   valid values on `speech-2.8-hd` are `happy, sad, angry, fearful, disgusted,
   surprised, neutral`. (`calm`, `fluent`, `whisper` exist on other MiniMax
   models, not this one — don't retry them here.) Of the 7, only whichever
   ones plausibly fit Shanon's content register are candidates — most won't.
   `happy` beat `neutral` in every real A/B this session; re-test per script
   only if the content's emotional register genuinely differs (this session
   never found a case where it did).
3. **Generate 2-3 independent takes of the identical final text and
   settings.** Confirmed by real measurement: byte-identical requests produce
   real variance (one test found 7, 13, and 10 internal pauses across three
   takes of the same text) — big enough that it matters more than most
   parameter tweaks. This isn't a workaround, it's the actual production
   method now.
4. **STT-verify every take (mandatory, unchanged)** — `verify-voice`,
   catches real content errors (dropped/changed numbers hard-fail
   regardless of overall similarity). Necessary gate, but passing it proves
   nothing about naturalness — a flat, "read" take passes STT exactly as
   cleanly as a natural one.
5. **Select the take by ear, on naturalness alone.** Explicitly not by STT
   similarity score, not by duration, not by pause count — none of those
   distinguish a natural take from a flat one at this stage of the pipeline.
   This is a human judgment step, not a metric to optimize.

## Dead ends — real, tested, don't retry without new evidence

- **Splitting a script into multiple generation calls (one per desired
  emotion) and concatenating** — the official generic "split long text"
  advice from WaveSpeed's own guide. Already tested earlier in this project:
  audible seams between separately-generated segments, flattens the result.
  Confirmed no per-phrase/per-segment emotion control exists within one call
  either (checked the full parameter surface) — so there is currently no way
  to vary emotion within a clip other than writing the text so one global
  emotion still reads naturally across it.
- **Post-generation "humanizing" audio processing** — a spliced-in generic
  breath sound, post-hoc pitch/timing jitter, heavy compression to fake
  energy variation. Same trap as adding grain to an over-clean AI image:
  prosody is set at generation time, not fixable convincingly after the
  fact. The one real win in this category was the native `(breath)`
  interjection tag (rendered by the actual cloned voice, not spliced) — and
  even that didn't clear the "immediately, clearly better" bar in a real
  test, so it's a documented option, not a default to reach for.
- **`voice_modify` / `timbre_weights` / `pitch`** — all identity-risk by
  definition (they change vocal character, which is exactly what must never
  drift). Not tested further after confirming what they do; don't test them
  on Shanon's clone.

## Full parameter surface (checked exhaustively, don't re-search)

`text` (supports inline `<#x#>` pause tags 0.01-99.99s and 22 documented
interjection tags like `(breath)`/`(sighs)` — MiniMax's own guidance: use
sparingly, only where they support meaning, avoid stacking), `voice_id`,
`speed`, `volume`, `pitch` (forbidden), `sample_rate`, `bitrate`, `channel`,
`format`, `emotion`, `pronunciation_dict`, `language_boost`,
`english_normalization`. Nothing else exists on this endpoint — no
style/tone/expressiveness parameter, no per-segment emotion, no SSML
equivalent beyond the two tag types above.
