"use client";

import Nav from "@/components/nav";
import { getGameById } from "@/components/games/registry";
import { API_URL } from "@/lib/api";
import { addDays, format, startOfWeek } from "date-fns";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";

interface ScoreEntry {
  date: string;
  score: number;
  game_id?: string;
}

const FRIENDLY_NAMES: Record<string, string> = {
  daily_recall: "My Day",
  "story-builder": "Story Time",
  "plan-the-day": "Plan My Day",
  "word-association": "Word Pairs",
  "odd-one-out": "Spot the Odd One",
  "mole-path": "Path Memory",
  "sorting-station": "Sorting",
  "whack-a-mole": "Quick Tap",
  "attention-hunt": "Find It",
  "map-navigator": "Find the Way",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const calcStars = (score: number) => (score >= 80 ? 3 : score >= 50 ? 2 : 1);

export default function MyProgressPage() {
  const [loading, setLoading] = useState(true);
  const [playedDays, setPlayedDays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [daysCount, setDaysCount] = useState(0);
  const [totalStars, setTotalStars] = useState(0);
  const [bestGame, setBestGame] = useState<{ name: string; stars: number } | null>(null);

  const loadProgress = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/performance`);
      if (!res.ok) throw new Error();
      const perf = await res.json();

      const now = new Date();
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      const weekDateStrings = Array.from({ length: 7 }, (_, i) =>
        format(addDays(monday, i), "yyyy-MM-dd")
      );

      const allScores: ScoreEntry[] = [
        ...((perf.scores as ScoreEntry[]) ?? []).map((s) => ({ ...s, game_id: "daily_recall" })),
        ...((perf.game_scores as ScoreEntry[]) ?? []),
      ];

      // Calculate which days were played this week
      const daysPlayedMask = weekDateStrings.map((dayStr) =>
        allScores.some((s) => s.date === dayStr)
      );
      setPlayedDays(daysPlayedMask);
      setDaysCount(daysPlayedMask.filter(Boolean).length);

      // Filter entries from this week
      const weekScores = allScores.filter((s) => weekDateStrings.includes(s.date));

      // Total stars earned this week
      const starsSum = weekScores.reduce((sum, s) => sum + calcStars(s.score), 0);
      setTotalStars(starsSum);

      // Best activity this week
      if (weekScores.length > 0) {
        let bestEntry = weekScores[0];
        for (const s of weekScores) {
          if (s.score > bestEntry.score) {
            bestEntry = s;
          }
        }
        const friendlyName =
          (bestEntry.game_id && FRIENDLY_NAMES[bestEntry.game_id]) ||
          (bestEntry.game_id && getGameById(bestEntry.game_id)?.name) ||
          "Activity";
        setBestGame({
          name: friendlyName,
          stars: calcStars(bestEntry.score),
        });
      } else {
        setBestGame(null);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const encouragingMessage = () => {
    if (daysCount >= 5) {
      return "Incredible dedication! You are keeping your mind active, bright, and strong.";
    }
    if (daysCount >= 3) {
      return "Great effort! Practicing through the week keeps your memory sharp and energized.";
    }
    if (daysCount >= 1) {
      return "Well done! Every activity you do makes a wonderful difference.";
    }
    return "Welcome! A fun week of brain games and memory activities is waiting for you.";
  };

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-screen-lg space-y-8 px-4 pb-16 pt-28 lg:pt-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold sm:text-5xl">My Progress</h1>
          <p className="text-2xl font-medium text-muted-foreground">
            A look at your activities this week
          </p>
        </header>

        {loading ? (
          <p className="text-2xl font-medium">Loading your progress…</p>
        ) : (
          <div className="space-y-8">
            {/* Mon-Sun Weekly Row */}
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 shadow-sm sm:p-8 space-y-6">
              <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
                You played {daysCount} {daysCount === 1 ? "day" : "days"} this week!
              </h2>

              <div className="grid grid-cols-7 gap-2 sm:gap-4">
                {DAY_NAMES.map((dayName, idx) => {
                  const played = playedDays[idx];
                  return (
                    <div
                      key={dayName}
                      className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-background/50 p-3 sm:p-4 text-center"
                    >
                      <span className="text-lg font-bold sm:text-2xl text-foreground">
                        {dayName}
                      </span>
                      <div
                        className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full text-2xl font-bold shadow-sm ${
                          played
                            ? "bg-green-600 text-white"
                            : "border-2 border-dashed border-muted-foreground/30 text-muted-foreground/30"
                        }`}
                        aria-label={played ? `${dayName}: Played` : `${dayName}: Not played`}
                      >
                        {played ? "✓" : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stars & Best This Week */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Stars Earned */}
              <div className="flex flex-col justify-between rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-6 sm:p-8 space-y-3">
                <span className="text-xl font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Stars Earned This Week
                </span>
                <div className="flex items-center gap-3 text-4xl sm:text-5xl font-bold text-amber-600 dark:text-amber-400">
                  <span className="text-5xl sm:text-6xl" aria-hidden>⭐</span>
                  <span>{totalStars} {totalStars === 1 ? "star" : "stars"}</span>
                </div>
                <p className="text-lg sm:text-xl font-medium text-amber-900/80 dark:text-amber-200">
                  Earned from your completed daily activities.
                </p>
              </div>

              {/* Best Game This Week */}
              <div className="flex flex-col justify-between rounded-2xl border-2 border-primary/40 bg-primary/10 p-6 sm:p-8 space-y-3">
                <span className="text-xl font-bold uppercase tracking-wider text-primary">
                  Your Best This Week
                </span>
                {bestGame ? (
                  <div className="space-y-2">
                    <p className="text-3xl sm:text-4xl font-bold text-foreground">
                      {bestGame.name}
                    </p>
                    <div className="text-3xl sm:text-4xl text-amber-500" aria-label={`${bestGame.stars} stars`}>
                      {"★".repeat(bestGame.stars)}
                    </div>
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">
                    Play an activity today to see your best!
                  </p>
                )}
                <p className="text-lg sm:text-xl font-medium text-muted-foreground">
                  Your top performance across this week&apos;s games.
                </p>
              </div>
            </div>

            {/* Encouraging Message Banner */}
            <div className="rounded-2xl border-2 border-green-500/40 bg-green-50 p-6 text-center text-2xl font-bold text-green-900 dark:bg-green-950/40 dark:text-green-100 sm:text-3xl shadow-sm">
              {encouragingMessage()}
            </div>

            {/* Quick Link to Today's Activities */}
            <div className="text-center pt-2">
              <Link
                href="/today"
                className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-primary px-8 text-2xl font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary"
              >
                Go to Today&apos;s Activities →
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
