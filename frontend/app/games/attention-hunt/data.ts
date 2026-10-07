export type ObjectSet = { target: string; label: string; representation: string; distractors: { label: string; representation: string }[] };

const set = (label: string, representation: string, similar: [string, string, string], icons: [string, string, string]): ObjectSet => ({ target: label, label, representation, distractors: similar.map((name, index) => ({ label: name, representation: icons[index] })) });

export const objectSets: ObjectSet[] = [
  set("cup", "☕", ["mug", "glass", "bowl"], ["🍵", "🥛", "🥣"]),
  set("apple", "🍎", ["orange", "peach", "tomato"], ["🍊", "🍑", "🍅"]),
  set("key", "🔑", ["lock", "key ring", "small tool"], ["🔒", "🗝️", "🪛"]),
  set("book", "📚", ["notebook", "letter", "folder"], ["📓", "✉️", "📁"]),
  set("spoon", "🥄", ["fork", "knife", "ladle"], ["🍴", "🔪", "🥣"]),
  set("plate", "🍽️", ["bowl", "tray", "dish"], ["🥣", "🧺", "🍛"]),
  set("bottle", "🧴", ["jar", "thermos", "glass"], ["🫙", "🍶", "🥛"]),
  set("glass", "🥛", ["cup", "bottle", "mug"], ["☕", "🧴", "🍵"]),
  set("pencil", "✏️", ["pen", "crayon", "marker"], ["🖊️", "🖍️", "🖌️"]),
  set("phone", "📱", ["tablet", "remote", "calculator"], ["📲", "🎛️", "🧮"]),
  set("toy", "🧸", ["doll", "ball", "puppet"], ["🪆", "⚽", "🎭"]),
  set("cap", "🧢", ["hat", "helmet", "hood"], ["👒", "⛑️", "🧥"]),
  set("glove", "🧤", ["sock", "mitten", "sleeve"], ["🧦", "🧤", "👕"]),
  set("sock", "🧦", ["glove", "shoe", "slipper"], ["🧤", "👟", "🥿"]),
  set("banana", "🍌", ["lemon", "corn", "plantain"], ["🍋", "🌽", "🍌"]),
];

export const attentionRounds = [
  { rows: 3, columns: 3, minTargets: 2, maxTargets: 3 },
  { rows: 3, columns: 4, minTargets: 3, maxTargets: 4 },
  { rows: 4, columns: 4, minTargets: 4, maxTargets: 5 },
  { rows: 4, columns: 5, minTargets: 5, maxTargets: 6 },
  { rows: 5, columns: 5, minTargets: 6, maxTargets: 8 },
] as const;

export type BoardItem = { id: number; label: string; representation: string; isTarget: boolean };

export function makeBoard(roundIndex: number, configIndex: number, randomized = true) {
  const round = attentionRounds[roundIndex];
  const config = objectSets[configIndex];
  const total = round.rows * round.columns;
  const targetCount = randomized ? round.minTargets + Math.floor(Math.random() * (round.maxTargets - round.minTargets + 1)) : round.minTargets;
  const positions = Array.from({ length: total }, (_, index) => index);
  if (randomized) {
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [positions[index], positions[swap]] = [positions[swap], positions[index]];
    }
  }
  const targetPositions = new Set(positions.slice(0, targetCount));
  return Array.from({ length: total }, (_, id): BoardItem => {
    if (targetPositions.has(id)) return { id, label: config.label, representation: config.representation, isTarget: true };
    const distractor = config.distractors[randomized ? Math.floor(Math.random() * config.distractors.length) : id % config.distractors.length];
    return { id, label: distractor.label, representation: distractor.representation, isTarget: false };
  });
}
