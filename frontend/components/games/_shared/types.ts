// Reconstructed: the original was type-only, so it was not in the recovered build.
export type GameLevel = 1 | 2 | 3;

export interface GameProps {
  level?: GameLevel;
  date?: string; // local YYYY-MM-DD
  onFinish?: (score: number) => void;
}
