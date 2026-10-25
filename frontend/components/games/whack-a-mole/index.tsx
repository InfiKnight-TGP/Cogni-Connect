"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import GameShell from "../_shared/GameShell";
import type { GameProps } from "../_shared/types";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import ReadAloud from "@/components/interaction/ReadAloud";
import { Pause, Play, Sprout } from "lucide-react";
import {
  generateTrialSchedule,
  calculateGardenTapsScore,
  getAdaptiveAction,
  type Trial,
  type SessionTrialResult,
  type GardenTapsKnobConfig,
} from "./logic";
import { MoleSvg, ButterflySvg, MarigoldSvg } from "./characters";

export default function GardenTaps({
  level = 2,
  date,
  onFinish,
}: GameProps) {
  const { t } = useTranslate();

  // Read adaptive knob (1..4, default 2)
  const [knob] = useState(() => {
    const raw = readSkill("whack-a-mole").knob;
    return Math.max(1, Math.min(4, Math.round(Number(raw) || 2)));
  });

  const [{ trials, config }] = useState(() => generateTrialSchedule(knob));

  const [gameState, setGameState] = useState<
    "intro" | "playing" | "paused" | "swap_announcement" | "finished"
  >("intro");

  const [currentTrialIdx, setCurrentTrialIdx] = useState(0);
  const [isCharacterVisible, setIsCharacterVisible] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [amberWarning, setAmberWarning] = useState<string | null>(null);
  const [results, setResults] = useState<SessionTrialResult[]>([]);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  // Timing references using performance.now
  const trialStartTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const remainingTimeRef = useRef<number>(0);
  const lastTapTimestampRef = useRef<number>(0);
  const currentTrialTappedRef = useRef<boolean>(false);

  const currentTrial: Trial | undefined = trials[currentTrialIdx];
  const roundKey = currentTrial
    ? `trial-${currentTrial.index}-${currentTrial.character}`
    : `trial-${currentTrialIdx}`;

  // Adaptive answer logger for Attention domain
  const logAnswer = useAnswerLog("whack-a-mole", "Attention", roundKey, knob, true);

  // Clear timers safely
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Finish session
  const finishSession = useCallback(
    (completedResults: SessionTrialResult[], handleFinish: (score: number) => void) => {
      clearTimer();
      const summary = calculateGardenTapsScore(completedResults);
      setFinalScore(summary.score);
      setGameState("finished");
      handleFinish(summary.score);
    },
    [clearTimer]
  );

  // Advance to next trial or finish
  const advanceToNextTrial = useCallback(
    (
      updatedResults: SessionTrialResult[],
      handleFinish: (score: number) => void
    ) => {
      clearTimer();
      setIsCharacterVisible(false);

      const nextIdx = currentTrialIdx + 1;
      if (nextIdx >= trials.length) {
        finishSession(updatedResults, handleFinish);
        return;
      }

      const nextTrial = trials[nextIdx];
      setCurrentTrialIdx(nextIdx);

      // Check if the upcoming trial is a Knob 4 role swap point
      if (nextTrial.isSwapPoint) {
        setGameState("swap_announcement");
        return;
      }

      // Inter-trial gap phase before character emerges
      timerRef.current = setTimeout(() => {
        startTrialAppearance(nextTrial, handleFinish);
      }, config.gapMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTrialIdx, trials, config.gapMs, finishSession]
  );

  // Begin character emergence in hole
  const startTrialAppearance = useCallback(
    (trial: Trial, handleFinish: (score: number) => void) => {
      clearTimer();
      currentTrialTappedRef.current = false;
      setIsCharacterVisible(true);
      trialStartTimeRef.current = performance.now();
      remainingTimeRef.current = config.upMs;

      // Timer for character remaining up
      timerRef.current = setTimeout(() => {
        handleTrialTimeout(trial, handleFinish);
      }, config.upMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.upMs]
  );

  // When trial times out without a tap
  const handleTrialTimeout = useCallback(
    (trial: Trial, handleFinish: (score: number) => void) => {
      if (currentTrialTappedRef.current) return;

      const result: SessionTrialResult = {
        trialIndex: trial.index,
        isPractice: trial.isPractice,
        role: trial.role,
        character: trial.character,
        tapped: false,
        reactionMs: null,
      };

      const updatedResults = [...results, result];
      setResults(updatedResults);

      // Adaptive logging decision:
      // - Correct rejection on NO-GO: logged as correct
      // - Missed GO target: NOT logged to adaptive engine (silence does not lower difficulty)
      const action = getAdaptiveAction(result);
      if (action.log) {
        logAnswer(action.correct, { method: "tap", responseMs: action.responseMs });
      }

      advanceToNextTrial(updatedResults, handleFinish);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, logAnswer, advanceToNextTrial]
  );

  // User taps a hole
  const handleHoleTap = (
    holeIndex: number,
    handleFinish: (score: number) => void
  ) => {
    if (gameState !== "playing" || !isCharacterVisible || !currentTrial) {
      return;
    }

    // Ignore taps on inactive holes
    if (holeIndex !== currentTrial.hole) {
      return;
    }

    // Double-tap debounce guard (300ms)
    const now = performance.now();
    if (now - lastTapTimestampRef.current < 300) {
      return;
    }
    lastTapTimestampRef.current = now;

    if (currentTrialTappedRef.current) {
      return;
    }
    currentTrialTappedRef.current = true;
    clearTimer();

    const reactionMs = Math.max(0, Math.round(now - trialStartTimeRef.current));
    const wasGo = currentTrial.role === "go";

    const result: SessionTrialResult = {
      trialIndex: currentTrial.index,
      isPractice: currentTrial.isPractice,
      role: currentTrial.role,
      character: currentTrial.character,
      tapped: true,
      reactionMs,
    };

    const updatedResults = [...results, result];
    setResults(updatedResults);

    if (wasGo) {
      // Correct GO tap
      setFeedback(t("Good!"));
      setAmberWarning(null);
      const action = getAdaptiveAction(result);
      if (action.log) {
        logAnswer(true, { method: "tap", responseMs: reactionMs });
      }
    } else {
      // Distractor tapped: calm amber notice (no red, no shake, no sound)
      setFeedback(null);
      const visitor =
        currentTrial.character === "marigold"
          ? t("That is a garden marigold. Let it bloom.")
          : t("That is a friendly butterfly. Let it rest.");
      setAmberWarning(visitor);

      const action = getAdaptiveAction(result);
      if (action.log) {
        logAnswer(false, { method: "tap", responseMs: reactionMs });
      }
    }

    // Quick feedback display then advance
    setIsCharacterVisible(false);
    timerRef.current = setTimeout(() => {
      setFeedback(null);
      advanceToNextTrial(updatedResults, handleFinish);
    }, 400);
  };

  // Pause and resume handling with exact remaining time
  const handleTogglePause = () => {
    if (gameState === "playing") {
      clearTimer();
      const elapsed = performance.now() - trialStartTimeRef.current;
      remainingTimeRef.current = Math.max(100, remainingTimeRef.current - elapsed);
      setGameState("paused");
    } else if (gameState === "paused") {
      setGameState("playing");
      trialStartTimeRef.current = performance.now();
      if (currentTrial && isCharacterVisible) {
        timerRef.current = setTimeout(() => {
          handleTrialTimeout(currentTrial, () => {});
        }, remainingTimeRef.current);
      } else if (currentTrial) {
        timerRef.current = setTimeout(() => {
          startTrialAppearance(currentTrial, () => {});
        }, config.gapMs);
      }
    }
  };

  // Auto-pause when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && gameState === "playing") {
        clearTimer();
        const elapsed = performance.now() - trialStartTimeRef.current;
        remainingTimeRef.current = Math.max(100, remainingTimeRef.current - elapsed);
        setGameState("paused");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimer();
    };
  }, [gameState, clearTimer]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Render character component
  const renderCharacter = (char: "mole" | "butterfly" | "marigold") => {
    switch (char) {
      case "mole":
        return <MoleSvg size={76} />;
      case "butterfly":
        return <ButterflySvg size={76} />;
      case "marigold":
        return <MarigoldSvg size={76} />;
    }
  };

  return (
    <GameShell
      gameId="whack-a-mole"
      title="Garden Taps"
      instructions="Tap target moles while letting resting visitors stay undisturbed."
      level={level}
      skill="inhibition"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => (
        <section aria-label={t("Garden Taps")} className="max-w-xl mx-auto space-y-6">
          {/* Header Controls & Status */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center space-x-2">
              <Sprout className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {t("Garden Taps")}
              </h2>
            </div>
            {gameState === "playing" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePause}
                className="flex items-center space-x-1.5 min-h-[44px] px-3 font-medium"
                aria-label={t("Pause")}
              >
                <Pause className="w-4 h-4" />
                <span>{t("Pause")}</span>
              </Button>
            )}
          </div>

          {/* Intro / Instructions Screen */}
          {gameState === "intro" && (
            <div className="bg-card p-6 rounded-2xl border-2 border-border shadow-sm text-center space-y-6">
              <div className="flex justify-center items-center space-x-4 py-2">
                <div className="flex flex-col items-center p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40">
                  <MoleSvg size={64} />
                  <span className="text-sm font-semibold mt-2 text-foreground">
                    {t("Tap the mole")}
                  </span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40">
                  <ButterflySvg size={64} />
                  <span className="text-sm font-semibold mt-2 text-foreground">
                    {t("Let it rest")}
                  </span>
                </div>
                {config.noGoTypes.includes("marigold") && (
                  <div className="flex flex-col items-center p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40">
                    <MarigoldSvg size={64} />
                    <span className="text-sm font-semibold mt-2 text-foreground">
                      {t("Let it bloom")}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-lg md:text-xl font-medium text-foreground">
                  {t("Tap the mole when it peeks out. Let the gentle visitors rest.")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("First round is a gentle warm-up.")}
                </p>
              </div>

              <Button
                size="lg"
                onClick={() => {
                  setGameState("playing");
                  startTrialAppearance(trials[0], handleFinish);
                }}
                className="w-full min-h-[56px] text-xl font-bold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {t("Start when you are ready")}
              </Button>
            </div>
          )}

          {/* Knob 4 Swap Announcement Screen */}
          {gameState === "swap_announcement" && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 p-6 rounded-2xl text-center space-y-5 shadow-sm">
              <span className="text-4xl" role="img" aria-hidden="true">
                🔄
              </span>
              <h3 className="text-2xl font-bold text-amber-950 dark:text-amber-100">
                {t("Roles Swap!")}
              </h3>
              <p className="text-lg text-amber-900 dark:text-amber-200">
                {t("Now tap the butterfly! Let the mole rest.")}
              </p>
              <div className="flex justify-center items-center space-x-6 py-2">
                <div className="flex flex-col items-center">
                  <ButterflySvg size={64} />
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                    ✓ {t("Tap now")}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <MoleSvg size={64} />
                  <span className="text-sm font-semibold text-amber-900 dark:text-amber-300 mt-1">
                    {t("Let it rest")}
                  </span>
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => {
                  setGameState("playing");
                  if (currentTrial) {
                    startTrialAppearance(currentTrial, handleFinish);
                  }
                }}
                className="w-full min-h-[56px] text-xl font-bold shadow-md"
              >
                {t("I'm ready")}
              </Button>
            </div>
          )}

          {/* Paused Screen Overlay */}
          {gameState === "paused" && (
            <div className="bg-card p-8 rounded-2xl border-2 border-border text-center space-y-6 shadow-sm">
              <h3 className="text-2xl font-bold text-foreground">{t("Game Paused")}</h3>
              <p className="text-base text-muted-foreground">
                {t("Take your time. The garden will wait for you.")}
              </p>
              <Button
                size="lg"
                onClick={handleTogglePause}
                className="min-h-[56px] px-8 text-xl font-bold shadow-md flex items-center space-x-2 mx-auto"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{t("Resume")}</span>
              </Button>
            </div>
          )}

          {/* Active 3x3 Garden Grid */}
          {(gameState === "playing" || gameState === "paused") && (
            <div className="space-y-4">
              {/* Practice or Progress Note */}
              <div className="flex justify-between items-center text-sm font-medium px-2 text-muted-foreground">
                <span>
                  {currentTrial?.isPractice
                    ? t("Practice warm-up")
                    : t("Visitor {current} of {total}", {
                        current: currentTrialIdx,
                        total: trials.length - 1,
                      })}
                </span>
                {feedback && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base animate-pulse">
                    {feedback}
                  </span>
                )}
              </div>

              {/* Gentle Amber Banner for NO-GO Tap (calm amber, no red, no shake) */}
              {amberWarning && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700/60 text-amber-950 dark:text-amber-100 text-base flex items-center justify-center text-center shadow-sm"
                >
                  <span>{amberWarning}</span>
                </div>
              )}

              {/* 3x3 Holes Grid */}
              <div
                role="grid"
                aria-label={t("Garden holes")}
                className="grid grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6 bg-amber-950/10 dark:bg-amber-950/30 rounded-3xl border-2 border-amber-900/20 max-w-md mx-auto"
              >
                {Array.from({ length: 9 }).map((_, holeIdx) => {
                  const isActive = currentTrial && currentTrial.hole === holeIdx && isCharacterVisible;
                  const isKnob1Target = isActive && config.hasTargetRing && currentTrial?.role === "go";

                  return (
                    <button
                      key={holeIdx}
                      type="button"
                      disabled={gameState !== "playing"}
                      onClick={() => handleHoleTap(holeIdx, handleFinish)}
                      aria-label={
                        isActive
                          ? currentTrial.character === "mole"
                            ? t("Mole hole")
                            : t("Visitor hole")
                          : t("Garden hole {number}", { number: holeIdx + 1 })
                      }
                      className={`relative aspect-square w-full min-w-[76px] min-h-[76px] rounded-full flex items-center justify-center transition-all duration-200 select-none outline-none focus-visible:ring-4 focus-visible:ring-primary shadow-inner ${
                        isActive
                          ? "bg-amber-900/30 dark:bg-amber-950/50 cursor-pointer active:scale-95"
                          : "bg-amber-950/20 dark:bg-amber-900/25 border-4 border-amber-900/30 dark:border-amber-800/40"
                      } ${isKnob1Target ? "ring-4 ring-emerald-500/80 ring-offset-2" : ""}`}
                    >
                      {/* Character inside active hole */}
                      {isActive && currentTrial && (
                        <div
                          className="w-full h-full flex items-center justify-center transition-opacity duration-200"
                        >
                          {renderCharacter(currentTrial.character)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Finished Screen */}
          {gameState === "finished" && (
            <div className="bg-card p-6 sm:p-8 rounded-2xl border-2 border-border shadow-sm text-center space-y-6">
              <span className="text-6xl" role="img" aria-hidden="true">
                🌻
              </span>
              <div className="space-y-2">
                <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                  {t("Well done!")}
                </h3>
                <p className="text-lg text-muted-foreground">
                  {t("You paid close attention to the garden visitors.")}
                </p>
                {finalScore !== null && (
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {t("You scored {score} / 100", { score: finalScore })}
                  </p>
                )}
              </div>
              <ReadAloud
                kind="feedback"
                text={t("Well done! You paid close attention to the garden visitors.")}
              />
              <Button
                size="lg"
                onClick={() => {
                  if (finalScore !== null) {
                    handleFinish(finalScore);
                  }
                }}
                className="w-full min-h-[56px] text-xl font-bold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {t("Finish")}
              </Button>
            </div>
          )}
        </section>
      )}
    </GameShell>
  );
}
