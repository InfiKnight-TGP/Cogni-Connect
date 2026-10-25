import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

console.log("Running Pill Box Planner safety and invariant checks...");

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

// 2. Scan entire frontend/components/games/pill-box-planner folder
const plannerDir = new URL("../components/games/pill-box-planner/", import.meta.url);
const dirFiles = await readdir(plannerDir);
const violations = [];

for (const fileName of dirFiles) {
  const fileUrl = new URL(fileName, plannerDir);
  const content = await readFile(fileUrl, "utf8");
  const fileViolations = auditContent(`pill-box-planner/${fileName}`, content);
  violations.push(...fileViolations);
}

// 3. Scan hi/as strings for the game's phrases
const hi = JSON.parse(await readFile(new URL("./interaction/locales/hi.json", import.meta.url), "utf8"));
const as = JSON.parse(await readFile(new URL("./interaction/locales/as.json", import.meta.url), "utf8"));

const gameKeyPhrases = [
  "Pill Box Planner",
  "Practice only. This is not medical advice.",
  "Doctor's Note",
  "Pill",
  "Select Colour to Place",
  "Tap a compartment to place or remove",
  "Weekly Pill Box (7 Days)",
  "Check Placements",
  "Try a Fix",
  "Finish Round",
  "Confirm Fix",
  "Round Score",
  "Check complete. A few compartments need attention.",
  "Compartments with a dashed outline and 'Check this' label can be adjusted. You have one chance to make a fix (corrections count half).",
  "Follow several rules at once (a weekly pill-box practice)",
  "Organize your weekly pill box by following the rules on the practice card.",
  "Subah · Early day",
  "Dopahar · After lunch",
  "Raat · Before sleep",
  "Check this",
  "Yellow pill: Monday to Friday morning, but skip Wednesday.",
  "Nice work, you followed the rules.",
  "Good effort!",
  "Look again at the {color} pill: {instruction}",
  "View Summary",
  "Next Round",
];

for (const phrase of gameKeyPhrases) {
  const hiTrans = hi.ui?.[phrase] ?? "";
  const asTrans = as.ui?.[phrase] ?? "";
  violations.push(...auditContent(`hi.json[${phrase}]`, `${phrase} ${hiTrans}`));
  violations.push(...auditContent(`as.json[${phrase}]`, `${phrase} ${asTrans}`));
}

// 4. Scan registry entry, games.json, and cognitive_reports.py
const registryRaw = await readFile(new URL("../components/games/registry.ts", import.meta.url), "utf8");
const regMatch = registryRaw.match(/id:\s*"pill-box-planner"[\s\S]*?\}(?=,\s*\{|\s*\];)/);
if (regMatch) {
  violations.push(...auditContent("registry.ts(pill-box-planner)", regMatch[0]));
}

const gamesJsonRaw = JSON.parse(await readFile(new URL("../../backend/games.json", import.meta.url), "utf8"));
const gamesList = gamesJsonRaw.games || gamesJsonRaw;
const pillGameJson = gamesList.find((g) => g.id === "pill-box-planner");
if (pillGameJson) {
  violations.push(...auditContent("games.json(pill-box-planner)", JSON.stringify(pillGameJson)));
}

const reportsRaw = await readFile(new URL("../../backend/cognitive_reports.py", import.meta.url), "utf8");
const reportsMatch = reportsRaw.match(/"pill-box-planner":\s*\{[\s\S]*?\}(?=,\s*"\w)/);
if (reportsMatch) {
  violations.push(...auditContent("cognitive_reports.py(pill-box-planner)", reportsMatch[0]));
}

if (violations.length > 0) {
  console.error("SAFETY VIOLATIONS FOUND (" + violations.length + "):");
  violations.forEach((v) => console.error("  - " + v));
  throw new Error(`Safety audit failed with ${violations.length} violations.`);
}

console.log("Safety audit passed: 0 forbidden words, dose units, or drug names found across all project files, locales, and registries.");

// Dynamic import of safe data and logic
const {
  PILL_COLORS,
  WEEK_DAYS,
  DAY_TIMES,
  TIME_SLOT_META,
  KNOB_SCENARIOS,
  EXPAND_RULE,
} = await import("../components/games/pill-box-planner/data.ts");

const {
  evaluateRoundPlacements,
  calculatePillBoxSessionScore,
  getScenariosForKnob,
  createFinishGuard,
  findRuleHint,
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

// Time sublabels exist
assert.equal(TIME_SLOT_META.morning.subLabel, "Subah · Early day");
assert.equal(TIME_SLOT_META.afternoon.subLabel, "Dopahar · After lunch");
assert.equal(TIME_SLOT_META.night.subLabel, "Raat · Before sleep");

// 3. Permanent Safety Banner Verification inside JSX (not in comment)
const indexContent = await readFile(
  new URL("../components/games/pill-box-planner/index.tsx", import.meta.url),
  "utf8"
);
// Strip all comments
const strippedCode = indexContent
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*/g, "");

// Banner text must be rendered inside active JSX
assert(
  strippedCode.includes('t("Practice only. This is not medical advice.")') ||
    strippedCode.includes("Practice only. This is not medical advice."),
  'Permanent banner "Practice only. This is not medical advice." missing in active JSX element'
);
assert(
  strippedCode.includes('text={t("Practice only. This is not medical advice.")}') ||
    strippedCode.includes('text="Practice only. This is not medical advice."'),
  'Permanent banner must include ReadAloud speech rendered in active JSX'
);
assert(
  !strippedCode.includes("forceAutoRead"),
  "forceAutoRead must not be used on the banner; speech must respect read-aloud setting"
);

// Knob and Date check
assert(
  indexContent.includes('readSkill("pill-box-planner")'),
  'index.tsx must read skill knob via readSkill("pill-box-planner")'
);
assert(
  indexContent.includes("date?: string") && indexContent.includes("date={date}"),
  "index.tsx must accept date prop and pass date to GameShell"
);

// Finish once check: ref-guarded and summary Finish button is the only caller
assert(
  indexContent.includes("finishedRef"),
  "index.tsx must guard handleFinish with a ref"
);
assert(
  !indexContent.includes("handleFinishCallback(overallScore)"),
  "handleNextRound must not call handleFinish before summary screen"
);

// No numbers check: no raw scores or out of 100 shown to the patient
assert(!strippedCode.includes("Round Score"), "Must not display raw 'Round Score'");
assert(!strippedCode.includes("Overall Score"), "Must not display raw 'Overall Score'");
assert(!strippedCode.includes("Out of 100"), "Must not display 'Out of 100'");
assert(!strippedCode.includes("/ 100"), "Must not display '/ 100'");
assert(indexContent.includes("starsFor"), "Must use starsFor from lib/progress");

// SIZES CHECK: Game folder must have no text-xs or text-[Npx] where N < 16
for (const fileName of dirFiles) {
  const fileUrl = new URL(fileName, plannerDir);
  const content = await readFile(fileUrl, "utf8");
  assert(
    !/\btext-xs\b/.test(content),
    `[${fileName}] contains forbidden small size class 'text-xs'`
  );
  const arbitraryMatches = content.matchAll(/\btext-\[(\d+)px\]/g);
  for (const m of arbitraryMatches) {
    const px = parseInt(m[1], 10);
    assert(
      px >= 16,
      `[${fileName}] contains forbidden small size class 'text-[${px}px]' (must be >= 16px)`
    );
  }
}

// 4. Knobs & Rule Scenarios Validation + Rule Instruction vs Expansion comparison
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

      // Rule Text vs Expansion Integrity Check:
      const instLower = rule.instruction.toLowerCase();
      // Check colour match
      assert(
        instLower.includes(rule.pillColor),
        `Instruction "${rule.instruction}" does not mention colour ${rule.pillColor}`
      );

      // Check times match
      for (const time of rule.times) {
        if (time === "afternoon") {
          assert(
            instLower.includes("afternoon") || instLower.includes("lunch"),
            `Instruction "${rule.instruction}" missing afternoon/lunch timing`
          );
        } else {
          assert(
            instLower.includes(time),
            `Instruction "${rule.instruction}" missing ${time} timing`
          );
        }
      }

      // Check days and exception match
      if (rule.exceptionDay) {
        assert(
          instLower.includes(`skip`) && instLower.includes(rule.exceptionDay.toLowerCase()),
          `Instruction "${rule.instruction}" missing exception for ${rule.exceptionDay}`
        );
        // Expanded compartments must NOT have exception day
        for (const target of targets) {
          assert(
            !target.startsWith(`${rule.exceptionDay}:`),
            `Expanded compartments contains exception day ${rule.exceptionDay}`
          );
        }
      }

      if (rule.days.length === 7 && !rule.exceptionDay) {
        assert(
          instLower.includes("every day") || instLower.includes("daily"),
          `Instruction "${rule.instruction}" should state every day`
        );
      }
    }
  }

  if (knob === 1) {
    // Knob 1: 2 pills with row hints
    for (const sc of scenarios) {
      assert(sc.rules.length <= 2, "Knob 1 must have at most 2 pills");
      assert(sc.rowHints, "Knob 1 must have rowHints defined");
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
    // Verify knob 4 round 2 yellow rule natural wording
    const k4r2Yellow = scenarios[1].rules.find((r) => r.pillColor === "yellow");
    assert(k4r2Yellow, "Knob 4 round 2 missing yellow pill rule");
    assert.equal(
      k4r2Yellow.instruction,
      "Yellow pill: Monday to Friday morning, but skip Wednesday."
    );
    assert.equal(k4r2Yellow.exceptionDay, "Wednesday");
    assert.equal(k4r2Yellow.days.length, 5);
  }
}

// 5. Scoring & Fixes Test
const testRound = {
  id: "test-round",
  title: "Test Practice",
  rules: [
    {
      pillColor: "red",
      days: ["Monday", "Wednesday"],
      times: ["morning"],
      instruction: "Red pill: Monday and Wednesday morning.",
    },
    {
      pillColor: "blue",
      days: ["Friday"],
      times: ["night"],
      instruction: "Blue pill: Friday night.",
    },
  ],
};
// Required compartments: Monday:morning:red, Wednesday:morning:red, Friday:night:blue (3 targets)

// Scenario A: Perfect initial placement
const perfectPlacements = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Wednesday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
];
const evalPerfect = evaluateRoundPlacements(testRound, perfectPlacements, [], false);
assert.equal(evalPerfect.isPerfect, true, "Perfect placement must score 100 and have isPerfect true");
assert.equal(evalPerfect.roundScore, 100, "Perfect placement must score 100");
assert.equal(evalPerfect.missingCount, 0);
assert.equal(evalPerfect.extraCount, 0);

// Scenario B: 1 missing, 1 extra pill (fixUsed = false)
// Placed: Monday:morning:red, Friday:night:blue, Saturday:night:blue (extra). Missing: Wednesday:morning:red.
const partialPlacements = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
  { day: "Saturday", time: "night", pill: "blue" }, // extra
];
const evalPartial = evaluateRoundPlacements(testRound, partialPlacements, [], false);
// Correct = 2. Extra = 1. Required = 3.
// Score = (2 / 3 - 0.05 * 1) * 100 = (0.6667 - 0.05) * 100 = 61.67 -> 62
assert.equal(evalPartial.correctInitial, 2);
assert.equal(evalPartial.missingCount, 1);
assert.equal(evalPartial.extraCount, 1);
assert.equal(evalPartial.roundScore, 62);

// Scenario C: One fix per round (corrected compartment counts half, fixUsed = true)
// In the fix, Wednesday:morning:red is added, Saturday:night:blue is removed.
const fixedPlacements = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
  { day: "Wednesday", time: "morning", pill: "red" }, // Corrected during fix!
];
const evalAfterFix = evaluateRoundPlacements(testRound, partialPlacements, fixedPlacements, true);
// Initial retained = 2. Corrected in fix = 1 (counts half = 0.5).
// Effective correct = 2 + 0.5 = 2.5. Extra = 0. Required = 3.
// Score = (2.5 / 3) * 100 = 83.33 -> 83
assert.equal(evalAfterFix.correctedInFix, 1);
assert.equal(evalAfterFix.roundScore, 83);

// Scenario C2: A correct pill removed during the fix must not count as correct
const initialWithTwo = [
  { day: "Monday", time: "morning", pill: "red" },
  { day: "Friday", time: "night", pill: "blue" },
];
// User removed Monday:morning:red during fix
const fixWithRemoved = [
  { day: "Friday", time: "night", pill: "blue" },
];
const evalRemoved = evaluateRoundPlacements(testRound, initialWithTwo, fixWithRemoved, true);
assert.equal(evalRemoved.correctInitial, 1, "Removed pill must not count as correct (retainedInitial = 1)");
assert.equal(evalRemoved.correctedInFix, 0);
assert.equal(evalRemoved.missingCount, 2);
assert.equal(evalRemoved.roundScore, 33, "Score must reflect only currently retained pills");

// Scenario C3: An emptied fix (user removes all pills during fix)
const evalEmptied = evaluateRoundPlacements(testRound, initialWithTwo, [], true);
assert.equal(evalEmptied.correctInitial, 0, "Emptied fix must have 0 correct pills");
assert.equal(evalEmptied.correctedInFix, 0);
assert.equal(evalEmptied.missingCount, 3, "All 3 targets missing in emptied fix");
assert.equal(evalEmptied.roundScore, 0, "Emptied fix must score 0");

// Scenario C4: Finish guard ensures finish path cannot run twice
let finishCount = 0;
const finishCallback = (score) => { finishCount++; };
const guardedFinish = createFinishGuard(finishCallback);
const res1 = guardedFinish(90);
const res2 = guardedFinish(90);
assert.equal(res1, true, "First finish call must succeed");
assert.equal(res2, false, "Second finish call must be blocked");
assert.equal(finishCount, 1, "Finish callback must run exactly once");

// Scenario C5: Specific rule hint finder
const ruleHint = findRuleHint(testRound, ["Monday:morning:red"], []);
assert(ruleHint !== null, "Must find rule hint for missing red pill");
assert.equal(ruleHint.pillColor, "red");
assert(ruleHint.hintText.includes("red pill"), "Hint must mention red pill");

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
assert(
  registryRaw.includes('Follow several rules at once (a weekly pill-box practice)'),
  "Registry description must match safe rewrite requirement"
);

assert(
  reportsRaw.includes('Follow several rules at once (a weekly pill-box practice)'),
  "cognitive_reports.py description must match safe rewrite requirement"
);

console.log("All Pill Box Planner safety and rule-switching checks passed cleanly!");
