"use client";

import React, { useEffect, useRef, useState } from "react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { cn } from "@/lib/utils";
import ReadAloud from "@/components/interaction/ReadAloud";
import { Button } from "@/components/ui/button";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { apiJSON, mediaUrl } from "@/lib/api";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { buildPlaceScenarioQuestions, type PlaceScenario } from "./scenarios";
import type { Place } from "@/lib/places";
import {
  JUNCTIONS,
  LANDMARK_POOL,
  Landmark,
  RoundSetup,
  buildRoundSetup,
  getBFSDistance,
} from "./data";

const HINT_FLASH_MS = 2000;
const GOAL_REACHED_MS = 1200;

export default function MapNavigator({
  date = new Date().toISOString().split("T")[0],
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="map-navigator"
      title="Map Navigator"
      instructions="Memorise target landmarks, then navigate the town grid step-by-step."
      level={3}
      skill="spatial"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <MapNavigatorGame onDone={handleFinish} />}
    </GameShell>
  );
}

interface MapNavigatorGameProps {
  onDone: (score: number) => void;
}

function MapNavigatorGame({ onDone }: MapNavigatorGameProps) {
  const { t } = useTranslate();
  const [knob] = useState(() => readSkill("map-navigator").knob);
  const [roundIdx, setRoundIdx] = useState(0); // 0, 1, 2, 3 (Rounds 1 to 4)
  const [phase, setPhase] = useState<"memorise" | "navigate" | "round_end" | "places">("memorise");
  const [timer, setTimer] = useState(15);

  const [setup, setSetup] = useState<RoundSetup | null>(null);
  const [targetSequence, setTargetSequence] = useState<string[]>([]);
  const [activeGoalIdx, setActiveGoalIdx] = useState(0);

  const [playerPos, setPlayerPos] = useState<number>(0);
  const [pathWalked, setPathWalked] = useState<number[]>([]);

  const [offTrackMoves, setOffTrackMoves] = useState(0);
  const [sessionHints, setSessionHints] = useState(0);
  const [roundHints, setRoundHints] = useState(0);

  const [hintingLandmarkKey, setHintingLandmarkKey] = useState<string | null>(null);
  const [goalReachedMsg, setGoalReachedMsg] = useState<string | null>(null);

  const [roundEfficiencies, setRoundEfficiencies] = useState<number[]>([]);
  const [placeQuestions, setPlaceQuestions] = useState<PlaceScenario[]>([]);
  const [mapScore, setMapScore] = useState<number | null>(null);
  const log = useAnswerLog("map-navigator", "Recognition & Orientation", `${roundIdx}-${activeGoalIdx}-${pathWalked.length}`, knob, true);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let active = true;
    apiJSON<Place[] | { places?: Place[] }>("/places", { authRedirect: false }).then(result => {
      if (!active) return;
      const places = Array.isArray(result) ? result : result.places ?? [];
      setPlaceQuestions(buildPlaceScenarioQuestions(places, knob));
    }).catch(() => { if (active) setPlaceQuestions([]); });
    return () => { active = false; };
  }, [knob]);

  // Initialise round setup
  useEffect(() => {
    const isR4 = roundIdx === 3;
    const goalCount = knob === 1 ? (roundIdx === 0 ? 1 : 2) : knob === 2 ? 2 : knob === 3 ? (roundIdx === 0 ? 2 : 3) : (roundIdx === 3 ? 4 : 3);
    const newSetup = buildRoundSetup(goalCount as 1 | 2 | 3 | 4, isR4, undefined, knob);

    setSetup(newSetup);
    const homePos = newSetup.landmarkPos["home"];
    setPlayerPos(homePos);
    setPathWalked([homePos]);

    // Construct full target sequence
    // Round 4 appends 'home' at the end for "Go Home"
    const seq = isR4 ? [...newSetup.goalKeys, "home"] : [...newSetup.goalKeys];
    setTargetSequence(seq);
    setActiveGoalIdx(0);

    setPhase("memorise");
    setTimer(knob === 1 ? 20 : knob === 2 ? 15 : knob === 3 ? 12 : 10);
    setOffTrackMoves(0);
    setRoundHints(0);
    setHintingLandmarkKey(null);
    setGoalReachedMsg(null);
  }, [roundIdx, knob]);

  // Countdown timer for memorise phase
  useEffect(() => {
    if (phase !== "memorise") return;
    if (timer <= 0) {
      setPhase("navigate");
      return;
    }
    const interval = setInterval(() => {
      setTimer((prev: number) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timer]);

  if (!setup) return null;

  const currentTargetKey = targetSequence[activeGoalIdx] || null;
  const isRound4 = roundIdx === 3;
  const isGoingHomeStep = isRound4 && activeGoalIdx === setup.goalKeys.length; // final step of round 4

  // Adjacent junctions to player's current position
  const adjacentJunctions = setup.graph[playerPos] || [];

  const handleStartNavigating = () => {
    setPhase("navigate");
  };

  const handleMoveTo = (nextPos: number) => {
    if (phase !== "navigate" || !currentTargetKey) return;
    if (!adjacentJunctions.includes(nextPos)) return;

    const targetNode = setup.landmarkPos[currentTargetKey];
    const prevDist = getBFSDistance(setup.graph, playerPos, targetNode);
    const newDist = getBFSDistance(setup.graph, nextPos, targetNode);

    const newPath = [...pathWalked, nextPos];
    setPathWalked(newPath);
    setPlayerPos(nextPos);

    // Check hint logic: off-track if distance doesn't decrease
    if (newDist >= prevDist) {
      log(false, { method: "tap", responseMs: null });
      const newOffTrack = offTrackMoves + 1;
      if (newOffTrack >= (knob === 1 ? 2 : knob === 2 ? 2 : knob === 3 ? 3 : 4)) {
        // Trigger hint
        setSessionHints((h) => h + 1);
        setRoundHints((h) => h + 1);
        setHintingLandmarkKey(currentTargetKey);
        setOffTrackMoves(0);

        setTimeout(() => {
          setHintingLandmarkKey(null);
        }, HINT_FLASH_MS);
      } else {
        setOffTrackMoves(newOffTrack);
      }
    } else {
      log(true, { method: "tap", responseMs: null });
      setOffTrackMoves(0);
    }

    // Goal checking (Only counts in order!)
    if (nextPos === targetNode) {
      // Reached current target goal!
      const targetLm = LANDMARK_POOL.find((lm) => lm.key === currentTargetKey);
      setGoalReachedMsg(`Found ${targetLm?.name || "goal"}!`);
      setTimeout(() => setGoalReachedMsg(null), GOAL_REACHED_MS);

      const nextGoalIdx = activeGoalIdx + 1;
      setActiveGoalIdx(nextGoalIdx);
      setOffTrackMoves(0);

      // Check if all goals in round completed
      if (nextGoalIdx >= targetSequence.length) {
        finishRound(newPath);
      }
    }
  };

  const finishRound = (finalPath: number[]) => {
    setPhase("round_end");

    // Calculate shortest path length across target sequence
    let shortestLen = 0;
    let currNode = setup.landmarkPos["home"];

    for (const gKey of targetSequence) {
      const destNode = setup.landmarkPos[gKey];
      shortestLen += getBFSDistance(setup.graph, currNode, destNode);
      currNode = destNode;
    }

    const playerSteps = finalPath.length - 1;
    const efficiency = Math.min(100, Math.round((shortestLen / Math.max(1, playerSteps)) * 100));

    console.log(`[map-navigator] Round ${roundIdx + 1} efficiency: ${efficiency}%, hints: ${roundHints}`);

    const newEffs = [...roundEfficiencies, efficiency];
    setRoundEfficiencies(newEffs);

    setTimeout(() => {
      if (roundIdx + 1 < 4) {
        setRoundIdx(roundIdx + 1);
      } else if (placeQuestions.length > 0) {
        const avgEff = newEffs.reduce((a, b) => a + b, 0) / newEffs.length;
        const mapFinalScore = Math.max(0, Math.min(100, Math.round(avgEff - 10 * sessionHints)));
        setMapScore(mapFinalScore);
        setPhase("places");
      } else {
        // Session complete
        const avgEff = newEffs.reduce((a, b) => a + b, 0) / newEffs.length;
        const totalHints = sessionHints;
        const finalScore = Math.max(0, Math.min(100, Math.round(avgEff - 10 * totalHints)));

        console.log("[map-navigator] session complete", {
          roundEfficiencies: newEffs,
          totalHints,
          finalScore,
        });

        onDoneRef.current(finalScore);
      }
    }, 1200);
  };

  if (phase === "places" && mapScore !== null) return <PlaceScenarioRound questions={placeQuestions} onDone={placesScore => onDoneRef.current(Math.round((mapScore + placesScore) / 2))} />;

  return (
    <div className="flex flex-col items-center gap-4 select-none w-full max-w-lg mx-auto">
      {/* Header Info */}
      <div className="w-full flex items-center justify-between px-2">
        <span className="text-sm font-semibold text-muted-foreground">
          Round {roundIdx + 1} of 4
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {phase === "memorise" ? `Memorise: ${timer}s` : `Hints: ${sessionHints}`}
        </span>
      </div>
      <ReadAloud kind={goalReachedMsg ? "feedback" : "question"} text={goalReachedMsg ?? (phase === "memorise"
        ? `Remember where to go. Memorise these places before navigating: ${setup.goalKeys.map(key => LANDMARK_POOL.find(item => item.key === key)?.name).filter(Boolean).join(", ")}.`
        : phase === "round_end"
          ? "Round complete!"
          : isGoingHomeStep
            ? "Now find your way back home. Tap the map to choose a direction."
            : `Go to ${LANDMARK_POOL.find(item => item.key === setup.goalKeys[activeGoalIdx])?.name ?? "the next place"}. Tap the map to find your way.`)} />
      {hintingLandmarkKey && <ReadAloud kind="feedback" text={`Hint: move closer to ${LANDMARK_POOL.find(item => item.key === hintingLandmarkKey)?.name ?? "the highlighted place"}.`} />}
      {/* Instruction Banner */}
      <div className="w-full bg-secondary/50 border border-border rounded-xl p-3 text-center min-h-[64px] flex items-center justify-center">
        {phase === "memorise" && (
          <div className="flex flex-col items-center gap-1">
            <p className="text-lg font-bold text-primary">Remember where to go!</p>
            <p className="text-xs text-muted-foreground">
              Memorise the target locations before navigating.
            </p>
          </div>
        )}

        {phase === "navigate" && (
          <div className="flex flex-col items-center gap-1">
            {isGoingHomeStep ? (
              <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400 animate-pulse">
                Now find your way back home 🏠!
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
                <span>Go to:</span>
                {setup.goalKeys.map((gKey, idx) => {
                  const lm = LANDMARK_POOL.find((l) => l.key === gKey);
                  const isCurrent = idx === activeGoalIdx;
                  const isDone = idx < activeGoalIdx;
                  return (
                    <span
                      key={gKey}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 border",
                        isCurrent
                          ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105"
                          : isDone
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-300 opacity-60 line-through"
                          : "bg-card text-muted-foreground border-border"
                      )}
                    >
                      <span>{idx + 1}.</span>
                      <span>{lm?.emoji}</span>
                      <span>{lm?.name}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {phase === "round_end" && (
          <p className="text-lg font-bold text-green-600 dark:text-green-400">
            Round Complete!
          </p>
        )}
      </div>

      {/* Goal Reached Toast */}
      {goalReachedMsg && (
        <div className="bg-green-500 text-white font-extrabold px-6 py-2 rounded-full shadow-lg text-lg animate-bounce z-20">
          ✨ {goalReachedMsg} ✨
        </div>
      )}

      {/* SVG Map Container */}
      <div className="relative w-full aspect-square bg-card border-2 border-border rounded-2xl shadow-inner overflow-hidden p-2">
        <svg viewBox="0 0 500 500" className="w-full h-full">
          {/* Grid Roads */}
          {Object.entries(setup.graph).map(([fromNodeStr, neighbors]) => {
            const u = Number(fromNodeStr);
            const j1 = JUNCTIONS[u];
            return neighbors.map((v) => {
              if (u < v) {
                const j2 = JUNCTIONS[v];
                return (
                  <line
                    key={`road-${u}-${v}`}
                    x1={j1.x}
                    y1={j1.y}
                    x2={j2.x}
                    y2={j2.y}
                    stroke="currentColor"
                    strokeWidth="12"
                    strokeLinecap="round"
                    className="text-muted/40"
                  />
                );
              }
              return null;
            });
          })}

          {/* Path Walked Trail */}
          {pathWalked.map((nodeId, idx) => {
            if (idx === 0) return null;
            const jPrev = JUNCTIONS[pathWalked[idx - 1]];
            const jCurr = JUNCTIONS[nodeId];
            return (
              <line
                key={`walked-${idx}`}
                x1={jPrev.x}
                y1={jPrev.y}
                x2={jCurr.x}
                y2={jCurr.y}
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                className="text-primary opacity-80"
              />
            );
          })}

          {/* Landmarks */}
          {Object.entries(setup.landmarkPos).map(([lmKey, junctionId]) => {
            const j = JUNCTIONS[junctionId];
            const lm = LANDMARK_POOL.find((l) => l.key === lmKey);
            if (!lm) return null;

            // Round 4 requirement: hide Home marker when asking to find way back home
            if (isGoingHomeStep && lm.key === "home" && knob >= 3) {
              return null;
            }

            const isGoal = setup.goalKeys.includes(lmKey);
            const goalOrderIdx = setup.goalKeys.indexOf(lmKey);
            const isHinting = hintingLandmarkKey === lmKey;

            return (
              <g key={`lm-${lmKey}`} transform={`translate(${j.x}, ${j.y})`}>
                {/* Hint flash beacon */}
                {isHinting && (
                  <circle
                    r="34"
                    className="fill-amber-400/40 stroke-amber-500 animate-ping"
                    strokeWidth="3"
                  />
                )}

                {/* Landmark base circle */}
                <circle
                  r="26"
                  className={cn(
                    "fill-card stroke-2 transition-colors",
                    lm.isHome
                      ? cn("stroke-blue-500 fill-blue-50 dark:fill-blue-950", isGoingHomeStep && knob <= 2 && "opacity-40")
                      : isGoal
                      ? "stroke-primary fill-primary/10"
                      : "stroke-border"
                  )}
                />

                {/* Landmark Emoji (at least 48px size) */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="48"
                  className="select-none pointer-events-none"
                >
                  {lm.emoji}
                </text>

                {/* Landmark Label */}
                <text
                  y="36"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="bold"
                  className="fill-foreground select-none pointer-events-none"
                >
                  {lm.name}
                </text>

                {/* MEMORISE phase numbered goal badges: SVG circle with text */}
                {phase === "memorise" && isGoal && (
                  <g transform="translate(18, -18)">
                    <circle r="12" className="fill-primary stroke-background stroke-2" />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="12"
                      fontWeight="extrabold"
                      className="fill-primary-foreground select-none"
                    >
                      {goalOrderIdx + 1}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Tappable Adjacent Junctions (Large >= 56px touch target) */}
          {phase === "navigate" &&
            adjacentJunctions.map((adjNodeId) => {
              const j = JUNCTIONS[adjNodeId];
              return (
                <g key={`adj-${adjNodeId}`} transform={`translate(${j.x}, ${j.y})`}>
                  {/* Outer pulse target */}
                  <circle
                    r="28" // 56px diameter
                    onClick={() => handleMoveTo(adjNodeId)}
                    className="fill-primary/20 stroke-primary stroke-2 cursor-pointer hover:scale-125 transition-transform animate-pulse"
                  />
                  <circle
                    r="8"
                    onClick={() => handleMoveTo(adjNodeId)}
                    className="fill-primary cursor-pointer pointer-events-none"
                  />
                </g>
              );
            })}

          {/* Player Avatar Marker */}
          {JUNCTIONS[playerPos] && (
            <g
              transform={`translate(${JUNCTIONS[playerPos].x}, ${JUNCTIONS[playerPos].y})`}
              className="transition-transform duration-300 ease-out pointer-events-none"
            >
              <circle r="18" className="fill-amber-400 stroke-amber-600 stroke-2 shadow-md" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="16"
                className="select-none"
              >
                🏃
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Memorise Phase Skip Button */}
      {phase === "memorise" && (
        <Button
          size="lg"
          className="w-full font-bold shadow-md"
          onClick={handleStartNavigating}
        >
          Ready! Start Navigating 🚀
        </Button>
      )}
    </div>
  );
}

function PlaceScenarioRound({ questions, onDone }: { questions: PlaceScenario[]; onDone: (score: number) => void }) {
  const { t } = useTranslate();
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const question = questions[index];
  const prompt = question.kind === "open"
    ? t(question.prompt, { time: question.time ?? "", weekday: t(question.weekday ?? "") })
    : t(question.prompt);
  const answer = question.options.find(place => place.id === question.answerId)!;
  const choose = (place: Place) => {
    if (selected !== null) return;
    setSelected(place.id);
    if (place.id === question.answerId) setCorrect(value => value + 1);
  };
  const next = () => {
    if (index === questions.length - 1) onDone(Math.round((correct / questions.length) * 100));
    else { setIndex(index + 1); setSelected(null); }
  };
  return <section className="mx-auto w-full max-w-3xl space-y-6 rounded-3xl border-2 border-border bg-card p-5 shadow-sm sm:p-8" aria-live="polite">
    <header><h2 className="text-3xl font-bold">{t("Your places")}</h2><p className="mt-2 text-lg">{t("Question {number}", { number: index + 1 })} / {questions.length}</p></header>
    <h3 className="text-2xl font-bold">{prompt}</h3>
    <ReadAloud text={prompt} options={question.options.map(place => place.name)} />
    <div className="grid gap-3 sm:grid-cols-2">{question.options.map(place => {
      const isSelected = selected === place.id;
      const isCorrect = selected !== null && place.id === question.answerId;
      const isWrong = isSelected && place.id !== question.answerId;
      return <button key={place.id} type="button" onClick={() => choose(place)} disabled={selected !== null} aria-pressed={isSelected}
        className={`min-h-36 rounded-2xl border-2 p-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default ${isCorrect ? "border-amber-600 bg-amber-50 dark:bg-amber-950/40" : isWrong ? "border-amber-600 bg-amber-50 dark:bg-amber-950/40" : "border-border bg-background hover:bg-muted"}`}>
        {place.photo ? <img src={mediaUrl(`/place-photos/${encodeURIComponent(place.photo)}`)} alt={place.name} className="mb-3 h-24 w-full rounded-xl object-cover" /> : <span className="mb-2 block text-4xl" aria-hidden="true">📍</span>}
        <span className="block text-xl font-bold">{place.name}</span>
        {place.note && <span className="mt-1 block text-base">{place.note}</span>}
      </button>;
    })}</div>
    {selected !== null && <div role="status" className="rounded-xl border-2 border-amber-600/60 bg-amber-50 p-4 text-lg text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      {selected === question.answerId ? t("That is right.") : t("The answer is {answer}.", { answer: answer.name })}
    </div>}
    {selected !== null && <ReadAloud kind="feedback" text={selected === question.answerId ? t("That is right.") : t("The answer is {answer}.", { answer: answer.name })} />}
    {selected !== null && <Button size="lg" className="min-h-14 px-10 text-lg" onClick={next}>{t("Next")}</Button>}
  </section>;
}
