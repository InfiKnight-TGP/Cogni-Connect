"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiJSON, jsonBody } from "@/lib/api";
import { AuthFrame, Notice, actionClass, fieldClass, secondaryClass } from "@/components/auth/fields";
import { JoinPatient, PairingPanel } from "@/components/auth/patient-controls";
export default function Setup() {
  const { session } = useAuth(); const patient = session?.activePatient;
  const [name, setName] = useState(patient?.name ?? ""); const [pairStep, setPairStep] = useState(false);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setPairStep(new URLSearchParams(window.location.search).get("pair") === "1"); }, []);
  if (session?.role !== "caregiver") return <AuthFrame title="Caregiver setup"><Link href="/" className={actionClass}>Go Home</Link></AuthFrame>;
  if (pairStep && patient) return <AuthFrame title={`Connect a device for ${patient.name}`}>
    <section className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <p>Connect the device the patient will use. You can also do this later from caregiver settings.</p>
      <PairingPanel patientId={patient.id} />
      <Link className={actionClass} href="/caregiver">Continue to caregiver home</Link>
      <p className="text-base text-muted-foreground">Set the caregiver PIN in Settings → Patients &amp; Devices.</p>
    </section>
  </AuthFrame>;
  return <AuthFrame title={patient ? `Managing ${patient.name}` : "Who are you caring for?"}>
    {patient && (
      <section className="space-y-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 sm:p-7">
        <p className="text-lg font-medium">You are currently managing <strong>{patient.name}</strong>.</p>
        <div className="flex flex-wrap gap-3">
          <Link className={actionClass} href="/caregiver">Go to Caregiver Dashboard →</Link>
          <Link className={secondaryClass} href="/setup?pair=1">Connect patient device</Link>
        </div>
      </section>
    )}
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-bold">{patient ? "Update patient name" : "Patient details"}</h2>
      <p className="text-base text-muted-foreground">Add the name you use for the person whose memories and activities you’ll support.</p>
      {patient && <p className="rounded-xl bg-muted p-4 text-base">Your existing memories stay with this patient profile.</p>}
      <form className="space-y-5" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try {
        let id = patient?.id;
        if (id) await apiJSON("/settings", { ...jsonBody({ patient_name: name.trim() }), headers: { "Content-Type": "application/json", "X-Cogni-Patient": id } });
        else id = (await apiJSON<{ id: string }>("/patients", jsonBody({ name: name.trim() }))).id;
        document.cookie = `cogni_patient=${encodeURIComponent(id)}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        window.location.assign("/setup?pair=1");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save patient."); setBusy(false); }
      }}><label className="block font-medium">Patient name<input required maxLength={60} autoComplete="off" className={fieldClass} value={name} onChange={e => setName(e.target.value)} /></label><Notice>{notice}</Notice><button className={`${actionClass} w-full`} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Continue"}</button></form>
    </section>
    <section className="space-y-4 rounded-2xl border border-border p-5 sm:p-7">
      <JoinPatient />
    </section>
  </AuthFrame>;
}
