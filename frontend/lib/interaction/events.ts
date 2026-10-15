import { adapt, initialSkill, type SessionEvent, type SkillState } from "./adaptive";
import { dayKey } from "../progress";
import { isCaregiverUnlocked } from "../mode";

const PATIENT = "local-patient";
const EVENTS_KEY = `cogniconnect.events:${PATIENT}`;
const skillKey = (domain: string) => `cogniconnect.skill:${PATIENT}:${domain}`;

export function readSkill(domain: string): SkillState {
  try {
    return JSON.parse(localStorage.getItem(skillKey(domain)) || "null") || initialSkill();
  } catch {
    return initialSkill();
  }
}

export function recordAnswer(event: Omit<SessionEvent, "id" | "timestamp" | "day" | "patient">): SkillState | null {
  if (typeof window === "undefined" || isCaregiverUnlocked()) return null;
  try {
    const entry: SessionEvent = {
      ...event,
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      patient: PATIENT,
      timestamp: Date.now(),
      day: dayKey(new Date()),
    };
    const events: SessionEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
    const state = adapt(readSkill(event.domain), entry);
    localStorage.setItem(EVENTS_KEY, JSON.stringify([...(Array.isArray(events) ? events : []), entry].slice(-500)));
    localStorage.setItem(skillKey(event.domain), JSON.stringify(state));
    window.dispatchEvent(new Event("cogniconnect:events"));
    return state;
  } catch {
    return null;
  }
}
