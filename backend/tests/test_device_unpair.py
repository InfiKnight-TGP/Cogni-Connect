import unittest
from unittest.mock import patch
from werkzeug.security import generate_password_hash

import app
import auth
import db
from tests.auth_support import setup_auth, make_client


class DeviceUnpairTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, kind='patient_device')
        self.device = self.auth_client

    def test_wrong_pin_keeps_session_and_correct_pin_only_removes_one_device(self):
        self.assertEqual(self.device.post('/device/unpair', json={'pin': '0000'}).status_code, 403)
        self.assertEqual(self.device.get('/auth/me').status_code, 200)
        other = make_client('patient_device')
        self.assertEqual(self.device.post('/device/unpair', json={'pin': '1234'}).status_code, 200)
        self.assertEqual(self.device.get('/auth/me').status_code, 401)
        self.assertEqual(other.get('/auth/me').status_code, 200)

    def test_no_pin_returns_409_and_old_device_keeps_working(self):
        with app.api.app_context():
            db.execute('UPDATE patients SET pin_hash=NULL WHERE id=?', ('test-patient',))
        self.assertEqual(self.device.post('/device/unpair', json={'pin': '0000'}).status_code, 409)
        self.assertEqual(self.device.get('/auth/me').status_code, 200)

    def test_lockout_persists_after_new_app_request(self):
        for _ in range(5):
            self.assertEqual(self.device.post('/device/unpair', json={'pin': '0000'}).status_code, 403)
        blocked = self.device.post('/device/unpair', json={'pin': '1234'})
        self.assertEqual(blocked.status_code, 429)
        self.assertIn('Retry-After', blocked.headers)
        fresh = app.api.test_client()
        fresh.set_cookie('cogni_device', self.device.get_cookie('cogni_device').value)
        self.assertEqual(fresh.post('/device/unpair', json={'pin': '1234'}).status_code, 429)

    def test_caregiver_and_self_sessions_are_rejected(self):
        self.assertEqual(make_client('caregiver').post('/device/unpair', json={'pin': '1234'}).status_code, 403)
        with app.api.app_context():
            db.execute("INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role) VALUES (?,?,?,?,?,0,'self')", ('self-user', 'self@example.com', 'Self', generate_password_hash('password1'), auth.now()))
        self_client = app.api.test_client()
        with app.api.app_context():
            token, _ = auth.new_session('caregiver', user_id='self-user')
        self_client.set_cookie('cogni_session', token)
        self.assertEqual(self_client.post('/device/unpair', json={'pin': '1234'}).status_code, 403)

    def test_pair_create_requires_pin(self):
        with app.api.app_context():
            db.execute('UPDATE patients SET pin_hash=NULL WHERE id=?', ('test-patient',))
        caregiver = make_client('caregiver')
        self.assertEqual(caregiver.post('/pair/create', json={'patient_id': 'test-patient'}).status_code, 409)

    def test_demo_device_uses_demo_pin_and_same_endpoint(self):
        with app.api.app_context():
            db.execute('UPDATE patients SET is_demo=1 WHERE id=?', ('test-patient',))
        with patch.dict(app.api.config, {'AUTH_DEMO': True}):
            self.assertEqual(self.device.post('/device/unpair', json={'pin': '1234'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
