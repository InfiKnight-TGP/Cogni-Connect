export type Locale = {
  code: string; speechLanguage: string; name: string;
  read: string; voice: string; mixed: string; choose: string; mic: string; replay: string;
  listening: string; speaking: string; retry: string; fallback: string; confirm: string;
  yes: string; no: string; heard: string; saved: string; storageError: string;
  help: string[]; synonyms: Record<string, string[]>; ui?: Record<string, string>;
};

/** Translate a visible UI phrase when this locale provides it; English remains the fallback. */
export function translate(locale: Locale, phrase: string): string {
  return locale.ui?.[phrase] ?? phrase;
}
