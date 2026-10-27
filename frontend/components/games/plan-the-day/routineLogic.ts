export type RoutineQuestion = {
  kind: "after" | "first" | "missing";
  prompt: "What comes after {step}?" | "What do you do first in your day?" | "Which step is missing?";
  step?: string;
  display?: string[];
  options: string[];
  answer: string;
};

const everyday = ["Have a drink of water", "Rest for a little while", "Wash your hands", "Sit in a comfortable chair", "Put on your shoes", "Open the curtains"];

export function hasUsableRoutine(steps: string[] | undefined) {
  return Array.isArray(steps) && new Set(steps).size >= 3;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function choices(answer: string, steps: string[], count: number, random: () => number): string[] {
  const distractors = Array.from(new Set([...shuffled(steps, random), ...shuffled(everyday, random)])).filter(value => value !== answer);
  return shuffled([answer, ...distractors.slice(0, count - 1)], random);
}

/** Build routine-only questions. The caller enables this only for at least 3 steps. */
export function buildRoutineQuestions(input: string[], knob: number, random: () => number = Math.random): RoutineQuestion[] {
  const steps = Array.from(new Set(input));
  if (steps.length < 3) return [];
  const difficulty = Math.max(1, Math.min(4, Math.round(knob)));
  const optionCount = difficulty === 1 ? 2 : difficulty === 2 ? 3 : 4;
  const anchorIndex = Math.floor(random() * (steps.length - 1));
  const afterAnswer = steps[anchorIndex + 1];
  const result: RoutineQuestion[] = [{
    kind: "after", prompt: "What comes after {step}?", step: steps[anchorIndex], answer: afterAnswer,
    options: choices(afterAnswer, steps, optionCount, random),
  }];
  if (difficulty >= 3) result.push({
    kind: "first", prompt: "What do you do first in your day?", answer: steps[0],
    options: choices(steps[0], steps, 4, random),
  });
  if (difficulty >= 4) {
    const removedIndex = Math.floor(random() * steps.length);
    result.push({
      kind: "missing", prompt: "Which step is missing?", display: steps.filter((_, index) => index !== removedIndex),
      answer: steps[removedIndex], options: choices(steps[removedIndex], steps, 4, random),
    });
  }
  return result;
}
