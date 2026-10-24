import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VALID_RELATIONS, relationText, canEditPeople, normalizeRelation } from './people.ts';

// 1. VALID_RELATIONS check
const expectedRelations = [
  'Son', 'Daughter', 'Wife', 'Husband', 'Grandchild',
  'Friend', 'Doctor', 'Neighbour', 'Caregiver', 'Other',
];
assert.deepEqual(VALID_RELATIONS, expectedRelations, 'VALID_RELATIONS must match backend approved list');

// 2. relationText helper checks
assert.equal(relationText('Son'), 'Your son');
assert.equal(relationText('your daughter'), 'Your daughter');
assert.equal(relationText('Your Wife'), 'Your Wife');
assert.equal(relationText(''), '');

// 3. normalizeRelation checks (normalise old values: "Your son", "son", "Grandson")
assert.equal(normalizeRelation('Your son'), 'Son');
assert.equal(normalizeRelation('son'), 'Son');
assert.equal(normalizeRelation('Grandson'), 'Grandchild');
assert.equal(normalizeRelation('granddaughter'), 'Grandchild');
assert.equal(normalizeRelation('your grandson'), 'Grandchild');
assert.equal(normalizeRelation('Friend'), 'Friend');
assert.equal(normalizeRelation('Cousin'), 'Cousin');
assert.equal(normalizeRelation(''), '');

// 4. Real permission checks (imported canEditPeople helper used by page)
// Self accounts: allowed
assert.equal(canEditPeople({ role: 'self' }, false), true, 'Self accounts can edit people');
assert.equal(canEditPeople({ role: 'caregiver' }, true), true, 'Caregivers can edit people');

// Paired devices and patient logins must NEVER get edit controls under any circumstances
assert.equal(canEditPeople({ role: 'patient_device' }, false), false, 'Paired patient devices cannot edit people');
assert.equal(canEditPeople({ role: 'patient_device' }, true), false, 'Paired patient devices must never get edit controls even with isCaregiver');
assert.equal(canEditPeople({ role: 'patient_device', kind: 'patient_device' }, false), false);
assert.equal(canEditPeople({ role: 'patient' }, false), false, 'Patient logins cannot edit people');
assert.equal(canEditPeople({ role: 'patient' }, true), false, 'Patient logins must never get edit controls even with isCaregiver');
assert.equal(canEditPeople({ role: 'patient', kind: 'patient' }, false), false);
assert.equal(canEditPeople(null, false), false, 'Anonymous sessions cannot edit people');

// 5. Locales coverage for all people-editing phrases
const hi = JSON.parse(await readFile(new URL('./interaction/locales/hi.json', import.meta.url), 'utf8'));
const as = JSON.parse(await readFile(new URL('./interaction/locales/as.json', import.meta.url), 'utf8'));

const requiredPhrases = [
  'Edit people',
  'Done editing',
  'Add a person',
  'Edit {name}',
  'Edit',
  'Delete',
  'Remove {name}? Their photo will be deleted too.',
  'Find them in my videos',
  'Scanning videos…',
  'Starting scan…',
  'Face scan completed successfully.',
  'Face scan failed. You can try again.',
  'Face scan stopped.',
  'Face scan timed out. You can try again.',
  'Rescan limit reached. Please try again later.',
  'A scan is already in progress.',
  'Could not start face scan.',
  'Scan completed.',
  'No videos to scan yet',
  'Save changes',
  'Add person',
  'Cancel',
  'Saving…',
  'Photo',
  'Relation',
  'Phone',
  'Name',
  'Full name',
  'Preview',
  'Photo of {name}',
  'optional',
  'Delete {name}?',
  'Delete person',
  'Deleting…',
  'Discard changes?',
  'Discard',
  'Keep editing',
  'Use a clear photo of the face. It is also used to recognise this person in videos.',
  'You have unsaved changes. Discard them?',
  'Choose relation…',
  'Son',
  'Daughter',
  'Wife',
  'Husband',
  'Grandchild',
  'Friend',
  'Doctor',
  'Neighbour',
  'Caregiver',
  'Other',
];

for (const phrase of requiredPhrases) {
  assert.ok(hi[phrase], `Missing Hindi translation for: "${phrase}"`);
  assert.ok(as[phrase], `Missing Assamese translation for: "${phrase}"`);
}

console.log(`people-self checks passed: validated ${requiredPhrases.length} phrases, real permission helpers, and relation normalization.`);

