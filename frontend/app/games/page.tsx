"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { GAME_REGISTRY, getGameById, GameRegistryEntry } from "@/components/games/registry";
import { PreviewContext } from "@/components/games/_shared/GameShell";
import { Button } from "@/components/ui/button";
import { dayKey, LEVEL_NAMES, Level, toEntries } from "@/lib/progress";
import { ArrowLeft } from "lucide-react";
import CaregiverPageLabel from "@/components/caregiver/pageLabel";
import { apiFetch, API_URL } from "@/lib/api";
import { localDateKey } from "@/components/games/_shared/date";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";

export default function AllGamesPage() {
  const { session, ready } = useAuth();
  return (
    <>
      <Nav />
      {ready && session?.role === "self" ? <SelfGames /> : <CaregiverOnly><AllGames /></CaregiverOnly>}
    </>
  );
}

const SELF_AREA_ORDER = ["Memory", "Attention", "Executive Function", "Recognition & Orientation"] as const;

function SelfGames() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<{ game: GameRegistryEntry; level: Level } | null>(null);
  const [todayPlan, setTodayPlan] = useState<Set<string>>(new Set());
  const [playedToday, setPlayedToday] = useState<Set<string>>(new Set());
  const [gameDate, setGameDate] = useState(localDateKey());
  const [dateOpen, setDateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const Game = active?.game.component;

  useEffect(() => {
    let cancelled = false;
    const today = dayKey(new Date());
    Promise.all([
      apiFetch(`${API_URL}/daily-plan?date=${today}`),
      apiFetch(`${API_URL}/performance`),
      apiFetch(`${API_URL}/videos`),
    ]).then(async ([planResponse, performanceResponse, videosResponse]) => {
      const plan = planResponse.ok ? await planResponse.json() : {};
      const planIds = [1, 2, 3].flatMap(level => Array.isArray(plan[`level${level}`]) ? plan[`level${level}`] : []);
      const performance = performanceResponse.ok ? await performanceResponse.json() : {};
      const played = new Set(toEntries(performance).filter(entry => entry.day === today && entry.gameId).map(entry => entry.gameId));
      let newest = "";
      if (videosResponse.ok) {
        const videos = await videosResponse.json();
        const dates = (Array.isArray(videos) ? videos : []).map((video: { date?: string }) => video.date?.slice(0, 10) ?? "").filter((date: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(date)).sort();
        newest = dates.at(-1) ?? "";
      }
      if (!cancelled) {
        setTodayPlan(new Set(planIds));
        setPlayedToday(played);
        if (newest) setGameDate(newest);
        setLoading(false);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const requested = searchParams.get("game");
    const game = requested ? getGameById(requested) : undefined;
    if (game?.component && !game.comingSoon) setActive({ game, level: game.levels[0] });
  }, [searchParams]);

  if (active && Game) {
    return <main className="mx-auto max-w-screen-lg space-y-6 px-4 pb-16 pt-24 lg:pt-8">
      <Button variant="outline" className="min-h-12 text-lg" onClick={() => setActive(null)}><ArrowLeft className="mr-2 h-5 w-5" /> {t("Back to all games")}</Button>
      <div className="flex flex-wrap items-center gap-3 text-base text-muted-foreground">
        <button type="button" className="min-h-11 text-primary underline" onClick={() => setDateOpen(value => !value)}>{t("Change day")}</button>
        {dateOpen && <label className="flex items-center gap-2"><span>{t("Game day")}</span><input type="date" value={gameDate} onChange={event => setGameDate(event.target.value)} className="min-h-11 rounded-md border border-input bg-background px-3 text-base text-foreground" /></label>}
      </div>
      <Game level={active.level} date={gameDate} />
    </main>;
  }

  const readyCount = GAME_REGISTRY.filter(game => !game.comingSoon && !!game.component).length;
  return <main className="mx-auto max-w-screen-lg space-y-10 px-4 pb-16 pt-24 lg:pt-8">
    <header className="space-y-2">
      <h1 className="text-4xl font-bold">{t("All Games")}</h1>
      <p className="text-xl text-muted-foreground">{t("Playing here counts toward your progress.")}</p>
      <p className="text-lg font-semibold text-primary">{t("{count} games ready", { count: readyCount })}</p>
      <ReadAloud autoRead={false} text={`${t("All Games")}. ${t("Playing here counts toward your progress.")}`} />
    </header>
    {SELF_AREA_ORDER.map(area => {
      const games = GAME_REGISTRY.filter(game => game.area === area);
      return <section key={area} className="space-y-4" aria-labelledby={`self-games-${area}`}>
        <h2 id={`self-games-${area}`} className="text-2xl font-bold">{t(area)}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {games.map(game => <SelfGameCard key={game.id} game={game} inPlan={todayPlan.has(game.id)} played={playedToday.has(game.id)} onPlay={() => setActive({ game, level: game.levels[0] })} />)}
        </div>
      </section>;
    })}
    {loading && <p className="text-lg text-muted-foreground" role="status">{t("Loading…")}</p>}
  </main>;
}

function SelfGameCard({ game, inPlan, played, onPlay }: { game: GameRegistryEntry; inPlan: boolean; played: boolean; onPlay: () => void }) {
  const { t } = useTranslate();
  const unavailable = game.comingSoon || !game.component;
  return <article className="flex min-h-64 flex-col justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm">
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3"><span className="text-4xl" aria-hidden>{game.emoji}</span><div className="flex flex-wrap justify-end gap-2">{inPlan && <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{t("In today’s plan")}</span>}{played && <span className="rounded-full border border-green-600/30 bg-green-600/10 px-3 py-1 text-sm font-semibold text-green-700 dark:text-green-400">✓ {t("Played today")}</span>}</div></div>
      <h3 className="text-xl font-bold">{t(game.name)}</h3>
      <p className="text-base text-muted-foreground">{t(game.description)}</p>
      <ReadAloud autoRead={false} text={`${t(game.name)}. ${t(game.description)}`} />
    </div>
    {unavailable ? <p className="text-base font-semibold text-muted-foreground">{t("Coming soon")}</p> : <Button className="min-h-12 w-full text-lg" onClick={onPlay}>{t("Play")}</Button>}
  </article>;
}

function AllGames() {
  const [active, setActive] = useState<{ game: GameRegistryEntry; level: Level } | null>(null);
  const Game = active?.game.component;

  if (active && Game) {
    return (
      <main className="mx-auto max-w-screen-lg space-y-6 px-4 pb-16 pt-24 lg:pt-8">
        <CaregiverPageLabel />
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
  const contextRecall = getGameById("context-recall")!;
  const memoryCards = getGameById("memory-cards")!;
  const memoryCrossword = getGameById("memory-crossword")!;
  const yesterdayQuiz = getGameById("yesterday-quiz")!;

  const oddOneOut = getGameById("odd-one-out")!;
  const soundTap = getGameById("sound-tap")!;
  const whackAMole = getGameById("whack-a-mole")!;
  const attentionHunt = getGameById("attention-hunt")!;

  const planTheDay = getGameById("plan-the-day")!;
  const sortingStation = getGameById("sorting-station")!;
  const patternCompletion = getGameById("pattern-completion")!;
  const pillBoxPlanner = getGameById("pill-box-planner")!;

  const mapNavigator = getGameById("map-navigator")!;
  const faceRecognition = getGameById("face-recognition")!;
  const nameRecognition = getGameById("name-recognition")!;
  const objectNaming = getGameById("object-naming")!;

  const builtCount = GAME_REGISTRY.filter((game) => !game.comingSoon).length;
  const comingSoonCount = GAME_REGISTRY.filter((game) => game.comingSoon).length;

  return (
    <main className="mx-auto max-w-screen-lg space-y-10 px-4 pb-16 pt-24 lg:pt-8">
      <div>
        <div><CaregiverPageLabel /><h1 className="text-3xl font-bold">All Games</h1></div>
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
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: wordAssociation, level: wordAssociation.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>

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

          <GameCard
            emoji={contextRecall.emoji}
            name={contextRecall.name}
            trains={contextRecall.trains}
            level={contextRecall.levels[0]}
            comingSoon={contextRecall.comingSoon}
          >
            <Button variant="outline" className="w-full" onClick={() => setActive({ game: contextRecall, level: contextRecall.levels[0] })}>
              Preview
            </Button>
          </GameCard>

          {[memoryCards, memoryCrossword, yesterdayQuiz].map((game) => <GameCard key={game.id} emoji={game.emoji} name={game.name} trains={game.trains} level={game.levels[0]} comingSoon={game.comingSoon}>
            <Button variant="outline" className="w-full" onClick={() => setActive({ game, level: game.levels[0] })}>Preview</Button>
          </GameCard>)}
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
          ><Button variant="outline" className="w-full" onClick={() => setActive({ game: oddOneOut, level: oddOneOut.levels[0] })}>Preview</Button></GameCard>

          <GameCard emoji={soundTap.emoji} name={soundTap.name} trains={soundTap.trains} level={soundTap.levels[0]} comingSoon={soundTap.comingSoon}>
            <Button variant="outline" className="w-full" onClick={() => setActive({ game: soundTap, level: soundTap.levels[0] })}>Preview</Button>
          </GameCard>

          <GameCard
            emoji={whackAMole.emoji}
            name={whackAMole.name}
            trains={whackAMole.trains}
            level={whackAMole.levels[0]}
            comingSoon={whackAMole.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: whackAMole, level: whackAMole.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>

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

          <GameCard emoji={patternCompletion.emoji} name={patternCompletion.name} trains={patternCompletion.trains} level={patternCompletion.levels[0]} comingSoon={patternCompletion.comingSoon}>
            <Button variant="outline" className="w-full" onClick={() => setActive({ game: patternCompletion, level: patternCompletion.levels[0] })}>Preview</Button>
          </GameCard>

          <GameCard
            emoji={pillBoxPlanner.emoji}
            name={pillBoxPlanner.name}
            trains={pillBoxPlanner.trains}
            level={pillBoxPlanner.levels[0]}
            comingSoon={pillBoxPlanner.comingSoon}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActive({ game: pillBoxPlanner, level: pillBoxPlanner.levels[0] })}
            >
              Preview
            </Button>
          </GameCard>
        </div>
      </section>

      {/* 4. Recognition & Orientation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Recognition &amp; Orientation</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GameCard
            emoji={faceRecognition.emoji}
            name={faceRecognition.name}
            trains={faceRecognition.trains}
            level={faceRecognition.levels[0]}
            comingSoon={faceRecognition.comingSoon}
          >
            <Button variant="outline" className="w-full" onClick={() => setActive({ game: faceRecognition, level: faceRecognition.levels[0] })}>
              Preview
            </Button>
          </GameCard>

          <GameCard
            emoji={nameRecognition.emoji}
            name={nameRecognition.name}
            trains={nameRecognition.trains}
            level={nameRecognition.levels[0]}
            comingSoon={nameRecognition.comingSoon}
          >
            <Button variant="outline" className="w-full" onClick={() => setActive({ game: nameRecognition, level: nameRecognition.levels[0] })}>
              Preview
            </Button>
          </GameCard>

          <GameCard emoji={objectNaming.emoji} name={objectNaming.name} trains={objectNaming.trains} level={objectNaming.levels[0]} comingSoon={objectNaming.comingSoon}>
            <Button variant="outline" className="w-full" onClick={() => setActive({ game: objectNaming, level: objectNaming.levels[0] })}>Preview</Button>
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
  children,
}: {
  emoji: string;
  name: string;
  trains: string;
  level?: Level;
  comingSoon?: boolean;
  children?: React.ReactNode;
}) {
  const levelName = level ? LEVEL_NAMES[level] : "Easy";
  return (
    <div
      className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-all"
    >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-4xl" aria-hidden>{emoji}</span>
          <div className="flex items-center gap-2">
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
