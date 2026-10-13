"use client";

import { CaregiverOnly } from "@/components/caregiver";
import Nav from "@/components/nav";
import ActivityLog from "@/components/caregiver/activityLog";
import ProgressContent from "@/components/caregiver/progressContent";
import ProgressSummary from "@/components/caregiver/progressSummary";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { AREAS, lastFourWeeks, shortDate, toEntries, type Area, type Entry } from "@/lib/progress";
import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Tab = "summary" | "trends" | "log" | "report";
const TABS: [Tab, string][] = [["summary", "Summary"], ["trends", "Trends"], ["log", "Activity Log"], ["report", "Doctor’s Report"]];

export default function ProgressPage() {
  return <><Nav /><CaregiverOnly><ProgressReports /></CaregiverOnly></>;
}

function ProgressReports() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("summary");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (TABS.some(([key]) => key === value)) setTab(value!);
    else if (value) router.replace("/progress");
  }, [router]);
  const selectTab = (next: Tab) => {
    setTab(next);
    router.replace(next === "summary" ? "/progress" : `/progress?tab=${next}`);
  };

  return <main className="mx-auto max-w-screen-xl space-y-6 px-4 pb-24 pt-24 lg:pb-12 lg:pt-8">
    <header><p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Caregiver portal</p><h1 className="mt-1 text-3xl font-bold">Progress &amp; Reports</h1></header>
    <nav aria-label="Progress and report sections" className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map(([key, label]) => <button key={key} type="button" onClick={() => selectTab(key)} aria-current={tab === key ? "page" : undefined} className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
    </nav>
    {tab === "summary" && <ProgressSummary />}
    {tab === "trends" && <ProgressContent />}
    {tab === "log" && <ActivityLog />}
    {tab === "report" && <DoctorReportPreview />}
  </main>;
}

function DoctorReportPreview() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const today = new Date();
  const weeks = lastFourWeeks(today);
  useEffect(() => {
    Promise.all([fetch(`${API_URL}/settings`), fetch(`${API_URL}/performance`)])
      .then(async ([settings, performance]) => {
        const settingsData = settings.ok ? await settings.json() : {};
        const perfData = performance.ok ? await performance.json() : {};
        setName(settingsData.patient_name ?? "");
        setEntries(toEntries(perfData));
      }).catch(() => setEntries([]));
  }, []);

  const periodEntries = entries?.filter((entry) => entry.day >= weeks[0].start && entry.day <= weeks[3].end) ?? [];
  const means = (area: Area) => {
    const values = periodEntries.filter((entry) => entry.area === area).map((entry) => entry.score);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  return <section className="max-w-3xl rounded-xl border border-border bg-card p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Doctor’s Report</h2><p className="mt-1 text-sm text-muted-foreground">A short preview of recorded activity for sharing with a doctor.</p></div><Button onClick={() => router.push("/report")}><Printer className="mr-2 h-4 w-4" />Print / Save as PDF</Button></div>
    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Patient</dt><dd className="font-medium">{name || "Not set"}</dd></div><div><dt className="text-muted-foreground">Period</dt><dd className="font-medium">{shortDate(weeks[0].start)} – {shortDate(weeks[3].end)} {today.getFullYear()}</dd></div></dl>
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-y"><th className="py-3 pr-3 font-semibold">Domain</th><th className="py-3 pr-3 font-semibold">Observed average</th><th className="py-3 font-semibold">Activities</th></tr></thead><tbody>{AREAS.map((area) => <tr key={area} className="border-b last:border-0"><th className="py-3 pr-3 font-medium">{area}</th><td className="py-3 pr-3">{means(area) == null ? "Not measured" : `${means(area)}/100`}</td><td className="py-3">{periodEntries.filter((entry) => entry.area === area).length}</td></tr>)}</tbody></table></div>
    {entries === null && <p className="mt-3 text-sm text-muted-foreground">Loading preview…</p>}
  </section>;
}
