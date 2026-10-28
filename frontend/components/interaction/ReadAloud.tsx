"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences, useSpeech, useTranslate } from "@/components/interaction/InteractionProvider";
import { shouldSpeak, SpeechError, type UserRole } from "@/lib/interaction/speech";
import { useAuth } from "@/lib/auth-context";
import { beginSpeechSession } from "./speechSession";

export function ReadAloud({
  text,
  options = [],
  autoRead = true,
  onReadComplete,
  kind = "question",
  className = "",
}: {
  text: string;
  options?: string[];
  autoRead?: boolean;
  onReadComplete?: () => void;
  kind?: "question" | "feedback";
  className?: string;
}) {
  const { t, locale, caregiver } = useTranslate();
  const { preferences } = usePreferences();
  const { provider, speechLanguage } = useSpeech();
  const { session } = useAuth();
  const [speaking, setSpeaking] = useState(false);
  const [message, setMessage] = useState("");
  const activeSession = useRef<ReturnType<typeof beginSpeechSession> | null>(null);

  const role: UserRole = session?.role ?? (caregiver ? "caregiver" : "patient");
  const isAllowed = shouldSpeak({ role, readAloudSetting: preferences.readAloud, forced: false });

  const localizeSpeech = useCallback((phrase: string) => phrase.split(/(?<=[.!?])\s+/).map(part => t(part)).join(" "), [t]);
  const speechText = useMemo(() => {
    const translatedOptions = options.map(option => localizeSpeech(option)).filter(Boolean);
    return [localizeSpeech(text), translatedOptions.length ? `${t("Options")}: ${translatedOptions.join(", ")}` : ""].filter(Boolean).join(". ");
  }, [text, options, t, locale, localizeSpeech]);

  const read = useCallback(async () => {
    if (!speechText || !isAllowed) return;
    const speechSession = beginSpeechSession(kind);
    activeSession.current = speechSession;
    setSpeaking(true);
    setMessage("");
    try {
      await speechSession.ready;
      if (speechSession.signal.aborted) return;
      await provider.speak(speechText, speechLanguage, speechSession.signal, preferences.speechRate === "slow" ? 0.75 : 1, {
        role,
        readAloudSetting: preferences.readAloud,
      });
      if (!speechSession.signal.aborted) onReadComplete?.();
    } catch (error) {
      if (!speechSession.signal.aborted && (!(error instanceof SpeechError) || error.reason !== "cancelled")) {
        setMessage(t("Read aloud is not available on this device."));
      }
    } finally {
      speechSession.finish();
      if (activeSession.current === speechSession) activeSession.current = null;
      setSpeaking(false);
    }
  }, [speechText, isAllowed, preferences.speechRate, preferences.readAloud, provider, speechLanguage, role, t, kind, onReadComplete]);

  useEffect(() => {
    if (autoRead && isAllowed) void read();
    return () => { if (kind === "question") activeSession.current?.cancel(); };
  }, [speechText, autoRead, isAllowed, read, kind]);

  if (!isAllowed) return null;
  return <div className={`my-2 flex flex-wrap items-center gap-2 ${className}`}>
    <Button type="button" variant="outline" className="min-h-11 max-w-full whitespace-normal text-base" onClick={() => void read()} disabled={speaking} aria-label={t("Listen") + ": " + t(text)}>
      <Volume2 className="mr-2 h-5 w-5" />{t(speaking ? "Reading aloud…" : "Listen")}
    </Button>
    {message && <p role="status" className="text-base text-muted-foreground">{message}</p>}
  </div>;
}

export default ReadAloud;
