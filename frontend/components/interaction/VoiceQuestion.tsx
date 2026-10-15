"use client";

import { useCallback, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReadAloud from "@/components/interaction/ReadAloud";
import { usePreferences, useSpeech, useTranslate } from "@/components/interaction/InteractionProvider";
import { SpeechError } from "@/lib/interaction/speech";
import { matchAnswer, type AnswerOption, localizeAnswerOptions } from "@/lib/interaction/matching";
import { beginSpeechSession } from "./speechSession";

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
  const { t, locale, caregiver } = useTranslate();
  const { preferences } = usePreferences();
  const { provider, speechLanguage } = useSpeech();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [candidate, setCandidate] = useState<{ option: AnswerOption; input: AnswerInput } | null>(null);
  const sessionRef = useRef<ReturnType<typeof beginSpeechSession> | null>(null);
  const listen = useCallback(async () => {
    if (!allowAnswer || disabled || (!preferences.answerBySpeaking && !caregiver) || listening) return;
    const session = beginSpeechSession("dictation");
    sessionRef.current = session;
    setListening(true); setMessage("");
    try {
      await session.ready;
      if (session.signal.aborted) return;
      const result = await provider.listen(speechLanguage, session.signal);
      if (options.length && onMatched) {
        const matched = matchAnswer(result.text, localizeAnswerOptions(options, t, locale.synonyms), result.confidence);
        const input: AnswerInput = { method: "voice", responseMs: result.speechStartedAt === null ? null : Math.max(0, performance.now() - result.speechStartedAt) };
        if (matched.kind === "accept") onMatched(options.find(option => option.id === matched.option.id) ?? matched.option, input);
        else if (matched.kind === "confirm") setCandidate({ option: options.find(option => option.id === matched.option.id) ?? matched.option, input });
        else if (onTranscript) onTranscript(result.text);
        else setMessage(t("I did not catch that. Please try once more, or tap your answer."));
      } else onTranscript?.(result.text);
    } catch (error) {
      if (session.signal.aborted) return;
      const reason = error instanceof SpeechError ? error.reason : "unsupported";
      setMessage(reason === "permission" || reason === "microphone"
        ? t("Microphone not available. You can still tap your answer.")
        : reason === "silence"
          ? t("I didn't hear anything. Try again or tap your answer.")
          : t("Voice is not available here. You can still tap your answer."));
    } finally {
      session.finish();
      if (sessionRef.current === session) sessionRef.current = null;
      setListening(false);
    }
  }, [allowAnswer, disabled, preferences.answerBySpeaking, caregiver, listening, provider, speechLanguage, options, onMatched, onTranscript, locale.synonyms, t]);
  const automaticListen = allowAnswer && !disabled && preferences.answerBySpeaking && preferences.listenAutomatically;
  const listenRef = useRef(listen);
  listenRef.current = listen;
  const afterRead = useCallback(() => { if (automaticListen) void listenRef.current(); }, [automaticListen]);

  return <div className="my-3 space-y-2">
    <ReadAloud text={question} options={options.map(option => option.label)} autoRead={!disabled && (preferences.readAloud || caregiver || automaticListen)} forceAutoRead={automaticListen} onReadComplete={afterRead} />
    {allowAnswer && (preferences.answerBySpeaking || caregiver) && <Button type="button" variant="outline" className="min-h-12 max-w-full whitespace-normal text-base" onClick={() => void listen()} disabled={listening || disabled}>
      <Mic className="mr-2 h-5 w-5" />{t(listening ? "Listening…" : "Speak an answer")}
    </Button>}
    {listening && <Button type="button" variant="outline" className="min-h-11" onClick={() => sessionRef.current?.cancel()}>{t("Stop")}</Button>}
    {candidate && <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border p-3" role="group" aria-label={t("Confirm your answer")}>
      <span className="w-full text-lg">{t("Did you mean {answer}?", { answer: candidate.option.label })}</span>
      <Button type="button" className="min-h-12" onClick={() => { onMatched?.(candidate.option, { ...candidate.input, recognitionConfirmed: true }); setCandidate(null); }}>{t("Yes")}</Button>
      <Button type="button" variant="outline" className="min-h-12" onClick={() => { setCandidate(null); setMessage(t("I did not catch that. Please try once more, or tap your answer.")); }}>{t("Try again")}</Button>
    </div>}
    {message && <p role="status" className="w-full text-base text-muted-foreground">{message}</p>}
  </div>;
}
