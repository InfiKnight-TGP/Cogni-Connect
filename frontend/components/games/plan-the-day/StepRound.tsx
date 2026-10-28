"use client";

import React, { useState } from "react";
import { BigTile } from "../_shared/BigTile";
import { Button } from "@/components/ui/button";
import { GRID_COLS, useSlots } from "./useSlots";
import { VoiceQuestion } from "@/components/interaction/VoiceQuestion";
import { usePreferences } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useTranslate } from "@/components/interaction/InteractionProvider";

// An everyday step, a caregiver's routine step, or a photo from the user's own day.
export type StepCard =
  | { kind: "step"; emoji: string; label: string }
  | { kind: "photo"; url: string; timestamp: number };

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function CardTile({
  card,
  state = "default",
  revealed = false,
  onClick,
}: {
  card: StepCard;
  state?: "default" | "correct" | "selected";
  revealed?: boolean;
  onClick?: () => void;
}) {
  if (card.kind === "step") {
    return (
      <BigTile
        emoji={card.emoji}
        label={card.label}
        state={state}
        onClick={onClick}
        className="w-full min-h-[140px] gap-2 [&>span:first-child]:text-6xl [&>span:last-child]:text-xl"
      />
    );
  }
  // BigTile has no image slot, so the photo sits over it without catching taps.
  // The time is only shown after Check, since it would give the order away.
  return (
    <div className="relative">
      <BigTile
        label={revealed ? `at ${formatTime(card.timestamp)}` : undefined}
        state={state}
        onClick={onClick}
        className="w-full min-h-[170px] justify-end [&>span]:text-lg"
      />
      <img
        src={card.url}
        alt="A moment from your day"
        className="pointer-events-none absolute left-3 top-3 h-[112px] w-[calc(100%-1.5rem)] rounded-lg object-cover"
      />
    </div>
  );
}

/** Order the cards (given in the correct order). Worth 20 points: correct positions / cards × 20. */
export default function StepRound({
  title,
  prompt,
  cards,
  preplacedCount = 0,
  onDone,
}: {
  title: string;
  prompt: string;
  cards: StepCard[];
  preplacedCount?: number;
  onDone: (points: number) => void;
}) {
  const { t } = useTranslate();
  const { tray, slots, place, sendBack, full } = useSlots(cards.length, preplacedCount);
  const { preferences } = usePreferences();
  const [checked, setChecked] = useState(false);
  const correct = slots.filter((card, i) => card === i).length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold md:text-3xl">{t(title)}</h2>
        <p className="mt-1 text-xl">{t(prompt)}</p>
      </div>
      <VoiceQuestion question={`${t(title)}. ${t(prompt)}`} options={tray.map((cardIndex, position) => { const card = cards[cardIndex]; return { id: String(cardIndex), label: card.kind === "step" ? card.label : `Photo ${position + 1}` }; })} onMatched={option => place(Number(option.id))} disabled={full} />

      <div className={`grid grid-cols-2 gap-4 ${GRID_COLS[cards.length]}`}>
        {slots.map((card, i) => (
          <div key={i} className="space-y-2">
            <p className="text-center text-3xl font-bold">{i + 1}</p>
            {card === null ? (
              <div className="min-h-[140px] rounded-xl border-2 border-dashed border-border" />
            ) : (
              <>
                <CardTile
                  card={cards[card]}
                  state={checked && card === i ? "correct" : "selected"}
                  revealed={checked}
                  onClick={checked || i < preplacedCount ? undefined : () => sendBack(i)}
                />
                {checked && card !== i && (
                  <p className="text-center text-lg font-semibold text-amber-700 dark:text-amber-400">
                    Goes in step {card + 1}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {!full && (
        <div className={`grid grid-cols-2 gap-4 border-t border-border pt-8 ${GRID_COLS[cards.length]}`}>
          {tray.map((card) => (
            <CardTile key={card} card={cards[card]} onClick={() => place(card)} />
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        {checked && (
          <p className="text-xl font-semibold">
            {correct === cards.length ? preferences.encouragingMessages ? "All in the right order. Well done!" : `${correct} of ${cards.length} in the right place` : `${correct} of ${cards.length} in the right place`}
          </p>
        )}
        {checked && <ReadAloud kind="feedback" text={correct === cards.length ? "All in the right order. Well done!" : `${correct} of ${cards.length} in the right place.`} />}
        {checked ? (
          <Button size="lg" className="h-14 px-12 text-xl" onClick={() => onDone((correct / cards.length) * 20)}>
            Next
          </Button>
        ) : (
          <Button size="lg" className="h-14 px-12 text-xl" disabled={!full} onClick={() => setChecked(true)}>
            Check
          </Button>
        )}
      </div>
    </div>
  );
}
