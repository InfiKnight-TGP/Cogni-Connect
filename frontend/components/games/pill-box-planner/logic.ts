/**
 * Pill Box Planner - Scoring and Rule-Switching Logic
 */

import type { Medication, PillSlot, RoundScenario } from "./data";

export interface SlotPlacements {
  morning: string[]; // Medication IDs in slot
  afternoon: string[];
  evening: string[];
  bedtime: string[];
}

export interface RoundEvaluation {
  roundId: string;
  isRuleSwitch: boolean;
  score: number; // 0..100
  correctPlacements: number;
  totalRequired: number;
  omissions: number;
  extraPlacements: number;
  missingPairs: { slot: PillSlot; medId: string }[];
  extraPairs: { slot: PillSlot; medId: string }[];
  isPerfect: boolean;
}

export interface SessionSummary {
  finalScore: number; // 0..100
  roundsCompleted: number;
  totalCorrect: number;
  totalRequired: number;
  switchErrors: number; // Errors on rule-switch rounds
  roundDetails: RoundEvaluation[];
}

export const VALID_DOSE_UNITS: readonly string[] = [
  "mg",
  "ml",
  "drops",
  "tablet",
  "tablets",
  "capsule",
  "capsules",
  "IU",
];

/**
 * Validates that all medications in the library have valid realistic names,
 * positive doses, and certified clinical dose units.
 */
export function validateMedicationsLibrary(
  meds: Record<string, Medication>,
  allowedUnits: readonly string[] = VALID_DOSE_UNITS
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const validUnits = new Set(allowedUnits);

  Object.keys(meds).forEach((id) => {
    const med = meds[id];
    if (!med.name || med.name.trim().length === 0) {
      errors.push(`Medication ${id} is missing a name`);
    }
    if (!med.genericName || med.genericName.trim().length === 0) {
      errors.push(`Medication ${id} is missing a genericName`);
    }
    if (typeof med.doseAmount !== "number" || med.doseAmount <= 0) {
      errors.push(`Medication ${id} has non-positive dose amount: ${med.doseAmount}`);
    }
    if (!validUnits.has(med.doseUnit)) {
      errors.push(`Medication ${id} has invalid dose unit: ${med.doseUnit}`);
    }
    if (!med.doseDisplay || !med.doseDisplay.includes(med.doseUnit)) {
      errors.push(`Medication ${id} doseDisplay "${med.doseDisplay}" does not mention doseUnit "${med.doseUnit}"`);
    }
    if (!med.iconEmoji || med.iconEmoji.trim().length === 0) {
      errors.push(`Medication ${id} is missing an icon emoji`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Returns scenarios for a given knob level (1 to 4) using provided scenario map.
 */
export function getScenariosForKnob(
  knob: number,
  scenariosMap: Record<number, RoundScenario[]>
): RoundScenario[] {
  const clampedKnob = Math.max(1, Math.min(4, Math.round(knob)));
  return scenariosMap[clampedKnob] ?? scenariosMap[2] ?? [];
}

/**
 * Evaluates a user's pill placements for a given scenario.
 */
export function evaluatePlacements(
  scenario: RoundScenario,
  placements: SlotPlacements
): RoundEvaluation {
  // Construct target set of (slot, medId)
  const targetPairs = new Set<string>();
  scenario.rules.forEach((rule) => {
    rule.slots.forEach((slot) => {
      targetPairs.add(`${slot}:${rule.medicationId}`);
    });
  });

  // Construct placed set of (slot, medId)
  const placedPairs = new Set<string>();
  scenario.activeSlots.forEach((slot) => {
    const medsInSlot = placements[slot] || [];
    medsInSlot.forEach((medId) => {
      placedPairs.add(`${slot}:${medId}`);
    });
  });

  let correctPlacements = 0;
  const missingPairs: { slot: PillSlot; medId: string }[] = [];
  const extraPairs: { slot: PillSlot; medId: string }[] = [];

  targetPairs.forEach((pair) => {
    if (placedPairs.has(pair)) {
      correctPlacements++;
    } else {
      const parts = pair.split(":");
      missingPairs.push({ slot: parts[0] as PillSlot, medId: parts[1] });
    }
  });

  placedPairs.forEach((pair) => {
    if (!targetPairs.has(pair)) {
      const parts = pair.split(":");
      extraPairs.push({ slot: parts[0] as PillSlot, medId: parts[1] });
    }
  });

  const totalRequired = targetPairs.size;
  const omissions = missingPairs.length;
  const extraPlacements = extraPairs.length;

  // Score calculation:
  // 100 * max(0, correct - 0.5 * extra) / totalRequired
  let rawRatio = totalRequired > 0 ? (correctPlacements - 0.5 * extraPlacements) / totalRequired : 1;
  rawRatio = Math.max(0, Math.min(1, rawRatio));
  const score = Math.round(rawRatio * 100);

  return {
    roundId: scenario.id,
    isRuleSwitch: Boolean(scenario.isRuleSwitch),
    score,
    correctPlacements,
    totalRequired,
    omissions,
    extraPlacements,
    missingPairs,
    extraPairs,
    isPerfect: omissions === 0 && extraPlacements === 0,
  };
}

/**
 * Calculates session summary score from all rounds.
 */
export function calculatePillBoxScore(rounds: RoundEvaluation[]): SessionSummary {
  if (rounds.length === 0) {
    return {
      finalScore: 0,
      roundsCompleted: 0,
      totalCorrect: 0,
      totalRequired: 0,
      switchErrors: 0,
      roundDetails: [],
    };
  }

  let totalScore = 0;
  let totalCorrect = 0;
  let totalRequired = 0;
  let switchErrors = 0;

  rounds.forEach((r) => {
    totalScore += r.score;
    totalCorrect += r.correctPlacements;
    totalRequired += r.totalRequired;

    if (r.isRuleSwitch) {
      // Switch error: any omissions or extra misplaced pills on a rule switch round
      switchErrors += r.omissions + r.extraPlacements;
    }
  });

  const finalScore = Math.max(0, Math.min(100, Math.round(totalScore / rounds.length)));

  return {
    finalScore,
    roundsCompleted: rounds.length,
    totalCorrect,
    totalRequired,
    switchErrors,
    roundDetails: rounds,
  };
}
