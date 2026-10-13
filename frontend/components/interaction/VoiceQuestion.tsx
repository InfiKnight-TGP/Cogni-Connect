"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { useInteraction } from "./InteractionProvider";
import { BrowserSpeechProvider, SpeechError } from "@/lib/interaction/speech";
import { matchAnswer, type AnswerOption } from "@/lib/interaction/matching";

export type AnswerInput = { method: "tap" | "typed" | "voice"; responseMs: number | null; recognitionConfirmed?: boolean };
export default function VoiceQuestion({ prompt, options, onAnswer, disabled = false, auto = true, freeText = false }: {
  prompt: string; options: AnswerOption[]; onAnswer: (id: string, input: AnswerInput) => void; disabled?: boolean; auto?: boolean; freeText?: boolean;
}) {
  const { preferences, locale, ready, voiceFallback, fallback } = useInteraction();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState("");
  const [candidate, setCandidate] = useState<{ option: AnswerOption; responseMs: number | null } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const provider = useRef(new BrowserSpeechProvider());
  const current = useRef({ options, onAnswer, disabled });
  current.current = { options, onAnswer, disabled };
  const confirmCandidate = () => {
    if (!candidate || current.current.disabled) return;
    controller.current?.abort(); provider.current.cancel(); setBusy(false); setStatus("");
    if (candidate.option.id === "__sos") window.dispatchEvent(new Event("cogni:sos"));
    else current.current.onAnswer(candidate.option.id, { method: "voice", responseMs: candidate.responseMs, recognitionConfirmed: true });
    setCandidate(null);
  };
  const confirmByVoice = async () => {
    if (!candidate) return;
    controller.current?.abort();
    const control = new AbortController(); controller.current = control; setBusy(true);
    try {
      setStatus(locale.speaking);
      await provider.current.speak(`${locale.confirm} ${candidate.option.label}? ${locale.yes}, ${locale.no}`, locale.speechLanguage, control.signal);
      setStatus(locale.listening);
      const result = await provider.current.listen(locale.speechLanguage, control.signal);
      const match = matchAnswer(result.text, [{ id: "yes", label: locale.yes }, { id: "no", label: locale.no }], result.confidence);
      if (!control.signal.aborted && match.kind === "accept") {
        if (match.option.id === "yes") confirmCandidate();
        else { setCandidate(null); setStatus(locale.retry); }
      } else setStatus(locale.retry);
    } catch { if (!control.signal.aborted) setStatus(locale.retry); }
    finally { if (!control.signal.aborted) setBusy(false); }
  };
  const speak = async (listen: boolean) => {
    controller.current?.abort();
    const control = new AbortController(); controller.current = control;
    setCandidate(null); setHeard(""); setBusy(true);
    try {
      for (let attempt = 0; attempt < (listen ? 2 : 1); attempt++) {
        setStatus(locale.speaking);
        const endedAt = await provider.current.speak(attempt ? `${locale.retry} ${prompt}` : prompt, locale.speechLanguage, control.signal);
        if (!listen) { setStatus(""); break; }
        setStatus(locale.listening);
        try {
          const result = await provider.current.listen(locale.speechLanguage, control.signal);
          if (control.signal.aborted || current.current.disabled) return;
          setHeard(result.text);
          const choices = current.current.options.map(option => ({ ...option, synonyms: [...(option.synonyms ?? []), ...(locale.synonyms[option.label] ?? [])] }));
          choices.push({ id: "__sos", label: "Help", synonyms: locale.help });
          const match = matchAnswer(result.text, choices, result.confidence);
          const responseMs = result.speechStartedAt === null ? null : Math.max(0, result.speechStartedAt - endedAt);
          if (match.kind === "accept") { if (match.option.id === "__sos") window.dispatchEvent(new Event("cogni:sos")); else current.current.onAnswer(match.option.id, { method: "voice", responseMs }); setStatus(""); break; }
          if (match.kind === "confirm") { setCandidate({ option: match.option, responseMs }); setStatus(""); break; }
          if (freeText && result.text.trim()) { setCandidate({ option: { id: result.text, label: result.text }, responseMs }); setStatus(""); break; }
          if (attempt === 1) setStatus(locale.retry);
        } catch (error) {
          if (!(error instanceof SpeechError) || error.reason !== "silence") throw error;
          if (attempt === 1) setStatus(locale.retry);
        }
      }
    } catch (error) {
      if (!control.signal.aborted) { setStatus(error instanceof SpeechError && error.reason === "cancelled" ? "" : locale.fallback); if (!(error instanceof SpeechError) || error.reason !== "cancelled") fallback(); }
    } finally { if (!control.signal.aborted) setBusy(false); }
  };
  useEffect(() => {
    const speechProvider = provider.current;
    setCandidate(null); setHeard(""); setStatus(""); setBusy(false);
    // Read mode never starts recognition. Auto-listening only follows the explicit voice preference.
    if (ready && auto && preferences.mode === "voice" && !voiceFallback && !disabled) void speak(true);
    return () => { controller.current?.abort(); speechProvider.cancel(); };
    // Callbacks/options may change without changing the question. current keeps those fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, preferences.mode, locale.code, ready, disabled, auto, voiceFallback]);
  return <div data-voice-ignore className="my-4 space-y-3">
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={disabled || busy} onClick={() => void speak(true)} className="min-h-14 rounded-xl border-2 border-primary bg-primary/10 px-4 text-lg font-semibold"><Mic className="mr-2 inline h-7 w-7" />{locale.mic}</button>
      <button type="button" disabled={disabled || busy} onClick={() => void speak(false)} className="min-h-14 rounded-xl border-2 px-4 text-lg"><Volume2 className="mr-2 inline h-7 w-7" />{locale.replay}</button>
      {busy && <button type="button" className="min-h-14 rounded-xl border-2 px-4" onClick={() => { controller.current?.abort(); provider.current.cancel(); setBusy(false); setStatus(""); }}>Stop</button>}
    </div>
    <p role="status" className="text-lg">{status}</p>
    {heard && <p className="text-lg">{locale.heard}: “{heard}”</p>}
    {candidate && <div className="rounded-xl border-2 p-4 text-xl">
      <p>{locale.confirm} “{candidate.option.label}”?</p>
      <div className="mt-3 flex gap-3">
        <button type="button" className="min-h-14 rounded-lg bg-primary px-6 text-primary-foreground" onClick={confirmCandidate}>{locale.yes}</button>
        <button type="button" className="min-h-14 rounded-lg border-2 px-6" onClick={() => void speak(true)}>{locale.no}</button>
      </div>
      <button type="button" disabled={busy} className="mt-3 min-h-14 rounded-lg border-2 px-4" onClick={() => void confirmByVoice()}><Mic className="mr-2 inline h-7 w-7" />{locale.mic}: {locale.yes} / {locale.no}</button>
    </div>}
  </div>;
}
