/**
 * Pill Box Planner - Scoring and Rule-Switching Logic
 *
 * Scoring rules:
 * - 3 rounds per session.
 * - Score per round: correct compartments over required, minus 0.05 per extra pill (floor at 0).
 * - One fix per round allowed: compartments corrected after the fix count half (0.5x).
 * - Session score = average of round scores x 100.
 */

import type {
  PillColorId,
  PlannerScenario,
  WeekDay,
  DayTime,
  PlanRule,
} from "./data";

/**
 * Expands a rule into the exact set of required compartment keys: "day:time:pillColor".
 */
export function expandRule(rule: PlanRule): Set<string> {
  const result = new Set<string>();
  rule.days.forEach((day) => {
    if (rule.exceptionDay && day === rule.exceptionDay) {
      return;
    }
    rule.times.forEach((time) => {
      result.add(`${day}:${time}:${rule.pillColor}`);
    });
  });
  return result;
}

/**
 * Generates the full set of target compartment keys for a scenario.
 */
export function expandScenario(scenario: PlannerScenario): Set<string> {
  const combined = new Set<string>();
  scenario.rules.forEach((rule) => {
    const expanded = expandRule(rule);
    expanded.forEach((key) => combined.add(key));
  });
  return combined;
}

export interface PlacedPill {
  day: WeekDay;
  time: DayTime;
  pill: PillColorId;
}

export interface RoundResult {
  roundId: string;
  roundScore: number; // 0..100
  totalRequired: number;
  correctInitial: number;
  correctedInFix: number;
  missingCount: number;
  extraCount: number;
  missingKeys: string[]; // "day:time:pill"
  extraKeys: string[]; // "day:time:pill"
  isPerfect: boolean;
}

/**
 * Key representation for a placed pill: "day:time:pill".
 */
export function pillKey(day: WeekDay, time: DayTime, pill: PillColorId): string {
  return `${day}:${time}:${pill}`;
}

/**
 * Returns scenarios for a given knob level (1 to 4).
 */
export function getScenariosForKnob(
  knob: number,
  scenariosMap: Record<number, PlannerScenario[]>
): PlannerScenario[] {
  const clampedKnob = Math.max(1, Math.min(4, Math.round(knob)));
  return scenariosMap[clampedKnob] ?? scenariosMap[2] ?? [];
}

/**
 * Evaluates round placements and calculates round score (0..100).
 * Handles the one fix per round rule where corrected compartments count half.
 */
export function evaluateRoundPlacements(
  scenario: PlannerScenario,
  initialPlacements: PlacedPill[],
  fixedPlacements: PlacedPill[] = []
): RoundResult {
  const targetKeys = expandScenario(scenario);
  const totalRequired = targetKeys.size;

  const initialPlacedKeys = new Set(
    initialPlacements.map((p) => pillKey(p.day, p.time, p.pill))
  );

  // Initial assessment
  let correctInitial = 0;
  const missingInitialKeys: string[] = [];
  const extraInitialKeys: string[] = [];

  targetKeys.forEach((key) => {
    if (initialPlacedKeys.has(key)) {
      correctInitial++;
    } else {
      missingInitialKeys.push(key);
    }
  });

  initialPlacedKeys.forEach((key) => {
    if (!targetKeys.has(key)) {
      extraInitialKeys.push(key);
    }
  });

  // Evaluate fix if provided
  const hasFix = fixedPlacements.length > 0;
  let correctedInFix = 0;
  let finalMissingKeys = missingInitialKeys;
  let finalExtraKeys = extraInitialKeys;

  if (hasFix) {
    const fixedKeys = new Set(
      fixedPlacements.map((p) => pillKey(p.day, p.time, p.pill))
    );

    // Track which previously missing/wrong compartments are now correct
    missingInitialKeys.forEach((key) => {
      if (fixedKeys.has(key)) {
        correctedInFix++;
      }
    });

    finalMissingKeys = [];
    targetKeys.forEach((key) => {
      if (!fixedKeys.has(key)) {
        finalMissingKeys.push(key);
      }
    });

    finalExtraKeys = [];
    fixedKeys.forEach((key) => {
      if (!targetKeys.has(key)) {
        finalExtraKeys.push(key);
      }
    });
  }

  // Scoring calculation:
  // Initial correct counts 1.0 each.
  // Corrected after fix counts 0.5 each.
  // Extra pill penalty: 0.05 per extra pill.
  // Ratio floor at 0.
  const effectiveCorrect = correctInitial + 0.5 * correctedInFix;
  const extraPenalty = 0.05 * finalExtraKeys.length;

  let ratio = totalRequired > 0 ? effectiveCorrect / totalRequired - extraPenalty : 1;
  ratio = Math.max(0, Math.min(1, ratio));
  const roundScore = Math.round(ratio * 100);

  return {
    roundId: scenario.id,
    roundScore,
    totalRequired,
    correctInitial,
    correctedInFix,
    missingCount: finalMissingKeys.length,
    extraCount: finalExtraKeys.length,
    missingKeys: finalMissingKeys,
    extraKeys: finalExtraKeys,
    isPerfect: finalMissingKeys.length === 0 && finalExtraKeys.length === 0,
  };
}

/**
 * Calculates session score as the average of the 3 round scores.
 */
export function calculatePillBoxSessionScore(rounds: RoundResult[]): number {
  if (rounds.length === 0) return 0;
  const total = rounds.reduce((sum, r) => sum + r.roundScore, 0);
  return Math.max(0, Math.min(100, Math.round(total / rounds.length)));
}
