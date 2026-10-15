/**
 * Location module regression tests (Nikil – Task C / Location features).
 *
 * Run with:  node frontend/lib/interaction/location.check.mjs
 *
 * Covers:
 *  - Coordinate validation (valid, out-of-range, inaccurate, NaN)
 *  - haversine distance accuracy
 *  - Visit grouping: consecutive samples → single visit
 *  - Visit grouping: gap > maxGap → separate visits
 *  - Distinct-day counting (same-day repeated samples = one distinct day)
 *  - Favourite suggestion threshold
 *  - formatDistance
 */
import assert from 'node:assert/strict';
import {
  isValidCoordinate, haversineMetres, groupSamplesIntoVisits,
  clusterVisitsIntoPlaces, suggestFavourites, formatDistance,
} from './location.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sample(lat, lon, ts, accuracy = 10) {
  return { latitude: lat, longitude: lon, accuracy, timestamp: ts, day: new Date(ts).toISOString().slice(0, 10) };
}

// ── isValidCoordinate ─────────────────────────────────────────────────────────
{
  assert.ok(isValidCoordinate(sample(12.97, 77.59, Date.now())), 'valid sample');
  assert.ok(!isValidCoordinate({ latitude: 91, longitude: 0, accuracy: 10, timestamp: Date.now(), day: '2026-10-01' }), 'latitude > 90 invalid');
  assert.ok(!isValidCoordinate({ latitude: 0, longitude: 181, accuracy: 10, timestamp: Date.now(), day: '2026-10-01' }), 'longitude > 180 invalid');
  assert.ok(!isValidCoordinate({ latitude: NaN, longitude: 0, accuracy: 10, timestamp: Date.now(), day: '2026-10-01' }), 'NaN latitude invalid');
  assert.ok(!isValidCoordinate({ latitude: 12, longitude: 77, accuracy: 5000, timestamp: Date.now(), day: '2026-10-01' }), 'accuracy > 2000 invalid');
  console.log('✓ isValidCoordinate');
}

// ── haversineMetres ───────────────────────────────────────────────────────────
{
  // Two identical points = 0
  const a = { latitude: 12.97, longitude: 77.59 };
  assert.ok(haversineMetres(a, a) < 1, 'identical points ~0');
  // Bangalore to Chennai is roughly 290 km
  const bangalore = { latitude: 12.97, longitude: 77.59 };
  const chennai = { latitude: 13.08, longitude: 80.27 };
  const dist = haversineMetres(bangalore, chennai);
  assert.ok(dist > 200_000 && dist < 350_000, `Bangalore-Chennai distance: ${dist}`);
  console.log('✓ haversineMetres');
}

// ── groupSamplesIntoVisits: consecutive samples → single visit ────────────────
{
  const ts = 1_700_000_000_000;
  const lat = 12.97, lon = 77.59;
  // Six samples 5 minutes apart, all at the same spot
  const ss = Array.from({ length: 6 }, (_, i) => sample(lat + i * 0.0001, lon, ts + i * 5 * 60 * 1000));
  const visits = groupSamplesIntoVisits(ss, 150, 30 * 60 * 1000, 5 * 60 * 1000);
  assert.equal(visits.length, 1, 'nearby samples should form one visit');
  assert.equal(visits[0].sampleCount, 6);
  console.log('✓ consecutive samples → single visit');
}

// ── groupSamplesIntoVisits: large gap → two visits ────────────────────────────
{
  const ts = 1_700_000_000_000;
  const lat = 12.97, lon = 77.59;
  const s1 = sample(lat, lon, ts);
  const s2 = sample(lat, lon, ts + 5 * 60 * 1000);       // same place, 5 min later
  const s3 = sample(lat + 1, lon + 1, ts + 3 * 60 * 60 * 1000);  // far, 3 hrs later
  const s4 = sample(lat + 1, lon + 1, ts + 3 * 60 * 60 * 1000 + 5 * 60 * 1000);
  const visits = groupSamplesIntoVisits([s1, s2, s3, s4], 150, 30 * 60 * 1000, 0);
  assert.equal(visits.length, 2, 'gap > maxGap → two separate visits');
  console.log('✓ gap produces separate visits');
}

// ── groupSamplesIntoVisits: invalid samples excluded ─────────────────────────
{
  const good = sample(12.97, 77.59, Date.now(), 10);
  const bad  = { latitude: 999, longitude: 0, accuracy: 10, timestamp: Date.now() + 1, day: '2026-10-01' };
  const visits = groupSamplesIntoVisits([good, bad], 150, 30 * 60 * 1000, 0);
  assert.ok(visits.length <= 1, 'Invalid coordinate must be excluded from visit grouping');
  console.log('✓ invalid coordinates excluded');
}

// ── clusterVisitsIntoPlaces: same-day repeats counted as one distinct day ─────
{
  const lat = 12.97, lon = 77.59, day = '2026-10-01';
  const visits = [
    { latitude: lat, longitude: lon, timestamp: 1000, day, sampleCount: 2 },
    { latitude: lat + 0.0005, longitude: lon, timestamp: 2000, day, sampleCount: 2 }, // same day, same place
  ];
  const clusters = clusterVisitsIntoPlaces(visits, 150);
  assert.equal(clusters.length, 1);
  // Both visits are on the same day → 1 distinct day
  assert.equal(clusters[0].distinctDays.length, 1, 'Same-day visits count as one distinct day');
  assert.equal(clusters[0].visitCount, 2, 'Visit count includes all visits');
  console.log('✓ same-day visits count as one distinct day');
}

// ── clusterVisitsIntoPlaces: multi-day distinct count ────────────────────────
{
  const lat = 12.97, lon = 77.59;
  const visits = [
    { latitude: lat, longitude: lon, timestamp: 1000, day: '2026-10-01', sampleCount: 1 },
    { latitude: lat, longitude: lon, timestamp: 2000, day: '2026-10-02', sampleCount: 1 },
    { latitude: lat, longitude: lon, timestamp: 3000, day: '2026-10-03', sampleCount: 1 },
  ];
  const clusters = clusterVisitsIntoPlaces(visits, 150);
  assert.equal(clusters[0].distinctDays.length, 3, 'Three distinct days should be counted');
  console.log('✓ multi-day distinct day counting');
}

// ── suggestFavourites: threshold ──────────────────────────────────────────────
{
  const clusters = [
    { center: { latitude: 12, longitude: 77 }, distinctDays: ['d1', 'd2', 'd3'], visitCount: 3, lastVisitTs: 1000 },
    { center: { latitude: 13, longitude: 78 }, distinctDays: ['d1', 'd2'], visitCount: 2, lastVisitTs: 1000 },
  ];
  const suggested = suggestFavourites(clusters, 3);
  assert.equal(suggested.length, 1, 'Only clusters with ≥ minDistinctDays should be suggested');
  assert.equal(suggested[0].distinctDays.length, 3);
  console.log('✓ suggestFavourites threshold');
}

// ── formatDistance ────────────────────────────────────────────────────────────
{
  assert.equal(formatDistance(500), '500 m');
  assert.equal(formatDistance(1500), '1.5 km');
  assert.equal(formatDistance(10000), '10.0 km');
  console.log('✓ formatDistance');
}

console.log('\nAll location checks passed.');
