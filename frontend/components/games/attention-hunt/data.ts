export type ObjectSet = {
  target: string;
  label: string;
  representation: string;
  distractors: { label: string; representation: string }[];
};

const set = (
  label: string,
  representation: string,
  similar: [string, string, string],
  icons: [string, string, string]
): ObjectSet => ({
  target: label,
  label,
  representation,
  distractors: similar.map((name, index) => ({ label: name, representation: icons[index] })),
});

export const objectSets: ObjectSet[] = [
  set("cup", "☕", ["green tea", "glass of milk", "soup bowl"], ["🍵", "🥛", "🥣"]),
  set("apple", "🍎", ["orange", "peach", "tomato"], ["🍊", "🍑", "🍅"]),
  set("key", "🔑", ["lock", "vintage key", "screwdriver"], ["🔒", "🗝️", "🪛"]),
  set("book", "📚", ["notebook", "envelope", "folder"], ["📓", "✉️", "📁"]),
  set("spoon", "🥄", ["cutlery", "knife", "soup bowl"], ["🍴", "🔪", "🥣"]),
  set("plate", "🍽️", ["bowl", "basket", "curry rice"], ["🥣", "🧺", "🍛"]),
  set("bottle", "🧴", ["jar", "sake bottle", "glass of milk"], ["🫙", "🍶", "🥛"]),
  set("glass", "🥛", ["cup", "bottle", "green tea"], ["☕", "🧴", "🍵"]),
  set("pencil", "✏️", ["pen", "crayon", "paintbrush"], ["🖊️", "🖍️", "🖌️"]),
  set("phone", "📱", ["mobile screen", "control knobs", "abacus"], ["📲", "🎛️", "🧮"]),
  set("toy", "🧸", ["nesting doll", "soccer ball", "theater masks"], ["🪆", "⚽", "🎭"]),
  set("cap", "🧢", ["sun hat", "helmet", "coat"], ["👒", "⛑️", "🧥"]),
  set("glove", "🧤", ["sock", "scarf", "t-shirt"], ["🧦", "🧣", "👕"]),
  set("sock", "🧦", ["glove", "sneaker", "flat shoe"], ["🧤", "👟", "🥿"]),
  set("banana", "🍌", ["lemon", "corn", "sweet potato"], ["🍋", "🌽", "🍠"]),
];

// Validation check at module load time: throw error if distractor emoji equals target emoji
objectSets.forEach((set, sIdx) => {
  set.distractors.forEach((d, dIdx) => {
    if (d.representation === set.representation) {
      throw new Error(
        `ObjectSet ${sIdx} (${set.label}): Distractor ${dIdx} (${d.label}) has identical emoji '${d.representation}' to target '${set.representation}'`
      );
    }
  });
});

export const attentionRounds = [
  { rows: 3, columns: 3, minTargets: 2, maxTargets: 3 },
  { rows: 3, columns: 4, minTargets: 3, maxTargets: 4 },
  { rows: 4, columns: 4, minTargets: 4, maxTargets: 5 },
  { rows: 4, columns: 5, minTargets: 5, maxTargets: 6 },
  { rows: 5, columns: 5, minTargets: 6, maxTargets: 8 },
] as const;

export function roundsForKnob(knob: number) {
  if (knob <= 1) return attentionRounds.slice(0, 4).map((round, index) => ({ ...round, rows: index < 2 ? 3 : 4, columns: index < 2 ? 3 : 4, minTargets: index + 2, maxTargets: index + 2 }));
  if (knob === 2) return attentionRounds.slice(0, 4);
  if (knob === 3) return [{ rows: 3, columns: 4, minTargets: 3, maxTargets: 4 }, { rows: 4, columns: 4, minTargets: 4, maxTargets: 5 }, { rows: 4, columns: 5, minTargets: 5, maxTargets: 6 }, { rows: 5, columns: 5, minTargets: 6, maxTargets: 7 }, { rows: 5, columns: 5, minTargets: 7, maxTargets: 8 }] as const;
  return [{ rows: 4, columns: 4, minTargets: 4, maxTargets: 5 }, { rows: 4, columns: 5, minTargets: 5, maxTargets: 6 }, { rows: 5, columns: 5, minTargets: 6, maxTargets: 8 }, { rows: 5, columns: 5, minTargets: 7, maxTargets: 8 }, { rows: 5, columns: 6, minTargets: 8, maxTargets: 9 }] as const;
}

export type BoardItem = { id: number; label: string; representation: string; isTarget: boolean };
