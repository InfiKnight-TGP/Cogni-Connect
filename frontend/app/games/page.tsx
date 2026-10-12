"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { getGameById, GameRegistryEntry } from "@/components/games/registry";
import { PreviewContext } from "@/components/games/_shared/GameShell";
import { Button } from "@/components/ui/button";
import { LEVEL_NAMES, Level } from "@/lib/progress";
import { ArrowLeft } from "lucide-react";

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

  // Games in their respective areas
  const storyBuilder = getGameById("story-builder")!;
  const wordAssociation = getGameById("word-association")!;
  const molePath = getGameById("mole-path")!;

  const oddOneOut = getGameById("odd-one-out")!;
  const whackAMole = getGameById("whack-a-mole")!;
  const attentionHunt = getGameById("attention-hunt")!;

  const planTheDay = getGameById("plan-the-day")!;
  const sortingStation = getGameById("sorting-station")!;
  const pillBoxPlanner = getGameById("pill-box-planner")!;

  const mapNavigator = getGameById("map-navigator")!;

  // Count built vs coming soon
  // 9 Built: storyBuilder, molePath, Personal Memory (bonus), attentionHunt, planTheDay, sortingStation, Face Recognition, Name Recall, mapNavigator
  // 4 Coming soon: wordAssociation, oddOneOut, whackAMole, pillBoxPlanner
  const builtCount = 9;
  const comingSoonCount = 4;

  return (
    <main className="mx-auto max-w-screen-lg space-y-10 px-4 pb-16 pt-24">
      <div>
        <h1 className="text-3xl font-bold">All Games</h1>
        <p className="mt-1 text-muted-foreground">
          Every activity organized by cognitive area. Previews here are not saved as the patient&apos;s scores.
        </p>
        <p className="mt-3 text-sm font-semibold text-primary">
          Built: {builtCount} · Coming soon: {comingSoonCount}
        </p>
      </div>

      {/* 1. Memory */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Memory</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GameCard
            emoji={storyBuilder.emoji}
            name={storyBuilder.name}
            trains={storyBuilder.trains}
            level={storyBuilder.levels[0]}
            comingSoon={storyBuilder.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: storyBuilder, level: storyBuilder.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>

          <GameCard
            emoji={wordAssociation.emoji}
            name={wordAssociation.name}
            trains={wordAssociation.trains}
            level={wordAssociation.levels[0]}
            comingSoon={wordAssociation.comingSoon}
          />

          <GameCard
            emoji={molePath.emoji}
            name={molePath.name}
            trains={molePath.trains}
            level={molePath.levels[0]}
            comingSoon={molePath.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: molePath, level: molePath.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>

          {/* Bonus card under Memory */}
          <GameCard
            emoji="💭"
            name="Personal Memory Questions"
            trains="Recall details from personal video memories in open responses (Daily Recall part 3)"
            level={1}
            comingSoon={false}
            isBonus
            bonusLabel="Bonus"
          >
            <Link href="/quiz">
              <Button variant="outline" className="w-full">
                Open in quiz
              </Button>
            </Link>
          </GameCard>
        </div>
      </section>

      {/* 2. Attention */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Attention</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GameCard
            emoji={oddOneOut.emoji}
            name={oddOneOut.name}
            trains={oddOneOut.trains}
            level={oddOneOut.levels[0]}
            comingSoon={oddOneOut.comingSoon}
          />

          <GameCard
            emoji={whackAMole.emoji}
            name={whackAMole.name}
            trains={whackAMole.trains}
            level={whackAMole.levels[0]}
            comingSoon={whackAMole.comingSoon}
          />

          <GameCard
            emoji={attentionHunt.emoji}
            name={attentionHunt.name}
            trains={attentionHunt.trains}
            level={attentionHunt.levels[0]}
            comingSoon={attentionHunt.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: attentionHunt, level: attentionHunt.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>
        </div>
      </section>

      {/* 3. Executive Function */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Executive Function</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GameCard
            emoji={planTheDay.emoji}
            name={planTheDay.name}
            trains={planTheDay.trains}
            level={planTheDay.levels[0]}
            comingSoon={planTheDay.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: planTheDay, level: planTheDay.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>

          <GameCard
            emoji={sortingStation.emoji}
            name={sortingStation.name}
            trains={sortingStation.trains}
            level={sortingStation.levels[0]}
            comingSoon={sortingStation.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: sortingStation, level: sortingStation.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>

          <GameCard
            emoji={pillBoxPlanner.emoji}
            name={pillBoxPlanner.name}
            trains={pillBoxPlanner.trains}
            level={pillBoxPlanner.levels[0]}
            comingSoon={pillBoxPlanner.comingSoon}
          />
        </div>
      </section>

      {/* 4. Recognition & Orientation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Recognition &amp; Orientation</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GameCard
            emoji="👤"
            name="Face Recognition"
            trains="Select familiar faces seen in a personal video (Daily Recall part 1)"
            level={1}
            comingSoon={false}
          >
            <Link href="/quiz">
              <Button variant="outline" className="w-full">
                Open in quiz
              </Button>
            </Link>
          </GameCard>

          <GameCard
            emoji="🏷️"
            name="Name Recall"
            trains="Match a familiar name to the pictured person (Daily Recall part 2)"
            level={1}
            comingSoon={false}
          >
            <Link href="/quiz">
              <Button variant="outline" className="w-full">
                Open in quiz
              </Button>
            </Link>
          </GameCard>

          <GameCard
            emoji={mapNavigator.emoji}
            name={mapNavigator.name}
            trains={mapNavigator.trains}
            level={mapNavigator.levels[0]}
            comingSoon={mapNavigator.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: mapNavigator, level: mapNavigator.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>
        </div>
      </section>
    </main>
  );
}

function GameCard({
  emoji,
  name,
  trains,
  level,
  comingSoon,
  isBonus,
  bonusLabel,
  children,
}: {
  emoji: string;
  name: string;
  trains: string;
  level?: Level;
  comingSoon?: boolean;
  isBonus?: boolean;
  bonusLabel?: string;
  children?: React.ReactNode;
}) {
  const levelName = level ? LEVEL_NAMES[level] : "Easy";
  return (
    <div
      className={`flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-all ${
        isBonus ? "border-dashed border-primary/50 bg-primary/5" : ""
      }`}
    >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-4xl" aria-hidden>{emoji}</span>
          <div className="flex items-center gap-2">
            {isBonus && (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                {bonusLabel ?? "Bonus"}
              </span>
            )}
            {level && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  level === 1
                    ? "border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    : level === 2
                    ? "border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                    : "border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                }`}
              >
                {levelName}
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                comingSoon
                  ? "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
              }`}
            >
              {comingSoon ? "Coming soon" : "Built"}
            </span>
          </div>
        </div>
        <h3 className="text-lg font-bold text-foreground">{name}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong className="text-foreground">Trains:</strong> {trains}
        </p>
      </div>
      {children && <div className="space-y-1 pt-2">{children}</div>}
    </div>
  );
}
