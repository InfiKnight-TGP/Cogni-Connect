export type YesterdayMemory = { id: string; label: string };

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
  if (!answer || answerId === noRecallOption.id) {
    throw new Error("Yesterday Quiz answer must match a saved memory");
  }

  const level = Math.max(1, Math.min(4, Math.trunc(Number.isFinite(knob) ? knob : 1)));
  const seen = new Set([answerId, noRecallOption.id]);
  const distractors: YesterdayMemory[] = [];
  for (const memory of memories) {
    if (distractors.length >= level - 1) break;
    if (seen.has(memory.id)) continue;
    seen.add(memory.id);
    distractors.push(memory);
  }

  const choices = [answer, ...distractors, noRecallOption];
  const offset = ((roundIndex + 1) % choices.length + choices.length) % choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}
