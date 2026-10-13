"use client";

import DashboardCard from "@/components/dashboardCard";
import { getGameById } from "@/components/games/registry";
import Nav from "@/components/nav";
import RightColumn from "@/components/rightColumn";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Footprints,
  Hand,
  Image as Images,
  Link as LinkIcon,
  Map,
  Package,
  Search,
  Sparkles,
  Target,
  Users2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

interface Activity {
  id: string;
  level: 1 | 2 | 3;
}

interface ScoreEntry {
  date: string;
  score: number;
  game_id?: string;
}

interface ActivityMeta {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ACTIVITY_MAP: Record<string, ActivityMeta> = {
  daily_recall: { name: "My Day", icon: Brain },
  "story-builder": { name: "Story Time", icon: BookOpen },
  "plan-the-day": { name: "Plan My Day", icon: CalendarDays },
  "word-association": { name: "Word Pairs", icon: LinkIcon },
  "odd-one-out": { name: "Spot the Odd One", icon: Search },
  "mole-path": { name: "Path Memory", icon: Footprints },
  "sorting-station": { name: "Sorting", icon: Package },
  "whack-a-mole": { name: "Quick Tap", icon: Hand },
  "attention-hunt": { name: "Find It", icon: Target },
  "map-navigator": { name: "Find the Way", icon: Map },
};

function getActivityMeta(id: string): ActivityMeta {
  if (ACTIVITY_MAP[id]) return ACTIVITY_MAP[id];
  const reg = getGameById(id);
  return {
    name: reg?.name ?? "Activity",
    icon: Sparkles,
  };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  return "Good evening!";
}

const stars = (score: number) => (score >= 80 ? 3 : score >= 50 ? 2 : 1);

export default function TodayPage() {
  const router = useRouter();
  const [hello, setHello] = useState("");
  const [today, setToday] = useState("");
  const [plan, setPlan] = useState<Activity[] | null>(null);
  const [best, setBest] = useState<Record<string, number>>({}); // best score today per activity
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<Activity | null>(null);

  const load = useCallback(async (day: string) => {
    try {
      const [planRes, perfRes] = await Promise.all([
        fetch(`${API_URL}/daily-plan?date=${day}`),
        fetch(`${API_URL}/performance`),
      ]);
      if (!planRes.ok) throw new Error();
      const p = await planRes.json();
      setPlan(
        ([1, 2, 3] as const).flatMap((level) =>
          (p[`level${level}`] as string[]).map((id) => ({ id, level }))
        )
      );
      const perf = perfRes.ok ? await perfRes.json() : {};
      const scores: Record<string, number> = {};
      const add = (id: string, score: number) => (scores[id] = Math.max(scores[id] ?? 0, score));
      // Daily Recall lives in "scores" (older entries have no game_id), the games in "game_scores"
      (perf.scores ?? []).forEach((s: ScoreEntry) => s.date === day && add("daily_recall", s.score));
      (perf.game_scores ?? []).forEach((s: ScoreEntry) => s.date === day && s.game_id && add(s.game_id, s.score));
      setBest(scores);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const day = format(new Date(), "yyyy-MM-dd");
    setHello(greeting());
    setToday(day);
    load(day);
  }, [load]);

  const game = playing ? getGameById(playing.id) : null;
  const Game = game?.component;

  if (playing && Game) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-screen-lg px-4 pb-16 pt-24 lg:pt-8">
          <Button
            variant="outline"
            className="mb-6 h-14 px-6 text-xl"
            onClick={() => {
              setPlaying(null);
              load(today);
            }}
          >
            ← Back to my day
          </Button>
          <Game level={playing.level} date={today} />
        </main>
      </>
    );
  }

  const doneCount = plan ? plan.filter((a) => best[a.id] !== undefined).length : 0;
  const totalCount = plan ? plan.length : 0;
  const allDone = totalCount > 0 && doneCount === totalCount;
  const nextUnfinishedIndex = plan ? plan.findIndex((a) => best[a.id] === undefined) : -1;

  const navigate = (path: string) => {
    router.push(path);
  };

  return (
    <>
      <Nav />
      <div className="mx-auto flex max-w-screen-xl gap-8 px-4 pb-16 pt-24 lg:pt-8">
      <main className="min-w-0 flex-1 space-y-6">
        {/* Greeting & Progress */}
        <div className="space-y-1">
          <h1 className="text-4xl font-bold sm:text-5xl">{hello}</h1>
          {plan !== null && !failed && (
            <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
              {doneCount} of {totalCount} done today
            </p>
          )}
        </div>

        {failed ? (
          <div className="space-y-4">
            <p className="text-2xl">Sorry, we could not load your day.</p>
            <Button className="h-14 px-6 text-xl" onClick={() => load(today)}>
              Try again
            </Button>
          </div>
        ) : plan === null ? (
          <p className="text-2xl">Loading…</p>
        ) : (
          <>
            {/* Friendly All Done Banner */}
            {allDone && (
              <div className="w-full rounded-2xl border-2 border-green-500 bg-green-50 p-6 text-center text-2xl font-bold text-green-900 shadow-sm dark:bg-green-950/40 dark:text-green-100 sm:text-3xl">
                All done for today! 🌟
              </div>
            )}

            {/* Dashboard Tiles Grid */}
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plan.map((activity, i) => {
                const recall = activity.id === "daily_recall";
                const meta = getActivityMeta(activity.id);
                const score = best[activity.id];
                const done = score !== undefined;
                const isNext = !done && i === nextUnfinishedIndex;
                const Icon = meta.icon;

                const handleClick = () => {
                  if (recall) {
                    router.push("/quiz?start=today");
                  } else {
                    setPlaying(activity);
                  }
                };

                return (
                  <DashboardCard
                    key={`${activity.id}-${i}`}
                    onClick={handleClick}
                    reverse={isNext}
                    done={done}
                    className={isNext ? "sm:col-span-2 lg:col-span-2" : "col-span-1"}
                  >
                    <Icon
                      className={`absolute -bottom-6 -right-6 -z-10 h-36 w-36 ${
                        isNext ? "text-blue-300" : "text-primary"
                      } opacity-30 dark:opacity-40`}
                    />

                    {done ? (
                      <div className="flex h-full flex-col justify-between">
                        <div className="flex items-center justify-between text-2xl font-bold">
                          <span>{meta.name}</span>
                          <span className="flex items-center text-xl font-semibold text-green-700 dark:text-green-400">
                            Again
                            <ArrowRight className="ml-1 h-5 w-5 shrink-0" />
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-base font-bold text-white"
                          >
                            ✓
                          </span>
                          <span
                            className="text-2xl text-amber-500"
                            aria-label={`Done, ${stars(score)} of 3 stars`}
                          >
                            {"★".repeat(stars(score))}
                            <span className="text-muted-foreground/30">
                              {"★".repeat(3 - stars(score))}
                            </span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center text-2xl font-bold">
                        <span>{meta.name}</span>
                        <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
                      </div>
                    )}
                  </DashboardCard>
                );
              })}

              {/* Bottom Tiles: My Memories & My People */}
              <DashboardCard
                className="col-span-1 sm:col-span-2 lg:col-span-2"
                link="/explore"
                navigate={navigate}
              >
                <Images className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
                <div className="flex items-center text-2xl font-bold">
                  My Memories
                  <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
                </div>
              </DashboardCard>

              <DashboardCard
                className="col-span-1"
                link="/people"
                navigate={navigate}
              >
                <Users2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
                <div className="flex items-center text-2xl font-bold">
                  My People
                  <ArrowRight className="ml-2 h-6 w-6 shrink-0" />
                </div>
              </DashboardCard>
            </div>
          </>
        )}
      </main>
      <RightColumn />
      </div>
    </>
  );
}
