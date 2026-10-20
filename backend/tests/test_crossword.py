from tests.auth_support import setup_auth, make_client
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app


class CrosswordTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, 'caregiver')
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.people_path = self.root / "people.json"
        self.routine_path = self.root / "routines.json"
        self.journals_path = self.root / "video_journals.json"
        self.cache_path = self.root / "crosswords.json"
        self.chunks_path = self.root / "video_chunks"
        self.chunks_path.mkdir()
        self.people = [
            {"id": "meera", "name": "Meera", "relation": "Daughter"},
            {"id": "kiran", "name": "Kiran", "relation": "Friend"},
        ]
        self._write(self.people_path, self.people)
        self._write(self.routine_path, {"steps": ["Have tea", "Water flowers"]})
        self._write(self.journals_path, {})
        self.patches = [
            patch.object(app, "CROSSWORDS_PATH", str(self.cache_path)),
            patch.object(app, "VIDEO_CHUNKS_ROOT", str(self.chunks_path)),
            patch.object(app, "PEOPLE_FILE", str(self.people_path)),
            patch.object(app, "ROUTINES_PATH", str(self.routine_path)),
            patch.object(app, "JOURNALS_PATH", str(self.journals_path)),
        ]
        for item in self.patches:
            item.start()
        self.client = self.auth_client

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    @staticmethod
    def _write(path, value):
        with path.open("w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False)

    def test_candidate_words_must_be_in_sources_and_safe(self):
        candidates = [
            {"word": "ELEPHANTS", "clue": "The animals you saw up close"},
            {"word": "ELEPHANT", "clue": "The animal you saw up close"},
            {"word": "MEDICINE", "clue": "Something you saw"},
            {"word": "CAMERA", "clue": "What you used for your video"},
            {"word": "CAMERA", "clue": "What you used for your video"},
            {"word": "VLOG", "clue": "The video you made together"},
            {"word": "ZOO", "clue": "The place you visited"},
        ]
        valid = app._validate_crossword_candidates(candidates, ["elephants and camera at the zoo"], self.people)
        self.assertEqual([item["word"] for item in valid], ["ELEPHANTS", "CAMERA", "ZOO"])

    def test_fallback_without_key_uses_people_and_routine_words(self):
        with patch.object(app.client, "api_key", "not_configured"):
            response = self.client.get("/crossword?date=2026-10-14")
        self.assertEqual(response.status_code, 200)
        puzzle = response.get_json()
        self.assertTrue(puzzle["available"])
        words = {entry["word"] for entry in puzzle["entries"]}
        self.assertTrue({"MEERA", "KIRAN", "TEA", "WATER"}.issubset(words))
        self.assertTrue(all(entry["clue"].startswith(("Your ", "Something you do")) for entry in puzzle["entries"]))

    def test_same_date_returns_the_cached_puzzle(self):
        with patch.object(app.client, "api_key", "not_configured"):
            first = self.client.get("/crossword?date=2026-10-14").get_json()
            self._write(self.people_path, [{"id": "new", "name": "Newname", "relation": "Friend"}])
            second = self.client.get("/crossword?date=2026-10-14").get_json()
        self.assertEqual(first, second)

    def test_new_memory_invalidates_its_date_and_the_following_date(self):
        self._write(self.cache_path, {
            "2026-10-13": {"available": True},
            "2026-10-14": {"available": True},
            "2026-10-15": {"available": True},
        })
        app.invalidate_crossword_cache("2026-10-13")
        with self.cache_path.open(encoding="utf-8") as stream:
            cached = json.load(stream)
        self.assertEqual(cached, {"2026-10-15": {"available": True}})

    def test_invalid_date_is_rejected(self):
        self.assertEqual(self.client.get("/crossword?date=2026-02-30").status_code, 400)


if __name__ == "__main__":
    unittest.main()
