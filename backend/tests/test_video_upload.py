import cv2
import io
import json
import numpy as np
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import MagicMock, patch

import app
import auth
import db
from patient_storage import FILES, FOLDERS, initialize_patient


def make_test_mp4(path, duration_secs=2, width=64, height=64, fps=25):
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(path), fourcc, float(fps), (width, height))
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    for _ in range(int(fps * duration_secs)):
        out.write(frame)
    out.release()


class VideoUploadBackendTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        def _cleanup():
            db.close_connection()
            temp.cleanup()
        self.addCleanup(_cleanup)
        self.root = Path(temp.name)
        self.patient_root = self.root / 'data'
        self.patient_root.mkdir(parents=True, exist_ok=True)

        config = patch.dict(app.api.config, {
            'TESTING': True,
            'AUTH_DATABASE': str(self.root / 'auth.db'),
            'PATIENT_DATA_ROOT': str(self.patient_root),
            'STORAGE_MIGRATION': False,
            'AUTH_COOKIE_SECURE': False,
        })
        config.start()
        self.addCleanup(config.stop)

        limiter = patch.dict(app.api.extensions, {'auth_limits': auth.RateLimits()})
        limiter.start()
        self.addCleanup(limiter.stop)

        # Clear active jobs between tests
        with app._patient_job_lock:
            app._active_patient_jobs.clear()
        app.processing_status.clear()

        self.patient_a = 'patient-a'
        self.patient_b = 'patient-b'
        self.base_a = self.patient_root / self.patient_a
        self.base_b = self.patient_root / self.patient_b
        initialize_patient(self.base_a, 'Patient A')
        initialize_patient(self.base_b, 'Patient B')

        with app.api.app_context():
            conn = auth.db()
            conn.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role) VALUES ('self-user','self@example.com','Self User','unused',0,0,0,0,'self')")
            conn.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role) VALUES ('caregiver-user','cg@example.com','CG User','unused',0,0,0,0,'caregiver')")
            conn.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role) VALUES ('other-user','other@example.com','Other User','unused',0,0,0,0,'self')")
            conn.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role) VALUES ('pat-login','pat@example.com','Patient Login','unused',0,0,0,0,'patient')")
            conn.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?, 'Patient A', NULL, 'self-user', 0, 0)", (self.patient_a,))
            conn.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?, 'Patient B', NULL, 'other-user', 0, 0)", (self.patient_b,))
            conn.execute("INSERT INTO patient_members VALUES (?, 'self-user', 'owner')", (self.patient_a,))
            conn.execute("INSERT INTO patient_members VALUES (?, 'caregiver-user', 'caregiver')", (self.patient_a,))
            conn.execute("INSERT INTO patient_members VALUES (?, 'other-user', 'owner')", (self.patient_b,))

            token_self, _ = auth.new_session('caregiver', user_id='self-user')
            token_cg, _ = auth.new_session('caregiver', user_id='caregiver-user')
            token_other, _ = auth.new_session('caregiver', user_id='other-user')
            token_device, _ = auth.new_session('patient_device', patient_id=self.patient_a)
            token_pat_login, _ = auth.new_session('caregiver', user_id='pat-login')

        self.client_self = app.api.test_client()
        self.client_self.set_cookie('cogni_session', token_self)
        self.client_self.set_cookie('cogni_patient', self.patient_a)

        self.client_cg = app.api.test_client()
        self.client_cg.set_cookie('cogni_session', token_cg)
        self.client_cg.set_cookie('cogni_patient', self.patient_a)

        self.client_other = app.api.test_client()
        self.client_other.set_cookie('cogni_session', token_other)
        self.client_other.set_cookie('cogni_patient', self.patient_b)

        self.client_device = app.api.test_client()
        self.client_device.set_cookie('cogni_device', token_device)

        self.client_pat_login = app.api.test_client()
        self.client_pat_login.set_cookie('cogni_session', token_pat_login)
        self.client_pat_login.set_cookie('cogni_patient', self.patient_a)

        self.test_clip = self.root / 'clip.mp4'
        make_test_mp4(self.test_clip, duration_secs=2)

    def test_self_and_caregiver_can_upload_and_check_status(self):
        with patch('process_video.process_uploaded_video', return_value={'success': True, 'chunks_folder': 'test_chunks'}), \
             patch('app._generate_questions_for_video', return_value=[]):
            with open(self.test_clip, 'rb') as f:
                res = self.client_self.post('/memories', data={
                    'file': (io.BytesIO(f.read()), 'my_holiday.mp4'),
                    'date': '2026-10-24',
                    'note': 'Tea in the garden'
                }, content_type='multipart/form-data')

            self.assertEqual(res.status_code, 201)
            data = res.get_json()
            self.assertIn('id', data)
            self.assertEqual(data['status'], 'processing')
            memory_id = data['id']

            # Check memories.json was updated
            memories_file = self.base_a / 'memories.json'
            with open(memories_file, 'r', encoding='utf-8') as mf:
                mem_data = json.load(mf)
            self.assertIn(memory_id, mem_data)
            stored_name = mem_data[memory_id]['filename']
            self.assertNotEqual(stored_name, 'my_holiday.mp4')
            self.assertTrue(stored_name.endswith('.mp4'))

            # Wait briefly for thread to finish mocked processing
            time.sleep(0.2)
            st_res = self.client_self.get(f'/memories/{memory_id}')
            self.assertEqual(st_res.status_code, 200)
            st_data = st_res.get_json()
            self.assertEqual(st_data['status'], 'ready')
            self.assertEqual(st_data['progress'], 100)
            self.assertEqual(st_data['note'], 'Tea in the garden')

    def test_patient_device_and_patient_login_rejected_403(self):
        with open(self.test_clip, 'rb') as f:
            clip_bytes = f.read()

        dev_res = self.client_device.post('/memories', data={
            'file': (io.BytesIO(clip_bytes), 'device.mp4'),
            'date': '2026-10-24',
            'note': 'Device upload'
        }, content_type='multipart/form-data')
        self.assertEqual(dev_res.status_code, 403)

        pat_res = self.client_pat_login.post('/memories', data={
            'file': (io.BytesIO(clip_bytes), 'pat.mp4'),
            'date': '2026-10-24',
            'note': 'Patient login upload'
        }, content_type='multipart/form-data')
        self.assertEqual(pat_res.status_code, 403)

    def test_validation_rejects_fake_extension_and_corrupt_files(self):
        # Fake extension
        res_ext = self.client_self.post('/memories', data={
            'file': (io.BytesIO(b'fake data'), 'virus.exe'),
            'date': '2026-10-24',
        }, content_type='multipart/form-data')
        self.assertEqual(res_ext.status_code, 400)
        self.assertIn('Invalid file type', res_ext.get_json()['error'])

        # Corrupt video file
        res_corrupt = self.client_self.post('/memories', data={
            'file': (io.BytesIO(b'not a real mp4 video content'), 'corrupt.mp4'),
            'date': '2026-10-24',
        }, content_type='multipart/form-data')
        self.assertEqual(res_corrupt.status_code, 400)
        self.assertIn('Corrupt or unreadable', res_corrupt.get_json()['error'])

    def test_validation_rejects_future_dates_and_long_notes(self):
        with open(self.test_clip, 'rb') as f:
            clip_bytes = f.read()

        # Far future date
        res_date = self.client_self.post('/memories', data={
            'file': (io.BytesIO(clip_bytes), 'clip.mp4'),
            'date': '2099-01-01',
        }, content_type='multipart/form-data')
        self.assertEqual(res_date.status_code, 400)
        self.assertIn('Date cannot be in the future', res_date.get_json()['error'])

        # Note > 300 characters
        long_note = 'x' * 305
        res_note = self.client_self.post('/memories', data={
            'file': (io.BytesIO(clip_bytes), 'clip.mp4'),
            'date': '2026-10-24',
            'note': long_note
        }, content_type='multipart/form-data')
        self.assertEqual(res_note.status_code, 400)
        self.assertIn('300 characters', res_note.get_json()['error'])

    def test_oversize_video_rejected_413(self):
        with patch.dict(os.environ, {'COGNI_MAX_UPLOAD_MB': '1'}):
            # Send 2 MB of data with .mp4 extension
            big_data = b'0' * (2 * 1024 * 1024)
            res = self.client_self.post('/memories', data={
                'file': (io.BytesIO(big_data), 'big.mp4'),
                'date': '2026-10-24'
            }, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 413)
            self.assertIn('maximum upload size', res.get_json()['error'])

    def test_disk_space_and_storage_cap_507(self):
        with open(self.test_clip, 'rb') as f:
            clip_bytes = f.read()

        # Low disk space
        mock_usage = MagicMock(free=50 * 1024 * 1024)  # 50 MB < 100 MB
        with patch('shutil.disk_usage', return_value=mock_usage):
            res_disk = self.client_self.post('/memories', data={
                'file': (io.BytesIO(clip_bytes), 'clip.mp4'),
                'date': '2026-10-24'
            }, content_type='multipart/form-data')
            self.assertEqual(res_disk.status_code, 507)
            self.assertIn('disk space', res_disk.get_json()['error'])

        # Patient storage limit > 2 GB
        with patch('os.path.getsize', return_value=2500 * 1024 * 1024):
            res_storage = self.client_self.post('/memories', data={
                'file': (io.BytesIO(clip_bytes), 'clip.mp4'),
                'date': '2026-10-24'
            }, content_type='multipart/form-data')
            self.assertEqual(res_storage.status_code, 507)
            self.assertIn('Patient storage limit', res_storage.get_json()['error'])

    def test_concurrency_lock_returns_409(self):
        with app._patient_job_lock:
            app._active_patient_jobs.add(self.patient_a)

        with open(self.test_clip, 'rb') as f:
            res = self.client_self.post('/memories', data={
                'file': (io.BytesIO(f.read()), 'clip.mp4'),
                'date': '2026-10-24'
            }, content_type='multipart/form-data')

        self.assertEqual(res.status_code, 409)
        self.assertIn('already being processed', res.get_json()['error'])

    def test_worker_thread_safety_and_lock_released_on_error(self):
        # When worker raises, patient_id must still be discarded from _active_patient_jobs
        with app._patient_job_lock:
            app._active_patient_jobs.add(self.patient_a)

        # Call worker directly with failing process_uploaded_video
        with patch('process_video.process_uploaded_video', side_effect=RuntimeError('Crash in pipeline')):
            app._process_video_job(
                patient_id=self.patient_a,
                base_dir=str(self.base_a),
                memory_id='0123456789abcdef0123456789abcdef',
                filename='test_crash.mp4',
                video_date='2026-10-24',
                note='Crashing video'
            )

        with app._patient_job_lock:
            self.assertNotIn(self.patient_a, app._active_patient_jobs)

    def test_stale_jobs_cleaned_on_startup(self):
        # Create a stale memory in memories.json with status 'processing'
        mem_id = '11112222333344445555666677778888'
        stale_fn = 'stale_video.mp4'
        (self.base_a / 'content' / stale_fn).write_bytes(b'stale video bytes')
        (self.base_a / 'video_chunks' / f'{stale_fn[:-4]}_chunks').mkdir(parents=True)
        (self.base_a / 'video_chunks' / f'{stale_fn[:-4]}_chunks' / 'c.mp4').write_bytes(b'chunk')

        memories_file = self.base_a / 'memories.json'
        with open(memories_file, 'w', encoding='utf-8') as f:
            json.dump({
                mem_id: {
                    'filename': stale_fn,
                    'status': 'processing',
                    'date': '2026-10-24',
                    'title': 'Stale Video'
                }
            }, f)

        # Call cleanup
        app._cleanup_stale_processing_jobs(patient_data_root=str(self.patient_root))

        with open(memories_file, 'r', encoding='utf-8') as f:
            updated = json.load(f)
        self.assertEqual(updated[mem_id]['status'], 'failed')
        self.assertEqual(updated[mem_id]['message'], app.SAFE_FAILURE_MESSAGE)
        self.assertEqual(updated[mem_id]['error'], app.SAFE_FAILURE_MESSAGE)

        # Verify original video is kept on interruption!
        self.assertTrue((self.base_a / 'content' / stale_fn).exists())
        # Verify partial chunks were cleaned up
        self.assertFalse((self.base_a / 'video_chunks' / f'{stale_fn[:-4]}_chunks').exists())

    def test_random_stored_name_and_discovery_via_memories_json(self):
        # Upload a video with random stored name
        rnd_fn = 'd41d8cd98f00b204e9800998ecf8427e.mp4'
        rnd_id = 'abcdef0123456789abcdef0123456789'
        chunk_f = f'{rnd_fn[:-4]}_chunks'

        (self.base_a / 'content' / rnd_fn).write_bytes(b'video content')
        chunk_dir = self.base_a / 'video_chunks' / chunk_f
        chunk_dir.mkdir(parents=True, exist_ok=True)
        (chunk_dir / 'chunk_0000_0010.mp4').write_bytes(b'chunk 1')

        # Transcripts and faces
        with open(chunk_dir / 'full_transcript.json', 'w', encoding='utf-8') as f:
            json.dump({'chunk_0000_0010': 'We had a lovely picnic in the park'}, f)
        with open(chunk_dir / 'faces_faces.json', 'w', encoding='utf-8') as f:
            json.dump({'chunk_0000_0010.mp4': ['old']}, f)

        # People
        with open(self.base_a / 'people.json', 'w', encoding='utf-8') as f:
            json.dump([{'id': 'old', 'name': 'Sarah', 'relation': 'Daughter', 'photo': 'sarah.jpg'}], f)

        # Memories.json
        with open(self.base_a / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({
                rnd_id: {
                    'filename': rnd_fn,
                    'status': 'ready',
                    'date': '2026-10-24',
                    'title': 'Picnic Day',
                    'note': 'Picnic in the park'
                }
            }, f)

        # Journals
        with open(self.base_a / 'video_journals.json', 'w', encoding='utf-8') as f:
            json.dump({
                rnd_fn: {
                    'entry': 'Picnic in the park',
                    'date': '2026-10-24',
                    'timestamp': '2026-10-24T12:00:00'
                }
            }, f)

        # 1. GET /memories finds it
        res_list = self.client_self.get('/memories')
        self.assertEqual(res_list.status_code, 200)
        items = res_list.get_json()['memories']
        self.assertTrue(any(it['id'] == rnd_id for it in items))

        # 2. POST /generate-questions finds it
        res_gen = self.client_self.post('/generate-questions', json={'date': '2026-10-24'})
        self.assertEqual(res_gen.status_code, 200)
        q_data = res_gen.get_json()
        self.assertIn('questions', q_data)
        self.assertTrue(len(q_data['questions']) > 0)
        self.assertIn(chunk_f, q_data['questions'][0]['video'])

        # 3. POST /memories/ask finds it
        res_ask = self.client_self.post('/memories/ask', json={
            'question': 'What did we have in the park?',
            'scope': 'all'
        })
        self.assertEqual(res_ask.status_code, 200)
        ask_data = res_ask.get_json()
        self.assertIn('picnic', ask_data['answer'].lower())

    def test_patch_date_and_consistency(self):
        rnd_fn = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.mp4'
        rnd_id = '0102030405060708090a0b0c0d0e0f10'
        chunk_f = f'{rnd_fn[:-4]}_chunks'

        (self.base_a / 'content' / rnd_fn).write_bytes(b'video')
        (self.base_a / 'video_chunks' / chunk_f).mkdir(parents=True)
        (self.base_a / 'video_chunks' / chunk_f / 'chunk_0000_0010.mp4').write_bytes(b'c')

        # memories.json
        with open(self.base_a / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({
                rnd_id: {
                    'filename': rnd_fn,
                    'status': 'ready',
                    'date': '2026-10-20',
                    'title': 'Walk',
                    'note': 'Morning walk'
                }
            }, f)

        # journals
        with open(self.base_a / 'video_journals.json', 'w', encoding='utf-8') as f:
            json.dump({
                rnd_fn: {
                    'entry': 'Morning walk',
                    'date': '2026-10-20',
                    'timestamp': '2026-10-20T08:00:00'
                }
            }, f)

        # qas.json
        video_q_path = f"/video_chunks/{chunk_f}/chunk_0000_0010.mp4"
        with open(self.base_a / 'qas.json', 'w', encoding='utf-8') as f:
            json.dump([{
                'question': 'Where did you walk?',
                'answer': 'In the morning park',
                'video': video_q_path
            }], f)

        # crosswords and daily plans cache
        with open(self.base_a / 'crosswords.json', 'w', encoding='utf-8') as f:
            json.dump({'2026-10-20': {'entries': []}, '2026-10-22': {'entries': []}}, f)
        with open(self.base_a / 'daily_plans.json', 'w', encoding='utf-8') as f:
            json.dump({'2026-10-20': {'level1': ['game']}, '2026-10-22': {'level1': ['game']}}, f)

        # PATCH to new date 2026-10-22 and new note
        res_patch = self.client_self.patch(f'/memories/{rnd_id}', json={
            'date': '2026-10-22',
            'note': 'Evening stroll'
        })
        self.assertEqual(res_patch.status_code, 200)

        # 1. Check questions video path remains consistent
        with open(self.base_a / 'qas.json', 'r', encoding='utf-8') as f:
            qas = json.load(f)
        self.assertEqual(qas[0]['video'], video_q_path)

        # 2. Check journal entry updated
        with open(self.base_a / 'video_journals.json', 'r', encoding='utf-8') as f:
            journals = json.load(f)
        self.assertEqual(journals[rnd_fn]['date'], '2026-10-22')
        self.assertEqual(journals[rnd_fn]['entry'], 'Evening stroll')

        # 3. Check crossword & daily plan caches invalidated for both dates
        with open(self.base_a / 'crosswords.json', 'r', encoding='utf-8') as f:
            cross = json.load(f)
        self.assertNotIn('2026-10-20', cross)
        self.assertNotIn('2026-10-22', cross)

        with open(self.base_a / 'daily_plans.json', 'r', encoding='utf-8') as f:
            plans = json.load(f)
        self.assertNotIn('2026-10-20', plans)
        self.assertNotIn('2026-10-22', plans)

    def test_delete_memory_removes_only_own_questions_and_preserves_other_videos(self):
        fn_a = 'vid_a.mp4'
        id_a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        chunk_a = f'{fn_a[:-4]}_chunks'

        fn_b = 'vid_b.mp4'
        id_b = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        chunk_b = f'{fn_b[:-4]}_chunks'

        # Create files for both
        for fn, chunk in [(fn_a, chunk_a), (fn_b, chunk_b)]:
            (self.base_a / 'content' / fn).write_bytes(b'video')
            (self.base_a / 'video_chunks' / chunk).mkdir(parents=True)
            (self.base_a / 'video_chunks' / chunk / 'chunk_0000_0010.mp4').write_bytes(b'c')
            (self.base_a / 'frames' / chunk).mkdir(parents=True)

        with open(self.base_a / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({
                id_a: {'filename': fn_a, 'status': 'ready', 'date': '2026-10-24'},
                id_b: {'filename': fn_b, 'status': 'ready', 'date': '2026-10-24'}
            }, f)

        with open(self.base_a / 'video_journals.json', 'w', encoding='utf-8') as f:
            json.dump({
                fn_a: {'entry': 'Journal A', 'date': '2026-10-24'},
                fn_b: {'entry': 'Journal B', 'date': '2026-10-24'}
            }, f)

        # qas.json has questions for both videos on same date
        with open(self.base_a / 'qas.json', 'w', encoding='utf-8') as f:
            json.dump([
                {'question': 'QA A', 'video': f'/video_chunks/{chunk_a}/chunk_0000_0010.mp4'},
                {'question': 'QA B', 'video': f'/video_chunks/{chunk_b}/chunk_0000_0010.mp4'}
            ], f)

        # DELETE memory A
        del_res = self.client_self.delete(f'/memories/{id_a}')
        self.assertEqual(del_res.status_code, 200)

        # Verify A files removed
        self.assertFalse((self.base_a / 'content' / fn_a).exists())
        self.assertFalse((self.base_a / 'video_chunks' / chunk_a).exists())
        self.assertFalse((self.base_a / 'frames' / chunk_a).exists())

        # Verify B files preserved!
        self.assertTrue((self.base_a / 'content' / fn_b).exists())
        self.assertTrue((self.base_a / 'video_chunks' / chunk_b).exists())

        # Verify journals
        with open(self.base_a / 'video_journals.json', 'r', encoding='utf-8') as f:
            journals = json.load(f)
        self.assertNotIn(fn_a, journals)
        self.assertIn(fn_b, journals)

        # Verify qas.json only kept B questions!
        with open(self.base_a / 'qas.json', 'r', encoding='utf-8') as f:
            remaining_qas = json.load(f)
        self.assertEqual(len(remaining_qas), 1)
        self.assertEqual(remaining_qas[0]['question'], 'QA B')

    def test_delete_processing_memory_returns_409(self):
        mid = '99999999999999999999999999999999'
        fn = 'proc.mp4'
        with open(self.base_a / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({mid: {'filename': fn, 'status': 'processing', 'date': '2026-10-24'}}, f)

        del_res = self.client_self.delete(f'/memories/{mid}')
        self.assertEqual(del_res.status_code, 409)
        self.assertIn('Cannot delete a memory while it is processing', del_res.get_json()['error'])

    def test_cross_patient_isolation_returns_404(self):
        # Create a memory belonging to Patient B
        mid_b = 'bbbb1111bbbb1111bbbb1111bbbb1111'
        fn_b = 'b_clip.mp4'
        with open(self.base_b / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({mid_b: {'filename': fn_b, 'status': 'ready', 'date': '2026-10-24'}}, f)

        # Patient A user tries to GET, PATCH, DELETE Patient B's memory
        self.assertEqual(self.client_self.get(f'/memories/{mid_b}').status_code, 404)
        self.assertEqual(self.client_self.patch(f'/memories/{mid_b}', json={'note': 'Hacked'}).status_code, 404)
        self.assertEqual(self.client_self.delete(f'/memories/{mid_b}').status_code, 404)


    def test_safe_failure_message_never_leaks_exception_or_path(self):
        mid = '77777777777777777777777777777777'
        fn = 'secret_vid.mp4'
        (self.base_a / 'content' / fn).write_bytes(b'dummy')
        with open(self.base_a / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({mid: {'filename': fn, 'status': 'processing', 'date': '2026-10-24'}}, f)

        # Worker raises exception containing sensitive path
        with patch('process_video.process_uploaded_video', side_effect=RuntimeError("Failure in C:\\Sensitive\\SecretDir\\data.bin")):
            app._process_video_job(self.patient_a, str(self.base_a), mid, fn, '2026-10-24', 'note')

        with open(self.base_a / 'memories.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.assertEqual(data[mid]['status'], 'failed')
        self.assertEqual(data[mid]['message'], app.SAFE_FAILURE_MESSAGE)
        self.assertEqual(data[mid]['error'], app.SAFE_FAILURE_MESSAGE)
        self.assertNotIn('Sensitive', data[mid]['message'])
        self.assertNotIn('SecretDir', data[mid]['error'])

        # API response also returns safe failure message
        res = self.client_self.get(f'/memories/{mid}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()['message'], app.SAFE_FAILURE_MESSAGE)
        self.assertEqual(res.get_json()['error'], app.SAFE_FAILURE_MESSAGE)

        # Original video is kept!
        self.assertTrue((self.base_a / 'content' / fn).exists())

    def test_retry_endpoint_and_409_concurrency(self):
        mid = '88888888888888888888888888888888'
        fn = 'retry_clip.mp4'
        (self.base_a / 'content' / fn).write_bytes(b'kept video bytes')
        chunk_f = f'{fn[:-4]}_chunks'
        (self.base_a / 'video_chunks' / chunk_f).mkdir(parents=True, exist_ok=True)
        (self.base_a / 'video_chunks' / chunk_f / 'partial.mp4').write_bytes(b'partial')

        with open(self.base_a / 'memories.json', 'w', encoding='utf-8') as f:
            json.dump({mid: {'filename': fn, 'status': 'failed', 'message': app.SAFE_FAILURE_MESSAGE, 'date': '2026-10-24', 'note': 'Retry me'}}, f)

        # Patient login or device cannot retry
        dev_res = self.client_device.post(f'/memories/{mid}/retry')
        self.assertEqual(dev_res.status_code, 403)

        # 409 if active job running
        with app._patient_job_lock:
            app._active_patient_jobs.add(self.patient_a)
        conflict_res = self.client_self.post(f'/memories/{mid}/retry')
        self.assertEqual(conflict_res.status_code, 409)
        self.assertIn('already being processed', conflict_res.get_json()['error'])
        with app._patient_job_lock:
            app._active_patient_jobs.discard(self.patient_a)

        # Successful retry by self or caregiver
        with patch('process_video.process_uploaded_video', return_value={'success': True}), \
             patch('app._generate_questions_for_video', return_value=[]):
            retry_res = self.client_self.post(f'/memories/{mid}/retry')
            self.assertEqual(retry_res.status_code, 200)
            self.assertEqual(retry_res.get_json()['status'], 'processing')

            time.sleep(0.2)
            st_res = self.client_self.get(f'/memories/{mid}')
            self.assertEqual(st_res.status_code, 200)
            self.assertEqual(st_res.get_json()['status'], 'ready')

    def test_date_rules_yesterday_today_tomorrow_and_5_days_ahead(self):
        from datetime import date, timedelta
        today = date.today()
        yesterday_str = (today - timedelta(days=1)).strftime('%Y-%m-%d')
        today_str = today.strftime('%Y-%m-%d')
        tomorrow_str = (today + timedelta(days=1)).strftime('%Y-%m-%d')
        two_days_str = (today + timedelta(days=2)).strftime('%Y-%m-%d')
        five_days_str = (today + timedelta(days=5)).strftime('%Y-%m-%d')

        for valid_d in (yesterday_str, today_str, tomorrow_str, two_days_str):
            clean_d, err = app._validate_memory_date(valid_d)
            self.assertIsNone(err, f"Expected {valid_d} to be accepted, got error: {err}")
            self.assertEqual(clean_d, valid_d)

        invalid_d, err = app._validate_memory_date(five_days_str)
        self.assertIsNone(invalid_d)
        self.assertEqual(err, "Date cannot be in the future.")

    def test_concurrent_threads_updating_status_and_note_under_lock(self):
        mid = 'cccc2222cccc2222cccc2222cccc2222'
        fn = 'concur.mp4'
        memories_file = self.base_a / 'memories.json'
        with open(memories_file, 'w', encoding='utf-8') as f:
            json.dump({mid: {'filename': fn, 'status': 'processing', 'progress': 0, 'note': 'Initial'}}, f)

        errors = []

        def update_status_worker():
            for i in range(15):
                try:
                    with app._memories_lock_for_patient(self.patient_a):
                        with open(memories_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        data[mid]['progress'] = i
                        data[mid]['status'] = 'processing'
                        with open(memories_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                    time.sleep(0.005)
                except Exception as e:
                    errors.append(e)

        def update_note_worker():
            for i in range(15):
                try:
                    with app._memories_lock_for_patient(self.patient_a):
                        with open(memories_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        data[mid]['note'] = f'Note update {i}'
                        with open(memories_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                    time.sleep(0.005)
                except Exception as e:
                    errors.append(e)

        t1 = threading.Thread(target=update_status_worker)
        t2 = threading.Thread(target=update_note_worker)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(errors, [])
        with open(memories_file, 'r', encoding='utf-8') as f:
            final_data = json.load(f)
        self.assertEqual(final_data[mid]['progress'], 14)
        self.assertEqual(final_data[mid]['note'], 'Note update 14')

    def test_shared_question_generation(self):
        video_data = [{
            'video_path': '/video_chunks/clip_chunks/chunk_0000_0010.mp4',
            'transcript': 'We had lunch outside with Sarah',
            'faces': ['Sarah (daughter)'],
            'journal': 'Picnic in the park'
        }]
        questions = app._generate_questions_from_video_data(video_data)
        self.assertTrue(len(questions) >= 2)
        self.assertTrue(all(q.get('fallback') for q in questions))
        self.assertEqual(questions[0]['answer'], 'Picnic in the park')


if __name__ == '__main__':
    unittest.main()
