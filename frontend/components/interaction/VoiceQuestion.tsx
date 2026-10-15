"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences, useSpeech, useTranslate } from "@/components/interaction/InteractionProvider";
import { BrowserSpeechProvider, SpeechError } from "@/lib/interaction/speech";
import { matchAnswer, type AnswerOption } from "@/lib/interaction/matching";
import { localizeAnswerOptions } from "@/lib/interaction/matching";

export type AnswerInput = { method: "tap" | "typed" | "voice"; responseMs: number | null; recognitionConfirmed?: boolean };

export function VoiceQuestion({
  question,
  options = [],
  onTranscript,
  onMatched,
  allowAnswer = true,
  disabled = false,
}: {
  question: string;
  options?: AnswerOption[];
  onTranscript?: (text: string) => void;
  onMatched?: (option: AnswerOption, input: AnswerInput) => void;
  allowAnswer?: boolean;
  disabled?: boolean;
}) {
  const { t, locale, caregiver, caregiverReady } = useTranslate();
  const { preferences } = usePreferences();
  const { provider, speechLanguage } = useSpeech();
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [candidate, setCandidate] = useState<{ option: AnswerOption; input: AnswerInput } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const browserFallback = useRef(new BrowserSpeechProvider());
  const prompt = [question, ...options.map(option => option.label)].filter(Boolean).join(". ");
  const speak = useCallback(async (forListening = false): Promise<boolean> => {
    if ((!preferences.readAloud && !forListening) || caregiver || !caregiverReady || !prompt) return false;
    controller.current?.abort();
    const nextController = new AbortController(); controller.current = nextController;
    setSpeaking(true); setMessage("");
    try {
      await provider.speak(prompt, speechLanguage, nextController.signal, preferences.speechRate === "slow" ? 0.75 : 1);
      return true;
    } catch (error) {
      if (!(error instanceof SpeechError) || error.reason !== "cancelled") setMessage(t("Read aloud is not available on this device."));
      return false;
    } finally { if (controller.current === nextController) { controller.current = null; setSpeaking(false); } }
  }, [preferences.readAloud, preferences.speechRate, caregiver, caregiverReady, prompt, provider, speechLanguage, t]);

  const listen = useCallback(async () => {
    if (!allowAnswer || disabled || !preferences.answerBySpeaking || caregiver || !caregiverReady || listening) return;
    setListening(true); setMessage("");
    const signalController = new AbortController(); controller.current?.abort(); controller.current = signalController;
    try {
      let result;
      try { result = await provider.listen(speechLanguage, signalController.signal); }
      catch (error) {
        if (error instanceof SpeechError && (error.reason === "unsupported" || error.reason === "offline")) {
          result = await browserFallback.current.listen(speechLanguage, signalController.signal);
        } else throw error;
      }
      if (options.length && onMatched) {
        const matchedOptions = localizeAnswerOptions(options, t, locale.synonyms);
        const matched = matchAnswer(result.text, matchedOptions, result.confidence);
        const input: AnswerInput = { method: "voice", responseMs: result.speechStartedAt === null ? null : Math.max(0, performance.now() - result.speechStartedAt) };
        if (matched.kind === "accept") onMatched(options.find(option => option.id === matched.option.id) ?? matched.option, input);
        else if (matched.kind === "confirm") setCandidate({ option: options.find(option => option.id === matched.option.id) ?? matched.option, input });
        else if (onTranscript) onTranscript(result.text);
        else setMessage(t("I did not catch that. Please try once more, or tap your answer."));
      } else onTranscript?.(result.text);
    } catch (error) {
      const reason = error instanceof SpeechError ? error.reason : "unsupported";
      if (reason === "cancelled") return;
      setMessage(reason === "permission" || reason === "microphone"
        ? t("Microphone not available. You can still tap your answer.")
        : reason === "silence"
          ? t("I didn't hear anything. Try again or tap your answer.")
          : t("Voice is not available here. You can still tap your answer."));
    } finally { if (controller.current === signalController) controller.current = null; setListening(false); }
  }, [allowAnswer, disabled, preferences.answerBySpeaking, caregiver, caregiverReady, listening, provider, speechLanguage, options, onMatched, onTranscript, locale.synonyms, t]);

  useEffect(() => {
    const automaticRead = allowAnswer && !disabled && preferences.answerBySpeaking && preferences.listenAutomatically;
    if (disabled || (!preferences.readAloud && !automaticRead) || caregiver || !caregiverReady) return;
    let cancelled = false;
    void (async () => {
      const read = await speak(automaticRead);
      if (!cancelled && automaticRead && read) void listen();
    })();
    return () => { cancelled = true; controller.current?.abort(); provider.cancel(); browserFallback.current.cancel(); };
    // Question identity triggers one read; settings changes are intentionally included.
  }, [question, preferences.readAloud, preferences.answerBySpeaking, preferences.listenAutomatically, speak, provider, caregiver, caregiverReady, allowAnswer, disabled]);

  useEffect(() => () => { controller.current?.abort(); provider.cancel(); browserFallback.current.cancel(); }, [provider]);

  if (caregiver || !caregiverReady) return null;
  return (
    <div className="my-3 flex flex-wrap items-center gap-3">
      {preferences.readAloud && <Button type="button" variant="outline" className="min-h-12 max-w-full whitespace-normal break-words text-center text-lg" onClick={() => void speak()} disabled={speaking || disabled}>
        <Volume2 className="mr-2 h-5 w-5" />{t(speaking ? "Reading aloud…" : "Hear the question")}
      </Button>}
      {allowAnswer && preferences.answerBySpeaking && <Button type="button" variant="outline" className="min-h-12 max-w-full whitespace-normal break-words text-center text-lg" onClick={() => void listen()} disabled={listening || disabled}>
        <Mic className="mr-2 h-5 w-5" />{t(listening ? "Listening…" : "Speak an answer")}
      </Button>}
      {(listening || speaking) && <Button type="button" variant="outline" className="min-h-12" onClick={() => { controller.current?.abort(); provider.cancel(); browserFallback.current.cancel(); }}>{t("Stop")}</Button>}
      {candidate && <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border p-3" role="group" aria-label={t("Confirm your answer")}>
        <span className="w-full text-lg">{t("Did you mean {answer}?", { answer: candidate.option.label })}</span>
        <Button type="button" className="min-h-12" onClick={() => { onMatched?.(candidate.option, { ...candidate.input, recognitionConfirmed: true }); setCandidate(null); }}>{t("Yes")}</Button>
        <Button type="button" variant="outline" className="min-h-12" onClick={() => { setCandidate(null); setMessage(t("I did not catch that. Please try once more, or tap your answer.")); }}>{t("Try again")}</Button>
      </div>}
      {message && <p role="status" className="w-full text-base text-muted-foreground">{message}</p>}
    </div>
  );
}
