"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate, type Locale } from "@/lib/interaction/locale";
import { API_URL } from "@/lib/api";
import { useCaregiver } from "@/lib/mode";

export type LanguageCode = "en" | "hi" | "as";
type InteractionContextValue = {
  language: LanguageCode;
  locale: Locale;
  englishLocale: Locale;
  ready: boolean;
  setLanguage: (language: LanguageCode) => void;
};

const InteractionContext = createContext<InteractionContextValue | null>(null);
const supportedLanguages = new Set<LanguageCode>(["en", "hi", "as"]);

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
  const [caregiver, caregiverReady] = useCaregiver();
  const locale = locales.find((item) => item.code === language) ?? locales.find((item) => item.code === "en")!;
  const englishLocale = locales.find((item) => item.code === "en")!;
  const englishMode = caregiver || !caregiverReady;
  const activeLocale = englishMode ? englishLocale : locale;
  const fontClassName = englishMode ? "" : language === "hi" ? fontClassNames.hi : language === "as" ? fontClassNames.as : "";

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/settings`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((settings: { language?: unknown }) => {
        if (active) setLanguage(normalizeLanguage(settings.language));
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
  }, []);

  useEffect(() => {
    document.documentElement.lang = activeLocale.code;
  }, [activeLocale.code]);

  const setSelectedLanguage = useCallback((value: LanguageCode) => setLanguage(normalizeLanguage(value)), []);
  const context = useMemo(() => ({ language, locale, englishLocale, ready, setLanguage: setSelectedLanguage }), [language, locale, englishLocale, ready, setSelectedLanguage]);

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
  return { t, locale: activeLocale, language, ready, setLanguage, caregiver };
}
