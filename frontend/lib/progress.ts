// Progress maths for the caregiver Progress page and the doctor's report.
// No imports, so `node lib/progress.check.mjs` can test it directly.

export type Area = "Memory" | "Attention" | "Planning" | "Switching" | "Directions";
export const AREAS: Area[] = ["Memory", "Attention", "Planning", "Switching", "Directions"];
export const LEVEL_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard" } as const;
export type Level = keyof typeof LEVEL_NAMES;

// Each game's skill (registry.ts / saved scores) belongs to one caregiver-facing area
const AREA_OF: Record<string, Area> = {
  "personal memory": "Memory",
  "verbal memory": "Memory",
  "semantic memory": "Memory",
  "working memory": "Memory",
  attention: "Attention",
  "selective attention": "Attention",
  inhibition: "Attention",
  sequencing: "Planning",
  flexibility: "Switching",
  spatial: "Directions",
};

export const skillArea = (skill?: string): Area | undefined => AREA_OF[(skill ?? "").toLowerCase()];

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
  level: Level;
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
}

/** Normalise GET /performance: Daily Recall from "scores", games from "game_scores". */
export function toEntries(perf: { scores?: RawScore[]; game_scores?: RawScore[] }): Entry[] {
  // Old quiz entries store the browser's local midnight as a UTC ISO string; new ones store "yyyy-MM-dd"
  const day = (s: RawScore) => {
    const d = s.date || s.timestamp || "";
    return d.length === 10 ? d : d ? dayKey(new Date(d)) : "";
  };
  const make = (s: RawScore, gameId: string, skill: string | undefined, level: number | undefined): Entry[] =>
    typeof s.score === "number" && Number.isFinite(s.score) && day(s) && (level ?? 1) in LEVEL_NAMES
      ? [{ day: day(s), level: (level ?? 1) as Level, area: skillArea(skill), score: s.score, gameId }]
      : [];
  return [
    ...(perf.scores ?? []).flatMap((s) => make(s, "daily_recall", s.skill ?? "personal memory", s.level)),
    ...(perf.game_scores ?? []).flatMap((s) => make(s, s.game_id ?? "", s.skill, s.level)),
  ];
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
