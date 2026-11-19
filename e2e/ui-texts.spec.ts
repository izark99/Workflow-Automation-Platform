import { expect, test } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

test('edited texts are applied over the catalog when the app starts', async ({ page }) => {
  const snapshot = { ...seedSnapshot(), uiTexts: [{ locale: 'en', key: 'nav.flows', value: 'Pipelines', updatedAt: '2026-11-18T08:00:00.000Z' }] };
  await page.addInitScript((s) => localStorage.setItem('dfw.seed', s), JSON.stringify(snapshot));
  await page.goto('/flows');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pipelines' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Flows', exact: true })).toHaveCount(0);
});

test('a text whose placeholders changed is ignored', async ({ page }) => {
  const snapshot = { ...seedSnapshot(), uiTexts: [{ locale: 'en', key: 'common.infoTip.about', value: 'About', updatedAt: '2026-11-18T08:00:00.000Z' }] };
  await page.addInitScript((s) => localStorage.setItem('dfw.seed', s), JSON.stringify(snapshot));
  await page.goto('/flows');
  await expect(page.getByRole('button', { name: 'About Flows' })).toBeVisible();
});
