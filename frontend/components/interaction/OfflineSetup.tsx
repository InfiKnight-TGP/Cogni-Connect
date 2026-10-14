"use client";
import { useEffect, useState } from "react";

type OfflineManifest = { version: number; assets: string[] };

function isOfflineManifest(value: unknown): value is OfflineManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Record<string, unknown>;
  return typeof manifest.version === "number"
    && Array.isArray(manifest.assets)
    && manifest.assets.every(asset => typeof asset === "string" && asset.startsWith("/") && !asset.startsWith("//"));
}

export default function OfflineSetup() {
  const [offlineError, setOfflineError] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const prepare = async () => {
      const response = await fetch("/sw-assets.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Offline manifest returned HTTP ${response.status}`);
      const manifest: unknown = await response.json();
      if (!isOfflineManifest(manifest)) throw new Error("Offline manifest is invalid");

      const cache = await caches.open(`cogni-patient-${manifest.version}`);
      const assets = [...manifest.assets, "/play", "/support"];
      const cachedPaths = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
      for (let start = 0; start < assets.length; start += 8) {
        const batch = assets.slice(start, start + 8).filter(asset => !cachedPaths.has(new URL(asset, location.origin).pathname));
        await Promise.all(batch.map(async asset => {
          try {
            const response = await fetch(asset, { cache: "reload" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = await response.arrayBuffer();
            await cache.put(asset, new Response(body, {
              headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream" },
            }));
          } catch (error) {
            throw new Error(`Could not prepare offline resource ${asset}: ${String(error)}`, { cause: error });
          }
        }));
      }
      await navigator.serviceWorker.register("/sw.js");
    };
    const reportError = (error: unknown) => {
      console.error("Offline setup failed", error);
      setOfflineError(true);
      window.dispatchEvent(new CustomEvent("cogni:offline-error", { detail: error }));
    };
    const start = () => {
      window.setTimeout(() => { void prepare().catch(reportError); }, 1000);
    };
    if (document.readyState === "complete") start();
    else {
      window.addEventListener("load", start, { once: true });
      return () => window.removeEventListener("load", start);
    }
  }, []);
  return offlineError
    ? <p role="alert" className="fixed bottom-24 left-4 right-4 z-[100] rounded-xl border-2 bg-background p-4 text-lg font-semibold shadow-lg">Offline play is not ready. Please reconnect and try again.</p>
    : null;
}
