"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import Nav from "@/components/nav";
import { apiFetch, API_URL } from "@/lib/api";
import { useInteraction, usePreferences, useTranslate, type LanguageCode } from "@/components/interaction/InteractionProvider";
import { LANGUAGES } from "@/components/siteLinks";
import type { Preferences } from "@/lib/interaction/preferences";
import ReadAloud from "@/components/interaction/ReadAloud";
import { AccountSettings, DeviceUnset, FamilySharing } from "@/components/auth/patient-controls";
import { useAuth } from "@/lib/auth-context";

function ToggleRow({ label, checked, onChange, disabled = false, locked = false }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; locked?: boolean }) {
  return <div className={`flex min-h-14 items-center justify-between gap-4 py-2 ${disabled ? "opacity-50" : ""}`}>
    <span className="text-lg font-medium">{label}{locked && <small className="ms-2 block text-sm font-normal text-muted-foreground">Set by your caregiver</small>}</span>
    <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-12 w-24 shrink-0 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed ${checked ? "border-primary bg-primary" : "border-input bg-muted"}`}>
      <span className={`absolute left-1 top-1 h-8 w-8 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-14" : "translate-x-0"}`} />
    </button>
  </div>;
}

function SelfPreferencesCard() {
  const { t } = useTranslate(); const { preferences, updatePreferences } = usePreferences();
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => updatePreferences({ [key]: value } as Pick<Preferences, K>);
  return <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="text-2xl font-bold">{t("Accessibility and preferences")}</h2><h3 className="text-xl font-bold">{t("Activity experience")}</h3><ToggleRow label={t("Sound effects")} checked={preferences.soundEffects} onChange={value => set("soundEffects", value)} /><ToggleRow label={t("Animations")} checked={preferences.animations} onChange={value => set("animations", value)} /><ToggleRow label={t("Encouraging messages")} checked={preferences.encouragingMessages} onChange={value => set("encouragingMessages", value)} /><h3 className="text-xl font-bold">{t("Accessibility")}</h3><ToggleRow label={t("Read questions aloud")} checked={preferences.readAloud} onChange={value => set("readAloud", value)} /><ToggleRow label={t("Answer by speaking")} checked={preferences.answerBySpeaking} onChange={value => set("answerBySpeaking", value)} /><ToggleRow label={t("Listen automatically")} checked={preferences.listenAutomatically} disabled={!preferences.answerBySpeaking} onChange={value => set("listenAutomatically", value)} /><Segmented label={t("Speech speed")} value={preferences.speechRate} onChange={value => set("speechRate", value)} options={[{ value: "slow", label: t("Slow") }, { value: "normal", label: t("Normal") }]} /><Segmented label={t("Text size")} value={preferences.textSize} onChange={value => set("textSize", value)} options={[{ value: "large", label: t("Large") }, { value: "larger", label: t("Larger") }, { value: "largest", label: t("Largest") }]} /></section>;
}

function Segmented<T extends string>({ label, value, options, onChange, disabled = false, locked = false }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean; locked?: boolean }) {
  return <fieldset className="space-y-2 py-2">
    <legend className="text-lg font-medium">{label}{locked && <small className="ms-2 block text-sm font-normal text-muted-foreground">Set by your caregiver</small>}</legend>
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(option => <button key={option.value} type="button" disabled={disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`min-h-12 rounded-xl border-2 px-4 py-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${value === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}>{option.label}</button>)}
    </div>
  </fieldset>;
}

export default function PatientSettingsPage() {
  const { t, caregiver, caregiverReady } = useTranslate();
  const { preferences, updatePreferences, effectiveAnimations, reducedMotion, lockedPreferences, preferenceNotice } = usePreferences();
  const { language, ready: languageReady, setLanguage } = useInteraction();
  const { theme, setTheme } = useTheme();
  const { session } = useAuth();
  const [languageError, setLanguageError] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => updatePreferences({ [key]: value } as Pick<Preferences, K>);
  const locked = session?.role === "patient_device" ? lockedPreferences : new Set<keyof Preferences>();

  async function saveLanguage(code: LanguageCode) {
    if (!caregiver) { setLanguage(code); return; }
    setSavingLanguage(true); setLanguageError(false);
    try {
      const response = await apiFetch(`${API_URL}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: code }) });
      if (!response.ok) throw new Error("save failed");
      setLanguage(code);
    } catch { setLanguageError(true); }
    finally { setSavingLanguage(false); }
  }

  return <>
    <Nav />
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-24 lg:pt-8">
      <h1 className="mb-8 text-4xl font-extrabold tracking-tight">{t("Settings")}</h1>
      {session?.role === "self" ? <div className="space-y-6"><AccountSettings /><FamilySharing /><SelfPreferencesCard /></div> : caregiverReady && caregiver ? <div className="rounded-2xl border border-border bg-card p-6 text-lg"><p>{t("Patient preferences are available in patient mode.")}</p><Link className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground" href="/caregiver/settings">{t("Open caregiver settings")}</Link></div> : !caregiverReady ? <p className="text-lg">{t("Loading…")}</p> : <div className="space-y-6"><div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-5 text-2xl font-bold">{t("Preferences")}</h2>
          <ReadAloud autoRead={false} text={`${t("Activity experience")}. ${t("Sound effects")}. ${t("Animations")}. ${t("Encouraging messages")}. ${t("Accessibility")}. ${t("Read questions aloud")}. ${t("Answer by speaking")}. ${t("Listen automatically")}. ${t("Speech speed")}. ${t("Text size")}. ${t("Appearance")}. ${t("Theme")}. ${t("Language")}. ${t("Help")}. ${t("About")}. ${t("Terms")}. ${t("Privacy")}. ${t("Need help? Ask your caregiver.")}`} />
          <section aria-labelledby="activity-heading" className="mb-8">
            <h3 id="activity-heading" className="text-xl font-bold">{t("Activity experience")}</h3><hr className="my-3 border-border" />
            <ToggleRow label={t("Sound effects")} checked={preferences.soundEffects} locked={locked.has("soundEffects")} disabled={locked.has("soundEffects")} onChange={value => set("soundEffects", value)} />
            <ToggleRow label={t("Animations")} checked={effectiveAnimations} locked={locked.has("animations")} disabled={reducedMotion || locked.has("animations")} onChange={value => set("animations", value)} />
            {reducedMotion && <p className="text-sm text-muted-foreground">{t("Animations are off because reduced motion is enabled on this device.")}</p>}
            <ToggleRow label={t("Encouraging messages")} checked={preferences.encouragingMessages} locked={locked.has("encouragingMessages")} disabled={locked.has("encouragingMessages")} onChange={value => set("encouragingMessages", value)} />
          </section>
          <section aria-labelledby="accessibility-heading" className="mb-8">
            <h3 id="accessibility-heading" className="text-xl font-bold">{t("Accessibility")}</h3><hr className="my-3 border-border" />
            <ToggleRow label={t("Read questions aloud")} checked={preferences.readAloud} locked={locked.has("readAloud")} disabled={locked.has("readAloud")} onChange={value => set("readAloud", value)} />
            <ToggleRow label={t("Answer by speaking")} checked={preferences.answerBySpeaking} locked={locked.has("answerBySpeaking")} disabled={locked.has("answerBySpeaking")} onChange={value => set("answerBySpeaking", value)} />
            <ToggleRow label={t("Listen automatically")} checked={preferences.listenAutomatically} locked={locked.has("listenAutomatically")} disabled={!preferences.answerBySpeaking || locked.has("listenAutomatically")} onChange={value => set("listenAutomatically", value)} />
            <Segmented label={t("Speech speed")} value={preferences.speechRate} locked={locked.has("speechRate")} disabled={locked.has("speechRate")} onChange={value => set("speechRate", value)} options={[{ value: "slow", label: t("Slow") }, { value: "normal", label: t("Normal") }]} />
            <Segmented label={t("Text size")} value={preferences.textSize} locked={locked.has("textSize")} disabled={locked.has("textSize")} onChange={value => set("textSize", value)} options={[{ value: "large", label: t("Large") }, { value: "larger", label: t("Larger") }, { value: "largest", label: t("Largest") }]} />
          </section>
          {preferenceNotice && <p role="alert" className="mb-4 text-lg">{t(preferenceNotice)}</p>}
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
            {languageError && <><p role="alert" className="mt-2 text-sm text-destructive">{t("Could not save language. Try again.")}</p><ReadAloud autoRead={false} text={t("Could not save language. Try again.")} /></>}
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
      </div>{session?.role === "patient_device" && <DeviceUnset />}</div>}
    </main>
  </>;
}
