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

test.describe('sidebar rail', () => {
  test('collapses to 64 px, keeps the title and first block y, and is remembered after a reload', async ({ page }) => {
    await page.goto('/flows');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const h1 = async () => (await page.getByRole('heading', { level: 1 }).boundingBox())!.y;
    const y = await h1();
    expect(y).toBe(63);
    await nav.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect.poll(async () => (await nav.boundingBox())?.width).toBe(64);
    expect(await h1()).toBe(63);
    const first = async () => (await page.locator('[data-first-block]').first().boundingBox())!.y;
    expect(await first()).toBe(123);
    await page.reload();
    await expect.poll(async () => (await page.getByRole('navigation', { name: 'Main' }).boundingBox())?.width).toBe(64);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Expand sidebar' }).click();
    await expect.poll(async () => (await nav.boundingBox())?.width).toBe(232);
  });

  test('every action of the open sidebar is reachable from the rail by keyboard', async ({ page }) => {
    await page.goto('/flows');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(nav.getByRole('link', { name: 'Flows' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Create flow', 'Account menu']) {
      const b = await nav.getByRole('button', { name }).boundingBox();
      expect([b!.width, b!.height]).toEqual([40, 40]);
    }
    await nav.getByRole('link', { name: 'Reference tables' }).click();
    await expect(page).toHaveURL(/\/reference-tables$/);
    await expect(nav.getByRole('link', { name: 'Admin' })).toBeVisible();
    // Create flow
    await nav.getByRole('button', { name: 'Create flow' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    // The user popover holds the name, the role and the controls of the open footer.
    const user = nav.getByRole('button', { name: 'Account menu' });
    await user.focus();
    await page.keyboard.press('Enter');
    const pop = page.getByRole('dialog', { name: 'Account menu' });
    await expect(pop.getByText('Harold')).toBeVisible();
    await expect(pop.getByText('Admin', { exact: true })).toBeVisible();
    await expect(pop.getByRole('button', { name: /Language/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /Theme/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(user).toBeFocused();
  });

  test('the language and theme work from the popover', async ({ page }) => {
    await page.goto('/flows');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('button', { name: 'Collapse sidebar' }).click();
    await nav.getByRole('button', { name: 'Account menu' }).click();
    const pop = page.getByRole('dialog', { name: 'Account menu' });
    await pop.getByRole('button', { name: /Theme/ }).click();
    await page.getByRole('option', { name: 'Dark' }).click();
    await expect(pop).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Change password and Sign out are in the popover when sign-in is on, and sign out works', async ({ page }) => {
    await page.addInitScript((json) => localStorage.setItem('dfw.auth', json), JSON.stringify([{ email: 'harold@example.com', password: 'correct horse battery' }]));
    await page.goto('/flows');
    await page.getByLabel('Email').fill('harold@example.com');
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('button', { name: 'Collapse sidebar' }).click();
    await nav.getByRole('button', { name: 'Account menu' }).click();
    const pop = page.getByRole('dialog', { name: 'Account menu' });
    await expect(pop.getByRole('button', { name: 'Change password' })).toBeVisible();
    await pop.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  });
});
