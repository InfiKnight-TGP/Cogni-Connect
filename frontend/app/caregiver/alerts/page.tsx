"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, MapPin } from "lucide-react";
import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { apiJSON, jsonBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { VOICE_ENABLED_PREFIX } from "@/lib/sos-voice";

type Alert = {
  id: string;
  patientId: string;
  patientName: string;
  createdAt: string;
  deviceLabel: string;
  test: boolean;
  status: "open" | "handled";
  handledAt?: string;
  location?: { lat: number; lng: number; accuracy?: number };
};
const enabledKey = "cogni-sos-notifications";
const seenKey = "cogni-sos-notification-seen";

function rememberExisting(alerts: Alert[]) {
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(seenKey) ?? "[]") as string[]; } catch { seen = []; }
  const merged = new Set([...seen, ...alerts.map(alert => alert.id)]);
  localStorage.setItem(seenKey, JSON.stringify(Array.from(merged).slice(-200)));
}

function AlertsContent() {
  const { t } = useTranslate();
  const { session } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const caregiverId = session?.user?.id ?? "default";
  const voiceKey = `${VOICE_ENABLED_PREFIX}${caregiverId}`;

  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const rows = await apiJSON<Alert[]>("/sos/alerts?status=all", { authRedirect: false });
      setAlerts(Array.isArray(rows) ? rows : []); setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    setEnabled(localStorage.getItem(enabledKey) === "true");
    setVoiceEnabled(localStorage.getItem(voiceKey) !== "false");
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visible); window.addEventListener("focus", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [load, voiceKey]);

  useEffect(() => {
    if (typeof window !== "undefined" && !("speechSynthesis" in window)) {
      setNeedsInteraction(true);
    }
    const onInteract = () => { setNeedsInteraction(false); };
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  const open = alerts.filter(alert => alert.status === "open");
  const handled = alerts.filter(alert => alert.status === "handled");

  async function toggleNotifications(next: boolean) {
    if (next) {
      if (!("Notification" in window)) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      rememberExisting(open);
      localStorage.setItem(enabledKey, "true"); setEnabled(true);
    } else { localStorage.setItem(enabledKey, "false"); setEnabled(false); }
  }

  function toggleVoice(next: boolean) {
    localStorage.setItem(voiceKey, String(next));
    setVoiceEnabled(next);
  }

  async function markHandled(alert: Alert) {
    setBusy(alert.id);
    try { await apiJSON(`/sos/alerts/${encodeURIComponent(alert.id)}/handled`, jsonBody({})); await load(); }
    catch { setFailed(true); }
    finally { setBusy(""); }
  }

  async function testAlert() {
    setBusy("test");
    try { await apiJSON("/sos/test", jsonBody({})); await load(); }
    catch { setFailed(true); }
    finally { setBusy(""); }
  }

  return (
    <>
      <Nav />
      <CaregiverOnly>
        <main className="mx-auto max-w-5xl space-y-7 px-4 pb-24 pt-24 lg:pt-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-extrabold">{t("Alerts")}</h1>
              <p className="mt-3 text-lg">
                {t("SOS alerts and optional location are saved only for linked caregivers. Location is optional and stored for 30 days. Alerts are removed after 90 days.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void testAlert()}
              disabled={busy === "test"}
              className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 px-5 text-lg font-semibold disabled:opacity-60"
            >
              <BellRing className="h-6 w-6" />
              {t(busy === "test" ? "Sending alert…" : "Send test alert")}
            </button>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border-2 border-border bg-card p-4 text-lg font-semibold">
              <span>{t("Enable browser notifications")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => void toggleNotifications(!enabled)}
                className={`min-h-14 min-w-28 rounded-xl border-2 px-4 ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              >
                {t(enabled ? "On" : "Off")}
              </button>
            </label>

            <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border-2 border-border bg-card p-4 text-lg font-semibold">
              <span>{t("Speak new alerts")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={voiceEnabled}
                onClick={() => toggleVoice(!voiceEnabled)}
                className={`min-h-14 min-w-28 rounded-xl border-2 px-4 ${voiceEnabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              >
                {t(voiceEnabled ? "On" : "Off")}
              </button>
            </label>
          </div>

          {!enabled && (
            <p className="text-base text-muted-foreground">
              {t("Browser notifications require permission and the caregiver's app tab open.")}
            </p>
          )}

          {needsInteraction && (
            <p role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-base font-semibold">
              {t("Click anywhere on this page once to allow voice alerts.")}
            </p>
          )}

          {failed && (
            <p role="alert" className="rounded-xl border border-amber-500 p-4 text-lg">
              {t("Could not load alerts. Try again.")}
            </p>
          )}

          <section className="space-y-4" aria-labelledby="open-alerts-heading">
            <div className="flex items-center gap-3">
              <h2 id="open-alerts-heading" className="text-2xl font-bold">{t("Open alerts")}</h2>
              <ReadAloud text={t("Open alerts")} autoRead={false} />
            </div>
            {open.length === 0 ? (
              <p className="rounded-2xl border border-border p-5 text-lg">{t("No open alerts.")}</p>
            ) : (
              open.map(alert => (
                <AlertCard key={alert.id} alert={alert} busy={busy === alert.id} onHandle={() => void markHandled(alert)} />
              ))
            )}
          </section>

          <section className="space-y-4" aria-labelledby="handled-alerts-heading">
            <h2 id="handled-alerts-heading" className="text-2xl font-bold">{t("Handled alerts")}</h2>
            {handled.length === 0 ? (
              <p className="rounded-2xl border border-border p-5 text-lg">{t("No handled alerts.")}</p>
            ) : (
              handled.map(alert => <AlertCard key={alert.id} alert={alert} />)
            )}
          </section>
        </main>
      </CaregiverOnly>
    </>
  );
}

function AlertCard({ alert, busy, onHandle }: { alert: Alert; busy?: boolean; onHandle?: () => void }) {
  const { t } = useTranslate();
  const when = new Date(alert.createdAt);
  const time = Number.isNaN(when.getTime()) ? alert.createdAt : when.toLocaleString();
  return (
    <article className="space-y-4 rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-bold">{alert.patientName}</h3>
        {alert.test && (
          <span className="rounded-lg border-2 border-amber-600 px-3 py-1 text-base font-bold text-amber-800 dark:text-amber-200">
            {t("TEST")}
          </span>
        )}
        <span className="text-lg">{t(alert.status === "open" ? "Open alert" : "Handled")}</span>
      </div>
      <p className="text-lg">{t("Time")}: {time}</p>
      <p className="text-lg">{t("Device")}: {alert.deviceLabel}</p>
      <ReadAloud text={`${alert.patientName}. ${t(alert.test ? "TEST" : "SOS alert")}. ${t("Time")}: ${time}`} autoRead={false} />
      {alert.location && (
        <a
          className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 px-4 text-lg font-semibold underline"
          href={`https://maps.google.com/?q=${alert.location.lat},${alert.location.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MapPin className="h-6 w-6" />
          {t("Open map location")}
        </a>
      )}
      {onHandle && (
        <button
          type="button"
          onClick={onHandle}
          disabled={busy}
          className="min-h-14 w-full rounded-xl bg-primary px-5 text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {t(busy ? "Saving…" : "Mark as handled")}
        </button>
      )}
    </article>
  );
}

export default function CaregiverAlertsPage() {
  return <AlertsContent />;
}
