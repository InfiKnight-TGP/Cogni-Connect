"use client";
import { useEffect, useMemo, useState } from "react";
import { crossword, type PersonalWord } from "@/lib/interaction/content";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";
import { readSkill } from "@/lib/interaction/events";
import { putSupport, readSupport } from "@/lib/interaction/support-store";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { translate } from "@/lib/interaction/locale";

export default function PersonalCrossword() {
  const { locale } = useInteraction();
  const tr = (phrase: string, values: Record<string, string | number> = {}) => translate(locale, phrase, values);
  const [words, setWords] = useState<PersonalWord[]>([]);
  const [entry, setEntry] = useState("");
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [knob, setKnob] = useState(2);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const patient = localStorage.getItem("cogni:patient") || "local-patient";
      const saved = readSupport(patient).records.find(row => row.id === "crossword-current")?.data;
      if (saved && Array.isArray(saved.words) && Array.isArray(saved.solved)) {
        setWords(saved.words as PersonalWord[]); setSolved(saved.solved as string[]);
        setIndex(Number(saved.index) || 0); setKnob(Number(saved.knob) || 2);
      }
    } catch { setNotice(tr("The saved puzzle could not be opened. You can make a new one.")); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || !words.length) return;
    try { putSupport(localStorage.getItem("cogni:patient") || "local-patient", "crossword", { words, solved, index, knob }, "crossword-current"); }
    catch { setNotice(tr("Your puzzle could not be saved. Keep this screen open.")); }
  }, [loaded, words, solved, index, knob]);
  const puzzle = useMemo(() => crossword(words.filter(word => word.answer.length <= 6 + knob * 2)), [words, knob]);
  const word = puzzle.words[index];
  const logAnswer = useAnswerLog("personal-crossword", "Memory", String(index), knob);
  const build = (data: FormData) => {
    const personal = String(data.get("words") || "").split("\n").map(line => { const [answer, ...clue] = line.split(":"); const word = answer.trim(), hint = clue.join(":").trim(); return { answer: word, clue: hint, ...(hint ? {} : { clueKey: "initial" as const }) }; });
    const patient = localStorage.getItem("cogni:patient") || "local-patient";
    const places = readSupport(patient).records.filter(row => row.kind === "place").map(row => ({ answer: String(row.data.name), clue: "", clueKey: "place" as const }));
    setWords([...personal, ...places]); setKnob(readSkill("Memory").knob); setIndex(0); setSolved([]); setEntry("");
  };
  const answer = (value: string, method: "typed" | "voice", responseMs: number | null = null) => {
    if (!word || solved.includes(word.answer)) return;
    const ok = value.replace(/[^a-z]/gi, "").toUpperCase() === word.answer;
    logAnswer(ok, { method, responseMs });
    if (ok) { setSolved(previous => [...previous, word.answer]); setNotice(tr("Well done!")); }
    else setNotice(tr("Let's try again. You can use the letters as a clue."));
  };
  const visibleClue = word?.clueKey === "place" ? tr("One of your favourite places") : word?.clueKey === "initial" ? tr("A familiar word beginning with {letter}", { letter: word.answer.charAt(0) }) : word?.clue ?? "";
  return <section className="space-y-5 rounded-2xl border-2 p-6"><h2 className="text-2xl font-bold">{tr("Words from my life")}</h2>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); build(new FormData(e.currentTarget)); }}><label className="block">{tr("Add familiar names, places or foods. One word and clue per line.")}<textarea name="words" required rows={4} className="w-full rounded-xl border-2 bg-background p-4 text-xl" placeholder={tr("Example: MEERA: Your daughter\nTEA: Your favourite warm drink\nRICE: A food you enjoy")} /></label><p>{tr("Use English letters or Romanized names for this grid.")}</p><button className="min-h-14 rounded-xl border-2 px-5 text-xl">{tr("Make my crossword")}</button></form>
    {puzzle.words.length > 0 && <><div className="overflow-x-auto"><div className="grid w-max gap-0.5" style={{ gridTemplateColumns: "repeat(15, 2rem)" }}>{puzzle.grid.flatMap((row, r) => row.map((letter, c) => {
      const visible = puzzle.words.some(w => (solved.includes(w.answer) || (knob <= 2 && w.answer[0] === letter && r === w.row && c === w.col)) && Array.from(w.answer).some((_, i) => r === w.row + (w.direction === "down" ? i : 0) && c === w.col + (w.direction === "across" ? i : 0)));
      return <div key={`${r}:${c}`} className={`flex h-8 items-center justify-center border text-lg ${letter ? "border-foreground bg-background" : "border-transparent bg-muted"}`}>{letter && visible ? letter : ""}</div>;
    }))}</div></div>
    <div className="flex flex-wrap gap-3">{puzzle.words.map((w, i) => <button key={w.answer} className="min-h-14 rounded-xl border-2 px-4" onClick={() => { setIndex(i); setEntry(""); setNotice(""); }}>{i + 1} {tr(w.direction === "across" ? "Across" : "Down")}{solved.includes(w.answer) ? " ✓" : ""}</button>)}</div>
    {word && <><h3 className="text-2xl">{index + 1}. {visibleClue} ({tr("{count} letters", { count: word.answer.length })})</h3><p>{tr("Starts at row {row}, column {column}", { row: word.row + 1, column: word.col + 1 })}</p><VoiceQuestion key={word.answer} prompt={visibleClue} translatePrompt={false} freeText options={[]} disabled={solved.includes(word.answer)} onAnswer={(id, input) => answer(id, "voice", input.responseMs)} /><form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); answer(entry, "typed"); }}><input aria-label={tr("Crossword answer")} className="min-h-14 rounded-xl border-2 bg-background p-3 text-xl" value={entry} onChange={e => setEntry(e.target.value)} /><button disabled={solved.includes(word.answer)} className="min-h-14 rounded-xl border-2 px-5">{tr("Check")}</button></form></>}
    </>}
    {words.length > 0 && !puzzle.words.length && <p>{tr("Add words with 2–14 English letters. Your current setting may prefer shorter words.")}</p>}
    <p role="status" className="text-xl">{notice}</p>
  </section>;
}
