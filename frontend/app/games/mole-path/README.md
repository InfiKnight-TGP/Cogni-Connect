# Mole Path

**Skill:** Visual Working Memory
**Levels:** 2 and 3

## Rules

Watch the solid blue fill move between circular holes, then tap the same holes in the same order. Input is disabled during playback. A wrong tap ends that round; a correct path records the longest sequence remembered.

## Level settings

- Level 2 uses a 3 Ã— 3 grid. Five rounds use paths of 3, 4, 5, 6, and 7 holes.
- Level 3 uses a 4 Ã— 4 grid. Five rounds use paths of 4, 5, 6, 7, and 8 holes.
- Paths use unique holes. Playback uses consistent timing and a short pause between holes.

## Scoring

The score is the longest correctly recalled path divided by 8 (the longest Level 3 path), multiplied by 100 and rounded. The score remains between 0 and 100 and is saved with the Visual Working Memory skill.

## Example

Watch holes 2, 5, and 8 fill in order, then tap holes 2 â†’ 5 â†’ 8.

## Test instructions

From `frontend`, run `npm run dev`, open `/games`, and launch Mole Path. Check both grid sizes, playback lockout, order checking, replay, longest path, and the saved score.
