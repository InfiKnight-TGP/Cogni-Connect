import { API_URL } from "@/lib/api";

export interface SaveScoreParams {
  date: string;
  game_id: string;
  level: number;
  skill: string;
  score: number;
}

export async function saveScore(params: SaveScoreParams): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/performance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    return response.ok;
  } catch (error) {
    console.error("Error saving performance score:", error);
    return false;
  }
}
