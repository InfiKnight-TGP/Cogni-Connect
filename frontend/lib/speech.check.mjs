import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  shouldSpeak,
  shouldAutoListenOnQuestionChange,
  BrowserSpeechProvider,
  SpeechError,
} from "./interaction/speech-gate.ts";
import { getPreferenceKey, shouldSyncPreferences } from "./interaction/preferences.ts";

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

// 2. getPreferenceKey logic for each role & key isolation
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

// Caregiver key isolation: two caregivers get different keys, caregiver key never equals patient key
{
  const cgKey1 = getPreferenceKey({ role: "caregiver", user: { id: "cg-1" }, activePatient: { id: "p-1" } });
  const cgKey2 = getPreferenceKey({ role: "caregiver", user: { id: "cg-2" }, activePatient: { id: "p-1" } });
  const patientKey = getPreferenceKey({ role: "patient", user: { id: "cg-1" }, activePatient: { id: "p-1" } });
  const selfKey = getPreferenceKey({ role: "self", user: { id: "cg-1" }, activePatient: { id: "p-1" } });
  const devKey = getPreferenceKey({ role: "patient_device", user: { id: "cg-1" }, activePatient: { id: "p-1" } });

  assert.notEqual(cgKey1, cgKey2, "two caregivers with different user ids must get different keys");
  assert.notEqual(cgKey1, patientKey, "caregiver key must never equal patient key");
  assert.notEqual(cgKey2, patientKey, "caregiver key must never equal patient key");
  assert.notEqual(cgKey1, selfKey, "caregiver key must never equal self key");
  assert.notEqual(cgKey1, devKey, "caregiver key must never equal patient_device key");
}

// 3. BrowserSpeechProvider.speak fail-closed tests
{
  let speakCalls = 0;
  const mockSynth = {
    getVoices: () => [{ lang: "en-US" }],
    speak: (utterance) => {
      speakCalls++;
      setTimeout(() => {
        utterance.onend?.();
      }, 0);
    },
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window = { speechSynthesis: mockSynth };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = "en";
      this.rate = 1;
      this.onend = null;
      this.onerror = null;
    }
  };

  const provider = new BrowserSpeechProvider();

  // Without options -> rejects SpeechError("cancelled"), 0 speak calls
  await assert.rejects(
    async () => { await provider.speak("Hello", "en", undefined, 1, undefined); },
    (err) => err instanceof SpeechError && err.reason === "cancelled",
    "provider.speak without options must reject with SpeechError('cancelled')"
  );
  assert.equal(speakCalls, 0, "synth.speak must not be called when options are missing");

  // Options with readAloudSetting: false -> rejects SpeechError("cancelled"), 0 speak calls
  await assert.rejects(
    async () => { await provider.speak("Hello", "en", undefined, 1, { role: "patient", readAloudSetting: false }); },
    (err) => err instanceof SpeechError && err.reason === "cancelled",
    "provider.speak with readAloudSetting: false must reject with SpeechError('cancelled')"
  );
  assert.equal(speakCalls, 0, "synth.speak must not be called when readAloudSetting is false");

  // Options with readAloudSetting: true and valid role -> calls synth.speak once
  const ts = await provider.speak("Hello", "en", undefined, 1, { role: "patient", readAloudSetting: true });
  assert.ok(typeof ts === "number", "speak with readAloudSetting: true returns timestamp");
  assert.equal(speakCalls, 1, "synth.speak must be called once when enabled");
}

// 4. shouldSyncPreferences pure function tests
assert.equal(
  shouldSyncPreferences({ role: "caregiver", activePatient: { id: "p-1" } }),
  false,
  "caregiver must not sync preferences to server"
);
assert.equal(
  shouldSyncPreferences({ role: "self", activePatient: { id: "p-1" } }),
  true,
  "self with active patient must sync preferences to server"
);
assert.equal(
  shouldSyncPreferences({ role: "patient_device", activePatient: { id: "p-1" } }),
  true,
  "patient_device with active patient must sync preferences to server"
);
assert.equal(
  shouldSyncPreferences({ role: "self", activePatient: null }),
  false,
  "no active patient must not sync preferences"
);
assert.equal(
  shouldSyncPreferences({ role: "patient_device" }),
  false,
  "missing active patient must not sync preferences"
);
assert.equal(
  shouldSyncPreferences(null),
  false,
  "null session must not sync preferences"
);
assert.equal(
  shouldSyncPreferences(undefined),
  false,
  "undefined session must not sync preferences"
);

// 5. VoiceQuestion auto-listen flow check with mocked listen function
// 5a. shouldAutoListenOnQuestionChange requires listenAutomatically to be true
assert.equal(
  shouldAutoListenOnQuestionChange({
    readAloud: false,
    answerBySpeaking: true,
    listenAutomatically: false,
    allowAnswer: true,
    disabled: false,
    lastQuestion: null,
    newQuestion: "What day is it today?",
  }),
  false,
  "shouldAutoListenOnQuestionChange must return false when listenAutomatically is false"
);

assert.equal(
  shouldAutoListenOnQuestionChange({
    readAloud: false,
    answerBySpeaking: true,
    listenAutomatically: true,
    allowAnswer: true,
    disabled: false,
    lastQuestion: null,
    newQuestion: "What day is it today?",
  }),
  true,
  "shouldAutoListenOnQuestionChange must return true when readAloud is off and answerBySpeaking + listenAutomatically are on"
);

{
  function createVoiceQuestionFlow({ readAloud, answerBySpeaking, listenAutomatically = true, allowAnswer = true, disabled = false }) {
    let listenCallCount = 0;
    let cancelCallCount = 0;
    let lastQuestion = null;

    const mockListen = () => { listenCallCount++; };
    const mockCancel = () => { cancelCallCount++; };

    const onQuestionChange = (newQuestion) => {
      if (lastQuestion !== null && lastQuestion !== newQuestion) {
        mockCancel();
      }
      if (shouldAutoListenOnQuestionChange({
        readAloud,
        answerBySpeaking,
        listenAutomatically,
        allowAnswer,
        disabled,
        lastQuestion,
        newQuestion,
      })) {
        lastQuestion = newQuestion;
        mockListen();
      } else {
        lastQuestion = newQuestion;
      }
    };

    const onReadComplete = () => {
      const automaticListen = allowAnswer && !disabled && answerBySpeaking && listenAutomatically;
      if (automaticListen) mockListen();
    };

    const unmount = () => {
      mockCancel();
    };

    return {
      getListenCount: () => listenCallCount,
      getCancelCount: () => cancelCallCount,
      onQuestionChange,
      onReadComplete,
      unmount,
    };
  }

  // Flow 1: speech off plus answerBySpeaking on starts listening once
  {
    const flow = createVoiceQuestionFlow({ readAloud: false, answerBySpeaking: true, listenAutomatically: true });
    flow.onQuestionChange("What day is it today?");
    assert.equal(flow.getListenCount(), 1, "speech off plus answerBySpeaking on starts listening once");

    // Same question re-render does not start again
    flow.onQuestionChange("What day is it today?");
    assert.equal(flow.getListenCount(), 1, "re-rendering with same question does not start listen again");

    // Question changed starts listening once for new question
    flow.onQuestionChange("Where are you now?");
    assert.equal(flow.getListenCount(), 2, "question change starts listening once for new question");
    assert.equal(flow.getCancelCount(), 1, "question change cancels pending listen");

    flow.unmount();
    assert.equal(flow.getCancelCount(), 2, "unmount cancels pending listen");
  }

  // Flow 2: speech off plus answerBySpeaking off never starts it
  {
    const flow = createVoiceQuestionFlow({ readAloud: false, answerBySpeaking: false, listenAutomatically: true });
    flow.onQuestionChange("What day is it today?");
    assert.equal(flow.getListenCount(), 0, "speech off plus answerBySpeaking off never starts listening");
    flow.onQuestionChange("Where are you now?");
    assert.equal(flow.getListenCount(), 0, "question change with answerBySpeaking off never starts listening");
  }

  // Flow 3: speech on keeps today's flow (listen after the read completes)
  {
    const flow = createVoiceQuestionFlow({ readAloud: true, answerBySpeaking: true, listenAutomatically: true });
    flow.onQuestionChange("What day is it today?");
    assert.equal(flow.getListenCount(), 0, "speech on does not start listen from effect");

    // Read completes -> starts listen once
    flow.onReadComplete();
    assert.equal(flow.getListenCount(), 1, "speech on starts listen after read completes");
  }

  // Flow 4: StrictMode simulated lifecycle (mount -> synchronous cleanup before timeout -> remount)
  {
    let listenCallCount = 0;
    let cancelCallCount = 0;
    let pendingTimer = null;
    let lastQuestion = null;

    const mockListen = () => { listenCallCount++; };
    const mockCancel = () => { cancelCallCount++; };

    const simulateMount = (question) => {
      if (shouldAutoListenOnQuestionChange({
        readAloud: false,
        answerBySpeaking: true,
        listenAutomatically: true,
        allowAnswer: true,
        disabled: false,
        lastQuestion,
        newQuestion: question,
      })) {
        pendingTimer = setTimeout(() => {
          lastQuestion = question;
          mockListen();
        }, 0);
      }
    };

    const simulateCleanup = () => {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      mockCancel();
    };

    // First mount
    simulateMount("Question 1");
    // Synchronous unmount in React Strict Mode before the 0ms timeout fires
    simulateCleanup();
    assert.equal(listenCallCount, 0, "no listen calls after synchronous unmount in Strict Mode");
    assert.equal(lastQuestion, null, "lastQuestion remains null when timer was cleared before execution");

    // Remount with same question in Strict Mode
    simulateMount("Question 1");
    // Wait for the scheduled 0ms timeout to fire
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(listenCallCount, 1, "remount fires listen exactly once after Strict Mode cycle");
    assert.equal(lastQuestion, "Question 1", "lastQuestion is set when timeout executes");
  }
}

// 6. Static checks across frontend
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
  join(frontendRoot, "lib", "interaction", "speech-gate.ts"),
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

  // C: ReadAloud is the only caller of provider.speak
  const isSpeechFile = rel === "lib/interaction/speech.ts" || rel === "lib/interaction/speech-gate.ts";
  const isReadAloud = rel === "components/interaction/ReadAloud.tsx";
  const isCheckFile = rel.endsWith(".check.mjs") || rel.endsWith(".check.ts");

  if (!isSpeechFile && !isReadAloud && !isCheckFile) {
    assert.doesNotMatch(
      content,
      /provider\.speak\s*\(/,
      `${rel} must not call provider.speak (ReadAloud is the only caller)`
    );
  }

  // D: No caller treats SpeechError("cancelled") as a visible error
  if (!isCheckFile) {
    assert.doesNotMatch(
      content,
      /reason\s*===\s*["']cancelled["']\s*\?\s*t\(/,
      `${rel} must not show visible message for SpeechError('cancelled')`
    );
  }

  // E: Static check that no call to speech provider .speak( omits the options argument
  if (!isCheckFile) {
    const speakCalls = content.matchAll(/(?:provider|this\.browser)\.speak\s*\(([^;]+?)\);/gs);
    for (const match of speakCalls) {
      const callArgs = match[1];
      const hasOptions = /,\s*(\{[^}]*\}|\boptions\b)\s*$/s.test(callArgs.trim());
      assert.ok(
        hasOptions,
        `${rel} calls .speak(${callArgs.trim()}) but omits the required options argument`
      );
    }
  }
}

// 7. ReadAloud explicitly ignores cancelled errors
const readAloudContent = await readFile(join(frontendRoot, "components", "interaction", "ReadAloud.tsx"), "utf8");
assert.ok(
  readAloudContent.includes('error.reason !== "cancelled"'),
  "ReadAloud must ignore SpeechError cancelled and not show visible message"
);

// 8. Silent SOS screen check
const sosPageContent = await readFile(join(frontendRoot, "app", "sos", "page.tsx"), "utf8");
assert.ok(!sosPageContent.includes("autoRead={true}"), "SOS page must not have autoRead={true}");
assert.ok(!sosPageContent.includes("speechSynthesis"), "SOS page must not have speechSynthesis");
assert.ok(!sosPageContent.includes("new Audio"), "SOS page must not create Audio objects");

console.log("Speech & Read-Aloud settings checks passed: shouldSpeak coverage, role preference keys, zero forceAutoRead, fail-closed speak, preference isolation, VoiceQuestion flow, and ReadAloud speak exclusivity verified.");
