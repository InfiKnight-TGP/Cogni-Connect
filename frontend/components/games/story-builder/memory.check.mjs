import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stories } from "./data.ts";
import { buildPersonalStory, buildStorySession } from "./memoryStories.ts";

function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }; }
const first = { id: "1", friendlyDate: "Tuesday 2 January", weekday: "Tuesday", title: "Zoo", people: ["Asha"], place: "the zoo", activity: "You saw the animals.", note: "Day at the zoo" };
const second = { ...first, id: "2", weekday: "Friday", people: ["Ravi"], place: "the temple" };
const none = buildStorySession([], stories, 2, 3, seeded(1));
assert.equal(none.length, 2); assert.ok(none.every(story => stories.includes(story)));
assert.equal(buildStorySession([first], stories, 2, 3, seeded(1)).filter(story => story.personal).length, 1);
assert.equal(buildStorySession([first, second], stories, 2, 3, seeded(2)).filter(story => story.personal).length, 2);
assert.equal(buildStorySession([first, second], stories, 3, 4, seeded(3)).filter(story => story.personal).length, 2);
for (const [knob, options] of [[1, 2], [2, 3], [3, 4], [4, 4]]) {
  const story = buildPersonalStory(first, [first, second], options, seeded(knob));
  assert.deepEqual(story.blanks.map(blank => blank.kind), ["weekday", "place", "person"]);
  for (const blank of story.blanks) {
    assert.equal(blank.options.length, options);
    assert.equal(new Set(blank.options).size, options);
    assert.equal(blank.options.filter(value => value === blank.answer).length, 1);
  }
  assert.ok(story.blanks[2].options.every(value => !/^(Priya|Ramesh|Sunita|Ankit|Lakshmi|Rajesh|Meena|Suresh|Geeta|Vikram|Kavita|Mohan|Aarti|Deepa|Sanjay)$/.test(value)));
}
const component = await readFile(new URL("./index.tsx", import.meta.url), "utf8");
assert.match(component, /\/memories\/facts/);
assert.match(component, /currentStoryIdx \+ 1/);
const locales = await readFile(new URL("../../../lib/interaction/locales.check.mjs", import.meta.url), "utf8");
for (const phrase of ["On {weekday}, you went to {place}.", "You were with {person}.", "A memory from your life"]) assert.ok(locales.includes(phrase));
console.log("Story Builder memory checks passed: fallback, session mix, distractors, and knob option counts");
