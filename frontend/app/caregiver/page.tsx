"use client";

import { CaregiverOnly } from "@/components/caregiver";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { COGNITIVE_AREAS } from "@/lib/areas";
import { GAME_REGISTRY } from "@/components/games/registry";
import { dayKey, daysPlayedThisWeek, gameArea, LEVEL_NAMES, toEntries, weeklyAverages, lastFourWeeks, trend, type Area, type Entry } from "@/lib/progress";
import { computeStats } from "@/lib/stats";
import ProgressContent from "@/components/caregiver/progressContent";
import { addDays, formatDistanceToNow } from "date-fns";
import { ArrowRight, CalendarDays, Check, Download, FileText, Gamepad2, LockKeyhole, Upload, Users2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Tab = "overview" | "log" | "progress" | "report" | "setup";
type Perf = { scores?: RawScore[]; game_scores?: RawScore[] };
type RawScore = { date?: string; timestamp?: string; score?: number; game_id?: string; skill?: string; level?: number; breakdown?: Record<string, number | null | undefined> };
type Activity = { id: string; date: string; activity: string; gameId: string; area: Area; level: number; score: number; stars: number };
type Person = { name?: string; relation?: string; photo?: string };
type Pin = { game_id: string; start: string; end: string };
type Settings = { patient_name?: string; language?: string; pins?: Pin[] };

const LANGUAGE_CHOICES = [
  ["en", "English"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["mr", "मराठी"], ["te", "తెలుగు"],
  ["ta", "தமிழ்"], ["gu", "ગુજરાતી"], ["ur", "اردو"], ["kn", "ಕನ್ನಡ"], ["or", "ଓଡ଼ିଆ"],
  ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["as", "অসমীয়া"], ["ne", "नेपाली"], ["mni-Mtei", "ꯃꯤꯇꯩꯂꯣꯟ"],
] as const;
const BUNDLE_PARTS = ["face-recognition", "name-recognition", "context-recall"];
const REAL_NAMES: Record<string, string> = { "daily_recall": "Daily Recall", "face-recognition": "Face Recognition", "name-recognition": "Name Recall", "context-recall": "Relive Memories" };
const cardClass = "rounded-xl border border-border bg-card p-5 shadow-sm";

function localDay(raw?: string) {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : dayKey(parsed);
}
function stars(score: number) { return score >= 80 ? 3 : score >= 50 ? 2 : 1; }
function activityRows(perf: Perf): Activity[] {
  const rows: Activity[] = [];
  const add = (raw: RawScore, id: string, score: number, level = raw.level ?? 1) => {
    const date = localDay(raw.date || raw.timestamp);
    const game = GAME_REGISTRY.find((item) => item.id === id);
    const area = gameArea(id, raw.skill) ?? game?.area ?? (id === "daily_recall" ? "Memory" : undefined);
    if (!date || !area || !Number.isFinite(score)) return;
    rows.push({ id: `${date}:${id}:${rows.length}`, date, activity: REAL_NAMES[id] ?? game?.name ?? id, gameId: id, area, level, score, stars: stars(score) });
  };
  for (const score of perf.scores ?? []) {
    const b = score.breakdown;
    if ((score.game_id === "daily_recall" || (!score.game_id && b)) && b) {
      const parts: [string, number | null | undefined][] = [
        ["face-recognition", b.activity1 ?? b.activity1_faceRecognition],
        ["name-recognition", b.activity2 ?? b.activity2_namePeople],
        ["context-recall", b.activity3 ?? b.activity3_contextQuestions],
      ];
      for (const [id, value] of parts) if (typeof value === "number") add(score, id, value, 1);
    } else if (typeof score.score === "number") add(score, score.game_id || "daily_recall", score.score);
  }
  for (const score of perf.game_scores ?? []) if (score.game_id && typeof score.score === "number") add(score, score.game_id, score.score);
  return rows;
}
function myDayComplete(perf: Perf, day: string) {
  const found = new Set<string>();
  for (const row of perf.game_scores ?? []) if (localDay(row.date || row.timestamp) === day && row.game_id && BUNDLE_PARTS.includes(row.game_id)) found.add(row.game_id);
  for (const row of perf.scores ?? []) {
    if (localDay(row.date || row.timestamp) !== day || row.game_id !== "daily_recall" || !row.breakdown) continue;
    if (typeof (row.breakdown.activity1 ?? row.breakdown.activity1_faceRecognition) === "number") found.add(BUNDLE_PARTS[0]);
    if (typeof (row.breakdown.activity2 ?? row.breakdown.activity2_namePeople) === "number") found.add(BUNDLE_PARTS[1]);
    if (typeof (row.breakdown.activity3 ?? row.breakdown.activity3_contextQuestions) === "number") found.add(BUNDLE_PARTS[2]);
  }
  return BUNDLE_PARTS.every((id) => found.has(id));
}
function weeklySummary(entries: Entry[], now: Date) {
  const weeks = lastFourWeeks(now);
  const averages = weeklyAverages(entries, weeks, (e) => e.area);
  const played = daysPlayedThisWeek(entries, now).filter(Boolean).length;
  const sentences = [`Played ${played} ${played === 1 ? "day" : "days"} this week.`];
  const present = COGNITIVE_AREAS.filter((area) => entries.some((e) => e.area === area.name && e.day >= weeks[3].start && e.day <= weeks[3].end));
  if (present.length) {
    const changed = present.map((area) => ({ area, direction: trend(averages[area.name] ?? []) })).filter((item) => item.direction === "up" || item.direction === "down");
    if (changed.length) {
      const up = changed.filter((x) => x.direction === "up").map((x) => x.area.name);
      const down = changed.filter((x) => x.direction === "down").map((x) => x.area.name);
      if (up.length) sentences.push(`${up.join(" and ")} ${up.length === 1 ? "was" : "were"} higher than the earlier weeks.`);
      if (down.length) sentences.push(`${down.join(" and ")} ${down.length === 1 ? "was" : "were"} lower than the earlier weeks.`);
    } else sentences.push("Scores were steady across the areas played.");
  }
  const missing = COGNITIVE_AREAS.filter((area) => !present.some((item) => item.name === area.name)).map((area) => area.name);
  if (missing.length && sentences.length < 4) sentences.push(`${missing.join(" and ")} ${missing.length === 1 ? "was" : "were"} not played this week.`);
  return sentences.slice(0, 4);
}

export default function CaregiverHomePage() {
  return <><Nav /><CaregiverOnly><CaregiverDashboard /></CaregiverOnly></>;
}

function CaregiverDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [perf, setPerf] = useState<Perf | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [plan, setPlan] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [languageDraft, setLanguageDraft] = useState("en");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (["overview", "log", "progress", "report", "setup"].includes(value ?? "")) setTab(value!);
    Promise.all([fetch(`${API_URL}/performance`), fetch(`${API_URL}/settings`), fetch(`${API_URL}/people`), fetch(`${API_URL}/daily-plan?date=${dayKey(new Date())}`)])
      .then(async ([p, s, pe, pl]) => {
        if (!p.ok) throw new Error("performance");
        const [perfData, settingsData, peopleData, planData] = await Promise.all([p.json(), s.json(), pe.json(), pl.json()]);
        setPerf(perfData); setSettings(settingsData); setPeople(Array.isArray(peopleData) ? peopleData : []); setPlan(planData);
        setNameDraft(settingsData.patient_name ?? ""); setLanguageDraft(settingsData.language ?? "en");
      }).catch(() => setLoadError(true));
  }, []);

  const selectTab = (next: Tab) => { setTab(next); router.replace(next === "overview" ? "/caregiver" : `/caregiver?tab=${next}`); window.dispatchEvent(new CustomEvent("caregiver-tab-change", { detail: next })); };
  const rows = useMemo(() => activityRows(perf ?? {}), [perf]);
  const now = new Date();
  const today = dayKey(now);
  const entries = useMemo(() => toEntries(perf ?? {}), [perf]);
  const patientStats = computeStats(perf ?? {}, now);
  const days = daysPlayedThisWeek(entries, now).filter(Boolean).length;
  const self = people.find((person) => person.relation?.trim().toLowerCase() === "self");
  const latest = rows.map((row) => row.date).sort().at(-1);
  const todayPlan = ["level1", "level2", "level3"].flatMap((level) => (plan[level] ?? []).map((gameId) => ({ level: Number(level.slice(-1)), gameId })));

  const saveSettings = async (extra: Partial<Settings>) => {
    const res = await fetch(`${API_URL}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra) });
    if (!res.ok) throw new Error((await res.json()).error ?? "Could not save settings");
    setSettings(await res.json());
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

  const tabs: [Tab, string][] = [["overview", "Overview"], ["log", "Activity Log"], ["progress", "Progress"], ["report", "Report"], ["setup", "Setup"]];
  return <main className="mx-auto max-w-screen-xl space-y-6 px-4 pb-24 pt-24 lg:pb-12 lg:pt-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Caregiver portal</p><h1 className="mt-1 text-3xl font-bold">{tabs.find(([key]) => key === tab)?.[1]}</h1></div>
      {tab === "overview" && <span className="text-sm text-muted-foreground">A calm view of daily activity and progress</span>}
    </header>
    <nav aria-label="Caregiver sections" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([key, label]) => <button key={key} onClick={() => selectTab(key)} aria-current={tab === key ? "page" : undefined} className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
    </nav>
    {loadError ? <p role="alert" className={cardClass}>Could not load the caregiver dashboard. Check that the backend is available.</p> : !perf ? <p className="py-10 text-center text-muted-foreground">Loading caregiver information…</p> : <>
      {tab === "overview" && <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Card className={cardClass}>
            <div className="flex items-center gap-4">
              {self?.photo ? <img src={`${API_URL}/known-faces/${encodeURIComponent(self.photo)}`} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold text-muted-foreground">{(settings.patient_name || "P").trim().slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">{settings.patient_name || "Patient"}</h2><p className="mt-1 text-sm text-muted-foreground">Last active: {latest ? formatDistanceToNow(new Date(`${latest}T12:00:00`), { addSuffix: true }) : "No activity yet"}</p></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/60 p-3"><p className="text-2xl font-bold">🔥 {patientStats.streak}</p><p className="text-sm text-muted-foreground">days in a row</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="text-2xl font-bold">{days} of 7</p><p className="text-sm text-muted-foreground">days played this week</p></div></div>
          </Card>
          <Card className={cardClass}><h2 className="text-lg font-semibold">This week</h2><div className="mt-3 space-y-2 text-sm leading-relaxed">{weeklySummary(entries, now).map((sentence, index) => <p key={index}>{sentence}</p>)}</div></Card>
        </div>
        <Card className={cardClass}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Today’s plan</h2><p className="text-sm text-muted-foreground">Planned activities and completion</p></div><span className="text-sm text-muted-foreground">{todayPlan.filter(({ gameId }) => gameId === "daily_recall" ? myDayComplete(perf, today) : rows.some((row) => row.date === today && row.gameId === gameId)).length} of {todayPlan.length} complete</span></div>
          {todayPlan.length ? <ul className="mt-3 divide-y divide-border">{todayPlan.map(({ level, gameId }) => { const done = gameId === "daily_recall" ? myDayComplete(perf, today) : rows.some((row) => row.date === today && row.gameId === gameId); const game = GAME_REGISTRY.find((item) => item.id === gameId); return <li key={`${level}-${gameId}`} className="flex items-center justify-between gap-3 py-3"><span><span className="font-medium">{gameId === "daily_recall" ? "My Day" : game?.name ?? gameId}</span><span className="ml-2 text-sm text-muted-foreground">{gameId === "daily_recall" ? "Daily Recall" : game?.area} · {LEVEL_NAMES[level as keyof typeof LEVEL_NAMES]}</span></span><span className={`flex h-7 w-7 items-center justify-center rounded-full ${done ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`} aria-label={done ? "Done" : "Not done"}>{done ? <Check className="h-4 w-4" /> : <span className="text-xs">—</span>}</span></li>; })}</ul> : <p className="mt-4 text-sm text-muted-foreground">No activities are planned for today.</p>}</Card>
        <FocusCard pins={settings.pins ?? []} onAdd={addPin} onRemove={removePin} notice={notice} />
        <section><h2 className="mb-3 text-lg font-semibold">Quick links</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Add Videos", "/upload", Upload], ["People", "/people", Users2], ["Daily Routine", "/routine", CalendarDays], ["All Games", "/games", Gamepad2]].map(([label, href, Icon]) => { const LinkIcon = Icon as typeof Upload; return <Link key={label as string} href={href as string} className="flex min-h-16 items-center justify-between rounded-xl border bg-card px-4 font-medium hover:bg-muted"><span>{label as string}</span><LinkIcon className="h-5 w-5 text-muted-foreground" /></Link>; })}</div></section>
      </div>}
      {tab === "log" && <ActivityLog rows={rows} />}
      {tab === "progress" && <ProgressContent />}
      {tab === "report" && <Card className={cardClass}><FileText className="h-8 w-8 text-muted-foreground" /><h2 className="mt-3 text-xl font-semibold">Doctor’s Report</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Open a printable summary of activity, scores, and observations to share with a doctor.</p><Button asChild className="mt-5"><Link href="/report">Open Doctor&apos;s Report <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></Card>}
      {tab === "setup" && <SetupPanel nameDraft={nameDraft} setNameDraft={setNameDraft} languageDraft={languageDraft} setLanguageDraft={setLanguageDraft} saveSettings={saveSettings} currentPin={currentPin} setCurrentPin={setCurrentPin} newPin={newPin} setNewPin={setNewPin} notice={notice} setNotice={setNotice} />}
    </>}
  </main>;
}

function FocusCard({ pins, onAdd, onRemove, notice }: { pins: Pin[]; onAdd: (id: string) => void; onRemove: (id: string) => void; notice: string }) {
  const [selected, setSelected] = useState("");
  const games = GAME_REGISTRY.filter((game) => !game.comingSoon && game.id !== "daily_recall" && !BUNDLE_PARTS.includes(game.id) && !pins.some((pin) => pin.game_id === game.id));
  const grouped = COGNITIVE_AREAS.map((area) => ({ area, games: games.filter((game) => game.area === area.name && !pins.some((pin) => GAME_REGISTRY.find((g) => g.id === pin.game_id)?.levels[0] === game.levels[0])) })).filter((group) => group.games.length);
  return <Card className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Focus this week</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Choose up to two ready games. Each starts tomorrow and stays in the daily plan for seven days.</p></div>{pins.length < 2 && <div className="flex gap-2"><select aria-label="Choose a focus game" value={selected} onChange={(event) => setSelected(event.target.value)} className="min-h-11 max-w-60 rounded-md border bg-background px-3 text-sm"><option value="">Choose a game…</option>{grouped.map(({ area, games: areaGames }) => <optgroup key={area.name} label={area.name}>{areaGames.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</optgroup>)}</select><Button variant="outline" disabled={!selected} onClick={() => { onAdd(selected); setSelected(""); }}>Pin game</Button></div>}</div>
    {pins.length ? <ul className="mt-4 divide-y divide-border">{pins.map((pin) => { const game = GAME_REGISTRY.find((item) => item.id === pin.game_id); return <li key={pin.game_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="text-sm"><strong>{game?.name ?? pin.game_id}</strong><span className="ml-2 text-muted-foreground">through {pin.end}</span></span><button onClick={() => onRemove(pin.game_id)} className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /> Remove</button></li>; })}</ul> : <p className="mt-4 text-sm text-muted-foreground">No focus games pinned.</p>}
    {notice && <p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p>}
  </Card>;
}

function ActivityLog({ rows }: { rows: Activity[] }) {
  const [area, setArea] = useState("all"); const [level, setLevel] = useState("all"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [sort, setSort] = useState<{ key: keyof Activity; direction: "asc" | "desc" }>({ key: "date", direction: "desc" }); const [page, setPage] = useState(0);
  const filtered = useMemo(() => rows.filter((row) => (area === "all" || row.area === area) && (level === "all" || row.level === Number(level)) && (!from || row.date >= from) && (!to || row.date <= to)).sort((a, b) => { const av = a[sort.key], bv = b[sort.key]; const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv)); return sort.direction === "asc" ? comparison : -comparison; }), [rows, area, level, from, to, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const exportCsv = () => { const values = [["Date", "Activity", "Area", "Level", "Score", "Stars"], ...filtered.map((row) => [row.date, row.activity, row.area, LEVEL_NAMES[row.level as keyof typeof LEVEL_NAMES], row.score, row.stars])]; const csv = values.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "cogniconnect-activity-log.csv"; anchor.click(); URL.revokeObjectURL(url); };
  const sortBy = (key: keyof Activity) => { setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" })); setPage(0); };
  const thClass = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  return <Card className={cardClass}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Activity Log</h2><p className="text-sm text-muted-foreground">{filtered.length} activities</p></div><Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div>
    <div className="mt-4 flex flex-wrap gap-3"><label className="text-sm">Area<select value={area} onChange={(e) => { setArea(e.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2"><option value="all">All areas</option>{COGNITIVE_AREAS.map((x) => <option key={x.name}>{x.name}</option>)}</select></label><label className="text-sm">Level<select value={level} onChange={(e) => { setLevel(e.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2"><option value="all">All levels</option>{Object.entries(LEVEL_NAMES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label className="text-sm">From<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2" /></label><label className="text-sm">To<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="ml-2 min-h-10 rounded-md border bg-background px-2" /></label></div>
    {!filtered.length ? <p className="py-12 text-center text-sm text-muted-foreground">No activities yet.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-y">{([["date", "Date"], ["activity", "Activity"], ["area", "Area"], ["level", "Level"], ["score", "Score"], ["stars", "Stars"]] as [keyof Activity, string][]).map(([key, title]) => <th key={key} className={thClass}><button onClick={() => sortBy(key)} className="hover:text-foreground">{title}{sort.key === key ? sort.direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}</tr></thead><tbody>{filtered.slice(page * 20, page * 20 + 20).map((row) => { const areaMeta = COGNITIVE_AREAS.find((item) => item.name === row.area); return <tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 tabular-nums">{row.date}</td><td className="px-3 py-3 font-medium">{row.activity}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${areaMeta?.colorClasses ?? ""}`}>{row.area}</span></td><td className="px-3 py-3">{LEVEL_NAMES[row.level as keyof typeof LEVEL_NAMES] ?? "Easy"}</td><td className="px-3 py-3 tabular-nums">{row.score}/100</td><td className="px-3 py-3" aria-label={`${row.stars} stars`}>{"★".repeat(row.stars)}<span className="sr-only"> {row.stars} stars</span></td></tr>; })}</tbody></table></div>}
    {filtered.length > 20 && <div className="mt-4 flex items-center justify-between"><span className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
  </Card>;
}

function SetupPanel({ nameDraft, setNameDraft, languageDraft, setLanguageDraft, saveSettings, currentPin, setCurrentPin, newPin, setNewPin, notice, setNotice }: { nameDraft: string; setNameDraft: (value: string) => void; languageDraft: string; setLanguageDraft: (value: string) => void; saveSettings: (value: Partial<Settings>) => Promise<void>; currentPin: string; setCurrentPin: (value: string) => void; newPin: string; setNewPin: (value: string) => void; notice: string; setNotice: (value: string) => void }) {
  const [pinBusy, setPinBusy] = useState(false);
  const saveProfile = async () => { try { await saveSettings({ patient_name: nameDraft.trim(), language: languageDraft }); setNotice("Settings saved."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save settings."); } };
  const changePin = async () => { setPinBusy(true); setNotice(""); try { const response = await fetch(`${API_URL}/caregiver/change-pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not change PIN"); setNotice("PIN changed."); setCurrentPin(""); setNewPin(""); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not change PIN."); } finally { setPinBusy(false); } };
  return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-3">{[["People", "/people", Users2], ["Daily Routine", "/routine", CalendarDays], ["Add Videos", "/upload", Upload]].map(([label, href, Icon]) => { const SetupIcon = Icon as typeof Users2; return <Link key={label as string} href={href as string} className="flex min-h-24 items-center gap-3 rounded-xl border bg-card p-4 font-medium hover:bg-muted"><SetupIcon className="h-6 w-6 text-muted-foreground" />{label as string}<ArrowRight className="ml-auto h-4 w-4" /></Link>; })}</section>
    <Card className={cardClass}><h2 className="text-lg font-semibold">Patient settings</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Patient name<input value={nameDraft} maxLength={60} onChange={(e) => setNameDraft(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label><label className="text-sm font-medium">Default language<select value={languageDraft} onChange={(e) => setLanguageDraft(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3">{LANGUAGE_CHOICES.map(([code, native]) => <option key={code} value={code}>{code.toUpperCase()} – {native}</option>)}</select></label></div><Button className="mt-4" onClick={saveProfile}>Save settings</Button></Card>
    <Card className={cardClass}><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-muted-foreground" /><h2 className="text-lg font-semibold">Change caregiver PIN</h2></div><p className="mt-1 text-sm text-muted-foreground">Enter the current PIN and choose a new four-digit PIN. PINs are never displayed.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Current PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label><label className="text-sm font-medium">New PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label></div><Button className="mt-4" disabled={pinBusy || currentPin.length !== 4 || newPin.length !== 4} onClick={changePin}>Change PIN</Button></Card>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}</div>;
}
