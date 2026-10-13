"use client";
import { useState } from "react";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import { BigTile } from "./BigTile";
export type ChoiceRound = { prompt: string; image?: string; options: { id: string; label: string; emoji?: string; synonyms?: string[] }[]; answer: string };
export default function ChoiceSession({ game, domain, makeRound, finish, count = 6 }: {
  game: string; domain: string; makeRound: (index: number, knob: number) => ChoiceRound; finish: (score: number) => void; count?: number;
}) {
  const [index, setIndex] = useState(0), [correct, setCorrect] = useState(0), [picked, setPicked] = useState<string | null>(null);
  const [knob, setKnob] = useState(() => readSkill(domain).knob);
  const round = makeRound(index, knob);
  const log = useAnswerLog(game, domain, String(index), knob);
  const choose = (id: string, input?: AnswerInput) => { if (picked !== null) return; const ok = id === round.answer; setPicked(id); setCorrect(value => value + Number(ok)); log(ok, input); };
  return <section className="space-y-5"><h2 className="text-3xl font-bold">{round.prompt}</h2>{round.image && <div role="img" aria-label="Picture to name" className="text-center text-8xl">{round.image}</div>}
    <VoiceQuestion key={index} prompt={round.prompt} options={round.options} onAnswer={choose} disabled={picked !== null} />
    <div className="grid grid-cols-2 gap-4">{round.options.map(option => <BigTile key={option.id} label={option.label} emoji={option.emoji} state={option.id === picked ? "selected" : "default"} disabled={picked !== null} onClick={() => choose(option.id)} className="[&>span:last-child]:text-xl" />)}</div>
    {picked !== null && <><p className="text-xl">{picked === round.answer ? "Well done!" : `The answer is ${round.options.find(option => option.id === round.answer)?.label}. Let's keep going.`}</p><button className="min-h-14 rounded-xl border-2 px-6 text-xl" onClick={() => { if (index + 1 === count) finish(Math.round(correct / count * 100)); else { setIndex(i => i + 1); setPicked(null); setKnob(readSkill(domain).knob); } }}>{index + 1 === count ? "Finish" : "Next"}</button></>}
  </section>;
}
