"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Eye, RotateCcw } from "lucide-react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { Button } from "@/components/ui/button";
import { moleLevel2Config } from "./data";
import { makePath } from "./logic";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";

function MolePathSession({ onDone }: { onDone: (score: number) => void }) {
  const [roundIndex, setRoundIndex] = useState(0); // 0 to 4 (5 rounds)
  const [currentPathLength, setCurrentPathLength] = useState(3);
  const [longestCorrectPath, setLongestCorrectPath] = useState(0);
  const [roundSuccess, setRoundSuccess] = useState<boolean | null>(null);
  const [replayedInRound, setReplayedInRound] = useState(false);

  const [phase, setPhase] = useState<"ready" | "preview" | "playing" | "round-end">("ready");
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [selected, setSelected] = useState<number[]>([]);
  const [path, setPath] = useState<number[]>(() => makePath(moleLevel2Config.gridSize, 3));
  const [feedback, setFeedback] = useState("");
  const log = useAnswerLog("mole-path", "Memory", `${roundIndex}:${phase}:${selected.length}`, currentPathLength);

  // Preview timing: 800ms ON, 400ms OFF
  useEffect(() => {
    if (phase !== "preview") return;
    let cancelled = false;
    let timerId: number | null = null;

    const runPreview = async () => {
      for (let i = 0; i < path.length; i++) {
        if (cancelled) return;
        setPreviewIndex(i);
        await new Promise((res) => {
          timerId = window.setTimeout(res, 800);
        });
        if (cancelled) return;
        setPreviewIndex(-1);
        await new Promise((res) => {
          timerId = window.setTimeout(res, 400);
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
  }, [phase, path]);

  const reset = () => {
    setRoundIndex(0);
    setCurrentPathLength(3);
    setLongestCorrectPath(0);
    setRoundSuccess(null);
    setReplayedInRound(false);
    setPath(makePath(moleLevel2Config.gridSize, 3));
    setPhase("ready");
    setPreviewIndex(-1);
    setSelected([]);
    setFeedback("");
  };

  const startRound = () => {
    setSelected([]);
    setFeedback("");
    setPreviewIndex(-1);
    setPhase("preview");
  };

  const handleReplay = () => {
    if (phase !== "playing" || replayedInRound) return;
    setReplayedInRound(true);
    setSelected([]);
    setFeedback("Replaying path…");
    setPreviewIndex(-1);
    setPhase("preview");
  };

  const advanceRound = () => {
    const nextPathLength = roundSuccess === true ? Math.min(7, currentPathLength + 1) : currentPathLength;
    if (roundIndex < 4) {
      const nextRound = roundIndex + 1;
      setRoundIndex(nextRound);
      setCurrentPathLength(nextPathLength);
      setReplayedInRound(false);
      setRoundSuccess(null);
      setPath(makePath(moleLevel2Config.gridSize, nextPathLength));
      setPhase("ready");
      setSelected([]);
      setFeedback("");
    } else {
      const finalLongest = roundSuccess === true ? Math.max(longestCorrectPath, currentPathLength) : longestCorrectPath;
      const finalScore = Math.max(
        0,
        Math.min(100, Math.round((finalLongest / 7) * 100))
      );
      onDone(finalScore);
    }
  };

  const chooseHole = (hole: number, input?: AnswerInput) => {
    if (phase !== "playing") return;
    log(path[selected.length] === hole, input);
    const next = [...selected, hole];
    if (path[selected.length] !== hole) {
      setRoundSuccess(false);
      setPhase("round-end");
      setFeedback("That spot was different. This round is complete; try again when you’re ready.");
      return;
    }
    setSelected(next);
    setFeedback("Correct spot!");
    if (next.length === path.length) {
      setRoundSuccess(true);
      setLongestCorrectPath((prev) => Math.max(prev, path.length));
      setPhase("round-end");
      setFeedback("Path remembered! You got every spot in order.");
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <VoiceQuestion key={`${roundIndex}:${phase}:${selected.length}`} prompt="Repeat the path. Say the row and column." disabled={phase !== "playing"} options={Array.from({ length: 9 }, (_, i) => ({ id: String(i), label: `Row ${Math.floor(i / 3) + 1} column ${i % 3 + 1}` }))} onAnswer={(id, input) => chooseHole(Number(id), input)} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">
            Round {roundIndex + 1} of 5
          </p>
          <h2 className="mt-1 text-xl font-semibold">Remember {currentPathLength} circles</h2>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {phase === "preview"
              ? "Watch carefully…"
              : phase === "playing"
              ? `Your turn! Tap the holes in order (${selected.length} of ${currentPathLength}).`
              : phase === "round-end"
              ? feedback
              : "Start when you are ready."}
          </p>
        </div>
        {phase === "ready" && (
          <Button onClick={startRound} className="min-h-12">
            <Eye className="mr-2 h-4 w-4" /> Show the path
          </Button>
        )}
        {phase === "preview" && (
          <span className="rounded-md bg-secondary px-4 py-3 text-sm font-medium">
            Watch carefully
          </span>
        )}
        {phase === "playing" && (
          <Button
            variant="outline"
            disabled={replayedInRound}
            onClick={handleReplay}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {replayedInRound ? "Replay used" : "Replay path (1 per round)"}
          </Button>
        )}
        {phase === "round-end" && (
          <Button onClick={advanceRound} className="min-h-12">
            {roundIndex === 4 ? "Finish Game" : "Next round"}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        role="group"
        aria-label={`Level 2 Mole Path, 3 by 3 holes`}
        className="mx-auto grid w-full gap-3 sm:gap-5"
        style={{ gridTemplateColumns: `repeat(${moleLevel2Config.gridSize}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: moleLevel2Config.gridSize * moleLevel2Config.gridSize }, (_, hole) => {
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
              aria-label={`Row ${Math.floor(hole / moleLevel2Config.gridSize) + 1}, column ${
                (hole % moleLevel2Config.gridSize) + 1
              }${active ? ", filled" : ", empty"}`}
              className="flex aspect-square min-h-0 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-50 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default sm:p-3"
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
        })}
      </div>

      {feedback && phase !== "ready" && (
        <p
          role="status"
          className={`mt-4 text-center text-sm font-medium ${
            feedback.startsWith("Path remembered") ? "text-green-700" : "text-muted-foreground"
          }`}
        >
          {feedback}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>Longest correct path: {longestCorrectPath}</p>
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Restart session
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
