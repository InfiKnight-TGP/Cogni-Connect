"use client";

import { useState, useEffect } from "react";

import StartQuiz from "@/components/quiz/start";
import PersonSelect from "@/components/quiz/personSelect";
import NamePeople from "@/components/quiz/namePeople";
import ContextQuestions from "@/components/quiz/contextQuestions";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { API_URL } from "@/lib/api";

export default function Page() {
  const [progress, setProgress] = useState(-1);
  const [date, setDate] = useState<Date>(new Date());
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionsGenerated, setQuestionsGenerated] = useState(false);
  
  // Track scores from all activities
  const [activityScores, setActivityScores] = useState({
    activity1: null as number | null, // Face Recognition (0-100)
    activity2: null as number | null, // Name People (0-100)
    activity3: null as number | null, // Context Questions (0-100)
  });

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
      const response = await fetch(`${API_URL}/generate-questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: format(date, "yyyy-MM-dd")
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
            />
          ) : progress === 0 ? (
            <PersonSelect 
              setProgress={setProgress} 
              date={date} 
              setActivityScore={(score) => setActivityScores(prev => ({ ...prev, activity1: score }))}
            />
          ) : progress === 1 ? (
            <NamePeople 
              setProgress={setProgress} 
              date={date}
              setActivityScore={(score) => setActivityScores(prev => ({ ...prev, activity2: score }))}
            />
          ) : progress === 2 ? (
            <ContextQuestions 
              setProgress={setProgress} 
              date={date}
              activityScores={activityScores}
              setActivityScore={(score) => setActivityScores(prev => ({ ...prev, activity3: score }))}
            />
          ) : null}
        </div>
      </main>
    </>
  );
}
