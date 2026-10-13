import assert from 'node:assert/strict';
import { BrowserSpeechProvider } from './speech.ts';

let utterance, recognition, cancellations = 0;
const voices = [{ lang: 'en-IN' }];
const listeners = new Set();
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = {
  speechSynthesis: {
    getVoices: () => voices,
    speak: value => { utterance = value; },
    cancel: () => { cancellations++; }, // Deliberately emits no browser callback.
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  },
  SpeechRecognition: class {
    constructor() { recognition = this; }
    start() {}
    abort() {} // Cancellation must settle even when the engine stays silent.
  },
};
const first = new BrowserSpeechProvider(), second = new BrowserSpeechProvider();
let speaking = first.speak('Question one', 'en-IN');
const cancelledSpeech = assert.rejects(speaking, { reason: 'cancelled' });
first.cancel();
await cancelledSpeech;
assert.equal(cancellations, 1);
assert.equal(utterance.onend, null);

speaking = first.speak('Question two', 'en-IN');
second.cancel();
assert.equal(cancellations, 1, 'Unrelated cleanup must not stop the active question');
utterance.onend();
assert.ok(Number.isFinite(await speaking));

speaking = first.speak('Replaced question', 'en-IN');
const replaced = assert.rejects(speaking, { reason: 'cancelled' });
const replacement = second.speak('Current question', 'en-IN');
await replaced;
utterance.onend();
await replacement;

let listening = first.listen('en-IN');
const cancelledRecognition = assert.rejects(listening, { reason: 'cancelled' });
first.cancel();
await cancelledRecognition;
assert.equal(recognition.onresult, null, 'Late recognition results must be disconnected');

const control = new AbortController();
listening = first.listen('en-IN', control.signal);
const aborted = assert.rejects(listening, { reason: 'cancelled' });
control.abort();
await aborted;

listening = first.listen('en-IN');
recognition.onspeechstart();
recognition.onresult({ results: [[{ transcript: 'Tea', confidence: .95 }]] });
const result = await listening;
assert.equal(result.text, 'Tea');
assert.ok(Number.isFinite(result.speechStartedAt));

voices.length = 0;
speaking = first.speak('Not ready yet', 'en-IN');
const discoveryCancelled = assert.rejects(speaking, { reason: 'cancelled' });
first.cancel();
await discoveryCancelled;
assert.equal(listeners.size, 0);
voices.push({ lang: 'en-IN' });
await assert.rejects(first.speak('Unsupported language', 'as-IN'), { reason: 'language' });
const setTimer = globalThis.setTimeout;
try {
  // Accelerate only the TTS watchdog; the fake synthesizer never emits onend.
  globalThis.setTimeout = (fn, delay, ...args) => setTimer(fn, delay >= 30000 ? 0 : delay, ...args);
  await assert.rejects(first.speak('Silent engine', 'en-IN'), { reason: 'unsupported' });
} finally { globalThis.setTimeout = setTimer; }
console.log('speech checks passed: ownership, cancellation, stale callbacks, voice discovery and timing');
