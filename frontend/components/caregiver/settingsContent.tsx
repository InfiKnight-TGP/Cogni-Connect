"use client";

import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const LANGUAGES = [
  ["en", "English"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["mr", "मराठी"], ["te", "తెలుగు"],
  ["ta", "தமிழ்"], ["gu", "ગુજરાતી"], ["ur", "اردو"], ["kn", "ಕನ್ನಡ"], ["or", "ଓଡ଼ିଆ"],
  ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["as", "অসমীয়া"], ["ne", "नेपाली"], ["mni-Mtei", "ꯃꯤꯇꯩꯂꯣꯟ"],
] as const;

export default function SettingsContent() {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/settings`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { setName(data.patient_name ?? ""); setLanguage(data.language ?? "en"); })
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
    <Card className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Patient settings</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Patient name<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" /></label>
        <label className="text-sm font-medium">Default language<select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3">{LANGUAGES.map(([code, native]) => <option key={code} value={code}>{code.toUpperCase()} – {native}</option>)}</select></label>
      </div>
      <Button className="mt-4" onClick={() => void save().catch((error) => setNotice(error instanceof Error ? error.message : "Could not save settings."))}>Save settings</Button>
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
