import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { translate } from './locale.ts';
const en = JSON.parse(await readFile(new URL('./locales/en.json', import.meta.url), 'utf8'));
const hi = JSON.parse(await readFile(new URL('./locales/hi.json', import.meta.url), 'utf8'));
const as = JSON.parse(await readFile(new URL('./locales/as.json', import.meta.url), 'utf8'));
const required = [
  'Language','Text size','Theme','Large','Larger','Light','Dark','System','Stop','Start Game',
  'Ready to begin?','Click Start to launch {title}.','No timers apply in Easy mode.','Preview date',
  'Would you like to play again?','Play Again','Well done!','You scored {score} / 100',
  'Caregiver mode: this score was not saved.','Preview: this score was not saved.',
  "The answer is {answer}. Let's keep going.",'Finish','Next','Picture to name',
  'What would you like to play?','Choose a game','Choose another game','Matching pictures',
  'Find matching familiar pictures.','Listen to the beats','Count beats or use the visual alternative.',
  'Finish the pattern','Choose the next picture.','Name the picture','Name a familiar everyday object.',
  'Remember yesterday','Recall a real saved journal memory.','Story Builder',
  'Read a short everyday story, then recall missing details.','Relive Memories',
  'Recall details of the day’s videos in your own words.','Plan the Day',
  'Organize daily tasks in correct logical order.','Odd One Out',
  "Find the item that doesn't belong in the group.",'Mole Path',
  'Watch the circles fill, then tap the path in the same order.','Sorting Station',
  'Adapt to changing rules to sort items correctly.','Whack-a-Mole',
  'Tap target moles while suppressing impulses for distractors.','Attention Hunt',
  'Find every copy of the target while ignoring distractors.','Map Navigator',
  'Navigate routes and spatial directions accurately.','Face Recognition',
  'Recognise familiar people from the day’s video.','Name Recall',
  'Match a familiar face to the right name.','Easy','Medium','Hard','Where would you like to go?',
  'Home','Support','Videos','Progress & Reports','Support Accounts','Add Videos','Settings',
  'Back to Today','Search through your memories...','Search','No matching memories found',
  'Showing memories for: {query}','About this memory:','Getting your day ready…','Back','My Day',
  'Daily Recall','Part 2 of 2','Part 3','Loading questions...','No videos recorded on this date',
  'Question {number}','Question {number}.','Answer the question here.','Submit',
  'Accuracy of your response:','Watch Memory','Next Question','Pick a date','Select','Yesterday',
  'Back to my day','Part {part} of 2 · {activity}','Face Recognition',
  'Could not save this part. Please try again.','Part 1 of 2','Part 1',
  'On this day, who did you talk to? (Select all that apply)','Loading faces...',
  'No recognized people in videos from this date','Finish Game','Continue to Part 2',
  'Who did you talk to? Say a name to select or remove it, then say Check.','Check',
  'Check My Response','See Correct Answer',
  'Correct! You remembered everyone you talked to on this day.',
  'Your selection was incorrect. Try again, or choose to see the correct answer.',
  'Refresh','Select a day:','Choose an Activity:','Facial Recognition','Start',
  'Recording is unavailable. You can type your memory instead.',
  'Microphone permission was denied. You can type your memory instead.',
  'Recording saved on this device. Review the transcript before saving your entry.',
  'Recording could not be saved. Device storage may be full.',
  'Live transcription is unavailable or stopped. You can type or edit the transcript; the recording continues.',
  'Microphone permission was denied. You can leave a written message instead.',
  'Which picture does not belong with the others?','What is this?','What comes next?',
  'How many beats?','Play the sound','Show the beats','Choose a card number',
  'Repeat the path. Say the row and column.',
  'Remember the places. Say ready when you want to begin.',
  'Go to {place}. Choose a direction.','Find {target}. Say a row and column.',
  'Row {row} column {column}','Sort by {rule}. {item}','Choose the missing word.',
  'Say ready when you want to remember.','Ready for the next activity?','Picture {number}',
  'Ready','Up','Down','Left','Right','Go','Remove {item}',
  'Good morning!','Good afternoon!','Good evening!','{done} of {total} done today',
  'Sorry, we could not load your day.','Try again','My Progress','A look at your activities this week',
  'Loading your progress…','You played {count} {days} this week!','day','days','Played','Not played',
  'Mon','Tue','Wed','Thu','Fri','Sat','Sun','Stars Earned This Week','star','stars',
  'Earned from your completed daily activities.','Your Best This Week','Play an activity today to see your best!',
  'Your top performance across this week’s games.','My People','People','No people added yet.','No relation set','No phone',
  'Name *','Relation','Phone','Photo *','Photo (leave empty to keep the current one)','Call','Edit','Delete',
  'Use a clear photo of the face. It is also used to recognise this person in videos.',
  'Add a person','Add person','Save changes','Remove {name}? Their photo will be deleted too.','Edit {name}',
  'Could not remove this person. Please try again.','Could not reach the server. Please try again.',
  'Could not save. Please try again.','Choose…','Saving…','Cancel','Daily Routine','Add a step','Save routine',
  'Saved. Plan the Day will use these steps.','Could not load the routine. Is the backend running?',
  'Could not save: {error}','Step {number}','Move step {number} up','Move step {number} down','Remove step {number}',
  'Write 3 to 5 steps of the patient’s own day, in order (for example ‘Wake up’, ‘Have tea’, ‘Take tablets’). Plan the Day mixes them up and asks the patient to put them back in order. Each step can be up to 40 letters.',
  'Patient settings','Patient name','Default language','Save settings','Could not load settings.','Settings saved.',
  'Change caregiver PIN','Enter the current PIN and choose a new four-digit PIN. PINs are never displayed.',
  'Current PIN','New PIN','Change PIN','PIN changed.','Could not change PIN.','Could not save settings.',
  'Loading…','Your top performance across this week\'s games.','Go to Today’s Activities →',
  'Welcome! A fun week of brain games and memory activities is waiting for you.',
  'Well done! Every activity you do makes a wonderful difference.',
  'Great effort! Practicing through the week keeps your memory sharp and energized.',
  'Incredible dedication! You are keeping your mind active, bright, and strong.',
  'Sorry, we could not load the people right now.','Welcome to CogniConnect','Today’s Activities',
  'Look back at your days','Played {count} {days} this week','Your family and friends',
  'Today’s activities','All done for today! ⭐','Warm up','Keep going','Challenge','START','Treasure chest',
  'Caregiver portal','Progress & Reports','Summary','Trends','Activity Log','Doctor’s Report',
  'A short preview of recorded activity for sharing with a doctor.','Print / Save as PDF',
  'Offline. Your saved activities are available on this device.',
  'Storage is unavailable. Please ask your caregiver for help.',
  'Could not save. Device storage may be full. Please keep this screen open and ask for help.',
  'Saved on this device. It will sync when connected.',
  'Changes are saved on this device, but could not sync. Check your connection or sign in again.',
  'Accounts created. Sign in with either account.','Caregiver: set up two accounts',
  'These accounts protect this support space. A caregiver can help you sign in.',
  'Caregiver username','Username','Password','Patient username','Patient password',
  'Use separate passwords, each at least 12 characters.','Create accounts','Back to sign in',
  'Set up with a caregiver','1 change waiting to sync','{count} changes waiting to sync',
  'All changes synced','Sync complete','Sync now','Sign out',
  'Your caregiver can add reminders here.',
  'Location is optional. It only runs after your caregiver turns it on and you allow it. It works while this screen is open. It stays on this device unless sharing is enabled. Pause it at any time.',
  'Location permission was denied. Location is paused. You can keep using the app.',
  'Location could not be read. You can keep using the app.',
  'Location is unavailable on this device.','Location saved on this device only.',
  'Location is active while this screen is open.',
  'A caregiver must confirm consent before location is used.','Location collection is paused.',
  'Visited place {number}: {count} recorded visits','Favourite place name',
  'This is home (requires location sharing)','Save favourite',
  'Words from my life','Add familiar names, places or foods. One word and clue per line.',
  'Example: MEERA: Your daughter\nTEA: Your favourite warm drink\nRICE: A food you enjoy',
  'Use English letters or Romanized names for this grid.','Make my crossword',
  'The saved puzzle could not be opened. You can make a new one.',
  'Your puzzle could not be saved. Keep this screen open.',
  "Let's try again. You can use the letters as a clue.",
  'A familiar word beginning with {letter}','One of your favourite places','Starts at row {row}, column {column}',
  'Add words with 2–14 English letters. Your current setting may prefer shorter words.',
  '{count} letters','Crossword answer','Across','Down'
];
required.push(
  'Preferences','Activity experience','Sound effects','Animations','Encouraging messages','Accessibility',
  'Read questions aloud','Answer by speaking','Listen automatically','Speech speed','Slow','Normal','Largest',
  'Appearance','System default','Help','Need help? Ask your caregiver.','Patient preferences are available in patient mode.',
  'Animations are off because reduced motion is enabled on this device.',
  'Read aloud is not available on this device.','Microphone not available. You can still tap your answer.',
  "I didn\'t hear anything. Try again or tap your answer.",'Voice is not available here. You can still tap your answer.',
  'Reading aloud…','Confirm your answer','Did you mean {answer}?','Yes','Try again','Settings',
  'Word Association','Choose the item that goes with the picture.',
  'What goes with {item}?','Good! {target} goes with {cue}.',
  'Well done! {target} goes with {cue}.',"{target} goes with {cue}. Let's keep going.",
  'Cup of tea','Biscuit','Diya','Matchbox','Lock','Key','Umbrella','Rain',
  'Tawa pan','Roti','Needle','Thread','Train','Ticket','Cricket bat','Ball',
  'Shoes','Socks','Pen','Paper','Flower','Garland','Spoon','Plate',
  'Soap bar','Water drop','Book','Spectacles','Tree','Fruit','Postbox','Letter',
  'Bicycle','Bicycle bell','Candle','Flame','Steamed rice','Curry bowl',
  'Crescent moon','Shining star',
  'Think about what is dipped into hot tea.',
  'Think about what lights an oil lamp.',
  'Think about what opens a locked door.',
  'Think about the weather when you open an umbrella.',
  'Think about the hot bread puffed up on a tawa pan.',
  'Think about what is passed through the eye of a needle.',
  'Think about what you show the ticket collector.',
  'Think about what the bowler bowls to the batsman.',
  'Think about what you wear on your feet before your shoes.',
  'Think about what you write upon with a pen.',
  'Think about stringing fresh flowers together.',
  'Think about the dinner plate used with a spoon.',
  'Think about washing your hands with soap and water.',
  'Think about what helps you read small print clearly.',
  'Think about what grows sweet on the branches of a tree.',
  'Think about what you post inside the red letterbox.',
  'Think about what rings on a bicycle handlebar.',
  'Think about the warm glow burning on a candle.',
  'Think about the bowl of warm dal served with rice.',
  'Think about what twinkles beside the moon at night.',
  'Garden Taps',
  'Tap target moles while letting resting visitors stay undisturbed.',
  'Tap the mole',
  'Let it rest',
  'Let it bloom',
  'Tap the mole when it peeks out. Let the gentle visitors rest.',
  'First round is a gentle warm-up.',
  'Start when you are ready',
  'Roles Swap!',
  'Now tap the butterfly! Let the mole rest.',
  'Tap now',
  "I'm ready",
  'Game Paused',
  'Take your time. The garden will wait for you.',
  'Resume',
  'Practice warm-up',
  'Visitor {current} of {total}',
  'That is a friendly butterfly. Let it rest.',
  'That is a garden marigold. Let it bloom.',
  'Garden holes',
  'Mole hole',
  'Visitor hole',
  'Garden hole {number}',
  'You paid close attention to the garden visitors.',
  'Good!'
);
for (const phrase of required) {
  assert.equal(typeof hi.ui[phrase], 'string', `Hindi missing UI phrase: ${phrase}`);
  assert.equal(typeof as.ui[phrase], 'string', `Assamese missing UI phrase: ${phrase}`);
}
// Scan frontend/app/explore/page.tsx for visible UI phrases
const exploreFile = await readFile(new URL('../../app/explore/page.tsx', import.meta.url), 'utf8');
const explorePhrases = new Set([
  ...[...exploreFile.matchAll(/\bt\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]),
  'Tell me about my day', 'Where did I go?', 'Who did I meet?', 'What was I doing?',
  'Tell me about this video', 'Where was I?', 'Who was in it?', 'When was this?',
  'This memory', 'All my memories', 'About this memory', 'About this memory:',
  'Try: Tell me about this video', 'This week', 'Earlier', 'Clear history', 'Ask',
  'Today', 'Yesterday', 'All dates', 'All people', 'Filter by person', 'Filter by date',
  'Please sign in again.', 'Memories are not available right now.',
  'Please try again in a moment.', 'Please try again in a moment. The server is restarting.',
  'Question must be up to 300 characters.', 'Unable to ask question. Please try again.',
  'Question cannot be empty.', 'Look back at moments that matter.',
  'Transcript', 'In this video:', 'Add a video', 'Add your first video',
  'Your memories will appear here when they are ready.', 'Loading memories…',
  'Show more', 'Close', 'Previous memory', 'Next memory', 'Processing…',
  'Processing', 'Could not process this video', 'Clear', 'Try again',
  'Recent questions', 'Recent in this video', 'Ask about your memories',
  'Ask about this memory', 'Ask anything about your saved moments.',
  'Ask about your memories...', 'Ask about this memory...'
]);
for (const phrase of explorePhrases) {
  assert.equal(typeof hi.ui[phrase], 'string', `Hindi missing explore phrase: ${phrase}`);
  assert.equal(typeof as.ui[phrase], 'string', `Assamese missing explore phrase: ${phrase}`);
}
assert.equal(translate(en, 'Not translated yet'), 'Not translated yet', 'English fallback');
assert.equal(translate(hi, 'Start Game'), hi.ui['Start Game'], 'Hindi locale selection');
assert.equal(translate(as, 'Start Game'), as.ui['Start Game'], 'Assamese locale selection');
assert.equal(translate(hi, 'Showing memories for: Start Game'), `${hi.ui['Showing memories for: {query}'].replace('{query}', 'Start Game')}`, 'captured user text is not translated as a dictionary key');
assert.equal(translate(hi, 'Edit Start Game'), hi.ui['Edit {name}'].replace('{name}', 'Start Game'), 'captured names are preserved');
assert.equal(translate(hi, 'Edit Captured', { name: 'Chosen {value}.*' }), hi.ui['Edit {name}'].replace('{name}', 'Chosen {value}.*'), 'explicit values win and braces or regex characters are literal');
assert.equal(translate(hi, '{done} of {total} done today', { done: 'A.$&', total: '{done}?' }), 'आज {done}? में से A.$& पूरे हुए', 'multiple placeholders and special values are interpolated literally');
assert.equal(translate(hi, 'Showing memories for: {query}', { query: '' }), hi.ui['Showing memories for: {query}'].replace('{query}', ''), 'an explicit empty value remains empty');
assert.equal(translate(hi, 'You scored {score} / 100'), hi.ui['You scored {score} / 100'], 'missing interpolation values remain visible');
assert.equal(translate(hi, 'Visited place {number}: {count} recorded visits', { number: 2, count: 3 }).includes('2'), true, 'location visit placeholders are interpolated');
assert.equal(translate(as, 'Starts at row {row}, column {column}', { row: 4, column: 7 }).includes('7'), true, 'crossword coordinates are interpolated');
const ambiguous = { ...hi, ui: { 'Status {value}': 'general {value}', 'Status {value} is ready': 'specific {value}' } };
assert.equal(translate(ambiguous, 'Status item is ready'), 'specific item', 'the most specific matching template wins');
assert.match(translate(hi, 'Find Bus. Say a row and column.'), /Bus/);
assert.equal(translate(hi, 'Row 2 column 3'), 'पंक्ति 2, स्तंभ 3');
assert.equal(translate(as, 'Row 2 column 3'), 'শাৰী 2, স্তম্ভ 3');
for (const locale of [hi, as]) {
  assert.equal(translate(locale, 'You scored {score} / 100', { score: 72 }).includes('72'), true);
  assert.equal(translate(locale, 'Click Start to launch {title}.', { title: 'खेल' }).includes('{title}'), false);
  for (const [source, output] of Object.entries(locale.ui)) {
    const tokens = value => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(tokens(output), tokens(source), `${locale.code} placeholder mismatch for ${source}`);
  }
}
assert.equal(Object.hasOwn(en, 'ui'), false, 'English uses source phrase fallback by design');
console.log(`locale coverage checks passed: ${required.length} required phrases in Hindi and Assamese, English fallback, locale selection and interpolation`);
