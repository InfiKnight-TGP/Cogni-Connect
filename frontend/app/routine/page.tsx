"use client";

import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, API_URL } from "@/lib/api";
import CaregiverPageLabel from "@/components/caregiver/pageLabel";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import DictationButton from "@/components/interaction/DictationButton";
import ReadAloud from "@/components/interaction/ReadAloud";
import Link from "next/link";

const MAX_STEPS = 5;
const MIN_STEPS = 3;

export default function RoutinePage() {
  const { session, ready } = useAuth();
  return (
    <>
      <Nav />
      {ready && session?.role === "self" ? <SelfRoutine /> : <CaregiverOnly><Routine /></CaregiverOnly>}
    </>
  );
}

const ROUTINE_SUGGESTIONS = ["Wake up", "Brush teeth", "Bath", "Pooja", "Tea", "Breakfast", "Walk", "Lunch", "Rest", "Call family"];

function SelfRoutine() {
  const { t } = useTranslate();
  const [steps, setSteps] = useState<string[]>(["", "", ""]);
  const [saved, setSaved] = useState<string[]>(["", "", ""]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(steps) !== JSON.stringify(saved);

  useEffect(() => {
    apiFetch(`${API_URL}/routine`).then(async response => {
      if (!response.ok) throw new Error(t("Could not load the routine. Is the backend running?"));
      const data = await response.json();
      const next = Array.isArray(data.steps) && data.steps.length ? data.steps : ["", "", ""];
      setSteps(next); setSaved(next);
    }).catch(error => setStatus({ ok: false, text: error instanceof Error ? error.message : t("Could not load the routine. Is the backend running?") })).finally(() => setLoading(false));
  }, [t]);

  const update = (index: number, value: string) => setSteps(current => current.map((step, i) => i === index ? value : step));
  const move = (index: number, by: number) => setSteps(current => { const next = [...current]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next; });
  const remove = (index: number) => setSteps(current => current.length <= MIN_STEPS ? current : current.filter((_, i) => i !== index));
  const addSuggestion = (suggestion: string) => setSteps(current => { const index = current.findIndex(step => !step.trim()); return index < 0 ? current : current.map((step, i) => i === index ? suggestion : step); });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const filled = steps.map(step => step.trim());
    if (filled.length < MIN_STEPS || filled.length > MAX_STEPS || filled.some(step => !step || step.length > 40)) {
      setStatus({ ok: false, text: t("Add 3 to 5 steps. Each step must be 1 to 40 characters.") }); return;
    }
    setSaving(true); setStatus(null);
    try {
      const response = await apiFetch(`${API_URL}/routine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: filled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("Could not save. Please try again."));
      setSteps(data.steps); setSaved(data.steps); setStatus({ ok: true, text: t("Saved. Plan the Day will use these steps.") });
    } catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : t("Could not save. Please try again.") }); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="mx-auto max-w-2xl px-4 pb-16 pt-24 lg:pt-8"><p className="text-xl" role="status">{t("Loading…")}</p></main>;
  return <main className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-24 lg:pt-8">
    <header><h1 className="text-4xl font-bold">{t("My Daily Routine")}</h1><p className="mt-2 text-xl text-muted-foreground">{t("Set the steps you follow each day.")}</p><ReadAloud autoRead={false} text={`${t("My Daily Routine")}. ${t("Set the steps you follow each day.")}`} /></header>
    {dirty && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-lg" role="status">{t("You have unsaved changes.")}</p>}
    <form onSubmit={save} className="space-y-4">
      <ol className="space-y-3">{steps.map((step, index) => <li key={index} className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3"><span className="w-7 text-right text-lg font-bold">{index + 1}.</span><Input value={step} maxLength={40} onChange={event => update(index, event.target.value)} aria-label={t("Step {number}", { number: index + 1 })} className="min-h-12 text-lg" /></div>
        <div className="mt-3 flex flex-wrap gap-2"><DictationButton value={step} onText={text => update(index, text)} alwaysVisible /><Button type="button" variant="outline" className="min-h-12" disabled={index === 0} onClick={() => move(index, -1)}>{t("Move up")}</Button><Button type="button" variant="outline" className="min-h-12" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>{t("Move down")}</Button><Button type="button" variant="outline" className="min-h-12" disabled={steps.length <= MIN_STEPS} onClick={() => remove(index)}>{t("Remove")}</Button></div>
      </li>)}</ol>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-12" disabled={steps.length >= MAX_STEPS} onClick={() => setSteps(current => [...current, ""])}>{t("Add a step")}</Button><Button type="submit" className="min-h-12 text-lg" disabled={saving}>{saving ? t("Saving…") : t("Save routine")}</Button></div>
    </form>
    <section className="space-y-3"><h2 className="text-xl font-bold">{t("Quick add")}</h2><div className="flex flex-wrap gap-2">{ROUTINE_SUGGESTIONS.map(suggestion => <Button key={suggestion} type="button" variant="outline" className="min-h-12" disabled={!steps.some(step => !step.trim())} onClick={() => addSuggestion(suggestion)}>{t(suggestion)}</Button>)}</div></section>
    <p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-lg">{t("Plan the Day will use these steps")}</p>
    <Link href="/games?game=plan-the-day" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-lg font-semibold text-primary-foreground">{t("Try Plan the Day")}</Link>
    {status && <p role={status.ok ? "status" : "alert"} className={`rounded-xl p-4 text-lg ${status.ok ? "bg-green-600/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-600"}`}>{status.text}</p>}
  </main>;
}

function Routine() {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`${API_URL}/routine`)
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
      const res = await apiFetch(`${API_URL}/routine`, {
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
