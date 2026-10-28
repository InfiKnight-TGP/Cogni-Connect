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
        self.assertEqual(again.status_code, 201)
        self.assertEqual(first.json['id'], again.json['id'])
        stored = json.loads((self.auth_root / 'data' / 'test-patient' / 'alerts.json').read_text(encoding='utf-8'))
        self.assertEqual(stored[0]['location']['lat'], 12.9)
        self.assertIn('_sessionId', stored[0])

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
        rows = [
            {'id': 'expired-alert', 'createdAt': (now - timedelta(days=95)).isoformat(), 'status': 'open'},
            {'id': 'expired-loc', 'createdAt': (now - timedelta(days=35)).isoformat(), 'status': 'open', 'location': {'lat': 10, 'lng': 20}},
            {'id': 'fresh-alert', 'createdAt': (now - timedelta(days=2)).isoformat(), 'status': 'open', 'location': {'lat': 11, 'lng': 21}},
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
        for r in cleaned_rows:
            if r['id'] == 'expired-loc':
                self.assertNotIn('location', r)
            if r['id'] == 'fresh-alert':
                self.assertIn('location', r)

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

        # 4 sessions: self, caregiver (self.auth_client), patient_device (self.device), patient_login
        # 1. POST /sos: only patient_device and patient_login are allowed
        self.assertEqual(self.device.post('/sos').status_code, 201)
        self.assertEqual(patient_login_client.post('/sos').status_code, 201)
        self.assertEqual(self.auth_client.post('/sos').status_code, 403)
        self.assertEqual(self_client.post('/sos').status_code, 403)

        # 2. GET /sos/alerts: only caregiver is allowed
        self.assertEqual(self.auth_client.get('/sos/alerts').status_code, 200)
        self.assertEqual(self_client.get('/sos/alerts').status_code, 403)
        self.assertEqual(self.device.get('/sos/alerts').status_code, 403)
        self.assertEqual(patient_login_client.get('/sos/alerts').status_code, 403)

        # 3. POST /sos/test: only caregiver is allowed
        self.assertEqual(self.auth_client.post('/sos/test').status_code, 201)
        self.assertEqual(self_client.post('/sos/test').status_code, 403)
        self.assertEqual(self.device.post('/sos/test').status_code, 403)
        self.assertEqual(patient_login_client.post('/sos/test').status_code, 403)

        # 4. Places read: all 4 can read places
        self.assertEqual(self.auth_client.get('/places').status_code, 200)
        self.assertEqual(self_client.get('/places').status_code, 200)
        self.assertEqual(self.device.get('/places').status_code, 200)
        self.assertEqual(patient_login_client.get('/places').status_code, 200)

        # 5. Places write: self-care can write to its own patient's places!
        place_payload = {'name': 'Self Place', 'category': 'home', 'mapsUrl': 'https://maps.app.goo.gl/place', 'note': ''}
        self.assertEqual(self_client.post('/places', json=place_payload).status_code, 201)
        self.assertEqual(self.auth_client.post('/places', json=place_payload).status_code, 201)
        self.assertEqual(self.device.post('/places', json=place_payload).status_code, 403)
        self.assertEqual(patient_login_client.post('/places', json=place_payload).status_code, 403)


if __name__ == '__main__':
    unittest.main()
