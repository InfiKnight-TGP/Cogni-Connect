"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslate } from "@/components/interaction/InteractionProvider";

export const fieldClass = "mt-2 min-h-14 w-full rounded-xl border-2 border-input bg-background px-4 text-xl focus:outline-none focus:ring-4 focus:ring-primary/30";
export const actionClass = "inline-flex min-h-14 items-center justify-center rounded-xl bg-primary px-6 py-3 text-xl font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:opacity-50";
export const secondaryClass = "inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-border px-5 py-2 text-lg font-semibold focus-visible:ring-4 focus-visible:ring-primary/40 disabled:opacity-50";

export function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslate();
  return <main className="mx-auto min-h-[70vh] max-w-xl space-y-7 px-5 py-10 sm:py-16">
    <Link href="/welcome" className="inline-flex min-h-12 items-center text-2xl font-bold text-primary">CogniConnect</Link>
    <h1 className="text-4xl font-bold leading-tight">{t(title)}</h1>
    <div className="space-y-6 text-xl">{children}</div>
  </main>;
}
export function PasswordField({ label = "Password", value, onChange, current = false }: {
  label?: string; value: string; onChange: (value: string) => void; current?: boolean;
}) {
  const [show, setShow] = useState(false); const { t } = useTranslate();
  return <div><label className="block font-medium">{t(label)}<input required minLength={current ? undefined : 8} maxLength={1024}
    type={show ? "text" : "password"} autoComplete={current ? "current-password" : "new-password"}
    className={fieldClass} value={value} onChange={event => onChange(event.target.value)} /></label>
    <button type="button" aria-pressed={show} className="min-h-12 text-lg text-primary underline" onClick={() => setShow(!show)}>{t(show ? "Hide password" : "Show password")}</button>
  </div>;
}
export function CodeInput({ value, onChange, length, label }: { value: string; onChange: (value: string) => void; length: 6 | 8; label: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const clean = (text: string) => text.toUpperCase().replace(length === 6 ? /[^0-9]/g : /[^A-Z2-9]/g, "").slice(0, length);
  const update = (index: number, text: string) => {
    const input = clean(text);
    const next = input.length > 1 ? input : value.slice(0, index) + input + value.slice(index + 1);
    onChange(next.slice(0, length));
    refs.current[Math.min(input.length > 1 ? input.length : index + 1, length - 1)]?.focus();
  };
  return <fieldset className="min-w-0 w-full space-y-3"><legend className="font-medium">{label}</legend>
    <div className={`grid w-full min-w-0 ${length === 6 ? "grid-cols-6" : "grid-cols-8"} gap-1 sm:gap-2`} onPaste={event => { event.preventDefault(); const text = clean(event.clipboardData.getData("text")); onChange(text); refs.current[Math.min(text.length, length - 1)]?.focus(); }}>
      {Array.from({ length }, (_, index) => <input key={index} ref={element => { refs.current[index] = element; }}
        aria-label={`${label}, ${index + 1} of ${length}`} className="h-12 w-full min-w-0 rounded-lg border-2 border-input bg-background px-0 text-center text-xl font-bold focus:outline-none focus:ring-4 focus:ring-primary/30 sm:h-16 sm:text-3xl"
        inputMode={length === 6 ? "numeric" : "text"} autoComplete={index === 0 ? "one-time-code" : "off"} autoCapitalize="characters" spellCheck={false}
        value={value[index] ?? ""} maxLength={length} onFocus={event => event.target.select()}
        onChange={event => update(index, event.target.value)} onKeyDown={event => {
          if (event.key === "Backspace") { event.preventDefault(); onChange(value.slice(0, Math.max(0, value[index] ? index : index - 1))); refs.current[Math.max(0, index - 1)]?.focus(); }
          if (event.key === "ArrowLeft") refs.current[Math.max(0, index - 1)]?.focus();
          if (event.key === "ArrowRight") refs.current[Math.min(length - 1, index + 1)]?.focus();
        }} />)}
    </div>
  </fieldset>;
}
export function Notice({ children }: { children: React.ReactNode }) {
  return <p role="status" aria-live="polite" className="min-h-7 text-lg">{children}</p>;
}
