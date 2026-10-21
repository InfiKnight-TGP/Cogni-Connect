"use client";
import { apiJSON, AUTH_CHANGED, jsonBody, ApiError } from "./api";
import { useAuth } from "./auth-context";
import { canSaveScores } from "./auth-session";
export function isCaregiverUnlocked() { return !canSaveScores(); }
export function useCaregiver(): [boolean, boolean] {
  const { session, ready } = useAuth();
  return [session?.role === "caregiver" || !!session?.elevated, ready];
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
