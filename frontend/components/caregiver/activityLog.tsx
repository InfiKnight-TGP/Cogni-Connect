"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { GAME_REGISTRY } from "@/components/games/registry";
import { COGNITIVE_AREAS } from "@/lib/areas";
import { dayKey, gameArea, LEVEL_NAMES, type Area } from "@/lib/progress";
import { Download, Trash2 } from "lucide-react";

type RawScore = { id?: string; date?: string; timestamp?: string; score?: number; game_id?: string; skill?: string; level?: number; breakdown?: Record<string, number | null | undefined> };
type Performance = { scores?: RawScore[]; game_scores?: RawScore[] };
type Activity = { id: string; sourceId: string; legacySplit: boolean; date: string; activity: string; gameId: string; area: Area; level: number; score: number; stars: number };
const REAL_NAMES: Record<string, string> = { daily_recall: "Daily Recall", "face-recognition": "Face Recognition", "name-recognition": "Name Recall", "context-recall": "Relive Memories" };

function localDay(raw?: string) {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : dayKey(parsed);
}
function stars(score: number) { return score >= 80 ? 3 : score >= 50 ? 2 : 1; }

function activityRows(performance: Performance): Activity[] {
  const rows: Activity[] = [];
  const add = (raw: RawScore, gameId: string, score: number, legacySplit = false) => {
    const date = localDay(raw.date || raw.timestamp);
    const game = GAME_REGISTRY.find((item) => item.id === gameId);
    const area = gameArea(gameId, raw.skill) ?? game?.area ?? (gameId === "daily_recall" ? "Memory" : undefined);
    if (!date || !area || !Number.isFinite(score)) return;
    const sourceId = raw.id || `${date}:${gameId}:${rows.length}`;
    rows.push({ id: `${sourceId}:${rows.length}`, sourceId, legacySplit, date, activity: REAL_NAMES[gameId] ?? game?.name ?? gameId, gameId, area, level: raw.level ?? 1, score, stars: stars(score) });
  };
  for (const score of performance.scores ?? []) {
    const breakdown = score.breakdown;
    if ((score.game_id === "daily_recall" || (!score.game_id && breakdown)) && breakdown) {
      const parts: [string, number | null | undefined][] = [
        ["face-recognition", breakdown.activity1 ?? breakdown.activity1_faceRecognition],
        ["name-recognition", breakdown.activity2 ?? breakdown.activity2_namePeople],
        ["context-recall", breakdown.activity3 ?? breakdown.activity3_contextQuestions],
      ];
      for (const [gameId, value] of parts) if (typeof value === "number") add(score, gameId, value, true);
    } else if (typeof score.score === "number") add(score, score.game_id || "daily_recall", score.score);
  }
  for (const score of performance.game_scores ?? []) if (score.game_id && typeof score.score === "number") add(score, score.game_id, score.score);
  return rows;
}

export default function ActivityLog() {
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [area, setArea] = useState("all");
  const [level, setLevel] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: keyof Activity; direction: "asc" | "desc" }>({ key: "date", direction: "desc" });
  const [page, setPage] = useState(0);
  const refresh = useCallback(() => fetch(`${API_URL}/performance`)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load activities")))
    .then((data) => { setPerformance(data); setLoadError(false); })
    .catch(() => setLoadError(true)), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const rows = useMemo(() => activityRows(performance ?? {}), [performance]);
  const filtered = useMemo(() => rows.filter((row) => (area === "all" || row.area === area) && (level === "all" || row.level === Number(level)) && (!from || row.date >= from) && (!to || row.date <= to)).sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.direction === "asc" ? comparison : -comparison;
  }), [rows, area, level, from, to, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const exportCsv = () => {
    const values = [["Date", "Activity", "Area", "Level", "Score", "Stars"], ...filtered.map((row) => [row.date, row.activity, row.area, LEVEL_NAMES[row.level as keyof typeof LEVEL_NAMES], row.score, row.stars])];
    const csv = values.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "cogniconnect-activity-log.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  const remove = async (row: Activity) => {
    const message = row.legacySplit
      ? "Remove this activity from the patient's history? This is a split row from a legacy Daily Recall record, so removing it will delete the original record and all of its parts."
      : "Remove this activity from the patient's history?";
    if (!window.confirm(message)) return;
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/performance/${encodeURIComponent(row.sourceId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not remove activity.");
      await refresh();
      setPage((current) => Math.min(current, Math.max(0, Math.ceil((filtered.length - 1) / 20) - 1)));
      setNotice(row.legacySplit ? "The original Daily Recall record and its parts were removed." : "Activity removed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove activity."); }
  };
  const sortBy = (key: keyof Activity) => { setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" })); setPage(0); };
  const headings: [keyof Activity, string][] = [["date", "Date"], ["activity", "Activity"], ["area", "Area"], ["level", "Level"], ["score", "Score"], ["stars", "Stars"]];

  return <Card className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Activity Log</h2><p className="text-sm text-muted-foreground">{filtered.length} activities</p></div><Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div>
    <div className="mt-4 flex flex-wrap gap-3">
      <label className="text-sm">Area<select value={area} onChange={(event) => { setArea(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2"><option value="all">All areas</option>{COGNITIVE_AREAS.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
      <label className="text-sm">Level<select value={level} onChange={(event) => { setLevel(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2"><option value="all">All levels</option>{Object.entries(LEVEL_NAMES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label className="text-sm">From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2" /></label>
      <label className="text-sm">To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2" /></label>
    </div>
    {loadError ? <p role="alert" className="py-10 text-center text-sm text-muted-foreground">Could not load activities.</p> : !filtered.length ? <p className="py-12 text-center text-sm text-muted-foreground">No activities yet.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-y">{headings.map(([key, title]) => <th key={key} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"><button onClick={() => sortBy(key)} className="hover:text-foreground">{title}{sort.key === key ? sort.direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}<th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th></tr></thead><tbody>{filtered.slice(page * 20, page * 20 + 20).map((row) => { const areaMeta = COGNITIVE_AREAS.find((item) => item.name === row.area); return <tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 tabular-nums">{row.date}</td><td className="px-3 py-3 font-medium">{row.activity}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${areaMeta?.colorClasses ?? ""}`}>{row.area}</span></td><td className="px-3 py-3">{LEVEL_NAMES[row.level as keyof typeof LEVEL_NAMES] ?? "Easy"}</td><td className="px-3 py-3 tabular-nums">{row.score}/100</td><td className="px-3 py-3" aria-label={`${row.stars} stars`}>{"★".repeat(row.stars)}<span className="sr-only"> {row.stars} stars</span></td><td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" className="min-h-10" onClick={() => void remove(row)}><Trash2 className="mr-1 h-4 w-4" />Remove</Button></td></tr>; })}</tbody></table></div>}
    {filtered.length > 20 && <div className="mt-4 flex items-center justify-between"><span className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
  </Card>;
}
