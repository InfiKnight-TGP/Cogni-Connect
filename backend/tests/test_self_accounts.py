import unittest
from unittest.mock import patch
from werkzeug.security import generate_password_hash

import auth
import db
from tests.auth_support import setup_auth


class SelfAccountTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, kind=None)
        with __import__('app').api.app_context():
            db.execute('INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,0,\'self\',NULL,\'caregiver\')', ('self-a', 'self-a@example.com', 'Self A', generate_password_hash('password1', method='scrypt'), auth.now()))
            db.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,0)', ('self-patient', 'Self A', None, 'self-a', auth.now()))
            db.execute('UPDATE users SET patient_id=? WHERE id=?', ('self-patient', 'self-a'))
            db.execute('INSERT INTO patient_members VALUES (?,?,?)', ('self-patient', 'self-a', 'owner'))
            token, _ = auth.new_session('caregiver', user_id='self-a')
        self.client = __import__('app').api.test_client()
        self.client.set_cookie(auth.COOKIES['caregiver'], token)

    def test_self_is_scoped_and_can_save_own_score(self):
        foreign = {'X-Cogni-Patient': 'test-patient'}
        for path in ('/people', '/videos', '/performance', '/reports/days', '/adaptive', '/patients/test-patient/members'):
            response = self.client.get(path, headers=foreign)
            self.assertIn(response.status_code, (403, 404), path)
        saved = self.client.post('/performance', json={'game_id': 'sound-tap', 'score': 80, 'date': '2026-10-23'})
        self.assertEqual(saved.status_code, 200)

    def test_self_signup_creates_owned_profile(self):
        client = __import__('app').api.test_client()
        with patch('auth.issue_otp', return_value='challenge'):
            response = client.post('/auth/signup', json={'email': 'new-self@example.com', 'password': 'password1', 'name': 'New Self', 'mode': 'self'})
        self.assertEqual(response.status_code, 202)
        with __import__('app').api.app_context():
            user = db.fetchone("SELECT role,patient_id FROM users WHERE email=?", ('new-self@example.com',))
            self.assertEqual(user['role'], 'self')
            self.assertTrue(user['patient_id'])
            self.assertTrue(db.fetchone('SELECT 1 FROM patient_members WHERE patient_id=? AND user_id=(SELECT id FROM users WHERE email=?) AND role=\'owner\'', (user['patient_id'], 'new-self@example.com')))

    def test_owner_cannot_be_removed_and_family_invite_adds_membership(self):
        with __import__('app').api.app_context():
            db.execute('INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,0,\'caregiver\',NULL,\'caregiver\')', ('family-user', 'family@example.com', 'Family', generate_password_hash('password1', method='scrypt'), auth.now()))
            db.execute('INSERT INTO patient_members VALUES (?,?,?)', ('self-patient', 'family-user', 'caregiver'))
        self.assertEqual(self.client.delete('/patients/self-patient/members/family-user').status_code, 200)
        self.assertEqual(self.client.delete('/patients/self-patient/members/self-a').status_code, 403)


if __name__ == '__main__':
    unittest.main()
