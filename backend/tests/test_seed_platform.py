import secrets
import tempfile
import unittest
from pathlib import Path
from flask import Flask
from platform_api import register_platform
from seed_platform import seed_demo


class SeedTests(unittest.TestCase):
    def test_simulated_history_is_scoped_declining_and_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            api = Flask(__name__)
            api.config['PLATFORM_DB'] = str(Path(directory) / 'seed.sqlite3')
            register_platform(api)
            client = api.test_client()
            password = secrets.token_urlsafe(24)
            patient_id = seed_demo(client, 'simulated-care', 'simulated-patient', password)
            rows = client.get('/platform/records').get_json()['records']
            events = [row['data'] for row in rows if row['kind'] == 'event']
            self.assertEqual(len(events), 320)
            self.assertTrue(all(event['simulated'] and event['patient'] == patient_id for event in events))
            memory = [event for event in events if event['domain'] == 'Memory']
            scores = [sum(event['correct'] for event in memory if event['session'] == f'SIMULATED-Memory-{i}') * 10 for i in range(8)]
            self.assertEqual(scores, [100, 90, 80, 70, 60, 50, 40, 30])
            with self.assertRaises(ValueError):
                seed_demo(client, 'simulated-care', 'simulated-patient', password)
            self.assertEqual(len(client.get('/platform/records').get_json()['records']), len(rows))
