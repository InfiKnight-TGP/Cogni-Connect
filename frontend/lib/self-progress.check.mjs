import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  plural,
  getGreeting,
  calcWeekStrip,
  calcAreaStars,
  calcBadges,
  mergeBadges,
  getNextSuggestion,
  calcTodayGoal,
  hasThreeConsecutiveDays,
} from './self-progress.ts';
import { starsFor } from './progress.ts';

// 1. Plural helper check
assert.equal(plural(1, 'day in a row', 'days in a row'), '1 day in a row');
assert.equal(plural(3, 'day in a row', 'days in a row'), '3 days in a row');
assert.equal(plural(1, 'star', 'stars'), '1 star');
assert.equal(plural(2, 'star', 'stars'), '2 stars');
assert.equal(plural(0, 'days', 'days'), '0 days');

// 2. Greeting helper check
assert.deepEqual(getGreeting('Priya Sharma'), {
  title: 'Hello, Priya!',
  subtitle: 'Here is your week.',
});
assert.deepEqual(getGreeting(null), {
  title: 'Hello!',
  subtitle: 'Here is your week.',
});
assert.deepEqual(getGreeting(''), {
  title: 'Hello!',
  subtitle: 'Here is your week.',
});

// 3. Local date week boundary checks: Sunday-night and Monday-morning cases
// Sunday night case: 2026-10-25 is Sunday. Week starts on Monday 2026-10-19 and ends on Sunday 2026-10-25.
const sundayWeek = calcWeekStrip(['2026-10-20', '2026-10-25'], '2026-10-25');
assert.equal(sundayWeek.length, 7);
assert.equal(sundayWeek[0].dayName, 'Mon');
assert.equal(sundayWeek[0].dateStr, '2026-10-19');
assert.equal(sundayWeek[6].dayName, 'Sun');
assert.equal(sundayWeek[6].dateStr, '2026-10-25');
assert.equal(sundayWeek[6].isToday, true);
assert.equal(sundayWeek[6].isFuture, false);
assert.equal(sundayWeek[6].played, true);
assert.equal(sundayWeek[1].played, true);
assert.equal(sundayWeek[2].played, false);
// No future days on Sunday
assert.equal(sundayWeek.some(d => d.isFuture), false);

// Monday morning case: 2026-10-26 is Monday. Week starts on Monday 2026-10-26 and ends on Sunday 2026-11-01.
const mondayWeek = calcWeekStrip([], '2026-10-26');
assert.equal(mondayWeek[0].dayName, 'Mon');
assert.equal(mondayWeek[0].dateStr, '2026-10-26');
assert.equal(mondayWeek[0].isToday, true);
assert.equal(mondayWeek[0].isFuture, false);
assert.equal(mondayWeek[6].dayName, 'Sun');
assert.equal(mondayWeek[6].dateStr, '2026-11-01');
assert.equal(mondayWeek[6].isToday, false);
assert.equal(mondayWeek[6].isFuture, true);
// Tuesday through Sunday must all be marked as isFuture
for (let i = 1; i <= 6; i++) {
  assert.equal(mondayWeek[i].isFuture, true, `Day ${mondayWeek[i].dateStr} should be future`);
}

// 4. starsFor threshold checks (imported directly from lib/progress.ts)
assert.equal(starsFor(100), 3);
assert.equal(starsFor(80), 3);
assert.equal(starsFor(79), 2);
assert.equal(starsFor(50), 2);
assert.equal(starsFor(49), 1);
assert.equal(starsFor(1), 1);

// 5. calcAreaStars checks with sample scores
const sampleWeekEntries = [
  { day: '2026-10-20', area: 'Memory', score: 85 },
  { day: '2026-10-21', area: 'Attention', score: 60 },
  { day: '2026-10-22', area: 'Executive Function', score: 40 },
];
const areaStars = calcAreaStars(sampleWeekEntries, '2026-10-19', '2026-10-25');
assert.equal(areaStars['Memory'].stars, 3);
assert.equal(areaStars['Memory'].played, true);
assert.equal(areaStars['Attention'].stars, 2);
assert.equal(areaStars['Attention'].played, true);
assert.equal(areaStars['Executive Function'].stars, 1);
assert.equal(areaStars['Executive Function'].played, true);
assert.equal(areaStars['Recognition & Orientation'].stars, 0);
assert.equal(areaStars['Recognition & Orientation'].played, false);

// 6. Badges & 3-consecutive-day check
assert.equal(hasThreeConsecutiveDays(['2026-09-01', '2026-09-02', '2026-09-03']), true);
assert.equal(hasThreeConsecutiveDays(['2026-09-01', '2026-09-03', '2026-09-05']), false);
assert.equal(hasThreeConsecutiveDays(['2026-09-01', '2026-09-02']), false);
assert.equal(hasThreeConsecutiveDays([]), false);

// Badges test with sample historical records
const historicalScores = [
  { date: '2026-08-01', game_id: 'story-builder', area: 'Memory' },
  { date: '2026-08-02', game_id: 'word-association', area: 'Memory' },
  { date: '2026-08-03', game_id: 'mole-path', area: 'Memory' }, // 3 days in a row!
  { date: '2026-10-19', game_id: 'story-builder', area: 'Memory' },
  { date: '2026-10-20', game_id: 'whack-a-mole', area: 'Attention' },
  { date: '2026-10-21', game_id: 'sorting-station', area: 'Executive Function' },
  { date: '2026-10-22', game_id: 'face-recognition', area: 'Recognition & Orientation' }, // face finder!
  { date: '2026-10-23', game_id: 'odd-one-out', area: 'Attention' },
  { date: '2026-10-23', game_id: 'plan-the-day', area: 'Executive Function' },
  { date: '2026-10-23', game_id: 'map-navigator', area: 'Recognition & Orientation' },
  { date: '2026-10-23', game_id: 'attention-hunt', area: 'Attention' }, // 10th distinct game -> Explorer!
  // Caregiver preview entry should be ignored
  { date: '2026-10-24', game_id: 'fake-game', source: 'caregiver' },
  // Empty game id should be ignored
  { date: '2026-10-24', game_id: '' },
];

const badges = calcBadges(historicalScores, '2026-10-19', '2026-10-25');
const badgeMap = Object.fromEntries(badges.map(b => [b.id, b.earned]));

assert.equal(badgeMap['first_step'], true, 'First step should be earned');
assert.equal(badgeMap['streak_3'], true, 'Three days in a row should be earned');
assert.equal(badgeMap['all_skills_week'], true, 'All four skills should be earned for this week');
assert.equal(badgeMap['face_finder'], true, 'Face finder should be earned');
assert.equal(badgeMap['explorer'], true, 'Explorer should be earned (10 distinct games)');

// 7. mergeBadges: never-removed badges rule
const unearnedComputed = [
  { id: 'first_step', title: 'First step', hint: '', earned: false },
  { id: 'streak_3', title: 'Three days in a row', hint: '', earned: false },
  { id: 'all_skills_week', title: 'All four skills this week', hint: '', earned: false },
  { id: 'face_finder', title: 'Face finder', hint: '', earned: false },
  { id: 'explorer', title: 'Explorer', hint: '', earned: false },
];
const merged = mergeBadges(unearnedComputed, ['streak_3', 'explorer']);
const mergedMap = Object.fromEntries(merged.map(b => [b.id, b.earned]));
assert.equal(mergedMap['streak_3'], true, 'Historically earned streak_3 must persist');
assert.equal(mergedMap['explorer'], true, 'Historically earned explorer must persist');
assert.equal(mergedMap['first_step'], false);

// 8. getNextSuggestion: skips comingSoon games and picks unplayed area
const mockRegistry = [
  { id: 'game-coming-soon', name: 'Coming Soon Game', area: 'Memory', comingSoon: true, levels: [1], emoji: '', description: '', trains: '', skill: '' },
  { id: 'game-mem', name: 'Memory Game', area: 'Memory', comingSoon: false, levels: [1], emoji: '', description: '', trains: '', skill: '' },
  { id: 'game-att', name: 'Attention Game', area: 'Attention', comingSoon: false, levels: [1], emoji: '', description: '', trains: '', skill: '' },
];
const suggestion = getNextSuggestion(['Attention'], mockRegistry);
assert.ok(suggestion, 'Should return a suggestion');
assert.equal(suggestion.id, 'game-mem', 'Should skip comingSoon game and suggest Memory game');
assert.equal(suggestion.comingSoon, false);

// 9. Brand-new account case (no data)
const emptyAreaStars = calcAreaStars([], '2026-10-19', '2026-10-25');
for (const area of ['Memory', 'Attention', 'Executive Function', 'Recognition & Orientation']) {
  assert.equal(emptyAreaStars[area].stars, 0);
  assert.equal(emptyAreaStars[area].played, false);
}

const emptyBadges = calcBadges([], '2026-10-19', '2026-10-25');
assert.equal(emptyBadges.every(b => !b.earned), true, 'No badges should be earned for a new account');

const emptyGoal = calcTodayGoal(null, []);
assert.equal(emptyGoal.done, 0);
assert.equal(emptyGoal.total, 0);
assert.equal(emptyGoal.allDone, false);
assert.equal(emptyGoal.nextActivityId, null);

// 10. calcTodayGoal with activities
const goal = calcTodayGoal(['daily_recall', 'story-builder'], ['daily_recall']);
assert.equal(goal.done, 1);
assert.equal(goal.total, 2);
assert.equal(goal.allDone, false);
assert.equal(goal.nextActivityId, 'story-builder');

const finishedGoal = calcTodayGoal(['daily_recall', 'story-builder'], ['daily_recall', 'story-builder']);
assert.equal(finishedGoal.done, 2);
assert.equal(finishedGoal.total, 2);
assert.equal(finishedGoal.allDone, true);
assert.equal(finishedGoal.nextActivityId, null);

// 11. Locales coverage for self-progress UI phrases
const hi = JSON.parse(await readFile(new URL('./interaction/locales/hi.json', import.meta.url), 'utf8'));
const as = JSON.parse(await readFile(new URL('./interaction/locales/as.json', import.meta.url), 'utf8'));

const requiredPhrases = [
  'Hello, {name}!',
  'Hello!',
  'Here is your week.',
  'Accessibility settings',
  'Today’s goal',
  'Play next',
  'All done today, well done!',
  'Welcome back!',
  'Let’s start with one activity',
  'Your week',
  'Your four skills',
  'Remembering',
  'Focusing',
  'Planning',
  'Knowing people and places',
  'Not played yet. Try one today!',
  'Play',
  'Badges',
  'First step',
  'Complete your first activity',
  'Three days in a row',
  'Play 3 days in a row',
  'All four skills this week',
  'Play an activity in each skill area this week',
  'Face finder',
  'Play Face Recognition or My Day',
  'Explorer',
  'Try 10 different activities',
  'Your best this week',
  'Try something new',
  'For you and your doctor',
  'Scores describe activity only. They are not a clinical measure.',
  'Show detailed trend notes',
  'Treasure chest',
  'star',
  'stars',
  'day',
  'days',
  'day in a row',
  'days in a row',
];

for (const phrase of requiredPhrases) {
  assert.ok(hi[phrase], `Missing Hindi translation for: "${phrase}"`);
  assert.ok(as[phrase], `Missing Assamese translation for: "${phrase}"`);
}

console.log(`self-progress checks passed: validated ${requiredPhrases.length} phrases, badge rules, never-removed badges, area stars, local date boundaries, and no-data edge cases.`);
