"use client";

import { useEffect, useState } from "react";
import { apiFetch, API_URL } from "@/lib/api";
import { toEntries, type Entry } from "@/lib/progress";
import WeeklySummary from "./weeklySummary";
import DaySnapshot from "./daySnapshot";

export default function ProgressSummary({ audience = "caregiver" }: { audience?: "caregiver" | "self" }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    apiFetch(`${API_URL}/performance`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setEntries(toEntries(data))).catch(() => setEntries([]));
  }, []);
  return <div className="space-y-5" aria-label={audience === "self" ? "Your summary" : "Patient summary"}>
    {entries === null ? <p className="py-8 text-center text-muted-foreground">Loading weekly summary…</p> : <WeeklySummary entries={entries} audience={audience} />}
    <DaySnapshot />
  </div>;
}
