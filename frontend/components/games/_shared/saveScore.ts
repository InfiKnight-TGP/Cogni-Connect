import { apiFetch, API_URL } from "@/lib/api";
import { isCaregiverUnlocked } from "@/lib/mode";

export interface SaveScoreParams {
  date: string;
  game_id: string;
  level: number;
  skill: string;
  score: number;
}

export async function saveScore(params: SaveScoreParams): Promise<boolean> {
  if (isCaregiverUnlocked()) return true;
  try {
    const response = await apiFetch(`${API_URL}/performance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...params, source: "patient" }),
    });
    return response.ok;
  } catch (error) {
    console.error("Error saving performance score:", error);
    return false;
  }
}
