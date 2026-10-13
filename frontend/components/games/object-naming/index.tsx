"use client";
import GameShell from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import content from "./objects.json";
export default function ObjectNaming({ date, onFinish }: GameProps) {
  return <GameShell gameId="object-naming" title="Name the picture" instructions="Say the name, or choose a word." level={1} skill="spatial" date={date} onFinish={onFinish}>{finish => <ChoiceSession game="object-naming" domain="Recognition & Orientation" finish={finish} makeRound={(index, knob) => {
    const target = content.items[index % content.items.length];
    const options = [target, ...content.items.filter(item => item.id !== target.id).slice(0, knob + 1)];
    const rotate = index % options.length;
    return { prompt: content.prompt, image: target.emoji, options: [...options.slice(rotate), ...options.slice(0, rotate)].map(item => ({ ...item, emoji: undefined })), answer: target.id };
  }} />}</GameShell>;
}
