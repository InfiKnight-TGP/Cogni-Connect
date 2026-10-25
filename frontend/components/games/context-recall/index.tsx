"use client";

import GameShell from "../_shared/GameShell";
import { dateFromLocalKey, localDateKey } from "../_shared/date";
import type { GameProps } from "../_shared/types";
import ContextQuestions from "@/components/quiz/contextQuestions";
import { useState } from "react";
import { readSkill } from "@/lib/interaction/events";

export default function ContextRecall({ date = localDateKey(), onFinish }: GameProps) {
  const [knob] = useState(() => readSkill("context-recall").knob);
  return (
    <GameShell
      gameId="context-recall"
      title="Relive Memories"
      instructions="Recall details of the day’s videos in your own words."
      level={1}
      skill="personal memory"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish, sessionDate) => (
        <ContextQuestions
          date={dateFromLocalKey(sessionDate)}
          setProgress={() => {}}
          standalone
          onComplete={handleFinish}
          difficulty={knob}
        />
      )}
    </GameShell>
  );
}
