export type AnswerOption = { id: string; label: string; synonyms?: string[] };
export type AnswerMatch = { kind: "accept" | "confirm"; option: AnswerOption; similarity: number } | { kind: "retry" };

export function localizeAnswerOptions(options: AnswerOption[], localize: (label: string) => string, localeSynonyms: Record<string, string[]>) {
  return options.map(option => {
    const label = localize(option.label);
    return { ...option, label, synonyms: Array.from(new Set([...(option.synonyms ?? []), ...(localeSynonyms[option.label] ?? []), ...(localeSynonyms[label] ?? [])])) };
  });
}

export function normalizeAnswer(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
}

export function similarity(left: string, right: string) {
  const a = Array.from(normalizeAnswer(left)), b = Array.from(normalizeAnswer(right));
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  a.forEach((letter, i) => {
    const row = [i + 1];
    b.forEach((other, j) => row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (letter === other ? 0 : 1))));
    previous = row;
  });
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function matchAnswer(text: string, options: AnswerOption[], confidence = 0): AnswerMatch {
  const normalized = normalizeAnswer(text);
  if (!normalized) return { kind: "retry" };
  const ranked = options.map(option => ({ option, similarity: Math.max(...[option.label, ...(option.synonyms ?? [])].map(label => similarity(normalized, label))) })).sort((a, b) => b.similarity - a.similarity);
  const best = ranked[0];
  if (!best || best.similarity < 0.65) return { kind: "retry" };
  if (ranked[1] && best.similarity - ranked[1].similarity < 0.12) return { kind: "confirm", ...best };
  return { kind: best.similarity === 1 && confidence >= 0.8 ? "accept" : "confirm", ...best };
}
