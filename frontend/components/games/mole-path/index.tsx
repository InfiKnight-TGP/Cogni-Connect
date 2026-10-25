"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Eye, RotateCcw } from "lucide-react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { Button } from "@/components/ui/button";
import { moleKnobConfigs, moleLevel2Config } from "./data";
import { makePath } from "./logic";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";

function MolePathSession({ onDone }: { onDone: (score: number) => void }) {
  const { t } = useTranslate();
  const [knob] = useState<1 | 2 | 3 | 4>(() => {
    const raw = readSkill("mole-path").knob;
    return (raw >= 1 && raw <= 4 ? raw : 2) as 1 | 2 | 3 | 4;
  });
  const knobConfig = moleKnobConfigs[knob];

  const [roundIndex, setRoundIndex] = useState(0); // 0 to 4 (5 rounds)
  const [currentPathLength, setCurrentPathLength] = useState(knobConfig.startLength);
  const [longestCorrectPath, setLongestCorrectPath] = useState(0);
  const [roundSuccess, setRoundSuccess] = useState<boolean | null>(null);
  const [replaysUsed, setReplaysUsed] = useState(0);

  const [phase, setPhase] = useState<"ready" | "preview" | "playing" | "round-end">("ready");
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [selected, setSelected] = useState<number[]>([]);
  const [path, setPath] = useState<number[]>(() => makePath(moleLevel2Config.gridSize, knobConfig.startLength));
  const [feedback, setFeedback] = useState("");
  const [feedbackPositive, setFeedbackPositive] = useState(false);

  const log = useAnswerLog("mole-path", "mole-path", `${roundIndex}:${phase}`, knob, true);
  const replayedInRound = replaysUsed >= knobConfig.maxReplays;

  // Preview timing configured per knob (Knob 2: 800ms ON, 400ms OFF)
  useEffect(() => {
    if (phase !== "preview") return;
    let cancelled = false;
    let timerId: number | null = null;

    const runPreview = async () => {
      for (let i = 0; i < path.length; i++) {
        if (cancelled) return;
        setPreviewIndex(i);
        await new Promise((res) => {
          timerId = window.setTimeout(res, knobConfig.onMs);
        });
        if (cancelled) return;
        setPreviewIndex(-1);
        await new Promise((res) => {
          timerId = window.setTimeout(res, knobConfig.offMs);
        });
      }
      if (!cancelled) {
        setPhase("playing");
      }
    };

    runPreview();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      setPreviewIndex(-1);
    };
  }, [phase, path, knobConfig.onMs, knobConfig.offMs]);

  const reset = () => {
    setRoundIndex(0);
    setCurrentPathLength(knobConfig.startLength);
    setLongestCorrectPath(0);
    setRoundSuccess(null);
    setReplaysUsed(0);
    setPath(makePath(moleLevel2Config.gridSize, knobConfig.startLength));
    setPhase("ready");
    setPreviewIndex(-1);
    setSelected([]);
    setFeedback("");
    setFeedbackPositive(false);
  };

  const startRound = () => {
    setSelected([]);
    setFeedback("");
    setFeedbackPositive(false);
    setPreviewIndex(-1);
    setPhase("preview");
  };

  const handleReplay = () => {
    if (phase !== "playing" || replayedInRound) return;
    setReplaysUsed((prev) => prev + 1);
    setSelected([]);
    setFeedback(t("Replaying path…"));
    setFeedbackPositive(false);
    setPreviewIndex(-1);
    setPhase("preview");
  };

  const advanceRound = () => {
    const nextPathLength =
      roundSuccess === true
        ? Math.min(knobConfig.longestMax, currentPathLength + 1)
        : currentPathLength;
    if (roundIndex < 4) {
      const nextRound = roundIndex + 1;
      setRoundIndex(nextRound);
      setCurrentPathLength(nextPathLength);
      setReplaysUsed(0);
      setRoundSuccess(null);
      setPath(makePath(moleLevel2Config.gridSize, nextPathLength));
      setPhase("ready");
      setSelected([]);
      setFeedback("");
      setFeedbackPositive(false);
    } else {
      const finalLongest =
        roundSuccess === true
          ? Math.max(longestCorrectPath, currentPathLength)
          : longestCorrectPath;
      const finalScore = Math.max(
        0,
        Math.min(100, Math.round((finalLongest / knobConfig.longestMax) * 100))
      );
      onDone(finalScore);
    }
  };

  const chooseHole = (hole: number) => {
    if (phase !== "playing") return;
    const next = [...selected, hole];
    if (path[selected.length] !== hole) {
      log(false);
      setRoundSuccess(false);
      setPhase("round-end");
      setFeedbackPositive(false);
      setFeedback(t("That spot was different. This round is complete; try again when you’re ready."));
      return;
    }
    setSelected(next);
    setFeedbackPositive(false);
    setFeedback(t("Correct spot!"));
    if (next.length === path.length) {
      log(true);
      setRoundSuccess(true);
      setLongestCorrectPath((prev) => Math.max(prev, path.length));
      setPhase("round-end");
      setFeedbackPositive(true);
      setFeedback(t("Path remembered! You got every spot in order."));
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">
            {t("Round {current} of {total}", { current: roundIndex + 1, total: 5 })}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {t("Remember {count} circles", { count: currentPathLength })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {phase === "preview"
              ? t("Watch carefully…")
              : phase === "playing"
              ? t("Your turn! Tap the holes in order ({current} of {total}).", {
                  current: selected.length,
                  total: currentPathLength,
                })
              : phase === "round-end"
              ? feedback
              : t("Start when you are ready.")}
          </p>
        </div>
        {phase === "ready" && (
          <Button onClick={startRound} className="min-h-14">
            <Eye className="mr-2 h-4 w-4" /> {t("Show the path")}
          </Button>
        )}
        {phase === "preview" && (
          <span className="rounded-md bg-secondary px-4 py-3 text-sm font-medium">
            {t("Watch carefully")}
          </span>
        )}
        {phase === "playing" && (
          <Button
            variant="outline"
            className="min-h-14"
            disabled={replayedInRound}
            onClick={handleReplay}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {replayedInRound
              ? t("Replay used")
              : knobConfig.maxReplays === 1
              ? t("Replay path (1 per round)")
              : t("Replay path ({remaining} left)", {
                  remaining: knobConfig.maxReplays - replaysUsed,
                })}
          </Button>
        )}
        {phase === "round-end" && (
          <Button onClick={advanceRound} className="min-h-14">
            {roundIndex === 4 ? t("Finish Game") : t("Next round")}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      {phase === "round-end" ? (
        <ReadAloud kind="feedback" text={feedback} />
      ) : (
        <ReadAloud
          text={
            phase === "ready"
              ? `${t("Remember {count} circles", { count: currentPathLength })}. ${t(
                  "Press Show the path when you are ready."
                )}`
              : phase === "preview"
              ? t("Watch carefully. Remember the circles in order.")
              : t("Your turn. Tap the holes in order. {current} of {total}.", {
                  current: selected.length,
                  total: currentPathLength,
                })
          }
        />
      )}
      {feedback && phase === "playing" && <ReadAloud kind="feedback" text={feedback} />}

      <div
        role="group"
        aria-label={t("Mole Path, 3 by 3 holes")}
        className="mx-auto grid w-full gap-3 sm:gap-5"
        style={{ gridTemplateColumns: `repeat(${moleLevel2Config.gridSize}, minmax(0, 1fr))` }}
      >
        {Array.from(
          { length: moleLevel2Config.gridSize * moleLevel2Config.gridSize },
          (_, hole) => {
            const active =
              (phase === "preview" && path[previewIndex] === hole && previewIndex >= 0) ||
              selected.includes(hole);
            const correct = selected.includes(hole);
            return (
              <button
                key={hole}
                type="button"
                disabled={phase !== "playing"}
                onClick={() => chooseHole(hole)}
                aria-label={t("Row {row}, column {col}, {state}", {
                  row: Math.floor(hole / moleLevel2Config.gridSize) + 1,
                  col: (hole % moleLevel2Config.gridSize) + 1,
                  state: active ? t("filled") : t("empty"),
                })}
                className="flex aspect-square min-h-[64px] min-w-[64px] items-center justify-center rounded-full border-2 border-slate-300 bg-slate-50 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default sm:p-3"
              >
                <span
                  aria-hidden="true"
                  className={`aspect-square w-full max-w-14 rounded-full border-[3px] sm:max-w-16 ${
                    active
                      ? correct
                        ? "border-green-700 bg-green-600"
                        : "border-primary bg-primary"
                      : "border-slate-300 bg-white"
                  }`}
                />
              </button>
            );
          }
        )}
      </div>

      {feedback && phase !== "ready" && (
        <p
          role="status"
          className={`mt-4 text-center text-sm font-medium ${
            feedbackPositive ? "text-green-700" : "text-muted-foreground"
          }`}
        >
          {feedback}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>{t("Longest correct path: {count}", { count: longestCorrectPath })}</p>
        <Button variant="ghost" size="sm" className="min-h-14" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" /> {t("Restart session")}
        </Button>
      </div>
    </div>
  );
}

export default function MolePath({
  level = 2,
  date = format(new Date(), "yyyy-MM-dd"),
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="mole-path"
      title="Mole Path"
      instructions="Watch the circles fill in order, then tap the same circles in the same order."
      level={2}
      skill="working memory"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <MolePathSession onDone={handleFinish} />}
    </GameShell>
  );
}
