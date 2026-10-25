"use client";

import { useEffect, useState } from "react";
import { apiFetch, API_URL } from "@/lib/api";
import { patientStatsFromEntries, toEntries, type PatientStats } from "@/lib/progress";

export type { PatientStats };

/** Pure calculation, kept separate so it is easy to reason about. */
export function computeStats(perf: Parameters<typeof toEntries>[0], now = new Date()): PatientStats {
  return patientStatsFromEntries(toEntries(perf), now);
}

export function usePatientStats(): PatientStats | null {
  const [stats, setStats] = useState<PatientStats | null>(null);
  useEffect(() => {
    apiFetch(`${API_URL}/performance`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((perf) => setStats(computeStats(perf)))
      .catch(() => setStats(computeStats({})));
  }, []);
  return stats;
}
