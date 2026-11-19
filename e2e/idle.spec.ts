import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedRunnableFlow } from './runnable-flow';

// Sign-out after inactivity (SPEC 12.2). The stand-in sign-in service (D67) runs the same logic as the real one, and
// the development hook `dfw.idleMs` shortens the limit to one minute (the dialog shows in the last 30 seconds).
const USERS = JSON.stringify([{ email: 'harold@example.com', password: 'correct horse battery' }]);
const START = new Date('2026-11-17T09:00:00+07:00');
const LIMIT_MS = 60_000;

const prepare = async (page: Page) => {
  await page.addInitScript(
    ([users, limit]) => {
      localStorage.setItem('dfw.auth', users!);
      localStorage.setItem('dfw.idleMs', limit!);
    },
    [USERS, String(LIMIT_MS)] as const,
  );
  await page.clock.install({ time: START });
};
const signIn = async (page: Page, path = '/flows') => {
  await page.goto(path);
  await page.getByLabel('Email').fill('harold@example.com');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
};
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Still there?' });

test('a user who is active keeps the session', async ({ page }) => {
  await prepare(page);
  await signIn(page);
  for (let i = 0; i < 6; i++) {
    await page.clock.fastForward(20_000);
    await page.mouse.move(100 + i * 10, 200);
  }
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('a user who is not active sees the dialog with a countdown, then the quiet note on the sign-in screen', async ({ page }) => {
  await prepare(page);
  await signIn(page);
  await page.clock.fastForward(LIMIT_MS - 29_000);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('You will be signed out in 00:29 because there was no activity.');
  await expect(dialog(page).getByRole('button', { name: 'Stay signed in' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Sign out now' })).toBeVisible();
  await expect(dialog(page)).not.toContainText('Unsaved changes');
  // The safe button has the focus: Enter keeps the person signed in, it does not sign them out.
  await expect(dialog(page).getByRole('button', { name: 'Stay signed in' })).toBeFocused();
  await page.clock.fastForward(5_000);
  await expect(dialog(page)).toContainText('00:24');
  await page.clock.fastForward(30_000);
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(page.getByText('You were signed out after 8 hours without activity.')).toBeVisible();
  // A quiet note, not an error.
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Stay signed in resets the time', async ({ page }) => {
  await prepare(page);
  await signIn(page);
  await page.clock.fastForward(LIMIT_MS - 20_000);
  await dialog(page).getByRole('button', { name: 'Stay signed in' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.clock.fastForward(25_000); // more than the 20 s that were left, less than the new limit minus the warning
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('Sign out now signs out without the inactivity note', async ({ page }) => {
  await prepare(page);
  await signIn(page);
  await page.clock.fastForward(LIMIT_MS - 20_000);
  await dialog(page).getByRole('button', { name: 'Sign out now' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(page.getByText(/without activity/)).toHaveCount(0);
});

test('the dialog says that unsaved changes will be lost when the builder has some', async ({ page }) => {
  await prepare(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Idle test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await page.getByRole('button', { name: 'Add step Filter' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.clock.fastForward(LIMIT_MS - 20_000);
  await expect(dialog(page)).toContainText('Unsaved changes will be lost.');
});

test('a session that is opened after the limit has passed is signed out at once with the same note', async ({ page }) => {
  await prepare(page);
  await signIn(page);
  await page.evaluate((t) => localStorage.setItem('dfw.lastActivity', String(t)), START.getTime() - 3 * 3_600_000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(page.getByText('You were signed out after 8 hours without activity.')).toBeVisible();
});

test('two tabs share the activity: movement in one keeps the other signed in', async ({ browser }) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  const b = await context.newPage();
  for (const p of [a, b]) await prepare(p);
  await signIn(a);
  await b.goto('/flows');
  await expect(b.getByRole('navigation', { name: 'Main' })).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await a.clock.fastForward(20_000);
    await b.clock.fastForward(20_000);
    await b.mouse.move(150 + i * 10, 220); // only tab B is used
  }
  await expect(dialog(a)).toHaveCount(0);
  await expect(a.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await context.close();
});

test('a run in progress holds the session', async ({ page }) => {
  await prepare(page);
  await seedRunnableFlow(page);
  await signIn(page, '/flows/flow-run/run');
  await page.locator('input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('name,kind\nAnn,WEEK\nBob,MONTH\nCy,YEAR\n') });
  await page.getByRole('button', { name: /^Run flow$/ }).click();
  // Past the limit while the run is going on: the hold keeps the session.
  await page.clock.fastForward(LIMIT_MS + 30_000);
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Download/ }).first()).toBeVisible({ timeout: 30_000 });
  // The end of the run is activity at that moment: the session does not end the instant the run is done.
  await page.clock.fastForward(5_000);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});
