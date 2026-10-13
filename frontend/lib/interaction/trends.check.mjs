import assert from 'node:assert/strict';
// Node's direct TS execution needs explicit extension resolution for this module.
import { cognitiveTrendIndex, sessionScores } from './trends.ts';
const now = Date.now();
const events = Array.from({ length: 8 }, (_, session) => Array.from({ length: 10 }, (_, i) => ({ domain: 'Memory', session: String(session), correct: i < 10 - session, timestamp: session * 100 + i, errorType: i < 10 - session ? 'none' : 'answer' }))).flat();
assert.deepEqual(sessionScores(events, 'Memory'), [100, 90, 80, 70, 60, 50, 40, 30]);
assert.deepEqual(sessionScores(events, 'Attention'), []);
assert.equal(cognitiveTrendIndex([], now).score, null);
const rows = events.map((data, i) => ({ id: String(i), kind: 'event', updatedAt: now - i, data }));
assert.equal(cognitiveTrendIndex(rows, now).score, 65);
assert.equal(cognitiveTrendIndex(rows, now).components.length, 1);
console.log('trend checks passed: session aggregation, missing evidence and explainable index');
