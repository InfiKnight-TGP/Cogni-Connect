export type MoleKnobConfig = {
  startLength: number;
  longestMax: number;
  onMs: number;
  offMs: number;
  maxReplays: number;
};

export const moleKnobConfigs: Record<1 | 2 | 3 | 4, MoleKnobConfig> = {
  1: { startLength: 2, longestMax: 5, onMs: 1000, offMs: 450, maxReplays: 2 },
  2: { startLength: 3, longestMax: 7, onMs: 800, offMs: 400, maxReplays: 1 },
  3: { startLength: 4, longestMax: 7, onMs: 700, offMs: 350, maxReplays: 1 },
  4: { startLength: 5, longestMax: 8, onMs: 650, offMs: 300, maxReplays: 1 },
};

export const moleLevel2Config = {
  label: "Mole Path",
  gridSize: 3,
  lengths: [3, 4, 5, 6, 7],
  longestMax: 7,
} as const;
