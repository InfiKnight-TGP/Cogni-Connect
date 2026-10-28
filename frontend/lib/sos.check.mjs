import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canUseSos,
  holdProgress,
  remainingSeconds,
  shouldRetry,
  shouldSend,
  SOS_COUNTDOWN_MS,
  SOS_HOLD_MS,
  sosHoldReady,
} from "./sos.ts";

assert.equal(SOS_HOLD_MS, 3000);
assert.equal(SOS_COUNTDOWN_MS, 5000);
assert.equal(sosHoldReady(2999), false);
assert.equal(sosHoldReady(3000), true);
assert.equal(sosHoldReady(Number.NaN), false);
assert.equal(canUseSos("patient_device"), true);
assert.equal(canUseSos("self"), false);
assert.equal(canUseSos("caregiver"), false);

// 1. Pure helpers tests
// holdProgress
assert.equal(holdProgress(0, 3000), 0);
assert.equal(holdProgress(1500, 3000), 50);
assert.equal(holdProgress(3000, 3000), 100);
assert.equal(holdProgress(4000, 3000), 100);
assert.equal(holdProgress(-10, 3000), 0);
assert.equal(holdProgress(Number.NaN, 3000), 0);

// remainingSeconds (startMs, nowMs, totalMs=5000)
assert.equal(remainingSeconds(0, 0, 5000), 5);
assert.equal(remainingSeconds(0, 500, 5000), 5);
assert.equal(remainingSeconds(0, 1000, 5000), 4);
assert.equal(remainingSeconds(0, 1001, 5000), 4);
assert.equal(remainingSeconds(0, 2000, 5000), 3);
assert.equal(remainingSeconds(0, 3000, 5000), 2);
assert.equal(remainingSeconds(0, 4000, 5000), 1);
assert.equal(remainingSeconds(0, 4999, 5000), 1);
assert.equal(remainingSeconds(0, 5000, 5000), 0);
assert.equal(remainingSeconds(0, 6000, 5000), 0);
assert.equal(remainingSeconds(Number.NaN, 1000, 5000), 0);

// shouldSend (startMs, nowMs, totalMs=5000)
assert.equal(shouldSend(0, 4999, 5000), false);
assert.equal(shouldSend(0, 5000, 5000), true);
assert.equal(shouldSend(0, 6000, 5000), true);
assert.equal(shouldSend(Number.NaN, 5000, 5000), false);

// shouldRetry (status)
assert.equal(shouldRetry(undefined), true);
assert.equal(shouldRetry(null), true);
assert.equal(shouldRetry(0), true);
assert.equal(shouldRetry(500), true);
assert.equal(shouldRetry(502), true);
assert.equal(shouldRetry(503), true);
assert.equal(shouldRetry(400), false);
assert.equal(shouldRetry(401), false);
assert.equal(shouldRetry(403), false);
assert.equal(shouldRetry(404), false);
assert.equal(shouldRetry(429), false);
assert.equal(shouldRetry(200), false);

// Simulated timer sequence (e.g. simulated clock ticks)
let simStart = 1000;
assert.equal(remainingSeconds(simStart, simStart, 5000), 5);
assert.equal(shouldSend(simStart, simStart, 5000), false);
simStart = 1000;
let simNow = 3500; // 2.5s elapsed
assert.equal(remainingSeconds(simStart, simNow, 5000), 3);
assert.equal(shouldSend(simStart, simNow, 5000), false);
simNow = 6000; // 5.0s elapsed
assert.equal(remainingSeconds(simStart, simNow, 5000), 0);
assert.equal(shouldSend(simStart, simNow, 5000), true);

const page = await readFile(new URL("../app/sos/page.tsx", import.meta.url), "utf8");

// Strict silence checks: page must NOT contain automatic speech, sound, vibration, or Audio objects
assert.ok(!page.includes("autoRead={true}"), "page must not have autoRead={true}");
assert.ok(!page.includes("forceAutoRead"), "page must not have forceAutoRead");
assert.ok(!page.includes("speechSynthesis"), "page must not have speechSynthesis");
assert.ok(!page.includes("navigator.vibrate"), "page must not have navigator.vibrate");
assert.ok(!page.includes("new Audio"), "page must not have Audio objects");
assert.ok(!page.includes("Audio("), "page must not instantiate Audio");
assert.ok(!page.includes("Your caregiver has been alerted"), "page must not contain spoken alert text");

// Flow and accessibility assertions
assert.ok(page.includes('aria-live="off"'), "countdown must use aria-live='off'");
assert.ok(page.includes("Sending alert in {n}"), "must display countdown phrase");
assert.ok(page.includes("Alert sent."), "must display result screen phrase");
assert.ok(page.includes("minHeight: \"80px\"") || page.includes("min-h-20"), "Cancel button must be at least 80px tall");
assert.ok(page.includes("AbortController"), "Cancel must abort unsent request with AbortController");
assert.ok(page.includes("patchLocation"), "Must support late arriving location patch");
assert.ok(page.includes("/sos/alerts/"), "Must target PATCH /sos/alerts/<id>/location");
assert.ok(page.includes("holdInterval.current = null;"), "Must clear hold interval on unmount");
assert.ok(page.includes("onLocationArrived"), "Late location must be attached across view reset");

for (const phrase of [
  "SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself.",
  "Call 112", "Call my contacts", "SOS for self-care accounts", "Text message alerts",
  "disabled",
]) assert.ok(page.includes(phrase), `SOS screen must include ${phrase}`);
assert.ok(page.includes("canUseSos(session?.role)"), "self-care access must be excluded");

assert.ok(page.includes("Include my location"), "SOS screen must include 'Include my location' checkbox");
assert.ok(page.includes("includeLocation"), "SOS screen must check includeLocation before reading position");

const locales = await readFile(new URL("./interaction/locales.check.mjs", import.meta.url), "utf8");
assert.ok(locales.includes("SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself."));
console.log("SOS checks passed: hold duration, helpers, silence check, countdown, abort, location patch, and locale coverage");
