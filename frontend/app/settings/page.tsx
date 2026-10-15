"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import Nav from "@/components/nav";
import { API_URL } from "@/lib/api";
import { useInteraction, usePreferences, useTranslate, type LanguageCode } from "@/components/interaction/InteractionProvider";
import { LANGUAGES } from "@/components/siteLinks";
import type { Preferences } from "@/lib/interaction/preferences";

function ToggleRow({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return <div className={`flex min-h-14 items-center justify-between gap-4 py-2 ${disabled ? "opacity-50" : ""}`}>
    <span className="text-lg font-medium">{label}</span>
    <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-12 w-24 shrink-0 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed ${checked ? "border-primary bg-primary" : "border-input bg-muted"}`}>
      <span className={`absolute left-1 top-1 h-8 w-8 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-14" : "translate-x-0"}`} />
    </button>
  </div>;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <fieldset className="space-y-2 py-2">
    <legend className="text-lg font-medium">{label}</legend>
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`min-h-12 rounded-xl border-2 px-4 py-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring ${value === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}>{option.label}</button>)}
    </div>
  </fieldset>;
}

export default function PatientSettingsPage() {
  const { t, caregiver, caregiverReady } = useTranslate();
  const { preferences, updatePreferences, effectiveAnimations, reducedMotion } = usePreferences();
  const { language, ready: languageReady, setLanguage } = useInteraction();
  const { theme, setTheme } = useTheme();
  const [languageError, setLanguageError] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => updatePreferences({ [key]: value } as Pick<Preferences, K>);

  async function saveLanguage(code: LanguageCode) {
    setSavingLanguage(true); setLanguageError(false);
    try {
      const response = await fetch(`${API_URL}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: code }) });
      if (!response.ok) throw new Error("save failed");
      setLanguage(code);
    } catch { setLanguageError(true); }
    finally { setSavingLanguage(false); }
  }

  return <>
    <Nav />
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-24 lg:pt-8">
      <h1 className="mb-8 text-4xl font-extrabold tracking-tight">{t("Settings")}</h1>
      {caregiverReady && caregiver ? <p className="rounded-2xl border border-border bg-card p-6 text-lg">{t("Patient preferences are available in patient mode.")}</p> : !caregiverReady ? <p className="text-lg">{t("Loading…")}</p> : <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-5 text-2xl font-bold">{t("Preferences")}</h2>
          <section aria-labelledby="activity-heading" className="mb-8">
            <h3 id="activity-heading" className="text-xl font-bold">{t("Activity experience")}</h3><hr className="my-3 border-border" />
            <ToggleRow label={t("Sound effects")} checked={preferences.soundEffects} onChange={value => set("soundEffects", value)} />
            <ToggleRow label={t("Animations")} checked={effectiveAnimations} disabled={reducedMotion} onChange={value => set("animations", value)} />
            {reducedMotion && <p className="text-sm text-muted-foreground">{t("Animations are off because reduced motion is enabled on this device.")}</p>}
            <ToggleRow label={t("Encouraging messages")} checked={preferences.encouragingMessages} onChange={value => set("encouragingMessages", value)} />
          </section>
          <section aria-labelledby="accessibility-heading" className="mb-8">
            <h3 id="accessibility-heading" className="text-xl font-bold">{t("Accessibility")}</h3><hr className="my-3 border-border" />
            <ToggleRow label={t("Read questions aloud")} checked={preferences.readAloud} onChange={value => set("readAloud", value)} />
            <ToggleRow label={t("Answer by speaking")} checked={preferences.answerBySpeaking} onChange={value => set("answerBySpeaking", value)} />
            <ToggleRow label={t("Listen automatically")} checked={preferences.listenAutomatically} disabled={!preferences.answerBySpeaking} onChange={value => set("listenAutomatically", value)} />
            <Segmented label={t("Speech speed")} value={preferences.speechRate} onChange={value => set("speechRate", value)} options={[{ value: "slow", label: t("Slow") }, { value: "normal", label: t("Normal") }]} />
            <Segmented label={t("Text size")} value={preferences.textSize} onChange={value => set("textSize", value)} options={[{ value: "large", label: t("Large") }, { value: "larger", label: t("Larger") }, { value: "largest", label: t("Largest") }]} />
          </section>
          <section aria-labelledby="appearance-heading">
            <h3 id="appearance-heading" className="text-xl font-bold">{t("Appearance")}</h3><hr className="my-3 border-border" />
            <label className="mb-4 flex min-h-14 flex-col justify-center gap-2 text-lg font-medium sm:flex-row sm:items-center sm:justify-between">
              <span>{t("Theme")}</span>
              <select value={theme ?? "system"} onChange={event => setTheme(event.target.value)} className="min-h-12 rounded-xl border-2 border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring">
                <option value="system">{t("System default")}</option><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option>
              </select>
            </label>
            <label className="flex min-h-14 flex-col justify-center gap-2 text-lg font-medium sm:flex-row sm:items-center sm:justify-between">
              <span>{t("Language")}</span>
              <select value={languageReady ? language : "en"} disabled={!languageReady || savingLanguage} onChange={event => { const selected = LANGUAGES.find(item => item.code === event.target.value); if (selected?.selectable) void saveLanguage(selected.code as LanguageCode); }} className="min-h-12 max-w-full rounded-xl border-2 border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-60">
                {LANGUAGES.map(item => <option key={item.code} value={item.code} disabled={!item.selectable}>{item.code.toUpperCase()} – {item.name}{item.selectable ? "" : ` (${t("Coming soon")})`}</option>)}
              </select>
            </label>
            {languageError && <p role="alert" className="mt-2 text-sm text-destructive">{t("Could not save language. Try again.")}</p>}
          </section>
        </div>
        <aside className="h-fit rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold">{t("Help")}</h2>
          <nav className="flex flex-col items-start gap-2 text-lg font-medium">
            <Link className="min-h-12 py-2 text-primary underline underline-offset-4" href="/about">{t("About")}</Link>
            <Link className="min-h-12 py-2 text-primary underline underline-offset-4" href="/terms">{t("Terms")}</Link>
            <Link className="min-h-12 py-2 text-primary underline underline-offset-4" href="/privacy">{t("Privacy")}</Link>
          </nav>
          <p className="mt-5 border-t border-border pt-4 text-lg">{t("Need help? Ask your caregiver.")}</p>
        </aside>
      </div>}
    </main>
  </>;
}
