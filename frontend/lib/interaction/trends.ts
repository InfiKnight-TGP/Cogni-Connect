import { declineAlert, median, type SessionEvent } from "./adaptive.ts";
import type { SupportRecord } from "./sync";
import { distance, type Visit } from "./content.ts";
export function sessionScores(events: SessionEvent[], domain: string): number[] {
  const sessions = new Map<string, { sum: number; count: number }>();
  events.filter(event => event.domain === domain && typeof event.correct === "boolean" && !["recognition", "silence"].includes(event.errorType)).sort((a, b) => a.timestamp - b.timestamp).forEach(event => {
    const value = sessions.get(event.session) || { sum: 0, count: 0 }; value.sum += Number(event.correct); value.count++; sessions.set(event.session, value);
  });
  return Array.from(sessions.values()).map(value => Math.round(value.sum / value.count * 100));
}
export function cognitiveTrendIndex(rows: SupportRecord[], now = Date.now()) {
  const week = 7 * 86400000, recent = rows.filter(row => row.updatedAt >= now - week && row.updatedAt <= now);
  const events = recent.filter(row => row.kind === "event").map(row => row.data as unknown as SessionEvent).filter(event => typeof event.correct === "boolean" && !["recognition", "silence"].includes(event.errorType));
  const components: { label: string; score: number; weight: number; explanation: string }[] = [];
  if (events.length) { const score = events.filter(event => event.correct).length / events.length * 100; components.push({ label: "Game accuracy", score, weight: .55, explanation: `${events.length} recorded answers this week; ${Math.round(score)}% correct.` }); }
  const reminders = rows.filter(row => row.kind === "reminder");
  if (reminders.length) {
    const completed = new Set(recent.filter(row => row.kind === "adherence").map(row => `${row.data.reminderId}:${row.data.day}`)).size;
    const opportunities = reminders.reduce((sum, row) => sum + Math.min(7, Math.max(1, Math.ceil((now - row.updatedAt) / 86400000))), 0);
    components.push({ label: "Routine completion", score: Math.min(100, completed / opportunities * 100), weight: .2, explanation: `${completed} completed reminders out of approximately ${opportunities} daily opportunities.` });
  }
  if (rows.some(row => row.kind === "journal")) {
    const days = new Set(recent.filter(row => row.kind === "journal").map(row => row.data.day)).size;
    components.push({ label: "Journal activity", score: Math.min(100, days / 7 * 100), weight: .15, explanation: `Memories saved on ${days} of the last seven days. This measures activity, not memory ability.` });
  }
  const priorVoice = rows.filter(row => row.kind === "event" && row.updatedAt < now - week && row.updatedAt >= now - 5 * week).map(row => row.data as unknown as SessionEvent).filter(event => event.method === "voice" && event.correct === true && event.responseMs !== null && Number.isFinite(event.responseMs)).map(event => event.responseMs!);
  const currentVoice = events.filter(event => event.method === "voice" && event.correct === true && event.responseMs !== null && Number.isFinite(event.responseMs)).map(event => event.responseMs!);
  if (priorVoice.length >= 5 && currentVoice.length >= 5) {
    const baseline = median(priorVoice)!, current = median(currentVoice)!;
    components.push({ label: "Voice response pace", score: Math.max(0, Math.min(100, 50 + (baseline - current) / Math.max(1, baseline) * 50)), weight: .1, explanation: `Median voice-start delay ${Math.round(current)} ms versus this patient's earlier ${Math.round(baseline)} ms. Tap times are excluded.` });
  }
  const weight = components.reduce((sum, component) => sum + component.weight, 0);
  return { score: weight ? Math.round(components.reduce((sum, component) => sum + component.score * component.weight, 0) / weight) : null, components };
}
export function routineDeviation(rows: SupportRecord[]): boolean {
  const home = rows.find(row => row.kind === "place" && row.data.home === true);
  if (!home) return false;
  const last = rows.filter(row => row.kind === "location").sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!last || Date.now() - last.updatedAt > 3600000 || Number(last.data.accuracy) > 200) return false;
  const hour = new Date(Number(last.data.timestamp)).getHours();
  return (hour >= 22 || hour < 6) && distance(home.data as unknown as Visit, last.data as unknown as Visit) > 1000;
}
export { declineAlert };
