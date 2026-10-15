import { acknowledge, enqueue, type QueueState, type SupportRecord } from "./sync";
export type Account = { username: string; role: "patient" | "caregiver"; patient: string };

// ── Storage helpers ───────────────────────────────────────────────────────────

const empty = (): QueueState => ({ records: [], pending: {} });
const key = (patient: string) => `cogni:support:${patient}`;

export function readSupport(patient: string): QueueState {
  try {
    const data = localStorage.getItem(key(patient));
    return data ? (JSON.parse(data) as QueueState) : empty();
  } catch {
    return empty();
  }
}

function save(patient: string, value: QueueState) {
  try {
    localStorage.setItem(key(patient), JSON.stringify(value));
  } catch {
    // Storage full — still dispatch so UI can show a warning.
  }
  window.dispatchEvent(new Event("cogni:support"));
}

export function putSupport(
  patient: string,
  kind: string,
  data: Record<string, unknown>,
  id = crypto.randomUUID(),
): SupportRecord {
  const record = { id, kind, data, updatedAt: Date.now() };
  save(patient, enqueue(readSupport(patient), record));
  return record;
}

// ── Consent revocation ────────────────────────────────────────────────────────

/**
 * Called immediately when location consent is revoked.
 * Removes all pending location records from the offline queue so they
 * are never uploaded to the server.  Records already on the server are
 * not affected here — the server enforces the same gate on its own.
 */
export function clearPendingLocationRecords(patient: string): void {
  try {
    const state = readSupport(patient);
    const filtered = state.records.filter(row => row.kind !== "location");
    const pendingFiltered = { ...state.pending };
    for (const row of state.records) {
      if (row.kind === "location") delete pendingFiltered[row.id];
    }
    save(patient, { records: filtered, pending: pendingFiltered });
    // Also wipe device-only local location cache for this patient.
    localStorage.removeItem(`cogni:local-locations:${patient}`);
  } catch {
    // If storage is unavailable we cannot clear — the server will still block upload.
  }
}

// ── Platform HTTP ─────────────────────────────────────────────────────────────

export async function platformRequest(path: string, data?: unknown, patient?: string) {
  const response = await fetch(`/platform-api${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cogni-Request": "1",
      ...(patient ? { "X-Cogni-Patient": patient } : {}),
    },
    credentials: "same-origin",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Please try again when connected");
  return value;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<void>>();

export function syncSupport(patient: string): Promise<void> {
  const running = inflight.get(patient);
  if (running) return running;

  const work = (async () => {
    // 1. Verify the live account BEFORE sending any cached patient data.
    //    If the signed-in user changed since we last synced, abort immediately.
    const account: Account = await platformRequest("/auth/me");
    if (account.patient !== patient) {
      throw new Error(
        "The signed-in profile changed. Sign in to this patient profile before syncing.",
      );
    }

    // 2. Pull server state and merge it locally (last-write-wins).
    const remote = await platformRequest("/records", undefined, patient);
    save(patient, acknowledge(readSupport(patient), remote.records as SupportRecord[], []));

    // 3. Determine consent state AFTER the pull, so we respect any revocation.
    const consent = (remote.records as SupportRecord[]).find(
      row => row.id === "location-consent",
    )?.data;

    // If consent was revoked, wipe pending location records before we build the send list.
    if (!consent?.sync) {
      clearPendingLocationRecords(patient);
    }

    // 4. Build the upload list.
    const before = readSupport(patient);
    const caregiver = account.role === "caregiver";
    const CAREGIVER_ONLY = new Set(["default", "reminder", "message", "consent"]);
    let sent = before.records
      .filter(row => before.pending[row.id] === row.updatedAt)
      .filter(row => caregiver || !CAREGIVER_ONLY.has(row.kind))
      .filter(row => row.kind !== "location" || consent?.sync === true)
      // SOS alerts go first so caregivers are notified even if the batch is cut short.
      .sort((a, b) => Number(b.kind === "sos") - Number(a.kind === "sos"))
      .slice(0, 100);

    // Strip embedded location coordinates from SOS alerts when sync is not consented.
    sent = sent.map(row => {
      if (row.kind === "sos" && !consent?.sync && row.data.location) {
        return { ...row, data: { ...row.data, location: null } };
      }
      return row;
    });

    // 5. Upload any attached media blobs first.
    for (const row of sent) {
      const media = row.data.media as { id?: string } | undefined;
      if (media?.id) {
        const blob = await loadMedia(media.id);
        if (blob) {
          const resp = await fetch(
            `/platform-api/media/${encodeURIComponent(media.id)}`,
            {
              method: "POST",
              headers: {
                "Content-Type": blob.type,
                "X-Cogni-Request": "1",
                "X-Cogni-Patient": patient,
              },
              credentials: "same-origin",
              body: blob,
            },
          );
          if (!resp.ok) {
            throw new Error(
              "Recording upload did not finish. It remains saved on this device.",
            );
          }
        }
      }
    }

    // 6. Upload records and acknowledge what the server confirms.
    const response = await platformRequest("/records", { records: sent }, patient);
    save(
      patient,
      acknowledge(readSupport(patient), response.records as SupportRecord[], sent),
    );
  })().finally(() => inflight.delete(patient));

  inflight.set(patient, work);
  return work;
}

// ── Media ─────────────────────────────────────────────────────────────────────

export async function saveMedia(id: string, blob: Blob): Promise<void> {
  const db = await mediaDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function loadMedia(id: string): Promise<Blob | undefined> {
  const db = await mediaDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("media").objectStore("media").get(id);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function mediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("cogni-private-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
