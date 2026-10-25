"use client";
import { useState } from "react";
import GameShell from "../_shared/GameShell";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { VoiceQuestion, type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import type { GameProps } from "../_shared/types";
import questions from "./questions.json";
import ReadAloud from "@/components/interaction/ReadAloud";

function Session({ finish }: { finish: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [knob] = useState(() => readSkill("odd-one-out").knob);
  const { t } = useTranslate();
  const question = questions.rounds[round];
  const similar = question.similar.slice(0, Math.min(question.similar.length, knob + 1));
  const choices = [...similar, question.odd];
  const offset = round % choices.length;
  const options = [...choices.slice(offset), ...choices.slice(0, offset)];
  const log = useAnswerLog("odd-one-out", "Attention", String(round), knob, true);
  const choose = (id: string, input?: AnswerInput) => {
    if (picked !== null) return;
    const isCorrect = id === question.odd.label;
    setPicked(id);
    setCorrect(value => value + Number(isCorrect));
    log(isCorrect, input);
  };
  const next = () => {
    if (round === questions.rounds.length - 1) finish(Math.round(correct / questions.rounds.length * 100));
    else { setRound(value => value + 1); setPicked(null); }
  };
  return <section className="space-y-5">
    <h2 className="text-3xl font-bold">{t(questions.prompt)}</h2>
    <VoiceQuestion question={questions.prompt} options={options.map(option => ({ id: option.label, label: option.label }))} onMatched={(option, input) => choose(option.id, input)} disabled={picked !== null} />
    <div className="grid grid-cols-2 gap-4">{options.map(option => <BigTile key={option.label} emoji={option.emoji} label={t(option.label)} disabled={picked !== null} state={picked === option.label ? "selected" : "default"} onClick={() => choose(option.label)} className="min-h-28 [&>span:last-child]:text-xl" />)}</div>
    {picked !== null && <div className="space-y-3"><p className="text-xl" role="status">{picked === question.odd.label ? t("Well done!") : t("The different one is {answer}. Let's try another.", { answer: t(question.odd.label) })}</p><ReadAloud kind="feedback" text={picked === question.odd.label ? t("Well done!") : t("The different one is {answer}. Let's try another.", { answer: t(question.odd.label) })} /><Button className="min-h-14 px-8 text-xl" onClick={next}>{round === questions.rounds.length - 1 ? t("Finish") : t("Next")}</Button></div>}
  </section>;
}

export default function OddOneOut({ date, onFinish }: GameProps) {
  return <GameShell gameId="odd-one-out" title="Odd One Out" instructions="Identify the item that does not belong with the rest." level={1} skill="attention" date={date} onFinish={onFinish}>{finish => <Session finish={finish} />}</GameShell>;
}
