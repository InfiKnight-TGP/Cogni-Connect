"use client";
import { useState } from "react";
import GameShell from "../_shared/GameShell";
import ChoiceSession, { type ChoiceRound } from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import { readSupport } from "@/lib/interaction/support-store";
import { dayKey } from "@/lib/progress";
function Yesterday({ finish }: { finish: (score: number) => void }) {
  const [rounds] = useState<ChoiceRound[]>(() => {
    const date = new Date(); date.setDate(date.getDate() - 1);
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    const rows = readSupport(patient).records;
    return rows.filter(row => row.kind === "journal" && row.data.day === dayKey(date) && typeof row.data.summary === "string" && row.data.summary).slice(-5).map(row => ({
      prompt: "Which memory did you save yesterday?",
      answer: row.id,
      options: [{ id: row.id, label: String(row.data.summary) }, { id: "dont-remember", label: "I don't remember", synonyms: ["not sure", "I cannot remember"] }],
    }));
  });
  if (!rounds.length) return <p className="text-2xl">There are no saved memories from yesterday yet. Try another activity today.</p>;
  return <ChoiceSession game="yesterday-quiz" domain="Memory" count={rounds.length} finish={finish} makeRound={index => rounds[index]} />;
}
export default function YesterdayQuiz({ date, onFinish }: GameProps) { return <GameShell gameId="yesterday-quiz" title="Remember yesterday" instructions="Think about a memory you saved. It is okay if you do not remember." level={1} skill="personal memory" date={date} onFinish={onFinish}>{finish => <Yesterday finish={finish} />}</GameShell>; }
