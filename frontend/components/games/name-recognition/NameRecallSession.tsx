"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl, apiFetch, API_URL } from "@/lib/api";
import { useCaregiver } from "@/lib/mode";
import { VoiceQuestion } from "@/components/interaction/VoiceQuestion";
import ReadAloud from "@/components/interaction/ReadAloud";
import { usePreferences } from "@/components/interaction/InteractionProvider";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import type { AnswerInput } from "@/components/interaction/VoiceQuestion";

type Person = {
  id: string;
  name: string;
  relation?: string;
  photo: string;
};

type Round = {
  target: Person;
  kind: "name" | "person" | "relation";
  options: Person[];
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeRounds(people: Person[]): Round[] {
  const relationPeople = people.filter((person) => person.relation?.trim());
  const roundThreeTarget = shuffle(relationPeople.length ? relationPeople : people)[0];
  const remainingTargets = shuffle(people.filter((person) => person.id !== roundThreeTarget.id));
  const targets = [remainingTargets[0], remainingTargets[1], roundThreeTarget];

  return targets.map((target, index) => {
    const kind: Round["kind"] = index === 0 ? "name" : index === 2 && target.relation?.trim() ? "relation" : "person";
    const distractors = shuffle(people.filter((person) => person.id !== target.id)).slice(0, 2);
    return { target, kind, options: shuffle([target, ...distractors]) };
  });
}

export default function NameRecallSession({ onFinish }: { onFinish: (score: number) => void }) {
  const [caregiver] = useCaregiver();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shakingId, setShakingId] = useState<string | null>(null);
  const [roundPoints, setRoundPoints] = useState<number[]>([]);
  const [reinforcement, setReinforcement] = useState(false);
  const { preferences } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const nextRoundTimer = useRef<number | null>(null);
  const feedbackActive = useRef(false);
  const round = rounds[roundIndex];
  const logAnswer = useAnswerLog("name-recognition", "recognition-orientation", `${roundIndex}-${round?.target.id ?? "loading"}`, 1);

  useEffect(() => {
    let active = true;
    apiFetch(`${API_URL}/people`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load people")))
      .then((data: Person[]) => {
        if (!active) return;
        const people = Array.isArray(data)
          ? data.filter((person) => Boolean(person.id && person.name?.trim() && person.photo?.trim()))
          : [];
        if (people.length >= 3) setRounds(makeRounds(people));
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (nextRoundTimer.current !== null) window.clearTimeout(nextRoundTimer.current);
  }, []);

  const choose = (person: Person, input: AnswerInput = { method: "tap", responseMs: null }) => {
    const round = rounds[roundIndex];
    if (!round || reinforcement || feedbackActive.current) return;
    if (person.id !== round.target.id) {
      logAnswer(false, input);
      if (revealed) return;
      setShakingId(person.id);
      window.setTimeout(() => setShakingId((current) => current === person.id ? null : current), 350);
      const nextWrongCount = wrongCount + 1;
      setWrongCount(nextWrongCount);
      if (nextWrongCount >= 2) setRevealed(true);
      return;
    }

    logAnswer(true, input);
    const points = revealed ? 0 : wrongCount === 0 ? 1 : 0.5;
    const nextPoints = [...roundPoints, points];
    setRoundPoints(nextPoints);
    feedbackActive.current = true;
    setReinforcement(true);
    nextRoundTimer.current = window.setTimeout(() => {
      if (roundIndex === 2) {
        onFinish(Math.round((nextPoints.reduce((sum, value) => sum + value, 0) / 3) * 100));
        return;
      }
      setRoundIndex((current) => current + 1);
      setWrongCount(0);
      setRevealed(false);
      setShakingId(null);
      feedbackActive.current = false;
      setReinforcement(false);
    }, 2000);
  };

  if (loading) return <p className="py-10 text-center text-xl text-muted-foreground" role="status">Loading familiar people…</p>;
  if (loadError) return <div><p className="py-10 text-center text-xl text-muted-foreground" role="alert">Could not load people. Please try again.</p><ReadAloud kind="feedback" text="Could not load people. Please try again." /></div>;
  if (rounds.length < 3) {
    return <div><p className="py-10 text-center text-xl text-muted-foreground">
      {caregiver ? "Add at least 3 people to play" : "Let’s try another activity today. Your caregiver can add familiar people so you can play this game next time."}
    </p><ReadAloud kind="feedback" text={caregiver ? "Add at least three people to play." : "Let’s try another activity today. Your caregiver can add familiar people so you can play this game next time."} /></div>;
  }

  const activeRound = rounds[roundIndex];
  const prompt = activeRound.kind === "name"
    ? "Who is this?"
    : activeRound.kind === "relation"
      ? `Who is your ${activeRound.target.relation}?`
      : `Where is ${activeRound.target.name}?`;
  const shownName = activeRound.target.relation?.trim()
    ? `${activeRound.target.name}, your ${activeRound.target.relation}`
    : activeRound.target.name;

  return <section className="space-y-6 text-center" aria-live="polite">
    <style>{`@keyframes nameRecallShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }`}</style>
    <div>
      <p className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Round {roundIndex + 1} of 3</p>
      <h2 className="mt-2 text-2xl font-bold text-foreground">{reinforcement && preferences.encouragingMessages ? "Well remembered" : prompt}</h2>
      {reinforcement && <ReadAloud kind="feedback" text={`${preferences.encouragingMessages ? "Well remembered. " : ""}${shownName}`} />}
    </div>

    {reinforcement ? <div className="flex flex-col items-center gap-3" role="status">
      <img src={mediaUrl(`/known-faces/${encodeURIComponent(activeRound.target.photo)}`)} alt={activeRound.target.name} className="h-48 w-48 rounded-xl border border-border object-cover shadow-sm" />
      <div className="flex items-center gap-3">
        <p className="text-xl font-semibold">{shownName}</p>
      </div>
    </div> : <>
      <VoiceQuestion question={prompt} options={activeRound.options.map(person => ({ id: person.id, label: person.name }))} onMatched={(option, input) => { const selected = activeRound.options.find(person => person.id === option.id); if (selected) choose(selected, input); }} />
      {activeRound.kind === "name" && <img src={mediaUrl(`/known-faces/${encodeURIComponent(activeRound.target.photo)}`)} alt="Who is this?" className="mx-auto h-48 w-48 rounded-xl border border-border object-cover shadow-sm" />}

      {activeRound.kind === "name" ? <div className="grid gap-3 sm:grid-cols-3">
        {activeRound.options.map((person) => <button key={person.id} type="button" onClick={() => choose(person)} aria-label={person.name}
          className={`min-h-14 rounded-xl border border-border bg-card px-4 py-3 text-xl font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${revealed && person.id === round.target.id ? "border-green-600 bg-green-600/15" : ""}`}
          style={shakingId === person.id ? { animation: "nameRecallShake 300ms ease-in-out" } : undefined}>{person.name}</button>)}
      </div> : <div className="grid gap-3 sm:grid-cols-3">
        {activeRound.options.map((person) => <button key={person.id} type="button" onClick={() => choose(person)} aria-label={person.name}
          className={`rounded-xl border border-border bg-card p-2 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${revealed && person.id === round.target.id ? "border-green-600 bg-green-600/15" : ""}`}
          style={shakingId === person.id ? { animation: "nameRecallShake 300ms ease-in-out" } : undefined}>
          <img src={mediaUrl(`/known-faces/${encodeURIComponent(person.photo)}`)} alt="" className="mx-auto aspect-square w-full min-w-36 max-w-48 rounded-lg object-cover" />
        </button>)}
      </div>}

      {wrongCount === 1 && !revealed && <><p className="text-lg text-muted-foreground" role="status">Hint: the name starts with {activeRound.target.name.trim().charAt(0).toUpperCase()}…</p><ReadAloud kind="feedback" text={`Hint: the name starts with ${activeRound.target.name.trim().charAt(0).toUpperCase()}.`} /></>}
      {revealed && <><p className="text-lg text-muted-foreground" role="status">Here’s the answer. Tap the highlighted choice when you’re ready.</p><ReadAloud kind="feedback" text={`Here’s the answer. ${shownName}. Tap the highlighted choice when you’re ready.`} /></>}
    </>}
  </section>;
}
