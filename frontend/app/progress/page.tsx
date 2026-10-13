"use client";

import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { buttonVariants } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import {
  AREAS, Entry, LEVEL_NAMES, Week, daysPlayedThisWeek, declines, lastFourWeeks, shortDate, toEntries, trend,
  weeklyAverages,
} from "@/lib/progress";
import { cn } from "@/lib/utils";
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import RecallGraph from "./recall-graph";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Categorical slots 1-4, validated for both themes (dataviz validate_palette.js). Colour follows the entity.
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};
const LEVEL_GROUPS = Object.values(LEVEL_NAMES);
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TREND_TEXT = { up: "↑ Better", down: "↓ Lower", steady: "→ Steady" };

export default function ProgressPage() {
  return (
    <>
      <Nav />
      <CaregiverOnly>
        <Progress />
      </CaregiverOnly>
    </>
  );
}

function Progress() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const today = new Date();

  useEffect(() => {
    fetch(`${API_URL}/performance`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((perf) => setEntries(toEntries(perf)))
      .catch(() => setFailed(true));
  }, []);

  const weeks = lastFourWeeks(today);
  const played = entries ? daysPlayedThisWeek(entries, today) : [];
  const notes = entries ? declines(entries, today) : [];

  return (
    <main className="mx-auto max-w-screen-lg space-y-8 px-4 pb-16 pt-24 lg:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Progress</h1>
          <p className="text-muted-foreground">
            Last 4 weeks: {shortDate(weeks[0].start)} – {shortDate(weeks[3].end)}
          </p>
        </div>
        <Link href="/report" target="_blank" className={cn(buttonVariants({ size: "lg" }))}>
          Download report
        </Link>
      </div>

      {failed ? (
        <p>Could not load scores. Is the backend running?</p>
      ) : entries === null ? (
        <p>Loading…</p>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-xl font-semibold">This week</h2>
            <p className="mt-1 text-muted-foreground">
              Played on {played.filter(Boolean).length} of 7 days
            </p>
            <ol className="mt-4 flex flex-wrap gap-2">
              {DAY_NAMES.map((d, i) => (
                <li
                  key={d}
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg border text-sm ${
                    played[i] ? "border-green-600 bg-green-600/10" : "text-muted-foreground"
                  }`}
                >
                  {d}
                  <span aria-label={played[i] ? "played" : "not played"}>{played[i] ? "✓" : "–"}</span>
                </li>
              ))}
            </ol>
          </section>

          {notes.map((n) => (
            <div key={n.area} role="note" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <span aria-hidden className="text-xl">ℹ️</span>
              <p>
                <strong>{n.area}</strong> scores went down on the last 5 days it was played (from {n.from} to {n.to},
                since {shortDate(n.since)}). One bad stretch can just mean tired days — keep an eye on it, and mention
                it to the doctor if it continues.
              </p>
            </div>
          ))}

          <WeeklyChart
            title="Average score by skill"
            weeks={weeks}
            groups={AREAS}
            series={weeklyAverages(entries, weeks, (e) => e.area)}
          />
          <WeeklyChart
            title="Average score by level"
            weeks={weeks}
            groups={LEVEL_GROUPS}
            series={weeklyAverages(entries, weeks, (e) => (e.level ? LEVEL_NAMES[e.level] : undefined))}
          />

          <section className="flex h-96 flex-col rounded-xl border bg-card p-6">
            <h2 className="mb-1 text-xl font-semibold">Daily Recall (My Day) scores</h2>
            <p className="mb-2 text-sm text-muted-foreground">Hover a point to see the three parts.</p>
            <RecallGraph />
          </section>
        </>
      )}
    </main>
  );
}

function WeeklyChart({
  title,
  weeks,
  groups,
  series,
}: {
  title: string;
  weeks: Week[];
  groups: readonly string[];
  series: Record<string, (number | null)[]>;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const colors = SERIES[dark ? "dark" : "light"];
  const ink = dark ? "#cbd5e1" : "#475569";
  const shown = groups.filter((g) => series[g]); // color slot stays tied to the group's fixed position

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {shown.length === 0 ? (
        <p className="mt-2 text-muted-foreground">No scores in the last 4 weeks.</p>
      ) : (
        <>
          <div className="relative mt-4 h-72">
            <Line
              data={{
                labels: weeks.map((w) => w.label),
                datasets: shown.map((g) => ({
                  label: g,
                  data: series[g],
                  borderColor: colors[groups.indexOf(g)],
                  backgroundColor: colors[groups.indexOf(g)],
                  borderWidth: 2,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  spanGaps: true,
                })),
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { position: "top", labels: { color: ink, usePointStyle: true, boxHeight: 8 } },
                  tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y}%` } },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: ink } },
                  y: {
                    min: 0,
                    max: 100,
                    ticks: { stepSize: 25, color: ink, callback: (v) => `${v}%` },
                    grid: { color: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" },
                  },
                },
              }}
            />
          </div>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">{title}, weekly averages</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium"></th>
                {weeks.map((w) => (
                  <th key={w.start} className="py-1 font-medium">{w.label}</th>
                ))}
                <th className="py-1 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const t = trend(series[g]);
                return (
                  <tr key={g} className="border-t">
                    <th scope="row" className="py-2 text-left font-medium">
                      <span
                        aria-hidden
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: colors[groups.indexOf(g)] }}
                      />
                      {g}
                    </th>
                    {series[g].map((v, i) => (
                      <td key={i} className="py-2">{v === null ? "–" : `${v}%`}</td>
                    ))}
                    <td className="py-2">{t ? TREND_TEXT[t] : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
