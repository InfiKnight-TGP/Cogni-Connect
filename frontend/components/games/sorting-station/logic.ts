// Sorting Station — pure game logic (no React).

import { BinIndex, RULE_PAIRS, RulePair, SortItem, SortRule } from "./data";

export const ROUNDS = 2;
export const ITEMS_PER_RULE = 6;
export const ITEMS_PER_ROUND = ITEMS_PER_RULE * 2; // 12
export const TOTAL_ITEMS = ROUNDS * ITEMS_PER_ROUND; // 24
/** Wrong answers on this many items right after each rule change count as switch errors. */
export const SWITCH_WINDOW = 2;

export type RuleKey = "a" | "b";

export interface Trial {
  item: SortItem;
  rule: RuleKey;
}

export interface Round {
  pair: RulePair;
  trials: Trial[];
}

export interface SortingKnobConfig {
  itemsPerRule: number;
  ruleSequence: RuleKey[];
  itemsPerRound: number;
  totalItems: number;
}

export function getSortingKnobConfig(knob: number): SortingKnobConfig {
  const k = knob >= 1 && knob <= 4 ? knob : 2;
  const itemsPerRule = k === 1 ? 4 : k === 2 ? 6 : k === 3 ? 7 : 5;
  const ruleSequence: RuleKey[] = k === 4 ? ["a", "b", "a"] : ["a", "b"];
  const itemsPerRound = itemsPerRule * ruleSequence.length;
  return {
    itemsPerRule,
    ruleSequence,
    itemsPerRound,
    totalItems: ROUNDS * itemsPerRound,
  };
}

type Rng = () => number;

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function ruleOf(pair: RulePair, key: RuleKey): SortRule {
  return key === "a" ? pair.ruleA : pair.ruleB;
}

export function correctBin(trial: Trial): BinIndex {
  return trial.rule === "a" ? trial.item.a : trial.item.b;
}

/**
 * Pick `n` items from `pool`, aiming for an even split between the two bins
 * under `rule` so that always tapping one bin doesn't pay off. Falls back to
 * any remaining items if a bin runs short.
 */
function pickBalanced(pool: SortItem[], rule: RuleKey, n: number, rng: Rng): SortItem[] {
  const bin0 = shuffle(pool.filter((it) => it[rule] === 0), rng);
  const bin1 = shuffle(pool.filter((it) => it[rule] === 1), rng);
  const half = Math.floor(n / 2);
  const chosen = [...bin0.slice(0, half), ...bin1.slice(0, n - half)];
  if (chosen.length < n) {
    const rest = shuffle(
      pool.filter((it) => !chosen.includes(it)),
      rng
    );
    chosen.push(...rest.slice(0, n - chosen.length));
  }
  return shuffle(chosen, rng);
}

function isBalanced(items: SortItem[], rule: RuleKey): boolean {
  const zeros = items.filter((it) => it[rule] === 0).length;
  return zeros === Math.floor(items.length / 2);
}

function drawRound(
  pair: RulePair,
  rng: Rng,
  knob: number = 2
): { blocks: SortItem[][]; sequence: RuleKey[] } {
  const { itemsPerRule, ruleSequence } = getSortingKnobConfig(knob);
  let remaining = pair.items.slice();
  const blocks: SortItem[][] = [];

  for (let bIdx = 0; bIdx < ruleSequence.length; bIdx++) {
    const rule = ruleSequence[bIdx];
    const isPostSwitch = bIdx > 0;
    let block: SortItem[] = [];

    if (isPostSwitch && knob === 1) {
      const congruent = remaining.filter((it) => it.a === it.b);
      const switchItems = shuffle(congruent, rng).slice(0, Math.min(SWITCH_WINDOW, itemsPerRule));
      const restPool = remaining.filter((it) => !switchItems.includes(it));
      const restItems = pickBalanced(restPool, rule, itemsPerRule - switchItems.length, rng);
      block = [...switchItems, ...restItems];
    } else if (isPostSwitch && knob >= 3) {
      const incongruent = remaining.filter((it) => it.a !== it.b);
      const targetIncongruent = Math.max(SWITCH_WINDOW, Math.ceil(itemsPerRule / 2));
      const switchItems = shuffle(incongruent, rng).slice(0, Math.min(targetIncongruent, itemsPerRule));
      const restPool = remaining.filter((it) => !switchItems.includes(it));
      const restItems = pickBalanced(restPool, rule, itemsPerRule - switchItems.length, rng);
      block = [
        ...switchItems.slice(0, SWITCH_WINDOW),
        ...shuffle([...switchItems.slice(SWITCH_WINDOW), ...restItems], rng),
      ];
    } else {
      block = pickBalanced(remaining, rule, itemsPerRule, rng);
    }

    blocks.push(block);
    remaining = remaining.filter((it) => !block.includes(it));
  }

  return { blocks, sequence: ruleSequence };
}

export function buildRound(pair: RulePair, rng: Rng = Math.random, knob: number = 2): Round {
  let draw = drawRound(pair, rng, knob);
  if (knob === 2) {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (isBalanced(draw.blocks[0], "a") && isBalanced(draw.blocks[1], "b")) break;
      draw = drawRound(pair, rng, knob);
    }
  }
  const trials: Trial[] = [];
  draw.blocks.forEach((block, idx) => {
    const rule = draw.sequence[idx];
    block.forEach((item) => trials.push({ item, rule }));
  });
  return {
    pair,
    trials,
  };
}

/** A full session: 2 rounds, each using a different random rule pair. */
export function buildSession(rng: Rng = Math.random, knob: number = 2): Round[] {
  const pairs = shuffle(RULE_PAIRS, rng).slice(0, ROUNDS);
  return pairs.map((p) => buildRound(p, rng, knob));
}

/** True for the first SWITCH_WINDOW items after each mid-round rule change. */
export function isSwitchTrial(trialIndex: number, knob: number = 2): boolean {
  const { itemsPerRule, ruleSequence } = getSortingKnobConfig(knob);
  for (let bIdx = 1; bIdx < ruleSequence.length; bIdx++) {
    const switchStart = bIdx * itemsPerRule;
    if (trialIndex >= switchStart && trialIndex < switchStart + SWITCH_WINDOW) {
      return true;
    }
  }
  return false;
}

export function computeScore(correct: number, totalItems: number = TOTAL_ITEMS): number {
  return Math.round((correct / totalItems) * 100);
}
