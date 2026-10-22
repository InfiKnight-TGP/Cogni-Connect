"use client";

import { useRef, useState } from "react";
import GameShell from "../_shared/GameShell";
import { BigTile } from "../_shared/BigTile";
import type { GameProps } from "../_shared/types";
import ReadAloud from "@/components/interaction/ReadAloud";
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
  const attemptsByPair = useRef<Record<string, number>>({});
  const { t } = useTranslate();
  const log = useAnswerLog("memory-cards", "Memory", `${turns}:${open.length}`, knob, true);
  const choose = (index: number) => {
    if (open.length === 2 || open.includes(index) || matched.includes(index)) return;
    const next = [...open, index];
    setOpen(next);
    if (next.length === 2) {
      const correct = cards[next[0]].id === cards[next[1]].id;
      const pairId = cards[next[0]].id;
      const pairTurns = (attemptsByPair.current[pairId] ?? 0) + 1;
      attemptsByPair.current[pairId] = pairTurns;
      const nextTurns = turns + 1;
      setTurns(nextTurns);
      if (correct) {
        log(pairTurns <= 2);
        const nextMatched = [...matched, ...next];
        setMatched(nextMatched);
        setOpen([]);
        if (nextMatched.length === cards.length) finish(Math.max(40, Math.round((nextMatched.length / 2) / nextTurns * 100)));
      } else {
        window.setTimeout(() => setOpen([]), 1200);
      }
    }
  };
  return <section className="space-y-5">
    <h2 className="text-3xl font-bold">{t("Find the matching pictures")}</h2>
    <ReadAloud text="Choose a card number. Tap your answer." options={cards.map((_, index) => String(index + 1)).filter((_, index) => !open.includes(index) && !matched.includes(index))} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map((card, index) => {
      const shown = open.includes(index) || matched.includes(index);
      return <BigTile key={card.slot} label={shown ? t(card.label) : t("Card {number}", { number: index + 1 })} emoji={shown ? card.emoji : "❔"} disabled={open.length === 2 || matched.includes(index)} state={matched.includes(index) ? "correct" : "default"} onClick={() => choose(index)} className="min-h-28 [&>span:last-child]:text-base" />;
    })}</div>
    {open.length === 2 && <ReadAloud kind="feedback" text={cards[open[0]].id === cards[open[1]].id ? "Well done! You found a matching pair." : "Try another pair."} />}
  </section>;
}

export default function MemoryCards({ date, onFinish }: GameProps) {
  return <GameShell gameId="memory-cards" title="Matching pictures" instructions="Turn over two cards and find pairs. Take your time." level={2} skill="working memory" date={date} onFinish={onFinish}>{finish => <Cards finish={finish} />}</GameShell>;
}
