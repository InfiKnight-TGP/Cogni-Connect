import json
import unittest

import app
import db
from tests.auth_support import make_client, setup_auth


class PreferenceTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, kind='caregiver')
        self.caregiver = self.auth_client
        self.device = make_client('patient_device')

    def test_defaults_and_device_import_only_after_empty_get(self):
        empty = self.device.get('/preferences')
        self.assertEqual(empty.status_code, 200)
        self.assertTrue(empty.json['empty'])
        self.assertEqual(empty.json['values']['textSize'], 'large')
        imported = self.device.put('/preferences', json={
            'version': empty.json['version'], 'source': 'device-import',
            'values': {'textSize': 'larger'},
        })
        self.assertEqual(imported.status_code, 200)
        self.assertFalse(imported.json['empty'])
        stale_import = self.device.put('/preferences', json={
            'version': imported.json['version'], 'source': 'device-import',
            'values': {'textSize': 'largest'},
        })
        self.assertEqual(stale_import.status_code, 409)

    def test_patient_cannot_change_locked_value_and_caregiver_can_lock(self):
        created = self.caregiver.put('/preferences', json={
            'version': 0, 'values': {'textSize': 'larger'}, 'locked': ['textSize'],
        })
        self.assertEqual(created.status_code, 200)
        device_state = self.device.get('/preferences').json
        denied = self.device.put('/preferences', json={
            'version': device_state['version'], 'values': {'textSize': 'largest'},
        })
        self.assertEqual(denied.status_code, 403)
        self.assertIn('textSize', denied.json['error'])
        allowed = self.device.put('/preferences', json={
            'version': device_state['version'], 'values': {'soundEffects': False},
        })
        self.assertEqual(allowed.status_code, 200)

    def test_stale_write_returns_conflict_and_reset_clears_locks(self):
        first = self.caregiver.put('/preferences', json={'version': 0, 'values': {'readAloud': True}})
        self.assertEqual(first.status_code, 200)
        second = self.caregiver.put('/preferences', json={'version': 0, 'values': {'readAloud': False}})
        self.assertEqual(second.status_code, 409)
        reset = self.caregiver.post('/preferences/reset')
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.json['locked'], [])
        self.assertEqual(reset.json['values']['readAloud'], False)

    def test_validation_and_patient_scope(self):
        bad = self.caregiver.put('/preferences', json={'version': 0, 'values': {'textSize': 'huge'}})
        self.assertEqual(bad.status_code, 400)
        unknown = self.caregiver.put('/preferences', json={'version': 0, 'values': {'secret': True}})
        self.assertEqual(unknown.status_code, 400)
        other = make_client('caregiver')
        with app.api.app_context():
            db.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,0)',
                       ('other-patient', 'Other', None, 'test-user', 1))
        denied = other.get('/preferences', headers={'X-Cogni-Patient': 'other-patient'})
        self.assertEqual(denied.status_code, 403)
        device_other_header = self.device.get('/preferences', headers={'X-Cogni-Patient': 'other-patient'})
        self.assertEqual(device_other_header.status_code, 200)
        self.assertEqual(device_other_header.json['empty'], True)


if __name__ == '__main__':
    unittest.main()
