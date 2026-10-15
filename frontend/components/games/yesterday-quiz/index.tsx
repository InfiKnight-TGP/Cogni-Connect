"use client";
import { useEffect, useState } from "react";
import GameShell from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import { API_URL } from "@/lib/api";
import { buildYesterdayChoices, validMemoryDay, type YesterdayMemory } from "@/lib/interaction/yesterday-quiz";
import { useTranslate } from "@/components/interaction/InteractionProvider";

type Journal = { date?: string; entry?: string; video_path?: string };
function localDay(value?: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function Yesterday({ date, finish }: { date: string; finish: (score: number) => void }) {
  const [memories, setMemories] = useState<YesterdayMemory[] | null>(null);
  const { t, caregiver } = useTranslate();
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(API_URL + "/journals", { cache: "no-store" });
        if (!response.ok) throw new Error("journals unavailable");
        const journals = await response.json() as Record<string, Journal>;
        const targetDay = new Date(date + "T12:00:00");
        targetDay.setDate(targetDay.getDate() - 1);
        const yesterday = targetDay.getFullYear() + "-" + String(targetDay.getMonth() + 1).padStart(2, "0") + "-" + String(targetDay.getDate()).padStart(2, "0");
        const rows: YesterdayMemory[] = [];
        await Promise.all(Object.entries(journals).map(async ([filename, journal]) => {
          const day = localDay(journal.date);
          if (!day || day > yesterday) return;
          const entry = typeof journal.entry === "string" ? journal.entry.trim() : "";
          if (entry) rows.push({ id: "journal:" + filename, label: entry, day });
          const videoName = filename.replace(/\.[^.]+$/, "");
          try {
            const transcriptUrl = API_URL + "/video_chunks/" + encodeURIComponent(videoName + "_chunks") + "/full_transcript.json";
            const transcriptResponse = await fetch(transcriptUrl, { cache: "no-store" });
            if (!transcriptResponse.ok) return;
            const transcripts = await transcriptResponse.json() as Record<string, unknown>;
            const summary = Object.values(transcripts).filter((value): value is string => typeof value === "string" && value.trim().length > 12).join(" ").trim();
            if (summary) rows.push({ id: "video:" + filename, label: summary.slice(0, 320), day });
          } catch { /* The journal remains useful when no transcript is saved. */ }
        }));
        const unique = rows.filter((memory, index) => rows.findIndex(item => item.day === memory.day && item.label.trim().toLowerCase() === memory.label.trim().toLowerCase()) === index);
        if (!cancelled) setMemories(unique);
      } catch { if (!cancelled) setMemories([]); }
    };
    void load();
    return () => { cancelled = true; };
  }, [date]);

  if (memories === null) return <p className="text-xl">{t("Loading…")}</p>;
  const targetDate = new Date(date + "T12:00:00");
  targetDate.setDate(targetDate.getDate() - 1);
  const yesterday = targetDate.getFullYear() + "-" + String(targetDate.getMonth() + 1).padStart(2, "0") + "-" + String(targetDate.getDate()).padStart(2, "0");
  const targets = memories.filter(memory => validMemoryDay(memory.day) && memory.day === yesterday).slice(0, 5);
  if (!targets.length) return <p className="text-xl" role="status">{caregiver ? t("Add a video or a few people first.") : t("There isn't a saved memory from yesterday yet. Let's try another activity.")}</p>;
  return <ChoiceSession game="yesterday-quiz" domain="Memory" count={targets.length} finish={finish} makeRound={(index, knob) => ({ prompt: "Which memory did you save yesterday?", answer: targets[index].id, options: buildYesterdayChoices(memories, targets[index].id, knob, index) })} />;
}

export default function YesterdayQuiz({ date, onFinish }: GameProps) {
  const now = new Date();
  const day = date ?? now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  return <GameShell gameId="yesterday-quiz" title="Remember yesterday" instructions="Think about a memory you saved. It is okay if you do not remember." level={1} skill="personal memory" date={day} onFinish={onFinish}>{finish => <Yesterday date={day} finish={finish} />}</GameShell>;
}
