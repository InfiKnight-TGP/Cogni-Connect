"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Globe, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
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

const FOOTER_COPY = {
  memoryLine: "Built with ❤️ to help individuals with dementia and Alzheimer's stay connected to their memories",
  tagline: "CogniConnect - Connecting Minds, Preserving Memories",
};

const THEME_CHOICES: { value: ThemeChoice; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function isLanguageCode(code: unknown): code is LanguageCode {
  return LANGUAGES.some((language) => language.code === code);
}

function SiteLinks({ placement = "page" }: { placement?: "page" | "right-column" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState<LanguageCode | "">("");
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);

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

        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <label className="flex h-11 min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2 text-foreground focus-within:ring-2 focus-within:ring-primary">
            <Globe aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="sr-only">Language</span>
            <select
              aria-label="Language"
              className="h-full min-w-0 max-w-40 bg-transparent text-base outline-none"
              dir={language === "ur" ? "rtl" : "ltr"}
              value={languageLoaded ? language || "en" : ""}
              disabled={!languageLoaded}
              onChange={(event) => {
                if (isLanguageCode(event.target.value)) void saveLanguage(event.target.value);
              }}
            >
              {!languageLoaded && <option value="">Loading…</option>}
              {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>

          <div className="flex h-12 items-center rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Theme">
            {THEME_CHOICES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={isSelected(value)}
                onClick={() => setTheme(value)}
                className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected(value) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        {saveError && <p className="text-sm text-destructive" role="status">Could not save language. Try again.</p>}

        <div className="space-y-1 text-sm leading-relaxed text-muted-foreground">
          <p>{FOOTER_COPY.memoryLine}</p>
          <p>{FOOTER_COPY.tagline}</p>
        </div>
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
