import { Brain, Compass, Eye, ListChecks, type LucideIcon } from "lucide-react";

export const COGNITIVE_AREAS = [
  {
    name: "Memory",
    gameIds: ["story-builder", "context-recall", "memory-cards", "yesterday-quiz", "mole-path", "word-association"],
    shortDescription: "Remembering words, stories and paths",
    icon: Brain,
    chartColors: { light: "#2a78d6", dark: "#3987e5" },
    colorClasses: "border-[#2a78d6]/40 bg-[#2a78d6]/10 text-[#2a78d6] dark:border-[#3987e5]/40 dark:bg-[#3987e5]/10 dark:text-[#3987e5]",
  },
  {
    name: "Attention",
    gameIds: ["sound-tap", "odd-one-out", "whack-a-mole", "attention-hunt"],
    shortDescription: "Spotting and finding things carefully",
    icon: Eye,
    chartColors: { light: "#eb6834", dark: "#d95926" },
    colorClasses: "border-[#eb6834]/40 bg-[#eb6834]/10 text-[#c64d1d] dark:border-[#d95926]/40 dark:bg-[#d95926]/10 dark:text-[#f07b4c]",
  },
  {
    name: "Executive Function",
    gameIds: ["plan-the-day", "sorting-station", "pattern-completion", "pill-box-planner"],
    shortDescription: "Planning the day and adapting to changes",
    icon: ListChecks,
    chartColors: { light: "#1baf7a", dark: "#199e70" },
    colorClasses: "border-[#1baf7a]/40 bg-[#1baf7a]/10 text-[#12845b] dark:border-[#199e70]/40 dark:bg-[#199e70]/10 dark:text-[#42c995]",
  },
  {
    name: "Recognition & Orientation",
    gameIds: ["object-naming", "face-recognition", "name-recognition", "map-navigator"],
    shortDescription: "Knowing familiar faces and finding the way",
    icon: Compass,
    chartColors: { light: "#eda100", dark: "#c98500" },
    colorClasses: "border-[#eda100]/40 bg-[#eda100]/10 text-[#a66e00] dark:border-[#c98500]/40 dark:bg-[#c98500]/10 dark:text-[#e9ad31]",
  },
] as const satisfies readonly {
  name: string;
  gameIds: readonly string[];
  shortDescription: string;
  icon: LucideIcon;
  chartColors: { light: string; dark: string };
  colorClasses: string;
}[];
