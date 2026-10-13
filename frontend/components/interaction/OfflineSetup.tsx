"use client";
import { useEffect } from "react";
export default function OfflineSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => { window.dispatchEvent(new CustomEvent("cogni:offline-error")); });
  }, []);
  return null;
}
