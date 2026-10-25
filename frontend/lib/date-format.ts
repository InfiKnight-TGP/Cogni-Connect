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
/**
 * Parse a "yyyy-MM-dd" date string as a local Date (never UTC).
 * Using `new Date("yyyy-MM-dd")` parses as UTC midnight, which in Western
 * timezones shifts the date to the previous day. This helper prevents that.
 */
export function parseLocalDate(dateStr: string): Date {
  const clean = String(dateStr).trim().slice(0, 10);
  const parts = clean.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Categorize a memory date into "today", "this_week" (days 1-7), or "earlier" (days 8+ or missing).
 */
export function getMemoryDateCategory(
  dateStr?: string | null,
  baseDate?: Date
): "today" | "this_week" | "earlier" {
  if (!dateStr) return "earlier";
  const clean = String(dateStr).trim().slice(0, 10);
  const parts = clean.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "earlier";
  const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = baseDate ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays > 0 && diffDays <= 7) return "this_week";
  return "earlier";
}

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

  for (const memory of memories) {
    const category = getMemoryDateCategory(memory.date, baseDate);
    if (category === "today") {
      todayItems.push(memory);
    } else if (category === "this_week") {
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
