"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, RefreshCw, Brain, Speech, User2 } from "lucide-react";
import { DatePickerWithPresets } from "./datePicker";
import { Separator } from "../ui/separator";

export default function StartQuiz({
  progress,
  setProgress,
  date,
  setDate,
  onRegenerateQuestions,
  onStartActivity,
}: {
  progress: number;
  setProgress: (progress: number) => void;
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  onRegenerateQuestions?: () => void;
  onStartActivity?: (activityIndex: number) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-medium">Start A Memory Quiz</div>
        {onRegenerateQuestions && (
          <Button
            onClick={onRegenerateQuestions}
            variant="outline"
            size="sm"
            className="ml-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate Questions
          </Button>
        )}
      </div>

      <div className="mb-2 mt-8">
        Select which date you'd like to be tested on:
      </div>
      <DatePickerWithPresets date={date} setDate={setDate} />

      <Separator className="my-8" />
      
      <div className="mb-4 text-xl font-medium">Choose an Activity:</div>
      <div className="grid w-full grid-cols-3 gap-4">
        <Card
          onClick={() => {
            onStartActivity ? onStartActivity(0) : setProgress(0);
          }}
          className="relative z-0 w-full cursor-pointer overflow-hidden border-primary bg-gradient-to-br from-background via-background to-primary/25 p-6 transition-all hover:shadow-lg"
        >
          <User2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="text-xl font-medium">
            Activity 1: <br />
            Facial Recognition
          </div>
          <Button className="mt-24">
            Start <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
        <Card
          onClick={() => {
            onStartActivity ? onStartActivity(1) : setProgress(1);
          }}
          className="relative z-0 w-full cursor-pointer overflow-hidden border-primary bg-gradient-to-br from-background via-background to-primary/25 p-6 transition-all hover:shadow-lg"
        >
          <Speech className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 -scale-x-100 text-primary opacity-30 dark:opacity-40" />
          <div className="text-xl font-medium">
            Activity 2: <br />
            Name Recall
          </div>
          <Button className="mt-24">
            Start <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
        <Card
          onClick={() => {
            onStartActivity ? onStartActivity(2) : setProgress(2);
          }}
          className="relative z-0 w-full cursor-pointer overflow-hidden border-primary bg-gradient-to-br from-background via-background to-primary/25 p-6 transition-all hover:shadow-lg"
        >
          <Brain className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="text-xl font-medium">
            Activity 3: <br />
            Relive Memories
          </div>
          <Button className="mt-24">
            Start <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      </div>
    </>
  );
}
