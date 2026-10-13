"use client";

import GameShell from "../_shared/GameShell";
import { localDateKey } from "../_shared/date";
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
      showPreviewDatePicker={false}
      onFinish={onFinish}
    >
      {(handleFinish) => (
        <NamePeople
          setProgress={() => {}}
          standalone
          onComplete={handleFinish}
        />
      )}
    </GameShell>
  );
}
