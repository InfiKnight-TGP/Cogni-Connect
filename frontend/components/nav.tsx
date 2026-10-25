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
import React, { useEffect, useRef, useState } from "react";
import { PinDialog } from "./caregiver";
import { lockCaregiver, SHOW_DEVICE_CAREGIVER_ACCESS, useCaregiver } from "@/lib/mode";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAuth } from "@/lib/auth-context";
import { PUBLIC_ROUTES } from "@/lib/auth-session";

interface NavItem {
  href: string;
  label: string;
  short: string; // label for the phone tab bar
  icon: React.ComponentType<{ className?: string }>;
  color: string; // icon colour (works in light and dark mode)
}

const PATIENT_LINKS: NavItem[] = [
  { href: "/", label: "Home", short: "Home", icon: Home, color: "text-orange-500" },
  { href: "/today", label: "Today", short: "Today", icon: CalendarCheck, color: "text-green-600 dark:text-green-500" },
  { href: "/explore", label: "My Memories", short: "Memories", icon: ImageIcon, color: "text-sky-500" },
  { href: "/my-progress", label: "My Progress", short: "Progress", icon: Star, color: "text-amber-500" },
  { href: "/people", label: "My People", short: "People", icon: Users2, color: "text-pink-500" },
];

const SELF_LINKS: NavItem[] = [
  ...PATIENT_LINKS,
  { href: "/games", label: "All Games", short: "Games", icon: Gamepad2, color: "text-amber-500" },
  { href: "/routine", label: "Daily Routine", short: "Routine", icon: CalendarDays, color: "text-teal-500" },
];

const CAREGIVER_LINKS: NavItem[] = [
  { href: "/caregiver", label: "Home", short: "Home", icon: Home, color: "text-orange-500" },
  { href: "/progress", label: "Progress & Reports", short: "Progress", icon: TrendingUp, color: "text-green-600 dark:text-green-500" },
  { href: "/upload", label: "Add Videos", short: "Videos", icon: Upload, color: "text-violet-500" },
  { href: "/people", label: "People", short: "People", icon: Users2, color: "text-pink-500" },
  { href: "/routine", label: "Daily Routine", short: "Routine", icon: CalendarDays, color: "text-teal-500" },
  { href: "/games", label: "All Games", short: "Games", icon: Gamepad2, color: "text-amber-500" },
];

export type NavAccount = "caregiver" | "self" | "patient_device";

/** Navigation is intentionally explicit so device sessions remain unchanged while self-care gets its own tools. */
export function navFor(account: NavAccount): NavItem[] {
  if (account === "caregiver") return CAREGIVER_LINKS;
  if (account === "self") return SELF_LINKS;
  return PATIENT_LINKS;
}

/** Duolingo-style "LEARN" highlight: rounded border + tint on the active item. */
const itemClass = (active: boolean) =>
  `flex min-h-14 w-full items-center gap-4 rounded-2xl border-2 px-4 py-2 text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50 ${
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-transparent text-foreground hover:bg-muted"
  }`;

export default function Nav() {
  const [caregiver] = useCaregiver();
  const { t } = useTranslate();
  const [pinOpen, setPinOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { session, selectPatient } = useAuth();
  const [notice, setNotice] = useState("");
  const [switching, setSwitching] = useState(false);
  const account: NavAccount = caregiver ? "caregiver" : session?.role === "self" ? "self" : "patient_device";
  const links = navFor(account);
  const selfCare = account === "self";
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);
  const hadMoreOpen = useRef(false);
  useEffect(() => {
    if (moreOpen) {
      hadMoreOpen.current = true;
      const first = moreSheetRef.current?.querySelector<HTMLElement>("button, a");
      first?.focus();
    } else if (hadMoreOpen.current) {
      hadMoreOpen.current = false;
      moreButtonRef.current?.focus();
    }
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMoreOpen(false); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);
  const isActive = (href: string) => pathname === href;

  const showDeviceCaregiver = session?.role === "patient_device" && SHOW_DEVICE_CAREGIVER_ACCESS;
  const isDeviceCaregiver = caregiver && session?.role === "patient_device";
  const modeButton = isDeviceCaregiver
    ? {
        label: t("Exit caregiver"),
        short: t("Exit"),
        icon: LogOut,
        onClick: () => {
          lockCaregiver();
        },
      }
    : !caregiver && showDeviceCaregiver
      ? { label: t("Caregiver"), short: t("Caregiver"), icon: Lock, onClick: () => setPinOpen(true) }
      : null;
  const ModeIcon = modeButton?.icon;
  const switcher = session?.role === "caregiver" && session.patients.length > 1 ? <label className="block text-sm font-semibold">Patient<select aria-label="Active patient" className="mt-1 min-h-12 w-full rounded-xl border bg-background px-2 text-lg" value={session.activePatient?.id ?? ""} disabled={switching} onChange={event => {
    setSwitching(true); setNotice(""); void selectPatient(event.target.value).catch(error => { setNotice(error.message); setSwitching(false); });
  }}>{session.patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></label> : null;
  if (PUBLIC_ROUTES.has(pathname)) return <header className="p-4"><Link className="inline-flex min-h-12 items-center text-xl font-bold text-primary" href={session ? session.role === "caregiver" ? "/caregiver" : "/" : "/welcome"}>CogniConnect</Link></header>;

  return (
    <>
      {/* Phone: slim top bar with the logo */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-border bg-background px-4 print:hidden lg:hidden">
        <Link href={caregiver ? "/caregiver" : "/"} className="flex min-h-12 items-center text-xl font-bold">
          <BrainCircuit className="me-2 h-7 w-7 text-primary" /> Cogni Connect
        </Link>
      </header>
      {switcher && <div className="fixed inset-x-0 top-16 z-40 border-b bg-background px-4 pb-2 lg:hidden">{switcher}</div>}
      {switcher && <div className="h-20 lg:hidden" />}
      {notice && <p role="alert" className="fixed left-4 top-20 z-50 rounded-xl bg-background p-4 shadow-lg">{notice}</p>}

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
        {switcher && <div className="mb-4">{switcher}</div>}
        <nav className="flex flex-1 flex-col gap-2" aria-label={t("Main")}>
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
                <span className="min-w-0 break-words">{t(l.label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {!caregiver && <Link href="/settings" aria-current={isActive("/settings") ? "page" : undefined} className={itemClass(isActive("/settings"))}><Settings className="h-8 w-8 shrink-0 text-muted-foreground" /><span>{t("Settings")}</span></Link>}
          {caregiver && <Link href="/caregiver/settings" aria-current={isActive("/caregiver/settings") ? "page" : undefined} className={itemClass(isActive("/caregiver/settings"))}><Settings className="h-8 w-8 shrink-0 text-muted-foreground" /><span>{t("Settings")}</span></Link>}
          {modeButton && <button type="button" className={itemClass(false)} onClick={modeButton.onClick}>
            {ModeIcon && <ModeIcon className="h-8 w-8 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 break-words">{modeButton.label}</span>
          </button>}
        </div>
      </aside>

      {/* Phone: bottom tab bar (scrolls sideways if there are many items) */}
      <nav
        aria-label={t("Main")}
        className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t-2 border-border bg-background print:hidden lg:hidden"
      >
        {(selfCare ? links.slice(0, 4) : links).map((l) => {
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
              <span className="max-w-full whitespace-nowrap">{t(l.short)}</span>
            </Link>
          );
        })}
        {selfCare && <button
          ref={moreButtonRef}
          type="button"
          aria-label={t("More navigation")}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-base font-semibold ${moreOpen ? "border-primary text-primary" : "border-transparent text-foreground"}`}
        ><Settings className="h-7 w-7" /><span className="whitespace-nowrap">{t("More")}</span></button>}
        {!caregiver && !selfCare && <Link href="/settings" aria-current={isActive("/settings") ? "page" : undefined} className={`flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-base font-semibold ${isActive("/settings") ? "border-primary text-primary" : "border-transparent text-foreground"}`}><Settings className="h-7 w-7" /><span className="whitespace-nowrap">{t("Settings")}</span></Link>}
        {caregiver && <Link href="/caregiver/settings" aria-current={isActive("/caregiver/settings") ? "page" : undefined} className={`flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-base font-semibold ${isActive("/caregiver/settings") ? "border-primary text-primary" : "border-transparent text-foreground"}`}><Settings className="h-7 w-7" /><span className="whitespace-nowrap">{t("Settings")}</span></Link>}
        {modeButton && <button
          type="button"
          onClick={modeButton.onClick}
          className="flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 border-t-4 border-transparent px-1 text-base font-semibold text-muted-foreground"
        >
          {ModeIcon && <ModeIcon className="h-7 w-7" />}
          <span className="whitespace-nowrap">{modeButton.short}</span>
        </button>}
      </nav>

      <PinDialog open={pinOpen} onOpenChange={setPinOpen} onUnlocked={() => router.push("/caregiver")} />
      {selfCare && moreOpen && <div className="fixed inset-0 z-50 lg:hidden" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}>
        <div ref={moreSheetRef} role="dialog" aria-modal="true" aria-labelledby="more-navigation-title" className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t-2 border-border bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
          <h2 id="more-navigation-title" className="mb-3 text-2xl font-bold">{t("More")}</h2>
          <div className="grid gap-2">
            {links.slice(4).map((l) => { const Icon = l.icon; return <Link key={l.href} href={l.href} onClick={() => setMoreOpen(false)} className={itemClass(isActive(l.href))}><Icon className={`h-8 w-8 shrink-0 ${l.color}`} /><span>{t(l.label)}</span></Link>; })}
            <Link href="/settings" onClick={() => setMoreOpen(false)} className={itemClass(isActive("/settings"))}><Settings className="h-8 w-8 shrink-0 text-muted-foreground" /><span>{t("Settings")}</span></Link>
          </div>
        </div>
      </div>}
    </>
  );
}
