import { attentionRounds, objectSets, BoardItem, roundsForKnob } from "./data";

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function makeBoard(roundIndex: number, configIndex: number, randomized = true, knob = 2): BoardItem[] {
  const round = roundsForKnob(knob)[roundIndex] || attentionRounds[roundIndex];
  const config = objectSets[configIndex];
  const total = round.rows * round.columns;
  const targetCount = randomized
    ? round.minTargets + Math.floor(Math.random() * (round.maxTargets - round.minTargets + 1))
    : round.minTargets;
  const positions = Array.from({ length: total }, (_, index) => index);
  if (randomized) {
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [positions[index], positions[swap]] = [positions[swap], positions[index]];
    }
  }
  const targetPositions = new Set(positions.slice(0, targetCount));
  return Array.from({ length: total }, (_, id): BoardItem => {
    if (targetPositions.has(id))
      return { id, label: config.label, representation: config.representation, isTarget: true };
    const distractor =
      config.distractors[
        randomized ? Math.floor(Math.random() * config.distractors.length) : id % config.distractors.length
      ];
    return { id, label: distractor.label, representation: distractor.representation, isTarget: false };
  });
}

export function scoreSession(found: number, targets: number, wrong: number, tiles: number): number {
  const accuracy = targets ? found / targets : 0;
  const penalty = wrong / Math.max(1, tiles);
  return Math.max(0, Math.min(100, Math.round(accuracy * 100 - penalty * 25)));
}

export function pluralize(label: string): string {
  if (/(s|x|ch|sh)$/i.test(label)) return `${label}es`;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

export function newSession(knob = 2): BoardItem[][] {
  const configs = roundsForKnob(knob);
  const configOrder = shuffle(objectSets.map((_, index) => index)).slice(0, configs.length);
  return configOrder.map((configIndex, roundIndex) => makeBoard(roundIndex, configIndex, true, knob));
}

export function initialSession(knob = 2): BoardItem[][] {
  return roundsForKnob(knob).map((_, roundIndex) => makeBoard(roundIndex, roundIndex, false, knob));
}
