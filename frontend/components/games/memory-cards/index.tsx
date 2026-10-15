"use client";
import { useState } from "react";
import GameShell from "../_shared/GameShell";
import type { GameProps } from "../_shared/types";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import motifs from "./motifs.json";
function Cards({ finish }: { finish: (score: number) => void }) {
  const [knob] = useState(() => readSkill("Memory").knob);
  const [cards] = useState(() => [...motifs.items.slice(0, knob + 1), ...motifs.items.slice(0, knob + 1)].map((item, i) => ({ ...item, slot: i, random: Math.random() })).sort((a, b) => a.random - b.random));
  const [open, setOpen] = useState<number[]>([]), [matched, setMatched] = useState<number[]>([]), [attempts, setAttempts] = useState(0);
  const log = useAnswerLog("memory-cards", "Memory", `${attempts}:${open.length}`, knob);
  const choose = (id: string, input?: AnswerInput) => {
    const index = Number(id); if (open.length === 2 || open.includes(index) || matched.includes(index)) return;
    const next = [...open, index]; setOpen(next);
    if (next.length === 2) { const ok = cards[next[0]].id === cards[next[1]].id; log(ok, input); setAttempts(n => n + 1); if (ok) setMatched(value => [...value, ...next]); }
  };
  const complete = matched.length === cards.length;
  return <section className="space-y-5"><h2 className="text-3xl font-bold">Find the matching pictures</h2>
    <VoiceQuestion key={`${attempts}:${open.length}`} prompt="Choose a card number" disabled={open.length === 2 || complete} options={cards.map((_, index) => ({ id: String(index), label: String(index + 1), synonyms: [`card ${index + 1}`] })).filter((_, index) => !open.includes(index) && !matched.includes(index))} onAnswer={choose} />
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{cards.map((card, index) => <button key={card.slot} aria-label={`Card ${index + 1}${open.includes(index) || matched.includes(index) ? `: ${card.label}` : ""}`} className="min-h-32 rounded-xl border-2 p-4 text-3xl" disabled={open.length === 2 || matched.includes(index)} onClick={() => choose(String(index))}>{open.includes(index) || matched.includes(index) ? <><span className="block text-5xl">{card.emoji}</span><span className="text-xl">{card.label}</span></> : index + 1}</button>)}</div>
    {open.length === 2 && <button className="min-h-14 rounded-xl border-2 px-6 text-xl" onClick={() => { if (complete) finish(Math.round((cards.length / 2) / attempts * 100)); else setOpen([]); }}>{complete ? "Finish" : "Next pair"}</button>}
  </section>;
}
export default function MemoryCards({ date, onFinish }: GameProps) { return <GameShell gameId="memory-cards" title="Matching pictures" instructions="Turn over two cards and find pairs. Take your time." level={1} skill="working memory" date={date} onFinish={onFinish}>{finish => <Cards finish={finish} />}</GameShell>; }
