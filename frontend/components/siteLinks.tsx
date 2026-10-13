"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Globe, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "bn", name: "বাংলা" },
  { code: "mr", name: "मराठी" },
  { code: "te", name: "తెలుగు" },
  { code: "ta", name: "தமிழ்" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "ur", name: "اردو" },
  { code: "kn", name: "ಕನ್ನಡ" },
  { code: "or", name: "ଓଡ଼ିଆ" },
  { code: "ml", name: "മലയാളം" },
  { code: "pa", name: "ਪੰਜਾਬੀ" },
  { code: "as", name: "অসমীয়া" },
  { code: "ne", name: "नेपाली" },
  { code: "mni-Mtei", name: "ꯃꯤꯇꯩꯂꯣꯟ" },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]["code"];
type ThemeChoice = "system" | "light" | "dark";

const THEME_CHOICES: { value: ThemeChoice; label: string; Icon: typeof Monitor }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function languageLabel(code: LanguageCode) {
  return code === "mni-Mtei" ? "MNI" : code.toUpperCase();
}

function isLanguageCode(code: unknown): code is LanguageCode {
  return LANGUAGES.some((language) => language.code === code);
}

function SiteLinks({ placement = "page" }: { placement?: "page" | "right-column" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState<LanguageCode | "">("");
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    let active = true;
    fetch(`${API_URL}/settings`)
      .then((response) => (response.ok ? response.json() : {}))
      .then((settings: { language?: unknown }) => {
        if (!active) return;
        setLanguage(isLanguageCode(settings.language) ? settings.language : "en");
      })
      .catch(() => {
        if (active) setLanguage("en");
      })
      .finally(() => {
        if (active) setLanguageLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!languageMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageMenuOpen]);

  const saveLanguage = async (code: LanguageCode) => {
    const previous = language || "en";
    setLanguage(code);
    setSaveError(false);
    try {
      const response = await fetch(`${API_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: code }),
      });
      if (!response.ok) throw new Error("Could not save language");
      const settings = await response.json();
      setLanguage(isLanguageCode(settings.language) ? settings.language : code);
    } catch {
      setLanguage(previous);
      setSaveError(true);
    }
  };

  const isSelected = (choice: ThemeChoice) => mounted && theme === choice;

  return (
    <section className={`w-full text-center ${placement === "right-column" ? "" : "mx-auto"}`} aria-label="Site links and preferences">
      <div className="mx-auto flex w-full flex-col items-center gap-3">
        <nav className="flex min-h-11 flex-wrap items-center justify-center gap-x-2 text-base font-bold tracking-wide text-muted-foreground" aria-label="Information">
          <Link className="flex min-h-11 items-center rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/about">About</Link>
          <span aria-hidden="true">·</span>
          <Link className="flex min-h-11 items-center rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/terms">Terms</Link>
          <span aria-hidden="true">·</span>
          <Link className="flex min-h-11 items-center rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/privacy">Privacy</Link>
        </nav>

        <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <div className="relative" ref={languageMenuRef}>
            <button
              type="button"
              aria-label={`Language: ${languageLabel(language || "en")}`}
              aria-haspopup="menu"
              aria-expanded={languageMenuOpen}
              disabled={!languageLoaded}
              onClick={() => setLanguageMenuOpen((open) => !open)}
              className="flex min-h-11 items-center gap-2 px-2 text-base text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              <Globe aria-hidden="true" className="h-5 w-5" />
              <span>{languageLabel(language || "en")}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
            {languageMenuOpen && (
              <div role="menu" aria-label="Choose language" className="absolute left-1/2 top-full z-50 mt-1 max-h-72 w-max min-w-52 -translate-x-1/2 overflow-y-auto rounded-md border border-border bg-card p-1 text-left shadow-lg">
                {LANGUAGES.map((item) => {
                  const selected = language === item.code;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setLanguageMenuOpen(false);
                        void saveLanguage(item.code);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-base text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="w-10 shrink-0 font-semibold">{languageLabel(item.code)}</span>
                      <span>– {item.name}</span>
                      {selected && <Check aria-hidden="true" className="ml-auto h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex min-h-11 items-center gap-1 text-base text-muted-foreground" role="group" aria-label="Theme">
            <span className="mr-1">Theme</span>
            {THEME_CHOICES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={value === "system" ? "Use system theme" : `${label} theme`}
                title={value === "system" ? "Use system theme" : `${label} theme`}
                aria-pressed={isSelected(value)}
                onClick={() => setTheme(value)}
                className={`relative flex min-h-11 min-w-11 items-center justify-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected(value) ? "text-primary after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              </button>
            ))}
          </div>
        </div>
        {saveError && <p className="text-sm text-destructive" role="status">Could not save language. Try again.</p>}
      </div>
    </section>
  );
}

export function SiteLinksPlacement() {
  const pathname = usePathname();
  if (pathname === "/report") return null;

  const hasRightColumnLinks = pathname === "/" || pathname === "/today";
  return (
    <div className={`px-4 pb-24 pt-12 lg:pb-8 print:hidden ${hasRightColumnLinks ? "xl:hidden" : ""}`}>
      <div className="mx-auto max-w-3xl">
        <SiteLinks />
      </div>
    </div>
  );
}

export function RightColumnSiteLinks() {
  return <SiteLinks placement="right-column" />;
}
