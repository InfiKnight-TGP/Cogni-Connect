import assert from "node:assert/strict";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { isOpenAt } from "../../../lib/places.ts";

const sourceUrl = new URL("./scenarios.ts", import.meta.url);
const runtimeUrl = new URL("./scenarios.check.runtime.ts", import.meta.url);
const source = (await readFile(sourceUrl, "utf8")).replace('"@/lib/places"', '"../../../lib/places.ts"');
await writeFile(runtimeUrl, source, "utf8");
let buildPlaceScenarioQuestions;
try {
  ({ buildPlaceScenarioQuestions } = await import(runtimeUrl.href));
} finally {
  await unlink(runtimeUrl);
}

function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }; }
const places = [
  { id: "home", name: "Home", category: "home", photo: null, hours: { opensAt: "00:00", closesAt: "23:59", closedDays: [] } },
  { id: "doctor", name: "Clinic", category: "doctor", photo: null, hours: { opensAt: "09:00", closesAt: "17:00", closedDays: ["Sunday"] } },
  { id: "shop", name: "Shop", category: "shop", photo: null, hours: { opensAt: "20:00", closesAt: "02:00", closedDays: ["Monday"] } },
  { id: "park", name: "Park", category: "park", photo: null, hours: { opensAt: "06:00", closesAt: "21:00", closedDays: [] } },
];
assert.deepEqual(buildPlaceScenarioQuestions(places.slice(0, 2), 2, seeded(1)), []);
assert.deepEqual(buildPlaceScenarioQuestions(places.map(place => ({ ...place, hours: place.id === "doctor" ? place.hours : null })), 2, seeded(2)), []);
for (const [knob, count, optionCount] of [[1, 2, 2], [2, 3, 3], [3, 3, 4], [4, 3, 4]]) {
  const questions = buildPlaceScenarioQuestions(places, knob, seeded(knob));
  assert.equal(questions.length, count);
  for (const question of questions) {
    assert.equal(question.options.length, optionCount);
    assert.equal(new Set(question.options.map(place => place.id)).size, optionCount);
    assert.ok(question.options.some(place => place.id === question.answerId));
    if (question.kind === "open") {
      const [clock, period] = question.time.split(" ");
      const [hourText, minuteText = "00"] = clock.split(":");
      const hour = Number(hourText) % 12 + (period === "PM" ? 12 : 0);
      const local = `${String(hour).padStart(2, "0")}:${minuteText}`;
      assert.equal(question.options.filter(place => isOpenAt(place, question.weekday, local)).length, 1);
    }
  }
  if (knob >= 3) assert.ok(questions.some(question => question.kind === "open"));
}
console.log("Map Navigator place scenario checks passed: eligibility, ambiguity, options, and answers");
