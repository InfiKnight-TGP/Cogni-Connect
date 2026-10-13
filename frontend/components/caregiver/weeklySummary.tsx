"use client";

import { COGNITIVE_AREAS } from "@/lib/areas";
import { daysPlayedThisWeek, lastFourWeeks, patientStatsFromEntries, trend, weeklyAverages, type Entry } from "@/lib/progress";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function summarySentences(entries: Entry[], now: Date) {
  const weeks = lastFourWeeks(now);
  const averages = weeklyAverages(entries, weeks, (entry) => entry.area);
  const present = COGNITIVE_AREAS.filter((area) => entries.some((entry) => entry.area === area.name && entry.day >= weeks[3].start && entry.day <= weeks[3].end));
  const sentences = [`Played ${daysPlayedThisWeek(entries, now).filter(Boolean).length} days this week.`];
  const changed = present.map((area) => ({ area, direction: trend(averages[area.name] ?? []) })).filter((item) => item.direction === "up" || item.direction === "down");
  const up = changed.filter((item) => item.direction === "up").map((item) => item.area.name);
  const down = changed.filter((item) => item.direction === "down").map((item) => item.area.name);
  if (up.length) sentences.push(`${up.join(" and ")} ${up.length === 1 ? "was" : "were"} higher than the earlier weeks.`);
  if (down.length) sentences.push(`${down.join(" and ")} ${down.length === 1 ? "was" : "were"} lower than the earlier weeks.`);
  if (present.length && !changed.length) sentences.push("Scores were steady across the areas played.");
  const missing = COGNITIVE_AREAS.filter((area) => !present.some((played) => played.name === area.name)).map((area) => area.name);
  if (missing.length && sentences.length < 4) sentences.push(`${missing.join(" and ")} ${missing.length === 1 ? "was" : "were"} not played this week.`);
  return sentences.slice(0, 4);
}

export default function WeeklySummary({ entries, now = new Date() }: { entries: Entry[]; now?: Date }) {
  const played = daysPlayedThisWeek(entries, now);
  const stats = patientStatsFromEntries(entries, now);
  return <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">This week</h2>
      <p className="text-sm font-semibold text-muted-foreground">🔥 {stats.streak} days in a row</p>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">Played {played.filter(Boolean).length} of 7 days</p>
    <ol className="mt-3 flex flex-wrap gap-2" aria-label="Days played this week">
      {DAY_NAMES.map((name, index) => <li key={name} aria-label={`${name}: ${played[index] ? "played" : "not played"}`} className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg border text-xs ${played[index] ? "border-green-600 bg-green-600/10" : "text-muted-foreground"}`}>
        {name}<span aria-hidden>{played[index] ? "✓" : "–"}</span>
      </li>)}
    </ol>
    <div className="mt-4 space-y-1.5 text-sm leading-relaxed">{summarySentences(entries, now).map((sentence, index) => <p key={index}>{sentence}</p>)}</div>
  </section>;
}
