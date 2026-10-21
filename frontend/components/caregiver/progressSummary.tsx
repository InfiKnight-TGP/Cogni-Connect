"use client";

import { useEffect, useState } from "react";
import { apiFetch, API_URL } from "@/lib/api";
import { toEntries, type Entry } from "@/lib/progress";
import WeeklySummary from "./weeklySummary";
import DaySnapshot from "./daySnapshot";

export default function ProgressSummary() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    apiFetch(`${API_URL}/performance`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setEntries(toEntries(data))).catch(() => setEntries([]));
  }, []);
  return <div className="space-y-5">
    {entries === null ? <p className="py-8 text-center text-muted-foreground">Loading weekly summary…</p> : <WeeklySummary entries={entries} />}
    <DaySnapshot />
  </div>;
}
