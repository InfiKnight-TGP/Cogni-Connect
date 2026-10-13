"use client";

import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/api";
import CaregiverPageLabel from "@/components/caregiver/pageLabel";
import { useEffect, useState } from "react";

const MAX_STEPS = 5;
const MIN_STEPS = 3;

export default function RoutinePage() {
  return (
    <>
      <Nav />
      <CaregiverOnly>
        <Routine />
      </CaregiverOnly>
    </>
  );
}

function Routine() {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/routine`)
      .then((r) => r.json())
      .then((d) => setSteps(d.steps?.length ? d.steps : ["", "", ""]))
      .catch(() => setStatus({ ok: false, text: "Could not load the routine. Is the backend running?" }));
  }, []);

  const filled = (steps ?? []).map((s) => s.trim()).filter(Boolean);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_URL}/routine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: filled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSteps(data.steps);
      setStatus({ ok: true, text: "Saved. Plan the Day will use these steps." });
    } catch (err) {
      setStatus({ ok: false, text: `Could not save: ${(err as Error).message || "server not reachable"}` });
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, value: string) => setSteps((s) => s!.map((x, j) => (j === i ? value : x)));
  const move = (i: number, by: number) =>
    setSteps((s) => {
      const next = [...s!];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-24 lg:pt-8">
      <div>
        <CaregiverPageLabel />
        <h1 className="text-3xl font-bold">Daily Routine</h1>
        <p className="mt-1 text-muted-foreground">
          Write {MIN_STEPS} to {MAX_STEPS} steps of the patient&apos;s own day, in order (for example &quot;Wake up&quot;,
          &quot;Have tea&quot;, &quot;Take tablets&quot;). Plan the Day mixes them up and asks the patient to put them back in
          order. Each step can be up to 40 letters.
        </p>
      </div>

      {steps && (
        <form onSubmit={save} className="space-y-3">
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-6 text-right font-semibold">{i + 1}.</span>
                <Input
                  value={step}
                  maxLength={40}
                  onChange={(e) => update(i, e.target.value)}
                  aria-label={`Step ${i + 1}`}
                  className="h-11 text-base"
                />
                <Button type="button" variant="outline" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`}>
                  ↑
                </Button>
                <Button type="button" variant="outline" size="icon" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`}>
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={steps.length <= MIN_STEPS}
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                  aria-label={`Remove step ${i + 1}`}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={steps.length >= MAX_STEPS} onClick={() => setSteps([...steps, ""])}>
              Add a step
            </Button>
            <Button type="submit" disabled={saving || filled.length < MIN_STEPS}>
              {saving ? "Saving…" : "Save routine"}
            </Button>
          </div>
        </form>
      )}
      {status && (
        <p role="status" className={`rounded-md p-3 ${status.ok ? "bg-green-600/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-600"}`}>
          {status.text}
        </p>
      )}
    </main>
  );
}
