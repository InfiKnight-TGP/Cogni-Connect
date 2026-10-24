import type { AssociationPair, ItemWithEmoji } from "./data";

export interface AssociationOption {
  id: string;
  word: string;
  emoji: string;
  synonyms: string[];
}

export interface AssociationRound {
  id: string;
  cue: { word: string; emoji: string };
  targetId: string;
  hint: string;
  options: AssociationOption[];
  showHintImmediately: boolean;
}

export interface KnobConfig {
  rounds: number;
  optionsCount: number;
  showHintImmediately: boolean;
  sameCategoryCount: number; // how many distractors must be same-category
}

export function getKnobConfig(knob: number): KnobConfig {
  const k = Math.max(1, Math.min(4, Math.round(knob)));
  switch (k) {
    case 1:
      return { rounds: 5, optionsCount: 2, showHintImmediately: true, sameCategoryCount: 0 };
    case 2:
      return { rounds: 6, optionsCount: 3, showHintImmediately: false, sameCategoryCount: 0 };
    case 3:
      return { rounds: 6, optionsCount: 4, showHintImmediately: false, sameCategoryCount: 1 };
    case 4:
    default:
      return { rounds: 8, optionsCount: 4, showHintImmediately: false, sameCategoryCount: 3 };
  }
}

/** Simple pseudo-random number generator for testable, reproducible shuffling */
export function createRng(seed?: number) {
  let s = seed !== undefined ? (seed % 2147483647) : Math.floor(Math.random() * 1000000) + 1;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function shuffleArray<T>(items: T[], rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Builds the round options for a given pair based on the knob settings.
 */
export function buildRoundOptions(
  pair: AssociationPair,
  config: KnobConfig,
  rng = Math.random
): AssociationOption[] {
  const targetOption: AssociationOption = {
    id: `target-${pair.id}`,
    word: pair.target.word,
    emoji: pair.target.emoji,
    synonyms: pair.target.synonyms ?? [],
  };

  const sameCat = pair.distractors.filter((d) => d.sameCategory);
  const otherCat = pair.distractors.filter((d) => !d.sameCategory);

  const neededDistractors = config.optionsCount - 1;
  const pickedDistractors: ItemWithEmoji[] = [];

  if (config.sameCategoryCount >= neededDistractors) {
    // Knob 4: all distractors from same category if available
    const shuffledSame = shuffleArray(sameCat, rng);
    pickedDistractors.push(...shuffledSame.slice(0, neededDistractors));
    if (pickedDistractors.length < neededDistractors) {
      const remainingNeeded = neededDistractors - pickedDistractors.length;
      const shuffledOther = shuffleArray(otherCat, rng);
      pickedDistractors.push(...shuffledOther.slice(0, remainingNeeded));
    }
  } else if (config.sameCategoryCount > 0) {
    // Knob 3: at least 1 same-category distractor
    const shuffledSame = shuffleArray(sameCat, rng);
    if (shuffledSame.length > 0) {
      pickedDistractors.push(shuffledSame[0]);
    }
    const remainingNeeded = neededDistractors - pickedDistractors.length;
    const remainingPool = shuffleArray([...shuffledSame.slice(1), ...otherCat], rng);
    pickedDistractors.push(...remainingPool.slice(0, remainingNeeded));
  } else {
    // Knob 1 & 2: random mix of distractors
    const shuffledAll = shuffleArray(pair.distractors, rng);
    pickedDistractors.push(...shuffledAll.slice(0, neededDistractors));
  }

  const distractorOptions: AssociationOption[] = pickedDistractors.map((d, index) => ({
    id: `distractor-${pair.id}-${index}`,
    word: d.word,
    emoji: d.emoji,
    synonyms: d.synonyms ?? [],
  }));

  return shuffleArray([targetOption, ...distractorOptions], rng);
}

/**
 * Generates a full game session without repeating any pairs.
 */
export function generateSession(
  allPairs: AssociationPair[],
  knob: number,
  seed?: number
): AssociationRound[] {
  const rng = createRng(seed);
  const config = getKnobConfig(knob);
  const totalRounds = Math.min(config.rounds, allPairs.length);
  const shuffledPairs = shuffleArray(allPairs, rng).slice(0, totalRounds);

  return shuffledPairs.map((pair) => ({
    id: pair.id,
    cue: pair.cue,
    targetId: `target-${pair.id}`,
    hint: pair.hint,
    options: buildRoundOptions(pair, config, rng),
    showHintImmediately: config.showHintImmediately,
  }));
}

/**
 * Scoring (0-100):
 * - correct first try = 1 point
 * - correct after the gentle hint = 0.5
 * - revealed after 2 wrong taps = 0
 * - score = round(points / rounds * 100)
 */
export function calculateScore(roundPoints: number[], totalRounds?: number): number {
  const count = totalRounds && totalRounds > 0 ? totalRounds : roundPoints.length;
  if (!count) return 0;
  const totalPoints = roundPoints.reduce((acc, pt) => acc + pt, 0);
  return Math.max(0, Math.min(100, Math.round((totalPoints / count) * 100)));
}
