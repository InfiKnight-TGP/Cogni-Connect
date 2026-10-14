"""Playwright-only server. All accounts/media live in a disposable database.

Never import this module into the production app. /test/seed exists only here.
"""
import secrets
import sys
import tempfile
from pathlib import Path
from flask import Flask, jsonify

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from platform_api import register_platform
from seed_platform import seed_demo


def main():
    with tempfile.TemporaryDirectory(prefix='cogni-browser-test-') as directory:
        api = Flask(__name__)
        api.config['PLATFORM_DB'] = str(Path(directory) / 'test.sqlite3')
        register_platform(api)

        @api.get('/health')
        def health():
            return jsonify(test_server=True)

        @api.post('/test/seed')
        def seed():
            suffix = secrets.token_hex(6)
            caregiver, patient = f'e2e-care-{suffix}', f'e2e-patient-{suffix}'
            password = secrets.token_urlsafe(24)
            patient_id = seed_demo(api.test_client(), caregiver, patient, password)
            return jsonify(caregiver=caregiver, patient=patient, password=password, patientId=patient_id)

        api.run(host='127.0.0.1', port=5031, use_reloader=False)


if __name__ == '__main__':
    main()
