import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  filterAlertsToAnnounce,
  getSpokenAlertIds,
  groupAlertsForAnnouncement,
  markAlertsSpoken,
  claimAlertForSpeech,
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

// 8. Alerts page silence verification (Item 1)
{
  const pagePath = new URL("../app/caregiver/alerts/page.tsx", import.meta.url);
  const pageContent = await readFile(pagePath, "utf8");

  // Must not have autoRead={true} or forceAutoRead
  assert.equal(pageContent.includes("autoRead={true}"), false, "alerts page must not contain autoRead={true}");
  assert.equal(pageContent.includes("forceAutoRead"), false, "alerts page must not contain forceAutoRead");

  // Every ReadAloud invocation must explicitly set autoRead={false}
  const readAloudTags = [...pageContent.matchAll(/<ReadAloud\b[^>]*>/g)].map(m => m[0]);
  assert.ok(readAloudTags.length > 0, "alerts page should retain ReadAloud buttons");
  for (const tag of readAloudTags) {
    assert.ok(tag.includes("autoRead={false}"), `ReadAloud tag ${tag} must explicitly specify autoRead={false}`);
  }

  // Preference switch and notice presence
  assert.ok(pageContent.includes("Speak new alerts"), "alerts page must include 'Speak new alerts' switch");
  assert.ok(pageContent.includes("Click anywhere on this page once to allow voice alerts."), "alerts page must include audio interaction notice");
}

console.log("SOS voice checks passed: not spoken twice, capped at 200, 10-min cutoff, patient grouping, test wording, tab lock, location exclusion, and page silence");
