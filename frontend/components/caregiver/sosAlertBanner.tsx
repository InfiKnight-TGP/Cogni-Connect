"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { usePreferences, useSpeech, useTranslate } from "@/components/interaction/InteractionProvider";
import { shouldSpeak } from "@/lib/interaction/speech";
import { apiJSON } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  claimAlertForSpeech,
  filterAlertsToAnnounce,
  getSpokenAlertIds,
  groupAlertsForAnnouncement,
  markAlertsSpoken,
  MAX_ALERT_AGE_MS,
  type Announcement,
  type SosAlert,
  VOICE_ENABLED_PREFIX,
} from "@/lib/sos-voice";

const enabledKey = "cogni-sos-notifications";

function notifyNew(alerts: SosAlert[], t: (phrase: string) => string, caregiverId: string) {
  if (localStorage.getItem(enabledKey) !== "true" || !("Notification" in window) || Notification.permission !== "granted") return;
  const seenKey = `cogni-sos-notification-seen-${caregiverId}`;
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(seenKey) ?? "[]") as string[]; } catch { seen = []; }
  const ids = new Set(seen);
  for (const alert of alerts) {
    if (ids.has(alert.id)) continue;
    ids.add(alert.id);
    if (alert.test) continue;
    const notification = new Notification(t("SOS alert"), { body: `${alert.patientName} · ${t("Open alert")}` });
    notification.onclick = () => window.location.assign("/caregiver/alerts");
  }
  localStorage.setItem(seenKey, JSON.stringify(Array.from(ids).slice(-200)));
}

export default function SosAlertBanner() {
  const { t } = useTranslate();
  const { speechLanguage } = useSpeech();
  const { preferences } = usePreferences();
  const { session } = useAuth();
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const caregiverId = session?.user?.id ?? "default";

  const tabIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  );
  const isFirstPollRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const pendingAnnouncementRef = useRef<Announcement | null>(null);

  const speakAnnouncement = useCallback((announcement: Announcement) => {
    if (!shouldSpeak({ role: "caregiver", readAloudSetting: preferences.readAloud, forced: false })) {
      pendingAnnouncementRef.current = null;
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const now = Date.now();
    if (now - announcement.createdAtMs > MAX_ALERT_AGE_MS) {
      pendingAnnouncementRef.current = null;
      return;
    }

    const synth = window.speechSynthesis;
    if (synth.speaking || isSpeakingRef.current) {
      // Queue at most one pending sentence
      pendingAnnouncementRef.current = announcement;
      return;
    }

    try {
      const voice = synth.getVoices().find(
        item => item.lang.toLowerCase().split("-")[0] === speechLanguage.toLowerCase().split("-")[0]
      );
      const utterance = new SpeechSynthesisUtterance(announcement.text);
      utterance.lang = speechLanguage;
      if (voice) utterance.voice = voice;
      utterance.rate = 1; // Caregiver normal rate

      let started = false;
      const startTimer = window.setTimeout(() => {
        if (!started && synth.speaking === false) {
          // Speech might be blocked awaiting user gesture
          setNeedsInteraction(true);
          pendingAnnouncementRef.current = announcement;
        }
      }, 500);

      utterance.onstart = () => {
        started = true;
        window.clearTimeout(startTimer);
        setNeedsInteraction(false);
        isSpeakingRef.current = true;
        // Mark as spoken ONLY when utterance start event fires
        markAlertsSpoken(localStorage, caregiverId, announcement.alertIds);
        try {
          if (typeof BroadcastChannel !== "undefined") {
            const ch = new BroadcastChannel("cogni-sos-voice");
            ch.postMessage({ type: "spoken", ids: announcement.alertIds });
            ch.close();
          }
        } catch { /* Ignore BroadcastChannel failures */ }
      };

      const finish = () => {
        window.clearTimeout(startTimer);
        isSpeakingRef.current = false;
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;

        // Process next queued announcement if fresh
        const next = pendingAnnouncementRef.current;
        if (next) {
          pendingAnnouncementRef.current = null;
          if (Date.now() - next.createdAtMs <= MAX_ALERT_AGE_MS) {
            speakAnnouncement(next);
          }
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      synth.speak(utterance);
    } catch {
      isSpeakingRef.current = false;
    }
  }, [caregiverId, speechLanguage, preferences.readAloud]);

  // Unlock audio on first user interaction if blocked
  useEffect(() => {
    if (!needsInteraction) return;
    const unlock = () => {
      setNeedsInteraction(false);
      const pending = pendingAnnouncementRef.current;
      if (pending && Date.now() - pending.createdAtMs <= MAX_ALERT_AGE_MS) {
        pendingAnnouncementRef.current = null;
        speakAnnouncement(pending);
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [needsInteraction, speakAnnouncement]);

  // Cross-tab broadcast receiver
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    try {
      const channel = new BroadcastChannel("cogni-sos-voice");
      channel.onmessage = (event) => {
        if (event.data?.type === "spoken" && Array.isArray(event.data.ids)) {
          if (pendingAnnouncementRef.current) {
            const pendingIds = new Set(pendingAnnouncementRef.current.alertIds);
            if (event.data.ids.some((id: string) => pendingIds.has(id))) {
              pendingAnnouncementRef.current = null;
            }
          }
        }
      };
      return () => { channel.close(); };
    } catch { /* Ignore channel creation errors */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await apiJSON<SosAlert[]>("/sos/alerts?status=open", { authRedirect: false });
      const rows = Array.isArray(result) ? result : [];
      setAlerts(rows);
      notifyNew(rows, t, caregiverId);

      // Check caregiver voice preference (default on) AND accessibility readAloud (default off)
      const voiceEnabled = localStorage.getItem(`${VOICE_ENABLED_PREFIX}${caregiverId}`) !== "false";
      const allowedToSpeak = voiceEnabled && shouldSpeak({
        role: "caregiver",
        readAloudSetting: preferences.readAloud,
        forced: false,
      });
      if (allowedToSpeak && rows.length > 0) {
        const spokenIds = getSpokenAlertIds(localStorage, caregiverId);
        const toAnnounce = filterAlertsToAnnounce(rows, spokenIds, {
          isFirstPoll: isFirstPollRef.current,
          nowMs: Date.now(),
        });

        if (toAnnounce.length > 0) {
          const announcements = groupAlertsForAnnouncement(toAnnounce, t);
          for (const announcement of announcements) {
            // Claim each announcement atomically across tabs
            const wonClaim = await claimAlertForSpeech(
              localStorage,
              announcement.alertIds[0],
              tabIdRef.current,
              50
            );
            if (wonClaim) {
              speakAnnouncement(announcement);
            }
          }
        }
      }
      isFirstPollRef.current = false;
    } catch {
      /* The banner recovers on its next poll. */
      isFirstPollRef.current = false;
    }
  }, [caregiverId, preferences.readAloud, speakAnnouncement, t]);

  useEffect(() => {
    if (session?.role !== "caregiver") return;
    void load();
    let timer: number;
    const schedule = () => {
      window.clearInterval(timer);
      const interval = document.visibilityState === "visible" ? 10_000 : 60_000;
      timer = window.setInterval(() => { void load(); }, interval);
    };
    schedule();
    const visible = () => {
      schedule();
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [session?.role, load]);

  if (session?.role !== "caregiver" || alerts.length === 0) return null;
  const newest = alerts[0];
  return (
    <div role="status" className="relative z-50 border-b-2 border-amber-600 bg-amber-100 px-4 py-3 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-lg font-semibold">
        <p className="flex items-center gap-2">
          <BellRing className="h-6 w-6 shrink-0" />
          {newest.test && <span className="rounded-md border px-2 py-1 text-base">{t("TEST")}</span>}
          <span>{newest.patientName} · {t("Open alert")}</span>
        </p>
        <Link className="inline-flex min-h-12 items-center rounded-xl border-2 border-current px-4 underline underline-offset-4" href="/caregiver/alerts">
          {t("Open alert")}
        </Link>
      </div>
      {needsInteraction && (
        <div className="mx-auto mt-2 max-w-6xl text-sm font-medium text-amber-900 dark:text-amber-200">
          {t("Click anywhere on this page once to allow voice alerts.")}
        </div>
      )}
    </div>
  );
}
