# Cogni-Connect

Dementia memory-support platform (SIH26003). Flask backend in /backend (port 5000), Next.js 14 frontend in /frontend (port 3000). Windows. `npm run dev` in the root starts both.

## Facts
- The Flask object in backend/app.py is named `api`, not `app`.
- Games live in frontend/components/games/<id>/ and use _shared/GameShell + saveScore. Registry: components/games/registry.ts, mirrored in backend/games.json.
- Each game belongs to ONE level only. Level 1 = Daily Recall (always) + 1 random easy game; Level 2 = 2 random; Level 3 = 2 random. /daily-plan picks them seeded by date.
- Scores: POST /performance with {date, game_id, level, skill, score 0-100}. The Daily Recall quiz saves {score, breakdown} without game_id/skill.
- Dates are local "yyyy-MM-dd" strings (IST), never toISOString().
- Users: elderly people with dementia (patient) and caregivers. Patient screens: big text and buttons, no jargon, no dates, no timers.

## Rules
- Read files before editing; make minimal edits; don't rewrite working games.
- Don't run `npm run build` or start another dev server while `npm run dev` is running. Check with `npx tsc --noEmit` (frontend) and `.venv\Scripts\python -c "import app"` (backend).
- Open JSON files with encoding="utf-8".
- Commit after each phase with a clear message.