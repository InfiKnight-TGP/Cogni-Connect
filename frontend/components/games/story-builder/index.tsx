"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Eye, RotateCcw, Volume2 } from "lucide-react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { stories, storyBuilderConfig, Story } from "./data";
import { hideWord } from "./logic";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";

function getRandomPair<T>(array: T[]): [T, T] {
  const firstIndex = Math.floor(Math.random() * array.length);
  let secondIndex = Math.floor(Math.random() * array.length);
  while (secondIndex === firstIndex && array.length > 1) {
    secondIndex = Math.floor(Math.random() * array.length);
  }
  return [array[firstIndex], array[secondIndex]];
}

function StoryBuilderSession({ onDone }: { onDone: (score: number) => void }) {
  const [sessionStories, setSessionStories] = useState<[Story, Story]>(() => getRandomPair(stories));
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [phase, setPhase] = useState<"read" | "recall">("read");
  const [blankIndex, setBlankIndex] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [pickedCorrect, setPickedCorrect] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const story = sessionStories[currentStoryIdx];
  const totalBlanks = storyBuilderConfig.totalBlanks; // 6
  const logAnswer = useAnswerLog("story-builder", "Memory", `${currentStoryIdx}:${phase}:${blankIndex}`, 1);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setCanSpeak(true);
    }
  }, []);

  const stopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  useEffect(() => {
    return () => stopSpeech();
  }, [currentStoryIdx, phase]);

  const handleReadAloud = () => {
    if (!canSpeak) return;
    stopSpeech();
    const textToRead = `${story.title}. ${story.sentences.join(" ")}`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = "en-IN";
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const reset = () => {
    stopSpeech();
    setSessionStories(getRandomPair(stories));
    setCurrentStoryIdx(0);
    setPhase("read");
    setBlankIndex(0);
    setTotalCorrect(0);
    setPickedCorrect(null);
    setSelectedAnswer(null);
  };

  const choose = (answer: string, input: AnswerInput = { method: "tap", responseMs: null }) => {
    if (pickedCorrect !== null) return;
    const isCorrect = answer === story.blanks[blankIndex].answer;
    logAnswer(isCorrect, input);
    if (isCorrect) setTotalCorrect((value) => value + 1);
    setSelectedAnswer(answer);
    setPickedCorrect(isCorrect);
  };

  const next = () => {
    stopSpeech();
    if (blankIndex < story.blanks.length - 1) {
      setBlankIndex((value) => value + 1);
      setPickedCorrect(null);
      setSelectedAnswer(null);
    } else if (currentStoryIdx === 0) {
      // Advance to 2nd story
      setCurrentStoryIdx(1);
      setPhase("read");
      setBlankIndex(0);
      setPickedCorrect(null);
      setSelectedAnswer(null);
    } else {
      // Session finished
      const finalScore = Math.round((totalCorrect / totalBlanks) * 100);
      onDone(finalScore);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between border-b pb-3">
        <span className="text-sm font-semibold text-primary">
          Story {currentStoryIdx + 1} of 2
        </span>
        <span className="text-sm text-muted-foreground">
          Blanks completed: {currentStoryIdx * 3 + (phase === "recall" ? blankIndex : 0)} / {totalBlanks}
        </span>
      </div>

      {phase === "read" ? (
        <section aria-labelledby="story-title">
          <VoiceQuestion prompt={`${story.title}. ${story.sentences.join(" ")}. Say ready when you want to remember.`} translatePrompt={false} options={[{ id: "ready", label: "Ready", synonyms: ["I am ready", "remember"] }]} onAnswer={() => { stopSpeech(); setPhase("recall"); }} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="story-title" className="text-2xl font-semibold">
              {story.title}
            </h2>
            {canSpeak && (
              <Button
                variant={isSpeaking ? "default" : "outline"}
                size="sm"
                onClick={handleReadAloud}
              >
                <Volume2 className="mr-2 h-4 w-4" />
                {isSpeaking ? "Speaking…" : "Read aloud"}
              </Button>
            )}
          </div>
          <ol className="mt-5 space-y-3">
            {story.sentences.map((sentence, index) => (
              <li key={index} className="rounded-lg border bg-background p-4 text-lg leading-relaxed">
                {sentence}
              </li>
            ))}
          </ol>
          <Button className="mt-6 min-h-12 w-full sm:w-auto" onClick={() => { stopSpeech(); setPhase("recall"); }}>
            <Eye className="mr-2 h-4 w-4" /> I’m ready to remember
          </Button>
        </section>
      ) : (
        <section aria-live="polite">
          <p className="text-sm font-medium text-primary">
            Blank {blankIndex + 1} of {story.blanks.length} (Story {currentStoryIdx + 1})
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{story.title}</h2>
          <ol className="mt-5 space-y-3">
            {story.sentences.map((sentence, index) => {
              const blank = story.blanks.find((item) => item.sentence === index);
              return (
                <li key={index} className="rounded-lg border bg-background p-4 text-lg leading-relaxed">
                  {blank ? hideWord(sentence, blank.answer) : sentence}
                </li>
              );
            })}
          </ol>
          <Card className="mt-6 p-5">
            <p className="mb-4 font-medium">Choose the missing word:</p>
            <VoiceQuestion prompt={`Choose the missing word. ${hideWord(story.sentences[story.blanks[blankIndex].sentence], story.blanks[blankIndex].answer)}`} translatePrompt={false} translateOptions={false} options={story.blanks[blankIndex].options.map(label => ({ id: label, label }))} onAnswer={choose} disabled={pickedCorrect !== null} />
            <div className="grid gap-3 sm:grid-cols-3">
              {story.blanks[blankIndex].options.map((option) => {
                const selected = pickedCorrect !== null && option === story.blanks[blankIndex].answer;
                const wrong = pickedCorrect === false && option === selectedAnswer;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={pickedCorrect !== null}
                    onClick={() => choose(option)}
                    className={`min-h-14 rounded-lg border-2 px-4 py-3 text-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? "border-green-600 bg-green-50 text-green-900"
                        : wrong
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border bg-background hover:border-primary"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {pickedCorrect !== null && (
              <div
                className={`mt-4 flex items-center gap-2 font-medium ${
                  pickedCorrect ? "text-green-700" : "text-muted-foreground"
                }`}
                role="status"
              >
                <Check className="h-5 w-5" />
                {pickedCorrect
                  ? "That’s right!"
                  : `The missing word is “${story.blanks[blankIndex].answer}.”`}
              </div>
            )}
            {pickedCorrect !== null && (
              <Button className="mt-4 min-h-12 w-full sm:w-auto" onClick={next}>
                {blankIndex === story.blanks.length - 1 && currentStoryIdx === 1
                  ? "Finish Game"
                  : blankIndex === story.blanks.length - 1
                  ? "Next story"
                  : "Next blank"}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            )}
          </Card>
          <Button variant="ghost" className="mt-4" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Start another session
          </Button>
        </section>
      )}
    </div>
  );
}

export default function StoryBuilder({
  level = 1,
  date = format(new Date(), "yyyy-MM-dd"),
  onFinish,
}: GameProps) {
  return (
    <GameShell
      gameId="story-builder"
      title="Story Builder"
      instructions="Read the story at your own pace. Then choose the missing word from three options."
      level={1}
      skill="verbal memory"
      date={date}
      onFinish={onFinish}
    >
      {(handleFinish) => <StoryBuilderSession onDone={handleFinish} />}
    </GameShell>
  );
}
