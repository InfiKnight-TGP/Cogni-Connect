# Personal-baseline adaptation

Implementation: `frontend/lib/interaction/adaptive.ts`. It is a pure module so
the same decisions are available offline and directly testable with Node 24.
State is partitioned by patient and domain by `events.ts`. Raw answer events
contain a session ID, game, domain, local day, timestamp, input method,
correctness, response time, error type and the current difficulty knob.

The skill estimate starts at 1000. Expected success is
`1 / (1 + 10 ** ((800 + 100 * difficulty - rating) / 400))`.
Each scored answer updates rating by `24 * (actual - expected)`, clamped to
400–1800. This is an engagement heuristic, not a clinically calibrated model.

A five-answer window controls the knob. Accuracy at or below 40% lowers the
knob once; at or above 80% raises it once if the latest valid response is no
more than 1.5 times that person's baseline. A change clears the window. Knobs
stay between 1 and 4. A slower response alone can never lower difficulty.
The Elo estimate is recorded, while the transparent window policy makes the
actual knob decision; they must not be described as interchangeable.

Baselines are rolling medians of up to 21 correctly answered trials, stored
separately for tap, typed and voice. The comparison uses the prior baseline.
No population speed cutoff is used. Voice time runs from TTS completion to the
browser's `speechstart` event, not transcript delivery. When speech-start timing
is unavailable it remains null. Recognition failures and silence have no
correctness and cannot update skill or baselines. Fuzzy / low-confidence
matches require explicit confirmation before invoking the game's normal
answer handler. Missing timing does not penalize the patient.

Odd One Out and Object Naming apply their knobs to choice count at the next
question. Matching Pictures chooses pair count at session start; Sound Tap
adjusts beat range, and Pattern Completion switches between two- and three-item
patterns. Yesterday Quiz adds up to three older journal memories as distractors,
excluding every target-day memory and normalized summaries repeated on that day.
When there is insufficient safe history it uses fewer choices rather than inventing
memories. Its answer positions still rotate. Crossword uses word length and given
letters at puzzle creation. Catalog levels remain unchanged. Other instrumented
legacy games log events but retain their existing mechanics.
The event schema reserves hesitation and
touch duration, but those signals are not yet measured or used. Do not claim
that this version detects pauses, tremor or cognitive decline from speech.

`declineAlert` fits an ordinary least-squares slope over the last eight session
scores. It requires slope < -2 points/session and slopes < -1 in each four-session
half. This excludes a lone final bad session. The caller must aggregate answers
to session scores first. It is an explainable monitoring flag, not a diagnosis.

Run `node lib/interaction/adaptive.check.mjs` from frontend. Tests cover separate
baselines, recognition exclusion, robust medians, one-knob changes, cooldown and
sustained decline versus a single poor result.
