# Attention Hunt

**Skill:** Selective Attention
**Level:** 3

## Rules

Find every copy of the everyday object shown above the board and leave similar distractors alone. Correct taps turn green and count once. Incorrect taps receive subtle feedback, count as an error, and remain available. A single 60 second timer covers all five rounds.

## Level settings

- Five rounds progress through 3 Ã— 3, 3 Ã— 4, 4 Ã— 4, 4 Ã— 5, and 5 Ã— 5 boards.
- Each round contains the shown target and similar distractors, with the target count displayed as progress.
- Fifteen object configurations provide varied target and distractor sets.

## Scoring

Score is `round((correctTargets / totalTargets) Ã— 100 - (wrongTaps / totalTiles) Ã— 25)`, clamped to 0â€“100. The score and Selective Attention skill are saved when every target is found or time expires.

## Example

Find all the cups in a grid of cups, mugs, glasses, and bowls. Each found cup turns green and updates the round progress.

## Test instructions

From `frontend`, run `npm run dev`, open `/games`, and launch Attention Hunt. Check target progress, wrong taps, duplicate tap prevention, the 60 second timer, five grid sizes, and the saved result.
