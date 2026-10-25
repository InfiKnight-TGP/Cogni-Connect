import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALLOWED_VIDEO_TYPES,
  MAX_UPLOAD_MB_REGULAR,
  MAX_UPLOAD_MB_DEMO,
  canManageMemories,
  validateVideoFile,
  validateMemoryDate,
  validateMemoryNote,
  resolveUploadDate,
  formatLocalDate,
  shouldPoll,
  getNextPollDelay,
  getFriendlyErrorMessage,
} from "./video-upload.ts";

// 1. Role permission checks
assert.equal(canManageMemories({ role: "self", user: { id: "1", name: "Me", email: "me@example.com" }, patients: [], activePatient: null, elevated: false }), true);
assert.equal(canManageMemories({ role: "caregiver", user: { id: "2", name: "CG", email: "cg@example.com" }, patients: [], activePatient: null, elevated: false }), false);
assert.equal(canManageMemories({ role: "patient_device", user: null, patients: [], activePatient: null, elevated: false }), false);
assert.equal(canManageMemories(null), false);

// 2. Video file validation
assert.equal(validateVideoFile(null).valid, false);
assert.equal(validateVideoFile({ name: "clip.mp4", size: 10 * 1024 * 1024 }).valid, true);
assert.equal(validateVideoFile({ name: "clip.mov", size: 10 * 1024 * 1024 }).valid, true);
assert.equal(validateVideoFile({ name: "clip.webm", size: 10 * 1024 * 1024 }).valid, true);
assert.equal(validateVideoFile({ name: "clip.avi", size: 10 * 1024 * 1024 }).valid, false);
assert.equal(validateVideoFile({ name: "clip.mp4", size: 201 * 1024 * 1024 }, false).valid, false); // >200MB
assert.equal(validateVideoFile({ name: "clip.mp4", size: 21 * 1024 * 1024 }, true).valid, false); // >20MB demo
assert.equal(validateVideoFile({ name: "clip.mp4", size: 19 * 1024 * 1024 }, true).valid, true); // <20MB demo

// 3. Memory date validation (client today, yesterday, tomorrow, 2 days ahead, 5 days ahead)
const now = new Date(2026, 9, 25); // 2026-10-25
assert.equal(validateMemoryDate("2026-10-24", now).valid, true); // Yesterday
assert.equal(validateMemoryDate("2026-10-25", now).valid, true); // Today
assert.equal(validateMemoryDate("2026-10-26", now).valid, true); // Tomorrow
assert.equal(validateMemoryDate("2026-10-27", now).valid, true); // 2 days ahead
assert.equal(validateMemoryDate("2026-10-30", now).valid, false); // 5 days ahead
assert.equal(validateMemoryDate("invalid", now).valid, false);
assert.equal(validateMemoryDate("2026-02-31", now).valid, false);

// 4. Memory note validation
assert.equal(validateMemoryNote("").valid, true);
assert.equal(validateMemoryNote("Nice day in the garden").valid, true);
assert.equal(validateMemoryNote("a".repeat(300)).valid, true);
assert.equal(validateMemoryNote("a".repeat(301)).valid, false);

// 5. Polling rules
assert.equal(shouldPoll("processing", true, 0), true);
assert.equal(shouldPoll("processing", false, 0), false); // Tab hidden
assert.equal(shouldPoll("ready", true, 0), false);
assert.equal(shouldPoll("failed", true, 0), false);
assert.equal(shouldPoll("processing", true, 1801), false); // Timed out (>= 30 mins)

// Backoff delay
let delay = 2000;
delay = getNextPollDelay(delay);
assert.equal(delay, 3000);
delay = getNextPollDelay(delay);
assert.equal(delay, 4500);
delay = getNextPollDelay(8000);
assert.equal(delay, 10000); // capped at 10s

// 6. Friendly error messages
assert.equal(getFriendlyErrorMessage(400), "Invalid video or date format.");
assert.equal(getFriendlyErrorMessage(403), "You do not have permission to modify this memory.");
assert.equal(getFriendlyErrorMessage(409), "A video is already being processed. Please wait for it to finish.");
assert.equal(getFriendlyErrorMessage(413), "Video exceeds the maximum size limit.");
assert.equal(getFriendlyErrorMessage(429), "Upload limit reached for today.");
assert.equal(getFriendlyErrorMessage(507), "Insufficient server disk space. Please remove old memories or try again later.");

// 7. Verify all translation phrases exist in hi.json and as.json
const hi = JSON.parse(await readFile(new URL("./interaction/locales/hi.json", import.meta.url), "utf8"));
const as = JSON.parse(await readFile(new URL("./interaction/locales/as.json", import.meta.url), "utf8"));

const newPhrases = [
  "Add a video",
  "Add your first video",
  "What happened?",
  "Date",
  "Upload video",
  "Uploading…",
  "This can take a few minutes",
  "Your video is processed to make your questions. Speech and frames may be sent to the services listed in the Privacy page.",
  "Privacy page",
  "Up to 200 MB, up to 3 minutes",
  "Up to 20 MB, up to 3 minutes",
  "Edit memory",
  "Save changes",
  "Delete memory",
  "Delete this memory?",
  "Are you sure you want to delete this memory? This cannot be undone.",
  "Cancel",
  "Delete",
  "Retry",
  "Remove",
  "Couldn't process this video",
  "We couldn't process this video. You can try again or remove it.",
  "A video is already being processed",
  "This is taking longer than usual. You can check back later.",
  "Memory updated",
  "Memory deleted",
  "We used the date this video was saved. You can change it.",
];

for (const phrase of newPhrases) {
  assert.ok(hi.ui[phrase], `Missing Hindi translation for: "${phrase}"`);
  assert.ok(as.ui[phrase], `Missing Assamese translation for: "${phrase}"`);
}

// 8. Video upload date resolution: defaults to file's lastModified (local yyyy-MM-dd), never overwrites manual change
const clientToday = new Date(2026, 9, 25, 12, 0, 0); // 2026-10-25 noon local
const todayStr = formatLocalDate(clientToday);
assert.equal(todayStr, "2026-10-25");

// A. File saved yesterday formatted as local yyyy-MM-dd
const yesterday = new Date(2026, 9, 24, 15, 30, 0);
assert.equal(resolveUploadDate({ lastModified: yesterday.getTime() }, todayStr, false, clientToday), "2026-10-24");

// B. "Never overwrite a date the person already changed by hand" rule
assert.equal(resolveUploadDate({ lastModified: yesterday.getTime() }, "2026-10-18", true, clientToday), "2026-10-18");
assert.equal(resolveUploadDate({ lastModified: yesterday.getTime() }, "2026-10-22", true, clientToday), "2026-10-22");

// C. "If lastModified is missing or in the future, keep today"
const futureDate = new Date(2026, 9, 26, 10, 0, 0);
assert.equal(resolveUploadDate({ lastModified: futureDate.getTime() }, todayStr, false, clientToday), todayStr);
assert.equal(resolveUploadDate({ lastModified: undefined }, todayStr, false, clientToday), todayStr);
assert.equal(resolveUploadDate({ lastModified: null }, todayStr, false, clientToday), todayStr);
assert.equal(resolveUploadDate({ lastModified: 0 }, todayStr, false, clientToday), todayStr);
assert.equal(resolveUploadDate({ lastModified: NaN }, todayStr, false, clientToday), todayStr);
assert.equal(resolveUploadDate(null, todayStr, false, clientToday), todayStr);
assert.equal(resolveUploadDate(undefined, todayStr, false, clientToday), todayStr);

// D. Local timezone check without UTC day shift (e.g. late evening 23:45 local)
const lateEvening = new Date(2026, 9, 24, 23, 45, 0);
assert.equal(resolveUploadDate({ lastModified: lateEvening.getTime() }, todayStr, false, clientToday), "2026-10-24");

console.log("video-upload checks passed: validated form validation, polling backoff/stop rules, role permission checks, friendly errors, resolveUploadDate (file date default, manual change protection), and hi/as translations.");
