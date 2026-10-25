"use client";

import { useEffect, useRef, useState } from "react";
import { isCaregiverUnlocked } from "@/lib/mode";
import type { AnswerInput } from "@/components/interaction/VoiceQuestion";
import { beginAdaptiveSession, recordAnswer } from "@/lib/interaction/events";

const KEY = "cogniconnect.answer-log.v1";
type AnswerEvent = { id: string; session: string; game: string; domain: string; difficulty: number; correct: boolean; method: AnswerInput["method"]; responseMs: number | null; timestamp: number };

export function useAnswerLog(game: string, domain: string, promptKey: string, difficulty: number, adaptive = false) {
  const [adaptiveSession] = useState(() => beginAdaptiveSession(game));
  const session = adaptiveSession.session;
  const shownAt = useRef<number | null>(null);
  useEffect(() => { shownAt.current = performance.now(); }, [promptKey]);
  return (correct: boolean, input: AnswerInput = { method: "tap", responseMs: null }) => {
    if (isCaregiverUnlocked()) return;
    const responseMs = input.method === "voice" ? input.responseMs : shownAt.current === null ? null : Math.max(0, performance.now() - shownAt.current);
    if (adaptive) recordAnswer({ session, game, domain, difficulty, correct, method: input.method, responseMs, errorType: correct ? "none" : "answer" });
    const event: AnswerEvent = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      session, game, domain, difficulty, correct, method: input.method,
      responseMs,
      timestamp: Date.now(),
    };
    try {
      const previous = JSON.parse(localStorage.getItem(KEY) || "[]");
      localStorage.setItem(KEY, JSON.stringify([...(Array.isArray(previous) ? previous : []), event].slice(-500)));
    } catch { /* Answer logging must not interrupt a game. */ }
  };
}
