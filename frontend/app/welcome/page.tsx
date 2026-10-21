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
      <Link className={actionClass} href="/login">{t("I'm a caregiver")}</Link>
      <Link className={secondaryClass} href="/pair">{t("Set up this device for a patient")}</Link>
    </div>
  </AuthFrame>;
}
