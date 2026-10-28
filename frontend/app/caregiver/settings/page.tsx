"use client";

import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import SettingsContent from "@/components/caregiver/settingsContent";
import { PatientsAndDevices, AccountSettings } from "@/components/auth/patient-controls";
import { apiJSON } from "@/lib/api";
import { useTranslate } from "@/components/interaction/InteractionProvider";

export default function CaregiverSettingsPage() {
  const { t } = useTranslate();
  const reset = async () => { if (!window.confirm("Reset demo data?")) return; await apiJSON("/demo/reset", { method: "POST" }); window.location.reload(); };
  return <><Nav /><CaregiverOnly><main className="mx-auto max-w-screen-xl space-y-6 px-4 pb-24 pt-24 lg:pb-12 lg:pt-8"><header><p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Caregiver portal</p><h1 className="mt-1 text-3xl font-bold">Settings</h1></header>{process.env.NEXT_PUBLIC_DEMO === "1" && <section className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5"><h2 className="text-xl font-bold">Demo data</h2><p className="mt-2">Restore the shared demo patient to its sample data.</p><button className="mt-4 min-h-12 rounded-xl border px-5" onClick={() => void reset()}>Reset demo data</button></section>}<section aria-labelledby="emergency-help-heading" className="space-y-3 rounded-2xl border border-border bg-card p-5"><h2 id="emergency-help-heading" className="text-2xl font-bold">{t("Emergency help")}</h2><div className="grid gap-2 sm:grid-cols-2">{["Call 112", "Call my contacts", "SOS for self-care accounts", "Text message alerts"].map(label => <button key={label} type="button" disabled className="min-h-14 cursor-not-allowed rounded-xl border-2 px-4 text-lg font-semibold text-muted-foreground">{t(label)} · {t("Coming soon")}</button>)}</div></section><PatientsAndDevices /><SettingsContent /><AccountSettings /></main></CaregiverOnly></>;
}
