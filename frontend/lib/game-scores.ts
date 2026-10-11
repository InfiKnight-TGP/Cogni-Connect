import type { GameId } from "./games";
import { getOrStartSession } from "./sessions";

export type ActivityMetrics = {
  accuracy?: number;
  correct_answers?: number;
  total_questions?: number;
  incorrect_answers?: number;
  attempts?: number;
  missed_targets?: number;
  false_selections?: number;
  reaction_time_ms?: number;
  completion_time_seconds?: number;
  question_scores?: number[];
  [key: string]: number | string | number[] | undefined;
};

export type ActivityResult = {
  score: number;
  metrics: ActivityMetrics;
};

export type PerformanceSubmission = {
  game_id: GameId;
  score: number;
  metrics?: ActivityMetrics;
  breakdown?: Record<string, number | string>;
  started_at?: string;
  completed_at?: string;
  difficulty_level?: string | number;
  task_mode?: string;
  record_id?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export async function savePerformanceResult(submission: PerformanceSubmission): Promise<boolean> {
  try {
    const session = getOrStartSession();
    const completedAt = submission.completed_at || new Date().toISOString();
    const response = await fetch(`${API_BASE}/performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...submission,
        completed: true,
        record_id: submission.record_id || crypto.randomUUID(),
        session_id: session.session_id,
        session_started_at: session.started_at,
        started_at: submission.started_at || session.started_at,
        completed_at: completedAt,
        date: completedAt,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Kept as a small adapter for existing game-result components. */
export function saveGameScore(
  gameId: GameId,
  score: number,
  breakdown: Record<string, number | string>,
  options: { startedAt?: string; difficultyLevel?: string | number; recordId?: string } = {},
) {
  return savePerformanceResult({
    game_id: gameId,
    score,
    breakdown,
    started_at: options.startedAt,
    difficulty_level: options.difficultyLevel,
    record_id: options.recordId,
  });
}
