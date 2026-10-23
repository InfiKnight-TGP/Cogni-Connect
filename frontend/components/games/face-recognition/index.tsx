"use client";

import GameShell from "../_shared/GameShell";
import { useState } from "react";
import { dateFromLocalKey, localDateKey } from "../_shared/date";
import type { GameProps } from "../_shared/types";
import PersonSelect from "@/components/quiz/personSelect";
import { readSkill } from "@/lib/interaction/events";

export default function FaceRecognition({ date = localDateKey(), onFinish }: GameProps) {
  const [knob] = useState(() => readSkill("face-recognition").knob);
  return (
    <GameShell
      gameId="face-recognition"
      title="Face Recognition"
      instructions="Recognise familiar people from the day’s video."
      level={1}
      skill="Recognition & Orientation"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish, sessionDate) => (
        <PersonSelect
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
