export const COGNITIVE_DOMAINS = [
  "Memory",
  "Attention",
  "Executive Function",
  "Recognition and Orientation",
] as const;

export type CognitiveDomain = (typeof COGNITIVE_DOMAINS)[number];

export type CognitiveGame = {
  id: string;
  title: string;
  description: string;
  skill: string;
  primaryDomain: CognitiveDomain;
  secondaryDomains: CognitiveDomain[];
  implemented: boolean;
  playable: boolean;
  href: string | null;
  entryPoint: "game" | "quiz" | "planned";
  levels: string;
  rules: string;
  metrics: string[];
  domainWeights: Partial<Record<CognitiveDomain, number>>;
  taskDomainWeights?: Record<string, Partial<Record<CognitiveDomain, number>>>;
};

export const cognitiveGameRegistry: CognitiveGame[] = [
  {
    id: "story-builder", title: "Story Builder",
    description: "Read an everyday story, then recall three missing words.", skill: "Verbal story recall",
    primaryDomain: "Memory", secondaryDomains: [], implemented: true, playable: true,
    href: "/games/story-builder", entryPoint: "game", levels: "1",
    rules: "Read first, then choose one missing word at a time from three options.",
    metrics: ["correct_answers", "total_questions", "accuracy"], domainWeights: { Memory: 1 },
  },
  {
    id: "mole-path", title: "Mole Path",
    description: "Remember and repeat a visual path in order.", skill: "Visual working memory",
    primaryDomain: "Memory", secondaryDomains: [], implemented: true, playable: true,
    href: "/games/mole-path", entryPoint: "game", levels: "2 and 3",
    rules: "Level 2 uses a 3 × 3 grid; Level 3 uses a 4 × 4 grid.",
    metrics: ["longest_path", "difficulty_level"], domainWeights: { Memory: 1 },
  },
  {
    id: "attention-hunt", title: "Attention Hunt",
    description: "Find target objects while ignoring similar distractors.", skill: "Selective attention",
    primaryDomain: "Attention", secondaryDomains: [], implemented: true, playable: true,
    href: "/games/attention-hunt", entryPoint: "game", levels: "3",
    rules: "Find all matching objects in five rounds before time runs out.",
    metrics: ["correct_answers", "total_questions", "false_selections", "missed_targets"], domainWeights: { Attention: 1 },
  },
  {
    id: "face-recognition", title: "Facial Recognition",
    description: "Select familiar faces seen in a personal video.", skill: "Familiar-person recognition",
    primaryDomain: "Recognition and Orientation", secondaryDomains: [], implemented: true, playable: true,
    href: "/quiz", entryPoint: "quiz", levels: "Quiz activity 1",
    rules: "Choose the familiar faces that appeared in the selected video.",
    metrics: ["correct_answers", "total_questions", "missed_targets", "false_selections"], domainWeights: { "Recognition and Orientation": 1 },
  },
  {
    id: "name-recognition", title: "Name Recall",
    description: "Match a familiar name to the pictured person.", skill: "Name-face association",
    primaryDomain: "Recognition and Orientation", secondaryDomains: [], implemented: true, playable: true,
    href: "/quiz", entryPoint: "quiz", levels: "Quiz activity 2",
    rules: "Select the name that matches the pictured familiar person.",
    metrics: ["correct_answers", "total_questions", "attempts", "false_selections"], domainWeights: { "Recognition and Orientation": 1 },
  },
  {
    id: "context-recall", title: "Personal Memory Questions",
    description: "Recall details from personal video memories in open responses.", skill: "Personal episodic recall",
    primaryDomain: "Memory", secondaryDomains: [], implemented: true, playable: true,
    href: "/quiz", entryPoint: "quiz", levels: "Quiz activity 3",
    rules: "Answer open questions about details from a selected personal memory.",
    metrics: ["accuracy", "total_questions", "question_scores"], domainWeights: { Memory: 1 },
  },
  {
    id: "my-day-recall", title: "My Day Recall",
    description: "Planned personalized recall and recognition activity.", skill: "Daily-event recall and recognition",
    primaryDomain: "Memory", secondaryDomains: ["Recognition and Orientation"], implemented: false, playable: false,
    href: null, entryPoint: "planned", levels: "Planned",
    rules: "Not available yet.", metrics: [], domainWeights: {},
    taskDomainWeights: {
      free_recall: { Memory: 1 },
      familiar_choice: { "Recognition and Orientation": 1 },
      mixed_recall_and_recognition: { Memory: 0.5, "Recognition and Orientation": 0.5 },
    },
  },
  {
    id: "sequence-memory", title: "Sequence Memory",
    description: "Planned sequence recall activity.", skill: "Sequence recall",
    primaryDomain: "Memory", secondaryDomains: [], implemented: false, playable: false,
    href: null, entryPoint: "planned", levels: "Planned", rules: "Not available yet.",
    metrics: [], domainWeights: { Memory: 1 },
  },
  {
    id: "pattern-switch", title: "Pattern Switch",
    description: "Planned rule-switching and cognitive-flexibility activity.", skill: "Cognitive flexibility",
    primaryDomain: "Executive Function", secondaryDomains: [], implemented: false, playable: false,
    href: null, entryPoint: "planned", levels: "Planned", rules: "Not available yet.",
    metrics: [], domainWeights: { "Executive Function": 1 },
  },
];

export const games = cognitiveGameRegistry;
export type GameId = (typeof cognitiveGameRegistry)[number]["id"];

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
