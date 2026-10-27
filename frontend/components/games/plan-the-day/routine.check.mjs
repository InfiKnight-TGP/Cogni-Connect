import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRoutineQuestions, hasUsableRoutine } from "./routineLogic.ts";

function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }; }
const steps = ["Wake up", "Have tea", "Take medicine", "Get dressed", "Eat breakfast"];
assert.deepEqual(buildRoutineQuestions(["Wake up", "Have tea"], 4, seeded(1)), []);
assert.equal(hasUsableRoutine(["Wake up", "Have tea"]), false);
assert.equal(hasUsableRoutine(steps), true);
assert.equal(hasUsableRoutine(["Repeat", "Repeat", "Repeat"]), false);
for (const [knob, count, options] of [[1, 1, 2], [2, 1, 3], [3, 2, 4], [4, 3, 4]]) {
  const questions = buildRoutineQuestions(steps, knob, seeded(knob));
  assert.equal(questions.length, count);
  for (const question of questions) {
    assert.equal(question.options.length, options);
    assert.equal(new Set(question.options).size, options);
    assert.ok(question.options.includes(question.answer));
    if (question.kind === "missing") assert.equal(question.display.length, steps.length - 1);
  }
}
assert.equal(buildRoutineQuestions(steps, 2, seeded(2))[0].kind, "after");
const index = await readFile(new URL("./index.tsx", import.meta.url), "utf8");
assert.match(index, /hasUsableRoutine\(steps\)/);
assert.match(index, /routineQuestions/);
const locales = await readFile(new URL("../../../lib/interaction/locales.check.mjs", import.meta.url), "utf8");
for (const phrase of ["What comes after {step}?", "What do you do first in your day?", "Which step is missing?"]) assert.ok(locales.includes(phrase));
console.log("Plan the Day routine checks passed: knobs, fallback, options, correct answers, and locale coverage");
