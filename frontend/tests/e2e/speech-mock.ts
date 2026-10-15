import type { Page } from "@playwright/test";

export async function installSpeechMock(page: Page) {
  await page.addInitScript(() => {
    const mock = window as unknown as { __speechStarts: number; __answers: { text?: string; confidence?: number; error?: string; delay?: number }[]; SpeechRecognition: unknown };
    mock.__speechStarts = 0; mock.__answers = [];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(public text: string) {} }, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [{ lang: "en-IN", name: "Test voice" }], speak: (utterance: { onend?: () => void }) => setTimeout(() => utterance.onend?.(), 5), cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {} }, configurable: true });
    mock.SpeechRecognition = class {
      onresult?: (event: unknown) => void; onerror?: (event: unknown) => void; onend?: () => void; onspeechstart?: () => void;
      start() { mock.__speechStarts++; const answer = mock.__answers.shift() || { error: "no-speech" }; setTimeout(() => { if (answer.error) this.onerror?.({ error: answer.error }); else { this.onspeechstart?.(); this.onresult?.({ results: [[{ transcript: answer.text, confidence: answer.confidence ?? .95 }]] }); } }, answer.delay ?? 10); }
      abort() {}
    };
  });
}
