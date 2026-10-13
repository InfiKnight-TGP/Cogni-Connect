"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { PatientStats, patientStats } from "@/lib/progress";

export type { PatientStats };

export function usePatientStats(): PatientStats | null {
  const [stats, setStats] = useState<PatientStats | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/performance`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((perf) => setStats(patientStats(perf, new Date())))
      .catch(() => setStats(patientStats({}, new Date())));
  }, []);
  return stats;
}
