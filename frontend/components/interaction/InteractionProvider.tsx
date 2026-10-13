"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Eye, Mic, Volume2 } from "lucide-react";
import { useTheme } from "next-themes";
import type { Locale } from "@/lib/interaction/locale";
import { BrowserSpeechProvider } from "@/lib/interaction/speech";
import { defaultPreferences, mergePreferences, readPreferences, writePreferences, type Preferences } from "@/lib/interaction/preferences";
import EmergencyButton from "@/components/support/EmergencyButton";
import OfflineSetup from "./OfflineSetup";
import { putSupport, readSupport, syncSupport } from "@/lib/interaction/support-store";

type Interaction = { preferences: Preferences; locale: Locale; ready: boolean; voiceFallback: boolean; fallback: () => void; update: (value: Partial<Preferences>) => void };
const Context = createContext<Interaction | null>(null);
export function useInteraction() {
  const context = useContext(Context);
  if (!context) throw new Error("InteractionProvider is required");
  return context;
}

export function InteractionProvider({ locales, children }: { locales: Locale[]; children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [patient, setPatient] = useState("local-patient");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [voiceFallback, setVoiceFallback] = useState(false);
  const { theme, setTheme } = useTheme();
  const speaker = useMemo(() => new BrowserSpeechProvider(), []);
  const locale = locales.find(l => l.code === preferences.language) ?? locales.find(l => l.code === "en")!;
  useEffect(() => {
    const load = () => {
      const id = localStorage.getItem("cogni:patient") || "local-patient";
      setPatient(id);
      const value = readPreferences(localStorage, id);
      setPreferences(value); setOpen(value.updatedAt === 0); setReady(true);
    };
    try { load(); } catch { setReady(true); }
    window.addEventListener("cogni:patient-change", load);
    window.addEventListener("storage", load);
    return () => { speaker.cancel(); window.removeEventListener("cogni:patient-change", load); window.removeEventListener("storage", load); };
  }, [speaker]);
  useEffect(() => { document.documentElement.style.fontSize = preferences.textSize === "larger" ? "22px" : "18px"; }, [preferences.textSize]);
  useEffect(() => {
    if (!ready || patient === "local-patient") return;
    const mergeRemote = () => {
      try {
        const rows = readSupport(patient).records;
        const remote = rows.find(row => row.id === "interaction-preference") ?? rows.find(row => row.id === "interaction-default");
        if (!remote || !["read", "voice", "mixed"].includes(String(remote.data.mode))) return;
        const local = readPreferences(localStorage, patient);
        const next = mergePreferences(local, { ...defaultPreferences, ...remote.data, updatedAt: remote.updatedAt } as Preferences);
        writePreferences(localStorage, patient, next); setPreferences(next);
      } catch { setNotice(locale.storageError); }
    };
    const sync = () => { void syncSupport(patient).then(mergeRemote).catch(() => {}); };
    sync(); const timer = setInterval(sync, 20000);
    window.addEventListener("online", sync); window.addEventListener("cogni:support", mergeRemote);
    return () => { clearInterval(timer); window.removeEventListener("online", sync); window.removeEventListener("cogni:support", mergeRemote); };
  }, [patient, ready, locale.storageError]);
  const update = (value: Partial<Preferences>) => {
    const next = { ...preferences, ...value, updatedAt: Date.now(), override: true };
    setPreferences(next);
    setVoiceFallback(false);
    try { writePreferences(localStorage, patient, next); if (patient !== "local-patient") putSupport(patient, "preference", next, "interaction-preference"); setNotice(locale.saved); }
    catch { setNotice(locale.storageError); }
  };
  return <Context.Provider value={{ preferences, locale, ready, update, voiceFallback, fallback: () => { setVoiceFallback(true); setNotice(locale.fallback); } }}>
    {children}
    <EmergencyButton />
    <OfflineSetup />
    <div data-voice-ignore className="fixed bottom-20 right-3 z-50 max-w-[calc(100vw-1.5rem)] print:hidden lg:bottom-4">
      <button className="min-h-14 rounded-xl border-2 bg-background px-5 text-lg font-bold shadow-lg" onClick={() => setOpen(!open)} aria-expanded={open}><Eye className="mr-2 inline h-7 w-7" />{locale[preferences.mode]}</button>
      {voiceFallback && <p role="status" className="max-w-sm rounded-xl border-2 bg-background p-3">{locale.fallback}</p>}
      {open && <section aria-label={locale.choose} className="mt-2 max-h-[65vh] w-96 max-w-full overflow-auto rounded-xl border-2 bg-background p-4 shadow-xl">
        <h2 className="mb-3 text-xl font-bold">{locale.choose}</h2>
        <div className="grid gap-3">
          {(["read", "voice", "mixed"] as const).map((mode, i) => {
            const Icon = [Eye, Volume2, Mic][i];
            return <button key={mode} aria-pressed={preferences.mode === mode} className={`min-h-16 rounded-lg border-2 p-3 text-left text-xl ${preferences.mode === mode ? "border-primary bg-primary/10" : "border-border"}`} onClick={() => {
              update({ mode });
              void speaker.speak(locale[mode], locale.speechLanguage).catch(() => setNotice(locale.fallback));
            }}><Icon className="mr-3 inline h-8 w-8" />{locale[mode]}</button>;
          })}
          <label>Language<select className="mt-1 min-h-14 w-full rounded-lg border bg-background p-2" value={locale.code} onChange={e => update({ language: e.target.value })}>{locales.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
          <label>Text size<select className="mt-1 min-h-14 w-full rounded-lg border bg-background p-2" value={preferences.textSize} onChange={e => update({ textSize: e.target.value as Preferences["textSize"] })}><option value="large">Large</option><option value="larger">Larger</option></select></label>
          <label>Theme<select className="mt-1 min-h-14 w-full rounded-lg border bg-background p-2" value={theme ?? "system"} onChange={e => setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
          <p role="status">{notice}</p>
          <button className="min-h-14 rounded-lg bg-primary px-4 text-primary-foreground" onClick={() => { if (!preferences.updatedAt) update({ mode: "read" }); setOpen(false); }}>{locale.yes}</button>
        </div>
      </section>}
    </div>
  </Context.Provider>;
}
