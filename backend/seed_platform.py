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


def seed_demo(client, caregiver, patient, password):
    """Seed through real authorization/record routes; never overwrite a profile."""
    headers = {'X-Cogni-Request': '1'}
    response = client.post('/platform/auth/setup', json={'username': caregiver, 'password': password, 'patient_username': patient, 'patient_password': password}, headers=headers)
    if response.status_code != 201:
        raise ValueError(response.get_json()['error'])
    login = client.post('/platform/auth/login', json={'username': caregiver, 'password': password}, headers=headers)
    if login.status_code != 200:
        raise ValueError(login.get_json()['error'])
    patient_id = login.get_json()['patient']
    now = datetime.now()
    rows = []
    for domain in ('Memory', 'Attention', 'Executive Function', 'Recognition & Orientation'):
        for session in range(8):
            stamp = (now - timedelta(days=8 - session)).timestamp() * 1000
            for question in range(10):
                correct = question < (10 - session if domain == 'Memory' else 8)
                event_id = str(uuid.uuid4())
                rows.append({'id': event_id, 'kind': 'event', 'updatedAt': stamp + question, 'data': {
                    'id': event_id, 'simulated': True, 'patient': patient_id, 'session': f'SIMULATED-{domain}-{session}',
                    'game': 'simulated-session', 'domain': domain, 'timestamp': stamp + question,
                    'day': datetime.fromtimestamp(stamp / 1000).strftime('%Y-%m-%d'), 'method': 'voice' if question % 2 else 'tap',
                    'correct': correct, 'responseMs': 2500 + session * 100, 'errorType': 'none' if correct else 'answer', 'difficulty': 2,
                }})
    rows.append({'id': str(uuid.uuid4()), 'kind': 'journal', 'updatedAt': time.time() * 1000, 'data': {'simulated': True, 'day': now.strftime('%Y-%m-%d'), 'text': 'SIMULATED: I had tea with my family.', 'summary': 'SIMULATED: Tea with family.'}})
    for start in range(0, len(rows), 100):
        result = client.post('/platform/records', json={'records': rows[start:start + 100]}, headers=headers)
        if result.status_code != 200:
            raise ValueError(result.get_json())
    return patient_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--caregiver', default='simulated-caregiver')
    parser.add_argument('--patient', default='simulated-patient')
    args = parser.parse_args()
    password = getpass('Demo password for both accounts (at least 12 characters): ')
    api = Flask(__name__)
    register_platform(api)
    try:
        seed_demo(api.test_client(), args.caregiver, args.patient, password)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    print(f'SIMULATED profiles created: {args.caregiver} and {args.patient}. Open /support and sign in.')


if __name__ == '__main__':
    main()
