"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, RotateCcw } from "lucide-react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { Button } from "@/components/ui/button";
import { attentionRounds, BoardItem } from "./data";
import {
  initialSession,
  newSession,
  pluralize,
} from "./logic";
import ReadAloud from "@/components/interaction/ReadAloud";

function computeScore(foundTotal: number, totalTargets: number, wrongTaps: number): number {
  if (totalTargets === 0) return 0;
  const accuracyScore = (foundTotal / totalTargets) * 100;
  const penalty = 5 * wrongTaps;
  return Math.max(0, Math.min(100, Math.round(accuracyScore - penalty)));
}

function AttentionHuntSession({ onDone }: { onDone: (score: number) => void }) {
  const [boards, setBoards] = useState<BoardItem[][]>(() => initialSession());
  const [roundIndex, setRoundIndex] = useState(0);
  const [foundIds, setFoundIds] = useState<number[]>([]);
  const [wrongIds, setWrongIds] = useState<number[]>([]);
  const [foundTotal, setFoundTotal] = useState(0);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [started, setStarted] = useState(false);
  const doneCalledRef = useRef(false);

  const board = boards[roundIndex];
  const config = attentionRounds[roundIndex];
  const target = board.find((item) => item.isTarget)!;
  const targetCount = board.filter((item) => item.isTarget).length;
  const foundInRound = foundIds.length;
  const totalTargets = useMemo(
    () => boards.reduce((sum, items) => sum + items.filter((item) => item.isTarget).length, 0),
    [boards]
  );

  const handleFinishSession = (finalFoundTotal: number, finalWrongTaps: number) => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    const finalScore = computeScore(finalFoundTotal, totalTargets, finalWrongTaps);
    onDone(finalScore);
  };

  useEffect(() => {
    setBoards(newSession());
  }, []);

  // 60-second timer per round (paused when not started)
  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => {
      setTimeLeft((time) => Math.max(0, time - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [started, roundIndex]);

  // Round timeout handling
  useEffect(() => {
    if (!started || timeLeft > 0) return;
    if (roundIndex < attentionRounds.length - 1) {
      setFeedback("Time's up for this round! Moving to the next round.");
      setRoundIndex((r) => r + 1);
      setFoundIds([]);
      setWrongIds([]);
      setTimeLeft(60);
      setStarted(false);
    } else {
      handleFinishSession(foundTotal, wrongTaps);
    }
  }, [started, timeLeft, roundIndex, foundTotal, wrongTaps]);

  const reset = () => {
    doneCalledRef.current = false;
    const nextBoards = newSession();
    setBoards(nextBoards);
    setRoundIndex(0);
    setFoundIds([]);
    setWrongIds([]);
    setFoundTotal(0);
    setWrongTaps(0);
    setFeedback("");
    setTimeLeft(60);
    setStarted(false);
  };

  const select = (item: BoardItem) => {
    if (!started || foundIds.includes(item.id)) return;
    if (!item.isTarget) {
      const nextWrong = wrongTaps + 1;
      setWrongTaps(nextWrong);
      setWrongIds((value) => [...value, item.id]);
      setFeedback("That one is different. Keep looking for the target.");
      window.setTimeout(() => setWrongIds((value) => value.filter((id) => id !== item.id)), 500);
      return;
    }
    const nextFound = [...foundIds, item.id];
    setFoundIds(nextFound);
    const nextFoundTotal = foundTotal + 1;
    setFoundTotal(nextFoundTotal);
    setFeedback("Correct! Target found.");
    if (nextFound.length === targetCount) {
      if (roundIndex === attentionRounds.length - 1) {
        handleFinishSession(nextFoundTotal, wrongTaps);
      } else {
        setFeedback("All targets found! Continue to the next round.");
      }
    }
  };

  const nextRound = () => {
    setRoundIndex((value) => value + 1);
    setFoundIds([]);
    setWrongIds([]);
    setFeedback("");
    setTimeLeft(60);
    setStarted(false);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">
            Round {roundIndex + 1} of {attentionRounds.length} · Level 3
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Find all the {pluralize(target.label)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {config.rows} × {config.columns} board
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <div className="text-xs text-muted-foreground">Time left</div>
            <div className="text-xl font-semibold tabular-nums" aria-live="off">
              {timeLeft}s
            </div>
          </div>
          <div
            aria-label={`Target ${target.label}`}
            className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-primary bg-primary/5 text-4xl"
            role="img"
          >
            {target.representation}
          </div>
        </div>
      </div>
      <ReadAloud text={`Find all the ${pluralize(target.label)}. Target: ${target.label}. ${started ? "Scan the board carefully. Tap the matching pictures." : "Press start when you are ready."}`} />
      {feedback && <ReadAloud kind="feedback" text={feedback} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {foundInRound} / {targetCount} found in round
        </p>
        <p
          aria-live="polite"
          role="status"
          className={`text-sm ${
            feedback.startsWith("Correct") || feedback.startsWith("All targets")
              ? "font-medium text-green-700"
              : "text-muted-foreground"
          }`}
        >
          {started ? feedback || "Scan the board carefully." : "Press start when you are ready."}
        </p>
      </div>

      <div
        role="group"
        aria-label={`Attention Hunt round ${roundIndex + 1} board`}
        className="mx-auto grid w-full max-w-2xl gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))` }}
      >
        {board.map((item) => {
          const found = foundIds.includes(item.id);
          const wrong = wrongIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`${item.label}${found ? ", found" : ""}`}
              disabled={!started || found || foundInRound === targetCount}
              onClick={() => select(item)}
              className={`flex aspect-square min-w-0 items-center justify-center rounded-xl border-2 bg-background text-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-4xl ${
                found
                  ? "border-green-600 bg-green-50 text-green-800"
                  : wrong
                  ? "border-destructive/50 bg-destructive/10"
                  : "border-border"
              }`}
            >
              <span aria-hidden="true">{item.representation}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex min-h-12 flex-wrap items-center justify-between gap-3">
        {!started ? (
          <Button className="min-h-12" onClick={() => setStarted(true)}>
            <Check className="mr-2 h-4 w-4" /> Start round {roundIndex + 1}
          </Button>
        ) : null}
        {foundInRound === targetCount && roundIndex < attentionRounds.length - 1 && (
          <Button className="min-h-12" onClick={nextRound}>
            Next round <Check className="ml-2 h-4 w-4" />
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          Total targets found: {foundTotal} / {totalTargets} (Mistakes: {wrongTaps})
        </p>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Restart hunt
        </Button>
      </div>
    </div>
  );
}

export default function AttentionHunt({
  level = 3,
  date = format(new Date(), "yyyy-MM-dd"),
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="attention-hunt"
      title="Attention Hunt"
      instructions="Find every copy of the target while ignoring similar objects."
      level={3}
      skill="selective attention"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <AttentionHuntSession onDone={handleFinish} />}
    </GameShell>
  );
}
