import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canUseSos, SOS_HOLD_MS, sosHoldReady } from "./sos.ts";

assert.equal(SOS_HOLD_MS, 3000);
assert.equal(sosHoldReady(2999), false);
assert.equal(sosHoldReady(3000), true);
assert.equal(sosHoldReady(Number.NaN), false);
assert.equal(canUseSos("patient_device"), true);
assert.equal(canUseSos("self"), false);
assert.equal(canUseSos("caregiver"), false);

const page = await readFile(new URL("../app/sos/page.tsx", import.meta.url), "utf8");
for (const phrase of [
  "SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself.",
  "Call 112", "Call my contacts", "SOS for self-care accounts", "Text message alerts",
  "disabled", "Your caregiver has been alerted",
]) assert.ok(page.includes(phrase), `SOS screen must include ${phrase}`);
assert.ok(page.includes("canUseSos(session?.role)"), "self-care access must be excluded");

assert.ok(page.includes("Include my location"), "SOS screen must include 'Include my location' checkbox");
assert.ok(page.includes("includeLocation"), "SOS screen must check includeLocation before reading position");

const locales = await readFile(new URL("./interaction/locales.check.mjs", import.meta.url), "utf8");
assert.ok(locales.includes("SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself."));
console.log("SOS checks passed: hold duration, account access, disclaimer, disabled cards, location checkbox, and locale coverage");
