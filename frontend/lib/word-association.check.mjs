import assert from "node:assert/strict";
import { WORD_ASSOCIATION_PAIRS } from "../components/games/word-association/data.ts";
import {
  getKnobConfig,
  generateSession,
  calculateScore,
  buildRoundOptions,
} from "../components/games/word-association/logic.ts";

// 1. Content check: At least 18 pairs
assert(
  WORD_ASSOCIATION_PAIRS.length >= 18,
  `Expected at least 18 pairs, found ${WORD_ASSOCIATION_PAIRS.length}`
);

// 2. Picture and word check: every target and distractor must have both
const seenPairIds = new Set();
for (const pair of WORD_ASSOCIATION_PAIRS) {
  assert(!seenPairIds.has(pair.id), `Duplicate pair ID: ${pair.id}`);
  seenPairIds.add(pair.id);

  assert(pair.cue.word && pair.cue.word.trim().length > 0, `Pair ${pair.id} cue missing word`);
  assert(pair.cue.emoji && pair.cue.emoji.trim().length > 0, `Pair ${pair.id} cue missing emoji`);
  assert(pair.hint && pair.hint.trim().length > 0, `Pair ${pair.id} missing hint`);

  // Target
  assert(pair.target.word && pair.target.word.trim().length > 0, `Pair ${pair.id} target missing word`);
  assert(pair.target.emoji && pair.target.emoji.trim().length > 0, `Pair ${pair.id} target missing emoji`);

  // Distractors
  assert(pair.distractors.length >= 4, `Pair ${pair.id} has fewer than 4 distractors`);
  for (const [idx, dist] of pair.distractors.entries()) {
    assert(
      dist.word && dist.word.trim().length > 0,
      `Pair ${pair.id} distractor ${idx} missing word`
    );
    assert(
      dist.emoji && dist.emoji.trim().length > 0,
      `Pair ${pair.id} distractor ${idx} missing emoji`
    );
  }
}

// 3. Knob configuration checks
const k1 = getKnobConfig(1);
assert.equal(k1.rounds, 5);
assert.equal(k1.optionsCount, 2);
assert.equal(k1.showHintImmediately, true);

const k2 = getKnobConfig(2);
assert.equal(k2.rounds, 6);
assert.equal(k2.optionsCount, 3);
assert.equal(k2.showHintImmediately, false);

const k3 = getKnobConfig(3);
assert.equal(k3.rounds, 6);
assert.equal(k3.optionsCount, 4);
assert.equal(k3.sameCategoryCount, 1);

const k4 = getKnobConfig(4);
assert.equal(k4.rounds, 8);
assert.equal(k4.optionsCount, 4);
assert.equal(k4.sameCategoryCount, 3);

// 4. Session generator checks (seeded, non-repeating, correct option count, includes target)
for (const knob of [1, 2, 3, 4]) {
  const session = generateSession(WORD_ASSOCIATION_PAIRS, knob, 42);
  const cfg = getKnobConfig(knob);
  assert.equal(session.length, cfg.rounds);

  const roundPairIds = new Set();
  for (const round of session) {
    assert(!roundPairIds.has(round.id), `Session repeated pair ${round.id}`);
    roundPairIds.add(round.id);

    assert.equal(round.options.length, cfg.optionsCount);
    const targetOpt = round.options.find((o) => o.id === round.targetId);
    assert(targetOpt, `Round ${round.id} missing target option`);

    // Verify all options have both a picture and word
    for (const opt of round.options) {
      assert(opt.word && opt.word.length > 0, `Option missing word in round ${round.id}`);
      assert(opt.emoji && opt.emoji.length > 0, `Option missing emoji in round ${round.id}`);
    }
  }
}

// 5. Knob 4 distractor check: all distractors must be from the same category
const samplePair = WORD_ASSOCIATION_PAIRS[0];
const knob4Opts = buildRoundOptions(samplePair, k4, () => 0.1);
const sameCategoryDistractors = samplePair.distractors.filter((d) => d.sameCategory).map((d) => d.word);
for (const opt of knob4Opts) {
  if (opt.id !== `target-${samplePair.id}`) {
    assert(
      sameCategoryDistractors.includes(opt.word),
      `Knob 4 distractor ${opt.word} was not from same category`
    );
  }
}

// 6. Scoring checks
assert.equal(calculateScore([1, 1, 1, 1, 1, 1]), 100);
assert.equal(calculateScore([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), 50);
assert.equal(calculateScore([0, 0, 0, 0, 0, 0]), 0);
assert.equal(calculateScore([1, 0.5, 0, 1, 0.5, 1], 6), 67); // 4 / 6 * 100 = 66.666 -> 67
assert.equal(calculateScore([1, 1, 1, 1, 1], 5), 100);
assert.equal(calculateScore([], 6), 0);

console.log("word-association checks passed: 20 pairs validated with picture+word, knob levels 1-4, session generator, and scoring.");
