"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { ERRAND_SETS, Task, TASKS } from "./data";
import { ErrandSet } from "./rules";
import StepRound, { StepCard } from "./StepRound";
import ErrandRound from "./ErrandRound";
import { shuffle } from "./useSlots";

import { mediaUrl, apiFetch, API_URL as API } from "@/lib/api";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";

type Round =
  | { kind: "steps"; title: string; prompt: string; cards: StepCard[] }
  | { kind: "errands"; set: ErrandSet };

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(API + path);
    return res.ok ? await res.json() : null;
  } catch {
    return null; // backend down: fall back to built-in content
  }
}

const taskRound = (task: Task): Round => ({
  kind: "steps",
  title: task.title,
  prompt: "Tap the steps in the order you do them.",
  cards: task.steps.map((step) => ({ kind: "step", ...step })),
});

/** Round 5: the user's own photos, else the caregiver's routine, else one more errand round. */
async function personalRound(date: string, spareErrands: ErrandSet): Promise<Round> {
  const [day, routine] = await Promise.all([
    fetchJson<{ frames?: { url: string; timestamp: number }[] }>(`/day-frames?date=${date}`),
    fetchJson<{ steps?: string[] }>("/routine"),
  ]);
  const frames = day?.frames ?? [];
  if (frames.length >= 3) {
    return {
      kind: "steps",
      title: "Put your day back in order",
      prompt: "Tap the photos in the order they happened.",
      cards: frames.map((f) => ({ kind: "photo", url: mediaUrl(encodeURI(f.url)), timestamp: f.timestamp })),
    };
  }
  const steps = routine?.steps ?? [];
  if (steps.length >= 3) {
    return {
      kind: "steps",
      title: "Your daily routine",
      prompt: "Tap the steps in the order you do them.",
      cards: steps.slice(0, 5).map((label) => ({ kind: "step", emoji: "📝", label })),
    };
  }
  return { kind: "errands", set: spareErrands };
}

async function buildSession(date: string, knob: number): Promise<Round[]> {
  const tasks = shuffle(TASKS);
  const sets = shuffle(ERRAND_SETS);
  const rounds: Round[] = [
    taskRound(tasks[0]),
    taskRound(tasks[1]),
    { kind: "errands", set: sets[0] },
    { kind: "errands", set: sets[1] },
    await personalRound(date, sets[2]),
  ];
  return knob === 1 ? rounds.slice(0, 4) : rounds;
}

function Session({ date, onDone }: { date: string; onDone: (score: number) => void }) {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0); // each round is worth up to 20
  const [knob] = useState(() => readSkill("plan-the-day").knob);
  const log = useAnswerLog("plan-the-day", "Executive Function", String(index), knob, true);

  useEffect(() => {
    let cancelled = false;
    buildSession(date, knob).then((built) => {
      if (!cancelled) setRounds(built);
    });
    return () => {
      cancelled = true;
    };
  }, [date, knob]);

  if (!rounds) {
    return <p className="py-12 text-center text-xl">Getting your rounds ready…</p>;
  }

  const finishRound = (points: number) => {
    log(points >= 10, { method: "tap", responseMs: null });
    if (index === rounds.length - 1) {
      onDone(total + points);
    } else {
      setTotal(total + points);
      setIndex(index + 1);
    }
  };

  const round = rounds[index];
  return (
    <div className="space-y-6">
      <p className="text-lg font-medium text-muted-foreground">
        Round {index + 1} of {rounds.length}
      </p>
      {round.kind === "steps" ? (
        <StepRound key={index} title={round.title} prompt={round.prompt} cards={round.cards} onDone={finishRound} />
      ) : (
        <ErrandRound key={index} set={round.set} onDone={finishRound} />
      )}
    </div>
  );
}

export default function PlanTheDay({
  level = 1,
  date = format(new Date(), "yyyy-MM-dd"),
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="plan-the-day"
      title="Plan the Day"
      instructions="Put things in the order they happen. No rush."
      level={level}
      skill="sequencing"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <Session date={date} onDone={handleFinish} />}
    </GameShell>
  );
}
