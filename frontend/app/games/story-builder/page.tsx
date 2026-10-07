"use client";

import { useEffect, useState } from "react";
import { Check, Eye, RotateCcw } from "lucide-react";
import GameFrame from "@/components/games/GameFrame";
import GameResult from "@/components/games/GameResult";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { stories, storyBuilderLevel } from "./data";

function hideWord(sentence: string, answer: string) {
  const start = sentence.toLowerCase().indexOf(answer.toLowerCase());
  return start < 0 ? sentence : `${sentence.slice(0, start)}____${sentence.slice(start + answer.length)}`;
}

export default function StoryBuilderPage() {
  const [storyIndex, setStoryIndex] = useState(0);
  const [phase, setPhase] = useState<"read" | "recall" | "result">("read");
  const [blankIndex, setBlankIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [pickedCorrect, setPickedCorrect] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const story = stories[storyIndex];
  const score = Math.round((correct / storyBuilderLevel.blanks) * 100);

  useEffect(() => {
    setStoryIndex(Math.floor(Math.random() * stories.length));
  }, []);

  const reset = () => {
    setStoryIndex((current) => {
      const choices = stories.map((_, index) => index).filter((index) => index !== current);
      return choices[Math.floor(Math.random() * choices.length)];
    });
    setPhase("read");
    setBlankIndex(0);
    setCorrect(0);
    setPickedCorrect(null);
    setSelectedAnswer(null);
  };

  const choose = (answer: string) => {
    if (pickedCorrect !== null) return;
    const isCorrect = answer === story.blanks[blankIndex].answer;
    if (isCorrect) setCorrect((value) => value + 1);
    setSelectedAnswer(answer);
    setPickedCorrect(isCorrect);
  };

  const next = () => {
    if (blankIndex === story.blanks.length - 1) setPhase("result");
    else {
      setBlankIndex((value) => value + 1);
      setPickedCorrect(null);
      setSelectedAnswer(null);
    }
  };

  return (
    <GameFrame title="Story Builder" description="Read a short story, then remember a few details." instructions="Read the story at your own pace. Then choose the missing word from three options. There is no timer." level={1} totalLevels={1} score={score}>
      {phase === "result" ? (
        <GameResult gameId="story-builder" score={score} breakdown={{ skill: "Verbal Memory", correctAnswers: correct, totalBlanks: storyBuilderLevel.blanks }} onPlayAgain={reset} />
      ) : phase === "read" ? (
        <section className="mx-auto max-w-2xl" aria-labelledby="story-title">
          <p className="text-sm font-medium text-primary">Level 1 · Verbal Memory</p>
          <h2 id="story-title" className="mt-2 text-2xl font-semibold">{story.title}</h2>
          <ol className="mt-5 space-y-3">
            {story.sentences.map((sentence, index) => <li key={index} className="rounded-lg border bg-background p-4 text-lg leading-relaxed">{sentence}</li>)}
          </ol>
          <Button className="mt-6 min-h-12" onClick={() => setPhase("recall")}><Eye className="mr-2 h-4 w-4" />I’m ready to remember</Button>
        </section>
      ) : (
        <section className="mx-auto max-w-2xl" aria-live="polite">
          <p className="text-sm font-medium text-primary">Blank {blankIndex + 1} of {story.blanks.length}</p>
          <h2 className="mt-2 text-2xl font-semibold">{story.title}</h2>
          <ol className="mt-5 space-y-3">
            {story.sentences.map((sentence, index) => {
              const blank = story.blanks.find((item) => item.sentence === index);
              return <li key={index} className="rounded-lg border bg-background p-4 text-lg leading-relaxed">{blank ? hideWord(sentence, blank.answer) : sentence}</li>;
            })}
          </ol>
          <Card className="mt-6 p-5">
            <p className="mb-4 font-medium">Choose the missing word:</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {story.blanks[blankIndex].options.map((option) => {
                const selected = pickedCorrect !== null && option === story.blanks[blankIndex].answer;
                const wrong = pickedCorrect === false && option === selectedAnswer;
                return <button key={option} type="button" disabled={pickedCorrect !== null} onClick={() => choose(option)} className={`min-h-14 rounded-lg border-2 px-4 py-3 text-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-green-600 bg-green-50 text-green-900" : wrong ? "border-destructive/40 bg-destructive/5" : "border-border bg-background hover:border-primary"}`}>
                  {option}
                </button>;
              })}
            </div>
            {pickedCorrect !== null && <div className={`mt-4 flex items-center gap-2 font-medium ${pickedCorrect ? "text-green-700" : "text-muted-foreground"}`} role="status"><Check className="h-5 w-5" />{pickedCorrect ? "That’s right!" : `The missing word is “${story.blanks[blankIndex].answer}.”`}</div>}
            {pickedCorrect !== null && <Button className="mt-4 min-h-12" onClick={next}>{blankIndex === story.blanks.length - 1 ? "See my score" : "Next blank"}<Check className="ml-2 h-4 w-4" /></Button>}
          </Card>
          <Button variant="ghost" className="mt-2" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Start another story</Button>
        </section>
      )}
    </GameFrame>
  );
}
