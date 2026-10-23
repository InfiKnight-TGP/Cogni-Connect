const WEEKDAYS: Record<string, string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  hi: ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"],
  as: ["সোমবাৰ", "মঙ্গলবাৰ", "বুধবাৰ", "বৃহস্পতিবাৰ", "শুক্ৰবাৰ", "শনিবাৰ", "দেওবাৰ"],
};

const MONTHS: Record<string, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  as: ["জানুৱাৰী", "ফেব্ৰুৱাৰী", "মাৰ্চ", "এপ্ৰিল", "মে", "জুন", "জুলাই", "আগষ্ট", "ছেপ্টেম্বৰ", "অক্টোবৰ", "নৱেম্বৰ", "ডিচেম্বৰ"],
};

export function formatFriendlyDate(dateStr?: string | null, lang: string = "en", baseDate?: Date): string {
  if (!dateStr) return "";
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return clean;
  const [year, month, day] = parts;
  const targetDate = new Date(year, month - 1, day);
  const now = baseDate ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return lang === "hi" ? "आज" : lang === "as" ? "আজি" : "Today";
  }
  if (diffDays === 1) {
    return lang === "hi" ? "कल" : lang === "as" ? "কালি" : "Yesterday";
  }

  const dayOfWeekIndex = (targetDate.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  const weekday = (WEEKDAYS[lang] ?? WEEKDAYS.en)[dayOfWeekIndex];
  const monthName = (MONTHS[lang] ?? MONTHS.en)[month - 1];
  return `${weekday} ${day} ${monthName}`;
}

export type DateGroup<T> = {
  label: string;
  items: T[];
};

export function groupMemoriesByDate<T extends { date?: string | null }>(
  memories: T[],
  lang: string = "en",
  baseDate?: Date
): DateGroup<T>[] {
  const todayLabel = lang === "hi" ? "आज" : lang === "as" ? "আজি" : "Today";
  const thisWeekLabel = lang === "hi" ? "इस सप्ताह" : lang === "as" ? "এই সপ্তাহত" : "This week";
  const earlierLabel = lang === "hi" ? "पहले का" : lang === "as" ? "আগৰ" : "Earlier";

  const todayItems: T[] = [];
  const thisWeekItems: T[] = [];
  const earlierItems: T[] = [];

  const now = baseDate ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const memory of memories) {
    if (!memory.date) {
      earlierItems.push(memory);
      continue;
    }
    const parts = String(memory.date).slice(0, 10).split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      earlierItems.push(memory);
      continue;
    }
    const [year, month, day] = parts;
    const targetDate = new Date(year, month - 1, day);
    const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      todayItems.push(memory);
    } else if (diffDays > 0 && diffDays <= 7) {
      thisWeekItems.push(memory);
    } else {
      earlierItems.push(memory);
    }
  }

  const groups: DateGroup<T>[] = [];
  if (todayItems.length > 0) {
    groups.push({ label: todayLabel, items: todayItems });
  }
  if (thisWeekItems.length > 0) {
    groups.push({ label: thisWeekLabel, items: thisWeekItems });
  }
  if (earlierItems.length > 0) {
    groups.push({ label: earlierLabel, items: earlierItems });
  }

  return groups;
}
