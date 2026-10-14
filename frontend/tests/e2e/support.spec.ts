import { test as base, expect, type Page } from "@playwright/test";
import { installSpeechMock } from "./speech-mock";

type Demo = { caregiver: string; patient: string; password: string; patientId: string };
const test = base.extend<{ demo: Demo }>({
  demo: async ({ request }, use) => {
    const response = await request.post('http://127.0.0.1:5031/test/seed');
    expect(response.ok()).toBe(true);
    await use(await response.json());
  },
});
test.beforeEach(async ({ page }) => {
  await installSpeechMock(page);
  // Exercise real Flask routes against a temporary database, never the user's DB.
  await page.route('**/platform-api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/platform-api', '/platform');
    const response = await route.fetch({ url: `http://127.0.0.1:5031${path}` });
    await route.fulfill({ response });
  });
  await page.goto('/support');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
});

test.afterEach(async ({ page }) => {
  // Let in-flight background sync routes finish before Playwright disposes them.
  await page.unrouteAll({ behavior: 'wait' });
});

async function login(page: Page, username: string, password: string) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Yes', exact: true }).isVisible()) await page.getByRole('button', { name: 'Yes', exact: true }).click();
}
async function sync(page: Page) {
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(page.getByText('Sync complete', { exact: true })).toBeVisible();
}
async function records(page: Page) {
  return page.evaluate(async () => (await (await fetch('/platform-api/records')).json()).records);
}

test('seeded decline is explained, roles are enforced and reminder voice completion syncs', async ({ page, demo }) => {
  await login(page, demo.caregiver, demo.password);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText('SIMULATED DEMO DATA', { exact: true })).toBeVisible();
  await expect(page.getByText('Scores have fallen across several sessions. Check in with the patient and review the context.')).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Memory scores: 100, 90, 80, 70, 60, 50, 40, 30', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cognitive Trend Index: \d+ \/ 100/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await page.getByLabel('Reminder', { exact: true }).fill('Drink a glass of water');
  await page.getByLabel('Time', { exact: true }).fill('10:00');
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  const scopedUpload = page.waitForRequest(request => request.url().endsWith('/platform-api/records') && request.method() === 'POST' && request.headers()['x-cogni-patient'] === demo.patientId);
  await sync(page);
  await scopedUpload;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, demo.patient, demo.password);
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
  const forbidden = await page.evaluate(async () => (await fetch('/platform-api/records', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cogni-Request': '1' }, body: JSON.stringify({ records: [{ id: 'forbidden-default', kind: 'default', updatedAt: Date.now(), data: { mode: 'voice' } }] }) })).status);
  expect(forbidden).toBe(403);
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  const reminder = page.locator('article').filter({ hasText: 'Drink a glass of water' });
  await page.evaluate(() => { (window as unknown as { __answers: unknown[] }).__answers = [{ text: 'done' }]; });
  await reminder.getByRole('button', { name: 'Speak an answer', exact: true }).click();
  await expect(reminder.getByRole('button', { name: /Done/ })).toBeDisabled();
  await sync(page);
  const adherence = (await records(page)).filter((row: { kind: string }) => row.kind === 'adherence');
  expect(adherence).toHaveLength(1);
  expect(adherence[0].data.method).toBe('voice');
});

test('patient journal sync and SOS reach the caregiver inbox', async ({ page, demo }) => {
  await login(page, demo.patient, demo.password);
  await page.getByLabel('Your memory or transcript').fill('SIMULATED: I enjoyed tea with my sister.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await sync(page);
  await page.getByRole('button', { name: 'SOS · Help', exact: true }).click();
  await expect(page.getByText('Your help request reached the caregiver account. Please call if you need immediate help.', { exact: true })).toBeVisible({ timeout: 15000 });
  expect((await records(page)).filter((row: { kind: string }) => row.kind === 'sos')).toHaveLength(1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, demo.caregiver, demo.password);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.getByText('SIMULATED: I enjoyed tea with my sister.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText(/Help requested/)).toBeVisible();
});

test('personal crossword progress survives navigation and is patient scoped', async ({ page, demo, request }) => {
  await login(page, demo.patient, demo.password);
  await page.getByRole('button', { name: 'Crossword', exact: true }).click();
  await page.getByRole('textbox', { name: /Add familiar names/ }).fill('TEA: Your favourite warm drink');
  await page.getByRole('button', { name: 'Make my crossword', exact: true }).click();
  await page.getByRole('textbox', { name: 'Crossword answer', exact: true }).fill('tea');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('Well done!', { exact: true })).toBeVisible();
  await sync(page);
  await page.reload();
  await page.getByRole('button', { name: 'Crossword', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
  const puzzle = (await records(page)).find((row: { id: string }) => row.id === 'crossword-current');
  expect(puzzle.data.solved).toEqual(['TEA']);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cogni:offline-account'))).toBeNull();
  const other: Demo = await (await request.post('http://127.0.0.1:5031/test/seed')).json();
  await login(page, other.patient, other.password);
  await page.getByRole('button', { name: 'Crossword', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Crossword answer', exact: true })).toHaveCount(0);
});
