"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

const KEY = "caregiver";
const EVENT = "caregiver-change"; // keeps every useCaregiver() on the page in sync

function read() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Synchronous mode check for shared request helpers outside React components. */
export function isCaregiverUnlocked() {
  return read();
}

function write(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Caregiver mode for this browser session: [on, ready]. `ready` is false until sessionStorage was read. */
export function useCaregiver(): [boolean, boolean] {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setOn(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [on, ready];
}

/** Checks the PIN with the backend; on success caregiver mode stays on for this browser session. */
export async function unlockCaregiver(pin: string): Promise<"ok" | "wrong" | "offline"> {
  try {
    const res = await fetch(`${API_URL}/caregiver/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) write(true);
    return res.ok ? "ok" : "wrong";
  } catch {
    return "offline";
  }
}

export function lockCaregiver() {
  write(false);
}
