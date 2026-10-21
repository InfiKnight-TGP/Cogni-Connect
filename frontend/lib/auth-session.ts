export type Patient = { id: string; name: string; role?: "owner" | "caregiver" };
export type AuthSession = {
  role: "caregiver" | "patient_device";
  user: { id: string; name: string; email: string } | null;
  patients: Patient[]; activePatient: Patient | null; elevated: boolean;
};
let session: AuthSession | null = null;
export function setSessionSnapshot(value: AuthSession | null) { session = value; }
// Fail closed until /auth/me establishes an unelevated patient-device session.
export function canSaveScores() { return session?.role === "patient_device" && !session.elevated; }
export const PUBLIC_ROUTES = new Set(["/welcome", "/login", "/signup", "/verify", "/forgot", "/reset", "/pair", "/about", "/terms", "/privacy"]);
