"""Server-side accounts, pairing, and authorization for patient-scoped storage."""
from functools import wraps
import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import threading
import time
import uuid

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
    return bool(session and (session['kind'] == 'caregiver' or is_elevated()))


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
        if g.auth_session['kind'] != 'caregiver':
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
    database.execute('INSERT INTO patients VALUES (?,?,?,?,?)',
                     (patient_id, settings.get('patient_name') or 'My patient', pin_hash, user_id, now()))
    database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, user_id, 'owner'))


def issue_otp(user, purpose):
    challenge, code = secrets.token_urlsafe(32), f'{secrets.randbelow(1000000):06d}'
    database.execute('UPDATE otps SET used=1 WHERE user_id=? AND purpose=?', (user['id'], purpose))
    database.execute('INSERT INTO otps VALUES (?,?,?,?,?,?,0,0)',
                     (uuid.uuid4().hex, user['id'], purpose, digest(code), digest(challenge), now() + 300))
    mailer.send_code(user['email'], code, purpose)
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


def trust_device(response, user_id):
    trusted = secrets.token_urlsafe(32)
    cookie(response, 'cogni_trusted', trusted, 30 * DAY)
    database.execute('DELETE FROM trusted_devices WHERE expires_at<=?', (now(),))
    database.execute('INSERT INTO trusted_devices VALUES (?,?,?)', (digest(trusted), user_id, now() + 30 * DAY))


def revoke_user(user_id):
    database.execute('DELETE FROM sessions WHERE user_id=?', (user_id,))
    database.execute('DELETE FROM trusted_devices WHERE user_id=?', (user_id,))


@bp.post('/auth/signup')
def signup():
    data = payload()
    email, name, password = text_field(data, 'email').lower(), text_field(data, 'name', 100), data.get('password')
    if limited('code', email):
        return error(429)
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or not name or not isinstance(password, str) or not 8 <= len(password) <= 1024:
        return error()
    challenge = secrets.token_urlsafe(32)
    with database.transaction():
        if not database.fetchone('SELECT 1 FROM users WHERE email=?', (email,)):
            user_id = uuid.uuid4().hex
            database.execute('INSERT INTO users VALUES (?,?,?,?,0,0,?)',
                             (user_id, email, name, generate_password_hash(password, method='scrypt'), now()))
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
        if not user or user['locked_until'] > now() or not valid:
            if user and user['locked_until'] <= now():
                count = (0 if user['locked_until'] else user['failed_logins']) + 1
                database.execute('UPDATE users SET failed_logins=?,locked_until=? WHERE id=?',
                                 (count, now() + 900 if count >= 5 else 0, user['id']))
            return error(401)
        database.execute('UPDATE users SET failed_logins=0,locked_until=0 WHERE id=?', (user['id'],))
        trusted = request.cookies.get('cogni_trusted', '')
        trust = database.fetchone('SELECT token_hash FROM trusted_devices WHERE token_hash=? AND user_id=? AND expires_at>?',
                                  (digest(trusted), user['id'], now())) if trusted and len(trusted) <= 256 else None
        if trust and hmac.compare_digest(trust['token_hash'], digest(trusted)):
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
        bootstrap_patient(user_id)
        response = session_response('caregiver', user_id=user_id)
        trust_device(response, user_id)
        return response


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


@bp.get('/auth/me')
@login_required
def me():
    session = g.auth_session
    user, patients = None, []
    if session['kind'] == 'caregiver':
        user = dict(database.fetchone('SELECT id,email,name FROM users WHERE id=?', (session['user_id'],)))
        patients = patients_for(user['id'])
    elif g.active_patient:
        patients = [g.active_patient]
    return jsonify(role=session['kind'], user=user, patients=patients, activePatient=g.active_patient, elevated=is_elevated())


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
        database.execute('INSERT INTO patients VALUES (?,?,NULL,?,?)', (patient_id, name, user_id, now()))
        database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, user_id, 'owner'))
    return jsonify(id=patient_id, name=name), 201


def change_pin(patient_id):
    if not authorized_patient(patient_id):
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
    if not patient or not patient['pin_hash'] or not re.fullmatch(r'[0-9]{4}', pin) or not check_password_hash(patient['pin_hash'], pin):
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


def create_pair(kind):
    patient_id = payload().get('patient_id')
    if not authorized_patient(patient_id):
        return error(403)
    if limited('pair-create', maximum=20, seconds=600):
        return error(429)
    code = ''.join(secrets.choice(ALPHABET) for _ in range(8))
    expiry = now() + (1 if kind == 'device' else 2) * DAY
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
    key = ('pair-wrong', ip())
    if limits().blocked(key, 5):
        return None, 429
    code = text_field(payload(), 'code').upper().replace('-', '')
    row = database.fetchone('SELECT * FROM pairing_codes WHERE code_hash=?', (digest(code),))
    valid = (len(code) == 8 and row and row['kind'] == kind and row['used_at'] is None
             and row['expires_at'] > now() and hmac.compare_digest(row['code_hash'], digest(code)))
    if row:
        database.execute('UPDATE pairing_codes SET attempts=attempts+1 WHERE code_hash=?', (row['code_hash'],))
    if not valid:
        limits().wrong_pair(key)
        return None, 400
    database.execute('UPDATE pairing_codes SET used_at=? WHERE code_hash=?', (now(), row['code_hash']))
    return row['patient_id'], 200


@bp.post('/pair/redeem')
def pair_redeem():
    with database.transaction():
        patient_id, status = consume_pair('device')
        if not patient_id:
            return error(status)
        patient = database.fetchone('SELECT name FROM patients WHERE id=?', (patient_id,))
        return session_response('patient_device', patient_id=patient_id,
                                label=text_field(payload(), 'device_label', 100), patientName=patient['name'])


@bp.post('/pair/join')
@account_required
def pair_join():
    with database.transaction():
        patient_id, status = consume_pair('caregiver')
        if not patient_id:
            return error(status)
        database.execute(
            'INSERT INTO patient_members (patient_id, user_id, role) VALUES (?,?,?) '
            'ON CONFLICT (patient_id, user_id) DO NOTHING',
            (patient_id, g.auth_session['user_id'], 'caregiver')
        )
    return jsonify(ok=True, patient_id=patient_id)


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


@bp.post('/auth/demo')
def demo():
    if not current_app.config['AUTH_DEMO']:
        return error(404)
    if limited('demo', maximum=5, seconds=900):
        return error(429)
    with database.transaction():
        user = database.fetchone("SELECT * FROM users WHERE email='demo@cogniconnect.invalid'")
        if not user:
            user_id = uuid.uuid4().hex
            database.execute('INSERT INTO users VALUES (?,?,?,?,0,0,?)',
                             (user_id, 'demo@cogniconnect.invalid', 'Demo caregiver', generate_password_hash(secrets.token_urlsafe(32), method='scrypt'), now()))
            patient_id = uuid.uuid4().hex
            database.execute('INSERT INTO patients VALUES (?,?,NULL,?,?)', (patient_id, 'Demo patient', user_id, now()))
            database.execute('INSERT INTO patient_members VALUES (?,?,?)', (patient_id, user_id, 'owner'))
        else:
            user_id = user['id']
        return session_response('caregiver', user_id=user_id)


CAREGIVER_ENDPOINTS = {
    'upload_video', 'get_processing_status', 'add_person', 'update_person', 'delete_person',
    'delete_performance', 'get_reports_days', 'get_report_for_day', 'save_settings', 'save_routine',
}


def init_auth(app, legacy_settings):
    app.config.setdefault('AUTH_DATABASE', str(Path(__file__).with_name('auth.db')))
    app.config.setdefault('AUTH_COOKIE_SECURE', os.getenv('COGNI_COOKIE_SECURE') == '1')
    app.config.setdefault('AUTH_DEMO', os.getenv('COGNI_DEMO', '').lower() == 'true')
    app.config.setdefault('AUTH_ORIGINS', [s.strip().rstrip('/') for s in os.getenv('COGNI_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',') if s.strip()])
    app.config['AUTH_LEGACY_SETTINGS'] = legacy_settings
    app.extensions['auth_limits'] = RateLimits()
    app.extensions['auth_dummy_hash'] = generate_password_hash(secrets.token_urlsafe(32), method='scrypt')
    database.init_db(app)
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
        if request.endpoint in CAREGIVER_ENDPOINTS and not is_caregiver():
            return error(403)
        if request.endpoint == 'save_performance' and (session['kind'] != 'patient_device' or is_elevated()):
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
        return error(503)
