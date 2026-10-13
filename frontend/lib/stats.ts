"use client";

import { addDays, format, startOfWeek, subDays } from "date-fns";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

interface ScoreEntry {
  date: string;
  score: number;
  game_id?: string;
}

export interface PatientStats {
  streak: number; // consecutive days with at least one activity
  starsThisWeek: number;
  doneToday: number; // distinct activities finished today
}

const calcStars = (score: number) => (score >= 80 ? 3 : score >= 50 ? 2 : 1);

/** Pure calculation, kept separate so it is easy to reason about. */
export function computeStats(perf: { scores?: ScoreEntry[]; game_scores?: ScoreEntry[] }, now = new Date()): PatientStats {
  const all: ScoreEntry[] = [
    ...(perf.scores ?? []).map((s) => ({ ...s, game_id: "daily_recall" })),
    ...(perf.game_scores ?? []),
  ];
  const key = (d: Date) => format(d, "yyyy-MM-dd");
  const days = new Set(all.map((s) => s.date));

  // A streak still counts if today has no activity yet but yesterday did.
  let cursor = days.has(key(now)) ? now : subDays(now, 1);
  let streak = 0;
  while (days.has(key(cursor))) {
    streak++;
    cursor = subDays(cursor, 1);
  }

  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const week = new Set(Array.from({ length: 7 }, (_, i) => key(addDays(monday, i))));
  const starsThisWeek = all.filter((s) => week.has(s.date)).reduce((sum, s) => sum + calcStars(s.score), 0);

  const today = key(now);
  const doneToday = new Set(all.filter((s) => s.date === today && s.game_id).map((s) => s.game_id)).size;

  return { streak, starsThisWeek, doneToday };
}

export function usePatientStats(): PatientStats | null {
  const [stats, setStats] = useState<PatientStats | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/performance`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((perf) => setStats(computeStats(perf)))
      .catch(() => setStats(computeStats({})));
  }, []);
  return stats;
}
