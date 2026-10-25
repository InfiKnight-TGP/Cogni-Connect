import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/routine/page.tsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../../backend/app.py", import.meta.url), "utf8");
const auth = readFileSync(new URL("../../backend/auth.py", import.meta.url), "utf8");
assert.match(page, /session\?\.role === "self" \? <SelfRoutine/);
assert.match(page, /DictationButton/);
assert.match(page, /ROUTINE_SUGGESTIONS/);
assert.match(page, /Try Plan the Day/);
assert.match(page, /You have unsaved changes/);
assert.match(backend, /Only the patient or a caregiver can edit this routine/);
assert.doesNotMatch(auth.match(/const CAREGIVER_ENDPOINTS = \{[\s\S]*?\};/)?.[0] ?? "", /save_routine/);
console.log("self-care routine checks passed");
