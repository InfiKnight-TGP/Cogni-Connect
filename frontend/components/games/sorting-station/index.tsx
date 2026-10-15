"use client";

import React, { useEffect, useRef, useState } from "react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { BigTile, BigTileProps } from "../_shared/BigTile";
import { cn } from "@/lib/utils";
import { Bin, BinIndex } from "./data";
import {
  ITEMS_PER_ROUND,
  ITEMS_PER_RULE,
  ROUNDS,
  Round,
  RuleKey,
  TOTAL_ITEMS,
  buildSession,
  computeScore,
  correctBin,
  isSwitchTrial,
  ruleOf,
} from "./logic";
import { VoiceQuestion } from "@/components/interaction/VoiceQuestion";
import ReadAloud from "@/components/interaction/ReadAloud";

const CUE_MS = 3000; // full-screen rule cue
const CORRECT_MS = 700; // green flash + item drops into bin
const WRONG_MS = 1000; // red flash + correct bin glows

/** Sorting Station is a single Level 2 game. */
export default function SortingStation({
  date = new Date().toISOString().split("T")[0],
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="sorting-station"
      title="Sorting Station"
      instructions="Tap the bin each item belongs in. Watch out: the sorting rule will change!"
      level={2}
      skill="flexibility"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <SortingGame onDone={handleFinish} />}
    </GameShell>
  );
}

interface Feedback {
  chosen: BinIndex;
  answer: BinIndex;
  ok: boolean;
}

interface Cue {
  heading: string;
  lead: string;
  sortBy: string;
  bins: [Bin, Bin];
}

function makeCue(round: Round, key: RuleKey, heading: string, lead: string): Cue {
  const rule = ruleOf(round.pair, key);
  return { heading, lead, sortBy: rule.sortBy, bins: rule.bins };
}

function SortingGame({ onDone }: { onDone: (score: number) => void }) {
  const [rounds] = useState<Round[]>(() => buildSession());
  const [roundIdx, setRoundIdx] = useState(0);
  const [trialIdx, setTrialIdx] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [cue, setCue] = useState<Cue | null>(() =>
    makeCue(rounds[0], "a", `Round 1 of ${ROUNDS}`, "Sort by")
  );

  const correctRef = useRef(0);
  const switchErrorsRef = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const round = rounds[roundIdx];
  const trial = round.trials[trialIdx];
  const rule = ruleOf(round.pair, trial.rule);

  // Hide the full-screen cue after 3 seconds.
  useEffect(() => {
    if (!cue) return;
    const t = setTimeout(() => setCue(null), CUE_MS);
    return () => clearTimeout(t);
  }, [cue]);

  // After feedback, move to the next item / rule / round, or finish.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(
      () => {
        const nextTrial = trialIdx + 1;

        if (nextTrial < ITEMS_PER_ROUND) {
          setFeedback(null);
          setTrialIdx(nextTrial);
          if (nextTrial === ITEMS_PER_RULE) {
            setCue(makeCue(round, "b", "New rule!", "Now sort by"));
          }
          return;
        }

        if (roundIdx + 1 < rounds.length) {
          const nextRound = roundIdx + 1;
          setFeedback(null);
          setRoundIdx(nextRound);
          setTrialIdx(0);
          setCue(
            makeCue(rounds[nextRound], "a", `Round ${nextRound + 1} of ${ROUNDS}`, "Now sort by")
          );
          return;
        }

        const score = computeScore(correctRef.current);
        // The shared saveScore type has no extra fields, so switchErrors is logged here.
        console.log("[sorting-station] session complete", {
          correct: correctRef.current,
          total: TOTAL_ITEMS,
          score,
          switchErrors: switchErrorsRef.current,
          pairs: rounds.map((r) => r.pair.id),
        });
        onDoneRef.current(score);
      },
      feedback.ok ? CORRECT_MS : WRONG_MS
    );
    return () => clearTimeout(t);
  }, [feedback, trialIdx, roundIdx, round, rounds]);

  const handlePick = (bin: BinIndex) => {
    if (cue || feedback) return;
    const answer = correctBin(trial);
    const ok = bin === answer;
    if (ok) correctRef.current += 1;
    else if (isSwitchTrial(trialIdx)) switchErrorsRef.current += 1;
    setFeedback({ chosen: bin, answer, ok });
  };

  const binState = (i: BinIndex): BigTileProps["state"] => {
    if (!feedback) return "default";
    if (i === feedback.chosen) return feedback.ok ? "correct" : "wrong";
    if (!feedback.ok && i === feedback.answer) return "correct";
    return "default";
  };

  const binExtra = (i: BinIndex): string => {
    if (!feedback) return "";
    if (i === feedback.chosen && feedback.ok) return "scale-105";
    if (i === feedback.chosen && !feedback.ok) return "animate-[ss-shake_0.4s_ease-in-out]";
    if (!feedback.ok && i === feedback.answer)
      return "ring-4 ring-green-400 ring-offset-2 ring-offset-background animate-pulse";
    return "";
  };

  // On a correct answer, the item flies down into the chosen bin.
  const dropClass =
    feedback?.ok === true
      ? feedback.chosen === 0
        ? "translate-y-40 sm:-translate-x-1/2 scale-50 opacity-0"
        : "translate-y-72 sm:translate-y-40 sm:translate-x-1/2 scale-50 opacity-0"
      : "";

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      <style>{`
        @keyframes ss-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        @keyframes ss-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {/* Progress */}
      <div className="w-full flex flex-col items-center gap-2">
        <p className="text-base md:text-lg font-semibold text-muted-foreground">
          Round {roundIdx + 1} of {ROUNDS} · Item {trialIdx + 1} of {ITEMS_PER_ROUND}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {round.trials.map((_, i) => (
            <React.Fragment key={i}>
              {i === ITEMS_PER_RULE && <span className="w-px h-4 bg-border mx-1" />}
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-colors",
                  i < trialIdx ? "bg-primary" : i === trialIdx ? "bg-primary/50" : "bg-muted"
                )}
              />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Item */}
      <div className="relative z-10 h-[190px] flex items-center justify-center">
        <div
          key={`${roundIdx}-${trialIdx}`}
          id="sorting-current-item"
          className={cn(
            "flex flex-col items-center gap-2 transition-all duration-500 ease-in animate-in fade-in zoom-in-90",
            dropClass
          )}
        >
          <span className="text-[96px] md:text-[112px] leading-none drop-shadow-sm" role="img" aria-label={trial.item.label}>
            {trial.item.emoji}
          </span>
          <span className="text-2xl md:text-3xl font-bold text-center">{trial.item.label}</span>
        </div>
      </div>
      {!cue && <VoiceQuestion question={`Sort ${trial.item.label}. ${rule.sortBy}. Tap the bin that matches.`} options={rule.bins.map((bin, index) => ({ id: String(index), label: bin.label }))} onMatched={option => handlePick(Number(option.id) as BinIndex)} disabled={Boolean(feedback)} />}

      {/* Current rule */}
      <div className="text-center" aria-live="polite">
        <p className="text-sm md:text-base uppercase tracking-wider font-semibold text-muted-foreground">
          Sort by
        </p>
        <p className="text-2xl md:text-4xl font-extrabold text-primary leading-tight">
          {rule.sortBy}
        </p>
      </div>
      {feedback && <ReadAloud kind="feedback" text={feedback.ok ? "Well done! That is the right bin." : `Try again. This belongs in the ${rule.bins[feedback.answer].label} bin.`} />}

      {/* Bins */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rule.bins.map((bin, idx) => {
          const i = idx as BinIndex;
          return (
            <div key={`${roundIdx}-${trial.rule}-${i}`} id={`sorting-bin-${i}`} className="flex">
              <BigTile
                emoji={bin.emoji}
                label={bin.label}
                state={binState(i)}
                onClick={() => handlePick(i)}
                className={cn(
                  "w-full min-w-[160px] min-h-[140px] sm:min-h-[190px] rounded-2xl duration-300",
                  "[&>span:first-child]:text-6xl [&>span:first-child]:mb-3",
                  "[&>span:last-child]:text-2xl [&>span:last-child]:font-bold",
                  binExtra(i)
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Full-screen rule cue */}
      {cue && (
        <div
          id="sorting-rule-cue"
          role="alertdialog"
          aria-live="assertive"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-6 animate-in fade-in duration-300"
        >
          <ReadAloud text={`${cue.heading}. ${cue.lead} ${cue.sortBy}.`} options={cue.bins.map(bin => bin.label)} />
          <div className="w-full max-w-xl flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-300">
            <p className="text-4xl md:text-6xl font-extrabold text-primary">{cue.heading}</p>
            <p className="text-2xl md:text-3xl font-semibold text-muted-foreground">{cue.lead}</p>
            <p className="text-3xl md:text-5xl font-extrabold leading-tight">{cue.sortBy}</p>
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {cue.bins.map((b) => (
                <div
                  key={b.label}
                  className="flex flex-col items-center gap-2 min-w-[140px] rounded-2xl border-2 border-border bg-card px-6 py-4"
                >
                  <span className="text-5xl leading-none">{b.emoji}</span>
                  <span className="text-xl font-bold">{b.label}</span>
                </div>
              ))}
            </div>
            <div className="w-full max-w-xs h-2 rounded-full bg-muted overflow-hidden mt-4">
              <div
                key={cue.heading + cue.sortBy}
                className="h-full bg-primary"
                style={{ animation: `ss-shrink ${CUE_MS}ms linear forwards` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
