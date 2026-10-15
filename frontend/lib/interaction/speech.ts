export type SpeechFailure = "unsupported" | "offline" | "permission" | "microphone" | "language" | "silence" | "cancelled";
export class SpeechError extends Error {
  reason: SpeechFailure;
  constructor(reason: SpeechFailure) { super(reason); this.reason = reason; }
}
export type SpeechResult = { text: string; confidence: number; speechStartedAt: number | null };
export interface SpeechProvider {
  speak(text: string, language: string, signal?: AbortSignal): Promise<number>;
  listen(language: string, signal?: AbortSignal): Promise<SpeechResult>;
  cancel(): void;
}

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: { [n: number]: { [n: number]: { transcript: string; confidence: number } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null; onspeechstart: (() => void) | null;
  start(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function recognitionFailure(code: string): SpeechFailure {
  return ({ "not-allowed": "permission", "service-not-allowed": "permission", "audio-capture": "microphone", "language-not-supported": "language", network: "offline", "no-speech": "silence", aborted: "cancelled" } as Record<string, SpeechFailure>)[code] ?? "unsupported";
}

// Web Speech uses one browser-wide audio channel. Only its owner may cancel it.
let owner: BrowserSpeechProvider | null = null;
export class BrowserSpeechProvider implements SpeechProvider {
  private cancelPending: (() => void) | null = null;
  private generation = 0;
  cancel() {
    this.generation++;
    this.cancelPending?.();
    this.cancelPending = null;
    if (owner === this) owner = null;
  }
  private acquire() {
    this.cancel();
    owner?.cancel();
    owner = this;
    return this.generation;
  }
  private release() {
    this.cancelPending = null;
    if (owner === this) owner = null;
  }
  async speak(text: string, language: string, signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) throw new SpeechError("cancelled");
    if (typeof window === "undefined" || !("speechSynthesis" in window)) throw new SpeechError("unsupported");
    const generation = this.acquire();
    const synthesis = window.speechSynthesis;
    try {
      // Voice discovery is cancellable too; navigation must not start stale audio later.
      if (!synthesis.getVoices().length) await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); synthesis.removeEventListener("voiceschanged", finish); signal?.removeEventListener("abort", abort); };
        const finish = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(new SpeechError("cancelled")); };
        const timer = setTimeout(finish, 700);
        this.cancelPending = abort;
        signal?.addEventListener("abort", abort, { once: true });
        synthesis.addEventListener("voiceschanged", finish);
      });
      if (signal?.aborted || generation !== this.generation) throw new SpeechError("cancelled");
      const voice = synthesis.getVoices().find(v => v.lang.toLowerCase().split("-")[0] === language.toLowerCase().split("-")[0]);
      if (!voice) throw new SpeechError("language");
      return await new Promise<number>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language; utterance.voice = voice; utterance.rate = 0.85;
        let settled = false;
        const finish = (failure?: SpeechFailure) => {
          if (settled) return; settled = true;
          clearTimeout(timer); signal?.removeEventListener("abort", abort);
          utterance.onend = null; utterance.onerror = null;
          if (failure) { try { synthesis.cancel(); } catch {} reject(new SpeechError(failure)); }
          else resolve(performance.now());
        };
        const abort = () => finish("cancelled");
        // Watchdog for missing browser callbacks, never a patient answer deadline.
        const timer = setTimeout(() => finish("unsupported"), Math.max(30000, text.length * 150 + 10000));
        this.cancelPending = abort;
        signal?.addEventListener("abort", abort, { once: true });
        utterance.onend = () => finish();
        utterance.onerror = () => finish("unsupported");
        try { synthesis.speak(utterance); } catch { finish("unsupported"); }
      });
    } finally {
      if (generation === this.generation) this.release();
    }
  }
  listen(language: string, signal?: AbortSignal): Promise<SpeechResult> {
    if (signal?.aborted) return Promise.reject(new SpeechError("cancelled"));
    if (typeof navigator === "undefined" || !navigator.onLine) return Promise.reject(new SpeechError("offline"));
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) return Promise.reject(new SpeechError("unsupported"));
    const generation = this.acquire();
    return new Promise<SpeechResult>((resolve, reject) => {
      const recognition = new SpeechRecognition();
      recognition.lang = language; recognition.interimResults = false; recognition.continuous = false;
      let started: number | null = null, settled = false;
      const finish = (result?: SpeechResult, failure: SpeechFailure = "silence") => {
        if (settled) return; settled = true;
        clearTimeout(timer); signal?.removeEventListener("abort", abort);
        recognition.onend = null; recognition.onresult = null; recognition.onerror = null; recognition.onspeechstart = null;
        try { recognition.abort(); } catch { /* Some engines throw after recognition has already stopped. */ }
        if (result) resolve(result); else reject(new SpeechError(failure));
      };
      const abort = () => finish(undefined, "cancelled");
      const timer = setTimeout(() => finish(), 15000);
      this.cancelPending = abort;
      recognition.onspeechstart = () => { started = performance.now(); };
      recognition.onresult = event => finish({ text: event.results[0][0].transcript, confidence: event.results[0][0].confidence, speechStartedAt: started });
      recognition.onerror = event => finish(undefined, recognitionFailure(event.error));
      recognition.onend = () => finish();
      signal?.addEventListener("abort", abort, { once: true });
      try { recognition.start(); } catch { finish(undefined, "microphone"); }
    }).finally(() => { if (generation === this.generation) this.release(); });
  }
}
