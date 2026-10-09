"use client";

import Nav from "@/components/nav";
import { getGameById } from "@/components/games/registry";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Activity {
  id: string;
  level: 1 | 2 | 3;
}

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

const stars = (score: number) => (score >= 80 ? 3 : score >= 50 ? 2 : 1);

export default function TodayPage() {
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
        <main className="mx-auto max-w-screen-lg px-4 pb-16 pt-24">
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

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-screen-md space-y-10 px-4 pb-16 pt-28">
        <h1 className="text-5xl font-bold">{hello}</h1>

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
          <ol className="space-y-4">
            {plan.map((activity, i) => {
              const recall = activity.id === "daily_recall";
              const entry = getGameById(activity.id);
              if (!recall && !entry) return null;
              const score = best[activity.id];
              const done = score !== undefined;
              const row = (
                <>
                  <span
                    aria-hidden
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-3xl ${
                      done ? "bg-green-600 text-white" : "bg-primary/10"
                    }`}
                  >
                    {done ? "✓" : recall ? "🧠" : entry!.emoji}
                  </span>
                  <span className="flex-1">
                    <span className="block text-3xl font-bold">{recall ? "My Day" : `Activity ${i + 1}`}</span>
                    {done && (
                      <span className="block text-2xl text-amber-500" aria-label={`Done, ${stars(score)} of 3 stars`}>
                        {"★".repeat(stars(score))}
                        <span className="text-muted-foreground/40">{"★".repeat(3 - stars(score))}</span>
                      </span>
                    )}
                  </span>
                  <span className="text-2xl font-semibold text-primary">{done ? "Again" : "Start"} →</span>
                </>
              );
              const cls =
                "flex min-h-[96px] w-full items-center gap-5 rounded-2xl border-2 border-border bg-card p-5 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary";
              return (
                <li key={activity.id}>
                  {recall ? (
                    <Link href="/quiz?start=today" className={cls}>
                      {row}
                    </Link>
                  ) : (
                    <button className={cls} onClick={() => setPlaying(activity)}>
                      {row}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/explore"
            className="flex min-h-[96px] items-center justify-center gap-3 rounded-2xl bg-primary p-5 text-3xl font-bold text-primary-foreground hover:bg-primary/90"
          >
            📷 My Memories
          </Link>
          <Link
            href="/people"
            className="flex min-h-[96px] items-center justify-center gap-3 rounded-2xl bg-primary p-5 text-3xl font-bold text-primary-foreground hover:bg-primary/90"
          >
            👪 My People
          </Link>
        </div>
      </main>
    </>
  );
}
