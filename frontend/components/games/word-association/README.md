# Word Association

**Level:** 1 (Easy), the only level for this game
**Skill:** semantic memory
**Files:**
- `index.tsx` (UI, GameShell, VoiceQuestion, BigTile)
- `data.ts` (20 authentic Indian pairs with cross-platform Unicode emojis, targets, distractors, and voice synonyms)
- `logic.ts` (round generation, option selection, and scoring)

## How to play
- A cue card appears at the top with a large emoji picture and word label (e.g. ☕ Cup of tea).
- Below the cue card, 2 to 4 choice tiles are displayed, each with its own emoji and word label.
- The player taps (or speaks) the item that belongs with the cue (e.g. 🍪 Biscuit).
- If the first choice is wrong, a gentle calm-amber hint is provided without red error states or shaking.
- After two wrong attempts, the correct card is gently revealed so the player is never stuck.

## Knob Levels
The game reads the adaptive knob setting at session start (default is 2):

| Knob | Rounds | Choices | Hint Timing | Distractor Composition |
| :---: | :---: | :---: | :---: | :---: |
| **1** | 5 | 2 options | Shown immediately from the start of the round | Unrelated or random distractors |
| **2** | 6 | 3 options | Revealed after the first incorrect tap | Mixed category distractors |
| **3** | 6 | 4 options | Revealed after the first incorrect tap | At least 1 distractor from the same category |
| **4** | 8 | 4 options | Revealed after the first incorrect tap | All 3 distractors from the same category |

No pairs repeat within a single game session.

## Scoring
- **Correct on first attempt:** 1.0 point
- **Correct after gentle hint:** 0.5 point
- **Revealed after 2 incorrect taps:** 0.0 points
- **Final Session Score:** $\text{round}\left(\frac{\text{Total Points}}{\text{Total Rounds}} \times 100\right)$ (0–100)
