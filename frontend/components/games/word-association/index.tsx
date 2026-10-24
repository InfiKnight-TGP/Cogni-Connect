"use client";

import React, { useState } from "react";
import GameShell from "../_shared/GameShell";
import type { GameProps } from "../_shared/types";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { VoiceQuestion, type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import ReadAloud from "@/components/interaction/ReadAloud";
import { WORD_ASSOCIATION_PAIRS } from "./data";
import { calculateScore, generateSession, type AssociationRound } from "./logic";

export default function WordAssociation({
  level = 1,
  date,
  onFinish,
}: GameProps) {
  const { t } = useTranslate();
  // Read knob once at session start; knob 2 is the default
  const [knob] = useState(() => Math.max(1, Math.min(4, Math.round(readSkill("word-association").knob))));
  const [rounds] = useState<AssociationRound[]>(() => generateSession(WORD_ASSOCIATION_PAIRS, knob));

  const [currentIndex, setCurrentIndex] = useState(0);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [lastWrongId, setLastWrongId] = useState<string | null>(null);
  const [status, setStatus] = useState<"in_progress" | "round_won" | "round_revealed">("in_progress");
  const [roundPoints, setRoundPoints] = useState<number[]>([]);

  const currentRound = rounds[currentIndex];
  const roundKey = currentRound ? `round-${currentIndex}-${currentRound.id}` : `round-${currentIndex}`;
  const log = useAnswerLog("word-association", "Memory", roundKey, knob, true);

  if (!currentRound) {
    return null;
  }

  const showHint = currentRound.showHintImmediately || wrongTaps >= 1;
  const isLastRound = currentIndex + 1 >= rounds.length;

  const handleChoice = (optionId: string, input?: AnswerInput) => {
    if (status !== "in_progress") return;

    if (optionId === currentRound.targetId) {
      const pts = wrongTaps === 0 ? 1.0 : 0.5;
      const updatedPoints = [...roundPoints, pts];
      setRoundPoints(updatedPoints);
      setStatus("round_won");
      log(true, input);
    } else {
      const nextWrong = wrongTaps + 1;
      setWrongTaps(nextWrong);
      setLastWrongId(optionId);
      log(false, input);

      if (nextWrong >= 2) {
        // Revealed after 2 wrong attempts
        const updatedPoints = [...roundPoints, 0];
        setRoundPoints(updatedPoints);
        setStatus("round_revealed");
      }
    }
  };

  const handleNext = (handleFinish: (score: number) => void) => {
    if (isLastRound) {
      const finalScore = calculateScore(roundPoints, rounds.length);
      handleFinish(finalScore);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setWrongTaps(0);
      setLastWrongId(null);
      setStatus("in_progress");
    }
  };

  const promptText = t("What goes with {item}?", { item: t(currentRound.cue.word) });
  const voiceOptions = currentRound.options.map((opt) => ({
    id: opt.id,
    label: t(opt.word),
    synonyms: opt.synonyms,
  }));

  const targetOption = currentRound.options.find((o) => o.id === currentRound.targetId);
  const targetLabel = targetOption ? t(targetOption.word) : "";
  const cueLabel = t(currentRound.cue.word);

  return (
    <GameShell
      gameId="word-association"
      title="Word Association"
      instructions="Choose the item that goes with the picture."
      level={level}
      skill="semantic memory"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => (
        <section aria-label={t("Word Association")} className="space-y-6">
          {/* Header Cue Card */}
          <div className="flex flex-col items-center justify-center p-6 bg-card rounded-2xl border-2 border-primary/20 shadow-sm text-center">
            <span className="text-7xl mb-2 select-none" role="img" aria-label={cueLabel}>
              {currentRound.cue.emoji}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {cueLabel}
            </h2>
          </div>

          {/* Question / Instruction & Voice */}
          <div className="text-center space-y-2">
            <p className="text-xl font-semibold text-foreground">{promptText}</p>
            <ReadAloud text={`${promptText}. ${showHint ? t(currentRound.hint) : ""}`} />
            <VoiceQuestion
              question={promptText}
              options={voiceOptions}
              disabled={status !== "in_progress"}
              onMatched={(matched, input) => handleChoice(matched.id, input)}
            />
          </div>

          {/* Gentle Hint Banner (calm amber, no red, no shaking) */}
          {showHint && (
            <div
              role="status"
              className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-base md:text-lg flex items-center justify-center text-center shadow-sm"
            >
              <span>💡 {t(currentRound.hint)}</span>
            </div>
          )}

          {/* Choice Tiles Grid */}
          <div
            className={`grid gap-4 ${
              currentRound.options.length <= 2
                ? "grid-cols-2 max-w-md mx-auto"
                : currentRound.options.length === 3
                ? "grid-cols-1 sm:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-4"
            }`}
          >
            {currentRound.options.map((option) => {
              let tileState: "default" | "correct" | "wrong" | "selected" = "default";

              if (status === "round_won") {
                if (option.id === currentRound.targetId) tileState = "correct";
              } else if (status === "round_revealed") {
                if (option.id === currentRound.targetId) tileState = "correct";
              } else if (status === "in_progress") {
                if (option.id === lastWrongId) tileState = "wrong";
              }

              return (
                <BigTile
                  key={option.id}
                  label={t(option.word)}
                  emoji={option.emoji}
                  state={tileState}
                  disabled={status !== "in_progress"}
                  onClick={() => handleChoice(option.id, { method: "tap", responseMs: null })}
                  className="min-h-[110px] [&>span:last-child]:text-base md:[&>span:last-child]:text-lg"
                />
              );
            })}
          </div>

          {/* Feedback & Progression */}
          {status !== "in_progress" && (
            <div className="flex flex-col items-center justify-center space-y-4 pt-2">
              <p className="text-xl font-medium text-center" role="status">
                {status === "round_won"
                  ? wrongTaps === 0
                    ? t("Good! {target} goes with {cue}.", { target: targetLabel, cue: cueLabel })
                    : t("Well done! {target} goes with {cue}.", { target: targetLabel, cue: cueLabel })
                  : t("{target} goes with {cue}. Let's keep going.", { target: targetLabel, cue: cueLabel })}
              </p>
              <ReadAloud
                kind="feedback"
                text={
                  status === "round_won"
                    ? wrongTaps === 0
                      ? t("Good! {target} goes with {cue}.", { target: targetLabel, cue: cueLabel })
                      : t("Well done! {target} goes with {cue}.", { target: targetLabel, cue: cueLabel })
                    : t("{target} goes with {cue}. Let's keep going.", { target: targetLabel, cue: cueLabel })
                }
              />
              <Button
                size="lg"
                onClick={() => handleNext(handleFinish)}
                className="min-h-[56px] px-8 text-xl font-bold shadow-md"
              >
                {isLastRound ? t("Finish") : t("Next")}
              </Button>
            </div>
          )}
        </section>
      )}
    </GameShell>
  );
}
