/** Pure helpers and tab coordination for SOS alert voice announcements. */

export type SosAlert = {
  id: string;
  patientId?: string;
  patientName: string;
  createdAt: string;
  test: boolean;
  status: "open" | "handled";
  location?: { lat: number; lng: number; accuracy?: number };
  deviceLabel?: string;
};

export const SPOKEN_PREFIX = "cogni-sos-spoken-";
export const VOICE_ENABLED_PREFIX = "cogni-sos-voice-enabled-";
export const CLAIM_PREFIX = "claim-";
export const MAX_SPOKEN_IDS = 200;
export const MAX_ALERT_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function getSpokenAlertIds(storage: Pick<Storage, "getItem"> | null | undefined, caregiverId: string): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(`${SPOKEN_PREFIX}${caregiverId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markAlertsSpoken(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  caregiverId: string,
  alertIds: string[]
): string[] {
  if (!storage || alertIds.length === 0) return [];
  const current = getSpokenAlertIds(storage, caregiverId);
  const updated = Array.from(new Set([...current, ...alertIds])).slice(-MAX_SPOKEN_IDS);
  try {
    storage.setItem(`${SPOKEN_PREFIX}${caregiverId}`, JSON.stringify(updated));
  } catch {
    /* Ignore quota errors */
  }
  return updated;
}

export function filterAlertsToAnnounce(
  alerts: SosAlert[],
  spokenIds: string[] | Set<string>,
  options: { isFirstPoll: boolean; nowMs: number; maxAgeMs?: number }
): SosAlert[] {
  const spokenSet = spokenIds instanceof Set ? spokenIds : new Set(spokenIds);
  const maxAge = options.maxAgeMs ?? MAX_ALERT_AGE_MS;
  return alerts.filter(alert => {
    if (alert.status !== "open") return false;
    if (spokenSet.has(alert.id)) return false;
    if (options.isFirstPoll) {
      const created = Date.parse(alert.createdAt);
      if (Number.isNaN(created) || options.nowMs - created > maxAge) {
        return false;
      }
    }
    return true;
  });
}

export type Announcement = {
  patientName: string;
  text: string;
  alertIds: string[];
  testOnly: boolean;
  createdAtMs: number;
};

export function groupAlertsForAnnouncement(
  alerts: SosAlert[],
  t: (phrase: string, values?: Record<string, string | number>) => string
): Announcement[] {
  const byPatient = new Map<string, SosAlert[]>();
  for (const alert of alerts) {
    const name = alert.patientName || "Patient";
    const list = byPatient.get(name) ?? [];
    list.push(alert);
    byPatient.set(name, list);
  }

  const announcements: Announcement[] = [];
  Array.from(byPatient.entries()).forEach(([patientName, patientAlerts]) => {
    const allTest = patientAlerts.every((a: SosAlert) => a.test);
    const alertIds = patientAlerts.map((a: SosAlert) => a.id);
    const createdAtMs = Math.max(...patientAlerts.map((a: SosAlert) => Date.parse(a.createdAt) || 0));

    // Construct text using t() template:
    // "Test alert from {name}." or "SOS alert from {name}. Please check on them."
    // Strictly contains no location, coordinates, or device details.
    const text = allTest
      ? t("Test alert from {name}.", { name: patientName })
      : t("SOS alert from {name}. Please check on them.", { name: patientName });

    announcements.push({
      patientName,
      text,
      alertIds,
      testOnly: allTest,
      createdAtMs,
    });
  });
  return announcements;
}

export async function claimAlertForSpeech(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  alertId: string,
  tabId: string,
  waitMs = 50
): Promise<boolean> {
  if (!storage) return true;
  const key = `${CLAIM_PREFIX}${alertId}`;
  try {
    storage.setItem(key, tabId);
  } catch {
    return true;
  }
  await new Promise(resolve => setTimeout(resolve, waitMs));
  try {
    const readBack = storage.getItem(key);
    return readBack === tabId;
  } catch {
    return true;
  }
}
