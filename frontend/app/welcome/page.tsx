"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthFrame, actionClass, secondaryClass } from "@/components/auth/fields";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";
export default function Welcome() {
  const { session } = useAuth(); const { t } = useTranslate(); const [expired, setExpired] = useState(false);
  useEffect(() => { setExpired(new URLSearchParams(window.location.search).get("expired") === "patient"); }, []);
  return <AuthFrame title={expired ? "Please ask your caregiver for a new code" : "Welcome to CogniConnect"}>
    <p>{t(expired ? "Your memories are safe. Your caregiver can help you connect this device again." : "A little support for everyday memories.")}</p>
    <div className="flex flex-col gap-4">
      {session && <Link className={secondaryClass} href={session.role === "caregiver" ? "/caregiver" : "/"}>{t("Continue to Home")}</Link>}
      <div className="grid gap-4 sm:grid-cols-2"><Link className={`${actionClass} min-h-28 flex-col items-start justify-center`} href="/signup?mode=self"><span className="text-2xl">For myself</span><span className="text-base font-normal opacity-80">Create a self-care account</span></Link><Link className={`${secondaryClass} min-h-28 flex-col items-start justify-center`} href="/login"><span className="text-2xl">For someone I care for</span><span className="text-base font-normal opacity-80">Sign in as a caregiver</span></Link></div>
      <Link className="min-h-12 text-center text-lg text-primary underline" href="/pair">This device belongs to a patient: enter a pairing code</Link>
    </div>
  </AuthFrame>;
}
