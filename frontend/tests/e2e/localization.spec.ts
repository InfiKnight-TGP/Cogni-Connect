import { test, expect } from '@playwright/test';
import { installSpeechMock } from './speech-mock';
import { readFileSync } from 'node:fs';

const localeUi = Object.fromEntries(['en', 'hi', 'as'].map(code => [
  code,
  JSON.parse(readFileSync(`lib/interaction/locales/${code}.json`, 'utf8')).ui as Record<string, string>,
]));

for (const locale of [
  { code: 'hi', heading: 'आप कौन-सा खेल खेलना चाहेंगे?', nav: 'खेलें', start: 'खेल शुरू करें', lang: 'hi' },
  { code: 'as', heading: 'আপুনি কি খেলিব বিচাৰে?', nav: 'খেলক', start: 'খেল আৰম্ভ কৰক', lang: 'as' },
]) {
  test(`${locale.code} localization reaches patient navigation, game shell and voice controls`, async ({ page }) => {
    await installSpeechMock(page);
    await page.addInitScript((code) => {
      localStorage.setItem('cogni:preferences:local-patient', JSON.stringify({
        mode: 'read', language: code, textSize: 'large', updatedAt: 1, override: true,
      }));
    }, locale.code);
    await page.goto('/play');
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await expect(page.getByRole('heading', { name: locale.heading })).toBeVisible();
    await expect(page.getByRole('link', { name: locale.nav }).first()).toBeVisible();

    const card = page.getByRole('button').filter({ hasText: locale.code === 'hi' ? 'मिलते-जुलते चित्र' : 'মিলা ছবি' }).first();
    await card.click();
    const shell = page.locator('[data-game-id="memory-cards"]');
    await expect(shell.getByRole('heading', { name: locale.code === 'hi' ? 'मिलते-जुलते चित्र' : 'মিলা ছবি' })).toBeVisible();
    await shell.getByRole('button', { name: locale.start, exact: true }).click();
    await expect(shell.getByRole('button', { name: /উত্তৰ কওক|जवाब बोलें/ })).toBeVisible();
  });

  test(`${locale.code} people page translates call and caregiver edit actions`, async ({ page }) => {
    await installSpeechMock(page);
    await page.addInitScript((code) => {
      localStorage.setItem('cogni:preferences:local-patient', JSON.stringify({
        mode: 'read', language: code, textSize: 'large', updatedAt: 1, override: true,
      }));
    }, locale.code);
    await page.route('**/people', route => route.request().resourceType() === 'document'
      ? route.continue()
      : route.fulfill({ json: [
        { id: 'person-1', name: 'Meera', relation: 'Daughter', phone: '1234567890', photo: 'meera.jpg' },
      ] }));
    await page.goto('/people');
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await expect(page.getByRole('link', { name: new RegExp(localeUi[locale.code].Call) })).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem('caregiver', '1'));
    await page.reload();
    await expect(page.getByRole('button', { name: localeUi[locale.code].Edit, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: localeUi[locale.code].Delete, exact: true })).toBeVisible();
  });

  test(`${locale.code} location guidance follows the saved language and remains paused without consent`, async ({ page }) => {
    await installSpeechMock(page);
    await page.addInitScript((code) => {
      if (!localStorage.getItem('cogni:preferences:local-patient')) {
        localStorage.setItem('cogni:preferences:local-patient', JSON.stringify({
          mode: 'read', language: 'en', textSize: 'large', updatedAt: 1, override: true,
        }));
      }
      localStorage.setItem('cogni:support:local-patient', JSON.stringify({
        records: [{ id: 'location-consent', kind: 'consent', updatedAt: 1, data: { tracking: false, sync: false } }], pending: {},
      }));
      if (localStorage.getItem('test:locationStarts') === null) localStorage.setItem('test:locationStarts', '0');
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
        watchPosition: (_success: unknown, error: (reason: { code: number; PERMISSION_DENIED: number }) => void) => {
          const key = 'test:locationStarts';
          localStorage.setItem(key, String(Number(localStorage.getItem(key) || 0) + 1));
          setTimeout(() => error({ code: 1, PERMISSION_DENIED: 1 }), 0);
          return 1;
        },
        clearWatch: () => {},
      } });
    }, locale.code);
    await page.route('**/platform-api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const result = path.endsWith('/auth/me')
        ? { username: 'patient', role: 'patient', patient: 'local-patient' }
        : { records: [] };
      return route.fulfill({ json: result });
    });
    await page.goto('/support');
    await expect(page.getByRole('heading', { name: 'My support space' })).toBeVisible();
    await page.getByRole('button', { name: 'Read and tap', exact: true }).click();
    await page.getByRole('combobox').first().selectOption(locale.code);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await page.getByRole('button', { name: localeUi[locale.code].Places, exact: true }).click();
    await expect(page.getByRole('heading', { name: localeUi[locale.code]['My places'] })).toBeVisible();
    await expect(page.getByText(localeUi[locale.code]['Location is optional. It only runs after your caregiver turns it on and you allow it. It works while this screen is open. It stays on this device unless sharing is enabled. Pause it at any time.'], { exact: true })).toBeVisible();
    await expect(page.getByText(localeUi[locale.code]['A caregiver must confirm consent before location is used.'], { exact: true })).toBeVisible();
    await expect(page.getByText(localeUi[locale.code]['Location collection is paused.'], { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Number(localStorage.getItem('test:locationStarts')))).toBe(0);
    await page.evaluate(() => {
      const key = 'cogni:support:local-patient';
      const support = JSON.parse(localStorage.getItem(key) || '{"records":[],"pending":{}}');
      support.records = support.records.map((row: { id: string; data: Record<string, unknown> }) => row.id === 'location-consent' ? { ...row, data: { ...row.data, tracking: true } } : row);
      localStorage.setItem(key, JSON.stringify(support));
      window.dispatchEvent(new Event('cogni:support'));
    });
    await page.getByRole('button', { name: localeUi[locale.code]['Start remembering places'], exact: true }).click();
    await expect(page.getByText(localeUi[locale.code]['Location permission was denied. Location is paused. You can keep using the app.'], { exact: true })).toBeVisible();
    await expect(page.getByText(localeUi[locale.code]['Location collection is paused.'], { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Number(localStorage.getItem('test:locationStarts')))).toBe(1);
    await page.goto('/play');
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await page.goto('/support');
    await page.getByRole('button', { name: localeUi[locale.code].Places, exact: true }).click();
    await expect(page.getByText(localeUi[locale.code]['Location collection is paused.'], { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Number(localStorage.getItem('test:locationStarts')))).toBe(1);
  });
}
