export type Locale = {
  code: string; speechLanguage: string; name: string;
  read: string; voice: string; mixed: string; choose: string; mic: string; replay: string;
  listening: string; speaking: string; retry: string; fallback: string; confirm: string;
  yes: string; no: string; heard: string; saved: string; storageError: string;
  help: string[]; synonyms: Record<string, string[]>; ui?: Record<string, string>;
};

/** Translate a visible UI phrase when this locale provides it; English remains the fallback. */
export function translate(locale: Locale, phrase: string, values: Record<string, string | number> = {}): string {
  let translated = locale.ui?.[phrase] ?? phrase;
  const resolvedValues: Record<string, string | number> = { ...values };
  if (!locale.ui?.[phrase]) {
    const templates = Object.entries(locale.ui ?? {}).map(([template, value], index) => ({
      template,
      value,
      index,
      placeholders: Array.from(template.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)),
      literalLength: template.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, "").length,
    })).sort((a, b) => b.literalLength - a.literalLength || a.placeholders.length - b.placeholders.length || a.index - b.index);
    for (const { template, value } of templates) {
      const names: string[] = [];
      const pattern = new RegExp(`^${template.split(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g).map((part, index) => {
        if (index % 2) { names.push(part); return "([\\s\\S]*?)"; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("")}$`);
      const match = phrase.match(pattern);
      if (!match) continue;
      translated = value;
      names.forEach((name, index) => {
        if (!Object.prototype.hasOwnProperty.call(values, name)) resolvedValues[name] = match[index + 1];
      });
      break;
    }
  }
  return translated.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(resolvedValues, name) ? String(resolvedValues[name]) : token,
  );
}
