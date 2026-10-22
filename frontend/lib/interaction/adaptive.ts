export type InputMethod = "tap" | "typed" | "voice";
export type SessionEvent = { id: string; patient: string; session: string; game: string; domain: string; timestamp: number; day: string; method: InputMethod; correct: boolean | null; responseMs: number | null; hesitationMs?: number | null; touchMs?: number | null; errorType: "none" | "answer" | "recognition" | "silence"; difficulty: number };
export type WindowAnswer = { session: string; method: InputMethod; correct: boolean; responseMs: number | null; timestamp: number };
export type SkillState = { rating: number; knob: number; recent: WindowAnswer[]; baselines: Record<InputMethod, number[]>; decision: "stay" | "up" | "down"; reason: string; mode?: "auto" | "fixed"; fixedKnob?: number | null; lastChange?: string | null };
export const initialSkill = (): SkillState => ({ rating: 1000, knob: 2, recent: [], baselines: { tap: [], typed: [], voice: [] }, decision: "stay", reason: "Getting to know your pace", mode: "auto", fixedKnob: null, lastChange: null });
export function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
const valid = (event: SessionEvent) => event.correct !== null && event.errorType !== "recognition" && event.errorType !== "silence";
export function evaluateSession(previous: SkillState, events: SessionEvent[]): SkillState {
  const usable = events.filter(valid).map(event => ({ session: event.session, method: event.method, correct: Boolean(event.correct), responseMs: Number.isFinite(event.responseMs) ? event.responseMs : null, timestamp: event.timestamp }));
  if (!usable.length) return previous;
  const defaults = initialSkill();
  const priorBaselines = { ...defaults.baselines, ...(previous.baselines || {}) };
  const state: SkillState = { ...defaults, ...previous, recent: Array.isArray(previous.recent) ? previous.recent : [], baselines: { ...priorBaselines }, decision: "stay", reason: "Keep practising at this setting" };
  for (const event of usable) { const source = events.find(item => item.session === event.session); const expected = 1 / (1 + 10 ** (((800 + 100 * (source?.difficulty || state.knob)) - state.rating) / 400)); state.rating = Math.max(400, Math.min(1800, state.rating + 24 * (Number(event.correct) - expected))); if (event.correct && event.responseMs !== null) state.baselines[event.method] = [...state.baselines[event.method], event.responseMs].slice(-21); }
  const pooled = [...state.recent, ...usable], window = usable.length > 8 ? usable : pooled.slice(-8); state.recent = pooled.slice(-8);
  if (window.length < 8 || state.mode === "fixed") return state;
  const correct = window.filter(item => item.correct), sessions = new Set(window.map(item => item.session));
  const ratios = correct.filter(item => item.responseMs !== null && priorBaselines[item.method].length).map(item => item.responseMs! / (median(priorBaselines[item.method]) || item.responseMs!));
  const fastEnough = ratios.length > 0 && (median(ratios) || Infinity) <= 1.5;
  if (correct.length >= 7 && fastEnough && state.knob < 4) { state.knob++; state.decision = "up"; state.reason = "Several successful answers at your own pace"; state.lastChange = new Date().toISOString(); }
  else if (correct.length <= 3 && sessions.size >= 2 && state.knob > 1) { state.knob--; state.decision = "down"; state.reason = "More support after difficult answers across sessions"; state.lastChange = new Date().toISOString(); }
  return state;
}
export function adapt(previous: SkillState, event: SessionEvent): SkillState { return evaluateSession(previous, [event]); }
export function slope(values: number[]): number { if (values.length < 2) return 0; const center = (values.length - 1) / 2, mean = values.reduce((a, b) => a + b, 0) / values.length; return values.reduce((sum, value, i) => sum + (i - center) * (value - mean), 0) / values.reduce((sum, _, i) => sum + (i - center) ** 2, 0); }
export function declineAlert(scores: number[]): boolean { const recent = scores.filter(Number.isFinite).slice(-8); if (recent.length < 8) return false; return slope(recent) < -2 && slope(recent.slice(0, 4)) < -1 && slope(recent.slice(4)) < -1; }
