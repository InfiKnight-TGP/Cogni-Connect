"use client";

import { usePatientStats } from "@/lib/stats";
import { RightColumnSiteLinks } from "@/components/siteLinks";

const GOAL = 3;

/** Desktop-only right column for patient Home and Today: streak, weekly stars, daily goal, links. */
export default function RightColumn() {
  const stats = usePatientStats();
  const streak = stats?.streak ?? 0;
  const stars = stats?.starsThisWeek ?? 0;
  const done = Math.min(stats?.doneToday ?? 0, GOAL);

  return (
    <aside className="sticky top-24 hidden w-80 shrink-0 space-y-6 self-start xl:block" aria-label="Your stats">
      <div className="space-y-3">
        <div className="flex w-full items-center gap-2 rounded-2xl border-2 border-border bg-card p-4 font-bold">
          <span aria-hidden="true" className="text-2xl">🔥</span>
          <span className="text-3xl leading-none">{streak}</span>
          <span className="whitespace-nowrap text-base">{streak === 1 ? "day in a row" : "days in a row"}</span>
        </div>
        <div className="flex w-full items-center gap-2 rounded-2xl border-2 border-border bg-card p-4 font-bold">
          <span aria-hidden="true" className="text-2xl">⭐</span>
          <span className="text-3xl leading-none">{stars}</span>
          <span className="whitespace-nowrap text-base">{stars === 1 ? "star this week" : "stars this week"}</span>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border-2 border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Daily goal</h2>
          <span aria-hidden className="text-3xl">🎁</span>
        </div>
        <p className="text-lg">Finish {GOAL} activities</p>
        <div
          className="h-5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={GOAL}
          aria-valuenow={done}
          aria-label="Daily goal"
        >
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${(done / GOAL) * 100}%` }}
          />
        </div>
        <p className="text-lg font-semibold text-muted-foreground">
          {done}/{GOAL}
        </p>
      </div>

      <RightColumnSiteLinks />
    </aside>
  );
}
