"use client";
import { useState } from "react";
import Link from "next/link";
import { apiJSON, ApiError, jsonBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { AuthFrame, CodeInput, Notice, fieldClass, actionClass } from "@/components/auth/fields";
export default function Pair() {
  const { session } = useAuth(); const { t } = useTranslate();
  const [code, setCode] = useState(""); const [label, setLabel] = useState("");
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (session?.role === "caregiver") return <AuthFrame title="Set up the patient's device"><p>{t("Open this page on the patient's device or in a private window, then enter the pairing code.")}</p><Link className={actionClass} href="/caregiver/settings">{t("Patients & Devices")}</Link></AuthFrame>;
  if (name) return <AuthFrame title={`Hello ${name}`}><p>{t("You are ready. Let's open your Home.")}</p><a className={actionClass} href="/">{t("Open Home")}</a></AuthFrame>;
  return <AuthFrame title="Enter your pairing code"><p>{t("Your caregiver will give you this code.")}</p>
    {process.env.NEXT_PUBLIC_DEMO === "1" && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-semibold">Demo code: DEMA-2345</p>}
    <form className="space-y-6" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { const result = await apiJSON<{ patientName: string }>("/pair/redeem", { ...jsonBody({ code, device_label: label }), authRedirect: false }); setName(result.patientName); }
      catch (error) { setError(error instanceof ApiError && error.status === 400 ? "That code may have expired or already been used. Ask your caregiver for a new one." : error instanceof Error ? error.message : "Could not connect. Please try again."); }
      finally { setBusy(false); }
    }}>
      <CodeInput length={8} label={t("Pairing code")} value={code} onChange={setCode} />
      <label className="block">{t("Device name (optional)")}<input className={fieldClass} maxLength={100} placeholder={t("My tablet")} value={label} onChange={e => setLabel(e.target.value)} /></label>
      <Notice>{t(error)}</Notice><button className={`${actionClass} w-full`} disabled={busy || code.length !== 8}>{t(busy ? "Connecting…" : "Connect this device")}</button>
    </form>
  </AuthFrame>;
}
