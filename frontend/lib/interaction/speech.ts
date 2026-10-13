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

export class BrowserSpeechProvider implements SpeechProvider {
  private active: Recognition | null = null;
  cancel() {
    this.active?.abort(); this.active = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  async speak(text: string, language: string, signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) throw new SpeechError("cancelled");
    if (!("speechSynthesis" in window)) throw new SpeechError("unsupported");
    const synthesis = window.speechSynthesis;
    // Browsers may populate voices asynchronously on first use.
    if (!synthesis.getVoices().length) await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); synthesis.removeEventListener("voiceschanged", finish); resolve(); };
      const timer = setTimeout(finish, 700);
      synthesis.addEventListener("voiceschanged", finish);
    });
    if (signal?.aborted) throw new SpeechError("cancelled");
    const voice = synthesis.getVoices().find(v => v.lang.toLowerCase().split("-")[0] === language.toLowerCase().split("-")[0]);
    if (!voice) throw new SpeechError("language");
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language; utterance.voice = voice; utterance.rate = 0.85;
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const abort = () => { cleanup(); synthesis.cancel(); reject(new SpeechError("cancelled")); };
      signal?.addEventListener("abort", abort, { once: true });
      utterance.onend = () => { cleanup(); resolve(performance.now()); };
      utterance.onerror = () => { cleanup(); reject(new SpeechError("unsupported")); };
      synthesis.speak(utterance);
    });
  }
  listen(language: string, signal?: AbortSignal): Promise<SpeechResult> {
    if (signal?.aborted) return Promise.reject(new SpeechError("cancelled"));
    // Browser STT often needs a network service. Do not pretend it works offline.
    if (!navigator.onLine) return Promise.reject(new SpeechError("offline"));
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) return Promise.reject(new SpeechError("unsupported"));
    return new Promise((resolve, reject) => {
      const recognition = new SpeechRecognition();
      this.active = recognition;
      recognition.lang = language; recognition.interimResults = false; recognition.continuous = false;
      let started: number | null = null, settled = false;
      const finish = (result?: SpeechResult, failure: SpeechFailure = "silence") => {
        if (settled) return; settled = true;
        clearTimeout(timer); signal?.removeEventListener("abort", abort);
        recognition.onend = null; recognition.abort(); this.active = null;
        if (result) resolve(result); else reject(new SpeechError(failure));
      };
      const abort = () => finish(undefined, "cancelled");
      const timer = setTimeout(() => finish(), 15000);
      recognition.onspeechstart = () => { started = performance.now(); };
      recognition.onresult = event => finish({ text: event.results[0][0].transcript, confidence: event.results[0][0].confidence, speechStartedAt: started });
      recognition.onerror = event => finish(undefined, recognitionFailure(event.error));
      recognition.onend = () => finish();
      signal?.addEventListener("abort", abort, { once: true });
      try { recognition.start(); } catch { finish(undefined, "microphone"); }
    });
  }
}
