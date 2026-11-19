import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

const hours = (page: Page) => page.getByRole('textbox', { name: 'Hours without activity' });
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const openSettings = async (page: Page) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Settings' }).click();
};

test('Settings is the third tab, after Users and Texts, with one card and the field filled with 8', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('tab')).toHaveText(['Users', 'Texts', 'Settings']);
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Sign-out after inactivity' })).toBeVisible();
  await expect(hours(page)).toHaveValue('8');
  await expect(save(page)).toBeDisabled(); // nothing changed
  // The explanation is behind the info button.
  await page.getByRole('button', { name: 'About Hours without activity' }).click();
  await expect(page.getByText(/The check runs in the browser/)).toBeVisible();
});

test('the admin changes the value; Save is enabled only for a changed valid value; a toast says it is saved; a reload keeps it', async ({ page }) => {
  await openSettings(page);
  await hours(page).fill('12');
  await expect(save(page)).toBeEnabled();
  await hours(page).fill('8');
  await expect(save(page)).toBeDisabled();
  await hours(page).fill('12');
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(hours(page)).toHaveValue('12');
});

test('0, 73, 1.5 and an empty field show what failed and what to do under the field, and Save stays off', async ({ page }) => {
  await openSettings(page);
  const cases: [string, RegExp][] = [
    ['0', /from 1 to 72/],
    ['73', /from 1 to 72/],
    ['1.5', /whole number/],
    ['', /is empty/],
    ['abc', /whole number/],
  ];
  for (const [value, message] of cases) {
    await hours(page).fill(value);
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    expect(await hours(page).getAttribute('aria-invalid')).toBe('true');
    await expect(save(page)).toBeDisabled();
  }
  await hours(page).fill('5');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a user who is not the admin does not get the Settings tab or the database values', async ({ page }) => {
  const snapshot = { ...seedSnapshot(), currentUserId: 'user-lan' };
  await page.addInitScript((s) => localStorage.setItem('dfw.seed', s), JSON.stringify(snapshot));
  await page.goto('/admin');
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('the new value reaches the open session within one poll: the limit becomes 1 hour', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dfw.auth', JSON.stringify([{ email: 'harold@example.com', password: 'correct horse battery' }]));
    localStorage.setItem('dfw.idlePollMs', '1000'); // the 15-minute poll, shortened
  });
  await page.clock.install({ time: new Date('2026-11-17T09:00:00+07:00') });
  await page.goto('/admin');
  await page.getByLabel('Email').fill('harold@example.com');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await hours(page).fill('1');
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();
  await page.clock.fastForward(2_000); // one poll
  await page.clock.fastForward(3_600_000 - 90_000); // 58.5 minutes: 90 s of the hour are left
  await expect(page.getByRole('dialog', { name: 'Still there?' })).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.getByText('You were signed out after 1 hour without activity.')).toBeVisible();
});
