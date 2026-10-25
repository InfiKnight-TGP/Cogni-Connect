import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MEDICATIONS,
  VALID_DOSE_UNITS,
  PILL_SLOTS,
  KNOB_SCENARIOS,
} from "../components/games/pill-box-planner/data.ts";
import {
  validateMedicationsLibrary,
  getScenariosForKnob,
  evaluatePlacements,
  calculatePillBoxScore,
} from "../components/games/pill-box-planner/logic.ts";

console.log("Checking Pill Box Planner data, dose units, and rules...");

// 1. Medication & Dose-Unit Validation
const validation = validateMedicationsLibrary(MEDICATIONS);
assert.equal(
  validation.valid,
  true,
  `Medication library validation failed: ${validation.errors.join("; ")}`
);

// Check that expected real medicines are present
const expectedMedicines = [
  "paracetamol",
  "metformin",
  "amlodipine",
  "omeprazole",
  "atorvastatin",
  "calcium_d3",
  "vitamin_d3",
  "eye_drops",
  "cough_syrup",
];
for (const medId of expectedMedicines) {
  assert(
    MEDICATIONS[medId],
    `Expected realistic medication "${medId}" missing from library`
  );
  const med = MEDICATIONS[medId];
  assert(med.name.length > 2, `Medication "${medId}" name too short`);
  assert(med.genericName.length > 2, `Medication "${medId}" genericName too short`);
  assert(med.doseAmount > 0, `Medication "${medId}" doseAmount must be positive`);
  assert(
    VALID_DOSE_UNITS.includes(med.doseUnit),
    `Medication "${medId}" has invalid doseUnit: ${med.doseUnit}`
  );
  assert(
    med.doseDisplay.includes(med.doseUnit),
    `Medication "${medId}" doseDisplay "${med.doseDisplay}" must include unit "${med.doseUnit}"`
  );
}

// 2. Slot Validation
assert.equal(PILL_SLOTS.length, 4, "Expected 4 pill box compartment slots");
const validSlotIds = ["morning", "afternoon", "evening", "bedtime"];
for (const slot of PILL_SLOTS) {
  assert(validSlotIds.includes(slot.id), `Invalid slot id: ${slot.id}`);
  assert(slot.name.length > 0, `Slot ${slot.id} missing name`);
  assert(slot.icon.length > 0, `Slot ${slot.id} missing icon`);
  assert(slot.timeHint.length > 0, `Slot ${slot.id} missing timeHint`);
}

// 3. Knobs and Rule Switching Scenarios
for (const knob of [1, 2, 3, 4]) {
  const scenarios = getScenariosForKnob(knob, KNOB_SCENARIOS);
  assert(
    scenarios.length >= 2,
    `Knob ${knob} must have at least 2 scenarios, found ${scenarios.length}`
  );

  for (const sc of scenarios) {
    assert(sc.id.length > 0, `Scenario missing id in knob ${knob}`);
    assert(sc.title.length > 0, `Scenario missing title in knob ${knob}`);
    assert(sc.activeSlots.length >= 2, `Scenario must have >= 2 active slots`);
    assert(sc.availableMedications.length >= 2, `Scenario must have >= 2 available medications`);
    assert(sc.rules.length >= 1, `Scenario must have >= 1 rules`);

    // Ensure every rule's medication is in the available list and has valid active slots
    for (const rule of sc.rules) {
      assert(
        sc.availableMedications.includes(rule.medicationId),
        `Rule medication "${rule.medicationId}" not in availableMedications`
      );
      assert(
        MEDICATIONS[rule.medicationId],
        `Rule medication "${rule.medicationId}" not found in MEDICATIONS library`
      );
      for (const slot of rule.slots) {
        assert(
          sc.activeSlots.includes(slot),
          `Rule slot "${slot}" not in scenario activeSlots`
        );
      }
    }
  }
}

// Ensure Knob 4 contains an explicit rule switch
const knob4Scenarios = getScenariosForKnob(4, KNOB_SCENARIOS);
const hasRuleSwitch = knob4Scenarios.some((s) => s.isRuleSwitch);
assert.equal(hasRuleSwitch, true, "Knob 4 must contain a rule-switch scenario");

// 4. Scoring & Rule Switching Accuracy Logic
const testScenario = {
  id: "test-eval",
  title: "Evaluation Test",
  activeSlots: ["morning", "evening"],
  availableMedications: ["paracetamol", "omeprazole"],
  rules: [
    { medicationId: "omeprazole", slots: ["morning"], instruction: "Take Omeprazole in the morning" },
    { medicationId: "paracetamol", slots: ["morning", "evening"], instruction: "Take Paracetamol morning and evening" },
  ],
};

// Perfect placement
const perfectPlacements = {
  morning: ["omeprazole", "paracetamol"],
  afternoon: [],
  evening: ["paracetamol"],
  bedtime: [],
};
const perfectEval = evaluatePlacements(testScenario, perfectPlacements);
assert.equal(perfectEval.score, 100, "Perfect placement must score 100");
assert.equal(perfectEval.isPerfect, true);
assert.equal(perfectEval.omissions, 0);
assert.equal(perfectEval.extraPlacements, 0);

// With an omission
const omittedPlacements = {
  morning: ["omeprazole"],
  afternoon: [],
  evening: ["paracetamol"],
  bedtime: [],
};
const omittedEval = evaluatePlacements(testScenario, omittedPlacements);
assert.equal(omittedEval.isPerfect, false);
assert.equal(omittedEval.omissions, 1);
assert.equal(omittedEval.correctPlacements, 2);
assert.equal(omittedEval.score, 67); // 2/3 = 67%

// With an extra misplaced medicine
const extraPlacements = {
  morning: ["omeprazole", "paracetamol"],
  afternoon: [],
  evening: ["paracetamol", "omeprazole"], // Omeprazole is extra in evening
  bedtime: [],
};
const extraEval = evaluatePlacements(testScenario, extraPlacements);
assert.equal(extraEval.isPerfect, false);
assert.equal(extraEval.extraPlacements, 1);
assert.equal(extraEval.omissions, 0);
assert.equal(extraEval.correctPlacements, 3);
// (3 - 0.5) / 3 = 2.5 / 3 = 83%
assert.equal(extraEval.score, 83);

// Session score calculation with switch error
const switchScenario = {
  ...testScenario,
  id: "test-switch",
  isRuleSwitch: true,
};
const switchEval = evaluatePlacements(switchScenario, extraPlacements);
const sessionSummary = calculatePillBoxScore([perfectEval, switchEval]);
assert.equal(sessionSummary.roundsCompleted, 2);
assert.equal(sessionSummary.switchErrors, 1, "Expected 1 switch error from extra misplaced item");
assert.equal(sessionSummary.finalScore, Math.round((100 + 83) / 2));

// 5. Registration Checks
const registryRaw = await readFile(
  new URL("../components/games/registry.ts", import.meta.url),
  "utf8"
);
assert(
  registryRaw.includes('id: "pill-box-planner"'),
  "pill-box-planner must be registered in frontend/components/games/registry.ts"
);
assert(
  !registryRaw.match(/id:\s*"pill-box-planner"[\s\S]*?comingSoon:\s*true/),
  "pill-box-planner must have comingSoon: false once implemented"
);

const gamesJsonRaw = JSON.parse(
  await readFile(new URL("../../backend/games.json", import.meta.url), "utf8")
);
const gamesList = gamesJsonRaw.games || gamesJsonRaw;
const pillGameJson = gamesList.find((g) => g.id === "pill-box-planner");
assert(pillGameJson, "pill-box-planner missing in backend/games.json");
assert.equal(pillGameJson.status, "ready", "pill-box-planner status must be 'ready' in games.json");
assert.deepEqual(pillGameJson.levels, [2], "pill-box-planner level must be [2] in games.json");
assert.equal(pillGameJson.area, "Executive Function", "pill-box-planner area must be 'Executive Function'");

const reportsRaw = await readFile(
  new URL("../../backend/cognitive_reports.py", import.meta.url),
  "utf8"
);
assert(
  reportsRaw.match(/"pill-box-planner":\s*\{[\s\S]*?"playable":\s*True/),
  "pill-box-planner must be marked playable: True in backend/cognitive_reports.py"
);

console.log(
  "pill-box-planner checks passed: medication library verified (dose units, realistic names, positive amounts), multi-knob scenarios, rule-switch tracking, evaluation & scoring, and system registry intact."
);
