import type { GameId } from "./games";

export async function saveGameScore(
  gameId: GameId,
  score: number,
  breakdown: Record<string, number | string>,
): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:5000/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score,
        date: new Date().toISOString(),
        breakdown: { gameId, ...breakdown },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
