"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountForm from "@/components/auth/account-form";
import { AuthFrame, actionClass, secondaryClass } from "@/components/auth/fields";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";

type Tab = "signin" | "signup";
const safeNext = (value: string | null) => value && value.startsWith("/") && !value.startsWith("//") && !/[\\]/.test(value) && !/^https?:/i.test(value) ? value : null;

export default function Welcome() {
  const { session } = useAuth(); const { t } = useTranslate(); const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin"); const [expired, setExpired] = useState(false); const [resetDone, setResetDone] = useState(false); const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search); const requested = query.get("tab");
    setTab(requested === "signup" ? "signup" : "signin"); setExpired(query.get("expired") === "patient"); setResetDone(query.get("reset") === "done");
    if (session) router.replace(safeNext(query.get("next")) ?? (session.role === "caregiver" ? "/caregiver" : "/"));
  }, [router, session]);
  const selectTab = (next: Tab) => { setTab(next); const query = new URLSearchParams(window.location.search); query.set("tab", next); router.replace(`/welcome?${query.toString()}`, { scroll: false }); };
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => { const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? (index + 1) % 2 : -1; if (next >= 0) { event.preventDefault(); selectTab(next === 0 ? "signin" : "signup"); tabRefs.current[next]?.focus(); } };
  return <AuthFrame title="Welcome to CogniConnect">
    <p>{t("A little support for everyday memories.")}</p>
    {expired && <p role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">{t("Please ask your caregiver for a new code")}</p>}
    {resetDone && <p role="status" className="rounded-xl border border-primary/40 bg-primary/10 p-4">{t("Your password was changed. Please sign in again.")}</p>}
    <div role="tablist" aria-label={t("Account access")} className="grid grid-cols-2 rounded-xl border-2 border-border p-1">
      {(["signin", "signup"] as const).map((value, index) => <button key={value} ref={element => { tabRefs.current[index] = element; }} role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} onKeyDown={event => onTabKey(event, index)} className={`min-h-14 rounded-lg px-4 text-xl font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 ${tab === value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>{t(value === "signin" ? "Sign in" : "Sign up")}</button>)}
    </div>
    {tab === "signin" ? <AccountForm kind="login" embedded /> : <div role="tabpanel" aria-label={t("Sign up")} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Link href="/signup?mode=self" className={`${actionClass} min-h-36 flex-col items-start justify-center text-left`}><span className="text-2xl">👤 {t("For myself")}</span><span className="text-lg font-normal">{t("Use the app on my own.")}</span></Link><Link href="/signup?mode=caregiver" className={`${secondaryClass} min-h-36 flex-col items-start justify-center text-left`}><span className="text-2xl">🤝 {t("For someone I care for")}</span><span className="text-lg font-normal">{t("Set up and support another person.")}</span></Link></div></div>}
    <div className="flex items-center gap-4 py-2 text-lg text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{t("or")}</span><span className="h-px flex-1 bg-border" /></div>
    <Link className={`${actionClass} min-h-16 w-full text-center`} href="/pair">{t("This device belongs to a patient: enter a pairing code")}</Link>
    <p className="text-center text-lg text-muted-foreground">{t("No account needed. Ask your caregiver for the code.")}</p>
  </AuthFrame>;
}
