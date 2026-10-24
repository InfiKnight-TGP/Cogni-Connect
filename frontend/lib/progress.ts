// Progress maths for the caregiver Progress page and the doctor's report.
// No imports, so `node lib/progress.check.mjs` can test it directly.

export type Area = "Memory" | "Attention" | "Executive Function" | "Recognition & Orientation";
export const AREAS: Area[] = ["Memory", "Attention", "Executive Function", "Recognition & Orientation"];
export const LEVEL_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard" } as const;
export type Level = keyof typeof LEVEL_NAMES;

const GAME_AREA: Record<string, Area> = {
  "story-builder": "Memory",
  "word-association": "Memory",
  "mole-path": "Memory",
  "odd-one-out": "Attention",
  "whack-a-mole": "Attention",
  "attention-hunt": "Attention",
  "plan-the-day": "Executive Function",
  "sorting-station": "Executive Function",
  "map-navigator": "Recognition & Orientation",
  "face-recognition": "Recognition & Orientation",
  "name-recognition": "Recognition & Orientation",
  "context-recall": "Memory",
  "memory-cards": "Memory",
  "memory-crossword": "Memory",
  "yesterday-quiz": "Memory",
  "sound-tap": "Attention",
  "pattern-completion": "Executive Function",
  "object-naming": "Recognition & Orientation",
  "pill-box-planner": "Executive Function",
};

const SKILL_AREA: Record<string, Area> = {
  memory: "Memory",
  attention: "Attention",
  "executive function": "Executive Function",
  "recognition & orientation": "Recognition & Orientation",
  "personal memory": "Memory",
  "verbal memory": "Memory",
  "semantic memory": "Memory",
  "working memory": "Memory",
  "selective attention": "Attention",
  inhibition: "Attention",
  sequencing: "Executive Function",
  flexibility: "Executive Function",
  planning: "Executive Function",
  switching: "Executive Function",
  "rule switching": "Executive Function",
  spatial: "Recognition & Orientation",
  directions: "Recognition & Orientation",
};

export const gameArea = (gameId?: string, skill?: string): Area | undefined => {
  if (gameId && GAME_AREA[gameId]) return GAME_AREA[gameId];
  if (skill) return SKILL_AREA[skill.toLowerCase()];
  return undefined;
};

export const skillArea = (skill?: string): Area | undefined => gameArea(undefined, skill);

const pad = (n: number) => String(n).padStart(2, "0");
/** Local "yyyy-MM-dd" (never toISOString, which is UTC). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Sep" */
export const shortDate = (key: string) => `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

export interface Entry {
  day: string;
  level?: Level;
  area?: Area;
  score: number;
  gameId: string;
}

interface RawScore {
  date?: string;
  timestamp?: string;
  score?: number;
  game_id?: string;
  level?: number;
  skill?: string;
  breakdown?: {
    activity1?: number | null;
    activity2?: number | null;
    activity3?: number | null;
    activity1_faceRecognition?: number | null;
    activity2_namePeople?: number | null;
    activity3_contextQuestions?: number | null;
  };
}

/** Normalise GET /performance: Daily Recall from "scores", games from "game_scores". */
export function toEntries(perf: { scores?: RawScore[]; game_scores?: RawScore[] }): Entry[] {
  // Old quiz entries store the browser's local midnight as a UTC ISO string; new ones store "yyyy-MM-dd"
  const day = (s: RawScore) => {
    const d = s.date || s.timestamp || "";
    return d.length === 10 ? d : d ? dayKey(new Date(d)) : "";
  };

  const make = (s: RawScore, gameId: string, skill: string | undefined, level: number | undefined): Entry[] => {
    const d = day(s);
    if (!d || typeof s.score !== "number" || !Number.isFinite(s.score)) return [];
    if (level !== undefined && !(level in LEVEL_NAMES)) return [];
    const lvl = (level ?? 1) as Level;

    // Daily Recall breakdown split: activity1/activity2 -> Recognition & Orientation, activity3 -> Memory
    if (gameId === "daily_recall" || s.breakdown) {
      const a1 = s.breakdown?.activity1 ?? (s.breakdown as any)?.activity1_faceRecognition;
      const a2 = s.breakdown?.activity2 ?? (s.breakdown as any)?.activity2_namePeople;
      const a3 = s.breakdown?.activity3 ?? (s.breakdown as any)?.activity3_contextQuestions;
      const hasA1 = typeof a1 === "number" && Number.isFinite(a1);
      const hasA2 = typeof a2 === "number" && Number.isFinite(a2);
      const hasA3 = typeof a3 === "number" && Number.isFinite(a3);

      if (hasA1 || hasA2 || hasA3) {
        const split: Entry[] = [];
        // Area-only entries: used for area charts and tables
        const roScores: number[] = [];
        if (hasA1) roScores.push(a1);
        if (hasA2) roScores.push(a2);
        if (roScores.length > 0) {
          const roAvg = Math.round(roScores.reduce((a, b) => a + b, 0) / roScores.length);
          split.push({ day: d, area: "Recognition & Orientation", score: roAvg, gameId });
        }
        if (hasA3) split.push({ day: d, area: "Memory", score: a3, gameId });
        // Level-only entry: Daily Recall counted ONCE with combined score for Easy/Medium/Hard averages
        split.push({ day: d, level: lvl, score: s.score, gameId });
        return split;
      }
    }

    const area = gameArea(gameId, skill) ?? (gameId === "daily_recall" ? "Memory" : undefined);
    return [{ day: d, level: lvl, area, score: s.score, gameId }];
  };

  return [
    ...(perf.scores ?? []).flatMap((s) => make(s, s.game_id || "daily_recall", s.skill, s.level)),
    ...(perf.game_scores ?? []).flatMap((s) => make(s, s.game_id ?? "", s.skill, s.level)),
  ];
}

export interface PatientStats {
  streak: number;
  starsThisWeek: number;
  doneToday: number;
}

export const starsFor = (score: number) => (score >= 80 ? 3 : score >= 50 ? 2 : 1);

/** Calculate patient stats from the normalized, level-only activity entries. */
export function patientStatsFromEntries(entries: Entry[], now: Date): PatientStats {
  const results = entries.filter((entry) => entry.level !== undefined);
  const today = dayKey(now);
  const days = new Set(results.map((entry) => entry.day));

  // Keep the current streak visible until the end of the day if today has no activity yet.
  let cursor = days.has(today) ? now : addDays(now, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const week = new Set(Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i))));
  const bundledIds = new Set(["face-recognition", "context-recall"]);
  const bestByGameDay = new Map<string, number>();
  const recallPartsByDay = new Map<string, Map<string, number>>();
  const legacyRecallByDay = new Map<string, number>();
  for (const entry of results) {
    if (!week.has(entry.day)) continue;
    if (bundledIds.has(entry.gameId)) {
      const parts = recallPartsByDay.get(entry.day) ?? new Map<string, number>();
      parts.set(entry.gameId, Math.max(parts.get(entry.gameId) ?? -Infinity, entry.score));
      recallPartsByDay.set(entry.day, parts);
      continue;
    }
    const key = `${entry.day}|${entry.gameId}`;
    bestByGameDay.set(key, Math.max(bestByGameDay.get(key) ?? -Infinity, entry.score));
    if (entry.gameId === "daily_recall") {
      legacyRecallByDay.set(entry.day, Math.max(legacyRecallByDay.get(entry.day) ?? -Infinity, entry.score));
    }
  }
  for (const day of Array.from(week)) {
    const legacyScore = legacyRecallByDay.get(day);
    const parts = recallPartsByDay.get(day);
    if (legacyScore !== undefined) {
      bestByGameDay.set(`${day}|daily_recall`, legacyScore);
    } else if (parts && ["face-recognition", "context-recall"].every((id) => parts.has(id))) {
      const averageScore = Math.round(["face-recognition", "context-recall"].reduce((sum, id) => sum + (parts.get(id) ?? 0), 0) / 2);
      bestByGameDay.set(`${day}|daily_recall`, averageScore);
    }
  }
  const starsThisWeek = Array.from(bestByGameDay.values()).reduce((sum, score) => sum + starsFor(score), 0);
  const todayIds = new Set(results.filter((entry) => entry.day === today && !bundledIds.has(entry.gameId)).map((entry) => entry.gameId));
  const todayParts = recallPartsByDay.get(today);
  if (legacyRecallByDay.has(today) || (todayParts && ["face-recognition", "context-recall"].every((id) => todayParts.has(id)))) {
    todayIds.add("daily_recall");
  }
  const doneToday = todayIds.size;

  return { streak, starsThisWeek, doneToday };
}

export interface Week {
  start: string;
  end: string;
  label: string;
}

/** The 4 seven-day windows ending today, oldest first. */
export function lastFourWeeks(today: Date): Week[] {
  return [3, 2, 1, 0].map((i) => {
    const start = dayKey(addDays(today, -7 * i - 6));
    const end = dayKey(addDays(today, -7 * i));
    return { start, end, label: i === 0 ? "This week" : shortDate(start) };
  });
}

const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Average score per week for each group (area or level name); null where nothing was played. */
export function weeklyAverages(
  entries: Entry[],
  weeks: Week[],
  groupOf: (e: Entry) => string | undefined,
): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  for (const e of entries) {
    const group = groupOf(e);
    if (group) out[group] ??= [];
  }
  for (const group of Object.keys(out)) {
    out[group] = weeks.map((w) =>
      average(entries.filter((e) => groupOf(e) === group && e.day >= w.start && e.day <= w.end).map((e) => e.score)),
    );
  }
  return out;
}

/** Monday..Sunday of the current week: did the patient play anything that day? */
export function daysPlayedThisWeek(entries: Entry[], today: Date): boolean[] {
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const played = new Set(entries.map((e) => e.day));
  return [0, 1, 2, 3, 4, 5, 6].map((i) => played.has(dayKey(addDays(monday, i))));
}

export interface Decline {
  area: Area;
  from: number;
  to: number;
  since: string;
}

/** Areas whose daily average went down `run` times in a row, ending with the latest day it was played
 * (days without play are skipped), within the last 4 weeks. */
export function declines(entries: Entry[], today: Date, run = 5): Decline[] {
  const first = dayKey(addDays(today, -27));
  const out: Decline[] = [];
  for (const area of AREAS) {
    const byDay: Record<string, number[]> = {};
    for (const e of entries) if (e.area === area && e.day >= first) (byDay[e.day] ??= []).push(e.score);
    const days = Object.keys(byDay).sort().slice(-(run + 1));
    const avgs = days.map((d) => average(byDay[d]) as number);
    if (avgs.length === run + 1 && avgs.every((v, i) => i === 0 || v < avgs[i - 1])) {
      out.push({ area, from: avgs[0], to: avgs[run], since: days[0] });
    }
  }
  return out;
}

/** Compare the first and last week that have a score: up / down by 5+ points, or steady. */
export function trend(series: (number | null)[]): "up" | "down" | "steady" | null {
  const values = series.filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const change = values[values.length - 1] - values[0];
  return change >= 5 ? "up" : change <= -5 ? "down" : "steady";
}

/**
 * Radar chart dataset builder. Null domains MUST stay null (never 0) so Chart.js leaves gaps.
 */
export function buildRadarChartData(scores: Record<Area, number | null>) {
  return {
    labels: ["Memory", "Attention", ["Executive", "Function"], ["Recognition", "&", "Orientation"]],
    datasets: [
      {
        label: "Observed task performance",
        data: AREAS.map((domain) => (scores[domain] == null ? null : scores[domain])),
        backgroundColor: "rgba(37, 99, 235, 0.16)",
        borderColor: "rgb(37, 99, 235)",
        pointBackgroundColor: "rgb(37, 99, 235)",
        pointBorderColor: "#fff",
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "rgb(37, 99, 235)",
        spanGaps: false,
      },
    ],
  };
}
