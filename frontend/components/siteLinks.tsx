"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Globe, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { useTranslate, type LanguageCode as SupportedLanguage } from "@/components/interaction/InteractionProvider";

const LANGUAGES = [
  { code: "en", name: "English", englishName: "English", selectable: true },
  { code: "hi", name: "हिन्दी", englishName: "Hindi", selectable: true },
  { code: "bn", name: "বাংলা", englishName: "Bengali", selectable: false },
  { code: "mr", name: "मराठी", englishName: "Marathi", selectable: false },
  { code: "te", name: "తెలుగు", englishName: "Telugu", selectable: false },
  { code: "ta", name: "தமிழ்", englishName: "Tamil", selectable: false },
  { code: "gu", name: "ગુજરાતી", englishName: "Gujarati", selectable: false },
  { code: "ur", name: "اردو", englishName: "Urdu", selectable: false },
  { code: "kn", name: "ಕನ್ನಡ", englishName: "Kannada", selectable: false },
  { code: "or", name: "ଓଡ଼ିଆ", englishName: "Odia", selectable: false },
  { code: "ml", name: "മലയാളം", englishName: "Malayalam", selectable: false },
  { code: "pa", name: "ਪੰਜਾਬੀ", englishName: "Punjabi", selectable: false },
  { code: "as", name: "অসমীয়া", englishName: "Assamese", selectable: true },
  { code: "ne", name: "नेपाली", englishName: "Nepali", selectable: false },
  { code: "mni-Mtei", name: "ꯃꯤꯇꯩꯂꯣꯟ", englishName: "Meitei", selectable: false },
] as const;

type ThemeChoice = "system" | "light" | "dark";
type LanguageItemCode = (typeof LANGUAGES)[number]["code"];

const THEME_CHOICES: { value: ThemeChoice; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function languageLabel(code: LanguageItemCode) {
  return code === "mni-Mtei" ? "MNI" : code.toUpperCase();
}

function SiteLinks({ placement = "page" }: { placement?: "page" | "right-column" }) {
  const { theme, setTheme } = useTheme();
  const { t, language, ready: languageLoaded, setLanguage, caregiver } = useTranslate();
  const [mounted, setMounted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageTriggerRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!languageMenuOpen && !themeMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!languageMenuRef.current?.contains(target)) setLanguageMenuOpen(false);
      if (!themeMenuRef.current?.contains(target)) setThemeMenuOpen(false);
    };
    const handleMenuKeyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const menu = target.closest<HTMLElement>('[role="menu"]');
      if (event.key === "Escape") {
        if (menu && languageMenuRef.current?.contains(menu)) {
          setLanguageMenuOpen(false);
          languageTriggerRef.current?.focus();
          event.preventDefault();
        } else if (menu && themeMenuRef.current?.contains(menu)) {
          setThemeMenuOpen(false);
          themeTriggerRef.current?.focus();
          event.preventDefault();
        }
        return;
      }
      if (!menu || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]:not(:disabled)'));
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? (delta > 0 ? 0 : items.length - 1)
        : (currentIndex + delta + items.length) % items.length;
      event.preventDefault();
      items[nextIndex].focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", handleMenuKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", handleMenuKeyboard);
    };
  }, [languageMenuOpen, themeMenuOpen]);

  useEffect(() => {
    if (languageMenuOpen) {
      const menu = languageMenuRef.current;
      (menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
        ?? menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus();
    }
    if (themeMenuOpen) {
      const menu = themeMenuRef.current;
      (menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
        ?? menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus();
    }
  }, [languageMenuOpen, themeMenuOpen]);

  const saveLanguage = async (code: SupportedLanguage) => {
    setSaveError(false);
    try {
      const response = await fetch(`${API_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: code }),
      });
      if (!response.ok) throw new Error("Could not save language");
      setLanguage(code);
    } catch {
      setSaveError(true);
    }
  };

  const currentTheme: ThemeChoice = mounted && (theme === "light" || theme === "dark") ? theme : "system";
  const CurrentThemeIcon = THEME_CHOICES.find(({ value }) => value === currentTheme)?.Icon ?? Monitor;

  return (
    <section className={`w-full text-center ${placement === "right-column" ? "" : "mx-auto"}`} aria-label={t("Site links and preferences")}>
      <div className="mx-auto flex w-full flex-col items-center gap-3">
        <nav className="flex min-h-11 flex-wrap items-center justify-center gap-x-2 text-base font-bold tracking-wide text-muted-foreground" aria-label="Information">
          <Link className="flex min-h-11 items-center rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/about">{t("About")}</Link>
          <span aria-hidden="true">·</span>
          <Link className="flex min-h-11 items-center rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/terms">{t("Terms")}</Link>
          <span aria-hidden="true">·</span>
          <Link className="flex min-h-11 items-center rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/privacy">{t("Privacy")}</Link>
        </nav>

        <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <div className="relative" ref={languageMenuRef}>
            <button
              ref={languageTriggerRef}
              type="button"
              aria-label={`${t("Language")}: ${languageLabel(language)}`}
              aria-haspopup="menu"
              aria-expanded={languageMenuOpen}
              disabled={!languageLoaded}
              onClick={() => {
                setThemeMenuOpen(false);
                setLanguageMenuOpen((open) => !open);
              }}
              className="flex min-h-11 items-center gap-2 px-2 text-base text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              <Globe aria-hidden="true" className="h-5 w-5" />
              <span>{languageLabel(language || "en")}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
            {languageMenuOpen && (
              <div role="menu" aria-label={t("Choose language")} className="absolute left-1/2 top-full z-50 mt-1 max-h-72 w-max min-w-52 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-card p-1 text-left shadow-lg">
                {LANGUAGES.map((item) => {
                  const selected = language === item.code;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      disabled={!item.selectable}
                      onClick={() => {
                        setLanguageMenuOpen(false);
                        if (item.selectable) void saveLanguage(item.code as SupportedLanguage);
                      }}
                      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded px-3 py-2 text-left text-base text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="w-10 shrink-0 font-semibold">{languageLabel(item.code)}</span>
                      <span className="min-w-0 break-words">– {caregiver ? item.englishName : item.name}</span>
                      {!item.selectable && <span className="ml-auto shrink-0 text-xs">{t("Coming soon")}</span>}
                      {selected && <Check aria-hidden="true" className="ml-auto h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative" ref={themeMenuRef}>
            <button
              ref={themeTriggerRef}
              type="button"
              aria-label={`${t("Theme")}: ${t(THEME_CHOICES.find(({ value }) => value === currentTheme)?.label ?? "System")}`}
              aria-haspopup="menu"
              aria-expanded={themeMenuOpen}
              onClick={() => {
                setLanguageMenuOpen(false);
                setThemeMenuOpen((open) => !open);
              }}
              className="flex min-h-11 items-center gap-2 px-2 text-base text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <CurrentThemeIcon aria-hidden="true" className="h-5 w-5" />
              <span>{t("Theme")}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
            {themeMenuOpen && (
              <div role="menu" aria-label={t("Choose theme")} className="absolute left-1/2 top-full z-50 mt-1 max-h-72 w-max min-w-52 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-card p-1 text-left shadow-lg">
                {THEME_CHOICES.map(({ value, label, Icon }) => {
                  const selected = mounted && currentTheme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setTheme(value);
                        setThemeMenuOpen(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-base text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                      <span>{t(label)}</span>
                      {selected && <Check aria-hidden="true" className="ml-auto h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {saveError && <p className="text-sm text-destructive" role="status">{t("Could not save language. Try again.")}</p>}
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
