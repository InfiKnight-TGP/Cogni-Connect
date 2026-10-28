"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Eye, RotateCcw } from "lucide-react";
import GameShell from "../_shared/GameShell";
import { GameProps } from "../_shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { stories, storyBuilderConfig, Story } from "./data";
import { hideWord } from "./logic";
import { VoiceQuestion } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/lib/interaction/useAnswerLog";
import type { AnswerInput } from "@/components/interaction/VoiceQuestion";
import { usePreferences, useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { readSkill } from "@/lib/interaction/events";
import { apiJSON } from "@/lib/api";
import { buildStorySession, type MemoryFact } from "./memoryStories";

function StoryBuilderSession({ onDone }: { onDone: (score: number) => void }) {
  const [knob] = useState(() => readSkill("story-builder").knob);
  const storyCount = knob === 4 ? 3 : 2;
  const blankCount = knob === 1 ? 2 : 3;
  const optionCount = knob === 1 ? 2 : knob === 2 ? 3 : 4;
  const { t } = useTranslate();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [factsReady, setFactsReady] = useState(false);
  const [sessionStories, setSessionStories] = useState<Story[]>([]);
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [phase, setPhase] = useState<"read" | "recall">("read");
  const [blankIndex, setBlankIndex] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [pickedCorrect, setPickedCorrect] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const { preferences } = usePreferences();

  useEffect(() => {
    let active = true;
    apiJSON<{ facts?: MemoryFact[] }>("/memories/facts", { authRedirect: false })
      .then(data => { if (active) setFacts(Array.isArray(data.facts) ? data.facts : []); })
      .catch(() => { if (active) setFacts([]); })
      .finally(() => {
        if (active) setFactsReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (factsReady) setSessionStories(buildStorySession(facts, stories, storyCount, optionCount));
  }, [factsReady, facts, storyCount, optionCount]);

  const story = sessionStories[currentStoryIdx];
  const totalBlanks = storyCount * blankCount;
  const logAnswer = useAnswerLog("story-builder", "verbal-memory", `${currentStoryIdx}-${blankIndex}`, knob, true);

  const sentenceText = (item: Story, index: number) => {
    if (!item.personal) return item.sentences[index];
    if (index === 0) return t("On {weekday}, you went to {place}.", { weekday: t(item.personal.weekday), place: item.personal.place });
    if (index === 1) return t("You were with {person}.", { person: item.personal.person });
    if (index === 2) return item.personal.activity || t("You saved this memory.");
    return t("This is a memory from your day.");
  };

  const reset = () => {
    setSessionStories(buildStorySession(facts, stories, storyCount, optionCount));
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
    if (blankIndex < Math.min(blankCount, story.blanks.length) - 1) {
      setBlankIndex((value) => value + 1);
      setPickedCorrect(null);
      setSelectedAnswer(null);
    } else if (currentStoryIdx < sessionStories.length - 1) {
      // Advance to 2nd story
      setCurrentStoryIdx((value) => value + 1);
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

  if (!factsReady || !story) return <p className="py-12 text-center text-xl">{t("Getting your story ready…")}</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between border-b pb-3">
        <span className="text-sm font-semibold text-primary">
          {t("Story {number} of {total}", { number: currentStoryIdx + 1, total: sessionStories.length })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("Blanks completed: {done} / {total}", { done: currentStoryIdx * blankCount + (phase === "recall" ? blankIndex : 0), total: totalBlanks })}
        </span>
      </div>

      {phase === "read" ? (
        <section aria-labelledby="story-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="story-title" className="text-2xl font-semibold">
              {story.personal ? t(story.title) : story.title}
            </h2>
          </div>
          <ReadAloud text={story.personal ? t(story.title) : story.title} />
          <VoiceQuestion question={`${story.personal ? t(story.title) : story.title}. ${story.sentences.map((sentence, index) => story.personal ? sentenceText(story, index) : sentence).join(" ")}`} />
          <ol className="mt-5 space-y-3">
            {story.sentences.map((sentence, index) => (
              <li key={index} className="rounded-lg border bg-background p-4 text-lg leading-relaxed">
                {story.personal ? sentenceText(story, index) : sentence}
              </li>
            ))}
          </ol>
          <Button className="mt-6 min-h-12 w-full sm:w-auto" onClick={() => setPhase("recall")}>
            <Eye className="mr-2 h-4 w-4" /> {t("I'm ready to remember")}
          </Button>
        </section>
      ) : (
        <section aria-live="polite">
          <p className="text-sm font-medium text-primary">
            {t("Blank {number} of {total} (Story {story})", { number: blankIndex + 1, total: Math.min(blankCount, story.blanks.length), story: currentStoryIdx + 1 })}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{story.personal ? t(story.title) : story.title}</h2>
          <ol className="mt-5 space-y-3">
            {story.sentences.map((sentence, index) => {
              const blank = story.blanks.find((item) => item.sentence === index && story.blanks.indexOf(item) === blankIndex);
              const visibleSentence = story.personal ? sentenceText(story, index) : sentence;
              return (
                <li key={index} className="rounded-lg border bg-background p-4 text-lg leading-relaxed">
                  {blank ? hideWord(visibleSentence, blank.answer) : visibleSentence}
                </li>
              );
            })}
          </ol>
          <Card className="mt-6 p-5">
            <p className="mb-4 font-medium">{t("Choose the missing word:")}</p>
            <ReadAloud text={t("Choose the missing word:")} options={story.blanks[blankIndex].options.slice(0, optionCount).map(option => story.personal ? t(option) : option)} />
            <VoiceQuestion question={`${hideWord(sentenceText(story, story.blanks[blankIndex].sentence), story.blanks[blankIndex].answer)} ${t("Choose the missing word:")}`} options={story.blanks[blankIndex].options.slice(0, optionCount).map((option, index) => ({ id: String(index), label: story.personal ? t(option) : option }))} onMatched={(option, input) => choose(story.blanks[blankIndex].options[Number(option.id)], input)} />
            <div className="grid gap-3 sm:grid-cols-3">
              {story.blanks[blankIndex].options.slice(0, optionCount).map((option) => {
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
                        ? "border-amber-500/50 bg-amber-100/50 dark:bg-amber-950/40"
                        : "border-border bg-background hover:border-primary"
                    }`}
                  >
                    {story.personal ? t(option) : option}
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
                  ? preferences.encouragingMessages ? t("That's right!") : ""
                  : t("The missing word is {answer}.", { answer: story.blanks[blankIndex].answer })}
              </div>
            )}
            {pickedCorrect !== null && <ReadAloud kind="feedback" text={pickedCorrect ? preferences.encouragingMessages ? t("That's right!") : t("The missing word is {answer}.", { answer: story.blanks[blankIndex].answer }) : t("The missing word is {answer}.", { answer: story.blanks[blankIndex].answer })} />}
            {pickedCorrect !== null && (
              <Button className="mt-4 min-h-12 w-full sm:w-auto" onClick={next}>
                {blankIndex < Math.min(blankCount, story.blanks.length) - 1
                  ? t("Next blank")
                  : currentStoryIdx < sessionStories.length - 1
                  ? t("Next story")
                  : t("Finish Game")}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            )}
          </Card>
          <Button variant="ghost" className="mt-4" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> {t("Start another session")}
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
