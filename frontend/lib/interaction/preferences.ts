export type InteractionMode = "read" | "voice" | "mixed";
export type Preferences = { mode: InteractionMode; language: string; textSize: "large" | "larger"; updatedAt: number; override: boolean };
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;
export const defaultPreferences: Preferences = { mode: "read", language: "en", textSize: "large", updatedAt: 0, override: false };
export const preferenceKey = (patient: string) => `cogni:preferences:${encodeURIComponent(patient)}`;

export function readPreferences(storage: KeyValueStore, patient: string): Preferences {
  try {
    const value = JSON.parse(storage.getItem(preferenceKey(patient)) || "null");
    if (!value || !["read", "voice", "mixed"].includes(value.mode) || !Number.isFinite(value.updatedAt)) return { ...defaultPreferences };
    return { ...defaultPreferences, ...value };
  } catch { return { ...defaultPreferences }; }
}

export function writePreferences(storage: KeyValueStore, patient: string, value: Preferences): void {
  storage.setItem(preferenceKey(patient), JSON.stringify(value));
}

/** Caregiver defaults never erase an explicit patient choice, including mid-game. */
export function mergePreferences(local: Preferences, remote: Preferences): Preferences {
  if (local.override && !remote.override) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}
