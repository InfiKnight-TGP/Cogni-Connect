"use client";
import { useContext, useEffect, useState } from "react";
import GameShell, { PreviewContext } from "../_shared/GameShell";
import ChoiceSession from "../_shared/ChoiceSession";
import type { GameProps } from "../_shared/types";
import { apiFetch, API_URL } from "@/lib/api";
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
  const preview = useContext(PreviewContext);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await apiFetch(API_URL + "/journals", { cache: "no-store" });
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
            const transcriptResponse = await apiFetch(transcriptUrl, { cache: "no-store" });
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
  const eligible = memories.filter(memory => validMemoryDay(memory.day) && memory.day <= yesterday);
  const previewDay = preview && eligible.length ? eligible.reduce((latest, memory) => memory.day > latest ? memory.day : latest, eligible[0].day) : yesterday;
  const targets = eligible.filter(memory => memory.day === previewDay).slice(0, 5);
  const sample = preview && targets.length === 0;
  const sampleMemories: YesterdayMemory[] = [
    { id: "sample:tea", label: "You shared a cup of tea with your family.", day: yesterday },
    { id: "sample:market", label: "You went to the market and chose fresh vegetables.", day: yesterday },
    { id: "sample:music", label: "You listened to a familiar song at home.", day: yesterday },
  ];
  const roundMemories = sample ? sampleMemories : memories;
  const roundTargets = sample ? sampleMemories : targets;
  if (!roundTargets.length) return <p className="text-xl" role="status">{caregiver ? t("Add a video or a few people first.") : t("There isn't a saved memory from yesterday yet. Let's try another activity.")}</p>;
  return <div className="space-y-4">
    {preview && <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground" role="status">{sample ? "Example preview. This sample is not a saved memory." : `Previewing saved memories from ${previewDay}.`}</p>}
    <ChoiceSession game="yesterday-quiz" domain="Memory" count={roundTargets.length} finish={finish} makeRound={(index, knob) => ({ prompt: sample ? "Which sample memory sounds familiar?" : preview && previewDay !== yesterday ? "Which memory was saved on this day?" : "Which memory did you save yesterday?", answer: roundTargets[index].id, options: buildYesterdayChoices(roundMemories, roundTargets[index].id, knob, index) })} />
  </div>;
}

export default function YesterdayQuiz({ date, onFinish }: GameProps) {
  const now = new Date();
  const day = date ?? now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  return <GameShell gameId="yesterday-quiz" title="Remember yesterday" instructions="Think about a memory you saved. It is okay if you do not remember." level={1} skill="personal memory" date={day} onFinish={onFinish}>{finish => <Yesterday date={day} finish={finish} />}</GameShell>;
}
