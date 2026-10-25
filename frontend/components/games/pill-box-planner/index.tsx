"use client";

import React, { useState, useMemo } from "react";
import GameShell from "../_shared/GameShell";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import {
  KNOB_SCENARIOS,
  MEDICATIONS,
  PILL_SLOTS,
} from "./data";
import type {
  PillSlot,
  RoundScenario,
} from "./data";
import {
  RoundEvaluation,
  SlotPlacements,
  calculatePillBoxScore,
  evaluatePlacements,
  getScenariosForKnob,
} from "./logic";
import { CheckCircle2, AlertCircle, ArrowRight, RotateCcw, Plus, X } from "lucide-react";

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
  const [placements, setPlacements] = useState<SlotPlacements>({
    morning: [],
    afternoon: [],
    evening: [],
    bedtime: [],
  });
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<RoundEvaluation | null>(null);
  const [completedRounds, setCompletedRounds] = useState<RoundEvaluation[]>([]);
  const [gameState, setGameState] = useState<"playing" | "round_complete" | "finished">("playing");
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const scenario: RoundScenario | undefined = scenarios[currentRoundIdx];

  // Helper to add pill to a compartment slot
  const handleAddToSlot = (slot: PillSlot, medId: string) => {
    if (evaluation) return; // Locked during review
    setPlacements((prev) => {
      const currentList = prev[slot] || [];
      // If already in this slot, don't duplicate
      if (currentList.includes(medId)) return prev;
      return {
        ...prev,
        [slot]: [...currentList, medId],
      };
    });
    setSelectedMedId(null);
  };

  // Helper to remove pill from a compartment slot
  const handleRemoveFromSlot = (slot: PillSlot, medId: string) => {
    if (evaluation) return; // Locked during review
    setPlacements((prev) => ({
      ...prev,
      [slot]: (prev[slot] || []).filter((id) => id !== medId),
    }));
  };

  // Reset current round placements
  const handleResetCurrent = () => {
    setPlacements({
      morning: [],
      afternoon: [],
      evening: [],
      bedtime: [],
    });
    setEvaluation(null);
    setSelectedMedId(null);
  };

  // Submit and evaluate current round
  const handleCheckPlacements = () => {
    if (!scenario) return;
    const result = evaluatePlacements(scenario, placements);
    setEvaluation(result);
  };

  // Continue to next round or finish session
  const handleContinue = (handleFinishCallback: (score: number) => void) => {
    if (!evaluation || !scenario) return;

    const nextCompleted = [...completedRounds, evaluation];
    setCompletedRounds(nextCompleted);

    const nextRoundIdx = currentRoundIdx + 1;
    if (nextRoundIdx < scenarios.length) {
      setCurrentRoundIdx(nextRoundIdx);
      setPlacements({
        morning: [],
        afternoon: [],
        evening: [],
        bedtime: [],
      });
      setEvaluation(null);
      setSelectedMedId(null);
    } else {
      // Session finished
      const summary = calculatePillBoxScore(nextCompleted);
      setFinalScore(summary.finalScore);
      setGameState("finished");
      handleFinishCallback(summary.finalScore);
    }
  };

  return (
    <GameShell
      gameId="pill-box-planner"
      title="Pill Box Planner"
      instructions="Organize your medications into the correct pill box compartments according to the doctor's instructions."
      level={level}
      skill="rule switching"
      onFinish={onFinish}
    >
      {(handleFinish) => (
        <div className="w-full max-w-4xl mx-auto space-y-6">
          {/* Game Header with Progress */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
            <div>
              <div className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t("Round {current} of {total}", {
                  current: currentRoundIdx + 1,
                  total: scenarios.length,
                })}
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {scenario ? t(scenario.title) : t("Medication Schedule")}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetCurrent}
                disabled={Boolean(evaluation)}
                className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                {t("Clear Box")}
              </button>
            </div>
          </div>

          {/* Rule Switch Notice if applicable */}
          {scenario?.isRuleSwitch && scenario.switchMessage && (
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border-2 border-purple-400 dark:border-purple-600 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <span className="text-2xl">🔄</span>
              <div>
                <div className="font-bold text-purple-900 dark:text-purple-200 text-base md:text-lg">
                  {t("Doctor's Prescription Update!")}
                </div>
                <div className="text-sm md:text-base text-purple-800 dark:text-purple-300 font-medium mt-0.5">
                  {t(scenario.switchMessage)}
                </div>
              </div>
            </div>
          )}

          {/* Doctor's Prescription Card */}
          {scenario && (
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-900/60 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📋</span>
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">
                    {t("Prescription Instructions")}
                  </h3>
                </div>
                <ReadAloud
                  text={scenario.rules.map((r) => r.instruction).join(". ")}
                />
              </div>
              <ul className="space-y-2">
                {scenario.rules.map((rule, idx) => {
                  const med = MEDICATIONS[rule.medicationId];
                  return (
                    <li
                      key={idx}
                      className="flex items-start gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/70 dark:border-gray-700/60"
                    >
                      <span className="text-xl flex-shrink-0">{med?.iconEmoji ?? "💊"}</span>
                      <div className="text-base md:text-lg font-semibold text-gray-800 dark:text-gray-200">
                        {t(rule.instruction)}
                        {med && (
                          <span className="block text-xs md:text-sm font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                            {med.name} ({med.doseDisplay}) · {t(med.purpose)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Interactive Pill Box Compartments */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>💊</span>
                {t("Pill Box Compartments")}
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("Tap a compartment to add or remove pills")}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {PILL_SLOTS.map((slot) => {
                const isActive = scenario?.activeSlots.includes(slot.id);
                const medsInSlot = placements[slot.id] || [];

                return (
                  <div
                    key={slot.id}
                    className={`rounded-2xl border-2 p-4 flex flex-col justify-between transition-all ${
                      isActive
                        ? "bg-white dark:bg-gray-900 border-amber-300 dark:border-amber-700 shadow-sm"
                        : "bg-gray-100/60 dark:bg-gray-900/40 border-dashed border-gray-300 dark:border-gray-800 opacity-60"
                    }`}
                  >
                    {/* Compartment Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{slot.icon}</span>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-gray-100 text-base">
                            {t(slot.name)}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                            {t(slot.timeHint)}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {medsInSlot.length}
                      </span>
                    </div>

                    {/* Placed Pills in Slot */}
                    <div className="my-3 min-h-[90px] flex flex-col gap-2">
                      {medsInSlot.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 italic text-center p-2">
                          {isActive ? t("Empty compartment") : t("Not active for this schedule")}
                        </div>
                      ) : (
                        medsInSlot.map((medId) => {
                          const med = MEDICATIONS[medId];
                          if (!med) return null;
                          return (
                            <div
                              key={medId}
                              className={`flex items-center justify-between p-2 rounded-xl border ${med.bgColor} ${med.borderColor} shadow-xs text-xs md:text-sm font-medium`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span>{med.iconEmoji}</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100 truncate">
                                  {med.name}
                                </span>
                              </div>
                              {!evaluation && (
                                <button
                                  onClick={() => handleRemoveFromSlot(slot.id, medId)}
                                  aria-label={`Remove ${med.name} from ${slot.name}`}
                                  className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Quick Add action if a medicine is currently selected */}
                    {isActive && selectedMedId && !evaluation && (
                      <button
                        onClick={() => handleAddToSlot(slot.id, selectedMedId)}
                        className="w-full mt-2 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t("Put {name} here", { name: MEDICATIONS[selectedMedId]?.name ?? "" })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medicine Cabinet / Available Tray */}
          {scenario && !evaluation && (
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <span>🏪</span>
                  {t("Medicine Cabinet (Tap a medicine, then choose a slot above)")}
                </h3>
                {selectedMedId && (
                  <button
                    onClick={() => setSelectedMedId(null)}
                    className="text-xs text-amber-600 dark:text-amber-400 font-semibold underline"
                  >
                    {t("Cancel selection")}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {scenario.availableMedications.map((medId) => {
                  const med = MEDICATIONS[medId];
                  if (!med) return null;
                  const isSelected = selectedMedId === medId;

                  return (
                    <div
                      key={medId}
                      onClick={() => setSelectedMedId(isSelected ? null : medId)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "border-amber-500 bg-amber-50/80 dark:bg-amber-950/50 shadow-md ring-2 ring-amber-400/40"
                          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900 shadow-xs"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl flex-shrink-0">{med.iconEmoji}</span>
                        <div className="truncate flex-1">
                          <div className="font-bold text-gray-900 dark:text-gray-100 text-base truncate">
                            {med.name}
                          </div>
                          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                            {med.doseDisplay}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {t(med.purpose)}
                          </div>
                        </div>
                      </div>

                      {/* Compartment buttons directly on card for easy single-tap placement */}
                      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1.5">
                        {scenario.activeSlots.map((slotId) => {
                          const slot = PILL_SLOTS.find((s) => s.id === slotId);
                          const isPlacedHere = (placements[slotId] || []).includes(medId);

                          return (
                            <button
                              key={slotId}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isPlacedHere) {
                                  handleRemoveFromSlot(slotId, medId);
                                } else {
                                  handleAddToSlot(slotId, medId);
                                }
                              }}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                isPlacedHere
                                  ? "bg-emerald-600 text-white"
                                  : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              <span>{slot?.icon}</span>
                              <span>{t(slot?.name ?? "")}</span>
                              {isPlacedHere ? "✓" : "+"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feedback & Review Modal / Banner */}
          {evaluation && (
            <div
              className={`p-5 rounded-2xl border-2 shadow-md space-y-4 animate-in fade-in slide-in-from-bottom-2 ${
                evaluation.isPerfect
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100"
                  : "bg-amber-50 dark:bg-amber-950/40 border-amber-500 dark:border-amber-700 text-amber-900 dark:text-amber-100"
              }`}
            >
              <div className="flex items-center gap-3">
                {evaluation.isPerfect ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                )}
                <div>
                  <h4 className="text-xl font-bold">
                    {evaluation.isPerfect
                      ? t("Wonderful! All medicines correctly organized.")
                      : t("Round Complete: Review your schedule")}
                  </h4>
                  <div className="text-sm font-medium mt-0.5">
                    {t("You scored {score} / 100 on this schedule.", { score: evaluation.score })}
                  </div>
                </div>
              </div>

              {!evaluation.isPerfect && (
                <div className="space-y-2 text-sm bg-white/70 dark:bg-gray-900/60 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                  {evaluation.missingPairs.length > 0 && (
                    <div>
                      <span className="font-bold text-amber-800 dark:text-amber-300">
                        {t("Missing from schedule:")}{" "}
                      </span>
                      {evaluation.missingPairs
                        .map((p) => `${MEDICATIONS[p.medId]?.name ?? p.medId} (${p.slot})`)
                        .join(", ")}
                    </div>
                  )}
                  {evaluation.extraPairs.length > 0 && (
                    <div>
                      <span className="font-bold text-amber-800 dark:text-amber-300">
                        {t("Extra or misplaced:")}{" "}
                      </span>
                      {evaluation.extraPairs
                        .map((p) => `${MEDICATIONS[p.medId]?.name ?? p.medId} (${p.slot})`)
                        .join(", ")}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => handleContinue(handleFinish)}
                  className="px-6 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 font-bold text-base flex items-center gap-2 shadow-md transition-transform active:scale-95"
                >
                  <span>
                    {currentRoundIdx + 1 < scenarios.length
                      ? t("Next Schedule")
                      : t("Complete Session")}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Action Bar (Check Pill Box Button) */}
          {!evaluation && (
            <div className="flex justify-end pt-2">
              <button
                onClick={handleCheckPlacements}
                className="px-8 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-lg flex items-center gap-2 shadow-md transition-all active:scale-95"
              >
                <CheckCircle2 className="w-5 h-5" />
                {t("Check Pill Box")}
              </button>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}
