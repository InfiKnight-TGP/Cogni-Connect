"""Patient-scoped SOS alerts and privacy cleanup."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import threading
import uuid

from flask import Blueprint, current_app, g, jsonify, request

import auth
import db
import mailer
from patient_storage import patient_path

bp = Blueprint('alerts', __name__)
_locks_guard = threading.Lock()
_locks = {}
RATE_LIMIT = 5
RATE_WINDOW = timedelta(hours=1)
COOLDOWN = timedelta(seconds=60)
LOCATION_RETENTION = timedelta(days=30)
ALERT_RETENTION = timedelta(days=90)


class NoActivePatient(Exception):
    """Raised when an alert operation requires an active patient context."""
    pass


@bp.errorhandler(NoActivePatient)
def handle_no_active_patient(_):
    return jsonify(error="No active patient."), 403


def _lock(path):
    with _locks_guard:
        return _locks.setdefault(path, threading.RLock())


def _now():
    return datetime.now(timezone.utc)


def _parse(value):
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return None


def _read(path):
    try:
        value = json.loads(Path(path).read_text(encoding='utf-8'))
        return value if isinstance(value, list) else []
    except (OSError, ValueError, TypeError):
        return []


from jsonio import atomic_write_json


def _save(path, rows):
    atomic_write_json(path, rows)


def _clean(rows, now):
    changed = False
    kept = []
    for row in rows:
        if not isinstance(row, dict):
            changed = True
            continue
        created = _parse(row.get('createdAt'))
        if not created or created < now - ALERT_RETENTION:
            changed = True
            continue
        if row.get('location') and created < now - LOCATION_RETENTION:
            row = {key: value for key, value in row.items() if key != 'location'}
            changed = True
        # Migration: convert raw _sessionId to _ownerHash and delete _sessionId
        if '_sessionId' in row:
            if not row.get('_ownerHash') and row['_sessionId']:
                row['_ownerHash'] = _session_hash(row['_sessionId'])
            del row['_sessionId']
            changed = True
        kept.append(row)
    return kept, changed


def _alert_file(patient_id):
    # patient_path enforces that the current request is bound to this patient.
    if not g.get('active_patient') or g.active_patient.get('id') != patient_id:
        raise NoActivePatient
    return patient_path('alerts.json')


def _patient_id_for_request():
    session = g.get('auth_session')
    if not session:
        return None
    if session['kind'] == 'patient_device':
        return g.active_patient['id'] if g.get('active_patient') else None
    user = auth.session_user()
    if session['kind'] == 'caregiver' and g.get('active_patient'):
        return g.active_patient['id']
    if auth.patient_account(user):
        return g.active_patient['id'] if g.get('active_patient') else user['patient_id']
    return None


def _caregiver():
    session = g.get('auth_session')
    user = auth.session_user()
    return bool(session and session['kind'] == 'caregiver' and user and user['role'] == 'caregiver')


import hashlib


def _session_hash(session_id):
    if not session_id:
        return None
    return hashlib.sha256(session_id.encode('utf-8')).hexdigest()


def _redact_private(row):
    return {key: value for key, value in row.items() if not key.startswith('_')}


def _send_alert_emails(patient_id, row):
    members = db.fetchall(
        "SELECT DISTINCT u.email FROM users u JOIN patient_members m ON m.user_id=u.id "
        "WHERE m.patient_id=? AND u.role='caregiver' AND u.email<>''",
        (patient_id,),
    )
    for member in members:
        try:
            mailer.send_alert(member['email'], g.active_patient['name'], row['createdAt'],
                              row['deviceLabel'], row.get('location'))
        except mailer.DeliveryError:
            # Alert creation is independent of SMTP availability.
            continue


def _create_alert(test=False, location=None, request_key=None):
    session = g.auth_session
    patient_id = _patient_id_for_request()
    if not patient_id:
        raise NoActivePatient
    path = _alert_file(patient_id)
    now = _now()
    session_hash = _session_hash(session['id'])
    with _lock(path):
        rows, changed = _clean(_read(path), now)
        # Idempotency check: repeated request_key from same session within 10 minutes returns same alert
        if request_key and isinstance(request_key, str):
            for row in rows:
                if row.get('_ownerHash') == session_hash and row.get('_requestKey') == request_key:
                    created = _parse(row.get('createdAt'))
                    if created and created > now - timedelta(minutes=10):
                        if changed:
                            _save(path, rows)
                        return _redact_private(row), None, 200

        recent = [row for row in rows if (row.get('_ownerHash') == session_hash or row.get('_sessionId') == session['id'])
                  and (created := _parse(row.get('createdAt'))) and created > now - RATE_WINDOW]
        latest = max(recent, key=lambda row: row['createdAt'], default=None)
        if latest:
            created = _parse(latest['createdAt'])
            if latest.get('status') == 'open' and created > now - COOLDOWN:
                if changed:
                    _save(path, rows)
                return _redact_private(latest), None, 200
            if created > now - COOLDOWN:
                if changed:
                    _save(path, rows)
                return None, (jsonify(error='Please wait before sending another alert.'), 429), 429

        email_skipped = bool(test) or len(recent) >= RATE_LIMIT
        created_at = now.isoformat(timespec='seconds').replace('+00:00', 'Z')
        row = {
            'id': uuid.uuid4().hex,
            'createdAt': created_at,
            'deviceLabel': session.get('label') or 'Patient device',
            'test': bool(test),
            'status': 'open',
            '_ownerHash': session_hash,
        }
        if email_skipped and not test:
            row['emailSkipped'] = True
        if request_key and isinstance(request_key, str):
            row['_requestKey'] = request_key
        if location is not None:
            row['location'] = location
        rows.append(row)
        _save(path, rows)

    if not email_skipped:
        _send_alert_emails(patient_id, row)
    return _redact_private(row), None, 201


@bp.post('/sos')
def create_alert():
    if not g.get('active_patient'):
        raise NoActivePatient
    session = g.get('auth_session')
    user = auth.session_user()
    if not session or not (session['kind'] == 'patient_device' or auth.patient_account(user)):
        return jsonify(error='Only a patient device or patient login can send an alert.'), 403
    data = request.get_json(silent=True)
    data = data if isinstance(data, dict) else {}
    location = data.get('location')
    if location is not None:
        if not isinstance(location, dict):
            return jsonify(error='Location is invalid.'), 400
        lat, lng, accuracy = location.get('lat'), location.get('lng'), location.get('accuracy')
        if (isinstance(lat, bool) or not isinstance(lat, (float, int)) or not -90 <= lat <= 90
                or isinstance(lng, bool) or not isinstance(lng, (float, int)) or not -180 <= lng <= 180
                or accuracy is not None and (isinstance(accuracy, bool) or not isinstance(accuracy, (float, int)) or not 0 <= accuracy <= 100000)):
            return jsonify(error='Location is invalid.'), 400
        location = {'lat': lat, 'lng': lng}
        if accuracy is not None:
            location['accuracy'] = accuracy
    request_key = data.get('requestKey')
    if request_key is not None and not isinstance(request_key, str):
        return jsonify(error='Invalid request key.'), 400
    row, error, status = _create_alert(location=location, request_key=request_key)
    return error or (jsonify(row), status)


@bp.route('/sos/alerts/<alert_id>/location', methods=['PATCH', 'POST'])
def attach_location(alert_id):
    if not g.get('active_patient'):
        raise NoActivePatient
    session = g.get('auth_session')
    user = auth.session_user()
    if not session or not (session['kind'] == 'patient_device' or auth.patient_account(user)):
        return jsonify(error='Only a patient device or patient login can update alert location.'), 403

    patient_id = _patient_id_for_request()
    if not patient_id:
        raise NoActivePatient
    path = _alert_file(patient_id)

    now = _now()
    session_hash = _session_hash(session['id'])

    with _lock(path):
        rows, changed = _clean(_read(path), now)
        target = None
        for row in rows:
            if row.get('id') == alert_id:
                target = row
                break

        if not target:
            if changed:
                _save(path, rows)
            return jsonify(error='Alert not found.'), 404

        # Check alert ownership first: non-owner must not change _patchAttempts
        owner_hash = target.get('_ownerHash')
        if not owner_hash:
            if changed:
                _save(path, rows)
            return jsonify(error='Alert has no owner hash or was created by another session.'), 403

        if owner_hash != session_hash:
            if changed:
                _save(path, rows)
            return jsonify(error='You do not own this alert.'), 403

        # Rate limit to 3 requests per alert (counted only for the owner)
        patch_attempts = target.get('_patchAttempts', 0)
        if patch_attempts >= 3:
            if changed:
                _save(path, rows)
            return jsonify(error='Too many location update requests for this alert.'), 429

        # Increment _patchAttempts and save at once before validating body
        target['_patchAttempts'] = patch_attempts + 1
        _save(path, rows)

        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error='Location data is required.'), 400
        location = data.get('location')
        if not isinstance(location, dict):
            return jsonify(error='Location is invalid.'), 400
        lat, lng, accuracy = location.get('lat'), location.get('lng'), location.get('accuracy')
        if (isinstance(lat, bool) or not isinstance(lat, (float, int)) or not -90 <= lat <= 90
                or isinstance(lng, bool) or not isinstance(lng, (float, int)) or not -180 <= lng <= 180
                or accuracy is None or isinstance(accuracy, bool) or not isinstance(accuracy, (float, int)) or not 0 <= accuracy <= 100000):
            return jsonify(error='Location is invalid.'), 400

        # Exactly one successful patch per alert; a second returns 400
        if target.get('location') is not None:
            return jsonify(error='Location is already set for this alert.'), 400

        # Only within 2 minutes of alert creation
        created = _parse(target.get('createdAt'))
        if not created or created < now - timedelta(minutes=2):
            return jsonify(error='Location update window has expired.'), 400

        loc_obj = {'lat': lat, 'lng': lng, 'accuracy': accuracy}
        target['location'] = loc_obj
        _save(path, rows)

    # Sends no email
    return jsonify(_redact_private(target)), 200


@bp.get('/sos/alerts')
def list_alerts():
    if not _caregiver():
        return jsonify(error='Caregiver access is required.'), 403
    if not g.get('active_patient'):
        raise NoActivePatient
    status = request.args.get('status', 'open')
    if status not in ('open', 'handled', 'all'):
        return jsonify(error='Status is invalid.'), 400
    rows = []
    for patient in auth.patients_for(g.auth_session['user_id']):
        path = str(Path(current_app.config['PATIENT_DATA_ROOT']) / patient['id'] / 'alerts.json')
        now = _now()
        with _lock(path):
            patient_rows, changed = _clean(_read(path), now)
            if changed:
                _save(path, patient_rows)
        for row in patient_rows:
            if status == 'all' or row.get('status') == status:
                rows.append({**_redact_private(row), 'patientId': patient['id'], 'patientName': patient['name']})
    rows.sort(key=lambda row: row.get('createdAt', ''), reverse=True)
    return jsonify(rows)


@bp.post('/sos/alerts/<alert_id>/handled')
def mark_handled(alert_id):
    if not _caregiver():
        return jsonify(error='Caregiver access is required.'), 403
    if not g.get('active_patient'):
        raise NoActivePatient
    for patient in auth.patients_for(g.auth_session['user_id']):
        path = str(Path(current_app.config['PATIENT_DATA_ROOT']) / patient['id'] / 'alerts.json')
        with _lock(path):
            rows = _read(path)
            for row in rows:
                if row.get('id') == alert_id:
                    row.update(status='handled', handledBy=g.auth_session['user_id'],
                               handledAt=_now().isoformat(timespec='seconds').replace('+00:00', 'Z'))
                    _save(path, rows)
                    return jsonify(_redact_private(row))
    return jsonify(error='Alert not found.'), 404


@bp.post('/sos/test')
def create_test_alert():
    if not _caregiver():
        return jsonify(error='Caregiver access is required.'), 403
    # A caregiver can test alerts for the patient selected in their session.
    if not g.get('active_patient'):
        raise NoActivePatient
    # Demo test messages stay local and never reach caregivers by email.
    row, error, status = _create_alert(test=True)
    return error or (jsonify(row), status)


def sweep_alerts_on_startup(data_root):
    """Clean location and alert retention on startup across patient alerts.json files."""
    import logging
    logger = logging.getLogger(__name__)
    root = Path(data_root)
    if not root.is_dir():
        return
    now = _now()
    for path in root.glob('*/alerts.json'):
        if not path.is_file():
            continue
        try:
            with _lock(str(path)):
                try:
                    content = path.read_text(encoding='utf-8')
                    rows = json.loads(content)
                    if not isinstance(rows, list):
                        rows = []
                except (OSError, ValueError, TypeError) as err:
                    logger.warning("Could not sweep alert file %s: %s", path.name, err.__class__.__name__)
                    continue
                rows, changed = _clean(rows, now)
                if changed:
                    _save(str(path), rows)
        except Exception as err:
            logger.warning("Could not sweep alert file %s: %s", path.name, err.__class__.__name__)
