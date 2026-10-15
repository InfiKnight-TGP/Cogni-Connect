import { adapt, initialSkill, type SessionEvent, type SkillState } from "./adaptive";
import { dayKey } from "../progress";
import { putSupport } from "./support-store";
import { isCaregiverUnlocked } from "../mode";
export function recordAnswer(event: Omit<SessionEvent, "id" | "timestamp" | "day" | "patient">): SkillState | null {
  try {
    if (isCaregiverUnlocked() || localStorage.getItem("cogni:role") === "caregiver") return readSkill(event.domain);
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    const entry: SessionEvent = { ...event, id: crypto.randomUUID(), patient, timestamp: Date.now(), day: dayKey(new Date()) };
    const key = `cogni:events:${patient}`;
    const events: SessionEvent[] = JSON.parse(localStorage.getItem(key) || "[]");
    const skillKey = `cogni:skill:${patient}:${event.domain}`;
    const previous: SkillState = JSON.parse(localStorage.getItem(skillKey) || "null") || initialSkill();
    const state = adapt(previous, entry);
    localStorage.setItem(key, JSON.stringify([...events, entry]));
    localStorage.setItem(skillKey, JSON.stringify(state));
    if (patient !== "local-patient") putSupport(patient, "event", entry, entry.id);
    window.dispatchEvent(new Event("cogni:events"));
    return state;
  } catch { return null; }
}
export function readSkill(domain: string): SkillState {
  try {
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    return JSON.parse(localStorage.getItem(`cogni:skill:${patient}:${domain}`) || "null") || initialSkill();
  } catch { return initialSkill(); }
}
