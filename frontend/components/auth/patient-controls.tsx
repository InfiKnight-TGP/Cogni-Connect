"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJSON, ApiError, jsonBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CodeInput, Notice, PasswordField, actionClass, secondaryClass, fieldClass } from "./fields";
import SignOutButton from "./SignOutButton";
import { useTranslate } from "@/components/interaction/InteractionProvider";
type Device = { id: string; device_label: string; last_seen: number };
type PairCode = { code: string; expiresAt: number };
type Member = { id: string; email: string; name?: string; role: string };

export function DeviceUnset() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false); const [pin, setPin] = useState(""); const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  if (session?.role !== "patient_device" || !session.activePatient) return null;
  const patientName = session.activePatient.name;
  const patientLogin = Boolean(session.role === "patient_device" && session.user?.email);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await apiJSON("/device/unpair", jsonBody({ pin }));
      window.location.assign("/welcome?unset=done");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setNotice("Ask your caregiver to set a PIN first.");
      else if (error instanceof ApiError && error.status === 429) setNotice("Too many attempts. Please wait before trying again.");
      else if (error instanceof ApiError && error.status === 403) setNotice(error.message || "That PIN is not right.");
      else setNotice(error instanceof Error ? error.message : "Could not unset this device.");
    } finally { setBusy(false); }
  };
  return <section className="mt-10 border-t border-border pt-6 text-muted-foreground">
    <h2 className="text-lg font-semibold">For caregivers</h2>
    <button type="button" className="mt-3 min-h-12 rounded-xl border-2 border-border px-5 py-2 text-base font-semibold" onClick={() => { setOpen(true); setNotice(""); setPin(""); }}>
      {patientLogin ? "Sign out" : "Unset this device"}
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="device-unset-title" onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-2xl border bg-card p-6 text-foreground shadow-xl">
        <h3 id="device-unset-title" className="text-2xl font-bold">{patientLogin ? "Sign out" : "Unset this device"}</h3>
        <p className="text-lg">This disconnects the device from {patientName}&apos;s profile. A new pairing code is needed to use it again.</p>
        <label className="block text-lg font-medium">4-digit PIN
          <span className="mt-2 flex gap-2"><input required inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} type={showPin ? "text" : "password"} className={fieldClass} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /><button type="button" className={secondaryClass} onClick={() => setShowPin(value => !value)}>{showPin ? "Hide" : "Show"}</button></span>
        </label>
        {notice && <p role="alert" className="text-lg">{notice}</p>}
        <div className="flex flex-wrap gap-3"><button type="button" className={secondaryClass} onClick={() => setOpen(false)}>Cancel</button><button type="submit" className={actionClass} disabled={busy || pin.length !== 4}>{busy ? "Checking…" : "Confirm"}</button></div>
      </form>
    </div>}
  </section>;
}

export function FamilySharing() {
  const { session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]); const [invite, setInvite] = useState<PairCode | null>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const patient = session?.activePatient;
  const load = useCallback(async () => { if (!patient?.id) return; const result = await apiJSON<{ members: Member[] }>(`/patients/${encodeURIComponent(patient.id)}/members`); setMembers(result.members); }, [patient?.id]);
  useEffect(() => { if (session?.role === "self" && patient?.id) void load().catch(() => setNotice("Could not load family access.")); }, [load, patient?.id, session?.role]);
  if (session?.role !== "self" || !patient) return null;
  const createInvite = async () => { setBusy(true); setNotice(""); try { setInvite(await apiJSON<PairCode>("/pair/invite", jsonBody({ patient_id: patient.id }))); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create an invite."); } finally { setBusy(false); } };
  return <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7"><h2 className="text-2xl font-bold">Family &amp; sharing</h2><p className="text-lg">Invite someone you trust to help with your profile. You can remove their access at any time.</p><button className={actionClass} disabled={busy} onClick={() => void createInvite()}>Invite a family member</button>{invite && <div className="rounded-xl border-2 border-primary bg-primary/5 p-4"><p className="font-semibold">Share this code once. It expires in 48 hours.</p><p className="mt-2 font-mono text-3xl font-bold tracking-wider">{invite.code}</p></div>}<h3 className="text-xl font-bold">People with access</h3><ul className="space-y-3">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><span>{member.name || member.email} <span className="text-sm text-muted-foreground">({member.role})</span></span>{member.role !== "owner" && <button className={secondaryClass} disabled={busy} onClick={async () => { if (!window.confirm("Remove this person's access?")) return; setBusy(true); try { await apiJSON(`/patients/${encodeURIComponent(patient.id)}/members/${encodeURIComponent(member.id)}`, { method: "DELETE" }); await load(); setNotice("Access removed."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove access."); } finally { setBusy(false); } }}>Remove</button>}</li>)}</ul><Notice>{notice}</Notice></section>;
}

export function PairingPanel({ patientId }: { patientId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pair, setPair] = useState<PairCode | null>(null);
  const [kind, setKind] = useState<"device" | "caregiver">("device");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(false); const [newPin, setNewPin] = useState("");
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && nextKind === "device") setPinPrompt(true);
      else setNotice(error instanceof Error ? error.message : "Could not create a code.");
    }
    finally { setBusy(false); }
  };
  return <section className="space-y-5">
    {pinPrompt && <form className="space-y-4 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { await apiJSON(`/patients/${encodeURIComponent(patientId)}/pin`, jsonBody({ current_pin: "", new_pin: newPin })); setPinPrompt(false); setNewPin(""); await create("device"); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the PIN."); }
      finally { setBusy(false); }
    }}><h3 className="text-xl font-bold">Set a PIN before pairing</h3><p>Choose a 4-digit PIN. It is needed to unset the device.</p><input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className={fieldClass} value={newPin} onChange={event => setNewPin(event.target.value.replace(/\D/g, ""))} aria-label="New four-digit PIN" /><button className={actionClass} disabled={busy || newPin.length !== 4}>Save PIN and create code</button></form>}
    <div className="flex flex-wrap gap-3"><button disabled={busy} className={actionClass} onClick={() => void create("device")}>New pairing code</button><button disabled={busy} className={secondaryClass} onClick={() => void create("caregiver")}>Invite another caregiver</button></div>
    {pair && <div className="space-y-4 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-center">
      <h3 className="text-xl font-bold">{kind === "device" ? "Patient device code" : "Caregiver invite code"}</h3>
      <p className="break-all font-mono text-4xl font-bold tracking-wider sm:text-5xl">{pair.code}</p>
      <p>{kind === "device" ? "Open /pair on the patient's device and enter this code. Valid for 24 hours, once." : "Share this with a trusted caregiver. After signing in, they can join from Patients & Devices. Valid for 48 hours, once."}</p>
      <button className={secondaryClass} onClick={async () => { try { await navigator.clipboard.writeText(pair.code); setNotice("Code copied."); } catch { setNotice("Select the code above to copy it."); } }}>Copy code</button>
      {kind === "device" && <p role="status">{expired ? "This code has expired. Create a new code." : connected ? "Device connected. To unset this device later: Settings, then For caregivers, then Unset this device, using the PIN." : "Waiting for the device to connect…"}</p>}
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
  const [loginEmail, setLoginEmail] = useState(""); const [loginPassword, setLoginPassword] = useState(""); const [otpTarget, setOtpTarget] = useState<"caregiver" | "patient">("caregiver");
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const patient = session?.activePatient;
  const [hasLogin, setHasLogin] = useState(false);
  useEffect(() => { if (session?.role === "caregiver" && patient?.id) void apiJSON<{ login: { email: string; otp_target: "caregiver" | "patient" } | null }>(`/patients/${encodeURIComponent(patient.id)}/login`).then(result => { setHasLogin(!!result.login); if (result.login) { setLoginEmail(result.login.email); setOtpTarget(result.login.otp_target); } }).catch(() => undefined); }, [patient?.id, session?.role]);
  if (!patient) return null;
  return <section className="space-y-7 rounded-2xl border bg-card p-5 sm:p-7">
    <h2 className="text-2xl font-bold">Patients & Devices</h2><p className="text-xl">Managing {patient.name}</p>
    <PairingPanel key={patient.id} patientId={patient.id} />
    <form className="space-y-4 border-t pt-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { await apiJSON(`/patients/${encodeURIComponent(patient.id)}/pin`, jsonBody({ current_pin: current, new_pin: pin })); setCurrent(""); setPin(""); setNotice("PIN saved."); await refresh(); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not save PIN."); }
      finally { setBusy(false); }
    }}><h3 className="text-xl font-bold">Set or change caregiver PIN</h3><p>Set a PIN before pairing a new device. Existing devices keep working if no PIN is set. Leave the current PIN empty when setting one for the first time. Changing it ends caregiver mode on paired devices.</p>
      <label className="block">Current PIN<input className={fieldClass} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={current} onChange={e => setCurrent(e.target.value.replace(/\D/g, ""))} /></label>
      <label className="block">New four-digit PIN<input required className={fieldClass} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} /></label>
      <button className={secondaryClass} disabled={busy || pin.length !== 4}>Save PIN</button>
    </form>
    {session.role === "caregiver" && <form className="space-y-4 border-t pt-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { await apiJSON(`/patients/${encodeURIComponent(patient.id)}/login`, jsonBody({ email: loginEmail, password: loginPassword, otp_target: otpTarget })); setLoginPassword(""); setHasLogin(true); setNotice("Patient login created."); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not create the patient login."); }
      finally { setBusy(false); }
    }}><h3 className="text-xl font-bold">Give the patient their own login</h3>{hasLogin && <p className="text-base">Login: {loginEmail}</p>}<label className="block">Patient email<input required type="email" className={fieldClass} value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></label><PasswordField label={hasLogin ? "New patient password" : "Patient password"} value={loginPassword} onChange={setLoginPassword} /><fieldset><legend className="font-semibold">Send login codes to</legend><label className="mr-5 inline-flex items-center gap-2"><input type="radio" checked={otpTarget === "caregiver"} onChange={() => setOtpTarget("caregiver")} /> Me</label><label className="inline-flex items-center gap-2"><input type="radio" checked={otpTarget === "patient"} onChange={() => setOtpTarget("patient")} /> The patient</label></fieldset><button className={secondaryClass} disabled={busy || loginPassword.length < 8}>Create patient login</button>{hasLogin && <button type="button" className={secondaryClass} disabled={busy} onClick={async () => { if (!window.confirm("Remove this patient login?")) return; setBusy(true); try { await apiJSON(`/patients/${encodeURIComponent(patient.id)}/login`, { method: "DELETE" }); setHasLogin(false); setLoginEmail(""); setNotice("Patient login removed."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove the patient login."); } finally { setBusy(false); } }}>Remove patient login</button>}</form>}
    {session.role === "caregiver" && <><form className="space-y-4 border-t pt-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { const result = await apiJSON<{ id: string }>("/patients", jsonBody({ name: name.trim() })); await selectPatient(result.id); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Could not create patient."); setBusy(false); }
    }}><h3 className="text-xl font-bold">Create another patient</h3><label className="block">Patient name<input required className={fieldClass} maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={busy || !name.trim()} className={secondaryClass}>Create patient</button></form><JoinPatient /></>}
    <Notice>{notice}</Notice>
  </section>;
}

export function AccountSettings() {
  const { session } = useAuth();
  const { t } = useTranslate();
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (session?.role !== "caregiver" && session?.role !== "self") return null;
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
      <h2 className="text-2xl font-bold">{t("Account")}</h2>
      <p className="break-all text-xl">{session.user?.email}</p>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setNotice("");
          try {
            await apiJSON(
              "/auth/password",
              jsonBody({ current_password: current, password })
            );
            setCurrent("");
            setPassword("");
            setNotice(
              "Password changed. Other caregiver sessions have been signed out."
            );
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not change password."
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordField
          label="Current password"
          current
          value={current}
          onChange={setCurrent}
        />
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
        />
        <button className={secondaryClass} disabled={busy}>
          Change password
        </button>
      </form>
      <div>
        <SignOutButton />
      </div>
      <Notice>{notice}</Notice>
    </section>
  );
}
