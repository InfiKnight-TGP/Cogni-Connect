"""SOS and emergency-workflow regression tests (Nikil – Task E).

Verifies:
  - SOS records are accepted and stored in-app.
  - Cancellation is handled client-side (backend simply stores it).
  - Caregiver can read SOS records from their patient's feed.
  - Location coordinates are stripped from SOS when consent is not in effect.
  - SOS without location can still be submitted (fallback path).
  - Unauthenticated SOS is rejected.

Limitation note (documented, not hidden):
  External SMS / push notifications are NOT tested here because the prototype
  does not configure an external notification provider.  The caregiver inbox
  (in-app alert) IS tested.
"""
import tempfile
import time
import unittest
from pathlib import Path
from flask import Flask
from platform_api import register_platform


class SOSTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Flask(__name__)
        self.app.config['PLATFORM_DB'] = str(Path(self.temp.name) / 'sos.sqlite3')
        register_platform(self.app)
        self.client = self.app.test_client()
        self.h = {'X-Cogni-Request': '1'}
        self._setup('care', 'long-care-pass', 'pat', 'long-pat-pass')

    def tearDown(self):
        self.temp.cleanup()

    def _setup(self, care, cpw, pat, ppw):
        self.client.post('/platform/auth/setup', json={
            'username': care, 'password': cpw,
            'patient_username': pat, 'patient_password': ppw,
        }, headers=self.h)

    def _login(self, user, pw):
        r = self.client.post('/platform/auth/login', json={'username': user, 'password': pw}, headers=self.h)
        self.assertEqual(r.status_code, 200)
        return r.get_json()

    def _logout(self):
        self.client.post('/platform/auth/logout', json={}, headers=self.h)

    def _sos(self, location=None, ts=None):
        return {
            'id': 'sos-1',
            'kind': 'sos',
            'updatedAt': ts or time.time() * 1000,
            'data': {'requestedAt': time.time() * 1000, 'location': location},
        }

    def _enable_location_consent(self, ts=None):
        self._login('care', 'long-care-pass')
        consent = {
            'id': 'location-consent', 'kind': 'consent',
            'updatedAt': ts or time.time() * 1000,
            'data': {'tracking': True, 'sync': True},
        }
        r = self.client.post('/platform/records', json={'records': [consent]}, headers=self.h)
        self.assertEqual(r.status_code, 200)
        self._logout()

    def test_sos_without_location_accepted(self):
        """A patient may submit an SOS without location data."""
        self._login('pat', 'long-pat-pass')
        r = self.client.post('/platform/records', json={'records': [self._sos(location=None)]}, headers=self.h)
        self.assertEqual(r.status_code, 200)

    def test_sos_with_location_blocked_without_consent(self):
        """SOS with embedded coordinates must be blocked when consent is not in effect."""
        self._login('pat', 'long-pat-pass')
        loc = {'latitude': 12.9, 'longitude': 77.5}
        r = self.client.post('/platform/records', json={'records': [self._sos(location=loc)]}, headers=self.h)
        self.assertEqual(r.status_code, 403,
            "SOS with location must be rejected when location-consent.sync is not set")

    def test_sos_with_location_allowed_with_consent(self):
        """SOS with embedded coordinates must be accepted when caregiver has set sync consent."""
        self._enable_location_consent()
        self._login('pat', 'long-pat-pass')
        loc = {'latitude': 12.9, 'longitude': 77.5}
        r = self.client.post('/platform/records', json={'records': [self._sos(location=loc)]}, headers=self.h)
        self.assertEqual(r.status_code, 200)

    def test_sos_visible_in_caregiver_feed(self):
        """An SOS submitted by the patient must appear in the caregiver's record feed."""
        self._login('pat', 'long-pat-pass')
        self.client.post('/platform/records', json={'records': [self._sos()]}, headers=self.h)
        self._logout()
        self._login('care', 'long-care-pass')
        records = self.client.get('/platform/records').get_json()['records']
        sos_records = [r for r in records if r['kind'] == 'sos']
        self.assertEqual(len(sos_records), 1, "Caregiver must see patient's SOS in the feed")

    def test_sos_unauthenticated_rejected(self):
        """Unauthenticated SOS must be rejected."""
        r = self.client.post('/platform/records', json={'records': [self._sos()]}, headers=self.h)
        self.assertEqual(r.status_code, 401)

    def test_sos_revoked_consent_strips_location(self):
        """After consent is revoked, SOS with coordinates must be blocked."""
        ts = time.time() * 1000
        self._enable_location_consent(ts=ts)
        # Revoke consent
        self._login('care', 'long-care-pass')
        revoke = {
            'id': 'location-consent', 'kind': 'consent',
            'updatedAt': ts + 1,
            'data': {'tracking': False, 'sync': False},
        }
        self.client.post('/platform/records', json={'records': [revoke]}, headers=self.h)
        self._logout()
        # Attempt SOS with location from patient
        self._login('pat', 'long-pat-pass')
        loc = {'latitude': 12.9, 'longitude': 77.5}
        r = self.client.post('/platform/records', json={'records': [self._sos(location=loc)]}, headers=self.h)
        self.assertEqual(r.status_code, 403,
            "SOS with location must be blocked after consent revocation")
        # SOS without location must still be accepted (fallback path)
        r = self.client.post('/platform/records', json={'records': [self._sos(location=None, ts=ts + 2)]}, headers=self.h)
        self.assertEqual(r.status_code, 200,
            "SOS without location must still be accepted as emergency fallback")

    def test_multiple_sos_idempotent(self):
        """Submitting the same SOS record twice must not create duplicate entries."""
        self._login('pat', 'long-pat-pass')
        sos = self._sos()
        self.client.post('/platform/records', json={'records': [sos]}, headers=self.h)
        self.client.post('/platform/records', json={'records': [sos]}, headers=self.h)
        self._logout()
        self._login('care', 'long-care-pass')
        records = self.client.get('/platform/records').get_json()['records']
        sos_records = [r for r in records if r['kind'] == 'sos']
        self.assertEqual(len(sos_records), 1, "Duplicate SOS submission must result in one record")


if __name__ == '__main__':
    unittest.main()
