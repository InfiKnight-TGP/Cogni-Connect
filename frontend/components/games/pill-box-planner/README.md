# Pill Box Planner

**Area:** Executive Function  
**Level:** 2 (Medium), the only level for this game  
**Skill:** Rule switching & multi-step cognitive planning  
**Component:** `frontend/components/games/pill-box-planner/index.tsx`  
**Logic & Scoring:** `frontend/components/games/pill-box-planner/logic.ts`  
**Data:** `frontend/components/games/pill-box-planner/data.ts`  
**Automated Check:** `frontend/lib/pill-box-planner.check.mjs`

---

## Safety Guidelines & Invariants

This game is strictly an abstract cognitive training exercise:
- **Permanent banner**: "Practice only. This is not medical advice." (translated and read aloud at the start).
- **Coloured pills only**: Red, Blue, Yellow, Green (coloured circle with the colour name as text so colour is never the only cue).
- **Time words & weekday names only**: Morning, afternoon, night, and Monday through Sunday.
- **Safety Invariants**: No real drug names, no clinical measurement units, no counts followed by pill forms, and no clinical terminology.

---

## Game Overview

Pill Box Planner challenges patients to organize a weekly pill box across 7 days (Monday through Sunday) and 3 times (Morning 🌅, Afternoon ☀️, Night 🌙) according to a practice card:
1. **3 Rounds**: Each round presents 2 to 4 colour rules (e.g., "Red: morning and night every day", "Blue: after lunch only", "Yellow: Monday, Wednesday and Friday morning").
2. **Exception Rules**: In round 3 (and knobs 3/4), an exception rule is introduced (e.g., "Skip the red pill on Sunday").
3. **Weekly Grid**: 7 days × 3 times displayed as a full calendar grid on desktop and day tabs on mobile.
4. **Gentle Review & One Fix**: Clicking "Check" outlines wrong or missing compartments in calm amber with a gentle hint. The player has one opportunity to adjust placements before final confirmation.

---

## Scoring (0–100)

- Round score: correct compartments over required, minus 0.05 per extra pill (floor at 0).
- One fix per round: compartments corrected after the fix count half (0.5×).
- Session score: average of the 3 round scores × 100.

---

## Knobs

- **Knob 1**: 2 pills with the rule shown beside each row.
- **Knob 2**: Normal (2 to 3 pills with a Sunday exception in round 3).
- **Knob 3**: 3 pills with weekday rules in all rounds.
- **Knob 4**: 4 pills with exception rules in rounds 2 and 3.
- **Adaptive logging**: Logged under game id `pill-box-planner`, area `Executive Function`, and knob level.
