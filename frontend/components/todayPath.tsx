"use client";

import React from "react";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { translate } from "@/lib/interaction/locale";

interface Activity {
  id: string;
  level: 1 | 2 | 3;
}

interface ActivityMeta {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TodayPathProps {
  plan: Activity[];
  best: Record<string, number>;
  meta: (id: string) => ActivityMeta;
  onOpen: (activity: Activity) => void;
}

const STAGES: Record<Activity["level"], string> = {
  1: "Warm up",
  2: "Keep going",
  3: "Challenge",
};

const starsFor = (score: number) => (score >= 80 ? 3 : score >= 50 ? 2 : 1);

function TreasureChest() {
  const { locale } = useInteraction();
  return (
    <div className="flex flex-col items-center gap-2 pt-7" aria-label="Treasure chest">
      <div aria-hidden="true" className="relative h-[4.5rem] w-24">
        <div className="absolute inset-x-2 top-1 h-7 rounded-t-[2rem] border-4 border-amber-900 bg-amber-500 dark:border-amber-950 dark:bg-amber-600" />
        <div className="absolute inset-x-1 bottom-0 h-10 rounded-b-xl border-4 border-amber-950 bg-amber-700 dark:bg-amber-800">
          <div className="absolute left-1/2 top-1/2 h-4 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-yellow-200 bg-yellow-400" />
        </div>
      </div>
      <p className="text-lg font-bold text-amber-900 dark:text-amber-200">{translate(locale, "Treasure chest")}</p>
    </div>
  );
}

export default function TodayPath({ plan, best, meta, onOpen }: TodayPathProps) {
  const { locale } = useInteraction();
  const tr = (phrase: string) => translate(locale, phrase);
  const nextIndex = plan.findIndex((activity) => best[activity.id] === undefined);
  const allDone = plan.length > 0 && nextIndex === -1;
  let activityIndex = 0;

  return (
    <section aria-label={tr("Today’s activities")} className="relative mx-auto max-w-2xl pb-8">
      {allDone && (
        <p className="mb-5 rounded-2xl border-2 border-green-600 bg-green-50 p-5 text-center text-2xl font-bold text-green-900 dark:bg-green-950/50 dark:text-green-100 sm:text-3xl">
          {tr("All done for today! ⭐")}
        </p>
      )}

      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute bottom-10 left-1/2 top-16 -translate-x-1/2 border-l-[3px] border-dashed border-primary/30"
        />
        {[1, 2, 3].map((level) => {
          const activities = plan.filter((activity) => activity.level === level);
          if (!activities.length) return null;

          return (
            <section key={level} aria-labelledby={`today-stage-${level}`} className="relative pb-7">
              <h2
                id={`today-stage-${level}`}
                className="mx-auto mb-5 w-fit rounded-full border border-border bg-card px-6 py-2 text-xl font-bold text-foreground shadow-sm"
              >
                {tr(STAGES[level as Activity["level"]])}
              </h2>

              <ol className="space-y-8">
                {activities.map((activity) => {
                  const index = activityIndex++;
                  const score = best[activity.id];
                  const done = score !== undefined;
                  const isNext = index === nextIndex;
                  const { name, icon: Icon } = meta(activity.id);
                  const count = done ? starsFor(score) : 0;

                  return (
                    <li key={`${activity.id}-${index}`} className="relative">
                      <div className={`flex ${index % 2 === 0 ? "justify-start pl-5 sm:pl-12" : "justify-end pr-5 sm:pr-12"}`}>
                        <div className="relative flex w-32 flex-col items-center text-center sm:w-36">
                          {isNext && (
                            <span className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-extrabold tracking-wide text-primary-foreground shadow-md after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-x-[7px] after:border-t-[8px] after:border-x-transparent after:border-t-primary">
                              {tr("START")}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpen(activity)}
                            aria-label={`${isNext ? "Start" : done ? "Play again" : "Open"} ${name}${done ? `, ${count} of 3 stars` : ""}`}
                            className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[5px] shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:hover:scale-105 motion-reduce:transition-none ${
                              isNext
                                ? "h-28 w-28 border-primary bg-primary text-primary-foreground shadow-lg"
                                : done
                                  ? "border-green-700 bg-green-600 text-white dark:border-green-400 dark:bg-green-700"
                                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className={isNext ? "h-12 w-12" : "h-10 w-10"} />
                          </button>
                          <span className="mt-2 text-lg font-semibold leading-tight text-foreground">{name}</span>
                          {done ? (
                            <span className="mt-1 text-xl leading-none text-amber-500" aria-label={`${count} of 3 stars`}>
                              {"★".repeat(count)}
                              <span className="text-muted-foreground/30">{"★".repeat(3 - count)}</span>
                            </span>
                          ) : (
                            <span className="mt-1 h-6" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      <TreasureChest />
    </section>
  );
}
