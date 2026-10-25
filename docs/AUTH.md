# Accounts and patient pairing — backend step 1

This commit adds authentication while application JSON/media still remain global.
Per-patient storage and the frontend login/pairing screens are the next two steps.
Do not deploy this intermediate commit as a multi-patient service: membership checks
protect patient/account administration, but application data is not yet isolated.
The existing frontend will receive 401 responses until its authentication work is done.

## Configuration

Copy the authentication variables from `backend/.env.example` into the local `.env`.
`SMTP_USER` is the Gmail address; `SMTP_PASS` is its app password. With SMTP absent,
codes are logged only when `COGNI_DEV_OTP=1`. Without either option, code delivery
fails with a generic 503 and the authentication transaction rolls back.

`COGNI_ORIGINS` is a comma-separated list of exact frontend origins. Hosted deployments
need HTTPS and `COGNI_COOKIE_SECURE=1`. CORS supports credentials; the frontend must
send `credentials: "include"`. Mutations reject disallowed/null Origin headers.
Non-browser clients without Origin are allowed; cross-site Fetch Metadata without
Origin is rejected. IP limits use the direct peer address, never an untrusted
forwarding header. Rate limits are process-local: this version assumes one server
process. Configure a trusted proxy and shared limiter before scaling to workers.

The database is `backend/auth.db` (including its sidecar files, ignored by Git).
The schema adds opaque IDs for revocable sessions and OTP challenges, plus a
`trusted_devices` table for hashed, expiring trusted-device tokens. Passwords and
PINs use Werkzeug scrypt. Session, pairing, trust and email-code secrets are stored
as SHA-256 hashes. Codes are consumed transactionally to prevent double redemption.

## Account contract

- `POST /auth/signup`: `{email, name, password}`. Password length 8–1024.
  Returns 202 `{ok, requiresCode, challenge}`. Existing emails receive the same
  response shape with an unusable challenge. No session is issued before verification.
- `POST /auth/login`: `{email, password}`. Returns 202 `{requiresCode, challenge}`
  unless a valid trusted-device cookie allows a 200 session response.
- `POST /auth/otp/verify`: `{challenge, code}`. The challenge binds verification to
  the preceding password check/signup; six-digit codes expire after five minutes.
- `POST /auth/otp/resend`: `{challenge}`. Returns a replacement challenge and
  invalidates the old code/challenge. Expired/exhausted challenges require a new login.
- `POST /auth/forgot`: `{email}` returns 202 `{ok, challenge}` for known and unknown
  accounts. `POST /auth/reset`: `{challenge, code, password}` revokes that user's
  caregiver sessions, trusted devices and outstanding challenges.
- `POST /auth/password`: `{current_password, password}` requires a caregiver account,
  revokes old account sessions/trust and creates fresh credentials for this browser.
- `POST /auth/logout`: revokes the active session and clears its cookie. Device trust
  remains for the next password login until it expires or a password reset/change.
- `GET /auth/me`: `{role, user, patients, activePatient, elevated}`. Role is
  `caregiver` or `patient_device`; elevation is a separate server-checked flag.
- `POST /auth/demo`: only available with `COGNI_DEMO=true`; creates a demo account
  and patient. It does not claim the legacy patient. Demo remains disabled by default.

Cookies `cogni_session` (30-day sliding) and `cogni_device` (90-day sliding) coexist.
The caregiver cookie takes precedence, including score-write rejection. Logout of
that account leaves an existing paired device intact. `cogni_trusted` lasts 30 days
and never bypasses the password. All authentication cookies are HttpOnly, SameSite=Lax
and optionally Secure. Responses are marked no-store.

## Patients and pairing

The first verified caregiver claims the first patient, using the existing
`patient_name` (or “My patient”) and migrated PIN hash. Complete this initial setup
on the controlled installation before making it publicly reachable. Importing the
Flask module no longer creates/migrates live data; authenticated requests initialize
missing stores, while verification initializes legacy settings if needed.

- `GET /patients` returns `{patients: [{id, name, role}]}` for the caregiver account.
  `POST /patients {name}` creates a patient owned by it.
- `POST /patients/<id>/pin {new_pin, current_pin?}` sets a four-digit PIN; the current
  PIN is required when one exists. Changing a PIN clears device elevation for that
  patient. `/caregiver/change-pin` remains an alias for the active patient.
- `POST /pair/create {patient_id}` returns 201 `{code, expiresAt}` with a single-use,
  24-hour device code. `POST /pair/invite {patient_id}` returns a distinct 48-hour
  caregiver invitation. Codes contain eight characters displayed as `ABCD-EFGH`.
- `POST /pair/redeem {code, device_label?}` is public and returns `{ok, patientName}`
  plus a device cookie. Five incorrect redemptions lock that IP for 15 minutes from
  the fifth failure. Device and caregiver codes cannot be interchanged.
- `POST /pair/join {code}` requires a caregiver account and adds membership.
- `GET /pair/devices?patient_id=...` returns `{devices}` including opaque IDs,
  labels and timestamps, never session hashes. `DELETE /pair/devices/<id>` immediately
  revokes that device session. All management checks patient membership; elevated
  devices may manage only their own patient.
- `POST /caregiver/unlock {pin}` requires a paired device and sets 30-minute elevation.
  `POST /caregiver/lock` clears it. PIN attempts are rate limited.

Patient devices always resolve to their paired patient. Caregiver accounts select
with the `cogni_patient` header or cookie (header wins), validated against membership.
Without a selection, the first linked patient is used. An invalid selection is 403
for patient-scoped reads and `/auth/me`; it cannot block account recovery or logout.
Successful account login and logout clear any stale selection cookie.

## Existing endpoint protection

All existing application routes require a valid session, including JSON reads,
accuracy, speech, generated questions, daily plans, crossword, photos and video media.
Uploads, people mutations, score deletion, reports, settings/routine writes and
processing status require a caregiver account or elevated device. Unauthenticated
requests return 401; authenticated requests lacking permission return 403.

`POST /performance` accepts only an unelevated patient-device session. Its `source`
is set to `patient` by the server regardless of the client field. Caregiver accounts
and elevated devices receive 403, including when both session cookies are present.

## Verification

From `backend`:

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -t .
.venv\Scripts\python.exe -m unittest tests/test_cognitive_reports.py
.venv\Scripts\python.exe -c "import app"
```

Tests use temporary SQLite databases and data directories, real session resolution,
mocked mail delivery, and controlled clocks. They include concurrent redemption,
OTP expiry/reuse/exhaustion, pairing expiry/lockout, PIN elevation, password/session
revocation, membership, every existing route's anonymous protection, and CORS.
