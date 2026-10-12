"use client";

import dynamic from "next/dynamic";
import { CaregiverOnly } from "@/components/caregiver";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import {
  AREAS, Area, Entry, LEVEL_NAMES, Week, dayKey, declines, lastFourWeeks, shortDate, toEntries, trend,
  weeklyAverages,
} from "@/lib/progress";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

const ReportRadar = dynamic(() => import("./RadarChart"), {
  ssr: false,
  loading: () => <p className="py-8 text-center text-sm text-slate-500">Loading radar chart…</p>,
});

const AREA_MEANING: Record<Area, string> = {
  Memory: "remembering words, daily events, and sequences",
  Attention: "focusing on targets and spotting items among distractions",
  "Executive Function": "planning daily steps and adapting when rules change",
  "Recognition & Orientation": "recognising familiar people and following routes and directions",
};

const fullDate = (key: string) => `${shortDate(key)} ${key.slice(0, 4)}`;

interface DomainResult {
  score: number | null;
  game_count: number;
  game_ids: string[];
  confidence: string;
}

interface GameResultRow {
  game_id: string;
  parent_game_id?: string;
  game_name: string;
  primary_domain: Area;
  score: number;
  accuracy?: number | null;
  difficulty_level?: string | null;
  completed: boolean;
  completed_at?: string;
  started_at?: string;
  reaction_time_ms?: number | null;
  attempts?: number | null;
  incorrect_answers?: number | null;
  false_selections?: number | null;
  correct_answers?: number | null;
  total_questions?: number | null;
  missed_targets?: number | null;
}

interface DayReport {
  date: string;
  status: "complete" | "partial" | "empty";
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  games_completed: number;
  games_available: number;
  missing_games: string[];
  domains: Record<Area, DomainResult>;
  games: GameResultRow[];
  aggregation_method: string;
  interpretation: string;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "Not recorded";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins} min ${secs} sec` : `${secs} sec`;
}

function formatPercent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "Not measured" : `${Math.round(value * 100)}%`;
}

function observedNotes(domain: Area, rows: GameResultRow[]): string {
  if (!rows.length) return "No activity in this domain was completed on this day.";
  return rows
    .map((g) => {
      if (g.correct_answers != null && g.total_questions != null) {
        const incorrect = g.incorrect_answers ?? Math.max(0, g.total_questions - g.correct_answers);
        return `${g.game_name}: ${g.correct_answers} of ${g.total_questions} correct${
          incorrect ? `; ${incorrect} incorrect` : "; no incorrect answers recorded"
        }.`;
      }
      if (g.missed_targets != null || g.false_selections != null) {
        return `${g.game_name}: ${g.missed_targets ?? 0} missed targets and ${
          g.false_selections ?? 0
        } false selections.`;
      }
      return `${g.game_name}: observed score ${g.score}/100.`;
    })
    .join(" ");
}

function exportCsv(report: DayReport, date: string) {
  const headers = [
    "Activity",
    "Primary Domain",
    "Score",
    "Accuracy",
    "Correct",
    "Questions",
    "Incorrect",
    "Attempts",
    "Missed Targets",
    "False Selections",
    "Reaction Time ms",
    "Difficulty",
    "Completed At",
  ];
  const rows = (report.games || []).map((g) => [
    g.game_name,
    g.primary_domain,
    g.score,
    g.accuracy == null ? "" : Math.round(g.accuracy * 100),
    g.correct_answers ?? "",
    g.total_questions ?? "",
    g.incorrect_answers ?? "",
    g.attempts ?? "",
    g.missed_targets ?? "",
    g.false_selections ?? "",
    g.reaction_time_ms ?? "",
    g.difficulty_level ?? "",
    g.completed_at ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cogniconnect-report-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportPage() {
  return (
    <CaregiverOnly>
      <Report />
    </CaregiverOnly>
  );
}

function Report() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const today = new Date();
  const todayKey = dayKey(today);
  const weeks = lastFourWeeks(today);

  // Daily report states
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [dayReport, setDayReport] = useState<DayReport | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/performance`),
      fetch(`${API_URL}/settings`),
      fetch(`${API_URL}/reports/days`),
    ])
      .then(async ([perf, settings, daysRes]) => {
        if (!perf.ok) throw new Error();
        setEntries(toEntries(await perf.json()));
        if (settings.ok) setName((await settings.json()).patient_name ?? "");
        if (daysRes.ok) {
          const daysData = await daysRes.json();
          setActiveDays(daysData.days || []);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!selectedDay) return;
    fetch(`${API_URL}/reports/day?date=${encodeURIComponent(selectedDay)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDayReport(data))
      .catch(() => setDayReport(null));
  }, [selectedDay]);

  const saveName = () =>
    fetch(`${API_URL}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_name: name }),
    }).catch(() => {});

  if (failed) return <p className="p-8">Could not load scores. Is the backend running?</p>;
  if (entries === null) return <p className="p-8">Loading…</p>;

  const inPeriod = entries.filter((e) => e.day >= weeks[0].start && e.day <= weeks[3].end);
  const daysPlayed = new Set(inPeriod.map((e) => e.day)).size;
  const byArea = weeklyAverages(inPeriod, weeks, (e) => e.area);
  const byLevel = weeklyAverages(inPeriod, weeks, (e) => (e.level ? LEVEL_NAMES[e.level] : undefined));
  const drops = declines(entries, today);
  const changes = AREAS.flatMap((a) => {
    const values = (byArea[a] ?? []).filter((v): v is number => v !== null);
    const t = trend(byArea[a] ?? []);
    if (!t || t === "steady") return [];
    return [`${a}: weekly average ${t === "up" ? "rose" : "fell"} from ${values[0]} to ${values[values.length - 1]}.`];
  });

  const availableDayOptions = Array.from(new Set([todayKey, ...activeDays]));
  const radarScores: Record<Area, number | null> = {
    Memory: dayReport?.domains?.Memory?.score ?? null,
    Attention: dayReport?.domains?.Attention?.score ?? null,
    "Executive Function": dayReport?.domains?.["Executive Function"]?.score ?? null,
    "Recognition & Orientation": dayReport?.domains?.["Recognition & Orientation"]?.score ?? null,
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-[15px] leading-relaxed text-black print:p-0">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4 print:hidden">
        <label className="flex flex-1 items-center gap-2">
          <span className="text-sm font-medium">Patient name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            maxLength={60}
            className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3"
          />
        </label>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        <p className="w-full text-sm text-slate-600">In the print window, choose “Save as PDF” to download the report.</p>
      </div>

      <header className="space-y-1 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold">Cognitive activity report</h1>
        <p><strong>Name:</strong> {name || "—"}</p>
        <p><strong>Period:</strong> {fullDate(weeks[0].start)} – {fullDate(weeks[3].end)}</p>
        <p><strong>Prepared:</strong> {fullDate(todayKey)}</p>
      </header>

      {/* Daily Cognitive Performance Report (Placed above 4-week trends) */}
      <section className="space-y-4 rounded-lg border border-slate-300 p-5 break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <label htmlFor="report-day-select" className="text-base font-bold text-slate-900">
              Day report:
            </label>
            <select
              id="report-day-select"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium print:hidden"
            >
              {availableDayOptions.map((d) => (
                <option key={d} value={d}>
                  {d === todayKey ? `Today (${fullDate(d)})` : `${fullDate(d)}`}
                </option>
              ))}
            </select>
            <span className="hidden font-semibold print:inline">{fullDate(selectedDay)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {dayReport?.status === "complete"
                ? "Complete"
                : dayReport?.status === "partial"
                ? "Partial report"
                : "No activities"}
            </span>
            {dayReport && (
              <Button
                variant="outline"
                size="sm"
                disabled={!dayReport.games || dayReport.games.length === 0}
                onClick={() => exportCsv(dayReport, selectedDay)}
                className="print:hidden"
              >
                <Download className="mr-2 h-4 w-4" /> Download CSV
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Activities completed</p>
            <p className="mt-1 font-semibold text-slate-900">
              {dayReport?.games_completed ?? 0} / {dayReport?.games_available ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Session duration</p>
            <p className="mt-1 font-semibold text-slate-900">
              {formatDuration(dayReport?.duration_seconds)}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Finished</p>
            <p className="mt-1 font-semibold text-slate-900">
              {dayReport?.completed_at
                ? new Date(dayReport.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "Not recorded"}
            </p>
          </div>
        </div>

        {dayReport && dayReport.missing_games.length > 0 && (
          <p className="text-xs text-slate-500">
            Not completed from daily plan:{" "}
            {dayReport.missing_games
              .map((id) => id.replace(/-/g, " ").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()))
              .join(", ")}
            . These are not treated as zero scores.
          </p>
        )}

        {/* Radar Chart & Domain Overview */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div>
            <h3 className="font-bold text-slate-900">Domain overview</h3>
            <p className="text-xs text-slate-500">
              Normalized scores describe performance on recorded activities, not health or clinical status.
            </p>
          </div>
          {dayReport?.games && dayReport.games.length > 0 ? (
            <>
              <ReportRadar scores={radarScores} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="py-2 pr-4 font-semibold">Domain</th>
                      <th className="py-2 pr-4 font-semibold">Observed score</th>
                      <th className="py-2 font-semibold">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AREAS.map((domain) => {
                      const res = dayReport.domains[domain];
                      return (
                        <tr key={domain} className="border-b border-slate-200 last:border-0">
                          <th scope="row" className="py-2 pr-4 font-medium">
                            {domain}
                          </th>
                          <td className="py-2 pr-4">
                            {res?.score == null ? "Not measured" : `${res.score}/100`}
                          </td>
                          <td className="py-2">{res?.game_count || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              No activities completed on this day. Missing domains are not measured.
            </p>
          )}
        </div>

        {/* Domain-wise Observations */}
        <div className="space-y-2">
          <h3 className="font-bold text-slate-900">Domain-wise observations</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {AREAS.map((domain) => {
              const res = dayReport?.domains[domain];
              const contributingRows = (dayReport?.games || []).filter(
                (g) => g.primary_domain === domain
              );
              return (
                <div key={domain} className="rounded-md border border-slate-200 bg-white p-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="font-semibold text-slate-900">{domain}</h4>
                    <span className="text-sm font-bold text-slate-900">
                      {res?.score == null ? "—" : `${res.score}/100`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {res?.game_count || 0} contributing activity{res?.game_count === 1 ? "" : "ies"} · {res?.confidence || "no data"}
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700 pt-1">
                    {observedNotes(domain, contributingRows)}
                  </p>
                  {res?.game_count === 1 && (
                    <p className="text-[11px] text-slate-400">
                      Limited observations: one activity contributes to this score.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Completed Activity Details Table */}
        {dayReport?.games && dayReport.games.length > 0 && (() => {
          const hasAccuracy = dayReport.games.some((g) => g.accuracy != null);
          const hasAttemptsOrErrors = dayReport.games.some(
            (g) => g.attempts != null || g.incorrect_answers != null || g.false_selections != null
          );
          const hasResponseTime = dayReport.games.some((g) => g.reaction_time_ms != null);
          const hasDifficulty = dayReport.games.some((g) => g.difficulty_level != null);

          return (
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Completed activity details</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="py-2 pr-3 font-semibold">Activity</th>
                      <th className="py-2 pr-3 font-semibold">Primary domain</th>
                      <th className="py-2 pr-3 font-semibold">Score</th>
                      {hasAccuracy && <th className="py-2 pr-3 font-semibold">Accuracy</th>}
                      {hasAttemptsOrErrors && <th className="py-2 pr-3 font-semibold">Attempts / errors</th>}
                      {hasResponseTime && <th className="py-2 pr-3 font-semibold">Response time</th>}
                      {hasDifficulty && <th className="py-2 font-semibold">Difficulty</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dayReport.games.map((g, idx) => (
                      <tr key={`${g.game_id}-${idx}`} className="border-b border-slate-200 last:border-0">
                        <th scope="row" className="py-2 pr-3 font-medium">
                          {g.game_name}
                        </th>
                        <td className="py-2 pr-3">{g.primary_domain}</td>
                        <td className="py-2 pr-3">{g.score}/100</td>
                        {hasAccuracy && <td className="py-2 pr-3">{formatPercent(g.accuracy)}</td>}
                        {hasAttemptsOrErrors && (
                          <td className="py-2 pr-3">
                            {g.attempts == null && g.incorrect_answers == null && g.false_selections == null
                              ? "Not measured"
                              : `${g.attempts ?? "—"} / ${g.incorrect_answers ?? g.false_selections ?? 0}`}
                          </td>
                        )}
                        {hasResponseTime && (
                          <td className="py-2 pr-3">
                            {g.reaction_time_ms == null ? "Not measured" : `${g.reaction_time_ms} ms`}
                          </td>
                        )}
                        {hasDifficulty && <td className="py-2">{g.difficulty_level ?? "Not recorded"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Important Note */}
        <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          <h4 className="font-bold text-slate-900">Important note</h4>
          <p className="mt-1">
            This report summarizes performance on activities completed in CogniConnect. It is intended to support engagement and observation, not to diagnose Alzheimer&apos;s disease, dementia, or cognitive impairment. Results can vary with fatigue, familiarity, mood, and other factors. Consult a qualified healthcare professional for clinical assessment.
          </p>
        </div>
      </section>

      {/* Existing 4-Week Trend Analysis (Retained below) */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">About these scores</h2>
        <p>
          These scores come from short daily memory and thinking activities in the Cogni Connect app, done at home.
          Each score runs from 0 to 100; higher is better. Scores are shown separately for each skill and each
          difficulty level and are not combined into one overall score. These are practice activities, not a
          clinical test, and a single day can be affected by tiredness or mood.
        </p>
        <p>
          <strong>Days with activity:</strong> {daysPlayed} of 28 days ({inPeriod.length} activities completed).
        </p>
      </section>

      <ScoreTable title="Average score by skill" weeks={weeks} groups={AREAS} series={byArea} entries={inPeriod} groupOf={(e) => e.area} />
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {AREAS.filter((a) => byArea[a]).map((a) => (
          <li key={a}><strong>{a}:</strong> {AREA_MEANING[a]}.</li>
        ))}
      </ul>

      <ScoreTable
        title="Average score by level"
        weeks={weeks}
        groups={Object.values(LEVEL_NAMES)}
        series={byLevel}
        entries={inPeriod}
        groupOf={(e) => (e.level ? LEVEL_NAMES[e.level] : undefined)}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Trend notes</h2>
        {drops.length === 0 && changes.length === 0 ? (
          <p>No notable changes in this period.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {drops.map((d) => (
              <li key={d.area}>
                {d.area}: the daily average went down on 5 activity days in a row (from {d.from} to {d.to}, since{" "}
                {fullDate(d.since)}).
              </li>
            ))}
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ScoreTable({
  title,
  weeks,
  groups,
  series,
  entries,
  groupOf,
}: {
  title: string;
  weeks: Week[];
  groups: readonly string[];
  series: Record<string, (number | null)[]>;
  entries: Entry[];
  groupOf: (e: Entry) => string | undefined;
}) {
  const shown = groups.filter((g) => series[g]);
  return (
    <section className="space-y-2 break-inside-avoid">
      <h2 className="text-lg font-bold">{title}</h2>
      {shown.length === 0 ? (
        <p>No scores in this period.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-400 text-left">
              <th className="py-1 pr-2"></th>
              {weeks.map((w) => (
                <th key={w.start} className="py-1 pr-2 font-semibold">
                  {shortDate(w.start)}–{shortDate(w.end)}
                </th>
              ))}
              <th className="py-1 pr-2 font-semibold">4 weeks</th>
              <th className="py-1 font-semibold">Activities</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => {
              const scores = entries.filter((e) => groupOf(e) === g).map((e) => e.score);
              return (
                <tr key={g} className="border-b border-slate-200">
                  <th scope="row" className="py-1 pr-2 text-left font-semibold">{g}</th>
                  {series[g].map((v, i) => (
                    <td key={i} className="py-1 pr-2">{v ?? "–"}</td>
                  ))}
                  <td className="py-1 pr-2">{Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}</td>
                  <td className="py-1">{scores.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
