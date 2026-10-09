# Sample runtime data

The backend keeps its data in these JSON files in `backend/`. They are not in git.
The backend creates each one empty on startup if it is missing (`people.json` is
filled from the photos in `known_faces/` on first use), so you normally don't need these.

To reset a file, copy the empty example over it, e.g. `copy sample_data\routines.json routines.json`.

| File | Holds |
|---|---|
| `people.json` | People: `[{id, name, relation, phone, photo}]` |
| `performance_data.json` | Scores: `scores` (Daily Recall), `game_scores` (games) |
| `video_journals.json` | Journal entry and date for each uploaded video |
| `qas.json` | Quiz questions generated from the videos |
| `routines.json` | The caregiver's routine steps for Plan the Day |
| `settings.json` | Caregiver PIN (default `1234`) and the patient's name for the report |
