import assert from "node:assert/strict";
import { buildYesterdayChoices } from "./yesterday-quiz.ts";

const memories = [
  { id: "memory-a", label: "We had tea together" },
  { id: "memory-b", label: "I visited the garden" },
  { id: "memory-c", label: "My family called" },
  { id: "memory-d", label: "We listened to music" },
  { id: "memory-e", label: "I watered the plants" },
];

const easy = buildYesterdayChoices(memories, "memory-a", 1, 0);
assert.equal(easy.length, 2);
assert.deepEqual(new Set(easy.map(option => option.id)), new Set(["memory-a", "dont-remember"]));

const harder = buildYesterdayChoices(memories, "memory-a", 4, 0);
assert.equal(harder.length, 5);
assert.ok(harder.some(option => option.id === "memory-a"));
assert.ok(harder.some(option => option.id === "dont-remember"));
assert.equal(new Set(harder.map(option => option.id)).size, harder.length);
assert.notEqual(
  harder.findIndex(option => option.id === "memory-a"),
  buildYesterdayChoices(memories, "memory-a", 4, 1).findIndex(option => option.id === "memory-a"),
);

const limitedMemories = buildYesterdayChoices(memories.slice(0, 1), "memory-a", 4, 0);
assert.equal(limitedMemories.length, 2);
assert.throws(() => buildYesterdayChoices(memories, "missing", 2, 0), /saved memory/);

console.log("Yesterday Quiz checks passed: adaptive choices, safe fallback, stable answers and varied positions");
