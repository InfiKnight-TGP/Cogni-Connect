// @ts-expect-error Node's native TypeScript runner resolves this source import directly.
import { normalizeAnswer } from "./matching.ts";
export type YesterdayMemory = { id: string; label: string; day: string };

export function validMemoryDay(day: unknown): day is string {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  const local = new Date(year, month - 1, date, 12);
  return local.getFullYear() === year && local.getMonth() === month - 1 && local.getDate() === date;
}

const noRecallOption = {
  id: "dont-remember",
  label: "I don't remember",
  synonyms: ["not sure", "I cannot remember"],
};

export function buildYesterdayChoices(
  memories: YesterdayMemory[],
  answerId: string,
  knob: number,
  roundIndex: number,
) {
  const answer = memories.find(memory => memory.id === answerId);
  if (!answer || answerId === noRecallOption.id || !validMemoryDay(answer.day) || !normalizeAnswer(answer.label)) {
    throw new Error("Yesterday Quiz answer must match a saved memory");
  }

  const level = Math.max(1, Math.min(4, Math.trunc(Number.isFinite(knob) ? knob : 1)));
  const seen = new Set([answerId, noRecallOption.id]);
  // Every memory from the target day answers the question truthfully. Also
  // exclude earlier copies of those summaries, so repeated routines are fair.
  const seenLabels = new Set(memories.filter(memory => memory.day === answer.day).map(memory => normalizeAnswer(memory.label)));
  const distractors: YesterdayMemory[] = [];
  for (const memory of memories) {
    if (distractors.length >= level - 1) break;
    const label = normalizeAnswer(memory.label);
    if (seen.has(memory.id) || !label || seenLabels.has(label) || !validMemoryDay(memory.day) || memory.day >= answer.day) continue;
    seen.add(memory.id);
    seenLabels.add(label);
    distractors.push(memory);
  }

  const choices = [answer, ...distractors, noRecallOption];
  const offset = ((roundIndex + 1) % choices.length + choices.length) % choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}
