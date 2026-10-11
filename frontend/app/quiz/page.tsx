"use client";

import { useState, useEffect } from "react";

import StartQuiz from "@/components/quiz/start";
import PersonSelect from "@/components/quiz/personSelect";
import NamePeople from "@/components/quiz/namePeople";
import ContextQuestions from "@/components/quiz/contextQuestions";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { getOrStartSession } from "@/lib/sessions";
import type { ActivityResult } from "@/lib/game-scores";

export default function Page() {
  const [progress, setProgress] = useState(-1);
  const [date, setDate] = useState<Date>(new Date());
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionsGenerated, setQuestionsGenerated] = useState(false);
  
  // Track scores from all activities
  const [activityResults, setActivityResults] = useState({
    activity1: null as ActivityResult | null,
    activity2: null as ActivityResult | null,
    activity3: null as ActivityResult | null,
  });
  const [activityStartedAt, setActivityStartedAt] = useState<Record<number, string>>({});

  const beginActivity = (activityIndex: number) => {
    getOrStartSession();
    setActivityStartedAt((current) => ({ ...current, [activityIndex]: new Date().toISOString() }));
    setProgress(activityIndex);
  };

  // Auto-generate questions on mount
  useEffect(() => {
    generateQuestions();
  }, []);

  // Regenerate questions when date changes (only if user is on the start screen)
  useEffect(() => {
    if (progress === -1 && questionsGenerated) {
      generateQuestions();
    }
  }, [date]);

  const generateQuestions = async () => {
    setGeneratingQuestions(true);
    try {
      const response = await fetch("http://localhost:5000/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: date.toISOString()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setQuestionsGenerated(true);
      } else {
        console.error("Failed to generate questions");
      }
    } catch (error) {
      console.error("Error generating questions:", error);
    } finally {
      setGeneratingQuestions(false);
    }
  };

  return (
    <>
      <Nav />

      <main className="flex min-h-screen w-screen items-start justify-center overflow-x-hidden pt-24">
        <div className="flex h-full w-full max-w-screen-lg flex-col items-start justify-start px-4">
          {generatingQuestions && progress <= -1 ? (
            <div className="flex w-full flex-col items-center justify-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-lg font-medium">
                Generating personalized quiz questions from your videos...
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                This may take a moment
              </p>
            </div>
          ) : progress <= -1 ? (
            <StartQuiz
              progress={progress}
              setProgress={setProgress}
              date={date}
              setDate={setDate}
              onRegenerateQuestions={generateQuestions}
              onStartActivity={beginActivity}
            />
          ) : progress === 0 ? (
            <PersonSelect 
              setProgress={setProgress} 
              date={date} 
              setActivityScore={(result) => setActivityResults(prev => ({ ...prev, activity1: result }))}
            />
          ) : progress === 1 ? (
            <NamePeople 
              setProgress={setProgress} 
              date={date}
              setActivityScore={(result) => setActivityResults(prev => ({ ...prev, activity2: result }))}
            />
          ) : progress === 2 ? (
            <ContextQuestions 
              setProgress={setProgress} 
              date={date}
              activityResults={activityResults}
              activityStartedAt={activityStartedAt}
              startedAt={activityStartedAt[2]}
              setActivityScore={(result) => setActivityResults(prev => ({ ...prev, activity3: result }))}
            />
          ) : null}
        </div>
      </main>
    </>
  );
}
