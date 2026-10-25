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
 * Handles the one fix per round rule where:
 * - When fixUsed is false: initial placements are evaluated directly.
 * - When fixUsed is true: only pills still correct after the fix count full (1.0x),
 *   pills newly corrected in the fix count half (0.5x),
 *   and pills removed during the fix do NOT count as correct.
 */
export function evaluateRoundPlacements(
  scenario: PlannerScenario,
  initialPlacements: PlacedPill[],
  fixedPlacements: PlacedPill[] = [],
  fixUsed: boolean = false
): RoundResult {
  const targetKeys = expandScenario(scenario);
  const totalRequired = targetKeys.size;

  const initialPlacedKeys = new Set(
    initialPlacements.map((p) => pillKey(p.day, p.time, p.pill))
  );

  if (!fixUsed) {
    let correctInitial = 0;
    const missingKeys: string[] = [];
    const extraKeys: string[] = [];

    targetKeys.forEach((key) => {
      if (initialPlacedKeys.has(key)) {
        correctInitial++;
      } else {
        missingKeys.push(key);
      }
    });

    initialPlacedKeys.forEach((key) => {
      if (!targetKeys.has(key)) {
        extraKeys.push(key);
      }
    });

    const extraPenalty = 0.05 * extraKeys.length;
    let ratio = totalRequired > 0 ? correctInitial / totalRequired - extraPenalty : 1;
    ratio = Math.max(0, Math.min(1, ratio));
    const roundScore = Math.round(ratio * 100);

    return {
      roundId: scenario.id,
      roundScore,
      totalRequired,
      correctInitial,
      correctedInFix: 0,
      missingCount: missingKeys.length,
      extraCount: extraKeys.length,
      missingKeys,
      extraKeys,
      isPerfect: missingKeys.length === 0 && extraKeys.length === 0,
    };
  }

  // When fix is used, final placements are taken strictly from fixedPlacements
  const fixedKeys = new Set(
    fixedPlacements.map((p) => pillKey(p.day, p.time, p.pill))
  );

  let retainedInitial = 0;
  let correctedInFix = 0;
  const finalMissingKeys: string[] = [];
  const finalExtraKeys: string[] = [];

  targetKeys.forEach((key) => {
    if (fixedKeys.has(key)) {
      if (initialPlacedKeys.has(key)) {
        // Correct initially AND retained after the fix -> counts 1.0
        retainedInitial++;
      } else {
        // Corrected in fix -> counts 0.5
        correctedInFix++;
      }
    } else {
      // Missing in final state (even if placed initially, user removed it)
      finalMissingKeys.push(key);
    }
  });

  fixedKeys.forEach((key) => {
    if (!targetKeys.has(key)) {
      finalExtraKeys.push(key);
    }
  });

  const effectiveCorrect = retainedInitial + 0.5 * correctedInFix;
  const extraPenalty = 0.05 * finalExtraKeys.length;

  let ratio = totalRequired > 0 ? effectiveCorrect / totalRequired - extraPenalty : 1;
  ratio = Math.max(0, Math.min(1, ratio));
  const roundScore = Math.round(ratio * 100);

  return {
    roundId: scenario.id,
    roundScore,
    totalRequired,
    correctInitial: retainedInitial,
    correctedInFix,
    missingCount: finalMissingKeys.length,
    extraCount: finalExtraKeys.length,
    missingKeys: finalMissingKeys,
    extraKeys: finalExtraKeys,
    isPerfect: finalMissingKeys.length === 0 && finalExtraKeys.length === 0,
  };
}

export interface RuleHint {
  pillColor: PillColorId;
  ruleInstruction: string;
  hintDetail: string;
  hintText: string;
}

/**
 * Finds the first rule in the scenario that has a missing or extra placement.
 * Returns a gentle, rule-specific hint using the rule's instruction text.
 */
export function findRuleHint(
  scenario: PlannerScenario,
  missingKeys: string[],
  extraKeys: string[]
): RuleHint | null {
  for (const rule of scenario.rules) {
    const color = rule.pillColor;
    const hasMissing = missingKeys.some((k) => k.endsWith(`:${color}`));
    const hasExtra = extraKeys.some((k) => k.endsWith(`:${color}`));
    if (hasMissing || hasExtra) {
      const rawInst = rule.instruction || `${color} pill: check schedule`;
      const colonIdx = rawInst.indexOf(":");
      const detail =
        colonIdx !== -1 ? rawInst.slice(colonIdx + 1).trim() : rawInst;
      const cleanDetail = detail.endsWith(".") ? detail.slice(0, -1) : detail;
      return {
        pillColor: color,
        ruleInstruction: rawInst,
        hintDetail: cleanDetail,
        hintText: `Look again at the ${color} pill: ${cleanDetail}`,
      };
    }
  }

  if (extraKeys.length > 0) {
    const firstExtraColor = extraKeys[0].split(":")[2] as PillColorId;
    return {
      pillColor: firstExtraColor,
      ruleInstruction: `No ${firstExtraColor} pills are needed in this round.`,
      hintDetail: `no ${firstExtraColor} pills needed`,
      hintText: `Look again at the ${firstExtraColor} pill: no ${firstExtraColor} pills are needed`,
    };
  }

  return null;
}

/**
 * Creates a guarded finish handler that guarantees the callback can only run once.
 */
export function createFinishGuard<T extends (...args: any[]) => any>(fn: T) {
  let called = false;
  return (...args: Parameters<T>): boolean => {
    if (called) return false;
    called = true;
    fn(...args);
    return true;
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

