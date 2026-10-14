import json
from pathlib import Path
class DuplicateKeyError(ValueError): pass
def unique(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise DuplicateKeyError(f'duplicate JSON key: {key}')
        result[key]=value
    return result
root=Path('lib/interaction/locales')
required = [
    'Good morning!', 'Good afternoon!', 'Good evening!', '{done} of {total} done today',
    'My Progress', 'A look at your activities this week', 'You played {count} {days} this week!',
    'Stars Earned This Week', 'Your Best This Week', 'My People', 'No people added yet.',
    'Daily Routine', 'Save routine', 'Step {number}', 'Move step {number} up',
    'Move step {number} down', 'Remove step {number}', 'Patient settings', 'Default language',
    'Change caregiver PIN', 'Enter the current PIN and choose a new four-digit PIN. PINs are never displayed.',
    'Today’s Activities', 'Your family and friends', 'Today’s activities', 'Treasure chest',
    'Caregiver portal', 'Progress & Reports', 'Summary', 'Trends', 'Activity Log',
    'Doctor’s Report', 'A short preview of recorded activity for sharing with a doctor.', 'Print / Save as PDF',
    'Write 3 to 5 steps of the patient’s own day, in order (for example ‘Wake up’, ‘Have tea’, ‘Take tablets’). Plan the Day mixes them up and asks the patient to put them back in order. Each step can be up to 40 letters.',
    'Offline. Your saved activities are available on this device.',
    'Storage is unavailable. Please ask your caregiver for help.',
    'Could not save. Device storage may be full. Please keep this screen open and ask for help.',
    'Saved on this device. It will sync when connected.',
    'Changes are saved on this device, but could not sync. Check your connection or sign in again.',
    'Accounts created. Sign in with either account.', 'Caregiver: set up two accounts',
    'These accounts protect this support space. A caregiver can help you sign in.',
    'Caregiver username', 'Username', 'Password', 'Patient username', 'Patient password',
    'Use separate passwords, each at least 12 characters.', 'Create accounts', 'Back to sign in',
    'Set up with a caregiver', '1 change waiting to sync', '{count} changes waiting to sync',
    'All changes synced', 'Sync complete', 'Sync now', 'Sign out',
    'Your caregiver can add reminders here.',
    'Location is optional. It only runs after your caregiver turns it on and you allow it. It works while this screen is open. It stays on this device unless sharing is enabled. Pause it at any time.',
    'Location permission was denied. Location is paused. You can keep using the app.',
    'Location could not be read. You can keep using the app.',
    'Location is unavailable on this device.', 'Location saved on this device only.',
    'Location is active while this screen is open.',
    'A caregiver must confirm consent before location is used.', 'Location collection is paused.',
    'Visited place {number}: {count} recorded visits', 'Favourite place name',
    'This is home (requires location sharing)', 'Save favourite',
    'Words from my life', 'Add familiar names, places or foods. One word and clue per line.',
    'Example: MEERA: Your daughter\nTEA: Your favourite warm drink\nRICE: A food you enjoy',
    'Use English letters or Romanized names for this grid.', 'Make my crossword',
    'The saved puzzle could not be opened. You can make a new one.',
    'Your puzzle could not be saved. Keep this screen open.',
    "Let's try again. You can use the letters as a clue.",
    'A familiar word beginning with {letter}', 'One of your favourite places', 'Starts at row {row}, column {column}',
    'Add words with 2–14 English letters. Your current setting may prefer shorter words.',
    '{count} letters', 'Crossword answer', 'Across', 'Down',
]
for code,speech in [('en','en-IN'),('hi','hi-IN'),('as','as-IN')]:
    path=root/f'{code}.json'
    with path.open(encoding='utf-8') as f: data=json.load(f, object_pairs_hook=unique)
    assert data['code']==code, f'{path}: locale code mismatch'
    assert data['speechLanguage']==speech, f'{path}: speech language mismatch'
    assert isinstance(data.get('ui', {}),dict)
    assert all(isinstance(k,str) and isinstance(v,str) and v for k,v in data.get('ui',{}).items())
    if code in ('hi','as'):
        for phrase in required:
            assert phrase in data['ui'], f'{code}: required phrase missing: {phrase}'
        for phrase, value in data['ui'].items():
            tokens = lambda text: sorted(__import__('re').findall(r'\{([a-zA-Z][a-zA-Z0-9_]*)\}', text))
            assert tokens(phrase) == tokens(value), f'{code}: placeholder mismatch: {phrase}'
print(f'locale JSON checks passed: UTF-8, syntax, unique keys, locale codes, {len(required)} required phrases and placeholder parity')
