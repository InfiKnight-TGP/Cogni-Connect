"use client";

import React, { useState, useMemo, useEffect } from "react";
import GameShell from "../_shared/GameShell";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import {
  KNOB_SCENARIOS,
  PILL_COLORS,
  WEEK_DAYS,
  DAY_TIMES,
  TIME_SLOT_META,
} from "./data";
import type {
  PillColorId,
  WeekDay,
  DayTime,
  PlannerScenario,
} from "./data";
import {
  PlacedPill,
  RoundResult,
  pillKey,
  evaluateRoundPlacements,
  calculatePillBoxSessionScore,
  getScenariosForKnob,
} from "./logic";
import { CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Check, Sparkles } from "lucide-react";

interface PillBoxPlannerProps {
  level?: 1 | 2 | 3;
  onFinish?: (score: number) => void;
  knob?: number;
}

export default function PillBoxPlanner({
  level = 2,
  onFinish,
  knob = 2,
}: PillBoxPlannerProps) {
  const { t } = useTranslate();
  const scenarios = useMemo(() => getScenariosForKnob(knob, KNOB_SCENARIOS), [knob]);

  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [selectedColor, setSelectedColor] = useState<PillColorId | null>("red");
  const [activeDayTab, setActiveDayTab] = useState<WeekDay>("Monday");

  // Current placements: list of PlacedPill
  const [currentPlacements, setCurrentPlacements] = useState<PlacedPill[]>([]);
  // Placements snapshot at the time of initial check
  const [initialPlacementsSnapshot, setInitialPlacementsSnapshot] = useState<PlacedPill[] | null>(null);

  // Review states: "idle" | "checked" | "fixing" | "completed"
  const [phase, setPhase] = useState<"idle" | "checked" | "fixing" | "completed">("idle");
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [completedRounds, setCompletedRounds] = useState<RoundResult[]>([]);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const scenario: PlannerScenario = scenarios[currentRoundIdx] ?? scenarios[0];

  // Adaptive logging hook
  const logAnswer = useAnswerLog(
    "pill-box-planner",
    "Executive Function",
    String(currentRoundIdx),
    knob,
    true
  );

  // Available colours for this round
  const roundColors = useMemo(() => {
    const colorIds = new Set<PillColorId>();
    scenario.rules.forEach((r) => colorIds.add(r.pillColor));
    return Array.from(colorIds).map((id) => PILL_COLORS[id]);
  }, [scenario]);

  // Set default selected colour when round changes
  useEffect(() => {
    if (roundColors.length > 0 && (!selectedColor || !roundColors.some((c) => c.id === selectedColor))) {
      setSelectedColor(roundColors[0].id);
    }
  }, [roundColors, selectedColor]);

  // Read aloud permanent banner on first load
  useEffect(() => {
    // Component mounted
  }, []);

  // Helper: check if a pill is in a compartment
  const hasPillInSlot = (day: WeekDay, time: DayTime, pill: PillColorId): boolean => {
    return currentPlacements.some(
      (p) => p.day === day && p.time === time && p.pill === pill
    );
  };

  // Helper: get all pills in a compartment
  const getPillsInSlot = (day: WeekDay, time: DayTime): PillColorId[] => {
    return currentPlacements
      .filter((p) => p.day === day && p.time === time)
      .map((p) => p.pill);
  };

  // Toggle placement in a compartment
  const handleTogglePill = (day: WeekDay, time: DayTime, targetColor?: PillColorId) => {
    if (phase === "checked" || phase === "completed") return;

    const colorToToggle = targetColor ?? selectedColor;
    if (!colorToToggle) return;

    const exists = hasPillInSlot(day, time, colorToToggle);
    if (exists) {
      setCurrentPlacements((prev) =>
        prev.filter(
          (p) => !(p.day === day && p.time === time && p.pill === colorToToggle)
        )
      );
    } else {
      setCurrentPlacements((prev) => [
        ...prev,
        { day, time, pill: colorToToggle },
      ]);
    }
  };

  // Check button handler
  const handleCheck = () => {
    const result = evaluateRoundPlacements(scenario, currentPlacements);
    setInitialPlacementsSnapshot([...currentPlacements]);
    setRoundResult(result);

    if (result.isPerfect) {
      // Perfect score, complete round immediately
      setPhase("completed");
      logAnswer(true, { method: "tap", responseMs: null });
    } else {
      setPhase("checked");
    }
  };

  // Start fix mode
  const handleStartFix = () => {
    setPhase("fixing");
  };

  // Confirm fix handler
  const handleConfirmFix = () => {
    if (!initialPlacementsSnapshot) return;
    const finalResult = evaluateRoundPlacements(
      scenario,
      initialPlacementsSnapshot,
      currentPlacements
    );
    setRoundResult(finalResult);
    setPhase("completed");
    logAnswer(finalResult.roundScore >= 60, { method: "tap", responseMs: null });
  };

  // Reset current round
  const handleResetRound = () => {
    setCurrentPlacements([]);
    setInitialPlacementsSnapshot(null);
    setRoundResult(null);
    setPhase("idle");
  };

  // Proceed to next round or finish
  const handleNextRound = (handleFinishCallback: (score: number) => void) => {
    if (!roundResult) return;

    const updatedCompleted = [...completedRounds, roundResult];
    setCompletedRounds(updatedCompleted);

    const nextIdx = currentRoundIdx + 1;
    if (nextIdx < scenarios.length) {
      setCurrentRoundIdx(nextIdx);
      setCurrentPlacements([]);
      setInitialPlacementsSnapshot(null);
      setRoundResult(null);
      setPhase("idle");
      setActiveDayTab("Monday");
    } else {
      // Finished all 3 rounds
      const overallScore = calculatePillBoxSessionScore(updatedCompleted);
      setFinalScore(overallScore);
      setSessionFinished(true);
      handleFinishCallback(overallScore);
    }
  };

  // Helper: check if compartment is flagged as needing attention in review
  const isCompartmentFlagged = (day: WeekDay, time: DayTime): boolean => {
    if (!roundResult || (phase !== "checked" && phase !== "fixing")) return false;
    const prefix = `${day}:${time}:`;
    const missing = roundResult.missingKeys.some((k) => k.startsWith(prefix));
    const extra = roundResult.extraKeys.some((k) => k.startsWith(prefix));
    return missing || extra;
  };

  return (
    <GameShell
      gameId="pill-box-planner"
      title="Pill Box Planner"
      instructions="Organize your weekly pill box by following the rules on the practice card."
      level={level}
      skill="rule switching"
      onFinish={onFinish}
    >
      {(handleFinish) => (
        <div className="w-full max-w-5xl mx-auto space-y-6 pb-8">
          {/* Permanent Safety Banner */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/60 shadow-sm text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2.5">
              <span className="text-xl" aria-hidden="true">🛡️</span>
              <span className="font-semibold text-sm sm:text-base tracking-wide">
                {t("Practice only. This is not medical advice.")}
              </span>
            </div>
            <ReadAloud text="Practice only. This is not medical advice." />
          </div>

          {!sessionFinished ? (
            <>
              {/* Progress and Round Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t("Round")}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold text-sm">
                    {currentRoundIdx + 1} / {scenarios.length}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t(scenario.title)}
                </div>
              </div>

              {/* Doctor's Note Card */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-900/50 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden="true">📋</span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {t("Doctor's Note")}
                    </h3>
                  </div>
                  <ReadAloud
                    text={scenario.rules.map((r) => r.instruction).join(" ") + (scenario.exceptionNote ? ` ${scenario.exceptionNote}` : "")}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {scenario.rules.map((rule, idx) => {
                    const colorMeta = PILL_COLORS[rule.pillColor];
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border ${colorMeta.bgClass} ${colorMeta.borderClass}`}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border border-white shadow-sm font-bold text-xs"
                          style={{ backgroundColor: colorMeta.hex, color: "#fff" }}
                        >
                          {colorMeta.name[0]}
                        </div>
                        <div className="space-y-0.5">
                          <div className={`font-bold text-sm ${colorMeta.textClass}`}>
                            {t(colorMeta.name)} {t("Pill")}
                          </div>
                          <div className="text-sm text-slate-700 dark:text-slate-200">
                            {t(rule.instruction)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Exception Callout if present */}
                {scenario.exceptionNote && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-sm font-semibold">
                    <span className="text-lg" aria-hidden="true">⚠️</span>
                    <span>{t(scenario.exceptionNote)}</span>
                  </div>
                )}
              </div>

              {/* Knob 1 Row Hints */}
              {scenario.rowHints && (
                <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    {t("Row Hints")}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    {DAY_TIMES.map((time) => (
                      <div key={time} className="flex items-center gap-1.5">
                        <span>{TIME_SLOT_META[time].icon}</span>
                        <span className="font-semibold">{t(TIME_SLOT_META[time].name)}:</span>
                        <span>{t(scenario.rowHints?.[time] ?? "")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pill Colour Picker Palette */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t("Select Colour to Place")}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t("Tap a compartment to place or remove")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3">
                  {roundColors.map((color) => {
                    const isSelected = selectedColor === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setSelectedColor(color.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all font-bold text-sm ${
                          isSelected
                            ? `${color.borderClass} ${color.bgClass} shadow-md scale-105 ring-2 ring-blue-400/30`
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full inline-block border border-white shadow-xs"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span>{t(color.name)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weekly Pill Box */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {t("Weekly Pill Box (7 Days)")}
                  </h4>
                  {phase === "idle" && currentPlacements.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetRound}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t("Clear All")}
                    </button>
                  )}
                </div>

                {/* Desktop Grid Layout: 7 days x 3 times */}
                <div className="hidden md:block overflow-x-auto rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-28">
                          {t("Time")}
                        </th>
                        {WEEK_DAYS.map((day) => (
                          <th
                            key={day}
                            className="p-3 text-center text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700"
                          >
                            {t(day.slice(0, 3))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {DAY_TIMES.map((time) => {
                        const timeMeta = TIME_SLOT_META[time];
                        return (
                          <tr key={time}>
                            <td className="p-3 bg-slate-50/70 dark:bg-slate-800/40">
                              <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800 dark:text-slate-200">
                                <span>{timeMeta.icon}</span>
                                <span>{t(timeMeta.name)}</span>
                              </div>
                            </td>
                            {WEEK_DAYS.map((day) => {
                              const pills = getPillsInSlot(day, time);
                              const flagged = isCompartmentFlagged(day, time);
                              return (
                                <td
                                  key={day}
                                  onClick={() => handleTogglePill(day, time)}
                                  className={`p-2.5 text-center border-l border-slate-200 dark:border-slate-700 cursor-pointer transition-colors min-h-[70px] ${
                                    flagged
                                      ? "bg-amber-50/80 dark:bg-amber-950/40 ring-2 ring-inset ring-amber-400"
                                      : "hover:bg-blue-50/50 dark:hover:bg-slate-800/50"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-center gap-1.5 min-h-[46px]">
                                    {pills.length === 0 ? (
                                      <span className="text-slate-300 dark:text-slate-600 text-sm font-semibold select-none">
                                        +
                                      </span>
                                    ) : (
                                      pills.map((pillId) => {
                                        const color = PILL_COLORS[pillId];
                                        return (
                                          <div
                                            key={pillId}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleTogglePill(day, time, pillId);
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/60 shadow-xs text-xs font-bold text-white transition-transform hover:scale-105"
                                            style={{ backgroundColor: color.hex }}
                                          >
                                            <span>{t(color.name)}</span>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Tabbed Layout: Day tabs + 3 vertical time slots */}
                <div className="block md:hidden space-y-4">
                  {/* Day Tabs */}
                  <div className="flex overflow-x-auto gap-1.5 pb-1">
                    {WEEK_DAYS.map((day) => {
                      const isActive = activeDayTab === day;
                      const dayPillCount = currentPlacements.filter((p) => p.day === day).length;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setActiveDayTab(day)}
                          className={`px-3 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all border ${
                            isActive
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {t(day.slice(0, 3))}
                          {dayPillCount > 0 && (
                            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                              {dayPillCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Compartments for Active Day */}
                  <div className="space-y-3">
                    {DAY_TIMES.map((time) => {
                      const timeMeta = TIME_SLOT_META[time];
                      const pills = getPillsInSlot(activeDayTab, time);
                      const flagged = isCompartmentFlagged(activeDayTab, time);
                      return (
                        <div
                          key={time}
                          onClick={() => handleTogglePill(activeDayTab, time)}
                          className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                            flagged
                              ? "border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 shadow-sm"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                              <span>{timeMeta.icon}</span>
                              <span>{t(timeMeta.name)}</span>
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {t("Tap to place/remove")}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 min-h-[38px] p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            {pills.length === 0 ? (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {t("Empty compartment")}
                              </span>
                            ) : (
                              pills.map((pillId) => {
                                const color = PILL_COLORS[pillId];
                                return (
                                  <div
                                    key={pillId}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTogglePill(activeDayTab, time, pillId);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/60 shadow-xs text-xs font-bold text-white"
                                    style={{ backgroundColor: color.hex }}
                                  >
                                    <span>{t(color.name)}</span>
                                    <span className="text-white/80 font-normal">×</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Gentle Hint Banner during Review */}
              {(phase === "checked" || phase === "fixing") && roundResult && !roundResult.isPerfect && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span>{t("Check complete. A few compartments need attention.")}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                    {t("Compartments outlined in calm amber can be adjusted. You have one chance to make a fix (corrections count half).")}
                  </p>
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                {phase === "idle" && (
                  <button
                    type="button"
                    onClick={handleCheck}
                    disabled={currentPlacements.length === 0}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {t("Check Placements")}
                  </button>
                )}

                {phase === "checked" && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleStartFix}
                      className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition-all"
                    >
                      {t("Try a Fix")}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmFix}
                      className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-all"
                    >
                      {t("Finish Round")}
                    </button>
                  </div>
                )}

                {phase === "fixing" && (
                  <button
                    type="button"
                    onClick={handleConfirmFix}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {t("Confirm Fix")}
                  </button>
                )}

                {phase === "completed" && (
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {t("Round Score")}: <span className="text-blue-600 dark:text-blue-400 font-extrabold">{roundResult?.roundScore} / 100</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNextRound(handleFinish)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all"
                    >
                      <span>{currentRoundIdx + 1 < scenarios.length ? t("Next Round") : t("View Summary")}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Session Completed Screen */
            <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-800 text-center space-y-6 shadow-md">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-3xl">
                ✨
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {t("Session Complete!")}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  {t("Great practice following multi-step rules and schedule planning.")}
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 max-w-sm mx-auto border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                  {t("Overall Score")}
                </div>
                <div className="text-5xl font-black text-emerald-600 dark:text-emerald-400">
                  {finalScore ?? 100}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                  {t("Out of 100 points")}
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => handleFinish(finalScore ?? 100)}
                  className="px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg transition-all"
                >
                  {t("Finish")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}
