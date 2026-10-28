import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  filterAlertsToAnnounce,
  getSpokenAlertIds,
  groupAlertsForAnnouncement,
  markAlertsSpoken,
  claimAlertForSpeech,
  planAnnouncements,
  MAX_SPOKEN_IDS,
  MAX_ALERT_AGE_MS,
  SPOKEN_PREFIX,
} from "./sos-voice.ts";

// Simple mock storage for testing
function createMockStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
    _map: map,
  };
}

const mockTranslate = (phrase, values = {}) => {
  return phrase.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
};

// 1. Not spoken twice & 2. IDs capped at 200
{
  const storage = createMockStorage();
  const caregiverId = "cg-123";

  assert.deepEqual(getSpokenAlertIds(storage, caregiverId), []);

  // Mark alerts 1 through 250
  const manyIds = Array.from({ length: 250 }, (_, i) => `alert-${i}`);
  const updated = markAlertsSpoken(storage, caregiverId, manyIds);

  assert.equal(updated.length, MAX_SPOKEN_IDS);
  assert.equal(updated[0], "alert-50");
  assert.equal(updated[updated.length - 1], "alert-249");

  // Read back from storage
  const readBack = getSpokenAlertIds(storage, caregiverId);
  assert.equal(readBack.length, 200);
  assert.equal(readBack.includes("alert-0"), false, "alert-0 should be evicted beyond 200");
  assert.equal(readBack.includes("alert-249"), true);

  // Filter out spoken IDs
  const alerts = [
    { id: "alert-249", patientName: "Alice", createdAt: new Date().toISOString(), test: false, status: "open" },
    { id: "alert-new", patientName: "Alice", createdAt: new Date().toISOString(), test: false, status: "open" },
  ];
  const toAnnounce = filterAlertsToAnnounce(alerts, readBack, { isFirstPoll: false, nowMs: Date.now() });
  assert.equal(toAnnounce.length, 1);
  assert.equal(toAnnounce[0].id, "alert-new");
}

// 3. First-load 10-minute rule
{
  const nowMs = 1_700_000_000_000;
  const recentCreatedAt = new Date(nowMs - 5 * 60 * 1000).toISOString(); // 5 min ago
  const oldCreatedAt = new Date(nowMs - 15 * 60 * 1000).toISOString(); // 15 min ago

  const alerts = [
    { id: "recent", patientName: "Bob", createdAt: recentCreatedAt, test: false, status: "open" },
    { id: "old", patientName: "Charlie", createdAt: oldCreatedAt, test: false, status: "open" },
    { id: "handled", patientName: "Dan", createdAt: recentCreatedAt, test: false, status: "handled" },
  ];

  // First poll: old alerts and handled alerts are excluded
  const firstPollAnnounce = filterAlertsToAnnounce(alerts, [], { isFirstPoll: true, nowMs });
  assert.equal(firstPollAnnounce.length, 1);
  assert.equal(firstPollAnnounce[0].id, "recent");

  // Subsequent poll: older open alerts (not yet in spoken list) are not dropped by first-poll cutoff
  const secondPollAnnounce = filterAlertsToAnnounce(alerts, [], { isFirstPoll: false, nowMs });
  assert.equal(secondPollAnnounce.length, 2); // recent + old (handled is still excluded)
}

// 4. Grouping by patient & 5. Test-alert wording & 7. Location text omitted
{
  const alerts = [
    {
      id: "a1",
      patientName: "Alice Smith",
      createdAt: new Date().toISOString(),
      test: false,
      status: "open",
      location: { lat: 26.1445, lng: 91.7362, accuracy: 12 },
      deviceLabel: "Bedside iPad",
    },
    {
      id: "a2",
      patientName: "Alice Smith",
      createdAt: new Date().toISOString(),
      test: true,
      status: "open",
      location: { lat: 26.1445, lng: 91.7362 },
    },
    {
      id: "t1",
      patientName: "Bob Jones",
      createdAt: new Date().toISOString(),
      test: true,
      status: "open",
      location: { lat: 28.6139, lng: 77.2090 },
      deviceLabel: "Living Room Tablet",
    },
  ];

  const announcements = groupAlertsForAnnouncement(alerts, mockTranslate);
  // Grouped into 2 sentences (1 for Alice, 1 for Bob)
  assert.equal(announcements.length, 2);

  const aliceAnnouncement = announcements.find(a => a.patientName === "Alice Smith");
  assert.ok(aliceAnnouncement);
  assert.deepEqual(aliceAnnouncement.alertIds, ["a1", "a2"]);
  assert.equal(aliceAnnouncement.text, "SOS alert from Alice Smith. Please check on them.");

  const bobAnnouncement = announcements.find(a => a.patientName === "Bob Jones");
  assert.ok(bobAnnouncement);
  assert.deepEqual(bobAnnouncement.alertIds, ["t1"]);
  assert.equal(bobAnnouncement.text, "Test alert from Bob Jones.");

  // Guarantee that NO location, coordinates, or device labels can enter the spoken text
  for (const ann of announcements) {
    assert.doesNotMatch(ann.text, /26\.1445|91\.7362|28\.6139|77\.2090/);
    assert.doesNotMatch(ann.text, /lat|lng|latitude|longitude|accuracy|location|gps|map/i);
    assert.doesNotMatch(ann.text, /ipad|tablet|device|bedside|living room/i);
  }
}

// 6. Tab claim lock (2 simulated tabs)
{
  const sharedStorage = createMockStorage();
  const alertId = "alert-sim-tab";

  // Tab 1 claims and waits 20ms
  const claimPromise1 = claimAlertForSpeech(sharedStorage, alertId, "tab-1", 20);
  const result1 = await claimPromise1;
  assert.equal(result1, true, "tab-1 should succeed when claiming alone");

  // Tab 2 overrides before Tab 3 finishes
  const claimPromise2 = claimAlertForSpeech(sharedStorage, alertId, "tab-2", 40);
  // Meanwhile Tab 3 immediately overwrites the key
  await new Promise(r => setTimeout(r, 10));
  sharedStorage.setItem(`claim-${alertId}`, "tab-3");
  const result2 = await claimPromise2;
  assert.equal(result2, false, "tab-2 should lose because tab-3 overwrote the claim key");
}

// 8. Alerts page silence verification
{
  const pagePath = new URL("../app/caregiver/alerts/page.tsx", import.meta.url);
  const pageContent = await readFile(pagePath, "utf8");

  // Must not have ReadAloud, autoRead, or speechSynthesis
  assert.equal(pageContent.includes("ReadAloud"), false, "alerts page must not contain ReadAloud");
  assert.equal(pageContent.includes("autoRead"), false, "alerts page must not contain autoRead");
  assert.equal(pageContent.includes("speechSynthesis"), false, "alerts page must not contain speechSynthesis");

  // Preference switch presence
  assert.ok(pageContent.includes("Speak new alerts"), "alerts page must include 'Speak new alerts' switch");
}

// 9. Banner wiring static check
{
  const bannerPath = new URL("../components/caregiver/sosAlertBanner.tsx", import.meta.url);
  const bannerContent = await readFile(bannerPath, "utf8");

  assert.ok(bannerContent.includes("planAnnouncements"), "sosAlertBanner must import planAnnouncements");
  assert.match(bannerContent, /const\s*\{\s*toSpeak,\s*toMarkSeen\s*\}\s*=\s*planAnnouncements\(/, "sosAlertBanner must call planAnnouncements on poll");
  assert.match(bannerContent, /markAlertsSpoken\(localStorage,\s*caregiverId,\s*toMarkSeen\)/, "sosAlertBanner must mark toMarkSeen as spoken");
  assert.ok(!bannerContent.includes('"default"'), "sosAlertBanner must not write under default key when caregiverId is unknown");
  assert.match(bannerContent, /if\s*\(!caregiverId\)\s*return;/, "sosAlertBanner must do nothing if caregiverId is unknown");
  assert.match(bannerContent, /if\s*\(rows\.length === 0\)\s*\{\s*isFirstPollRef\.current = false;\s*return;\s*\}/, "sosAlertBanner must mark nothing when poll returns nothing");
}

// 10. planAnnouncements pure helper tests
{
  const storage = createMockStorage();
  const caregiverId = "cg-voice-test";

  // Case (a): Alert arrives while speech is OFF. Setting turns ON. Alert is NOT spoken.
  const poll1Alerts = [
    { id: "alert-1", patientName: "Grandma", createdAt: new Date().toISOString(), test: false, status: "open" },
  ];
  const plan1 = planAnnouncements({
    alerts: poll1Alerts,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: false,
    isFirstPoll: true,
    nowMs: Date.now(),
  });
  assert.deepEqual(plan1.toSpeak, [], "when speech is off, toSpeak must be empty");
  assert.deepEqual(plan1.toMarkSeen, ["alert-1"], "when speech is off, toMarkSeen holds alert-1");
  markAlertsSpoken(storage, caregiverId, plan1.toMarkSeen);

  // Switch turns ON. Next poll returns alert-1 again.
  const plan2 = planAnnouncements({
    alerts: poll1Alerts,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: true,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.deepEqual(plan2.toSpeak, [], "alert-1 that arrived while speech was off is NOT spoken after turning on");
  assert.deepEqual(plan2.toMarkSeen, []);

  // Case (b): New alert arrives in first poll after turning on -> IS spoken once
  const poll3Alerts = [
    { id: "alert-1", patientName: "Grandma", createdAt: new Date().toISOString(), test: false, status: "open" },
    { id: "alert-2", patientName: "Grandpa", createdAt: new Date().toISOString(), test: false, status: "open" },
  ];
  const plan3 = planAnnouncements({
    alerts: poll3Alerts,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: true,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.equal(plan3.toSpeak.length, 1, "new alert-2 must be planned to speak");
  assert.equal(plan3.toSpeak[0].id, "alert-2");
  assert.deepEqual(plan3.toMarkSeen, [], "toMarkSeen is empty when speech is allowed");

  // When utterance starts, alert-2 is marked spoken
  markAlertsSpoken(storage, caregiverId, plan3.toSpeak.map(a => a.id));

  // Subsequent poll with same alerts -> alert-2 is spoken only once
  const plan4 = planAnnouncements({
    alerts: poll3Alerts,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: true,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.deepEqual(plan4.toSpeak, [], "alert-2 must not be spoken again (spoken only once)");
  assert.deepEqual(plan4.toMarkSeen, []);

  // Case (c): Test alerts follow the exact same rules
  const testAlert1 = [
    { id: "test-1", patientName: "Grandma", createdAt: new Date().toISOString(), test: true, status: "open" },
  ];
  // Arrives while off:
  const planTestOff = planAnnouncements({
    alerts: testAlert1,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: false,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.deepEqual(planTestOff.toSpeak, []);
  assert.deepEqual(planTestOff.toMarkSeen, ["test-1"]);
  markAlertsSpoken(storage, caregiverId, planTestOff.toMarkSeen);

  // Setting on:
  const planTestOnOld = planAnnouncements({
    alerts: testAlert1,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: true,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.deepEqual(planTestOnOld.toSpeak, [], "test alert that arrived while off is NOT spoken after turning on");

  // New test alert arriving while on:
  const testAlert2 = [
    { id: "test-2", patientName: "Grandpa", createdAt: new Date().toISOString(), test: true, status: "open" },
  ];
  const planTestOnNew = planAnnouncements({
    alerts: testAlert2,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: true,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.equal(planTestOnNew.toSpeak.length, 1);
  assert.equal(planTestOnNew.toSpeak[0].id, "test-2");

  // Case (d): Speech blocked by browser (needs a click)
  // An alert that is allowed to speak but cannot start must NOT be marked seen until utterance starts.
  const blockedAlert = [
    { id: "blocked-1", patientName: "Alice", createdAt: new Date().toISOString(), test: false, status: "open" },
  ];
  const planBlocked = planAnnouncements({
    alerts: blockedAlert,
    spokenIds: getSpokenAlertIds(storage, caregiverId),
    allowedToSpeak: true,
    isFirstPoll: false,
    nowMs: Date.now(),
  });
  assert.equal(planBlocked.toSpeak.length, 1);
  assert.deepEqual(planBlocked.toMarkSeen, [], "when allowed, toMarkSeen is empty so blocked alert is NOT marked seen");
  assert.equal(getSpokenAlertIds(storage, caregiverId).includes("blocked-1"), false, "blocked alert remains unmarked in storage until utterance starts");
}

console.log("SOS voice checks passed: not spoken twice, capped at 200, 10-min cutoff, patient grouping, test wording, tab lock, location exclusion, page silence, banner wiring, and planAnnouncements rules");


