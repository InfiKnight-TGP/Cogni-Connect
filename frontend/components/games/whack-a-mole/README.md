# Garden Taps (`whack-a-mole`)

**Area**: Attention  
**Level**: 2 (Medium)  
**Skill**: Inhibition (Impulse control & sustained visual attention)  
**Adaptive Knob**: 1 (Gentle support) to 4 (Active switching)

## Overview
Garden Taps presents a 3x3 garden grid with 9 circular earth holes ($\ge 80\text{px}$). Friendly garden characters peek out from the holes:
- **Mole** (`MoleSvg`): Target GO character (in normal rounds).
- **Butterfly** (`ButterflySvg`): Distractor NO-GO visitor.
- **Marigold Flower** (`MarigoldSvg`): Secondary NO-GO visitor on Knobs 3 and 4.

## Design & Accessibility Rules
- **No Hammers / Violent Wording**: Completely gentle garden theme with friendly smiling characters.
- **Calm Feedback**:
  - Correct tap on mole shows cheerful green "Good!".
  - Tapping a resting visitor shows a calm amber notice: *"That is a friendly butterfly. Let it rest."* No red color, no shaking, no harsh buzzers.
  - Missed mole: silent progression with zero negative alerts.
- **Pause & Resume**:
  - Visible pause button freezes all timers and resumes with remaining time without score penalty.
  - Automatically pauses if tab visibility becomes hidden (`visibilitychange`).
- **Safety**: Double taps within 300 ms are ignored.
- **Practice Trial**: The first trial of each session (index 0) is a warm-up trial that is neither scored nor logged to the adaptive engine.
- **Deterministic Scheduling**: Seeded PRNG ensures reproducibility; consecutive trials never share the same hole.

## Adaptive Knobs
- **Knob 1**: 16 trials, 3200ms up, 1200ms gap, butterfly only, soft green ring highlights target hole.
- **Knob 2 (default)**: 20 trials (70% GO / 30% NO-GO), 2500ms up, 1000ms gap.
- **Knob 3**: 24 trials, 2000ms up, 850ms gap, 2 NO-GO visitors (butterfly and marigold).
- **Knob 4**: 24 trials, 1600ms up, 700ms gap, role swap in the last third. The game pauses with a clear announcement and requires an *"I'm ready"* tap before resuming with the reversed rule.

## Adaptive Logging Rules
- Mole hit: logged as `correct: true`.
- Distractor tap: logged as `correct: false`.
- Correct rejection: logged as `correct: true`.
- Missed mole: **NOT** logged to the adaptive engine (slowness and silence never lower difficulty).
- Sessions with $> 8$ answers are evaluated across the whole session window directly by `evaluateSession`.

## Scoring
$$\text{hitRate} = \frac{\text{goHits}}{\text{goTrials}}$$
$$\text{inhibitionRate} = \frac{\text{correctRejections}}{\text{noGoTrials}}$$
$$\text{score} = \text{round}(100 \times (0.6 \times \text{hitRate} + 0.4 \times \text{inhibitionRate}))$$
- If $\text{hitRate} < 0.25$, score is capped at 25.
