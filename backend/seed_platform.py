"""Create isolated SIMULATED demo accounts and declining session history.

Passwords are prompted, never embedded in source or printed. Existing usernames
are rejected, preventing accidental overwrite of real profiles.
"""
import argparse
from datetime import datetime, timedelta
from getpass import getpass
import time
import uuid
from flask import Flask
from platform_api import register_platform


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--caregiver', default='simulated-caregiver')
    parser.add_argument('--patient', default='simulated-patient')
    args = parser.parse_args()
    password = getpass('Demo password for both accounts (at least 12 characters): ')
    api = Flask(__name__)
    register_platform(api)
    client = api.test_client()
    headers = {'X-Cogni-Request': '1'}
    response = client.post('/platform/auth/setup', json={'username': args.caregiver, 'password': password, 'patient_username': args.patient, 'patient_password': password}, headers=headers)
    if response.status_code != 201:
        raise SystemExit(response.get_json()['error'])
    client.post('/platform/auth/login', json={'username': args.caregiver, 'password': password}, headers=headers)
    now = datetime.now()
    rows = []
    for domain in ('Memory', 'Attention', 'Executive Function', 'Recognition & Orientation'):
        for session in range(8):
            stamp = (now - timedelta(days=8 - session)).timestamp() * 1000
            for question in range(10):
                correct = question < (10 - session if domain == 'Memory' else 8)
                event_id = str(uuid.uuid4())
                rows.append({'id': event_id, 'kind': 'event', 'updatedAt': stamp + question, 'data': {
                    'id': event_id, 'simulated': True, 'patient': args.patient, 'session': f'SIMULATED-{domain}-{session}',
                    'game': 'simulated-session', 'domain': domain, 'timestamp': stamp + question,
                    'day': datetime.fromtimestamp(stamp / 1000).strftime('%Y-%m-%d'), 'method': 'voice' if question % 2 else 'tap',
                    'correct': correct, 'responseMs': 2500 + session * 100, 'errorType': 'none' if correct else 'answer', 'difficulty': 2,
                }})
    rows.append({'id': str(uuid.uuid4()), 'kind': 'journal', 'updatedAt': time.time() * 1000, 'data': {'simulated': True, 'day': now.strftime('%Y-%m-%d'), 'text': 'SIMULATED: I had tea with my family.', 'summary': 'SIMULATED: Tea with family.'}})
    for start in range(0, len(rows), 100):
        result = client.post('/platform/records', json={'records': rows[start:start + 100]}, headers=headers)
        if result.status_code != 200:
            raise SystemExit(result.get_json())
    print(f'SIMULATED profiles created: {args.caregiver} and {args.patient}. Open /support and sign in.')


if __name__ == '__main__':
    main()
