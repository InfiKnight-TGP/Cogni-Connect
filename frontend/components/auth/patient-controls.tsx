"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJSON, jsonBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CodeInput, Notice, PasswordField, actionClass, secondaryClass, fieldClass } from "./fields";
type Device = { id: string; device_label: string; last_seen: number };
type PairCode = { code: string; expiresAt: number };

export function PairingPanel({ patientId }: { patientId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pair, setPair] = useState<PairCode | null>(null);
  const [kind, setKind] = useState<"device" | "caregiver">("device");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false); const [expired, setExpired] = useState(false);
  const previous = useRef<string[]>([]);
  const load = useCallback(async () => {
    const result = await apiJSON<{ devices: Device[] }>(`/pair/devices?patient_id=${encodeURIComponent(patientId)}`);
    setDevices(result.devices); return result.devices;
  }, [patientId]);
  useEffect(() => { void load().catch(() => setNotice("Could not load paired devices. Please try again.")); }, [load]);
  useEffect(() => {
    if (!pair || kind !== "device" || connected) return;
    let active = true;
    const timer = window.setInterval(async () => {
      if (Date.now() >= pair.expiresAt * 1000) { setExpired(true); clearInterval(timer); return; }
      try {
        const result = await load();
        if (active && result.some(device => !previous.current.includes(device.id))) { setConnected(true); setNotice("Device connected. You are ready!"); }
      } catch { if (active) setNotice("Connection interrupted. We will keep checking."); }
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [pair, kind, connected, load]);
  const create = async (nextKind: "device" | "caregiver") => {
    setBusy(true); setNotice("");
    try {
      previous.current = (await load()).map(device => device.id);
      const next = await apiJSON<PairCode>(nextKind === "device" ? "/pair/create" : "/pair/invite", jsonBody({ patient_id: patientId }));
      setKind(nextKind); setPair(next); setConnected(false); setExpired(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create a code."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-5">
    <div className="flex flex-wrap gap-3"><button disabled={busy} className={actionClass} onClick={() => void create("device")}>New pairing code</button><button disabled={busy} className={secondaryClass} onClick={() => void create("caregiver")}>Invite another caregiver</button></div>
    {pair && <div className="space-y-4 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-center">
      <h3 className="text-xl font-bold">{kind === "device" ? "Patient device code" : "Caregiver invite code"}</h3>
      <p className="break-all font-mono text-4xl font-bold tracking-wider sm:text-5xl">{pair.code}</p>
      <p>{kind === "device" ? "Open /pair on the patient's device and enter this code. Valid for 24 hours, once." : "Share this with a trusted caregiver. After signing in, they can join from Patients & Devices. Valid for 48 hours, once."}</p>
      <button className={secondaryClass} onClick={async () => { try { await navigator.clipboard.writeText(pair.code); setNotice("Code copied."); } catch { setNotice("Select the code above to copy it."); } }}>Copy code</button>
      {kind === "device" && <p role="status">{expired ? "This code has expired. Create a new code." : connected ? "Device connected!" : "Waiting for the device to connect…"}</p>}
    </div>}
    <h3 className="text-xl font-bold">Paired devices</h3>
    {devices.length === 0 && <p>No devices connected yet.</p>}
    <ul className="space-y-3">{devices.map(device => <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <span>{device.device_label || "Patient device"}</span><button disabled={busy} className={secondaryClass} onClick={async () => {
        if (!window.confirm(`Unpair ${device.device_label || "this device"}? It will need a new code to reconnect.`)) return;
        setBusy(true); setNotice("");
        try { await apiJSON(`/pair/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" }); await load(); setNotice("Device unpaired."); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Could not unpair this device."); }
        finally { setBusy(false); }
      }}>Unpair</button>
    </li>)}</ul><Notice>{notice}</Notice>
  </section>;
}

export function JoinPatient() {
  const { selectPatient } = useAuth(); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setNotice("");
    try { const result = await apiJSON<{ patient_id: string }>("/pair/join", jsonBody({ code })); await selectPatient(result.patient_id); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not join this patient."); setBusy(false); }
  }}>
    <h3 className="text-xl font-bold">Have a caregiver invite?</h3>
    <p className="text-base text-muted-foreground">Only enter a code if another caregiver shared an invite code with you. If you are managing your own patient, you don&apos;t need an invite code.</p>
    <CodeInput label="Caregiver invite code" length={8} value={code} onChange={setCode} />
    <button className={secondaryClass} disabled={busy || code.length !== 8}>Join patient</button>
    <Notice>{notice}</Notice>
  </form>;
}

export function PatientsAndDevices() {
  const { session, selectPatient, refresh } = useAuth();
  const [name, setName] = useState(""); const [current, setCurrent] = useState(""); const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const patient = session?.activePatient;
  if (!patient) return null;
  return <section className="space-y-7 rounded-2xl border bg-card p-5 sm:p-7">
    <h2 className="text-2xl font-bold">Patients & Devices</h2><p className="text-xl">Managing {patient.name}</p>
    <PairingPanel key={patient.id} patientId={patient.id} />
    <form className="space-y-4 border-t pt-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { await apiJSON(`/patients/${encodeURIComponent(patient.id)}/pin`, jsonBody({ current_pin: current, new_pin: pin })); setCurrent(""); setPin(""); setNotice("PIN saved."); await refresh(); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not save PIN."); }
      finally { setBusy(false); }
    }}><h3 className="text-xl font-bold">Set or change caregiver PIN</h3><p>Leave the current PIN empty when setting one for the first time. Changing it ends caregiver mode on paired devices.</p>
      <label className="block">Current PIN<input className={fieldClass} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={current} onChange={e => setCurrent(e.target.value.replace(/\D/g, ""))} /></label>
      <label className="block">New four-digit PIN<input required className={fieldClass} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} /></label>
      <button className={secondaryClass} disabled={busy || pin.length !== 4}>Save PIN</button>
    </form>
    {session.role === "caregiver" && <><form className="space-y-4 border-t pt-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { const result = await apiJSON<{ id: string }>("/patients", jsonBody({ name: name.trim() })); await selectPatient(result.id); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not create patient."); setBusy(false); }
    }}><h3 className="text-xl font-bold">Create another patient</h3><label className="block">Patient name<input required className={fieldClass} maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={busy || !name.trim()} className={secondaryClass}>Create patient</button></form><JoinPatient /></>}
    <Notice>{notice}</Notice>
  </section>;
}

export function AccountSettings() {
  const { session, logout } = useAuth(); const [password, setPassword] = useState(""); const [current, setCurrent] = useState("");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  if (session?.role !== "caregiver") return null;
  return <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7"><h2 className="text-2xl font-bold">Account</h2><p className="break-all text-xl">{session.user?.email}</p>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { await apiJSON("/auth/password", jsonBody({ current_password: current, password })); setCurrent(""); setPassword(""); setNotice("Password changed. Other caregiver sessions have been signed out."); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not change password."); }
      finally { setBusy(false); }
    }}><PasswordField label="Current password" current value={current} onChange={setCurrent} /><PasswordField label="New password" value={password} onChange={setPassword} /><button className={secondaryClass} disabled={busy}>Change password</button></form>
    <button className={secondaryClass} disabled={busy} onClick={() => { setBusy(true); void logout().catch(() => { setNotice("Could not sign out. Please try again."); setBusy(false); }); }}>Sign out</button><Notice>{notice}</Notice>
  </section>;
}
