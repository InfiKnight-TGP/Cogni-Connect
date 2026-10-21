"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiJSON, jsonBody } from "@/lib/api";
import { AuthFrame, Notice, actionClass, fieldClass } from "@/components/auth/fields";
import { JoinPatient, PairingPanel } from "@/components/auth/patient-controls";
export default function Setup() {
  const { session } = useAuth(); const patient = session?.activePatient;
  const [name, setName] = useState(patient?.name ?? ""); const [pairStep, setPairStep] = useState(false);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setPairStep(new URLSearchParams(window.location.search).get("pair") === "1"); }, []);
  if (session?.role !== "caregiver") return <AuthFrame title="Caregiver setup"><Link href="/" className={actionClass}>Go Home</Link></AuthFrame>;
  if (pairStep && patient) return <AuthFrame title={`Connect a device for ${patient.name}`}><PairingPanel patientId={patient.id} /><Link className={actionClass} href="/caregiver">Continue to caregiver Home</Link><p className="text-lg">Set the caregiver PIN in Settings → Patients & Devices.</p></AuthFrame>;
  return <AuthFrame title="Who are you caring for?">
    {patient && <p>Your existing memories stay with this patient profile.</p>}
    <form className="space-y-5" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try {
        let id = patient?.id;
        if (id) await apiJSON("/settings", { ...jsonBody({ patient_name: name.trim() }), headers: { "Content-Type": "application/json", "X-Cogni-Patient": id } });
        else id = (await apiJSON<{ id: string }>("/patients", jsonBody({ name: name.trim() }))).id;
        document.cookie = `cogni_patient=${encodeURIComponent(id)}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        window.location.assign("/setup?pair=1");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save patient."); setBusy(false); }
    }}><label className="block">Patient name<input required maxLength={60} className={fieldClass} value={name} onChange={e => setName(e.target.value)} /></label><Notice>{notice}</Notice><button className={actionClass} disabled={busy || !name.trim()}>Continue</button></form>
    <JoinPatient />
  </AuthFrame>;
}
