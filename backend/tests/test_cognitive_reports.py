from tests.auth_support import setup_auth, make_client
import json
import os
from pathlib import Path
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from cognitive_reports import (
    DOMAINS,
    GAME_REGISTRY,
    build_daily_plan,
    build_day_report,
    get_active_days,
    get_daily_plan,
    load_store,
    normalize_domain,
)


class CognitiveReportTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, 'caregiver')
        self.temp_dir = tempfile.TemporaryDirectory()
        self.perf_path = Path(self.temp_dir.name) / "performance_data.json"
        self.games_path = Path(self.temp_dir.name) / "games.json"
        self.plans_path = Path(self.temp_dir.name) / "daily_plans.json"
        self.settings_path = Path(self.temp_dir.name) / "settings.json"
        self.settings_path.write_text(json.dumps({"pins": []}), encoding="utf-8")
        self.perf_path.write_text(json.dumps({"scores": [], "game_scores": []}), encoding="utf-8")

        # Standard games.json mirroring production
        self.games_path.write_text(
            json.dumps({
                "games": [
                    {"id": "daily_recall", "levels": [1], "status": "ready", "area": "Recognition & Orientation / Memory"},
                    {"id": "face-recognition", "levels": [1], "status": "ready", "area": "Recognition & Orientation", "bundle": "daily_recall"},
                    {"id": "name-recognition", "levels": [1], "status": "ready", "area": "Recognition & Orientation"},
                    {"id": "context-recall", "levels": [1], "status": "ready", "area": "Memory", "bundle": "daily_recall"},
                    {"id": "story-builder", "levels": [1], "status": "ready", "area": "Memory"},
                    {"id": "plan-the-day", "levels": [1], "status": "ready", "area": "Executive Function"},
                    {"id": "word-association", "levels": [1], "status": "coming_soon", "area": "Memory"},
                    {"id": "odd-one-out", "levels": [1], "status": "coming_soon", "area": "Attention"},
                    {"id": "mole-path", "levels": [2], "status": "ready", "area": "Memory"},
                    {"id": "sorting-station", "levels": [2], "status": "ready", "area": "Executive Function"},
                    {"id": "whack-a-mole", "levels": [2], "status": "coming_soon", "area": "Attention"},
                    {"id": "attention-hunt", "levels": [3], "status": "ready", "area": "Attention"},
                    {"id": "map-navigator", "levels": [3], "status": "ready", "area": "Recognition & Orientation"},
                ]
            }),
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_domain_names_use_exact_four_names(self):
        self.assertEqual(
            DOMAINS,
            ("Memory", "Attention", "Executive Function", "Recognition & Orientation"),
        )
        self.assertEqual(normalize_domain("Recognition and Orientation"), "Recognition & Orientation")
        self.assertEqual(normalize_domain("Recognition & Orientation"), "Recognition & Orientation")

    def test_registry_playability_matches_built_games(self):
        for game_id in ("word-association", "whack-a-mole", "pill-box-planner"):
            self.assertFalse(GAME_REGISTRY[game_id]["playable"])
        for game_id in ("sound-tap", "memory-cards", "pattern-completion", "object-naming", "yesterday-quiz", "memory-crossword", "odd-one-out"):
            self.assertTrue(GAME_REGISTRY[game_id]["playable"])
        self.assertEqual(GAME_REGISTRY["story-builder"]["primary_domain"], "Memory")
        self.assertEqual(GAME_REGISTRY["face-recognition"]["primary_domain"], "Recognition & Orientation")
        self.assertEqual(GAME_REGISTRY["attention-hunt"]["primary_domain"], "Attention")
        self.assertEqual(GAME_REGISTRY["plan-the-day"]["primary_domain"], "Executive Function")

    def test_every_playable_game_score_counts_in_its_report_area(self):
        date_str = "2026-10-21"
        scores = [
            {"game_id": game_id, "score": 80, "date": date_str}
            for game_id, entry in GAME_REGISTRY.items()
            if entry["playable"] and game_id != "daily_recall"
        ]
        report = build_day_report(
            {"scores": [], "game_scores": scores},
            date_str,
            games_file=self.games_path,
            plans_file=self.plans_path,
            settings_file=self.settings_path,
            performance_file=self.perf_path,
        )
        for game_id, entry in GAME_REGISTRY.items():
            if entry["playable"] and game_id != "daily_recall":
                self.assertEqual(report["domains"][entry["primary_domain"]]["score"], 80, game_id)

    def test_domain_isolation_no_evidence_leaves_null(self):
        perf = {
            "scores": [],
            "game_scores": [
                {
                    "game_id": "story-builder",
                    "score": 80,
                    "date": "2026-10-11",
                    "timestamp": "2026-10-11T10:00:00Z",
                },
                {
                    "game_id": "attention-hunt",
                    "score": 60,
                    "date": "2026-10-11",
                    "timestamp": "2026-10-11T10:05:00Z",
                },
            ],
        }
        report = build_day_report(perf, "2026-10-11", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertEqual(report["domains"]["Memory"]["score"], 80)
        self.assertEqual(report["domains"]["Attention"]["score"], 60)
        self.assertIsNone(report["domains"]["Executive Function"]["score"])
        self.assertIsNone(report["domains"]["Recognition & Orientation"]["score"])
        self.assertEqual(report["status"], "partial")

    def test_latest_result_per_game_without_repeat_weighting(self):
        perf = {
            "scores": [],
            "game_scores": [
                {
                    "game_id": "story-builder",
                    "score": 20,
                    "date": "2026-10-11",
                    "timestamp": "2026-10-11T10:00:00Z",
                },
                {
                    "game_id": "story-builder",
                    "score": 80,
                    "date": "2026-10-11",
                    "timestamp": "2026-10-11T10:05:00Z",
                },
                {
                    "game_id": "mole-path",
                    "score": 60,
                    "date": "2026-10-11",
                    "timestamp": "2026-10-11T10:10:00Z",
                },
            ],
        }
        report = build_day_report(perf, "2026-10-11", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        # story-builder latest is 80, mole-path is 60 -> Memory mean = (80 + 60) / 2 = 70
        self.assertEqual(report["domains"]["Memory"]["score"], 70)
        self.assertEqual(report["domains"]["Memory"]["game_count"], 2)

    def test_daily_recall_breakdown_split(self):
        perf = {
            "scores": [
                {
                    "game_id": "daily_recall",
                    "score": 80,
                    "date": "2026-10-11",
                    "timestamp": "2026-10-11T09:00:00Z",
                    "breakdown": {
                        "activity1_faceRecognition": 80,
                        "activity2_namePeople": 90,
                        "activity3_contextQuestions": 70,
                    },
                }
            ],
            "game_scores": [],
        }
        report = build_day_report(perf, "2026-10-11", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        # Face Recognition (80) & Name Recall (90) count as ONE contribution (their average: 85)
        # game_count for R&O is 1 (Daily Recall)
        self.assertEqual(report["domains"]["Recognition & Orientation"]["score"], 85)
        self.assertEqual(report["domains"]["Recognition & Orientation"]["game_count"], 1)
        # Personal Memory Questions (70) -> Memory = 70
        self.assertEqual(report["domains"]["Memory"]["score"], 70)
        self.assertEqual(report["domains"]["Memory"]["game_count"], 1)

        # But in "games", Face Recognition and Name Recall remain separate rows
        names = {g["game_name"] for g in report["games"]}
        self.assertIn("Face Recognition", names)
        self.assertIn("Name Recall", names)
        self.assertIn("Personal Memory Questions", names)

    def test_daily_plan_never_selects_bundled_activities_as_extra_easy_game(self):
        bundled = {"face-recognition", "context-recall"}
        name_recall_seen = False
        for offset in range(90):
            date_str = (date(2026, 11, 1) + timedelta(days=offset)).isoformat()
            plan = build_daily_plan(date_str, games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
            self.assertEqual(plan["level1"][0], "daily_recall")
            self.assertEqual(len(plan["level1"]), 2)
            self.assertFalse(bundled.intersection(plan["level1"][1:]))
            name_recall_seen = name_recall_seen or "name-recognition" in plan["level1"][1:]
        self.assertTrue(name_recall_seen, "Name Recall should be eligible for the level-1 random pick")

    def test_future_plan_with_pin_is_computed_not_saved_and_pin_expires_after_seven_days(self):
        self.settings_path.write_text(json.dumps({"pins": [
            {"game_id": "story-builder", "start": "2026-10-14", "end": "2026-10-20"},
        ]}), encoding="utf-8")
        saved_tomorrow = {
            "level1": ["daily_recall", "plan-the-day"],
            "level2": ["mole-path", "sorting-station"],
            "level3": ["attention-hunt", "map-navigator"],
        }
        self.plans_path.write_text(json.dumps({"2026-10-14": saved_tomorrow}), encoding="utf-8")
        for offset in range(7):
            day = f"2026-10-{14 + offset:02d}"
            plan = build_daily_plan(day, games_file=self.games_path, plans_file=self.plans_path,
                                    settings_file=self.settings_path, performance_file=self.perf_path,
                                    today_str="2026-10-13")
            self.assertIn("story-builder", plan["level1"])
            self.assertNotIn("plan-the-day", plan["level1"])
        self.settings_path.write_text(json.dumps({"pins": []}), encoding="utf-8")
        baseline_after = build_daily_plan("2026-10-21", games_file=self.games_path, plans_file=self.plans_path,
                                          settings_file=self.settings_path, performance_file=self.perf_path,
                                          today_str="2026-10-13")
        self.settings_path.write_text(json.dumps({"pins": [
            {"game_id": "story-builder", "start": "2026-10-14", "end": "2026-10-20"},
        ]}), encoding="utf-8")
        after = build_daily_plan("2026-10-21", games_file=self.games_path, plans_file=self.plans_path,
                                 settings_file=self.settings_path, performance_file=self.perf_path,
                                 today_str="2026-10-13")
        self.assertEqual(after, baseline_after)
        persisted = json.loads(self.plans_path.read_text(encoding="utf-8"))
        self.assertEqual(persisted["2026-10-14"], saved_tomorrow)
        self.assertNotIn("2026-10-21", persisted)

    def test_new_daily_recall_games_count_individually_and_match_progress_area_score(self):
        perf = {
            "scores": [],
            "game_scores": [
                {"game_id": "face-recognition", "score": 80, "level": 1, "date": "2026-10-11"},
                {"game_id": "name-recognition", "score": 90, "level": 1, "date": "2026-10-11"},
                {"game_id": "context-recall", "score": 70, "level": 1, "date": "2026-10-11"},
                {"game_id": "map-navigator", "score": 60, "level": 3, "date": "2026-10-11"},
            ],
        }
        report = build_day_report(perf, "2026-10-11", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertEqual(report["domains"]["Recognition & Orientation"]["score"], 77)
        self.assertEqual(report["domains"]["Recognition & Orientation"]["game_count"], 3)
        self.assertEqual(report["domains"]["Memory"]["score"], 70)

    def test_daily_recall_bundle_requires_face_and_context_games(self):
        date_str = "2026-10-11"
        partial = {
            "scores": [],
            "game_scores": [
                {"game_id": "face-recognition", "score": 80, "level": 1, "date": date_str},
                {"game_id": "name-recognition", "score": 90, "level": 1, "date": date_str},
            ],
        }
        partial_report = build_day_report(partial, date_str, games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertIn("daily_recall", partial_report["missing_games"])

        complete = {
            "scores": [],
            "game_scores": [
                {"game_id": "face-recognition", "score": 80, "level": 1, "date": date_str},
                {"game_id": "context-recall", "score": 70, "level": 1, "date": date_str},
            ],
        }
        complete_report = build_day_report(complete, date_str, games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertNotIn("daily_recall", complete_report["missing_games"])

    def test_missing_games_tracked_from_daily_plan_not_entire_registry(self):
        # Determine that day's plan
        date_str = "2026-10-11"
        plan = build_daily_plan(date_str, games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        planned = []
        for lvl in ("level1", "level2", "level3"):
            for g in plan[lvl]:
                if g not in planned:
                    planned.append(g)

        # Complete only daily_recall
        perf = {
            "scores": [
                {
                    "game_id": "daily_recall",
                    "score": 85,
                    "date": date_str,
                    "timestamp": "2026-10-11T09:00:00Z",
                    "breakdown": {"activity1": 85},
                }
            ],
            "game_scores": [],
        }
        report = build_day_report(perf, date_str, games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)

        self.assertEqual(report["games_available"], len(planned))
        self.assertEqual(report["games_completed"], 1)
        # missing_games must only be the other planned games
        expected_missing = [g for g in planned if g != "daily_recall"]
        self.assertEqual(report["missing_games"], expected_missing)
        # Ensure it does NOT list all registry games (e.g. unselected or coming soon)
        self.assertNotIn("word-association", report["missing_games"])
        self.assertNotIn("whack-a-mole", report["missing_games"])

    def test_daily_plan_and_report_agree_on_planned_games(self):
        from app import api
        api.config["TESTING"] = True
        client = self.auth_client

        date_str = "2026-10-15"
        with patch.object(__import__("app"), "PERFORMANCE_PATH", str(self.perf_path)), \
             patch.object(__import__("app"), "SETTINGS_PATH", str(self.settings_path)), \
             patch.object(__import__("app"), "DAILY_PLANS_PATH", str(self.plans_path)), \
             patch.object(__import__("app"), "GAMES_PATH", str(self.games_path)):
            plan_res = client.get(f"/daily-plan?date={date_str}")
            self.assertEqual(plan_res.status_code, 200)
            plan_data = plan_res.get_json()

            planned_ids = []
            for lvl in ("level1", "level2", "level3"):
                for gid in plan_data.get(lvl, []):
                    if gid not in planned_ids:
                        planned_ids.append(gid)

            report_res = client.get(f"/reports/day?date={date_str}")
            self.assertEqual(report_res.status_code, 200)
            report_data = report_res.get_json()

        # Both agree on the number of available games and missing games
        self.assertEqual(report_data["games_available"], len(planned_ids))
        self.assertEqual(report_data["missing_games"], planned_ids)

        # If a plan was already saved, both agree on the saved plan
        custom_saved = {
            "2026-10-20": {
                "level1": ["daily_recall", "plan-the-day"],
                "level2": ["mole-path", "sorting-station"],
                "level3": ["attention-hunt", "map-navigator"],
            }
        }
        self.plans_path.write_text(json.dumps(custom_saved), encoding="utf-8")
        loaded_plan = build_daily_plan("2026-10-20", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertEqual(loaded_plan["level1"], ["daily_recall", "plan-the-day"])

        report_saved = build_day_report({"scores": [], "game_scores": []}, "2026-10-20", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        expected_custom = ["daily_recall", "plan-the-day", "mole-path", "sorting-station", "attention-hunt", "map-navigator"]
        self.assertEqual(report_saved["missing_games"], expected_custom)

    def test_no_overall_observed_score_and_real_duration_only(self):
        perf_without_times = {
            "scores": [],
            "game_scores": [
                {"game_id": "story-builder", "score": 80, "date": "2026-10-11"},
            ],
        }
        report1 = build_day_report(perf_without_times, "2026-10-11", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertNotIn("overall_observed_score", report1)
        self.assertIsNone(report1["duration_seconds"])

        perf_with_times = {
            "scores": [],
            "game_scores": [
                {
                    "game_id": "story-builder",
                    "score": 80,
                    "date": "2026-10-11",
                    "started_at": "2026-10-11T10:00:00Z",
                    "completed_at": "2026-10-11T10:05:00Z",
                },
                {
                    "game_id": "mole-path",
                    "score": 75,
                    "date": "2026-10-11",
                    "started_at": "2026-10-11T10:06:00Z",
                    "completed_at": "2026-10-11T10:12:00Z",
                },
            ],
        }
        report2 = build_day_report(perf_with_times, "2026-10-11", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        self.assertNotIn("overall_observed_score", report2)
        # 10:00:00 to 10:12:00 = 12 minutes = 720 seconds
        self.assertEqual(report2["duration_seconds"], 720)

    def test_legacy_records_remain_readable_but_are_not_domain_scores(self):
        legacy = {
            "scores": [{"score": 56, "date": "2025-11-07T18:30:00.000Z", "timestamp": "2025-11-09T17:37:23Z"}],
            "game_scores": [],
        }
        report = build_day_report(legacy, "2025-11-08", games_file=self.games_path, plans_file=self.plans_path, settings_file=self.settings_path, performance_file=self.perf_path)
        for domain in DOMAINS:
            self.assertIsNone(report["domains"][domain]["score"])
        self.assertEqual(report["status"], "empty")

    def test_get_active_days(self):
        self.perf_path.write_text(
            json.dumps({
                "scores": [
                    {"score": 80, "date": "2026-10-09"},
                    {"score": 90, "date": "2026-10-08"},
                ],
                "game_scores": [
                    {"game_id": "mole-path", "score": 85, "date": "2026-10-09"},
                    {"game_id": "plan-the-day", "score": 70, "date": "2026-10-05"},
                ],
            }),
            encoding="utf-8",
        )
        days = get_active_days(self.perf_path)
        self.assertEqual(days, ["2026-10-09", "2026-10-08", "2026-10-05"])

    def test_flask_endpoints(self):
        from app import api
        api.config["TESTING"] = True
        client = self.auth_client

        with patch.object(__import__("app"), "PERFORMANCE_PATH", str(self.perf_path)), \
             patch.object(__import__("app"), "SETTINGS_PATH", str(self.settings_path)), \
             patch.object(__import__("app"), "DAILY_PLANS_PATH", str(self.plans_path)), \
             patch.object(__import__("app"), "GAMES_PATH", str(self.games_path)):
            res_days = client.get("/reports/days")
            self.assertEqual(res_days.status_code, 200)
            self.assertIn("days", res_days.get_json())

            res_day = client.get("/reports/day?date=2026-10-09")
            self.assertEqual(res_day.status_code, 200)
            data = res_day.get_json()
            self.assertEqual(data["date"], "2026-10-09")
            self.assertIn("domains", data)
            self.assertIn("missing_games", data)
            self.assertNotIn("overall_observed_score", data)

            res_missing = client.get("/reports/day")
            self.assertEqual(res_missing.status_code, 400)


if __name__ == "__main__":
    unittest.main()
