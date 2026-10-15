"use client";
import GameShell from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import patterns from "./patterns.json";

export default function PatternCompletion({ date, onFinish }: GameProps) {
  const items = patterns.items;
  const lookup = Object.fromEntries(items.map(item => [item.id, item]));
  return <GameShell gameId="pattern-completion" title="Finish the pattern" instructions="Look at the pictures. Choose what comes next." level={2} skill="reasoning" date={date} onFinish={onFinish}>{finish => <ChoiceSession game="pattern-completion" domain="Executive Function" count={8} finish={finish} makeRound={index => {
    const round = patterns.rounds[index % patterns.rounds.length];
    const answer = lookup[round.answer];
    const distractors = items.filter(item => item.id !== answer.id).slice(index % (items.length - 1), index % (items.length - 1) + 2);
    const options = [answer, ...distractors].map(item => ({ id: item.id, label: item.label, emoji: item.emoji }));
    return { prompt: `${patterns.prompt} ${round.sequence.map(id => lookup[id].emoji).join(" ")} ?`, options, answer: answer.id };
  }} />}</GameShell>;
}
