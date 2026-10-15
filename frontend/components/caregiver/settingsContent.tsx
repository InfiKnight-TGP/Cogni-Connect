"use client";

import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTheme } from "next-themes";
import { LANGUAGES } from "@/components/siteLinks";
import { usePreferences } from "@/components/interaction/InteractionProvider";
import type { Preferences } from "@/lib/interaction/preferences";

export default function SettingsContent() {
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences, effectiveAnimations, reducedMotion } = usePreferences();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const setPreference = <K extends keyof Preferences,>(key: K, value: Preferences[K]) => updatePreferences({ [key]: value } as Pick<Preferences, K>);

  useEffect(() => {
    fetch(`${API_URL}/settings`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        setName(data.patient_name ?? "");
        const configured = LANGUAGES.find(item => item.code === data.language);
        setLanguage(configured?.selectable ? configured.code : "en");
      })
      .catch(() => setNotice("Could not load settings."));
  }, []);

  const save = async () => {
    setNotice("");
    const response = await fetch(`${API_URL}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient_name: name.trim(), language }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not save settings.");
    setNotice("Settings saved.");
  };
  const changePin = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${API_URL}/caregiver/change-pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not change PIN.");
      setCurrentPin(""); setNewPin(""); setNotice("PIN changed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not change PIN."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <Card className="space-y-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <section aria-labelledby="caregiver-activity-heading">
        <h2 id="caregiver-activity-heading" className="text-xl font-bold">Activity experience</h2><hr className="my-3 border-border" />
        <ToggleRow label="Sound effects" checked={preferences.soundEffects} onChange={value => setPreference("soundEffects", value)} />
        <ToggleRow label="Animations" checked={effectiveAnimations} disabled={reducedMotion} onChange={value => setPreference("animations", value)} />
        {reducedMotion && <p className="text-sm text-muted-foreground">Animations are off because reduced motion is enabled on this device.</p>}
        <ToggleRow label="Encouraging messages" checked={preferences.encouragingMessages} onChange={value => setPreference("encouragingMessages", value)} />
      </section>
      <section aria-labelledby="caregiver-accessibility-heading">
        <h2 id="caregiver-accessibility-heading" className="text-xl font-bold">Accessibility</h2><hr className="my-3 border-border" />
        <ToggleRow label="Read questions aloud" checked={preferences.readAloud} onChange={value => setPreference("readAloud", value)} />
        <ToggleRow label="Answer by speaking" checked={preferences.answerBySpeaking} onChange={value => setPreference("answerBySpeaking", value)} />
        <ToggleRow label="Listen automatically" checked={preferences.listenAutomatically} disabled={!preferences.answerBySpeaking} onChange={value => setPreference("listenAutomatically", value)} />
        <Segmented label="Speech speed" value={preferences.speechRate} onChange={value => setPreference("speechRate", value)} options={[{ value: "slow", label: "Slow" }, { value: "normal", label: "Normal" }]} />
        <Segmented label="Text size" value={preferences.textSize} onChange={value => setPreference("textSize", value)} options={[{ value: "large", label: "Large" }, { value: "larger", label: "Larger" }, { value: "largest", label: "Largest" }]} />
      </section>
    </Card>
    <Card className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Patient settings</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Patient name<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label>
        <label className="text-sm font-medium">Default language<select value={language} onChange={(event) => { const selected = LANGUAGES.find(item => item.code === event.target.value); if (selected?.selectable) setLanguage(selected.code); }} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3">{LANGUAGES.map(item => <option key={item.code} value={item.code} disabled={!item.selectable}>{item.code.toUpperCase()} – {item.name}{item.selectable ? "" : " (coming soon)"}</option>)}</select></label>
      </div>
      <Button className="mt-4" onClick={() => void save().catch((error) => setNotice(error instanceof Error ? error.message : "Could not save settings."))}>Save settings</Button>
    </Card>
    <Card className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Appearance</h2>
      <label className="mt-3 flex min-h-14 flex-col justify-center gap-2 text-lg font-medium sm:flex-row sm:items-center sm:justify-between"><span>Theme</span><select value={theme ?? "system"} onChange={event => setTheme(event.target.value)} className="min-h-12 rounded-xl border-2 border-input bg-background px-3 text-base"><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="mt-3 flex min-h-14 flex-col justify-center gap-2 text-lg font-medium sm:flex-row sm:items-center sm:justify-between"><span>Patient language</span><select value={language} onChange={event => { const selected = LANGUAGES.find(item => item.code === event.target.value); if (selected?.selectable) setLanguage(selected.code); }} className="min-h-12 max-w-full rounded-xl border-2 border-input bg-background px-3 text-base">{LANGUAGES.map(item => <option key={item.code} value={item.code} disabled={!item.selectable}>{item.code.toUpperCase()} – {item.name}{item.selectable ? "" : " (coming soon)"}</option>)}</select></label>
    </Card>
    <Card className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-muted-foreground" /><h2 className="text-lg font-semibold">Change caregiver PIN</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Enter the current PIN and choose a new four-digit PIN. PINs are never displayed.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Current PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ""))} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label>
        <label className="text-sm font-medium">New PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label>
      </div>
      <Button className="mt-4" disabled={busy || currentPin.length !== 4 || newPin.length !== 4} onClick={() => void changePin()}>Change PIN</Button>
    </Card>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  </div>;
}

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
