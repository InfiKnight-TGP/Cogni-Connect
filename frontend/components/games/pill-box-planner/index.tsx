"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import GameShell from "../_shared/GameShell";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import { starsFor } from "@/lib/progress";
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
  findRuleHint,
} from "./logic";
import { CheckCircle2, Info, ArrowRight, RotateCcw, Check } from "lucide-react";

interface PillBoxPlannerProps {
  level?: 1 | 2 | 3;
  onFinish?: (score: number) => void;
  date?: string;
}

export default function PillBoxPlanner({
  level = 2,
  onFinish,
  date,
}: PillBoxPlannerProps) {
  const { t } = useTranslate();

  // Read the adaptive knob ONCE with clamp(1..4, default 2)
  const [knob] = useState(() => {
    const raw = readSkill("pill-box-planner").knob;
    return Math.max(1, Math.min(4, Math.round(typeof raw === "number" && !Number.isNaN(raw) ? raw : 2)));
  });

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

  // Ref ensuring handleFinish runs exactly once per session
  const finishedRef = useRef(false);

  const scenario: PlannerScenario = scenarios[currentRoundIdx] ?? scenarios[0];

  // Adaptive logging hook: gameId="pill-box-planner", area="Executive Function", knob
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
    const result = evaluateRoundPlacements(scenario, currentPlacements, [], false);
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

  // Confirm fix handler (one fix per round, corrected compartments count half)
  const handleConfirmFix = () => {
    if (!initialPlacementsSnapshot) return;
    const finalResult = evaluateRoundPlacements(
      scenario,
      initialPlacementsSnapshot,
      currentPlacements,
      true
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

  // Proceed to next round or show summary screen
  const handleNextRound = () => {
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
      // Finished all 3 rounds: display summary screen only
      const overallScore = calculatePillBoxSessionScore(updatedCompleted);
      setFinalScore(overallScore);
      setSessionFinished(true);
    }
  };

  // Safe finish caller: Finish button on summary screen is the only caller
  const handleSafeFinish = (handleFinishCallback: (score: number) => void) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    handleFinishCallback(finalScore ?? 100);
  };

  // Helper: check if compartment is flagged as needing attention in review
  const isCompartmentFlagged = (day: WeekDay, time: DayTime): boolean => {
    if (!roundResult || (phase !== "checked" && phase !== "fixing")) return false;
    const prefix = `${day}:${time}:`;
    const missing = roundResult.missingKeys.some((k) => k.startsWith(prefix));
    const extra = roundResult.extraKeys.some((k) => k.startsWith(prefix));
    return missing || extra;
  };

  // Compute gentle rule-specific hint if checked and not perfect
  const activeRuleHint = useMemo(() => {
    if (!roundResult || roundResult.isPerfect) return null;
    return findRuleHint(scenario, roundResult.missingKeys, roundResult.extraKeys);
  }, [roundResult, scenario]);

  const hintSpeech = useMemo(() => {
    if (!activeRuleHint) {
      return t("Check complete. A few compartments need attention.");
    }
    const colorLabel = t(PILL_COLORS[activeRuleHint.pillColor].name);
    const instructionLabel = t(activeRuleHint.hintDetail);
    return t("Look again at the {color} pill: {instruction}", {
      color: colorLabel,
      instruction: instructionLabel,
    });
  }, [activeRuleHint, t]);

  // Round completion stars and encouraging words (no raw numbers shown to patient)
  const roundScoreVal = roundResult?.roundScore ?? 0;
  const roundStars = starsFor(roundScoreVal);
  const roundPraise =
    roundStars === 3
      ? "Well done!"
      : roundStars === 2
      ? "Nice work, you followed the rules."
      : "Good effort!";

  // Session completion stars and encouraging words
  const sessionStars = starsFor(finalScore ?? 100);
  const sessionPraise =
    sessionStars === 3
      ? "Well done!"
      : sessionStars === 2
      ? "Nice work, you followed the rules."
      : "Good effort!";

  return (
    <GameShell
      gameId="pill-box-planner"
      title="Pill Box Planner"
      instructions="Organize your weekly pill box by following the rules on the practice card."
      level={level}
      skill="rule switching"
      onFinish={onFinish}
      date={date}
    >
      {(handleFinish) => (
        <div className="w-full max-w-5xl mx-auto space-y-6 pb-8">
          {/* Permanent Safety Banner - Always visible, read aloud only when read-aloud is on */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/60 shadow-sm text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">🛡️</span>
              <span className="font-semibold text-base sm:text-lg tracking-wide">
                {t("Practice only. This is not medical advice.")}
              </span>
            </div>
            <ReadAloud text={t("Practice only. This is not medical advice.")} autoRead />
          </div>

          {!sessionFinished ? (
            <>
              {/* Progress and Round Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t("Round")}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold text-base">
                    {currentRoundIdx + 1} / {scenarios.length}
                  </span>
                </div>
                <div className="text-base font-semibold text-slate-700 dark:text-slate-300">
                  {t(scenario.title)}
                </div>
              </div>

              {/* Doctor's Note Card */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-900/50 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl" aria-hidden="true">📋</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {t("Doctor's Note")}
                    </h3>
                  </div>
                  <ReadAloud
                    text={
                      scenario.rules.map((r) => t(r.instruction)).join(" ") +
                      (scenario.exceptionNote ? ` ${t(scenario.exceptionNote)}` : "")
                    }
                    autoRead={false}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scenario.rules.map((rule, idx) => {
                    const colorMeta = PILL_COLORS[rule.pillColor];
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-3.5 p-4 rounded-2xl border-2 ${colorMeta.bgClass} ${colorMeta.borderClass}`}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-white shadow-sm font-bold text-base"
                          style={{ backgroundColor: colorMeta.hex, color: "#fff" }}
                        >
                          {colorMeta.name[0]}
                        </div>
                        <div className="space-y-1">
                          <div className={`font-bold text-lg ${colorMeta.textClass}`}>
                            {t(colorMeta.name)} {t("Pill")}
                          </div>
                          <div className="text-lg font-medium text-slate-800 dark:text-slate-100">
                            {t(rule.instruction)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Exception Callout: calm sky/blue style with Info icon */}
                {scenario.exceptionNote && (
                  <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-200 text-base sm:text-lg font-medium">
                    <div className="flex items-center gap-3">
                      <Info className="w-6 h-6 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      <span>{t(scenario.exceptionNote)}</span>
                    </div>
                    <ReadAloud text={t(scenario.exceptionNote)} autoRead={false} />
                  </div>
                )}
              </div>

              {/* Pill Colour Picker Palette */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {t("Select Colour to Place")}
                  </span>
                  <span className="text-base text-slate-500 dark:text-slate-400">
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
                        className={`min-h-[56px] flex items-center gap-3 px-5 py-3 rounded-2xl border-2 transition-all font-bold text-base ${
                          isSelected
                            ? `${color.borderClass} ${color.bgClass} shadow-md scale-105 ring-2 ring-blue-400/30`
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        <span
                          className="w-6 h-6 rounded-full inline-block border border-white shadow-xs"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span>{t(color.name)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weekly Pill Box */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {t("Weekly Pill Box (7 Days)")}
                  </h4>
                  {phase === "idle" && currentPlacements.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetRound}
                      className="min-h-[56px] px-4 py-2.5 text-base font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300 flex items-center gap-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {t("Clear All")}
                    </button>
                  )}
                </div>

                {/* Desktop Grid Layout: 7 days x 3 times */}
                <div className="hidden md:block overflow-x-auto rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3.5 text-left text-base font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 w-48">
                          {t("Time")}
                        </th>
                        {WEEK_DAYS.map((day) => (
                          <th
                            key={day}
                            className="p-3.5 text-center text-base font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700"
                          >
                            {t(day.slice(0, 3))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {DAY_TIMES.map((time) => {
                        const timeMeta = TIME_SLOT_META[time];
                        const rowHint = scenario.rowHints?.[time];
                        return (
                          <tr key={time}>
                            <td className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 w-48 align-top">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-200">
                                  <span>{timeMeta.icon}</span>
                                  <span>{t(timeMeta.name)}</span>
                                </div>
                                <span className="text-base text-slate-500 dark:text-slate-400 font-normal">
                                  {t(timeMeta.subLabel)}
                                </span>
                                {rowHint && (
                                  <span className="text-base font-semibold text-blue-800 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/60 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800/60 mt-1">
                                    {t(rowHint)}
                                  </span>
                                )}
                              </div>
                            </td>
                            {WEEK_DAYS.map((day) => {
                              const pills = getPillsInSlot(day, time);
                              const flagged = isCompartmentFlagged(day, time);
                              return (
                                <td
                                  key={day}
                                  onClick={() => handleTogglePill(day, time)}
                                  className={`p-3 text-center border-l border-slate-200 dark:border-slate-700 cursor-pointer transition-colors min-h-[72px] h-[72px] ${
                                    flagged
                                      ? "border-2 border-dashed border-slate-400 dark:border-slate-500 bg-slate-50/60 dark:bg-slate-800/40"
                                      : "hover:bg-blue-50/50 dark:hover:bg-slate-800/50"
                                  }`}
                                >
                                  {flagged && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-xl text-base font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600">
                                      <span aria-hidden="true">🔍</span>
                                      <span>{t("Check this")}</span>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center justify-center gap-2 min-h-[52px]">
                                    {pills.length === 0 ? (
                                      <span className="text-slate-300 dark:text-slate-600 text-lg font-bold select-none">
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
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/60 shadow-xs text-base font-bold text-white transition-transform hover:scale-105"
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
                  {/* Day Tabs - at least 56px tall */}
                  <div className="flex overflow-x-auto gap-2 pb-2">
                    {WEEK_DAYS.map((day) => {
                      const isActive = activeDayTab === day;
                      const dayPillCount = currentPlacements.filter((p) => p.day === day).length;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setActiveDayTab(day)}
                          className={`min-h-[56px] px-4 py-3 rounded-2xl font-bold text-base whitespace-nowrap transition-all border-2 flex items-center gap-2 ${
                            isActive
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span>{t(day.slice(0, 3))}</span>
                          {dayPillCount > 0 && (
                            <span className="ms-1 px-2.5 py-0.5 rounded-full bg-white/25 text-base font-bold">
                              {dayPillCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Compartments for Active Day - at least 72px tall */}
                  <div className="space-y-4">
                    {DAY_TIMES.map((time) => {
                      const timeMeta = TIME_SLOT_META[time];
                      const pills = getPillsInSlot(activeDayTab, time);
                      const flagged = isCompartmentFlagged(activeDayTab, time);
                      const rowHint = scenario.rowHints?.[time];
                      return (
                        <div
                          key={time}
                          onClick={() => handleTogglePill(activeDayTab, time)}
                          className={`min-h-[72px] p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                            flagged
                              ? "border-dashed border-slate-400 dark:border-slate-500 bg-slate-50/60 dark:bg-slate-800/40"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-200">
                              <span>{timeMeta.icon}</span>
                              <span>{t(timeMeta.name)}</span>
                              <span className="text-base font-normal text-slate-500 dark:text-slate-400">
                                ({t(timeMeta.subLabel)})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {flagged && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-base font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600">
                                  <span aria-hidden="true">🔍</span>
                                  <span>{t("Check this")}</span>
                                </span>
                              )}
                              <span className="text-base text-slate-500 dark:text-slate-400">
                                {t("Tap a compartment to place or remove")}
                              </span>
                            </div>
                          </div>

                          {/* Mobile row hint shown inside compartment card */}
                          {rowHint && (
                            <div className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-300 text-base font-medium">
                              💡 {t(rowHint)}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2.5 min-h-[52px] p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                            {pills.length === 0 ? (
                              <span className="text-base text-slate-400 dark:text-slate-500">
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
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/60 shadow-xs text-base font-bold text-white"
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

              {/* Gentle Rule-Specific Hint Banner during Review */}
              {(phase === "checked" || phase === "fixing") && roundResult && !roundResult.isPerfect && activeRuleHint && (
                <div className="p-5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-200 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 font-bold text-base sm:text-lg">
                      <Info className="w-6 h-6 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      <span>{hintSpeech}</span>
                    </div>
                    <ReadAloud kind="feedback" text={hintSpeech} autoRead />
                  </div>
                  <p className="text-base text-slate-700 dark:text-slate-300">
                    {t("Compartments with a dashed outline and 'Check this' label can be adjusted. You have one chance to make a fix (corrections count half).")}
                  </p>
                </div>
              )}

              {/* Action Buttons Bar - at least 56px tall */}
              <div className="flex flex-wrap items-center justify-end gap-4 pt-3">
                {phase === "idle" && (
                  <button
                    type="button"
                    onClick={handleCheck}
                    disabled={currentPlacements.length === 0}
                    className="min-h-[56px] flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-base shadow-md transition-all disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    {t("Check Placements")}
                  </button>
                )}

                {phase === "checked" && (
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handleStartFix}
                      className="min-h-[56px] flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-base shadow-md transition-all"
                    >
                      {t("Try a Fix")}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmFix}
                      className="min-h-[56px] flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-base shadow-md transition-all"
                    >
                      {t("Finish Round")}
                    </button>
                  </div>
                )}

                {phase === "fixing" && (
                  <button
                    type="button"
                    onClick={handleConfirmFix}
                    className="min-h-[56px] flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-md transition-all"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {t("Confirm Fix")}
                  </button>
                )}

                {phase === "completed" && (
                  <div className="flex flex-wrap items-center gap-5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1 text-2xl" aria-label={`${roundStars} stars`}>
                        {Array.from({ length: 3 }).map((_, i) => (
                          <span key={i} className={i < roundStars ? "opacity-100" : "opacity-30"}>
                            ⭐
                          </span>
                        ))}
                      </div>
                      <span className="text-base font-bold text-slate-800 dark:text-slate-200">
                        {t(roundPraise)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleNextRound}
                      className="min-h-[56px] flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-md transition-all"
                    >
                      <span>{currentRoundIdx + 1 < scenarios.length ? t("Next Round") : t("View Summary")}</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Session Completed Screen - no raw numbers shown to patient */
            <div className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-800 text-center space-y-6 shadow-md">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-4xl">
                ✨
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  {t("Session Complete!")}
                </h3>
                <p className="text-base text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  {t("Great practice following multi-step rules and schedule planning.")}
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 max-w-sm mx-auto border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex justify-center gap-2 text-4xl" aria-label={`${sessionStars} stars`}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <span key={i} className={i < sessionStars ? "opacity-100" : "opacity-25"}>
                      ⭐
                    </span>
                  ))}
                </div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {t(sessionPraise)}
                </div>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  {t("Nice work, you followed the rules.")}
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => handleSafeFinish(handleFinish)}
                  disabled={finishedRef.current}
                  className="min-h-[56px] px-10 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-base shadow-lg transition-all"
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
