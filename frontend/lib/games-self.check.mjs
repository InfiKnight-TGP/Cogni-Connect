import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/games/page.tsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../components/games/registry.ts", import.meta.url), "utf8");
const hi = JSON.parse(readFileSync(new URL("./interaction/locales/hi.json", import.meta.url), "utf8"));
const as = JSON.parse(readFileSync(new URL("./interaction/locales/as.json", import.meta.url), "utf8"));
const hiUi = hi.ui ?? {};
const asUi = as.ui ?? {};
assert.match(source, /session\?\.role === "self" \? <SelfGames/);
assert.match(source, /Playing here counts toward your progress/);
assert.match(source, /In today’s plan/);
assert.match(source, /Played today/);
assert.match(source, /Coming soon/);
assert.match(source, /<Game level=\{active\.level\} date=\{gameDate\} \/>/);
assert.match(source, /game\.component/);
assert.match(registry, /id: "face-recognition"/);
assert.match(registry, /id: "context-recall"/);
assert.match(source, /toEntries\(performance\)/);
for (const key of ["Playing here counts toward your progress.", "{count} games ready", "In today’s plan", "Played today", "Coming soon", "Play", "Back to all games", "Change day", "Game day"]) {
  assert.ok(Object.hasOwn(hiUi, key), `Hindi locale should include ${key}`);
  assert.ok(Object.hasOwn(asUi, key), `Assamese locale should include ${key}`);
}
assert.match(registry, /id: "face-recognition"/);
assert.match(registry, /id: "context-recall"/);
import { canSaveScores, setSessionSnapshot } from "./auth-session.ts";

assert.match(source, /searchParams\.get\("game"\)/, "SelfGames must check searchParams for requested game");
assert.match(source, /setActive\(\{ game, level: game\.levels\[0\] \}\)/, "Requested game must be set active");

// Verify that self sessions can save scores
setSessionSnapshot({ role: "self", user: null, patients: [], activePatient: null, elevated: false });
assert.equal(canSaveScores(), true, "Self session must be allowed to save scores");

setSessionSnapshot({ role: "caregiver", user: null, patients: [], activePatient: null, elevated: false });
assert.equal(canSaveScores(), false, "Caregiver session must not save patient scores");

console.log("self-care games checks passed: confirmed non-preview game launch and score saving for self sessions.");
