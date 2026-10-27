"use client";

import { useState } from "react";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { Button } from "@/components/ui/button";
import type { RoutineQuestion } from "./routineLogic";

export default function RoutineQuestions({ questions, onDone }: { questions: RoutineQuestion[]; onDone: (score: number) => void }) {
  const { t } = useTranslate();
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const question = questions[index];
  const prompt = t(question.prompt, question.step ? { step: question.step } : undefined);
  const spokenOptions = question.options.map(option => t(option));
  const pick = (option: string) => {
    if (answer !== null) return;
    setAnswer(option);
    if (option === question.answer) setCorrect(value => value + 1);
  };
  const next = () => { setIndex(index + 1); setAnswer(null); };
  const finishScore = () => onDone((correct / questions.length) * 20);

  return <section className="space-y-6" aria-live="polite">
    <header><h2 className="text-2xl font-bold">{t("Your daily routine")}</h2><p className="mt-1 text-lg">{t("These are your daily routine steps.")}</p></header>
    <p className="text-lg font-medium text-muted-foreground">{t("Question {number}", { number: index + 1 })} / {questions.length}</p>
    <h3 className="text-2xl font-bold">{prompt}</h3>
    <ReadAloud text={prompt} options={spokenOptions} />
    {question.display && <ol className="list-decimal space-y-2 rounded-xl border-2 border-border p-5 ps-12 text-xl">{question.display.map((step, stepIndex) => <li key={`${stepIndex}-${step}`} className="break-words">{step}</li>)}</ol>}
    <div className="grid gap-3 sm:grid-cols-2">{question.options.map(option => <button key={option} type="button" onClick={() => pick(option)} disabled={answer !== null}
      aria-pressed={answer === option} className={`min-h-16 rounded-2xl border-2 px-5 py-4 text-left text-lg font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default ${answer === option ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}>{t(option)}</button>)}</div>
    {answer !== null && <p role="status" className="rounded-xl border-2 border-amber-500/60 bg-amber-50 p-4 text-lg text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{answer === question.answer ? t("That is right.") : t("Let's look together. {answer} is the right step.", { answer: question.answer })}</p>}
    {answer !== null && <ReadAloud kind="feedback" text={answer === question.answer ? t("That is right.") : t("Let's look together. {answer} is the right step.", { answer: question.answer })} />}
    {answer !== null && <Button size="lg" className="min-h-14 px-10 text-lg" onClick={index === questions.length - 1 ? finishScore : next}>{t("Next")}</Button>}
  </section>;
}
