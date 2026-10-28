"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAuth } from "@/lib/auth-context";
import { apiJSON, jsonBody } from "@/lib/api";
import {
  canUseSos,
  holdProgress,
  remainingSeconds,
  shouldSend,
  sosHoldReady,
  SOS_COUNTDOWN_MS,
  SOS_HOLD_MS,
} from "@/lib/sos";

const soon = ["Call 112", "Call my contacts", "SOS for self-care accounts", "Text message alerts"] as const;
const LOCATION_STORAGE_KEY = "cogni_sos_include_location";

interface LatLngAccuracy {
  lat: number;
  lng: number;
  accuracy: number;
}

export default function SosPage() {
  const { t } = useTranslate();
  const { session } = useAuth();
  const allowed = canUseSos(session?.role);
  const selfCare = session?.role === "self";

  const holdStarted = useRef<number | null>(null);
  const holdInterval = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);

  const [includeLocation, setIncludeLocation] = useState(true);
  const [inCountdown, setInCountdown] = useState(false);
  const [countdownNum, setCountdownNum] = useState(5);
  const [status, setStatus] = useState<"idle" | "countdown" | "sending" | "sent" | "failed">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const countdownStart = useRef<number | null>(null);
  const countdownInterval = useRef<number | null>(null);
  const countdownTimeout = useRef<number | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const positionRef = useRef<LatLngAccuracy | null>(null);
  const locationResolved = useRef(false);
  const alertIdRef = useRef<string | null>(null);
  const retryInterval = useRef<number | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const requestKeyRef = useRef<string>("");
  const cancelledRef = useRef(false);

  // Load remembered includeLocation preference per device
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (stored !== null) {
        setIncludeLocation(stored === "true");
      }
    } catch {
      // localStorage may fail in restricted contexts
    }
  }, []);

  function handleLocationToggle(checked: boolean) {
    setIncludeLocation(checked);
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, String(checked));
    } catch {
      // ignore storage failure
    }
  }

  function stopHold() {
    holdStarted.current = null;
    if (holdInterval.current !== null) window.clearInterval(holdInterval.current);
    holdInterval.current = null;
    if (status === "idle") setProgress(0);
  }

  function beginHold() {
    if (!allowed || status !== "idle" || holdStarted.current !== null) return;
    holdStarted.current = Date.now();
    holdInterval.current = window.setInterval(() => {
      const elapsed = Date.now() - (holdStarted.current ?? Date.now());
      setProgress(holdProgress(elapsed, SOS_HOLD_MS));
      if (sosHoldReady(elapsed)) {
        if (holdInterval.current !== null) window.clearInterval(holdInterval.current);
        holdInterval.current = null;
        holdStarted.current = null;
        setProgress(100);
        startCountdown();
      }
    }, 40);
  }

  function startCountdown() {
    cancelledRef.current = false;
    setStatus("countdown");
    setInCountdown(true);
    setCountdownNum(5);
    countdownStart.current = performance.now();
    requestKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    positionRef.current = null;
    locationResolved.current = false;
    alertIdRef.current = null;

    // Request position at the START of the countdown with 4s timeout if enabled
    if (includeLocation && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (cancelledRef.current) return;
          const loc: LatLngAccuracy = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          positionRef.current = loc;
          locationResolved.current = true;
          // If alert is already sent and waiting for late location
          if (alertIdRef.current) {
            void patchLocation(alertIdRef.current, loc);
          }
        },
        () => {
          locationResolved.current = true;
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 4000 }
      );
    } else {
      locationResolved.current = true;
    }

    // Interval to update visible countdown
    countdownInterval.current = window.setInterval(() => {
      if (cancelledRef.current || countdownStart.current === null) return;
      const rem = remainingSeconds(countdownStart.current, performance.now(), SOS_COUNTDOWN_MS);
      setCountdownNum(rem > 0 ? rem : 1);
    }, 100);

    // Timeout ensures send triggers exactly after 5s even if tab is throttled / hidden
    countdownTimeout.current = window.setTimeout(() => {
      if (cancelledRef.current) return;
      triggerSend();
    }, SOS_COUNTDOWN_MS);
  }

  function cancel() {
    cancelledRef.current = true;
    if (countdownInterval.current !== null) window.clearInterval(countdownInterval.current);
    countdownInterval.current = null;
    if (countdownTimeout.current !== null) window.clearTimeout(countdownTimeout.current);
    countdownTimeout.current = null;
    if (retryInterval.current !== null) window.clearInterval(retryInterval.current);
    retryInterval.current = null;
    if (retryTimeout.current !== null) window.clearTimeout(retryTimeout.current);
    retryTimeout.current = null;
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
    positionRef.current = null;
    locationResolved.current = true;
    alertIdRef.current = null;
    setInCountdown(false);
    setStatus("idle");
    setProgress(0);
    setStatusMessage("");
  }

  async function patchLocation(alertId: string, loc: LatLngAccuracy) {
    if (cancelledRef.current) return;
    try {
      await apiJSON(`/sos/alerts/${alertId}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: loc }),
      });
    } catch {
      // Ignore late patch errors
    }
  }

  function triggerSend() {
    if (cancelledRef.current) return;
    if (countdownInterval.current !== null) window.clearInterval(countdownInterval.current);
    countdownInterval.current = null;
    setInCountdown(false);
    setStatus("sending");
    setStatusMessage(t("Sending..."));

    const sendStartTime = Date.now();
    let sentSuccessfully = false;

    async function attemptPost(): Promise<boolean> {
      if (cancelledRef.current || sentSuccessfully) return true;
      try {
        abortController.current = new AbortController();
        const payload: Record<string, unknown> = {
          requestKey: requestKeyRef.current,
        };
        if (positionRef.current) {
          payload.location = positionRef.current;
        }
        const res = await apiJSON<{ id: string }>("/sos", {
          ...jsonBody(payload),
          signal: abortController.current.signal,
        });

        if (cancelledRef.current) return true;
        sentSuccessfully = true;
        if (retryInterval.current !== null) window.clearInterval(retryInterval.current);
        retryInterval.current = null;
        if (retryTimeout.current !== null) window.clearTimeout(retryTimeout.current);
        retryTimeout.current = null;

        alertIdRef.current = res.id;
        setStatus("sent");

        // If location arrived while alert was sending without location, send patch
        if (!payload.location && positionRef.current) {
          void patchLocation(res.id, positionRef.current);
        }
        return true;
      } catch {
        if (cancelledRef.current) return true;
        setStatus("sending");
        setStatusMessage(t("Sending..."));
        return false;
      }
    }

    void attemptPost().then(ok => {
      if (ok || cancelledRef.current) return;

      // Retry every 5s for up to 2 minutes
      retryInterval.current = window.setInterval(() => {
        if (cancelledRef.current || sentSuccessfully) return;
        void attemptPost();
      }, 5000);

      retryTimeout.current = window.setTimeout(() => {
        if (cancelledRef.current || sentSuccessfully) return;
        if (retryInterval.current !== null) window.clearInterval(retryInterval.current);
        retryInterval.current = null;
        setStatus("failed");
        setStatusMessage(t("Could not send. Try again."));
      }, 120000 - (Date.now() - sendStartTime));
    });
  }

  function resetToSos() {
    cancel();
  }

  // Full screen countdown view
  if (inCountdown) {
    return (
      <main
        className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background p-6 text-foreground"
        aria-live="off"
      >
        <div className="flex-1" />
        <div className="flex flex-col items-center justify-center space-y-6 text-center">
          <p className="text-4xl font-extrabold sm:text-5xl" aria-live="off">
            {t("Sending alert in {n}", { n: countdownNum })}
          </p>
        </div>
        <div className="flex-1 flex w-full max-w-lg items-end pb-8">
          <button
            type="button"
            onClick={cancel}
            style={{ minHeight: "80px" }}
            className="w-full rounded-2xl bg-destructive px-8 text-2xl font-black text-destructive-foreground shadow-lg hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
          >
            {t("Cancel")}
          </button>
        </div>
      </main>
    );
  }

  // Result screen: check icon and text "Alert sent." only, and "Back" button.
  if (status === "sent") {
    return (
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 text-foreground animate-in fade-in duration-300">
        <div className="flex flex-col items-center space-y-6 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <svg
              className="h-14 w-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-3xl font-extrabold">{t("Alert sent.")}</p>
          <button
            type="button"
            onClick={resetToSos}
            className="min-h-14 min-w-36 rounded-xl border-2 px-6 text-xl font-bold hover:bg-muted"
          >
            {t("Back")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl space-y-7 px-4 pb-24 pt-24 lg:pt-8">
        <header className="space-y-3">
          <h1 className="text-4xl font-extrabold">{t("Help")}</h1>
          <p className="rounded-2xl border border-amber-500/60 bg-amber-50 p-5 text-xl font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            {t("SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself.")}
          </p>
          <ReadAloud
            text={t("SOS alerts your caregiver. It does not call emergency services. In an emergency, call 112 yourself.")}
            autoRead={false}
          />
        </header>

        {allowed ? (
          <section className="space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
            <h2 className="text-3xl font-bold">{t("SOS")}</h2>

            {status === "sending" && (
              <div role="status" className="space-y-4 py-8">
                <p className="text-2xl font-bold">{statusMessage}</p>
              </div>
            )}

            {status === "failed" && (
              <div role="alert" className="space-y-5 py-6">
                <p className="text-2xl font-bold text-destructive">{statusMessage}</p>
                <button
                  type="button"
                  onClick={resetToSos}
                  className="min-h-14 min-w-36 rounded-xl bg-primary px-6 text-xl font-bold text-primary-foreground"
                >
                  {t("Try again")}
                </button>
              </div>
            )}

            {status === "idle" && (
              <>
                <label className="mx-auto flex max-w-sm cursor-pointer items-center justify-center gap-3 text-lg font-semibold">
                  <input
                    type="checkbox"
                    checked={includeLocation}
                    onChange={e => handleLocationToggle(e.target.checked)}
                    className="h-6 w-6 rounded border-border"
                  />
                  <span>{t("Include my location")}</span>
                </label>

                <button
                  type="button"
                  onPointerDown={beginHold}
                  onPointerUp={stopHold}
                  onPointerCancel={stopHold}
                  onPointerLeave={stopHold}
                  onKeyDown={event => {
                    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                      event.preventDefault();
                      beginHold();
                    }
                  }}
                  onKeyUp={event => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      stopHold();
                    }
                  }}
                  onBlur={stopHold}
                  aria-label={t("Press and hold for 3 seconds")}
                  aria-describedby="sos-hold-help"
                  className="relative mx-auto flex min-h-40 w-full max-w-sm touch-none items-center justify-center overflow-hidden rounded-3xl border-4 border-amber-700 bg-amber-100 text-5xl font-extrabold text-amber-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring dark:bg-amber-950 dark:text-amber-50"
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-amber-300/80 transition-[width] dark:bg-amber-700/70"
                    style={{ width: `${progress}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative">{t("SOS")}</span>
                </button>
                <p id="sos-hold-help" className="text-xl">
                  {t("Press and hold for 3 seconds")}
                </p>
              </>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 text-xl">
            <p>
              {t(
                selfCare
                  ? "SOS is not available for self-care accounts yet."
                  : "SOS is available from a paired patient device or patient login."
              )}
            </p>
          </section>
        )}

        <section aria-labelledby="coming-soon-title" className="space-y-3">
          <h2 id="coming-soon-title" className="text-2xl font-bold">
            {t("Coming soon")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {soon.map(label => (
              <button
                key={label}
                type="button"
                disabled
                aria-disabled="true"
                className="min-h-16 cursor-not-allowed rounded-2xl border-2 border-border bg-muted px-5 text-lg font-semibold text-muted-foreground"
              >
                {t(label)} <span className="block text-base">{t("Coming soon")}</span>
              </button>
            ))}
          </div>
        </section>
        {session?.role === "caregiver" && (
          <Link
            href="/caregiver/alerts"
            className="inline-flex min-h-14 items-center rounded-xl border-2 px-5 text-lg font-semibold"
          >
            {t("Open alerts")}
          </Link>
        )}
      </main>
    </>
  );
}

