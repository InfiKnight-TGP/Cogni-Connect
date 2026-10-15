import tempfile
import time
import unittest
from pathlib import Path
from flask import Flask
from platform_api import register_platform


class PlatformTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Flask(__name__)
        self.app.config['PLATFORM_DB'] = str(Path(self.temp.name) / 'test.sqlite3')
        register_platform(self.app)
        self.client = self.app.test_client()
        self.headers = {'X-Cogni-Request': '1'}
        self.post('/auth/setup', {'username': 'caregiver', 'password': 'long-caregiver-pass', 'patient_username': 'patient', 'patient_password': 'long-patient-pass'})

    def tearDown(self):
        self.temp.cleanup()

    def post(self, path, value):
        return self.client.post('/platform' + path, json=value, headers=self.headers)

    def login(self, role='patient'):
        return self.post('/auth/login', {'username': role, 'password': 'long-' + role + '-pass'})

    def record(self, kind='journal', stamp=None):
        return {'id': 'one', 'kind': kind, 'updatedAt': stamp or time.time() * 1000, 'data': {'text': 'SIMULATED'}}

    def test_auth_roles_and_csrf(self):
        self.assertEqual(self.client.get('/platform/records').status_code, 401)
        self.assertEqual(self.client.post('/platform/auth/login', json={}).status_code, 403)
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.post('/records', {'records': [self.record('consent')]}).status_code, 403)
        self.assertEqual(self.post('/records', {'records': [self.record()]}).status_code, 200)
        self.post('/auth/logout', {})
        self.assertEqual(self.client.get('/platform/records').status_code, 401)

    def test_lww_idempotence_and_patient_isolation(self):
        self.login()
        row = self.record()
        self.post('/records', {'records': [row]})
        self.post('/records', {'records': [row]})
        older = {**row, 'updatedAt': row['updatedAt'] - 100, 'data': {'text': 'old'}}
        result = self.post('/records', {'records': [older]}).get_json()['records']
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['data']['text'], 'SIMULATED')
        self.post('/auth/logout', {})
        self.post('/auth/setup', {'username': 'othercare', 'password': 'long-other-care-pass', 'patient_username': 'otherpatient', 'patient_password': 'long-other-patient-pass'})
        self.post('/auth/login', {'username': 'otherpatient', 'password': 'long-other-patient-pass'})
        self.assertEqual(self.client.get('/platform/records').get_json()['records'], [])

    def test_validation_and_location_consent(self):
        self.login()
        self.assertEqual(self.post('/records', {'records': [self.record('location')]}).status_code, 403)
        self.assertEqual(self.post('/records', {'records': [{**self.record(), 'updatedAt': float('nan')}]}).status_code, 400)
        self.assertEqual(self.post('/records', {'records': [self.record('invalid')]}).status_code, 400)
        self.post('/auth/logout', {})
        self.login('caregiver')
        consent = {**self.record('consent'), 'id': 'location-consent', 'data': {'sync': True}}
        self.assertEqual(self.post('/records', {'records': [consent]}).status_code, 200)
        self.assertEqual(self.post('/records', {'records': [self.record('location')]}).status_code, 200)

    def test_private_media_requires_login_and_known_format(self):
        self.assertEqual(self.client.get('/platform/media/test').status_code, 401)
        self.login()
        self.assertEqual(self.client.post('/platform/media/test', data=b'hello', content_type='text/html', headers=self.headers).status_code, 400)
        self.assertEqual(self.client.post('/platform/media/test', data=b'SIMULATED_WEBM', content_type='audio/webm', headers=self.headers).status_code, 200)
        response = self.client.get('/platform/media/test')
        self.assertEqual(response.data, b'SIMULATED_WEBM')
        self.assertEqual(response.headers['Cache-Control'], 'private, no-store')
        response.close()
        self.post('/auth/logout', {})
        self.assertEqual(self.client.get('/platform/media/test').status_code, 401)

    def test_location_revocation_blocks_embedded_sos_coordinates(self):
        self.login('caregiver')
        stamp = time.time() * 1000
        consent = {'id': 'location-consent', 'kind': 'consent', 'updatedAt': stamp, 'data': {'tracking': True, 'sync': True}}
        self.post('/records', {'records': [consent]})
        revoked = {**consent, 'updatedAt': stamp + 1, 'data': {'tracking': False, 'sync': False}}
        self.post('/records', {'records': [revoked]})
        alert = {**self.record('sos'), 'data': {'location': {'latitude': 26, 'longitude': 91}}}
        self.assertEqual(self.post('/records', {'records': [alert]}).status_code, 403)
        alert['data']['location'] = None
        self.assertEqual(self.post('/records', {'records': [alert]}).status_code, 200)

    def test_inflight_request_cannot_cross_patient_after_account_switch(self):
        old_patient = self.login().get_json()['patient']
        self.post('/auth/logout', {})
        self.post('/auth/setup', {'username': 'second-care', 'password': 'long-second-care-pass', 'patient_username': 'second-patient', 'patient_password': 'long-second-patient-pass'})
        self.post('/auth/login', {'username': 'second-patient', 'password': 'long-second-patient-pass'})
        headers = {**self.headers, 'X-Cogni-Patient': old_patient}
        response = self.client.post('/platform/records', json={'records': [self.record()]}, headers=headers)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get('/platform/records', headers=headers).status_code, 409)
        self.assertEqual(self.client.post('/platform/media/old-recording', data=b'SIMULATED', content_type='audio/webm', headers=headers).status_code, 409)
        self.assertEqual(self.client.get('/platform/records').get_json()['records'], [])
