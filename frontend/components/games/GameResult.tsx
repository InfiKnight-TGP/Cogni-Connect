"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveGameScore } from "@/lib/game-scores";
import type { GameId } from "@/lib/games";

export default function GameResult({
  gameId,
  score,
  breakdown,
  onPlayAgain,
}: {
  gameId: GameId;
  score: number;
  breakdown: Record<string, number | string>;
  onPlayAgain: () => void;
}) {
  const saved = useRef(false);
  const [saveStatus, setSaveStatus] = useState<
    "saving" | "saved" | "unavailable"
  >("saving");

  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    saveGameScore(gameId, score, breakdown).then((success) => {
      setSaveStatus(success ? "saved" : "unavailable");
    });
  }, [breakdown, gameId, score]);

  return (
    <Card className="mx-auto max-w-xl border-primary/40 bg-primary/5 p-6 text-center sm:p-8">
      <div className="text-5xl" aria-hidden="true">
        {score >= 80 ? "🌟" : "👏"}
      </div>
      <h2 className="mt-4 text-2xl font-bold">Well done!</h2>
      <p className="mt-2 text-muted-foreground">
        Your final score is{" "}
        <span className="font-semibold text-foreground">{score}%</span>.
      </p>
      <p className="mt-2 text-sm text-muted-foreground" role="status">
        {saveStatus === "saving" && "Saving your score…"}
        {saveStatus === "saved" &&
          "Your score has been added to your dashboard history."}
        {saveStatus === "unavailable" &&
          "Your score is shown here. Start the memory backend to add it to dashboard history."}
      </p>
      <Button className="mt-6" onClick={onPlayAgain}>
        Play again
      </Button>
    </Card>
  );
}
