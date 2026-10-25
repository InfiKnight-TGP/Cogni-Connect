"use client";
import { useEffect, useRef, useState } from "react";
import GameShell from "../_shared/GameShell";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { VoiceQuestion, type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import type { GameProps } from "../_shared/types";
import ReadAloud from "@/components/interaction/ReadAloud";

function Sounds({ finish }: { finish: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState(false);
  const [ready, setReady] = useState(false);
  const [visual, setVisual] = useState(false);
  const [notice, setNotice] = useState("");
  const [knob] = useState(() => readSkill("sound-tap").knob);
  const audio = useRef<AudioContext | null>(null);
  const active = useRef(true);
  const { t } = useTranslate();
  const beats = 1 + (round % Math.min(5, knob + 1));
  const log = useAnswerLog("sound-tap", "Attention", `${round}:${ready}`, knob, true);
  useEffect(() => { active.current = true; return () => { active.current = false; void audio.current?.close(); }; }, []);

  const play = async () => {
    try {
      setReady(false); setNotice("");
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== "running") throw new Error("Audio did not start");
      const ctx = audio.current;
      for (let i = 0; i < beats; i++) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.connect(gain); gain.connect(ctx.destination); gain.gain.value = .08; oscillator.frequency.value = 440;
        oscillator.start(ctx.currentTime + i * .6); oscillator.stop(ctx.currentTime + i * .6 + .2);
        if (i === beats - 1) oscillator.onended = () => { if (active.current) { setReady(true); setNotice("Choose how many beats you heard. If you could not hear them, use Show the beats."); } };
      }
    } catch { setNotice("Sound could not play. Choose Show the beats for a visual version."); }
  };
  const choose = (id: string, input?: AnswerInput) => {
    if (!ready || picked) return;
    const isCorrect = Number(id) === beats;
    log(isCorrect, input); setPicked(true); setCorrect(value => value + Number(isCorrect));
    setNotice(isCorrect ? "Well done!" : `There were ${beats} beats.`);
  };
  const next = () => {
    if (round === 5) finish(Math.round(correct / 6 * 100));
    else { setRound(value => value + 1); setPicked(false); setReady(false); setVisual(false); }
  };
  const options = [1, 2, 3, 4, 5].map(value => ({ id: String(value), label: String(value), synonyms: [`${value} beats`] }));
  return <section className="space-y-5">
    <h2 className="text-3xl font-bold">{t("How many beats?")}</h2>
    <div className="flex flex-wrap gap-3"><Button variant="outline" className="min-h-14 px-5 text-lg" disabled={picked} onClick={() => void play()}>{t("Play the sound")}</Button><Button variant="outline" className="min-h-14 px-5 text-lg" disabled={picked} onClick={() => { setVisual(true); setReady(true); }}>{t("Show the beats")}</Button></div>
    {visual && <p className="text-5xl" aria-label={t("{count} beats", { count: beats })}>{Array(beats).fill("●").join(" ")}</p>}
    <VoiceQuestion question="How many beats?" options={options} disabled={!ready || picked} onMatched={(option, input) => choose(option.id, input)} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[1, 2, 3, 4, 5].map(value => <BigTile key={value} label={String(value)} disabled={!ready || picked} onClick={() => choose(String(value))} className="min-h-20 min-w-20 text-3xl" />)}</div>
    <p role="status" className="text-lg">{t(notice)}</p>
    {notice && <ReadAloud kind="feedback" text={t(notice)} />}
    {picked && <Button className="min-h-14 px-8 text-xl" onClick={next}>{round === 5 ? t("Finish") : t("Next")}</Button>}
  </section>;
}

export default function SoundTap({ date, onFinish }: GameProps) {
  return <GameShell gameId="sound-tap" title="Listen to the beats" instructions="Listen to a short sound, or look at the dots. Choose how many." level={1} skill="attention" date={date} onFinish={onFinish}>{finish => <Sounds finish={finish} />}</GameShell>;
}
