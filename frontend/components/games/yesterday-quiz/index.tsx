"use client";
import { useState } from "react";
import GameShell from "../_shared/GameShell";
import ChoiceSession, { type ChoiceRound } from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import { readSupport } from "@/lib/interaction/support-store";
import { dayKey } from "@/lib/progress";
import { buildYesterdayChoices, type YesterdayMemory } from "@/lib/interaction/yesterday-quiz";
function Yesterday({ finish }: { finish: (score: number) => void }) {
  const [memories] = useState<YesterdayMemory[]>(() => {
    const date = new Date(); date.setDate(date.getDate() - 1);
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    const rows = readSupport(patient).records;
    return rows
      .filter(row => row.kind === "journal" && row.data.day === dayKey(date) && typeof row.data.summary === "string" && row.data.summary)
      .slice(-5)
      .map(row => ({ id: row.id, label: String(row.data.summary) }));
  });
  if (!memories.length) return <p className="text-2xl">There are no saved memories from yesterday yet. Try another activity today.</p>;
  return <ChoiceSession
    game="yesterday-quiz"
    domain="Memory"
    count={memories.length}
    finish={finish}
    makeRound={(index, knob) => ({
      prompt: "Which memory did you save yesterday?",
      answer: memories[index].id,
      options: buildYesterdayChoices(memories, memories[index].id, knob, index),
    })}
  />;
}
export default function YesterdayQuiz({ date, onFinish }: GameProps) { return <GameShell gameId="yesterday-quiz" title="Remember yesterday" instructions="Think about a memory you saved. It is okay if you do not remember." level={1} skill="personal memory" date={date} onFinish={onFinish}>{finish => <Yesterday finish={finish} />}</GameShell>; }
