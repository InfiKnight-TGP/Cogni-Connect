import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import app
import auth
import db
from patient_storage import FOLDERS, initialize_patient


class MemoryAskTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        def _cleanup():
            db.close_connection()
            temp.cleanup()
        self.addCleanup(_cleanup)
        self.root = Path(temp.name)
        self.legacy = self.root / 'legacy'
        self.legacy.mkdir()
        for folder in FOLDERS:
            (self.legacy / folder).mkdir(parents=True, exist_ok=True)
        self.public = self.root / 'public'
        (self.public / 'video_chunks').mkdir(parents=True, exist_ok=True)

        config = patch.dict(app.api.config, {
            'TESTING': True,
            'AUTH_DATABASE': str(self.root / 'auth.db'),
            'PATIENT_DATA_ROOT': str(self.root / 'data'),
            'LEGACY_DATA_ROOT': str(self.legacy),
            'MIGRATION_BACKUP_ROOT': str(self.root / 'backup'),
            'LEGACY_PUBLIC_ROOT': str(self.public),
            'STORAGE_MIGRATION': True,
            'AUTH_COOKIE_SECURE': False,
        })
        config.start()
        self.addCleanup(config.stop)

        limiter = patch.dict(app.api.extensions, {'auth_limits': auth.RateLimits()})
        limiter.start()
        self.addCleanup(limiter.stop)

        self.client = app.api.test_client()
        self.patient_a = 'patient-a'
        self.base_a = self.root / 'data' / self.patient_a
        self.base_b = self.root / 'data' / 'patient-b'
        initialize_patient(self.base_a, 'A')
        initialize_patient(self.base_b, 'B')

        with app.api.app_context():
            connection = auth.db()
            connection.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo) VALUES ('owner-a','a@example.com','A','unused',0,0,0,0)")
            connection.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo) VALUES ('owner-b','b@example.com','B','unused',0,0,1,0)")
            connection.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?, 'A', NULL, 'owner-a', 0, 0)", (self.patient_a,))
            connection.execute("INSERT INTO patient_members VALUES (?,'owner-a','owner')", (self.patient_a,))
            connection.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES ('patient-b','B',NULL,'owner-b',1,0)")
            connection.execute("INSERT INTO patient_members VALUES ('patient-b','owner-b','owner')")
            token_a, _ = auth.new_session('caregiver', user_id='owner-a')
            token_b, _ = auth.new_session('caregiver', user_id='owner-b')

        self.client.set_cookie('cogni_session', token_a)
        self.client_b = app.api.test_client()
        self.client_b.set_cookie('cogni_session', token_b)



        # Set up patient A with demo zoo memory
        self.memory_id = 'zoo-memory-123'
        memories = {
            self.memory_id: {
                'filename': 'Me_at_the_zoo.mp4',
                'title': 'Me at the zoo',
                'date': '2026-10-23',
                'note': 'A day at the zoo, looking at the elephants',
                'status': 'ready',
            }
        }
        (self.base_a / 'memories.json').write_text(json.dumps(memories, ensure_ascii=False), encoding='utf-8')
        (self.base_a / 'content' / 'Me_at_the_zoo.mp4').write_bytes(b'video')

        chunks_dir = self.base_a / 'video_chunks' / 'Me_at_the_zoo_chunks'
        chunks_dir.mkdir(parents=True, exist_ok=True)
        (chunks_dir / 'chunk_0000_0010.mp4').write_bytes(b'chunk')
        (chunks_dir / 'full_transcript.json').write_text(
            json.dumps(['The cool thing about these guys is that they have really really really long trunks. That is cool.']),
            encoding='utf-8'
        )
        (chunks_dir / 'chunk_0000_0010_faces.json').write_text(
            json.dumps({'0': ['jawed_karim']}),
            encoding='utf-8'
        )
        (self.base_a / 'people.json').write_text(
            json.dumps([{'id': 'jawed_karim', 'name': 'Jawed Karim', 'photo': 'jawed.jpg'}]),
            encoding='utf-8'
        )

        # Set up patient B with separate memory
        self.memory_b_id = 'patient-b-mem'
        memories_b = {
            self.memory_b_id: {
                'filename': 'b.mp4',
                'title': 'Private B',
                'date': '2026-01-01',
                'note': 'Private video',
                'status': 'ready',
            }
        }
        (self.base_b / 'memories.json').write_text(json.dumps(memories_b, ensure_ascii=False), encoding='utf-8')
        (self.base_b / 'content' / 'b.mp4').write_bytes(b'video b')

    def test_tell_me_about_me_at_the_zoo_scope_all(self):
        res = self.client.post('/memories/ask', json={
            'question': 'Tell me about Me at the zoo',
            'scope': 'all'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['grounded'])
        self.assertIn('zoo', data['answer'].lower())
        self.assertIn('elephants', data['answer'].lower())
        self.assertIn('Jawed Karim is in this video.', data['answer'])
        self.assertEqual(len(data['sources']), 1)
        source = data['sources'][0]
        self.assertEqual(source['memory_id'], self.memory_id)
        self.assertEqual(source['title'], 'Me at the zoo')
        self.assertEqual(source['date'], '2026-10-23')
        self.assertTrue(source['dateLabel'] in ('today', 'Friday 23 October'))

    def test_tell_me_about_scope_memory(self):
        res = self.client.post('/memories/ask', json={
            'question': 'Tell me about Me at the zoo',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['grounded'])
        self.assertIn('Jawed Karim is in this video.', data['answer'])
        self.assertEqual(len(data['sources']), 1)
        self.assertEqual(data['sources'][0]['memory_id'], self.memory_id)

    def test_additional_about_intents(self):
        questions = [
            'tell me about this video',
            'describe this',
            'what happened here',
            'Tell me about Me at the zoo',
        ]
        for q in questions:
            res = self.client.post('/memories/ask', json={
                'question': q,
                'scope': 'memory',
                'memory_id': self.memory_id
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data['grounded'], f"Expected grounded:true for query: {q}")
            self.assertIn('zoo', data['answer'].lower())

    def test_who_is_in_it_scope_memory(self):
        res = self.client.post('/memories/ask', json={
            'question': 'Who is in it?',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['grounded'])
        self.assertEqual(data['answer'], 'Jawed Karim was in this video.')
        self.assertEqual(len(data['sources']), 1)

    def test_unanswerable_question_in_scope_memory_returns_grounded_false_plus_summary(self):
        res = self.client.post('/memories/ask', json={
            'question': 'What did I eat?',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data['grounded'])
        self.assertEqual(data['answer'], "I couldn't find that in this memory.")
        self.assertIn('summary', data)
        self.assertIn('zoo', data['summary'].lower())
        self.assertIn('Jawed Karim is in this video.', data['summary'])
        self.assertEqual(data['sources'], [])

    def test_unanswerable_question_in_scope_all_returns_grounded_false_without_sources(self):
        res = self.client.post('/memories/ask', json={
            'question': 'What did I eat in Paris?',
            'scope': 'all'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data['grounded'])
        self.assertEqual(data['answer'], "I couldn't find that in your memories.")
        self.assertEqual(data['sources'], [])

    def test_another_patient_memory_id_returns_404(self):
        # Requesting patient B's memory while logged in as patient A
        res = self.client.post('/memories/ask', json={
            'question': 'Who is in it?',
            'scope': 'memory',
            'memory_id': self.memory_b_id
        })
        self.assertEqual(res.status_code, 404)

        # Invalid random id
        res = self.client.post('/memories/ask', json={
            'question': 'Who is in it?',
            'scope': 'memory',
            'memory_id': 'non-existent-id'
        })
        self.assertEqual(res.status_code, 404)

    def test_plain_utf8_round_trip_no_lost_characters(self):
        res = self.client.post('/memories/ask', json={
            'question': 'Tell me about Me at the zoo',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res.status_code, 200)
        raw_json_bytes = json.dumps(res.get_json(), ensure_ascii=False).encode('utf-8')
        decoded = json.loads(raw_json_bytes.decode('utf-8'))
        self.assertNotIn('?', decoded['answer'])
        self.assertNotIn('?', decoded['sources'][0]['dateLabel'])
        self.assertNotIn('?', decoded['sources'][0]['title'])
        # Verify exact round trip
        self.assertEqual(decoded, res.get_json())

    def test_capital_of_france_gives_grounded_false_both_scopes(self):
        # Scope all
        res_all = self.client.post('/memories/ask', json={
            'question': 'What is the capital of France?',
            'scope': 'all'
        })
        self.assertEqual(res_all.status_code, 200)
        data_all = res_all.get_json()
        self.assertFalse(data_all['grounded'])
        self.assertEqual(data_all['answer'], "I couldn't find that in your memories.")
        self.assertEqual(data_all['sources'], [])

        # Scope memory
        res_mem = self.client.post('/memories/ask', json={
            'question': 'What is the capital of France?',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res_mem.status_code, 200)
        data_mem = res_mem.get_json()
        self.assertFalse(data_mem['grounded'])
        self.assertEqual(data_mem['answer'], "I couldn't find that in this memory.")
        self.assertEqual(data_mem['sources'], [])

    def test_what_animal_was_behind_him_still_answers_about_elephants(self):
        res = self.client.post('/memories/ask', json={
            'question': 'What animal was behind him?',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['grounded'])
        self.assertIn('elephant', data['answer'].lower())
        self.assertEqual(len(data['sources']), 1)

    def test_where_was_i_goes_to_about_or_grounded_false_never_random_sentence(self):
        res = self.client.post('/memories/ask', json={
            'question': 'Where was I?',
            'scope': 'memory',
            'memory_id': self.memory_id
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['grounded'])
        # Must describe the place/event from ABOUT, not a random transcript fragment like "and that's cool"
        self.assertIn('zoo', data['answer'].lower())
        self.assertTrue(data['answer'].startswith('On Friday') or data['answer'].startswith('In this memory'))

    def test_hindi_question_without_ai_returns_grounded_false(self):
        res = self.client.post('/memories/ask', json={
            'question': 'फ्रांस की राजधानी क्या है?',
            'scope': 'all'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data['grounded'])
        self.assertEqual(data['answer'], "I couldn't find that in your memories.")
        self.assertEqual(data['sources'], [])


if __name__ == '__main__':
    unittest.main()

