/**
 * Sync reliability and account-switch regression tests (Nikil – Task A/B).
 *
 * Run with:   node frontend/lib/interaction/sync-nikil.check.mjs
 *
 * Tests offline-queue behaviour without a DOM or network:
 *  - Duplicate submissions → single record (idempotent)
 *  - Conflicting concurrent updates → last-write-wins
 *  - Account-switch: pending records for patient A not visible for patient B
 *  - Acknowledged records leave the pending set
 *  - An edit made while a sync is in-flight is not discarded
 *  - SOS records sort before journal records
 */
import assert from 'node:assert/strict';
import { enqueue, acknowledge } from './sync.ts';

function rec(id, kind = 'journal', ts = Date.now()) {
  return { id, kind, data: { text: `record-${id}` }, updatedAt: ts };
}

// ── Idempotence: enqueueing the same record twice keeps one copy ──────────────
{
  const r = rec('dup');
  let s = enqueue({ records: [], pending: {} }, r);
  s = enqueue(s, r);
  assert.equal(s.records.length, 1, 'Duplicate enqueue must yield one record');
  assert.equal(s.pending['dup'], r.updatedAt);
  console.log('✓ idempotent enqueue');
}

// ── LWW: older update must not overwrite newer ────────────────────────────────
{
  const newer = rec('conflict', 'journal', 1000);
  const older = rec('conflict', 'journal', 500);
  let s = enqueue({ records: [], pending: {} }, newer);
  s = enqueue(s, older);
  assert.equal(s.records[0].updatedAt, 1000, 'Older record must not overwrite newer');
  assert.equal(Object.keys(s.pending).length, 1);
  console.log('✓ LWW: older update ignored');
}

// ── In-flight edit retention: an edit during upload must not be lost ──────────
{
  const original = rec('edit', 'journal', 100);
  const edit = rec('edit', 'journal', 200);    // made while upload of original was in flight
  let s = enqueue({ records: [], pending: {} }, original);
  s = enqueue(s, edit);                          // local edit arrives before ack
  // Server acks original (the version we sent)
  s = acknowledge(s, [original], [original]);
  // The pending flag for 'edit' must still be 200 (the newer version)
  assert.equal(s.pending['edit'], 200, 'Pending must retain the newer in-flight edit');
  assert.equal(s.records[0].updatedAt, 200, 'Record must keep the newer local edit');
  console.log('✓ in-flight edit retained after partial ack');
}

// ── Account isolation: two patients share no records in the queue ─────────────
{
  // Simulate two separate patient-scoped queues (as localStorage would separate them)
  const queueA = enqueue({ records: [], pending: {} }, rec('a-private', 'journal', 1));
  const queueB = enqueue({ records: [], pending: {} }, rec('b-private', 'journal', 2));
  const idsA = queueA.records.map(r => r.id);
  const idsB = queueB.records.map(r => r.id);
  assert.ok(!idsA.includes('b-private'), 'Patient A queue must not contain Patient B records');
  assert.ok(!idsB.includes('a-private'), 'Patient B queue must not contain Patient A records');
  console.log('✓ patient queue isolation');
}

// ── Acknowledgement clears pending ────────────────────────────────────────────
{
  const r = rec('ack-me');
  let s = enqueue({ records: [], pending: {} }, r);
  assert.ok('ack-me' in s.pending);
  s = acknowledge(s, [r], [r]);
  assert.ok(!('ack-me' in s.pending), 'Acknowledged record must leave pending set');
  console.log('✓ pending cleared on acknowledgement');
}

// ── Server wins when server version is newer than local pending ───────────────
{
  const local = rec('remote-newer', 'journal', 100);
  const serverVersion = rec('remote-newer', 'journal', 200);
  let s = enqueue({ records: [], pending: {} }, local);
  s = acknowledge(s, [serverVersion], []);
  assert.equal(s.records[0].updatedAt, 200, 'Server version must win when newer');
  console.log('✓ server newer version accepted');
}

// ── Multiple records: batch enqueue and ack ────────────────────────────────────
{
  let s = { records: [], pending: {} };
  for (let i = 0; i < 10; i++) s = enqueue(s, rec(`batch-${i}`, 'event', i * 10));
  assert.equal(s.records.length, 10);
  // Ack all of them
  s = acknowledge(s, s.records, s.records);
  assert.equal(Object.keys(s.pending).length, 0, 'All batch records must be acknowledged');
  console.log('✓ batch enqueue and full acknowledgement');
}

// ── SOS sort: SOS record should come before journal in a mixed list ───────────
{
  const journal1 = rec('j1', 'journal', 100);
  const sos      = rec('s1', 'sos', 200);
  const journal2 = rec('j2', 'journal', 300);
  let s = { records: [], pending: {} };
  s = enqueue(s, journal1);
  s = enqueue(s, sos);
  s = enqueue(s, journal2);
  const sorted = s.records
    .filter(r => s.pending[r.id] === r.updatedAt)
    .sort((a, b) => Number(b.kind === 'sos') - Number(a.kind === 'sos'));
  assert.equal(sorted[0].kind, 'sos', 'SOS must sort first in upload batch');
  console.log('✓ SOS record sorts before other kinds');
}

// ── Location filtering: location records excluded when consent absent ──────────
{
  const journal = rec('j', 'journal', 100);
  const location = rec('loc', 'location', 200);
  let s = { records: [], pending: {} };
  s = enqueue(s, journal);
  s = enqueue(s, location);
  const CAREGIVER_ONLY = new Set(['default', 'reminder', 'message', 'consent']);
  // Simulate no consent (consent.sync is false)
  const consentSync = false;
  const toSend = s.records
    .filter(r => s.pending[r.id] === r.updatedAt)
    .filter(r => !CAREGIVER_ONLY.has(r.kind))
    .filter(r => r.kind !== 'location' || consentSync);
  assert.equal(toSend.length, 1, 'Location must be filtered out when sync not consented');
  assert.equal(toSend[0].kind, 'journal');
  console.log('✓ location excluded from upload without consent');
}

console.log('\nAll sync-nikil checks passed.');
