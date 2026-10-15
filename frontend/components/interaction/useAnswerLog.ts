"use client";
import { useEffect, useRef, useState } from "react";
import { recordAnswer } from "@/lib/interaction/events";
import type { AnswerInput } from "./VoiceQuestion";
export function useAnswerLog(game: string, domain: string, promptKey: string, difficulty: number) {
  const [session] = useState(() => `${game}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const shownAt = useRef<number | null>(null);
  useEffect(() => { shownAt.current = performance.now(); }, [promptKey]);
  return (correct: boolean, input: AnswerInput = { method: "tap", responseMs: null }) => recordAnswer({
    session, game, domain, difficulty, correct, errorType: correct ? "none" : "answer", method: input.method,
    responseMs: input.method === "voice" ? input.responseMs : shownAt.current === null ? null : performance.now() - shownAt.current,
  });
}
