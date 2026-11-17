import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

const header = (page: Page) => page.getByRole('banner');
const cards = (page: Page) => page.locator('.react-flow__node');
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const asUser = async (page: Page, userId: string) => {
  const s = { ...seedSnapshot(), currentUserId: userId };
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
};

test('the version dropdown lists every version as the screens write them and opens the one you choose', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  const trigger = header(page).getByRole('button', { name: /^Version: v4, draft from 01 Jan 2027/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const options = page.getByRole('listbox', { name: 'Version' }).getByRole('option');
  await expect(options).toHaveText(['v4, draft from 01 Jan 2027', 'v3, from 01 Jul 2026', 'v2, 01 Apr 2026 to 30 Jun 2026', 'v1, 01 Jan 2026 to 31 Mar 2026']);
  await page.getByRole('option', { name: /^v3,/ }).click();
  await expect(page).toHaveURL(/\/flows\/flow-timesheet\/versions\/3$/);
  await expect(header(page).getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'v3 is published and read-only' })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await expect(header(page).getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add step Filter' })).toBeDisabled();
});

test('a draft: Save draft is off until something changes; saving keeps the change after a reload', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(cards(page)).toHaveCount(12);
  await expect(header(page).getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await expect(header(page).getByText('Unsaved changes')).toHaveCount(0);
  await addStep(page, 'SQL');
  await expect(cards(page)).toHaveCount(13);
  await expect(header(page).getByText('Unsaved changes')).toBeVisible();
  await header(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(toastWith(page, 'v4 saved.')).toBeVisible();
  await expect(header(page).getByText('Unsaved changes')).toHaveCount(0);
  await expect(header(page).getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await page.reload();
  await expect(cards(page)).toHaveCount(13);
});

test('leaving with unsaved changes asks first: keep editing stays, discard leaves; the version dropdown asks too', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(cards(page)).toHaveCount(12);
  await addStep(page, 'SQL');
  await header(page).getByRole('link', { name: 'Flows' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/versions\/4$/);
  await expect(cards(page)).toHaveCount(13);
  await header(page).getByRole('button', { name: /^Version:/ }).click();
  await page.getByRole('option', { name: /^v3,/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await header(page).getByRole('link', { name: 'Flows' }).click();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/flows$/);
});

test('publishing: the dialog says what happens, a published version becomes read-only, and a new version copies it', async ({ page }) => {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Publish test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Output');
  await page.getByRole('complementary', { name: 'Step settings' }).getByRole('button', { name: /^Input from/ }).press('ArrowDown');
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await expect(header(page).getByRole('button', { name: 'Run' })).toBeDisabled(); // nothing is published yet

  await header(page).getByRole('button', { name: 'Publish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish v1?' });
  await expect(dialog).toContainText('Publishing v1 makes it valid from');
  await expect(dialog).toContainText('Your unsaved changes are saved first.');
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v1 published.')).toBeVisible();
  await expect(header(page).getByText('Published', { exact: true })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Run' })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'v1 is published and read-only' })).toBeVisible();

  await page.getByRole('button', { name: 'New version from this' }).click();
  const nv = page.getByRole('dialog', { name: 'New version from v1' });
  await expect(nv.getByRole('button', { name: /^Valid from:/ })).toBeVisible();
  await nv.getByRole('button', { name: 'Create version' }).click();
  await expect(page).toHaveURL(/\/versions\/2$/);
  await expect(cards(page)).toHaveCount(2); // a copy of v1
  await expect(header(page).getByText('Draft', { exact: true })).toBeVisible();

  await header(page).getByRole('button', { name: 'Publish' }).click();
  const second = page.getByRole('dialog', { name: 'Publish v2?' });
  await expect(second).toContainText('Publishing v2 will end v1 on');
  await second.getByRole('button', { name: 'Publish' }).click();
  await expect(toastWith(page, 'v2 published.')).toBeVisible();
  await header(page).getByRole('button', { name: /^Version:/ }).click();
  await expect(page.getByRole('option', { name: /^v1, .* to / })).toBeVisible();
});

test('an unfinished flow is not published: the dialog stays and says what to fix', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await header(page).getByRole('button', { name: 'Publish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish v4?' });
  await expect(dialog).toContainText('Publishing v4 will end v3 on 31 Dec 2026');
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fix it, then publish again');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(header(page).getByText('Draft', { exact: true })).toBeVisible();
});

test('a group member who is not the admin can open and run a shared flow but only copy it to edit', async ({ page }) => {
  await asUser(page, 'user-lan');
  await page.goto('/flows/flow-timesheet/versions/3');
  await expect(page.getByRole('status').filter({ hasText: 'only the admin can change it' })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Run' })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add step Filter' })).toBeDisabled();
  await page.getByRole('button', { name: 'Copy to a personal flow' }).click();
  const dialog = page.getByRole('dialog', { name: 'Copy to a personal flow' });
  await expect(dialog.getByRole('textbox', { name: 'Name of the copy' })).toHaveValue('Monthly timesheet summary (copy)');
  await dialog.getByRole('textbox', { name: 'Name of the copy' }).fill('');
  await dialog.getByRole('button', { name: 'Create copy' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The copy has no name.');
  await dialog.getByRole('textbox', { name: 'Name of the copy' }).fill('My timesheet');
  await dialog.getByRole('button', { name: 'Create copy' }).click();
  await expect(page).toHaveURL(/\/flows\/flow-\d+\/versions\/1$/);
  await expect(header(page).getByRole('heading', { name: 'My timesheet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add step Filter' })).toBeEnabled();
  await expect(header(page).getByRole('button', { name: 'Save draft' })).toBeDisabled();
});

test('Run is offered when a version is published and is off for a flow that has only a draft', async ({ page }) => {
  await page.goto('/flows/flow-insurance/versions/1');
  await expect(header(page).getByRole('button', { name: 'Run' })).toBeDisabled();
  await page.goto('/flows/flow-timesheet/versions/3');
  await expect(header(page).getByRole('link', { name: 'Run' })).toHaveAttribute('href', '/flows/flow-timesheet/run');
});
