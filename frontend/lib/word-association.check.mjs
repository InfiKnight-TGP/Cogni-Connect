import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORD_ASSOCIATION_PAIRS } from "../components/games/word-association/data.ts";
import {
  getKnobConfig,
  generateSession,
  calculateScore,
  buildRoundOptions,
  buildVoiceOptions,
} from "../components/games/word-association/logic.ts";
import {
  localizeAnswerOptions,
  matchAnswer,
} from "./interaction/matching.ts";

const hi = JSON.parse(await readFile(new URL("./interaction/locales/hi.json", import.meta.url), "utf8"));

// 1. Content check: At least 18 pairs
assert(
  WORD_ASSOCIATION_PAIRS.length >= 18,
  `Expected at least 18 pairs, found ${WORD_ASSOCIATION_PAIRS.length}`
);

// 2. Picture and word check: every target and distractor must have both
const seenPairIds = new Set();
const allTargetWords = new Set(WORD_ASSOCIATION_PAIRS.map((p) => p.target.word.toLowerCase()));
const targetsByCategory = new Map();
const pairsWithFewerThan3SameCategory = [];

for (const pair of WORD_ASSOCIATION_PAIRS) {
  assert(!seenPairIds.has(pair.id), `Duplicate pair ID: ${pair.id}`);
  seenPairIds.add(pair.id);

  assert(pair.cue.word && pair.cue.word.trim().length > 0, `Pair ${pair.id} cue missing word`);
  assert(pair.cue.emoji && pair.cue.emoji.trim().length > 0, `Pair ${pair.id} cue missing emoji`);
  assert(pair.hint && pair.hint.trim().length > 0, `Pair ${pair.id} missing hint`);

  // Target
  assert(pair.target.word && pair.target.word.trim().length > 0, `Pair ${pair.id} target missing word`);
  assert(pair.target.emoji && pair.target.emoji.trim().length > 0, `Pair ${pair.id} target missing emoji`);

  if (!targetsByCategory.has(pair.category)) {
    targetsByCategory.set(pair.category, new Set());
  }
  targetsByCategory.get(pair.category).add(pair.target.word.toLowerCase());

  // Distractors
  assert(pair.distractors.length >= 4, `Pair ${pair.id} has fewer than 4 distractors`);
  let sameCategoryCount = 0;
  for (const [idx, dist] of pair.distractors.entries()) {
    assert(
      dist.word && dist.word.trim().length > 0,
      `Pair ${pair.id} distractor ${idx} missing word`
    );
    assert(
      dist.emoji && dist.emoji.trim().length > 0,
      `Pair ${pair.id} distractor ${idx} missing emoji`
    );

    if (dist.sameCategory) {
      sameCategoryCount++;
    }

    // Rule: No distractor equals another pair's target for the same cue category
    const catTargets = targetsByCategory.get(pair.category);
    assert(
      !catTargets.has(dist.word.toLowerCase()) || dist.word.toLowerCase() === pair.target.word.toLowerCase(),
      `Distractor "${dist.word}" conflicts with target in same category "${pair.category}"`
    );

    // Invariant: No distractor equals any pair's target anywhere
    assert(
      !allTargetWords.has(dist.word.toLowerCase()),
      `Distractor "${dist.word}" in pair "${pair.id}" equals target word of another pair`
    );
  }

  // Count same-category distractors
  if (sameCategoryCount < 3) {
    pairsWithFewerThan3SameCategory.push({ id: pair.id, sameCategoryCount });
  }
}

// Check list of pairs with fewer than 3 same-category distractors
if (pairsWithFewerThan3SameCategory.length > 0) {
  console.warn("Pairs with fewer than 3 same-category distractors:", pairsWithFewerThan3SameCategory);
}
assert.equal(
  pairsWithFewerThan3SameCategory.length,
  0,
  `Expected all pairs to have >= 3 same-category distractors for Knob 4, found deficiencies: ${JSON.stringify(pairsWithFewerThan3SameCategory)}`
);

// 3. Fallback rule test for Knob 4 if a pair ever has fewer than 3 same-category distractors
const simulatedDeficientPair = {
  id: "test-deficient",
  category: "test",
  cue: { word: "Test Cue", emoji: "🧪" },
  target: { word: "Target", emoji: "🎯", synonyms: ["target"] },
  hint: "Test hint",
  distractors: [
    { word: "Same 1", emoji: "1️⃣", sameCategory: true, synonyms: [] },
    { word: "Other 1", emoji: "🅰️", sameCategory: false, synonyms: [] },
    { word: "Other 2", emoji: "🅱️", sameCategory: false, synonyms: [] },
    { word: "Other 3", emoji: "🆎", sameCategory: false, synonyms: [] },
  ],
};
const k4Config = getKnobConfig(4);
const deficientRoundOpts = buildRoundOptions(simulatedDeficientPair, k4Config, () => 0.5);
assert.equal(deficientRoundOpts.length, 4, "Fallback rule must still return 4 options");
assert(deficientRoundOpts.some((o) => o.word === "Same 1"), "Fallback rule includes available same-category distractors");
assert(deficientRoundOpts.some((o) => o.id === "target-test-deficient"), "Fallback rule includes target");

// 4. Voice matching verification via exported buildVoiceOptions
// Check 4a: chai-biscuit
const chaiPair = WORD_ASSOCIATION_PAIRS.find((p) => p.id === "chai-biscuit");
const chaiOpts = buildRoundOptions(chaiPair, getKnobConfig(2), () => 0.5);
const chaiVoiceOpts = buildVoiceOptions(chaiPair.cue.word, chaiOpts, `target-${chaiPair.id}`);

const localizedChai = localizeAnswerOptions(
  chaiVoiceOpts,
  (k) => hi.ui[k] || k,
  hi.synonyms || {}
);

const matchBiscuit = matchAnswer("biscuit", localizedChai, 0.9);
assert(matchBiscuit.kind === "accept" || matchBiscuit.kind === "confirm");
assert.equal(matchBiscuit.option.id, `target-${chaiPair.id}`);

const matchChaiBiscuit = matchAnswer("chai biscuit", localizedChai, 0.9);
assert(matchChaiBiscuit.kind === "accept" || matchChaiBiscuit.kind === "confirm");
assert.equal(matchChaiBiscuit.option.id, `target-${chaiPair.id}`);

const matchHindiBiscuit = matchAnswer("बिस्कुट", localizedChai, 0.9);
assert(matchHindiBiscuit.kind === "accept" || matchHindiBiscuit.kind === "confirm");
assert.equal(matchHindiBiscuit.option.id, `target-${chaiPair.id}`);

// Check 4b: lock-key
const lockPair = WORD_ASSOCIATION_PAIRS.find((p) => p.id === "lock-key");
const lockOpts = buildRoundOptions(lockPair, getKnobConfig(2), () => 0.5);
const lockVoiceOpts = buildVoiceOptions(lockPair.cue.word, lockOpts, `target-${lockPair.id}`);

const localizedLock = localizeAnswerOptions(
  lockVoiceOpts,
  (k) => hi.ui[k] || k,
  hi.synonyms || {}
);

const matchKey = matchAnswer("key", localizedLock, 0.9);
assert(matchKey.kind === "accept" || matchKey.kind === "confirm");
assert.equal(matchKey.option.id, `target-${lockPair.id}`);

const matchChabi = matchAnswer("chabi", localizedLock, 0.9);
assert(matchChabi.kind === "accept" || matchChabi.kind === "confirm");
assert.equal(matchChabi.option.id, `target-${lockPair.id}`);

const matchLockKey = matchAnswer("lock key", localizedLock, 0.9);
assert(matchLockKey.kind === "accept" || matchLockKey.kind === "confirm");
assert.equal(matchLockKey.option.id, `target-${lockPair.id}`);

// PROOF: "chai biscuit" selects NOTHING in a lock-key round!
const matchLockChaiBiscuit = matchAnswer("chai biscuit", localizedLock, 0.9);
assert(
  matchLockChaiBiscuit.kind === "none" || !matchLockChaiBiscuit.option,
  `Expected "chai biscuit" to select nothing in lock-key round, but got ${matchLockChaiBiscuit.kind}`
);

// Check 4c: tawa-roti
const tawaPair = WORD_ASSOCIATION_PAIRS.find((p) => p.id === "tawa-roti");
const tawaOpts = buildRoundOptions(tawaPair, getKnobConfig(2), () => 0.5);
const tawaVoiceOpts = buildVoiceOptions(tawaPair.cue.word, tawaOpts, `target-${tawaPair.id}`);

const localizedTawa = localizeAnswerOptions(
  tawaVoiceOpts,
  (k) => hi.ui[k] || k,
  hi.synonyms || {}
);

const matchRoti = matchAnswer("roti", localizedTawa, 0.9);
assert(matchRoti.kind === "accept" || matchRoti.kind === "confirm");
assert.equal(matchRoti.option.id, `target-${tawaPair.id}`);

const matchChapati = matchAnswer("chapati", localizedTawa, 0.9);
assert(matchChapati.kind === "accept" || matchChapati.kind === "confirm");
assert.equal(matchChapati.option.id, `target-${tawaPair.id}`);

const matchTawaRoti = matchAnswer("tawa roti", localizedTawa, 0.9);
assert(matchTawaRoti.kind === "accept" || matchTawaRoti.kind === "confirm");
assert.equal(matchTawaRoti.option.id, `target-${tawaPair.id}`);

// Check 4d: train-ticket
const trainPair = WORD_ASSOCIATION_PAIRS.find((p) => p.id === "train-ticket");
const trainOpts = buildRoundOptions(trainPair, getKnobConfig(2), () => 0.5);
const trainVoiceOpts = buildVoiceOptions(trainPair.cue.word, trainOpts, `target-${trainPair.id}`);

const localizedTrain = localizeAnswerOptions(
  trainVoiceOpts,
  (k) => hi.ui[k] || k,
  hi.synonyms || {}
);

const matchTicket = matchAnswer("ticket", localizedTrain, 0.9);
assert(matchTicket.kind === "accept" || matchTicket.kind === "confirm");
assert.equal(matchTicket.option.id, `target-${trainPair.id}`);

const matchRailTicket = matchAnswer("rail ticket", localizedTrain, 0.9);
assert(matchRailTicket.kind === "accept" || matchRailTicket.kind === "confirm");
assert.equal(matchRailTicket.option.id, `target-${trainPair.id}`);

const matchTrainTicket = matchAnswer("train ticket", localizedTrain, 0.9);
assert(matchTrainTicket.kind === "accept" || matchTrainTicket.kind === "confirm");
assert.equal(matchTrainTicket.option.id, `target-${trainPair.id}`);

// 5. Knob configuration checks
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

// 6. Session generator checks (seeded, non-repeating, correct option count, includes target)
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

// 7. Knob 4 distractor check: all distractors must be from the same category
const knob4Opts = buildRoundOptions(chaiPair, k4, () => 0.1);
const sameCategoryDistractors = chaiPair.distractors.filter((d) => d.sameCategory).map((d) => d.word);
for (const opt of knob4Opts) {
  if (opt.id !== `target-${chaiPair.id}`) {
    assert(
      sameCategoryDistractors.includes(opt.word),
      `Knob 4 distractor ${opt.word} was not from same category`
    );
  }
}

// 8. Scoring checks
assert.equal(calculateScore([1, 1, 1, 1, 1, 1]), 100);
assert.equal(calculateScore([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), 50);
assert.equal(calculateScore([0, 0, 0, 0, 0, 0]), 0);
assert.equal(calculateScore([1, 0.5, 0, 1, 0.5, 1], 6), 67); // 4 / 6 * 100 = 66.666 -> 67
assert.equal(calculateScore([1, 1, 1, 1, 1], 5), 100);
assert.equal(calculateScore([], 6), 0);

console.log("word-association checks passed: 18 pairs validated, 0 with < 3 same-category distractors, voice matching verified across multiple pairs with buildVoiceOptions, 'chai biscuit' verified to select nothing in lock-key round, Knob 4 fallback verified, session generator and scoring intact.");
