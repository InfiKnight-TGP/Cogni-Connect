"use client";
import { apiJSON, AUTH_CHANGED, jsonBody, ApiError } from "./api";
import { useAuth } from "./auth-context";
import { canSaveScores } from "./auth-session";
/** Device caregiver access is retained in the code but hidden until the device flow is ready. */
export const SHOW_DEVICE_CAREGIVER_ACCESS = false;
export function isCaregiverUnlocked() { return !canSaveScores(); }
export function useCaregiver(): [boolean, boolean] {
  const { session, ready } = useAuth();
  const deviceCaregiver = SHOW_DEVICE_CAREGIVER_ACCESS && session?.role === "patient_device" && !!session?.elevated;
  return [session?.role === "caregiver" || deviceCaregiver, ready];
}
export async function unlockCaregiver(pin: string): Promise<"ok" | "wrong" | "offline"> {
  try {
    await apiJSON("/caregiver/unlock", jsonBody({ pin }));
    window.dispatchEvent(new Event(AUTH_CHANGED)); return "ok";
  } catch (error) { return error instanceof ApiError ? "wrong" : "offline"; }
}
export async function lockCaregiver() {
  await apiJSON("/caregiver/lock", jsonBody({})); window.location.assign("/");
}
