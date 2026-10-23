"use client";

import { apiFetch, API_URL } from "@/lib/api";
import { COGNITIVE_AREAS } from "@/lib/areas";
import {
  AREAS, Entry, LEVEL_NAMES, Week, declines, lastFourWeeks, shortDate, toEntries, trend,
  weeklyAverages,
} from "@/lib/progress";
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import RecallGraph from "@/app/progress/recall-graph";
import { GAME_REGISTRY } from "@/components/games/registry";
import { gameArea, type Area } from "@/lib/progress";
import { Button } from "@/components/ui/button";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const SERIES = {
  light: COGNITIVE_AREAS.map((area) => area.chartColors.light),
  dark: COGNITIVE_AREAS.map((area) => area.chartColors.dark),
};
const LEVEL_GROUPS = Object.values(LEVEL_NAMES);
type AdaptiveState = { knob: number; mode?: "auto" | "fixed"; reason?: string; lastChange?: string | null };
const difficultyName = (knob: number) => knob === 1 ? "Easier" : knob === 2 ? "Normal" : "Harder";
const TREND_TEXT = { up: "↑ Better", down: "↓ Lower", steady: "→ Steady" };

export default function ProgressContent() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adaptive, setAdaptive] = useState<Record<string, AdaptiveState> | null>(null);
  const [adaptiveError, setAdaptiveError] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const today = new Date();

  useEffect(() => {
    apiFetch(`${API_URL}/performance`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((perf) => setEntries(toEntries(perf)))
      .catch(() => setFailed(true));
  }, []);

  const loadAdaptive = () => apiFetch(`${API_URL}/adaptive`)
    .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load difficulty settings")))
    .then((data) => { setAdaptive(data.games ?? {}); setAdaptiveError(""); })
    .catch(() => setAdaptiveError("Could not load difficulty settings."));
  useEffect(() => { void loadAdaptive(); }, []);
  const setOverride = async (gameId: string, mode: "auto" | "fixed", knob?: number) => {
    try {
      const response = await apiFetch(`${API_URL}/adaptive/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_id: gameId, mode, ...(mode === "fixed" ? { knob } : {}) }) });
      if (!response.ok) throw new Error("Could not save difficulty setting.");
      await loadAdaptive();
    } catch (error) { setAdaptiveError(error instanceof Error ? error.message : "Could not save difficulty setting."); }
  };
  const resetOverride = async (gameId: string) => {
    try {
      const response = await apiFetch(`${API_URL}/adaptive/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_id: gameId }) });
      if (!response.ok) throw new Error("Could not reset difficulty.");
      await loadAdaptive();
    } catch (error) { setAdaptiveError(error instanceof Error ? error.message : "Could not reset difficulty."); }
  };
  const adaptiveGroups = GAME_REGISTRY.filter((game) => !game.comingSoon).reduce<Record<Area, typeof GAME_REGISTRY>>((groups, game) => { const area = gameArea(game.id, game.area); if (area) (groups[area] ??= []).push(game); return groups; }, {} as Record<Area, typeof GAME_REGISTRY>);

  const weeks = lastFourWeeks(today);
  const notes = entries ? declines(entries, today) : [];

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">Last 4 weeks: {shortDate(weeks[0].start)} – {shortDate(weeks[3].end)}</p>

      {failed ? (
        <p>Could not load scores. Is the backend running?</p>
      ) : entries === null ? (
        <p>Loading…</p>
      ) : (
        <>

          <label className="flex items-center gap-3 text-base"><input type="checkbox" checked={showNotes} onChange={event => setShowNotes(event.target.checked)} /> Show detailed trend notes</label>
          {showNotes && notes.map((n) => (
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

          <section className="rounded-xl border bg-card p-6" aria-labelledby="difficulty-heading">
            <h2 id="difficulty-heading" className="text-xl font-semibold">Difficulty</h2>
            <p className="text-sm text-muted-foreground">Automatic settings use recent answers. A fixed setting stays until you reset it.</p>
            {adaptiveError && <p role="alert" className="mt-2 text-sm text-destructive">{adaptiveError}</p>}
            {adaptive === null ? <p className="mt-4 text-sm text-muted-foreground">Loading difficulty settingsâ€¦</p> : <div className="mt-5 space-y-6">{Object.entries(adaptiveGroups).map(([area, games]) => <div key={area}><h3 className="mb-2 font-semibold">{area}</h3><div className="divide-y rounded-lg border">{games.map((game) => { const state = adaptive[game.id] ?? { knob: 2, mode: "auto" as const, reason: "Getting to know your pace" }; const fixed = state.mode === "fixed"; return <div key={game.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="font-medium">{game.name}</p><p className="text-sm text-muted-foreground">{difficultyName(state.knob)} Â· {state.reason || "No change yet"}{state.lastChange ? ` Â· ${new Date(state.lastChange).toLocaleDateString()}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><label className="text-sm">Mode<select value={fixed ? "fixed" : "auto"} onChange={(event) => event.target.value === "auto" ? void setOverride(game.id, "auto") : void setOverride(game.id, "fixed", state.knob || 2)} className="ml-2 min-h-10 rounded-md border bg-background px-2"><option value="auto">Auto</option><option value="fixed">Fixed</option></select></label>{fixed && <label className="text-sm">Setting<select value={state.knob} onChange={(event) => void setOverride(game.id, "fixed", Number(event.target.value))} className="ml-2 min-h-10 rounded-md border bg-background px-2"><option value="1">Easier</option><option value="2">Normal</option><option value="3">Harder</option><option value="4">Harder</option></select></label>}</div><Button variant="outline" size="sm" onClick={() => void resetOverride(game.id)}>Reset</Button></div>;})}</div></div>)}</div>}
          </section>

          <section className="flex h-96 flex-col rounded-xl border bg-card p-6">
            <h2 className="mb-1 text-xl font-semibold">Daily Recall (My Day) scores</h2>
            <p className="mb-2 text-sm text-muted-foreground">Hover a point to see the three parts.</p>
            <RecallGraph />
          </section>
        </>
      )}
    </div>
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
