import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

import app


class PerformanceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = Path(self.temp_dir.name) / "performance_data.json"
        self.path.write_text(json.dumps({"scores": [], "game_scores": []}), encoding="utf-8")
        self.path_patch = patch.object(app, "PERFORMANCE_PATH", str(self.path))
        self.path_patch.start()
        self.client = app.api.test_client()

    def tearDown(self):
        self.path_patch.stop()
        self.temp_dir.cleanup()

    def read_data(self):
        return json.loads(self.path.read_text(encoding="utf-8"))

    def test_caregiver_source_is_rejected(self):
        response = self.client.post("/performance", json={
            "date": "2026-10-13", "game_id": "story-builder", "level": 1,
            "skill": "Memory", "score": 80, "source": "caregiver",
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.read_data(), {"scores": [], "game_scores": []})

    def test_new_records_have_ids_and_delete_removes_exactly_one(self):
        for game_id in ("story-builder", "plan-the-day"):
            response = self.client.post("/performance", json={
                "date": "2026-10-13", "game_id": game_id, "level": 1,
                "skill": "Memory", "score": 80, "source": "patient",
            })
            self.assertEqual(response.status_code, 200)
        rows = self.read_data()["game_scores"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(uuid.UUID(row["id"]) for row in rows))
        self.assertTrue(all(row["source"] == "patient" for row in rows))

        response = self.client.delete(f"/performance/{rows[0]['id']}")
        self.assertEqual(response.status_code, 200)
        remaining = self.read_data()["game_scores"]
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["id"], rows[1]["id"])
        self.assertEqual(self.client.delete(f"/performance/{rows[0]['id']}").status_code, 404)

    def test_old_records_receive_ids_once_and_backup_only_on_change(self):
        old = {
            "scores": [{"score": 70, "game_id": "daily_recall"}],
            "game_scores": [{"score": 80, "game_id": "story-builder"}, {"id": "kept", "score": 60}],
        }
        self.path.write_text(json.dumps(old), encoding="utf-8")
        with patch.object(app, "PERFORMANCE_PATH", str(self.path)):
            self.assertTrue(app._migrate_performance_record_ids())
            migrated = self.read_data()
            first_ids = [row["id"] for key in ("scores", "game_scores") for row in migrated[key]]
            self.assertEqual(first_ids[2], "kept")
            self.assertTrue(all(uuid.UUID(value) for value in first_ids[:2]))
            backups = list(self.path.parent.glob("performance_data.backup-*.json"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(json.loads(backups[0].read_text(encoding="utf-8")), old)

            self.assertFalse(app._migrate_performance_record_ids())
            self.assertEqual([row["id"] for key in ("scores", "game_scores") for row in self.read_data()[key]], first_ids)
            self.assertEqual(len(list(self.path.parent.glob("performance_data.backup-*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
