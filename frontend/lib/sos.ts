export const SOS_HOLD_MS = 3_000;

export function sosHoldReady(heldMilliseconds: number) {
  return Number.isFinite(heldMilliseconds) && heldMilliseconds >= SOS_HOLD_MS;
}

export function canUseSos(role: string | null | undefined) {
  // Patient logins and paired devices share this session role. Self-care does not.
  return role === "patient_device";
}
