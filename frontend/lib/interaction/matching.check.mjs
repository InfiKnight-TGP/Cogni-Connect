import assert from 'node:assert/strict';
import { normalizeAnswer, similarity, matchAnswer } from './matching.ts';

// Test normalization
assert.equal(normalizeAnswer("  Dinesh!  "), "dinesh");
assert.equal(normalizeAnswer("Jawed-Karim"), "jawed karim");

// Test similarity
assert.equal(similarity("apple", "apple"), 1);
assert.equal(similarity("", "apple"), 0);
assert.ok(similarity("dinesh", "denish") > 0.65);

// Test matching
const options = [
  { id: 'dinesh', label: 'Dinesh', synonyms: ['denish', 'dinnesh'] },
  { id: 'akash', label: 'Akash', synonyms: ['aakash'] },
  { id: 'nikhil', label: 'Nikhil' },
];

// Exact match with high confidence -> accept
const exactMatch = matchAnswer('dinesh', options, 0.9);
assert.equal(exactMatch.kind, 'accept');
if (exactMatch.kind === 'accept') {
  assert.equal(exactMatch.option.id, 'dinesh');
}

// Synonym match with high confidence -> accept
const synMatch = matchAnswer('denish', options, 0.9);
assert.equal(synMatch.kind, 'accept');

// Near match without synonym -> confirm
const nearMatch = matchAnswer('dines', options, 0.9);
assert.equal(nearMatch.kind, 'confirm');
if (nearMatch.kind === 'confirm') {
  assert.equal(nearMatch.option.id, 'dinesh');
}

// Unrelated text -> retry
const wrongMatch = matchAnswer('banana', options, 0.9);
assert.equal(wrongMatch.kind, 'retry');

console.log('matching checks passed: normalization, levenshtein distance, synonym resolution and confidence thresholds');
