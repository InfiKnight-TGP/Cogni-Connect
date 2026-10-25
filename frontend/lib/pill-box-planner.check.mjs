import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

console.log("Running Pill Box Planner safety and invariant checks...");

// Files to audit for safety compliance
const filesToAudit = [
  { name: "data.ts", url: new URL("../components/games/pill-box-planner/data.ts", import.meta.url) },
  { name: "logic.ts", url: new URL("../components/games/pill-box-planner/logic.ts", import.meta.url) },
  { name: "index.tsx", url: new URL("../components/games/pill-box-planner/index.tsx", import.meta.url) },
  { name: "README.md", url: new URL("../components/games/pill-box-planner/README.md", import.meta.url) },
];

// Safety Blocklist Definitions
const FORBIDDEN_WORDS = [
  /\bmedicines?\b/i,
  /\bmedications?\b/i,
  /\bdoses?\b/i,
  /\bdosages?\b/i,
  /\btablets?\b/i,
  /\bcapsules?\b/i,
];

const FORBIDDEN_DOSE_UNITS = [
  /(?<![a-zA-Z0-9_-])(?:\d+\s*)?mg(?![a-zA-Z0-9_-])/i,
  /(?<![a-zA-Z0-9_-])(?:\d+\s*)?ml(?![a-zA-Z0-9_-])/i,
  /(?<![a-zA-Z0-9_-])(?:\d+\s*)?mcg(?![a-zA-Z0-9_-])/i,
  /(?<![a-zA-Z0-9_-])(?:\d+\s*)?iu(?![a-zA-Z0-9_-])/i,
  /(?<![a-zA-Z0-9_-])(?:\d+\s*)?drops(?![a-zA-Z0-9_-])/i,
];

const FORBIDDEN_DRUG_NAMES = [
  /\bparacetamol\b/i,
  /\baspirin\b/i,
  /\bibuprofen\b/i,
  /\bmetformin\b/i,
  /\binsulin\b/i,
  /\bamoxicillin\b/i,
  /\batorvastatin\b/i,
  /\bomeprazole\b/i,
  /\bamlodipine\b/i,
  /\bcrocin\b/i,
  /\bdolo\b/i,
  /\bcalpol\b/i,
  /\btylenol\b/i,
  /\badvil\b/i,
  /\beye\s*drops\b/i,
  /\bcough\s*syrup\b/i,
  /\b\w+cillin\b/i,
  /\b\w+pril\b/i,
  /\b\w+statin\b/i,
  /\b\w+sartan\b/i,
  /\b\w+olol\b/i,
  /\b\w+zepam\b/i,
  /\b\w+floxacin\b/i,
];

export function auditContent(filename, content) {
  const fileViolations = [];
  for (const regex of FORBIDDEN_WORDS) {
    const match = content.match(regex);
    if (match) fileViolations.push(`[${filename}] Forbidden word detected: "${match[0]}"`);
  }
  for (const regex of FORBIDDEN_DOSE_UNITS) {
    const match = content.match(regex);
    if (match) fileViolations.push(`[${filename}] Dose unit detected: "${match[0]}"`);
  }
  for (const regex of FORBIDDEN_DRUG_NAMES) {
    const match = content.match(regex);
    if (match) fileViolations.push(`[${filename}] Real medicine name/suffix detected: "${match[0]}"`);
  }
  return fileViolations;
}

// 1. Verify that the safety check FAILS against the old data
const sampleOldData = `
  const MEDICATIONS = [
    { name: "Paracetamol", dose: "500 mg", count: "1 tablet" },
    { name: "Metformin", dose: "500 mg", count: "1 tablet" },
    { name: "Atorvastatin", dose: "10 mg", count: "1 tablet" },
    { name: "Amoxicillin", dose: "250 mg", count: "1 capsule" },
    { name: "Lisinopril", dose: "5 mg", count: "1 tablet" },
    { name: "Eye Drops", dose: "2 drops" },
    { name: "Cough Syrup", dose: "10 ml" },
    { name: "Vitamin D3", dose: "60000 IU", count: "1 capsule" },
  ];
`;
const oldViolations = auditContent("old_data_sample.ts", sampleOldData);
assert(
  oldViolations.length >= 10,
  "Safety check must fail against old data (found " + oldViolations.length + " violations)"
);
console.log(`Verified safety check fails against old data (${oldViolations.length} violations detected).`);

// 2. Audit current active files
const violations = [];
for (const f of filesToAudit) {
  let content = "";
  try {
    content = await readFile(f.url, "utf8");
  } catch {
    continue;
  }
  const fileViolations = auditContent(f.name, content);
  violations.push(...fileViolations);
}

if (violations.length > 0) {
  console.error("SAFETY VIOLATIONS FOUND (" + violations.length + "):");
  violations.forEach((v) => console.error("  - " + v));
  throw new Error(`Safety audit failed with ${violations.length} violations.`);
}

console.log("Safety audit passed: 0 forbidden words, dose units, or drug names found across all files.");

// Dynamic import of safe data and logic
const {
  PILL_COLORS,
  WEEK_DAYS,
  DAY_TIMES,
  KNOB_SCENARIOS,
  EXPAND_RULE,
} = await import("../components/games/pill-box-planner/data.ts");

const {
  evaluateRoundPlacements,
  calculatePillBoxSessionScore,
  getScenariosForKnob,
} = await import("../components/games/pill-box-planner/logic.ts");

// 1. Colour Invariant: Only red, blue, yellow, green
assert.deepEqual(
  Object.keys(PILL_COLORS).sort(),
  ["blue", "green", "red", "yellow"],
  "Only red, blue, yellow, green are allowed"
);
for (const color of Object.values(PILL_COLORS)) {
  assert(color.name, `Missing colour name for ${color.id}`);
  assert(color.hex, `Missing hex color for ${color.id}`);
  assert(color.bgClass, `Missing bgClass for ${color.id}`);
  assert(color.textClass, `Missing textClass for ${color.id}`);
}

// 2. Schedule Structure: 7 Days x 3 Times
assert.equal(WEEK_DAYS.length, 7, "Weekly schedule must have 7 days");
assert.equal(DAY_TIMES.length, 3, "Schedule must have 3 times: morning, afternoon, night");
assert.deepEqual(
  WEEK_DAYS,
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
);
assert.deepEqual(DAY_TIMES, ["morning", "afternoon", "night"]);

// 3. Permanent Safety Banner Verification
const indexContent = await readFile(
  new URL("../components/games/pill-box-planner/index.tsx", import.meta.url),
  "utf8"
);
assert(
  indexContent.includes("Practice only. This is not medical advice."),
  'Permanent banner "Practice only. This is not medical advice." missing in index.tsx'
);

// 4. Knobs & Rule Scenarios Validation
for (const knob of [1, 2, 3, 4]) {
  const scenarios = getScenariosForKnob(knob, KNOB_SCENARIOS);
  assert.equal(scenarios.length, 3, `Knob ${knob} must have exactly 3 rounds`);

  for (const sc of scenarios) {
    assert(sc.rules.length >= 1, `Scenario ${sc.id} has no rules`);
    const seenPills = new Set();

    for (const rule of sc.rules) {
      assert(
        ["red", "blue", "yellow", "green"].includes(rule.pillColor),
        `Invalid pill color in rule: ${rule.pillColor}`
      );
      assert(!seenPills.has(rule.pillColor), `Duplicate rule for pill ${rule.pillColor}`);
      seenPills.add(rule.pillColor);

      // Verify instruction text has no forbidden words
      assert(!/medicine|medication|dose|tablet|capsule|mg|ml/i.test(rule.instruction));

      // Rule must expand to at least 1 valid compartment
      const targets = EXPAND_RULE(rule);
      assert(targets.size > 0, `Rule expanded to 0 target compartments: ${rule.instruction}`);
    }
  }

  if (knob === 1) {
    // Knob 1: 2 pills with row hints
    for (const sc of scenarios) {
      assert(sc.rules.length <= 2, "Knob 1 must have at most 2 pills");
    }
  } else if (knob === 3) {
    // Knob 3: 3 pills with day rules in all rounds
    for (const sc of scenarios) {
      assert.equal(sc.rules.length, 3, "Knob 3 must have 3 pills in all rounds");
    }
  } else if (knob === 4) {
    // Knob 4: 4 pills and an exception rule in rounds 2 and 3
    assert(scenarios[1].hasException, "Knob 4 round 2 must have an exception rule");
    assert(scenarios[2].hasException, "Knob 4 round 3 must have an exception rule");
  }
}

// 5. Scoring & Fixes Test
const testRound = {
  id: "test-round",
  title: "Test Practice",
  rules: [
    { pillColor: "red", days: ["Monday", "Wednesday"], times: ["morning"] }, // 2 targets
    { pillColor: "blue", days: ["Friday"], times: ["night"] }, // 1 target
  ],
};
// Required compartments: Monday:morning:red, Wednesday:morning:red, Friday:night:blue (3 targets)

// Scenario A: Perfect initial placement
const perfectPlacements = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Wednesday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
];
const evalPerfect = evaluateRoundPlacements(testRound, perfectPlacements, []);
assert.equal(evalPerfect.roundScore, 100, "Perfect placement must score 100");
assert.equal(evalPerfect.missingCount, 0);
assert.equal(evalPerfect.extraCount, 0);

// Scenario B: 1 missing, 1 extra pill
// Placed: Monday:morning:red, Friday:night:blue, Saturday:night:blue (extra). Missing: Wednesday:morning:red.
const partialPlacements = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
  { day: "Saturday", time: "night", pill: "blue" }, // extra
];
const evalPartial = evaluateRoundPlacements(testRound, partialPlacements, []);
// Correct = 2. Extra = 1. Required = 3.
// Score = (2 / 3 - 0.05 * 1) * 100 = (0.6667 - 0.05) * 100 = 61.67 -> 62
assert.equal(evalPartial.correctInitial, 2);
assert.equal(evalPartial.missingCount, 1);
assert.equal(evalPartial.extraCount, 1);
assert.equal(evalPartial.roundScore, 62);

// Scenario C: One fix per round (corrected compartment counts half)
// In the fix, Wednesday:morning:red is added, Saturday:night:blue is removed.
const fixedPlacements = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
  { day: "Wednesday", time: "morning", pill: "red" }, // Corrected during fix!
];
const evalAfterFix = evaluateRoundPlacements(testRound, partialPlacements, fixedPlacements);
// Initial correct = 2. Corrected in fix = 1 (counts half = 0.5).
// Effective correct = 2 + 0.5 = 2.5. Extra = 0. Required = 3.
// Score = (2.5 / 3) * 100 = 83.33 -> 83
assert.equal(evalAfterFix.correctedInFix, 1);
assert.equal(evalAfterFix.roundScore, 83);

// Scenario D: The Exception Rule verification
const exceptionScenario = {
  id: "exception-test-round",
  title: "Exception Test",
  rules: [
    {
      pillColor: "red",
      days: [...WEEK_DAYS],
      times: ["morning"],
      exceptionDay: "Sunday",
      instruction: "Red pill: morning every day, but skip the red pill on Sunday.",
    },
  ],
};
const exceptionTargets = EXPAND_RULE(exceptionScenario.rules[0]);
// Must have 6 days (Monday..Saturday), NOT Sunday
assert.equal(exceptionTargets.size, 6, "Exception rule must exclude Sunday");
assert(!exceptionTargets.has("Sunday:morning:red"), "Sunday:morning:red must be excluded");
assert(exceptionTargets.has("Monday:morning:red"), "Monday:morning:red must be included");
assert(exceptionTargets.has("Saturday:morning:red"), "Saturday:morning:red must be included");

// If patient places on Sunday morning anyway, it must count as extra
const placedWithSunday = [
  ...Array.from(exceptionTargets).map((k) => {
    const [d, t, p] = k.split(":");
    return { day: d, time: t, pill: p };
  }),
  { day: "Sunday", time: "morning", pill: "red" }, // Forbidden placement!
];
const evalWithSunday = evaluateRoundPlacements(exceptionScenario, placedWithSunday);
assert.equal(evalWithSunday.missingCount, 0, "No missing targets");
assert.equal(evalWithSunday.extraCount, 1, "Sunday placement must count as extra");
assert.equal(evalWithSunday.extraKeys[0], "Sunday:morning:red");
assert.equal(
  evalWithSunday.roundScore,
  Math.round((1 - 0.05 * 1) * 100),
  "Round score penalized by 0.05 for extra pill"
);

// 6. Invariant: Never Impossible & Never a Duplicate Rule across all knobs
for (const knob of [1, 2, 3, 4]) {
  const scenarios = getScenariosForKnob(knob, KNOB_SCENARIOS);
  for (const sc of scenarios) {
    const seenRulePills = new Set();
    const scTargets = new Set();

    for (const rule of sc.rules) {
      // Never duplicate rule for same colour in a scenario
      assert(
        !seenRulePills.has(rule.pillColor),
        `Duplicate rule for ${rule.pillColor} in scenario ${sc.id}`
      );
      seenRulePills.add(rule.pillColor);

      // Rule must produce at least 1 valid target (never impossible / empty)
      const ruleTargets = EXPAND_RULE(rule);
      assert(
        ruleTargets.size > 0,
        `Rule for ${rule.pillColor} in scenario ${sc.id} has 0 targets (impossible)`
      );

      // Verify all target keys map to valid days and times
      for (const key of ruleTargets) {
        const [day, time, col] = key.split(":");
        assert(WEEK_DAYS.includes(day), `Invalid day in target: ${day}`);
        assert(DAY_TIMES.includes(time), `Invalid time in target: ${time}`);
        assert(["red", "blue", "yellow", "green"].includes(col));
        scTargets.add(key);
      }
    }

    // Never impossible: total required must be between 1 and 84
    assert(scTargets.size >= 2, `Scenario ${sc.id} has too few targets: ${scTargets.size}`);
    assert(scTargets.size <= 84, `Scenario ${sc.id} exceeds max capacity: ${scTargets.size}`);
  }
}
console.log("Verified: all scenarios are possible, valid, non-empty, and free of duplicate rules.");

// 7. Registry & Cognitive Reports Descriptions Audit
const registryRaw = await readFile(
  new URL("../components/games/registry.ts", import.meta.url),
  "utf8"
);
assert(
  registryRaw.includes('Follow several rules at once (a weekly pill-box practice)'),
  "Registry description must match safe rewrite requirement"
);

const reportsRaw = await readFile(
  new URL("../../backend/cognitive_reports.py", import.meta.url),
  "utf8"
);
assert(
  reportsRaw.includes('Follow several rules at once (a weekly pill-box practice)'),
  "cognitive_reports.py description must match safe rewrite requirement"
);

console.log("All Pill Box Planner safety and rule-switching checks passed cleanly!");
