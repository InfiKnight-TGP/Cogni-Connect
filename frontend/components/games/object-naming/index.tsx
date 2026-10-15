"use client";
import GameShell from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import content from "./objects.json";

export default function ObjectNaming({ date, onFinish }: GameProps) {
  return <GameShell gameId="object-naming" title="Name the picture" instructions="Say the name, or choose a word." level={1} skill="recognition" date={date} onFinish={onFinish}>{finish => <ChoiceSession game="object-naming" domain="Recognition & Orientation" finish={finish} makeRound={(index, knob) => {
    const target = content.items[index % content.items.length];
    const distractors = content.items.filter(item => item.id !== target.id).slice(0, Math.max(2, Math.min(4, knob)));
    const options = [target, ...distractors];
    const offset = index % options.length;
    return { prompt: content.prompt, image: target.emoji, options: [...options.slice(offset), ...options.slice(0, offset)].map(item => ({ id: item.id, label: item.label })), answer: target.id };
  }} />}</GameShell>;
}
