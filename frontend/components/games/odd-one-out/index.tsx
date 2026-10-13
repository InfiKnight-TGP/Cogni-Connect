"use client";

import React, { useState } from "react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { localDateKey } from "../_shared/date";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import questions from "./questions.json";

function Session({ finish }: { finish: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [knob, setKnob] = useState(() => readSkill("Attention").knob);
  const [notice, setNotice] = useState("");
  const [seed] = useState(() => Math.floor(Math.random() * 100));
  const question = questions.rounds[round % questions.rounds.length];
  const choices = [...question.similar.slice(0, knob + 1), question.odd];
  const offset = (seed + round) % choices.length;
  const options = [...choices.slice(offset), ...choices.slice(0, offset)];
  const logAnswer = useAnswerLog("odd-one-out", "Attention", String(round), knob);
  const choose = (id: string, input?: AnswerInput) => {
    if (picked !== null) return;
    const ok = id === question.odd.label;
    setPicked(id); if (ok) setCorrect(value => value + 1);
    if (!logAnswer(ok, input)) setNotice("Your answer could not be saved on this device.");
  };
  return <section className="space-y-5">
    <h2 className="text-3xl font-bold">{questions.prompt}</h2>
    <VoiceQuestion key={round} prompt={questions.prompt} options={options.map(o => ({ id: o.label, label: o.label, synonyms: o.synonyms }))} onAnswer={choose} disabled={picked !== null} />
    <div className="grid grid-cols-2 gap-4">{options.map(option => <BigTile key={option.label} emoji={option.emoji} label={option.label} disabled={picked !== null} state={picked === option.label ? "selected" : "default"} onClick={() => choose(option.label)} className="min-h-32 [&>span:last-child]:text-2xl" />)}</div>
    {picked !== null && <div><p className="text-xl">{picked === question.odd.label ? "Well done!" : `The different one is ${question.odd.label}. Let's try another.`}</p><Button className="mt-4 min-h-14 px-8 text-xl" onClick={() => { if (round === 7) finish(Math.round(correct / 8 * 100)); else { setRound(r => r + 1); setPicked(null); setKnob(readSkill("Attention").knob); } }}>{round === 7 ? "Finish" : "Next"}</Button></div>}
    <p role="status">{notice}</p>
  </section>;
}

export default function OddOneOut({
  level = 1,
  date = localDateKey(),
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="odd-one-out"
      title="Odd One Out"
      instructions="Identify the item that does not belong with the rest."
      level={level}
      skill="attention"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <Session finish={handleFinish} />}
    </GameShell>
  );
}
