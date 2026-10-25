from tests.auth_support import setup_auth, make_client
import json
from datetime import date, timedelta
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from werkzeug.security import check_password_hash

import app


class SettingsTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, 'caregiver')
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.settings_path = root / "settings.json"
        self.plans_path = root / "daily_plans.json"
        self.perf_path = root / "performance_data.json"
        self.games_path = root / "games.json"
        self.settings_path.write_text(json.dumps({"patient_name": "Lakshmi"}), encoding="utf-8")
        self.plans_path.write_text("{}", encoding="utf-8")
        self.perf_path.write_text(json.dumps({"scores": [], "game_scores": []}), encoding="utf-8")
        self.games_path.write_text(json.dumps({"games": [
            {"id": "story-builder", "status": "ready", "levels": [1]},
            {"id": "mole-path", "status": "ready", "levels": [2]},
            {"id": "attention-hunt", "status": "ready", "levels": [3]},
            {"id": "face-recognition", "status": "ready", "levels": [1], "bundle": "daily_recall"},
        ]}), encoding="utf-8")
        self.patches = [
            patch.object(app, "SETTINGS_PATH", str(self.settings_path)),
            patch.object(app, "DAILY_PLANS_PATH", str(self.plans_path)),
            patch.object(app, "PERFORMANCE_PATH", str(self.perf_path)),
            patch.object(app, "GAMES_PATH", str(self.games_path)),
        ]
        for item in self.patches:
            item.start()
        self.client = self.auth_client

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def test_get_settings_defaults_language_to_english(self):
        response = self.client.get("/settings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"patient_name": "Lakshmi", "language": "en", "pins": []})
        self.assertNotIn("pin", response.get_json())
        self.assertNotIn("pin", json.loads(self.settings_path.read_text(encoding="utf-8")))

    def test_valid_language_is_saved_and_patient_name_handling_remains(self):
        response = self.client.post("/settings", json={"language": "hi", "patient_name": " Meera "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"patient_name": "Meera", "language": "hi", "pins": []})
        self.assertEqual(self.client.get("/settings").get_json()["language"], "hi")
        self.assertNotIn("pin", json.loads(self.settings_path.read_text(encoding="utf-8")))

    def test_invalid_language_is_rejected_without_saving(self):
        before = self.settings_path.read_text(encoding="utf-8")
        response = self.client.post("/settings", json={"language": "xx"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.settings_path.read_text(encoding="utf-8"), before)

    def test_pin_migration_unlock_and_change_require_current_pin(self):
        self.client = make_client("patient_device")
        self.assertEqual(self.client.post("/caregiver/unlock", json={"pin": "1234"}).status_code, 200)
        self.assertEqual(self.client.post("/caregiver/change-pin", json={"current_pin": "9999", "new_pin": "5678"}).status_code, 400)
        self.assertEqual(self.client.post("/caregiver/change-pin", json={"current_pin": "1234", "new_pin": "56x8"}).status_code, 400)
        self.assertEqual(self.client.post("/caregiver/change-pin", json={"current_pin": "1234", "new_pin": "5678"}).status_code, 200)
        self.assertEqual(self.client.post("/caregiver/unlock", json={"pin": "1234"}).status_code, 403)
        import db
        with app.api.app_context():
            stored = db.fetchone("SELECT pin_hash FROM patients WHERE id='test-patient'")[0]
        self.assertTrue(check_password_hash(stored, "5678"))

    def test_pins_validate_and_invalidate_unplayed_plans(self):
        start_date = date.today() + timedelta(days=1)
        start, end = start_date.isoformat(), (start_date + timedelta(days=6)).isoformat()
        later = (start_date + timedelta(days=8)).isoformat()
        self.plans_path.write_text(json.dumps({
            start: {"level1": ["daily_recall", "story-builder"], "level2": ["mole-path"], "level3": []},
            later: {"level1": ["daily_recall"]},
        }), encoding="utf-8")
        self.perf_path.write_text(json.dumps({"scores": [], "game_scores": [{"game_id": "story-builder", "date": later, "score": 81}]}), encoding="utf-8")
        valid = [{"game_id": "story-builder", "start": start, "end": end}]
        self.assertEqual(self.client.post("/settings", json={"pins": valid}).status_code, 200)
        remaining = json.loads(self.plans_path.read_text(encoding="utf-8"))
        self.assertNotIn(start, remaining)
        self.assertIn(later, remaining)
        two_valid = valid + [{"game_id": "mole-path", "start": start, "end": end}]
        self.assertEqual(self.client.post("/settings", json={"pins": two_valid}).status_code, 200)
        for invalid in (
            [{"game_id": "face-recognition", "start": start, "end": end}],
            valid + [{"game_id": "story-builder", "start": start, "end": end}],
            two_valid + [{"game_id": "attention-hunt", "start": start, "end": end}],
        ):
            self.assertEqual(self.client.post("/settings", json={"pins": invalid}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
