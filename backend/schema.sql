CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'caregiver' CHECK(role IN ('caregiver','patient','self')),
  patient_id TEXT REFERENCES patients(id),
  otp_target TEXT NOT NULL DEFAULT 'caregiver' CHECK(otp_target IN ('caregiver','patient'))
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patient_members (
  patient_id TEXT REFERENCES patients(id),
  user_id TEXT REFERENCES users(id),
  role TEXT CHECK(role IN ('owner','caregiver')),
  PRIMARY KEY (patient_id, user_id)
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  kind TEXT NOT NULL CHECK(kind IN ('device','caregiver')),
  created_by TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pairing_attempts (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('caregiver','patient_device')),
  user_id TEXT REFERENCES users(id),
  patient_id TEXT REFERENCES patients(id),
  device_label TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  elevated_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('login','reset')),
  code_hash TEXT NOT NULL,
  challenge_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trusted_devices (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS installation (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
