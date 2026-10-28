import json
from pathlib import Path
import unittest
from unittest.mock import patch

import app
import auth
from tests.auth_support import make_client, setup_auth


class MemoryFactsTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, 'caregiver')
        self.patient = self.auth_root / 'data' / 'test-patient'
        self.content = self.patient / 'content'
        self.chunks = self.patient / 'video_chunks'
        self.faces = self.patient / 'known_faces'
        self.content.mkdir(parents=True)
        (self.content / 'processing.mp4').write_bytes(b'processing-placeholder')
        (self.content / 'disabled.mp4').write_bytes(b'disabled-placeholder')
        self.chunks.mkdir(parents=True)
        self.faces.mkdir(parents=True)
        self.memory_id = 'a' * 32
        self.filename = 'zoo.mp4'
        (self.content / self.filename).write_bytes(b'video-placeholder')
        self.chunk_dir = self.chunks / 'zoo_chunks'
        self.chunk_dir.mkdir()
        (self.chunk_dir / 'full_transcript.json').write_text(json.dumps({'1': 'Asha saw a parade and lions.'}), encoding='utf-8')
        (self.chunk_dir / '1_faces.json').write_text(json.dumps({'1': ['person-1', 'deleted-person']}), encoding='utf-8')
        (self.patient / 'people.json').write_text(json.dumps([{'id': 'person-1', 'name': 'Asha'}]), encoding='utf-8')
        (self.patient / 'video_journals.json').write_text(json.dumps({self.filename: {
            'date': '2024-01-02', 'entry': 'Day at the zoo with Asha', 'title': 'Zoo visit',
        }}), encoding='utf-8')
        self.memories_path = self.patient / 'memories.json'
        self.memories_path.write_text(json.dumps({
            self.memory_id: {'filename': self.filename, 'title': 'Zoo visit', 'date': '2024-01-02',
                             'note': 'Day at the zoo with Asha', 'status': 'ready'},
            'b' * 32: {'filename': 'processing.mp4', 'title': 'Processing', 'status': 'processing'},
            'c' * 32: {'filename': 'disabled.mp4', 'title': 'Disabled', 'status': 'ready', 'useInGames': False},
        }), encoding='utf-8')
        self.overrides = []
        for name, value in (
            ('UPLOAD_FOLDER', str(self.content)), ('VIDEO_CHUNKS_ROOT', str(self.chunks)),
            ('KNOWN_FACES_FOLDER', str(self.faces)), ('PEOPLE_FILE', str(self.patient / 'people.json')),
            ('JOURNALS_PATH', str(self.patient / 'video_journals.json')),
            ('MEMORIES_PATH', str(self.memories_path)),
        ):
            item = patch.object(app, name, value); item.start(); self.addCleanup(item.stop)

    def test_facts_include_only_ready_enabled_memory_and_only_recognized_people(self):
        response = self.auth_client.get('/memories/facts')
        self.assertEqual(response.status_code, 200)
        facts = response.json['facts']
        self.assertEqual([item['id'] for item in facts], [self.memory_id])
        fact = facts[0]
        self.assertEqual(fact['weekday'], 'Tuesday')
        self.assertIn('zoo', fact['place'].lower())
        self.assertEqual(fact['people'], ['Asha'])
        self.assertNotIn('parade', fact['activity'].lower())
        self.assertTrue(json.loads(self.memories_path.read_text(encoding='utf-8'))[self.memory_id]['useInGames'])

    def test_use_in_games_can_be_changed_by_caregiver_but_not_device(self):
        response = self.auth_client.patch(f'/memories/{self.memory_id}', json={'useInGames': False})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['useInGames'])
        self.assertEqual(self.auth_client.get('/memories/facts').json['facts'], [])
        self.assertEqual(make_client('patient_device').patch(f'/memories/{self.memory_id}', json={'useInGames': True}).status_code, 403)
        response = self.auth_client.patch(f'/memories/{self.memory_id}', json={'useInGames': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.auth_client.get('/memories/facts').json['facts']), 1)

    def test_other_memory_id_is_not_visible_in_this_patient_scope(self):
        self.assertEqual(self.auth_client.get(f"/memories/{'d' * 32}").status_code, 404)


if __name__ == '__main__':
    unittest.main()
