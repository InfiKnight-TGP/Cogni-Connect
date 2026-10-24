"use client";

import {
  daysPlayedThisWeek,
  patientStatsFromEntries,
  shouldShowDeclineSentence,
  summarySentences,
  type Entry,
} from "@/lib/progress";

import { useTrendNotes } from "./progressContent";

export { shouldShowDeclineSentence, summarySentences };

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeeklySummary({
  entries,
  now = new Date(),
  audience = "caregiver",
  showNotes: propShowNotes,
}: {
  entries: Entry[];
  now?: Date;
  audience?: "caregiver" | "self";
  showNotes?: boolean;
}) {
  const [contextShowNotes] = useTrendNotes();
  const showNotes = propShowNotes ?? contextShowNotes;
  const played = daysPlayedThisWeek(entries, now);
  const stats = patientStatsFromEntries(entries, now);
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">This week</h2>
        <p className="text-sm font-semibold text-muted-foreground">
          🔥 {stats.streak} days in a row
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Played {played.filter(Boolean).length} of 7 days
      </p>
      <ol
        className="mt-3 flex flex-wrap gap-2"
        aria-label="Days played this week"
      >
        {DAY_NAMES.map((name, index) => (
          <li
            key={name}
            aria-label={`${name}: ${played[index] ? "played" : "not played"}`}
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg border text-xs ${
              played[index]
                ? "border-green-600 bg-green-600/10"
                : "text-muted-foreground"
            }`}
          >
            {name}
            <span aria-hidden>{played[index] ? "✓" : "–"}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-1.5 text-sm leading-relaxed">
        {summarySentences(entries, now, audience, showNotes).map(
          (sentence, index) => (
            <p key={index}>{sentence}</p>
          )
        )}
      </div>
    </section>
  );
}
