"use client";

import { BrainCircuit } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { PinDialog } from "./caregiver";
import { ThemeToggle } from "./theme-toggle";
import { lockCaregiver, useCaregiver } from "@/lib/mode";

const PATIENT_LINKS = [
  { href: "/", label: "Home" },
  { href: "/today", label: "Today" },
  { href: "/explore", label: "My Memories" },
  { href: "/people", label: "My People" },
];

const CAREGIVER_LINKS = [
  { href: "/caregiver", label: "Home" },
  { href: "/progress", label: "Progress" },
  { href: "/upload", label: "Add Videos" },
  { href: "/people", label: "People" },
  { href: "/routine", label: "Daily Routine" },
  { href: "/games", label: "All Games" },
];

export default function Nav() {
  const [caregiver] = useCaregiver();
  const [pinOpen, setPinOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const links = caregiver ? CAREGIVER_LINKS : PATIENT_LINKS;

  return (
    <div className="fixed z-50 flex min-h-16 w-screen items-center justify-center border-b border-border bg-background">
      <nav className="flex w-full max-w-screen-lg flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2">
        <Link href={caregiver ? "/caregiver" : "/"}>
          <div className="flex items-center text-lg font-semibold">
            <BrainCircuit className="mr-2 h-6 w-6 text-primary" /> Cogni Connect
          </div>
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-lg font-medium">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`flex min-h-12 items-center ${
                pathname === l.href ? "text-primary underline underline-offset-8" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
          {caregiver ? (
            <button
              className="flex min-h-12 items-center rounded-md border border-border px-3 text-lg"
              onClick={() => {
                lockCaregiver();
                router.push("/");
              }}
            >
              Exit caregiver
            </button>
          ) : (
            <button
              className="flex min-h-12 items-center rounded-md border border-border px-3 text-lg text-muted-foreground"
              onClick={() => setPinOpen(true)}
            >
              Caregiver
            </button>
          )}
          <ThemeToggle />
        </div>
      </nav>
      <PinDialog open={pinOpen} onOpenChange={setPinOpen} onUnlocked={() => router.push("/caregiver")} />
    </div>
  );
}
