"""Server-side accounts, pairing, and authorization for patient-scoped storage."""
from functools import wraps
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
import uuid
import shutil
from urllib.parse import urlparse
import ipaddress

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

import db as database
import mailer

bp = Blueprint('auth', __name__)
DAY = 86400
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
COOKIES = {'caregiver': 'cogni_session', 'patient_device': 'cogni_device'}


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def now():
    return int(time.time())


def db():
    return database.get_connection()


transaction = database.transaction


class RateLimits:
    """Fixed windows; process-local, as required for the single-server demo."""
    def __init__(self):
        self.items = {}
        self.lock = threading.Lock()

    def hit(self, key, maximum, seconds):
        with self.lock:
            stamp = now()
            count, end = self.items.get(key, (0, stamp + seconds))
            if stamp >= end:
                count, end = 0, stamp + seconds
            self.items[key] = (count + 1, end)
            if len(self.items) > 10000:
                self.items = {k: v for k, v in self.items.items() if v[1] > stamp}
            return count < maximum

    def blocked(self, key, maximum):
        with self.lock:
            count, end = self.items.get(key, (0, 0))
            return count >= maximum and end > now()

    def wrong_pair(self, key):
        with self.lock:
            stamp = now()
            count, end = self.items.get(key, (0, stamp + 900))
            if stamp >= end:
                count, end = 0, stamp + 900
            count += 1
            # The lock lasts a full fifteen minutes from the fifth failure.
            self.items[key] = (count, stamp + 900 if count == 5 else end)


def limits():
    return current_app.extensions['auth_limits']


def ip():
    # Never trust arbitrary X-Forwarded-For headers.
    return request.remote_addr or 'unknown'


def limited(category, email='', maximum=3, seconds=600):
    allowed_ip = limits().hit((category, 'ip', ip()), maximum, seconds)
    allowed_email = limits().hit((category, 'email', email), maximum, seconds) if email else True
    return not (allowed_ip and allowed_email)


def error(status=400):
    return jsonify(error='Unable to complete this request. Please check your details and try again.'), status


def dev_login_enabled():
    return current_app.config.get('AUTH_DEV_LOGIN', False)


def demo_enabled():
    return current_app.config.get('AUTH_DEMO', False)


def demo_value(name, default):
    return os.getenv(name, default)


def demo_request_allowed():
    return request.remote_addr in ('127.0.0.1', '::1') or current_app.config.get('AUTH_DEMO_PUBLIC', False)


def is_demo_session(session=None):
    session = session or g.get('auth_session')
    if not session:
        return False
    user = database.fetchone('SELECT is_demo FROM users WHERE id=?', (session['user_id'],)) if session.get('user_id') else None
    if user and bool(user['is_demo']):
        return True
    # A real caregiver may be a member of a demo patient during local testing;
    # demo restrictions apply to demo accounts and patient-device sessions only.
    patient = database.fetchone('SELECT is_demo FROM patients WHERE id=?', (session['patient_id'],)) if session.get('patient_id') else None
    return bool(session.get('kind') == 'patient_device' and patient and patient['is_demo'])


def dev_request_allowed():
    return request.remote_addr in ('127.0.0.1', '::1')


def validate_dev_config():
    if not dev_login_enabled():
        return
    host = os.getenv('COGNI_HOST', '127.0.0.1')
    try:
        host_is_loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        host_is_loopback = host.lower() == 'localhost'
    if os.getenv('COGNI_ENV', '').lower() == 'production' or current_app.config['AUTH_COOKIE_SECURE'] or not host_is_loopback:
        raise RuntimeError('COGNI_DEV_LOGIN requires a local, non-production HTTP server')
    if not os.getenv('COGNI_DEV_OTP') and not host_is_loopback:
        raise RuntimeError('COGNI_DEV_LOGIN requires COGNI_DEV_OTP on a non-loopback host')
    for origin in current_app.config['AUTH_ORIGINS']:
        hostname = (urlparse(origin).hostname or '').lower()
        if hostname not in ('localhost', '127.0.0.1', '::1'):
            raise RuntimeError('COGNI_DEV_LOGIN requires localhost-only COGNI_ORIGINS')


def payload():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def text_field(data, key, maximum=200):
    value = data.get(key, '')
    return value.strip() if isinstance(value, str) and len(value) <= maximum else ''


def cookie(response, key, value, age):
    response.set_cookie(key, value, max_age=age, httponly=True, samesite='Lax',
                        secure=current_app.config['AUTH_COOKIE_SECURE'], path='/')


def new_session(kind, user_id=None, patient_id=None, label=''):
    token, stamp = secrets.token_urlsafe(32), now()
    age = (30 if kind == 'caregiver' else 90) * DAY
    database.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?)',
                     (uuid.uuid4().hex, digest(token), kind, user_id, patient_id, label,
                      stamp, stamp + age, stamp, 0))
    return token, age


def session_response(kind, user_id=None, patient_id=None, label='', **body):
    token, age = new_session(kind, user_id, patient_id, label)
    response = jsonify(ok=True, **body)
    cookie(response, COOKIES[kind], token, age)
    if kind == 'caregiver':
        cookie(response, 'cogni_patient', '', 0)
    return response


def resolve_session(kind):
    token = request.cookies.get(COOKIES[kind], '')
    if not token or len(token) > 256:
        return None
    row = database.fetchone('SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?',
                            (digest(token), kind, now()))
    if row is None or not hmac.compare_digest(row['token_hash'], digest(token)):
        return None
    return dict(row)


def is_elevated():
    session = g.get('auth_session')
    return bool(session and session['kind'] == 'patient_device' and session['elevated_until'] > now())


def is_caregiver():
    session = g.get('auth_session')
    if not session:
        return False
    if is_elevated() or session['kind'] == 'caregiver':
        return True
    return False


def self_account():
    session = g.get('auth_session')
    if not session or not session.get('user_id'):
        return False
    row = database.fetchone('SELECT role FROM users WHERE id=?', (session['user_id'],))
    return bool(row and row['role'] == 'self')


def owner_of(patient_id):
    session = g.get('auth_session')
    return bool(session and session.get('user_id') and database.fetchone(
        "SELECT 1 FROM patient_members WHERE patient_id=? AND user_id=? AND role='owner'",
        (patient_id, session['user_id'])))


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not g.get('auth_session'):
            return error(401)
        return fn(*args, **kwargs)
    return wrapped


def caregiver_required(fn):
    @wraps(fn)
    @login_required
    def wrapped(*args, **kwargs):
        if not is_caregiver():
            return error(403)
        return fn(*args, **kwargs)
    return wrapped


def account_required(fn):
    @wraps(fn)
    @login_required
    def wrapped(*args, **kwargs):
        if g.auth_session['kind'] != 'caregiver' and not self_account():
            return error(403)
        return fn(*args, **kwargs)
    return wrapped


def authorized_patient(patient_id):
    session = g.get('auth_session')
    if not session or not isinstance(patient_id, str):
        return False
    if session['kind'] == 'patient_device':
        return is_elevated() and session['patient_id'] == patient_id
    return database.fetchone('SELECT 1 FROM patient_members WHERE patient_id=? AND user_id=?',
                             (patient_id, session['user_id'])) is not None


def patients_for(user_id):
    return [dict(row) for row in database.fetchall(
        'SELECT p.id,p.name,m.role FROM patients p JOIN patient_members m ON p.id=m.patient_id WHERE m.user_id=? ORDER BY p.created_at,p.id',
        (user_id,))]


def session_user():
    session = g.get('auth_session')
    return database.fetchone('SELECT * FROM users WHERE id=?', (session['user_id'],)) if session and session.get('user_id') else None


def patient_account(user):
    if not user:
        return False
    role = user['role'] if 'role' in user.keys() else 'caregiver'
    patient_id = user['patient_id'] if 'patient_id' in user.keys() else None
    return bool(role == 'patient' and patient_id)


def otp_recipient(user):
    if not patient_account(user):
        return user['email'] if user and user['email'] else None
    if user['otp_target'] == 'patient' and user['email']:
        return user['email']
    owner = database.fetchone(
        "SELECT u.email FROM users u JOIN patient_members m ON m.user_id=u.id "
        "WHERE m.patient_id=? AND m.role='owner' AND u.role='caregiver' AND u.email<>'' "
        "ORDER BY u.created_at LIMIT 1", (user['patient_id'],))
    return (owner['email'] if owner and owner['email'] else None) or user['email']


def bootstrap_patient(user_id):
    """Claim the existing installation once, after successful email verification."""
    if database.fetchone("SELECT 1 FROM patients p JOIN users u ON p.created_by=u.id WHERE u.email!='demo@cogniconnect.invalid' LIMIT 1"):
        return
    unclaimed = database.fetchone('SELECT * FROM patients WHERE created_by IS NULL ORDER BY created_at LIMIT 1')
    if unclaimed:
        database.execute('UPDATE patients SET created_by=? WHERE id=?', (user_id, unclaimed['id']))
        database.execute('INSERT INTO patient_members VALUES (?,?,?)', (unclaimed['id'], user_id, 'owner'))
        return
    settings = current_app.config['AUTH_LEGACY_SETTINGS']()
    patient_id = uuid.uuid4().hex
    pin_hash = settings.get('pin')
    if pin_hash is not None:
        pin_hash = str(pin_hash)
        if pin_hash and not pin_hash.startswith(('scrypt:', 'pbkdf2:')):
            pin_hash = generate_password_hash(pin_hash, method='scrypt')
    database.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,0)',
                     (patient_id, settings.get('patient_name') or 'My patient', pin_hash, user_id, now()))
    database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, user_id, 'owner'))


def issue_otp(user, purpose):
    challenge = secrets.token_urlsafe(32)
    demo_emails = {demo_value('DEMO_CAREGIVER_EMAIL', 'demo@cogniconnect.com').lower(), demo_value('DEMO_PATIENT_EMAIL', 'patient@cogniconnect.com').lower()}
    email = user['email'] if 'email' in user.keys() else ''
    code = demo_value('DEMO_OTP', '123456') if demo_enabled() and email.lower() in demo_emails else f'{secrets.randbelow(1000000):06d}'
    database.execute('UPDATE otps SET used=1 WHERE user_id=? AND purpose=?', (user['id'], purpose))
    database.execute('INSERT INTO otps VALUES (?,?,?,?,?,?,0,0)',
                     (uuid.uuid4().hex, user['id'], purpose, digest(code), digest(challenge), now() + 300))
    recipient = otp_recipient(user)
    if not recipient:
        raise mailer.DeliveryError('Ask your caregiver to help you sign in')
    if not (demo_enabled() and email.lower() in demo_emails):
        mailer.send_code(recipient, code, purpose)
    return challenge


def check_otp(data, purpose):
    challenge, code = text_field(data, 'challenge'), text_field(data, 'code')
    row = database.fetchone('SELECT * FROM otps WHERE challenge_hash=? AND purpose=?',
                            (digest(challenge), purpose))
    if not row or row['used'] or row['expires_at'] <= now() or row['attempts'] >= 5:
        return None
    valid = bool(re.fullmatch(r'[0-9]{6}', code)) and hmac.compare_digest(row['code_hash'], digest(code))
    database.execute('UPDATE otps SET attempts=attempts+1,used=? WHERE id=?',
                     (int(valid or row['attempts'] >= 4), row['id']))
    return row['user_id'] if valid else None


def trust_device(response, user_id, age=30 * DAY):
    trusted = secrets.token_urlsafe(32)
    cookie(response, 'cogni_trusted', trusted, age)
    database.execute('DELETE FROM trusted_devices WHERE expires_at<=?', (now(),))
    database.execute('INSERT INTO trusted_devices VALUES (?,?,?)', (digest(trusted), user_id, now() + age))


def revoke_user(user_id):
    database.execute('DELETE FROM sessions WHERE user_id=?', (user_id,))
    database.execute('DELETE FROM trusted_devices WHERE user_id=?', (user_id,))


def seed_dev_accounts(app):
    password = os.getenv('DEV_DEMO_PASSWORD', 'demo1234')
    with database.transaction():
        users = {}
        for email, name in (('caregiver@demo.local', 'Demo Caregiver'), ('owner@demo.local', 'Demo Owner')):
            row = database.fetchone('SELECT * FROM users WHERE email=?', (email,))
            if not row:
                user_id = uuid.uuid4().hex
                database.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role,otp_target) VALUES (?,?,?,?,0,0,?,1,'caregiver','caregiver')",
                                 (user_id, email, name, generate_password_hash(password, method='scrypt'), now()))
                row = database.fetchone('SELECT * FROM users WHERE id=?', (user_id,))
            elif not row['is_demo']:
                database.execute('UPDATE users SET is_demo=1 WHERE id=?', (row['id'],))
            users[email] = row['id']
        patient = database.fetchone('SELECT p.* FROM patients p JOIN patient_members m ON m.patient_id=p.id WHERE m.user_id=? AND m.role=? LIMIT 1', (users['caregiver@demo.local'], 'owner'))
        if not patient:
            patient_id = uuid.uuid4().hex
            database.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,1)', (patient_id, 'Demo patient', generate_password_hash('1234', method='scrypt'), users['caregiver@demo.local'], now()))
            database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, users['caregiver@demo.local'], 'owner'))
            patient = database.fetchone('SELECT * FROM patients WHERE id=?', (patient_id,))
        elif not patient['pin_hash']:
            database.execute('UPDATE patients SET pin_hash=? WHERE id=?', (generate_password_hash('1234', method='scrypt'), patient['id']))
        database.execute('INSERT INTO patient_members (patient_id,user_id,role) VALUES (?,?,?) ON CONFLICT(patient_id,user_id) DO NOTHING', (patient['id'], users['owner@demo.local'], 'owner'))


def seed_shared_demo(app):
    caregiver_email = demo_value('DEMO_CAREGIVER_EMAIL', 'demo@cogniconnect.com').lower()
    patient_email = demo_value('DEMO_PATIENT_EMAIL', 'patient@cogniconnect.com').lower()
    with database.transaction():
        caregiver = database.fetchone('SELECT * FROM users WHERE email=?', (caregiver_email,))
        if caregiver and not caregiver['is_demo']:
            raise RuntimeError(f'DEMO email {caregiver_email} belongs to a real user; refusing to seed')
        patient_user = database.fetchone('SELECT * FROM users WHERE email=?', (patient_email,))
        if patient_user and not patient_user['is_demo']:
            raise RuntimeError(f'DEMO email {patient_email} belongs to a real user; refusing to seed')
        if not caregiver:
            uid = uuid.uuid4().hex
            database.execute("INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,otp_target) VALUES (?,?,?,?,?,1,'caregiver','caregiver')",
                             (uid, caregiver_email, 'Demo Caregiver', generate_password_hash(demo_value('DEMO_CAREGIVER_PASSWORD', 'Demo@1234'), method='scrypt'), now()))
            caregiver = database.fetchone('SELECT * FROM users WHERE id=?', (uid,))
        else:
            database.execute("UPDATE users SET is_demo=1,role='caregiver',patient_id=NULL WHERE id=?", (caregiver['id'],))
        patient = database.fetchone('SELECT * FROM patients WHERE is_demo=1 ORDER BY created_at LIMIT 1')
        if not patient:
            pid = uuid.uuid4().hex
            database.execute("INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,1)", (pid, 'Demo Patient', generate_password_hash(demo_value('DEMO_PIN', '1234'), method='scrypt'), caregiver['id'], now()))
            patient = database.fetchone('SELECT * FROM patients WHERE id=?', (pid,))
        elif not patient['pin_hash']:
            database.execute('UPDATE patients SET pin_hash=? WHERE id=?', (generate_password_hash(demo_value('DEMO_PIN', '1234'), method='scrypt'), patient['id']))
        database.execute('INSERT INTO patient_members (patient_id,user_id,role) VALUES (?,?,?) ON CONFLICT(patient_id,user_id) DO NOTHING', (patient['id'], caregiver['id'], 'owner'))
        if not patient_user:
            uid = uuid.uuid4().hex
            database.execute("INSERT INTO users (id,email,name,password_hash,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,?,1,'self',?,'caregiver')",
                             (uid, patient_email, 'Demo Patient', generate_password_hash(demo_value('DEMO_PATIENT_PASSWORD', 'Patient@1234'), method='scrypt'), now(), patient['id']))
        else:
            database.execute("UPDATE users SET is_demo=1,role='self',patient_id=?,otp_target='caregiver' WHERE id=?", (patient['id'], patient_user['id']))
        patient_user = database.fetchone('SELECT id FROM users WHERE email=?', (patient_email,))
        if patient_user:
            database.execute('INSERT INTO patient_members (patient_id,user_id,role) VALUES (?,?,?) ON CONFLICT(patient_id,user_id) DO UPDATE SET role=excluded.role', (patient['id'], patient_user['id'], 'owner'))
        from patient_storage import initialize_patient
        base = Path(app.config['PATIENT_DATA_ROOT']).resolve() / patient['id']
        initialize_patient(base, 'Demo Patient')
        sample = Path(__file__).with_name('sample_data')
        for item in sample.iterdir():
            target = base / item.name
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            elif item.is_file() and not target.exists():
                shutil.copy2(item, target)
        if app.config.get('AUTH_DEMO'):
            from seed_demo_media import seed_demo_media
            seed_demo_media(base, Path(__file__).parent)


@bp.post('/auth/signup')
def signup():
    data = payload()
    email, name, password = text_field(data, 'email').lower(), text_field(data, 'name', 100), data.get('password')
    mode = text_field(data, 'mode') or 'caregiver'
    if limited('code', email):
        return error(429)
    if mode not in ('self', 'caregiver') or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or not name or not isinstance(password, str) or not 8 <= len(password) <= 1024:
        return error()
    challenge = secrets.token_urlsafe(32)
    with database.transaction():
        if not database.fetchone('SELECT 1 FROM users WHERE email=?', (email,)):
            user_id = uuid.uuid4().hex
            role = 'self' if mode == 'self' else 'caregiver'
            database.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role,otp_target) VALUES (?,?,?,?,0,0,?,0,?, 'caregiver')",
                             (user_id, email, name, generate_password_hash(password, method='scrypt'), now(), role))
            if role == 'self':
                patient_id = uuid.uuid4().hex
                database.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,NULL,?,?,0)', (patient_id, name, user_id, now()))
                database.execute('UPDATE users SET patient_id=? WHERE id=?', (patient_id, user_id))
                database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, user_id, 'owner'))
            challenge = issue_otp({'id': user_id, 'email': email}, 'login')
    return jsonify(ok=True, challenge=challenge, requiresCode=True), 202


@bp.post('/auth/login')
def login():
    data = payload()
    email, password = text_field(data, 'email').lower(), data.get('password')
    if limited('login', email, 5, 900):
        return error(429)
    with database.transaction():
        user = database.fetchone('SELECT * FROM users WHERE email=?', (email,))
        password_hash = user['password_hash'] if user else current_app.extensions['auth_dummy_hash']
        valid = check_password_hash(password_hash, password if isinstance(password, str) and len(password) <= 1024 else '')
        if user and user['is_demo'] and not dev_login_enabled() and not demo_enabled():
            return error(401)
        if user and user['is_demo'] and not dev_request_allowed() and not (demo_enabled() and current_app.config.get('AUTH_DEMO_PUBLIC')):
            return error(403)
        if not user or user['locked_until'] > now() or not valid:
            if user and user['locked_until'] <= now():
                count = (0 if user['locked_until'] else user['failed_logins']) + 1
                database.execute('UPDATE users SET failed_logins=?,locked_until=? WHERE id=?',
                                 (count, now() + 900 if count >= 5 else 0, user['id']))
            if not user:
                # Keep account enumeration timing and responses uniform.
                return error(401)
            return error(401)
        database.execute('UPDATE users SET failed_logins=0,locked_until=0 WHERE id=?', (user['id'],))
        trusted = request.cookies.get('cogni_trusted', '')
        trust = database.fetchone('SELECT token_hash FROM trusted_devices WHERE token_hash=? AND user_id=? AND expires_at>?',
                                  (digest(trusted), user['id'], now())) if trusted and len(trusted) <= 256 else None
        if trust and hmac.compare_digest(trust['token_hash'], digest(trusted)):
            kind = 'patient_device' if patient_account(user) else 'caregiver'
            return session_response(kind, user_id=user['id'], patient_id=user['patient_id'] if patient_account(user) else None)
        if user['is_demo'] and dev_login_enabled():
            return session_response('caregiver', user_id=user['id'])
        if limited('code', email):
            return error(429)
        return jsonify(requiresCode=True, challenge=issue_otp(user, 'login')), 202


@bp.post('/auth/otp/verify')
def verify():
    if limited('verify', maximum=30, seconds=300):
        return error(429)
    with database.transaction():
        user_id = check_otp(payload(), 'login')
        if not user_id:
            return error()
        user = database.fetchone('SELECT * FROM users WHERE id=?', (user_id,))
        bootstrap_patient(user_id) if user and user['role'] == 'caregiver' else None
        kind = 'patient_device' if patient_account(user) else 'caregiver'
        response = session_response(kind, user_id=user_id, patient_id=user['patient_id'] if patient_account(user) else None)
        trust_device(response, user_id, 90 * DAY if patient_account(user) else 30 * DAY)
        return response


@bp.post('/auth/dev/patient-device')
def dev_patient_device():
    if not dev_login_enabled():
        return error(404)
    if not dev_request_allowed():
        return error(403)
    patient = database.fetchone("SELECT p.id,p.name FROM patients p JOIN users u ON p.created_by=u.id WHERE u.is_demo=1 AND u.email='caregiver@demo.local' ORDER BY p.created_at LIMIT 1")
    if not patient:
        return error(404)
    return session_response('patient_device', patient_id=patient['id'], label='Development device', patientName=patient['name'])


@bp.post('/auth/otp/resend')
def resend():
    challenge = text_field(payload(), 'challenge')
    with database.transaction():
        row = database.fetchone('SELECT o.*,u.email FROM otps o JOIN users u ON u.id=o.user_id WHERE challenge_hash=?',
                                (digest(challenge),))
        if limited('code', row['email'] if row else ''):
            return error(429)
        if not row or row['used'] or row['attempts'] >= 5 or row['expires_at'] <= now():
            return error()
        return jsonify(ok=True, challenge=issue_otp({'id': row['user_id'], 'email': row['email']}, row['purpose']))


@bp.post('/auth/forgot')
def forgot():
    email = text_field(payload(), 'email').lower()
    if limited('code', email):
        return error(429)
    challenge = secrets.token_urlsafe(32)
    with database.transaction():
        user = database.fetchone('SELECT * FROM users WHERE email=?', (email,))
        if user:
            challenge = issue_otp(user, 'reset')
    return jsonify(ok=True, challenge=challenge), 202


@bp.post('/auth/reset')
def reset():
    data = payload()
    password = data.get('password')
    if limited('reset', maximum=30, seconds=300):
        return error(429)
    if not isinstance(password, str) or not 8 <= len(password) <= 1024:
        return error()
    with database.transaction():
        user_id = check_otp(data, 'reset')
        if not user_id:
            return error()
        database.execute('UPDATE users SET password_hash=?,failed_logins=0,locked_until=0 WHERE id=?',
                         (generate_password_hash(password, method='scrypt'), user_id))
        revoke_user(user_id)
    response = jsonify(ok=True)
    cookie(response, 'cogni_session', '', 0)
    cookie(response, 'cogni_trusted', '', 0)
    return response


@bp.post('/auth/password')
@account_required
def change_password():
    if is_demo_session():
        return error(403)
    data = payload()
    if limited('password', maximum=5, seconds=900):
        return error(429)
    password, old = data.get('password'), data.get('current_password')
    with database.transaction():
        user = database.fetchone('SELECT * FROM users WHERE id=?', (g.auth_session['user_id'],))
        if not isinstance(password, str) or not 8 <= len(password) <= 1024 or not isinstance(old, str) or len(old) > 1024 or not check_password_hash(user['password_hash'], old):
            return error()
        database.execute('UPDATE users SET password_hash=? WHERE id=?', (generate_password_hash(password, method='scrypt'), user['id']))
        revoke_user(user['id'])
        response = session_response('caregiver', user_id=user['id'])
        trust_device(response, user['id'])
        return response


@bp.post('/auth/logout')
@login_required
def logout():
    session = g.auth_session
    database.execute('DELETE FROM sessions WHERE id=?', (session['id'],))
    response = jsonify(ok=True)
    cookie(response, COOKIES[session['kind']], '', 0)
    cookie(response, 'cogni_patient', '', 0)
    return response


@bp.post('/demo/reset')
@caregiver_required
def demo_reset():
    if not demo_enabled() or not is_demo_session():
        return error(404)
    from app import _rescan_reset_lock
    with _rescan_reset_lock:
        patient = database.fetchone('SELECT id FROM patients WHERE is_demo=1 ORDER BY created_at LIMIT 1')
        if not patient:
            return error(404)
        from patient_storage import initialize_patient
        base = Path(current_app.config['PATIENT_DATA_ROOT']).resolve() / patient['id']
        if base.exists():
            shutil.rmtree(base)
        initialize_patient(base, 'Demo Patient')
        sample = Path(__file__).with_name('sample_data')
        for item in sample.iterdir():
            if item.is_file():
                shutil.copy2(item, base / item.name)
            elif item.is_dir() and item.name == 'known_faces':
                shutil.copytree(item, base / 'known_faces', dirs_exist_ok=True)
        from seed_demo_media import seed_demo_media
        seed_demo_media(base, Path(__file__).parent)
        database.execute('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE is_demo=1) OR patient_id=?', (patient['id'],))
        database.execute('DELETE FROM trusted_devices WHERE user_id IN (SELECT id FROM users WHERE is_demo=1)')
        return jsonify(ok=True)


@bp.get('/auth/me')
@login_required
def me():
    session = g.auth_session
    user, patients = None, []
    if session.get('user_id'):
        row = database.fetchone('SELECT id,email,name,role,patient_id,otp_target FROM users WHERE id=?', (session['user_id'],))
        user = dict(row) if row else None
    if session['kind'] == 'caregiver':
        patients = patients_for(user['id'])
    elif g.active_patient:
        patients = [g.active_patient]
    return jsonify(role=(user['role'] if user and user.get('role') == 'self' else session['kind']), user=user, patients=patients, activePatient=g.active_patient, elevated=is_elevated())


@bp.route('/patients', methods=['GET', 'POST'])
@account_required
def patients():
    user_id = g.auth_session['user_id']
    if request.method == 'GET':
        return jsonify(patients=patients_for(user_id))
    name = text_field(payload(), 'name', 60)
    if not name:
        return error()
    patient_id = uuid.uuid4().hex
    with database.transaction():
        database.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,NULL,?, ?,0)', (patient_id, name, user_id, now()))
        database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, user_id, 'owner'))
    return jsonify(id=patient_id, name=name), 201


@bp.get('/patients/<patient_id>/login')
@account_required
def get_patient_login(patient_id):
    if not authorized_patient(patient_id) or (self_account() and not owner_of(patient_id)):
        return error(403)
    row = database.fetchone("SELECT email,otp_target FROM users WHERE patient_id=? AND role='patient'", (patient_id,))
    return jsonify(login=dict(row) if row else None)


@bp.post('/patients/<patient_id>/login')
@account_required
def create_patient_login(patient_id):
    data = payload()
    email = text_field(data, 'email').lower()
    password = data.get('password')
    target = text_field(data, 'otp_target') or 'caregiver'
    if not authorized_patient(patient_id) or (self_account() and not owner_of(patient_id)) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        return error(403)
    if not isinstance(password, str) or not 8 <= len(password) <= 1024 or target not in ('caregiver', 'patient'):
        return error()
    with database.transaction():
        if database.fetchone('SELECT 1 FROM users WHERE email=?', (email,)):
            return error(409)
        if database.fetchone('SELECT 1 FROM users WHERE patient_id=?', (patient_id,)):
            return error(409)
        patient = database.fetchone('SELECT id,name FROM patients WHERE id=?', (patient_id,))
        user_id = uuid.uuid4().hex
        database.execute("INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role,patient_id,otp_target) VALUES (?,?,?,?,0,0,?,0,'patient',?,?)",
                         (user_id, email, patient['name'], generate_password_hash(password, method='scrypt'), now(), patient_id, target))
    return jsonify(ok=True, email=email), 201


@bp.delete('/patients/<patient_id>/login')
@account_required
def remove_patient_login(patient_id):
    if not authorized_patient(patient_id) or (self_account() and not owner_of(patient_id)):
        return error(403)
    user = database.fetchone("SELECT id FROM users WHERE patient_id=? AND role='patient'", (patient_id,))
    if user:
        revoke_user(user['id'])
        database.execute('DELETE FROM otps WHERE user_id=?', (user['id'],))
        database.execute('DELETE FROM users WHERE id=?', (user['id'],))
    return jsonify(ok=True)


@bp.post('/patients/<patient_id>/login/password')
@account_required
def reset_patient_login_password(patient_id):
    if not authorized_patient(patient_id) or (self_account() and not owner_of(patient_id)):
        return error(403)
    password = payload().get('password')
    if not isinstance(password, str) or not 8 <= len(password) <= 1024:
        return error()
    user = database.fetchone("SELECT id FROM users WHERE patient_id=? AND role='patient'", (patient_id,))
    if not user:
        return error(404)
    database.execute('UPDATE users SET password_hash=?,failed_logins=0,locked_until=0 WHERE id=?', (generate_password_hash(password, method='scrypt'), user['id']))
    revoke_user(user['id'])
    return jsonify(ok=True)


def change_pin(patient_id):
    if not authorized_patient(patient_id) or (self_account() and not owner_of(patient_id)):
        return error(403)
    owner = database.fetchone("SELECT u.id,u.role FROM patient_members m JOIN users u ON u.id=m.user_id WHERE m.patient_id=? AND m.role='owner' LIMIT 1", (patient_id,))
    if owner and owner['role'] == 'self' and owner['id'] != g.auth_session.get('user_id'):
        return error(403)
    if limited('pin-change', maximum=5, seconds=900):
        return error(429)
    data = payload()
    new_pin, current_pin = text_field(data, 'new_pin'), text_field(data, 'current_pin')
    if not re.fullmatch(r'[0-9]{4}', new_pin):
        return error()
    with database.transaction():
        patient = database.fetchone('SELECT * FROM patients WHERE id=?', (patient_id,))
        if patient['pin_hash'] and not check_password_hash(patient['pin_hash'], current_pin):
            return error()
        database.execute('UPDATE patients SET pin_hash=? WHERE id=?', (generate_password_hash(new_pin, method='scrypt'), patient_id))
        database.execute('UPDATE sessions SET elevated_until=0 WHERE patient_id=?', (patient_id,))
    return jsonify(ok=True)


@bp.post('/patients/<patient_id>/pin')
@caregiver_required
def patient_pin(patient_id):
    return change_pin(patient_id)


@bp.post('/caregiver/change-pin')
@caregiver_required
def legacy_change_pin():
    return change_pin(g.active_patient['id'] if g.active_patient else None)


@bp.post('/caregiver/unlock')
@login_required
def unlock():
    session = g.get('device_session')
    if not session:
        return error(403)
    if limited('unlock', maximum=5, seconds=900):
        return error(429)
    patient = database.fetchone('SELECT * FROM patients WHERE id=?', (session['patient_id'],))
    pin = text_field(payload(), 'pin')
    demo_pin = demo_enabled() and patient and patient['is_demo'] and hmac.compare_digest(pin, demo_value('DEMO_PIN', '1234'))
    if not patient or not patient['pin_hash'] or not re.fullmatch(r'[0-9]{4}', pin) or not (demo_pin or check_password_hash(patient['pin_hash'], pin)):
        return error(403)
    database.execute('UPDATE sessions SET elevated_until=? WHERE id=?', (now() + 1800, session['id']))
    return jsonify(ok=True)


@bp.post('/caregiver/lock')
@login_required
def lock():
    session = g.get('device_session')
    if not session:
        return error(403)
    database.execute('UPDATE sessions SET elevated_until=0 WHERE id=?', (session['id'],))
    return jsonify(ok=True)


def _device_unpair_counter(scope, key, window):
    row = database.fetchone('SELECT * FROM device_unpair_attempts WHERE scope=? AND key=?', (scope, key))
    stamp = now()
    if not row or stamp >= row['window_start'] + window:
        database.execute('INSERT INTO device_unpair_attempts(scope,key,window_start,attempts) VALUES (?,?,?,0) '
                         'ON CONFLICT(scope,key) DO UPDATE SET window_start=excluded.window_start,attempts=0',
                         (scope, key, stamp))
        return 0, stamp + window
    return row['attempts'], row['window_start'] + window


def _device_unpair_response(message, status, retry_after=None):
    response = jsonify(error=message)
    response.status_code = status
    if retry_after is not None:
        response.headers['Retry-After'] = str(max(1, int(retry_after)))
    return response


@bp.post('/device/unpair')
@login_required
def device_unpair():
    session = g.get('auth_session')
    if not session or session['kind'] != 'patient_device':
        return error(403)
    with database.transaction():
        patient = database.fetchone('SELECT * FROM patients WHERE id=?', (session['patient_id'],))
        pin = text_field(payload(), 'pin')
        # Always perform a password-hash check, including when no PIN exists,
        # so the response timing does not reveal whether a PIN is configured.
        pin_hash = patient['pin_hash'] if patient and patient['pin_hash'] else current_app.extensions['auth_dummy_hash']
        pin_format_ok = bool(re.fullmatch(r'[0-9]{4}', pin))
        pin_valid = check_password_hash(pin_hash, pin if pin_format_ok else '0000') and pin_format_ok
        demo_valid = bool(patient and patient['is_demo'] and demo_enabled() and
                          hmac.compare_digest(pin, demo_value('DEMO_PIN', '1234')))
        session_attempts, session_until = _device_unpair_counter('session', session['id'], 900)
        patient_attempts, patient_until = _device_unpair_counter('patient', session['patient_id'], 3600)
        if session_attempts >= 5 or patient_attempts >= 10:
            retry = max(session_until, patient_until) - now()
            return _device_unpair_response('Too many PIN attempts. Please wait before trying again.', 429, retry)
        if not patient or not patient['pin_hash']:
            return _device_unpair_response('A PIN has not been set', 409)
        if not (pin_valid or demo_valid):
            database.execute('UPDATE device_unpair_attempts SET attempts=attempts+1 WHERE scope=? AND key=?', ('session', session['id']))
            database.execute('UPDATE device_unpair_attempts SET attempts=attempts+1 WHERE scope=? AND key=?', ('patient', session['patient_id']))
            remaining = max(0, min(5 - session_attempts - 1, 10 - patient_attempts - 1))
            return _device_unpair_response(f'That PIN is not right. Attempts remaining: {remaining}.', 403)
        database.execute('DELETE FROM sessions WHERE id=?', (session['id'],))
        database.execute('DELETE FROM device_unpair_attempts WHERE scope=? AND key=?', ('session', session['id']))
        if session.get('user_id'):
            database.execute('DELETE FROM trusted_devices WHERE user_id=?', (session['user_id'],))
    response = jsonify(ok=True)
    cookie(response, COOKIES['patient_device'], '', 0)
    cookie(response, 'cogni_patient', '', 0)
    if session.get('user_id'):
        cookie(response, 'cogni_trusted', '', 0)
    return response


def create_pair(kind):
    patient_id = payload().get('patient_id')
    if not authorized_patient(patient_id) or (self_account() and not owner_of(patient_id)):
        return error(403)
    patient = database.fetchone('SELECT pin_hash FROM patients WHERE id=?', (patient_id,))
    if kind == 'device' and (not patient or not patient['pin_hash']):
        return _device_unpair_response('A PIN has not been set', 409)
    if limited('pair-create', maximum=20, seconds=600):
        return error(429)
    code = ''.join(secrets.choice(ALPHABET) for _ in range(8))
    expiry = now() + (900 if kind == 'device' else 2 * DAY)
    database.execute('INSERT INTO pairing_codes VALUES (?,?,?,?,?,NULL,0)',
                     (digest(code), patient_id, kind, g.auth_session.get('user_id'), expiry))
    return jsonify(code=code[:4] + '-' + code[4:], expiresAt=expiry), 201


@bp.post('/pair/create')
@caregiver_required
def pair_create():
    return create_pair('device')


@bp.post('/pair/invite')
@caregiver_required
def pair_invite():
    return create_pair('caregiver')


def consume_pair(kind):
    address = ip()
    if pairing_blocked(address):
        return None, 429
    code = text_field(payload(), 'code').upper().replace('-', '')
    row = database.fetchone('SELECT * FROM pairing_codes WHERE code_hash=?', (digest(code),))
    valid = (len(code) == 8 and row and row['kind'] == kind and row['used_at'] is None
             and row['expires_at'] > now() and hmac.compare_digest(row['code_hash'], digest(code)))
    if row:
        database.execute('UPDATE pairing_codes SET attempts=attempts+1 WHERE code_hash=?', (row['code_hash'],))
    if not valid:
        record_pairing_failure(address)
        return None, 400
    database.execute('UPDATE pairing_codes SET used_at=? WHERE code_hash=?', (now(), row['code_hash']))
    return row['patient_id'], 200


def _pairing_counter(scope, key, window):
    row = database.fetchone('SELECT * FROM pairing_attempts WHERE scope=? AND key=?', (scope, key))
    stamp = now()
    if not row or stamp >= row['window_start'] + window:
        database.execute('INSERT INTO pairing_attempts(scope,key,window_start,attempts) VALUES (?,?,?,0) '
                         'ON CONFLICT(scope,key) DO UPDATE SET window_start=excluded.window_start,attempts=0',
                         (scope, key, stamp))
        return 0
    return row['attempts']


def pairing_blocked(address):
    return _pairing_counter('ip', address, 900) >= 5 or _pairing_counter('global', 'all', 3600) >= 30


def record_pairing_failure(address):
    stamp = now()
    for scope, key, window in (('ip', address, 900), ('global', 'all', 3600)):
        _pairing_counter(scope, key, window)
        database.execute('UPDATE pairing_attempts SET attempts=attempts+1 WHERE scope=? AND key=?', (scope, key))


@bp.post('/pair/redeem')
def pair_redeem():
    with database.transaction():
        fixed = text_field(payload(), 'code').upper().replace('-', '')
        if demo_enabled() and fixed == demo_value('DEMO_PAIR_CODE', 'DEMA-2345').replace('-', '').upper():
            if not demo_request_allowed():
                return error(403)
            patient = database.fetchone('SELECT id,name FROM patients WHERE is_demo=1 ORDER BY created_at LIMIT 1')
            if not patient:
                return error(404)
            response = session_response('patient_device', patient_id=patient['id'], label='Shared demo device', patientName=patient['name'])
            # Keep the shared demo device effectively non-expiring while preserving the normal schema.
            token = response.headers.get('Set-Cookie', '').split('=', 1)[-1].split(';', 1)[0]
            database.execute('UPDATE sessions SET expires_at=? WHERE token_hash=?', (now() + 100 * 365 * DAY, digest(token)))
            return response
        patient_id, status = consume_pair('device')
        if not patient_id:
            msg = 'Pairing code not found or expired. Please generate a new code and try again.' if status == 400 else 'Too many attempts. Please wait a few minutes before trying again.'
            return jsonify(error=msg), status
        patient = database.fetchone('SELECT name FROM patients WHERE id=?', (patient_id,))
        return session_response('patient_device', patient_id=patient_id,
                                label=text_field(payload(), 'device_label', 100), patientName=patient['name'])


@bp.post('/pair/join')
@account_required
def pair_join():
    with database.transaction():
        patient_id, status = consume_pair('caregiver')
        if not patient_id:
            msg = 'Caregiver invite code not found or expired. Please check the code and try again.' if status == 400 else 'Too many attempts. Please wait a few minutes before trying again.'
            return jsonify(error=msg), status
        database.execute(
            'INSERT INTO patient_members (patient_id, user_id, role) VALUES (?,?,?) '
            'ON CONFLICT (patient_id, user_id) DO NOTHING',
            (patient_id, g.auth_session['user_id'], 'caregiver')
        )
    return jsonify(ok=True, patient_id=patient_id)


@bp.get('/patients/<patient_id>/members')
@login_required
def patient_members(patient_id):
    if not authorized_patient(patient_id):
        return error(403)
    rows = database.fetchall(
        'SELECT u.id,u.email,u.name,m.role FROM patient_members m JOIN users u ON u.id=m.user_id WHERE m.patient_id=? ORDER BY m.role,u.created_at',
        (patient_id,))
    return jsonify(members=[dict(row) for row in rows])


@bp.delete('/patients/<patient_id>/members/<user_id>')
@login_required
def remove_patient_member(patient_id, user_id):
    if not owner_of(patient_id):
        return error(403)
    target = database.fetchone('SELECT role FROM patient_members WHERE patient_id=? AND user_id=?', (patient_id, user_id))
    if not target or target['role'] == 'owner' or user_id == g.auth_session.get('user_id'):
        return error(403)
    with database.transaction():
        database.execute('DELETE FROM patient_members WHERE patient_id=? AND user_id=?', (patient_id, user_id))
        database.execute('DELETE FROM sessions WHERE user_id=? AND patient_id=?', (user_id, patient_id))
    return jsonify(ok=True)


@bp.get('/pair/devices')
@caregiver_required
def devices():
    patient_id = request.args.get('patient_id')
    if not authorized_patient(patient_id):
        return error(403)
    rows = database.fetchall("SELECT id,device_label,created_at,expires_at,last_seen FROM sessions WHERE kind='patient_device' AND patient_id=? AND expires_at>?", (patient_id, now()))
    return jsonify(devices=[dict(row) for row in rows])


@bp.delete('/pair/devices/<device_id>')
@caregiver_required
def unpair(device_id):
    with database.transaction():
        row = database.fetchone("SELECT * FROM sessions WHERE id=? AND kind='patient_device'", (device_id,))
        if not row or not authorized_patient(row['patient_id']):
            return error(403)
        database.execute('DELETE FROM sessions WHERE id=?', (device_id,))
    return jsonify(ok=True)


def _adaptive_file():
    from patient_storage import patient_path
    path = Path(patient_path('adaptive.json'))
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists(): path.write_text(json.dumps({'games': {}}), encoding='utf-8')
    try: data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError): data = {'games': {}}
    data.setdefault('games', {})
    return path, data


def _valid_game(game_id):
    if not isinstance(game_id, str) or not re.fullmatch(r'[a-z0-9-]+', game_id): return False
    try:
        games = json.loads((Path(__file__).parent / 'games.json').read_text(encoding='utf-8'))
        return any(item.get('id') == game_id for item in games.get('games', games) if isinstance(item, dict))
    except (OSError, ValueError): return False


def _clean_adaptive(payload, current=None):
    if not isinstance(payload, dict): return None
    try: knob, rating = int(payload.get('knob')), int(payload.get('rating'))
    except (TypeError, ValueError): return None
    if not 1 <= knob <= 4 or not 400 <= rating <= 1800: return None
    recent = payload.get('recent', [])
    baselines = payload.get('baselines', {})
    if not isinstance(recent, list) or len(recent) > 8 or not isinstance(baselines, dict): return None
    if any(not isinstance(item, dict) for item in recent): return None
    cleaned = {'rating': rating, 'knob': knob, 'recent': recent, 'baselines': {key: list(baselines.get(key, []))[-21:] for key in ('tap', 'typed', 'voice')}, 'decision': payload.get('decision', 'stay'), 'reason': str(payload.get('reason', '')), 'mode': (current or {}).get('mode', 'auto'), 'fixedKnob': (current or {}).get('fixedKnob'), 'lastChange': payload.get('lastChange')}
    if cleaned['mode'] == 'fixed': cleaned['knob'] = int(cleaned['fixedKnob'])
    return cleaned


@bp.get('/adaptive')
@login_required
def get_adaptive():
    _, data = _adaptive_file()
    return jsonify(games=data.get('games', {}))


@bp.put('/adaptive/state')
@login_required
def save_adaptive_state():
    if g.auth_session['kind'] != 'patient_device' or is_elevated(): return error(403)
    payload = request.get_json(silent=True) or {}
    game_id = payload.get('game_id')
    if not _valid_game(game_id): return jsonify(error='Invalid game'), 400
    path, data = _adaptive_file(); state = _clean_adaptive(payload, data['games'].get(game_id))
    if state is None: return jsonify(error='Invalid adaptive state'), 400
    data['games'][game_id] = state; path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return jsonify(state=state)


@bp.post('/adaptive/override')
@account_required
def override_adaptive():
    payload = request.get_json(silent=True) or {}; game_id, mode = payload.get('game_id'), payload.get('mode')
    if not _valid_game(game_id) or mode not in ('auto', 'fixed'): return jsonify(error='Invalid adaptive override'), 400
    if mode == 'fixed' and payload.get('knob') not in (1, 2, 3, 4): return jsonify(error='Invalid knob'), 400
    path, data = _adaptive_file(); state = data['games'].get(game_id) or {'rating': 1000, 'knob': 2, 'recent': [], 'baselines': {'tap': [], 'typed': [], 'voice': []}, 'decision': 'stay', 'reason': 'Getting to know your pace'}
    state['mode'] = mode; state['fixedKnob'] = payload.get('knob') if mode == 'fixed' else None
    if mode == 'fixed': state['knob'] = int(payload['knob'])
    data['games'][game_id] = state; path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return jsonify(state=state)


@bp.post('/adaptive/reset')
@account_required
def reset_adaptive():
    payload = request.get_json(silent=True) or {}; game_id = payload.get('game_id'); path, data = _adaptive_file()
    if game_id is not None and not _valid_game(game_id): return jsonify(error='Invalid game'), 400
    if game_id: data['games'].pop(game_id, None)
    else: data['games'] = {}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return jsonify(ok=True, games=data['games'])


CAREGIVER_ENDPOINTS = {
    'get_processing_status',
    'get_reports_days', 'get_report_for_day', 'save_settings',
}
DEMO_BLOCKED_ENDPOINTS = {'pair_invite', 'unpair', 'create_patient_login', 'remove_patient_login', 'reset_patient_login_password', 'patient_pin', 'legacy_change_pin'}
DEMO_AI_ENDPOINTS = {'accuracy', 'generate_questions', 'search', 'transcribe', 'speak', 'crossword'}

PREFERENCE_DEFAULTS = {
    'soundEffects': True,
    'animations': True,
    'encouragingMessages': True,
    'readAloud': False,
    'answerBySpeaking': False,
    'listenAutomatically': False,
    'speechRate': 'normal',
    'textSize': 'large',
}
PREFERENCE_BOOLEAN_KEYS = {'soundEffects', 'animations', 'encouragingMessages', 'readAloud', 'answerBySpeaking', 'listenAutomatically'}
PREFERENCE_ENUMS = {'speechRate': {'slow', 'normal'}, 'textSize': {'large', 'larger', 'largest'}}
PREFERENCE_KEYS = set(PREFERENCE_DEFAULTS)


def _preferences_path():
    from patient_storage import patient_path
    return Path(patient_path('preferences.json'))


def _read_preferences():
    path = _preferences_path()
    if not path.exists():
        return {'values': dict(PREFERENCE_DEFAULTS), 'locked': [], 'updatedAt': 0, 'updatedBy': None,
                'version': 0, 'imported': False, 'empty': True}
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        raw = {}
    values = dict(PREFERENCE_DEFAULTS)
    if isinstance(raw.get('values'), dict):
        values.update({key: raw['values'][key] for key in PREFERENCE_KEYS if key in raw['values']})
    locked = raw.get('locked') if isinstance(raw.get('locked'), list) else []
    locked = [key for key in locked if key in PREFERENCE_KEYS]
    return {'values': values, 'locked': locked, 'updatedAt': int(raw.get('updatedAt') or 0),
            'updatedBy': raw.get('updatedBy'), 'version': int(raw.get('version') or 0),
            'imported': bool(raw.get('imported')), 'empty': False}


def _write_preferences(state):
    path = _preferences_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({key: state[key] for key in ('values', 'locked', 'updatedAt', 'updatedBy', 'version', 'imported')},
                               ensure_ascii=False, indent=2), encoding='utf-8')


def _preferences_result(state):
    return jsonify(values=state['values'], locked=state['locked'], updatedAt=state['updatedAt'],
                   updatedBy=state['updatedBy'], version=state['version'], empty=state['empty'])


def _preferences_access():
    session = g.get('auth_session')
    patient = g.get('active_patient')
    if not session or not patient:
        return None
    if session['kind'] == 'patient_device':
        if session.get('patient_id') != patient['id']:
            return None
        return 'patient', patient
    if self_account():
        return 'self', patient
    if session['kind'] == 'caregiver' and database.fetchone(
            'SELECT 1 FROM patient_members WHERE patient_id=? AND user_id=?',
            (patient['id'], session.get('user_id'))):
        return 'caregiver', patient
    return None


def _validate_preference_values(values):
    if not isinstance(values, dict):
        return 'values must be an object'
    unknown = set(values) - PREFERENCE_KEYS
    if unknown:
        return f'Unknown preference: {sorted(unknown)[0]}'
    for key, value in values.items():
        if key in PREFERENCE_BOOLEAN_KEYS and not isinstance(value, bool):
            return f'{key} must be true or false'
        if key in PREFERENCE_ENUMS and value not in PREFERENCE_ENUMS[key]:
            return f'{key} is invalid'
    return None


@bp.get('/preferences')
@login_required
def get_preferences():
    if request.content_length and request.content_length > 32768:
        return error(413)
    if not _preferences_access():
        return error(403)
    return _preferences_result(_read_preferences())


@bp.put('/preferences')
@login_required
def put_preferences():
    if request.content_length and request.content_length > 32768:
        return error(413)
    access = _preferences_access()
    if not access:
        return error(403)
    kind, _patient = access
    data = payload()
    if set(data) - {'values', 'locked', 'version', 'source'}:
        return error(400)
    values = data.get('values', {})
    if not isinstance(values, dict):
        return jsonify(error='values must be an object'), 400
    validation = _validate_preference_values(values)
    if validation:
        return jsonify(error=validation), 400
    locked = data.get('locked', None)
    if locked is not None and (not isinstance(locked, list) or any(key not in PREFERENCE_KEYS for key in locked)):
        return jsonify(error='locked contains an unknown preference'), 400
    source = data.get('source', 'user')
    if source not in ('user', 'device-import'):
        return jsonify(error='Invalid preference source'), 400
    if source == 'device-import' and kind != 'patient':
        return error(403)
    try:
        version = int(data.get('version', 0))
    except (TypeError, ValueError):
        return jsonify(error='Invalid preference version'), 400
    if version < 0:
        return jsonify(error='Invalid preference version'), 400
    if not limits().hit(('preferences', g.auth_session['id']), 60, 60):
        return jsonify(error='Too many preference changes. Please try again later.'), 429
    current = _read_preferences()
    if source == 'device-import' and not current['empty']:
        return jsonify(error='Preferences already exist on the server.', values=current['values'], locked=current['locked'],
                       updatedAt=current['updatedAt'], updatedBy=current['updatedBy'], version=current['version']), 409
    if version != current['version']:
        return jsonify(error='Preferences changed elsewhere. Please reload.', values=current['values'], locked=current['locked'],
                       updatedAt=current['updatedAt'], updatedBy=current['updatedBy'], version=current['version']), 409
    if kind == 'patient':
        changed_locked = {key for key in values if key in current['locked'] and values[key] != current['values'].get(key)}
        if changed_locked:
            key = sorted(changed_locked)[0]
            return jsonify(error=f'Your caregiver has set this: {key}'), 403
        if locked is not None:
            return error(403)
    next_values = dict(current['values'])
    next_values.update(values)
    if not next_values['answerBySpeaking']:
        next_values['listenAutomatically'] = False
    next_state = {'values': next_values, 'locked': current['locked'] if kind == 'patient' or locked is None else list(dict.fromkeys(locked)),
                  'updatedAt': now(), 'updatedBy': kind, 'version': current['version'] + 1,
                  'imported': current['imported'] or source == 'device-import', 'empty': False}
    _write_preferences(next_state)
    return _preferences_result(next_state)


@bp.post('/preferences/reset')
@login_required
def reset_preferences():
    access = _preferences_access()
    if not access or access[0] == 'patient':
        return error(403)
    if not limits().hit(('preferences-reset', g.auth_session['id']), 10, 600):
        return jsonify(error='Too many preference changes. Please try again later.'), 429
    current = _read_preferences()
    next_state = {'values': dict(PREFERENCE_DEFAULTS), 'locked': [], 'updatedAt': now(),
                  'updatedBy': access[0], 'version': current['version'] + 1, 'imported': True, 'empty': False}
    _write_preferences(next_state)
    return _preferences_result(next_state)


def init_auth(app, legacy_settings):
    app.config.setdefault('AUTH_DATABASE', str(Path(__file__).with_name('auth.db')))
    app.config.setdefault('AUTH_COOKIE_SECURE', os.getenv('COGNI_COOKIE_SECURE') == '1')
    app.config.setdefault('AUTH_DEV_LOGIN', os.getenv('COGNI_DEV_LOGIN') == '1')
    app.config.setdefault('AUTH_DEMO', os.getenv('COGNI_DEMO') == '1')
    app.config.setdefault('AUTH_DEMO_PUBLIC', os.getenv('COGNI_DEMO_PUBLIC') == '1')
    app.config.setdefault('AUTH_ORIGINS', [s.strip().rstrip('/') for s in os.getenv('COGNI_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',') if s.strip()])
    app.config['AUTH_LEGACY_SETTINGS'] = legacy_settings
    with app.app_context():
        validate_dev_config()
        if app.config['AUTH_DEMO'] and not app.config['AUTH_DEMO_PUBLIC']:
            host = os.getenv('COGNI_HOST', '127.0.0.1')
            try:
                local = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = host.lower() == 'localhost'
            if not local:
                raise RuntimeError('COGNI_DEMO requires a loopback COGNI_HOST unless COGNI_DEMO_PUBLIC=1')
    if app.config['AUTH_DEV_LOGIN']:
        app.logger.warning('COGNI_DEV_LOGIN is enabled: local development accounts and shortcuts are active')
    app.extensions['auth_limits'] = RateLimits()
    app.extensions['auth_dummy_hash'] = generate_password_hash(secrets.token_urlsafe(32), method='scrypt')
    database.init_db(app)
    with app.app_context():
        if app.config['AUTH_DEV_LOGIN']:
            seed_dev_accounts(app)
        if app.config['AUTH_DEMO']:
            app.logger.warning('COGNI_DEMO is enabled: shared demo accounts and data are active; do not host real data')
            seed_shared_demo(app)
        else:
            database.execute('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE is_demo=1)')
            database.execute('DELETE FROM trusted_devices WHERE user_id IN (SELECT id FROM users WHERE is_demo=1)')
    app.register_blueprint(bp)

    @app.before_request
    def authenticate():
        from patient_storage import migrate_legacy
        migrate_legacy()
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            origin = request.headers.get('Origin')
            if origin and origin not in app.config['AUTH_ORIGINS']:
                return error(403)
            if request.headers.get('Sec-Fetch-Site') == 'cross-site' and not origin:
                return error(403)
        if request.method == 'OPTIONS':
            return None
        g.caregiver_session = resolve_session('caregiver')
        g.device_session = resolve_session('patient_device')
        # A logged-in caregiver always wins; a device cookie cannot permit saving previews.
        g.auth_session = g.caregiver_session or g.device_session
        g.active_patient = None
        session = g.auth_session
        if session:
            if session['kind'] == 'patient_device':
                row = database.fetchone('SELECT id,name FROM patients WHERE id=?', (session['patient_id'],))
                g.active_patient = dict(row) if row else None
            else:
                linked = patients_for(session['user_id'])
                # WSGI servers can discard headers containing underscores.
                selected = (request.headers.get('X-Cogni-Patient') or
                            request.headers.get('cogni_patient') or request.cookies.get('cogni_patient'))
                g.active_patient = next((p for p in linked if p['id'] == selected), None) if selected else (linked[0] if linked else None)
                needs_selection = request.blueprint != 'auth' or request.endpoint in ('auth.me', 'auth.legacy_change_pin')
                if selected and g.active_patient is None and needs_selection:
                    return error(403)
        if request.blueprint == 'auth' or request.endpoint is None:
            return None
        if not session:
            return error(401)
        if is_demo_session(session):
            if request.endpoint in DEMO_BLOCKED_ENDPOINTS:
                return error(403)
            if request.endpoint in DEMO_AI_ENDPOINTS:
                if not limits().hit(('demo-ai', session['id']), 60, 3600):
                    return jsonify(error='Demo AI limit reached. Please try again later.'), 429
            if request.endpoint == 'upload_video' and request.content_length and request.content_length > 20 * 1024 * 1024:
                return jsonify(error='Demo uploads are limited to 20 MB.'), 403
            if request.endpoint == 'upload_video' and not limits().hit(('demo-upload', session['id']), 3, 86400):
                return jsonify(error='Demo uploads are limited to three per day.'), 403
        if request.endpoint == 'delete_performance' and not (is_caregiver() or self_account()):
            return error(403)
        if request.endpoint in {'add_person', 'update_person', 'delete_person', 'rescan_people', 'rescan_status'}:
            if session['kind'] == 'patient_device' or not (is_caregiver() or self_account()):
                return error(403)
        elif request.endpoint in CAREGIVER_ENDPOINTS and not is_caregiver():
            return error(403)
        if request.endpoint == 'upload_video' and not (is_caregiver() or self_account()):
            return error(403)
        if request.endpoint == 'save_performance' and ((session['kind'] != 'patient_device' and not self_account()) or is_elevated()):
            return error(403)

    @app.after_request
    def refresh(response):
        session = g.get('auth_session')
        if session and response.status_code < 400:
            age = (30 if session['kind'] == 'caregiver' else 90) * DAY
            updated = database.execute('UPDATE sessions SET expires_at=?,last_seen=? WHERE id=?', (now() + age, now(), session['id'])).rowcount
            # Do not replace cookies issued by login/password changes or logout.
            key = COOKIES[session['kind']]
            if updated and not any(value.startswith(key + '=') for value in response.headers.getlist('Set-Cookie')):
                cookie(response, key, request.cookies[key], age)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.errorhandler(database.DatabaseError)
    def database_error(_error):
        app.logger.error('Authentication database operation failed')
        return error(503)

    @app.errorhandler(mailer.DeliveryError)
    def delivery_error(_error):
        app.logger.error('Verification email could not be delivered')
        return jsonify(error=str(_error)), 503
