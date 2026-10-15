"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences, useSpeech, useTranslate } from "@/components/interaction/InteractionProvider";
import { SpeechError } from "@/lib/interaction/speech";
import { beginSpeechSession } from "./speechSession";

export function ReadAloud({
  text,
  options = [],
  autoRead = true,
  kind = "question",
  className = "",
}: {
  text: string;
  options?: string[];
  autoRead?: boolean;
  kind?: "question" | "feedback";
  className?: string;
}) {
  const { t, locale } = useTranslate();
  const { preferences } = usePreferences();
  const { provider, speechLanguage } = useSpeech();
  const [speaking, setSpeaking] = useState(false);
  const [message, setMessage] = useState("");
  const activeSession = useRef<ReturnType<typeof beginSpeechSession> | null>(null);
  const speechText = useMemo(() => {
    const translatedOptions = options.map(option => t(option)).filter(Boolean);
    return [t(text), translatedOptions.length ? `${t("Options")}: ${translatedOptions.join(", ")}` : ""].filter(Boolean).join(". ");
  }, [text, options, t, locale]);

  const read = useCallback(async () => {
    if (!speechText || !preferences.readAloud) return;
    const session = beginSpeechSession(kind);
    activeSession.current = session;
    setSpeaking(true);
    setMessage("");
    try {
      await session.ready;
      if (session.signal.aborted) return;
      await provider.speak(speechText, speechLanguage, session.signal, preferences.speechRate === "slow" ? 0.75 : 1);
    } catch (error) {
      if (!session.signal.aborted && (!(error instanceof SpeechError) || error.reason !== "cancelled")) {
        setMessage(t("Read aloud is not available on this device."));
      }
    } finally {
      session.finish();
      if (activeSession.current === session) activeSession.current = null;
      setSpeaking(false);
    }
  }, [speechText, preferences.readAloud, preferences.speechRate, provider, speechLanguage, t, kind]);

  useEffect(() => {
    if (autoRead && preferences.readAloud) void read();
    return () => { if (kind === "question") activeSession.current?.cancel(); };
  }, [speechText, autoRead, preferences.readAloud, read]);

  if (!preferences.readAloud) return null;
  return <div className={`my-2 flex flex-wrap items-center gap-2 ${className}`}>
    <Button type="button" variant="outline" className="min-h-11 max-w-full whitespace-normal text-base" onClick={() => void read()} disabled={speaking} aria-label={t("Listen") + ": " + t(text)}>
      <Volume2 className="mr-2 h-5 w-5" />{t(speaking ? "Reading aloud…" : "Listen")}
    </Button>
    {message && <p role="status" className="text-base text-muted-foreground">{message}</p>}
  </div>;
}

export default ReadAloud;
