import { acknowledge, enqueue, type QueueState, type SupportRecord } from "./sync";
export type Account = { username: string; role: "patient" | "caregiver"; patient: string };
const empty = (): QueueState => ({ records: [], pending: {} });
const key = (patient: string) => `cogni:support:${patient}`;
export function readSupport(patient: string): QueueState {
  const data = localStorage.getItem(key(patient));
  return data ? JSON.parse(data) : empty();
}
function save(patient: string, value: QueueState) {
  localStorage.setItem(key(patient), JSON.stringify(value));
  window.dispatchEvent(new Event("cogni:support"));
}
export function putSupport(patient: string, kind: string, data: Record<string, unknown>, id = crypto.randomUUID()): SupportRecord {
  const record = { id, kind, data, updatedAt: Date.now() };
  save(patient, enqueue(readSupport(patient), record));
  return record;
}
export async function platformRequest(path: string, data?: unknown) {
  const response = await fetch(`/platform-api${path}`, { method: data === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-Cogni-Request": "1" }, credentials: "same-origin", body: data === undefined ? undefined : JSON.stringify(data) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Please try again when connected");
  return value;
}
const inflight = new Map<string, Promise<void>>();
export function syncSupport(patient: string): Promise<void> {
  const running = inflight.get(patient); if (running) return running;
  const work = (async () => {
    // Verify the live account before sending any cached patient data.
    const account: Account = await platformRequest("/auth/me");
    if (account.patient !== patient) throw new Error("Sign in to this patient profile before syncing");
    const remote = await platformRequest("/records");
    save(patient, acknowledge(readSupport(patient), remote.records, []));
    // Pull revocations before uploading. Keep excluded local records on the device.
    const consent = (remote.records as SupportRecord[]).find(row => row.id === "location-consent")?.data;
    const before = readSupport(patient);
    const sent = before.records.filter(row => before.pending[row.id] === row.updatedAt)
      .filter(row => account.role === "caregiver" || !["default", "reminder", "message", "consent"].includes(row.kind))
      .filter(row => row.kind !== "location" || consent?.sync === true)
      .sort((a, b) => Number(b.kind === "sos") - Number(a.kind === "sos")).slice(0, 100);
    for (const row of sent) {
      if (row.kind === "sos" && !consent?.sync && row.data.location) {
        row.data = { ...row.data, location: null };
      }
    }
    for (const row of sent) {
      const media = row.data.media as { id?: string } | undefined;
      if (media?.id) {
        const blob = await loadMedia(media.id);
        if (blob) {
          const response = await fetch(`/platform-api/media/${encodeURIComponent(media.id)}`, { method: "POST", headers: { "Content-Type": blob.type, "X-Cogni-Request": "1" }, credentials: "same-origin", body: blob });
          if (!response.ok) throw new Error("Recording upload did not finish. It remains saved on this device.");
        }
      }
    }
    const response = await platformRequest("/records", { records: sent });
    save(patient, acknowledge(readSupport(patient), response.records, sent));
  })().finally(() => inflight.delete(patient));
  inflight.set(patient, work); return work;
}

export async function saveMedia(id: string, blob: Blob): Promise<void> {
  const db = await mediaDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("media", "readwrite"); tx.objectStore("media").put(blob, id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  db.close();
}
export async function loadMedia(id: string): Promise<Blob | undefined> {
  const db = await mediaDatabase();
  try { return await new Promise((resolve, reject) => { const request = db.transaction("media").objectStore("media").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
function mediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("cogni-private-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
