import { isOpenAt, type Place } from "@/lib/places";

export type PlaceScenario = {
  kind: "open" | "doctor" | "earliest";
  prompt: "It is {time} on {weekday}. Which place is open?" | "You need a doctor. Where do you go?" | "Which place opens first?";
  time?: string;
  weekday?: string;
  options: Place[];
  answerId: string;
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const times = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

function shuffle<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function combinations<T>(items: T[], size: number, start = 0, prefix: T[] = []): T[][] {
  if (prefix.length === size) return [prefix];
  const output: T[][] = [];
  for (let index = start; index <= items.length - (size - prefix.length); index++) {
    output.push(...combinations(items, size, index + 1, [...prefix, items[index]]));
  }
  return output;
}

function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}

function openQuestions(places: Place[], optionCount: number, specialRequired: boolean, random: () => number): PlaceScenario[] {
  const withHours = places.filter(place => place.hours);
  if (withHours.length < optionCount) return [];
  const candidates: PlaceScenario[] = [];
  for (const weekday of weekdays) {
    for (const time of times) {
      for (const group of combinations(withHours, optionCount)) {
        const open = group.filter(place => isOpenAt(place, weekday, time));
        if (open.length !== 1) continue;
        const hasClosedDay = group.some(place => place.hours?.closedDays.includes(weekday));
        const hasOvernightCase = group.some(place => {
          const hours = place.hours;
          return Boolean(hours && hours.closesAt < hours.opensAt && time < hours.closesAt);
        });
        if (specialRequired && !hasClosedDay && !hasOvernightCase) continue;
        candidates.push({ kind: "open", prompt: "It is {time} on {weekday}. Which place is open?", time: timeLabel(time), weekday, options: group, answerId: open[0].id });
      }
    }
  }
  const unique = new Map(candidates.map(question => [`${question.weekday}|${question.time}|${question.options.map(place => place.id).sort().join(",")}`, question]));
  return shuffle(Array.from(unique.values()), random);
}

function doctorQuestions(places: Place[], optionCount: number, random: () => number): PlaceScenario[] {
  const result = combinations(places, optionCount).filter(group =>
    group.every(place => group.filter(other => other.category === place.category).length === 1) &&
    group.filter(place => place.category === "doctor").length === 1,
  ).map(group => ({ kind: "doctor" as const, prompt: "You need a doctor. Where do you go?" as const, options: group, answerId: group.find(place => place.category === "doctor")!.id }));
  return shuffle(result, random);
}

function earliestQuestions(places: Place[], optionCount: number, random: () => number): PlaceScenario[] {
  const groups = combinations(places.filter(place => place.hours), optionCount).filter(group => new Set(group.map(place => place.hours!.opensAt)).size === optionCount);
  return shuffle(groups.map(group => ({ kind: "earliest" as const, prompt: "Which place opens first?" as const, options: group, answerId: group.reduce((best, place) => place.hours!.opensAt < best.hours!.opensAt ? place : best).id })), random);
}

export function buildPlaceScenarioQuestions(places: Place[], knob: number, random: () => number = Math.random): PlaceScenario[] {
  if (places.length < 3 || places.filter(place => place.hours).length < 2) return [];
  const difficulty = Math.max(1, Math.min(4, Math.round(knob)));
  const optionCount = difficulty === 1 ? 2 : difficulty === 2 ? 3 : 4;
  const targetCount = difficulty === 1 ? 2 : 3;
  const special = difficulty >= 3;
  const open = openQuestions(places, optionCount, special, random);
  if (special && open.length === 0) return [];
  const doctor = doctorQuestions(places, optionCount, random);
  const earliest = earliestQuestions(places, optionCount, random);
  const chosen: PlaceScenario[] = [];
  const firstOpen = open[0];
  if (firstOpen) chosen.push(firstOpen);
  for (const question of [doctor[0], earliest[0]]) {
    if (question && chosen.length < targetCount && !chosen.some(item => item.kind === question.kind)) chosen.push(question);
  }
  for (const question of open.slice(1)) {
    if (chosen.length >= targetCount) break;
    if (!chosen.some(item => item.kind === question.kind && item.weekday === question.weekday && item.time === question.time)) chosen.push(question);
  }
  return chosen.length === targetCount ? shuffle(chosen, random) : [];
}
