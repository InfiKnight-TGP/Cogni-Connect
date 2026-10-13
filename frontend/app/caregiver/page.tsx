"use client";

import { CaregiverOnly } from "@/components/caregiver";
import DashboardCard from "@/components/dashboardCard";
import Nav from "@/components/nav";
import { Card } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { addDays, format, startOfWeek } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Gamepad2,
  TrendingUp,
  Upload,
  Users2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ScoreEntry {
  date: string;
  score: number;
  game_id?: string;
}

export default function CaregiverHomePage() {
  return (
    <>
      <Nav />
      <CaregiverOnly>
        <CaregiverHome />
      </CaregiverOnly>
    </>
  );
}

function CaregiverHome() {
  const router = useRouter();
  const [daysPlayedThisWeek, setDaysPlayedThisWeek] = useState(0);
  const [activitiesDoneToday, setActivitiesDoneToday] = useState(0);
  const [totalPlannedToday, setTotalPlannedToday] = useState(6);

  const loadStats = useCallback(async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      const [planRes, perfRes] = await Promise.all([
        fetch(`${API_URL}/daily-plan?date=${today}`),
        fetch(`${API_URL}/performance`),
      ]);

      if (planRes.ok) {
        const p = await planRes.json();
        const plannedIds = [
          ...((p.level1 as string[]) ?? []),
          ...((p.level2 as string[]) ?? []),
          ...((p.level3 as string[]) ?? []),
        ];
        if (plannedIds.length > 0) {
          setTotalPlannedToday(plannedIds.length);
        }
      }

      if (perfRes.ok) {
        const perf = await perfRes.json();
        const doneToday = new Set<string>();
        (perf.scores ?? []).forEach((s: ScoreEntry) => {
          if (s.date === today) doneToday.add("daily_recall");
        });
        (perf.game_scores ?? []).forEach((s: ScoreEntry) => {
          if (s.date === today && s.game_id) doneToday.add(s.game_id);
        });
        setActivitiesDoneToday(doneToday.size);

        // Days played this week (Mon-Sun)
        const now = new Date();
        const monday = startOfWeek(now, { weekStartsOn: 1 });
        const weekDates = new Set(
          Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), "yyyy-MM-dd"))
        );

        const playedDatesThisWeek = new Set<string>();
        (perf.scores ?? []).forEach((s: ScoreEntry) => {
          if (s.date && weekDates.has(s.date)) playedDatesThisWeek.add(s.date);
        });
        (perf.game_scores ?? []).forEach((s: ScoreEntry) => {
          if (s.date && weekDates.has(s.date)) playedDatesThisWeek.add(s.date);
        });
        setDaysPlayedThisWeek(playedDatesThisWeek.size);
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const navigate = (path: string) => {
    router.push(path);
  };

  return (
    <main className="mx-auto max-w-screen-lg space-y-8 px-4 pb-16 pt-24 lg:pt-8">
      <div>
        <h1 className="text-3xl font-bold">Caregiver Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor cognitive engagement, view daily observations, and manage patient media.
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border bg-card p-4 sm:p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Days played this week
          </p>
          <p className="mt-2 text-3xl font-bold sm:text-4xl text-foreground">
            {daysPlayedThisWeek} <span className="text-lg font-normal text-muted-foreground">/ 7</span>
          </p>
        </Card>
        <Card className="border bg-card p-4 sm:p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Activities done today
          </p>
          <p className="mt-2 text-3xl font-bold sm:text-4xl text-foreground">
            {activitiesDoneToday} <span className="text-lg font-normal text-muted-foreground">/ {totalPlannedToday}</span>
          </p>
        </Card>
      </div>

      {/* Grid of DashboardCards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Progress (Gradient / reverse) */}
        <DashboardCard
          reverse
          link="/progress"
          navigate={navigate}
          className="flex flex-col justify-between"
        >
          <TrendingUp className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-blue-300 opacity-30 dark:opacity-40" />
          <div className="flex items-center justify-between text-2xl font-bold">
            <span>Progress</span>
            <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-medium text-blue-100 sm:text-base">
            Weekly performance, domain observations &amp; trends
          </p>
        </DashboardCard>

        {/* 2. Doctor's Report */}
        <DashboardCard
          link="/report"
          navigate={navigate}
          className="flex flex-col justify-between"
        >
          <FileText className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="flex items-center justify-between text-2xl font-bold">
            <span>Doctor&apos;s Report</span>
            <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Daily session reports, radar chart &amp; activity details
          </p>
        </DashboardCard>

        {/* 3. Add Videos */}
        <DashboardCard
          link="/upload"
          navigate={navigate}
          className="flex flex-col justify-between"
        >
          <Upload className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="flex items-center justify-between text-2xl font-bold">
            <span>Add Videos</span>
            <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Upload personal video memories for quiz questions
          </p>
        </DashboardCard>

        {/* 4. People */}
        <DashboardCard
          link="/people"
          navigate={navigate}
          className="flex flex-col justify-between"
        >
          <Users2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="flex items-center justify-between text-2xl font-bold">
            <span>People</span>
            <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Manage familiar contacts, relations &amp; photos
          </p>
        </DashboardCard>

        {/* 5. Daily Routine */}
        <DashboardCard
          link="/routine"
          navigate={navigate}
          className="flex flex-col justify-between"
        >
          <CalendarDays className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="flex items-center justify-between text-2xl font-bold">
            <span>Daily Routine</span>
            <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Configure patient schedule, reminders &amp; steps
          </p>
        </DashboardCard>

        {/* 6. All Games */}
        <DashboardCard
          link="/games"
          navigate={navigate}
          className="flex flex-col justify-between"
        >
          <Gamepad2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="flex items-center justify-between text-2xl font-bold">
            <span>All Games</span>
            <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
          </div>
          <p className="text-sm font-medium text-muted-foreground sm:text-base">
            Browse all 4 cognitive areas &amp; preview exercises
          </p>
        </DashboardCard>
      </div>
    </main>
  );
}
