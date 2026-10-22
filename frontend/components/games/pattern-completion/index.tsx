"use client";
import GameShell from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import patterns from "./patterns.json";

export default function PatternCompletion({ date, onFinish }: GameProps) {
  const items = patterns.items;
  const lookup = Object.fromEntries(items.map(item => [item.id, item]));
  return <GameShell gameId="pattern-completion" title="Finish the pattern" instructions="Look at the pictures. Choose what comes next." level={2} skill="reasoning" date={date} onFinish={onFinish}>{finish => <ChoiceSession game="pattern-completion" domain="Executive Function" count={8} finish={finish} makeRound={(index, knob) => {
    const round = patterns.rounds[index % patterns.rounds.length];
    const answer = lookup[round.answer];
    const distractorCount = Math.max(1, Math.min(4, knob));
    const pool = items.filter(item => item.id !== answer.id);
    const start = index % pool.length;
    const distractors = Array.from({ length: distractorCount }, (_, offset) => pool[(start + offset) % pool.length]);
    const options = [answer, ...distractors].map(item => ({ id: item.id, label: item.label, emoji: item.emoji }));
    const spokenSequence = round.sequence.map(id => lookup[id].label).join(", ");
    const offset = index % options.length;
    return { prompt: `${patterns.prompt} ${spokenSequence} ?`, options: [...options.slice(offset), ...options.slice(0, offset)], answer: answer.id };
  }} />}</GameShell>;
}
