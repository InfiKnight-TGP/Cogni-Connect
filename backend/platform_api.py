"""Authenticated, patient-scoped storage for the new support workspace.

The legacy single-patient API is deliberately not made multi-tenant by this module.
SQLite supplies transactions and unique IDs for idempotent offline uploads.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import sqlite3
import time
from contextlib import contextmanager
from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

platform = Blueprint("platform", __name__, url_prefix="/platform")
KINDS = {"preference", "default", "event", "journal", "reminder", "adherence", "sos", "message", "reply", "consent", "location", "place", "mood"}
CAREGIVER_ONLY = {"default", "reminder", "message", "consent"}


@contextmanager
def connect():
    path = Path(current_app.config.get("PLATFORM_DB", "platform-data/platform.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript("""
      CREATE TABLE IF NOT EXISTS accounts(username TEXT PRIMARY KEY, password TEXT NOT NULL, role TEXT NOT NULL, patient TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, username TEXT NOT NULL, expires REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS records(patient TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, updated REAL NOT NULL, body TEXT NOT NULL, PRIMARY KEY(patient,id));
      CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until REAL NOT NULL);
    """)
    try:
        with db:
            yield db
    finally:
        db.close()


def body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError("A JSON object is required")
    return value


@platform.errorhandler(ValueError)
def invalid(error):
    return jsonify(error=str(error)), 400


@platform.before_request
def authorize():
    if request.method == "OPTIONS":
        return None
    if request.content_length and request.content_length > 2_000_000:
        return jsonify(error="Request is too large"), 413
    # Custom header blocks cross-site form CSRF; deploy through the same-origin Next rewrite.
    if request.method != "GET" and request.headers.get("X-Cogni-Request") != "1":
        return jsonify(error="Request header required"), 403
    if request.path in {"/platform/auth/setup", "/platform/auth/login"}:
        return None
    token = request.cookies.get("cogni_session", "")
    with connect() as db:
        account = db.execute("SELECT a.* FROM sessions s JOIN accounts a ON a.username=s.username WHERE s.token=? AND s.expires>?", (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
    if not account:
        return jsonify(error="Please sign in"), 401
    g.account = dict(account)


def credentials(value, prefix=""):
    username, password = value.get(prefix + "username"), value.get(prefix + "password")
    if not isinstance(username, str) or not 3 <= len(username.strip()) <= 60:
        raise ValueError("Usernames must contain 3–60 characters")
    if not isinstance(password, str) or not 12 <= len(password) <= 200:
        raise ValueError("Passwords must contain 12–200 characters")
    return username.strip().lower(), password


@platform.post("/auth/setup")
def setup():
    value = body()
    caregiver, caregiver_password = credentials(value)
    patient_name, patient_password = credentials(value, "patient_")
    if caregiver == patient_name:
        raise ValueError("Use separate patient and caregiver usernames")
    patient = secrets.token_hex(16)
    try:
        with connect() as db:
            db.executemany("INSERT INTO accounts VALUES(?,?,?,?)", [
                (caregiver, generate_password_hash(caregiver_password), "caregiver", patient),
                (patient_name, generate_password_hash(patient_password), "patient", patient),
            ])
    except sqlite3.IntegrityError:
        return jsonify(error="Choose different usernames"), 409
    return jsonify(ok=True), 201


@platform.post("/auth/login")
def login():
    value = body()
    username, password = credentials(value)
    attempt_key = hashlib.sha256(f"{request.remote_addr}:{username}".encode()).hexdigest()
    with connect() as db:
        attempt = db.execute("SELECT * FROM attempts WHERE key=?", (attempt_key,)).fetchone()
        if attempt and attempt["count"] >= 8 and attempt["until"] > time.time():
            return jsonify(error="Please wait a few minutes before trying again"), 429
        account = db.execute("SELECT * FROM accounts WHERE username=?", (username,)).fetchone()
        if not account or not check_password_hash(account["password"], password):
            count = attempt["count"] + 1 if attempt and attempt["until"] > time.time() else 1
            db.execute("INSERT OR REPLACE INTO attempts VALUES(?,?,?)", (attempt_key, count, time.time() + 300))
            return jsonify(error="Username or password was not accepted"), 403
        db.execute("DELETE FROM attempts WHERE key=?", (attempt_key,))
        token = secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
        db.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), username, time.time() + 12 * 3600))
    response = jsonify(username=username, role=account["role"], patient=account["patient"])
    response.set_cookie("cogni_session", token, httponly=True, samesite="Strict", secure=current_app.config.get("PLATFORM_SECURE_COOKIE", False), max_age=12 * 3600, path="/")
    return response


@platform.get("/auth/me")
def me():
    return jsonify({key: g.account[key] for key in ("username", "role", "patient")})


@platform.post("/auth/logout")
def logout():
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token=?", (hashlib.sha256(request.cookies.get("cogni_session", "").encode()).hexdigest(),))
    response = jsonify(ok=True)
    response.delete_cookie("cogni_session", path="/")
    return response


def validate_record(row):
    if not isinstance(row, dict) or set(row) != {"id", "kind", "updatedAt", "data"}:
        raise ValueError("Each record needs id, kind, updatedAt and data")
    if not isinstance(row["id"], str) or not 1 <= len(row["id"]) <= 100 or not isinstance(row["kind"], str) or row["kind"] not in KINDS:
        raise ValueError("Invalid record identity")
    timestamp = row["updatedAt"]
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or not 0 < timestamp <= time.time() * 1000 + 300_000:
        raise ValueError("Invalid update timestamp")
    if not isinstance(row["data"], dict) or len(json.dumps(row["data"])) > 100_000:
        raise ValueError("Record data must be an object smaller than 100 KB")


@platform.route("/records", methods=["GET", "POST"])
def records():
    patient = g.account["patient"]
    with connect() as db:
        if request.method == "POST":
            rows = body().get("records")
            if not isinstance(rows, list) or len(rows) > 100:
                raise ValueError("Send at most 100 records")
            for row in rows:
                validate_record(row)
                if row["kind"] in CAREGIVER_ONLY and g.account["role"] != "caregiver":
                    return jsonify(error="Caregiver access required"), 403
                existing = db.execute("SELECT kind FROM records WHERE patient=? AND id=?", (patient, row["id"])).fetchone()
                if existing and existing["kind"] != row["kind"]:
                    raise ValueError("A record's kind cannot change")
                if row["kind"] == "location":
                    consent = db.execute("SELECT body FROM records WHERE patient=? AND id='location-consent' AND kind='consent'", (patient,)).fetchone()
                    if not consent or not json.loads(consent["body"]).get("sync"):
                        return jsonify(error="Caregiver location sync consent required"), 403
            for row in rows:
                db.execute("INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(patient,id) DO UPDATE SET updated=excluded.updated, body=excluded.body WHERE excluded.updated>records.updated", (patient, row["id"], row["kind"], row["updatedAt"], json.dumps(row["data"], ensure_ascii=False)))
        rows = db.execute("SELECT * FROM records WHERE patient=? ORDER BY updated,id", (patient,)).fetchall()
    return jsonify(records=[{"id": row["id"], "kind": row["kind"], "updatedAt": row["updated"], "data": json.loads(row["body"])} for row in rows])


def register_platform(api):
    api.config.setdefault("PLATFORM_SECURE_COOKIE", os.getenv("PLATFORM_SECURE_COOKIE") == "1")
    api.register_blueprint(platform)
