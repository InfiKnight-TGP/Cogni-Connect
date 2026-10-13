"use client";

import GameShell from "../_shared/GameShell";
import { dateFromLocalKey, localDateKey } from "../_shared/date";
import type { GameProps } from "../_shared/types";
import NamePeople from "@/components/quiz/namePeople";

export default function NameRecognition({ date = localDateKey(), onFinish }: GameProps) {
  return (
    <GameShell
      gameId="name-recognition"
      title="Name Recall"
      instructions="Match a familiar face to the right name."
      level={1}
      skill="Recognition & Orientation"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish, sessionDate) => (
        <NamePeople
          date={dateFromLocalKey(sessionDate)}
          setProgress={() => {}}
          standalone
          onComplete={handleFinish}
        />
      )}
    </GameShell>
  );
}
