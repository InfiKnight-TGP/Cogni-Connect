import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const mock = window as unknown as { __speechStarts: number; __answers: { text?: string; confidence?: number; error?: string }[]; SpeechRecognition: unknown };
    mock.__speechStarts = 0; mock.__answers = [];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(public text: string) {} }, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [{ lang: "en-IN", name: "Test voice" }], speak: (utterance: { onend?: () => void }) => setTimeout(() => utterance.onend?.(), 5), cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {} }, configurable: true });
    mock.SpeechRecognition = class {
      onresult?: (event: unknown) => void; onerror?: (event: unknown) => void; onend?: () => void; onspeechstart?: () => void;
      start() { mock.__speechStarts++; const answer = mock.__answers.shift() || { error: "no-speech" }; setTimeout(() => { if (answer.error) this.onerror?.({ error: answer.error }); else { this.onspeechstart?.(); this.onresult?.({ results: [[{ transcript: answer.text, confidence: answer.confidence ?? .95 }]] }); } }, 10); }
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
