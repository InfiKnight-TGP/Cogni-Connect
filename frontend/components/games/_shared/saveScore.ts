import { API_URL } from "@/lib/api";
import { isCaregiverUnlocked } from "@/lib/mode";
import { putSupport, syncSupport } from "@/lib/interaction/support-store";

export interface SaveScoreParams {
  date: string;
  game_id: string;
  level: number;
  skill: string;
  score: number;
}

export async function saveScore(params: SaveScoreParams): Promise<boolean> {
  if (isCaregiverUnlocked() || localStorage.getItem("cogni:role") === "caregiver") return true;
  try {
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    // Authenticated profiles use isolated, durable records instead of the legacy global score file.
    putSupport(patient, "score", { ...params, source: "patient" });
    if (patient !== "local-patient") { void syncSupport(patient).catch(() => {}); return true; }
    const response = await fetch(`${API_URL}/performance`, {
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
