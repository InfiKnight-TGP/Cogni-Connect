"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import GameFrame from "@/components/games/GameFrame";
import GameResult from "@/components/games/GameResult";
import { Button } from "@/components/ui/button";
import { shuffle } from "@/lib/games";
import { attentionRounds, makeBoard, objectSets, type BoardItem } from "./data";

function newSession() {
  const configOrder = shuffle(objectSets.map((_, index) => index)).slice(0, attentionRounds.length);
  return configOrder.map((configIndex, roundIndex) => makeBoard(roundIndex, configIndex));
}

function initialSession() {
  return attentionRounds.map((_, roundIndex) => makeBoard(roundIndex, roundIndex, false));
}

function scoreSession(found: number, targets: number, wrong: number, tiles: number) {
  const accuracy = targets ? found / targets : 0;
  const penalty = wrong / Math.max(1, tiles);
  return Math.max(0, Math.min(100, Math.round(accuracy * 100 - penalty * 25)));
}

function pluralize(label: string) {
  if (/(s|x|ch|sh)$/i.test(label)) return `${label}es`;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

export default function AttentionHuntPage() {
  const [boards, setBoards] = useState<BoardItem[][]>(() => initialSession());
  const [roundIndex, setRoundIndex] = useState(0);
  const [foundIds, setFoundIds] = useState<number[]>([]);
  const [wrongIds, setWrongIds] = useState<number[]>([]);
  const [foundTotal, setFoundTotal] = useState(0);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const board = boards[roundIndex];
  const config = attentionRounds[roundIndex];
  const target = board.find((item) => item.isTarget)!;
  const targetCount = board.filter((item) => item.isTarget).length;
  const foundInRound = foundIds.length;
  const totalTargets = useMemo(() => boards.reduce((sum, items) => sum + items.filter((item) => item.isTarget).length, 0), [boards]);
  const totalTiles = useMemo(() => boards.reduce((sum, items) => sum + items.length, 0), [boards]);

  useEffect(() => {
    setBoards(newSession());
  }, []);

  useEffect(() => {
    if (!started || finished) return;
    const timer = window.setInterval(() => setTimeLeft((time) => Math.max(0, time - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [started, finished]);

  useEffect(() => {
    if (started && !finished && timeLeft === 0) {
      setFinalScore(scoreSession(foundTotal, totalTargets, wrongTaps, totalTiles));
      setFinished(true);
    }
  }, [started, finished, timeLeft, foundTotal, totalTargets, wrongTaps, totalTiles]);

  const reset = () => {
    const nextBoards = newSession();
    setBoards(nextBoards); setRoundIndex(0); setFoundIds([]); setWrongIds([]); setFoundTotal(0); setWrongTaps(0); setFeedback(""); setTimeLeft(60); setStarted(false); setFinished(false); setFinalScore(0);
  };

  const select = (item: BoardItem) => {
    if (finished || !started || foundIds.includes(item.id)) return;
    if (!item.isTarget) {
      setWrongTaps((value) => value + 1); setWrongIds((value) => [...value, item.id]); setFeedback("That one is different. Keep looking for the target.");
      window.setTimeout(() => setWrongIds((value) => value.filter((id) => id !== item.id)), 500);
      return;
    }
    const nextFound = [...foundIds, item.id];
    setFoundIds(nextFound); setFoundTotal((value) => value + 1); setFeedback("Correct! Target found.");
    if (nextFound.length === targetCount) {
      if (roundIndex === attentionRounds.length - 1) {
        setFinalScore(scoreSession(foundTotal + 1, totalTargets, wrongTaps, totalTiles)); setFinished(true);
      } else {
        setFeedback("All targets found! Continue to the next round.");
      }
    }
  };

  const nextRound = () => {
    setRoundIndex((value) => value + 1); setFoundIds([]); setWrongIds([]); setFeedback("");
  };

  return <GameFrame title="Attention Hunt" description="Find every copy of the target while ignoring similar objects." instructions="Find all copies of the object shown above the board. Tap each target once, and leave the similar objects alone. You have 60 seconds for all five rounds." level={roundIndex + 1} totalLevels={attentionRounds.length} score={finished ? finalScore : scoreSession(foundTotal, totalTargets, wrongTaps, totalTiles)}>
    {finished ? <GameResult gameId="attention-hunt" score={finalScore} breakdown={{ skill: "Selective Attention", correctTargets: foundTotal, totalTargets, wrongTaps, timeLeft }} onPlayAgain={reset} /> : <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-medium text-primary">Round {roundIndex + 1} of {attentionRounds.length} · Level 3</p><h2 className="mt-1 text-2xl font-semibold">Find all the {pluralize(target.label)}</h2><p className="mt-1 text-sm text-muted-foreground">{config.rows} × {config.columns} board</p></div>
        <div className="flex items-center gap-4">
          <div className="rounded-lg border bg-background px-4 py-3 text-center"><div className="text-xs text-muted-foreground">Time left</div><div className="text-xl font-semibold tabular-nums" aria-live="off">{timeLeft}s</div></div>
          <div aria-label={`Target ${target.label}`} className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-primary bg-primary/5 text-4xl" role="img">{target.representation}</div>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{foundInRound} / {targetCount} found</p><p aria-live="polite" role="status" className={`text-sm ${feedback.startsWith("Correct") || feedback.startsWith("All targets") ? "font-medium text-green-700" : "text-muted-foreground"}`}>{started ? feedback || "Scan the board carefully." : "Press start when you are ready."}</p></div>
      <div role="group" aria-label={`Attention Hunt round ${roundIndex + 1} board`} className="mx-auto grid w-full max-w-2xl gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))` }}>
        {board.map((item) => {
          const found = foundIds.includes(item.id);
          const wrong = wrongIds.includes(item.id);
          return <button key={item.id} type="button" aria-label={`${item.label}${found ? ", found" : ""}`} disabled={!started || finished || found || foundInRound === targetCount} onClick={() => select(item)} className={`flex aspect-square min-w-0 items-center justify-center rounded-xl border-2 bg-background text-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-4xl ${found ? "border-green-600 bg-green-50 text-green-800" : wrong ? "border-destructive/50 bg-destructive/10" : "border-border"}`}><span aria-hidden="true">{item.representation}</span></button>;
        })}
      </div>
      <div className="mt-5 flex min-h-12 flex-wrap items-center justify-between gap-3">
        {!started ? <Button className="min-h-12" onClick={() => setStarted(true)}><Check className="mr-2 h-4 w-4" />Start hunt</Button> : null}
        {foundInRound === targetCount && roundIndex < attentionRounds.length - 1 && <Button className="min-h-12" onClick={nextRound}>Next round<Check className="ml-2 h-4 w-4" /></Button>}
        <p className="text-sm text-muted-foreground">Session progress: {foundTotal} / {totalTargets} objects found</p>
        <Button variant="ghost" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Start over</Button>
      </div>
    </>}
  </GameFrame>;
}
