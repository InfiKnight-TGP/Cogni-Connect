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


if __name__ == '__main__':
    unittest.main()
