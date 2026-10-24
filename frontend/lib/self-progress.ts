// @ts-expect-error Node's native TypeScript runner resolves this source import directly.
import { type Area, AREAS, dayKey, starsFor, gameArea } from "./progress.ts";
import type { GameRegistryEntry } from "../components/games/registry";


/**
 * Local date helper parsing "yyyy-MM-dd" strictly as a local date (never UTC timestamp).
 */
export function parseLocalDate(d: string | Date): Date {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const parts = d.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function formatLocalDate(d: Date): string {
  return dayKey(d);
}

/**
 * Pluralisation helper: "1 day in a row", "2 days in a row", "1 star", "3 stars".
 */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Greeting text helper.
 */
export function getGreeting(name?: string | null): { title: string; subtitle: string } {
  const trimmed = name?.trim();
  const displayName = trimmed ? trimmed.split(" ")[0] : "";
  const title = displayName ? `Hello, ${displayName}!` : "Hello!";
  return {
    title,
    subtitle: "Here is your week.",
  };
}

export interface DayCard {
  dayName: string;
  dateStr: string;
  played: boolean;
  isToday: boolean;
  isFuture: boolean;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Compute the 7 days of the local week containing todayDateStr (Monday as first day).
 * Strictly computed from local date strings, without UTC shifts.
 */
export function calcWeekStrip(
  playedDateStrings: Iterable<string>,
  todayDateStr: string = formatLocalDate(new Date())
): DayCard[] {
  const todayDate = parseLocalDate(todayDateStr);
  const playedSet = new Set(playedDateStrings);

  // Offset to Monday: Sunday (0) is 6 days after Monday; Monday (1) is 0 days after Monday.
  const dayOfWeek = (todayDate.getDay() + 6) % 7;
  const mondayDate = new Date(todayDate);
  mondayDate.setDate(mondayDate.getDate() - dayOfWeek);

  return DAY_NAMES.map((name, idx) => {
    const current = new Date(mondayDate);
    current.setDate(current.getDate() + idx);
    const dateStr = formatLocalDate(current);
    const isToday = dateStr === todayDateStr;
    const isFuture = dateStr > todayDateStr;
    const played = playedSet.has(dateStr);

    return {
      dayName: name,
      dateStr,
      played,
      isToday,
      isFuture,
    };
  });
}

export interface SkillStarInfo {
  area: Area;
  friendlyTitle: string;
  friendlySubtitle: string;
  stars: number;
  bestScore: number;
  played: boolean;
}

export const SKILL_FRIENDLY_NAMES: Record<Area, { title: string; subtitle: string }> = {
  Memory: {
    title: "Remembering",
    subtitle: "Memory",
  },
  Attention: {
    title: "Focusing",
    subtitle: "Attention",
  },
  "Executive Function": {
    title: "Planning",
    subtitle: "Executive Function",
  },
  "Recognition & Orientation": {
    title: "Knowing people and places",
    subtitle: "Recognition & Orientation",
  },
};

/**
 * Calculate 0 to 3 stars per area from week's entries using standard starsFor helper.
 */
export function calcAreaStars(
  entries: { day: string; area?: Area; score: number }[],
  weekStartStr: string,
  weekEndStr: string
): Record<Area, SkillStarInfo> {
  const result = {} as Record<Area, SkillStarInfo>;

  for (const area of AREAS) {
    const areaEntries = entries.filter(
      (e) => e.area === area && e.day >= weekStartStr && e.day <= weekEndStr
    );

    if (areaEntries.length === 0) {
      result[area] = {
        area,
        friendlyTitle: SKILL_FRIENDLY_NAMES[area].title,
        friendlySubtitle: SKILL_FRIENDLY_NAMES[area].subtitle,
        stars: 0,
        bestScore: 0,
        played: false,
      };
    } else {
      const bestScore = Math.max(...areaEntries.map((e) => e.score));
      result[area] = {
        area,
        friendlyTitle: SKILL_FRIENDLY_NAMES[area].title,
        friendlySubtitle: SKILL_FRIENDLY_NAMES[area].subtitle,
        stars: starsFor(bestScore),
        bestScore,
        played: true,
      };
    }
  }

  return result;
}

export interface Badge {
  id: "first_step" | "streak_3" | "all_skills_week" | "face_finder" | "explorer";
  title: string;
  hint: string;
  earned: boolean;
}

export interface RawScoreRecord {
  date?: string;
  timestamp?: string;
  game_id?: string;
  gameId?: string;
  source?: string;
  area?: Area;
}

/**
 * Check if a list of dates contains at least three consecutive calendar days anywhere in history.
 */
export function hasThreeConsecutiveDays(dates: string[]): boolean {
  if (dates.length < 3) return false;
  const sorted = Array.from(new Set(dates)).sort();
  for (let i = 0; i <= sorted.length - 3; i++) {
    const d1 = parseLocalDate(sorted[i]);
    const d2 = parseLocalDate(sorted[i + 1]);
    const d3 = parseLocalDate(sorted[i + 2]);
    const diff1 = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    const diff2 = Math.round((d3.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    if (diff1 === 1 && diff2 === 1) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate badges from all historical records:
 * - Ignores entries with source === "caregiver" (preview mode).
 * - Ignores entries without a valid game ID.
 */
export function calcBadges(
  rawScores: RawScoreRecord[],
  weekStartStr: string,
  weekEndStr: string
): Badge[] {
  // Filter out caregiver preview entries and entries with no game id
  const validScores = rawScores.filter((s) => {
    if (s.source === "caregiver") return false;
    const gid = s.game_id || s.gameId;
    return Boolean(gid && typeof gid === "string" && gid.trim().length > 0);
  });

  const validDates = validScores
    .map((s) => s.date || s.timestamp?.slice(0, 10))
    .filter((d): d is string => Boolean(d && d.length === 10));

  // 1. First step: completed at least one activity ever
  const firstStep = validScores.length >= 1;

  // 2. Three days in a row: 3 consecutive days at any time in history
  const streak3 = hasThreeConsecutiveDays(validDates);

  // 3. All four skills this week
  const weekScores = validScores.filter((s) => {
    const d = s.date || s.timestamp?.slice(0, 10);
    return Boolean(d && d >= weekStartStr && d <= weekEndStr);
  });
  const weekAreas = new Set(
    weekScores.map((s) => s.area || gameArea(s.game_id || s.gameId)).filter(Boolean)
  );
  const allSkillsWeek = AREAS.every((a) => weekAreas.has(a));

  // 4. Face finder: played face-recognition or daily_recall
  const faceFinder = validScores.some((s) => {
    const gid = s.game_id || s.gameId;
    return gid === "face-recognition" || gid === "daily_recall";
  });

  // 5. Explorer: 10 different games played
  const distinctGames = new Set(
    validScores.map((s) => s.game_id || s.gameId).filter(Boolean)
  );
  const explorer = distinctGames.size >= 10;

  return [
    {
      id: "first_step",
      title: "First step",
      hint: "Complete your first activity",
      earned: firstStep,
    },
    {
      id: "streak_3",
      title: "Three days in a row",
      hint: "Play 3 days in a row",
      earned: streak3,
    },
    {
      id: "all_skills_week",
      title: "All four skills this week",
      hint: "Play an activity in each skill area this week",
      earned: allSkillsWeek,
    },
    {
      id: "face_finder",
      title: "Face finder",
      hint: "Play Face Recognition or My Day",
      earned: faceFinder,
    },
    {
      id: "explorer",
      title: "Explorer",
      hint: "Try 10 different activities",
      earned: explorer,
    },
  ];
}

/**
 * Ensures badges are never removed once earned.
 */
export function mergeBadges(
  computed: Badge[],
  previouslyEarnedIds: Iterable<string>
): Badge[] {
  const previouslyEarnedSet = new Set(previouslyEarnedIds);
  return computed.map((badge) => ({
    ...badge,
    earned: badge.earned || previouslyEarnedSet.has(badge.id),
  }));
}

/**
 * Helper to determine which newly earned badges should trigger a celebration.
 * - When storedIds is null (the key was never written in localStorage), returns []
 *   so existing history is seeded silently and never celebrates.
 * - When storedIds is an array, returns only earned badge IDs that are not present in storedIds.
 */
export function badgesToCelebrate(
  computedEarnedIds: string[],
  storedIds: string[] | null
): string[] {
  if (storedIds === null) return [];
  const storedSet = new Set(storedIds);
  return computedEarnedIds.filter((id) => !storedSet.has(id));
}

/**
 * Suggest one game:
 * The first non-comingSoon game from an area not played this week.
 * If all areas were played, picks the first non-comingSoon game.
 */
export function getNextSuggestion(
  weekPlayedAreas: Iterable<Area>,
  registry: GameRegistryEntry[]
): GameRegistryEntry | null {
  const available = registry.filter((g) => !g.comingSoon);
  if (available.length === 0) return null;

  const playedSet = new Set(weekPlayedAreas);
  const unplayedArea = AREAS.find((a) => !playedSet.has(a));

  if (unplayedArea) {
    const candidate = available.find((g) => g.area === unplayedArea);
    if (candidate) return candidate;
  }

  return available[0] ?? null;
}

/**
 * Today's goal calculation.
 */
export interface TodayGoalInfo {
  done: number;
  total: number;
  allDone: boolean;
  nextActivityId: string | null;
}

export function calcTodayGoal(
  planIds: string[] | null,
  completedIds: Iterable<string>
): TodayGoalInfo {
  if (!planIds || planIds.length === 0) {
    return {
      done: 0,
      total: 0,
      allDone: false,
      nextActivityId: null,
    };
  }

  const completedSet = new Set(completedIds);
  const done = planIds.filter((id) => completedSet.has(id)).length;
  const total = planIds.length;
  const allDone = done >= total && total > 0;
  const nextActivityId = planIds.find((id) => !completedSet.has(id)) ?? null;

  return {
    done,
    total,
    allDone,
    nextActivityId,
  };
}
