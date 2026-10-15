"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { BrowserSpeechProvider } from "@/lib/interaction/speech";
import { platformRequest, putSupport, readSupport, syncSupport, clearPendingLocationRecords, saveMedia, loadMedia, type Account } from "@/lib/interaction/support-store";
import type { SupportRecord } from "@/lib/interaction/sync";
import { summarize, clusterVisits, type Visit } from "@/lib/interaction/content";
import {
  haversineMetres, groupSamplesIntoVisits, clusterVisitsIntoPlaces,
  suggestFavourites, formatDistance, mapsUrl, isValidCoordinate,
  type LocationSample, type Visit as LocationVisit, type PlaceCluster, type SavedPlace,
} from "@/lib/interaction/location";
import { dayKey } from "@/lib/progress";
import { declineAlert, type SessionEvent } from "@/lib/interaction/adaptive";
import { cognitiveTrendIndex, routineDeviation, sessionScores } from "@/lib/interaction/trends";
import PersonalCrossword from "./PersonalCrossword";

const button = "min-h-14 rounded-xl border-2 border-primary px-5 py-3 text-xl font-semibold";
const inputClass = "min-h-14 w-full rounded-xl border-2 bg-background p-3 text-xl";
const text = (value: unknown) => typeof value === "string" ? value : "";

export default function SupportWorkspace() {
  const [account, setAccount] = useState<Account | null>(null);
  const [rows, setRows] = useState<SupportRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [setup, setSetup] = useState(false);
  const [section, setSection] = useState("Journal");
  const [pending, setPending] = useState(0);
  const refresh = (patient: string) => { const state = readSupport(patient); setRows(state.records); setPending(Object.keys(state.pending).length); };
  useEffect(() => {
    if (!navigator.onLine) {
      try { const cached = JSON.parse(localStorage.getItem("cogni:offline-account") || "null"); if (cached?.role === "patient") { setAccount(cached); setNotice("Offline. Your saved activities are available on this device."); } } catch {}
      return;
    }
    platformRequest("/auth/me").then((value: Account) => { setAccount(value); localStorage.setItem("cogni:patient", value.patient); localStorage.setItem("cogni:role", value.role); window.dispatchEvent(new Event("cogni:patient-change")); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!account) return;
    const changed = () => { try { refresh(account.patient); } catch { setNotice("Storage is unavailable. Please ask your caregiver for help."); } };
    const sync = () => { void syncSupport(account.patient).then(changed).catch(error => setNotice(`Saved on this device. Sync: ${error.message}`)); };
    changed(); sync(); const timer = setInterval(sync, 20000);
    window.addEventListener("cogni:support", changed); window.addEventListener("online", sync);
    return () => { clearInterval(timer); window.removeEventListener("cogni:support", changed); window.removeEventListener("online", sync); };
  }, [account]);
  const save = (kind: string, data: Record<string, unknown>, id?: string) => {
    if (!account) return false;
    try { putSupport(account.patient, kind, data, id); refresh(account.patient); setNotice("Saved on this device. It will sync when connected."); return true; }
    catch { setNotice("Could not save. Device storage may be full. Please keep this screen open and ask for help."); return false; }
  };
  const authenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (setup) { await platformRequest("/auth/setup", data); setSetup(false); setNotice("Accounts created. Sign in with either account."); return; }
      const value: Account = await platformRequest("/auth/login", data);
      setAccount(value); localStorage.setItem("cogni:patient", value.patient); localStorage.setItem("cogni:role", value.role);
      if (value.role === "patient") localStorage.setItem("cogni:offline-account", JSON.stringify(value));
      else localStorage.removeItem("cogni:offline-account");
      window.dispatchEvent(new Event("cogni:patient-change")); setNotice("");
    } catch (error) { setNotice((error as Error).message); }
  };
  const sections = ["Journal", "Reminders", "Family", "Places", "Crossword", ...(account?.role === "caregiver" ? ["Dashboard"] : [])];
  return <><Nav /><main className="mx-auto max-w-5xl space-y-6 px-5 pb-48 pt-24 lg:ml-[280px] lg:pt-10">
    <h1 className="text-3xl font-bold">My support space</h1>
    <p role="status" className="text-xl">{notice}</p>
    {!account ? <section className="max-w-xl space-y-4 rounded-2xl border-2 p-6">
      <h2 className="text-2xl font-bold">{setup ? "Caregiver: set up two accounts" : "Sign in"}</h2>
      <p>These accounts protect this support space. A caregiver can help you sign in.</p>
      <form onSubmit={authenticate} className="space-y-4">
        <label className="block">{setup ? "Caregiver username" : "Username"}<input name="username" required minLength={3} maxLength={60} autoComplete="username" className={inputClass} /></label>
        <label className="block">Password<input name="password" type="password" required minLength={12} maxLength={200} autoComplete={setup ? "new-password" : "current-password"} className={inputClass} /></label>
        {setup && <><label className="block">Patient username<input name="patient_username" required minLength={3} maxLength={60} className={inputClass} /></label><label className="block">Patient password<input name="patient_password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className={inputClass} /></label><p>Use separate passwords, each at least 12 characters.</p></>}
        <button className={button}>{setup ? "Create accounts" : "Sign in"}</button>
      </form>
      <button className={button} onClick={() => setSetup(!setup)}>{setup ? "Back to sign in" : "Set up with a caregiver"}</button>
    </section> : <>
      <div className="flex flex-wrap gap-3"><span>{account.username} · {pending ? `${pending} waiting to sync` : "All changes synced"}</span><button className={button} onClick={() => void syncSupport(account.patient).then(() => setNotice("Sync complete")).catch(error => setNotice(error.message))}>Sync now</button><button className={button} onClick={() => void platformRequest("/auth/logout", {}).then(() => { setAccount(null); localStorage.removeItem("cogni:offline-account"); localStorage.removeItem("cogni:role"); localStorage.removeItem("cogni:patient"); window.dispatchEvent(new Event("cogni:patient-change")); }).catch(error => setNotice(error.message))}>Sign out</button></div>
      <nav className="flex flex-wrap gap-3" aria-label="Support activities">{sections.map(name => <button key={name} className={button} aria-current={section === name ? "page" : undefined} onClick={() => setSection(name)}>{name}</button>)}</nav>
      <VoiceQuestion auto={false} prompt="Choose an activity" options={sections.map(label => ({ id: label, label }))} onAnswer={setSection} />
      {section === "Journal" && <Journal rows={rows} save={save} patient={account.patient} notify={setNotice} />}
      {section === "Reminders" && <Reminders rows={rows} save={save} caregiver={account.role === "caregiver"} />}
      {section === "Family" && <Family rows={rows} save={save} caregiver={account.role === "caregiver"} />}
      {section === "Places" && <Places rows={rows} save={save} caregiver={account.role === "caregiver"} notify={setNotice} patient={account.patient} />}
      {section === "Crossword" && <PersonalCrossword />}
      {section === "Dashboard" && account.role === "caregiver" && <Dashboard rows={rows} save={save} />}
      <Link className={button + " inline-block"} href="/play">Play a game</Link>
    </>}
  </main></>;
}

type Save = (kind: string, data: Record<string, unknown>, id?: string) => boolean;
function MediaPlayback({ id, video }: { id: string; video: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true, objectUrl = ""; void loadMedia(id).then(blob => { if (blob && active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [id]);
  const source = url || `/platform-api/media/${encodeURIComponent(id)}`;
  return video ? <video controls src={source} className="max-h-72 w-full" /> : <audio controls src={source} className="w-full" />;
}
function Journal({ rows, save, patient, notify }: { rows: SupportRecord[]; save: Save; patient: string; notify: (message: string) => void }) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [media, setMedia] = useState<{ id: string; video: boolean } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const speech = useRef(new BrowserSpeechProvider());
  const { locale } = useInteraction();
  useEffect(() => () => { recorder.current?.state === "recording" && recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); speech.current.cancel(); }, []);
  const record = async (video: boolean) => {
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") throw new Error("Recording is unavailable. You can type your memory instead.");
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      const capture = new MediaRecorder(stream.current); recorder.current = capture;
      const chunks: BlobPart[] = [], id = `${patient}:${crypto.randomUUID()}`;
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = () => {
        stream.current?.getTracks().forEach(track => track.stop()); setRecording(false);
        void saveMedia(id, new Blob(chunks, { type: capture.mimeType })).then(() => { setMedia({ id, video }); notify("Recording saved on this device. Review the transcript before saving your entry."); }).catch(() => notify("Recording could not be saved. Device storage may be full."));
      };
      capture.start(); setRecording(true);
      void speech.current.listen(locale.speechLanguage).then(result => setDraft(value => `${value} ${result.text}`.trim())).catch(() => notify("Live transcription is unavailable or stopped. You can type or edit the transcript; the recording continues."));
    } catch (error) { stream.current?.getTracks().forEach(track => track.stop()); notify((error as Error).message); }
  };
  // Location-assisted journal prompts: show saved places visited today
  const today = dayKey(new Date());
  const todayLocationIds = rows.filter(row => row.kind === "location" && row.data.day === today).map(row => row.id);
  const todayVisitedSavedPlaces = (() => {
    const savedPlaces = rows.filter(r => r.kind === "place");
    const todaySamples = rows
      .filter(r => r.kind === "location" && r.data.day === today)
      .map(r => r.data as unknown as LocationSample);
    return savedPlaces.filter(sp => {
      const d = sp.data as { latitude?: number; longitude?: number };
      if (!d.latitude || !d.longitude) return false;
      return todaySamples.some(s => haversineMetres({ latitude: d.latitude!, longitude: d.longitude! }, s) < 300);
    });
  })();

  return <section className="space-y-4 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Tell me about your day</h2>
    {todayVisitedSavedPlaces.length > 0 && (
      <div className="rounded-xl border-2 p-4 space-y-2 bg-muted/40">
        <p className="text-lg font-semibold">📍 Places you visited today:</p>
        {todayVisitedSavedPlaces.map(sp => (
          <div key={sp.id} className="flex flex-wrap items-center gap-3">
            <span className="text-lg">{text(sp.data.name)}</span>
            <button className={button + " text-base py-1 px-3 min-h-0"} onClick={() => {
              const prompt = `I visited ${text(sp.data.name)} today.`;
              setDraft(v => v ? `${v} ${prompt}` : prompt);
            }}>Add to journal</button>
          </div>
        ))}
        <p className="text-base text-muted-foreground">You can add a note about your visit, edit it, or skip this.</p>
      </div>
    )}
    <label className="block">Your memory or transcript<textarea className={inputClass} rows={5} value={draft} maxLength={12000} onChange={e => setDraft(e.target.value)} /></label>
    <div className="flex flex-wrap gap-3">{recording ? <button className={button} onClick={() => { recorder.current?.stop(); speech.current.cancel(); }}>Stop recording</button> : <><button className={button} onClick={() => void record(false)}>Record audio</button><button className={button} onClick={() => void record(true)}>Record video</button></>}</div>
    {recording && <p role="status">Recording… Stop when you are ready.</p>}
    {media && <MediaPlayback id={media.id} video={media.video} />}
    <button className={button} disabled={recording || (!draft.trim() && !media)} onClick={() => { if (save("journal", { text: draft, summary: summarize(draft), day: today, media, locationIds: todayLocationIds })) { setDraft(""); setMedia(null); } }}>Save memory</button>
    <h3 className="text-xl font-bold">How are you feeling?</h3>
    <div className="flex flex-wrap gap-3">{["🙂 Happy", "😐 Okay", "😔 Sad"].map(mood => <button key={mood} className={button} onClick={() => save("mood", { mood, day: dayKey(new Date()) })}>{mood}</button>)}</div>
    <VoiceQuestion prompt="How are you feeling?" auto={false} options={[{ id: "Happy", label: "Happy" }, { id: "Okay", label: "Okay" }, { id: "Sad", label: "Sad" }]} onAnswer={mood => save("mood", { mood, day: dayKey(new Date()) })} />
    {rows.filter(row => row.kind === "journal").slice(-10).reverse().map(row => <article key={row.id} className="space-y-3 rounded-xl border p-4"><p className="text-xl">{text(row.data.text)}</p><p>{text(row.data.summary)}</p>{row.data.media && typeof row.data.media === "object" ? <MediaPlayback id={text((row.data.media as { id: string }).id)} video={Boolean((row.data.media as { video: boolean }).video)} /> : null}</article>)}
  </section>;
}

// ── Reminder notification scheduling ─────────────────────────────────────────
// Limitation: browser Notification API only works while the tab is open.
// Background/push delivery requires a server-side scheduler and push credentials
// (not configured in this prototype). The feasible behaviour is implemented here:
// a timer fires when the tab is open and the reminder time arrives.

function useReminderNotifications(reminders: SupportRecord[], doneIds: Set<string>) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const row of reminders) {
      const timeStr = text(row.data.time); // "HH:MM"
      if (!timeStr || doneIds.has(row.id)) continue;
      const [h, m] = timeStr.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) continue;
      const now = new Date();
      const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      const msUntil = due.getTime() - now.getTime();
      if (msUntil > 0 && msUntil < 24 * 60 * 60 * 1000) {
        const id = setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification("Reminder", {
              body: text(row.data.label),
              tag: row.id,
              requireInteraction: true,
            });
          }
        }, msUntil);
        timers.push(id);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [reminders, doneIds]);
}

function Reminders({ rows, save, caregiver }: { rows: SupportRecord[]; save: Save; caregiver: boolean }) {
  const today = dayKey(new Date());
  const complete = (row: SupportRecord, method: string) =>
    save("adherence", { reminderId: row.id, day: today, method }, `done:${row.id}:${today}`);
  const reminders = rows.filter(row => row.kind === "reminder");
  const doneIds = new Set(rows.filter(r => r.kind === "adherence" && r.data.day === today).map(r => text(r.data.reminderId)));
  useReminderNotifications(reminders, doneIds);

  return (
    <section className="space-y-4 rounded-2xl border-2 p-6">
      <h2 className="text-2xl font-bold">Things to do</h2>
      <p className="text-base text-muted-foreground">
        Reminders appear here while this page is open. Browser notifications fire
        at the due time if you have granted notification permission.{" "}
        <strong>Background delivery requires a push server not yet configured.</strong>
      </p>
      {caregiver && (
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = Object.fromEntries(new FormData(form));
          save("reminder", { ...data, createdAt: Date.now() });
          form.reset();
        }}>
          <label className="block">Reminder<input name="label" required maxLength={160} className={inputClass} /></label>
          <label className="block">Kind
            <select name="type" className={inputClass}>
              <option>Medicine</option><option>Hydration</option><option>Activity</option><option>Appointment</option>
            </select>
          </label>
          <label className="block">Time<input name="time" type="time" required className={inputClass} /></label>
          <button className={button}>Add reminder</button>
        </form>
      )}
      {reminders.map(row => {
        const done = doneIds.has(row.id);
        const overdue = (() => {
          const t = text(row.data.time);
          if (!t) return false;
          const [h, m] = t.split(":").map(Number);
          const due = new Date(); due.setHours(h, m, 0, 0);
          return !done && due < new Date();
        })();
        return (
          <article className={`rounded-xl border-2 p-4 ${overdue ? "border-amber-500" : ""}`} key={row.id}>
            <h3 className="text-2xl">{text(row.data.label)}</h3>
            <p className="text-lg">{text(row.data.time)} {overdue && <span className="text-amber-600 font-bold">⚠ Overdue</span>}</p>
            <div className="flex flex-wrap gap-3 mt-3">
              <button className={button} disabled={done} onClick={() => complete(row, "tap")}>{done ? "Done ✓" : "Done"}</button>
              <VoiceQuestion auto={false} prompt={text(row.data.label)} disabled={done}
                options={[{ id: "done", label: "Done" }]} onAnswer={() => complete(row, "voice")} />
            </div>
          </article>
        );
      })}
      {reminders.length === 0 && <p className="text-lg">Your caregiver can add reminders here.</p>}
    </section>
  );
}

function Family({ rows, save, caregiver }: { rows: SupportRecord[]; save: Save; caregiver: boolean }) {
  return <section className="space-y-4 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Family messages</h2>
    {caregiver && <form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; save("message", { text: new FormData(form).get("message") }); form.reset(); }}><label>Your message<textarea name="message" required maxLength={2000} className={inputClass} /></label><button className={button}>Leave message</button></form>}
    {rows.filter(row => row.kind === "message").slice(-10).map(row => <article key={row.id} className="space-y-3 rounded-xl border-2 p-4"><p className="text-2xl">{text(row.data.text)}</p><VoiceQuestion auto={false} prompt={text(row.data.text)} options={[{ id: "Thank you", label: "Thank you" }, { id: "Please call me", label: "Please call me" }]} onAnswer={reply => save("reply", { messageId: row.id, text: reply, method: "voice" })} /><div className="flex flex-wrap gap-3">{["Thank you", "Please call me"].map(reply => <button key={reply} className={button} onClick={() => save("reply", { messageId: row.id, text: reply, method: "tap" })}>{reply}</button>)}</div>{rows.filter(r => r.kind === "reply" && r.data.messageId === row.id).map(reply => <p key={reply.id}>↳ {text(reply.data.text)}</p>)}</article>)}
  </section>;
}

// ── Places / Location feature ─────────────────────────────────────────────────
// Sections: Consent & Tracking controls → Travel Timeline → Favourite Places → Saved Locations → Navigate

type PlacesTab = "timeline" | "favourites" | "saved" | "navigate";

function Places({ rows, save, caregiver, notify, patient }: { rows: SupportRecord[]; save: Save; caregiver: boolean; notify: (message: string) => void; patient: string }) {
  const [tracking, setTracking]   = useState(false);
  const [tab, setTab]             = useState<PlacesTab>("timeline");
  const [currentPos, setCurrentPos] = useState<GeolocationCoordinates | null>(null);
  const [localSamples, setLocalSamples] = useState<LocationSample[]>(() => {
    try { return JSON.parse(localStorage.getItem(`cogni:local-locations:${patient}`) || "[]"); } catch { return []; }
  });
  const watch = useRef<number | null>(null);

  const consent = rows.find(row => row.id === "location-consent")?.data as
    | { tracking?: boolean; sync?: boolean } | undefined;

  const pauseTracking = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setTracking(false);
  };

  // Immediately stop tracking when consent is withdrawn
  useEffect(() => {
    if (!consent?.tracking) {
      pauseTracking();
      // Wipe pending location queue so revoked data is never uploaded
      clearPendingLocationRecords(patient);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent?.tracking, patient]);

  // Cleanup on unmount
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);

  const startTracking = () => {
    if (!consent?.tracking) { notify("A caregiver must grant consent first."); return; }
    if (!navigator.geolocation) { notify("Location is unavailable on this device."); return; }
    setTracking(true);
    let previous = 0;
    watch.current = navigator.geolocation.watchPosition(
      position => {
        if (Date.now() - previous < 60_000) return; // at most one sample per minute
        previous = Date.now();
        const sample: LocationSample = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
          day: dayKey(new Date()),
        };
        if (!isValidCoordinate(sample)) return; // reject inaccurate readings
        setCurrentPos(position.coords);
        if (consent.sync) {
          save("location", sample);
        } else {
          try {
            const lk = `cogni:local-locations:${patient}`;
            const local: LocationSample[] = JSON.parse(localStorage.getItem(lk) || "[]");
            const updated = [...local, sample];
            localStorage.setItem(lk, JSON.stringify(updated));
            setLocalSamples(updated);
          } catch { /* storage full */ }
          notify("Location saved on this device only (sync not enabled).");
        }
      },
      () => { pauseTracking(); notify("Location could not be read. You can keep using the app."); },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
  };

  // All location samples: synced + device-only
  const syncedSamples = rows
    .filter(row => row.kind === "location")
    .map(row => row.data as unknown as LocationSample);
  const allSamples = [...syncedSamples, ...localSamples];
  const visits = groupSamplesIntoVisits(allSamples);
  const clusters = clusterVisitsIntoPlaces(visits);
  const suggested = suggestFavourites(clusters, 3);
  const savedPlaces = rows
    .filter(row => row.kind === "place")
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const tabBtn = (id: PlacesTab, label: string) => (
    <button key={id} className={button + (tab === id ? " bg-primary text-primary-foreground" : "")} onClick={() => setTab(id)}>{label}</button>
  );

  return (
    <section className="space-y-5 rounded-2xl border-2 p-6">
      <h2 className="text-2xl font-bold">My places</h2>

      {/* ── Consent & tracking controls ── */}
      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="text-xl font-bold">Location sharing</h3>
        <p className="text-lg">
          Location is optional and only active while this screen is open.{" "}
          <strong>Background tracking is not supported by this app.</strong>
        </p>
        {caregiver && (
          <form className="space-y-3" onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const value = { tracking: data.get("tracking") === "on", sync: data.get("sync") === "on", confirmedAt: Date.now() };
            // Consent revocation: clear pending location data immediately
            if (!value.sync) clearPendingLocationRecords(patient);
            save("consent", value, "location-consent");
            save("consent", { ...value, action: "consent-change" });
          }}>
            <label className="block text-xl">
              <input type="checkbox" name="tracking" className="mr-3 h-6 w-6" defaultChecked={Boolean(consent?.tracking)} />
              I confirm (as caregiver) that the patient has agreed to location collection.
            </label>
            <label className="block text-xl">
              <input type="checkbox" name="sync" className="mr-3 h-6 w-6" defaultChecked={Boolean(consent?.sync)} />
              Also sync location data to the caregiver account.
            </label>
            <button className={button}>Save consent settings</button>
          </form>
        )}
        {consent?.tracking ? (
          <div className="flex flex-wrap gap-3 items-center">
            <button className={button} onClick={tracking ? pauseTracking : startTracking}>
              {tracking ? "⏸ Pause location" : "▶ Start location"}
            </button>
            <span role="status" className="text-lg font-semibold">
              {tracking ? "🟢 Location is on while this screen stays open." : "⚫ Location is paused."}
            </span>
          </div>
        ) : (
          <p className="text-lg">A caregiver must confirm consent before location is used.</p>
        )}
      </div>

      {/* ── Tab nav ── */}
      <nav className="flex flex-wrap gap-3" aria-label="Places sections">
        {tabBtn("timeline", "Travel Timeline")}
        {tabBtn("favourites", "Favourite Places")}
        {tabBtn("saved", "Saved Locations")}
        {tabBtn("navigate", "Navigate")}
      </nav>

      {/* ── Travel Timeline ── */}
      {tab === "timeline" && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">Travel timeline</h3>
          <p className="text-lg">Places visited while the app was open, in order.</p>
          {visits.length === 0 ? (
            <p className="text-lg">No visits recorded yet. Start location to begin.</p>
          ) : (
            // Group by day
            Object.entries(
              visits.reduce<Record<string, LocationVisit[]>>((acc, v) => {
                (acc[v.day] = acc[v.day] ?? []).push(v);
                return acc;
              }, {}),
            )
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([day, dayVisits]) => (
                <article key={day} className="rounded-xl border p-4 space-y-2">
                  <h4 className="text-xl font-bold">{day}</h4>
                  {dayVisits
                    .sort((a, b) => (a.arrivalTs ?? a.timestamp) - (b.arrivalTs ?? b.timestamp))
                    .map((v, i) => {
                      // Check if this location matches a saved place
                      const nearSaved = savedPlaces.find(sp => {
                        const d = sp.data as Partial<SavedPlace>;
                        if (!d.latitude || !d.longitude) return false;
                        return haversineMetres({ latitude: d.latitude!, longitude: d.longitude! }, v) < 200;
                      });
                      const arrive = v.arrivalTs ? new Date(v.arrivalTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
                      const depart = v.departureTs ? new Date(v.departureTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
                      return (
                        <div key={i} className="flex flex-wrap gap-3 items-center">
                          <span className="text-2xl">📍</span>
                          <span className="text-lg">
                            {nearSaved ? <strong>{text(nearSaved.data.name)}</strong> : `Visit ${i + 1}`}
                            {arrive && <> · {arrive}{depart && depart !== arrive ? `–${depart}` : ""}</>}
                            {" · "}{v.sampleCount} GPS {v.sampleCount === 1 ? "point" : "points"}
                          </span>
                        </div>
                      );
                    })}
                </article>
              ))
          )}
        </div>
      )}

      {/* ── Favourite Places ── */}
      {tab === "favourites" && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">Suggested favourite places</h3>
          <p className="text-lg">
            Places you have visited on 3 or more separate days are suggested as favourites.
            You can accept, rename or skip them.
          </p>
          {suggested.length === 0 ? (
            <p className="text-lg">No frequently visited places detected yet. Keep using the app and they will appear here.</p>
          ) : (
            suggested.map((cluster, i) => {
              // Check if already saved
              const alreadySaved = savedPlaces.some(sp => {
                const d = sp.data as Partial<SavedPlace>;
                if (!d.latitude || !d.longitude) return false;
                return haversineMetres({ latitude: d.latitude!, longitude: d.longitude! }, cluster.center) < 200;
              });
              return (
                <article key={i} className="rounded-xl border p-4 space-y-3">
                  <p className="text-lg">
                    Visited on <strong>{cluster.distinctDays.length} separate days</strong>
                    {consent?.sync && (
                      <> · {cluster.center.latitude.toFixed(4)}, {cluster.center.longitude.toFixed(4)}</>
                    )}
                  </p>
                  {alreadySaved ? (
                    <p className="text-lg text-green-700 font-semibold">✓ Already saved as a favourite</p>
                  ) : (
                    <form className="space-y-3" onSubmit={e => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      const placeData: Record<string, unknown> = {
                        name: data.get("name"),
                        category: data.get("category"),
                        caregiverPinned: false,
                        favourite: true,
                        suggestedAt: Date.now(),
                        distinctDays: cluster.distinctDays.length,
                      };
                      if (consent?.sync) {
                        placeData.latitude = cluster.center.latitude;
                        placeData.longitude = cluster.center.longitude;
                      }
                      save("place", placeData);
                      notify("Favourite place saved.");
                      (e.currentTarget as HTMLFormElement).reset();
                    }}>
                      <label className="block">
                        Name for this place
                        <input name="name" required maxLength={80} className={inputClass} />
                      </label>
                      <label className="block">
                        Category
                        <select name="category" className={inputClass}>
                          <option value="other">Other</option>
                          <option value="home">Home</option>
                          <option value="hospital">Hospital / Clinic</option>
                          <option value="pharmacy">Pharmacy</option>
                          <option value="doctor">Doctor&apos;s office</option>
                        </select>
                      </label>
                      <div className="flex gap-3">
                        <button className={button}>Save as favourite</button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* ── Saved Locations ── */}
      {tab === "saved" && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">Saved locations</h3>
          <p className="text-lg">Important places like home, hospital or pharmacy.</p>

          {/* Add new saved location */}
          <form className="space-y-3 rounded-xl border p-4" onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const placeData: Record<string, unknown> = {
              name: data.get("name"),
              category: data.get("category"),
              address: data.get("address") || undefined,
              caregiverPinned: caregiver,
            };
            const lat = parseFloat(data.get("latitude") as string);
            const lon = parseFloat(data.get("longitude") as string);
            if (!isNaN(lat) && !isNaN(lon)) {
              placeData.latitude = lat;
              placeData.longitude = lon;
            }
            // Optionally use current position if user pressed "use current"
            save("place", placeData);
            notify("Location saved.");
            (e.currentTarget as HTMLFormElement).reset();
          }}>
            <h4 className="text-lg font-bold">Add a location</h4>
            <label className="block">Name<input name="name" required maxLength={80} className={inputClass} /></label>
            <label className="block">Category
              <select name="category" className={inputClass}>
                <option value="other">Other</option>
                <option value="home">Home</option>
                <option value="hospital">Hospital / Clinic</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="doctor">Doctor&apos;s office</option>
              </select>
            </label>
            <label className="block">Address (optional)<input name="address" maxLength={200} className={inputClass} /></label>
            <div className="flex gap-3">
              <label className="flex-1">Latitude<input name="latitude" type="number" step="any" className={inputClass} /></label>
              <label className="flex-1">Longitude<input name="longitude" type="number" step="any" className={inputClass} /></label>
            </div>
            {currentPos && (
              <button type="button" className={button} onClick={e => {
                const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
                (form.elements.namedItem("latitude") as HTMLInputElement).value = String(currentPos.latitude.toFixed(6));
                (form.elements.namedItem("longitude") as HTMLInputElement).value = String(currentPos.longitude.toFixed(6));
              }}>Use my current location</button>
            )}
            <button className={button}>Save location</button>
          </form>

          {/* List of saved places */}
          {savedPlaces.length === 0 ? (
            <p className="text-lg">No saved locations yet.</p>
          ) : (
            savedPlaces.map(row => {
              const d = row.data as Partial<SavedPlace & { address?: string }>;
              const dist = currentPos && d.latitude && d.longitude
                ? formatDistance(haversineMetres({ latitude: d.latitude!, longitude: d.longitude! }, { latitude: currentPos.latitude, longitude: currentPos.longitude }))
                : null;
              return (
                <article key={row.id} className="rounded-xl border p-4 space-y-2">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <h4 className="text-xl font-bold">
                        {text(d.name)}
                        {d.category && d.category !== "other" && <span className="ml-2 text-base font-normal text-muted-foreground">· {d.category}</span>}
                        {d.caregiverPinned && <span className="ml-2 text-base">📌</span>}
                      </h4>
                      {d.address && <p className="text-lg">{d.address}</p>}
                      {d.latitude && d.longitude && (
                        <p className="text-base text-muted-foreground">{d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}</p>
                      )}
                      {dist && <p className="text-lg">Distance: <strong>{dist}</strong></p>}
                    </div>
                    <div className="flex gap-2">
                      {d.latitude && d.longitude && (
                        <a
                          href={mapsUrl({ latitude: d.latitude!, longitude: d.longitude!, name: text(d.name) }, currentPos ?? undefined)}
                          target="_blank" rel="noopener noreferrer"
                          className={button + " text-center"}
                        >
                          Open in Maps
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* ── Navigate ── */}
      {tab === "navigate" && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">Navigate to a place</h3>
          <p className="text-lg">
            Select a saved place and open directions in your maps app.
            Directions are provided by Google Maps — this app does not provide
            turn-by-turn navigation.
          </p>
          {savedPlaces.length === 0 ? (
            <p className="text-lg">Save some locations first, then you can navigate to them.</p>
          ) : (
            savedPlaces.map(row => {
              const d = row.data as Partial<SavedPlace & { address?: string }>;
              if (!d.latitude || !d.longitude) return null;
              const dist = currentPos
                ? formatDistance(haversineMetres({ latitude: d.latitude!, longitude: d.longitude! }, { latitude: currentPos.latitude, longitude: currentPos.longitude }))
                : null;
              return (
                <article key={row.id} className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold">{text(d.name)}</p>
                    {d.address && <p className="text-lg">{d.address}</p>}
                    {dist && <p className="text-lg">About <strong>{dist}</strong> away</p>}
                    {!currentPos && <p className="text-base text-muted-foreground">Enable location to see distance.</p>}
                  </div>
                  <a
                    href={mapsUrl({ latitude: d.latitude!, longitude: d.longitude!, name: text(d.name) }, currentPos ?? undefined)}
                    target="_blank" rel="noopener noreferrer"
                    className={button + " text-center"}
                  >
                    🗺 Get directions
                  </a>
                </article>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function Dashboard({ rows, save }: { rows: SupportRecord[]; save: Save }) {
  const events = rows.filter(row => row.kind === "event").map(row => row.data as unknown as SessionEvent);
  const domains = ["Memory", "Attention", "Executive Function", "Recognition & Orientation"];
  const scoresFor = (domain: string) => sessionScores(events, domain);
  const index = cognitiveTrendIndex(rows);
  return <section className="space-y-5 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Caregiver overview</h2><p>Engagement observations only. This does not diagnose or treat dementia.</p>
    {rows.some(row => row.data.simulated === true) && <p className="rounded-xl border-2 p-4 text-xl font-bold">SIMULATED DEMO DATA</p>}
    <article className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">Cognitive Trend Index: {index.score === null ? "Not enough data" : `${index.score} / 100`}</h3><p>Experimental engagement summary for the last seven days. Missing measurements are excluded.</p>{index.components.map(component => <p key={component.label}><strong>{component.label}:</strong> {component.explanation}</p>)}</article>
    {routineDeviation(rows) && <p role="alert" className="rounded-xl border-2 p-4">The latest consented location is over 1 km from the marked home at night. Check the location accuracy and contact the patient.</p>}
    <p>Journal entries: {rows.filter(r => r.kind === "journal").length} · Completed reminders: {rows.filter(r => r.kind === "adherence").length} · Answer events: {events.length}</p>
    <label>Default interaction style<select className={inputClass} defaultValue={text(rows.find(r => r.id === "interaction-default")?.data.mode) || "read"} onChange={e => save("default", { mode: e.target.value, override: false }, "interaction-default")}><option value="read">Read and tap</option><option value="voice">Listen and speak</option><option value="mixed">Mixed</option></select></label><p>Patient overrides take precedence.</p>
    {domains.map(domain => { const scores = scoresFor(domain).slice(-8); return <article key={domain} className="rounded-xl border p-4"><h3 className="text-xl font-bold">{domain}</h3>{scores.length ? <><svg viewBox="0 0 400 120" role="img" aria-label={`${domain} scores: ${scores.join(', ')}`} className="h-32 w-full"><polyline fill="none" stroke="currentColor" strokeWidth="3" points={scores.map((score, i) => `${10 + i * 380 / Math.max(1, scores.length - 1)},${110 - score}`).join(" ")} /></svg><p>{scores.join(" → ")}</p></> : <p>No sessions recorded yet.</p>}{declineAlert(scores) && <p role="alert" className="text-xl font-bold text-amber-700">Scores have fallen across several sessions. Check in with the patient and review the context.</p>}</article>; })}
    <h3 className="text-xl font-bold">SOS history</h3>{rows.filter(row => row.kind === "sos").map(row => <p key={row.id} role="alert">Help requested · {new Date(row.updatedAt).toLocaleString()} · {row.data.location ? "Last known location attached" : "No known location"}</p>)}
  </section>;
}
