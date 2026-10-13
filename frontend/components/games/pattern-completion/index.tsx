"use client";
import GameShell from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import patterns from "./patterns.json";
export default function PatternCompletion({ date, onFinish }: GameProps) {
  return <GameShell gameId="pattern-completion" title="Finish the pattern" instructions="Look at the pictures. Choose what comes next." level={1} skill="spatial" date={date} onFinish={onFinish}>{finish => <ChoiceSession game="pattern-completion" domain="Recognition & Orientation" finish={finish} makeRound={(index, knob) => {
    const options = patterns.items.slice(index % 2, index % 2 + 3);
    const length = knob >= 3 ? 3 : 2, pattern = options.slice(0, length);
    return { prompt: `${patterns.prompt} ${[...pattern, ...pattern].map(item => item.emoji).join(" ")} ?`, options, answer: pattern[0].id };
  }} />}</GameShell>;
}
