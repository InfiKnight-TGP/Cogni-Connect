# Plan the Day

**Level 1 (easy) · Skill: sequencing and planning · No timer**

One session has 5 rounds. Every round asks the same thing: put everyday things in the order they happen.

## Rules

### With fewer than 3 distinct routine steps: Rounds 1–2, steps of a task

- Shows 3 or 4 picture cards from a familiar Indian everyday task, such as making tea, a temple visit or cooking rice.
- Tap the cards in order. Each tap fills the next numbered slot. Tap a placed card to send it back.
- Press **Check** when all slots are full. Cards in the right place turn green. Any other card stays neutral and shows a hint, such as "Goes in step 3".

### Rounds 3–4: Errand planner

- Shows a map with Home, Market, Pharmacy, Temple and Bank, three errands, and one rule (for example "🏦 Bank opens 10 AM").
- The day starts at 9 AM and each errand takes 1 hour, so the three slots are 9, 10 and 11 AM.
- Tap the errands into order and press **Go**. A figure walks the route on the map.
- If the order breaks the rule, the errand that breaks it is outlined in amber and a one-line hint appears, such as "The bank opens at 10 AM. Go there later." The user can change the order and press Go once more.
- If the second try also breaks the rule, a valid order is shown in green and the game moves on.
- Any order that keeps the rule is correct. There isn't one fixed answer.

### Round 5 when no routine is available: Personal

The first option that's available is used:

1. **Photos of the user's day.** `GET /day-frames?date=YYYY-MM-DD` uses the date chosen on `/games`. If it returns 3 or more frames, the user puts them in order ("Put your day back in order"). Each photo's time appears after Check.
2. **Another errand round.**

### With 3–5 distinct routine steps

The routine replaces the two built-in step-task rounds. The first routine round asks the person to order their steps; knob 1 places the first step for them, and knob 4 uses all five steps when available. The next round asks routine-based choice questions: knob 1 asks one “What comes after?” question with 2 options; knob 2 uses 3 options; knob 3 also asks what comes first; knob 4 also shows the routine with one step missing. Routine wording appears exactly as entered. The fifth round still prefers 3 or more photos from the selected day and otherwise uses another errand round. Sessions remain five rounds (four at knob 1), with 20 points per round.

To set the routine (3–5 steps in order, each 1–40 characters; it is stored in `backend/routines.json`):

```bash
curl -X POST http://localhost:5000/routine -H "Content-Type: application/json" \
  -d '{"steps": ["Wake up", "Drink coffee", "Walk in the park", "Read the paper"]}'
```

## Scoring

Each round is worth 20 points, for a total of 0–100.

| Round type | Points |
|---|---|
| Steps (task, photos or routine) | correct positions / number of cards × 20 |
| Errand planner | 20 if correct on the first try, 10 if correct after the fix, otherwise 0 |

The total goes to `onFinish`. `GameShell` rounds it and saves it to `POST /performance` with `game_id: "plan-the-day"`.

## Content

`data.ts` has 12 step tasks and 10 errand sets. When there are fewer than 3 distinct routine steps, each session picks 2 tasks and 2–3 errand sets at random, so rounds rarely repeat. With 3 or more distinct routine steps, those replace the task rounds. Rules are one of three kinds:

| Kind | Meaning | Example |
|---|---|---|
| `closes` | the errand must be finished by that hour | "Pharmacy closes 11 AM" |
| `opens` | the errand can't start before that hour | "Bank opens 10 AM" |
| `before` | errand A must come before errand B | "Buy milk before making tea" |

With three 1-hour errands from 9 AM, the day ends at 12 PM, so a "closes" rule at 12 or later can never be broken. Use 10 or 11 AM.

`rules.check.mjs` tests the rule logic and checks that every task has 3–4 distinct steps, and that every errand set has 3 errands at known places and a rule that some orders keep and others break. Run it after changing the content:

```bash
cd frontend
node components/games/plan-the-day/rules.check.mjs
```

## Files

| File | Contents |
|---|---|
| `index.tsx` | Builds the 5-round session and adds up the score |
| `StepRound.tsx` | Tap-to-place ordering for tasks, photos and routines |
| `ErrandRound.tsx` | Map, errand slots, walk animation, rule hint and one fix |
| `rules.ts` | Errand timing and rule checks (pure functions) |
| `data.ts` | Step tasks, errand sets, map places |
| `useSlots.ts` | Tap-to-place state shared by both round types |

## References

- Phillips, L. H., Kliegel, M., & Martin, M. (2006). Age and planning tasks: The influence of ecological validity. *International Journal of Aging and Human Development, 62*(2), 175–184. Errand-planning tasks in the style of Plan-a-Day are fairer to older adults when the setting is familiar, which is why every round uses everyday Indian routines and errands.
- Tulliani, et al. (2023). E-MinD Life. *Full citation not verified; check it before publishing.* Background for game-based cognitive training of everyday activities.
- Clare, L., Kudlicka, A., Oyebode, J. R., Jones, R. W., Bayer, A., Leroi, I., et al. (2019). Individual goal-oriented cognitive rehabilitation to improve everyday functioning for people with early-stage dementia: A multicentre randomised controlled trial (the GREAT trial). *International Journal of Geriatric Psychiatry, 34*(5), 709–721. Practising a person's own goals and routines supports everyday functioning, which is the basis for the caregiver routine in round 5.
