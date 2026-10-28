import { apiFetch, API_URL } from "@/lib/api";
import {
  shouldSpeak,
  type UserRole,
  type SpeechFailure,
  SpeechError,
  type SpeechResult,
  type SpeechOptions,
  type SpeechProvider,
  shouldAutoListenOnQuestionChange,
  BrowserSpeechProvider,
} from "./speech-gate";

export {
  shouldSpeak,
  shouldAutoListenOnQuestionChange,
  type UserRole,
  type SpeechFailure,
  SpeechError,
  type SpeechResult,
  type SpeechOptions,
  type SpeechProvider,
  BrowserSpeechProvider,
};

export class WhisperSpeechProvider implements SpeechProvider {
  private browser = new BrowserSpeechProvider();
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  cancel() {
    this.browser.cancel();
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; this.recorder = null;
    if (this.audio) { this.audio.pause(); this.audio.src = ""; this.audio = null; }
  }
  async speak(text: string, language: string, signal: AbortSignal | undefined, rate: number, options: SpeechOptions): Promise<number> {
    if (signal?.aborted) throw new SpeechError("cancelled");
    if (!options || options.readAloudSetting !== true) {
      throw new SpeechError("cancelled");
    }
    if (!shouldSpeak({ role: options.role, readAloudSetting: options.readAloudSetting, forced: false })) {
      throw new SpeechError("cancelled");
    }
    try { return await this.browser.speak(text, language, signal, rate, options); }
    catch (error) {
      if (!(error instanceof SpeechError) || error.reason !== "language") throw error;
      const response = await apiFetch(`${API_URL}/speak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language }), signal });
      if (!response.ok) throw new SpeechError(response.status === 503 ? "unsupported" : "offline");
      const url = URL.createObjectURL(await response.blob());
      try {
        const audio = new Audio(url); this.audio = audio;
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => { signal?.removeEventListener("abort", abort); audio.onended = null; audio.onerror = null; };
          const abort = () => { audio.pause(); cleanup(); reject(new SpeechError("cancelled")); };
          audio.onended = () => { cleanup(); resolve(); }; audio.onerror = () => { cleanup(); reject(new SpeechError("unsupported")); };
          signal?.addEventListener("abort", abort, { once: true }); audio.play().catch(() => { cleanup(); reject(new SpeechError("unsupported")); });
        });
        return performance.now();
      } finally { URL.revokeObjectURL(url); this.audio = null; }
    }
  }
  async listen(language: string, signal?: AbortSignal): Promise<SpeechResult> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return this.browser.listen(language, signal);
    }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (error) {
      const name = (error as DOMException)?.name;
      throw new SpeechError(name === "NotAllowedError" || name === "SecurityError" ? "permission" : "microphone");
    }
    this.stream = stream;
    const chunks: BlobPart[] = [];
    let speechStartedAt: number | null = null;
    let audioContext: AudioContext | null = null;
    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
      const resultPromise = new Promise<SpeechResult>((resolve, reject) => {
        let settled = false; let silenceMs = 0; let lastCheck = performance.now(); let interval: ReturnType<typeof setInterval>;
        const finish = async (reason?: SpeechFailure) => {
          if (settled) return; settled = true; clearInterval(interval); clearTimeout(maxTimer); signal?.removeEventListener("abort", abort);
          if (recorder.state === "recording") recorder.stop();
          if (reason) { reject(new SpeechError(reason)); return; }
          if (speechStartedAt === null) { reject(new SpeechError("silence")); return; }
          await new Promise<void>(r => { recorder.onstop = () => r(); });
          const type = recorder.mimeType || "audio/webm";
          const form = new FormData(); form.append("audio", new Blob(chunks, { type }), `answer.${type.includes("mp4") ? "mp4" : "webm"}`); form.append("language", language);
          try {
            const response = await apiFetch(`${API_URL}/transcribe`, { method: "POST", body: form, signal });
            if (response.status === 503) throw new SpeechError("unsupported");
            if (!response.ok) throw new SpeechError("offline");
            const body = await response.json();
            if (typeof body.text !== "string" || !body.text.trim()) throw new SpeechError("silence");
            resolve({ text: body.text, confidence: 0.9, speechStartedAt });
          } catch (error) {
            if (error instanceof SpeechError) reject(error);
            else if (signal?.aborted) reject(new SpeechError("cancelled"));
            else reject(new SpeechError("offline"));
          }
        };
        const abort = () => finish("cancelled");
        const maxTimer = setTimeout(() => finish(), 30000);
        signal?.addEventListener("abort", abort, { once: true });
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => finish("microphone");
        recorder.onstop = () => { if (!settled) void finish(); };
        interval = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
          const now = performance.now(); const elapsed = now - lastCheck; lastCheck = now;
          if (rms > 0.025) { speechStartedAt ??= now; silenceMs = 0; }
          else if (speechStartedAt !== null) silenceMs += elapsed;
          if (speechStartedAt !== null && silenceMs >= 1200) void finish();
        }, 100);
        try { recorder.start(250); } catch { void finish("microphone"); }
      });
      return await resultPromise;
    } finally {
      stream.getTracks().forEach(track => track.stop()); this.stream = null; this.recorder = null;
      await audioContext?.close().catch(() => undefined);
    }
  }
}
