// Run from frontend/: node lib/explore.check.mjs
import assert from 'node:assert/strict';
import { formatFriendlyDate, groupMemoriesByDate } from './date-format.ts';

// 1. Test formatFriendlyDate
// Using a reference base date: Saturday 24 October 2026
const baseDate = new Date(2026, 9, 24); // Month is 0-indexed: 9 = October

// A. Today (2026-10-24)
assert.equal(formatFriendlyDate('2026-10-24', 'en', baseDate), 'Today');
assert.equal(formatFriendlyDate('2026-10-24', 'hi', baseDate), 'आज');
assert.equal(formatFriendlyDate('2026-10-24', 'as', baseDate), 'আজি');

// B. Yesterday (2026-10-23)
assert.equal(formatFriendlyDate('2026-10-23', 'en', baseDate), 'Yesterday');
assert.equal(formatFriendlyDate('2026-10-23', 'hi', baseDate), 'कल');
assert.equal(formatFriendlyDate('2026-10-23', 'as', baseDate), 'কালি');

// C. Weekday date older than yesterday (e.g. Monday 19 October 2026)
assert.equal(formatFriendlyDate('2026-10-19', 'en', baseDate), 'Monday 19 October');
assert.equal(formatFriendlyDate('2026-10-19', 'hi', baseDate), 'सोमवार 19 अक्टूबर');
assert.equal(formatFriendlyDate('2026-10-19', 'as', baseDate), 'সোমবাৰ 19 অক্টোবৰ');

// D. Edge cases: empty or invalid date
assert.equal(formatFriendlyDate('', 'en', baseDate), '');
assert.equal(formatFriendlyDate(null, 'en', baseDate), '');
assert.equal(formatFriendlyDate('not-a-date', 'en', baseDate), 'not-a-date');

// Also test formatFriendlyDate without baseDate (using current system date dynamically)
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const yest = new Date(now.getTime() - 86400000);
const yestStr = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
assert.equal(formatFriendlyDate(todayStr, 'en'), 'Today');
assert.equal(formatFriendlyDate(todayStr, 'hi'), 'आज');
assert.equal(formatFriendlyDate(todayStr, 'as'), 'আজি');
assert.equal(formatFriendlyDate(yestStr, 'en'), 'Yesterday');
assert.equal(formatFriendlyDate(yestStr, 'hi'), 'कल');
assert.equal(formatFriendlyDate(yestStr, 'as'), 'কালি');

// 2. Test groupMemoriesByDate
// Boundaries:
// - Today: diffDays === 0
// - This week: diffDays > 0 && diffDays <= 7 (days 1 through 7)
// - Earlier: diffDays > 7 (day 8+) or missing date
const sampleMemories = [
  { id: 'm-today', date: '2026-10-24', title: 'Today memory' },
  { id: 'm-yest', date: '2026-10-23', title: 'Yesterday (day 1)' },
  { id: 'm-day3', date: '2026-10-21', title: 'Midweek (day 3)' },
  { id: 'm-day7', date: '2026-10-17', title: 'End of week (day 7 boundary)' },
  { id: 'm-day8', date: '2026-10-16', title: 'Day 8 boundary (Earlier)' },
  { id: 'm-old', date: '2026-09-01', title: 'Old memory' },
  { id: 'm-nodate', title: 'No date memory' },
];

// English grouping
const groupsEn = groupMemoriesByDate(sampleMemories, 'en', baseDate);
assert.equal(groupsEn.length, 3, 'Should have Today, This week, and Earlier groups');
assert.equal(groupsEn[0].label, 'Today');
assert.deepEqual(groupsEn[0].items.map((m) => m.id), ['m-today']);

assert.equal(groupsEn[1].label, 'This week');
assert.deepEqual(groupsEn[1].items.map((m) => m.id), ['m-yest', 'm-day3', 'm-day7']);

assert.equal(groupsEn[2].label, 'Earlier');
assert.deepEqual(groupsEn[2].items.map((m) => m.id), ['m-day8', 'm-old', 'm-nodate']);

// Hindi grouping
const groupsHi = groupMemoriesByDate(sampleMemories, 'hi', baseDate);
assert.equal(groupsHi[0].label, 'आज');
assert.equal(groupsHi[1].label, 'इस सप्ताह');
assert.equal(groupsHi[2].label, 'पहले का');

// Assamese grouping
const groupsAs = groupMemoriesByDate(sampleMemories, 'as', baseDate);
assert.equal(groupsAs[0].label, 'আজি');
assert.equal(groupsAs[1].label, 'এই সপ্তাহত');
assert.equal(groupsAs[2].label, 'আগৰ');

// Empty memories test
assert.deepEqual(groupMemoriesByDate([], 'en', baseDate), []);

// Only today memories test
const onlyToday = [{ id: '1', date: '2026-10-24' }];
const todayOnlyGroups = groupMemoriesByDate(onlyToday, 'en', baseDate);
assert.equal(todayOnlyGroups.length, 1);
assert.equal(todayOnlyGroups[0].label, 'Today');

console.log('explore date format and grouping checks passed');
