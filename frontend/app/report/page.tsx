"use client";

import { CaregiverOnly } from "@/components/caregiver";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import {
  AREAS, Area, Entry, LEVEL_NAMES, Week, dayKey, declines, lastFourWeeks, shortDate, toEntries, trend,
  weeklyAverages,
} from "@/lib/progress";
import { useEffect, useState } from "react";

const AREA_MEANING: Record<Area, string> = {
  Memory: "remembering words, daily events, and sequences",
  Attention: "focusing on targets and spotting items among distractions",
  "Executive Function": "planning daily steps and adapting when rules change",
  "Recognition & Orientation": "recognising familiar people and following routes and directions",
};

const fullDate = (key: string) => `${shortDate(key)} ${key.slice(0, 4)}`;

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
  const weeks = lastFourWeeks(today);

  useEffect(() => {
    Promise.all([fetch(`${API_URL}/performance`), fetch(`${API_URL}/settings`)])
      .then(async ([perf, settings]) => {
        if (!perf.ok) throw new Error();
        setEntries(toEntries(await perf.json()));
        if (settings.ok) setName((await settings.json()).patient_name ?? "");
      })
      .catch(() => setFailed(true));
  }, []);

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
        <p><strong>Prepared:</strong> {fullDate(dayKey(today))}</p>
      </header>

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
