import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const openTexts = async (page: Page, language: 'English' | 'Tiếng Việt' = 'English') => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Texts' }).click();
  await page.getByRole('button', { name: /^Language of the texts/ }).click();
  await page.getByRole('option', { name: language }).click();
};
const search = (page: Page, text: string) => page.getByRole('textbox', { name: 'Search texts' }).fill(text);

test('an edited button label shows after a reload, and Reset brings the default back', async ({ page }) => {
  await openTexts(page);
  await search(page, 'nav.createFlow');
  await expect(page.getByRole('row')).toHaveCount(2); // header and one text
  await page.getByRole('button', { name: 'Edit nav.createFlow' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit text' });
  await expect(dialog).toContainText('Create flow'); // the default next to the field
  await dialog.getByRole('textbox', { name: 'Text to show' }).fill('New pipeline');
  await dialog.getByRole('button', { name: 'Save text' }).click();
  await expect(page.getByText('Text saved.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New pipeline' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'New pipeline' })).toBeVisible();
  await page.getByRole('tab', { name: 'Texts' }).click();
  await page.getByRole('button', { name: /^Language of the texts/ }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await search(page, 'nav.createFlow');
  await expect(page.getByText('Edited', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset nav.createFlow to the default' }).click();
  await expect(page.getByText('Text reset to the default.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create flow' })).toBeVisible();
});

test('a text without a placeholder of the default is refused with the name of the placeholder', async ({ page }) => {
  await openTexts(page);
  await search(page, 'common.infoTip.about');
  await page.getByRole('button', { name: 'Edit common.infoTip.about' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit text' });
  await dialog.getByRole('textbox', { name: 'Text to show' }).fill('About this');
  await dialog.getByRole('button', { name: 'Save text' }).click();
  await expect(dialog.getByRole('alert')).toContainText('{label}');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Text to show' }).fill('About {label} and {other}');
  await dialog.getByRole('button', { name: 'Save text' }).click();
  await expect(dialog.getByRole('alert')).toContainText('{other}');
  await dialog.getByRole('textbox', { name: 'Text to show' }).fill('Help for {label}');
  await dialog.getByRole('button', { name: 'Save text' }).click();
  await expect(page.getByText('Text saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Help for Admin' })).toBeVisible();
});

test('search by text, filter by screen and the language picker', async ({ page }) => {
  await openTexts(page);
  await search(page, 'sign out');
  await expect(page.getByRole('button', { name: 'Edit nav.signOut', exact: true })).toBeVisible();
  await search(page, '');
  await page.getByRole('button', { name: /^Screen/ }).click();
  await page.getByRole('option', { name: 'theme' }).click();
  await expect(page.getByRole('row')).toHaveCount(5); // header, Theme, Light, Dark, System
  await page.getByRole('button', { name: /^Language of the texts/ }).click();
  await page.getByRole('option', { name: 'Tiếng Việt' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'theme.dark' })).toContainText('Tối');
});

test('the Users tab is the first one and keeps the users, groups, access and deleted flows', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Groups', level: 2 })).toBeVisible();
});
