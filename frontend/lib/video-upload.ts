import type { AuthSession } from "./auth-session";

export const ALLOWED_VIDEO_TYPES = [".mp4", ".mov", ".webm"];
export const MAX_UPLOAD_MB_REGULAR = 200;
export const MAX_UPLOAD_MB_DEMO = 20;
export const MAX_VIDEO_SECONDS = 180; // 3 minutes
export const MAX_NOTE_LENGTH = 300;
export const MAX_POLL_DURATION_SECONDS = 1800; // 30 minutes

export function canManageMemories(session: AuthSession | null): boolean {
  return session?.role === "self";
}

export function validateVideoFile(file: { name: string; size: number } | null | undefined, isDemo = false): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "Video file is required." };
  }
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_VIDEO_TYPES.includes(ext)) {
    return { valid: false, error: "Invalid video file. Please choose an MP4, MOV, or WEBM file." };
  }
  const maxMb = isDemo ? MAX_UPLOAD_MB_DEMO : MAX_UPLOAD_MB_REGULAR;
  if (file.size > maxMb * 1024 * 1024) {
    return { valid: false, error: `Video exceeds maximum upload size of ${maxMb} MB.` };
  }
  return { valid: true };
}

export function validateMemoryDate(dateStr: string, clientToday: Date = new Date()): { valid: boolean; error?: string; cleaned?: string } {
  if (!dateStr || !dateStr.trim()) {
    return { valid: false, error: "Date is required." };
  }
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { valid: false, error: "Date must be in YYYY-MM-DD format." };
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const selectedDate = new Date(year, month, day);
  if (selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month || selectedDate.getDate() !== day) {
    return { valid: false, error: "Date must be in YYYY-MM-DD format." };
  }

  // Allow up to client's today + 2 days
  const maxDate = new Date(clientToday.getFullYear(), clientToday.getMonth(), clientToday.getDate() + 2, 23, 59, 59, 999);
  if (selectedDate.getTime() > maxDate.getTime()) {
    return { valid: false, error: "Date cannot be more than 2 days in the future." };
  }
  return { valid: true, cleaned: trimmed };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const formatLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Resolves the date string ("yyyy-MM-dd") when a file is selected for upload.
 * - Formats the file's lastModified timestamp as local yyyy-MM-dd (never toISOString).
 * - Never overwrites a date the user already changed by hand (hasManualDateChange = true).
 * - If lastModified is missing, not a finite positive number, or in the future compared to clientToday, keeps clientToday.
 */
export function resolveUploadDate(
  file: { lastModified?: number | null } | null | undefined,
  currentDate: string,
  hasManualDateChange: boolean,
  clientToday: Date = new Date()
): string {
  if (hasManualDateChange) {
    return currentDate;
  }
  const todayKey = formatLocalDate(clientToday);
  if (!file || typeof file.lastModified !== "number" || isNaN(file.lastModified) || file.lastModified <= 0) {
    return todayKey;
  }
  if (file.lastModified > clientToday.getTime()) {
    return todayKey;
  }
  return formatLocalDate(new Date(file.lastModified));
}

export function validateMemoryNote(note: string | null | undefined): { valid: boolean; error?: string; cleaned: string } {
  if (!note) {
    return { valid: true, cleaned: "" };
  }
  const cleaned = note.replace(/[\x00-\x1f\x7f]/g, " ").trim();
  if (cleaned.length > MAX_NOTE_LENGTH) {
    return { valid: false, error: `Note must be up to ${MAX_NOTE_LENGTH} characters.`, cleaned };
  }
  return { valid: true, cleaned };
}

export function shouldPoll(status: string, isVisible: boolean, elapsedSeconds: number): boolean {
  if (status !== "processing") return false;
  if (!isVisible) return false;
  if (elapsedSeconds >= MAX_POLL_DURATION_SECONDS) return false;
  return true;
}

export function getNextPollDelay(currentDelay: number): number {
  return Math.min(Math.round(currentDelay * 1.5), 10000);
}

export function getFriendlyErrorMessage(status: number | string, defaultMsg = "Could not process this video"): string {
  const code = typeof status === "number" ? status : parseInt(status, 10);
  switch (code) {
    case 400:
      return "Invalid video or date format.";
    case 403:
      return "You do not have permission to modify this memory.";
    case 409:
      return "A video is already being processed. Please wait for it to finish.";
    case 413:
      return "Video exceeds the maximum size limit.";
    case 429:
      return "Upload limit reached for today.";
    case 507:
      return "Insufficient server disk space. Please remove old memories or try again later.";
    default:
      return defaultMsg;
  }
}
