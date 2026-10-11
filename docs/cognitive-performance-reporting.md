# Cognitive performance reporting

## Activity registry and domains

The backend registry in `backend/cognitive_reports.py` is the source of truth for score validation and aggregation. `frontend/lib/games.ts` mirrors it for the activity picker. Keep IDs, playable status, routes, domain assignments, and metric names aligned when adding an activity. `/reports/registry` exposes the backend registry.

Only implemented and playable activities accept completed results. Current activities are Story Builder, Mole Path, Attention Hunt, Facial Recognition, Name Recall, and Personal Memory Questions. My Day Recall, Sequence Memory, and Pattern Switch are registered as planned and are not scoreable yet.

Memory and Recognition and Orientation are separate dimensions. Open response and sequence recall tasks contribute to Memory. Familiar-person selection and name-to-face matching contribute to Recognition and Orientation. My Day Recall can involve either or both: its future task modes specify `free_recall` as Memory, `familiar_choice` as Recognition and Orientation, and `mixed_recall_and_recognition` as an equal contribution to both. A result must use the mode actually played; the same score must not be copied to both domains by default.

## Scores and reports

Results are accepted only when `completed` is true, the activity is playable, the session ID is a UUID, and the score is between 0 and 100. Accuracy is a fraction from 0 to 1. Counts and durations are nonnegative integers. A missing or unfinished activity does not become a zero score.

The session report uses the latest completed result for each distinct activity in that session. Within each domain, distinct activities have equal weight, except when an activity explicitly identifies a task mode with domain weights. The overall observed score is the equal-weight average of the latest results for distinct activities. These are descriptive task scores, not clinical measurements or a diagnosis.

`performance_data.json` is a versioned JSON store. Writes use a process lock and atomic file replacement to avoid lost concurrent updates or partially written files. Legacy records without game and session IDs remain available in `/performance`, but are excluded from domain reports because their activity and domain cannot be established reliably. The report page offers per-session history, CSV export, print, a radar chart, and an accessible text table with the same domain values.

## Future caretaker integration

Each result reserves `user_id`, `subject_id`, `caregiver_id`, and `consent_id` fields. They remain null until the application has authenticated identities, authorization rules, and consent handling. Client-supplied identity values are not trusted. The current session history is stored in the browser's local storage, and session UUIDs are not a substitute for authorization. Before deploying this API for multiple people or on a public network, enforce authenticated access and verify that the requester may access the subject's records.

The versioned result shape also stores activity ID, session ID, domain weights, task mode, timestamps, difficulty, score, accuracy, and optional task metrics. Future identity integration can populate the reserved identity fields and add authorization at the API boundary without changing the score meaning or report aggregation rules.
