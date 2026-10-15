"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, RefreshCw, Brain, Speech, User2 } from "lucide-react";
import { DatePickerWithPresets } from "./datePicker";
import { Separator } from "../ui/separator";
import { translate } from "@/lib/interaction/locale";
import { useInteraction } from "@/components/interaction/InteractionProvider";

export default function StartQuiz({
  progress,
  setProgress,
  date,
  setDate,
  onRegenerateQuestions,
}: {
  progress: number;
  setProgress: (progress: number) => void;
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  onRegenerateQuestions?: () => void;
}) {
  const { locale } = useInteraction();
  const tr = (phrase: string) => translate(locale, phrase);
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-medium">{tr("Daily Recall")}</div>
        {onRegenerateQuestions && (
          <Button
            onClick={onRegenerateQuestions}
            variant="outline"
            size="sm"
            className="ml-4 min-h-[48px] px-4 text-base"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {tr("Refresh")}
          </Button>
        )}
      </div>

      <div className="mb-2 mt-8 text-lg font-medium">
        {tr("Select a day:")}
      </div>
      <DatePickerWithPresets date={date} setDate={setDate} />

      <Separator className="my-8" />
      
      <div className="mb-4 text-xl font-medium">{tr("Choose an Activity:")}</div>
      <div className="grid w-full grid-cols-3 gap-4">
        <Card
          onClick={() => {
            setProgress(0);
          }}
          className="relative z-0 w-full cursor-pointer overflow-hidden border-primary bg-gradient-to-br from-background via-background to-primary/25 p-6 transition-all hover:shadow-lg"
        >
          <User2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="text-xl font-medium">
            Part 1: <br />
            {tr("Facial Recognition")}
          </div>
          <Button className="mt-24 min-h-[48px] px-6 text-lg font-medium">
            {tr("Start")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
        <Card
          onClick={() => {
            setProgress(1);
          }}
          className="relative z-0 w-full cursor-pointer overflow-hidden border-primary bg-gradient-to-br from-background via-background to-primary/25 p-6 transition-all hover:shadow-lg"
        >
          <Speech className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 -scale-x-100 text-primary opacity-30 dark:opacity-40" />
          <div className="text-xl font-medium">
            Part 2: <br />
            {tr("Name Recall")}
          </div>
          <Button className="mt-24 min-h-[48px] px-6 text-lg font-medium">
            {tr("Start")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
        <Card
          onClick={() => {
            setProgress(2);
          }}
          className="relative z-0 w-full cursor-pointer overflow-hidden border-primary bg-gradient-to-br from-background via-background to-primary/25 p-6 transition-all hover:shadow-lg"
        >
          <Brain className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />
          <div className="text-xl font-medium">
            Part 3: <br />
            {tr("Relive Memories")}
          </div>
          <Button className="mt-24 min-h-[48px] px-6 text-lg font-medium">
            {tr("Start")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      </div>
    </>
  );
}
