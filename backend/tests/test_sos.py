import json
from pathlib import Path
import unittest
from unittest.mock import patch

import alerts
import app
import auth
import db
from tests.auth_support import make_client, setup_auth


class SosTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, 'caregiver')
        self.device = make_client('patient_device')

    def test_only_patient_device_and_patient_login_can_create_alerts(self):
        self.assertEqual(self.auth_client.post('/sos').status_code, 403)
        self.assertEqual(make_client('caregiver').post('/sos').status_code, 403)
        with app.api.app_context():
            db.execute("UPDATE users SET role='patient',patient_id='test-patient' WHERE id='test-user'")
            token, _ = auth.new_session('patient_device', user_id='test-user', patient_id='test-patient')
        patient_login = app.api.test_client()
        patient_login.set_cookie(auth.COOKIES['patient_device'], token)
        self.assertEqual(patient_login.post('/sos').status_code, 201)

    def test_alert_is_persisted_and_repeat_taps_return_same_open_alert(self):
        first = self.device.post('/sos', json={'location': {'lat': 12.9, 'lng': 77.5, 'accuracy': 30}})
        again = self.device.post('/sos')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.json['id'], again.json['id'])
        stored = json.loads((self.auth_root / 'data' / 'test-patient' / 'alerts.json').read_text(encoding='utf-8'))
        self.assertEqual(stored[0]['location']['lat'], 12.9)
        self.assertIn('_ownerHash', stored[0])
        self.assertNotIn('_sessionId', stored[0])
        # Verify no raw session id exists in stored alert
        cookie_val = self.device.get_cookie('cogni_device').value
        token = cookie_val.split('.')[0]
        session_row = db.fetchone('SELECT id FROM sessions WHERE token_hash=?', (auth.digest(token),))
        self.assertNotIn(session_row['id'], json.dumps(stored[0]))

    def test_rate_limit_survives_storage_reload_and_allows_at_most_five_per_hour(self):
        now = alerts._now()
        with patch.object(alerts, '_now', side_effect=[now + __import__('datetime').timedelta(minutes=i)
                                                        for i in range(5)]):
            for i in range(5):
                if i:
                    path = self.auth_root / 'data' / 'test-patient' / 'alerts.json'
                    rows = json.loads(path.read_text(encoding='utf-8'))
                    rows[-1]['status'] = 'handled'
                    path.write_text(json.dumps(rows), encoding='utf-8')
                response = self.device.post('/sos')
                self.assertEqual(response.status_code, 201)
        with patch.object(alerts, '_now', return_value=now + __import__('datetime').timedelta(minutes=6)):
            response = self.device.post('/sos')
        self.assertEqual(response.status_code, 429)

    def test_caregiver_lists_handles_and_tests_alert_without_email(self):
        alert_response = self.device.post('/sos')
        self.assertEqual(alert_response.status_code, 201)
        with patch.object(alerts.mailer, 'send_alert') as send_email:
            test_response = self.auth_client.post('/sos/test')
        self.assertEqual(test_response.status_code, 201)
        self.assertTrue(test_response.json['test'])
        send_email.assert_not_called()
        listed = self.auth_client.get('/sos/alerts?status=open')
        self.assertEqual({row['id'] for row in listed.json}, {alert_response.json['id'], test_response.json['id']})
        handled = self.auth_client.post(f"/sos/alerts/{alert_response.json['id']}/handled")
        self.assertEqual(handled.status_code, 200)
        self.assertEqual(handled.json['status'], 'handled')

    def test_email_failure_does_not_prevent_alert_and_location_is_removed_after_30_days(self):
        from datetime import timedelta
        now = alerts._now()
        with patch.object(alerts.mailer, 'send_alert', side_effect=alerts.mailer.DeliveryError('failed')):
            response = self.device.post('/sos', json={'location': {'lat': 12, 'lng': 77}})
        self.assertEqual(response.status_code, 201)
        path = self.auth_root / 'data' / 'test-patient' / 'alerts.json'
        rows = json.loads(path.read_text(encoding='utf-8'))
        rows[0]['createdAt'] = (now - timedelta(days=31)).isoformat()
        path.write_text(json.dumps(rows), encoding='utf-8')
        self.auth_client.get('/sos/alerts?status=all')
        cleaned = json.loads(path.read_text(encoding='utf-8'))
        self.assertNotIn('location', cleaned[0])

    def test_location_validation_and_expired_alert_cleanup(self):
        invalid = self.device.post('/sos', json={'location': {'lat': 91, 'lng': 0}})
        self.assertEqual(invalid.status_code, 400)
        self.device.post('/sos')
        path = self.auth_root / 'data' / 'test-patient' / 'alerts.json'
        rows = json.loads(path.read_text(encoding='utf-8'))
        rows[0]['createdAt'] = '2000-01-01T00:00:00Z'
        path.write_text(json.dumps(rows), encoding='utf-8')
        self.auth_client.get('/sos/alerts?status=all')
        self.assertEqual(json.loads(path.read_text(encoding='utf-8')), [])

    def test_demo_reset_clears_alert_file(self):
        # Reset uses a dedicated demo fixture in the broader auth tests; this
        # verifies the patient initializer always provides a fresh alert store.
        from patient_storage import initialize_patient
        root = self.auth_root / 'reset-patient'
        initialize_patient(root, 'Reset Patient')
        self.assertEqual(json.loads((root / 'alerts.json').read_text(encoding='utf-8')), [])

    def test_no_active_patient_returns_403_on_all_four_routes(self):
        from werkzeug.security import generate_password_hash
        # Caregiver with no linked patients -> g.active_patient is None
        with app.api.app_context():
            db.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role) "
                       "VALUES (?,?,?,?,0,0,?,0,?)",
                       ('unlinked-user', 'unlinked@example.com', 'Unlinked', generate_password_hash('pw', method='scrypt'), auth.now(), 'caregiver'))
            caregiver_token, _ = auth.new_session('caregiver', user_id='unlinked-user')
        caregiver_no_patient = app.api.test_client()
        caregiver_no_patient.set_cookie(auth.COOKIES['caregiver'], caregiver_token)

        # 1. POST /sos
        res1 = caregiver_no_patient.post('/sos')
        self.assertEqual(res1.status_code, 403)
        self.assertEqual(res1.json, {'error': 'No active patient.'})

        # 2. GET /sos/alerts
        res2 = caregiver_no_patient.get('/sos/alerts')
        self.assertEqual(res2.status_code, 403)
        self.assertEqual(res2.json, {'error': 'No active patient.'})

        # 3. POST /sos/alerts/<id>/handled
        res3 = caregiver_no_patient.post('/sos/alerts/fake-id/handled')
        self.assertEqual(res3.status_code, 403)
        self.assertEqual(res3.json, {'error': 'No active patient.'})

        # 4. POST /sos/test
        res4 = caregiver_no_patient.post('/sos/test')
        self.assertEqual(res4.status_code, 403)
        self.assertEqual(res4.json, {'error': 'No active patient.'})

    def test_sweep_alerts_on_startup_cleans_retention_and_ignores_corrupt_files(self):
        from datetime import datetime, timedelta, timezone
        from alerts import sweep_alerts_on_startup
        data_dir = self.auth_root / 'data'
        patient_dir = data_dir / 'test-patient'
        patient_dir.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc)

        # Write alerts file with:
        # - an alert older than 90 days (should be deleted)
        # - an alert older than 30 days with location (location should be removed)
        # - a fresh alert with location (should be untouched)
        # - an old-format alert with raw _sessionId and no _ownerHash (should be migrated)
        rows = [
            {'id': 'expired-alert', 'createdAt': (now - timedelta(days=95)).isoformat(), 'status': 'open'},
            {'id': 'expired-loc', 'createdAt': (now - timedelta(days=35)).isoformat(), 'status': 'open', 'location': {'lat': 10, 'lng': 20}},
            {'id': 'fresh-alert', 'createdAt': (now - timedelta(days=2)).isoformat(), 'status': 'open', 'location': {'lat': 11, 'lng': 21}},
            {'id': 'legacy-session-alert', 'createdAt': (now - timedelta(days=1)).isoformat(), 'status': 'open', '_sessionId': 'old-sess-123'},
        ]
        alerts_path = patient_dir / 'alerts.json'
        alerts_path.write_text(json.dumps(rows), encoding='utf-8')

        # Create a corrupt alerts.json in another patient folder
        corrupt_dir = data_dir / 'corrupt-patient'
        corrupt_dir.mkdir(parents=True, exist_ok=True)
        corrupt_path = corrupt_dir / 'alerts.json'
        corrupt_path.write_text('{invalid-json-content', encoding='utf-8')

        # Create a non-alerts file in the patient folder
        places_path = patient_dir / 'places.json'
        places_content = [{'id': 'p1', 'name': 'Sample'}]
        places_path.write_text(json.dumps(places_content), encoding='utf-8')

        # Run startup sweep
        sweep_alerts_on_startup(str(data_dir))

        # Verify test-patient alerts.json
        cleaned_rows = json.loads(alerts_path.read_text(encoding='utf-8'))
        cleaned_ids = [r['id'] for r in cleaned_rows]
        self.assertNotIn('expired-alert', cleaned_ids)
        self.assertIn('expired-loc', cleaned_ids)
        self.assertIn('fresh-alert', cleaned_ids)
        self.assertIn('legacy-session-alert', cleaned_ids)
        for r in cleaned_rows:
            if r['id'] == 'expired-loc':
                self.assertNotIn('location', r)
            if r['id'] == 'fresh-alert':
                self.assertIn('location', r)
            if r['id'] == 'legacy-session-alert':
                self.assertNotIn('_sessionId', r)
                self.assertEqual(r.get('_ownerHash'), alerts._session_hash('old-sess-123'))
        self.assertNotIn('old-sess-123', alerts_path.read_text(encoding='utf-8'))

        # Verify corrupt file is untouched and did not crash the sweep
        self.assertEqual(corrupt_path.read_text(encoding='utf-8'), '{invalid-json-content')

        # Verify places.json is untouched
        self.assertEqual(json.loads(places_path.read_text(encoding='utf-8')), places_content)

    def test_four_session_matrix(self):
        from werkzeug.security import generate_password_hash
        # Create self user & patient
        with app.api.app_context():
            db.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role) "
                       "VALUES (?,?,?,?,0,0,?,0,'self')",
                       ('self-user-id', 'self@matrix.local', 'Self User', generate_password_hash('pw', method='scrypt'), auth.now()))
            db.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,NULL,?,?,0)",
                       ('self-patient-id', 'Self Patient', 'self-user-id', auth.now()))
            db.execute("UPDATE users SET patient_id='self-patient-id' WHERE id='self-user-id'")
            db.execute("INSERT INTO patient_members VALUES ('self-patient-id','self-user-id','owner')")

            # Create patient-login user
            db.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role,patient_id) "
                       "VALUES (?,?,?,?,0,0,?,0,'patient','test-patient')",
                       ('patient-user-id', 'patient@matrix.local', 'Patient Login', generate_password_hash('pw', method='scrypt'), auth.now()))

            self_token, _ = auth.new_session('caregiver', user_id='self-user-id')
            patient_login_token, _ = auth.new_session('patient_device', user_id='patient-user-id', patient_id='test-patient')

        self_client = app.api.test_client()
        self_client.set_cookie(auth.COOKIES['caregiver'], self_token)

        patient_login_client = app.api.test_client()
        patient_login_client.set_cookie(auth.COOKIES['patient_device'], patient_login_token)

        cg_client = self.auth_client
        dev_client = self.device

        # Create real places first: one for caregiver's patient, one for self's patient
        place_cg_payload = {'name': 'Clinic', 'category': 'doctor', 'mapsUrl': 'https://maps.app.goo.gl/cg-clinic', 'note': ''}
        res_cg_create = cg_client.post('/places', json=place_cg_payload)
        self.assertEqual(res_cg_create.status_code, 201)
        place_cg_id = res_cg_create.get_json()['id']

        place_self_payload = {'name': 'Home', 'category': 'home', 'mapsUrl': 'https://maps.app.goo.gl/self-home', 'note': ''}
        res_self_create = self_client.post('/places', json=place_self_payload)
        self.assertEqual(res_self_create.status_code, 201)
        place_self_id = res_self_create.get_json()['id']

        # 1. POST /sos
        res_dev_sos = dev_client.post('/sos')
        self.assertEqual(res_dev_sos.status_code, 201)
        self.assertFalse(res_dev_sos.get_json()['test'])
        alert_id = res_dev_sos.get_json()['id']

        res_pl_sos = patient_login_client.post('/sos')
        self.assertEqual(res_pl_sos.status_code, 201)
        self.assertFalse(res_pl_sos.get_json()['test'])

        res_cg_sos = cg_client.post('/sos')
        self.assertEqual(res_cg_sos.status_code, 403)
        self.assertEqual(res_cg_sos.get_json(), {'error': 'Only a patient device or patient login can send an alert.'})

        res_self_sos = self_client.post('/sos')
        self.assertEqual(res_self_sos.status_code, 403)
        self.assertEqual(res_self_sos.get_json(), {'error': 'Only a patient device or patient login can send an alert.'})

        # 2. GET /sos/alerts
        res_cg_alerts = cg_client.get('/sos/alerts')
        self.assertEqual(res_cg_alerts.status_code, 200)
        self.assertTrue(isinstance(res_cg_alerts.get_json(), list))

        res_self_alerts = self_client.get('/sos/alerts')
        self.assertEqual(res_self_alerts.status_code, 403)
        self.assertEqual(res_self_alerts.get_json(), {'error': 'Caregiver access is required.'})

        res_dev_alerts = dev_client.get('/sos/alerts')
        self.assertEqual(res_dev_alerts.status_code, 403)
        self.assertEqual(res_dev_alerts.get_json(), {'error': 'Unable to complete this request. Please check your details and try again.'})

        res_pl_alerts = patient_login_client.get('/sos/alerts')
        self.assertEqual(res_pl_alerts.status_code, 403)
        self.assertEqual(res_pl_alerts.get_json(), {'error': 'Unable to complete this request. Please check your details and try again.'})

        # 3. POST /sos/alerts/<id>/handled
        res_cg_handled = cg_client.post(f'/sos/alerts/{alert_id}/handled')
        self.assertEqual(res_cg_handled.status_code, 200)
        self.assertEqual(res_cg_handled.get_json()['status'], 'handled')

        res_self_handled = self_client.post(f'/sos/alerts/{alert_id}/handled')
        self.assertEqual(res_self_handled.status_code, 403)
        self.assertEqual(res_self_handled.get_json(), {'error': 'Caregiver access is required.'})

        res_dev_handled = dev_client.post(f'/sos/alerts/{alert_id}/handled')
        self.assertEqual(res_dev_handled.status_code, 403)
        self.assertEqual(res_dev_handled.get_json(), {'error': 'Unable to complete this request. Please check your details and try again.'})

        res_pl_handled = patient_login_client.post(f'/sos/alerts/{alert_id}/handled')
        self.assertEqual(res_pl_handled.status_code, 403)
        self.assertEqual(res_pl_handled.get_json(), {'error': 'Unable to complete this request. Please check your details and try again.'})

        # 4. POST /sos/test
        res_cg_test = cg_client.post('/sos/test')
        self.assertEqual(res_cg_test.status_code, 201)
        self.assertTrue(res_cg_test.get_json()['test'])

        res_self_test = self_client.post('/sos/test')
        self.assertEqual(res_self_test.status_code, 403)
        self.assertEqual(res_self_test.get_json(), {'error': 'Caregiver access is required.'})

        res_dev_test = dev_client.post('/sos/test')
        self.assertEqual(res_dev_test.status_code, 403)
        self.assertEqual(res_dev_test.get_json(), {'error': 'Unable to complete this request. Please check your details and try again.'})

        res_pl_test = patient_login_client.post('/sos/test')
        self.assertEqual(res_pl_test.status_code, 403)
        self.assertEqual(res_pl_test.get_json(), {'error': 'Unable to complete this request. Please check your details and try again.'})

        # 5. POST /places (creation permissions)
        res_dev_create = dev_client.post('/places', json=place_cg_payload)
        self.assertEqual(res_dev_create.status_code, 403)
        self.assertEqual(res_dev_create.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        res_pl_create = patient_login_client.post('/places', json=place_cg_payload)
        self.assertEqual(res_pl_create.status_code, 403)
        self.assertEqual(res_pl_create.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        # 6. PUT /places/<id>
        res_cg_put = cg_client.put(f'/places/{place_cg_id}', json={'name': 'Updated Clinic'})
        self.assertEqual(res_cg_put.status_code, 200)
        self.assertEqual(res_cg_put.get_json()['name'], 'Updated Clinic')

        res_self_put = self_client.put(f'/places/{place_self_id}', json={'name': 'Updated Home'})
        self.assertEqual(res_self_put.status_code, 200)
        self.assertEqual(res_self_put.get_json()['name'], 'Updated Home')

        # Check cross-patient isolation gives 404
        self.assertEqual(self_client.put(f'/places/{place_cg_id}', json={'name': 'Hacked'}).status_code, 404)
        self.assertEqual(cg_client.put(f'/places/{place_self_id}', json={'name': 'Hacked'}).status_code, 404)

        res_dev_put = dev_client.put(f'/places/{place_cg_id}', json={'name': 'Hacked'})
        self.assertEqual(res_dev_put.status_code, 403)
        self.assertEqual(res_dev_put.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        res_pl_put = patient_login_client.put(f'/places/{place_cg_id}', json={'name': 'Hacked'})
        self.assertEqual(res_pl_put.status_code, 403)
        self.assertEqual(res_pl_put.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        # 7. POST /places/<id>/photo (check role access & cross-patient 404)
        # Without multipart file, allowed roles get 400 "Please choose a photo." proving access check passed
        res_cg_photo = cg_client.post(f'/places/{place_cg_id}/photo')
        self.assertEqual(res_cg_photo.status_code, 400)
        self.assertEqual(res_cg_photo.get_json(), {'error': 'Please choose a photo.'})

        res_self_photo = self_client.post(f'/places/{place_self_id}/photo')
        self.assertEqual(res_self_photo.status_code, 400)
        self.assertEqual(res_self_photo.get_json(), {'error': 'Please choose a photo.'})

        # Cross-patient photo gives 404
        self.assertEqual(self_client.post(f'/places/{place_cg_id}/photo').status_code, 404)
        self.assertEqual(cg_client.post(f'/places/{place_self_id}/photo').status_code, 404)

        res_dev_photo = dev_client.post(f'/places/{place_cg_id}/photo')
        self.assertEqual(res_dev_photo.status_code, 403)
        self.assertEqual(res_dev_photo.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        res_pl_photo = patient_login_client.post(f'/places/{place_cg_id}/photo')
        self.assertEqual(res_pl_photo.status_code, 403)
        self.assertEqual(res_pl_photo.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        # 8. DELETE /places/<id>
        # Cross-patient delete gives 404
        self.assertEqual(self_client.delete(f'/places/{place_cg_id}').status_code, 404)
        self.assertEqual(cg_client.delete(f'/places/{place_self_id}').status_code, 404)

        res_dev_del = dev_client.delete(f'/places/{place_cg_id}')
        self.assertEqual(res_dev_del.status_code, 403)
        self.assertEqual(res_dev_del.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        res_pl_del = patient_login_client.delete(f'/places/{place_cg_id}')
        self.assertEqual(res_pl_del.status_code, 403)
        self.assertEqual(res_pl_del.get_json(), {'error': 'Only the patient or a caregiver can edit places.'})

        res_cg_del = cg_client.delete(f'/places/{place_cg_id}')
        self.assertEqual(res_cg_del.status_code, 200)

        res_self_del = self_client.delete(f'/places/{place_self_id}')
        self.assertEqual(res_self_del.status_code, 200)

    def test_patch_location_full_flow_and_constraints(self):
        # 1. Create alert without location
        alert_res = self.device.post('/sos', json={'requestKey': 'req-key-1'})
        self.assertEqual(alert_res.status_code, 201)
        alert_id = alert_res.json['id']
        self.assertNotIn('_ownerHash', alert_res.json)
        self.assertNotIn('_sessionId', alert_res.json)

        # GET /sos/alerts never returns _ownerHash or _sessionId
        caregiver_list = self.auth_client.get('/sos/alerts?status=open')
        self.assertEqual(caregiver_list.status_code, 200)
        matching = [a for a in caregiver_list.json if a['id'] == alert_id][0]
        self.assertNotIn('_ownerHash', matching)
        self.assertNotIn('_sessionId', matching)

        # Idempotency: same requestKey from same session within 10 min returns same alert with 200
        idempotent_res = self.device.post('/sos', json={'requestKey': 'req-key-1'})
        self.assertEqual(idempotent_res.status_code, 200)
        self.assertEqual(idempotent_res.json['id'], alert_id)

        # Caregiver or unauthenticated cannot PATCH location (403)
        cg_patch = self.auth_client.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.0, 'lng': 77.0, 'accuracy': 10}})
        self.assertEqual(cg_patch.status_code, 403)

        anon_client = app.api.test_client()
        anon_patch = anon_client.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.0, 'lng': 77.0, 'accuracy': 10}})
        self.assertEqual(anon_patch.status_code, 401)

        # Another patient's device / session cannot find or update it (404)
        # Create a second patient
        with app.api.app_context():
            db.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,NULL,?,?,0)",
                       ('patient-2', 'Patient Two', 'test-user', auth.now()))
            token_p2, _ = auth.new_session('patient_device', patient_id='patient-2')
        p2_client = app.api.test_client()
        p2_client.set_cookie(auth.COOKIES['patient_device'], token_p2)
        p2_patch = p2_client.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.0, 'lng': 77.0, 'accuracy': 10}})
        self.assertEqual(p2_patch.status_code, 404)

        # Another session for the SAME patient gets 403 (alert owned by first session)
        # Verify it does NOT increment _patchAttempts
        with app.api.app_context():
            token_other_sess, _ = auth.new_session('patient_device', patient_id='test-patient')
        other_sess_client = app.api.test_client()
        other_sess_client.set_cookie(auth.COOKIES['patient_device'], token_other_sess)
        other_sess_patch = other_sess_client.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.0, 'lng': 77.0, 'accuracy': 10}})
        self.assertEqual(other_sess_patch.status_code, 403)
        path = self.auth_root / 'data' / 'test-patient' / 'alerts.json'
        rows = json.loads(path.read_text(encoding='utf-8'))
        target_alert = [r for r in rows if r['id'] == alert_id][0]
        self.assertEqual(target_alert.get('_patchAttempts', 0), 0)

        # Alert without _ownerHash and without _sessionId gets 403
        legacy_id = 'legacy-alert-id'
        rows.append({
            'id': legacy_id,
            'createdAt': alerts._now().isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'deviceLabel': 'Legacy device',
            'status': 'open',
            'location': None,
        })
        path.write_text(json.dumps(rows), encoding='utf-8')
        legacy_patch = self.device.patch(f'/sos/alerts/{legacy_id}/location', json={'location': {'lat': 12.0, 'lng': 77.0, 'accuracy': 10}})
        self.assertEqual(legacy_patch.status_code, 403)

        # Invalid location inputs: bounds, types, missing accuracy -> 400
        self.assertEqual(self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 91, 'lng': 0, 'accuracy': 10}}).status_code, 400)
        self.assertEqual(self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 0, 'lng': 181, 'accuracy': 10}}).status_code, 400)
        self.assertEqual(self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 0, 'lng': 0}}).status_code, 400)
        self.assertEqual(self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 'bad', 'lng': 0, 'accuracy': 10}}).status_code, 400)

        # Valid patch by owning session within 2 minutes sends NO second email and returns 200
        with patch.object(alerts.mailer, 'send_alert') as send_email:
            ok_patch = self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.95, 'lng': 77.55, 'accuracy': 25.5}})
        self.assertEqual(ok_patch.status_code, 200)
        send_email.assert_not_called()
        self.assertEqual(ok_patch.json['location'], {'lat': 12.95, 'lng': 77.55, 'accuracy': 25.5})
        self.assertNotIn('_ownerHash', ok_patch.json)

        # Second successful patch to same alert returns 400 (only one patch allowed)
        second_patch = self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.95, 'lng': 77.55, 'accuracy': 15}})
        self.assertEqual(second_patch.status_code, 400)

        # Third attempt returns 400 and increments attempts to 3
        third_patch = self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.95, 'lng': 77.55, 'accuracy': 15}})
        self.assertEqual(third_patch.status_code, 400)

        # Rate limit to 3 requests per alert: 4th attempt returns 429
        rate_patch = self.device.patch(f'/sos/alerts/{alert_id}/location', json={'location': {'lat': 12.95, 'lng': 77.55, 'accuracy': 15}})
        self.assertEqual(rate_patch.status_code, 429)

        # Expired alert (>2 min) returns 400
        # Create directly in alerts.json to avoid POST rate limit / cooldown
        from datetime import timedelta
        expired_id = 'expired-alert-test'
        cookie_val = self.device.get_cookie('cogni_device').value
        token = cookie_val.split('.')[0]
        session_row = db.fetchone('SELECT id FROM sessions WHERE token_hash=?', (auth.digest(token),))
        rows = json.loads(path.read_text(encoding='utf-8'))
        rows.append({
            'id': expired_id,
            'createdAt': (alerts._now() - timedelta(minutes=5)).isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'deviceLabel': 'Test device',
            'status': 'open',
            '_ownerHash': alerts._session_hash(session_row['id']),
            'location': None,
        })
        path.write_text(json.dumps(rows), encoding='utf-8')
        expired_patch = self.device.patch(f'/sos/alerts/{expired_id}/location', json={'location': {'lat': 12.0, 'lng': 77.0, 'accuracy': 10}})
        self.assertEqual(expired_patch.status_code, 400)
        self.assertEqual(expired_patch.json, {'error': 'Location update window has expired.'})


if __name__ == '__main__':
    unittest.main()

