export type ActivitySession = {
  session_id: string;
  started_at: string;
  ended_at?: string;
};

const ACTIVE_SESSION_KEY = "cogniconnect.activeSession.v1";
const SESSION_HISTORY_KEY = "cogniconnect.sessionHistory.v1";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function rememberSession(session: ActivitySession) {
  const history = readSessionHistory();
  const withoutDuplicate = history.filter((item) => item.session_id !== session.session_id);
  localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify([session, ...withoutDuplicate].slice(0, 50)));
}

export function readActiveSession(): ActivitySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw ? (JSON.parse(raw) as ActivitySession) : null;
  } catch {
    return null;
  }
}

export function readSessionHistory(): ActivitySession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.filter((item) => typeof item?.session_id === "string") : [];
  } catch {
    return [];
  }
}

export function startNewSession(): ActivitySession {
  const session = { session_id: createId(), started_at: new Date().toISOString() };
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  rememberSession(session);
  return session;
}

export function getOrStartSession(): ActivitySession {
  if (typeof window === "undefined") return { session_id: "", started_at: new Date().toISOString() };
  const existing = readActiveSession();
  if (existing && !existing.ended_at) return existing;
  return startNewSession();
}

export function endActiveSession(): ActivitySession | null {
  const active = readActiveSession();
  if (!active) return null;
  const ended = { ...active, ended_at: new Date().toISOString() };
  rememberSession(ended);
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  return ended;
}
