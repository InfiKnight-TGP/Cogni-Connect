"""Real temporary database/session fixtures, without disabling authorization."""
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

from werkzeug.security import generate_password_hash
import app
import auth


def setup_auth(case, kind='caregiver'):
    temp = tempfile.TemporaryDirectory()
    case.addCleanup(temp.cleanup)
    root = Path(temp.name)
    case.auth_root = root
    config = patch.dict(app.api.config, {
        'TESTING': True, 'AUTH_DATABASE': str(root / 'auth.db'),
        'STORAGE_MIGRATION': False, 'PATIENT_DATA_ROOT': str(root / 'data'),
        'AUTH_DEMO': False, 'AUTH_COOKIE_SECURE': False,
        'AUTH_ORIGINS': ['http://localhost:3000'],
        'AUTH_LEGACY_SETTINGS': lambda: json.loads(Path(app.SETTINGS_PATH).read_text(encoding='utf-8')),
    })
    config.start()
    case.addCleanup(config.stop)
    rate = patch.dict(app.api.extensions, {'auth_limits': auth.RateLimits()})
    rate.start()
    case.addCleanup(rate.stop)
    defaults = {
        'SETTINGS_PATH': {'pin': '1234', 'patient_name': 'Legacy patient', 'language': 'en', 'pins': []},
        'PERFORMANCE_PATH': {'scores': [], 'game_scores': []},
        'QAS_PATH': [], 'JOURNALS_PATH': {}, 'ROUTINES_PATH': {'steps': []},
        'DAILY_PLANS_PATH': {}, 'CROSSWORDS_PATH': {}, 'PEOPLE_FILE': [],
    }
    for key, value in defaults.items():
        path = root / (key.lower() + '.json')
        path.write_text(json.dumps(value), encoding='utf-8')
        item = patch.object(app, key, str(path))
        item.start()
        case.addCleanup(item.stop)
    for key in ('UPLOAD_FOLDER', 'KNOWN_FACES_FOLDER', 'VIDEO_CHUNKS_ROOT', 'FRAMES_ROOT'):
        path = root / key.lower()
        path.mkdir()
        item = patch.object(app, key, str(path))
        item.start()
        case.addCleanup(item.stop)
    uploads = patch.dict(app.api.config, {'UPLOAD_FOLDER': app.UPLOAD_FOLDER, 'KNOWN_FACES_FOLDER': app.KNOWN_FACES_FOLDER})
    uploads.start()
    case.addCleanup(uploads.stop)
    if kind is None:
        return
    with app.api.app_context():
        auth.db().execute('INSERT INTO users VALUES (?,?,?,?,0,0,?)',
                          ('test-user', 'caregiver@example.com', 'Caregiver', generate_password_hash('password1', method='scrypt'), auth.now()))
        auth.db().execute('INSERT INTO patients VALUES (?,?,?,?,?)',
                          ('test-patient', 'Patient', generate_password_hash('1234', method='scrypt'), 'test-user', auth.now()))
        auth.db().execute("INSERT INTO patient_members VALUES ('test-patient','test-user','owner')")
    case.auth_client = make_client(kind)


def make_client(kind='caregiver', elevated=False):
    client = app.api.test_client()
    with app.api.app_context():
        token, _ = auth.new_session(kind, user_id='test-user' if kind == 'caregiver' else None,
                                    patient_id='test-patient' if kind == 'patient_device' else None)
        if elevated:
            auth.db().execute('UPDATE sessions SET elevated_until=? WHERE token_hash=?', (auth.now() + 1800, auth.digest(token)))
    client.set_cookie(auth.COOKIES[kind], token)
    return client
