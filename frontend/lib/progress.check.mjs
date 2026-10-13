// Run from frontend/: node lib/progress.check.mjs
// Checks the Progress page / report maths.
import assert from "node:assert/strict";
import {
  daysPlayedThisWeek, dayKey, declines, lastFourWeeks, skillArea, gameArea, toEntries, trend, weeklyAverages,
  buildRadarChartData, patientStatsFromEntries,
} from "./progress.ts";

const today = new Date(2026, 9, 9); // Fri 9 Oct 2026, local time
assert.equal(dayKey(today), "2026-10-09");

// skills & game IDs -> the 4 caregiver areas; unknown skills have no area
assert.equal(skillArea("Working Memory"), "Memory");
assert.equal(skillArea("sequencing"), "Executive Function");
assert.equal(skillArea("spatial"), "Recognition & Orientation");
assert.equal(skillArea("attention"), "Attention");
assert.equal(skillArea("juggling"), undefined);
assert.equal(gameArea("plan-the-day"), "Executive Function");
assert.equal(gameArea("map-navigator"), "Recognition & Orientation");
assert.equal(gameArea("face-recognition"), "Recognition & Orientation");
assert.equal(gameArea("name-recognition"), "Recognition & Orientation");
assert.equal(gameArea("context-recall"), "Memory");

// /performance -> entries; old quiz rows (ISO, no skill/level) count as Easy Memory
const entries = toEntries({
  scores: [
    { score: 60, date: new Date(2026, 9, 8).toISOString() },
    { score: 80, date: "2026-10-09", game_id: "daily_recall", level: 1, skill: "personal memory" },
    { score: "x", date: "2026-10-09" },
  ],
  game_scores: [
    { game_id: "mole-path", level: 2, skill: "working memory", score: 50, date: "2026-09-14" },
    { game_id: "map-navigator", level: 3, skill: "spatial", score: 30, date: "2026-10-05" },
    { game_id: "odd", level: 7, skill: "attention", score: 30, date: "2026-10-05" },
  ],
});
assert.deepEqual(entries.map((e) => [e.day, e.level, e.area, e.score]), [
  ["2026-10-08", 1, "Memory", 60],
  ["2026-10-09", 1, "Memory", 80],
  ["2026-09-14", 2, "Memory", 50],
  ["2026-10-05", 3, "Recognition & Orientation", 30],
]);

// 4 weeks ending today: 12-18 Sep, 19-25 Sep, 26 Sep-2 Oct, 3-9 Oct
const weeks = lastFourWeeks(today);
assert.deepEqual(weeks.map((w) => [w.start, w.end, w.label]), [
  ["2026-09-12", "2026-09-18", "12 Sep"],
  ["2026-09-19", "2026-09-25", "19 Sep"],
  ["2026-09-26", "2026-10-02", "26 Sep"],
  ["2026-10-03", "2026-10-09", "This week"],
]);
assert.deepEqual(weeklyAverages(entries, weeks, (e) => e.area), {
  Memory: [50, null, null, 70],
  "Recognition & Orientation": [null, null, null, 30],
});
assert.deepEqual(weeklyAverages(entries, weeks, (e) => (e.level ? { 1: "Easy", 2: "Medium", 3: "Hard" }[e.level] : undefined)), {
  Easy: [null, null, null, 70],
  Medium: [50, null, null, null],
  Hard: [null, null, null, 30],
});

// Daily Recall breakdown split test:
// activity1 and activity2 count toward Recognition & Orientation, activity3 toward Memory ONLY for area charts.
// Level averages count Daily Recall once using its combined score.
const recallEntries = toEntries({
  scores: [
    {
      score: 85,
      date: "2026-10-09",
      game_id: "daily_recall",
      level: 1,
      breakdown: {
        activity1: 80,
        activity2: 90,
        activity3: 70,
      },
    },
  ],
});
const roEntries = recallEntries.filter((e) => e.area === "Recognition & Orientation");
assert.equal(roEntries.length, 1);
assert.equal(roEntries[0].score, 85); // average of 80 and 90
const memEntries = recallEntries.filter((e) => e.area === "Memory");
assert.equal(memEntries.length, 1);
assert.equal(memEntries[0].score, 70); // activity 3
const lvlEntries = recallEntries.filter((e) => e.level !== undefined);
assert.equal(lvlEntries.length, 1);
assert.equal(lvlEntries[0].score, 85); // combined score counted ONCE

const recallByArea = weeklyAverages(recallEntries, weeks, (e) => e.area);
assert.deepEqual(recallByArea["Recognition & Orientation"], [null, null, null, 85]); // average of 80 and 90
assert.deepEqual(recallByArea["Memory"], [null, null, null, 70]); // activity 3
const recallByLevel = weeklyAverages(recallEntries, weeks, (e) => (e.level ? { 1: "Easy", 2: "Medium", 3: "Hard" }[e.level] : undefined));
assert.deepEqual(recallByLevel["Easy"], [null, null, null, 85]); // combined score counted ONCE

// New Daily Recall records count as individual games in each area's mean.
// This same day and input is asserted by the backend Report test (RO = 77).
const newRecallEntries = toEntries({
  game_scores: [
    { game_id: "face-recognition", level: 1, score: 80, date: "2026-10-11" },
    { game_id: "name-recognition", level: 1, score: 90, date: "2026-10-11" },
    { game_id: "context-recall", level: 1, score: 70, date: "2026-10-11" },
    { game_id: "map-navigator", level: 3, score: 60, date: "2026-10-11" },
  ],
});
const newRecallWeeks = lastFourWeeks(new Date(2026, 9, 11));
const newRecallByArea = weeklyAverages(newRecallEntries, newRecallWeeks, (e) => e.area);
assert.equal(newRecallByArea["Recognition & Orientation"][3], 77);
assert.equal(newRecallByArea.Memory[3], 70);

// Whichever exists: only activity1
const onlyA1 = toEntries({
  scores: [{ score: 80, date: "2026-10-09", game_id: "daily_recall", level: 1, breakdown: { activity1: 80 } }],
});
assert.equal(onlyA1.filter((e) => e.area === "Recognition & Orientation").length, 1);
assert.equal(onlyA1.find((e) => e.area === "Recognition & Orientation")?.score, 80);

// Whichever exists: only activity2
const onlyA2 = toEntries({
  scores: [{ score: 90, date: "2026-10-09", game_id: "daily_recall", level: 1, breakdown: { activity2: 90 } }],
});
assert.equal(onlyA2.filter((e) => e.area === "Recognition & Orientation").length, 1);
assert.equal(onlyA2.find((e) => e.area === "Recognition & Orientation")?.score, 90);

// Mon 5 Oct .. Sun 11 Oct
assert.deepEqual(daysPlayedThisWeek(entries, today), [true, false, false, true, true, false, false]);

// 5 drops in a row on played days (gaps allowed) -> one gentle note; 4 drops -> none
const planning = (days, scores) =>
  toEntries({ game_scores: days.map((d, i) => ({ game_id: "plan-the-day", level: 1, skill: "sequencing", score: scores[i], date: d })) });
const dropDays = ["2026-09-28", "2026-09-30", "2026-10-02", "2026-10-04", "2026-10-06", "2026-10-08"];
assert.deepEqual(declines(planning(dropDays, [90, 85, 80, 70, 65, 60]), today), [
  { area: "Executive Function", from: 90, to: 60, since: "2026-09-28" },
]);
assert.deepEqual(declines(planning(dropDays, [90, 85, 80, 70, 65, 66]), today), []); // last day went up
assert.deepEqual(declines(planning(dropDays.slice(1), [85, 80, 70, 65, 60]), today), []); // only 4 drops
assert.deepEqual(declines(planning(["2026-09-01", ...dropDays.slice(1)], [90, 85, 80, 70, 65, 60]), today), []); // outside 4 weeks

assert.equal(trend([50, null, null, 70]), "up");
assert.equal(trend([70, 68]), "steady");
assert.equal(trend([null, 80, 60, null]), "down");
assert.equal(trend([null, 80, null, null]), null);

// Radar chart null domain test:
// Unmeasured domains must remain null (never 0) with spanGaps: false
const radarData = buildRadarChartData({
  Memory: 80,
  Attention: null,
  "Executive Function": 90,
  "Recognition & Orientation": null,
});
assert.deepEqual(radarData.labels, ["Memory", "Attention", ["Executive", "Function"], ["Recognition", "&", "Orientation"]]);
assert.equal(radarData.datasets[0].spanGaps, false);
assert.equal(radarData.datasets[0].data[0], 80); // Memory: 80
assert.equal(radarData.datasets[0].data[1], null); // Attention: stays null, never 0
assert.equal(radarData.datasets[0].data[2], 90); // Executive Function: 90
assert.equal(radarData.datasets[0].data[3], null); // Recognition & Orientation: stays null, never 0
const emptyRadarData = buildRadarChartData({
  Memory: null,
  Attention: null,
  "Executive Function": null,
  "Recognition & Orientation": null,
});
assert.deepEqual(emptyRadarData.datasets[0].data, [null, null, null, null]);

// Patient stats normalize ISO timestamps to local days, count Daily Recall once, and ignore replays.
const patientStats = patientStatsFromEntries(
  toEntries({
    scores: [
      { score: 90, date: new Date(2026, 9, 9).toISOString() },
      { score: 70, date: "2026-10-08", game_id: "daily_recall", level: 1 },
    ],
    game_scores: [
      { game_id: "mole-path", level: 2, score: 40, date: "2026-10-09" },
      { game_id: "mole-path", level: 2, score: 85, date: "2026-10-09" },
      { game_id: "mole-path", level: 2, score: 85, date: "2026-10-09" },
      { game_id: "odd-one-out", level: 1, score: 60, date: "2026-10-03" },
    ],
  }),
  today,
);
assert.equal(patientStats.streak, 2); // ISO Daily Recall today and Daily Recall yesterday
assert.equal(patientStats.doneToday, 2); // Daily Recall and mole-path
assert.equal(patientStats.starsThisWeek, 3 + 2 + 3); // recall on each day and best mole-path replay
assert.equal(patientStatsFromEntries(toEntries({ scores: [{ score: 50, date: "2026-10-08" }] }), today).streak, 1);
assert.equal(patientStatsFromEntries(toEntries({}), today).streak, 0);
const bundledStats = patientStatsFromEntries(toEntries({
  game_scores: [
    { game_id: "face-recognition", level: 1, score: 50, date: "2026-10-09" },
    { game_id: "context-recall", level: 1, score: 70, date: "2026-10-09" },
    { game_id: "name-recognition", level: 1, score: 80, date: "2026-10-09" },
  ],
}), today);
assert.equal(bundledStats.doneToday, 2); // My Day plus standalone Name Recall.
assert.equal(bundledStats.starsThisWeek, 5); // My Day average (60) plus Name Recall (80).
const incompleteMyDay = patientStatsFromEntries(toEntries({
  game_scores: [
    { game_id: "face-recognition", level: 1, score: 80, date: "2026-10-09" },
    { game_id: "name-recognition", level: 1, score: 90, date: "2026-10-09" },
  ],
}), today);
assert.equal(incompleteMyDay.doneToday, 1); // Name Recall counts; My Day still needs Relive Memories.

console.log("progress checks passed");
