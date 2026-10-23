# Authentication and Home flows

This document describes the code currently in the repository. Each implementation claim includes a source file and function. Statements that cannot be established from code are marked **NOT VERIFIED**.

## Contents

1. [Pages](#pages)
2. [Backend endpoints](#backend-endpoints)
3. [Environment matrix](#environment-matrix)
4. [Account flows](#account-flows)
5. [Flowcharts](#flowcharts)
6. [Confusing or redundant](#confusing-or-redundant)

## Pages

| Route | File | Who sees it | What it does / next route | Guard |
|---|---|---|---|---|
| `/` | `frontend/app/page.tsx` | Authenticated users | Home dashboard; caregiver sessions are redirected to `/caregiver` by `AuthProvider` | `AuthProvider` in `frontend/lib/auth-context.tsx` |
| `/welcome` | `frontend/app/welcome/page.tsx` | Public | Offers self signup, caregiver login, or patient pairing; an existing session gets a Continue link | `PUBLIC_ROUTES` and `AuthProvider` |
| `/login` | `frontend/app/login/page.tsx`, `components/auth/account-form.tsx` | Public | Email/password login; OTP challenge goes to `/verify`; successful session goes to `/caregiver` for caregiver and `/` otherwise | `PUBLIC_ROUTES`; backend `/auth/login` |
| `/login?mode=self` | same files | Public self-care entry | Same login form with self-care title/demo card; successful self session goes to `/` | Same as `/login` |
| `/signup?mode=self` | `frontend/app/signup/page.tsx`, `components/auth/account-form.tsx` | Public | Creates a self account and owned patient; verification goes to `/verify` | `PUBLIC_ROUTES`; backend `/auth/signup` |
| `/signup` | same files | Public | Creates caregiver account; verification goes to `/verify` | Same |
| `/verify` | `frontend/app/verify/page.tsx`, `components/auth/account-form.tsx` | Public after signup/login | Sends `challenge` and six-digit `code` to `/auth/otp/verify`; success goes Home or caregiver Home | `PUBLIC_ROUTES`; challenge is in `sessionStorage` |
| `/forgot` | `frontend/app/forgot/page.tsx`, `components/auth/account-form.tsx` | Public | Requests reset challenge; goes to `/reset` | `PUBLIC_ROUTES`; backend `/auth/forgot` |
| `/reset` | `frontend/app/reset/page.tsx`, `components/auth/account-form.tsx` | Public with challenge | Verifies reset code and password; returns to `/login?reset=done` | `PUBLIC_ROUTES`; backend `/auth/reset` |
| `/pair` | `frontend/app/pair/page.tsx` | Public | Redeems a device code; successful device session opens Home | `PUBLIC_ROUTES`; backend `/pair/redeem` |
| `/setup` | `frontend/app/setup/page.tsx` | Authenticated setup users | Legacy patient setup screen | `AuthProvider`; **NOT VERIFIED** whether any current redirect still targets it |
| `/settings` | `frontend/app/settings/page.tsx` | Authenticated patient/self users | Patient preferences; self users see account and family sharing | `AuthProvider` |
| `/caregiver` | `frontend/app/caregiver/page.tsx` | Caregiver sessions | Caregiver overview | `AuthProvider` plus caregiver page behavior |
| `/caregiver/settings` | `frontend/app/caregiver/settings/page.tsx` | Caregiver sessions | Patients, devices, PIN and account controls | `CaregiverOnly`/caregiver UI; **NOT VERIFIED** exact wrapper without rendering |
| `/progress` | `frontend/app/progress/page.tsx` | Caregiver sessions | Progress and reports | `CaregiverOnly` in page |
| `/insights` | No matching page found | **NOT VERIFIED** | No implementation found | **NOT VERIFIED** |

`AuthProvider` calls `/auth/me` on mount, on focus, and every 30 seconds (`frontend/lib/auth-context.tsx`, `refresh` and its effects). Unauthenticated non-public routes redirect to `/welcome`; caregiver sessions at `/` redirect to `/caregiver` (`AuthProvider` route effect).

## Backend endpoints

| Method | Path | Access | Function / effect | Cookies |
|---|---|---|---|---|
| POST | `/auth/signup` | public | `auth.signup`: validates email/name/password, creates caregiver or self account, issues login OTP | None until OTP verification |
| POST | `/auth/login` | public | `auth.login`: checks password, trusted device, dev shortcut, or issues OTP | Direct session or none |
| POST | `/auth/otp/verify` | public | `auth.verify`: validates login OTP and creates session/trusted device | `cogni_session`, `cogni_trusted` |
| POST | `/auth/otp/resend` | public | `auth.resend`: replaces an unexpired OTP | None |
| POST | `/auth/forgot` | public | `auth.forgot`: returns reset challenge, uniformly for unknown email | None |
| POST | `/auth/reset` | public | `auth.reset`: changes password and revokes sessions | Clears `cogni_session`, `cogni_trusted` |
| POST | `/auth/password` | `account_required` | `auth.change_password`: changes current account password | New `cogni_session`, `cogni_trusted` |
| POST | `/auth/logout` | `login_required` | `auth.logout`: deletes current session | Clears session cookie and `cogni_patient` |
| GET | `/auth/me` | `login_required` | `auth.me`: returns role, user, patients and active patient | None |
| POST | `/auth/dev/patient-device` | dev flag + loopback | `auth.dev_patient_device`: creates seeded development device session | Patient-device session cookie |
| POST | `/demo/reset` | caregiver + demo | `auth.demo_reset`: restores demo files and revokes demo sessions | None |
| POST | `/caregiver/unlock` | patient device | `auth.unlock`: PIN-elevates for caregiver functions | Session state cookie remains |
| POST | `/caregiver/lock` | login required | `auth.lock`: removes elevation | Session state cookie remains |
| POST | `/pair/create` | caregiver/self owner | `auth.pair_create`: creates device pairing code | None |
| POST | `/pair/invite` | caregiver/self owner | `auth.pair_invite`: creates caregiver invite | None |
| POST | `/pair/redeem` | public | `auth.pair_redeem`: redeems device/demo code | Patient-device session cookie |
| POST | `/pair/join` | caregiver/self | `auth.pair_join`: joins an invited patient | None; membership changes |
| GET | `/pair/devices` | caregiver | `auth.pair_devices`: lists devices | None |
| DELETE | `/pair/devices/<id>` | caregiver | `auth.unpair_device`: revokes a device | None |
| GET/POST | `/patients` | `account_required` | `auth.patients`: lists or creates patients | None |
| GET/POST/DELETE | `/patients/<id>/login` | account/owner checks | Patient-login management functions in `auth.py` | None |
| POST | `/patients/<id>/pin` | owner/caregiver checks | Sets patient PIN | None |
| GET | `/patients/<id>/members` | membership check | `auth.patient_members`: lists members | None |
| DELETE | `/patients/<id>/members/<user>` | owner only | Removes member and sessions | None |
| GET/PUT/POST | `/adaptive*` | patient or caregiver by route | Adaptive state and caregiver overrides | None |

Decorators are defined in `backend/auth.py`: `login_required`, `caregiver_required`, and `account_required`. Patient membership is checked by `authorized_patient` and route-specific checks.

## Environment matrix

### Variables

| Variable | Default | On/off behavior (source) |
|---|---|---|
| `COGNI_HOST` | `127.0.0.1` in template | Host safety checks for dev/demo (`auth.validate_dev_config`, `init_auth`) |
| `COGNI_ORIGINS` | localhost origins | CORS allowlist and dev-login safety (`auth.validate_dev_config`) |
| `COGNI_COOKIE_SECURE` | `0` | Secure session cookies when enabled (`app.py`/auth cookie helper) |
| `COGNI_DEV_OTP` | off | Development mailer behavior; exact printed-code path is in `backend/mailer.py` |
| `COGNI_DEV_LOGIN` | off | Seeds local dev accounts, skips OTP for them, enables `/auth/dev/patient-device` (`auth.dev_login_enabled`, `seed_dev_accounts`) |
| `DEV_DEMO_PASSWORD` | `demo1234` | Password for dev seeded accounts (`seed_dev_accounts`) |
| `COGNI_DEMO` | off | Seeds shared demo accounts/data and accepts demo OTP/pair code (`seed_shared_demo`, `demo_enabled`) |
| `DEMO_CAREGIVER_EMAIL/PASSWORD` | documented defaults | Shared caregiver fixture credentials (`seed_shared_demo`) |
| `DEMO_PATIENT_EMAIL/PASSWORD` | documented defaults | Shared self/patient fixture credentials (`seed_shared_demo`) |
| `DEMO_OTP` | `123456` | Fixed OTP for the two demo emails (`issue_otp`, `check_otp`) |
| `DEMO_PAIR_CODE` | `DEMA-2345` | Reusable demo pairing code (`pair_redeem`) |
| `DEMO_PIN` | `1234` | Demo patient PIN path (`unlock`) |
| `COGNI_DEMO_PUBLIC` | `0` | Allows demo requests beyond loopback (`init_auth`, `demo_request_allowed`) |
| `NEXT_PUBLIC_DEV_LOGIN` | off | Replaces `/login` with the development shortcut window (`AccountForm`) |
| `NEXT_PUBLIC_DEMO` | off | Shows demo cards on login/self signup and pair hint (`AccountForm`, `Pair`) |
| `SMTP_USER`, `SMTP_PASS` | empty in template | Email delivery configuration (`backend/mailer.py`) |
| `OPENAI_API_KEY` | template placeholder | AI features; not an auth switch |

Actual `backend/.env` and `frontend/.env.local` values are excluded from the export. Only variable names are documented here.

### Executed temporary-database matrix

Each row was run in a fresh subprocess with a temporary `AUTH_DATABASE`, loopback host and localhost origin. Results are actual status codes; OTP challenge strings are omitted.

| Mode | `/auth/login` caregiver demo | `/auth/login` demo self | `/auth/otp/verify` bogus | `/pair/redeem` `DEMA-2345` | `/auth/dev/patient-device` |
|---|---:|---:|---:|---:|---:|
| all off | 401 | 401 | 400 | 400 | 404 |
| `COGNI_DEV_OTP=1` | 401 | 401 | 400 | 400 | 404 |
| `COGNI_DEV_LOGIN=1` | 200 | 200 | 400 | 400 | 200 |
| `COGNI_DEMO=1` | 503 (email not configured) | 202 (OTP required) | 400 | 200 | 404 |
| `COGNI_DEMO=1`, `COGNI_DEV_LOGIN=1` | 200 | 200 (OTP skipped) | 400 | 200 | 200 |

The `COGNI_DEMO=1` caregiver result is 503 because that test used the dev account email, which is not a seeded shared-demo email and SMTP was not configured. This is verified by the subprocess output.

### Combination notes

| Combination | Pages/buttons/accounts/code steps | Result |
|---|---|---|
| All off | Real login/signup pages; no demo/dev buttons | Normal OTP flow for real accounts |
| Dev OTP only | Same pages; printed OTP behavior only when mailer conditions permit | No seeded dev accounts; dev route 404 |
| Dev login only | `/login` can be replaced by frontend shortcut only if `NEXT_PUBLIC_DEV_LOGIN` is also on; backend dev accounts skip OTP | Frontend/backend flags can disagree |
| Demo only | Demo card only if `NEXT_PUBLIC_DEMO=1`; demo accounts require OTP unless dev login is also on | Backend demo can be on while card is hidden |
| Demo + dev | Both shortcut systems may be visible; seeded accounts may skip OTP | Fastest local path; exposing frontend flag without backend flag creates buttons that fail |

## Account flows

### Self account

1. Fresh browser opens `/`; `AuthProvider.refresh` calls `GET /auth/me` and redirects to `/welcome` if unauthenticated (`frontend/lib/auth-context.tsx`, `refresh` and route effect).
2. `/welcome` links to `/signup?mode=self` (`frontend/app/welcome/page.tsx`).
3. Signup submits `POST /auth/signup` with `mode: self` (`AccountForm.submit`).
4. Backend creates a self user, patient and owner membership (`auth.signup`).
5. `/verify` submits `POST /auth/otp/verify`; backend sets session/trusted cookies (`auth.verify`).
6. `continueLogin` refreshes `/auth/me` and routes self sessions to `/` (`AccountForm.continueLogin`).

### Caregiver account

1. `/welcome` links to `/login`.
2. Login submits `POST /auth/login`.
3. Backend either accepts trusted device, returns an OTP challenge, or uses the dev shortcut (`auth.login`).
4. `/verify` submits `/auth/otp/verify` when required.
5. Successful caregiver session routes to `/caregiver` (`AccountForm.continueLogin`, `AuthProvider` route effect).

### Patient-login account

1. A caregiver creates it with `POST /patients/<id>/login` (`auth.create_patient_login`).
2. The patient uses the same `/login` form and `/auth/login` endpoint.
3. OTP delivery target is resolved by `otp_recipient`; verification uses `/auth/otp/verify`.
4. The resulting patient account session is represented as a patient-device session by `auth.verify`.
5. Home route is `/` (`AccountForm.continueLogin`).

### Patient-device account

1. `/welcome` links to `/pair`.
2. `/pair` submits `POST /pair/redeem` (`frontend/app/pair/page.tsx`).
3. Backend creates a patient-device session (`auth.pair_redeem`).
4. The page offers `/` and `AuthProvider` permits the authenticated patient route.

### Demo self and demo caregiver

The demo flows are the self and caregiver flows above with seeded users/data (`auth.seed_shared_demo`). The fixed OTP is accepted only for demo emails (`auth.issue_otp`/`check_otp`) and the demo pair code is accepted by `auth.pair_redeem`.

### Dev-login roles

When backend `COGNI_DEV_LOGIN=1` and loopback safety checks pass, `auth.seed_dev_accounts` creates development caregiver accounts and `auth.login` skips OTP for demo-marked dev accounts. When frontend `NEXT_PUBLIC_DEV_LOGIN=1`, `AccountForm` renders `DevLoginWindow`; its patient-device role calls `/auth/dev/patient-device` and its caregiver/owner roles call `/auth/login`.

## Flowcharts

### Overall

```mermaid
flowchart TD
  A[Fresh visit /] --> B[AuthProvider GET /auth/me]
  B -->|401| C[/welcome]
  B -->|caregiver at /| D[/caregiver]
  B -->|patient or self| E[Home /]
  C --> F{Choose path}
  F --> G[/login]
  F --> H[/signup?mode=self]
  F --> I[/pair]
  G --> J[POST /auth/login]
  H --> K[POST /auth/signup]
  J -->|requiresCode| L[/verify]
  K --> L
  L --> M[POST /auth/otp/verify]
  M --> E
  I --> N[POST /pair/redeem]
  N --> E
```

### Self

```mermaid
flowchart TD
 A[/welcome] --> B[/signup?mode=self]
 B --> C[POST /auth/signup mode=self]
 C --> D[/verify]
 D --> E[POST /auth/otp/verify]
 E --> F[GET /auth/me role=self]
 F --> G[Home /]
```

### Caregiver

```mermaid
flowchart TD
 A[/welcome] --> B[/login]
 B --> C[POST /auth/login]
 C -->|OTP| D[/verify]
 D --> E[POST /auth/otp/verify]
 C -->|trusted/dev| F[session]
 E --> F
 F --> G[/caregiver]
```

### Patient login

```mermaid
flowchart TD
 A[Caregiver creates patient login] --> B[POST /patients/id/login]
 B --> C[/login]
 C --> D[POST /auth/login]
 D --> E[/verify]
 E --> F[POST /auth/otp/verify]
 F --> G[Home /]
```

### Patient device

```mermaid
flowchart TD
 A[/welcome] --> B[/pair]
 B --> C[POST /pair/redeem]
 C --> D[patient-device session]
 D --> E[Home /]
```

### Demo and dev shortcuts

```mermaid
flowchart TD
 A[/login] --> B{NEXT_PUBLIC_DEV_LOGIN=1?}
 B -->|yes| C[DevLoginWindow]
 B -->|no| D[Email/password form]
 C --> E{Role chip}
 E -->|patient device| F[POST /auth/dev/patient-device]
 E -->|caregiver/owner| G[POST /auth/login]
 D --> H{COGNI_DEMO=1?}
 H -->|demo email| I[DEMO_OTP or dev bypass]
 H -->|other email| J[normal OTP]
```

## Confusing or redundant

- `/setup` remains in the route tree, while current self signup routes directly to Home; whether any live redirect still uses `/setup` is **NOT VERIFIED**.
- `/insights` is referenced by the requested auth inventory but no page was found; it is **NOT VERIFIED** as an active route.
- There are two shortcut systems: backend `COGNI_DEV_LOGIN` and frontend `NEXT_PUBLIC_DEV_LOGIN`. Enabling only one can show a button that the backend rejects or leave backend shortcuts invisible (`auth.init_auth`, `AccountForm`).
- `COGNI_DEMO` and `NEXT_PUBLIC_DEMO` can disagree: backend demo credentials may work while the demo card is hidden, or the card can appear while backend demo accounts are disabled.
- The normal login form and the development login window both live in `AccountForm`, so `/login` can be a materially different screen depending on a build-time frontend flag.
- `/welcome` has a Continue link for an existing session and `AuthProvider` also performs route redirects; the two navigation decisions are duplicated.
- Patient-login sessions are implemented through the same login/OTP screens as caregivers, but the backend converts the verified role into a patient-device session; this distinction is not visible on the verification screen.
- Demo OTP and development OTP are distinct mechanisms. A fixed `123456` only applies to seeded demo emails; **NOT VERIFIED** for arbitrary signup emails.
