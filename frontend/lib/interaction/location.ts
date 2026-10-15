/**
 * Location capture, visit grouping, favourite-place detection.
 *
 * All functionality is consent-gated.  This module never touches the
 * GPS hardware or localStorage without explicit external calls.
 *
 * Browser limitation note
 * ───────────────────────
 * navigator.geolocation.watchPosition() only runs while the page tab is
 * open and in the foreground (or in the background in some mobile browsers).
 * This module does NOT claim continuous background tracking.  The UI should
 * make this limitation clear to the patient and caregiver.
 */

export type LocationSample = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  day: string;
};

export type Visit = {
  latitude: number;
  longitude: number;
  timestamp: number;
  day: string;
  arrivalTs?: number;
  departureTs?: number;
  sampleCount: number;
};

export type PlaceCluster = {
  center: { latitude: number; longitude: number };
  distinctDays: string[];
  visitCount: number;
  lastVisitTs: number;
};

export type SavedPlace = {
  id: string;
  name: string;
  category: "home" | "hospital" | "pharmacy" | "doctor" | "other";
  latitude?: number;
  longitude?: number;
  address?: string;
  caregiverPinned: boolean;
};

// ── Haversine distance in metres ──────────────────────────────────────────────

export function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (a.latitude - b.latitude) * rad;
  const dLon = (a.longitude - b.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── Coordinate validation ─────────────────────────────────────────────────────

export function isValidCoordinate(sample: LocationSample): boolean {
  return (
    typeof sample.latitude === "number" &&
    typeof sample.longitude === "number" &&
    isFinite(sample.latitude) &&
    isFinite(sample.longitude) &&
    sample.latitude >= -90 &&
    sample.latitude <= 90 &&
    sample.longitude >= -180 &&
    sample.longitude <= 180 &&
    typeof sample.accuracy === "number" &&
    isFinite(sample.accuracy) &&
    sample.accuracy > 0 &&
    sample.accuracy < 2000 // reject very inaccurate GPS readings
  );
}

// ── Group samples into visits ─────────────────────────────────────────────────
// A visit is a run of consecutive samples within `stayRadiusM` of the
// centroid, with no more than `maxGapMs` between consecutive samples.

export function groupSamplesIntoVisits(
  samples: LocationSample[],
  stayRadiusM = 150,
  maxGapMs = 30 * 60 * 1000, // 30 minutes
  minDurationMs = 5 * 60 * 1000, // 5 minutes
): Visit[] {
  const valid = samples
    .filter(isValidCoordinate)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (valid.length === 0) return [];

  const visits: Visit[] = [];
  let group: LocationSample[] = [valid[0]];

  for (let i = 1; i < valid.length; i++) {
    const s = valid[i];
    const centroid = groupCentroid(group);
    const gap = s.timestamp - group[group.length - 1].timestamp;
    if (haversineMetres(centroid, s) <= stayRadiusM && gap <= maxGapMs) {
      group.push(s);
    } else {
      const v = buildVisit(group);
      if (v) visits.push(v);
      group = [s];
    }
  }
  const last = buildVisit(group);
  if (last) visits.push(last);

  // Filter visits that are too short (just passing through).
  return visits.filter(
    v => (v.departureTs ?? v.timestamp) - (v.arrivalTs ?? v.timestamp) >= minDurationMs || v.sampleCount > 1,
  );
}

function groupCentroid(group: LocationSample[]): { latitude: number; longitude: number } {
  const lat = group.reduce((s, g) => s + g.latitude, 0) / group.length;
  const lon = group.reduce((s, g) => s + g.longitude, 0) / group.length;
  return { latitude: lat, longitude: lon };
}

function buildVisit(group: LocationSample[]): Visit | null {
  if (group.length === 0) return null;
  const c = groupCentroid(group);
  const sorted = group.sort((a, b) => a.timestamp - b.timestamp);
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    timestamp: sorted[0].timestamp,
    day: sorted[0].day,
    arrivalTs: sorted[0].timestamp,
    departureTs: sorted[sorted.length - 1].timestamp,
    sampleCount: group.length,
  };
}

// ── Cluster visits into candidate places ─────────────────────────────────────

export function clusterVisitsIntoPlaces(
  visits: Visit[],
  clusterRadiusM = 150,
): PlaceCluster[] {
  const clusters: PlaceCluster[] = [];

  for (const visit of visits) {
    const match = clusters.find(
      c => haversineMetres(c.center, visit) <= clusterRadiusM,
    );
    if (match) {
      if (!match.distinctDays.includes(visit.day)) {
        match.distinctDays.push(visit.day);
      }
      match.visitCount++;
      if (visit.timestamp > match.lastVisitTs) {
        match.lastVisitTs = visit.timestamp;
        // Incrementally update centroid
        const n = match.distinctDays.length;
        match.center.latitude += (visit.latitude - match.center.latitude) / n;
        match.center.longitude += (visit.longitude - match.center.longitude) / n;
      }
    } else {
      clusters.push({
        center: { latitude: visit.latitude, longitude: visit.longitude },
        distinctDays: [visit.day],
        visitCount: 1,
        lastVisitTs: visit.timestamp,
      });
    }
  }

  return clusters.sort((a, b) => b.distinctDays.length - a.distinctDays.length);
}

// ── Suggest favourites based on distinct-visit frequency ─────────────────────

export function suggestFavourites(
  clusters: PlaceCluster[],
  minDistinctDays = 3,
): PlaceCluster[] {
  return clusters.filter(c => c.distinctDays.length >= minDistinctDays);
}

// ── Distance text for display ─────────────────────────────────────────────────

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// ── Google Maps navigation URL ────────────────────────────────────────────────

export function mapsUrl(
  dest: { latitude: number; longitude: number; name?: string },
  current?: { latitude: number; longitude: number },
): string {
  const destination = dest.name
    ? encodeURIComponent(dest.name) + `+${dest.latitude},${dest.longitude}`
    : `${dest.latitude},${dest.longitude}`;
  if (current) {
    return `https://www.google.com/maps/dir/${current.latitude},${current.longitude}/${destination}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${destination}`;
}
