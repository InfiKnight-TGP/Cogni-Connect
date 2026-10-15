"use client";

type SessionKind = "question" | "feedback" | "dictation";
type ActiveSession = { kind: SessionKind; controller: AbortController; done: Promise<void> };
let active: ActiveSession | null = null;

/** Serialize speech, let feedback finish before a question, and replace stale prompts. */
export function beginSpeechSession(kind: SessionKind = "question") {
  const previous = active;
  const waitForFeedback = kind === "question" && previous?.kind === "feedback";
  if (previous && !waitForFeedback) previous.controller.abort();
  const controller = new AbortController();
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const ready = waitForFeedback ? previous.done : Promise.resolve();
  const session: ActiveSession = { kind, controller, done };
  active = session;
  return {
    signal: controller.signal,
    ready,
    cancel: () => {
      controller.abort();
      finish();
      if (active === session) active = null;
    },
    finish: () => {
      finish();
      if (active === session) active = null;
    },
  };
}

export function cancelSpeechSession() {
  active?.controller.abort();
  active = null;
}
