"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unlockCaregiver, useCaregiver } from "@/lib/mode";
import { useState } from "react";

function PinForm({ onUnlocked }: { onUnlocked?: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    const result = await unlockCaregiver(pin);
    setChecking(false);
    if (result === "ok") return onUnlocked?.();
    setPin("");
    setError(result === "wrong" ? "That PIN is not right. Please try again." : "Could not reach the server.");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">4-digit PIN</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4}"
          maxLength={4}
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError("");
          }}
          className="h-14 w-full rounded-md border border-input bg-background px-4 text-center text-3xl tracking-[0.5em]"
          aria-invalid={!!error}
          aria-describedby="pin-error"
        />
      </label>
      <p id="pin-error" role="alert" className="min-h-[1.25rem] text-sm text-red-600">
        {error}
      </p>
      <Button type="submit" className="h-12 w-full text-lg" disabled={pin.length !== 4 || checking}>
        {checking ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}

export function PinDialog({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Caregiver mode</DialogTitle>
          <DialogDescription>Enter the caregiver PIN to see progress and settings.</DialogDescription>
        </DialogHeader>
        <PinForm
          onUnlocked={() => {
            onOpenChange(false);
            onUnlocked?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Shows the page only in caregiver mode; otherwise asks for the PIN in place. */
export function CaregiverOnly({ children }: { children: React.ReactNode }) {
  const [caregiver, ready] = useCaregiver();
  if (!ready) return null;
  if (caregiver) return <>{children}</>;
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 pt-32">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">This page is for caregivers</h1>
        <p className="text-muted-foreground">Enter the caregiver PIN to continue.</p>
      </div>
      <PinForm />
    </main>
  );
}
