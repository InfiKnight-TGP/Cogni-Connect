"use client";

import React, { useEffect, useRef, useState } from "react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { BigTile, BigTileProps } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bin, BinIndex } from "./data";
import {
  ROUNDS,
  Round,
  RuleKey,
  buildSession,
  computeScore,
  correctBin,
  getSortingKnobConfig,
  isSwitchTrial,
  ruleOf,
} from "./logic";
import { VoiceQuestion, type AnswerInput } from "@/components/interaction/VoiceQuestion";
import ReadAloud from "@/components/interaction/ReadAloud";
import { usePreferences, useTranslate } from "@/components/interaction/InteractionProvider";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";

const CUE_MS = 3000; // minimum rule cue display time
const CORRECT_MS = 700; // green flash + item drops into bin
const WRONG_MS = 1000; // gentle amber highlight + correct bin glows

/** Sorting Station is a single game. */
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
  const { t, caregiver } = useTranslate();
  const { preferences } = usePreferences();
  const [knob] = useState<1 | 2 | 3 | 4>(() => {
    const raw = readSkill("sorting-station").knob;
    return (raw >= 1 && raw <= 4 ? raw : 2) as 1 | 2 | 3 | 4;
  });
  const knobConfig = getSortingKnobConfig(knob);

  const [rounds] = useState<Round[]>(() => buildSession(Math.random, knob));
  const [roundIdx, setRoundIdx] = useState(0);
  const [trialIdx, setTrialIdx] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [cue, setCue] = useState<Cue | null>(() =>
    makeCue(rounds[0], "a", t("Round {current} of {total}", { current: 1, total: ROUNDS }), t("Sort by"))
  );
  const [minCueElapsed, setMinCueElapsed] = useState(false);
  const [cueReadDone, setCueReadDone] = useState(false);

  const correctRef = useRef(0);
  const switchErrorsRef = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const round = rounds[roundIdx];
  const trial = round.trials[trialIdx];
  const rule = ruleOf(round.pair, trial.rule);
  const log = useAnswerLog(
    "sorting-station",
    "sorting-station",
    `${roundIdx}:${trialIdx}`,
    knob,
    true
  );

  // Track minimum cue display time and narration completion so cue never closes while speaking.
  useEffect(() => {
    if (!cue) return;
    setMinCueElapsed(false);
    const narrationActive = preferences.readAloud || caregiver;
    setCueReadDone(!narrationActive);
    const minMs = knob === 1 ? 4500 : CUE_MS;
    const timer = setTimeout(() => setMinCueElapsed(true), minMs);
    return () => clearTimeout(timer);
  }, [cue, knob, preferences.readAloud, caregiver]);

  useEffect(() => {
    if (!cue || knob === 1) return;
    if (minCueElapsed && cueReadDone) {
      const timer = setTimeout(() => setCue(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [cue, knob, minCueElapsed, cueReadDone]);

  // After feedback, move to the next item / rule / round, or finish.
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(
      () => {
        const nextTrial = trialIdx + 1;

        if (nextTrial < knobConfig.itemsPerRound) {
          setFeedback(null);
          setTrialIdx(nextTrial);
          if (
            nextTrial > 0 &&
            nextTrial % knobConfig.itemsPerRule === 0
          ) {
            const nextRule = round.trials[nextTrial].rule;
            setCue(makeCue(round, nextRule, t("New rule!"), t("Now sort by")));
          }
          return;
        }

        if (roundIdx + 1 < rounds.length) {
          const nextRound = roundIdx + 1;
          setFeedback(null);
          setRoundIdx(nextRound);
          setTrialIdx(0);
          setCue(
            makeCue(
              rounds[nextRound],
              "a",
              t("Round {current} of {total}", { current: nextRound + 1, total: ROUNDS }),
              t("Now sort by")
            )
          );
          return;
        }

        const score = computeScore(correctRef.current, knobConfig.totalItems);
        // Keep session-level switch errors available for later adaptive evaluation.
        console.log("[sorting-station] session complete", {
          correct: correctRef.current,
          total: knobConfig.totalItems,
          score,
          switchErrors: switchErrorsRef.current,
          pairs: rounds.map((r) => r.pair.id),
        });
        onDoneRef.current(score);
      },
      feedback.ok ? CORRECT_MS : WRONG_MS
    );
    return () => clearTimeout(timer);
  }, [feedback, trialIdx, roundIdx, round, rounds, knobConfig, t]);

  const handlePick = (bin: BinIndex, input?: AnswerInput) => {
    if (cue || feedback) return;
    const answer = correctBin(trial);
    const ok = bin === answer;
    log(ok, input);
    if (ok) correctRef.current += 1;
    else if (isSwitchTrial(trialIdx, knob)) switchErrorsRef.current += 1;
    setFeedback({ chosen: bin, answer, ok });
  };

  const binState = (i: BinIndex): BigTileProps["state"] => {
    if (!feedback) return "default";
    if (i === feedback.chosen) return feedback.ok ? "correct" : "selected";
    if (!feedback.ok && i === feedback.answer) return "correct";
    return "default";
  };

  const binExtra = (i: BinIndex): string => {
    if (!feedback) return "";
    if (i === feedback.chosen && feedback.ok) return "scale-105";
    if (i === feedback.chosen && !feedback.ok)
      return "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
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
        @keyframes ss-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {/* Progress */}
      <div className="w-full flex flex-col items-center gap-2">
        <p className="text-base md:text-lg font-semibold text-muted-foreground">
          {t("Round {round} of {totalRounds} · Item {item} of {totalItems}", {
            round: roundIdx + 1,
            totalRounds: ROUNDS,
            item: trialIdx + 1,
            totalItems: knobConfig.itemsPerRound,
          })}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {round.trials.map((_, i) => (
            <React.Fragment key={i}>
              {i > 0 && i % knobConfig.itemsPerRule === 0 && (
                <span className="w-px h-4 bg-border mx-1" />
              )}
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
          <span
            className="text-[96px] md:text-[112px] leading-none drop-shadow-sm"
            role="img"
            aria-label={t(trial.item.label)}
          >
            {trial.item.emoji}
          </span>
          <span className="text-2xl md:text-3xl font-bold text-center">
            {t(trial.item.label)}
          </span>
        </div>
      </div>
      {!cue && (
        <VoiceQuestion
          question={`${t("Sort {item}.", { item: t(trial.item.label) })} ${t(rule.sortBy)}. ${t(
            "Tap the bin that matches."
          )}`}
          options={rule.bins.map((bin, index) => ({ id: String(index), label: t(bin.label) }))}
          onMatched={(option, input) => handlePick(Number(option.id) as BinIndex, input)}
          disabled={Boolean(feedback)}
        />
      )}

      {/* Current rule */}
      <div className="text-center" aria-live="polite">
        <p className="text-sm md:text-base uppercase tracking-wider font-semibold text-muted-foreground">
          {t("Sort by")}
        </p>
        <p className="text-2xl md:text-4xl font-extrabold text-primary leading-tight">
          {t(rule.sortBy)}
        </p>
      </div>
      {feedback && (
        <ReadAloud
          kind="feedback"
          text={
            feedback.ok
              ? t("Well done! That is the right bin.")
              : t("This one belongs in the {bin} bin.", {
                  bin: t(rule.bins[feedback.answer].label),
                })
          }
        />
      )}

      {/* Bins */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rule.bins.map((bin, idx) => {
          const i = idx as BinIndex;
          return (
            <div key={`${roundIdx}-${trial.rule}-${i}`} id={`sorting-bin-${i}`} className="flex">
              <BigTile
                emoji={bin.emoji}
                label={t(bin.label)}
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
          <ReadAloud
            text={`${cue.heading}. ${cue.lead} ${t(cue.sortBy)}.`}
            options={cue.bins.map((bin) => t(bin.label))}
            onReadComplete={() => setCueReadDone(true)}
          />
          <div className="w-full max-w-xl flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-300">
            <p className="text-4xl md:text-6xl font-extrabold text-primary">{cue.heading}</p>
            <p className="text-2xl md:text-3xl font-semibold text-muted-foreground">{cue.lead}</p>
            <p className="text-3xl md:text-5xl font-extrabold leading-tight">{t(cue.sortBy)}</p>
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {cue.bins.map((b) => (
                <div
                  key={b.label}
                  className="flex flex-col items-center gap-2 min-w-[140px] rounded-2xl border-2 border-border bg-card px-6 py-4"
                >
                  <span className="text-5xl leading-none">{b.emoji}</span>
                  <span className="text-xl font-bold">{t(b.label)}</span>
                </div>
              ))}
            </div>
            <Button
              size="lg"
              className="mt-2 min-h-14 px-8 text-xl font-bold"
              onClick={() => setCue(null)}
            >
              {t("Start sorting")}
            </Button>
            {knob !== 1 && (
              <div className="w-full max-w-xs h-2 rounded-full bg-muted overflow-hidden mt-2">
                <div
                  key={cue.heading + cue.sortBy}
                  className="h-full bg-primary"
                  style={{ animation: `ss-shrink ${CUE_MS}ms linear forwards` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
