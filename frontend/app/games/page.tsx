"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { GAME_REGISTRY, GameRegistryEntry } from "@/components/games/registry";
import { PreviewContext } from "@/components/games/_shared/GameShell";
import { Button } from "@/components/ui/button";
import { LEVEL_NAMES, Level, skillArea } from "@/lib/progress";
import { ArrowLeft } from "lucide-react";

const LEVELS: Level[] = [1, 2, 3];

export default function AllGamesPage() {
  return (
    <>
      <Nav />
      <CaregiverOnly>
        <AllGames />
      </CaregiverOnly>
    </>
  );
}

function AllGames() {
  const [active, setActive] = useState<{ game: GameRegistryEntry; level: Level } | null>(null);
  const Game = active?.game.component;

  if (active && Game) {
    return (
      <main className="mx-auto max-w-screen-lg space-y-6 px-4 pb-16 pt-24">
        <Button variant="outline" onClick={() => setActive(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to all games
        </Button>
        <PreviewContext.Provider value={true}>
          <Game level={active.level} />
        </PreviewContext.Provider>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-screen-lg space-y-10 px-4 pb-16 pt-24">
      <div>
        <h1 className="text-3xl font-bold">All Games</h1>
        <p className="mt-1 text-muted-foreground">
          Every activity, by difficulty. Each day the patient gets My Day plus a few of these, picked automatically.
          Previews here are not saved as the patient&apos;s scores.
        </p>
      </div>

      {LEVELS.map((level) => (
        <section key={level} className="space-y-4">
          <h2 className="text-2xl font-bold">{LEVEL_NAMES[level]}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {level === 1 && (
              <Card emoji="🧠" name="Daily Recall (My Day)" area="Recognition & Orientation / Memory" description="Questions about the patient's own day: who they saw, names, and what happened, from the uploaded videos.">
                <Link href="/quiz">
                  <Button variant="outline" className="w-full">Open the quiz</Button>
                </Link>
                <p className="text-xs text-muted-foreground">Scores from this quiz are saved.</p>
              </Card>
            )}
            {GAME_REGISTRY.filter((g) => g.levels.includes(level)).map((game) => (
              <Card
                key={game.id}
                emoji={game.emoji}
                name={game.name}
                area={game.area}
                description={game.description}
                comingSoon={game.comingSoon}
              >
                <Button variant="outline" className="w-full" onClick={() => setActive({ game, level })}>
                  Preview
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function Card({
  emoji,
  name,
  area,
  description,
  comingSoon,
  children,
}: {
  emoji: string;
  name: string;
  area?: string;
  description: string;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-4xl" aria-hidden>{emoji}</span>
          {comingSoon && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
              Coming soon
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold">{name}</h3>
        {area && <p className="text-sm font-medium text-muted-foreground">{area}</p>}
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
