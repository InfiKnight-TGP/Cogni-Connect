"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate, type Locale } from "@/lib/interaction/locale";
import { apiFetch, API_URL } from "@/lib/api";
import { useCaregiver } from "@/lib/mode";
import { DEFAULT_PREFERENCES, readPreferences, textSizePixels, writePreferences, type Preferences } from "@/lib/interaction/preferences";
import { WhisperSpeechProvider, type SpeechProvider } from "@/lib/interaction/speech";
import { usePathname } from "next/navigation";
import { cancelSpeechSession } from "./speechSession";
import { useAuth } from "@/lib/auth-context";
import { PUBLIC_ROUTES } from "@/lib/auth-session";

export type LanguageCode = "en" | "hi" | "as";
type InteractionContextValue = {
  language: LanguageCode;
  locale: Locale;
  englishLocale: Locale;
  ready: boolean;
  setLanguage: (language: LanguageCode) => void;
  preferences: Preferences;
  updatePreferences: (update: Partial<Preferences>) => void;
  effectiveAnimations: boolean;
  caregiverReady: boolean;
  reducedMotion: boolean;
  speechProvider: SpeechProvider;
};

const InteractionContext = createContext<InteractionContextValue | null>(null);
const supportedLanguages = new Set<LanguageCode>(["en", "hi", "as"]);
const sharedSpeechProvider = new WhisperSpeechProvider();

export function normalizeLanguage(value: unknown): LanguageCode {
  return typeof value === "string" && supportedLanguages.has(value as LanguageCode)
    ? value as LanguageCode
    : "en";
}

export function InteractionProvider({
  locales,
  fontClassNames,
  children,
}: {
  locales: Locale[];
  fontClassNames: { hi: string; as: string };
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [ready, setReady] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [caregiver, caregiverReady] = useCaregiver();
  const pathname = usePathname();
  const { session } = useAuth();
  const languageKey = `cogni-language:${session?.activePatient?.id ?? "public"}`;
  const locale = locales.find((item) => item.code === language) ?? locales.find((item) => item.code === "en")!;
  const englishLocale = locales.find((item) => item.code === "en")!;
  const englishMode = (caregiver || !caregiverReady) && !PUBLIC_ROUTES.has(pathname);
  const activeLocale = englishMode ? englishLocale : locale;
  const fontClassName = englishMode ? "" : language === "hi" ? fontClassNames.hi : language === "as" ? fontClassNames.as : "";

  useEffect(() => {
    let active = true;
    if (!session?.activePatient || PUBLIC_ROUTES.has(pathname)) {
      try { setLanguage(normalizeLanguage(localStorage.getItem(languageKey))); } catch { setLanguage("en"); }
      setReady(true); return;
    }
    apiFetch(`${API_URL}/settings`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((settings: { language?: unknown }) => {
        if (active) {
          let language = settings.language;
          try { language = localStorage.getItem(languageKey) ?? language; } catch { /* Use the patient default. */ }
          setLanguage(normalizeLanguage(language));
        }
      })
      .catch(() => {
        if (active) setLanguage("en");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [session?.activePatient?.id, pathname, languageKey]);

  useEffect(() => {
    cancelSpeechSession();
    sharedSpeechProvider.cancel();
  }, [pathname]);

  useEffect(() => {
    document.documentElement.lang = activeLocale.code;
  }, [activeLocale.code]);

  useEffect(() => {
    setPreferences(readPreferences());
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(query.matches);
    updateMotion(); query.addEventListener("change", updateMotion);
    return () => query.removeEventListener("change", updateMotion);
  }, []);

  const updatePreferences = useCallback((update: Partial<Preferences>) => {
    setPreferences(previous => {
      const next = { ...previous, ...update };
      if (!next.answerBySpeaking) next.listenAutomatically = false;
      writePreferences(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${textSizePixels(preferences.textSize)}px`;
    document.documentElement.dataset.animations = String(preferences.animations && !reducedMotion);
  }, [preferences.textSize, preferences.animations, reducedMotion]);

  const setSelectedLanguage = useCallback((value: LanguageCode) => {
    setLanguage(normalizeLanguage(value));
    try { localStorage.setItem(languageKey, value); } catch { /* Keep the session preference. */ }
  }, [languageKey]);
  const context = useMemo(() => ({ language, locale, englishLocale, ready, setLanguage: setSelectedLanguage, preferences, updatePreferences, effectiveAnimations: preferences.animations && !reducedMotion, caregiverReady, reducedMotion, speechProvider: sharedSpeechProvider }), [language, locale, englishLocale, ready, setSelectedLanguage, preferences, updatePreferences, reducedMotion, caregiverReady]);

  return (
    <InteractionContext.Provider value={context}>
      <div lang={activeLocale.code} className={fontClassName}>{children}</div>
    </InteractionContext.Provider>
  );
}

export function useInteraction() {
  const context = useContext(InteractionContext);
  if (!context) throw new Error("InteractionProvider is required");
  return context;
}

export function useTranslate() {
  const { locale, englishLocale, language, ready, setLanguage } = useInteraction();
  const [caregiver, caregiverReady] = useCaregiver();
  const activeLocale = caregiver || !caregiverReady ? englishLocale : locale;
  const t = useCallback(
    (phrase: string, values: Record<string, string | number> = {}) => translate(activeLocale, phrase, values),
    [activeLocale],
  );
  return { t, locale: activeLocale, language, ready, setLanguage, caregiver, caregiverReady };
}

export function usePreferences() {
  const { preferences, updatePreferences, effectiveAnimations, reducedMotion } = useInteraction();
  return { preferences, updatePreferences, effectiveAnimations, reducedMotion };
}

export function useSpeech() {
  const { locale } = useTranslate();
  const { speechProvider: provider } = useInteraction();
  return { provider, speechLanguage: locale.speechLanguage };
}
