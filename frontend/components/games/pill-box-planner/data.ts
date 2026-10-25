/**
 * Pill Box Planner - Safe Practice Data
 *
 * SAFETY RULES:
 * - Coloured pills only: red, blue, yellow, green.
 * - Strictly abstract coloured circle tokens for cognitive training.
 * - Colour is NEVER the only cue: colour name is always displayed as text.
 * - Rules use ONLY time words (morning, afternoon, night) and weekday names.
 */

export type PillColorId = "red" | "blue" | "yellow" | "green";

export interface PillColor {
  id: PillColorId;
  name: string;
  hex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconEmoji: string;
}

export const PILL_COLORS: Record<PillColorId, PillColor> = {
  red: {
    id: "red",
    name: "Red",
    hex: "#ef4444",
    bgClass: "bg-red-50 dark:bg-red-950/50",
    borderClass: "border-red-400 dark:border-red-600",
    textClass: "text-red-700 dark:text-red-300",
    iconEmoji: "🔴",
  },
  blue: {
    id: "blue",
    name: "Blue",
    hex: "#3b82f6",
    bgClass: "bg-blue-50 dark:bg-blue-950/50",
    borderClass: "border-blue-400 dark:border-blue-600",
    textClass: "text-blue-700 dark:text-blue-300",
    iconEmoji: "🔵",
  },
  yellow: {
    id: "yellow",
    name: "Yellow",
    hex: "#eab308",
    bgClass: "bg-amber-50 dark:bg-amber-950/50",
    borderClass: "border-amber-400 dark:border-amber-600",
    textClass: "text-amber-800 dark:text-amber-300",
    iconEmoji: "🟡",
  },
  green: {
    id: "green",
    name: "Green",
    hex: "#22c55e",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/50",
    borderClass: "border-emerald-400 dark:border-emerald-600",
    textClass: "text-emerald-700 dark:text-emerald-300",
    iconEmoji: "🟢",
  },
};

export type WeekDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export const WEEK_DAYS: readonly WeekDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export type DayTime = "morning" | "afternoon" | "night";

export interface TimeSlotMeta {
  id: DayTime;
  name: string;
  icon: string;
  subLabel: string;
}

export const DAY_TIMES: readonly DayTime[] = ["morning", "afternoon", "night"];

export const TIME_SLOT_META: Record<DayTime, TimeSlotMeta> = {
  morning: { id: "morning", name: "Morning", icon: "🌅", subLabel: "Subah · Early day" },
  afternoon: { id: "afternoon", name: "Afternoon", icon: "☀️", subLabel: "Dopahar · After lunch" },
  night: { id: "night", name: "Night", icon: "🌙", subLabel: "Raat · Before sleep" },
};

export interface PlanRule {
  pillColor: PillColorId;
  days: WeekDay[];
  times: DayTime[];
  instruction: string;
  exceptionDay?: WeekDay; // e.g. "Sunday"
  exceptionInstruction?: string; // e.g. "Skip the red pill on Sunday"
}

export interface PlannerScenario {
  id: string;
  title: string;
  rules: PlanRule[];
  hasException?: boolean;
  exceptionNote?: string;
  rowHints?: Record<DayTime, string>; // for Knob 1 row hints
}

/**
 * Expands a rule into the exact set of required compartment keys: "day:time:pillColor".
 */
export function EXPAND_RULE(rule: PlanRule): Set<string> {
  const result = new Set<string>();
  rule.days.forEach((day) => {
    if (rule.exceptionDay && day === rule.exceptionDay) {
      // Excluded by exception rule
      return;
    }
    rule.times.forEach((time) => {
      result.add(`${day}:${time}:${rule.pillColor}`);
    });
  });
  return result;
}

/**
 * Generates the full set of target compartment keys for a scenario.
 */
export function EXPAND_SCENARIO(scenario: PlannerScenario): Set<string> {
  const combined = new Set<string>();
  scenario.rules.forEach((rule) => {
    const expanded = EXPAND_RULE(rule);
    expanded.forEach((key) => combined.add(key));
  });
  return combined;
}

export const KNOB_SCENARIOS: Record<number, PlannerScenario[]> = {
  1: [
    {
      id: "knob1-round1",
      title: "Morning and Night Practice",
      rowHints: {
        morning: "Red pill: morning every day",
        afternoon: "No pills after lunch",
        night: "Blue pill: night every day",
      },
      rules: [
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["morning"],
          instruction: "Red pill: morning every day.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["night"],
          instruction: "Blue pill: night every day.",
        },
      ],
    },
    {
      id: "knob1-round2",
      title: "Midday and Evening Routine",
      rowHints: {
        morning: "No pills in the morning",
        afternoon: "Blue pill: afternoon only",
        night: "Red pill: night only",
      },
      rules: [
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["afternoon"],
          instruction: "Blue pill: afternoon only every day.",
        },
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["night"],
          instruction: "Red pill: night only every day.",
        },
      ],
    },
    {
      id: "knob1-round3",
      title: "Three-Day Weekday Schedule",
      rowHints: {
        morning: "Red pill: Monday, Wednesday and Friday",
        afternoon: "No pills after lunch",
        night: "Blue pill: Monday, Wednesday and Friday",
      },
      rules: [
        {
          pillColor: "red",
          days: ["Monday", "Wednesday", "Friday"],
          times: ["morning"],
          instruction: "Red pill: Monday, Wednesday and Friday morning.",
        },
        {
          pillColor: "blue",
          days: ["Monday", "Wednesday", "Friday"],
          times: ["night"],
          instruction: "Blue pill: Monday, Wednesday and Friday night.",
        },
      ],
    },
  ],
  2: [
    {
      id: "knob2-round1",
      title: "Two Pill Daily Routine",
      rules: [
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["morning", "night"],
          instruction: "Red pill: morning and night every day.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["afternoon"],
          instruction: "Blue pill: after lunch only every day.",
        },
      ],
    },
    {
      id: "knob2-round2",
      title: "Three Pill Weekday Schedule",
      rules: [
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["morning"],
          instruction: "Red pill: morning every day.",
        },
        {
          pillColor: "yellow",
          days: ["Monday", "Wednesday", "Friday"],
          times: ["morning"],
          instruction: "Yellow pill: Monday, Wednesday and Friday morning.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["night"],
          instruction: "Blue pill: night every day.",
        },
      ],
    },
    {
      id: "knob2-round3",
      title: "Sunday Exception Practice",
      hasException: true,
      exceptionNote: "Doctor's note: Skip the red pill on Sunday!",
      rules: [
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["morning"],
          exceptionDay: "Sunday",
          instruction: "Red pill: morning every day, but skip the red pill on Sunday.",
          exceptionInstruction: "Skip the red pill on Sunday.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["night"],
          instruction: "Blue pill: night every day.",
        },
      ],
    },
  ],
  3: [
    {
      id: "knob3-round1",
      title: "Three Pill Specific Days",
      rules: [
        {
          pillColor: "red",
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          times: ["morning"],
          instruction: "Red pill: Monday through Friday morning.",
        },
        {
          pillColor: "yellow",
          days: ["Tuesday", "Thursday", "Saturday"],
          times: ["afternoon"],
          instruction: "Yellow pill: Tuesday, Thursday and Saturday afternoon.",
        },
        {
          pillColor: "green",
          days: ["Saturday", "Sunday"],
          times: ["night"],
          instruction: "Green pill: Saturday and Sunday night.",
        },
      ],
    },
    {
      id: "knob3-round2",
      title: "Alternate Day Schedule",
      rules: [
        {
          pillColor: "blue",
          days: ["Monday", "Wednesday", "Friday", "Sunday"],
          times: ["morning", "night"],
          instruction: "Blue pill: Monday, Wednesday, Friday and Sunday morning and night.",
        },
        {
          pillColor: "red",
          days: ["Tuesday", "Thursday", "Saturday"],
          times: ["morning"],
          instruction: "Red pill: Tuesday, Thursday and Saturday morning.",
        },
        {
          pillColor: "green",
          days: ["Tuesday", "Thursday"],
          times: ["afternoon"],
          instruction: "Green pill: Tuesday and Thursday afternoon.",
        },
      ],
    },
    {
      id: "knob3-round3",
      title: "Weekend Rest Exception",
      hasException: true,
      exceptionNote: "Special rule: Skip the green pill on Sunday!",
      rules: [
        {
          pillColor: "yellow",
          days: ["Monday", "Wednesday", "Friday"],
          times: ["morning"],
          instruction: "Yellow pill: Monday, Wednesday and Friday morning.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["afternoon"],
          instruction: "Blue pill: afternoon every day.",
        },
        {
          pillColor: "green",
          days: [...WEEK_DAYS],
          times: ["night"],
          exceptionDay: "Sunday",
          instruction: "Green pill: night every day, but skip the green pill on Sunday.",
          exceptionInstruction: "Skip the green pill on Sunday.",
        },
      ],
    },
  ],
  4: [
    {
      id: "knob4-round1",
      title: "Four Pill Multi-Time Schedule",
      rules: [
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["morning"],
          instruction: "Red pill: morning every day.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["night"],
          instruction: "Blue pill: night every day.",
        },
        {
          pillColor: "yellow",
          days: ["Monday", "Wednesday", "Friday"],
          times: ["afternoon"],
          instruction: "Yellow pill: Monday, Wednesday and Friday afternoon.",
        },
        {
          pillColor: "green",
          days: ["Saturday", "Sunday"],
          times: ["morning"],
          instruction: "Green pill: Saturday and Sunday morning.",
        },
      ],
    },
    {
      id: "knob4-round2",
      title: "Four Pill Rule with Wednesday Exception",
      hasException: true,
      exceptionNote: "Doctor's update: Skip the yellow pill on Wednesday!",
      rules: [
        {
          pillColor: "red",
          days: ["Monday", "Tuesday", "Thursday", "Friday"],
          times: ["morning", "night"],
          instruction: "Red pill: Monday, Tuesday, Thursday and Friday morning and night.",
        },
        {
          pillColor: "yellow",
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          times: ["morning"],
          exceptionDay: "Wednesday",
          instruction: "Yellow pill: Monday to Friday morning, but skip Wednesday.",
          exceptionInstruction: "Skip the yellow pill on Wednesday.",
        },
        {
          pillColor: "green",
          days: ["Tuesday", "Thursday", "Saturday"],
          times: ["afternoon"],
          instruction: "Green pill: Tuesday, Thursday and Saturday afternoon.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["night"],
          instruction: "Blue pill: night every day.",
        },
      ],
    },
    {
      id: "knob4-round3",
      title: "Four Pill Rule with Sunday Exception",
      hasException: true,
      exceptionNote: "Doctor's update: Skip the red pill on Sunday!",
      rules: [
        {
          pillColor: "red",
          days: [...WEEK_DAYS],
          times: ["morning", "night"],
          exceptionDay: "Sunday",
          instruction: "Red pill: morning and night every day, but skip the red pill on Sunday.",
          exceptionInstruction: "Skip the red pill on Sunday.",
        },
        {
          pillColor: "blue",
          days: [...WEEK_DAYS],
          times: ["afternoon"],
          instruction: "Blue pill: after lunch only every day.",
        },
        {
          pillColor: "yellow",
          days: ["Monday", "Wednesday", "Friday"],
          times: ["morning"],
          instruction: "Yellow pill: Monday, Wednesday and Friday morning.",
        },
        {
          pillColor: "green",
          days: ["Tuesday", "Thursday", "Saturday"],
          times: ["night"],
          instruction: "Green pill: Tuesday, Thursday and Saturday night.",
        },
      ],
    },
  ],
};
