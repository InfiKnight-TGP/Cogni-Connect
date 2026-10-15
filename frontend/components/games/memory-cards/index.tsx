"use client";

import { useState } from "react";
import GameShell from "../_shared/GameShell";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import type { GameProps } from "../_shared/types";
import { VoiceQuestion, type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import motifs from "./motifs.json";

function Cards({ finish }: { finish: (score: number) => void }) {
  const [knob] = useState(() => readSkill("Memory").knob);
  const [cards] = useState(() => {
    const pairs = Math.min(motifs.items.length, knob + 1);
    return [...motifs.items.slice(0, pairs), ...motifs.items.slice(0, pairs)]
      .map((item, slot) => ({ ...item, slot, order: Math.random() }))
      .sort((a, b) => a.order - b.order);
  });
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const { t } = useTranslate();
  const log = useAnswerLog("memory-cards", "Memory", `${turns}:${open.length}`, knob, true);
  const choose = (index: number, input?: AnswerInput) => {
    if (open.length === 2 || open.includes(index) || matched.includes(index)) return;
    const next = [...open, index];
    setOpen(next);
    if (next.length === 2) {
      const correct = cards[next[0]].id === cards[next[1]].id;
      log(correct, input);
      setTurns(value => value + 1);
      if (correct) setMatched(value => [...value, ...next]);
    }
  };
  const complete = matched.length === cards.length;

  return <section className="space-y-5">
    <h2 className="text-3xl font-bold">{t("Find the matching pictures")}</h2>
    <VoiceQuestion question="Choose a card number" options={cards.map((_, index) => ({ id: String(index), label: String(index + 1), synonyms: [`card ${index + 1}`] })).filter((_, index) => !open.includes(index) && !matched.includes(index))} onMatched={option => choose(Number(option.id), { method: "voice", responseMs: null })} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map((card, index) => {
      const shown = open.includes(index) || matched.includes(index);
      return <BigTile key={card.slot} label={shown ? t(card.label) : t("Card {number}", { number: index + 1 })} emoji={shown ? card.emoji : "❔"} disabled={open.length === 2 || matched.includes(index)} state={matched.includes(index) ? "correct" : "default"} onClick={() => choose(index)} className="min-h-28 [&>span:last-child]:text-base" />;
    })}</div>
    {open.length === 2 && <Button className="min-h-14 px-6 text-xl" onClick={() => complete ? finish(Math.round(matched.length / cards.length * 100)) : setOpen([])}>{complete ? t("Finish") : t("Next pair")}</Button>}
  </section>;
}

export default function MemoryCards({ date, onFinish }: GameProps) {
  return <GameShell gameId="memory-cards" title="Matching pictures" instructions="Turn over two cards and find pairs. Take your time." level={2} skill="working memory" date={date} onFinish={onFinish}>{finish => <Cards finish={finish} />}</GameShell>;
}
