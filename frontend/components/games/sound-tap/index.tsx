"use client";
import { useRef, useState, useEffect } from "react";
import GameShell from "../_shared/GameShell";
import type { GameProps } from "../_shared/types";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
function Sounds({ finish }: { finish: (score: number) => void }) {
  const [round, setRound] = useState(0), [correct, setCorrect] = useState(0), [picked, setPicked] = useState(false), [ready, setReady] = useState(false), [visual, setVisual] = useState(false), [notice, setNotice] = useState("");
  const [knob, setKnob] = useState(() => readSkill("Attention").knob);
  const audio = useRef<AudioContext | null>(null), active = useRef(true);
  const beats = 1 + round % Math.min(4, knob + 1);
  const log = useAnswerLog("sound-tap", "Attention", `${round}:${ready}`, knob);
  useEffect(() => { active.current = true; return () => { active.current = false; void audio.current?.close(); }; }, []);
  const play = async () => {
    try {
      setReady(false); audio.current ??= new AudioContext(); await audio.current.resume();
      if (audio.current.state !== "running") throw new Error("Audio did not start");
      const ctx = audio.current;
      for (let i = 0; i < beats; i++) { const oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.connect(gain); gain.connect(ctx.destination); gain.gain.value = .08; oscillator.frequency.value = 440; oscillator.start(ctx.currentTime + i * .6); oscillator.stop(ctx.currentTime + i * .6 + .2); if (i === beats - 1) oscillator.onended = () => { if (active.current) { setReady(true); setNotice("Choose how many beats you heard. If you could not hear them, use Show the beats."); } }; }
    } catch { setNotice("Sound could not play. Choose Show the beats for a visual version."); }
  };
  const choose = (id: string, input?: AnswerInput) => { if (!ready || picked) return; const ok = Number(id) === beats; log(ok, input); setPicked(true); setCorrect(n => n + Number(ok)); setNotice(ok ? "Well done!" : `There were ${beats} beats.`); };
  return <section className="space-y-5"><h2 className="text-3xl font-bold">How many beats?</h2><div className="flex flex-wrap gap-3"><button className="min-h-14 rounded-xl border-2 px-6" disabled={picked} onClick={() => void play()}>Play the sound</button><button className="min-h-14 rounded-xl border-2 px-6" disabled={picked} onClick={() => { setVisual(true); setReady(true); }}>Show the beats</button></div>{visual && <p className="text-5xl">{Array(beats).fill("●").join(" ")}</p>}<VoiceQuestion auto={false} prompt="How many beats?" disabled={!ready || picked} options={[1, 2, 3, 4].map(n => ({ id: String(n), label: String(n), synonyms: [`${n} beats`] }))} onAnswer={choose} /><div className="flex flex-wrap gap-4">{[1, 2, 3, 4].map(n => <button key={n} className="min-h-16 min-w-16 rounded-xl border-2 text-3xl" disabled={!ready || picked} onClick={() => choose(String(n))}>{n}</button>)}</div><p role="status">{notice}</p>{picked && <button className="min-h-14 rounded-xl border-2 px-6" onClick={() => { if (round === 5) finish(Math.round(correct / 6 * 100)); else { setRound(n => n + 1); setPicked(false); setReady(false); setVisual(false); setKnob(readSkill("Attention").knob); } }}>{round === 5 ? "Finish" : "Next"}</button>}</section>;
}
export default function SoundTap({ date, onFinish }: GameProps) { return <GameShell gameId="sound-tap" title="Listen to the beats" instructions="Listen to a short sound, or look at the dots. Choose how many." level={1} skill="attention" date={date} onFinish={onFinish}>{finish => <Sounds finish={finish} />}</GameShell>; }
