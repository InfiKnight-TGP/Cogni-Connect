"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    if (query.get("reset") === "done") params.set("reset", "done");
    if (query.get("expired") === "patient") params.set("expired", "patient");
    if (query.get("mode") === "self") params.set("mode", "self");
    const next = query.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && !/[\\]/.test(next) && !/^https?:/i.test(next)) params.set("next", next);
    const suffix = params.toString();
    router.replace(`/welcome?tab=signin${suffix ? `&${suffix}` : ""}`);
  }, [router]);
  return <main className="p-8 text-xl" role="status">Opening sign in…</main>;
}
