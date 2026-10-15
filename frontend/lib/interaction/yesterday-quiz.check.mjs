import assert from "node:assert/strict";
import { buildYesterdayChoices, validMemoryDay } from "./yesterday-quiz.ts";

const memories = [
  { id: "memory-a", label: "We had tea together" },
  { id: "memory-b", label: "I visited the garden" },
  { id: "memory-c", label: "My family called" },
  { id: "memory-d", label: "We listened to music" },
  { id: "memory-e", label: "I watered the plants" },
].map((memory, index) => ({ ...memory, day: index === 0 ? '2026-10-13' : '2026-10-12' }));

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


const datedMemories = [
  { id: 'yesterday-tea', label: 'Tea with my family', day: '2026-10-13' },
  { id: 'yesterday-garden', label: 'Visited the garden', day: '2026-10-13' },
  { id: 'older-tea', label: 'TEA with my family!', day: '2026-10-12' },
  { id: 'older-garden', label: 'Visited the garden', day: '2026-10-12' },
  { id: 'older-music', label: 'Listened to music', day: '2026-10-12' },
];
const safeChoices = buildYesterdayChoices(datedMemories, 'yesterday-tea', 4, 0);
assert.deepEqual(new Set(safeChoices.map(choice => choice.id)), new Set(['yesterday-tea', 'older-music', 'dont-remember']),
  'Other yesterday entries and repeated summaries must never be scored as distractors');
for (const day of [undefined, '', '2026-02-30', '2026-13-01', 'not a date']) assert.equal(validMemoryDay(day), false);
assert.equal(validMemoryDay('2024-02-29'), true);
const uncertainDates = [...datedMemories, { id: 'missing-date', label: 'Went shopping' }, { id: 'future', label: 'Visited a friend', day: '2026-10-14' }];
assert.deepEqual(buildYesterdayChoices(uncertainDates, 'yesterday-tea', 4, 0), safeChoices);
assert.throws(() => buildYesterdayChoices(uncertainDates, 'missing-date', 2, 0), /saved memory/);
console.log("Yesterday Quiz checks passed: adaptive choices, date safety, repeated summaries and varied positions");
