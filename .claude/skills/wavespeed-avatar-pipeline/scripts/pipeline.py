#!/usr/bin/env python3
"""
WaveSpeed avatar pipeline for Shanon (IASHARK) — locked recipe, callable as a CLI.

Every value here is the recipe validated across the 2026-08-22 sessions
(see ../references/locked_recipe.md and /Users/clement/Desktop/Shanon avatar/SCRIPTS.md
for the human-readable history behind each constant). Do not change a constant
here without updating both files.

Auth: reads the API key from the WAVESPEED_API_KEY env var. Never hardcode
the key in this file — it must not end up in git history.

Usage:
    export WAVESPEED_API_KEY=wsk_live_...
    python3 pipeline.py upload <local_path>
    python3 pipeline.py voice --text "..." --emotion happy --speed 1.1 --out out.mp3
    python3 pipeline.py stt --audio out.mp3
    python3 pipeline.py photo --prompt "..." --images url1,url2,... --out out.jpg [--resolution 2k]
    python3 pipeline.py realism --in photo.jpg --out photo_real.jpg
    python3 pipeline.py video --image <url> --audio <url> --out out.mp4 [--prompt ""] [--resolution 1080p] [--seed -1]
    python3 pipeline.py frames --video out.mp4 --out-grid grid.png [--fps 3]
"""
import argparse
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

API_BASE = "https://api.wavespeed.ai/api/v3"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROFILE_PATH = os.path.join(SCRIPT_DIR, "..", "references", "shanon_profile.json")
UPLOAD_CACHE_PATH = os.path.join(SCRIPT_DIR, ".upload_cache.json")  # gitignored, local only

# ---------------------------------------------------------------------------
# LOCKED RECIPE — validated 2026-08-22. Do not "improve" these without a
# fresh multi-frame verification pass; several of them were arrived at after
# a bug (see references/locked_recipe.md).
# ---------------------------------------------------------------------------
VOICE_MODEL = "minimax/speech-2.8-hd"
VOICE_ID = "Shanon2026v1"
VOICE_SAMPLE_RATE = 44100
VOICE_LANGUAGE_BOOST = "French"
VOICE_SPEED_RANGE = (1.1, 1.15)
# CRITICAL: no `pitch` parameter. Adding one (even a small +2) detectably
# changed the clone's timbre and the user immediately flagged it as
# "not my voice at all". Emotion + speed are the only dynamism knobs.
VOICE_FORBIDDEN_PARAMS = {"pitch"}

PHOTO_MODEL = "bytedance/seedream-v5.0-pro/edit"
PHOTO_RESOLUTION_DEFAULT = "2k"  # v5-pro defaults to 1k (784x1424) if omitted — always pass this
PHOTO_REALISM_PROMPT_SUFFIX = (
    "RAW unprocessed candid photo. Natural realistic skin texture with visible "
    "pores, subtle blemishes, faint natural skin oil sheen, no airbrushing, "
    "no plastic or waxy smoothing, no artificial AI glow, no over-retouched "
    "skin. Shot on iPhone, candid amateur photo quality, not a phone screen "
    "overlay, no camera app UI, no filters."
)
# google/nano-banana-pro/edit and wavespeed-ai/flux-kontext-max are known-bad
# for this use case: nano-banana mirrors the image at 2k resolution (text and
# logos come out reversed) and looks noticeably more CGI/airbrushed than
# Seedream on identical prompts; flux-kontext-max's content filter rejects
# this kind of photo outright (code 1200, "potentially sensitive"). Do not
# reach for either as a fallback without flagging it to the user first.

VIDEO_MODEL = "wavespeed-ai/ltx-2.3/lipsync"
VIDEO_RESOLUTION_DEFAULT = "1080p"
# CRITICAL: LTX lipsync gets measurably less reliable (caption hallucination,
# visual glitches) as audio length grows past ~14-15s, even though the docs
# claim a 20s ceiling. On 2026-08-22 a 17.92s clip produced burned-in garbled
# captions on every frame while a same-pipeline ~5.8s clip was clean 4/4.
# Not fully deterministic (some 15-16s clips were clean), but audio over
# ~14s is a real, documented risk factor — warn loudly, don't silently pass.
VIDEO_AUDIO_SAFE_MAX_SECONDS = 14.0
VIDEO_AUDIO_HARD_MAX_SECONDS = 20.0

STT_MODEL = "scribe_v1"  # ElevenLabs — verification only, never the video voice

# Pronunciation fixes found via mandatory STT checks. Applied automatically
# before every voice generation — see references/known-issues.md for how each
# one was found. Match on the literal script wording (word boundaries), not a
# blind substring replace, so this can't corrupt an unrelated word.
PRONUNCIATION_FIXES = {
    "Paixão": "Paichão",
    "Wahi": "le buteur",  # use surname alone / context framing, see known-issues.md
    "Liga": "la Liga",
    "Espanyol": "Espanyol",  # confirmed NOT a bug — leave as-is, documented for clarity
}

# Banned phrases — copied verbatim from SCRIPTS.md Annexe A §4 ("Ce qu'il faut
# bannir"), not reinvented here. Case-insensitive substring match; the "…" in
# the source doc is dropped since scripts won't reproduce it literally, and a
# couple of very short entries ("En effet", "Ainsi", "Par ailleurs") are kept
# as-is because SCRIPTS.md lists them as banned regardless of what follows.
BANNED_PHRASES = [
    # Langage journalistique
    "Dans l'actualité footballistique",
    "À l'occasion de cette rencontre",
    "s'est exprimé concernant",
    "Cette situation intervient alors que",
    "Il convient de noter que",
    "Selon les dernières informations",
    "Pour rappel",
    "En effet",
    "Ainsi",
    "Par ailleurs",
    # Introductions inutiles
    "Aujourd'hui, nous allons parler de",
    "Dans cette vidéo, je vais vous parler de",
    "Je vais vous expliquer",
    "Voici les dernières nouvelles concernant",
    "Parlons maintenant de",
    # Conclusions scolaires
    "En conclusion",
    "Pour résumer",
    "Il faudra donc attendre pour voir",
    "Cette affaire reste donc à suivre",
]

# Target spoken duration for a Shanon script, per PERSONA.md / SCRIPTS.md Annexe A.
SCRIPT_DURATION_TARGET_SECONDS = (15, 40)
# Rough spoken rate for natural French TTS at speed 1.1-1.15 (measured against
# validated clips tonight: ~70 words / ~25-30s ≈ 2.4-2.8 words/sec).
FRENCH_WORDS_PER_SECOND = 2.6

# Output naming convention — 2026-08-22's files were scattered across the
# scratchpad with ad-hoc names (v1, v2, story5_p3b, finalvid_v3...), which
# made it hard to tell what belonged to which script hours later. Every
# pipeline output should go under this structure instead.
OUTPUT_ROOT = os.path.expanduser("~/Desktop/Shanon avatar/output")

# Editorial calendar (see references/editorial-calendar-protocol.md). No
# video should start from a raw "make a video about X" — it starts from a
# row here: subject -> category -> content type -> objective -> research
# method -> angle -> tone -> script -> visual direction -> generation.
EDITORIAL_CALENDAR_PATH = os.path.expanduser("~/Desktop/Shanon avatar/editorial_calendar.csv")
CALENDAR_COLUMNS = [
    "date", "slot", "category", "content_type", "objective", "subject",
    "research_method", "sources", "angle", "viral_mechanic", "viewer_emotion",
    "tone", "cta", "location", "outfit", "priority_score", "status",
]
# Priority scoring (5 criteria x 1-5, see the protocol doc for the rubric).
PRIORITY_SCORE_MIN_TOTAL = 15
PRIORITY_SCORE_MIN_PRONO_CREDIBILITY = 4

# Valid `research_method` slugs — see references/research-methods-protocol.md
# for what each one actually means. A calendar row with a value outside this
# set is a sign the method wasn't actually decided, just described loosely.
RESEARCH_METHODS = {
    "prono_data_analysis", "breaking_news_research", "reaction_context_research",
    "transfer_rumor_analysis", "post_match_analysis", "match_preview_analysis",
    "opinion_fact_research", "education_explanation_research",
    "community_comment_analysis", "persona_only_storytelling",
    "trend_discovery_research",
}

# Scene templates — the "MUST be X, not Y" reinforcement language is load-bearing
# for "car": a shorter version of that prompt drifted to a bedroom/gaming-chair
# background twice in the same generation batch (2026-08-22) when the reference
# set included non-car photos. Keep the explicit negative + explicit visible-detail
# list even though it looks redundant.
#
# STATUS: only "car" has actually been validated with the user across multiple
# rounds tonight (drift caught and fixed, framing confirmed, wardrobe confirmed).
# "bedroom" / "livingroom" / "outdoor" are carried over from a single early,
# never-revisited test earlier the same night and are UNVALIDATED drafts — don't
# present output from them as "locked", and check with the user before using them
# for real content, the way "car" was actually checked.
SCENE_PROMPTS = {
    "car": (
        "IMPORTANT: the setting MUST be the interior of a car, NOT a bedroom, NOT "
        "a room, NOT a chair. Show visible car details in the background: car "
        "seats, headrests, car door, car window, dashboard or steering wheel edge. "
        "She is sitting in the driver seat of a parked car, engine off, car "
        "interior clearly visible around her, not moving."
    ),
    "bedroom_draft_unvalidated": (
        "IMPORTANT: the setting MUST be a bedroom, NOT a car, NOT outdoors. Show "
        "visible bedroom details: bed or headboard, a wall, soft indoor lighting."
    ),
    "livingroom_draft_unvalidated": (
        "IMPORTANT: the setting MUST be a living room, NOT a car, NOT outdoors. "
        "Show visible living room details: a couch, a coffee table or shelf, "
        "natural window light."
    ),
    "outdoor_draft_unvalidated": (
        "IMPORTANT: the setting MUST be outdoors on a city street, NOT indoors, "
        "NOT a car. Show a blurred street/building background, natural daylight."
    ),
}

# Camera framing shared by every scene — this is the "stationary phone, not a
# selfie" spec the user wrote out in full and confirmed matched what they wanted.
FRAMING_PROMPT = (
    "Create a realistic vertical smartphone photo. CAMERA AND FRAMING: the phone "
    "is completely stationary and placed in front of her, NOT held in her hand. "
    "Camera at eye level, straight-on angle, centered. Medium shot from top of "
    "hair to waist/upper hips. No selfie perspective, no visible phone. POSE: "
    "sitting upright naturally, shoulders relaxed and squared toward camera, both "
    "arms relaxed down, not extended toward camera. Eyes looking directly into "
    "the camera lens."
)


def _wsk_key():
    key = os.environ.get("WAVESPEED_API_KEY")
    if not key:
        sys.exit(
            "WAVESPEED_API_KEY is not set. export WAVESPEED_API_KEY=wsk_live_... "
            "(get it from your WaveSpeed dashboard) and retry."
        )
    return key


def _elevenlabs_key():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("ELEVENLABS_API_KEY is not set. export ELEVENLABS_API_KEY=sk_... and retry.")
    return key


def _req(url, data=None, headers=None, method=None, timeout=90):
    headers = dict(headers or {})
    if data is not None and not isinstance(data, (bytes, bytearray)):
        data = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        # Surface the API's actual error body ("Insufficient credits", etc.)
        # instead of a bare traceback — this was the single most common
        # failure mode all night and the raw stack trace never said why.
        body = e.read().decode(errors="replace")
        sys.exit(f"HTTP {e.code} from {url}: {body}")


def submit(model_path, payload):
    headers = {"Authorization": f"Bearer {_wsk_key()}"}
    res = _req(f"{API_BASE}/{model_path}", payload, headers)
    if "data" not in res:
        sys.exit(f"submit failed for {model_path}: {res}")
    return res["data"]


def poll(get_url, timeout=600, interval=6):
    headers = {"Authorization": f"Bearer {_wsk_key()}"}
    start = time.time()
    while time.time() - start < timeout:
        r = urllib.request.Request(get_url, headers=headers)
        with urllib.request.urlopen(r, timeout=60) as resp:
            res = json.loads(resp.read().decode())
        status = res.get("data", {}).get("status")
        if status in ("completed", "failed"):
            return res["data"]
        time.sleep(interval)
    sys.exit(f"poll timed out after {timeout}s: {get_url}")


# Errors where retrying the exact same request cannot help — fail fast
# instead of burning time/attempts on them. Substring match against the
# error message returned by the API (case-insensitive).
NON_RETRYABLE_ERROR_PATTERNS = [
    "insufficient credits",       # needs a top-up, not a retry
    "content flagged",            # moderation rejection (flux-kontext-max
    "potentially sensitive",      # case, 2026-08-22) — same prompt, same verdict
    "invalid api key",
    "unauthorized",
]

# Confirmed transient, 2026-08-22: v3 (Sporting-Alverca) failed 3 times in a
# row with this exact error, then succeeded on the 4th attempt with a fresh
# upload — this is what retrying is actually for.
RETRYABLE_DEFAULT_MAX_ATTEMPTS = 4
RETRYABLE_DEFAULT_DELAY_SECONDS = 8


def submit_and_poll(model_path, payload, poll_timeout=600,
                     max_attempts=RETRYABLE_DEFAULT_MAX_ATTEMPTS,
                     retry_delay=RETRYABLE_DEFAULT_DELAY_SECONDS):
    """submit() + poll() with automatic retry — but only for errors that a
    retry can plausibly fix. A resubmit is needed (not just re-polling the
    same job id) because a failed prediction id doesn't come back to life."""
    last_error = None
    for attempt in range(1, max_attempts + 1):
        data = submit(model_path, payload)
        result = poll(data["urls"]["get"], timeout=poll_timeout)
        if result["status"] == "completed":
            return result
        error_msg = str(result.get("error", ""))
        last_error = f"(code {result.get('code')}) {error_msg}"
        if any(p in error_msg.lower() for p in NON_RETRYABLE_ERROR_PATTERNS):
            sys.exit(f"{model_path} failed, not retrying (non-retryable): {last_error}")
        if attempt < max_attempts:
            print(
                f"{model_path} failed (attempt {attempt}/{max_attempts}): {last_error} "
                f"— retrying in {retry_delay}s",
                file=sys.stderr,
            )
            time.sleep(retry_delay)
    sys.exit(f"{model_path} failed after {max_attempts} attempts: {last_error}")


def upload_media(local_path):
    size = os.path.getsize(local_path)
    filename = os.path.basename(local_path)
    meta = submit_raw(
        "media/uploads", {"filename": filename, "size": size}
    )
    upload = meta["upload"]
    download_url = meta["download_url"]
    with open(local_path, "rb") as f:
        body = f.read()
    headers = dict(upload.get("headers", {}))
    r = urllib.request.Request(upload["url"], data=body, headers=headers, method="PUT")
    with urllib.request.urlopen(r, timeout=180) as resp:
        resp.read()
    return download_url


def submit_raw(path, payload):
    headers = {"Authorization": f"Bearer {_wsk_key()}"}
    res = _req(f"{API_BASE}/{path}", payload, headers)
    if "data" not in res:
        sys.exit(f"submit failed for {path}: {res}")
    return res["data"]


# Approximate per-unit costs (USD) — sourced from WaveSpeed's published
# pricing where findable, otherwise from the per-run costs actually observed
# this session. These are for a rough pre-flight sanity check ("do I plausibly
# have enough balance for N videos"), not a substitute for `check-balance` or
# the platform's own billing.
ESTIMATED_COST_PER_PHOTO = 0.04       # Seedream v5 Pro, ~$0.035-0.05/run observed
ESTIMATED_COST_PER_VOICE_CALL = 0.05  # minimax speech-2.8-hd, ~$0.05/1000 chars
ESTIMATED_COST_PER_VIDEO_CHUNK = 0.12  # LTX-2.3/lipsync, ~$0.10/run observed + margin
MIN_BALANCE_WARNING_USD = 1.0  # below this, warn loudly before starting a batch


def check_balance():
    """Real WaveSpeed balance endpoint (GET /api/v3/balance) — confirmed
    working 2026-08-23. Use before starting a batch, not just when a call
    already failed with 'Insufficient credits'."""
    headers = {"Authorization": f"Bearer {_wsk_key()}"}
    res = _req(f"{API_BASE}/balance", None, headers, method="GET")
    return res["data"]["balance"]


def estimate_video_cost(num_photos=1, num_voice_calls=1, num_video_chunks=1):
    """Rough cost estimate for a run — one photo + one voice call almost
    always means 1 video chunk, but a long script that gets auto-chunked
    (see generate_video_auto) needs one video-generation call per chunk."""
    total = (
        num_photos * ESTIMATED_COST_PER_PHOTO
        + num_voice_calls * ESTIMATED_COST_PER_VOICE_CALL
        + num_video_chunks * ESTIMATED_COST_PER_VIDEO_CHUNK
    )
    return round(total, 2)


def check_balance_sufficient(estimated_cost, warn_only=False):
    """Pre-flight gate: fetch the real balance, compare to an estimated cost.
    Fails fast (or just warns, if warn_only) instead of discovering mid-batch
    that the account was down to a few cents — as happened repeatedly the
    night this pipeline was built."""
    balance = check_balance()
    ok = balance >= estimated_cost
    msg = f"balance ${balance:.2f}, estimated need ${estimated_cost:.2f}"
    if not ok:
        if warn_only:
            print(f"WARNING: {msg} — likely insufficient.", file=sys.stderr)
        else:
            sys.exit(f"Insufficient balance before starting: {msg}. Top up first.")
    elif balance < MIN_BALANCE_WARNING_USD:
        print(f"WARNING: balance is low (${balance:.2f}) even though this run should fit.", file=sys.stderr)
    return {"ok": ok, "balance": balance, "estimated_cost": estimated_cost}


def load_profile():
    with open(PROFILE_PATH) as f:
        return json.load(f)


def _load_upload_cache():
    if os.path.exists(UPLOAD_CACHE_PATH):
        with open(UPLOAD_CACHE_PATH) as f:
            return json.load(f)
    return {}


def _save_upload_cache(cache):
    with open(UPLOAD_CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)


def cached_upload(local_path):
    """Upload with a local cache keyed on (path, size, mtime) so the same
    17MB identity photos aren't re-uploaded on every single call — that was
    the single slowest, most failure-prone step in the manual workflow
    (multiple 2-minute timeouts uploading the same 5 photos repeatedly)."""
    st = os.stat(local_path)
    key = hashlib.sha256(f"{local_path}:{st.st_size}:{st.st_mtime}".encode()).hexdigest()
    cache = _load_upload_cache()
    if key in cache:
        return cache[key]
    url = upload_media(local_path)
    cache[key] = url
    _save_upload_cache(cache)
    return url


def get_identity_urls(profile=None):
    """Upload (or reuse cached URLs for) every photo in shanon_profile.json.
    Always pass ALL of them to a photo generation call, never a subset and
    never a previously-generated photo — see references/known-issues.md."""
    profile = profile or load_profile()
    return [cached_upload(p) for p in profile["identity_reference_photos"]]


def generate_identity_photo(scene, extra_prompt="", out_path=None, resolution=None, profile=None):
    """The one-call path for 'give me a Shanon photo in scene X'. Wires
    together: identity refs (uploaded once, cached after) + scene template +
    framing spec + wardrobe default + realism suffix. This replaces retyping
    the full prompt by hand every time, which is where drift and inconsistency
    crept in tonight (car scenes that wandered into a bedroom background,
    inconsistent wardrobe wording)."""
    profile = profile or load_profile()
    if scene not in SCENE_PROMPTS:
        sys.exit(f"unknown scene '{scene}', choose from: {', '.join(SCENE_PROMPTS)}")
    urls = get_identity_urls(profile)
    prompt = (
        f"Use the reference images as the exact visual identity of the avatar: "
        f"same face, same {profile['wardrobe_default_fallback']}. "
        f"{SCENE_PROMPTS[scene]} {FRAMING_PROMPT} {extra_prompt}"
    ).strip()
    return generate_photo(prompt, urls, out_path, resolution)


def generate_story_variants(scene, base_photo_path, count, out_dir, resolution=None, profile=None):
    """'Story time' mode: N photos that must look like consecutive frames of
    the same take — same clothes, same pose, same lighting, only a tiny
    difference in loose hair strand position. Confirmed working phrasing from
    2026-08-22 ('c'est vraiment léger... garder exactement les mêmes vêtements').
    Do not vary expression/pose between variants — that was tried first and
    explicitly rejected by the user as not matching a story-time format."""
    profile = profile or load_profile()
    urls = get_identity_urls(profile)
    base_url = cached_upload(base_photo_path)
    prompt = (
        f"Use the reference images as the exact visual identity of the avatar: "
        f"same face, exact same {profile['wardrobe_default_fallback']}, same hairstyle, "
        f"same expression. {SCENE_PROMPTS[scene]} {FRAMING_PROMPT} This must look "
        f"like the SAME photo as the base reference, just a fraction of a second "
        f"later in a continuous video: only a tiny natural difference in a few "
        f"loose hair strands position, everything else pixel-for-pixel identical: "
        f"same expression, same lighting, same outfit, same pose."
    )
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i in range(count):
        out_path = os.path.join(out_dir, f"story_{i+1}.jpg")
        generate_photo(prompt, urls + [base_url], out_path, resolution)
        paths.append(out_path)
    return paths


def apply_pronunciation_fixes(text):
    """Auto-applies every known-good pronunciation fix from PRONUNCIATION_FIXES.
    Still run `stt` after generating — this list only covers words already
    hit once; a script always needs the mandatory verification pass for new
    names/words it hasn't seen before."""
    import re
    fixed = text
    applied = []
    for wrong, right in PRONUNCIATION_FIXES.items():
        if wrong == right:
            continue  # documented non-bug, e.g. Espanyol — nothing to change
        pattern = re.compile(re.escape(wrong))
        if pattern.search(fixed):
            fixed = pattern.sub(right, fixed)
            applied.append(f"{wrong} -> {right}")
    # Safety net: a fix like "Liga" -> "la Liga" run on text that already said
    # "la Liga" produces "la la Liga" — collapse any such immediate word repeat
    # (confirmed bug, 2026-08-22, caught by the pipeline's own test before it
    # ever reached a real TTS call).
    fixed = re.sub(r"\b(\w+)( \1\b)+", r"\1", fixed, flags=re.IGNORECASE)
    if applied:
        print(f"pronunciation fixes applied: {', '.join(applied)}", file=sys.stderr)
    return fixed


def estimate_duration_seconds(text):
    """Rough estimate only — always confirm against the real generated audio
    (ffmpeg duration), this is for a pre-flight sanity check before spending
    a credit, not a substitute for measuring the actual file."""
    import re
    words = len(re.findall(r"\S+", re.sub(r"<#[\d.]+#>", " ", text)))
    return words / FRENCH_WORDS_PER_SECOND


def check_script_duration(text):
    est = estimate_duration_seconds(text)
    lo, hi = SCRIPT_DURATION_TARGET_SECONDS
    if est < lo or est > hi:
        print(
            f"WARNING: script is ~{est:.0f}s estimated, outside the "
            f"{lo}-{hi}s target range (PERSONA.md / SCRIPTS.md Annexe A).",
            file=sys.stderr,
        )
    return est


def check_banned_language(text):
    """Flags any phrase from SCRIPTS.md Annexe A's banned list. This catches
    the exact-phrase cases; it can't catch the broader "explanatory/notice"
    pattern the doc also warns about (e.g. 'il peut faire mal tout seul face
    à cette défense') — that still needs a human/Claude read-aloud check."""
    hits = [p for p in BANNED_PHRASES if p.lower() in text.lower()]
    return hits


def check_script(text):
    """Combined pre-flight check before generating voice: duration estimate
    + banned language. Returns a report dict; does not raise — the caller
    decides whether a warning is a hard stop."""
    duration = estimate_duration_seconds(text)
    lo, hi = SCRIPT_DURATION_TARGET_SECONDS
    banned = check_banned_language(text)
    ok = (lo <= duration <= hi) and not banned
    report = {
        "ok": ok,
        "estimated_seconds": round(duration, 1),
        "duration_target": SCRIPT_DURATION_TARGET_SECONDS,
        "duration_in_range": lo <= duration <= hi,
        "banned_phrases_found": banned,
    }
    return report


def output_paths(slug, date=None):
    """Every pipeline output for one video lives under one folder:
    output/<date>/<slug>/{photo.jpg, voice.mp3, video.mp4, grid.png, meta.json}
    instead of scattered ad-hoc names in a scratchpad — see the naming mess
    from 2026-08-22 (v1, v2, story5_p3b, finalvid_v3, ...) this replaces."""
    import datetime
    import re
    date = date or datetime.date.today().isoformat()
    safe_slug = re.sub(r"[^a-z0-9-]+", "-", slug.lower()).strip("-")
    d = os.path.join(OUTPUT_ROOT, date, safe_slug)
    os.makedirs(d, exist_ok=True)
    return {
        "dir": d,
        "photo": os.path.join(d, "photo.jpg"),
        "photo_real": os.path.join(d, "photo_real.jpg"),
        "voice": os.path.join(d, "voice.mp3"),
        "video": os.path.join(d, "video.mp4"),
        "grid": os.path.join(d, "grid.png"),
        "meta": os.path.join(d, "meta.json"),
    }


def _ensure_calendar_exists():
    if not os.path.exists(EDITORIAL_CALENDAR_PATH):
        os.makedirs(os.path.dirname(EDITORIAL_CALENDAR_PATH), exist_ok=True)
        import csv
        with open(EDITORIAL_CALENDAR_PATH, "w", newline="") as f:
            csv.writer(f).writerow(CALENDAR_COLUMNS)


def read_calendar():
    import csv
    _ensure_calendar_exists()
    with open(EDITORIAL_CALENDAR_PATH, newline="") as f:
        return list(csv.DictReader(f))


def append_calendar_row(**fields):
    """Add one video's row. Every field in CALENDAR_COLUMNS is required
    except status (defaults to 'idée') — an incomplete row defeats the whole
    point of deciding these things before writing a script."""
    import csv
    _ensure_calendar_exists()
    fields.setdefault("status", "idée")
    missing = [c for c in CALENDAR_COLUMNS if c not in fields]
    if missing:
        sys.exit(f"calendar row missing required fields: {missing}")
    method = fields.get("research_method")
    if method and method not in RESEARCH_METHODS:
        sys.exit(
            f"unknown research_method '{method}' — must be one of {sorted(RESEARCH_METHODS)} "
            f"(see references/research-methods-protocol.md)"
        )
    with open(EDITORIAL_CALENDAR_PATH, "a", newline="") as f:
        csv.DictWriter(f, fieldnames=CALENDAR_COLUMNS).writerow(fields)
    return fields


def todays_calendar_entries(date=None):
    import datetime
    date = date or datetime.date.today().isoformat()
    return [row for row in read_calendar() if row["date"] == date]


def score_priority(viral_potential, relevance, freshness, credibility, originality, is_prono=False):
    """The five-criterion scoring rubric from editorial-calendar-protocol.md.
    Each argument is 1-5. Returns the total /25 plus whether it clears the
    bar to actually be used — and for a prono specifically, enforces that
    credibility alone can't be compensated by the other four (a viral but
    data-thin prono still fails)."""
    scores = {
        "viral_potential": viral_potential, "relevance": relevance,
        "freshness": freshness, "credibility": credibility, "originality": originality,
    }
    for k, v in scores.items():
        if not (1 <= v <= 5):
            sys.exit(f"score_priority: '{k}'={v} must be between 1 and 5")
    total = sum(scores.values())
    prono_ok = (not is_prono) or credibility >= PRIORITY_SCORE_MIN_PRONO_CREDIBILITY
    return {
        "total": total,
        "max": 25,
        "scores": scores,
        "clears_bar": total >= PRIORITY_SCORE_MIN_TOTAL and prono_ok,
        "prono_credibility_ok": prono_ok,
    }


def generate_voice(text, emotion="happy", speed=1.1, out_path=None, auto_fix_pronunciation=True):
    if speed < VOICE_SPEED_RANGE[0] or speed > VOICE_SPEED_RANGE[1]:
        print(
            f"WARNING: speed {speed} is outside the validated {VOICE_SPEED_RANGE} range.",
            file=sys.stderr,
        )
    check_script_duration(text)
    if auto_fix_pronunciation:
        text = apply_pronunciation_fixes(text)
    payload = {
        "text": text,
        "voice_id": VOICE_ID,
        "emotion": emotion,
        "speed": speed,
        "sample_rate": VOICE_SAMPLE_RATE,
        "language_boost": VOICE_LANGUAGE_BOOST,
    }
    result = submit_and_poll(VOICE_MODEL, payload)
    url = result["outputs"][0]
    if out_path:
        urllib.request.urlretrieve(url, out_path)
    return url


def verify_stt(audio_path):
    """Mandatory before any video generation. Returns the transcript string
    so the caller (you, the agent) can diff it against the intended script."""
    key = _elevenlabs_key()
    boundary = "----wavespeedpipeline"
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    body = io.BytesIO()
    def w(s):
        body.write(s.encode() if isinstance(s, str) else s)
    w(f"--{boundary}\r\n")
    w('Content-Disposition: form-data; name="model_id"\r\n\r\n')
    w(f"{STT_MODEL}\r\n")
    w(f"--{boundary}\r\n")
    w(f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(audio_path)}"\r\n')
    w("Content-Type: audio/mpeg\r\n\r\n")
    w(audio_bytes)
    w(f"\r\n--{boundary}--\r\n")
    headers = {
        "xi-api-key": key,
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    r = urllib.request.Request(
        "https://api.elevenlabs.io/v1/speech-to-text",
        data=body.getvalue(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(r, timeout=90) as resp:
        res = json.loads(resp.read().decode())
    return res.get("text", "")


# STT similarity threshold below which a script is flagged for a real
# mispronunciation rather than harmless STT/punctuation noise. 0.90 is a
# starting point — tune against real clips (SCRIPTS.md's Paixão/Wahi/Liga
# cases were much lower than this, well below 0.9, once the wrong word broke
# a sentence; whereas clean clips tonight normalized to 1.0 or very close).
STT_MATCH_THRESHOLD = 0.90


def _normalize_for_diff(text):
    """Strip pause tags, punctuation, and case before comparing — none of
    that is meant to come out of STT, and penalizing on it would flag clean
    audio as a failure for the wrong reason."""
    import re
    text = re.sub(r"<#[\d.]+#>", " ", text)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


# A dropped/changed number is never acceptable regardless of overall
# similarity — a betting script lives or dies on its numbers (odds, scores,
# handicaps, stats), and one wrong or missing digit-word can invert the whole
# pick's meaning. Confirmed necessary 2026-08-22: a clip that dropped "deux"
# from "moins deux buts" scored 0.947 overall similarity — comfortably above
# a 0.90 threshold — while being a real, meaning-changing error.
FRENCH_NUMBER_WORDS = {
    "zéro", "un", "une", "deux", "trois", "quatre", "cinq", "six", "sept",
    "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze",
    "seize", "vingt", "trente", "quarante", "cinquante", "soixante", "cent",
    "cents", "mille",
}


def _contains_number(token_str):
    import re
    tokens = token_str.split()
    return any(t in FRENCH_NUMBER_WORDS or re.fullmatch(r"\d+([.,]\d+)?", t) for t in tokens)


def diff_transcript(intended_text, transcript):
    """Automated pass/fail replacement for 'read the transcript yourself and
    compare' — SequenceMatcher ratio on normalized text, plus the actual
    word-level differences so a failure is immediately actionable (which word
    was wrong), not just a number. A dropped/changed number-word fails the
    check outright, independent of the overall similarity ratio."""
    import difflib
    a = _normalize_for_diff(intended_text).split()
    b = _normalize_for_diff(transcript).split()
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    sm = difflib.SequenceMatcher(None, a, b)
    diffs = []
    number_error = False
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != "equal":
            intended_chunk = " ".join(a[i1:i2])
            heard_chunk = " ".join(b[j1:j2])
            if tag in ("replace", "delete") and _contains_number(intended_chunk):
                number_error = True
            diffs.append({"type": tag, "intended": intended_chunk, "heard": heard_chunk})
    passed = ratio >= STT_MATCH_THRESHOLD and not number_error
    return {
        "pass": passed,
        "similarity": round(ratio, 3),
        "threshold": STT_MATCH_THRESHOLD,
        "number_error": number_error,
        "differences": diffs,
    }


def verify_voice(audio_path, intended_text):
    """The actual mandatory pre-video-generation gate: transcribe + diff
    against the script in one call. Replaces 'I read the transcript myself'
    with a real pass/fail plus the specific word(s) that broke, so a fix
    (respell or reword) can target the right word immediately."""
    transcript = verify_stt(audio_path)
    result = diff_transcript(intended_text, transcript)
    result["transcript"] = transcript
    return result


def generate_photo(prompt, image_urls, out_path=None, resolution=None):
    full_prompt = f"{prompt} {PHOTO_REALISM_PROMPT_SUFFIX}"
    payload = {
        "prompt": full_prompt,
        "images": image_urls,
        "resolution": resolution or PHOTO_RESOLUTION_DEFAULT,
    }
    result = submit_and_poll(PHOTO_MODEL, payload)
    url = result["outputs"][0]
    if out_path:
        urllib.request.urlretrieve(url, out_path)
    return url


def apply_realism_postprocess(in_path, out_path):
    """Solution B, validated 2026-08-22: local deterministic filter, zero
    identity risk (it's pixel post-processing on an already-approved photo,
    not a new generative pass). Preferred over re-generating through a model
    for "more realistic" — a generative re-pass (Solution C) caused visible
    identity drift to a different-looking person in testing."""
    from PIL import Image, ImageFilter, ImageEnhance
    import numpy as np

    im = Image.open(in_path).convert("RGB")
    im = im.filter(ImageFilter.GaussianBlur(radius=0.6))
    arr = np.array(im).astype(np.int16)
    noise = np.random.normal(0, 6, arr.shape).astype(np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr)
    im = ImageEnhance.Contrast(im).enhance(0.94)
    im = ImageEnhance.Color(im).enhance(0.92)
    im = ImageEnhance.Brightness(im).enhance(1.02)
    w, h = im.size
    y, x = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    max_dist = np.sqrt(cx ** 2 + cy ** 2)
    vignette = 1 - 0.18 * (dist / max_dist) ** 2
    arr = np.array(im).astype(np.float32)
    for c in range(3):
        arr[:, :, c] *= vignette
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=82)
    buf.seek(0)
    Image.open(buf).save(out_path, format="JPEG", quality=82)
    return out_path


def _audio_duration_seconds(audio_path_or_url):
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    import subprocess
    out = subprocess.run(
        [ffmpeg, "-i", audio_path_or_url], stderr=subprocess.PIPE, stdout=subprocess.PIPE
    ).stderr.decode()
    for line in out.splitlines():
        if "Duration" in line:
            ts = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = ts.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return None


def generate_video(image_url, audio_url, out_path=None, prompt="", resolution=None, seed=-1,
                    local_audio_for_duration_check=None):
    dur = None
    if local_audio_for_duration_check:
        dur = _audio_duration_seconds(local_audio_for_duration_check)
    if dur is not None and dur > VIDEO_AUDIO_SAFE_MAX_SECONDS:
        print(
            f"WARNING: audio is {dur:.1f}s, above the {VIDEO_AUDIO_SAFE_MAX_SECONDS}s safe "
            f"threshold for LTX lipsync — caption-hallucination/glitch risk rises. Consider "
            f"slicing at a silence point instead of submitting as one clip.",
            file=sys.stderr,
        )
    payload = {
        "image": image_url,
        "audio": audio_url,
        "prompt": prompt,
        "resolution": resolution or VIDEO_RESOLUTION_DEFAULT,
        "seed": seed,
    }
    result = submit_and_poll(VIDEO_MODEL, payload, poll_timeout=900)
    url = result["outputs"][0]
    if out_path:
        urllib.request.urlretrieve(url, out_path)
    return url


def _detect_silences(audio_path, noise_db=-30, min_duration=0.3):
    """ffmpeg silencedetect — returns a list of (start, end) silence
    intervals in seconds. Used to find natural cut points, per SCRIPTS.md's
    'slice one continuous take at silence points, don't write separately-
    scripted short beats' rule."""
    import imageio_ffmpeg
    import subprocess
    import re
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out = subprocess.run(
        [ffmpeg, "-i", audio_path, "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
         "-f", "null", "-"],
        stderr=subprocess.PIPE, stdout=subprocess.PIPE,
    ).stderr.decode()
    starts = [float(m) for m in re.findall(r"silence_start:\s*([\d.]+)", out)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*([\d.]+)", out)]
    return list(zip(starts, ends))


def slice_audio_at_silences(audio_path, max_chunk_seconds, out_dir):
    """Greedily group the audio into chunks under max_chunk_seconds, cutting
    at the nearest detected silence midpoint before the limit is hit — not at
    a fixed timestamp, which could land mid-word. Falls back to a hard cut if
    a chunk has no silence to cut at (rare for real narration, but don't hang
    on it)."""
    import imageio_ffmpeg
    import subprocess
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    total = _audio_duration_seconds(audio_path)
    silences = _detect_silences(audio_path)
    midpoints = sorted((s + e) / 2 for s, e in silences)

    cuts = [0.0]
    while cuts[-1] < total:
        limit = cuts[-1] + max_chunk_seconds
        if limit >= total:
            break
        candidates = [m for m in midpoints if cuts[-1] + 1.0 < m <= limit]
        cut = candidates[-1] if candidates else limit  # hard cut fallback
        cuts.append(cut)
    cuts.append(total)

    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i in range(len(cuts) - 1):
        start, end = cuts[i], cuts[i + 1]
        out_path = os.path.join(out_dir, f"chunk_{i+1}.mp3")
        subprocess.run(
            [ffmpeg, "-y", "-i", audio_path, "-ss", str(start), "-to", str(end),
             "-c", "copy", out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        paths.append(out_path)
    return paths


def concat_videos(video_paths, out_path):
    """Concat demuxer via a .ts remux (h264_mp4toannexb bitstream filter) —
    the plain concat demuxer on raw .mp4 segments produces artifacts at the
    joins; this is the approach that was clean in practice."""
    import imageio_ffmpeg
    import subprocess
    import tempfile
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory() as tmp:
        ts_paths = []
        for i, v in enumerate(video_paths):
            ts_path = os.path.join(tmp, f"part_{i}.ts")
            subprocess.run(
                [ffmpeg, "-y", "-i", v, "-c", "copy", "-bsf:v", "h264_mp4toannexb",
                 "-f", "mpegts", ts_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )
            ts_paths.append(ts_path)
        concat_str = "concat:" + "|".join(ts_paths)
        subprocess.run(
            [ffmpeg, "-y", "-i", concat_str, "-c", "copy", "-bsf:a", "aac_adtstoasc", out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
    return out_path


def generate_video_auto(image_url, audio_local_path, out_path, prompt="", resolution=None,
                         seed=-1, chunk_dir=None):
    """The orchestrator to actually call: checks the LOCAL audio file's
    duration and transparently chunks + concatenates if it's over the safe
    threshold, instead of just warning about it. Needs the local audio file
    (not just its URL) to measure duration and to slice it; uploads each
    chunk itself."""
    dur = _audio_duration_seconds(audio_local_path)
    if dur is None:
        sys.exit(f"could not read duration of {audio_local_path}")
    if dur <= VIDEO_AUDIO_SAFE_MAX_SECONDS:
        audio_url = cached_upload(audio_local_path)
        return generate_video(image_url, audio_url, out_path, prompt, resolution, seed)

    print(
        f"audio is {dur:.1f}s (> {VIDEO_AUDIO_SAFE_MAX_SECONDS}s) — slicing at silence "
        f"points instead of submitting one long clip.",
        file=sys.stderr,
    )
    chunk_dir = chunk_dir or (os.path.splitext(out_path)[0] + "_chunks")
    audio_chunks = slice_audio_at_silences(audio_local_path, VIDEO_AUDIO_SAFE_MAX_SECONDS, chunk_dir)
    video_chunks = []
    for i, chunk_path in enumerate(audio_chunks):
        chunk_audio_url = cached_upload(chunk_path)
        chunk_video_path = os.path.join(chunk_dir, f"chunk_{i+1}.mp4")
        generate_video(image_url, chunk_audio_url, chunk_video_path, prompt, resolution, seed)
        video_chunks.append(chunk_video_path)
        print(f"chunk {i+1}/{len(audio_chunks)} done", file=sys.stderr)
    concat_videos(video_chunks, out_path)
    return out_path


# Identity-drift check (A.3). Validated 2026-08-22 against two known real
# cases from that night: a genuine same-identity generation scored 0.662
# cosine similarity against a reference photo; the confirmed "different
# looking person" drift case (Solution C, wavespeed-ai/z-image-turbo re-pass)
# scored 0.149. 0.35 sits well clear of both and is the starting threshold —
# tune it if real content starts producing borderline scores near it.
IDENTITY_SIMILARITY_THRESHOLD = 0.35
_face_app = None


def _get_face_app():
    global _face_app
    if _face_app is None:
        import warnings
        warnings.filterwarnings("ignore")
        from insightface.app import FaceAnalysis
        _face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
    return _face_app


def face_embedding(image_path):
    """Returns the normalized embedding of the largest face in the image, or
    None if no face is detected."""
    import cv2
    app = _get_face_app()
    img = cv2.imread(image_path)
    if img is None:
        sys.exit(f"could not read image: {image_path}")
    faces = app.get(img)
    if not faces:
        return None
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
    return faces[0].normed_embedding


def check_identity(generated_photo_path, profile=None, threshold=None):
    """Compares a generated photo against every identity reference photo and
    returns the best (max) similarity score. This is a coarse, single-face
    cosine-similarity check — it catches gross drift (a visibly different
    person, the kind Solution C produced) reliably, but a high score is not
    a guarantee of perfect fidelity on fine details (hairstyle, exact
    proportions) — still eyeball the photo yourself for those."""
    import numpy as np
    profile = profile or load_profile()
    threshold = threshold if threshold is not None else IDENTITY_SIMILARITY_THRESHOLD
    gen_emb = face_embedding(generated_photo_path)
    if gen_emb is None:
        return {"pass": False, "reason": "no face detected in generated photo", "scores": {}}
    scores = {}
    for ref_path in profile["identity_reference_photos"]:
        ref_emb = face_embedding(ref_path)
        if ref_emb is None:
            continue
        scores[os.path.basename(ref_path)] = float(np.dot(gen_emb, ref_emb))
    if not scores:
        return {"pass": False, "reason": "no face detected in any reference photo", "scores": {}}
    best = max(scores.values())
    return {"pass": best >= threshold, "best_score": best, "threshold": threshold, "scores": scores}


def extract_frame_grid(video_path, out_grid_path, fps=3, cols=8, thumb_w=110):
    """Mandatory before declaring any video 'good': dump the WHOLE clip as a
    contact sheet (not 1-2 sparse frames — a static, beautiful pose can pass
    a sparse check while being completely unsynced or captioned) and
    eyeball it for burned-in captions, frozen mouth, or facial glitches."""
    import imageio_ffmpeg
    import subprocess
    import tempfile
    from PIL import Image

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [ffmpeg, "-y", "-i", video_path, "-vf", f"fps={fps}", f"{tmp}/f_%03d.png"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        files = sorted(os.listdir(tmp))
        imgs = [Image.open(f"{tmp}/{f}") for f in files]
        if not imgs:
            sys.exit("no frames extracted — check the video file")
        w, h = imgs[0].size
        scale = thumb_w / w
        sw, sh = int(w * scale), int(h * scale)
        rows = (len(imgs) + cols - 1) // cols
        grid = Image.new("RGB", (sw * cols, sh * rows), "black")
        for i, im in enumerate(imgs):
            grid.paste(im.resize((sw, sh)), ((i % cols) * sw, (i // cols) * sh))
        grid.save(out_grid_path)
    return out_grid_path, len(imgs)


# Automated caption-hallucination detection (E.19/E.17). The bug (see
# known-issues.md) burns garbled English text into the video — since this
# pipeline's videos are never supposed to have ANY on-screen text, any OCR
# hit at all across a handful of sampled frames is suspicious. Two separate
# frames with a hit (not just one) avoids a false positive from OCR
# misreading a car-interior detail (a dashboard icon, a sticker) as a single
# stray character.
_ocr_reader = None
CAPTION_OCR_MIN_CONFIDENCE = 0.35
CAPTION_OCR_MIN_HIT_FRAMES = 2


def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _ocr_reader


def detect_burned_in_captions(video_path, num_samples=8):
    """Samples frames evenly across the video and runs OCR on each. Returns
    a report with a boolean verdict — True means enough frames had text hits
    to treat this as the known caption-hallucination bug, not noise."""
    import imageio_ffmpeg
    import subprocess
    import tempfile
    import cv2

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    reader = _get_ocr_reader()
    hits = []
    with tempfile.TemporaryDirectory() as tmp:
        dur = _audio_duration_seconds(video_path) or 10.0
        for i in range(num_samples):
            t = dur * (i + 0.5) / num_samples
            frame_path = os.path.join(tmp, f"f_{i}.png")
            subprocess.run(
                [ffmpeg, "-y", "-ss", str(t), "-i", video_path, "-frames:v", "1", frame_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )
            if not os.path.exists(frame_path):
                continue
            img = cv2.imread(frame_path)
            if img is None:
                continue
            results = reader.readtext(img)
            for (_, text, conf) in results:
                if conf >= CAPTION_OCR_MIN_CONFIDENCE and len(text.strip()) >= 2:
                    hits.append({"frame_index": i, "time": round(t, 2), "text": text, "confidence": round(float(conf), 2)})
    frames_with_hits = len({h["frame_index"] for h in hits})
    return {
        "caption_detected": frames_with_hits >= CAPTION_OCR_MIN_HIT_FRAMES,
        "frames_with_text": frames_with_hits,
        "hits": hits,
    }


def generate_video_with_qc(image_url, audio_local_path, out_path, prompt="", resolution=None,
                            max_seed_attempts=3, chunk_dir=None):
    """generate_video_auto + automated caption-hallucination retry: if OCR
    finds burned-in text, throw the seed away and try again (a different seed
    was enough to fix this exact bug on real content, 2026-08-22) instead of
    handing back a video known to have the bug. Does NOT check for facial
    glitches — that detector doesn't exist (see known-issues.md's Solution C
    identity-drift caution for why a naive approach here is risky); the frame
    grid still needs a human/Claude look for that."""
    import random
    last_ocr = None
    for attempt in range(1, max_seed_attempts + 1):
        seed = random.randint(1, 2_000_000_000) if attempt > 1 else -1
        generate_video_auto(image_url, audio_local_path, out_path, prompt, resolution, seed, chunk_dir)
        ocr = detect_burned_in_captions(out_path)
        last_ocr = ocr
        if not ocr["caption_detected"]:
            return {"ok": True, "attempts": attempt, "ocr": ocr, "path": out_path}
        print(
            f"caption hallucination detected (attempt {attempt}/{max_seed_attempts}): "
            f"{[h['text'] for h in ocr['hits']]} — retrying with a new seed",
            file=sys.stderr,
        )
    return {"ok": False, "attempts": max_seed_attempts, "ocr": last_ocr, "path": out_path}


def check_video_format(video_path, expected_aspect="9:16", duration_range=None):
    """Final delivery format check (G.26): aspect ratio and duration inside
    the target range. Aspect ratio compared with a small tolerance since
    exact pixel dimensions vary slightly by model/resolution setting."""
    import imageio_ffmpeg
    import subprocess
    import re
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out = subprocess.run([ffmpeg, "-i", video_path], stderr=subprocess.PIPE, stdout=subprocess.PIPE).stderr.decode()
    m = re.search(r",\s*(\d{2,5})x(\d{2,5})\b", out)
    if not m:
        sys.exit(f"could not read video dimensions: {video_path}")
    w, h = int(m.group(1)), int(m.group(2))
    aw, ah = (int(x) for x in expected_aspect.split(":"))
    actual_ratio = w / h
    expected_ratio = aw / ah
    aspect_ok = abs(actual_ratio - expected_ratio) / expected_ratio < 0.03
    dur = _audio_duration_seconds(video_path)
    lo, hi = duration_range or SCRIPT_DURATION_TARGET_SECONDS
    duration_ok = dur is not None and lo <= dur <= hi
    return {
        "ok": aspect_ok and duration_ok,
        "width": w, "height": h,
        "aspect_ok": aspect_ok, "expected_aspect": expected_aspect,
        "duration_seconds": round(dur, 1) if dur else None,
        "duration_ok": duration_ok, "duration_range": [lo, hi],
    }


def run_full_video(slug, text, scene="car", extra_photo_prompt="", emotion="happy", speed=1.1,
                    resolution=None, seed=-1, date=None, profile=None, resume=True):
    """The single command that chains everything already built: balance check
    -> script check -> photo -> realism -> identity check -> voice -> STT
    verify -> video (auto-chunked if needed, auto-retried with a new seed if
    OCR catches the caption-hallucination bug) -> frame grid -> final format
    check. Stops at the first failed gate with a clear reason instead of
    silently producing something broken.

    Resumable by default (resume=True): if `meta.json` from a previous run of
    this exact slug/date shows a step succeeded AND that step's output file
    still exists on disk, that step is skipped instead of re-run — so a batch
    that died on video generation for one video doesn't re-pay for the photo
    and voice that already worked. Pass resume=False to force everything
    fresh (e.g. after deliberately changing the script text).

    What this does NOT do, on purpose (not automatable): detect a facial
    glitch in the finished video — that still needs a human/Claude look at
    grid.png before calling the video approved. OCR only catches burned-in
    text, not a warped face or discolored teeth.
    """
    profile = profile or load_profile()
    paths = output_paths(slug, date)
    report = {"slug": slug, "scene": scene, "steps": {}}

    prior_steps = {}
    if resume and os.path.exists(paths["meta"]):
        try:
            with open(paths["meta"]) as f:
                prior_steps = json.load(f).get("steps", {})
        except (json.JSONDecodeError, OSError):
            prior_steps = {}

    def already_done(name, *files_that_must_exist):
        prior = prior_steps.get(name)
        return bool(
            resume and prior and prior.get("ok")
            and all(os.path.exists(p) for p in files_that_must_exist)
        )

    def record(name, ok, detail=None):
        report["steps"][name] = {"ok": ok, "detail": detail}
        if not ok:
            report["failed_at"] = name
            with open(paths["meta"], "w") as f:
                json.dump(report, f, indent=2, ensure_ascii=False, default=str)
            sys.exit(f"full-video stopped at step '{name}': {detail}")

    def skip(name):
        report["steps"][name] = prior_steps[name]
        print(f"[resume] skipping '{name}', already done", file=sys.stderr)

    if already_done("check_balance"):
        skip("check_balance")
    else:
        balance_check = check_balance_sufficient(estimate_video_cost(), warn_only=True)
        record("check_balance", balance_check["ok"], balance_check)

    if already_done("check_script"):
        skip("check_script")
    else:
        script_check = check_script(text)
        record("check_script", script_check["ok"], script_check)

    if already_done("generate_photo", paths["photo"]):
        skip("generate_photo")
    else:
        generate_identity_photo(scene, extra_photo_prompt, paths["photo"], resolution, profile)
        record("generate_photo", os.path.exists(paths["photo"]), paths["photo"])

    if already_done("realism_postprocess", paths["photo_real"]):
        skip("realism_postprocess")
    else:
        apply_realism_postprocess(paths["photo"], paths["photo_real"])
        record("realism_postprocess", os.path.exists(paths["photo_real"]), paths["photo_real"])

    if already_done("identity_check"):
        skip("identity_check")
    else:
        identity = check_identity(paths["photo_real"], profile)
        record("identity_check", identity["pass"], identity)

    photo_url = cached_upload(paths["photo_real"])

    if already_done("generate_voice", paths["voice"]):
        skip("generate_voice")
    else:
        generate_voice(text, emotion, speed, paths["voice"])
        record("generate_voice", os.path.exists(paths["voice"]), paths["voice"])

    if already_done("verify_voice"):
        skip("verify_voice")
    else:
        voice_check = verify_voice(paths["voice"], text)
        record("verify_voice", voice_check["pass"], voice_check)

    if already_done("generate_video", paths["video"]):
        skip("generate_video")
    else:
        video_qc = generate_video_with_qc(photo_url, paths["voice"], paths["video"], resolution=resolution)
        record("generate_video", video_qc["ok"], video_qc)

    if already_done("extract_frames", paths["grid"]):
        skip("extract_frames")
    else:
        grid_path, n_frames = extract_frame_grid(paths["video"], paths["grid"])
        record("extract_frames", os.path.exists(grid_path), f"{n_frames} frames -> {grid_path}")

    if already_done("format_check"):
        skip("format_check")
    else:
        format_check = check_video_format(paths["video"])
        record("format_check", format_check["ok"], format_check)

    report["ok"] = True
    report["needs_human_review"] = (
        "grid.png has been OCR-checked for burned-in captions (auto-retried "
        "if found) but NOT checked for a facial glitch — that's still a "
        "manual/Claude look before calling this video approved."
    )
    with open(paths["meta"], "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("balance", help="check the real WaveSpeed account balance")

    sp = sub.add_parser("estimate-cost", help="rough cost estimate for N videos, and whether balance covers it")
    sp.add_argument("--videos", type=int, default=1)
    sp.add_argument("--chunks-per-video", type=int, default=1, help="use 2+ for scripts that need auto-chunking")

    sp = sub.add_parser("score-priority", help="score a candidate video idea (5 criteria, 1-5 each)")
    sp.add_argument("--viral", type=int, required=True)
    sp.add_argument("--relevance", type=int, required=True)
    sp.add_argument("--freshness", type=int, required=True)
    sp.add_argument("--credibility", type=int, required=True)
    sp.add_argument("--originality", type=int, required=True)
    sp.add_argument("--is-prono", action="store_true")

    sp = sub.add_parser("calendar-add", help="append one video row to the editorial calendar")
    for col in CALENDAR_COLUMNS:
        sp.add_argument(f"--{col.replace('_', '-')}", dest=col, default=None)

    sp = sub.add_parser("calendar-today", help="show today's (or a given date's) calendar rows")
    sp.add_argument("--date", default=None)

    sp = sub.add_parser("calendar-list", help="show every row in the calendar")

    sp = sub.add_parser("upload")
    sp.add_argument("local_path")

    sp = sub.add_parser("voice")
    sp.add_argument("--text", required=True)
    sp.add_argument("--emotion", default="happy")
    sp.add_argument("--speed", type=float, default=1.1)
    sp.add_argument("--out", required=True)

    sp = sub.add_parser("stt")
    sp.add_argument("--audio", required=True)

    sp = sub.add_parser("verify-voice", help="STT + automated pass/fail diff against the intended script")
    sp.add_argument("--audio", required=True)
    sp.add_argument("--text", required=True, help="the exact text passed to `voice`")

    sp = sub.add_parser("check-script", help="duration + banned-language pre-flight check")
    sp.add_argument("--text", required=True)

    sp = sub.add_parser("photo")
    sp.add_argument("--prompt", required=True)
    sp.add_argument("--images", required=True, help="comma-separated URLs")
    sp.add_argument("--out", required=True)
    sp.add_argument("--resolution", default=None)

    sp = sub.add_parser("identity-photo", help="Shanon in a named scene, using the locked identity refs")
    sp.add_argument("--scene", required=True, choices=list(SCENE_PROMPTS))
    sp.add_argument("--extra", default="", help="extra prompt detail, e.g. expression")
    sp.add_argument("--out", required=True)
    sp.add_argument("--resolution", default=None)

    sp = sub.add_parser("story-variants", help="N near-identical photos for a 'story time' sequence")
    sp.add_argument("--scene", required=True, choices=list(SCENE_PROMPTS))
    sp.add_argument("--base-photo", required=True, help="the one already-approved base photo")
    sp.add_argument("--count", type=int, default=5)
    sp.add_argument("--out-dir", required=True)
    sp.add_argument("--resolution", default=None)

    sp = sub.add_parser("realism")
    sp.add_argument("--in", dest="in_path", required=True)
    sp.add_argument("--out", required=True)

    sp = sub.add_parser("video")
    sp.add_argument("--image", required=True)
    sp.add_argument("--audio", required=True)
    sp.add_argument("--out", required=True)
    sp.add_argument("--prompt", default="")
    sp.add_argument("--resolution", default=None)
    sp.add_argument("--seed", type=int, default=-1)
    sp.add_argument("--local-audio-for-duration-check", default=None)

    sp = sub.add_parser("video-auto", help="video, auto-chunked+concatenated if audio is too long")
    sp.add_argument("--image", required=True)
    sp.add_argument("--audio", required=True, help="LOCAL path (not a URL) — needed to measure/slice")
    sp.add_argument("--out", required=True)
    sp.add_argument("--prompt", default="")
    sp.add_argument("--resolution", default=None)
    sp.add_argument("--seed", type=int, default=-1)

    sp = sub.add_parser("video-qc", help="video-auto + OCR caption check + automatic seed retry")
    sp.add_argument("--image", required=True)
    sp.add_argument("--audio", required=True)
    sp.add_argument("--out", required=True)
    sp.add_argument("--prompt", default="")
    sp.add_argument("--resolution", default=None)
    sp.add_argument("--max-seed-attempts", type=int, default=3)

    sp = sub.add_parser("slice-audio", help="slice a local audio file at silence points")
    sp.add_argument("--audio", required=True)
    sp.add_argument("--max-seconds", type=float, default=VIDEO_AUDIO_SAFE_MAX_SECONDS)
    sp.add_argument("--out-dir", required=True)

    sp = sub.add_parser("concat-videos")
    sp.add_argument("--videos", required=True, help="comma-separated local paths, in order")
    sp.add_argument("--out", required=True)

    sp = sub.add_parser("identity-check", help="compare a generated photo against the locked identity refs")
    sp.add_argument("--photo", required=True)
    sp.add_argument("--threshold", type=float, default=None)

    sp = sub.add_parser("full-video", help="the one command: script check -> photo -> voice -> video -> frames")
    sp.add_argument("--slug", required=True, help="short id for this video, used for the output folder name")
    sp.add_argument("--text", required=True)
    sp.add_argument("--scene", default="car", choices=list(SCENE_PROMPTS))
    sp.add_argument("--extra-photo-prompt", default="")
    sp.add_argument("--emotion", default="happy")
    sp.add_argument("--speed", type=float, default=1.1)
    sp.add_argument("--resolution", default=None)
    sp.add_argument("--seed", type=int, default=-1)
    sp.add_argument("--no-resume", action="store_true", help="ignore any previous meta.json, run everything fresh")

    sp = sub.add_parser("detect-captions", help="OCR check for the caption-hallucination bug")
    sp.add_argument("--video", required=True)

    sp = sub.add_parser("check-format", help="final aspect-ratio + duration check")
    sp.add_argument("--video", required=True)
    sp.add_argument("--aspect", default="9:16")

    sp = sub.add_parser("frames")
    sp.add_argument("--video", required=True)
    sp.add_argument("--out-grid", required=True)
    sp.add_argument("--fps", type=float, default=3)

    args = p.parse_args()

    if args.cmd == "balance":
        print(json.dumps({"balance_usd": check_balance()}, indent=2))
    elif args.cmd == "estimate-cost":
        cost = estimate_video_cost(
            num_photos=args.videos, num_voice_calls=args.videos,
            num_video_chunks=args.videos * args.chunks_per_video,
        )
        result = check_balance_sufficient(cost, warn_only=True)
        print(json.dumps(result, indent=2))
    elif args.cmd == "score-priority":
        result = score_priority(
            args.viral, args.relevance, args.freshness, args.credibility,
            args.originality, args.is_prono,
        )
        print(json.dumps(result, indent=2))
    elif args.cmd == "calendar-add":
        fields = {c: getattr(args, c) for c in CALENDAR_COLUMNS if getattr(args, c) is not None}
        row = append_calendar_row(**fields)
        print(json.dumps(row, indent=2, ensure_ascii=False))
    elif args.cmd == "calendar-today":
        rows = todays_calendar_entries(args.date)
        print(json.dumps(rows, indent=2, ensure_ascii=False))
    elif args.cmd == "calendar-list":
        print(json.dumps(read_calendar(), indent=2, ensure_ascii=False))
    elif args.cmd == "upload":
        print(upload_media(args.local_path))
    elif args.cmd == "voice":
        url = generate_voice(args.text, args.emotion, args.speed, args.out)
        print(url)
    elif args.cmd == "stt":
        print(verify_stt(args.audio))
    elif args.cmd == "verify-voice":
        result = verify_voice(args.audio, args.text)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if not result["pass"]:
            sys.exit(1)
    elif args.cmd == "check-script":
        report = check_script(args.text)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        if not report["ok"]:
            sys.exit(1)
    elif args.cmd == "photo":
        urls = args.images.split(",")
        url = generate_photo(args.prompt, urls, args.out, args.resolution)
        print(url)
    elif args.cmd == "identity-photo":
        url = generate_identity_photo(args.scene, args.extra, args.out, args.resolution)
        print(url)
    elif args.cmd == "story-variants":
        paths = generate_story_variants(
            args.scene, args.base_photo, args.count, args.out_dir, args.resolution
        )
        print("\n".join(paths))
    elif args.cmd == "realism":
        print(apply_realism_postprocess(args.in_path, args.out))
    elif args.cmd == "video":
        url = generate_video(
            args.image, args.audio, args.out, args.prompt, args.resolution, args.seed,
            local_audio_for_duration_check=args.local_audio_for_duration_check,
        )
        print(url)
    elif args.cmd == "identity-check":
        result = check_identity(args.photo, threshold=args.threshold)
        print(json.dumps(result, indent=2))
        if not result["pass"]:
            sys.exit(1)
    elif args.cmd == "video-auto":
        path = generate_video_auto(args.image, args.audio, args.out, args.prompt, args.resolution, args.seed)
        print(path)
    elif args.cmd == "video-qc":
        result = generate_video_with_qc(
            args.image, args.audio, args.out, args.prompt, args.resolution, args.max_seed_attempts,
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if not result["ok"]:
            sys.exit(1)
    elif args.cmd == "slice-audio":
        paths = slice_audio_at_silences(args.audio, args.max_seconds, args.out_dir)
        print("\n".join(paths))
    elif args.cmd == "concat-videos":
        path = concat_videos(args.videos.split(","), args.out)
        print(path)
    elif args.cmd == "full-video":
        report = run_full_video(
            args.slug, args.text, args.scene, args.extra_photo_prompt,
            args.emotion, args.speed, args.resolution, args.seed,
            resume=not args.no_resume,
        )
        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    elif args.cmd == "detect-captions":
        result = detect_burned_in_captions(args.video)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if result["caption_detected"]:
            sys.exit(1)
    elif args.cmd == "check-format":
        result = check_video_format(args.video, args.aspect)
        print(json.dumps(result, indent=2))
        if not result["ok"]:
            sys.exit(1)
    elif args.cmd == "frames":
        path, n = extract_frame_grid(args.video, args.out_grid, args.fps)
        print(f"{path} ({n} frames)")


if __name__ == "__main__":
    main()
