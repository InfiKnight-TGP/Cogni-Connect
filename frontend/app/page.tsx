"use client";

import DashboardCard from "@/components/dashboardCard";
import Nav from "@/components/nav";
import RightColumn from "@/components/rightColumn";
import { API_URL } from "@/lib/api";
import { format, startOfWeek, addDays } from "date-fns";
import { ArrowRight, Brain, Image as Images, Star, Users2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ScoreEntry {
  date: string;
  score: number;
  game_id?: string;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  return "Good evening!";
}

export default function PatientHomePage() {
  const router = useRouter();
  const [hello, setHello] = useState("");
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(6);
  const [daysPlayedThisWeek, setDaysPlayedThisWeek] = useState(0);

  const loadData = useCallback(async () => {
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
          setTotalCount(plannedIds.length);
        }
      }

      if (perfRes.ok) {
        const perf = await perfRes.json();
        const scoresToday = new Set<string>();
        (perf.scores ?? []).forEach((s: ScoreEntry) => {
          if (s.date === today) scoresToday.add("daily_recall");
        });
        (perf.game_scores ?? []).forEach((s: ScoreEntry) => {
          if (s.date === today && s.game_id) scoresToday.add(s.game_id);
        });
        setDoneCount(scoresToday.size);

        // Calculate days played in current week (Mon-Sun)
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
      // Graceful fallback to default values
    }
  }, []);

  useEffect(() => {
    setHello(greeting());
    loadData();
  }, [loadData]);

  const navigate = (path: string) => {
    router.push(path);
  };

  return (
    <>
      <Nav />
      <div className="mx-auto flex max-w-screen-xl gap-8 px-4 pb-16 pt-24">
      <main className="min-w-0 flex-1 space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold sm:text-5xl">{hello}</h1>
          <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
            Welcome to CogniConnect
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Tile 1: Today's Activities */}
          <DashboardCard
            reverse
            link="/today"
            navigate={navigate}
            className="flex flex-col justify-between"
          >
            <Brain className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-blue-300 opacity-30 dark:opacity-40" />
            <div className="flex items-center justify-between text-2xl font-bold sm:text-3xl">
              <span>Today&apos;s Activities</span>
              <ArrowRight className="ml-2 h-7 w-7 shrink-0" />
            </div>
            <p className="text-xl font-medium text-blue-100 sm:text-2xl">
              {doneCount} of {totalCount} done today
            </p>
          </DashboardCard>

          {/* Tile 2: My Memories */}
          <DashboardCard
            link="/explore"
            navigate={navigate}
            className="flex flex-col justify-between"
          >
            <Images className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
            <div className="flex items-center justify-between text-2xl font-bold sm:text-3xl">
              <span>My Memories</span>
              <ArrowRight className="ml-2 h-7 w-7 shrink-0" />
            </div>
            <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
              Look back at your days
            </p>
          </DashboardCard>

          {/* Tile 3: My Progress */}
          <DashboardCard
            link="/my-progress"
            navigate={navigate}
            className="flex flex-col justify-between"
          >
            <Star className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
            <div className="flex items-center justify-between text-2xl font-bold sm:text-3xl">
              <span>My Progress</span>
              <ArrowRight className="ml-2 h-7 w-7 shrink-0" />
            </div>
            <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
              Played {daysPlayedThisWeek} {daysPlayedThisWeek === 1 ? "day" : "days"} this week
            </p>
          </DashboardCard>

          {/* Tile 4: My People */}
          <DashboardCard
            link="/people"
            navigate={navigate}
            className="flex flex-col justify-between"
          >
            <Users2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
            <div className="flex items-center justify-between text-2xl font-bold sm:text-3xl">
              <span>My People</span>
              <ArrowRight className="ml-2 h-7 w-7 shrink-0" />
            </div>
            <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
              Your family and friends
            </p>
          </DashboardCard>
        </div>
      </main>
      <RightColumn />
      </div>
    </>
  );
}
