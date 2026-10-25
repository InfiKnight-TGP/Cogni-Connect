"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceQuestion, type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { BigTile } from "./BigTile";
import ReadAloud from "@/components/interaction/ReadAloud";

export type ChoiceRound = {
  prompt: string;
  image?: string;
  options: { id: string; label: string; emoji?: string; synonyms?: string[] }[];
  answer: string;
};

export default function ChoiceSession({ game, domain, makeRound, finish, count = 6 }: {
  game: string;
  domain: string;
  makeRound: (index: number, knob: number) => ChoiceRound;
  finish: (score: number) => void;
  count?: number;
}) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [knob] = useState(() => readSkill(game).knob);
  const { t } = useTranslate();
  const round = makeRound(index, knob);
  const log = useAnswerLog(game, domain, String(index), knob, true);

  const choose = (id: string, input?: AnswerInput) => {
    if (picked !== null) return;
    const isCorrect = id === round.answer;
    setPicked(id);
    setCorrect(value => value + Number(isCorrect));
    log(isCorrect, input);
  };
  const next = () => {
    if (index + 1 === count) finish(Math.round(correct / count * 100));
    else {
      setIndex(value => value + 1);
      setPicked(null);
    }
  };

  return <section className="space-y-5">
    <h2 className="text-3xl font-bold">{t(round.prompt)}</h2>
    {round.image && <div role="img" aria-label={t("Picture to name")} className="text-center text-8xl">{round.image}</div>}
    <VoiceQuestion question={t(round.prompt)} options={round.options.map(option => ({ ...option, label: t(option.label) }))} onMatched={(option, input) => choose(option.id, input)} />
    <div className="grid grid-cols-2 gap-4">{round.options.map(option => <BigTile key={option.id} label={t(option.label)} emoji={option.emoji} state={option.id === picked ? "selected" : "default"} disabled={picked !== null} onClick={() => choose(option.id)} className="min-h-28 [&>span:last-child]:text-lg" />)}</div>
    {picked !== null && <>
      <p className="text-xl" role="status">{picked === round.answer ? t("Well done!") : t("The answer is {answer}. Let's keep going.", { answer: t(round.options.find(option => option.id === round.answer)?.label ?? "") })}</p>
      <ReadAloud kind="feedback" text={picked === round.answer ? t("Well done!") : t("The answer is {answer}. Let's keep going.", { answer: t(round.options.find(option => option.id === round.answer)?.label ?? "") })} />
      <Button className="min-h-14 px-6 text-xl" onClick={next}>{index + 1 === count ? t("Finish") : t("Next")}</Button>
    </>}
  </section>;
}
