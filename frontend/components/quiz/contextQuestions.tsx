"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Brain, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";

import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VideoModal from "../videoModal";
import { format } from "date-fns";
import { API_URL } from "@/lib/api";
import { isCaregiverUnlocked } from "@/lib/mode";
import { VoiceQuestion } from "@/components/interaction/VoiceQuestion";

export default function ContextQuestions({
  setProgress,
  date,
  myDay = false,
  standalone = false,
  activityScores,
  setActivityScore,
  onComplete,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date: Date;
  myDay?: boolean; // "My Day" from the Today page: no date, "Part X of 2"
  standalone?: boolean;
  activityScores?: {
    activity1: number | null;
    activity2: number | null;
    activity3: number | null;
  };
  setActivityScore?: (score: number) => void;
  onComplete?: (score: number) => void;
}) {
  const [tab, setTab] = useState("1");
  const [feedback, setFeedback] = useState<{submitted: boolean; feedback: number}[]>([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [computedScore, setComputedScore] = useState(0);

  // Load questions from backend
  const [data, setData] = useState<
    { question: string; answer: string; video: string }[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);

  // Fetch questions from backend
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const response = await fetch(`${API_URL}/questions`);
        if (response.ok) {
          const result = await response.json();
          const questions = result.questions || [];
          if (questions.length === 0) {
            console.log("No questions found in qas.json");
          }
          setData(questions);
          // Initialize feedback array based on number of questions
          setFeedback(questions.map(() => ({ submitted: false, feedback: -1 })));
        } else {
          console.error("Failed to fetch questions, status:", response.status);
        }
      } catch (error) {
        console.error("Error fetching questions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, []);

  // Check if ALL questions are answered to enable "Finish Quiz" button
  useEffect(() => {
    if (data.length === 0) return;
    const allSubmitted = feedback.slice(0, data.length).every(f => f.submitted);
    setCanProceed(allSubmitted);
  }, [feedback, data.length]);

  // Check if all questions are answered and save performance
  useEffect(() => {
    if (data.length === 0) return;
    
    const allSubmitted = feedback.slice(0, data.length).every(f => f.submitted);
    if (allSubmitted && !quizCompleted) {
      setQuizCompleted(true);
      
      // Calculate average score for Activity 3 (Context Questions)
      const totalScore = feedback.slice(0, data.length).reduce((sum, f) => sum + f.feedback, 0);
      const activity3Score = (totalScore / data.length) * 10; // Convert to percentage
      
      // Report Activity 3 score
      const finalScore = Math.round(activity3Score);
      setComputedScore(finalScore);
      if (setActivityScore) {
        setActivityScore(finalScore);
      }

      if (standalone) {
        return;
      }
      
      // Calculate combined score from all non-null activity scores
      const validScores = [
        activityScores?.activity1,
        activityScores?.activity2,
        Math.round(activity3Score)
      ].filter((score): score is number => score !== null && score !== undefined && !isNaN(score));
      
      if (validScores.length > 0 && !isCaregiverUnlocked()) {
        const combinedScore = Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length);
        
        // Save combined performance to backend
        fetch(`${API_URL}/performance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
              source: "patient",
            score: combinedScore,
            date: format(date, "yyyy-MM-dd"),
            game_id: "daily_recall",
            level: 1,
            skill: "personal memory",
            breakdown: {
              activity1_faceRecognition: activityScores?.activity1,
              activity2_namePeople: activityScores?.activity2,
              activity3_contextQuestions: Math.round(activity3Score),
            }
          }),
        }).catch(err => console.error("Error saving performance:", err));
      }
    }
  }, [feedback, quizCompleted, date, data.length, activityScores, setActivityScore, standalone, onComplete]);

  // Commented out the API fetch since we're using dummy data
  /*
  useEffect(() => {
    const getData = async () => {
      const res = await fetch("/api/questions", {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      const data = await res.json();
      setData(data.data);
    };

    getData();
  }, []);
  */

  return (
    <>
      {data && data[parseInt(tab) - 1]?.video ? (
        <VideoModal
          path={data[parseInt(tab) - 1].video.replaceAll("\\", "/")}
          open={open}
          setOpen={setOpen}
        />
      ) : null}
      {!standalone && <div className="flex w-full items-center justify-start">
        <Button
          variant="secondary"
          onClick={() => setProgress(-1)}
          className="mr-6 min-h-[48px] px-5 text-lg"
        >
          <ArrowLeft className="mr-2 h-5 w-5" /> Back
        </Button>
        <div className="text-xl font-medium">
          {myDay ? (
            "My Day"
          ) : (
            <>
              Daily Recall —{" "}
              <span className="text-blue-600 dark:text-blue-400">
                {format(date, "EEE d MMM yyyy")}
              </span>
            </>
          )}
        </div>
        <Badge className="ml-4 h-8 px-4">{myDay ? "Part 2 of 2" : "Part 3"}</Badge>
      </div>}

      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading questions...
        </div>
      ) : data.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center space-y-4">
          <p className="text-center text-muted-foreground">
            No videos recorded on this date
          </p>
          <Button
            size="lg"
            onClick={() => standalone ? onComplete?.(0) : setProgress(-1)}
            className="text-lg font-medium transition-all"
          >
            Finish <ArrowRight className="ml-3 h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(value) => {
            // Only allow switching to tabs that are unlocked (previous question answered)
            const newIndex = parseInt(value) - 1;
            if (newIndex === 0 || feedback[newIndex - 1]?.submitted) {
              setTab(value);
            }
          }} className={`mt-8 w-full max-w-4xl`}>
            <TabsList className={`grid w-full ${
              data.length === 1 ? 'grid-cols-1' :
              data.length === 2 ? 'grid-cols-2' :
              data.length === 3 ? 'grid-cols-3' :
              data.length === 4 ? 'grid-cols-4' :
              'grid-cols-5'
            }`}>
              {data.map((_, index) => {
                const isUnlocked = index === 0 || feedback[index - 1]?.submitted;
                return (
                  <TabsTrigger 
                    key={index + 1} 
                    value={String(index + 1)}
                    disabled={!isUnlocked}
                    className={!isUnlocked ? 'opacity-50 cursor-not-allowed' : ''}
                  >
                    Question {index + 1}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {data && data[parseInt(tab) - 1] ? (
            <Question
              feedback={feedback}
              setFeedback={setFeedback}
              n={tab}
              data={data[parseInt(tab) - 1]}
              setOpen={setOpen}
              totalQuestions={data.length}
              setTab={setTab}
            />
          ) : null}
          
          {canProceed && (
            <div className="mt-8 flex justify-center">
              <Button
                onClick={() => standalone ? onComplete?.(computedScore) : setProgress(-1)}
                size="lg"
                className="min-h-[48px] px-6 text-lg font-medium"
              >
                Finish <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Question({
  n,
  feedback,
  setFeedback,
  data,
  setOpen,
  totalQuestions,
  setTab,
}: {
  n: string;
  feedback: {
    submitted: boolean;
    feedback: number;
  }[];
  setFeedback: React.Dispatch<
    React.SetStateAction<
      {
        submitted: boolean;
        feedback: number;
      }[]
    >
  >;
  data: { question: string; answer: string; video: string };
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  totalQuestions: number;
  setTab: React.Dispatch<React.SetStateAction<string>>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async () => {
    try {
      const res = await fetch("/api/accuracy", {
        method: "POST",
        body: JSON.stringify({
          given: value,
          real: data.answer,
          video: data.video,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      const jsonData = await res.json();
      const scoreValue = Number(jsonData.data);
      if (!res.ok || !Number.isInteger(scoreValue) || scoreValue < 0 || scoreValue > 10) {
        throw new Error("Answer evaluation is unavailable. Your answer is kept and has not been scored. Please try again when an evaluator is configured.");
      }

      const newFeedback = [...feedback];
      newFeedback[parseInt(n) - 1].submitted = true;
      newFeedback[parseInt(n) - 1].feedback = scoreValue;
      setFeedback(newFeedback);
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  const goToNextQuestion = () => {
    const currentIndex = parseInt(n) - 1;
    if (currentIndex < totalQuestions - 1) {
      setTab(String(currentIndex + 2)); // Move to next question
    }
  };

  return (
    <>
      <div className="mt-8 text-2xl font-medium">
        <span className="text-blue-600">Question {n}.</span> {data?.question}
      </div>
      <VoiceQuestion question={data?.question ?? ""} onTranscript={setValue} />
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        placeholder="Answer the question here."
        className="mt-8 h-12 max-h-36 w-full text-lg"
      />
      <Button
        onClick={() => onSubmit()}
        size="lg"
        disabled={feedback[parseInt(n) - 1].submitted || value === ""}
        className="mt-8 text-lg font-medium"
      >
        Submit <ArrowRight className="ml-3 h-4 w-4" />
      </Button>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

      {feedback[parseInt(n) - 1].submitted ? (
        <Card className="mt-6 w-full p-6">
          <div className="mb-4 text-lg">
            Accuracy of your response:{" "}
            <span className="font-semibold">
              {feedback[parseInt(n) - 1].feedback}/10
            </span>
          </div>
          <div className="flex gap-4">
            <Button
              onClick={() => {
                setOpen(true);
              }}
              className="text-lg font-medium"
              size="lg"
              variant="outline"
            >
              <PlayCircle className="mr-3 h-4 w-4" /> Watch Memory
            </Button>
            {parseInt(n) < totalQuestions && (
              <Button
                onClick={goToNextQuestion}
                className="text-lg font-medium"
                size="lg"
              >
                Next Question <ArrowRight className="ml-3 h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      ) : null}
    </>
  );
}
