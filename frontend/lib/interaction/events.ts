import { evaluateSession, initialSkill, type SessionEvent, type SkillState } from "./adaptive";
import { dayKey } from "../progress";
import { isCaregiverUnlocked } from "../mode";
import { apiJSON } from "../api";

const PATIENT = "local-patient";
const EVENTS_KEY = `cogniconnect.events:${PATIENT}`;
const skillKey = (game: string) => `cogniconnect.skill:${PATIENT}:${game}`;
const active = new Map<string, string>();

export function readSkill(game: string): SkillState { try { return JSON.parse(localStorage.getItem(skillKey(game)) || "null") || initialSkill(); } catch { return initialSkill(); } }
export function beginAdaptiveSession(game: string): { session: string; difficulty: number } { const session = `${game}-${Date.now()}-${Math.random().toString(36).slice(2)}`; active.set(game, session); return { session, difficulty: Math.max(1, Math.min(4, Math.round(readSkill(game).knob))) }; }
export async function syncAdaptive(game?: string) { if (typeof window === "undefined" || isCaregiverUnlocked()) return; try { const data = await apiJSON<{ games?: Record<string, SkillState> }>("/adaptive", { authRedirect: false }); for (const [key, value] of Object.entries(data.games || {})) localStorage.setItem(skillKey(key), JSON.stringify(value)); if (game) window.dispatchEvent(new Event(`cogniconnect:skill:${game}`)); } catch { /* local cache remains usable offline */ } }
export function recordAnswer(event: Omit<SessionEvent, "id" | "timestamp" | "day" | "patient">): SkillState | null { if (typeof window === "undefined" || isCaregiverUnlocked()) return null; try { const entry: SessionEvent = { ...event, id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, patient: PATIENT, timestamp: Date.now(), day: dayKey(new Date()) }; const events: SessionEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); localStorage.setItem(EVENTS_KEY, JSON.stringify([...(Array.isArray(events) ? events : []), entry].slice(-500))); window.dispatchEvent(new Event("cogniconnect:events")); return readSkill(event.game); } catch { return null; } }
export async function finishAdaptiveSession(game: string): Promise<SkillState | null> { if (typeof window === "undefined" || isCaregiverUnlocked()) return null; const session = active.get(game); if (!session) return readSkill(game); try { const events: SessionEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); const state = evaluateSession(readSkill(game), events.filter(event => event.game === game && event.session === session)); localStorage.setItem(skillKey(game), JSON.stringify(state)); active.delete(game); await apiJSON(`/adaptive/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_id: game, ...state }), authRedirect: false }); return state; } catch { active.delete(game); return readSkill(game); } }
