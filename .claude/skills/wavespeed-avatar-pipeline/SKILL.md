---
name: wavespeed-avatar-pipeline
description: Locked, code-based pipeline for generating Shanon's photorealistic talking-avatar TikTok videos via WaveSpeed AI (Seedream photo, minimax voice clone, LTX-2.3 lipsync video). Use whenever the user asks for a Shanon photo, voice, or video — this replaces retyping curl commands by hand.
license: MIT
metadata:
  author: iashark
  version: "1.0.0"
---

# WaveSpeed Avatar Pipeline (Shanon)

Reusable, versioned implementation of the recipe validated across the 2026-08-22
sessions. The point of this skill: stop retyping API calls by hand in chat, which is
what caused the recurring mistakes (a `pitch` param that isn't in the recipe, a
"BTTS" typo, skipped verification steps). Every locked value lives in
`scripts/pipeline.py` as a constant — read it before assuming a parameter, don't
re-derive the recipe from memory.

**Full narrative history / why each rule exists**: `/Users/clement/Desktop/Shanon avatar/SCRIPTS.md`.
This skill is the code-level enforcement of that document. If the two ever disagree,
SCRIPTS.md is more recent — update `pipeline.py`'s constants to match and note the
change in both places.

## Setup (once per machine)

```bash
pip install -r scripts/requirements.txt   # pinned versions — see known-issues.md
                                           # for why numpy/opencv are pinned exactly like this
export WAVESPEED_API_KEY=wsk_live_...      # WaveSpeed dashboard → API keys
export ELEVENLABS_API_KEY=sk_...           # only needed for the mandatory STT check
```

Never write either key into a file that gets committed. Put them in your shell
profile or a local `.env` that's in `.gitignore`.

## The order that works

-1. **Calendar.** No video starts directly from "make a video about X." Read
   `references/editorial-calendar-protocol.md`: score candidate ideas
   (`score-priority`), pick the day's 3 as one program (not 3 independent
   draws — vary category/type/objective, decide the day's location/outfit/pose
   plan up front), add each to the calendar (`calendar-add`) before writing
   anything. Never force a weak prono into a slot — a prono whose credibility
   score is below the bar becomes a different content type instead.
0. **Script.** Read `references/script-writing-protocol.md` and actually apply
   it — category → adapted research → several angles → best angle → tone →
   ONE dominant emotion → hook/retention/payoff → write in Shanon's voice →
   fold emotional intention into the writing (not into separate API calls) →
   fact-check → final QC (the five questions) → same-day coherence check.
   Then run `check-script` (duration + banned language) before touching voice.
1. **Photo** — identity reference → Seedream, then the realism post-process,
   then `identity-check` against the reference photos. Always.
2. **Voice** — generate the validated script, **verify with STT before spending a
   single credit on video**.
3. **Video** — LTX lipsync (`video-qc`/`full-video` auto-retry with a new seed if
   OCR catches a burned-in caption), then **extract the full frame grid and
   actually look at it** before telling the user it's ready — OCR only catches
   text, not a facial glitch, so a clean-looking single frame still proves
   nothing on its own; scan every frame.

Do not skip step 2's verification or step 3's frame check to save time — every
recurring failure this session traced back to skipping one of these two checks.

## One-command path

Once the script has been through `references/script-writing-protocol.md` and
passes `check-script`, this single command runs the whole chain — balance
check, photo, realism post-process, identity check, voice, STT verify, video
(auto-chunked if the audio is long, auto-retried with a new seed if OCR
catches a burned-in caption), frame grid, final format check — and stops at
the first failed gate with a clear reason instead of producing something
silently broken:

```bash
python3 pipeline.py full-video \
  --slug "dortmund-vs-bayern-btts" \
  --text "..." \
  --scene car \
  --emotion happy --speed 1.1
```

**Resumable by default**: if a previous run of this exact `--slug` (same date)
died partway through, re-running the same command skips every step that
already succeeded and picks up where it stopped — it doesn't re-pay for a
photo or voice that already worked. Pass `--no-resume` to force everything
fresh (e.g. after deliberately changing the script text).

Output lands in `~/Desktop/Shanon avatar/output/<date>/<slug>/` (photo.jpg,
photo_real.jpg, voice.mp3, video.mp4, grid.png, meta.json). **`meta.json`
always says `needs_human_review` for the frame grid — OCR auto-catches burned-
in captions, but facial-glitch detection isn't automatable, so `grid.png`
still needs an actual look before the video is approved.** Everything else in
the chain (balance, script validity, identity fidelity, pronunciation,
duration, aspect ratio, caption-free video) is a real automated pass/fail by
this point.

## Commands

```bash
cd "/Users/clement/Documents/IASHARK CLAUDE CODE/iashark/.claude/skills/wavespeed-avatar-pipeline/scripts"

# 0. Check the real balance before starting a batch — this account has run
# dry mid-batch repeatedly; don't discover it three steps in.
python3 pipeline.py balance
python3 pipeline.py estimate-cost --videos 3   # rough sanity check for a 3-video day

# 1. Upload a local reference photo, get back a public URL
python3 pipeline.py upload "/path/to/photo.jpg"

# 2. Generate a photo (Seedream v5 Pro, realism suffix auto-appended, 2K by default)
python3 pipeline.py photo \
  --prompt "Same woman, exact same face... [scene description]" \
  --images "https://url1.jpg,https://url2.jpg" \
  --out photo.jpg

# 3. Apply the realism post-process (Solution B — local filter, zero identity risk)
python3 pipeline.py realism --in photo.jpg --out photo_real.jpg
python3 pipeline.py upload photo_real.jpg   # → get the URL for step 6

# 4. Generate voice (locked recipe: emotion + speed only, no pitch)
python3 pipeline.py voice --text "..." --emotion happy --speed 1.1 --out voice.mp3

# 5. MANDATORY: verify pronunciation before generating video (automated pass/fail —
# fails on any dropped/changed number regardless of overall similarity score)
python3 pipeline.py verify-voice --audio voice.mp3 --text "the exact text passed to voice"
# If it fails, check `differences` in the output for the specific word, rephrase
# (not just respell) and regenerate — see references/known-issues.md.

# 6. Generate video — video-qc auto-chunks if audio is long AND auto-retries
# with a new seed (up to 3x) if OCR catches a burned-in caption
python3 pipeline.py video-qc \
  --image "<uploaded photo url>" \
  --audio voice.mp3 \
  --out video.mp4

# 7. Final format check (aspect ratio + duration)
python3 pipeline.py check-format --video video.mp4

# 8. MANDATORY: extract the full frame grid and look at it before calling it done —
# OCR (step 6) already ruled out captions, this is specifically for a facial glitch
python3 pipeline.py frames --video video.mp4 --out-grid grid.png --fps 3
```

Read `grid.png` with the Read tool and scan every row for a facial glitch (a
gray/warped patch, discolored teeth) or a mouth that never changes shape —
captions are already handled by step 6's OCR retry, but a bad frame from a
different cause can still slip through. If you see one, regenerate with a
different `--seed`, don't reuse the same one.

## Known model choices (don't relitigate these without re-testing)

- **Photo model: `bytedance/seedream-v5.0-pro/edit`.** `google/nano-banana-pro/edit`
  mirrors the image at 2K (text/logos come out backwards) and looks more
  CGI/airbrushed on identical prompts. `wavespeed-ai/flux-kontext-max` rejects this
  kind of photo outright with a content-sensitivity error. See
  `references/known-issues.md` for the side-by-side comparisons that established this.
- **Video audio length: keep it under ~14s if you can.** LTX-2.3/lipsync's
  caption-hallucination and glitch rate rises noticeably above that, even though
  WaveSpeed's docs claim a 20s ceiling. For a longer script, generate the full
  narration as ONE continuous take, slice it at silence points (ffmpeg
  `silencedetect`), generate one video per chunk, then concatenate — don't
  write the script as separately-voiced short beats (audible seams at the joins).
- **`realism` post-process (Solution B) over a second generative pass (Solution C).**
  Re-running a photo through another image model to "make it look more real" risked
  visible identity drift (confirmed once — a full different-looking person came
  back). The local filter in `apply_realism_postprocess` can't drift identity because
  it never touches the model again.

## Skill / connector discovery — standing policy, not a one-off rule

This isn't scoped to `find-skills` alone — it applies to every document in
this project: actively look for skills, MCP connectors, and tools worth
adopting, install/connect the ones that genuinely earn their place, and keep
using them (don't install once and forget — that's the "reminder" part of
this policy, enforced by it living here, in the file that's read every time
this skill runs). **Scope it to three purposes, decided 2026-08-23**: (1)
**performance** — predicting/checking how a finished video is likely to land
before it goes out; (2) **connectors** — what needs to connect *to* this
pipeline (publishing, accounts, external data); (3) **pipeline
quality/reliability** — sourced research, code review, and testing for
`pipeline.py` and the CSV/calendar layer as they keep growing. Don't reach
for new tooling to duplicate a pipeline part that already works (script/
photo/voice/video stay on the locked WaveSpeed recipe), and never adopt
anything into the permanent workflow without inspecting what it does and
testing it on one limited task first — same diligence `find-skills`
(vercel-labs) itself got before install. **Converting the Shanon protocol
docs themselves into auto-triggered skills (via `skill-creator`) is a
separate, bigger architecture decision, not covered by this policy — it
needs its own discussion before any action, because an auto-triggered skill
could bypass the point-by-point validation this whole project runs on.**

**Checked 2026-08-23, and installed** (`.agents/skills/`, symlinked into
Claude Code):
- `research` (mattpocock/skills) — generic sourced-research delegation
  ("investigate a question against high-trust primary sources, write
  findings to Markdown"). Not football-specific despite the name — usable
  across any of `research-methods-protocol.md`'s 11 methods, not a
  replacement for them.
- `tdd` (mattpocock/skills) — test-first workflow for `pipeline.py` changes.
  Security scan: Safe / Low Risk.
- `code-review` (mattpocock/skills) — reviews a diff against this repo's
  documented standards + the originating spec, via parallel sub-agents.
  **Security scan flagged this one Med Risk / High Risk** (0 alerts, but the
  sub-agent-spawning pattern itself is inherently higher-risk) — flagging
  transparently rather than glossing over it, same as `find-skills`'s mixed
  signal at install. Usable, but don't treat its output as unquestionable.

### Mandatory triggers — not a judgment call

For these three, don't weigh whether to use them — if the condition below is
met, use the skill as part of the task, automatically. State briefly which
skill you're using and why right before you use it (one line, for
transparency), but this is a notice, not a question — never ask the user to
pick the skill.

- **`research` — mandatory** for any significant factual research feeding a
  video: actu, stats, transfert, blessure, composition, pronostic, or any
  recent info that needs sourcing. This is the *execution* mechanism — it
  doesn't replace the judgment in `research-methods-protocol.md` (its
  per-category steps, the prono elimination criteria, the never-force-a-prono
  rule). Run the skill to do the sourced legwork, then apply the protocol's
  criteria to what it finds.
- **`tdd` — mandatory** whenever a change adds or modifies a feature in
  `pipeline.py` or another significant technical component (new CLI command,
  new validation, changed calculation). Write the failing test first.
- **`code-review` — mandatory** before considering a significant
  architecture/pipeline change, or a significant batch of code changes,
  finished — run it, don't just declare the work done.
- **Skip all three** for plain documentation or text-only edits (protocol
  wording, `SKILL.md` prose, comments) — nothing here changes behavior, so
  there's nothing for research/tests/review to check.

**Rejected, checked and verified, not just skimmed**:
- Higgsfield MCP connector (performance prediction + TikTok publish) — user
  doesn't use Higgsfield.
- `agent-browser` (vercel-labs) — duplicates the native browser tooling
  already available in this environment; installing it adds nothing.
- `video-edit` / `image-to-video` / `ai-video-generation`
  (prime-skills/runcomfy-agent-skills) — despite names suggesting editing
  helpers, these are routers into RunComfy's own paid model catalog (a
  different generation backend entirely, needs its own `RUNCOMFY_TOKEN`),
  not local editing/captioning/pacing tools. Not a fit unless we ever
  deliberately evaluate RunComfy as a backup to WaveSpeed — that would be its
  own tested decision, not a casual add.

## References

- `references/editorial-calendar-protocol.md` — **read this first, before
  any script.** What gets made today and why: priority scoring for candidate
  ideas, the day's 3 videos as one program, never forcing a weak prono, CTA
  chosen per objective, visual consistency decided up front. The calendar CSV
  itself lives at `EDITORIAL_CALENDAR_PATH` in `pipeline.py`.
- `references/script-writing-protocol.md` — **read this before writing any
  script.** Category → research → angles → tone/emotion → hook/retention →
  Shanon's voice → social performance → fact-check → final QC → same-day
  coherence. This is a judgment process, not something `pipeline.py` can check
  for you.
- `references/research-methods-protocol.md` — **the concrete "how" behind
  the calendar's `research_method` column** (validated against `pipeline.py`'s
  `RESEARCH_METHODS` set — `calendar-add` rejects anything outside it). Every
  slug's actual sources/data/comparison/selection process, plus
  `prono_data_analysis`'s full 7-step workflow and an honest breakdown of
  which betting-analysis calculations are real vs. false precision to avoid.
- `references/viral-mechanics-protocol.md` — **read alongside the script
  protocol's hook/retention step, not after.** The concrete craft: stop-scroll
  reasons, the retention-mechanic library (vary it — don't reuse the same one
  across days either, check `viral_mechanic` in the calendar), virality
  mapped per content type, the extra final-QC questions.
- `references/photo-direction-protocol.md` — **read this before writing any
  photo prompt** (`generate_identity_photo` / `generate_story_variants`).
  Explicit decisions per image (pose, hands, gaze, expression, hair, outfit,
  framing, angle, light — never a vague term), same-day variation rules, and
  a silent pre-send checklist. Same kind of judgment call as the script
  protocol — `pipeline.py` can't verify prompt quality for you.
- `references/shanon_profile.json` — identity photos, voice_id, wardrobe style
  pointer to `PERSONA.md`.
- `references/known-issues.md` — the specific bugs found, what fixed them, what
  didn't, with dates. Read this before assuming a "fix" from a past session still
  holds — some don't (the caption bug came back after being called "solved").
