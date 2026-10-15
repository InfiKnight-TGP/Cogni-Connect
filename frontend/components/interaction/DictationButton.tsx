"use client";

import { useCallback, useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences, useSpeech, useTranslate } from "@/components/interaction/InteractionProvider";
import { SpeechError } from "@/lib/interaction/speech";
import { beginSpeechSession } from "./speechSession";

export function DictationButton({
  value,
  onText,
  transform = text => text,
  disabled = false,
}: {
  value: string;
  onText: (text: string) => void;
  transform?: (text: string) => string;
  disabled?: boolean;
}) {
  const { t, caregiver } = useTranslate();
  const { preferences } = usePreferences();
  const { provider, speechLanguage } = useSpeech();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const listen = useCallback(async () => {
    if ((!preferences.answerBySpeaking && !caregiver) || listening || disabled) return;
    const session = beginSpeechSession("dictation");
    setListening(true);
    setMessage("");
    try {
      await session.ready;
      if (session.signal.aborted) return;
      const result = await provider.listen(speechLanguage, session.signal);
      const clean = transform(result.text).trim();
      if (!clean) {
        setMessage(t("I didn't hear anything. Try again or type your answer."));
      } else {
        onText(value.trim() ? `${value.trim()} ${clean}` : clean);
      }
    } catch (error) {
      if (session.signal.aborted) return;
      const reason = error instanceof SpeechError ? error.reason : "unsupported";
      setMessage(reason === "silence"
        ? t("I didn't hear anything. Try again or type your answer.")
        : reason === "permission" || reason === "microphone"
          ? t("Microphone not available. You can still type your answer.")
          : t("Voice is not available here. You can still type your answer."));
    } finally {
      session.finish();
      setListening(false);
    }
  }, [preferences.answerBySpeaking, caregiver, listening, disabled, provider, speechLanguage, transform, t, onText, value]);

  if (!preferences.answerBySpeaking && !caregiver) return null;
  return <div className="my-2 flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" className="min-h-12 max-w-full whitespace-normal text-base" onClick={() => void listen()} disabled={disabled || listening}>
      <Mic className="mr-2 h-5 w-5" />{t(listening ? "Listening…" : "Dictate answer")}
    </Button>
    {message && <p role="status" className="text-base text-muted-foreground">{message}</p>}
  </div>;
}

export default DictationButton;
