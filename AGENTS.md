# CogniConnect – agent instructions

Dementia memory-support platform (SIH26003, MDoNER). Flask backend in /backend (port 5000), Next.js 14 frontend in /frontend (port 3000). Windows + PowerShell. `npm run dev` in the root starts both.

## Facts
- Flask object in backend/app.py is named `api`, not `app`.
- Backend Python: use backend\.venv\Scripts\python.exe (system python lacks packages).
- Games: frontend/components/games/<id>/ using _shared/GameShell + saveScore. Registry: components/games/registry.ts, mirrored in backend/games.json. Each game has ONE level (1 Easy, 2 Medium, 3 Hard) and one area.
- 4 areas: Memory, Attention, Executive Function, Recognition & Orientation.
- Daily plan: build_daily_plan() in backend/cognitive_reports.py, used by GET /daily-plan and the reports. Level 1 = Daily Recall ("My Day") + 1 easy game; levels 2 and 3 = 2 games each.
- Scores: POST /performance {date, game_id, level, skill, score 0-100}. Daily Recall saves game_id "daily_recall" with breakdown activity1/2/3.
- Dates: local "yyyy-MM-dd"; normalise with dayKey/toEntries from frontend/lib/progress.ts. Never toISOString().
- Two modes: patient (elderly user: big text, no jargon, no dates, no level/area names) and caregiver (PIN-locked).
- Shared tile component: frontend/components/dashboardCard.tsx. Sidebar shell: frontend/components/nav.tsx. Patient stats: frontend/lib/stats.ts.

## Rules
- Read files before editing; minimal edits; keep existing logic and routes.
- Don't run `npm run build` or start another dev server while `npm run dev` runs.
- Checks: `npx tsc --noEmit`, `node lib/progress.check.mjs`, `node lib/self-progress.check.mjs`, `node lib/word-association.check.mjs`, `node lib/whack-a-mole.check.mjs`, `node lib/pill-box-planner.check.mjs`, `node lib/video-upload.check.mjs`, `node lib/explore.check.mjs`, `node lib/people-self.check.mjs`, `node lib/games-self.check.mjs`, `node lib/nav.check.mjs`, `node lib/routine-self.check.mjs`, `node lib/auth.check.mjs`, `node lib/interaction/locales.check.mjs`, `node lib/interaction/adaptive.check.mjs`, `node lib/interaction/matching.check.mjs`, `node lib/interaction/yesterday-quiz.check.mjs`, `node lib/places.check.mjs`, `node lib/caregiver-silence.check.mjs`, `node lib/sos.check.mjs`, `node lib/sos-voice.check.mjs`, `node components/games/plan-the-day/routine.check.mjs`, `node components/games/story-builder/memory.check.mjs`, and `node components/games/map-navigator/scenarios.check.mjs` (in frontend); `.venv\Scripts\python.exe -m unittest discover tests` and `.venv\Scripts\python.exe -c "import app"` (in backend).
- Add feature checks to the frontend list above; Caregiver Silence is checked by `node lib/caregiver-silence.check.mjs`, SOS is checked by `node lib/sos.check.mjs`, SOS Voice by `node lib/sos-voice.check.mjs`, Plan the Day by `node components/games/plan-the-day/routine.check.mjs`, Story Builder by `node components/games/story-builder/memory.check.mjs`, and Map Navigator by `node components/games/map-navigator/scenarios.check.mjs`.
- Open JSON files with encoding="utf-8".
- Show the real git diff and commit after each part.
