"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { apiFetch, API_URL } from "@/lib/api";
import { COGNITIVE_AREAS } from "@/lib/areas";
import { AREAS, dayKey, type Area } from "@/lib/progress";

const ReportRadar = dynamic(() => import("@/app/report/RadarChart"), { ssr: false, loading: () => <p className="py-8 text-center text-sm text-muted-foreground">Loading chart…</p> });
type Domain = { score: number | null; game_count: number };
type DayReport = { date: string; games_completed: number; games_available: number; domains: Record<Area, Domain> };

export default function DaySnapshot() {
  const today = dayKey(new Date());
  const [selectedDay, setSelectedDay] = useState(today);
  const [days, setDays] = useState<string[]>([]);
  const [report, setReport] = useState<DayReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_URL}/reports/days`).then((response) => response.ok ? response.json() : { days: [] }).then((data) => setDays(Array.isArray(data.days) ? data.days : [])).catch(() => setDays([]));
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`${API_URL}/reports/day?date=${encodeURIComponent(selectedDay)}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (active) setReport(data); })
      .catch(() => { if (active) setReport(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedDay]);

  const scores: Record<Area, number | null> = {
    Memory: report?.domains?.Memory?.score ?? null,
    Attention: report?.domains?.Attention?.score ?? null,
    "Executive Function": report?.domains?.["Executive Function"]?.score ?? null,
    "Recognition & Orientation": report?.domains?.["Recognition & Orientation"]?.score ?? null,
  };
  const options = Array.from(new Set([today, ...days])).sort().reverse();

  return <Card className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Day snapshot</h2><p className="text-sm text-muted-foreground">Observed activity scores for one day</p></div><label className="text-sm font-medium">Day<select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="ml-2 min-h-11 rounded-md border border-input bg-background px-3"><option value={today}>Today</option>{options.filter((day) => day !== today).map((day) => <option key={day} value={day}>{day}</option>)}</select></label></div>
    {loading ? <p className="py-8 text-center text-muted-foreground" role="status">Loading day snapshot…</p> : <>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(260px,0.9fr)_1.1fr]">
        <div className="rounded-lg border border-border bg-muted/30 p-3"><ReportRadar scores={scores} /></div>
        <div className="grid gap-3 sm:grid-cols-2">{AREAS.map((area) => {
          const accent = COGNITIVE_AREAS.find((item) => item.name === area);
          const domain = report?.domains?.[area];
          return <article key={area} className={`rounded-lg border bg-card p-4 ${accent?.colorClasses ?? "border-border"}`}>
            <h3 className="text-sm font-semibold">{area}</h3>
            <p className="mt-2 text-2xl font-bold">{domain?.score == null ? "Not measured" : `${domain.score}/100`}</p>
            <p className="mt-1 text-xs opacity-80">{domain?.game_count ?? 0} activities</p>
          </article>;
        })}</div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Scores describe activity performance only; they are not a clinical measure.</p>
    </>}
  </Card>;
}
