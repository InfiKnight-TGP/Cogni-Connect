"use client";

import { useEffect, useState } from "react";
import { Check, Eye, RotateCcw } from "lucide-react";
import GameFrame from "@/components/games/GameFrame";
import GameResult from "@/components/games/GameResult";
import { Button } from "@/components/ui/button";
import { moleLevels, makePath } from "./levels";

export default function MolePathPage() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"ready" | "preview" | "playing" | "round-end" | "result">("ready");
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [selected, setSelected] = useState<number[]>([]);
  const [path, setPath] = useState<number[]>(() => Array.from({ length: 3 }, (_, index) => index));
  const [pathPrepared, setPathPrepared] = useState(false);
  const [longest, setLongest] = useState(0);
  const [longestMax, setLongestMax] = useState(7);
  const [feedback, setFeedback] = useState("");
  const config = moleLevels[levelIndex];
  const length = config.lengths[round];
  const score = Math.max(0, Math.min(100, Math.round((longest / longestMax) * 100)));

  useEffect(() => {
    if (phase !== "preview") return;
    let tick = 0;
    setPreviewIndex(0);
    const timer = window.setInterval(() => {
      tick += 1;
      if (tick >= path.length * 2) {
          window.clearInterval(timer);
          window.setTimeout(() => { setPreviewIndex(-1); setPhase((current) => current === "preview" ? "playing" : current); }, 450);
      } else {
        setPreviewIndex(tick % 2 === 0 ? tick / 2 : -1);
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [phase, path]);

  const reset = () => {
    setLevelIndex(0); setRound(0); setPath(Array.from({ length: 3 }, (_, index) => index)); setPathPrepared(false); setPhase("ready"); setPreviewIndex(-1); setSelected([]); setLongest(0); setLongestMax(7); setFeedback("");
  };
  const startRound = () => { if (!pathPrepared) { setPath(makePath(config.gridSize, length)); setPathPrepared(true); } setSelected([]); setFeedback(""); setPreviewIndex(-1); setPhase("preview"); };
  const advanceRound = () => {
    if (round < config.lengths.length - 1) { const nextRound = round + 1; setPath(makePath(config.gridSize, config.lengths[nextRound])); setPathPrepared(true); setRound(nextRound); setPhase("ready"); setSelected([]); }
    else if (levelIndex === 0) { setLevelIndex(1); setRound(0); setPath(makePath(moleLevels[1].gridSize, moleLevels[1].lengths[0])); setPathPrepared(true); setPhase("ready"); setSelected([]); setFeedback("Level 2 complete. Now try the larger Level 3 grid."); }
    else setPhase("result");
  };
  const chooseHole = (hole: number) => {
    if (phase !== "playing") return;
    const next = [...selected, hole];
    if (path[selected.length] !== hole) {
      setPhase("round-end");
      setFeedback("That spot was different. This round is complete; try the next path when you’re ready.");
      return;
    }
    setSelected(next);
    setFeedback("Correct spot!");
    if (next.length === path.length) {
      if (path.length > longest) {
        setLongest(path.length);
        setLongestMax(config.lengths[config.lengths.length - 1]);
      }
      setPhase("round-end");
      setFeedback("Path remembered! You got every spot in order.");
    }
  };

  return <GameFrame title="Mole Path" description="Watch each circle fill, then repeat the path from memory." instructions="Watch the filled circles one at a time. When it is your turn, tap the same circles in the same order. You can replay the path before answering." level={levelIndex + 2} totalLevels={2} score={score}>
    {phase === "result" ? <GameResult gameId="mole-path" score={score} breakdown={{ skill: "Visual Working Memory", longestPath: longest, level: "2 and 3" }} onPlayAgain={reset} /> : <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">{config.label} · Round {round + 1} of 5</p><h2 className="mt-1 text-xl font-semibold">Remember {length} circles</h2><p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{phase === "preview" ? "Watch carefully…" : phase === "playing" ? `Your turn! Tap the holes in the SAME order (${selected.length} of ${length}).` : phase === "round-end" ? feedback : "Start when you are ready."}</p></div>
        {phase === "ready" && <Button onClick={startRound} className="min-h-12"><Eye className="mr-2 h-4 w-4" />Show the path</Button>}
        {phase === "preview" && <span className="rounded-md bg-secondary px-4 py-3 text-sm font-medium">Watch carefully</span>}
        {phase === "playing" && <Button variant="outline" onClick={startRound}><RotateCcw className="mr-2 h-4 w-4" />Replay path</Button>}
        {phase === "round-end" && <Button onClick={advanceRound} className="min-h-12">{round === 4 && levelIndex === 1 ? "See my score" : round === 4 ? "Start Level 3" : "Next round"}<Check className="ml-2 h-4 w-4" /></Button>}
      </div>
      <div role="group" aria-label={`${config.label} Mole Path, ${config.gridSize} by ${config.gridSize} holes`} className="mx-auto grid w-full max-w-lg gap-3 sm:gap-5" style={{ gridTemplateColumns: `repeat(${config.gridSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: config.gridSize * config.gridSize }, (_, hole) => {
          const active = (phase === "preview" && path[previewIndex] === hole && previewIndex >= 0) || selected.includes(hole);
          const correct = selected.includes(hole);
          return <button key={hole} type="button" disabled={phase !== "playing"} onClick={() => chooseHole(hole)} aria-label={`Row ${Math.floor(hole / config.gridSize) + 1}, column ${hole % config.gridSize + 1}${active ? ", filled" : ", empty"}`} className="flex aspect-square min-h-0 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-50 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default sm:p-3">
            <span aria-hidden="true" className={`aspect-square w-full max-w-14 rounded-full border-[3px] sm:max-w-16 ${active ? correct ? "border-green-700 bg-green-600" : "border-primary bg-primary" : "border-slate-300 bg-white"}`} />
          </button>;
        })}
      </div>
      {feedback && phase !== "ready" && <p role="status" className={`mt-4 text-center text-sm font-medium ${feedback.startsWith("Path remembered") ? "text-green-700" : "text-muted-foreground"}`}>{feedback}</p>}
      <p className="mt-4 text-center text-sm text-muted-foreground">Longest path remembered: {longest}</p>
    </>}
  </GameFrame>;
}
