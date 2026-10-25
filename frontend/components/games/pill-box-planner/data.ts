/**
 * Pill Box Planner - Medication Data and Prescriptions
 *
 * Every medication is a realistic, familiar medicine with:
 * - Real pharmaceutical / generic name
 * - Valid dose amount and dose unit (mg, ml, drops, tablets, capsules, IU)
 * - Visual icon/shape and distinct color
 */

export type DoseUnit = "mg" | "ml" | "drops" | "tablet" | "tablets" | "capsule" | "capsules" | "IU";

export interface Medication {
  id: string;
  name: string;
  genericName: string;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseDisplay: string; // e.g. "500 mg (1 tablet)"
  form: "tablet" | "capsule" | "drops" | "syrup";
  color: string;
  bgColor: string;
  borderColor: string;
  iconEmoji: string;
  purpose: string; // Everyday plain description: "For blood pressure", "For joint strength", etc.
  synonyms: string[];
}

export const VALID_DOSE_UNITS: readonly DoseUnit[] = [
  "mg",
  "ml",
  "drops",
  "tablet",
  "tablets",
  "capsule",
  "capsules",
  "IU",
];

export const MEDICATIONS: Record<string, Medication> = {
  paracetamol: {
    id: "paracetamol",
    name: "Paracetamol",
    genericName: "Paracetamol",
    doseAmount: 500,
    doseUnit: "mg",
    doseDisplay: "500 mg · 1 tablet",
    form: "tablet",
    color: "#2563eb",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    borderColor: "border-blue-300 dark:border-blue-700",
    iconEmoji: "💊",
    purpose: "For mild aches and fever relief",
    synonyms: ["paracetamol", "crocin", "calpol", "dolo"],
  },
  metformin: {
    id: "metformin",
    name: "Metformin",
    genericName: "Metformin",
    doseAmount: 500,
    doseUnit: "mg",
    doseDisplay: "500 mg · 1 tablet",
    form: "tablet",
    color: "#059669",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    iconEmoji: "⚪",
    purpose: "For blood sugar balance with meals",
    synonyms: ["metformin", "glycomet", "sugar tablet"],
  },
  amlodipine: {
    id: "amlodipine",
    name: "Amlodipine",
    genericName: "Amlodipine",
    doseAmount: 5,
    doseUnit: "mg",
    doseDisplay: "5 mg · 1 tablet",
    form: "tablet",
    color: "#d97706",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
    borderColor: "border-amber-300 dark:border-amber-700",
    iconEmoji: "🟡",
    purpose: "For smooth blood pressure",
    synonyms: ["amlodipine", "amlong", "bp tablet"],
  },
  omeprazole: {
    id: "omeprazole",
    name: "Omeprazole",
    genericName: "Omeprazole",
    doseAmount: 20,
    doseUnit: "mg",
    doseDisplay: "20 mg · 1 capsule",
    form: "capsule",
    color: "#7c3aed",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    borderColor: "border-purple-300 dark:border-purple-700",
    iconEmoji: "🟣",
    purpose: "For stomach comfort before meals",
    synonyms: ["omeprazole", "omez", "gas capsule"],
  },
  atorvastatin: {
    id: "atorvastatin",
    name: "Atorvastatin",
    genericName: "Atorvastatin",
    doseAmount: 10,
    doseUnit: "mg",
    doseDisplay: "10 mg · 1 tablet",
    form: "tablet",
    color: "#dc2626",
    bgColor: "bg-rose-50 dark:bg-rose-950/40",
    borderColor: "border-rose-300 dark:border-rose-700",
    iconEmoji: "🔴",
    purpose: "For heart and cholesterol health",
    synonyms: ["atorvastatin", "atorva", "cholesterol tablet"],
  },
  calcium_d3: {
    id: "calcium_d3",
    name: "Calcium + D3",
    genericName: "Calcium Carbonate with Vitamin D3",
    doseAmount: 500,
    doseUnit: "mg",
    doseDisplay: "500 mg · 1 tablet",
    form: "tablet",
    color: "#0891b2",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/40",
    borderColor: "border-cyan-300 dark:border-cyan-700",
    iconEmoji: "🔘",
    purpose: "For strong bones and joints",
    synonyms: ["calcium", "shelcal", "bone tablet"],
  },
  vitamin_d3: {
    id: "vitamin_d3",
    name: "Vitamin D3",
    genericName: "Cholecalciferol",
    doseAmount: 60000,
    doseUnit: "IU",
    doseDisplay: "60,000 IU · 1 capsule",
    form: "capsule",
    color: "#ea580c",
    bgColor: "bg-orange-50 dark:bg-orange-950/40",
    borderColor: "border-orange-300 dark:border-orange-700",
    iconEmoji: "🟠",
    purpose: "For energy and bone wellness",
    synonyms: ["vitamin d3", "calcirol", "d3 capsule"],
  },
  eye_drops: {
    id: "eye_drops",
    name: "Eye Drops",
    genericName: "Carboxymethylcellulose Eye Drops",
    doseAmount: 2,
    doseUnit: "drops",
    doseDisplay: "2 drops in each eye",
    form: "drops",
    color: "#0284c7",
    bgColor: "bg-sky-50 dark:bg-sky-950/40",
    borderColor: "border-sky-300 dark:border-sky-700",
    iconEmoji: "💧",
    purpose: "For lubricating dry and tired eyes",
    synonyms: ["eye drops", "refresh tears", "tears"],
  },
  cough_syrup: {
    id: "cough_syrup",
    name: "Cough Syrup",
    genericName: "Herbal Honey Cough Syrup",
    doseAmount: 10,
    doseUnit: "ml",
    doseDisplay: "10 ml (2 spoons)",
    form: "syrup",
    color: "#ca8a04",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/40",
    borderColor: "border-yellow-300 dark:border-yellow-700",
    iconEmoji: "🍯",
    purpose: "For soothing a throat cough",
    synonyms: ["cough syrup", "syrup", "koflet", "benadryl"],
  },
};

export type PillSlot = "morning" | "afternoon" | "evening" | "bedtime";

export interface SlotConfig {
  id: PillSlot;
  name: string;
  icon: string;
  timeHint: string;
}

export const PILL_SLOTS: SlotConfig[] = [
  { id: "morning", name: "Morning", icon: "🌅", timeHint: "Subah · With Breakfast" },
  { id: "afternoon", name: "Afternoon", icon: "☀️", timeHint: "Dopahar · With Lunch" },
  { id: "evening", name: "Evening", icon: "🌆", timeHint: "Shaam · With Tea/Dinner" },
  { id: "bedtime", name: "Bedtime", icon: "🌙", timeHint: "Raat · Before Sleep" },
];

export interface PrescriptionRule {
  medicationId: string;
  slots: PillSlot[];
  instruction: string;
}

export interface RoundScenario {
  id: string;
  title: string;
  activeSlots: PillSlot[];
  availableMedications: string[]; // Medication IDs in tray
  rules: PrescriptionRule[];
  isRuleSwitch?: boolean;
  switchMessage?: string;
}

export interface KnobPrescriptionConfig {
  knob: number;
  totalRounds: number;
  rounds: RoundScenario[];
}

export const KNOB_SCENARIOS: Record<number, RoundScenario[]> = {
  1: [
    {
      id: "knob1-round1",
      title: "Daily Morning & Night Routine",
      activeSlots: ["morning", "bedtime"],
      availableMedications: ["omeprazole", "atorvastatin", "paracetamol"],
      rules: [
        { medicationId: "omeprazole", slots: ["morning"], instruction: "Take Omeprazole 20 mg in the Morning." },
        { medicationId: "atorvastatin", slots: ["bedtime"], instruction: "Take Atorvastatin 10 mg at Bedtime." },
      ],
    },
    {
      id: "knob1-round2",
      title: "Morning Heart & Bone Care",
      activeSlots: ["morning", "bedtime"],
      availableMedications: ["amlodipine", "calcium_d3", "cough_syrup"],
      rules: [
        { medicationId: "amlodipine", slots: ["morning"], instruction: "Take Amlodipine 5 mg in the Morning." },
        { medicationId: "calcium_d3", slots: ["morning"], instruction: "Take Calcium + D3 500 mg in the Morning." },
      ],
    },
  ],
  2: [
    {
      id: "knob2-round1",
      title: "3-Time Daily Prescription",
      activeSlots: ["morning", "afternoon", "bedtime"],
      availableMedications: ["omeprazole", "metformin", "atorvastatin", "paracetamol"],
      rules: [
        { medicationId: "omeprazole", slots: ["morning"], instruction: "Take Omeprazole 20 mg in the Morning." },
        { medicationId: "metformin", slots: ["morning", "afternoon"], instruction: "Take Metformin 500 mg in Morning and Afternoon." },
        { medicationId: "atorvastatin", slots: ["bedtime"], instruction: "Take Atorvastatin 10 mg at Bedtime." },
      ],
    },
    {
      id: "knob2-round2",
      title: "Doctor's Prescription Update",
      isRuleSwitch: true,
      switchMessage: "Doctor's update! Metformin now switches to Morning and Bedtime. Add Calcium in the Afternoon.",
      activeSlots: ["morning", "afternoon", "bedtime"],
      availableMedications: ["metformin", "calcium_d3", "paracetamol", "eye_drops"],
      rules: [
        { medicationId: "metformin", slots: ["morning", "bedtime"], instruction: "Switched: Take Metformin 500 mg in Morning and Bedtime." },
        { medicationId: "calcium_d3", slots: ["afternoon"], instruction: "Take Calcium + D3 500 mg in the Afternoon." },
      ],
    },
  ],
  3: [
    {
      id: "knob3-round1",
      title: "Full Day Pill Box",
      activeSlots: ["morning", "afternoon", "evening", "bedtime"],
      availableMedications: ["omeprazole", "amlodipine", "calcium_d3", "eye_drops", "atorvastatin"],
      rules: [
        { medicationId: "omeprazole", slots: ["morning"], instruction: "Take Omeprazole 20 mg in the Morning." },
        { medicationId: "amlodipine", slots: ["morning"], instruction: "Take Amlodipine 5 mg in the Morning." },
        { medicationId: "calcium_d3", slots: ["evening"], instruction: "Take Calcium + D3 500 mg in the Evening." },
        { medicationId: "eye_drops", slots: ["bedtime"], instruction: "Put Eye Drops 2 drops at Bedtime." },
      ],
    },
    {
      id: "knob3-round2",
      title: "Full Day With Repeat Doses",
      activeSlots: ["morning", "afternoon", "evening", "bedtime"],
      availableMedications: ["metformin", "paracetamol", "cough_syrup", "atorvastatin"],
      rules: [
        { medicationId: "metformin", slots: ["morning", "evening"], instruction: "Take Metformin 500 mg in Morning and Evening." },
        { medicationId: "cough_syrup", slots: ["afternoon", "bedtime"], instruction: "Take Cough Syrup 10 ml in Afternoon and Bedtime." },
        { medicationId: "atorvastatin", slots: ["bedtime"], instruction: "Take Atorvastatin 10 mg at Bedtime." },
      ],
    },
  ],
  4: [
    {
      id: "knob4-round1",
      title: "Initial Medication Routine",
      activeSlots: ["morning", "afternoon", "evening", "bedtime"],
      availableMedications: ["paracetamol", "metformin", "amlodipine", "calcium_d3", "atorvastatin"],
      rules: [
        { medicationId: "amlodipine", slots: ["morning"], instruction: "Take Amlodipine 5 mg in the Morning." },
        { medicationId: "metformin", slots: ["morning", "evening"], instruction: "Take Metformin 500 mg in Morning and Evening." },
        { medicationId: "calcium_d3", slots: ["afternoon"], instruction: "Take Calcium + D3 500 mg in the Afternoon." },
        { medicationId: "atorvastatin", slots: ["bedtime"], instruction: "Take Atorvastatin 10 mg at Bedtime." },
      ],
    },
    {
      id: "knob4-round2",
      title: "Clinical Rule Switch Challenge",
      isRuleSwitch: true,
      switchMessage: "Special instruction: Swap Calcium to Bedtime, and take Paracetamol in Morning and Afternoon for joint ache relief!",
      activeSlots: ["morning", "afternoon", "evening", "bedtime"],
      availableMedications: ["paracetamol", "metformin", "calcium_d3", "eye_drops", "vitamin_d3"],
      rules: [
        { medicationId: "paracetamol", slots: ["morning", "afternoon"], instruction: "Switched: Take Paracetamol 500 mg in Morning and Afternoon." },
        { medicationId: "calcium_d3", slots: ["bedtime"], instruction: "Switched: Take Calcium + D3 500 mg at Bedtime." },
        { medicationId: "vitamin_d3", slots: ["morning"], instruction: "Take Vitamin D3 60,000 IU in the Morning." },
        { medicationId: "eye_drops", slots: ["evening"], instruction: "Put Eye Drops 2 drops in the Evening." },
      ],
    },
  ],
};
