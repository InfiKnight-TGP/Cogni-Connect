import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canUseSos,
  cleanupHoldOnUnmount,
  holdProgress,
  remainingSeconds,
  shouldAcceptPosition,
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

// Behaviour check: cleanupHoldOnUnmount clears holdInterval while countdown, retry timers survive
const clearedIds = [];
const mockClearInterval = (id) => clearedIds.push(id);
const mockTimers = {
  holdInterval: 101,
  countdownTimeout: 202,
  retryInterval: 303,
  retryTimeout: 404,
};
const cleanedTimers = cleanupHoldOnUnmount(mockTimers, mockClearInterval);
assert.deepEqual(clearedIds, [101], "cleanupHoldOnUnmount must call clearInterval with holdInterval ID");
assert.equal(cleanedTimers.holdInterval, null, "holdInterval must be null after cleanup");
assert.equal(cleanedTimers.countdownTimeout, 202, "countdownTimeout must survive unmount");
assert.equal(cleanedTimers.retryInterval, 303, "retryInterval must survive unmount");
assert.equal(cleanedTimers.retryTimeout, 404, "retryTimeout must survive unmount");

// Behaviour check: Two simulated countdowns prove new countdown runId rejects late position from earlier countdown
let activeRunId = 0;
let positionAttachedAlert = null;
let onLocationArrived = null;

// Countdown 1 starts
activeRunId += 1;
const run1 = activeRunId;
onLocationArrived = (loc) => { positionAttachedAlert = "alert-1"; };

// Countdown 2 starts (e.g. user pressed Cancel/Back and restarted hold)
// onLocationArrived is cleared to null and runId is incremented
onLocationArrived = null;
activeRunId += 1;
const run2 = activeRunId;

// Delayed geolocation callback from countdown 1 arrives now
const shouldAccept1 = shouldAcceptPosition(false, activeRunId, run1);
assert.equal(shouldAccept1, false, "Position from earlier countdown run must be rejected");
if (shouldAccept1 && onLocationArrived) onLocationArrived({ lat: 10, lng: 20 });
assert.equal(positionAttachedAlert, null, "Earlier alert must NOT receive location from later or mismatched countdown");

// Geolocation callback for countdown 2 arrives
const shouldAccept2 = shouldAcceptPosition(false, activeRunId, run2);
assert.equal(shouldAccept2, true, "Position from current countdown run must be accepted");
onLocationArrived = (loc) => { positionAttachedAlert = "alert-2"; };
if (shouldAccept2 && onLocationArrived) onLocationArrived({ lat: 10, lng: 20 });
assert.equal(positionAttachedAlert, "alert-2", "Current alert receives location from its matching run");

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
