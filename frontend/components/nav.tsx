"use client";

import {
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  Gamepad2,
  Home,
  Image as ImageIcon,
  Lock,
  LogOut,
  Star,
  Settings,
  TrendingUp,
  Upload,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import { PinDialog } from "./caregiver";
import { lockCaregiver, useCaregiver } from "@/lib/mode";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { translate } from "@/lib/interaction/locale";

interface NavItem {
  href: string;
  label: string;
  short: string; // label for the phone tab bar
  icon: React.ComponentType<{ className?: string }>;
  color: string; // icon colour (works in light and dark mode)
}

const PATIENT_LINKS: NavItem[] = [
  { href: "/play", label: "Play", short: "Play", icon: Gamepad2, color: "text-amber-500" },
  { href: "/support", label: "My Support", short: "Support", icon: CalendarCheck, color: "text-teal-600" },
  { href: "/", label: "Home", short: "Home", icon: Home, color: "text-orange-500" },
  { href: "/today", label: "Today", short: "Today", icon: CalendarCheck, color: "text-green-600 dark:text-green-500" },
  { href: "/explore", label: "My Memories", short: "Memories", icon: ImageIcon, color: "text-sky-500" },
  { href: "/my-progress", label: "My Progress", short: "Progress", icon: Star, color: "text-amber-500" },
  { href: "/people", label: "My People", short: "People", icon: Users2, color: "text-pink-500" },
];

const CAREGIVER_LINKS: NavItem[] = [
  { href: "/support", label: "Support Accounts", short: "Support", icon: CalendarCheck, color: "text-teal-600" },
  { href: "/caregiver", label: "Home", short: "Home", icon: Home, color: "text-orange-500" },
  { href: "/progress", label: "Progress & Reports", short: "Progress", icon: TrendingUp, color: "text-green-600 dark:text-green-500" },
  { href: "/upload", label: "Add Videos", short: "Videos", icon: Upload, color: "text-violet-500" },
  { href: "/people", label: "People", short: "People", icon: Users2, color: "text-pink-500" },
  { href: "/routine", label: "Daily Routine", short: "Routine", icon: CalendarDays, color: "text-teal-500" },
  { href: "/games", label: "All Games", short: "Games", icon: Gamepad2, color: "text-amber-500" },
];

/** Duolingo-style "LEARN" highlight: rounded border + tint on the active item. */
const itemClass = (active: boolean) =>
  `flex min-h-14 w-full items-center gap-4 rounded-2xl border-2 px-4 py-2 text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50 ${
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-transparent text-foreground hover:bg-muted"
  }`;

export default function Nav() {
  const [caregiver] = useCaregiver();
  const { locale } = useInteraction();
  const tr = (phrase: string) => translate(locale, phrase);
  const [pinOpen, setPinOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const links = caregiver ? CAREGIVER_LINKS : PATIENT_LINKS;
  const isActive = (href: string) => pathname === href;

  const modeButton = caregiver
    ? {
        label: "Exit caregiver",
        short: "Exit",
        icon: LogOut,
        onClick: () => {
          lockCaregiver();
          router.push("/");
        },
      }
    : { label: tr("Caregiver"), short: tr("Caregiver"), icon: Lock, onClick: () => setPinOpen(true) };
  const ModeIcon = modeButton.icon;

  return (
    <>
      {/* Phone: slim top bar with the logo */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-border bg-background px-4 print:hidden lg:hidden">
        <Link href={caregiver ? "/caregiver" : "/"} className="flex min-h-12 items-center text-xl font-bold">
          <BrainCircuit className="me-2 h-7 w-7 text-primary" /> Cogni Connect
        </Link>
      </header>

      {/* Desktop: left sidebar */}
      <aside
        data-app-shell
        className="fixed inset-y-0 start-0 z-40 hidden w-[260px] flex-col border-e-2 border-border bg-background px-4 py-6 print:hidden lg:flex"
      >
        <Link
          href={caregiver ? "/caregiver" : "/"}
          className="mb-6 flex min-h-12 items-center px-3 text-2xl font-bold text-primary"
        >
          <BrainCircuit className="me-2 h-8 w-8" /> Cogni Connect
        </Link>
        <nav className="flex flex-1 flex-col gap-2" aria-label="Main">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={itemClass(isActive(l.href))}
              >
                <Icon className={`h-8 w-8 shrink-0 ${l.color}`} />
                <span>{caregiver ? l.label : tr(l.label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {caregiver && <Link href="/caregiver/settings" aria-current={isActive("/caregiver/settings") ? "page" : undefined} className={itemClass(isActive("/caregiver/settings"))}><Settings className="h-8 w-8 shrink-0 text-muted-foreground" /><span>Settings</span></Link>}
          <button type="button" className={itemClass(false)} onClick={modeButton.onClick}>
            <ModeIcon className="h-8 w-8 shrink-0 text-muted-foreground" />
            <span>{modeButton.label}</span>
          </button>
        </div>
      </aside>

      {/* Phone: bottom tab bar (scrolls sideways if there are many items) */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t-2 border-border bg-background print:hidden lg:hidden"
      >
        {links.map((l) => {
          const Icon = l.icon;
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-base font-semibold ${
                active ? "border-primary text-primary" : "border-transparent text-foreground"
              }`}
            >
              <Icon className={`h-7 w-7 ${l.color}`} />
              <span className="whitespace-nowrap">{caregiver ? l.short : tr(l.short)}</span>
            </Link>
          );
        })}
        {caregiver && <Link href="/caregiver/settings" aria-current={isActive("/caregiver/settings") ? "page" : undefined} className={`flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-base font-semibold ${isActive("/caregiver/settings") ? "border-primary text-primary" : "border-transparent text-foreground"}`}><Settings className="h-7 w-7" /><span className="whitespace-nowrap">Settings</span></Link>}
        <button
          type="button"
          onClick={modeButton.onClick}
          className="flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 border-transparent px-1 text-base font-semibold text-muted-foreground"
        >
          <ModeIcon className="h-7 w-7" />
          <span className="whitespace-nowrap">{modeButton.short}</span>
        </button>
      </nav>

      <PinDialog open={pinOpen} onOpenChange={setPinOpen} onUnlocked={() => router.push("/caregiver")} />
      <div className="fixed bottom-20 left-3 z-40 max-w-xs rounded-xl bg-background p-2 print:hidden lg:bottom-0"><VoiceQuestion auto={false} prompt={tr("Where would you like to go?")} options={links.map(link => ({ id: link.href, label: caregiver ? link.label : tr(link.label) }))} onAnswer={href => router.push(href)} /></div>
    </>
  );
}
