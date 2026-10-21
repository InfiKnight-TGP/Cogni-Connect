"use client";
import { useContext, useEffect, useMemo, useState } from "react";
import GameShell, { PreviewContext } from "../_shared/GameShell";
import { Button } from "@/components/ui/button";
import { ReadAloud } from "@/components/interaction/ReadAloud";
import { DictationButton } from "@/components/interaction/DictationButton";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { readSkill } from "@/lib/interaction/events";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import { apiFetch, API_URL } from "@/lib/api";
import type { GameProps } from "../_shared/types";

type CrosswordEntry = { number: number; direction: "across" | "down"; clue: string; word: string; row: number; col: number };
type CrosswordPuzzle = {
  date: string; available: boolean; rows: number; cols: number;
  grid: { letter: string; number: number }[][]; entries: CrosswordEntry[];
  sample?: boolean;
};

function samplePreviewPuzzle(date: string): CrosswordPuzzle {
  const words = [
    { word: "ZOO", clue: "A place where you can see many animals." },
    { word: "TIGER", clue: "A large striped cat." },
    { word: "LION", clue: "A big cat with a mane." },
    { word: "BIRD", clue: "An animal with feathers and wings." },
    { word: "MONKEY", clue: "An animal that can climb trees." },
  ];
  const cols = Math.max(...words.map(item => item.word.length));
  const entries = words.map((item, index) => ({ number: index + 1, direction: "across" as const, clue: item.clue, word: item.word, row: index, col: 0 }));
  const grid = words.map((item, index) => Array.from({ length: cols }, (_, col) => ({ letter: item.word[col] ?? "", number: col === 0 ? index + 1 : 0 })));
  return { date, available: true, rows: words.length, cols, grid, entries, sample: true };
}

function Crossword({ date, finish }: { date: string; finish: (score: number) => void }) {
  const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [selected, setSelected] = useState(0);
  const [guess, setGuess] = useState("");
  const [hinted, setHinted] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [inputMethod, setInputMethod] = useState<"typed" | "voice">("typed");
  const [knob] = useState(() => readSkill("Memory").knob);
  const [listShown, setListShown] = useState(() => knob === 1);
  const { t, caregiver } = useTranslate();
  const preview = useContext(PreviewContext);
  const log = useAnswerLog("memory-crossword", "Memory", String(selected), knob, true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let puzzleDate = date;
      if (preview) {
        try {
          const response = await apiFetch(API_URL + "/journals", { cache: "no-store" });
          if (response.ok) {
            const journals = await response.json() as Record<string, { date?: string }>;
            const savedDays = Object.values(journals).map(journal => journal.date?.slice(0, 10) ?? "").filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= date).sort();
            if (savedDays.length) puzzleDate = savedDays[savedDays.length - 1];
          }
        } catch { /* The selected date and sample preview remain available offline. */ }
      }
      try {
        const response = await apiFetch(API_URL + "/crossword?date=" + encodeURIComponent(puzzleDate), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Crossword unavailable");
        if (!cancelled) {
          const loaded = data as CrosswordPuzzle;
          setPuzzle(preview && (!loaded.available || loaded.entries.length < 4) ? samplePreviewPuzzle(puzzleDate) : loaded);
        }
      } catch {
        if (!cancelled) setPuzzle(preview ? samplePreviewPuzzle(puzzleDate) : { date, available: false, rows: 0, cols: 0, grid: [], entries: [] });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [date, preview]);

  const wordLimit = knob === 1 ? 4 : knob === 2 ? 5 : knob === 3 ? 6 : 8;
  const entries = useMemo(() => puzzle?.entries.slice(0, wordLimit) ?? [], [puzzle, wordLimit]);
  useEffect(() => {
    if (puzzle?.available && !puzzle.sample && knob <= 2) setHinted(entries.map((_, index) => index));
  }, [entries, knob, puzzle]);
  const current = entries[selected];
  const shuffled = useMemo(() => [...entries].sort(() => Math.random() - 0.5), [entries]);
  const choose = (index: number) => { setSelected(index); setGuess(""); setNotice(""); setListShown(knob === 1); setInputMethod("typed"); };
  const submit = (raw = guess) => {
    if (!current || solved.includes(selected) || revealed.includes(selected)) return;
    const answer = raw.toUpperCase().replace(/[^A-Z]/g, "");
    if (answer === current.word) {
      setSolved(value => [...value, selected]);
      setNotice(t("Well done!"));
      log(true, { method: inputMethod, responseMs: null });
      if (solved.length + revealed.length + 1 === entries.length) {
        const points = entries.reduce((sum, _, index) => sum + (revealed.includes(index) ? 0 : hinted.includes(index) ? 0.5 : index === selected ? (hinted.includes(index) ? 0.5 : 1) : solved.includes(index) ? (hinted.includes(index) ? 0.5 : 1) : 0), 0);
        finish(Math.round(points / entries.length * 100));
      }
    } else {
      setNotice(t("Try again. You can use the letters as a clue."));
      log(false, { method: inputMethod, responseMs: null });
    }
  };
  const showLetter = () => {
    if (!hinted.includes(selected)) setHinted(value => [...value, selected]);
    setNotice(t("A familiar word beginning with {letter}", { letter: current?.word[0] ?? "" }));
  };
  const showAnswer = () => {
    if (!current || revealed.includes(selected)) return;
    setRevealed(value => [...value, selected]);
    setNotice(current.word);
    if (solved.length + revealed.length + 1 === entries.length) {
      const points = entries.reduce((sum, _, index) => sum + (revealed.includes(index) || index === selected ? 0 : hinted.includes(index) ? 0.5 : solved.includes(index) ? 1 : 0), 0);
      finish(Math.round(points / entries.length * 100));
    }
  };
  const acceptDictation = (transcript: string) => {
    const cleaned = transcript.toUpperCase().replace(/[^A-Z\s]/g, " ").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    const answerWord = current?.word;
    const match = answerWord && (words.find(word => word.length === answerWord.length && word === answerWord)
      ?? (new RegExp(`(^|[^A-Z])${answerWord}([^A-Z]|$)`).test(cleaned) ? answerWord : null));
    setInputMethod("voice");
    setGuess((match ?? cleaned.replace(/\s/g, "")).slice(0, answerWord?.length ?? 0));
  };

  if (puzzle === null) return <p className="text-xl">{t("Loading…")}</p>;
  if (!puzzle.available || puzzle.entries.length < 4) return <p className="text-xl" role="status">{caregiver ? t("Add a video or a few people first.") : t("There aren't any memories for this crossword yet. Let's try another activity.")}</p>;
  if (!current) return null;
  const solvedLetters = new Map<string, string>();
  entries.forEach((entry, index) => {
    if (!solved.includes(index) && !revealed.includes(index)) return;
    for (let offset = 0; offset < entry.word.length; offset++) {
      const row = entry.row + (entry.direction === "down" ? offset : 0);
      const col = entry.col + (entry.direction === "across" ? offset : 0);
      solvedLetters.set(row + ":" + col, entry.word[offset]);
    }
  });
  const currentCells = new Set(Array.from({ length: current.word.length }, (_, offset) => (current.row + (current.direction === "down" ? offset : 0)) + ":" + (current.col + (current.direction === "across" ? offset : 0))));
  const visibleCells = new Set<string>();
  entries.forEach(entry => { for (let offset = 0; offset < entry.word.length; offset++) visibleCells.add((entry.row + (entry.direction === "down" ? offset : 0)) + ":" + (entry.col + (entry.direction === "across" ? offset : 0))); });
  const firstLetterCell = current.row + ":" + current.col;
  const helped = hinted.includes(selected) || listShown;
  return <section className="space-y-5">
    {puzzle.sample && <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground" role="status">{t("Example preview. This sample is not a saved memory.")}</p>}
    <div className="overflow-x-auto rounded-xl border border-border bg-muted/20 p-3" aria-label={t("Crossword grid")}>
      <div className="mx-auto grid w-max gap-1" style={{ gridTemplateColumns: "repeat(" + puzzle.cols + ", minmax(48px, 48px))" }}>
        {puzzle.grid.flatMap((row, rowIndex) => row.map((cell, colIndex) => {
          const key = rowIndex + ":" + colIndex;
          const shown = visibleCells.has(key);
          if (!shown) return <span key={key} className="h-12 w-12" aria-hidden="true" />;
          const inCurrent = currentCells.has(key);
          const letter = solvedLetters.get(key) ?? (hinted.includes(selected) && key === firstLetterCell ? current.word[0] : "");
          const cellNumber = entries.find(entry => entry.row === rowIndex && entry.col === colIndex)?.number;
          return <div key={key} className={`relative flex h-12 w-12 items-center justify-center rounded border-2 text-xl font-bold ${solvedLetters.has(key) ? "border-green-600 bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200" : inCurrent ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-foreground"}`}>
            {cellNumber && <span className="absolute left-0.5 top-0 text-[10px] leading-none">{cellNumber}</span>}{letter}
          </div>;
        }))}
      </div>
    </div>

    <ol className="space-y-2">{entries.map((entry, index) => <li key={entry.number + entry.direction}>
      <button type="button" onClick={() => choose(index)} aria-current={selected === index ? "true" : undefined} className={`min-h-12 w-full rounded-lg border px-3 py-2 text-left text-lg ${selected === index ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
        <span className="font-semibold">{entry.number} {t(entry.direction === "across" ? "Across" : "Down")}: </span>{t(entry.clue)}{solved.includes(index) || revealed.includes(index) ? " ✓" : ""}
      </button>
    </li>)}</ol>

    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <label className="block text-xl font-semibold" htmlFor="crossword-answer">{t("Crossword answer")} · {current.word.length} {t("letters")}</label>
      <input id="crossword-answer" value={solved.includes(selected) || revealed.includes(selected) ? current.word : guess} onChange={event => { setInputMethod("typed"); setGuess(event.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, current.word.length)); }} onKeyDown={event => { if (event.key === "Enter") submit(); }} disabled={solved.includes(selected) || revealed.includes(selected)} maxLength={current.word.length} autoComplete="off" className="min-h-14 w-full rounded-lg border-2 border-input bg-background px-4 text-2xl uppercase tracking-[0.2em] text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring" />
      <ReadAloud text={t(current.clue)} options={knob === 1 && listShown ? shuffled.map(entry => entry.word) : []} />
      <DictationButton value={guess} disabled={solved.includes(selected) || revealed.includes(selected)} transform={text => text.toUpperCase().replace(/[^A-Z\s]/g, " ")} onText={acceptDictation} />
      {knob === 1 && <Button type="button" variant="outline" className="min-h-12 w-full text-lg" onClick={() => { const next = !listShown; setListShown(next); if (next && !hinted.includes(selected)) setHinted(value => [...value, selected]); }}>{t(listShown ? "Hide word list" : "Show word list")}</Button>}
      {knob === 1 && listShown && <div className="grid grid-cols-2 gap-2">{shuffled.map((entry, index) => <Button key={entry.word + index} type="button" variant="outline" className="min-h-12 whitespace-normal text-lg" disabled={solved.includes(selected) || revealed.includes(selected)} onClick={() => setGuess(entry.word)}>{entry.word}</Button>)}</div>}
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-12 px-5 text-lg" disabled={!guess || solved.includes(selected) || revealed.includes(selected)} onClick={() => submit()}>{t("Check answer")}</Button>
        {knob <= 2 && <Button type="button" variant="outline" className="min-h-12 px-5 text-lg" disabled={solved.includes(selected) || revealed.includes(selected)} onClick={showLetter}>{t("Show a letter")}</Button>}
        <Button type="button" variant="outline" className="min-h-12 px-5 text-lg" disabled={solved.includes(selected) || revealed.includes(selected)} onClick={showAnswer}>{t("Show answer")}</Button>
      </div>
      {notice && <><p role="status" className="text-lg">{t(notice)}</p><ReadAloud text={t(notice)} kind="feedback" /></>}
      <p className="text-base text-muted-foreground">{t("Word {current} of {total}", { current: Math.min(solved.length + revealed.length + 1, entries.length), total: entries.length })}{helped ? " · " + t("A hint was used") : ""}</p>
    </div>
  </section>;
}

export default function MemoryCrossword({ date, onFinish }: GameProps) {
  const now = new Date();
  const day = date ?? now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  return <GameShell gameId="memory-crossword" title="Memory Crossword" instructions="Recall words from your own recent memories." level={2} skill="personal memory" date={day} onFinish={onFinish}>{finish => <Crossword date={day} finish={finish} />}</GameShell>;
}
