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
import FaceRecognition from "./face-recognition";
import NameRecognition from "./name-recognition";
import ContextRecall from "./context-recall";
import { GameProps } from "./_shared/types";
import { Area } from "@/lib/progress";
import MemoryCards from "./memory-cards";
import SoundTap from "./sound-tap";
import PatternCompletion from "./pattern-completion";
import ObjectNaming from "./object-naming";
import YesterdayQuiz from "./yesterday-quiz";

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
  trains: string;
  href?: string;
}

export const GAME_REGISTRY: GameRegistryEntry[] = [
  { id: "memory-cards", name: "Matching pictures", skill: "working memory", area: "Memory", levels: [1], component: MemoryCards, comingSoon: false, emoji: "🃏", description: "Find matching familiar pictures.", trains: "Remember where matching pictures are" },
  { id: "sound-tap", name: "Listen to the beats", skill: "attention", area: "Attention", levels: [1], component: SoundTap, comingSoon: false, emoji: "🥁", description: "Count beats or use the visual alternative.", trains: "Attention to a short sequence" },
  { id: "pattern-completion", name: "Finish the pattern", skill: "spatial", area: "Recognition & Orientation", levels: [1], component: PatternCompletion, comingSoon: false, emoji: "🔷", description: "Choose the next picture.", trains: "Recognize a repeating pattern" },
  { id: "object-naming", name: "Name the picture", skill: "spatial", area: "Recognition & Orientation", levels: [1], component: ObjectNaming, comingSoon: false, emoji: "☂️", description: "Name a familiar everyday object.", trains: "Recognize familiar objects" },
  { id: "yesterday-quiz", name: "Remember yesterday", skill: "personal memory", area: "Memory", levels: [1], component: YesterdayQuiz, comingSoon: false, emoji: "💭", description: "Recall a real saved journal memory.", trains: "Recall personal experiences" },
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
    trains: "Verbal memory: recall words from a short story",
  },
  {
    id: "context-recall",
    name: "Relive Memories",
    skill: "personal memory",
    area: "Memory",
    levels: [1],
    component: ContextRecall,
    comingSoon: false,
    emoji: "💭",
    description: "Recall details of the day’s videos in your own words.",
    trains: "Recall details of the day's videos in your own words",
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
    trains: "Planning and sequencing everyday errands",
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
    trains: "Semantic memory: link related things",
  },
  {
    id: "odd-one-out",
    name: "Odd One Out",
    skill: "attention",
    area: "Attention",
    levels: [1],
    component: OddOneOut,
    comingSoon: false,
    emoji: "🔍",
    description: "Find the item that doesn't belong in the group.",
    trains: "Selective attention and categorising",
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
    trains: "Visual working memory: repeat a growing path",
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
    trains: "Cognitive flexibility: switching rules",
  },
  {
    id: "pill-box-planner",
    name: "Pill Box Planner",
    skill: "rule switching",
    area: "Executive Function",
    levels: [2],
    comingSoon: true,
    emoji: "💊",
    description: "Follow a weekly medication schedule with multiple rules.",
    trains: "Following several rules at once (a weekly medication schedule)",
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
    trains: "Impulse control: tap targets, ignore distractors",
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
    trains: "Visual search among similar items",
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
    trains: "Spatial orientation: route finding",
  },
  {
    id: "face-recognition",
    name: "Face Recognition",
    skill: "face recognition",
    area: "Recognition & Orientation",
    levels: [1],
    component: FaceRecognition,
    comingSoon: false,
    emoji: "👤",
    description: "Recognise familiar people from the day’s video.",
    trains: "Recognise familiar people from the day's video",
  },
  {
    id: "name-recognition",
    name: "Name Recall",
    skill: "name recall",
    area: "Recognition & Orientation",
    levels: [1],
    component: NameRecognition,
    comingSoon: false,
    emoji: "🏷️",
    description: "Match a familiar face to the right name.",
    trains: "Match a familiar face to the right name",
  },
];

export function getGameById(id: string): GameRegistryEntry | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}
