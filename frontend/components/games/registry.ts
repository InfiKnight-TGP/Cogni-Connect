import React from "react";
import StoryBuilder from "./story-builder";
import PlanTheDay from "./plan-the-day";
import WordAssociation from "./word-association";
import OddOneOut from "./odd-one-out";
import MolePath from "./mole-path";
import SortingStation from "./sorting-station";
import WhackAMole from "./whack-a-mole";
import AttentionHunt from "./attention-hunt";
import MapNavigator from "./map-navigator";
import { GameProps } from "./_shared/types";
import { Area } from "@/lib/progress";

export interface GameRegistryEntry {
  id: string;
  name: string;
  skill: string;
  area: Area;
  levels: (1 | 2 | 3)[];
  component?: React.ComponentType<GameProps>;
  comingSoon: boolean;
  emoji: string;
  description: string;
  href?: string;
}

export const GAME_REGISTRY: GameRegistryEntry[] = [
  {
    id: "story-builder",
    name: "Story Builder",
    skill: "verbal memory",
    area: "Memory",
    levels: [1],
    component: StoryBuilder,
    comingSoon: false,
    emoji: "📖",
    description: "Read a short everyday story, then recall missing details.",
  },
  {
    id: "plan-the-day",
    name: "Plan the Day",
    skill: "sequencing",
    area: "Executive Function",
    levels: [1],
    component: PlanTheDay,
    comingSoon: false,
    emoji: "📅",
    description: "Organize daily tasks in correct logical order.",
  },
  {
    id: "word-association",
    name: "Word Association",
    skill: "semantic memory",
    area: "Memory",
    levels: [1],
    component: WordAssociation,
    comingSoon: true,
    emoji: "🔗",
    description: "Connect related words and concepts together.",
  },
  {
    id: "odd-one-out",
    name: "Odd One Out",
    skill: "attention",
    area: "Attention",
    levels: [1],
    component: OddOneOut,
    comingSoon: true,
    emoji: "🔍",
    description: "Find the item that doesn't belong in the group.",
  },
  {
    id: "mole-path",
    name: "Mole Path",
    skill: "working memory",
    area: "Memory",
    levels: [2],
    component: MolePath,
    comingSoon: false,
    emoji: "🐹",
    description: "Watch the circles fill, then tap the path in the same order.",
  },
  {
    id: "sorting-station",
    name: "Sorting Station",
    skill: "flexibility",
    area: "Executive Function",
    levels: [2],
    component: SortingStation,
    comingSoon: false,
    emoji: "📦",
    description: "Adapt to changing rules to sort items correctly.",
  },
  {
    id: "whack-a-mole",
    name: "Whack-a-Mole",
    skill: "inhibition",
    area: "Attention",
    levels: [2],
    component: WhackAMole,
    comingSoon: true,
    emoji: "🔨",
    description: "Tap target moles while suppressing impulses for distractors.",
  },
  {
    id: "attention-hunt",
    name: "Attention Hunt",
    skill: "selective attention",
    area: "Attention",
    levels: [3],
    component: AttentionHunt,
    comingSoon: false,
    emoji: "🎯",
    description: "Find every copy of the target while ignoring distractors.",
  },
  {
    id: "map-navigator",
    name: "Map Navigator",
    skill: "spatial",
    area: "Recognition & Orientation",
    levels: [3],
    component: MapNavigator,
    comingSoon: false,
    emoji: "🗺️",
    description: "Navigate routes and spatial directions accurately.",
  },
];

export function getGameById(id: string): GameRegistryEntry | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}
