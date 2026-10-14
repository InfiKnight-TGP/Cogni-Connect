"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { saveScore } from "./saveScore";
import { Button } from "@/components/ui/button";
import { Award, Play, RotateCcw } from "lucide-react";
import { useCaregiver } from "@/lib/mode";
import { LEVEL_NAMES, gameArea } from "@/lib/progress";
import { localDateKey } from "./date";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { translate } from "@/lib/interaction/locale";

/** True on the caregiver's All Games page: games can be tried without saving a score. */
export const PreviewContext = createContext(false);

export interface GameShellProps {
  gameId: string;
  title: string;
  instructions: string;
  level: 1 | 2 | 3;
  skill: string;
  date?: string;
  saveResult?: boolean;
  showPreviewDatePicker?: boolean;
  onFinish?: (score: number) => void;
  children:
    | React.ReactNode
    | ((handleFinish: (score: number) => void, date: string) => React.ReactNode);
}

export default function GameShell({
  gameId,
  title,
  instructions,
  level,
  skill,
  date,
  saveResult = true,
  showPreviewDatePicker = true,
  onFinish,
  children,
}: GameShellProps) {
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(date ?? localDateKey());
  const [caregiver] = useCaregiver(); // patients never see level or skill names
  const preview = useContext(PreviewContext);
  const { locale } = useInteraction();
  const tr = (phrase: string, values?: Record<string, string | number>) => translate(locale, phrase, values);

  useEffect(() => {
    if (date) setSelectedDate(date);
  }, [date]);

  const handleFinish = async (finalScore: number) => {
    const clampedScore = Math.max(0, Math.min(100, Math.round(finalScore)));
    setScore(clampedScore);
    setFinished(true);
    setStarted(false);

    // Previews from All Games must not count as the patient's scores
    if (!caregiver && !preview && saveResult) await saveScore({
      date: selectedDate,
      game_id: gameId,
      level,
      skill,
      score: clampedScore,
    });

    if (onFinish) {
      onFinish(clampedScore);
    }
  };

  const handleRestart = () => {
    setStarted(false);
    setFinished(false);
    setScore(null);
  };

  return (
    <div data-game-id={gameId} className="w-full max-w-2xl mx-auto border border-border bg-card rounded-2xl p-6 md:p-8 shadow-md">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{tr(title)}</h1>
          <p className="text-muted-foreground text-sm md:text-base mt-1">
            {tr(instructions)}
          </p>
        </div>
        {caregiver && <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {LEVEL_NAMES[level]}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {tr(gameArea(gameId, skill) ?? skill)}
          </span>
        </div>}
      </div>

      {/* Screen 1: Start Screen */}
      {!started && !finished && (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
          <VoiceQuestion prompt={`${tr(title)}. ${tr(instructions)}`} options={[{ id: "start", label: tr("Start Game"), synonyms: ["start", "begin"] }]} onAnswer={() => setStarted(true)} />
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl">
            🎮
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-xl font-semibold">{tr("Ready to begin?")}</h2>
            <p className="text-sm text-muted-foreground">
              {tr("Click Start to launch {title}.", { title: tr(title) })}{caregiver && level === 1 && ` ${tr("No timers apply in Easy mode.")}`}
            </p>
          </div>
          {caregiver && preview && showPreviewDatePicker && (
            <label className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{tr("Preview date")}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}
          <Button
            size="lg"
            className="min-h-[48px] px-8 py-6 text-lg font-bold shadow-lg hover:scale-105 transition-transform"
            onClick={() => setStarted(true)}
          >
            <Play className="mr-2 h-5 w-5 fill-current" /> {tr("Start Game")}
          </Button>
        </div>
      )}

      {/* Screen 2: Active Game Screen */}
      {started && !finished && (
        <div className="py-4">
          {typeof children === "function"
            ? children(handleFinish, selectedDate)
            : React.isValidElement(children)
            ? React.cloneElement(children as React.ReactElement, {
                onFinish: handleFinish,
              })
            : children}
        </div>
      )}

      {/* Screen 3: Finish Screen */}
      {finished && (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-5">
          <VoiceQuestion prompt={tr("Would you like to play again?")} options={[{ id: "again", label: tr("Play Again"), synonyms: ["again", "restart"] }]} onAnswer={handleRestart} />
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-950/60 flex items-center justify-center text-green-600 dark:text-green-400">
            <Award className="h-10 w-10" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">
              {tr("Well done!")}
            </h2>
            <p className="text-lg text-foreground font-medium">
              {tr("You scored {score} / 100", { score: score ?? 0 })}
            </p>
            {caregiver
              ? <p className="text-sm text-muted-foreground">{tr("Caregiver mode: this score was not saved.")}</p>
              : preview && <p className="text-sm text-muted-foreground">{tr("Preview: this score was not saved.")}</p>}
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={handleRestart}
            className="mt-4 min-h-[48px] px-6 text-lg"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> {tr("Play Again")}
          </Button>
        </div>
      )}
    </div>
  );
}
