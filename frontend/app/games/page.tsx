"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import { GAME_REGISTRY, getGameById, GameRegistryEntry } from "@/components/games/registry";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Brain, Calendar, Gamepad2, Sparkles, Trophy } from "lucide-react";
import { format } from "date-fns";
import { API_URL } from "@/lib/api";

interface DailyPlanResponse {
  level1: string[];
  level2: string[];
  level3: string[];
}

export default function GamesPage() {
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [dailyPlan, setDailyPlan] = useState<DailyPlanResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeGame, setActiveGame] = useState<{
    id: string;
    level: 1 | 2 | 3;
  } | null>(null);

  useEffect(() => {
    fetchDailyPlan(selectedDate);
  }, [selectedDate]);

  const fetchDailyPlan = async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/daily-plan?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setDailyPlan(data);
      } else {
        console.error("Failed to load daily plan");
      }
    } catch (err) {
      console.error("Error fetching daily plan:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderGameCard = (gameId: string, level: 1 | 2 | 3) => {
    if (gameId === "daily_recall") {
      return (
        <div
          key="daily_recall"
          className="relative group border border-border bg-card hover:border-primary/50 transition-all rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-4xl">🧠</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                Level 1
              </span>
            </div>
            <h3 className="text-xl font-bold mb-1">Daily Recall</h3>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Personal Memory
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Recall personal journal events, faces, and daily context questions.
            </p>
          </div>
          <Link href="/quiz">
            <Button className="w-full font-semibold">Start Daily Recall</Button>
          </Link>
        </div>
      );
    }

    const game = getGameById(gameId);
    if (!game) return null;

    return (
      <div
        key={`${game.id}-l${level}`}
        className="relative group border border-border bg-card hover:border-primary/50 transition-all rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md"
      >
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-4xl">{game.emoji}</span>
            <div className="flex gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                Level {level}
              </span>
              {game.comingSoon && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Coming Soon
                </span>
              )}
            </div>
          </div>
          <h3 className="text-xl font-bold mb-1">{game.name}</h3>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {game.skill}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            {game.description}
          </p>
        </div>
        {game.href ? (
          <Link href={game.href}>
            <Button className="w-full font-semibold">Play Game</Button>
          </Link>
        ) : (
          <Button
            variant={game.comingSoon ? "secondary" : "default"}
            className="w-full font-semibold"
            onClick={() => setActiveGame({ id: game.id, level })}
          >
            {game.comingSoon ? "Preview Game" : "Play Game"}
          </Button>
        )}
      </div>
    );
  };

  const activeGameEntry = activeGame ? getGameById(activeGame.id) : null;
  const ActiveComponent = activeGameEntry?.component;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Nav />
      <main className="flex-1 max-w-screen-lg w-full mx-auto px-4 pt-24 pb-16">
        {/* Active Game Player View (for in-place games like Plan the Day) */}
        {activeGame && activeGameEntry && ActiveComponent ? (
          <div className="space-y-6">
            <Button
              variant="outline"
              onClick={() => setActiveGame(null)}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Daily Plan
            </Button>
            <ActiveComponent
              level={activeGame.level}
              date={selectedDate}
              onFinish={(score) => {
                console.log(`Finished ${activeGame.id} with score ${score}`);
              }}
            />
          </div>
        ) : (
          /* Main Games Dashboard View */
          <div className="space-y-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                  <Gamepad2 className="h-8 w-8 text-primary" /> Daily Brain Training
                </h1>
                <p className="text-muted-foreground mt-1">
                  Structured cognitive exercises designed to strengthen memory and focus.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-card border border-border px-4 py-2 rounded-xl">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm font-medium focus:outline-none"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <p className="text-muted-foreground text-sm">Loading your daily plan...</p>
              </div>
            ) : (
              <>
                {/* Level 1 Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-bold tracking-tight">Level 1 — Foundations</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dailyPlan?.level1?.map((gid) => renderGameCard(gid, 1))}
                  </div>
                </section>

                {/* Level 2 Section */}
                <section className="space-y-4 pt-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-bold tracking-tight">Level 2 — Intermediate Skills</h2>
                  </div>
                  {dailyPlan?.level2 && dailyPlan.level2.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {dailyPlan.level2.map((gid) => renderGameCard(gid, 2))}
                    </div>
                  ) : (
                    <div className="border border-dashed border-border rounded-xl p-6 text-center text-muted-foreground">
                      No Level 2 games available in active plan for today.
                    </div>
                  )}
                </section>

                {/* Level 3 Section */}
                <section className="space-y-4 pt-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-bold tracking-tight">Level 3 — Advanced Challenge</h2>
                  </div>
                  {dailyPlan?.level3 && dailyPlan.level3.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {dailyPlan.level3.map((gid) => renderGameCard(gid, 3))}
                    </div>
                  ) : (
                    <div className="border border-dashed border-border rounded-xl p-6 text-center text-muted-foreground">
                      No Level 3 games available in active plan for today.
                    </div>
                  )}
                </section>

                {/* Registry Overview Section */}
                <section className="space-y-4 pt-8 border-t border-border">
                  <h2 className="text-xl font-bold tracking-tight text-muted-foreground">
                    All Cognitive Games Directory
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {GAME_REGISTRY.map((game) => (
                      <div
                        key={game.id}
                        className="border border-border bg-card/60 p-4 rounded-xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{game.emoji}</span>
                          <div>
                            <p className="font-semibold text-sm">{game.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {game.skill} • L{game.levels.join(", L")}
                            </p>
                          </div>
                        </div>
                        {game.href ? (
                          <Link href={game.href}>
                            <Button variant="outline" size="sm">
                              Play
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setActiveGame({ id: game.id, level: game.levels[0] })
                            }
                          >
                            {game.comingSoon ? "Preview" : "Play"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
