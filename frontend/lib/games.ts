export const games = [
  {
    id: "story-builder",
    title: "Story Builder",
    description:
      "Read a short everyday story, then recall three missing words.",
    skill: "Verbal Memory",
    levels: "1",
    href: "/games/story-builder",
    rules: "Read first, then choose one missing word at a time from three options.",
  },
  {
    id: "mole-path",
    title: "Mole Path",
    description:
      "Watch the circles fill, then tap the path in the same order.",
    skill: "Visual Working Memory",
    levels: "2 and 3",
    href: "/games/mole-path",
    rules: "Level 2 uses a 3 × 3 grid; Level 3 uses a 4 × 4 grid.",
  },
  {
    id: "attention-hunt",
    title: "Attention Hunt",
    description:
      "Find every copy of the target while ignoring similar objects.",
    skill: "Selective Attention",
    levels: "3",
    href: "/games/attention-hunt",
    rules: "Find all matching objects in five rounds before time runs out.",
  },
] as const;

export type GameId = (typeof games)[number]["id"];

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}
