"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, formatDistanceToNow } from "date-fns";
import { CalendarDays, Check, X } from "lucide-react";
import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mediaUrl, apiFetch, API_URL } from "@/lib/api";
import { COGNITIVE_AREAS } from "@/lib/areas";
import { GAME_REGISTRY } from "@/components/games/registry";
import { dayKey, toEntries, LEVEL_NAMES, type Entry } from "@/lib/progress";
import WeeklySummary from "@/components/caregiver/weeklySummary";

type Pin = { game_id: string; start: string; end: string };
type Settings = { patient_name?: string; pins?: Pin[] };
type Person = { name?: string; relation?: string; photo?: string };
type RawScore = { date?: string; timestamp?: string; game_id?: string; breakdown?: Record<string, number | null | undefined> };
type Performance = { scores?: RawScore[]; game_scores?: RawScore[] };
const BUNDLE_PARTS = ["face-recognition", "context-recall"];
const cardClass = "rounded-xl border border-border bg-card p-5 shadow-sm";

function localDay(raw?: string) {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : dayKey(parsed);
}

function myDayComplete(performance: Performance, day: string) {
  const found = new Set<string>();
  for (const row of performance.game_scores ?? []) if (localDay(row.date || row.timestamp) === day && row.game_id && BUNDLE_PARTS.includes(row.game_id)) found.add(row.game_id);
  for (const row of performance.scores ?? []) {
    if (localDay(row.date || row.timestamp) !== day || row.game_id !== "daily_recall" || !row.breakdown) continue;
    if (typeof (row.breakdown.activity1 ?? row.breakdown.activity1_faceRecognition) === "number") found.add("face-recognition");
    if (typeof (row.breakdown.activity3 ?? row.breakdown.activity3_contextQuestions) === "number") found.add("context-recall");
  }
  return BUNDLE_PARTS.every((id) => found.has(id));
}

export default function CaregiverHomePage() {
  return <><Nav /><CaregiverOnly><Overview /></CaregiverOnly></>;
}

function Overview() {
  const router = useRouter();
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [plan, setPlan] = useState<Record<string, string[]>>({});
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const entries = useMemo(() => toEntries(performance ?? {}), [performance]);
  const now = new Date();
  const today = dayKey(now);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const redirects: Record<string, string> = {
      overview: "/caregiver",
      log: "/progress?tab=log",
      progress: "/progress?tab=trends",
      report: "/progress?tab=report",
      setup: "/caregiver/settings",
    };
    if (tab && redirects[tab]) router.replace(redirects[tab]);
    else if (tab) router.replace("/caregiver");
  }, [router]);

  useEffect(() => {
    Promise.all([
      apiFetch(`${API_URL}/performance`), apiFetch(`${API_URL}/settings`), apiFetch(`${API_URL}/people`),
      apiFetch(`${API_URL}/daily-plan?date=${today}`),
    ]).then(async ([performanceResponse, settingsResponse, peopleResponse, planResponse]) => {
      if (!performanceResponse.ok || !settingsResponse.ok || !peopleResponse.ok || !planResponse.ok) throw new Error("Could not load overview");
      const [performanceData, settingsData, peopleData, planData] = await Promise.all([performanceResponse.json(), settingsResponse.json(), peopleResponse.json(), planResponse.json()]);
      setPerformance(performanceData); setSettings(settingsData); setPeople(Array.isArray(peopleData) ? peopleData : []); setPlan(planData);
    }).catch(() => setFailed(true));
  }, [today]);

  const saveSettings = async (next: Partial<Settings>) => {
    const response = await apiFetch(`${API_URL}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not save settings");
    setSettings(await response.json());
  };
  const addPin = async (gameId: string) => {
    const existing = settings.pins ?? [];
    if (!gameId || existing.length >= 2) return;
    const startDate = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
    const pin = { game_id: gameId, start: dayKey(startDate), end: dayKey(addDays(startDate, 6)) };
    try { await saveSettings({ pins: [...existing, pin] }); setNotice("Focus game saved for the next seven days."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save focus game."); }
  };
  const removePin = async (gameId: string) => {
    try { await saveSettings({ pins: (settings.pins ?? []).filter((pin) => pin.game_id !== gameId) }); setNotice("Focus game removed."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove focus game."); }
  };

  const self = people.find((person) => person.relation?.trim().toLowerCase() === "self");
  const latest = entries.map((entry) => entry.day).sort().at(-1);
  const todayPlan = ["level1", "level2", "level3"].flatMap((key) => (plan[key] ?? []).map((gameId) => ({ level: Number(key.slice(-1)), gameId })));

  return <main className="mx-auto max-w-screen-xl space-y-6 px-4 pb-24 pt-24 lg:pb-12 lg:pt-8">
    <header><p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Caregiver portal</p><h1 className="mt-1 text-3xl font-bold">Overview</h1></header>
    {failed ? <p role="alert" className={cardClass}>Could not load the caregiver overview. Check that the backend is available.</p> : !performance ? <p className="py-10 text-center text-muted-foreground">Loading caregiver information…</p> : <div className="space-y-5">
      <Card className={cardClass}>
        <div className="flex items-center gap-4">
          {self?.photo ? <img src={mediaUrl(`/known-faces/${encodeURIComponent(self.photo)}`)} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold text-muted-foreground">{(settings.patient_name || "P").trim().slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">{settings.patient_name || "Patient"}</h2><p className="mt-1 text-sm text-muted-foreground">Last active: {latest ? formatDistanceToNow(new Date(`${latest}T12:00:00`), { addSuffix: true }) : "No activity yet"}</p></div>
        </div>
      </Card>
      <WeeklySummary entries={entries} now={now} />
      <Card className={cardClass}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Today’s plan</h2><p className="text-sm text-muted-foreground">Planned activities and completion</p></div><span className="text-sm text-muted-foreground">{todayPlan.filter(({ gameId }) => gameId === "daily_recall" ? myDayComplete(performance, today) : entries.some((entry) => entry.day === today && entry.gameId === gameId)).length} of {todayPlan.length} complete</span></div>
        {todayPlan.length ? <ul className="mt-3 divide-y divide-border">{todayPlan.map(({ level, gameId }) => { const done = gameId === "daily_recall" ? myDayComplete(performance, today) : entries.some((entry) => entry.day === today && entry.gameId === gameId); const game = GAME_REGISTRY.find((item) => item.id === gameId); return <li key={`${level}-${gameId}`} className="flex items-center justify-between gap-3 py-3"><span><span className="font-medium">{gameId === "daily_recall" ? "My Day" : game?.name ?? gameId}</span><span className="ml-2 text-sm text-muted-foreground">{gameId === "daily_recall" ? "Daily Recall" : game?.area} · {LEVEL_NAMES[level as keyof typeof LEVEL_NAMES]}</span></span><span className={`flex h-7 w-7 items-center justify-center rounded-full ${done ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`} aria-label={done ? "Done" : "Not done"}>{done ? <Check className="h-4 w-4" /> : <span className="text-xs">—</span>}</span></li>; })}</ul> : <p className="mt-4 text-sm text-muted-foreground">No activities are planned for today.</p>}</Card>
      <FocusCard pins={settings.pins ?? []} onAdd={addPin} onRemove={removePin} notice={notice} />
    </div>}
  </main>;
}

function FocusCard({ pins, onAdd, onRemove, notice }: { pins: Pin[]; onAdd: (id: string) => void; onRemove: (id: string) => void; notice: string }) {
  const [selected, setSelected] = useState("");
  const bundled = ["face-recognition", "context-recall"];
  const games = GAME_REGISTRY.filter((game) => !game.comingSoon && game.id !== "daily_recall" && !bundled.includes(game.id) && !pins.some((pin) => pin.game_id === game.id));
  const grouped = COGNITIVE_AREAS.map((area) => ({ area, games: games.filter((game) => game.area === area.name && !pins.some((pin) => GAME_REGISTRY.find((item) => item.id === pin.game_id)?.levels[0] === game.levels[0])) })).filter((group) => group.games.length);
  return <Card className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Focus this week</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Choose up to two ready games. Each starts tomorrow and stays in the daily plan for seven days.</p></div>{pins.length < 2 && <div className="flex gap-2"><select aria-label="Choose a focus game" value={selected} onChange={(event) => setSelected(event.target.value)} className="min-h-11 max-w-60 rounded-md border bg-background px-3 text-sm"><option value="">Choose a game…</option>{grouped.map(({ area, games: areaGames }) => <optgroup key={area.name} label={area.name}>{areaGames.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</optgroup>)}</select><Button variant="outline" disabled={!selected} onClick={() => { onAdd(selected); setSelected(""); }}>Pin game</Button></div>}</div>
    {pins.length ? <ul className="mt-4 divide-y divide-border">{pins.map((pin) => { const game = GAME_REGISTRY.find((item) => item.id === pin.game_id); return <li key={pin.game_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="text-sm"><strong>{game?.name ?? pin.game_id}</strong><span className="ml-2 text-muted-foreground">through {pin.end}</span></span><button type="button" onClick={() => onRemove(pin.game_id)} className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /> Remove</button></li>; })}</ul> : <p className="mt-4 text-sm text-muted-foreground">No focus games pinned.</p>}
    {notice && <p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p>}
  </Card>;
}
