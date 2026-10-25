export type CharacterType = "mole" | "butterfly" | "marigold";
export type Role = "go" | "nogo";

export interface Trial {
  index: number;
  hole: number; // 0..8
  character: CharacterType;
  role: Role; // "go" | "nogo"
  isPractice: boolean;
  isSwapPoint?: boolean;
}

export interface GardenTapsKnobConfig {
  totalTrials: number;
  upMs: number;
  gapMs: number;
  hasTargetRing: boolean;
  noGoTypes: CharacterType[];
  hasSwap: boolean;
  swapTrialIndex?: number;
  goPercent: number;
}

export interface SessionTrialResult {
  trialIndex: number;
  isPractice: boolean;
  role: Role;
  character: CharacterType;
  tapped: boolean;
  reactionMs?: number | null;
}

export function getGardenTapsKnobConfig(knob: number): GardenTapsKnobConfig {
  const k = Math.max(1, Math.min(4, Math.round(knob)));
  switch (k) {
    case 1:
      return {
        totalTrials: 16,
        upMs: 3200,
        gapMs: 1200,
        hasTargetRing: true,
        noGoTypes: ["butterfly"],
        hasSwap: false,
        goPercent: 0.7,
      };
    case 2:
      return {
        totalTrials: 20,
        upMs: 2500,
        gapMs: 1000,
        hasTargetRing: false,
        noGoTypes: ["butterfly"],
        hasSwap: false,
        goPercent: 0.7,
      };
    case 3:
      return {
        totalTrials: 24,
        upMs: 2000,
        gapMs: 850,
        hasTargetRing: false,
        noGoTypes: ["butterfly", "marigold"],
        hasSwap: false,
        goPercent: 0.7,
      };
    case 4:
    default:
      return {
        totalTrials: 24,
        upMs: 1600,
        gapMs: 700,
        hasTargetRing: false,
        noGoTypes: ["butterfly", "marigold"],
        hasSwap: true,
        swapTrialIndex: 16, // Swap in last third (trials 16..23)
        goPercent: 0.7,
      };
  }
}

/** Simple pseudo-random number generator for deterministic scheduling */
export function createRng(seed?: number) {
  let s = seed !== undefined ? (seed % 2147483647) : Math.floor(Math.random() * 1000000) + 1;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates the sequence of trials for a session.
 *
 * Invariants:
 * - First trial (index 0) is a warm-up practice trial that is NOT scored.
 * - Hole (0..8) is NEVER identical on two consecutive trials.
 * - 70% GO / 30% NO-GO distribution for scored trials.
 * - On Knob 4, a role swap occurs in the last third.
 */
export function generateTrialSchedule(
  knob: number,
  seed?: number
): { trials: Trial[]; config: GardenTapsKnobConfig } {
  const rng = createRng(seed);
  const config = getGardenTapsKnobConfig(knob);
  const trials: Trial[] = [];

  let lastHole = -1;
  const pickNextHole = (): number => {
    const choices: number[] = [];
    for (let h = 0; h < 9; h++) {
      if (h !== lastHole) choices.push(h);
    }
    const picked = choices[Math.floor(rng() * choices.length)];
    lastHole = picked;
    return picked;
  };

  // Practice trial: always index 0, friendly mole GO trial
  trials.push({
    index: 0,
    hole: pickNextHole(),
    character: "mole",
    role: "go",
    isPractice: true,
  });

  // Calculate scored trial counts
  const scoredCount = config.totalTrials;
  const goCount = Math.round(scoredCount * config.goPercent);
  const noGoCount = scoredCount - goCount;

  // Build role array and shuffle deterministically
  const roles: Role[] = [
    ...Array(goCount).fill("go"),
    ...Array(noGoCount).fill("nogo"),
  ];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  // Assign characters based on role and knob swap
  for (let i = 0; i < roles.length; i++) {
    const trialIndex = i + 1;
    const baseRole = roles[i];
    const isSwapped = Boolean(config.hasSwap && config.swapTrialIndex && trialIndex >= config.swapTrialIndex);
    const isSwapPoint = Boolean(config.hasSwap && config.swapTrialIndex && trialIndex === config.swapTrialIndex);

    let role: Role = baseRole;
    let character: CharacterType;

    if (!isSwapped) {
      // Normal phase: Mole is GO, Butterfly/Marigold is NO-GO
      if (baseRole === "go") {
        character = "mole";
      } else {
        const typeIndex = Math.floor(rng() * config.noGoTypes.length);
        character = config.noGoTypes[typeIndex];
      }
    } else {
      // Swapped phase: Butterfly is GO, Mole is NO-GO
      if (baseRole === "go") {
        character = "butterfly";
      } else {
        character = "mole";
      }
    }

    trials.push({
      index: trialIndex,
      hole: pickNextHole(),
      character,
      role,
      isPractice: false,
      isSwapPoint,
    });
  }

  return { trials, config };
}

/**
 * Scoring (0-100):
 * - hitRate = goHits / goTrials
 * - inhibitionRate = correctRejections / noGoTrials
 * - rawScore = round(100 * (0.6 * hitRate + 0.4 * inhibitionRate))
 * - Cap: If hitRate < 0.25, score is capped at 25 (passivity never scores well).
 */
export function calculateGardenTapsScore(results: SessionTrialResult[]): {
  score: number;
  hitRate: number;
  inhibitionRate: number;
  goHits: number;
  goTrials: number;
  correctRejections: number;
  noGoTrials: number;
} {
  const scored = results.filter((r) => !r.isPractice);
  const goTrials = scored.filter((r) => r.role === "go");
  const noGoTrials = scored.filter((r) => r.role === "nogo");

  const goHits = goTrials.filter((r) => r.tapped).length;
  const correctRejections = noGoTrials.filter((r) => !r.tapped).length;

  const hitRate = goTrials.length > 0 ? goHits / goTrials.length : 0;
  const inhibitionRate = noGoTrials.length > 0 ? correctRejections / noGoTrials.length : 1;

  let score = Math.round(100 * (0.6 * hitRate + 0.4 * inhibitionRate));
  if (hitRate < 0.25) {
    score = Math.min(score, 25);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    hitRate,
    inhibitionRate,
    goHits,
    goTrials: goTrials.length,
    correctRejections,
    noGoTrials: noGoTrials.length,
  };
}

export type AdaptiveAction =
  | { log: true; correct: boolean; responseMs: number | null }
  | { log: false };

/**
 * Determines whether a trial result should be logged to the adaptive engine.
 *
 * Adaptive logging rules:
 * - Mole hit: log as correct (true).
 * - Butterfly/marigold tap: log as incorrect (false).
 * - Correct rejection (no-go timed out without a tap): log as correct (true).
 * - Missed mole: DO NOT log to the adaptive engine (slowness/silence never lower difficulty).
 * - Practice trials: DO NOT log.
 */
export function getAdaptiveAction(result: SessionTrialResult): AdaptiveAction {
  if (result.isPractice) {
    return { log: false };
  }

  if (result.role === "go") {
    if (result.tapped) {
      return { log: true, correct: true, responseMs: result.reactionMs ?? null };
    } else {
      // Missed GO target: do NOT log to adaptive engine
      return { log: false };
    }
  } else {
    // NO-GO trial
    if (result.tapped) {
      // False alarm (tapped distractor)
      return { log: true, correct: false, responseMs: result.reactionMs ?? null };
    } else {
      // Correct rejection
      return { log: true, correct: true, responseMs: null };
    }
  }
}
