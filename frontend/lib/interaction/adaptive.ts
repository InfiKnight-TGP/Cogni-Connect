export type InputMethod = "tap" | "typed" | "voice";
export type SessionEvent = {
  id: string; patient: string; session: string; game: string; domain: string;
  timestamp: number; day: string; method: InputMethod; correct: boolean | null;
  responseMs: number | null; hesitationMs?: number | null; touchMs?: number | null;
  errorType: "none" | "answer" | "recognition" | "silence"; difficulty: number;
};
export type SkillState = { rating: number; knob: number; recent: number[]; baselines: Record<InputMethod, number[]>; decision: "stay" | "up" | "down"; reason: string };
export const initialSkill = (): SkillState => ({ rating: 1000, knob: 2, recent: [], baselines: { tap: [], typed: [], voice: [] }, decision: "stay", reason: "Getting to know your pace" });
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function adapt(previous: SkillState, event: SessionEvent): SkillState {
  if (event.correct === null || event.errorType === "recognition" || event.errorType === "silence") return previous;
  const state: SkillState = { ...previous, recent: [...previous.recent, Number(event.correct)].slice(-5), baselines: { ...previous.baselines }, decision: "stay", reason: "Keep practising at this setting" };
  const baseline = median(state.baselines[event.method]);
  const expected = 1 / (1 + 10 ** (((800 + 100 * event.difficulty) - state.rating) / 400));
  state.rating = Math.max(400, Math.min(1800, state.rating + 24 * (Number(event.correct) - expected)));
  // A slower response alone can never lower difficulty. Ignore invalid/missing speech-start times.
  const reliableTime = event.responseMs !== null && Number.isFinite(event.responseMs) && event.responseMs >= 0;
  if (reliableTime && event.correct) state.baselines[event.method] = [...state.baselines[event.method], event.responseMs!].slice(-21);
  if (state.recent.length === 5) {
    const accuracy = state.recent.reduce((a, b) => a + b, 0) / 5;
    if (accuracy <= 0.4 && state.knob > 1) {
      state.knob--; state.decision = "down"; state.reason = "More support after several difficult answers"; state.recent = [];
    } else if (accuracy >= 0.8 && state.knob < 4 && (baseline === null || !reliableTime || event.responseMs! <= baseline * 1.5)) {
      state.knob++; state.decision = "up"; state.reason = "Several successful answers at your own pace"; state.recent = [];
    }
  }
  return state;
}
export function slope(values: number[]): number {
  if (values.length < 2) return 0;
  const center = (values.length - 1) / 2, mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, value, i) => sum + (i - center) * (value - mean), 0) / values.reduce((sum, _, i) => sum + (i - center) ** 2, 0);
}
/** Require both halves to decline: a single unusually bad final session is insufficient. */
export function declineAlert(scores: number[]): boolean {
  const recent = scores.filter(Number.isFinite).slice(-8);
  if (recent.length < 8) return false;
  return slope(recent) < -2 && slope(recent.slice(0, 4)) < -1 && slope(recent.slice(4)) < -1;
}
