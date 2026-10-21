"use client";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_URL, apiFetch, apiJSON, AUTH_CHANGED, AUTH_EXPIRED, jsonBody, setRequestPatient } from "./api";
import { AuthSession, PUBLIC_ROUTES, setSessionSnapshot } from "./auth-session";
type AuthContextValue = {
  session: AuthSession | null; ready: boolean;
  refresh: () => Promise<AuthSession | null>;
  selectPatient: (id: string) => Promise<void>; logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef<AuthSession | null>(null);
  const expiredPatient = useRef(false);
  const inFlight = useRef<Promise<AuthSession | null> | null>(null);
  const pathname = usePathname(); const router = useRouter();
  const commit = useCallback((next: AuthSession | null) => {
    latest.current = next; setSessionSnapshot(next); setRequestPatient(next?.activePatient?.id ?? null); setSession(next);
    if (next) {
      expiredPatient.current = false;
      try { localStorage.setItem("cogni-last-role", next.role); } catch { /* Optional UI hint only. */ }
    }
  }, []);
  const expire = useCallback(() => {
    expiredPatient.current = latest.current?.role === "patient_device" || expiredPatient.current;
    commit(null); router.replace(expiredPatient.current ? "/welcome?expired=patient" : "/welcome");
  }, [commit, router]);
  const refresh = useCallback((): Promise<AuthSession | null> => {
    if (inFlight.current) return inFlight.current;
    const work = async () => {
      try {
        let response = await apiFetch(`${API_URL}/auth/me`, { authRedirect: false });
        if (response.status === 403) {
          document.cookie = "cogni_patient=; Path=/; Max-Age=0; SameSite=Lax";
          response = await apiFetch(`${API_URL}/auth/me`, { authRedirect: false });
        }
        if (response.status === 401) {
          try { expiredPatient.current = localStorage.getItem("cogni-last-role") === "patient_device"; } catch { /* Optional UI hint only. */ }
          if (latest.current) expire(); else commit(null);
          setError(""); return null;
        }
        if (!response.ok) throw new Error("Could not connect. Please try again.");
        const next: AuthSession = await response.json();
        commit(next); setError(""); return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not connect."); return null;
      } finally { setReady(true); }
    };
    inFlight.current = work().finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [commit, expire]);
  useEffect(() => {
    void refresh();
    const sync = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === "visible") sync(); };
    const timer = window.setInterval(visible, 30_000);
    window.addEventListener("focus", sync); window.addEventListener(AUTH_CHANGED, sync);
    window.addEventListener(AUTH_EXPIRED, expire); document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer); window.removeEventListener("focus", sync);
      window.removeEventListener(AUTH_CHANGED, sync); window.removeEventListener(AUTH_EXPIRED, expire);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, expire]);
  const publicRoute = PUBLIC_ROUTES.has(pathname);
  const needsSetup = session?.role === "caregiver" && !session.activePatient;
  useEffect(() => {
    if (!ready || error || publicRoute) return;
    if (!session) router.replace(expiredPatient.current ? "/welcome?expired=patient" : "/welcome");
    else if (needsSetup && pathname !== "/setup") router.replace("/setup");
    else if (session.role === "caregiver" && pathname === "/") router.replace("/caregiver");
  }, [ready, error, publicRoute, session, needsSetup, pathname, router]);
  const selectPatient = async (id: string) => {
    const next = await apiJSON<AuthSession>("/auth/me", { headers: { "X-Cogni-Patient": id } });
    if (next.role !== "caregiver" || next.activePatient?.id !== id) throw new Error("Unable to select this patient.");
    document.cookie = `cogni_patient=${encodeURIComponent(id)}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    // Discard all old patient requests, game state, and media before switching.
    setSessionSnapshot(null); window.location.assign("/caregiver");
  };
  const logout = async () => {
    await apiJSON("/auth/logout", jsonBody({})); commit(null); window.location.assign("/welcome");
  };
  const blocked = !publicRoute && (!ready || !session || (needsSetup && pathname !== "/setup") || (session?.role === "caregiver" && pathname === "/"));
  return <AuthContext.Provider value={{ session, ready, refresh, selectPatient, logout }}>
    {error && !publicRoute ? <main className="mx-auto max-w-lg space-y-5 p-8 text-xl"><p role="alert">{error}</p><button className="min-h-12 rounded-xl border px-5" onClick={() => void refresh()}>Try again</button></main>
      : blocked ? <main className="p-8 text-xl" role="status">Getting things ready…</main>
      : <Fragment key={`${session?.activePatient?.id ?? "public"}:${session?.role}:${session?.elevated}`}>{children}</Fragment>}
  </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
