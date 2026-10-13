import { Brain, Compass, Eye, ListChecks, type LucideIcon } from "lucide-react";

export const COGNITIVE_AREAS = [
  {
    name: "Memory",
    shortDescription: "Remembering words, stories and paths",
    icon: Brain,
    colorClasses: "border-[#2a78d6]/40 bg-[#2a78d6]/10 text-[#2a78d6] dark:border-[#3987e5]/40 dark:bg-[#3987e5]/10 dark:text-[#3987e5]",
  },
  {
    name: "Attention",
    shortDescription: "Spotting and finding things carefully",
    icon: Eye,
    colorClasses: "border-[#eb6834]/40 bg-[#eb6834]/10 text-[#c64d1d] dark:border-[#d95926]/40 dark:bg-[#d95926]/10 dark:text-[#f07b4c]",
  },
  {
    name: "Executive Function",
    shortDescription: "Planning the day and adapting to changes",
    icon: ListChecks,
    colorClasses: "border-[#1baf7a]/40 bg-[#1baf7a]/10 text-[#12845b] dark:border-[#199e70]/40 dark:bg-[#199e70]/10 dark:text-[#42c995]",
  },
  {
    name: "Recognition & Orientation",
    shortDescription: "Knowing familiar faces and finding the way",
    icon: Compass,
    colorClasses: "border-[#eda100]/40 bg-[#eda100]/10 text-[#a66e00] dark:border-[#c98500]/40 dark:bg-[#c98500]/10 dark:text-[#e9ad31]",
  },
] as const satisfies readonly {
  name: string;
  shortDescription: string;
  icon: LucideIcon;
  colorClasses: string;
}[];
