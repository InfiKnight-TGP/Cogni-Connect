"""Disposable Flask server for frontend/lib/auth.check.mjs; never uses real data."""
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
import auth
import mailer
from werkzeug.serving import make_server

if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        legacy = root / 'legacy'
        legacy.mkdir()
        (legacy / 'settings.json').write_text(json.dumps({'patient_name': 'Patient A', 'pin': '1234'}), encoding='utf-8')
        (legacy / 'known_faces').mkdir()
        (legacy / 'known_faces' / 'a.jpg').write_bytes(b'private-patient-a')
        (legacy / 'video_chunks').mkdir()
        (legacy / 'video_chunks' / 'a.mp4').write_bytes(b'private-video-a')
        app.api.config.update(TESTING=True, AUTH_DATABASE=str(root / 'auth.db'),
            PATIENT_DATA_ROOT=str(root / 'data'), LEGACY_DATA_ROOT=str(legacy),
            LEGACY_PUBLIC_ROOT=str(root / 'public'), MIGRATION_BACKUP_ROOT=str(root / 'backup'),
            AUTH_COOKIE_SECURE=False, AUTH_ORIGINS=['http://localhost:3000'], AUTH_DEMO=False)
        # Deliver no email. A known OTP is confined to this disposable test process.
        mailer.send_code = lambda *_args: None
        auth.secrets.randbelow = lambda _maximum: 123456
        server = make_server('127.0.0.1', 0, app.api, threaded=True)
        print(f'FIXTURE_PORT={server.server_port}', flush=True)
        server.serve_forever()
