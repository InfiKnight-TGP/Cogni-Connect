import { useState } from "react";

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Card indices 0..n-1 in a random order that is never already solved. */
function unsolvedOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let shuffled = shuffle(order);
  while (n > 1 && shuffled.every((v, i) => v === i)) shuffled = shuffle(order);
  return shuffled;
}

/**
 * Tap-to-place state for n cards: tapping a tray card fills the next empty slot,
 * tapping a placed card sends it back. Remount (via `key`) for a fresh round.
 */
export function useSlots(n: number, preplacedCount = 0) {
  const locked = Math.max(0, Math.min(n, preplacedCount));
  const [tray, setTray] = useState(() => unsolvedOrder(n).filter(card => card >= locked)); // unplaced card indices, in display order
  const [slots, setSlots] = useState<(number | null)[]>(() => Array.from({ length: n }, (_, i) => i < locked ? i : null));

  const place = (card: number) => {
    const slot = slots.indexOf(null);
    if (slot === -1) return;
    setSlots(slots.map((c, i) => (i === slot ? card : c)));
    setTray(tray.filter((c) => c !== card));
  };

  const sendBack = (slot: number) => {
    if (slot < locked) return;
    const card = slots[slot];
    if (card === null) return;
    setSlots(slots.map((c, i) => (i === slot ? null : c)));
    setTray([...tray, card]);
  };

  return { tray, slots, place, sendBack, full: tray.length === 0 };
}

// Static class names so Tailwind generates them.
export const GRID_COLS: Record<number, string> = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
};
