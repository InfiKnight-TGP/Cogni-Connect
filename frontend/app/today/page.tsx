"use client";

import { getGameById } from "@/components/games/registry";
import Nav from "@/components/nav";
import RightColumn from "@/components/rightColumn";
import TodayPath from "@/components/todayPath";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import {
  BookOpen,
  Brain,
  CalendarDays,
  Footprints,
  Hand,
  Link as LinkIcon,
  Map,
  Package,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { dayKey, toEntries } from "@/lib/progress";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";

interface Activity {
  id: string;
  level: 1 | 2 | 3;
}

interface ActivityMeta {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ACTIVITY_MAP: Record<string, ActivityMeta> = {
  daily_recall: { name: "My Day", icon: Brain },
  "story-builder": { name: "Story Time", icon: BookOpen },
  "plan-the-day": { name: "Plan My Day", icon: CalendarDays },
  "word-association": { name: "Word Pairs", icon: LinkIcon },
  "odd-one-out": { name: "Spot the Odd One", icon: Search },
  "mole-path": { name: "Path Memory", icon: Footprints },
  "sorting-station": { name: "Sorting", icon: Package },
  "whack-a-mole": { name: "Quick Tap", icon: Hand },
  "attention-hunt": { name: "Find It", icon: Target },
  "map-navigator": { name: "Find the Way", icon: Map },
};

function getActivityMeta(id: string): ActivityMeta {
  if (ACTIVITY_MAP[id]) return ACTIVITY_MAP[id];
  const reg = getGameById(id);
  return {
    name: reg?.name ?? "Activity",
    icon: Sparkles,
  };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning!";
  if (hour < 17) return "Good afternoon!";
  return "Good evening!";
}

export default function TodayPage() {
  const { t } = useTranslate();
  const router = useRouter();
  const [hello, setHello] = useState("");
  const [today, setToday] = useState("");
  const [plan, setPlan] = useState<Activity[] | null>(null);
  const [best, setBest] = useState<Record<string, number>>({}); // best score today per activity
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<Activity | null>(null);

  const load = useCallback(async (day: string) => {
    try {
      const [planRes, perfRes] = await Promise.all([
        fetch(`${API_URL}/daily-plan?date=${day}`),
        fetch(`${API_URL}/performance`),
      ]);
      if (!planRes.ok) throw new Error();
      const p = await planRes.json();
      setPlan(
        ([1, 2, 3] as const).flatMap((level) =>
          (p[`level${level}`] as string[]).map((id) => ({ id, level }))
        )
      );
      const perf = perfRes.ok ? await perfRes.json() : {};
      const scores: Record<string, number> = {};
      const add = (id: string, score: number) => (scores[id] = Math.max(scores[id] ?? 0, score));
      const dayEntries = toEntries(perf).filter((entry) => entry.day === day && entry.level !== undefined);
      const recallParts: Record<string, number> = {};
      let legacyRecall: number | undefined;
      dayEntries.forEach((entry) => {
        if (["face-recognition", "context-recall"].includes(entry.gameId)) {
          recallParts[entry.gameId] = Math.max(recallParts[entry.gameId] ?? 0, entry.score);
        } else if (entry.gameId === "daily_recall") {
          legacyRecall = Math.max(legacyRecall ?? 0, entry.score);
        } else {
          add(entry.gameId, entry.score);
        }
      });
      const recallIds = ["face-recognition", "context-recall"];
      if (legacyRecall !== undefined) {
        add("daily_recall", legacyRecall);
      } else if (recallIds.every((id) => recallParts[id] !== undefined)) {
        add("daily_recall", Math.round(recallIds.reduce((sum, id) => sum + recallParts[id], 0) / recallIds.length));
      }
      setBest(scores);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const day = dayKey(new Date());
    setHello(greeting());
    setToday(day);
    load(day);
  }, [load]);

  const game = playing ? getGameById(playing.id) : null;
  const Game = game?.component;

  if (playing && Game) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-screen-lg px-4 pb-16 pt-24 lg:pt-8">
          <Button
            variant="outline"
            className="mb-6 h-14 px-6 text-xl"
            onClick={() => {
              setPlaying(null);
              load(today);
            }}
          >
            ← {t("Back to my day")}
          </Button>
          <Game level={playing.level} date={today} />
        </main>
      </>
    );
  }

  const doneCount = plan ? plan.filter((a) => best[a.id] !== undefined).length : 0;
  const totalCount = plan ? plan.length : 0;

  return (
    <>
      <Nav />
      <div className="mx-auto flex max-w-screen-xl gap-8 px-4 pb-16 pt-24 lg:pt-8">
      <main className="min-w-0 flex-1 space-y-6">
        {/* Greeting & Progress */}
        <div className="space-y-1">
          <h1 className="text-4xl font-bold sm:text-5xl">{t(hello)}</h1>
          {plan !== null && !failed && (
            <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
              {t("{done} of {total} done today", { done: doneCount, total: totalCount })}
            </p>
          )}
        </div>

        {failed ? (
          <div className="space-y-4">
            <p className="text-2xl">{t("Sorry, we could not load your day.")}</p>
            <ReadAloud autoRead={false} text={t("Sorry, we could not load your day.")} />
            <Button className="h-14 max-w-full whitespace-normal break-words px-6 text-xl" onClick={() => load(today)}>
              {t("Try again")}
            </Button>
          </div>
        ) : plan === null ? (
          <p className="text-2xl">{t("Loading…")}</p>
        ) : (
          <TodayPath
            plan={plan}
            best={best}
            meta={getActivityMeta}
            onOpen={(activity: Activity) =>
              activity.id === "daily_recall" ? router.push("/quiz?start=today") : setPlaying(activity)
            }
          />
        )}
      </main>
      <RightColumn />
      </div>
    </>
  );
}
