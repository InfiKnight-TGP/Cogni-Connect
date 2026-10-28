import type { Story } from "./data";

export type MemoryFact = {
  id: string; friendlyDate: string; weekday: string; title: string;
  people: string[]; place: string; activity: string; note: string;
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const builtInPeople = ["a family member", "a friend", "a caregiver", "someone you know"];
const builtInPlaces = ["a shop", "a park", "a family home", "a familiar place"];

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeOptions(answer: string, fromMemories: string[], fallback: string[], count: number, random: () => number) {
  const distractors = Array.from(new Set([...shuffle(fromMemories, random), ...shuffle(fallback, random)])).filter(item => item !== answer);
  return shuffle([answer, ...distractors.slice(0, count - 1)], random);
}

function usable(fact: MemoryFact): fact is MemoryFact & { weekday: string; place: string; people: [string, ...string[]] } {
  return Boolean(fact.weekday && fact.place && fact.people?.length && fact.people[0]);
}

export function buildPersonalStory(fact: MemoryFact, allFacts: MemoryFact[], optionCount: number, random: () => number = Math.random): Story {
  const person = fact.people[0];
  const sentence0 = `On ${fact.weekday}, you went to ${fact.place}.`;
  const sentence1 = `You were with ${person}.`;
  const activity = fact.activity || fact.note || "";
  const story: Story = {
    title: "A memory from your life",
    sentences: [sentence0, sentence1, activity || "You saved this memory.", "This is a memory from your day."],
    personal: { weekday: fact.weekday, place: fact.place, person, activity },
    blanks: [],
  };
  const otherPeople = allFacts.flatMap(item => item.people ?? []).filter(name => name && name !== person);
  const otherPlaces = allFacts.map(item => item.place).filter(place => place && place !== fact.place);
  story.blanks = [
    { sentence: 0, answer: fact.weekday, kind: "weekday", options: makeOptions(fact.weekday, allFacts.map(item => item.weekday).filter(day => day && day !== fact.weekday), weekdays, optionCount, random) },
    { sentence: 0, answer: fact.place, kind: "place", options: makeOptions(fact.place, otherPlaces, builtInPlaces, optionCount, random) },
    { sentence: 1, answer: person, kind: "person", options: makeOptions(person, otherPeople, builtInPeople, optionCount, random) },
  ];
  return story;
}

export function buildStorySession(facts: MemoryFact[], builtIns: Story[], storyCount: number, optionCount: number, random: () => number = Math.random): Story[] {
  const eligible = shuffle(facts.filter(usable), random);
  if (eligible.length === 0) {
    // Preserve the existing no-memory mix: two random built-ins, plus story 3 at knob 4.
    const first = Math.floor(random() * builtIns.length);
    let second = Math.floor(random() * builtIns.length);
    while (second === first && builtIns.length > 1) second = Math.floor(random() * builtIns.length);
    return [builtIns[first], builtIns[second], ...(storyCount === 3 ? [builtIns[2]] : [])];
  }
  const personalCount = Math.min(storyCount, eligible.length);
  const result = eligible.slice(0, personalCount).map(fact => buildPersonalStory(fact, facts, optionCount, random));
  const remaining = builtIns.filter(story => !result.some(item => item.title === story.title));
  while (result.length < storyCount && remaining.length) {
    const index = Math.floor(random() * remaining.length);
    result.push(remaining.splice(index, 1)[0]);
  }
  return shuffle(result, random);
}
