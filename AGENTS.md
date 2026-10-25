# CogniConnect: agent instructions

Dementia memory-support platform (SIH26003, MDoNER). Flask backend in /backend (port 5000), Next.js 14 frontend in /frontend (port 3000). Windows and PowerShell. `npm run dev` in the repo root starts both. Build plan: docs/PLAN.md. Login and modes: docs/AUTH_FLOWS.md.

## Facts

- The Flask object in backend/app.py is named `api`, not `app`.
- Backend Python: use `backend\.venv\Scripts\python.exe` (from inside backend: `.venv\Scripts\python.exe`). System python lacks packages.
- Account types: self, caregiver (member of a patient), patient-login, patient-device (paired). The server decides role and patient from the session. Use the helpers self_account, is_caregiver and authorized_patient in backend/auth.py. Never trust a patient id from the request.
- Per-patient data lives in backend/data/<patient_id>/ (people, memories, routine, adaptive, preferences and so on). Do not write patient data to the backend root.
- Games: frontend/components/games/<game-id>/ using _shared/GameShell and saveScore. Registry: components/games/registry.ts, mirrored in backend/games.json, backend/cognitive_reports.py GAME_REGISTRY and frontend/lib/progress.ts GAME_AREA. Each game has one level (1 Easy, 2 Medium, 3 Hard) and one area.
- Four areas: Memory, Attention, Executive Function, Recognition & Orientation.
- Adaptive difficulty: read the knob once at session start with readSkill("<game-id>"). Knob 1 to 4, knob 2 is today's behaviour. Log answers with useAnswerLog.
- Daily plan: build_daily_plan() in backend/cognitive_reports.py, used by GET /daily-plan and the reports.
- Scores: POST /performance {date, game_id, level, skill, score 0-100, difficulty}. Daily Recall saves game_id "daily_recall".
- Dates are local "yyyy-MM-dd". Normalise with dayKey and toEntries from frontend/lib/progress.ts. Never use toISOString().
- Patient-facing screens: large text (at least 16px), targets of at least 56px, no jargon, no raw scores, no level or area names, friendly dates ("Today"), no red on wrong answers, no shaking.
- Translations: frontend/lib/interaction/locales/hi.json and as.json (the "ui" block). Add each new phrase to the required list in frontend/lib/interaction/locales.check.mjs.
- Shared UI: components/dashboardCard.tsx, components/nav.tsx (navFor), lib/stats.ts.
- Dev and demo flags are off by default. Never commit .env files or auth.db.

## Rules

- Read files before editing. Make minimal edits. Keep existing logic and routes. No new dependencies.
- Do not run `npm run build` or start another dev server while `npm run dev` runs.
- Tests never call OpenAI or the network. The test setup blocks both.
- Never print environment values. Test keys with bool() only.
- Git: one branch per phase. Never push main. Do not run git checkout, restore, reset or clean on files you did not create. Do not touch the existing stash. Do not amend pushed commits.
- Open JSON files with encoding="utf-8".
- Show the real git diff and commit after each part. Stop after each commit.

## Checks (run after every commit)

Frontend, from frontend/:
- `npx.cmd tsc --noEmit`
- Every check script: `foreach ($f in Get-ChildItem lib -Recurse -Filter *.check.mjs) { node $f.FullName; if ($LASTEXITCODE -ne 0) { break } }`

Backend, from backend/:
- `.venv\Scripts\python.exe -c "import app"`
- `.venv\Scripts\python.exe -m unittest discover tests`

Report the test total and the new locale phrase count.
