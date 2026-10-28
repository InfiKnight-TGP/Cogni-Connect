"""Patient paths, restart-safe legacy migration, and explicit CLI data selection."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import threading
import uuid

from flask import abort, current_app, g
from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parent
FILES = {'people.json': None, 'places.json': [], 'alerts.json': [], 'performance_data.json': {'scores': [], 'game_scores': []},
         'video_journals.json': {}, 'qas.json': [], 'daily_plans.json': {},
         'routines.json': {'steps': []}, 'settings.json': {}, 'crosswords.json': {}, 'adaptive.json': {'games': {}},
         'memories.json': {}}
FOLDERS = ('content', 'video_chunks', 'frames', 'known_faces', 'place_photos', 'summary', 'memory_thumbnails')
_migration_lock = threading.Lock()


def patient_path(name):
    patient = g.get('active_patient')
    if not patient:
        abort(403, description='Select a patient first.')
    root = Path(current_app.config['PATIENT_DATA_ROOT']).resolve()
    patient_id = patient['id']
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', patient_id):
        abort(403)
    base = (root / patient_id).resolve()
    path = (base / name).resolve()
    if not base.is_relative_to(root) or not path.is_relative_to(base):
        abort(404)
    return str(path)


class ScopedPath(os.PathLike):
    def __init__(self, name: str):
        self.name = name

    def __fspath__(self) -> str:
        return patient_path(self.name)

    def __str__(self) -> str:
        return self.__fspath__()


def scoped(name):
    # Request-local resolution: never change module globals between requests.
    return ScopedPath(name)


def initialize_patient(base, name):
    base = Path(base)
    base.mkdir(parents=True, exist_ok=True)
    for folder in FOLDERS:
        (base / folder).mkdir(exist_ok=True)
    for filename, default in FILES.items():
        if default is None:  # The existing importer builds people from known_faces.
            continue
        path = base / filename
        if not path.exists():
            value = {'patient_name': name, 'language': 'en', 'pins': []} if filename == 'settings.json' else default
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def _copy_tree_missing(source, destination):
    for item in source.rglob('*'):
        target = destination / item.relative_to(source)
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)


def migrate_legacy():
    if not current_app.config.get('STORAGE_MIGRATION', True):
        return
    import auth
    import db
    if db.fetchone("SELECT 1 FROM installation WHERE key='patient_storage_complete'"):
        return
    with _migration_lock, db.transaction():
        if db.fetchone("SELECT 1 FROM installation WHERE key='patient_storage_complete'"):
            return
        legacy = Path(current_app.config['LEGACY_DATA_ROOT']).resolve()
        backup = Path(current_app.config['MIGRATION_BACKUP_ROOT']).resolve()
        backup.mkdir(parents=True, exist_ok=True)
        settings_path = legacy / 'settings.json'
        if not settings_path.exists():
            settings_path = backup / 'settings.json'
        settings = json.loads(settings_path.read_text(encoding='utf-8')) if settings_path.exists() else {}
        patient = db.fetchone('SELECT * FROM patients ORDER BY created_at,id LIMIT 1')
        if patient is None:
            manifest = backup / 'migration.json'
            patient_id = json.loads(manifest.read_text(encoding='utf-8'))['patient_id'] if manifest.exists() else uuid.uuid4().hex
            manifest.write_text(json.dumps({'patient_id': patient_id}), encoding='utf-8')
            pin = str(settings.get('pin', '1234'))
            pin_hash = pin if pin.startswith(('scrypt:', 'pbkdf2:')) else generate_password_hash(pin, method='scrypt')
            db.execute('INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,NULL,?,0)',
                       (patient_id, settings.get('patient_name') or 'My patient', pin_hash, auth.now()))
            patient_name = settings.get('patient_name') or 'My patient'
        else:
            patient_id, patient_name = patient['id'], patient['name']
        base = Path(current_app.config['PATIENT_DATA_ROOT']).resolve() / patient_id
        base.mkdir(parents=True, exist_ok=True)
        for name in (*FILES, *FOLDERS):
            source, target, saved = legacy / name, base / name, backup / name
            if not source.exists():
                continue
            if not source.resolve().is_relative_to(legacy):
                raise ValueError('Legacy data points outside the backend directory')
            if source.is_dir():
                shutil.copytree(source, saved, dirs_exist_ok=True)
                shutil.copytree(source, target, dirs_exist_ok=True)
            else:
                shutil.copy2(source, saved)
                shutil.copy2(source, target)
        initialize_patient(base, patient_name)
        settings = json.loads((base / 'settings.json').read_text(encoding='utf-8'))
        settings.pop('pin', None)
        settings.setdefault('patient_name', patient_name)
        settings.setdefault('language', 'en')
        settings.setdefault('pins', [])
        (base / 'settings.json').write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
        # Old frontend copies must stop being publicly reachable.
        public = Path(current_app.config['LEGACY_PUBLIC_ROOT']).resolve()
        for name in ('video_chunks', 'frames', 'known_faces'):
            source = public / name
            if source.exists():
                if not source.resolve().is_relative_to(public):
                    raise ValueError('Public media points outside the public directory')
                saved = backup / ('frontend-public-' + name)
                shutil.copytree(source, saved, dirs_exist_ok=True)
                _copy_tree_missing(source, base / name)
                shutil.rmtree(source)
        # All copies are complete before removing the originals. On a retry,
        # a committed manifest prevents migration from touching live patient data.
        for name in (*FILES, *FOLDERS):
            source = legacy / name
            if source.exists():
                if not source.resolve().is_relative_to(legacy):
                    raise ValueError('Unsafe legacy path')
                shutil.rmtree(source) if source.is_dir() else source.unlink()
        db.execute(
            "INSERT INTO installation (key, value) VALUES ('patient_storage_complete', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (patient_id,)
        )


def configure(app):
    app.config.setdefault('PATIENT_DATA_ROOT', str(ROOT / 'data'))
    app.config.setdefault('LEGACY_DATA_ROOT', str(ROOT))
    app.config.setdefault('MIGRATION_BACKUP_ROOT', str(ROOT / 'pre-migration-backup'))
    app.config.setdefault('LEGACY_PUBLIC_ROOT', str(ROOT.parent / 'frontend' / 'public'))


def cli_data_dir(parser=None):
    parser = parser or argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--patient', help='Patient ID under backend/data')
    group.add_argument('--data-dir', help='Explicit patient data directory')
    args = parser.parse_args()
    if args.patient and not re.fullmatch(r'[a-zA-Z0-9_-]+', args.patient):
        parser.error('Invalid patient ID')
    base = Path(args.data_dir).resolve() if args.data_dir else (ROOT / 'data' / args.patient).resolve()
    if not base.is_dir():
        parser.error('Patient data directory does not exist')
    return base, args
