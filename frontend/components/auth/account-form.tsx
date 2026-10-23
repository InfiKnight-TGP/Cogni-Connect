"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiJSON, jsonBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { AuthFrame, PasswordField, CodeInput, Notice, actionClass, fieldClass, secondaryClass } from "./fields";
type Kind = "login" | "signup" | "verify" | "forgot" | "reset";
const titles: Record<Kind, string> = { login: "Caregiver sign in", signup: "Create your caregiver account", verify: "Check your email", forgot: "Reset your password", reset: "Choose a new password" };
export default function AccountForm({ kind, embedded = false }: { kind: Kind; embedded?: boolean }) {
  const { t } = useTranslate(); const router = useRouter(); const { refresh } = useAuth();
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [challenge, setChallenge] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [signupMode, setSignupMode] = useState<"self" | "caregiver">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "self" ? "self" : "caregiver");
  const [loginMode, setLoginMode] = useState<"self" | "caregiver">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "self" ? "self" : "caregiver");
  const [devWindow, setDevWindow] = useState(process.env.NEXT_PUBLIC_DEV_LOGIN === "1");
  const verification = kind === "verify" || kind === "reset";
  useEffect(() => {
    if (verification) setChallenge(sessionStorage.getItem(`cogni-${kind}-challenge`) ?? "");
  }, [kind, verification]);
  useEffect(() => { if (kind === "login") setDevWindow(process.env.NEXT_PUBLIC_DEV_LOGIN === "1" && !window.location.search.includes("full=1")); }, [kind]);
  useEffect(() => { if (kind === "signup" && new URLSearchParams(window.location.search).get("mode") === "self") setSignupMode("self"); }, [kind]);
  useEffect(() => { if (kind === "login" && new URLSearchParams(window.location.search).get("mode") === "self") setLoginMode("self"); }, [kind]);
  if (kind === "login" && devWindow) return <DevLoginWindow onFullSignIn={() => setDevWindow(false)} />;
  const continueLogin = async () => {
    const session = await refresh();
    if (!session) throw new Error("Could not load your account. Please try again.");
    const requested = new URLSearchParams(window.location.search).get("next") ?? "";
    const safeNext = requested.startsWith("/") && !requested.startsWith("//") && !/[\\]/.test(requested) && !/^https?:/i.test(requested) ? requested : (session.role === "caregiver" ? "/caregiver" : "/");
    router.replace(safeNext);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const path = kind === "verify" ? "/auth/otp/verify" : `/auth/${kind}`;
      const data = await apiJSON<{ challenge?: string; requiresCode?: boolean }>(path, {
        ...jsonBody(verification ? { challenge, code, password } : { email, name, password, ...(kind === "signup" ? { mode: signupMode } : {}) }), authRedirect: false,
      });
      if (kind === "forgot" || data.requiresCode) {
        const next = kind === "forgot" ? "reset" : "verify";
        sessionStorage.setItem(`cogni-${next}-challenge`, data.challenge ?? ""); router.push(`/${next}`);
      } else if (kind === "reset") {
        sessionStorage.removeItem("cogni-reset-challenge"); router.replace("/login?reset=done");
      } else {
        sessionStorage.removeItem("cogni-verify-challenge"); await continueLogin();
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not connect. Please try again."); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setNotice("");
    try {
      const result = await apiJSON<{ challenge: string }>("/auth/otp/resend", { ...jsonBody({ challenge }), authRedirect: false });
      setChallenge(result.challenge); setCode(""); sessionStorage.setItem(`cogni-${kind}-challenge`, result.challenge);
      setNotice("A new code has been sent. Please check your email.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send a new code."); }
    finally { setBusy(false); }
  };
  const title = kind === "login" && loginMode === "self" ? "Self-care sign in" : titles[kind];
  return <AuthFrame title={title} embedded={embedded}>
    {kind === "login" && process.env.NEXT_PUBLIC_DEMO === "1" && <div className="mb-5 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"><h2 className="text-xl font-bold">Try the demo</h2>{(embedded || loginMode === "self") && <><p className="text-base">Self-care: patient@cogniconnect.com / Patient@1234</p><button type="button" className={secondaryClass} onClick={() => { setEmail("patient@cogniconnect.com"); setPassword("Patient@1234"); }}>Fill in self-care</button></>}{(embedded || loginMode === "self" || loginMode === "caregiver") && <><p className="text-base">Caregiver: demo@cogniconnect.com / Demo@1234</p><button type="button" className={secondaryClass} onClick={() => { setEmail("demo@cogniconnect.com"); setPassword("Demo@1234"); }}>Fill in caregiver</button></>}<p className="text-base">Code: 123456</p></div>}
    {kind === "signup" && signupMode === "self" && process.env.NEXT_PUBLIC_DEMO === "1" && <div className="mb-5 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"><h2 className="text-xl font-bold">Try the demo</h2><p className="text-base">Self-care: patient@cogniconnect.com / Patient@1234</p><button type="button" className={secondaryClass} onClick={() => router.push("/login?mode=self")}>Open self-care demo sign-in</button><p className="text-base">Code: 123456</p></div>}
    {verification && <><p>{t("Enter the six-digit code from your email. It is valid for five minutes.")}</p>{kind === "verify" && process.env.NEXT_PUBLIC_DEMO === "1" && <button type="button" className={secondaryClass} onClick={() => setCode("123456")}>{t("Use demo code")}</button>}</>}
    {kind === "forgot" && <p>{t("If an account exists for this email, we will send a reset code.")}</p>}
    <form onSubmit={submit} className="space-y-5">
      {kind === "signup" && <><fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Account type</legend><button type="button" onClick={() => setSignupMode("self")} className={`min-h-14 rounded-xl border-2 p-3 text-left font-semibold ${signupMode === "self" ? "border-primary bg-primary/10" : "border-border"}`}>For myself</button><button type="button" onClick={() => setSignupMode("caregiver")} className={`min-h-14 rounded-xl border-2 p-3 text-left font-semibold ${signupMode === "caregiver" ? "border-primary bg-primary/10" : "border-border"}`}>For someone I care for</button></fieldset><label className="block">{t("Your name")}<input required maxLength={100} autoComplete="name" className={fieldClass} value={name} onChange={e => setName(e.target.value)} /></label>{signupMode === "self" && <p className="rounded-xl border border-primary/30 bg-primary/5 p-4">This creates a private self-care profile. You can invite someone you trust later, and your profile stays yours.</p>}</>}
      {!verification && <label className="block">{t("Email")}<input required type="email" maxLength={200} autoComplete="email" className={fieldClass} value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {verification && <CodeInput length={6} label={t("Email code")} value={code} onChange={setCode} />}
      {kind !== "forgot" && kind !== "verify" && <PasswordField value={password} onChange={setPassword} current={kind === "login"} />}
      {kind === "login" && <label className="flex min-h-12 items-center gap-3 text-lg"><input type="checkbox" className="h-5 w-5" checked={rememberDevice} onChange={event => setRememberDevice(event.target.checked)} />{t("Remember this device")}</label>}
      {(kind === "signup" || kind === "reset") && <p className="text-lg">{t("Use at least eight characters.")}</p>}
      <Notice>{t(notice)}</Notice>
      <button className={`${actionClass} w-full`} disabled={busy || (verification && (!challenge || code.length !== 6))}>{t(busy ? "Please wait…" : kind === "forgot" ? "Send reset code" : kind === "reset" ? "Save new password" : "Continue")}</button>
    </form>
    {verification && <><button type="button" className={secondaryClass} disabled={busy || !challenge} onClick={() => void resend()}>{t("Send a new code")}</button><p className="text-lg">{t("Code expired?")} <Link className="text-primary underline" href={kind === "reset" ? "/forgot" : "/login"}>{t("Start again")}</Link></p></>}
    {kind === "login" && <div className="flex flex-wrap gap-6 text-lg"><Link className="min-h-12 text-primary underline" href="/signup">{t("Create an account")}</Link><Link className="min-h-12 text-primary underline" href="/login?mode=self">Self-care sign in</Link><Link className="min-h-12 text-primary underline" href="/forgot">{t("Forgot password?")}</Link></div>}
    {kind === "signup" && <Link className="inline-flex min-h-12 items-center text-primary underline" href={signupMode === "self" ? "/login?mode=self" : "/login"}>{t("Already have an account? Sign in")}</Link>}
  </AuthFrame>;
}

function DevLoginWindow({ onFullSignIn }: { onFullSignIn: () => void }) {
  const router = useRouter(); const { refresh } = useAuth();
  const [email, setEmail] = useState("caregiver@demo.local"); const [password, setPassword] = useState("demo1234");
  const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const choose = (next: "caregiver" | "owner" | "patient") => {
    if (next === "patient") { setEmail(""); setPassword(""); return; }
    setEmail(next === "owner" ? "owner@demo.local" : "caregiver@demo.local"); setPassword("demo1234");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      if (!email) await apiJSON("/auth/dev/patient-device", { ...jsonBody({}), authRedirect: false });
      else await apiJSON("/auth/login", { ...jsonBody({ email, password }), authRedirect: false });
      const session = await refresh();
      if (!session) throw new Error("Could not load your account.");
      router.replace(session.role === "patient_device" ? "/" : "/caregiver");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not sign in."); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto min-h-[70vh] max-w-xl px-5 py-10 sm:py-16">
    <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl sm:p-9">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-300">Welcome back</p>
      <h1 className="mt-3 text-4xl font-bold">Sign in</h1>
      <p className="mt-3 text-lg text-slate-300">Follow your patient&apos;s progress and manage their day.</p>
      <p className="mt-5 rounded-xl border border-teal-300/40 bg-teal-300/10 px-4 py-3 text-base text-teal-100">Development mode: login shortcuts are on.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => choose("caregiver")} className={`min-h-12 rounded-xl border px-3 text-base font-semibold ${email === "caregiver@demo.local" ? "border-teal-300 bg-teal-300/20" : "border-slate-700 bg-slate-900"}`}>Demo Caregiver</button>
        <button type="button" onClick={() => choose("patient")} className={`min-h-12 rounded-xl border px-3 text-base font-semibold ${!email ? "border-teal-300 bg-teal-300/20" : "border-slate-700 bg-slate-900"}`}>Patient Device</button>
        <button type="button" onClick={() => choose("owner")} className={`min-h-12 rounded-xl border px-3 text-base font-semibold ${email === "owner@demo.local" ? "border-teal-300 bg-teal-300/20" : "border-slate-700 bg-slate-900"}`}>Owner</button>
      </div>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block text-lg font-medium">Email<input required={!!email} type="email" autoComplete="email" className="mt-2 min-h-14 w-full rounded-xl border-2 border-slate-700 bg-slate-900 px-4 text-lg text-white" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label className="block text-lg font-medium">Password<div className="relative mt-2"><input required={!!email} type={showPassword ? "text" : "password"} autoComplete="current-password" className="min-h-14 w-full rounded-xl border-2 border-slate-700 bg-slate-900 px-4 pe-20 text-lg text-white" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 end-3 text-base text-teal-300">{showPassword ? "Hide" : "Show"}</button></div></label>
        {notice && <p role="alert" className="text-base text-rose-300">{notice}</p>}
        <button className="min-h-14 w-full rounded-xl bg-gradient-to-r from-teal-400 to-cyan-500 px-5 text-lg font-bold text-slate-950" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-base text-slate-300"><Link className="underline" href="/signup">Create account</Link><button type="button" className="underline" onClick={onFullSignIn}>Use the full sign-in</button></div>
    </div>
  </main>;
}
