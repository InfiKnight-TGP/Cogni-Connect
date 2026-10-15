export type Preferences = {
  soundEffects: boolean;
  animations: boolean;
  encouragingMessages: boolean;
  readAloud: boolean;
  answerBySpeaking: boolean;
  listenAutomatically: boolean;
  speechRate: "slow" | "normal";
  textSize: "large" | "larger" | "largest";
};

export const DEFAULT_PREFERENCES: Preferences = {
  soundEffects: true,
  animations: true,
  encouragingMessages: true,
  readAloud: false,
  answerBySpeaking: false,
  listenAutomatically: false,
  speechRate: "normal",
  textSize: "large",
};

const STORAGE_KEY = "cogniconnect.preferences.v1";
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PREFERENCES };
    const answerBySpeaking = value.answerBySpeaking === true;
    return {
      soundEffects: typeof value.soundEffects === "boolean" ? value.soundEffects : DEFAULT_PREFERENCES.soundEffects,
      animations: typeof value.animations === "boolean" ? value.animations : DEFAULT_PREFERENCES.animations,
      encouragingMessages: typeof value.encouragingMessages === "boolean" ? value.encouragingMessages : DEFAULT_PREFERENCES.encouragingMessages,
      readAloud: typeof value.readAloud === "boolean" ? value.readAloud : DEFAULT_PREFERENCES.readAloud,
      answerBySpeaking,
      listenAutomatically: answerBySpeaking && value.listenAutomatically === true,
      speechRate: value.speechRate === "slow" || value.speechRate === "normal" ? value.speechRate : DEFAULT_PREFERENCES.speechRate,
      textSize: value.textSize === "large" || value.textSize === "larger" || value.textSize === "largest" ? value.textSize : DEFAULT_PREFERENCES.textSize,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreferences(value: Preferences) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Preferences remain active for this session. */ }
}

export function textSizePixels(size: Preferences["textSize"]) {
  return ({ large: 18, larger: 20, largest: 22 } as const)[size];
}
