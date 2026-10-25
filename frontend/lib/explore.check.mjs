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

// D. Edge cases: empty or invalid date (empty label)
assert.equal(formatFriendlyDate('', 'en', baseDate), '');
assert.equal(formatFriendlyDate(null, 'en', baseDate), '');
assert.equal(formatFriendlyDate('not-a-date', 'en', baseDate), '');
assert.equal(parseLocalDate('not-a-date'), null);
assert.equal(parseLocalDate(''), null);
assert.equal(parseLocalDate(null), null);
assert.equal(parseLocalDate(undefined), null);

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

// 3. Multi-timezone checks with dates around midnight
// TZ offsets to test: Asia/Kolkata (UTC+5:30), America/Los_Angeles (UTC-7/UTC-8), UTC
import { parseLocalDate, getMemoryDateCategory } from './date-format.ts';
const timezones = ['Asia/Kolkata', 'America/Los_Angeles', 'UTC'];
for (const tz of timezones) {
  process.env.TZ = tz;

  // Verify parseLocalDate produces the same local year, month, day across all timezones
  const parsed = parseLocalDate('2026-10-24');
  assert.equal(parsed.getFullYear(), 2026, `${tz}: year should be 2026`);
  assert.equal(parsed.getMonth(), 9, `${tz}: month should be October (9)`);
  assert.equal(parsed.getDate(), 24, `${tz}: date should be 24`);

  // Test with times around midnight:
  // a) 1 second after midnight: 00:00:01
  // b) 1 second before midnight: 23:59:59
  // c) Noon: 12:00:00
  const midnightCases = [
    new Date(2026, 9, 24, 0, 0, 1),
    new Date(2026, 9, 24, 23, 59, 59),
    new Date(2026, 9, 24, 12, 0, 0),
  ];

  for (const refNow of midnightCases) {
    // Today
    assert.equal(formatFriendlyDate('2026-10-24', 'en', refNow), 'Today', `${tz}: today should be Today`);
    assert.equal(getMemoryDateCategory('2026-10-24', refNow), 'today', `${tz}: category today`);

    // Yesterday
    assert.equal(formatFriendlyDate('2026-10-23', 'en', refNow), 'Yesterday', `${tz}: yesterday should be Yesterday`);
    assert.equal(getMemoryDateCategory('2026-10-23', refNow), 'this_week', `${tz}: category this_week for yesterday`);

    // Earlier this week (days 2 to 7)
    assert.equal(formatFriendlyDate('2026-10-22', 'en', refNow), 'Thursday 22 October');
    assert.equal(getMemoryDateCategory('2026-10-22', refNow), 'this_week');
    assert.equal(getMemoryDateCategory('2026-10-17', refNow), 'this_week', `${tz}: boundary day 7 should be this_week`);

    // Day 8 (Earlier)
    assert.equal(getMemoryDateCategory('2026-10-16', refNow), 'earlier', `${tz}: boundary day 8 should be earlier`);
    assert.equal(getMemoryDateCategory('2026-09-01', refNow), 'earlier');

    // Test grouping into Today, This week, Earlier under this TZ and midnight case
    const tzMemories = [
      { id: 't1', date: '2026-10-24', title: 'T1' },
      { id: 'w1', date: '2026-10-23', title: 'W1' },
      { id: 'w2', date: '2026-10-17', title: 'W2' },
      { id: 'e1', date: '2026-10-16', title: 'E1' },
    ];
    const tzGroups = groupMemoriesByDate(tzMemories, 'en', refNow);
    assert.equal(tzGroups.length, 3, `${tz}: should have 3 groups`);
    assert.equal(tzGroups[0].label, 'Today');
    assert.deepEqual(tzGroups[0].items.map((m) => m.id), ['t1']);
    assert.equal(tzGroups[1].label, 'This week');
    assert.deepEqual(tzGroups[1].items.map((m) => m.id), ['w1', 'w2']);
    assert.equal(tzGroups[2].label, 'Earlier');
    assert.deepEqual(tzGroups[2].items.map((m) => m.id), ['e1']);
  }
}

console.log('explore date format and grouping checks passed (including multi-TZ midnight tests)');

