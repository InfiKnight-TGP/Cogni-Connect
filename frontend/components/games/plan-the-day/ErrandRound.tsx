"use client";

import React, { useState } from "react";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { PLACES } from "./data";
import { DAY_START, ErrandSet, formatHour, Place, ruleBreaker, validOrders } from "./rules";
import { useSlots } from "./useSlots";
import VoiceQuestion, { type AnswerInput } from "@/components/interaction/VoiceQuestion";
import { useAnswerLog } from "@/components/interaction/useAnswerLog";

const LEG_SECONDS = 1.2; // walking time between two places

const ROADS: [Place, Place][] = [
  ["home", "market"],
  ["home", "pharmacy"],
  ["home", "bank"],
  ["market", "pharmacy"],
  ["market", "temple"],
  ["pharmacy", "temple"],
  ["pharmacy", "bank"],
  ["temple", "bank"],
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function TownMap({
  route,
  walking,
  highlight,
}: {
  route: Place[]; // places in visiting order, starting at home
  walking: boolean;
  highlight: Place | null;
}) {
  const points = route.map((p) => `${PLACES[p].x},${PLACES[p].y}`);
  const figureAt = PLACES[walking ? "home" : route[route.length - 1]];
  return (
    <svg viewBox="0 0 400 250" role="img" aria-label="Map of home and the shops" className="w-full max-h-[300px]">
      {ROADS.map(([a, b]) => (
        <line
          key={a + b}
          x1={PLACES[a].x}
          y1={PLACES[a].y}
          x2={PLACES[b].x}
          y2={PLACES[b].y}
          className="stroke-muted"
          strokeWidth={10}
          strokeLinecap="round"
        />
      ))}
      {route.length > 1 && (
        <polyline points={points.join(" ")} fill="none" className="stroke-primary" strokeWidth={4} strokeDasharray="8 6" />
      )}
      {(Object.keys(PLACES) as Place[]).map((p) => (
        <g key={p}>
          <circle
            cx={PLACES[p].x}
            cy={PLACES[p].y}
            r={28}
            strokeWidth={3}
            className={p === highlight ? "fill-amber-100 stroke-amber-500" : "fill-card stroke-border"}
          />
          <text x={PLACES[p].x} y={PLACES[p].y + 10} textAnchor="middle" fontSize={28}>
            {PLACES[p].emoji}
          </text>
          <text x={PLACES[p].x} y={PLACES[p].y + 48} textAnchor="middle" fontSize={15} className="fill-foreground font-semibold">
            {PLACES[p].name}
          </text>
        </g>
      ))}
      <g transform={walking ? undefined : `translate(${figureAt.x + 22},${figureAt.y - 22})`}>
        <text textAnchor="middle" y={10} fontSize={30}>
          🚶
        </text>
        {walking && (
          // Paced along the route; the parent <svg> is remounted per walk so this starts at 0.
          <animateMotion
            dur={`${LEG_SECONDS * (route.length - 1)}s`}
            path={`M ${points.join(" L ")}`}
            fill="freeze"
          />
        )}
      </g>
    </svg>
  );
}

/**
 * Put 3 errands in order under one rule, then watch the walk.
 * Worth 20 points first try, 10 after the one allowed fix, otherwise 0.
 */
export default function ErrandRound({ set, onDone }: { set: ErrandSet; onDone: (points: number) => void }) {
  const { errands, rule } = set;
  const { tray, slots, place, sendBack, full } = useSlots(errands.length);
  const [phase, setPhase] = useState<"order" | "walk" | "done">("order");
  const [tries, setTries] = useState(0);
  const [breaker, setBreaker] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const log = useAnswerLog("plan-the-day", "Executive Function", `${rule.text}:${tries}`, 3);

  const placed = slots.filter((s): s is number => s !== null).map((i) => errands[i]);
  const route: Place[] = ["home", ...placed.map((e) => e.place)];
  const breakerPlace = errands.find((e) => e.id === breaker)?.place ?? null;

  const go = (input?: AnswerInput) => {
    const order = placed.map((e) => e.id);
    log(!ruleBreaker(order, rule), input);
    const attempt = tries + 1;
    setBreaker(null);
    setTries(attempt);
    setPhase("walk");
    const walkMs = prefersReducedMotion() ? 0 : LEG_SECONDS * order.length * 1000;
    window.setTimeout(() => {
      const broken = ruleBreaker(order, rule);
      setBreaker(broken);
      if (!broken) setPoints(attempt === 1 ? 20 : 10);
      setPhase(broken && attempt === 1 ? "order" : "done");
    }, walkMs);
  };

  const solution = validOrders(set)[0].map((id) => errands.find((e) => e.id === id)!);

  return (
    <div className="space-y-6">
      <VoiceQuestion prompt={`${rule.text}. Choose the next errand, or say Go when ready.`} disabled={phase === "walk"} options={phase === "done" ? [{ id: "next", label: "Next" }] : [...tray.map(i => ({ id: String(i), label: errands[i].label })), ...(full ? [{ id: "go", label: "Go" }] : []), ...slots.flatMap((card, i) => card === null ? [] : [{ id: `remove:${i}`, label: `Remove ${errands[card].label}` }])]} onAnswer={(id, input) => { if (id === "next") onDone(points); else if (id === "go") go(input); else if (id.startsWith("remove:")) sendBack(Number(id.split(":")[1])); else place(Number(id)); }} />
      <div>
        <h2 className="text-2xl font-bold md:text-3xl">Errand planner</h2>
        <p className="mt-1 text-xl">Tap the errands in order, then press Go.</p>
      </div>

      <div className="flex items-center gap-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
        <span className="text-5xl leading-none">{rule.icon}</span>
        <div>
          <p className="text-2xl font-bold">{rule.text}</p>
          <p className="text-lg text-muted-foreground">
            The day starts at {formatHour(DAY_START)}. Each errand takes 1 hour.
          </p>
        </div>
      </div>

      <TownMap key={phase === "walk" ? `walk${tries}` : "still"} route={route} walking={phase === "walk"} highlight={breakerPlace} />

      <div className="grid grid-cols-3 gap-3">
        {slots.map((card, i) => {
          const errand = card === null ? null : errands[card];
          return (
            <div key={i} className="space-y-2">
              <p className="text-center text-xl font-bold">
                {formatHour(DAY_START + i)}
              </p>
              {errand === null ? (
                <div className="min-h-[140px] rounded-xl border-2 border-dashed border-border" />
              ) : (
                <BigTile
                  emoji={PLACES[errand.place].emoji}
                  label={errand.label}
                  state={phase === "done" && !breaker ? "correct" : "selected"}
                  onClick={phase === "order" ? () => sendBack(i) : undefined}
                  className={`w-full min-h-[140px] gap-2 [&>span:first-child]:text-5xl [&>span:last-child]:text-lg ${
                    errand.id === breaker ? "border-4 border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" : ""
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {!full && (
        <div className="grid grid-cols-3 gap-3 border-t border-border pt-6">
          {tray.map((card) => (
            <BigTile
              key={card}
              emoji={PLACES[errands[card].place].emoji}
              label={errands[card].label}
              onClick={() => place(card)}
              className="w-full min-h-[140px] gap-2 [&>span:first-child]:text-5xl [&>span:last-child]:text-lg"
            />
          ))}
        </div>
      )}

      {breaker && (
        <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-xl font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          💡 {rule.hint}
          {phase === "order" && <span className="block text-lg font-normal">Change the order and press Go again.</span>}
        </div>
      )}

      {phase === "done" && !breaker && (
        <p className="text-center text-2xl font-bold text-green-700 dark:text-green-400">
          {points === 20 ? "Well planned! Every errand fits." : "You fixed it. Well done!"}
        </p>
      )}

      {phase === "done" && breaker && (
        <div className="space-y-2">
          <p className="text-xl font-semibold">One order that works:</p>
          <div className="grid grid-cols-3 gap-3">
            {solution.map((e) => (
              <BigTile
                key={e.id}
                emoji={PLACES[e.place].emoji}
                label={e.label}
                state="correct"
                className="w-full min-h-[120px] gap-2 [&>span:first-child]:text-4xl [&>span:last-child]:text-lg"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        {phase === "done" ? (
          <Button size="lg" className="h-14 px-12 text-xl" onClick={() => onDone(points)}>
            Next
          </Button>
        ) : (
          <Button size="lg" className="h-14 px-12 text-xl" disabled={!full || phase === "walk"} onClick={() => go()}>
            {phase === "walk" ? "Walking…" : "Go"}
          </Button>
        )}
      </div>
    </div>
  );
}
