"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { apiJSON } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Alert = { id: string; patientName: string; createdAt: string; test: boolean };
const enabledKey = "cogni-sos-notifications";
const seenKey = "cogni-sos-notification-seen";

function notifyNew(alerts: Alert[], t: (phrase: string) => string) {
  if (localStorage.getItem(enabledKey) !== "true" || !("Notification" in window) || Notification.permission !== "granted") return;
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(seenKey) ?? "[]") as string[]; } catch { seen = []; }
  const ids = new Set(seen);
  for (const alert of alerts) {
    if (ids.has(alert.id)) continue;
    const notification = new Notification(t("SOS alert"), { body: `${alert.test ? `${t("TEST")}: ` : ""}${alert.patientName} · ${t("Open alert")}` });
    notification.onclick = () => window.location.assign("/caregiver/alerts");
    ids.add(alert.id);
  }
  localStorage.setItem(seenKey, JSON.stringify(Array.from(ids).slice(-200)));
}

export default function SosAlertBanner() {
  const { t } = useTranslate();
  const { session } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const result = await apiJSON<Alert[]>("/sos/alerts?status=open", { authRedirect: false });
      setAlerts(Array.isArray(result) ? result : []);
      notifyNew(Array.isArray(result) ? result : [], t);
    } catch { /* The banner recovers on its next visible poll. */ }
  }, [t]);
  useEffect(() => {
    if (session?.role !== "caregiver") return;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [session?.role, load]);
  if (session?.role !== "caregiver" || alerts.length === 0) return null;
  const newest = alerts[0];
  return <div role="status" className="relative z-50 border-b-2 border-amber-600 bg-amber-100 px-4 py-3 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-lg font-semibold">
      <p className="flex items-center gap-2"><BellRing className="h-6 w-6 shrink-0" />{newest.test && <span className="rounded-md border px-2 py-1 text-base">{t("TEST")}</span>}<span>{newest.patientName} · {t("Open alert")}</span></p>
      <Link className="inline-flex min-h-12 items-center rounded-xl border-2 border-current px-4 underline underline-offset-4" href="/caregiver/alerts">{t("Open alert")}</Link>
    </div>
  </div>;
}
