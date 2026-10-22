import json
import os
import unittest
from unittest.mock import patch
from werkzeug.security import generate_password_hash

import app
import auth
import db
import mailer
from tests.auth_support import setup_auth


class AuthTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, kind=None)
        self.mail = patch('mailer.send_code')
        self.send = self.mail.start()
        self.addCleanup(self.mail.stop)
        self.client = app.api.test_client()

    def sql(self, query, args=()):
        return db.fetchall(query, args)

    def signup(self, client=None, email='one@example.com'):
        client = client or self.client
        response = client.post('/auth/signup', json={'email': email, 'name': 'Caregiver', 'password': 'password1'})
        self.assertEqual(response.status_code, 202)
        return response.json['challenge'], self.send.call_args.args[1]

    def verified(self, client=None, email='one@example.com'):
        client = client or self.client
        challenge, code = self.signup(client, email)
        response = client.post('/auth/otp/verify', json={'challenge': challenge, 'code': code})
        self.assertEqual(response.status_code, 200)
        return client.get('/auth/me').json['activePatient']['id'] if email == 'one@example.com' else client

    def pair(self, patient=None):
        patient = patient or self.verified()
        response = self.client.post('/pair/create', json={'patient_id': patient})
        self.assertEqual(response.status_code, 201)
        device = app.api.test_client()
        redeemed = device.post('/pair/redeem', json={'code': response.json['code'], 'device_label': 'Tablet'})
        self.assertEqual(redeemed.status_code, 200)
        return device, patient, response.json['code']

    def test_signup_login_verify_and_trusted_device(self):
        challenge, code = self.signup(email='ONE@EXAMPLE.COM')
        self.assertIsNone(self.client.get_cookie('cogni_session'))
        self.assertEqual(self.client.get('/auth/me').status_code, 401)
        result = self.client.post('/auth/otp/verify', json={'challenge': challenge, 'code': code})
        self.assertEqual(result.status_code, 200)
        self.assertIn('HttpOnly', result.headers.getlist('Set-Cookie')[0])
        self.assertIn('SameSite=Lax', result.headers.getlist('Set-Cookie')[0])
        me = self.client.get('/auth/me').json
        self.assertEqual(me['user']['email'], 'one@example.com')
        self.assertEqual(me['activePatient']['name'], 'Legacy patient')
        user = self.sql('SELECT * FROM users')[0]
        self.assertTrue(user['password_hash'].startswith('scrypt:'))
        self.assertNotEqual(self.sql('SELECT code_hash FROM otps')[0][0], code)
        self.assertEqual(self.client.post('/auth/logout').status_code, 200)
        trusted = self.client.post('/auth/login', json={'email': 'one@example.com', 'password': 'password1'})
        self.assertEqual(trusted.status_code, 200)
        fresh = app.api.test_client()
        login = fresh.post('/auth/login', json={'email': 'one@example.com', 'password': 'password1'})
        self.assertEqual(login.status_code, 202)
        self.assertEqual(fresh.post('/auth/otp/verify', json={'challenge': login.json['challenge'], 'code': self.send.call_args.args[1]}).status_code, 200)

    def test_otp_five_failures_expiry_reuse_and_purpose(self):
        challenge, code = self.signup()
        wrong = '000000' if code != '000000' else '999999'
        for _ in range(5):
            self.assertEqual(self.client.post('/auth/otp/verify', json={'challenge': challenge, 'code': wrong}).status_code, 400)
        self.assertEqual(self.client.post('/auth/otp/verify', json={'challenge': challenge, 'code': code}).status_code, 400)
        self.assertEqual(self.sql('SELECT used FROM otps')[0][0], 1)
        login = self.client.post('/auth/login', json={'email': 'one@example.com', 'password': 'password1'})
        data = {'challenge': login.json['challenge'], 'code': self.send.call_args.args[1]}
        self.assertEqual(self.client.post('/auth/reset', json={**data, 'password': 'password2'}).status_code, 400)
        with patch('auth.now', return_value=auth.now() + 301):
            self.assertEqual(self.client.post('/auth/otp/verify', json=data).status_code, 400)
        self.assertEqual(self.client.post('/auth/otp/verify', json=data).status_code, 200)
        self.assertEqual(self.client.post('/auth/otp/verify', json=data).status_code, 400)

    def test_pair_single_use_expiry_and_wrong_attempt_lockout(self):
        device, patient, code = self.pair()
        self.assertEqual(device.post('/pair/redeem', json={'code': code}).status_code, 400)
        next_code = self.client.post('/pair/create', json={'patient_id': patient}).json['code']
        with patch('auth.now', return_value=auth.now() + 901):
            self.assertEqual(device.post('/pair/redeem', json={'code': next_code}).status_code, 400)
        device = app.api.test_client()
        lockout_code = self.client.post('/pair/create', json={'patient_id': patient}).json['code']
        for _ in range(5):
            self.assertEqual(device.post('/pair/redeem', json={'code': 'AAAAAAAA'}, environ_overrides={'REMOTE_ADDR': '10.0.0.2'}).status_code, 400)
        self.assertEqual(device.post('/pair/redeem', json={'code': lockout_code}, environ_overrides={'REMOTE_ADDR': '10.0.0.2'}).status_code, 429)
        with patch('auth.now', return_value=auth.now() + 3601):
            fresh_code = self.client.post('/pair/create', json={'patient_id': patient}).json['code']
            self.assertEqual(device.post('/pair/redeem', json={'code': fresh_code}, environ_overrides={'REMOTE_ADDR': '10.0.0.2'}).status_code, 200)

    def test_pairing_limits_persist_in_database(self):
        device, patient, _ = self.pair()
        for index in range(5):
            response = device.post('/pair/redeem', json={'code': 'AAAAAAAA'}, environ_overrides={'REMOTE_ADDR': '10.0.0.7'})
            self.assertEqual(response.status_code, 400)
        app.api.extensions['auth_limits'] = auth.RateLimits()
        fresh = app.api.test_client()
        self.assertEqual(fresh.post('/pair/redeem', json={'code': self.client.post('/pair/create', json={'patient_id': patient}).json['code']}, environ_overrides={'REMOTE_ADDR': '10.0.0.7'}).status_code, 429)
        self.assertEqual(self.sql("SELECT attempts FROM pairing_attempts WHERE scope='ip' AND key='10.0.0.7'")[0][0], 5)

    def test_device_pin_elevation_score_restrictions_expiry_and_lock(self):
        device, _, _ = self.pair()
        score = {'date': '2026-10-21', 'game_id': 'story-builder', 'score': 80, 'level': 1, 'skill': 'Memory', 'source': 'patient'}
        self.assertEqual(device.get('/reports/days').status_code, 403)
        self.assertEqual(device.post('/performance', json=score).status_code, 200)
        self.assertEqual(self.client.post('/performance', json=score).status_code, 403)
        self.assertEqual(device.post('/caregiver/unlock', json={'pin': '0000'}).status_code, 403)
        self.assertEqual(device.post('/caregiver/unlock', json={'pin': '1234'}).status_code, 200)
        self.assertEqual(device.get('/reports/days').status_code, 200)
        self.assertEqual(device.post('/performance', json=score).status_code, 403)
        with patch('auth.now', return_value=auth.now() + 1801):
            self.assertEqual(device.get('/reports/days').status_code, 403)
            self.assertEqual(device.post('/performance', json=score).status_code, 200)
        self.assertEqual(device.post('/caregiver/lock').status_code, 200)
        self.assertFalse(device.get('/auth/me').json['elevated'])

    def test_invite_kind_membership_and_unpair(self):
        device, patient, _ = self.pair()
        invite = self.client.post('/pair/invite', json={'patient_id': patient}).json['code']
        self.assertEqual(device.post('/pair/redeem', json={'code': invite}).status_code, 400)
        second = app.api.test_client()
        self.verified(second, 'two@example.com')
        self.assertEqual(second.get('/pair/devices', query_string={'patient_id': patient}).status_code, 403)
        self.assertEqual(second.post('/pair/join', json={'code': invite}).status_code, 200)
        self.assertEqual(second.post('/pair/join', json={'code': invite}).status_code, 400)
        devices = second.get('/pair/devices', query_string={'patient_id': patient}).json['devices']
        self.assertNotIn('token_hash', devices[0])
        self.assertEqual(second.delete('/pair/devices/' + devices[0]['id']).status_code, 200)
        self.assertEqual(device.get('/auth/me').status_code, 401)

    def test_no_cookie_and_patient_device_all_route_protection(self):
        # Every existing route is authenticated, including media and future reads.
        anonymous = app.api.test_client()
        for rule in app.api.url_map.iter_rules():
            if rule.endpoint.startswith('auth.') or rule.endpoint == 'static':
                continue
            path = reify(rule.rule)
            method = next(m for m in ('GET', 'POST', 'PUT', 'DELETE') if m in rule.methods)
            with self.subTest(path=path, method=method):
                self.assertEqual(anonymous.open(path, method=method).status_code, 401)
        device, _, _ = self.pair()
        for path, method in [('/upload', 'POST'), ('/people', 'POST'), ('/people/x', 'PUT'), ('/people/x', 'DELETE'), ('/performance/x', 'DELETE'), ('/reports/days', 'GET'), ('/reports/day', 'GET'), ('/settings', 'POST'), ('/routine', 'POST'), ('/processing-status/x', 'GET'), ('/pair/create', 'POST'), ('/pair/invite', 'POST')]:
            with self.subTest(path=path, method=method):
                self.assertEqual(device.open(path, method=method).status_code, 403)

    def test_origin_checks_cors_and_cookie_security(self):
        self.assertEqual(self.client.post('/auth/login', headers={'Origin': 'https://evil.example'}).status_code, 403)
        self.assertEqual(self.client.post('/auth/login', headers={'Origin': 'null'}).status_code, 403)
        response = self.client.options('/auth/login', headers={'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': 'POST'})
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:3000')
        self.assertEqual(response.headers['Access-Control-Allow-Credentials'], 'true')
        with patch.dict(app.api.config, {'AUTH_COOKIE_SECURE': True}):
            challenge, code = self.signup()
            response = self.client.post('/auth/otp/verify', json={'challenge': challenge, 'code': code})
            self.assertTrue(all('Secure;' in value for value in response.headers.getlist('Set-Cookie')))

    def test_password_reset_revokes_sessions_and_trust(self):
        self.verified()
        response = self.client.post('/auth/forgot', json={'email': 'one@example.com'})
        data = {'challenge': response.json['challenge'], 'code': self.send.call_args.args[1], 'password': 'password2'}
        reset_client = app.api.test_client()
        self.assertEqual(reset_client.post('/auth/reset', json=data).status_code, 200)
        self.assertEqual(self.client.get('/auth/me').status_code, 401)
        self.assertFalse(self.sql('SELECT * FROM trusted_devices'))
        self.assertFalse(self.sql('SELECT * FROM sessions'))
        self.assertEqual(self.client.post('/auth/login', json={'email': 'one@example.com', 'password': 'password2'}).status_code, 202)

    def test_password_change_requires_current_and_revokes_old_sessions(self):
        self.verified()
        token = self.client.get_cookie('cogni_session').value
        other = app.api.test_client()
        other.set_cookie('cogni_session', token)
        self.assertEqual(self.client.post('/auth/password', json={'current_password': 'wrong', 'password': 'password2'}).status_code, 400)
        self.assertEqual(self.client.post('/auth/password', json={'current_password': 'password1', 'password': 'password2'}).status_code, 200)
        self.assertEqual(other.get('/auth/me').status_code, 401)
        self.assertEqual(self.client.get('/auth/me').status_code, 200)

    def test_active_patient_validation_and_coexisting_cookies(self):
        device, patient, _ = self.pair()
        other = self.client.post('/patients', json={'name': 'Second patient'}).json['id']
        self.assertEqual(self.client.get('/auth/me', headers={'cogni_patient': other}).json['activePatient']['id'], other)
        self.assertEqual(self.client.get('/auth/me', headers={'cogni_patient': 'not-mine'}).status_code, 403)
        self.assertEqual(device.get('/auth/me', headers={'cogni_patient': other}).json['activePatient']['id'], patient)
        device.set_cookie('cogni_session', self.client.get_cookie('cogni_session').value)
        self.assertEqual(device.get('/auth/me').json['role'], 'caregiver')
        self.assertEqual(device.post('/performance', json={'score': 80}).status_code, 403)
        self.assertEqual(device.post('/auth/logout').status_code, 200)
        self.assertEqual(device.get('/auth/me').json['role'], 'patient_device')
        self.assertEqual(self.client.post('/auth/login', json={'email': 'one@example.com', 'password': 'password1'}).status_code, 200)
        self.client.set_cookie('cogni_patient', 'stale-selection')
        self.assertEqual(self.client.get('/auth/me').status_code, 403)
        self.assertEqual(self.client.post('/auth/logout').status_code, 200)
        self.assertIsNone(self.client.get_cookie('cogni_patient'))

        with app.api.app_context():
            db.execute('INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo) VALUES (?,?,?,?,0,0,?,0)', ('other-user', 'other@example.com', 'Other', generate_password_hash('password1', method='scrypt'), auth.now()))
            db.execute('INSERT INTO patients VALUES (?,?,?,?,?)', ('other-patient', 'Other patient', generate_password_hash('1234', method='scrypt'), 'other-user', auth.now()))
            db.execute("INSERT INTO patient_members VALUES ('other-patient','other-user','owner')")
        self.assertEqual(self.client.post('/auth/login', json={'email': 'one@example.com', 'password': 'password1'}).status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers={'X-Cogni-Patient': 'other-patient'}).status_code, 403)

    def test_login_code_request_and_pin_rate_limits(self):
        for _ in range(5):
            self.assertEqual(self.client.post('/auth/login', json={'email': 'missing@example.com', 'password': 'wrong'}).status_code, 401)
        self.assertEqual(self.client.post('/auth/login', json={'email': 'different@example.com', 'password': 'wrong'}).status_code, 429)
        auth_time = auth.now() + 901
        with patch('auth.now', return_value=auth_time):
            device, _, _ = self.pair()
            for _ in range(5):
                self.assertEqual(device.post('/caregiver/unlock', json={'pin': '0000'}).status_code, 403)
            self.assertEqual(device.post('/caregiver/unlock', json={'pin': '1234'}).status_code, 429)

    def test_resend_invalidates_old_challenge_and_demo_defaults_off(self):
        challenge, code = self.signup()
        resend = self.client.post('/auth/otp/resend', json={'challenge': challenge})
        self.assertEqual(resend.status_code, 200)
        self.assertEqual(self.client.post('/auth/otp/verify', json={'challenge': challenge, 'code': code}).status_code, 400)
        self.assertEqual(self.client.post('/auth/otp/verify', json={'challenge': resend.json['challenge'], 'code': self.send.call_args.args[1]}).status_code, 200)
        self.assertEqual(self.client.post('/auth/demo').status_code, 404)

    def test_mail_failure_rolls_back_signup(self):
        self.send.side_effect = mailer.DeliveryError('test failure')
        response = self.client.post('/auth/signup', json={'email': 'one@example.com', 'name': 'Caregiver', 'password': 'password1'})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(self.sql('SELECT * FROM users'))

    def test_mailer_requires_explicit_development_otp(self):
        self.mail.stop()
        with patch.dict(os.environ, {'SMTP_USER': '', 'SMTP_PASS': '', 'COGNI_DEV_OTP': '0'}, clear=False):
            with self.assertRaisesRegex(mailer.DeliveryError, 'Email is not configured'):
                mailer.send_code('person@example.com', '123456', 'login')

    def test_dev_login_flag_loopback_and_disabled_states(self):
        self.assertEqual(self.client.post('/auth/dev/patient-device').status_code, 404)
        with patch.dict(app.api.config, {'AUTH_DEV_LOGIN': True}):
            with app.api.app_context():
                auth.seed_dev_accounts(app.api)
            login = self.client.post('/auth/login', json={'email': 'caregiver@demo.local', 'password': 'demo1234'})
            self.assertEqual(login.status_code, 200)
            self.assertEqual(self.client.get('/auth/me').json['user']['email'], 'caregiver@demo.local')
            device = app.api.test_client()
            self.assertEqual(device.post('/auth/dev/patient-device').status_code, 200)
            self.assertEqual(device.post('/auth/dev/patient-device', environ_overrides={'REMOTE_ADDR': '10.0.0.8'}).status_code, 403)
        disabled = app.api.test_client()
        self.assertEqual(disabled.post('/auth/login', json={'email': 'caregiver@demo.local', 'password': 'demo1234'}).status_code, 401)

    def test_dev_login_refuses_production_configuration(self):
        with patch.dict(app.api.config, {'AUTH_DEV_LOGIN': True, 'AUTH_COOKIE_SECURE': False}):
            with patch.dict(os.environ, {'COGNI_ENV': 'production', 'COGNI_HOST': '127.0.0.1'}, clear=False):
                with app.api.app_context():
                    with self.assertRaises(RuntimeError):
                        auth.validate_dev_config()

    def test_session_expiry_sliding_and_hash_only_storage(self):
        device, _, _ = self.pair()
        token = device.get_cookie('cogni_device').value
        stored = self.sql("SELECT * FROM sessions WHERE kind='patient_device'")[0]
        self.assertEqual(stored['token_hash'], auth.digest(token))
        self.assertNotEqual(stored['token_hash'], token)
        with patch('auth.now', return_value=auth.now() + 3600):
            self.assertEqual(device.get('/auth/me').status_code, 200)
        refreshed = self.sql('SELECT * FROM sessions WHERE id=?', (stored['id'],))[0]
        self.assertGreater(refreshed['expires_at'], stored['expires_at'])
        self.sql('UPDATE sessions SET expires_at=0 WHERE id=?', (stored['id'],))
        self.assertEqual(device.get('/auth/me').status_code, 401)
        self.sql("UPDATE sessions SET expires_at=0 WHERE kind='caregiver'")
        self.assertEqual(self.client.get('/auth/me').status_code, 401)

    def test_pin_set_change_patient_boundary_and_invite_expiry(self):
        patient = self.verified()
        other = self.client.post('/patients', json={'name': 'Second'}).json['id']
        self.assertEqual(self.client.post(f'/patients/{other}/pin', json={'new_pin': '5678'}).status_code, 200)
        self.assertEqual(self.client.post(f'/patients/{other}/pin', json={'new_pin': '4321'}).status_code, 400)
        self.assertEqual(self.client.post(f'/patients/{other}/pin', json={'current_pin': '5678', 'new_pin': '4321'}).status_code, 200)
        device, _, _ = self.pair(patient)
        self.assertEqual(device.post('/caregiver/unlock', json={'pin': '1234'}).status_code, 200)
        self.assertEqual(device.post('/pair/create', json={'patient_id': other}).status_code, 403)
        invite = self.client.post('/pair/invite', json={'patient_id': patient}).json['code']
        second = app.api.test_client()
        self.verified(second, 'two@example.com')
        with patch('auth.now', return_value=auth.now() + 2 * auth.DAY + 1):
            self.assertEqual(second.post('/pair/join', json={'code': invite}).status_code, 400)

    def test_pair_redemption_is_atomic(self):
        from concurrent.futures import ThreadPoolExecutor
        patient = self.verified()
        code = self.client.post('/pair/create', json={'patient_id': patient}).json['code']
        def redeem(_):
            return app.api.test_client().post('/pair/redeem', json={'code': code}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(pool.map(redeem, range(2)))
        self.assertEqual(results, [200, 400])
        self.assertEqual(len(self.sql("SELECT * FROM sessions WHERE kind='patient_device'")), 1)

    def test_email_rate_limits_cannot_be_bypassed_with_new_ips(self):
        self.verified()
        for index in range(5):
            response = app.api.test_client().post('/auth/login',
                json={'email': 'ONE@example.com', 'password': 'wrong'},
                environ_overrides={'REMOTE_ADDR': f'10.0.0.{index + 1}'})
            self.assertEqual(response.status_code, 401)
        response = app.api.test_client().post('/auth/login',
            json={'email': 'one@example.com', 'password': 'password1'},
            environ_overrides={'REMOTE_ADDR': '10.0.0.99'})
        self.assertEqual(response.status_code, 429)
        user = self.sql('SELECT * FROM users')[0]
        self.assertEqual(user['failed_logins'], 5)
        self.assertGreater(user['locked_until'], auth.now())
        with patch('auth.now', return_value=auth.now() + 901):
            self.assertEqual(app.api.test_client().post('/auth/login', json={'email': 'one@example.com', 'password': 'password1'}).status_code, 202)

    def test_code_requests_are_limited_and_input_is_validated(self):
        self.assertEqual(self.client.post('/auth/signup', json={'email': 'one@example.com', 'name': 'Caregiver', 'password': 'short'}).status_code, 400)
        self.assertEqual(self.client.post('/auth/forgot', json={'email': 'one@example.com'}).status_code, 202)
        self.assertEqual(self.client.post('/auth/forgot', json={'email': 'one@example.com'}).status_code, 202)
        self.assertEqual(self.client.post('/auth/forgot', json={'email': 'one@example.com'}).status_code, 429)
        self.assertEqual(self.client.post('/auth/otp/verify', json=[]).status_code, 400)


def reify(path):
    import re
    return re.sub(r'<[^>]+>', 'test', path)


if __name__ == '__main__':
    unittest.main()
