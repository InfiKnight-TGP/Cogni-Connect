import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from cognitive_reports import (
    DOMAINS,
    GAME_REGISTRY,
    build_session_report,
    load_store,
    normalize_game_result,
    save_record,
)


class CognitiveReportTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = Path(self.temp_dir.name) / "performance_data.json"
        self.session_id = str(uuid4())

    def tearDown(self):
        self.temp_dir.cleanup()

    def result(self, game_id="story-builder", score=80, **overrides):
        payload = {
            "record_id": str(uuid4()),
            "session_id": self.session_id,
            "game_id": game_id,
            "score": score,
            "completed": True,
            "started_at": "2026-10-11T10:00:00Z",
            "completed_at": "2026-10-11T10:02:00Z",
            "metrics": {"correct_answers": 4, "total_questions": 5},
        }
        payload.update(overrides)
        return payload

    def test_registry_marks_unimplemented_games_unavailable(self):
        for game_id in ("my-day-recall", "sequence-memory", "pattern-switch"):
            self.assertFalse(GAME_REGISTRY[game_id]["playable"])
        self.assertEqual(GAME_REGISTRY["story-builder"]["primary_domain"], "Memory")
        self.assertEqual(GAME_REGISTRY["face-recognition"]["primary_domain"], "Recognition and Orientation")
        self.assertNotIn("Recognition and Orientation", GAME_REGISTRY["story-builder"]["domain_weights"])

    def test_incomplete_and_invalid_results_are_not_saved(self):
        with self.assertRaisesRegex(ValueError, "only completed"):
            normalize_game_result(self.result(completed=False))
        with self.assertRaisesRegex(ValueError, "allowed range"):
            normalize_game_result(self.result(score=101))
        with self.assertRaisesRegex(ValueError, "not currently playable"):
            normalize_game_result(self.result(game_id="my-day-recall"))

    def test_duplicate_submission_is_idempotent(self):
        payload = self.result(record_id="stable-id")
        first, created_first = save_record(self.path, payload)
        second, created_second = save_record(self.path, payload)
        self.assertTrue(created_first)
        self.assertFalse(created_second)
        self.assertEqual(first["record_id"], second["record_id"])
        self.assertEqual(len(load_store(self.path)["scores"]), 1)

    def test_session_domains_do_not_inherit_scores_without_evidence(self):
        save_record(self.path, self.result("story-builder", 80))
        save_record(self.path, self.result("attention-hunt", 60, metrics={
            "correct_answers": 3, "total_questions": 4, "false_selections": 2,
        }))
        report = build_session_report(load_store(self.path)["scores"], self.session_id)
        self.assertEqual(report["domains"]["Memory"]["score"], 80)
        self.assertEqual(report["domains"]["Attention"]["score"], 60)
        self.assertIsNone(report["domains"]["Executive Function"]["score"])
        self.assertIsNone(report["domains"]["Recognition and Orientation"]["score"])
        self.assertEqual(report["status"], "partial")
        self.assertEqual(report["games_completed"], 2)
        self.assertEqual(report["games_available"], 6)

    def test_latest_result_per_game_is_used_without_repeat_weighting(self):
        save_record(self.path, self.result("story-builder", 20, record_id="first", completed_at="2026-10-11T10:02:00Z"))
        save_record(self.path, self.result("story-builder", 80, record_id="second", completed_at="2026-10-11T10:03:00Z"))
        save_record(self.path, self.result("mole-path", 60))
        report = build_session_report(load_store(self.path)["scores"], self.session_id)
        self.assertEqual(report["domains"]["Memory"]["score"], 70)
        self.assertEqual(report["domains"]["Memory"]["game_count"], 2)

    def test_legacy_records_remain_readable_but_are_not_domain_scores(self):
        legacy = {"score": 56, "date": "2025-11-07T18:30:00Z", "timestamp": "2025-11-09T17:37:23Z"}
        self.path.write_text(json.dumps({"scores": [legacy]}), encoding="utf-8")
        loaded = load_store(self.path)
        self.assertEqual(loaded["scores"][0]["score"], 56)
        report = build_session_report(loaded["scores"], self.session_id)
        self.assertIsNone(report["overall_observed_score"])
        self.assertTrue(all(report["domains"][domain]["score"] is None for domain in DOMAINS))

    def test_task_mode_keeps_recall_and_recognition_separate(self):
        modes = GAME_REGISTRY["my-day-recall"]["task_domain_weights"]
        self.assertEqual(modes["free_recall"], {"Memory": 1.0})
        self.assertEqual(modes["familiar_choice"], {"Recognition and Orientation": 1.0})
        self.assertEqual(modes["mixed_recall_and_recognition"], {
            "Memory": 0.5, "Recognition and Orientation": 0.5,
        })

    def test_concurrent_appends_do_not_drop_records(self):
        payloads = [self.result(score=50 + index, record_id=f"concurrent-{index}") for index in range(20)]
        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(lambda payload: save_record(self.path, payload), payloads))
        self.assertEqual(len(load_store(self.path)["scores"]), 20)


if __name__ == "__main__":
    unittest.main()
