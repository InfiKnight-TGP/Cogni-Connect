import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORD_ASSOCIATION_PAIRS } from "../components/games/word-association/data.ts";
import {
  getKnobConfig,
  generateSession,
  calculateScore,
  buildRoundOptions,
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
  for (const [idx, dist] of pair.distractors.entries()) {
    assert(
      dist.word && dist.word.trim().length > 0,
      `Pair ${pair.id} distractor ${idx} missing word`
    );
    assert(
      dist.emoji && dist.emoji.trim().length > 0,
      `Pair ${pair.id} distractor ${idx} missing emoji`
    );

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
}

// 3. Voice matching verification: saying "biscuit", "chai biscuit" or Hindi synonym selects target
const samplePair = WORD_ASSOCIATION_PAIRS[0]; // chai-biscuit
const sampleKnobConfig = getKnobConfig(2);
const roundOpts = buildRoundOptions(samplePair, sampleKnobConfig, () => 0.5);

// Replicate the voiceOptions mapping in index.tsx
const voiceOptions = roundOpts.map((opt) => ({
  id: opt.id,
  label: opt.word, // English label passed to VoiceQuestion
  synonyms: [
    ...(opt.synonyms ?? []),
    ...(opt.id === `target-${samplePair.id}`
      ? [
          `${samplePair.cue.word} ${opt.word}`,
          "chai biscuit",
          "tea biscuit",
          "चाय बिस्कुट",
        ]
      : []),
  ],
}));

// Localize options using Hindi dictionary as VoiceQuestion does
const localizedOptions = localizeAnswerOptions(
  voiceOptions,
  (k) => hi.ui[k] || k,
  hi.synonyms || {}
);

// Verify exact match on English target word "biscuit"
const matchBiscuit = matchAnswer("biscuit", localizedOptions, 0.9);
assert(matchBiscuit.kind === "accept" || matchBiscuit.kind === "confirm");
assert.equal(matchBiscuit.option.id, `target-${samplePair.id}`);

// Verify match on phrase "chai biscuit"
const matchChaiBiscuit = matchAnswer("chai biscuit", localizedOptions, 0.9);
assert(matchChaiBiscuit.kind === "accept" || matchChaiBiscuit.kind === "confirm");
assert.equal(matchChaiBiscuit.option.id, `target-${samplePair.id}`);

// Verify match on Hindi translated word "बिस्कुट"
const matchHindiBiscuit = matchAnswer("बिस्कुट", localizedOptions, 0.9);
assert(matchHindiBiscuit.kind === "accept" || matchHindiBiscuit.kind === "confirm");
assert.equal(matchHindiBiscuit.option.id, `target-${samplePair.id}`);

// Verify match on transliterated synonym "biskut"
const matchBiskut = matchAnswer("biskut", localizedOptions, 0.9);
assert(matchBiskut.kind === "accept" || matchBiskut.kind === "confirm");
assert.equal(matchBiskut.option.id, `target-${samplePair.id}`);

// 4. Knob configuration checks
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

// 5. Session generator checks (seeded, non-repeating, correct option count, includes target)
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

// 6. Knob 4 distractor check: all distractors must be from the same category
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

// 7. Scoring checks
assert.equal(calculateScore([1, 1, 1, 1, 1, 1]), 100);
assert.equal(calculateScore([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), 50);
assert.equal(calculateScore([0, 0, 0, 0, 0, 0]), 0);
assert.equal(calculateScore([1, 0.5, 0, 1, 0.5, 1], 6), 67); // 4 / 6 * 100 = 66.666 -> 67
assert.equal(calculateScore([1, 1, 1, 1, 1], 5), 100);
assert.equal(calculateScore([], 6), 0);

console.log("word-association checks passed: 18 pairs validated with no distractor conflicts, voice matching verified (biscuit, chai biscuit, Hindi, transliterated), knob levels 1-4, session generator, and scoring.");
