import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from werkzeug.security import generate_password_hash

import app
import auth
import db
from patient_storage import FOLDERS, initialize_patient


class TestPeopleEditing(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        def _cleanup():
            db.close_connection()
            self.temp_dir.cleanup()
        self.addCleanup(_cleanup)

        self.root = Path(self.temp_dir.name)
        self.data_root = self.root / 'data'
        self.data_root.mkdir()
        self.db_path = str(self.root / 'auth.db')

        config = patch.dict(app.api.config, {
            'TESTING': True,
            'AUTH_DATABASE': self.db_path,
            'PATIENT_DATA_ROOT': str(self.data_root),
            'STORAGE_MIGRATION': False,
            'AUTH_COOKIE_SECURE': False,
            'AUTH_DEMO': True,
            'AUTH_ORIGINS': ['http://localhost:3000'],
        })
        config.start()
        self.addCleanup(config.stop)

        limiter = patch.dict(app.api.extensions, {'auth_limits': auth.RateLimits()})
        limiter.start()
        self.addCleanup(limiter.stop)

        # Clear in-memory rescan state between tests
        with app._rescan_status_lock:
            app._patient_rescan_status.clear()
            app._patient_rescan_timestamps.clear()

        self.self_patient_id = 'patient-self'
        self.other_patient_id = 'patient-other'
        self.demo_patient_id = 'patient-demo'
        self.patient_login_patient_id = 'patient-login-p'

        self.self_base = self.data_root / self.self_patient_id
        self.other_base = self.data_root / self.other_patient_id
        self.demo_base = self.data_root / self.demo_patient_id
        self.login_base = self.data_root / self.patient_login_patient_id

        initialize_patient(self.self_base, 'Self Patient')
        initialize_patient(self.other_base, 'Other Patient')
        initialize_patient(self.demo_base, 'Demo Patient')
        initialize_patient(self.login_base, 'Patient Login Target')

        with app.api.app_context():
            now_ts = auth.now()
            # 1. Insert users with patient_id=NULL first
            db.execute(
                "INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,0,'self',NULL,'caregiver')",
                ('self-user', 'self@example.com', 'Self User', generate_password_hash('password1', method='scrypt'), now_ts)
            )
            db.execute(
                "INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,0,'self',NULL,'caregiver')",
                ('other-user', 'other@example.com', 'Other User', generate_password_hash('password1', method='scrypt'), now_ts)
            )
            db.execute(
                "INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,0,'caregiver',NULL,'caregiver')",
                ('caregiver-user', 'cg@example.com', 'Caregiver User', generate_password_hash('password1', method='scrypt'), now_ts)
            )
            db.execute(
                "INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,0,'patient',NULL,'caregiver')",
                ('patient-user', 'patient@example.com', 'Patient Login', generate_password_hash('password1', method='scrypt'), now_ts)
            )
            db.execute(
                "INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,1,'self',NULL,'caregiver')",
                ('demo-user', 'demo@example.com', 'Demo User', generate_password_hash('password1', method='scrypt'), now_ts)
            )

            # 2. Insert patients with created_by
            db.execute(
                "INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,0)",
                (self.self_patient_id, 'Self Patient', None, 'self-user', now_ts)
            )
            db.execute(
                "INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,0)",
                (self.other_patient_id, 'Other Patient', None, 'other-user', now_ts)
            )
            db.execute(
                "INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,1)",
                (self.demo_patient_id, 'Demo Patient', None, 'demo-user', now_ts)
            )
            db.execute(
                "INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,0)",
                (self.patient_login_patient_id, 'Patient Login Target', None, 'self-user', now_ts)
            )

            # 3. Update users with patient_id
            db.execute("UPDATE users SET patient_id=? WHERE id=?", (self.self_patient_id, 'self-user'))
            db.execute("UPDATE users SET patient_id=? WHERE id=?", (self.other_patient_id, 'other-user'))
            db.execute("UPDATE users SET patient_id=? WHERE id=?", (self.patient_login_patient_id, 'patient-user'))
            db.execute("UPDATE users SET patient_id=? WHERE id=?", (self.demo_patient_id, 'demo-user'))

            # 4. Patient members
            db.execute("INSERT INTO patient_members VALUES (?,?,'owner')", (self.self_patient_id, 'self-user'))
            db.execute("INSERT INTO patient_members VALUES (?,?,'owner')", (self.other_patient_id, 'other-user'))
            db.execute("INSERT INTO patient_members VALUES (?,?,'caregiver')", (self.self_patient_id, 'caregiver-user'))
            db.execute("INSERT INTO patient_members VALUES (?,?,'owner')", (self.demo_patient_id, 'demo-user'))

            # Create test sessions
            self_token, _ = auth.new_session('caregiver', user_id='self-user')
            other_token, _ = auth.new_session('caregiver', user_id='other-user')
            cg_token, _ = auth.new_session('caregiver', user_id='caregiver-user')
            device_token, _ = auth.new_session('patient_device', patient_id=self.self_patient_id)
            patient_login_token, _ = auth.new_session('patient_device', user_id='patient-user', patient_id=self.patient_login_patient_id)
            demo_token, _ = auth.new_session('caregiver', user_id='demo-user')

        # Test clients
        self.client_self = app.api.test_client()
        self.client_self.set_cookie(auth.COOKIES['caregiver'], self_token)

        self.client_other = app.api.test_client()
        self.client_other.set_cookie(auth.COOKIES['caregiver'], other_token)

        self.client_cg = app.api.test_client()
        self.client_cg.set_cookie(auth.COOKIES['caregiver'], cg_token)

        self.client_device = app.api.test_client()
        self.client_device.set_cookie(auth.COOKIES['patient_device'], device_token)

        self.client_patient_login = app.api.test_client()
        self.client_patient_login.set_cookie(auth.COOKIES['patient_device'], patient_login_token)

        self.client_demo = app.api.test_client()
        self.client_demo.set_cookie(auth.COOKIES['caregiver'], demo_token)

        # Sample face photo from sample_data
        sample_face = Path(__file__).resolve().parent.parent / 'sample_data' / 'known_faces' / 'team-1.jpg'
        self.valid_face_bytes = sample_face.read_bytes()

        # No-face black image encoded as JPEG
        black_img = np.zeros((100, 100, 3), dtype=np.uint8)
        _, buf = cv2.imencode('.jpg', black_img)
        self.no_face_bytes = buf.tobytes()

    def test_self_can_add_edit_delete_person_and_photo_deleted(self):
        # 1. Add person
        res_add = self.client_self.post('/people', data={
            'name': 'priya sharma',
            'relation': 'Daughter',
            'phone': '+1 (555) 234-5678',
            'photo': (io.BytesIO(self.valid_face_bytes), 'uploaded_filename.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res_add.status_code, 201)
        data = res_add.get_json()
        person_id = data['id']
        photo_filename = data['photo']
        self.assertEqual(data['name'], 'Priya Sharma')
        self.assertEqual(data['relation'], 'Daughter')
        self.assertEqual(data['phone'], '+1 (555) 234-5678')
        # Stored photo must use random filename, never uploaded filename
        self.assertNotEqual(photo_filename, 'uploaded_filename.jpg')
        self.assertTrue(photo_filename.endswith('.jpg'))
        # Photo exists on disk
        photo_path = self.self_base / 'known_faces' / photo_filename
        self.assertTrue(photo_path.exists())

        # Photo served by GET /known-faces/<filename>
        res_photo = self.client_self.get(f"/known-faces/{photo_filename}")
        self.assertEqual(res_photo.status_code, 200)
        res_photo.close()

        # 2. Edit person (name and relation)
        res_edit = self.client_self.put(f"/people/{person_id}", data={
            'name': 'Priya Singh',
            'relation': 'Wife',
        })
        self.assertEqual(res_edit.status_code, 200)
        updated = res_edit.get_json()
        self.assertEqual(updated['name'], 'Priya Singh')
        self.assertEqual(updated['relation'], 'Wife')
        self.assertEqual(updated['photo'], photo_filename)

        # 3. Delete person
        res_del = self.client_self.delete(f"/people/{person_id}")
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.get_json()['success'])

        # Person removed from list
        people_list = self.client_self.get('/people').get_json()
        self.assertFalse(any(p['id'] == person_id for p in people_list))

        # Photo removed from disk
        self.assertFalse(photo_path.exists())

        # GET photo returns 404 after deletion
        self.assertEqual(self.client_self.get(f"/known-faces/{photo_filename}").status_code, 404)

    def test_caregiver_can_add_person_for_its_patient(self):
        res = self.client_cg.post('/people', data={
            'name': 'Amit',
            'relation': 'Son',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 201)

    def test_patient_device_and_patient_login_get_403(self):
        for client in (self.client_device, self.client_patient_login):
            with self.subTest(client=client):
                # POST /people
                res_post = client.post('/people', data={
                    'name': 'Forbidden',
                    'relation': 'Friend',
                    'photo': (io.BytesIO(self.valid_face_bytes), 'photo.jpg')
                }, content_type='multipart/form-data')
                self.assertEqual(res_post.status_code, 403)

                # PUT /people/any-id
                res_put = client.put('/people/any-id', data={'name': 'Forbidden'})
                self.assertEqual(res_put.status_code, 403)

                # DELETE /people/any-id
                res_del = client.delete('/people/any-id')
                self.assertEqual(res_del.status_code, 403)

                # POST /people/rescan
                res_rescan = client.post('/people/rescan')
                self.assertEqual(res_rescan.status_code, 403)

    def test_other_patient_person_returns_404(self):
        # Create person in self_patient
        res_add = self.client_self.post('/people', data={
            'name': 'Rahul',
            'relation': 'Son',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res_add.status_code, 201)
        person_id = res_add.get_json()['id']
        photo = res_add.get_json()['photo']

        # other_client tries to PUT /people/<person_id> -> 404
        self.assertEqual(self.client_other.put(f"/people/{person_id}", data={'name': 'Hacked'}).status_code, 404)

        # other_client tries to DELETE /people/<person_id> -> 404
        self.assertEqual(self.client_other.delete(f"/people/{person_id}").status_code, 404)

        # other_client tries to GET other patient's photo -> 404
        self.assertEqual(self.client_other.get(f"/known-faces/{photo}").status_code, 404)

    def test_validation_errors(self):
        # 1. Missing name
        res = self.client_self.post('/people', data={
            'relation': 'Son',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 2. Name too long (>60 chars)
        res = self.client_self.post('/people', data={
            'name': 'A' * 61,
            'relation': 'Son',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 3. Name with control characters
        res = self.client_self.post('/people', data={
            'name': "Bad\x00Name",
            'relation': 'Son',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 4. Invalid relation
        res = self.client_self.post('/people', data={
            'name': 'Valid Name',
            'relation': 'Stranger',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 5. Invalid phone (too short)
        res = self.client_self.post('/people', data={
            'name': 'Valid Name',
            'relation': 'Friend',
            'phone': '123',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 6. Invalid phone (bad characters)
        res = self.client_self.post('/people', data={
            'name': 'Valid Name',
            'relation': 'Friend',
            'phone': '12345678abc',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 7. Non-image file renamed .jpg
        fake_jpg = b"this is completely text, not a real image"
        res = self.client_self.post('/people', data={
            'name': 'Valid Name',
            'relation': 'Friend',
            'photo': (io.BytesIO(fake_jpg), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)

        # 8. Oversized file (> 5 MB)
        big_bytes = b"x" * (5 * 1024 * 1024 + 10)
        res = self.client_self.post('/people', data={
            'name': 'Valid Name',
            'relation': 'Friend',
            'photo': (io.BytesIO(big_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertIn(res.status_code, (400, 413))

        # 9. No-face photo rejected with exact string
        res = self.client_self.post('/people', data={
            'name': 'Valid Name',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.no_face_bytes), 'face.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()['error'], "No face found in this photo. Try a clear photo of the face.")

    def test_existing_faces_json_keeps_working_when_person_deleted(self):
        # Add person A and person B
        res_a = self.client_self.post('/people', data={
            'name': 'Asha Patel',
            'relation': 'Doctor',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face_a.jpg')
        }, content_type='multipart/form-data')
        id_a = res_a.get_json()['id']

        res_b = self.client_self.post('/people', data={
            'name': 'Bharat Kumar',
            'relation': 'Son',
            'photo': (io.BytesIO(self.valid_face_bytes), 'face_b.jpg')
        }, content_type='multipart/form-data')
        id_b = res_b.get_json()['id']

        # Create content file and chunk folder with a chunk and *_faces.json referencing both IDs
        (self.self_base / 'content').mkdir(parents=True, exist_ok=True)
        (self.self_base / 'content' / 'walk.mp4').write_bytes(b'video')
        chunks_dir = self.self_base / 'video_chunks' / 'walk_chunks'
        chunks_dir.mkdir(parents=True, exist_ok=True)
        (chunks_dir / 'chunk_0000_0010.mp4').write_bytes(b'chunk')
        faces_json_path = chunks_dir / 'chunk_0000_0010_faces.json'
        faces_json_path.write_text(json.dumps({
            "/video_chunks/walk_chunks/chunk_0000_0010.mp4": [id_a, id_b]
        }), encoding='utf-8')

        # Create memory record in memories.json
        memories_path = self.self_base / 'memories.json'
        memories_path.write_text(json.dumps({
            "mem-1": {
                "filename": "walk.mp4",
                "createdAt": 1000,
                "people": []
            }
        }), encoding='utf-8')

        # GET /memories should list both Asha Patel and Bharat Kumar
        res = self.client_self.get('/memories').get_json()
        vids = res.get('memories', [])
        self.assertEqual(len(vids), 1)
        self.assertIn('Asha Patel', vids[0]['people'])
        self.assertIn('Bharat Kumar', vids[0]['people'])

        # Now DELETE person A
        self.assertEqual(self.client_self.delete(f"/people/{id_a}").status_code, 200)

        # GET /memories must keep working without crashing, and Asha Patel's chip is DROPPED
        res_after = self.client_self.get('/memories').get_json()
        vids_after = res_after.get('memories', [])
        self.assertEqual(len(vids_after), 1)
        self.assertNotIn('Asha Patel', vids_after[0]['people'])
        self.assertIn('Bharat Kumar', vids_after[0]['people'])

    def test_rescan_no_videos_yet(self):
        # self_patient has no video chunks yet
        res = self.client_self.post('/people/rescan')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['status'], 'completed')
        self.assertIn('No videos to scan yet', data['message'])

        # Status endpoint also returns it
        st = self.client_self.get('/people/rescan/status').get_json()
        self.assertEqual(st['status'], 'completed')
        self.assertIn('No videos to scan yet', st['message'])

    def test_rescan_single_job_at_a_time_and_rate_limit(self):
        # Create a mock video chunks directory
        chunks_dir = self.self_base / 'video_chunks' / 'trip_chunks'
        chunks_dir.mkdir(parents=True, exist_ok=True)
        (chunks_dir / 'chunk_0000_0010.mp4').write_bytes(b'video')

        # Patch perform_face_recognition to simulate a slow background job
        with patch('process_video.perform_face_recognition') as mock_face:
            mock_face.side_effect = lambda f, b: time.sleep(0.3)

            # 1. Start rescan 1
            res1 = self.client_self.post('/people/rescan')
            self.assertEqual(res1.status_code, 200)
            self.assertEqual(res1.get_json()['status'], 'running')

            # 2. Concurrently starting rescan 2 -> 409 Conflict
            res2 = self.client_self.post('/people/rescan')
            self.assertEqual(res2.status_code, 409)

            # Wait for rescan 1 to finish
            for _ in range(20):
                st = self.client_self.get('/people/rescan/status').get_json()
                if st['status'] == 'completed':
                    break
                time.sleep(0.1)

            # 3. Next rescan (request 2 towards limit)
            res3 = self.client_self.post('/people/rescan')
            self.assertEqual(res3.status_code, 200)
            for _ in range(20):
                if self.client_self.get('/people/rescan/status').get_json()['status'] == 'completed':
                    break
                time.sleep(0.1)

            # 4. Request 3 towards limit
            res4 = self.client_self.post('/people/rescan')
            self.assertEqual(res4.status_code, 200)
            for _ in range(20):
                if self.client_self.get('/people/rescan/status').get_json()['status'] == 'completed':
                    break
                time.sleep(0.1)

            # 5. Request 4 exceeds rate limit (3 per hour) -> 429
            res5 = self.client_self.post('/people/rescan')
            self.assertEqual(res5.status_code, 429)

    def test_rescan_failed_job_reports_failed_and_next_job_can_start(self):
        chunks_dir = self.self_base / 'video_chunks' / 'fail_chunks'
        chunks_dir.mkdir(parents=True, exist_ok=True)
        (chunks_dir / 'chunk_0000_0010.mp4').write_bytes(b'video')

        with patch('process_video.perform_face_recognition') as mock_face:
            mock_face.side_effect = RuntimeError("OpenCV crashed")

            res = self.client_self.post('/people/rescan')
            self.assertEqual(res.status_code, 200)

            # Wait for thread to fail
            for _ in range(20):
                st = self.client_self.get('/people/rescan/status').get_json()
                if st['status'] == 'failed':
                    break
                time.sleep(0.05)

            st = self.client_self.get('/people/rescan/status').get_json()
            self.assertEqual(st['status'], 'failed')
            self.assertIn('Face scan failed', st['message'])

            # Next job CAN start now because previous job is no longer 'running'
            mock_face.side_effect = None
            res_retry = self.client_self.post('/people/rescan')
            self.assertEqual(res_retry.status_code, 200)

    def test_demo_limit_at_most_12_people_and_reset_restores_people(self):
        # 1. Add 12 people to demo patient
        for i in range(12):
            res = self.client_demo.post('/people', data={
                'name': f"Demo Person {i+1}",
                'relation': 'Friend',
                'photo': (io.BytesIO(self.valid_face_bytes), f"p{i}.jpg")
            }, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 201, f"Failed adding person {i+1}")

        # 13th person rejected by demo cap
        res13 = self.client_demo.post('/people', data={
            'name': 'Demo Person 13',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.valid_face_bytes), 'p13.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res13.status_code, 400)
        self.assertIn('Demo accounts can have at most 12 people', res13.get_json()['error'])

        # 2. Reset restores the people from sample_data
        res_reset = self.client_demo.post('/demo/reset')
        self.assertEqual(res_reset.status_code, 200)

        # After reset, demo patient has the original demo people restored and their photos
        demo_people = json.loads((self.demo_base / 'people.json').read_text(encoding='utf-8-sig'))
        demo_names = [p['name'] for p in demo_people]
        for expected in ('Asha', 'Bharat', 'Chen', 'Diya'):
            self.assertIn(expected, demo_names)
        for p in demo_people:
            self.assertTrue((self.demo_base / 'known_faces' / p['photo']).exists())

    def test_both_modules_import_same_lock_object(self):
        import locks
        self.assertIs(app.rescan_reset_lock, locks.rescan_reset_lock)
        self.assertIs(auth.rescan_reset_lock, locks.rescan_reset_lock)

    def test_demo_reset_waits_while_rescan_holds_lock(self):
        import threading
        import locks
        lock = locks.rescan_reset_lock

        # Acquire lock in main thread (simulating a running background rescan)
        lock.acquire()
        reset_started = threading.Event()
        reset_finished = threading.Event()

        def do_reset():
            reset_started.set()
            res = self.client_demo.post('/demo/reset')
            self.assertEqual(res.status_code, 200)
            reset_finished.set()

        t = threading.Thread(target=do_reset)
        t.start()

        # Confirm thread started and is blocked waiting for the lock
        self.assertTrue(reset_started.wait(timeout=1.0))
        time.sleep(0.15)
        self.assertFalse(reset_finished.is_set(), "demo_reset should wait while rescan holds lock")

        # Now release the lock
        lock.release()
        # Thread should now proceed and finish promptly
        self.assertTrue(reset_finished.wait(timeout=2.0))
        t.join()

    def test_photo_dimension_limit_rejects_huge_declared_size(self):
        import struct
        import zlib
        sig = b'\x89PNG\r\n\x1a\n'
        w, h = 10000, 10000
        ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
        ihdr_crc = struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
        ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr_data + ihdr_crc
        iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
        huge_png = sig + ihdr_chunk + iend_chunk

        res = self.client_self.post('/people', data={
            'name': 'Huge Resolution Pic',
            'relation': 'Friend',
            'photo': (io.BytesIO(huge_png), 'huge.png')
        }, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)
        self.assertIn('resolution is too large', res.get_json().get('error', '').lower())

    def test_delete_person_in_zoo_video_faces_file_handled_without_crash_or_none(self):
        from seed_demo_media import seed_demo_media
        seed_demo_media(self.demo_base, Path(__file__).resolve().parent.parent)

        memories = json.loads((self.demo_base / 'memories.json').read_text(encoding='utf-8'))
        zoo_id = next(mid for mid, row in memories.items() if 'zoo' in str(row.get('filename', '')).lower())
        today_date = memories[zoo_id].get('date')

        # Confirm Jawed Karim was initially loaded in the memory
        mems_before = self.client_demo.get('/memories').get_json().get('memories', [])
        zoo_before = next(m for m in mems_before if m['id'] == zoo_id)
        self.assertIn('Jawed Karim', zoo_before['people'])

        # Delete Jawed Karim
        del_res = self.client_demo.delete('/people/jawed_karim')
        self.assertEqual(del_res.status_code, 200)

        # 1. GET /memories: no crash, no None, Jawed Karim is dropped
        mems_after = self.client_demo.get('/memories').get_json().get('memories', [])
        zoo_after = next(m for m in mems_after if m['id'] == zoo_id)
        self.assertNotIn('Jawed Karim', zoo_after['people'])
        self.assertNotIn('None', zoo_after['people'])
        self.assertNotIn(None, zoo_after['people'])
        self.assertEqual(zoo_after['people'], [])

        # 2. POST /memories/ask "Who is in it?"
        res_who = self.client_demo.post('/memories/ask', json={
            'question': 'Who is in it?',
            'scope': 'memory',
            'memory_id': zoo_id
        }).get_json()
        self.assertNotIn('None', res_who.get('answer', ''))
        self.assertNotIn('jawed_karim', res_who.get('answer', '').lower())

        # 3. POST /memories/ask "Tell me about this video"
        res_about = self.client_demo.post('/memories/ask', json={
            'question': 'Tell me about this video',
            'scope': 'memory',
            'memory_id': zoo_id
        }).get_json()
        self.assertNotIn('None', res_about.get('answer', ''))
        self.assertNotIn('jawed karim', res_about.get('answer', '').lower())

        # 4. Question generator
        res_q = self.client_demo.post('/generate-questions', json={'date': today_date})
        self.assertEqual(res_q.status_code, 200)
        for q in res_q.get_json().get('questions', []):
            self.assertNotIn('None', str(q))
            self.assertNotIn('jawed_karim', str(q).lower())

        # 5. faces-for-date
        res_df = self.client_demo.get(f'/faces-for-date?date={today_date}')
        self.assertEqual(res_df.status_code, 200)
        self.assertEqual(res_df.get_json().get('detected'), [])

    def test_session_types_editing_people(self):
        # 1. self session: 201 on POST, 200 on PUT, 200 on DELETE
        res_self = self.client_self.post('/people', data={
            'name': 'Self Created',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.valid_face_bytes), 'f.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res_self.status_code, 201)
        p_self_id = res_self.get_json()['id']

        put_self = self.client_self.put(f'/people/{p_self_id}', data={'name': 'Self Updated'})
        self.assertEqual(put_self.status_code, 200)

        del_self = self.client_self.delete(f'/people/{p_self_id}')
        self.assertEqual(del_self.status_code, 200)

        # 2. caregiver member of patient: 201 on POST, 200 on PUT, 200 on DELETE
        res_cg = self.client_cg.post('/people', data={
            'name': 'CG Created',
            'relation': 'Doctor',
            'photo': (io.BytesIO(self.valid_face_bytes), 'f.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res_cg.status_code, 201)
        p_cg_id = res_cg.get_json()['id']

        put_cg = self.client_cg.put(f'/people/{p_cg_id}', data={'name': 'CG Updated'})
        self.assertEqual(put_cg.status_code, 200)

        del_cg = self.client_cg.delete(f'/people/{p_cg_id}')
        self.assertEqual(del_cg.status_code, 200)

        # 3. caregiver of another patient: 404 when trying to PUT or DELETE someone else's person
        # First create a person under self_patient
        res_target = self.client_self.post('/people', data={
            'name': 'Target Person',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.valid_face_bytes), 'f.jpg')
        }, content_type='multipart/form-data')
        p_target_id = res_target.get_json()['id']

        put_other = self.client_other.put(f'/people/{p_target_id}', data={'name': 'Hacked Name'})
        self.assertEqual(put_other.status_code, 404)

        del_other = self.client_other.delete(f'/people/{p_target_id}')
        self.assertEqual(del_other.status_code, 404)

        # 4. patient-device: 403
        res_dev_post = self.client_device.post('/people', data={
            'name': 'Dev Person',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.valid_face_bytes), 'f.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res_dev_post.status_code, 403)
        self.assertEqual(self.client_device.put(f'/people/{p_target_id}', data={'name': 'X'}).status_code, 403)
        self.assertEqual(self.client_device.delete(f'/people/{p_target_id}').status_code, 403)

        # 5. patient-login: 403
        res_pl_post = self.client_patient_login.post('/people', data={
            'name': 'PL Person',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.valid_face_bytes), 'f.jpg')
        }, content_type='multipart/form-data')
        self.assertEqual(res_pl_post.status_code, 403)
        self.assertEqual(self.client_patient_login.put(f'/people/{p_target_id}', data={'name': 'X'}).status_code, 403)
        self.assertEqual(self.client_patient_login.delete(f'/people/{p_target_id}').status_code, 403)

        # 6. no session: 401 or 403
        anon = app.api.test_client()
        res_anon_post = anon.post('/people', data={
            'name': 'Anon Person',
            'relation': 'Friend',
            'photo': (io.BytesIO(self.valid_face_bytes), 'f.jpg')
        }, content_type='multipart/form-data')
        self.assertIn(res_anon_post.status_code, (401, 403))
        self.assertIn(anon.put(f'/people/{p_target_id}', data={'name': 'X'}).status_code, (401, 403))
        self.assertIn(anon.delete(f'/people/{p_target_id}').status_code, (401, 403))


if __name__ == '__main__':
    unittest.main()
