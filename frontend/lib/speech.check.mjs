import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { shouldSpeak } from "./interaction/speech-gate.ts";
import { getPreferenceKey } from "./interaction/preferences.ts";

// 1. shouldSpeak pure helper tests
// Caregiver off
assert.equal(
  shouldSpeak({ role: "caregiver", readAloudSetting: false, forced: false }),
  false,
  "caregiver with readAloud off must return false"
);

// Caregiver on
assert.equal(
  shouldSpeak({ role: "caregiver", readAloudSetting: true, forced: false }),
  true,
  "caregiver with readAloud on must return true"
);

// Patient off
assert.equal(
  shouldSpeak({ role: "patient", readAloudSetting: false, forced: false }),
  false,
  "patient with readAloud off must return false"
);

// Patient on
assert.equal(
  shouldSpeak({ role: "patient", readAloudSetting: true, forced: false }),
  true,
  "patient with readAloud on must return true"
);

// Other recognized roles: patient_device and self
assert.equal(
  shouldSpeak({ role: "patient_device", readAloudSetting: true, forced: false }),
  true,
  "patient_device with readAloud on must return true"
);
assert.equal(
  shouldSpeak({ role: "self", readAloudSetting: true, forced: false }),
  true,
  "self with readAloud on must return true"
);
assert.equal(
  shouldSpeak({ role: "patient_device", readAloudSetting: false, forced: false }),
  false,
  "patient_device with readAloud off must return false"
);

// Missing setting must never default to on
assert.equal(
  shouldSpeak({ role: "caregiver", readAloudSetting: undefined, forced: false }),
  false,
  "missing setting on caregiver must return false"
);
assert.equal(
  shouldSpeak({ role: "patient", readAloudSetting: undefined, forced: false }),
  false,
  "missing setting on patient must return false"
);
assert.equal(
  shouldSpeak({ role: "caregiver", readAloudSetting: null, forced: false }),
  false,
  "null setting on caregiver must return false"
);
assert.equal(
  shouldSpeak({ role: "patient" }),
  false,
  "omitted setting must return false"
);
assert.equal(
  shouldSpeak({}),
  false,
  "empty options must return false"
);

// Forced always false (banned from overriding settings)
assert.equal(
  shouldSpeak({ role: "patient", readAloudSetting: true, forced: true }),
  false,
  "forced: true must return false even when setting is true"
);
assert.equal(
  shouldSpeak({ role: "caregiver", readAloudSetting: true, forced: true }),
  false,
  "forced: true must return false for caregiver"
);
assert.equal(
  shouldSpeak({ role: "patient", readAloudSetting: false, forced: true }),
  false,
  "forced: true must return false when setting is false"
);

// Role validation: missing or invalid role must return false
assert.equal(
  shouldSpeak({ role: null, readAloudSetting: true, forced: false }),
  false,
  "null role must return false"
);
assert.equal(
  shouldSpeak({ role: "admin", readAloudSetting: true, forced: false }),
  false,
  "unrecognized role must return false"
);
assert.equal(
  shouldSpeak({ role: "guest", readAloudSetting: true, forced: false }),
  false,
  "guest role must return false"
);

// 2. getPreferenceKey logic for each role
assert.equal(
  getPreferenceKey({ role: "self", activePatient: { id: "p-self-1" } }),
  "cogniconnect.preferences.v1:p-self-1",
  "self role must load patient preferences key"
);
assert.equal(
  getPreferenceKey({ role: "patient_device", activePatient: { id: "p-dev-2" } }),
  "cogniconnect.preferences.v1:p-dev-2",
  "patient_device role must load patient preferences key"
);
assert.equal(
  getPreferenceKey({ role: "caregiver", user: { id: "cg-100" }, activePatient: { id: "p-other" } }),
  "cogniconnect.preferences.caregiver.v1:cg-100",
  "caregiver role must load caregiver-specific preferences key, not patient's key"
);
assert.equal(
  getPreferenceKey({ role: "caregiver", user: null }),
  "cogniconnect.preferences.caregiver.v1:default",
  "caregiver role without user id must load default caregiver key"
);
assert.equal(
  getPreferenceKey(null),
  "cogniconnect.preferences.v1:public",
  "null session must load public preferences key"
);

// 3. Static checks across frontend
const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "out" || entry.name === "dist") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      files.push(full);
    }
  }
  return files;
}

const allFrontendFiles = await collectFiles(frontendRoot);
assert.ok(allFrontendFiles.length > 50, "should scan frontend files");

const speechCallerAllowedFiles = new Set([
  join(frontendRoot, "lib", "interaction", "speech.ts"),
  join(frontendRoot, "components", "caregiver", "sosAlertBanner.tsx"),
]);

for (const filePath of allFrontendFiles) {
  const content = await readFile(filePath, "utf8");
  const rel = filePath.replace(frontendRoot, "").replace(/^[\\/]/, "").replace(/\\/g, "/");

  // A: No file may contain forceAutoRead (except this check file)
  if (filePath !== fileURLToPath(import.meta.url)) {
    assert.doesNotMatch(
      content,
      /\bforceAutoRead\b/,
      `${rel} must not contain forceAutoRead`
    );
  }

  // B: Direct speechSynthesis use must be strictly confined and sit behind shouldSpeak
  if (/\bspeechSynthesis\b/.test(content)) {
    const isAuthorized = speechCallerAllowedFiles.has(filePath);
    const isCheckFile = rel.endsWith(".check.mjs") || rel.endsWith(".check.ts");

    if (!isAuthorized && !isCheckFile) {
      assert.fail(`Unauthorized direct speechSynthesis call in ${rel}`);
    }

    if (isAuthorized) {
      assert.ok(
        content.includes("shouldSpeak"),
        `${rel} calls speechSynthesis but does not sit behind shouldSpeak`
      );
      assert.match(
        content,
        /if\s*\(!shouldSpeak/,
        `${rel} must guard speech with if (!shouldSpeak(...))`
      );
    }
  }
}

// 4. Silent SOS screen check
const sosPageContent = await readFile(join(frontendRoot, "app", "sos", "page.tsx"), "utf8");
assert.ok(!sosPageContent.includes("autoRead={true}"), "SOS page must not have autoRead={true}");
assert.ok(!sosPageContent.includes("speechSynthesis"), "SOS page must not have speechSynthesis");
assert.ok(!sosPageContent.includes("new Audio"), "SOS page must not create Audio objects");

console.log("Speech & Read-Aloud settings checks passed: shouldSpeak coverage, role preference keys, zero forceAutoRead, and speechSynthesis gating verified.");
