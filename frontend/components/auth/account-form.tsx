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
export default function AccountForm({ kind }: { kind: Kind }) {
  const { t } = useTranslate(); const router = useRouter(); const { refresh } = useAuth();
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const verification = kind === "verify" || kind === "reset";
  useEffect(() => {
    if (verification) setChallenge(sessionStorage.getItem(`cogni-${kind}-challenge`) ?? "");
  }, [kind, verification]);
  const continueLogin = async () => {
    const session = await refresh();
    if (!session) throw new Error("Could not load your account. Please try again.");
    if (!session.activePatient) { router.replace("/setup"); return; }
    const result = await apiJSON<{ devices: unknown[] }>(`/pair/devices?patient_id=${encodeURIComponent(session.activePatient.id)}`);
    router.replace(result.devices.length ? "/caregiver" : "/setup");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const path = kind === "verify" ? "/auth/otp/verify" : `/auth/${kind}`;
      const data = await apiJSON<{ challenge?: string; requiresCode?: boolean }>(path, {
        ...jsonBody(verification ? { challenge, code, password } : { email, name, password }), authRedirect: false,
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
  return <AuthFrame title={titles[kind]}>
    {verification && <p>{t("Enter the six-digit code from your email. It is valid for five minutes.")}</p>}
    {kind === "forgot" && <p>{t("If an account exists for this email, we will send a reset code.")}</p>}
    <form onSubmit={submit} className="space-y-5">
      {kind === "signup" && <label className="block">{t("Your name")}<input required maxLength={100} autoComplete="name" className={fieldClass} value={name} onChange={e => setName(e.target.value)} /></label>}
      {!verification && <label className="block">{t("Email")}<input required type="email" maxLength={200} autoComplete="email" className={fieldClass} value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {verification && <CodeInput length={6} label={t("Email code")} value={code} onChange={setCode} />}
      {kind !== "forgot" && kind !== "verify" && <PasswordField value={password} onChange={setPassword} current={kind === "login"} />}
      {(kind === "signup" || kind === "reset") && <p className="text-lg">{t("Use at least eight characters.")}</p>}
      <Notice>{t(notice)}</Notice>
      <button className={`${actionClass} w-full`} disabled={busy || (verification && (!challenge || code.length !== 6))}>{t(busy ? "Please wait…" : kind === "forgot" ? "Send reset code" : kind === "reset" ? "Save new password" : "Continue")}</button>
    </form>
    {verification && <><button type="button" className={secondaryClass} disabled={busy || !challenge} onClick={() => void resend()}>{t("Send a new code")}</button><p className="text-lg">{t("Code expired?")} <Link className="text-primary underline" href={kind === "reset" ? "/forgot" : "/login"}>{t("Start again")}</Link></p></>}
    {kind === "login" && <div className="flex flex-wrap gap-6 text-lg"><Link className="min-h-12 text-primary underline" href="/signup">{t("Create an account")}</Link><Link className="min-h-12 text-primary underline" href="/forgot">{t("Forgot password?")}</Link></div>}
    {kind === "signup" && <Link className="inline-flex min-h-12 items-center text-primary underline" href="/login">{t("Already have an account? Sign in")}</Link>}
  </AuthFrame>;
}
