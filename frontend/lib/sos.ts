export const SOS_HOLD_MS = 3_000;
export const SOS_COUNTDOWN_MS = 5_000;

export function sosHoldReady(heldMilliseconds: number) {
  return Number.isFinite(heldMilliseconds) && heldMilliseconds >= SOS_HOLD_MS;
}

export function holdProgress(heldMs: number, totalMs = SOS_HOLD_MS) {
  if (!Number.isFinite(heldMs) || !Number.isFinite(totalMs) || totalMs <= 0) return 0;
  return Math.min(100, Math.max(0, (heldMs / totalMs) * 100));
}

export function remainingSeconds(startMs: number, nowMs: number, totalMs = SOS_COUNTDOWN_MS) {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs) || !Number.isFinite(totalMs)) return 0;
  const elapsed = nowMs - startMs;
  const remaining = totalMs - elapsed;
  if (remaining <= 0) return 0;
  return Math.min(Math.ceil(totalMs / 1000), Math.ceil(remaining / 1000));
}

export function shouldSend(startMs: number, nowMs: number, totalMs = SOS_COUNTDOWN_MS) {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs) || !Number.isFinite(totalMs)) return false;
  return nowMs - startMs >= totalMs;
}

export function shouldRetry(status?: number | null) {
  if (status === undefined || status === null || status === 0 || !Number.isFinite(status)) {
    return true; // Network failure or client error without HTTP status
  }
  return status >= 500 && status <= 599; // Only 5xx server errors
}

export function canUseSos(role: string | null | undefined) {
  // Patient logins and paired devices share this session role. Self-care does not.
  return role === "patient_device";
}

export function cleanupHoldOnUnmount<T extends { holdInterval: number | null }>(
  timers: T,
  clearIntervalFn: (id: number) => void = clearInterval
): T {
  if (timers.holdInterval !== null) {
    clearIntervalFn(timers.holdInterval);
  }
  return {
    ...timers,
    holdInterval: null,
  };
}

export function shouldAcceptPosition(
  cancelled: boolean,
  currentRunId: number,
  capturedRunId: number
): boolean {
  return !cancelled && currentRunId === capturedRunId;
}

