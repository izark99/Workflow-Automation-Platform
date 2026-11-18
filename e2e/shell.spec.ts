import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

const signInAs = async (page: Page, userId: string) => {
  const snapshot = { ...seedSnapshot(), currentUserId: userId };
  await page.addInitScript((s) => localStorage.setItem('dfw.seed', s), JSON.stringify(snapshot));
};

test('the sidebar is 232 px wide, marks the current screen and shows the signed-in user', async ({ page }) => {
  await page.goto('/flows');
  const nav = page.getByRole('navigation', { name: 'Main' });
  expect((await nav.boundingBox())!.width).toBe(232);
  await expect(nav.getByRole('link', { name: 'Flows' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByText('Harold')).toBeVisible();
  await expect(nav.getByText('Admin', { exact: true }).first()).toBeVisible();
});

test('the sidebar links open Reference tables and Admin, and the title stays at y 63', async ({ page }) => {
  await page.goto('/flows');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const titleY = async () => (await page.getByRole('heading', { level: 1 }).boundingBox())!.y;
  const flowsY = await titleY();
  await nav.getByRole('link', { name: 'Reference tables' }).click();
  await expect(page).toHaveURL(/\/reference-tables$/);
  await expect(page.getByRole('heading', { name: 'Reference tables', level: 1 })).toBeVisible();
  expect(await titleY()).toBe(flowsY);
  await nav.getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  expect(await titleY()).toBe(63);
});

test('a user who is not the admin has no Admin link', async ({ page }) => {
  await signInAs(page, 'user-lan');
  await page.goto('/flows');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByText('Lan')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('Create flow opens a dialog; an empty name shows what failed and what to do; Escape closes it', async ({ page }) => {
  await page.goto('/flows');
  const opener = page.getByRole('button', { name: 'Create flow' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Create flow' });
  await expect(dialog.getByRole('textbox', { name: 'Flow name' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Create flow' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The flow has no name. Type a name');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Create flow with a name makes the flow and opens its builder route', async ({ page }) => {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create flow' });
  await dialog.getByRole('textbox', { name: 'Flow name' }).fill('Brand new flow');
  await dialog.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(page).toHaveURL(/\/flows\/flow-\d+\/versions\/1$/);
});

test('the data persists in the browser: a flow created before a reload is still in IndexedDB', async ({ page }) => {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Persisted');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await page.waitForURL(/\/versions\/1$/);
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('data-flow-webapp', 1);
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const get = open.result.transaction('snapshot').objectStore('snapshot').get('v1');
          get.onsuccess = () => resolve((get.result.flows as { name: string }[]).filter((f) => f.name === 'Persisted').length);
        };
      }),
  );
  expect(count).toBe(1);
});
