"""Security regression tests: unauthenticated access, role enforcement, cross-patient access.

These tests must all pass without weakening assertions or deleting failing tests.
If a test fails it indicates a real vulnerability that must be fixed, not removed.
"""
import tempfile
import time
import unittest
from pathlib import Path
from flask import Flask
from platform_api import register_platform


class SecurityTests(unittest.TestCase):
    """Verify that routes reject unauthenticated, wrong-role and cross-patient requests."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Flask(__name__)
        self.app.config['PLATFORM_DB'] = str(Path(self.temp.name) / 'sec.sqlite3')
        register_platform(self.app)
        self.client = self.app.test_client()
        self.h = {'X-Cogni-Request': '1'}
        # Create two independent patient/caregiver pairs
        self._setup('care-a', 'long-care-a-pass', 'pat-a', 'long-pat-a-pass')
        self._setup('care-b', 'long-care-b-pass', 'pat-b', 'long-pat-b-pass')

    def tearDown(self):
        self.temp.cleanup()

    def _setup(self, care, care_pw, pat, pat_pw):
        r = self.client.post('/platform/auth/setup', json={
            'username': care, 'password': care_pw,
            'patient_username': pat, 'patient_password': pat_pw,
        }, headers=self.h)
        self.assertEqual(r.status_code, 201, r.get_json())

    def _login(self, username, password):
        r = self.client.post('/platform/auth/login', json={
            'username': username, 'password': password
        }, headers=self.h)
        self.assertEqual(r.status_code, 200, r.get_json())
        return r.get_json()

    def _logout(self):
        self.client.post('/platform/auth/logout', json={}, headers=self.h)

    def _record(self, kind='journal'):
        return {'id': 'test-rec', 'kind': kind, 'updatedAt': time.time() * 1000, 'data': {'text': 'TEST'}}

    # ── Unauthenticated access ────────────────────────────────────────────────

    def test_records_requires_auth(self):
        """GET /records must return 401 without a session."""
        self.assertEqual(self.client.get('/platform/records').status_code, 401)

    def test_records_post_requires_auth(self):
        """POST /records must return 401 without a session (CSRF header present)."""
        r = self.client.post('/platform/records', json={'records': [self._record()]}, headers=self.h)
        self.assertEqual(r.status_code, 401)

    def test_media_get_requires_auth(self):
        """GET /media/<id> must return 401 without a session."""
        self.assertEqual(self.client.get('/platform/media/anything').status_code, 401)

    def test_media_post_requires_auth(self):
        """POST /media/<id> must return 401 without a session."""
        r = self.client.post('/platform/media/new', data=b'data', content_type='audio/webm', headers=self.h)
        self.assertEqual(r.status_code, 401)

    def test_auth_me_requires_auth(self):
        """GET /auth/me must return 401 without a session."""
        self.assertEqual(self.client.get('/platform/auth/me').status_code, 401)

    def test_csrf_header_enforced_on_post(self):
        """POST without X-Cogni-Request must be rejected with 403."""
        r = self.client.post('/platform/auth/login', json={'username': 'pat-a', 'password': 'long-pat-a-pass'})
        self.assertEqual(r.status_code, 403)

    # ── Role enforcement ──────────────────────────────────────────────────────

    def test_patient_cannot_write_caregiver_only_kinds(self):
        """Patient must not upload records of caregiver-only kinds (consent, reminder, message, default)."""
        self._login('pat-a', 'long-pat-a-pass')
        for kind in ('consent', 'reminder', 'message', 'default'):
            r = self.client.post('/platform/records', json={'records': [self._record(kind)]}, headers=self.h)
            self.assertEqual(r.status_code, 403, f"Patient should not write kind={kind}")
        self._logout()

    def test_caregiver_can_write_caregiver_only_kinds(self):
        """Caregiver must be able to write consent, reminder, message and default records."""
        self._login('care-a', 'long-care-a-pass')
        for kind in ('consent', 'reminder', 'message', 'default'):
            rec = {**self._record(kind), 'id': f'rec-{kind}'}
            r = self.client.post('/platform/records', json={'records': [rec]}, headers=self.h)
            self.assertEqual(r.status_code, 200, f"Caregiver should write kind={kind}: {r.get_json()}")
        self._logout()

    def test_patient_can_write_allowed_kinds(self):
        """Patient must be able to write journal, event, score, adherence, location (with consent), mood."""
        account = self._login('care-a', 'long-care-a-pass')
        # Enable location consent first
        consent = {**self._record('consent'), 'id': 'location-consent', 'data': {'tracking': True, 'sync': True}}
        self.client.post('/platform/records', json={'records': [consent]}, headers=self.h)
        self._logout()
        self._login('pat-a', 'long-pat-a-pass')
        for kind in ('journal', 'event', 'score', 'adherence', 'mood'):
            rec = {**self._record(kind), 'id': f'allowed-{kind}'}
            r = self.client.post('/platform/records', json={'records': [rec]}, headers=self.h)
            self.assertEqual(r.status_code, 200, f"Patient should write kind={kind}: {r.get_json()}")
        # Location: needs consent
        loc_rec = {**self._record('location'), 'id': 'loc-1', 'data': {'latitude': 12.9, 'longitude': 77.5, 'timestamp': time.time() * 1000}}
        r = self.client.post('/platform/records', json={'records': [loc_rec]}, headers=self.h)
        self.assertEqual(r.status_code, 200, f"Patient with consent should write location: {r.get_json()}")
        self._logout()

    # ── Cross-patient access ──────────────────────────────────────────────────

    def test_patient_cannot_read_other_patient_records(self):
        """Patient A's records must not be visible to Patient B."""
        # Write a record as patient A
        self._login('pat-a', 'long-pat-a-pass')
        self.client.post('/platform/records', json={'records': [self._record()]}, headers=self.h)
        self._logout()
        # Log in as patient B and verify no records are returned
        self._login('pat-b', 'long-pat-b-pass')
        result = self.client.get('/platform/records').get_json()
        ids = [r['id'] for r in result['records']]
        self.assertNotIn('test-rec', ids, "Patient B must not see Patient A's records")
        self._logout()

    def test_caregiver_cannot_read_other_patients_records(self):
        """Caregiver A's session must not return Patient B's records."""
        # Write as patient B
        self._login('pat-b', 'long-pat-b-pass')
        rec = {**self._record(), 'id': 'b-only', 'data': {'text': 'Patient B private'}}
        self.client.post('/platform/records', json={'records': [rec]}, headers=self.h)
        self._logout()
        # Read as caregiver A
        self._login('care-a', 'long-care-a-pass')
        result = self.client.get('/platform/records').get_json()
        ids = [r['id'] for r in result['records']]
        self.assertNotIn('b-only', ids, "Caregiver A must not see Patient B's records")
        self._logout()

    def test_x_cogni_patient_mismatch_rejected(self):
        """A request with an X-Cogni-Patient that does not match the session must return 409."""
        info_a = self._login('pat-a', 'long-pat-a-pass')
        patient_a = info_a['patient']
        self._logout()
        self._login('pat-b', 'long-pat-b-pass')
        headers_with_wrong_patient = {**self.h, 'X-Cogni-Patient': patient_a}
        r = self.client.post('/platform/records', json={'records': [self._record()]}, headers=headers_with_wrong_patient)
        self.assertEqual(r.status_code, 409, "Wrong patient header must be rejected")
        # Also verify GET is blocked
        r = self.client.get('/platform/records', headers={'X-Cogni-Patient': patient_a})
        self.assertEqual(r.status_code, 409)
        self._logout()

    def test_patient_cannot_upload_media_for_other_patient(self):
        """Uploading media for patient A while logged in as patient B must be blocked."""
        info_a = self._login('pat-a', 'long-pat-a-pass')
        patient_a = info_a['patient']
        self._logout()
        self._login('pat-b', 'long-pat-b-pass')
        headers = {**self.h, 'X-Cogni-Patient': patient_a}
        r = self.client.post('/platform/media/stolen', data=b'FAKE', content_type='audio/webm', headers=headers)
        self.assertEqual(r.status_code, 409)
        self._logout()

    # ── Rate limiting / brute-force protection ────────────────────────────────

    def test_login_rate_limited_after_failures(self):
        """After 8 failed login attempts the endpoint must return 429."""
        for _ in range(8):
            self.client.post('/platform/auth/login', json={
                'username': 'pat-a', 'password': 'wrong-password-xx'
            }, headers=self.h)
        r = self.client.post('/platform/auth/login', json={
            'username': 'pat-a', 'password': 'long-pat-a-pass'
        }, headers=self.h)
        self.assertEqual(r.status_code, 429, "Correct password must also be blocked during lockout")

    # ── Session expiry ────────────────────────────────────────────────────────

    def test_expired_session_rejected(self):
        """An expired session token must be refused with 401."""
        import hashlib, sqlite3
        self._login('pat-a', 'long-pat-a-pass')
        db_path = self.app.config['PLATFORM_DB']
        # Manually expire the session
        db = sqlite3.connect(db_path)
        db.execute("UPDATE sessions SET expires = 0")
        db.commit()
        db.close()
        self.assertEqual(self.client.get('/platform/records').status_code, 401)

    # ── Location consent enforcement ──────────────────────────────────────────

    def test_location_upload_blocked_without_consent(self):
        """Uploading a location record without consent must return 403."""
        self._login('pat-a', 'long-pat-a-pass')
        loc = {**self._record('location'), 'id': 'l1',
               'data': {'latitude': 12.9, 'longitude': 77.5, 'timestamp': time.time() * 1000}}
        r = self.client.post('/platform/records', json={'records': [loc]}, headers=self.h)
        self.assertEqual(r.status_code, 403)
        self._logout()

    def test_location_upload_blocked_after_consent_revoked(self):
        """Revoking consent must block subsequent location uploads."""
        self._login('care-a', 'long-care-a-pass')
        ts = time.time() * 1000
        consent = {'id': 'location-consent', 'kind': 'consent', 'updatedAt': ts,
                   'data': {'tracking': True, 'sync': True}}
        self.client.post('/platform/records', json={'records': [consent]}, headers=self.h)
        # Now revoke
        revoke = {**consent, 'updatedAt': ts + 1, 'data': {'tracking': False, 'sync': False}}
        self.client.post('/platform/records', json={'records': [revoke]}, headers=self.h)
        # Try uploading location — must be blocked
        loc = {**self._record('location'), 'id': 'l2',
               'data': {'latitude': 12.9, 'longitude': 77.5, 'timestamp': time.time() * 1000}}
        r = self.client.post('/platform/records', json={'records': [loc]}, headers=self.h)
        self.assertEqual(r.status_code, 403, "Location upload must be blocked after consent revoked")
        self._logout()

    # ── Password quality ──────────────────────────────────────────────────────

    def test_short_password_rejected_on_setup(self):
        """Passwords shorter than 12 characters must be rejected during setup."""
        r = self.client.post('/platform/auth/setup', json={
            'username': 'newcare', 'password': 'short',
            'patient_username': 'newpat', 'patient_password': 'also-short',
        }, headers=self.h)
        self.assertEqual(r.status_code, 400)

    def test_duplicate_username_rejected(self):
        """Re-using an existing username during setup must be rejected with 409."""
        r = self.client.post('/platform/auth/setup', json={
            'username': 'care-a', 'password': 'long-new-pass-x',
            'patient_username': 'brand-new-pat', 'patient_password': 'long-new-pat-pass',
        }, headers=self.h)
        self.assertEqual(r.status_code, 409)


if __name__ == '__main__':
    unittest.main()
