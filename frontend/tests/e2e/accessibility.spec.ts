import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const mock = window as unknown as { __speechStarts: number; __answers: { text?: string; confidence?: number; error?: string; delay?: number }[]; SpeechRecognition: unknown };
    mock.__speechStarts = 0; mock.__answers = [];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(public text: string) {} }, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [{ lang: "en-IN", name: "Test voice" }], speak: (utterance: { onend?: () => void }) => setTimeout(() => utterance.onend?.(), 5), cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {} }, configurable: true });
    mock.SpeechRecognition = class {
      onresult?: (event: unknown) => void; onerror?: (event: unknown) => void; onend?: () => void; onspeechstart?: () => void;
      start() { mock.__speechStarts++; const answer = mock.__answers.shift() || { error: "no-speech" }; setTimeout(() => { if (answer.error) this.onerror?.({ error: answer.error }); else { this.onspeechstart?.(); this.onresult?.({ results: [[{ transcript: answer.text, confidence: answer.confidence ?? .95 }]] }); } }, answer.delay ?? 10); }
      abort() {}
    };
  });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
});

test('read mode does not start recognition and switching modes preserves a round', async ({ page }) => {
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  const game = page.locator('[data-game-id="odd-one-out"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(game.getByRole('heading', { name: 'Which picture does not belong with the others?' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __speechStarts: number }).__speechStarts)).toBe(0);
  await page.getByRole('button', { name: 'Read and tap', exact: true }).click();
  await page.locator('button[aria-pressed]').filter({ hasText: 'Mixed' }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(game.getByRole('button', { name: /Bus/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mixed', exact: true })).toBeVisible();
});

test('uncertain speech asks for confirmation and denied permission keeps tap controls', async ({ page }) => {
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  const game = page.locator('[data-game-id="odd-one-out"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { __answers: unknown[] }).__answers = [{ text: 'bus', confidence: .2 }]; });
  await game.getByRole('button', { name: 'Speak an answer', exact: true }).click();
  await expect(game.getByText('Did you mean “Bus”?')).toBeVisible();
  await game.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(game.getByText('Well done!')).toBeVisible();
  await game.getByRole('button', { name: 'Next', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { __answers: unknown[] }).__answers = [{ error: 'not-allowed' }]; });
  await game.getByRole('button', { name: 'Speak an answer', exact: true }).click();
  await expect(page.getByText('Voice is not available here. You can still read and tap every answer.').first()).toBeVisible();
  await expect(game.getByRole('button', { name: /Tea/ })).toBeEnabled();
});

test('silence retries once without scoring an answer', async ({ page }) => {
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  const game = page.locator('[data-game-id="odd-one-out"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  await game.getByRole('button', { name: 'Speak an answer', exact: true }).click();
  await expect(game.getByText('I did not catch that. Please try once more, or tap your answer.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __speechStarts: number }).__speechStarts)).toBe(2);
  await expect(game.getByRole('button', { name: /Bus/ })).toBeEnabled();
});

test('SOS can be cancelled before a request is stored', async ({ page }) => {
  await page.getByRole('button', { name: 'SOS · Help', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText(/Requesting help in/)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:support:local-patient') || '{"records":[]}').records.filter((row: { kind: string }) => row.kind === 'sos').length)).toBe(0);
});

test('patient game shell reloads offline after service worker preparation', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What would you like to play?' })).toBeVisible();
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  await page.locator('[data-game-id="odd-one-out"]').getByRole('button', { name: 'Start Game', exact: true }).click();
  await page.locator('[data-game-id="odd-one-out"]').getByRole('button', { name: /Bus/ }).click();
  await expect(page.getByText('Well done!')).toBeVisible();
});


test('voice mode reads and accepts an answer automatically with separate voice timing', async ({ page }) => {
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  const game = page.locator('[data-game-id="odd-one-out"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { __answers: unknown[] }).__answers = [{ text: 'bus', delay: 100 }]; });
  await page.getByRole('button', { name: 'Read and tap', exact: true }).click();
  await page.locator('button[aria-pressed]').filter({ hasText: 'Listen and speak' }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(game.getByText('Well done!')).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:events:local-patient') || '[]'));
  expect(events).toHaveLength(1);
  expect(events[0].method).toBe('voice');
  expect(events[0].responseMs).toBeGreaterThanOrEqual(0);
});

test('switching to read during listening cancels speech without losing the question', async ({ page }) => {
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  const game = page.locator('[data-game-id="odd-one-out"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { __answers: unknown[] }).__answers = [{ text: 'bus', delay: 30000 }]; });
  await page.getByRole('button', { name: 'Read and tap', exact: true }).click();
  await page.locator('button[aria-pressed]').filter({ hasText: 'Listen and speak' }).click();
  await expect(game.getByText('Listening…', { exact: true })).toBeVisible();
  await page.locator('button[aria-pressed]').filter({ hasText: 'Read and tap' }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(game.getByRole('button', { name: /Bus/ })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:events:local-patient') || '[]'))).toHaveLength(0);
  await game.getByRole('button', { name: /Bus/ }).click();
  await expect(game.getByText('Well done!')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:events:local-patient') || '[]')[0].method)).toBe('tap');
});

test('mixed mode accepts an uncertain answer only after spoken confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Read and tap', exact: true }).click();
  await page.locator('button[aria-pressed]').filter({ hasText: 'Mixed' }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.getByRole('button', { name: /Odd One Out Find/ }).click();
  const game = page.locator('[data-game-id="odd-one-out"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __speechStarts: number }).__speechStarts)).toBe(0);
  await page.evaluate(() => { (window as unknown as { __answers: unknown[] }).__answers = [{ text: 'bus', confidence: .2 }, { text: 'yes' }]; });
  await game.getByRole('button', { name: 'Speak an answer', exact: true }).click();
  await expect(game.getByText('Did you mean “Bus”?')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:events:local-patient') || '[]'))).toHaveLength(0);
  await game.getByRole('button', { name: 'Speak an answer: Yes / Try again', exact: true }).click();
  await expect(game.getByText('Well done!')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:events:local-patient') || '[]'))).toHaveLength(1);
});

test('Yesterday Quiz uses older distractors and accepts each yesterday memory', async ({ page }) => {
  await page.evaluate(() => {
    const day = (offset: number) => { const value = new Date(); value.setDate(value.getDate() + offset); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
    const memories = [
      ['tea', 'Tea with my family', -1], ['garden', 'Visited the garden', -1],
      ['old-tea', 'TEA with my family!', -2], ['music', 'Listened to music', -2],
    ];
    localStorage.setItem('cogni:support:local-patient', JSON.stringify({ records: memories.map(([id, summary, offset]) => ({ id, kind: 'journal', updatedAt: Date.now(), data: { day: day(Number(offset)), summary } })), pending: {} }));
  });
  await page.getByRole('button', { name: /Remember yesterday Recall/ }).click();
  const game = page.locator('[data-game-id="yesterday-quiz"]');
  await game.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(game.getByRole('button', { name: 'Visited the garden', exact: true })).toHaveCount(0);
  await expect(game.getByRole('button', { name: 'TEA with my family!', exact: true })).toHaveCount(0);
  await expect(game.getByRole('button', { name: 'Listened to music', exact: true })).toBeVisible();
  await game.getByRole('button', { name: 'Tea with my family', exact: true }).click();
  await expect(game.getByText('Well done!')).toBeVisible();
  await game.getByRole('button', { name: 'Next', exact: true }).click();
  await game.getByRole('button', { name: 'Visited the garden', exact: true }).click();
  await expect(game.getByText('Well done!')).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('cogni:events:local-patient') || '[]'));
  expect(events).toHaveLength(2);
  expect(events.every((event: { correct: boolean }) => event.correct)).toBe(true);
});
