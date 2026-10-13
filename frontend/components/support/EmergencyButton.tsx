"use client";
import { useEffect, useRef, useState } from "react";
import { putSupport, readSupport, syncSupport } from "@/lib/interaction/support-store";
export default function EmergencyButton() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  useEffect(() => { const trigger = () => { if (!sending.current) { setRemaining(5); setMessage(""); } }; window.addEventListener("cogni:sos", trigger); return () => window.removeEventListener("cogni:sos", trigger); }, []);
  useEffect(() => {
    if (remaining === null) return;
    if (remaining > 0) { const timer = setTimeout(() => setRemaining(value => value === null ? null : value - 1), 1000); return () => clearTimeout(timer); }
    if (sending.current) return; sending.current = true;
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    try {
      const locations = readSupport(patient).records.filter(row => row.kind === "location");
      const last = locations.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      putSupport(patient, "sos", { requestedAt: Date.now(), location: last?.data ?? null });
      setMessage("Help request saved. Trying to reach your caregiver…");
      void syncSupport(patient).then(() => setMessage("Your help request reached the caregiver account.")).catch(() => setMessage("Your request is saved on this device but has NOT reached your caregiver. Please call them or ask someone nearby for help.")).finally(() => { sending.current = false; setRemaining(null); });
    } catch { setMessage("Could not save or send your request. Please call your caregiver or ask someone nearby for help."); sending.current = false; setRemaining(null); }
  }, [remaining]);
  return <div data-voice-ignore className="fixed right-3 top-3 z-[110] max-w-sm print:hidden">
    <button type="button" className="min-h-16 rounded-2xl border-4 border-white bg-red-700 px-7 text-2xl font-extrabold text-white shadow-lg" onClick={() => { if (!sending.current) { setRemaining(5); setMessage(""); } }}>SOS · Help</button>
    {remaining !== null && <div className="mt-2 rounded-xl border-2 bg-background p-4 text-xl"><p>Requesting help in {remaining}…</p><button className="mt-3 min-h-14 rounded-xl border-2 px-6 font-bold" onClick={() => { if (!sending.current) setRemaining(null); }}>Cancel</button></div>}
    {message && <p role="status" className="mt-2 rounded-xl border-2 bg-background p-4 text-xl">{message}</p>}
  </div>;
}
