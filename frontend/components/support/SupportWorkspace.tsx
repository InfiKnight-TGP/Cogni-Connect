"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/nav";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { BrowserSpeechProvider } from "@/lib/interaction/speech";
import { platformRequest, putSupport, readSupport, syncSupport, saveMedia, loadMedia, type Account } from "@/lib/interaction/support-store";
import type { SupportRecord } from "@/lib/interaction/sync";
import { summarize, clusterVisits, distance, type Visit } from "@/lib/interaction/content";
import { dayKey } from "@/lib/progress";
import { declineAlert, type SessionEvent } from "@/lib/interaction/adaptive";
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
    if (!account) return;
    try { putSupport(account.patient, kind, data, id); refresh(account.patient); setNotice("Saved on this device. It will sync when connected."); }
    catch { setNotice("Could not save. Device storage may be full. Please keep this screen open and ask for help."); }
  };
  const authenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (setup) { await platformRequest("/auth/setup", data); setSetup(false); setNotice("Accounts created. Sign in with either account."); return; }
      const value: Account = await platformRequest("/auth/login", data);
      setAccount(value); localStorage.setItem("cogni:patient", value.patient); localStorage.setItem("cogni:role", value.role);
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
      <div className="flex flex-wrap gap-3"><span>{account.username} · {pending ? `${pending} waiting to sync` : "All changes synced"}</span><button className={button} onClick={() => void syncSupport(account.patient).then(() => setNotice("Sync complete")).catch(error => setNotice(error.message))}>Sync now</button><button className={button} onClick={() => void platformRequest("/auth/logout", {}).then(() => { setAccount(null); localStorage.removeItem("cogni:role"); localStorage.removeItem("cogni:patient"); window.dispatchEvent(new Event("cogni:patient-change")); }).catch(error => setNotice(error.message))}>Sign out</button></div>
      <nav className="flex flex-wrap gap-3" aria-label="Support activities">{sections.map(name => <button key={name} className={button} aria-current={section === name ? "page" : undefined} onClick={() => setSection(name)}>{name}</button>)}</nav>
      <VoiceQuestion auto={false} prompt="Choose an activity" options={sections.map(label => ({ id: label, label }))} onAnswer={setSection} />
      {section === "Journal" && <Journal rows={rows} save={save} patient={account.patient} notify={setNotice} />}
      {section === "Reminders" && <Reminders rows={rows} save={save} caregiver={account.role === "caregiver"} />}
      {section === "Family" && <Family rows={rows} save={save} caregiver={account.role === "caregiver"} />}
      {section === "Places" && <Places rows={rows} save={save} caregiver={account.role === "caregiver"} notify={setNotice} patient={account.patient} />}
      {section === "Crossword" && <PersonalCrossword />}
      {section === "Dashboard" && account.role === "caregiver" && <Dashboard rows={rows} save={save} />}
      <Link className={button + " inline-block"} href="/games">Play a game</Link>
    </>}
  </main></>;
}

type Save = (kind: string, data: Record<string, unknown>, id?: string) => void;
function MediaPlayback({ id, video }: { id: string; video: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true, objectUrl = ""; void loadMedia(id).then(blob => { if (blob && active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [id]);
  return url ? video ? <video controls src={url} className="max-h-72 w-full" /> : <audio controls src={url} className="w-full" /> : <p>Recording is stored only on the device that made it.</p>;
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
  return <section className="space-y-4 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Tell me about your day</h2>
    <label className="block">Your memory or transcript<textarea className={inputClass} rows={5} value={draft} maxLength={12000} onChange={e => setDraft(e.target.value)} /></label>
    <div className="flex flex-wrap gap-3">{recording ? <button className={button} onClick={() => { recorder.current?.stop(); speech.current.cancel(); }}>Stop recording</button> : <><button className={button} onClick={() => void record(false)}>Record audio</button><button className={button} onClick={() => void record(true)}>Record video</button></>}</div>
    {recording && <p role="status">Recording… Stop when you are ready.</p>}
    {media && <MediaPlayback id={media.id} video={media.video} />}
    <button className={button} disabled={recording || (!draft.trim() && !media)} onClick={() => { const today = dayKey(new Date()); save("journal", { text: draft, summary: summarize(draft), day: today, media, locationIds: rows.filter(row => row.kind === "location" && row.data.day === today).map(row => row.id) }); setDraft(""); setMedia(null); }}>Save memory</button>
    <h3 className="text-xl font-bold">How are you feeling?</h3>
    <div className="flex flex-wrap gap-3">{["🙂 Happy", "😐 Okay", "😔 Sad"].map(mood => <button key={mood} className={button} onClick={() => save("mood", { mood, day: dayKey(new Date()) })}>{mood}</button>)}</div>
    <VoiceQuestion prompt="How are you feeling?" auto={false} options={[{ id: "Happy", label: "Happy" }, { id: "Okay", label: "Okay" }, { id: "Sad", label: "Sad" }]} onAnswer={mood => save("mood", { mood, day: dayKey(new Date()) })} />
    {rows.filter(row => row.kind === "journal").slice(-10).reverse().map(row => <article key={row.id} className="space-y-3 rounded-xl border p-4"><p className="text-xl">{text(row.data.text)}</p><p>{text(row.data.summary)}</p>{row.data.media && typeof row.data.media === "object" ? <MediaPlayback id={text((row.data.media as { id: string }).id)} video={Boolean((row.data.media as { video: boolean }).video)} /> : null}</article>)}
  </section>;
}

function Reminders({ rows, save, caregiver }: { rows: SupportRecord[]; save: Save; caregiver: boolean }) {
  const today = dayKey(new Date());
  const complete = (row: SupportRecord, method: string) => save("adherence", { reminderId: row.id, day: today, method }, `done:${row.id}:${today}`);
  return <section className="space-y-4 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Things to do</h2>
    {caregiver && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form)); save("reminder", data); form.reset(); }}><label>Reminder<input name="label" required maxLength={160} className={inputClass} /></label><label>Kind<select name="type" className={inputClass}><option>Medicine</option><option>Hydration</option><option>Activity</option><option>Appointment</option></select></label><label>Time<input name="time" type="time" required className={inputClass} /></label><button className={button}>Add reminder</button></form>}
    {rows.filter(row => row.kind === "reminder").map(row => { const done = rows.some(r => r.id === `done:${row.id}:${today}`); return <article className="rounded-xl border-2 p-4" key={row.id}><h3 className="text-2xl">{text(row.data.label)}</h3><p>{text(row.data.time)}</p><button className={button} disabled={done} onClick={() => complete(row, "tap")}>{done ? "Done ✓" : "Done"}</button><VoiceQuestion auto={false} prompt={text(row.data.label)} disabled={done} options={[{ id: "done", label: "Done" }]} onAnswer={() => complete(row, "voice")} /></article>; })}
    {!rows.some(row => row.kind === "reminder") && <p>Your caregiver can add reminders here.</p>}
  </section>;
}

function Family({ rows, save, caregiver }: { rows: SupportRecord[]; save: Save; caregiver: boolean }) {
  return <section className="space-y-4 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Family messages</h2>
    {caregiver && <form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; save("message", { text: new FormData(form).get("message") }); form.reset(); }}><label>Your message<textarea name="message" required maxLength={2000} className={inputClass} /></label><button className={button}>Leave message</button></form>}
    {rows.filter(row => row.kind === "message").slice(-10).map(row => <article key={row.id} className="space-y-3 rounded-xl border-2 p-4"><p className="text-2xl">{text(row.data.text)}</p><VoiceQuestion auto={false} prompt={text(row.data.text)} options={[{ id: "Thank you", label: "Thank you" }, { id: "Please call me", label: "Please call me" }]} onAnswer={reply => save("reply", { messageId: row.id, text: reply, method: "voice" })} /><div className="flex flex-wrap gap-3">{["Thank you", "Please call me"].map(reply => <button key={reply} className={button} onClick={() => save("reply", { messageId: row.id, text: reply, method: "tap" })}>{reply}</button>)}</div>{rows.filter(r => r.kind === "reply" && r.data.messageId === row.id).map(reply => <p key={reply.id}>↳ {text(reply.data.text)}</p>)}</article>)}
  </section>;
}

function Places({ rows, save, caregiver, notify, patient }: { rows: SupportRecord[]; save: Save; caregiver: boolean; notify: (message: string) => void; patient: string }) {
  const [tracking, setTracking] = useState(false);
  const watch = useRef<number | null>(null);
  const consent = rows.find(row => row.id === "location-consent")?.data;
  const pause = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setTracking(false); };
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  useEffect(() => { if (!consent?.tracking) pause(); }, [consent?.tracking]);
  const start = () => {
    if (!consent?.tracking) return;
    if (!navigator.geolocation) { notify("Location is unavailable on this device."); return; }
    setTracking(true); let previous = 0;
    watch.current = navigator.geolocation.watchPosition(position => {
      if (Date.now() - previous < 60000) return; previous = Date.now();
      const visit = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: Date.now(), day: dayKey(new Date()) };
      if (consent.sync) save("location", visit);
      else { const key = `cogni:local-locations:${patient}`; const local = JSON.parse(localStorage.getItem(key) || "[]"); localStorage.setItem(key, JSON.stringify([...local, visit])); notify("Location saved on this device only."); }
    }, () => { pause(); notify("Location could not be read. You can keep using the app."); }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 });
  };
  const visits = rows.filter(row => row.kind === "location").map(row => row.data as unknown as Visit);
  const clusters = clusterVisits(visits);
  return <section className="space-y-4 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">My places</h2>
    <p>Location is optional. While this screen is open, it can remember places you visit. You can pause at any time.</p>
    {caregiver && <form className="space-y-4" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const value = { tracking: data.get("tracking") === "on", sync: data.get("sync") === "on", confirmedAt: Date.now() }; save("consent", value, "location-consent"); save("consent", { ...value, action: "consent-change" }); }}><label className="block text-xl"><input type="checkbox" name="tracking" className="mr-3 h-6 w-6" defaultChecked={Boolean(consent?.tracking)} /> I am the caregiver and confirm location collection with the patient.</label><label className="block text-xl"><input type="checkbox" name="sync" className="mr-3 h-6 w-6" defaultChecked={Boolean(consent?.sync)} /> Also allow location sync to the caregiver account.</label><button className={button}>Save consent</button></form>}
    {consent?.tracking ? <button className={button} onClick={tracking ? pause : start}>{tracking ? "Pause tracking" : "Start remembering places"}</button> : <p>A caregiver must confirm consent before location is used.</p>}
    <p role="status">{tracking ? "Location is on while this screen stays open." : "Location is paused."}</p>
    {clusters.map((cluster, index) => <form key={index} className="space-y-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); save("place", { name: new FormData(e.currentTarget).get("name"), ...cluster.center, favourite: true }); }}><p>Visited place {index + 1} · {cluster.visits} recorded visits</p><label>Favourite place name<input name="name" required maxLength={80} className={inputClass} /></label><button className={button}>Save favourite</button></form>)}
    {rows.filter(row => row.kind === "place").map(row => <p key={row.id}>★ {text(row.data.name)}</p>)}
  </section>;
}

function Dashboard({ rows, save }: { rows: SupportRecord[]; save: Save }) {
  const events = rows.filter(row => row.kind === "event").map(row => row.data as unknown as SessionEvent);
  const domains = ["Memory", "Attention", "Executive Function", "Recognition & Orientation"];
  const scoresFor = (domain: string) => {
    const sessions = new Map<string, { sum: number; count: number }>();
    events.filter(event => event.domain === domain && event.correct !== null && !["recognition", "silence"].includes(event.errorType)).sort((a, b) => a.timestamp - b.timestamp).forEach(event => { const session = sessions.get(event.session) || { sum: 0, count: 0 }; session.sum += Number(event.correct); session.count++; sessions.set(event.session, session); });
    return Array.from(sessions.values()).map(s => Math.round(s.sum / s.count * 100));
  };
  return <section className="space-y-5 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Caregiver overview</h2><p>Engagement observations only. This does not diagnose or treat dementia.</p>
    <p>Journal entries: {rows.filter(r => r.kind === "journal").length} · Completed reminders: {rows.filter(r => r.kind === "adherence").length} · Answer events: {events.length}</p>
    <label>Default interaction style<select className={inputClass} defaultValue={text(rows.find(r => r.id === "interaction-default")?.data.mode) || "read"} onChange={e => save("default", { mode: e.target.value, override: false }, "interaction-default")}><option value="read">Read and tap</option><option value="voice">Listen and speak</option><option value="mixed">Mixed</option></select></label><p>Patient overrides take precedence.</p>
    {domains.map(domain => { const scores = scoresFor(domain).slice(-8); return <article key={domain} className="rounded-xl border p-4"><h3 className="text-xl font-bold">{domain}</h3>{scores.length ? <><svg viewBox="0 0 400 120" role="img" aria-label={`${domain} scores: ${scores.join(', ')}`} className="h-32 w-full"><polyline fill="none" stroke="currentColor" strokeWidth="3" points={scores.map((score, i) => `${10 + i * 380 / Math.max(1, scores.length - 1)},${110 - score}`).join(" ")} /></svg><p>{scores.join(" → ")}</p></> : <p>No sessions recorded yet.</p>}{declineAlert(scores) && <p role="alert" className="text-xl font-bold text-amber-700">Scores have fallen across several sessions. Check in with the patient and review the context.</p>}</article>; })}
    <h3 className="text-xl font-bold">SOS history</h3>{rows.filter(row => row.kind === "sos").map(row => <p key={row.id} role="alert">Help requested · {new Date(row.updatedAt).toLocaleString()} · {row.data.location ? "Last known location attached" : "No known location"}</p>)}
  </section>;
}
