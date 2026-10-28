/**
 * Pure and testable speech primitives, types, and browser provider.
 * Kept free of Next.js path aliases and backend network dependencies so that
 * plain Node check scripts (e.g. speech.check.mjs) can import them directly.
 */

export type UserRole = "caregiver" | "patient" | "patient_device" | "self";

export function shouldSpeak({
  role,
  readAloudSetting,
  forced = false,
}: {
  role?: string | null;
  readAloudSetting?: boolean | null;
  forced?: boolean;
}): boolean {
  // Forced speech is strictly banned across all roles
  if (forced) return false;
  // Missing or disabled preference never speaks
  if (readAloudSetting !== true) return false;
  // Role must be an authorized active role (caregiver, patient, patient_device, self)
  if (!role || (role !== "caregiver" && role !== "patient" && role !== "patient_device" && role !== "self")) {
    return false;
  }
  return true;
}

export function shouldAutoListenOnQuestionChange(params: {
  readAloud: boolean;
  answerBySpeaking: boolean;
  listenAutomatically: boolean;
  allowAnswer?: boolean;
  disabled?: boolean;
  lastQuestion: string | null;
  newQuestion: string;
}): boolean {
  if (params.readAloud) return false;
  if (!params.answerBySpeaking || !params.listenAutomatically) return false;
  if (params.allowAnswer === false || params.disabled) return false;
  return params.lastQuestion !== params.newQuestion;
}

export type SpeechFailure = "unsupported" | "offline" | "permission" | "microphone" | "language" | "silence" | "cancelled";
export class SpeechError extends Error {
  readonly reason: SpeechFailure;
  constructor(reason: SpeechFailure) {
    super(reason);
    this.reason = reason;
  }
}
export type SpeechResult = { text: string; confidence: number; speechStartedAt: number | null };
export type SpeechOptions = { role: UserRole; readAloudSetting: boolean };

export interface SpeechProvider {
  speak(text: string, language: string, signal: AbortSignal | undefined, rate: number, options: SpeechOptions): Promise<number>;
  listen(language: string, signal?: AbortSignal): Promise<SpeechResult>;
  cancel(): void;
}

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: { [n: number]: { [n: number]: { transcript: string; confidence: number } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const errorMap: Record<string, SpeechFailure> = { "not-allowed": "permission", "service-not-allowed": "permission", "audio-capture": "microphone", "language-not-supported": "language", network: "offline", "no-speech": "silence", aborted: "cancelled" };

export class BrowserSpeechProvider implements SpeechProvider {
  private cancelCurrent: (() => void) | null = null;
  cancel() { this.cancelCurrent?.(); this.cancelCurrent = null; }
  async speak(text: string, language: string, signal: AbortSignal | undefined, rate: number, options: SpeechOptions): Promise<number> {
    if (signal?.aborted) throw new SpeechError("cancelled");
    if (!options || options.readAloudSetting !== true) {
      throw new SpeechError("cancelled");
    }
    if (!shouldSpeak({ role: options.role, readAloudSetting: options.readAloudSetting, forced: false })) {
      throw new SpeechError("cancelled");
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) throw new SpeechError("unsupported");
    const synth = window.speechSynthesis;
    if (!synth.getVoices().length) await new Promise<void>((resolve, reject) => {
      const finish = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(new SpeechError("cancelled")); };
      const cleanup = () => { clearTimeout(timer); synth.removeEventListener("voiceschanged", finish); signal?.removeEventListener("abort", abort); };
      const timer = setTimeout(finish, 700);
      synth.addEventListener("voiceschanged", finish, { once: true }); signal?.addEventListener("abort", abort, { once: true });
    });
    if (signal?.aborted) throw new SpeechError("cancelled");
    const voice = synth.getVoices().find(item => item.lang.toLowerCase().split("-")[0] === language.toLowerCase().split("-")[0]);
    if (!voice) throw new SpeechError("language");
    this.cancel();
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language; utterance.voice = voice; utterance.rate = rate;
      const finish = (error?: SpeechFailure) => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort); utterance.onend = null; utterance.onerror = null;
        this.cancelCurrent = null;
        if (error) reject(new SpeechError(error)); else resolve(performance.now());
      };
      const abort = () => { synth.cancel(); finish("cancelled"); };
      const timer = setTimeout(() => finish("unsupported"), Math.max(30000, text.length * 150 + 10000));
      this.cancelCurrent = abort;
      signal?.addEventListener("abort", abort, { once: true });
      utterance.onend = () => finish(); utterance.onerror = () => finish("unsupported");
      synth.cancel(); synth.speak(utterance);
    });
  }
  listen(language: string, signal?: AbortSignal): Promise<SpeechResult> {
    const RecognitionCtor = typeof window === "undefined" ? undefined : (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!RecognitionCtor) return Promise.reject(new SpeechError("unsupported"));
    if (!navigator.onLine) return Promise.reject(new SpeechError("offline"));
    this.cancel();
    return new Promise((resolve, reject) => {
      const recognition = new RecognitionCtor();
      recognition.lang = language; recognition.interimResults = false; recognition.continuous = false;
      let settled = false;
      const finish = (result?: SpeechResult, reason: SpeechFailure = "silence") => {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
        recognition.onend = null; recognition.onresult = null; recognition.onerror = null;
        try { recognition.abort(); } catch { /* Recognition may already have stopped. */ }
        this.cancelCurrent = null;
        if (result) resolve(result); else reject(new SpeechError(reason));
      };
      const abort = () => finish(undefined, "cancelled");
      const timer = setTimeout(() => finish(), 30000);
      this.cancelCurrent = abort;
      recognition.onresult = event => finish({ text: event.results[0][0].transcript, confidence: event.results[0][0].confidence, speechStartedAt: performance.now() });
      recognition.onerror = event => finish(undefined, errorMap[event.error] ?? "unsupported");
      recognition.onend = () => finish();
      signal?.addEventListener("abort", abort, { once: true });
      try { recognition.start(); } catch { finish(undefined, "microphone"); }
    });
  }
}
