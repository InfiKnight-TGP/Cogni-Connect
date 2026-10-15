"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameShell from "@/components/games/_shared/GameShell";
import { dateFromLocalKey, localDateKey } from "@/components/games/_shared/date";
import { saveScore } from "@/components/games/_shared/saveScore";
import PersonSelect from "./personSelect";
import ContextQuestions from "./contextQuestions";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";

const PARTS = [
  { id: "face-recognition", skill: "face recognition", title: "Face Recognition" },
  { id: "context-recall", skill: "personal memory", title: "Relive Memories" },
] as const;

export default function MyDayRunner() {
  const { t } = useTranslate();
  const router = useRouter();
  const [date] = useState(localDateKey());
  const [part, setPart] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [questionsReady, setQuestionsReady] = useState(false);
  const savingPart = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/generate-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    })
      .catch((error) => console.error("Could not prepare My Day questions:", error))
      .finally(() => {
        if (active) setQuestionsReady(true);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const completePart = async (score: number, finishBundle: (score: number) => void, sessionDate: string) => {
    if (savingPart.current) return;
    savingPart.current = true;
    const current = PARTS[part];
    const saved = await saveScore({
      date: sessionDate,
      game_id: current.id,
      level: 1,
      skill: current.skill,
      score,
    });
    if (!saved) {
      setSaveError(true);
      savingPart.current = false;
      return;
    }
    setSaveError(false);
    const nextScores = [...scores, score];
    setScores(nextScores);
    if (part === PARTS.length - 1) {
      finishBundle(Math.round(nextScores.reduce((sum, value) => sum + value, 0) / PARTS.length));
    } else {
      setPart((currentPart) => currentPart + 1);
    }
    savingPart.current = false;
  };

  return (
    <main className="mx-auto max-w-screen-lg space-y-6 px-4 pb-16 pt-24 lg:pt-8">
      <Button variant="outline" className="min-h-14 max-w-full whitespace-normal break-words px-6 text-xl" onClick={() => router.push("/today")}>
        <ArrowLeft className="mr-2 h-5 w-5 shrink-0" /> {t("Back to my day")}
      </Button>
      {!questionsReady ? (
        <p className="py-12 text-center text-xl text-muted-foreground" role="status">{t("Getting your day ready…")}</p>
      ) : <GameShell
        gameId="daily_recall"
        title={t("My Day")}
        instructions={t("Enjoy two gentle activities from your memories, one at a time.")}
        level={1}
        skill="personal memory"
        date={date}
        saveResult={false}
      >
        {(finishBundle, sessionDate) => (
          <div>
            <p className="mb-5 max-w-full break-words text-lg font-bold text-primary">{t("Part {part} of 2 · {activity}", { part: part + 1, activity: t(PARTS[part].title) })}</p>
            <ReadAloud kind="feedback" text={`${t("Part {part} of 2 · {activity}", { part: part + 1, activity: t(PARTS[part].title) })}. ${t(PARTS[part].title) === t("Face Recognition") ? t("On this day, who did you talk to? Select all that apply.") : t("Recall details from your memories.")}`} />
            {saveError && <><p role="alert" className="mb-4 text-base text-destructive">{t("Could not save this part. Please try again.")}</p><ReadAloud kind="feedback" text={t("Could not save this part. Please try again.")} /></>}
            {part === 0 ? (
              <PersonSelect
                date={dateFromLocalKey(sessionDate)}
                myDay
                standalone
                setProgress={() => {}}
                onComplete={(score) => void completePart(score, finishBundle, sessionDate)}
              />
            ) : (
              <ContextQuestions
                date={dateFromLocalKey(sessionDate)}
                myDay
                standalone
                setProgress={() => {}}
                onComplete={(score) => void completePart(score, finishBundle, sessionDate)}
              />
            )}
          </div>
        )}
      </GameShell>}
    </main>
  );
}
