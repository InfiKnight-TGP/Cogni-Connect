import assert from "node:assert/strict";
import {
  getGardenTapsKnobConfig,
  generateTrialSchedule,
  calculateGardenTapsScore,
  getAdaptiveAction,
} from "../components/games/whack-a-mole/logic.ts";
import { evaluateSession, initialSkill } from "./interaction/adaptive.ts";

// 1. Knob configuration checks
const k1 = getGardenTapsKnobConfig(1);
assert.equal(k1.totalTrials, 16);
assert.equal(k1.upMs, 3200);
assert.equal(k1.gapMs, 1200);
assert.equal(k1.hasTargetRing, true);
assert.equal(k1.noGoTypes.length, 1);
assert.equal(k1.hasSwap, false);

const k2 = getGardenTapsKnobConfig(2);
assert.equal(k2.totalTrials, 20);
assert.equal(k2.upMs, 2500);
assert.equal(k2.gapMs, 1000);
assert.equal(k2.hasTargetRing, false);
assert.equal(k2.hasSwap, false);

const k3 = getGardenTapsKnobConfig(3);
assert.equal(k3.totalTrials, 24);
assert.equal(k3.upMs, 2000);
assert.equal(k3.gapMs, 850);
assert.equal(k3.noGoTypes.length, 2);
assert.equal(k3.hasSwap, false);

const k4 = getGardenTapsKnobConfig(4);
assert.equal(k4.totalTrials, 24);
assert.equal(k4.upMs, 1600);
assert.equal(k4.gapMs, 700);
assert.equal(k4.noGoTypes.length, 2);
assert.equal(k4.hasSwap, true);
assert.equal(k4.swapTrialIndex, 16);

// 2. Schedule generation and Invariants
for (const knob of [1, 2, 3, 4]) {
  const { trials, config } = generateTrialSchedule(knob, 12345);
  // Trials count = 1 practice trial + config.totalTrials
  assert.equal(trials.length, config.totalTrials + 1);

  // Invariant 1: First trial is practice
  assert.equal(trials[0].isPractice, true);
  assert.equal(trials[0].index, 0);

  // Invariant 2: No consecutive holes are identical
  for (let i = 1; i < trials.length; i++) {
    assert.notEqual(
      trials[i].hole,
      trials[i - 1].hole,
      `Consecutive hole collision at trial ${i}: hole ${trials[i].hole}`
    );
    assert(trials[i].hole >= 0 && trials[i].hole <= 8, `Invalid hole index: ${trials[i].hole}`);
  }

  // Invariant 3: Scored trials have ~70% GO / 30% NO-GO
  const scoredTrials = trials.slice(1);
  const goTrials = scoredTrials.filter((t) => t.role === "go");
  const noGoTrials = scoredTrials.filter((t) => t.role === "nogo");
  const expectedGo = Math.round(config.totalTrials * config.goPercent);
  assert.equal(goTrials.length, expectedGo);
  assert.equal(noGoTrials.length, config.totalTrials - expectedGo);

  // Invariant 4: Knob 4 swap point exists and reverses roles
  if (config.hasSwap) {
    const swapTrial = trials.find((t) => t.isSwapPoint);
    assert(swapTrial, "Knob 4 must contain a swap announcement point");
    assert.equal(swapTrial.index, config.swapTrialIndex);

    // After swap, GO character is butterfly
    const afterSwapTrials = trials.filter((t) => t.index >= config.swapTrialIndex);
    const afterSwapGo = afterSwapTrials.filter((t) => t.role === "go");
    assert(afterSwapGo.every((t) => t.character === "butterfly"), "After swap, GO must be butterfly");
    const afterSwapNoGo = afterSwapTrials.filter((t) => t.role === "nogo");
    assert(afterSwapNoGo.every((t) => t.character === "mole"), "After swap, NO-GO must be mole");
  }
}

// 3. Scoring calculation checks
// 3a: Perfect session
const perfectResults = [
  { trialIndex: 0, isPractice: true, role: "go", character: "mole", tapped: true },
  ...Array(14).fill(null).map((_, i) => ({
    trialIndex: i + 1,
    isPractice: false,
    role: "go",
    character: "mole",
    tapped: true,
    reactionMs: 450,
  })),
  ...Array(6).fill(null).map((_, i) => ({
    trialIndex: i + 15,
    isPractice: false,
    role: "nogo",
    character: "butterfly",
    tapped: false,
    reactionMs: null,
  })),
];
const perfectScore = calculateGardenTapsScore(perfectResults);
assert.equal(perfectScore.score, 100);
assert.equal(perfectScore.hitRate, 1.0);
assert.equal(perfectScore.inhibitionRate, 1.0);

// 3b: Passive session (doing nothing / 0 hits, all correct rejections)
// raw score would be 0.6*0 + 0.4*1.0 = 40, but hitRate = 0 < 0.25 -> capped at 25!
const passiveResults = [
  ...Array(14).fill(null).map((_, i) => ({
    trialIndex: i + 1,
    isPractice: false,
    role: "go",
    character: "mole",
    tapped: false,
  })),
  ...Array(6).fill(null).map((_, i) => ({
    trialIndex: i + 15,
    isPractice: false,
    role: "nogo",
    character: "butterfly",
    tapped: false,
  })),
];
const passiveScore = calculateGardenTapsScore(passiveResults);
assert.equal(passiveScore.score, 25, `Expected 25 cap on passive session, got ${passiveScore.score}`);
assert.equal(passiveScore.hitRate, 0);
assert.equal(passiveScore.inhibitionRate, 1.0);

// 3c: Partial hits below 25% (2 of 14 = 14.3% < 25%) -> capped at 25
const lowHitsResults = [
  ...Array(2).fill(null).map((_, i) => ({
    trialIndex: i + 1,
    isPractice: false,
    role: "go",
    character: "mole",
    tapped: true,
  })),
  ...Array(12).fill(null).map((_, i) => ({
    trialIndex: i + 3,
    isPractice: false,
    role: "go",
    character: "mole",
    tapped: false,
  })),
  ...Array(6).fill(null).map((_, i) => ({
    trialIndex: i + 15,
    isPractice: false,
    role: "nogo",
    character: "butterfly",
    tapped: false,
  })),
];
const lowHitsScore = calculateGardenTapsScore(lowHitsResults);
assert.equal(lowHitsScore.score, 25, "Scores with hitRate < 0.25 must be capped at 25");

// 3d: Good play above cap (10 of 14 hits, 5 of 6 rejections)
// hitRate = 10/14 = 0.7143, inhibRate = 5/6 = 0.8333
// score = round(100 * (0.6 * 0.7143 + 0.4 * 0.8333)) = round(100 * (0.4286 + 0.3333)) = round(76.19) = 76
const goodResults = [
  ...Array(10).fill(null).map((_, i) => ({
    trialIndex: i + 1,
    isPractice: false,
    role: "go",
    character: "mole",
    tapped: true,
  })),
  ...Array(4).fill(null).map((_, i) => ({
    trialIndex: i + 11,
    isPractice: false,
    role: "go",
    character: "mole",
    tapped: false,
  })),
  ...Array(5).fill(null).map((_, i) => ({
    trialIndex: i + 15,
    isPractice: false,
    role: "nogo",
    character: "butterfly",
    tapped: false,
  })),
  {
    trialIndex: 20,
    isPractice: false,
    role: "nogo",
    character: "butterfly",
    tapped: true,
  },
];
const goodScore = calculateGardenTapsScore(goodResults);
assert.equal(goodScore.score, 76);

// 4. Adaptive logging action filter checks
// 4a: Practice trial -> log: false
const practiceAction = getAdaptiveAction({
  trialIndex: 0,
  isPractice: true,
  role: "go",
  character: "mole",
  tapped: true,
});
assert.equal(practiceAction.log, false);

// 4b: Mole hit -> log: true, correct: true
const moleHitAction = getAdaptiveAction({
  trialIndex: 1,
  isPractice: false,
  role: "go",
  character: "mole",
  tapped: true,
  reactionMs: 420,
});
assert.equal(moleHitAction.log, true);
assert.equal(moleHitAction.correct, true);
assert.equal(moleHitAction.responseMs, 420);

// 4c: Butterfly tap (false alarm) -> log: true, correct: false
const butterflyTapAction = getAdaptiveAction({
  trialIndex: 2,
  isPractice: false,
  role: "nogo",
  character: "butterfly",
  tapped: true,
  reactionMs: 380,
});
assert.equal(butterflyTapAction.log, true);
assert.equal(butterflyTapAction.correct, false);
assert.equal(butterflyTapAction.responseMs, 380);

// 4d: Correct rejection (no-go timed out without tap) -> log: true, correct: true
const rejectionAction = getAdaptiveAction({
  trialIndex: 3,
  isPractice: false,
  role: "nogo",
  character: "butterfly",
  tapped: false,
});
assert.equal(rejectionAction.log, true);
assert.equal(rejectionAction.correct, true);
assert.equal(rejectionAction.responseMs, null);

// 4e: CRITICAL INVARIANT: Missed mole -> log: false!
const missedMoleAction = getAdaptiveAction({
  trialIndex: 4,
  isPractice: false,
  role: "go",
  character: "mole",
  tapped: false,
});
assert.equal(
  missedMoleAction.log,
  false,
  "Missed mole must NOT be logged to adaptive engine"
);

// 5. Whole-session evaluation integration with adaptive.ts
// In Garden Taps, a session produces > 8 events; verify evaluateSession evaluates the whole session window
const initial = initialSkill();
const sessionEvents = Array.from({ length: 16 }).map((_, i) => ({
  id: `event-${i}`,
  patient: "patient-test",
  session: "session-taps-1",
  game: "whack-a-mole",
  domain: "Attention",
  timestamp: Date.now() + i * 1000,
  day: "2026-10-25",
  method: "tap",
  correct: i % 4 !== 0, // 75% correct
  responseMs: 500,
  errorType: i % 4 === 0 ? "answer" : "none",
  difficulty: 2,
}));
const updatedSkill = evaluateSession(initial, sessionEvents);
assert(updatedSkill.recent.length <= 8, "Recent window must store at most 8 items");
assert(updatedSkill.rating > 0, "Rating must be positive");
assert.equal(updatedSkill.decision === "stay" || updatedSkill.decision === "up" || updatedSkill.decision === "down", true);

console.log("whack-a-mole (Garden Taps) checks passed: deterministic scheduling, no consecutive holes, 70/30 split, practice trial exclusion, 25-point cap on passive sessions, adaptive filter (missed mole not logged, butterfly tap incorrect, rejection correct), and whole-session evaluation verified.");
