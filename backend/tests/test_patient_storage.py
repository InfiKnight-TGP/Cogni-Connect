import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import app
import auth
from patient_storage import FOLDERS, initialize_patient


class PatientStorageTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.legacy = self.root / 'legacy'
        self.legacy.mkdir()
        self.write(self.legacy / 'settings.json', {'patient_name': 'Original', 'pin': '1234', 'language': 'en'})
        self.write(self.legacy / 'people.json', [{'id': 'old', 'name': 'Original person', 'photo': 'old.jpg'}])
        for folder in FOLDERS:
            (self.legacy / folder).mkdir()
        (self.legacy / 'known_faces' / 'old.jpg').write_bytes(b'old image')
        self.public = self.root / 'public'
        (self.public / 'video_chunks').mkdir(parents=True)
        (self.public / 'video_chunks' / 'private.mp4').write_bytes(b'private')
        config = patch.dict(app.api.config, {'TESTING': True, 'AUTH_DATABASE': str(self.root / 'auth.db'),
            'PATIENT_DATA_ROOT': str(self.root / 'data'), 'LEGACY_DATA_ROOT': str(self.legacy),
            'MIGRATION_BACKUP_ROOT': str(self.root / 'backup'), 'LEGACY_PUBLIC_ROOT': str(self.public),
            'STORAGE_MIGRATION': True, 'AUTH_COOKIE_SECURE': False})
        config.start(); self.addCleanup(config.stop)
        limiter = patch.dict(app.api.extensions, {'auth_limits': auth.RateLimits()})
        limiter.start(); self.addCleanup(limiter.stop)
        self.client = app.api.test_client()
        self.assertEqual(self.client.get('/auth/me').status_code, 401)
        with app.api.app_context():
            connection = auth.db()
            self.a = connection.execute('SELECT id FROM patients').fetchone()[0]
            connection.execute("INSERT INTO users VALUES ('owner-a','a@example.com','A','unused',0,0,0)")
            connection.execute("INSERT INTO users VALUES ('owner-b','b@example.com','B','unused',0,0,1)")
            connection.execute("UPDATE patients SET created_by='owner-a' WHERE id=?", (self.a,))
            connection.execute("INSERT INTO patient_members VALUES (?,'owner-a','owner')", (self.a,))
            connection.execute("INSERT INTO patients VALUES ('patient-b','B',NULL,'owner-b',1)")
            connection.execute("INSERT INTO patient_members VALUES ('patient-b','owner-b','owner')")
            token, _ = auth.new_session('caregiver', user_id='owner-a')
            device, _ = auth.new_session('patient_device', patient_id=self.a)
        self.client.set_cookie('cogni_session', token)
        self.device = app.api.test_client(); self.device.set_cookie('cogni_device', device)
        self.base_a = self.root / 'data' / self.a
        self.base_b = self.root / 'data' / 'patient-b'
        initialize_patient(self.base_b, 'B')
        self.write(self.base_b / 'people.json', [{'id': 'b-only', 'name': 'Secret B', 'photo': 'b.jpg'}])
        self.write(self.base_b / 'performance_data.json', {'scores': [], 'game_scores': [{'id': 'b-score', 'score': 88}]})
        self.write(self.base_b / 'video_journals.json', {'b.mp4': {'entry': 'Private B'}})
        for folder, filename in [('known_faces', 'b.jpg'), ('content', 'b.mp4'), ('video_chunks', 'b.mp4'), ('frames', 'b.jpg')]:
            (self.base_b / folder / filename).write_bytes(b'private B')

    @staticmethod
    def write(path, data):
        path.write_text(json.dumps(data), encoding='utf-8')

    def test_migration_backup_and_repeated_startup(self):
        self.assertEqual(self.client.get('/people').json[0]['name'], 'Original person')
        self.assertTrue((self.root / 'backup' / 'people.json').exists())
        self.assertTrue((self.root / 'backup' / 'frontend-public-video_chunks' / 'private.mp4').exists())
        self.assertFalse((self.public / 'video_chunks').exists())
        self.assertFalse((self.legacy / 'people.json').exists())
        self.assertNotIn('pin', json.loads((self.base_a / 'settings.json').read_text(encoding='utf-8')))
        self.write(self.base_a / 'people.json', [])
        self.assertEqual(self.client.get('/people').json, [])
        self.assertEqual(self.device.post('/caregiver/unlock', json={'pin': '1234'}).status_code, 200)

    def test_patient_a_cannot_select_or_access_b(self):
        for path in ('/people', '/videos', '/performance', '/journals', '/known-faces/b.jpg', '/video_chunks/b.mp4', '/frames/b.jpg'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path, headers={'cogni_patient': 'patient-b'}).status_code, 403)
        self.assertEqual(self.client.put('/people/b-only', data={'name': 'Tampered'}).status_code, 404)
        self.assertEqual(self.client.delete('/performance/b-score').status_code, 404)
        for path in ('/known-faces/b.jpg', '/video_chunks/b.mp4', '/frames/b.jpg', '/video_chunks/../patient-b/video_chunks/b.mp4'):
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get('/videos').json, [])
        self.assertEqual(self.client.get('/performance').json['game_scores'], [])

    def test_device_patient_cannot_be_overridden(self):
        response = self.device.get('/people', headers={'cogni_patient': 'patient-b'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json[0]['id'], 'old')
        self.assertEqual(self.device.get('/known-faces/b.jpg').status_code, 404)
        self.assertEqual(self.device.post('/performance', json={'score': 72, 'game_id': 'story-builder', 'date': '2026-10-21'}).status_code, 200)
        self.assertEqual(json.loads((self.base_b / 'performance_data.json').read_text(encoding='utf-8'))['game_scores'][0]['score'], 88)

    def test_plans_crosswords_and_switching_are_isolated(self):
        with app.api.app_context():
            auth.db().execute("INSERT INTO patient_members VALUES ('patient-b','owner-a','caregiver')")
        for base, word in ((self.base_a, 'A'), (self.base_b, 'B')):
            self.write(base / 'daily_plans.json', {'2026-01-01': {'level1': [word], 'level2': [], 'level3': []}})
            self.write(base / 'crosswords.json', {'2026-01-01': {'available': True, 'entries': [word]}})
        for pid, word in ((self.a, 'A'), ('patient-b', 'B'), (self.a, 'A')):
            headers = {'cogni_patient': pid}
            self.assertEqual(self.client.get('/daily-plan?date=2026-01-01', headers=headers).json['level1'], [word])
            self.assertEqual(self.client.get('/crossword?date=2026-01-01', headers=headers).json['entries'], [word])

    def test_upload_thread_captures_base_directory_and_status(self):
        tasks = []
        class DeferredThread:
            def __init__(self, target): tasks.append(target)
            def start(self): pass
        with patch('app.threading.Thread', DeferredThread):
            response = self.client.post('/upload', data={'video': (io.BytesIO(b'video'), 'a.mp4'), 'date': '2026-10-21'})
        self.assertEqual(response.status_code, 200)
        with patch('process_video.process_uploaded_video', return_value={'success': True}) as process:
            tasks[0]()
            self.assertEqual(Path(process.call_args.args[1]), self.base_a)
        with app.api.app_context():
            auth.db().execute("INSERT INTO patient_members VALUES ('patient-b','owner-a','caregiver')")
        self.assertEqual(self.client.get('/processing-status/a.mp4', headers={'cogni_patient': 'patient-b'}).status_code, 404)
        self.assertEqual(self.client.get('/processing-status/a.mp4').json['status'], 'completed')
