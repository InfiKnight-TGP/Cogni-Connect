"use client";
import { useMemo, useState } from "react";
import { crossword, type PersonalWord } from "@/lib/interaction/content";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import { readSupport } from "@/lib/interaction/support-store";

export default function PersonalCrossword() {
  const [words, setWords] = useState<PersonalWord[]>([]);
  const [entry, setEntry] = useState("");
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [knob, setKnob] = useState(2);
  const puzzle = useMemo(() => crossword(words.filter(word => word.answer.length <= 6 + knob * 2)), [words, knob]);
  const word = puzzle.words[index];
  const logAnswer = useAnswerLog("personal-crossword", "Memory", String(index), knob);
  const build = (data: FormData) => {
    const personal = String(data.get("words") || "").split("\n").map(line => { const [answer, ...clue] = line.split(":"); return { answer: answer.trim(), clue: clue.join(":").trim() || `A familiar word beginning with ${answer.trim().charAt(0)}` }; });
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    const places = readSupport(patient).records.filter(row => row.kind === "place").map(row => ({ answer: String(row.data.name), clue: "One of your favourite places" }));
    setWords([...personal, ...places]); setKnob(readSkill("Memory").knob); setIndex(0); setSolved([]); setEntry("");
  };
  const answer = (value: string, method: "typed" | "voice", responseMs: number | null = null) => {
    if (!word || solved.includes(word.answer)) return;
    const ok = value.replace(/[^a-z]/gi, "").toUpperCase() === word.answer;
    logAnswer(ok, { method, responseMs });
    if (ok) { setSolved(previous => [...previous, word.answer]); setNotice("Well done!"); }
    else setNotice("Let's try again. You can use the letters as a clue.");
  };
  return <section className="space-y-5 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">Words from my life</h2>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); build(new FormData(e.currentTarget)); }}><label className="block">Add familiar names, places or foods. One word and clue per line.<textarea name="words" required rows={4} className="w-full rounded-xl border-2 bg-background p-4 text-xl" placeholder="MEERA: Your daughter&#10;TEA: Your favourite warm drink&#10;RICE: A food you enjoy" /></label><p>Use English letters or Romanized names for this grid.</p><button className="min-h-14 rounded-xl border-2 px-5 text-xl">Make my crossword</button></form>
    {puzzle.words.length > 0 && <><div className="overflow-x-auto"><div className="grid w-max gap-0.5" style={{ gridTemplateColumns: "repeat(15, 2rem)" }}>{puzzle.grid.flatMap((row, r) => row.map((letter, c) => {
      const visible = puzzle.words.some(w => (solved.includes(w.answer) || (knob <= 2 && w.answer[0] === letter && r === w.row && c === w.col)) && Array.from(w.answer).some((_, i) => r === w.row + (w.direction === "down" ? i : 0) && c === w.col + (w.direction === "across" ? i : 0)));
      return <div key={`${r}:${c}`} className={`flex h-8 items-center justify-center border text-lg ${letter ? "border-foreground bg-background" : "border-transparent bg-muted"}`}>{letter && visible ? letter : ""}</div>;
    }))}</div></div>
    <div className="flex flex-wrap gap-3">{puzzle.words.map((w, i) => <button key={w.answer} className="min-h-14 rounded-xl border-2 px-4" onClick={() => { setIndex(i); setEntry(""); setNotice(""); }}>{i + 1} {w.direction}{solved.includes(w.answer) ? " ✓" : ""}</button>)}</div>
    {word && <><h3 className="text-2xl">{index + 1}. {word.clue} ({word.answer.length} letters)</h3><p>Starts at row {word.row + 1}, column {word.col + 1}</p><VoiceQuestion key={word.answer} prompt={word.clue} freeText options={[]} disabled={solved.includes(word.answer)} onAnswer={(id, input) => answer(id, "voice", input.responseMs)} /><form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); answer(entry, "typed"); }}><input aria-label="Crossword answer" className="min-h-14 rounded-xl border-2 bg-background p-3 text-xl" value={entry} onChange={e => setEntry(e.target.value)} /><button disabled={solved.includes(word.answer)} className="min-h-14 rounded-xl border-2 px-5">Check</button></form></>}
    </>}
    {words.length > 0 && !puzzle.words.length && <p>Add words with 2–14 English letters. Your current setting may prefer shorter words.</p>}
    <p role="status" className="text-xl">{notice}</p>
  </section>;
}
