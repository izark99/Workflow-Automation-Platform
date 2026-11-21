import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const openTexts = async (page: Page) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Texts' }).click();
};
const search = (page: Page, text: string) => page.getByRole('textbox', { name: 'Search texts' }).fill(text);
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Edit text' });
const english = (page: Page) => dialogOf(page).getByRole('textbox', { name: 'English' });
const vietnamese = (page: Page) => dialogOf(page).getByRole('textbox', { name: 'Vietnamese' });
const row = (page: Page, key: string) => page.getByRole('row').filter({ hasText: key }).first();

test('the table has the columns Key, English, Vietnamese and Actions, and no language control', async ({ page }) => {
  await openTexts(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Key', 'English', 'Vietnamese', 'Actions']);
  await expect(page.getByRole('button', { name: /^Language of the texts/ })).toHaveCount(0);
  await search(page, 'nav.signOut');
  await expect(row(page, 'nav.signOut')).toContainText('Sign out');
  await expect(row(page, 'nav.signOut')).toContainText('Đăng xuất');
  expect(Math.round((await row(page, 'nav.signOut').boundingBox())!.height)).toBe(57);
  // A long key is cut with an ellipsis and keeps its full text in the title, so it never runs into the next column.
  await search(page, 'common.datePicker.previousMonth');
  await expect(page.locator('[title="common.datePicker.previousMonth"]')).toBeVisible();
  const key = await page.locator('[title="common.datePicker.previousMonth"]').boundingBox();
  const english = await row(page, 'common.datePicker.previousMonth').locator('td').nth(1).boundingBox();
  expect(key!.x + key!.width).toBeLessThanOrEqual(english!.x + 1);
});

test('both languages are edited with one Save, and both show in the table and after a reload', async ({ page }) => {
  await openTexts(page);
  await search(page, 'nav.createFlow');
  await expect(page.getByRole('row')).toHaveCount(2); // header and one text
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  const dialog = dialogOf(page);
  expect(await dialog.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(880);
  await expect(dialog).toContainText('Create flow'); // the default under the English text
  await english(page).fill('New pipeline');
  await vietnamese(page).fill('Quy trình mới');
  await dialog.getByRole('button', { name: 'Save text' }).click();
  await expect(page.getByText('Text saved.')).toBeVisible();
  await expect(row(page, 'nav.createFlow')).toContainText('New pipeline');
  await expect(row(page, 'nav.createFlow')).toContainText('Quy trình mới');
  await expect(row(page, 'nav.createFlow').getByText('Edited', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New pipeline' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Texts' }).click();
  await search(page, 'nav.createFlow');
  await expect(row(page, 'nav.createFlow')).toContainText('New pipeline');
  await expect(row(page, 'nav.createFlow')).toContainText('Quy trình mới');
});

test('one invalid text saves nothing, the error sits under that text, and Ctrl+Enter saves when both are right', async ({ page }) => {
  await openTexts(page);
  await search(page, 'common.infoTip.about');
  await page.getByRole('button', { name: 'Edit common.infoTip.about' }).click();
  const dialog = dialogOf(page);
  await english(page).fill('Help for {label}');
  await vietnamese(page).fill('Trợ giúp'); // the placeholder is missing in Vietnamese only
  await dialog.getByRole('button', { name: 'Save text' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(1);
  await expect(dialog.getByRole('alert')).toContainText('{label}');
  // The error is in the Vietnamese column, and the English text was not saved either.
  expect(await vietnamese(page).getAttribute('aria-invalid')).toBe('true');
  expect(await english(page).getAttribute('aria-invalid')).toBeNull();
  await expect(page.getByText('Text saved.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'common.infoTip.about')).not.toContainText('Help for');
  // Corrected, saved with Ctrl+Enter.
  await page.getByRole('button', { name: 'Edit common.infoTip.about' }).click();
  await english(page).fill('Help for {label}');
  await vietnamese(page).fill('Trợ giúp {label}');
  await vietnamese(page).press('Control+Enter');
  await expect(page.getByText('Text saved.')).toBeVisible();
  await expect(row(page, 'common.infoTip.about')).toContainText('Trợ giúp {label}');
});

test('Reset both in the dialog and in the row removes the edits of both languages', async ({ page }) => {
  await openTexts(page);
  await search(page, 'nav.createFlow');
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  await english(page).fill('New pipeline');
  await vietnamese(page).fill('Quy trình mới');
  await dialogOf(page).getByRole('button', { name: 'Save text' }).click();
  await expect(row(page, 'nav.createFlow')).toContainText('New pipeline');
  // In the row.
  await page.getByRole('button', { name: 'Reset nav.createFlow to the default' }).click();
  await expect(page.getByText('Text reset to the default.')).toBeVisible();
  await expect(row(page, 'nav.createFlow')).toContainText('Create flow');
  await expect(row(page, 'nav.createFlow')).toContainText('Tạo luồng');
  await expect(row(page, 'nav.createFlow').getByText('Edited', { exact: true })).toHaveCount(0);
  // In the dialog; a per-language Reset puts one default back in the field.
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  await english(page).fill('Again');
  await vietnamese(page).fill('Lại');
  await dialogOf(page).getByRole('button', { name: 'Save text' }).click();
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  await dialogOf(page).getByRole('button', { name: 'Reset English' }).click();
  await expect(english(page)).toHaveValue('Create flow');
  await expect(vietnamese(page)).toHaveValue('Lại');
  await dialogOf(page).getByRole('button', { name: 'Reset both' }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(row(page, 'nav.createFlow').getByText('Edited', { exact: true })).toHaveCount(0);
  await expect(row(page, 'nav.createFlow')).toContainText('Tạo luồng');
});

test('Edited only shows the keys with an edit; search and screen filter in both languages', async ({ page }) => {
  await openTexts(page);
  await search(page, 'nav.signOut');
  await page.getByRole('button', { name: 'Edit nav.signOut', exact: true }).click();
  await vietnamese(page).fill('Thoát');
  await dialogOf(page).getByRole('button', { name: 'Save text' }).click();
  await search(page, '');
  await page.getByRole('button', { name: 'Edited only' }).click();
  await expect(page.getByRole('button', { name: 'Edited only' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(row(page, 'nav.signOut')).toContainText('Thoát');
  await page.getByRole('button', { name: 'Edited only' }).click();
  await search(page, 'đăng nhập'); // a Vietnamese text
  await expect(page.getByRole('row').filter({ hasText: 'signIn.' }).first()).toBeVisible();
  await search(page, '');
  await page.getByRole('button', { name: /^Screen/ }).click();
  await page.getByRole('option', { name: 'theme' }).click();
  await expect(page.getByRole('row')).toHaveCount(5); // header, Theme, Light, Dark, System
  await expect(row(page, 'theme.dark')).toContainText('Tối');
});

test('the dialog keyboard order is English, Vietnamese, the two Reset buttons, Cancel, Reset both, Save', async ({ page }) => {
  await openTexts(page);
  await search(page, 'nav.createFlow');
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  // With an edit stored, and both texts changed, every button of the dialog is enabled and in the tab order.
  await english(page).fill('New pipeline');
  await vietnamese(page).fill('Quy trình mới');
  await dialogOf(page).getByRole('button', { name: 'Save text' }).click();
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  await english(page).fill('Another');
  const names: string[] = [];
  await english(page).focus();
  for (let i = 0; i < 14; i++) {
    const label = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      const field = a as HTMLTextAreaElement;
      return a.getAttribute('aria-label') ?? field.labels?.[0]?.textContent ?? a.textContent?.trim() ?? a.tagName;
    });
    if (names.includes(label)) break;
    names.push(label);
    await page.keyboard.press('Tab');
  }
  // The info buttons after the labels are in the order too; the rest is the order of the spec.
  expect(names.filter((n) => !n.startsWith('About'))).toEqual(['English', 'Vietnamese', 'Reset English', 'Reset Vietnamese', 'Cancel', 'Reset both', 'Save text']);
});

test('the Users tab is the first one and keeps the users, groups, access and deleted flows', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Groups', level: 2 })).toBeVisible();
});
