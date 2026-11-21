import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T6.11: every state of the parameter control on the components page.
const demo = (page: Page, id: string) => page.locator(`[data-demo="${id}"]`);
const useButton = (page: Page, id: string) => demo(page, id).getByRole('button', { name: 'Use a parameter for Sheet name' });

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('a fixed field has the link button beside its box: same height, haspopup listbox, and it lists only the parameters that fit', async ({ page }) => {
  const button = useButton(page, 'pcFixed');
  await expect(button).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(button).toBeEnabled();
  const [b, input] = [await button.boundingBox(), await demo(page, 'pcFixed').getByRole('textbox').locator('..').boundingBox()];
  expect(Math.round(b!.height)).toBe(Math.round(input!.height));
  expect(Math.round(b!.width)).toBe(Math.round(b!.height));
  await button.click();
  const list = page.locator(`[id="${await button.getAttribute('aria-controls')}"]`);
  // The text parameter fits a text setting; the number parameter does not.
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option')).toContainText('Period');
  await expect(list.getByRole('option')).toContainText('period');
});

test('Escape closes the list and the focus returns to the button; the keyboard opens it', async ({ page }) => {
  const button = useButton(page, 'pcFixed');
  await button.focus();
  await page.keyboard.press('ArrowDown');
  const list = page.locator(`[id="${await button.getAttribute('aria-controls')}"]`);
  await expect(list).toBeVisible();
  await expect(list.getByRole('option').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('with no parameter that fits, the button is off and says why', async ({ page }) => {
  const button = useButton(page, 'pcNoFit');
  await expect(button).toBeDisabled();
  await expect(demo(page, 'pcNoFit').locator('[title]')).toHaveAttribute('title', /no parameter of this type/);
});

test('a read-only version shows the button off, also for a bound field', async ({ page }) => {
  await expect(useButton(page, 'pcReadOnly')).toBeDisabled();
  await expect(demo(page, 'pcBoundReadOnly').getByRole('button', { name: 'Use a fixed value' })).toBeDisabled();
});

test('a bound field is one row: the chip with the parameter, "Use a fixed value", and the value now', async ({ page }) => {
  const d = demo(page, 'pcBound');
  await expect(d.getByRole('textbox')).toHaveCount(0);
  await expect(d.getByText('Parameter:')).toBeVisible();
  await expect(d.getByText('Period', { exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Use a fixed value' })).toBeEnabled();
  await expect(d.getByText('Now: July')).toBeVisible();
  expect(Math.round((await d.getByRole('button', { name: 'Use a fixed value' }).boundingBox())!.height)).toBe(32);
});

test('an error is shown under the field, and a deleted parameter says so', async ({ page }) => {
  const error = demo(page, 'pcError');
  await expect(error.getByRole('alert')).toContainText('The sheet "July" is not in the file.');
  await expect(error.getByText(/^Now:/)).toHaveCount(0);
  const gone = demo(page, 'pcGone');
  await expect(gone.getByText('Parameter old_period no longer exists')).toBeVisible();
  await expect(gone.getByRole('alert')).toContainText('Choose another parameter, or use a fixed value.');
});
