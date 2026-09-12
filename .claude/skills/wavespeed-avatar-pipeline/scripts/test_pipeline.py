#!/usr/bin/env python3
"""
Regression tests for the three defects found by the 2026-08-23 static audit
of pipeline.py / full-video. Pure unit tests only: no real WaveSpeed/
ElevenLabs API calls, no network. Run with:

    python3 test_pipeline.py

Each test targets one audited behavior:
  - test_seed_is_actually_used_on_first_attempt   (bug 1: dead --seed)
  - test_warn_only_true_still_hard_stops_with_detail
  - test_warn_only_false_still_hard_stops          (both sides of bug 2)
  - test_estimate_cost_style_warn_only_does_not_exit (the genuine warn-only use)
  - test_module_docstring_has_no_dangling_reference_docs (bug 3)
"""
import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

import pipeline


class SeedThreadingTests(unittest.TestCase):
    """Bug 1: `full-video --seed N` was silently ignored — the seed never
    reached generate_video_auto. generate_video_with_qc must use the
    caller-provided seed on the first attempt."""

    def test_seed_is_actually_used_on_first_attempt(self):
        with mock.patch.object(pipeline, "generate_video_auto") as m_gen, \
             mock.patch.object(pipeline, "detect_burned_in_captions") as m_ocr:
            m_ocr.return_value = {"caption_detected": False, "frames_with_text": 0, "hits": []}

            result = pipeline.generate_video_with_qc(
                "https://img.example/x.jpg", "/tmp/fake_audio.mp3", "/tmp/fake_out.mp4",
                seed=123456789,
            )

        self.assertTrue(result["ok"])
        self.assertEqual(m_gen.call_count, 1)
        used_seed = m_gen.call_args[0][5]  # generate_video_auto(image, audio, out, prompt, resolution, seed, chunk_dir)
        self.assertEqual(
            used_seed, 123456789,
            "generate_video_with_qc did not forward the caller's seed to generate_video_auto",
        )

    def test_default_seed_is_still_minus_one(self):
        """No regression for existing callers (e.g. the `video-qc` CLI
        command) that never pass a seed at all."""
        with mock.patch.object(pipeline, "generate_video_auto") as m_gen, \
             mock.patch.object(pipeline, "detect_burned_in_captions") as m_ocr:
            m_ocr.return_value = {"caption_detected": False, "frames_with_text": 0, "hits": []}
            pipeline.generate_video_with_qc(
                "https://img.example/x.jpg", "/tmp/fake_audio.mp3", "/tmp/fake_out.mp4",
            )
        used_seed = m_gen.call_args[0][5]
        self.assertEqual(used_seed, -1)

    def test_retry_after_caption_hit_still_randomizes_not_the_requested_seed(self):
        """A retry exists specifically to get something DIFFERENT from a
        failed attempt — it must not just resubmit the same requested seed."""
        with mock.patch.object(pipeline, "generate_video_auto") as m_gen, \
             mock.patch.object(pipeline, "detect_burned_in_captions") as m_ocr, \
             mock.patch("random.randint", return_value=999) as m_rand:
            m_ocr.side_effect = [
                {"caption_detected": True, "frames_with_text": 2, "hits": [{"text": "x"}]},
                {"caption_detected": False, "frames_with_text": 0, "hits": []},
            ]
            result = pipeline.generate_video_with_qc(
                "https://img.example/x.jpg", "/tmp/fake_audio.mp3", "/tmp/fake_out.mp4",
                seed=42,
            )
        self.assertTrue(result["ok"])
        self.assertEqual(m_gen.call_count, 2)
        first_seed = m_gen.call_args_list[0][0][5]
        second_seed = m_gen.call_args_list[1][0][5]
        self.assertEqual(first_seed, 42, "first attempt must use the requested seed")
        self.assertEqual(second_seed, 999, "retry must randomize, not reuse the requested seed")
        self.assertTrue(m_rand.called)


class RunFullVideoSeedForwardingTests(unittest.TestCase):
    """The audit's bug 1 complaint was specifically about run_full_video's
    own `--seed` being dropped — SeedThreadingTests above only proves
    generate_video_with_qc itself is correct in isolation. This exercises
    the actual line run_full_video runs, with every other step mocked out
    (balance/photo/voice/QC/frames/format), so the assertion is on
    run_full_video's real call to generate_video_with_qc, not a re-test of
    the lower-level function."""

    def _touch(self, path):
        with open(path, "w") as f:
            f.write("x")

    def _fake_extract_frame_grid(self, video, grid, fps=3):
        self._touch(grid)
        return grid, 1

    def test_run_full_video_forwards_its_seed_to_generate_video_with_qc(self):
        slug, date = "test-seed-forward-slug", "1999-01-02"
        with tempfile.TemporaryDirectory() as tmp_output_root:
            with mock.patch.object(pipeline, "OUTPUT_ROOT", tmp_output_root):
                paths = pipeline.output_paths(slug, date)

            def qc_side_effect(*a, **kw):
                self._touch(paths["video"])
                return {"ok": True, "attempts": 1, "ocr": {"caption_detected": False}, "path": paths["video"]}

            with mock.patch.object(pipeline, "OUTPUT_ROOT", tmp_output_root), \
                 mock.patch.object(pipeline, "check_balance", return_value=100.0), \
                 mock.patch.object(pipeline, "generate_identity_photo",
                                    side_effect=lambda scene, extra, out, res, profile: self._touch(out)), \
                 mock.patch.object(pipeline, "apply_realism_postprocess",
                                    side_effect=lambda inp, outp: self._touch(outp) or outp), \
                 mock.patch.object(pipeline, "check_identity",
                                    return_value={"pass": True, "best_score": 0.9, "threshold": 0.35, "scores": {}}), \
                 mock.patch.object(pipeline, "cached_upload", return_value="https://fake.example/photo.jpg"), \
                 mock.patch.object(pipeline, "generate_voice",
                                    side_effect=lambda text, emotion, speed, out: self._touch(out)), \
                 mock.patch.object(pipeline, "check_generated_voice_duration",
                                    return_value={"ok": True, "real_duration_seconds": 17.0,
                                                  "target_range": list(pipeline.SCRIPT_DURATION_TARGET_SECONDS)}), \
                 mock.patch.object(pipeline, "verify_voice",
                                    return_value={"pass": True, "similarity": 1.0, "threshold": 0.9,
                                                  "number_error": False, "differences": [], "transcript": "x"}), \
                 mock.patch.object(pipeline, "generate_video_with_qc", side_effect=qc_side_effect) as m_qc, \
                 mock.patch.object(pipeline, "extract_frame_grid", side_effect=self._fake_extract_frame_grid), \
                 mock.patch.object(pipeline, "check_video_format", return_value={"ok": True}):
                filler_text = " ".join(["mot"] * 70)  # ~27s at FRENCH_WORDS_PER_SECOND, inside the 14-50s target
                pipeline.run_full_video(slug, filler_text, date=date, seed=987654321)

            self.assertEqual(m_qc.call_count, 1)
            self.assertEqual(
                m_qc.call_args.kwargs.get("seed"), 987654321,
                "run_full_video did not forward its own --seed to generate_video_with_qc",
            )


class RunFullVideoBalanceGateTests(unittest.TestCase):
    """Bug 2: run_full_video used to call check_balance_sufficient(...,
    warn_only=True) directly, which read as "just warn, keep going" even
    though the surrounding record() helper always sys.exit()s on ok=False.
    The fix renames this into its own function,
    check_balance_hard_stop_if_insufficient(), so the intent (always a hard
    stop here, never a soft warning) is visible in the code itself, not
    hidden behind a misleadingly-named flag. This locks in the actual
    (correct, intentional) behavior: a hard stop, with the full structured
    balance detail written to meta.json — not just a bare exit string — so a
    future edit can't quietly turn this into a silent-continue path without
    a test failing."""

    def test_named_function_is_a_real_hard_stop_not_a_warning(self):
        """The rename itself is tested directly: calling the new named
        function with an insufficient mocked balance must still return
        ok=False (never exit internally) so run_full_video's record() is the
        one and only place that decides to stop."""
        with mock.patch.object(pipeline, "check_balance", return_value=0.0):
            result = pipeline.check_balance_hard_stop_if_insufficient()
        self.assertFalse(result["ok"])
        self.assertIn("balance", result)
        self.assertIn("estimated_cost", result)

    def _run_with_mocked_balance(self, balance_value):
        with tempfile.TemporaryDirectory() as tmp_output_root:
            with mock.patch.object(pipeline, "OUTPUT_ROOT", tmp_output_root), \
                 mock.patch.object(pipeline, "check_balance", return_value=balance_value):
                with self.assertRaises(SystemExit):
                    pipeline.run_full_video(
                        "test-balance-gate-slug", "un texte de test quelconque pour ce cas.",
                        date="1999-01-01",
                    )
                meta_path = os.path.join(
                    tmp_output_root, "1999-01-01", "test-balance-gate-slug", "meta.json",
                )
                with open(meta_path) as f:
                    report = json.load(f)
        return report

    def test_insufficient_balance_hard_stops_with_structured_detail(self):
        report = self._run_with_mocked_balance(0.0)
        self.assertEqual(report["failed_at"], "check_balance")
        detail = report["steps"]["check_balance"]["detail"]
        self.assertIn("balance", detail)
        self.assertIn("estimated_cost", detail)
        self.assertFalse(detail["ok"])

    def test_estimate_cost_cli_style_warn_only_does_not_exit(self):
        """The genuine warn-only use (the `estimate-cost` CLI command calls
        check_balance_sufficient directly, with no record() wrapper) really
        must NOT exit — this is what the parameter name is actually for."""
        with mock.patch.object(pipeline, "check_balance", return_value=0.0):
            result = pipeline.check_balance_sufficient(1.0, warn_only=True)
        self.assertFalse(result["ok"])  # reported, not swallowed
        # no SystemExit raised — reaching this line is the assertion


class ScriptDurationRangeTests(unittest.TestCase):
    """2026-08-23: the user corrected the target range after the first real
    LTX test used a script that was deliberately short for A/B testing
    (~8-12s) but got treated as if that were the real content target. Real
    Shanon videos should run 14-50s real seconds, sized to content (14-20s
    quick reaction/simple info, 20-35s short developed idea, 35-50s more
    context/analysis) — never padded or cut just to hit a number. Pins the
    actual tuple so a future edit can't silently drift back to the old,
    too-short range."""

    def test_target_range_is_the_corrected_14_to_50_range(self):
        self.assertEqual(pipeline.SCRIPT_DURATION_TARGET_SECONDS, (14, 50))


class VoiceDurationGateTests(unittest.TestCase):
    """Run #1 (2026-08-23) finding: check_script's pre-flight duration is
    only a word-count ESTIMATE — the real generated voice.mp3 came out at
    10.55s against an estimated 16.9s, and this wasn't caught until the
    very last pipeline step (format_check), after the most expensive step
    (video generation) had already run. Fix: measure the REAL voice.mp3
    duration right after generate_voice and stop there — before video
    generation — if it's outside SCRIPT_DURATION_TARGET_SECONDS."""

    def test_check_generated_voice_duration_fails_on_the_real_measured_case(self):
        """Uses the exact real number observed in run #1 (10.55s) — not a
        synthetic value — so this test is anchored to what actually
        happened, not a guess at what might happen."""
        with mock.patch.object(pipeline, "_audio_duration_seconds", return_value=10.55):
            result = pipeline.check_generated_voice_duration("/tmp/fake_voice.mp3")
        self.assertFalse(result["ok"])
        self.assertEqual(result["real_duration_seconds"], 10.55)
        self.assertEqual(result["target_range"], list(pipeline.SCRIPT_DURATION_TARGET_SECONDS))

    def test_check_generated_voice_duration_passes_when_in_range(self):
        with mock.patch.object(pipeline, "_audio_duration_seconds", return_value=17.0):
            result = pipeline.check_generated_voice_duration("/tmp/fake_voice.mp3")
        self.assertTrue(result["ok"])

    def test_check_generated_voice_duration_fails_closed_when_unreadable(self):
        """ffmpeg returning no Duration line (_audio_duration_seconds ->
        None) must not be treated as a pass."""
        with mock.patch.object(pipeline, "_audio_duration_seconds", return_value=None):
            result = pipeline.check_generated_voice_duration("/tmp/fake_voice.mp3")
        self.assertFalse(result["ok"])


class RunFullVideoStopsBeforeExpensiveVideoOnBadDurationTests(unittest.TestCase):
    """The actual bug: run #1 discovered the duration problem only at the
    final format_check, after paying for video generation. This proves the
    new gate stops the run BEFORE generate_video_with_qc is ever called."""

    def _touch(self, path):
        with open(path, "w") as f:
            f.write("x")

    def test_stops_before_generate_video_with_qc_on_bad_real_duration(self):
        slug, date = "test-voice-duration-gate-slug", "1999-01-03"
        with tempfile.TemporaryDirectory() as tmp_output_root:
            with mock.patch.object(pipeline, "OUTPUT_ROOT", tmp_output_root), \
                 mock.patch.object(pipeline, "check_balance", return_value=100.0), \
                 mock.patch.object(pipeline, "generate_identity_photo",
                                    side_effect=lambda scene, extra, out, res, profile: self._touch(out)), \
                 mock.patch.object(pipeline, "apply_realism_postprocess",
                                    side_effect=lambda inp, outp: self._touch(outp) or outp), \
                 mock.patch.object(pipeline, "check_identity",
                                    return_value={"pass": True, "best_score": 0.9, "threshold": 0.35, "scores": {}}), \
                 mock.patch.object(pipeline, "cached_upload", return_value="https://fake.example/photo.jpg"), \
                 mock.patch.object(pipeline, "generate_voice",
                                    side_effect=lambda text, emotion, speed, out: self._touch(out)), \
                 mock.patch.object(pipeline, "_audio_duration_seconds", return_value=10.55), \
                 mock.patch.object(pipeline, "verify_voice") as m_verify, \
                 mock.patch.object(pipeline, "generate_video_with_qc") as m_qc:
                filler_text = " ".join(["mot"] * 70)
                with self.assertRaises(SystemExit):
                    pipeline.run_full_video(slug, filler_text, date=date)

            meta_path = os.path.join(tmp_output_root, date, slug, "meta.json")
            with open(meta_path) as f:
                report = json.load(f)

        self.assertEqual(report["failed_at"], "check_voice_duration")
        self.assertEqual(report["steps"]["check_voice_duration"]["detail"]["real_duration_seconds"], 10.55)
        self.assertFalse(m_verify.called, "verify_voice (STT) must not run once the real duration already fails")
        self.assertFalse(m_qc.called, "generate_video_with_qc must never run once the real duration already fails")


class AspectRatioToleranceTests(unittest.TestCase):
    """Run #1 finding: a real "1080p" request came back 1024x1920, not
    1080x1920 (5.19% off literal 9:16). Investigated: WaveSpeed's own docs
    for this model name 480p/720p/1080p only as price/quality tiers, never
    promise exact pixel dimensions — no evidence of a request-side mistake.
    Tolerance is widened specifically to cover this one real measurement
    plus a small margin, NOT loosened arbitrarily — and must still reject a
    genuinely wrong shape (e.g. an accidental 16:9 landscape frame)."""

    def test_real_observed_1024x1920_is_accepted(self):
        self.assertTrue(pipeline._aspect_ratio_ok(1024, 1920, "9:16"))

    def test_exact_1080x1920_is_still_accepted(self):
        self.assertTrue(pipeline._aspect_ratio_ok(1080, 1920, "9:16"))

    def test_genuine_landscape_16_9_is_still_rejected(self):
        self.assertFalse(pipeline._aspect_ratio_ok(1920, 1080, "9:16"))

    def test_a_much_squarer_frame_is_still_rejected(self):
        self.assertFalse(pipeline._aspect_ratio_ok(1200, 1500, "9:16"))


class DocstringReferenceTests(unittest.TestCase):
    """Bug 3: the module docstring pointed at
    ../references/locked_recipe.md, which does not exist. Regression guard:
    any ../references/*.md path mentioned in the module docstring must
    resolve to a real file, so a dangling reference can't creep back in."""

    def test_module_docstring_has_no_dangling_reference_docs(self):
        doc = pipeline.__doc__ or ""
        referenced = re.findall(r"\.\./references/[\w\-./]+\.(?:md|json)", doc)
        self.assertTrue(referenced, "expected at least one ../references/... mention in the docstring")
        for rel in referenced:
            resolved = os.path.normpath(os.path.join(pipeline.SCRIPT_DIR, rel))
            self.assertTrue(
                os.path.exists(resolved),
                f"docstring references '{rel}' but {resolved} does not exist",
            )


if __name__ == "__main__":
    unittest.main()
