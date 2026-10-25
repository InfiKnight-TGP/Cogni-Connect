"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";

export default function SignOutButton() {
  const { logout } = useAuth();
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const hadOpen = useRef(false);

  useEffect(() => {
    if (open) {
      hadOpen.current = true;
      cancelButtonRef.current?.focus();
    } else if (hadOpen.current) {
      hadOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleSignOut = async () => {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch {
      setError(t("Could not sign out. Please try again."));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="min-h-14 rounded-xl border-2 border-border bg-card px-6 py-3 text-lg font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50 disabled:opacity-50"
      >
        {t("Sign out")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-out-dialog-title"
            className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-2xl text-foreground"
          >
            <h3 id="sign-out-dialog-title" className="text-2xl font-bold">
              {t("Sign out of CogniConnect?")}
            </h3>

            {error && (
              <p role="alert" className="text-base text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                ref={cancelButtonRef}
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="min-h-14 min-w-[7rem] rounded-xl border-2 border-border bg-muted px-6 py-3 text-lg font-semibold text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSignOut()}
                className="min-h-14 min-w-[7rem] rounded-xl bg-destructive px-6 py-3 text-lg font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/50 disabled:opacity-50"
              >
                {busy ? t("Signing out…") : t("Sign out")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
