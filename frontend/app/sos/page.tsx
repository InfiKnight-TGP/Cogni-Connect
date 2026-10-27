"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAuth } from "@/lib/auth-context";
import { apiJSON, jsonBody } from "@/lib/api";
import { canUseSos, sosHoldReady } from "@/lib/sos";

const soon = ["Call 112", "Call my contacts", "SOS for self-care accounts", "Text message alerts"] as const;

export default function SosPage() {
  const { t } = useTranslate();
  const { session } = useAuth();
  const allowed = canUseSos(session?.role);
  const selfCare = session?.role === "self";
  const started = useRef<number | null>(null);
  const interval = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function stopHold() {
    started.current = null;
    if (interval.current !== null) window.clearInterval(interval.current);
    interval.current = null;
    if (!confirm) setProgress(0);
  }

  function beginHold() {
    if (!allowed || confirm || sending || sent || started.current !== null) return;
    started.current = Date.now();
    interval.current = window.setInterval(() => {
      const elapsed = Date.now() - (started.current ?? Date.now());
      setProgress(Math.min(100, elapsed / 30));
      if (sosHoldReady(elapsed)) {
        if (interval.current !== null) window.clearInterval(interval.current);
        interval.current = null;
        started.current = null;
        setProgress(100);
        setConfirm(true);
      }
    }, 40);
  }

  async function send(location?: GeolocationPosition) {
    setSending(true); setError("");
    try {
      const data = location ? { location: { lat: location.coords.latitude, lng: location.coords.longitude, accuracy: location.coords.accuracy } } : {};
      await apiJSON("/sos", jsonBody(data));
      setSent(true); setConfirm(false);
    } catch {
      setError(t("Could not send the alert. Please try again."));
    } finally { setSending(false); }
  }

  function confirmSend() {
    if (!navigator.geolocation) { void send(); return; }
    setSending(true); setError("");
    navigator.geolocation.getCurrentPosition(
      position => { void send(position); },
      () => { void send(); },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 7000 },
    );
  }

  return <><Nav /><main className="mx-auto max-w-3xl space-y-7 px-4 pb-24 pt-24 lg:pt-8">
    <header className="space-y-3"><h1 className="text-4xl font-extrabold">{t("Help")}</h1>
      <p className="rounded-2xl border border-amber-500/60 bg-amber-50 p-5 text-xl font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{t("SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself.")}</p>
      <ReadAloud text={t("SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself.")} />
    </header>

    {allowed ? <section className="space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
      <h2 className="text-3xl font-bold">{t("SOS")}</h2>
      {!sent && <>
        <button type="button" onPointerDown={beginHold} onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold}
          onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); beginHold(); } }}
          onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopHold(); } }}
          onBlur={stopHold} aria-label={t("Press and hold for 3 seconds")} aria-describedby="sos-hold-help"
          className="relative mx-auto flex min-h-40 w-full max-w-sm touch-none items-center justify-center overflow-hidden rounded-3xl border-4 border-amber-700 bg-amber-100 text-5xl font-extrabold text-amber-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring dark:bg-amber-950 dark:text-amber-50">
          <span className="absolute inset-y-0 left-0 bg-amber-300/80 transition-[width] dark:bg-amber-700/70" style={{ width: `${progress}%` }} aria-hidden="true" />
          <span className="relative">{t("SOS")}</span>
        </button>
        <p id="sos-hold-help" className="text-xl">{t("Press and hold for 3 seconds")}</p>
      </>}
      {confirm && <div role="group" aria-label={t("Alert your caregiver?")} className="space-y-4 rounded-2xl border-2 border-border p-5">
        <h3 className="text-2xl font-bold">{t("Alert your caregiver?")}</h3>
        <ReadAloud text={t("Alert your caregiver?")} />
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => { setConfirm(false); setProgress(0); }} className="min-h-14 min-w-32 rounded-xl border-2 px-6 text-lg font-semibold">{t("Cancel")}</button>
          <button type="button" onClick={confirmSend} disabled={sending} className="min-h-14 min-w-32 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground disabled:opacity-60">{t(sending ? "Sending alert…" : "Send")}</button>
        </div>
        {sending && <p role="status" className="text-lg">{t("Getting your location…")}</p>}
      </div>}
      {sent && <div role="status" className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 text-2xl font-bold">{t("Your caregiver has been alerted")}<ReadAloud text={t("Your caregiver has been alerted")} forceAutoRead /></div>}
      {error && <p role="alert" className="text-lg">{error}</p>}
    </section> : <section className="rounded-2xl border border-border bg-card p-6 text-xl">
      <p>{t(selfCare ? "SOS is not available for self-care accounts yet." : "SOS is available from a paired patient device or patient login.")}</p>
    </section>}

    <section aria-labelledby="coming-soon-title" className="space-y-3">
      <h2 id="coming-soon-title" className="text-2xl font-bold">{t("Coming soon")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{soon.map(label => <button key={label} type="button" disabled aria-disabled="true" className="min-h-16 cursor-not-allowed rounded-2xl border-2 border-border bg-muted px-5 text-lg font-semibold text-muted-foreground">{t(label)} <span className="block text-base">{t("Coming soon")}</span></button>)}</div>
    </section>
    {session?.role === "caregiver" && <Link href="/caregiver/alerts" className="inline-flex min-h-14 items-center rounded-xl border-2 px-5 text-lg font-semibold">{t("Open alerts")}</Link>}
  </main></>;
}
