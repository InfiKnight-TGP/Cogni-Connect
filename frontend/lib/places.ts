export const PLACE_CATEGORIES = [
  "home",
  "shop",
  "doctor",
  "temple",
  "family",
  "park",
  "other",
] as const;

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export type PlaceHours = {
  opensAt: string;
  closesAt: string;
  closedDays: string[];
};
export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  mapsUrl: string;
  note: string;
  photo: string | null;
  hours: PlaceHours | null;
  createdAt: string;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const GOOGLE_MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "www.google.com",
  "google.com",
  "maps.google.com",
]);

export function isGoogleMapsUrl(value: string): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 300 ||
    !/^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl|www\.google\.com|google\.com|maps\.google\.com)(?::443)?(?:[/?#]|$)/i.test(value) ||
    /[\s\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !GOOGLE_MAPS_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return false;
    }
    if (
      ["goo.gl", "www.google.com", "google.com"].includes(url.hostname) &&
      !url.pathname.startsWith("/maps")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isOpenAt(
  place: Pick<Place, "hours">,
  weekday: string,
  localTime: string,
): boolean {
  if (!WEEKDAYS.includes(weekday as (typeof WEEKDAYS)[number]) || !TIME_PATTERN.test(localTime)) {
    return false;
  }
  const hours = place.hours;
  if (
    !hours ||
    hours.closedDays.includes(weekday) ||
    !TIME_PATTERN.test(hours.opensAt) ||
    !TIME_PATTERN.test(hours.closesAt)
  ) {
    return false;
  }
  const { opensAt, closesAt } = hours;
  if (opensAt === closesAt) return true;
  if (closesAt < opensAt) return localTime >= opensAt || localTime < closesAt;
  return localTime >= opensAt && localTime < closesAt;
}

export function canEditPlaces(role: string | undefined): boolean {
  return role === "self" || role === "caregiver";
}
