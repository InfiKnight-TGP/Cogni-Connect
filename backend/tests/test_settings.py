import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import app


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings_path = Path(self.temp_dir.name) / "settings.json"
        self.settings_path.write_text(
            json.dumps({"pin": "1234", "patient_name": "Lakshmi"}),
            encoding="utf-8",
        )
        self.settings_patch = patch.object(app, "SETTINGS_PATH", str(self.settings_path))
        self.settings_patch.start()
        self.client = app.api.test_client()

    def tearDown(self):
        self.settings_patch.stop()
        self.temp_dir.cleanup()

    def test_get_settings_defaults_language_to_english(self):
        response = self.client.get("/settings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"patient_name": "Lakshmi", "language": "en"})

    def test_valid_language_is_saved_and_patient_name_handling_remains(self):
        response = self.client.post("/settings", json={"language": "hi", "patient_name": " Meera "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"patient_name": "Meera", "language": "hi"})
        self.assertEqual(self.client.get("/settings").get_json()["language"], "hi")
        self.assertEqual(json.loads(self.settings_path.read_text(encoding="utf-8"))["pin"], "1234")

    def test_invalid_language_is_rejected_without_saving(self):
        response = self.client.post("/settings", json={"language": "xx"})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("language", json.loads(self.settings_path.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
