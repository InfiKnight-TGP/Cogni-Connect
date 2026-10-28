import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import app
import auth
import db
from patient_storage import FILES, FOLDERS, initialize_patient, migrate_legacy


class PatientStorageTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        def _cleanup():
            db.close_connection()
            temp.cleanup()
        self.addCleanup(_cleanup)
        self.root = Path(temp.name)
        self.legacy = self.root / 'legacy'
        self.legacy.mkdir()
        self.write(self.legacy / 'settings.json', {'patient_name': 'Original', 'pin': '1234', 'language': 'en'})
        self.write(self.legacy / 'people.json', [{'id': 'old', 'name': 'Original person', 'photo': 'old.jpg'}])
        self.write(self.legacy / 'performance_data.json', {'scores': [{'date': '2026-01-01', 'score': 70}], 'game_scores': []})
        self.write(self.legacy / 'video_journals.json', {'legacy.mp4': {
            'entry': 'Legacy journal', 'timestamp': '2026-01-01T00:00:00', 'date': '2026-01-01',
        }})
        self.write(self.legacy / 'qas.json', [{'question': 'Legacy question'}])
        self.write(self.legacy / 'daily_plans.json', {'2026-01-01': {'level1': ['legacy-game']}})
        self.write(self.legacy / 'routines.json', {'steps': ['Legacy step']})
        self.write(self.legacy / 'crosswords.json', {'2026-01-01': {'entries': ['LEGACY']}})
        for folder in FOLDERS:
            (self.legacy / folder).mkdir()
        (self.legacy / 'content' / 'legacy.mp4').write_bytes(b'legacy video')
        (self.legacy / 'video_chunks' / 'legacy_chunks').mkdir()
        (self.legacy / 'video_chunks' / 'legacy_chunks' / 'chunk.mp4').write_bytes(b'legacy chunk')
        (self.legacy / 'frames' / 'legacy.jpg').write_bytes(b'legacy frame')
        (self.legacy / 'known_faces' / 'old.jpg').write_bytes(b'old image')
        (self.legacy / 'summary' / 'legacy.txt').write_text('legacy summary', encoding='utf-8')
        self.public = self.root / 'public'
        (self.public / 'video_chunks').mkdir(parents=True)
        (self.public / 'video_chunks' / 'private.mp4').write_bytes(b'private')
        (self.public / 'known_faces').mkdir()
        (self.public / 'known_faces' / 'legacy-public.jpg').write_bytes(b'public face')
        (self.public / 'frames').mkdir()
        (self.public / 'frames' / 'legacy-public.jpg').write_bytes(b'public frame')
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
            connection.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo) VALUES ('owner-a','a@example.com','A','unused',0,0,0,0)")
            connection.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo) VALUES ('owner-b','b@example.com','B','unused',0,0,1,0)")
            connection.execute("UPDATE patients SET created_by='owner-a' WHERE id=?", (self.a,))
            connection.execute("INSERT INTO patient_members VALUES (?,'owner-a','owner')", (self.a,))
            connection.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES ('patient-b','B',NULL,'owner-b',1,0)")
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
        self.write(self.base_b / 'video_journals.json', {'b.mp4': {
            'entry': 'Private B', 'timestamp': '2026-01-01T00:00:00', 'date': '2026-01-01',
        }})
        for folder, filename in [('known_faces', 'b.jpg'), ('content', 'b.mp4'), ('video_chunks', 'b.mp4'), ('frames', 'b.jpg')]:
            (self.base_b / folder / filename).write_bytes(b'private B')

    @staticmethod
    def write(path, data):
        path.write_text(json.dumps(data), encoding='utf-8')

    def test_migration_backup_and_repeated_startup(self):
        self.assertEqual(self.client.get('/people').json[0]['name'], 'Original Person')
        self.assertEqual(json.loads((self.base_a / 'people.json').read_text(encoding='utf-8'))[0]['name'], 'Original person')
        self.assertTrue((self.root / 'backup' / 'people.json').exists())
        self.assertTrue((self.root / 'backup' / 'frontend-public-video_chunks' / 'private.mp4').exists())
        self.assertFalse((self.public / 'video_chunks').exists())
        self.assertEqual((self.base_a / 'video_chunks' / 'private.mp4').read_bytes(), b'private')
        self.assertEqual((self.base_a / 'known_faces' / 'legacy-public.jpg').read_bytes(), b'public face')
        self.assertEqual((self.base_a / 'frames' / 'legacy-public.jpg').read_bytes(), b'public frame')
        self.assertFalse((self.public / 'known_faces').exists())
        self.assertFalse((self.public / 'frames').exists())
        self.assertFalse((self.legacy / 'people.json').exists())
        self.assertNotIn('pin', json.loads((self.base_a / 'settings.json').read_text(encoding='utf-8')))
        self.assertEqual(json.loads((self.base_a / 'video_journals.json').read_text(encoding='utf-8'))['legacy.mp4']['entry'], 'Legacy journal')
        self.assertEqual((self.base_a / 'content' / 'legacy.mp4').read_bytes(), b'legacy video')
        self.assertEqual((self.base_a / 'video_chunks' / 'legacy_chunks' / 'chunk.mp4').read_bytes(), b'legacy chunk')
        self.assertEqual((self.base_a / 'frames' / 'legacy.jpg').read_bytes(), b'legacy frame')
        self.assertEqual((self.base_a / 'summary' / 'legacy.txt').read_text(encoding='utf-8'), 'legacy summary')
        self.write(self.base_a / 'people.json', [])
        self.assertEqual(self.client.get('/people').json, [])
        self.assertEqual(self.device.post('/caregiver/unlock', json={'pin': '1234'}).status_code, 200)

    def test_patient_a_cannot_select_or_access_b(self):
        for path in ('/people', '/videos', '/video_chunks', '/performance', '/journals', '/settings',
                     '/reports/days', '/reports/day?date=2026-01-01',
                     '/daily-plan?date=2026-01-01', '/crossword?date=2026-01-01',
                     '/known-faces/b.jpg', '/video_chunks/b.mp4', '/frames/b.jpg'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path, headers={'cogni_patient': 'patient-b'}).status_code, 403)
        self.assertEqual(self.client.put('/people/b-only', data={'name': 'Tampered'}).status_code, 404)
        self.assertEqual(self.client.delete('/performance/b-score').status_code, 404)
        for path in ('/known-faces/b.jpg', '/video_chunks/b.mp4', '/frames/b.jpg', '/video_chunks/../patient-b/video_chunks/b.mp4'):
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual([video['filename'] for video in self.client.get('/videos').json], ['legacy.mp4'])
        self.assertEqual(self.client.get('/performance').json['scores'][0]['score'], 70)
        self.assertEqual(self.client.get('/performance').json['game_scores'], [])
        self.assertNotIn('/video_chunks/b.mp4', self.client.get('/video_chunks').json['videos'])

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

    def test_settings_reports_and_media_are_isolated_when_switching_patients(self):
        with app.api.app_context():
            auth.db().execute("INSERT INTO patient_members VALUES ('patient-b','owner-a','caregiver')")
        date = '2026-01-02'
        self.write(self.base_a / 'settings.json', {'patient_name': 'A settings', 'language': 'en', 'pins': []})
        self.write(self.base_b / 'settings.json', {'patient_name': 'B settings', 'language': 'hi', 'pins': []})
        for base, record_id, score in ((self.base_a, 'a-score', 61), (self.base_b, 'b-score', 92)):
            self.write(base / 'performance_data.json', {
                'scores': [],
                'game_scores': [{'id': record_id, 'game_id': 'story-builder', 'date': date, 'score': score}],
            })

        for patient_id, expected_name, expected_language in (
            (self.a, 'A settings', 'en'),
            ('patient-b', 'B settings', 'hi'),
            (self.a, 'A settings', 'en'),
        ):
            headers = {'cogni_patient': patient_id}
            settings = self.client.get('/settings', headers=headers).json
            self.assertEqual(settings['patient_name'], expected_name)
            self.assertEqual(settings['language'], expected_language)
            days = self.client.get('/reports/days', headers=headers).json['days']
            self.assertEqual(days, [date])
            report = self.client.get(f'/reports/day?date={date}', headers=headers).json
            self.assertEqual([game['game_id'] for game in report['games']], ['story-builder'])
            self.assertEqual(report['games'][0]['score'], 61 if patient_id == self.a else 92)
            self.assertEqual(
                self.client.get('/journals', headers=headers).json.get('b.mp4', {}).get('entry'),
                'Private B' if patient_id == 'patient-b' else None,
            )
            video_names = {video['filename'] for video in self.client.get('/videos', headers=headers).json}
            self.assertEqual(video_names, {'b.mp4'} if patient_id == 'patient-b' else {'legacy.mp4'})
            res = self.client.get('/video_chunks/b.mp4', headers=headers)
            media_status = res.status_code
            res.close()
            self.assertEqual(media_status, 200 if patient_id == 'patient-b' else 404)
            self.assertEqual('/video_chunks/b.mp4' in self.client.get('/video_chunks', headers=headers).json['videos'], patient_id == 'patient-b')

        response = self.client.post(
            '/settings',
            json={'language': 'bn'},
            headers={'cogni_patient': self.a},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/settings', headers={'cogni_patient': 'patient-b'}).json['language'], 'hi')
        self.assertEqual(self.client.get('/settings', headers={'cogni_patient': self.a}).json['language'], 'bn')

    def test_upload_thread_captures_base_directory_and_status(self):
        tasks = []
        class DeferredThread:
            def __init__(self, target, args): tasks.append(lambda: target(*args))
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
        self.assertEqual(
            self.client.get('/processing-status/a.mp4', headers={'cogni_patient': self.a}).json['status'],
            'completed',
        )

    def test_memories_use_opaque_ids_and_reject_unsafe_media_paths(self):
        response = self.client.get('/memories')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json['memories']), 1)
        memory = response.json['memories'][0]
        self.assertNotEqual(memory['id'], 'legacy.mp4')
        self.assertRegex(memory['id'], r'^[0-9a-f]{32}$')
        res_v = self.client.get(f"/memories/{memory['id']}/video")
        self.assertEqual(res_v.status_code, 200)
        res_v.close()
        res_t = self.client.get(f"/memories/{memory['id']}/thumbnail")
        self.assertEqual(res_t.status_code, 200)
        res_t.close()
        self.assertEqual(self.client.get('/memories/../patient-b/video').status_code, 404)
        for path in ('/video_chunks/../patient-b/video_chunks/b.mp4', '/video_chunks/%2e%2e/patient-b/video_chunks/b.mp4', '/frames/..%2Fpatient-b%2Fframes%2Fb.jpg'):
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get('/memories/not-a-real-id/video').status_code, 404)
        self.assertEqual(self.device.delete(f"/memories/{memory['id']}").status_code, 403)

    def test_memories_rebuild_from_journal_and_chunks_without_metadata(self):
        memories = self.base_a / 'memories.json'
        if memories.exists(): memories.unlink()
        (self.base_a / 'content' / 'legacy.mp4').unlink()
        chunks = self.base_a / 'video_chunks' / 'legacy_chunks'
        chunks.mkdir(parents=True, exist_ok=True)
        (chunks / 'chunk_0000_0010.mp4').write_bytes(b'chunk')
        response = self.client.get('/memories')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['title'] for item in response.json['memories']], ['legacy'])
        self.assertTrue(memories.exists())

    def test_video_chunk_copy_stays_in_patient_directory(self):
        from process_video import copy_chunks_to_video_chunks

        source = self.root / 'processed'
        source.mkdir()
        (source / 'chunk.mp4').write_bytes(b'chunk')
        patient = self.root / 'patient-output'
        public_chunks = self.public / 'video_chunks'
        public_chunks.mkdir(parents=True)
        (public_chunks / 'pre-existing.mp4').write_bytes(b'public')
        copy_chunks_to_video_chunks(str(source), str(patient))
        self.assertEqual((patient / 'video_chunks' / 'processed' / 'chunk.mp4').read_bytes(), b'chunk')
        self.assertEqual((public_chunks / 'pre-existing.mp4').read_bytes(), b'public')
        self.assertEqual({path.name for path in public_chunks.iterdir()}, {'pre-existing.mp4'})

    def test_cache_writes_and_denied_writes_leave_other_patient_unchanged(self):
        before = {p.relative_to(self.base_b): p.read_bytes()
                  for p in self.base_b.rglob('*') if p.is_file()}
        headers = {'cogni_patient': 'patient-b'}
        self.assertEqual(self.client.post('/settings', headers=headers,
                                         json={'language': 'bn'}).status_code, 403)
        self.assertEqual(self.client.post('/upload', headers=headers,
            data={'video': (io.BytesIO(b'forbidden'), 'b.mp4')}).status_code, 403)
        self.assertEqual(self.client.delete('/performance/b-score', headers=headers).status_code, 403)
        self.assertEqual(self.client.get('/daily-plan?date=2026-01-03').status_code, 200)
        with patch('app._make_crossword', return_value={'available': True, 'entries': ['A']}):
            self.assertEqual(self.client.get('/crossword?date=2026-01-03').status_code, 200)
        for name in ('daily_plans.json', 'crosswords.json'):
            self.assertIn('2026-01-03', json.loads((self.base_a / name).read_text(encoding='utf-8')))
        after = {p.relative_to(self.base_b): p.read_bytes()
                 for p in self.base_b.rglob('*') if p.is_file()}
        self.assertEqual(after, before)

    def test_migration_recovers_after_partial_cleanup_and_runs_twice(self):
        # Use a fresh installation; fail after at least one original was removed.
        legacy = self.root / 'retry-legacy'
        legacy.mkdir()
        originals = {name: {'marker': name} for name in FILES}
        originals['settings.json'] = {'patient_name': 'Retry patient', 'pin': '5678'}
        for name, value in originals.items():
            self.write(legacy / name, value)
        config = {'AUTH_DATABASE': str(self.root / 'retry.db'),
                  'LEGACY_DATA_ROOT': str(legacy),
                  'PATIENT_DATA_ROOT': str(self.root / 'retry-data'),
                  'MIGRATION_BACKUP_ROOT': str(self.root / 'retry-backup')}
        unlink = Path.unlink
        def interrupted(path, *args, **kwargs):
            if path == legacy / 'performance_data.json':
                raise OSError('simulated interrupted cleanup')
            return unlink(path, *args, **kwargs)
        with patch.dict(app.api.config, config):
            with app.api.app_context(), patch.object(Path, 'unlink', interrupted):
                with self.assertRaisesRegex(OSError, 'interrupted cleanup'):
                    migrate_legacy()
            self.assertFalse((legacy / 'people.json').exists())
            with app.api.app_context():
                migrate_legacy()
                patient = auth.db().execute('SELECT * FROM patients').fetchone()
                base = Path(config['PATIENT_DATA_ROOT']) / patient['id']
                for name, value in originals.items():
                    if name != 'settings.json':
                        self.assertEqual(json.loads((base / name).read_text(encoding='utf-8')), value)
                    self.assertEqual(json.loads((Path(config['MIGRATION_BACKUP_ROOT']) / name)
                                               .read_text(encoding='utf-8')), value)
                self.assertEqual(patient['name'], 'Retry patient')
                from werkzeug.security import check_password_hash
                self.assertTrue(check_password_hash(patient['pin_hash'], '5678'))
                snapshot = {p.relative_to(base): p.read_bytes() for p in base.rglob('*') if p.is_file()}
                migrate_legacy()
                self.assertEqual(snapshot, {p.relative_to(base): p.read_bytes()
                                           for p in base.rglob('*') if p.is_file()})
                self.assertEqual(auth.db().execute('SELECT count(*) FROM patients').fetchone()[0], 1)
